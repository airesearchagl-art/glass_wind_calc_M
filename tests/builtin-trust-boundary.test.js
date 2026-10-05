'use strict';

/**
 * Phase 2L-B2 / S2-A.5: built-in trust boundary の収束。
 *
 * 「registry にあること」は「repository の built-in であること」ではない。
 * registerPreset() は公開されており、形の要件を満たす config は後からでも登録できる。
 * built-in の trust を根にする consumer（ProjectInput の registered_preset、Evidence Closure の
 * topology と現在の主張、ProjectContext の legacy adapter）は、registry が bootstrap で捕まえた
 * instance だけを返す PresetRegistry.getBuiltInPreset() を通らなければならない。
 *
 * ── 隔離 ────────────────────────────────────────────────
 *
 * 既定 registry への登録は process 内に残る。そのため各 scenario を**別の child process**で
 * 実行し、結果だけを JSON で受け取る。この file の test 同士・他の test file と状態を共有しない
 * （順序依存なし、並列実行でも壊れない）。
 *
 * fixture はすべて合成値。built-in の projectId は test に書かず、registry から実行時に読む。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function childEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  delete env.NODE_V8_COVERAGE;
  return env;
}

/** child process で script を実行し、最後の行の JSON を返す。 */
function runChild(script) {
  const r = spawnSync(process.execPath, ['-e', CHILD_LIB + '\n' + script], {
    cwd: ROOT, env: childEnv(), encoding: 'utf8'
  });
  assert.equal(r.status, 0, 'child failed: ' + r.stderr);
  const lines = r.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

// child 側で共有する helper（合成 fixture のみ）
const CHILD_LIB = String.raw`
'use strict';
const P = 'N/m²';
const out = {};
function attempt(name, fn) {
  try { out[name] = { ok: true, value: fn() }; }
  catch (e) { out[name] = { ok: false, error: e.message }; }
}
function strongEvidence() {
  return { level: 'primary', checkedAt: '2026-03-04',
    publicDescription: '合成テスト用の偽 preset（実案件ではない）', privateReferenceAvailable: true };
}
/** 既存 contract を可能な限り満たす合成の偽 preset。verified を名乗る Evidence を持つ。 */
function makeFake(projectId, values) {
  values = values || {};
  const v = (value, unit) => ({ value, unit, verificationStatus: 'verified', evidence: strongEvidence(), sourceReference: null });
  const floors = values.floors || { 1: 1111, 2: 1222, R: 1333 };
  const zones = values.zones || { general: 1444, corner: 1555 };
  const cfg = {
    projectId,
    hasFixedPreset: true,
    identity: { publicLabel: 'Synthetic Fake Preset', verificationStatus: 'verified', disclosureStatus: 'redacted', evidence: strongEvidence() },
    dimensions: { mode: 'sample_default', defaultW: v(values.w || 901, 'mm'), defaultH: v(values.h || 1901, 'mm'), status: 'verified' },
    wind: { positivePressureByFloor: {}, negativePressureByZone: {}, V0: v(31, 'm/s'), roughnessCategory: v('II', null), status: 'verified' },
    verifiedCases: [],
    getPublicLabel() { return this.identity.publicLabel; },
    getPositivePressure(f) { return this.wind.positivePressureByFloor[f].value; },
    getNegativePressure(z) { return this.wind.negativePressureByZone[z].value; },
    getDefaultDimensionsMM() { return { W: this.dimensions.defaultW.value, H: this.dimensions.defaultH.value }; }
  };
  Object.keys(floors).forEach((f) => { cfg.wind.positivePressureByFloor[f] = v(floors[f], P); });
  Object.keys(zones).forEach((z) => { cfg.wind.negativePressureByZone[z] = v(zones[z], P); });
  return cfg;
}
/** preset の現在値に一致する、全 slot 分の合成 Observation（Evidence は最強）。 */
function observationsFor(cfg) {
  const mk = (factKey, scope, observedValue, unit) => ({ schemaVersion: 1,
    observationType: 'evidence_closure_observation', factKey, scope, observedValue, unit,
    evidence: strongEvidence(), sourceReference: null });
  const obs = [mk('pane_width_mm', null, cfg.dimensions.defaultW.value, 'mm'),
    mk('pane_height_mm', null, cfg.dimensions.defaultH.value, 'mm')];
  Object.keys(cfg.wind.positivePressureByFloor).forEach((f, i) => {
    obs.push(mk('positive_pressure', { floor: f }, cfg.wind.positivePressureByFloor[f].value, P));
    obs.push(mk('evaluation_height', { floor: f }, 3.5 + i * 3.25, 'm'));
  });
  Object.keys(cfg.wind.negativePressureByZone).forEach((z) => {
    obs.push(mk('negative_pressure', { zone: z }, cfg.wind.negativePressureByZone[z].value, P));
  });
  return obs;
}
function presetInput() {
  const keyOf = (o) => Object.keys(o)[0];
  return (cfg) => ({ floorKey: keyOf(cfg.wind.positivePressureByFloor), zoneKey: keyOf(cfg.wind.negativePressureByZone),
    widthMm: 900, heightMm: 1800, glassType: 'fl_single' });
}
function claimedPackage(sourceId, status, pressures) {
  pressures = pressures || { pos: 1111, neg: 1444 };
  return { schemaVersion: 2, sourceKind: 'registered_preset', sourceId, widthMm: 900, heightMm: 1800,
    positivePressure: pressures.pos, negativePressure: pressures.neg, designPressure: 0, glassType: 'fl_single', extraFactor: 1,
    provenance: { publicLabel: 'Synthetic Fake Preset', verificationStatus: status, note: '' }, windInput: null };
}
function closureSummary(r) {
  return { status: r.status, ready: r.readySlotCount, required: r.requiredSlotCount,
    readyCategories: r.readyCategoryCount, categories: r.categoryCount,
    readyScopes: r.readyCaseScopeCount, scopes: r.caseScopeCount, candidate: r.promotionCandidate !== null };
}
`;

const NOT_BUILT_IN = /not a repository built-in preset/;
const FROM_PRESET_REJECT = /a built-in registered preset config is required/;
const SOURCE_ID_REJECT = /registered in the built-in preset registry/;
const CLOSURE_REJECT = /only repository built-in presets can be closure subjects/;

/** 実行時の正規 registry に、一意の id の偽 preset を登録する scenario。 */
function fakeScenario() {
  return runChild(String.raw`
const R = require('./project-config/registry.js');
const PI = require('./project-config/project-input.js');
const C = require('./project-config/evidence-closure.js');
const PC = require('./project-config/project-context.js');
const FAKE_ID = 'synthetic-fake-' + process.pid;
const fake = makeFake(FAKE_ID);
const input = presetInput();

attempt('register', () => R.registerPreset(fake));
attempt('getPresetIsFake', () => R.getPreset(FAKE_ID) === fake);
attempt('hasPreset', () => R.hasPreset(FAKE_ID));
attempt('getBuiltIn', () => R.getBuiltInPreset(FAKE_ID) === fake);
attempt('fromPreset', () => PI.fromPreset(fake, input(fake)).sourceKind);
attempt('fromPresetViaGetPreset', () => PI.fromPreset(R.getPreset(FAKE_ID), input(fake)).sourceKind);
attempt('createVerified', () => PI.createProjectInput(claimedPackage(FAKE_ID, 'verified')).sourceKind);
attempt('validateVerified', () => PI.validateProjectInput(claimedPackage(FAKE_ID, 'verified')).sourceKind);
attempt('scope', () => C.createProjectScopeContract(FAKE_ID));
attempt('slots', () => C.listRequiredObservationSlots(FAKE_ID).length);
attempt('normalize', () => C.normalizeObservation(observationsFor(fake)[0], FAKE_ID).factKey);
attempt('evaluateEmpty', () => closureSummary(C.evaluateClosure(FAKE_ID, [])));
attempt('evaluateMatching', () => closureSummary(C.evaluateClosure(FAKE_ID, observationsFor(fake))));
attempt('legacyContext', () => PC.fromLegacyPreset(FAKE_ID).trust);

// 本物の built-in は全経路で通る（id は registry から読む）
const BUILT_IN_ID = R.BUILT_IN_PRESET_IDS[0];
const builtIn = R.getBuiltInPreset(BUILT_IN_ID);
attempt('builtInFromPreset', () => {
  const p = PI.fromPreset(builtIn, input(builtIn));
  return { sourceKind: p.sourceKind, status: p.provenance.verificationStatus, expectedStatus: builtIn.wind.status,
    pos: p.positivePressure, expectedPos: builtIn.getPositivePressure(input(builtIn).floorKey) };
});
// RF-17-01: registered_preset の圧力は built-in が持つ値でなければならないので、陽性対照は built-in の値を使う
const firstOf = (map) => map[Object.keys(map)[0]].value;
attempt('builtInCreate', () => PI.createProjectInput(claimedPackage(BUILT_IN_ID, builtIn.wind.status,
  { pos: firstOf(builtIn.wind.positivePressureByFloor), neg: firstOf(builtIn.wind.negativePressureByZone) })).sourceKind);
attempt('builtInScope', () => {
  const c = C.createProjectScopeContract(BUILT_IN_ID);
  return { floors: Array.from(c.floors), expected: Object.keys(builtIn.wind.positivePressureByFloor).sort() };
});
attempt('builtInEvaluate', () => closureSummary(C.evaluateClosure(BUILT_IN_ID, [])));
attempt('builtInContext', () => PC.fromLegacyPreset(BUILT_IN_ID).trust);
console.log(JSON.stringify(out));
`);
}

test('P2L-S2A5-01: 陽性対照——本物の built-in は全 trusted 経路で従来どおり通る', () => {
  const r = fakeScenario();
  assert.equal(r.builtInFromPreset.ok, true, r.builtInFromPreset.error);
  assert.equal(r.builtInFromPreset.value.sourceKind, 'registered_preset');
  assert.equal(r.builtInFromPreset.value.status, r.builtInFromPreset.value.expectedStatus);
  assert.equal(r.builtInFromPreset.value.pos, r.builtInFromPreset.value.expectedPos);
  assert.deepEqual(r.builtInCreate, { ok: true, value: 'registered_preset' });
  assert.equal(r.builtInScope.ok, true, r.builtInScope.error);
  assert.deepEqual(r.builtInScope.value.floors, r.builtInScope.value.expected);
  assert.equal(r.builtInEvaluate.ok, true, r.builtInEvaluate.error);
  assert.deepEqual(r.builtInEvaluate.value, { status: 'BLOCKED', ready: 0, required: 12,
    readyCategories: 0, categories: 4, readyScopes: 0, scopes: 8, candidate: false });
  assert.deepEqual(r.builtInContext, { ok: true, value: 'built_in_current' });
});

test('P2L-S2A5-02: 実行時に registerPreset() した偽 preset は、どの trusted 経路も通らない', () => {
  const r = fakeScenario();
  // 既存の registry 契約はそのまま（これが旧 boundary で信用されていた条件）
  assert.deepEqual(r.register.ok, true, r.register.error);
  assert.deepEqual(r.getPresetIsFake, { ok: true, value: true });
  assert.deepEqual(r.hasPreset, { ok: true, value: true });
  // built-in 境界
  assert.equal(r.getBuiltIn.ok, false); assert.match(r.getBuiltIn.error, NOT_BUILT_IN);
  // ProjectInput: registered_preset を名乗れない（fake の verified 主張も取り込まない）
  [['fromPreset', FROM_PRESET_REJECT], ['fromPresetViaGetPreset', FROM_PRESET_REJECT],
    ['createVerified', SOURCE_ID_REJECT], ['validateVerified', SOURCE_ID_REJECT]].forEach(([k, re]) => {
    assert.equal(r[k].ok, false, k + ' が通った: ' + JSON.stringify(r[k].value));
    assert.match(r[k].error, re, k);
  });
  // Evidence Closure: topology・現在の主張・READY・candidate のどれにも使わない
  ['scope', 'slots', 'normalize', 'evaluateEmpty', 'evaluateMatching'].forEach((k) => {
    assert.equal(r[k].ok, false, k + ' が通った: ' + JSON.stringify(r[k].value));
    assert.match(r[k].error, CLOSURE_REJECT, k);
  });
  // ProjectContext: built_in_current にならない
  assert.equal(r.legacyContext.ok, false); assert.match(r.legacyContext.error, NOT_BUILT_IN);
});

test('P2L-S2A5-03: built-in の id でも、bootstrap で捕まえた instance でなければ trust しない（id 一覧では決めない）', () => {
  // registry の bootstrap が built-in module を解決できなかった状況を作り、同じ id で偽 preset を登録する。
  // BUILT_IN_PRESET_IDS にはその id が載ったままなので、id 一覧で trust を決める実装はここで落ちる。
  const r = runChild(String.raw`
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent) {
  if (parent && /[\\/]project-config[\\/]registry\.js$/.test(parent.filename)) {
    throw new Error('blocked for this test: built-in module unavailable at registry bootstrap');
  }
  return origLoad.apply(this, arguments);
};
const R = require('./project-config/registry.js');
Module._load = origLoad;
const PI = require('./project-config/project-input.js');
const C = require('./project-config/evidence-closure.js');
const PC = require('./project-config/project-context.js');
const ID = R.BUILT_IN_PRESET_IDS[0];
const input = presetInput();
attempt('capturedAtBootstrap', () => R.hasPreset(ID));
const fake = makeFake(ID);
attempt('register', () => R.registerPreset(fake));
attempt('idListed', () => R.BUILT_IN_PRESET_IDS.indexOf(ID) !== -1);
attempt('getPresetIsFake', () => R.getPreset(ID) === fake);
attempt('getBuiltIn', () => R.getBuiltInPreset(ID) === fake);
attempt('fromPreset', () => PI.fromPreset(fake, input(fake)).sourceKind);
attempt('createVerified', () => PI.createProjectInput(claimedPackage(ID, 'verified')).sourceKind);
attempt('scope', () => C.createProjectScopeContract(ID));
attempt('evaluateMatching', () => closureSummary(C.evaluateClosure(ID, observationsFor(fake))));
attempt('legacyContext', () => PC.fromLegacyPreset(ID).trust);
console.log(JSON.stringify(out));
`);
  assert.deepEqual(r.capturedAtBootstrap, { ok: true, value: false }, 'built-in を塞げていない（前提が崩れている）');
  assert.equal(r.register.ok, true, r.register.error);
  assert.deepEqual(r.idListed, { ok: true, value: true });
  assert.deepEqual(r.getPresetIsFake, { ok: true, value: true });
  assert.equal(r.getBuiltIn.ok, false); assert.match(r.getBuiltIn.error, NOT_BUILT_IN);
  assert.equal(r.fromPreset.ok, false, JSON.stringify(r.fromPreset.value)); assert.match(r.fromPreset.error, FROM_PRESET_REJECT);
  assert.equal(r.createVerified.ok, false, JSON.stringify(r.createVerified.value)); assert.match(r.createVerified.error, SOURCE_ID_REJECT);
  assert.equal(r.scope.ok, false); assert.match(r.scope.error, CLOSURE_REJECT);
  assert.equal(r.evaluateMatching.ok, false, JSON.stringify(r.evaluateMatching.value)); assert.match(r.evaluateMatching.error, CLOSURE_REJECT);
  assert.equal(r.legacyContext.ok, false); assert.match(r.legacyContext.error, NOT_BUILT_IN);
});

test('P2L-S2A5-04: topology と現在の主張は built-in instance から引く（getPreset() が別物を返しても使わない）', () => {
  // 合成 registry: 同じ id に対し、getBuiltInPreset() は built-in 役の preset を、getPreset() は
  // 値も topology も違う影の preset を返す。正しい実装は影を一切使わない。
  const r = runChild(String.raw`
const ID = 'synthetic-divergence';
const builtIn = makeFake(ID, { floors: { 1: 1111, 2: 1222 }, zones: { general: 1444, corner: 1555 }, w: 901, h: 1901 });
const shadow = makeFake(ID, { floors: { 1: 2111, 2: 2222, 3: 2333 }, zones: { general: 2444, corner: 2555 }, w: 902, h: 1902 });
builtIn.wind.status = 'partially_verified';
globalThis.PresetRegistry = Object.freeze({
  getBuiltInPreset(id) { if (id !== ID) throw new Error('getBuiltInPreset(): not a repository built-in preset: ' + id); return builtIn; },
  getPreset(id) { if (id !== ID) throw new Error('getPreset(): unknown projectId: ' + id); return shadow; },
  hasPreset(id) { return id === ID; },
  listPresets() { return [{ projectId: ID, publicLabel: 'Synthetic' }]; },
  BUILT_IN_PRESET_IDS: Object.freeze([ID])
});
const C = require('./project-config/evidence-closure.js');
const PI = require('./project-config/project-input.js');
const input = presetInput();
attempt('scope', () => Array.from(C.createProjectScopeContract(ID).floors));
attempt('builtInMatch', () => closureSummary(C.evaluateClosure(ID, observationsFor(builtIn))));
attempt('shadowMatch', () => {
  const s = observationsFor(shadow).filter((o) => !(o.scope && o.scope.floor === '3'));
  const r = C.evaluateClosure(ID, s);
  const pos = r.factResults.filter((f) => f.factKey === 'positive_pressure').map((f) => f.reconciliationStatus);
  return Object.assign(closureSummary(r), { positiveReconciliation: pos });
});
attempt('fromPresetBuiltIn', () => { const p = PI.fromPreset(builtIn, input(builtIn)); return [p.sourceKind, p.positivePressure, p.provenance.verificationStatus]; });
attempt('fromPresetShadow', () => PI.fromPreset(shadow, input(shadow)).sourceKind);
console.log(JSON.stringify(out));
`);
  // topology は built-in から（影の floor 3 は存在しない）
  assert.deepEqual(r.scope, { ok: true, value: ['1', '2'] });
  // 陽性対照: built-in の現在値に一致する Observation なら READY_CANDIDATE（gate は生きている）
  assert.equal(r.builtInMatch.ok, true, r.builtInMatch.error);
  assert.equal(r.builtInMatch.value.status, 'READY_CANDIDATE');
  assert.equal(r.builtInMatch.value.required, 2 + 2 + 2 + 2);
  assert.equal(r.builtInMatch.value.candidate, true);
  // 影の値に一致させても MATCH にならず、READY も candidate も作られない
  assert.equal(r.shadowMatch.ok, true, r.shadowMatch.error);
  assert.notEqual(r.shadowMatch.value.status, 'READY_CANDIDATE');
  assert.equal(r.shadowMatch.value.candidate, false);
  assert.equal(r.shadowMatch.value.positiveReconciliation.includes('MATCH'), false,
    JSON.stringify(r.shadowMatch.value.positiveReconciliation));
  // ProjectInput も built-in instance だけを registered_preset にする
  assert.deepEqual(r.fromPresetBuiltIn, { ok: true, value: ['registered_preset', 1111, 'partially_verified'] });
  assert.equal(r.fromPresetShadow.ok, false); assert.match(r.fromPresetShadow.error, FROM_PRESET_REJECT);
});

test('P2L-S2A5-05: trust-bearing module は getPreset() / hasPreset() / id 一覧で trust を決めず、案件 id を持たない', () => {
  const files = ['project-config/project-input.js', 'project-config/evidence-closure.js', 'project-config/project-context.js'];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.equal(/\.getPreset\(|\.hasPreset\(/.test(code), false, f + ' が getPreset()/hasPreset() を呼んでいる');
    assert.equal(/BUILT_IN_PRESET_IDS/.test(code), false, f + ' が id 一覧を使っている');
    assert.match(code, /getBuiltInPreset/, f + ' が built-in 境界を使っていない');
    const BuiltInIds = require('../project-config/registry.js').BUILT_IN_PRESET_IDS;
    BuiltInIds.forEach((id) => {
      assert.equal(new RegExp("['\"]" + id + "['\"]").test(code), false, f + ' に案件 id ' + id + ' が書かれている');
    });
  });
});

// ============================================================
// RF-17-01: registered_preset の payload は、本物の built-in の id ではなく built-in そのものに結びつく
// ============================================================
//
// 以下は既定 registry を変更しない（実在する built-in を読むだけ）ので同じ process で実行する。
// built-in の id と値は registry から実行時に読み、test に書き写さない。

const Registry = require('../project-config/registry.js');
const ProjectInput = require('../project-config/project-input.js');
const Workspace = require('../workspace.js');

const BUILT_IN_ID = Registry.BUILT_IN_PRESET_IDS[0];
const BUILT_IN = Registry.getBuiltInPreset(BUILT_IN_ID);
const valuesOf = (map) => Object.keys(map).map((k) => map[k].value);
const POSITIVES = valuesOf(BUILT_IN.wind.positivePressureByFloor);
const NEGATIVES = valuesOf(BUILT_IN.wind.negativePressureByZone);
const FLOORS = Object.keys(BUILT_IN.wind.positivePressureByFloor);
const ZONES = Object.keys(BUILT_IN.wind.negativePressureByZone);
const EXPECTED_STATUS = ['verified', 'partially_verified', 'unverified'].indexOf(BUILT_IN.wind.status) === -1
  ? 'unverified' : BUILT_IN.wind.status;
/** preset のどの map にも無い値（合成）。 */
const notIn = (values) => { let v = Math.max(...POSITIVES, ...NEGATIVES) + 7; while (values.includes(v)) v += 1; return v; };

function rawRegistered(overrides, provenance) {
  return Object.assign({
    schemaVersion: 2, sourceKind: 'registered_preset', sourceId: BUILT_IN_ID,
    widthMm: 1013, heightMm: 2111, positivePressure: POSITIVES[0], negativePressure: NEGATIVES[0],
    designPressure: 0, glassType: 'fl_single', extraFactor: 1,
    provenance: Object.assign({ publicLabel: BUILT_IN.getPublicLabel(), verificationStatus: EXPECTED_STATUS,
      note: '' }, provenance || {}),
    windInput: null
  }, overrides || {});
}
const PRESSURE_REJECT = (label) => new RegExp('registered_preset ' + label + ' is not a value of the built-in preset');
const BOTH = [['createProjectInput', (p) => ProjectInput.createProjectInput(p)],
  ['validateProjectInput', (p) => ProjectInput.validateProjectInput(p)]];

test('P2L-S2A5-06: (A)(B) 本物の built-in id でも、preset に無い圧力は registered_preset にならない', () => {
  // 陽性対照: preset の値なら通る
  BOTH.forEach(([name, fn]) => assert.equal(fn(rawRegistered()).sourceKind, 'registered_preset', name));
  const cases = [
    ['arbitrary both + verified', { positivePressure: notIn(POSITIVES), negativePressure: notIn(NEGATIVES) }, 'positivePressure'],
    ['arbitrary positive', { positivePressure: notIn(POSITIVES) }, 'positivePressure'],
    ['arbitrary negative', { negativePressure: notIn(NEGATIVES) }, 'negativePressure'],
    // map を取り違えても通らない（正圧は正圧 map、負圧は負圧 map の値だけ）
    ['positive taken from the negative map', { positivePressure: NEGATIVES.find((v) => !POSITIVES.includes(v)) }, 'positivePressure'],
    ['negative taken from the positive map', { negativePressure: POSITIVES.find((v) => !NEGATIVES.includes(v)) }, 'negativePressure'],
    ['negative with a flipped sign', { negativePressure: -NEGATIVES[0] }, 'negativePressure']
  ];
  cases.forEach(([what, overrides, label]) => {
    BOTH.forEach(([name, fn]) => {
      assert.throws(() => fn(rawRegistered(overrides, { verificationStatus: 'verified' })), PRESSURE_REJECT(label), name + ': ' + what);
    });
  });
});

test('P2L-S2A5-07: (C) 呼び出し側の verificationStatus は採らない（built-in の状況へ正規化、強い主張は残らない）', () => {
  ['verified', 'partially_verified', 'unverified'].forEach((claimed) => {
    BOTH.forEach(([name, fn]) => {
      const pkg = fn(rawRegistered({}, { verificationStatus: claimed }));
      assert.equal(pkg.provenance.verificationStatus, EXPECTED_STATUS, name + ' claimed ' + claimed);
    });
  });
  if (EXPECTED_STATUS !== 'verified') {
    BOTH.forEach(([name, fn]) => {
      assert.notEqual(fn(rawRegistered({}, { verificationStatus: 'verified' })).provenance.verificationStatus, 'verified', name);
    });
  }
  // 形式の検証は残る（未知の値は拒否）
  assert.throws(() => ProjectInput.createProjectInput(rawRegistered({}, { verificationStatus: 'approved' })),
    /unsupported provenance\.verificationStatus/);
});

test('P2L-S2A5-08: (D) 呼び出し側の publicLabel / note は trusted provenance にならない', () => {
  const genuine = ProjectInput.fromPreset(BUILT_IN, { floorKey: FLOORS[0], zoneKey: ZONES[0],
    widthMm: 1013, heightMm: 2111, glassType: 'fl_single' });
  BOTH.forEach(([name, fn]) => {
    const pkg = fn(rawRegistered({}, { publicLabel: 'SPOOFED PRESET LABEL', note: 'checked and verified by reviewer' }));
    assert.equal(pkg.provenance.publicLabel, BUILT_IN.getPublicLabel(), name);
    assert.equal(pkg.provenance.note, genuine.provenance.note, name);
    assert.equal(pkg.sourceId, BUILT_IN.projectId, name);
  });
  // 公開文字列として不正な label は形式検証で拒否される
  assert.throws(() => ProjectInput.createProjectInput(rawRegistered({}, { publicLabel: 'see https://example.invalid/x' })),
    /publicLabel/);
});

test('P2L-S2A5-09: (E)(F) fromPreset の出力は全 floor × zone で preset 由来のまま、再検証・Workspace でも変わらない', () => {
  const ws = Workspace.createWorkspace();
  FLOORS.forEach((floorKey) => ZONES.forEach((zoneKey) => {
    const pkg = ProjectInput.fromPreset(BUILT_IN, { floorKey, zoneKey, widthMm: 1013, heightMm: 2111,
      glassType: 'lowe_fl', extraFactor: 0.9 });
    assert.equal(pkg.sourceKind, 'registered_preset');
    assert.equal(pkg.sourceId, BUILT_IN.projectId);
    assert.equal(pkg.positivePressure, BUILT_IN.getPositivePressure(floorKey));
    assert.equal(pkg.negativePressure, BUILT_IN.getNegativePressure(zoneKey));
    assert.deepEqual(pkg.provenance, { publicLabel: BUILT_IN.getPublicLabel(), verificationStatus: EXPECTED_STATUS,
      note: pkg.provenance.note });
    // (F) 再検証は恒等（JSON round-trip を含む）
    assert.deepEqual(ProjectInput.validateProjectInput(JSON.parse(JSON.stringify(pkg))), pkg, floorKey + '/' + zoneKey);
    const caseId = ws.addCase(pkg);
    assert.deepEqual(ws.getCase(caseId).inputPackage, pkg, 'workspace ' + floorKey + '/' + zoneKey);
  }));
  assert.equal(ws.listCases ? ws.listCases().length : FLOORS.length * ZONES.length, FLOORS.length * ZONES.length);
});
