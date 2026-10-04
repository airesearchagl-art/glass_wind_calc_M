'use strict';

/**
 * Phase 2L-B2 / S2-A: Generic ProjectContext contract + adapters。
 *
 * legacy adapter の期待値は、repository の built-in preset と既存 module から**実行時に**
 * 読み出して突き合わせる（実値をこの test に書き写さない）。pack 側の fixture はすべて合成値で、
 * 実案件の値と 1 つも一致しないことを P2L-S2A-30 が確かめる。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CTX_SRC_REL = 'project-config/project-context.js';
const CTX_SRC = fs.readFileSync(path.join(ROOT, CTX_SRC_REL), 'utf8');

const PC = require('../project-config/project-context.js');
const Pack = require('../project-config/project-pack.js');
const Evidence = require('../project-config/evidence.js');
const Ledger = require('../project-config/evidence-ledger.js');
const Registry = require('../project-config/registry.js');
const Closure = require('../project-config/evidence-closure.js');
const ProjectInput = require('../project-config/project-input.js');
const Wind = require('../wind-pressure.js');
const Miyoshi = require('../project-config/miyoshi.js');

const LEGACY_ID = Miyoshi.projectId;
const P = 'N/m²';
const q = (value, unit) => ({ value, unit });
const clone = (o) => JSON.parse(JSON.stringify(o));
const MODES = ['notification1458', 'project_pressure_map', 'case_direct'];

function walk(node, visit, at) {
  at = at || '$';
  visit(node, at);
  if (node && typeof node === 'object') Object.keys(node).forEach((k) => walk(node[k], visit, at + '.' + k));
}
function objectsOf(root) {
  const out = [];
  walk(root, (n, at) => { if (n && typeof n === 'object') out.push([n, at]); });
  return out;
}

// ── 合成 Project Pack（実案件ではない） ─────────────────────────
const FLOORS = ['B1', '1', '2', '3', '4', '5', 'R'];
const HEIGHTS = [1.5, 4.4, 7.7, 11.0, 14.3, 17.6, 20.9];
function syntheticPack(mode, strongestClaims) {
  const records = [
    { sourceScopeId: 'S01', subject: { kind: 'pane_width', paneId: 'P011' }, quantity: q(1013, 'mm') },
    { sourceScopeId: 'S01', subject: { kind: 'pane_height', paneId: 'P011' }, quantity: q(2111, 'mm') }
  ];
  const pack = {
    schemaVersion: 1,
    packType: 'glass_wind_project_pack',
    projectMetadata: { publicLabel: 'Synthetic Context Sample B' },
    pressureModel: { mode },
    windConditions: {},
    panes: [
      { paneId: 'P011', widthMm: q(1013, 'mm'), heightMm: q(2111, 'mm') },
      { paneId: 'P012', widthMm: q(777, 'mm'), heightMm: q(1888, 'mm') }
    ],
    glazingCases: [],
    evidence: {
      sourceScopes: [
        { sourceScopeId: 'S01', sourceClaim: { claimedLevel: 'primary', claimedCheckedAt: '2026-02-03',
          publicDescription: '合成テスト用の出典（実案件ではない）', claimedPrivateReferenceAvailable: true } },
        { sourceScopeId: 'S02', sourceClaim: { claimedLevel: 'indirect', claimedCheckedAt: null,
          publicDescription: '合成テスト用の参考資料（実案件ではない）', claimedPrivateReferenceAvailable: false } }
      ],
      records
    }
  };
  if (mode === 'notification1458') {
    pack.windConditions = {
      basis: 'notification_baseline', V0: q(36, 'm/s'), roughnessCategory: 'II',
      buildingHeightM: q(22.4, 'm'), eavesHeightM: q(21.0, 'm'), buildingType: 'closed',
      evaluationHeights: FLOORS.map((floor, i) => ({ floor, height: q(HEIGHTS[i], 'm') }))
    };
    pack.glazingCases = [
      { caseId: 'G021', paneId: 'P011', floor: '1', zone: 'general', glassType: 'fl_single', extraFactor: 1.0 },
      { caseId: 'G022', paneId: 'P012', floor: 'R', zone: 'corner', glassType: 'lowe_fl', extraFactor: 0.95 }
    ];
    records.push({ sourceScopeId: 'S02', subject: { kind: 'wind_v0' }, quantity: q(36, 'm/s') });
  } else if (mode === 'project_pressure_map') {
    pack.windConditions = {
      positivePressures: FLOORS.map((floor, i) => ({ floor, pressure: q(1003 + i * 17, P) })),
      negativePressures: [{ zone: 'general', magnitude: q(1411, P) }, { zone: 'corner', magnitude: q(1733, P) }]
    };
    pack.glazingCases = [
      { caseId: 'G021', paneId: 'P011', floor: 'B1', zone: 'general', glassType: 'fl_single', extraFactor: 1.0 },
      { caseId: 'G022', paneId: 'P012', floor: '5', zone: 'corner', glassType: 'tp_single', extraFactor: 1.0 }
    ];
    records.push({ sourceScopeId: 'S01', subject: { kind: 'negative_pressure_magnitude', zone: 'corner' }, quantity: q(1733, P) });
  } else {
    pack.glazingCases = [
      { caseId: 'G021', paneId: 'P011', glassType: 'fl_single', extraFactor: 1.0, designPressure: q(1321, P) },
      { caseId: 'G022', paneId: 'P012', floor: '4', glassType: 'fl_fl', extraFactor: 1.0, designPressure: q(1543, P) }
    ];
    records.push({ sourceScopeId: 'S01', subject: { kind: 'case_design_pressure', caseId: 'G021' }, quantity: q(1321, P) });
  }
  if (strongestClaims) {
    pack.evidence.sourceScopes.forEach((s) => {
      s.sourceClaim.claimedLevel = 'primary';
      s.sourceClaim.claimedCheckedAt = '2026-02-03';
      s.sourceClaim.claimedPrivateReferenceAvailable = true;
    });
  }
  return pack;
}
const packContext = (mode, strong) => PC.fromProjectPack(Pack.validateProjectPack(syntheticPack(mode, strong)));
const naiveCanonical = (c) => ({ level: c.claimedLevel, checkedAt: c.claimedCheckedAt,
  publicDescription: c.publicDescription, privateReferenceAvailable: c.claimedPrivateReferenceAvailable });

/** 実行時点の runtime 状態（probe が出すものと、runtime が使う関数の結果）。 */
function runtimeSnapshot() {
  const preset = Registry.getPreset(LEGACY_ID);
  const fromPreset = [];
  Object.keys(preset.wind.positivePressureByFloor).forEach((floorKey) => {
    Object.keys(preset.wind.negativePressureByZone).forEach((zoneKey) => {
      fromPreset.push(ProjectInput.fromPreset(preset, { floorKey, zoneKey, widthMm: 900, heightMm: 1800, glassType: 'fl_single' }));
    });
  });
  return JSON.stringify({
    presets: Registry.listPresets(),
    closure: Closure.evaluateClosure(LEGACY_ID, []),
    scope: Closure.createProjectScopeContract(LEGACY_ID),
    fromPreset,
    preset: JSON.stringify(preset, (k, v) => (typeof v === 'function' ? 'fn:' + k : v))
  });
}

// ============================================================
// ProjectContext contract
// ============================================================

test('P2L-S2A-01: 不正な sourceKind / trust の取り違えを拒否（trust は sourceKind からだけ決まる）', () => {
  const legacy = clone(PC.fromLegacyPreset(LEGACY_ID));
  const pack = clone(packContext('case_direct'));
  ['synthetic_sample', 'project_pack', 'registered_preset', '', null].forEach((kind) => {
    const c = clone(legacy); c.sourceKind = kind;
    assert.throws(() => PC.assertProjectContextShape(c), /sourceKind must be one of/, String(kind));
  });
  const a = clone(pack); a.trust = 'built_in_current';
  assert.throws(() => PC.assertProjectContextShape(a), /trust is derived from sourceKind only/);
  const b = clone(legacy); b.trust = 'pack_unreviewed';
  assert.throws(() => PC.assertProjectContextShape(b), /trust is derived from sourceKind only/);
  const c = clone(pack); c.trust = 'pack_reviewed';
  assert.throws(() => PC.assertProjectContextShape(c), /trust/);
  // pack の形のまま sourceKind だけ legacy を名乗る: legacy に無い capability で落ちる
  const d = clone(pack); d.sourceKind = 'legacy_builtin'; d.trust = 'built_in_current';
  assert.throws(() => PC.assertProjectContextShape(d), /ProjectContext/);
  assert.deepEqual(Array.from(PC.SOURCE_KINDS), ['legacy_builtin', 'project_pack_unreviewed']);
});

test('P2L-S2A-02: 持っていない capability は fail closed（代わりの値を作らない）', () => {
  const legacy = PC.fromLegacyPreset(LEGACY_ID);
  ['declaredPanes', 'declaredGlazingCases', 'caseDirectPressure', 'notificationCalculation', 'evidenceClaims']
    .forEach((name) => assert.throws(() => PC.requireCapability(legacy, name), /is not supported by this "legacy_builtin" context/, name));
  const map = packContext('project_pressure_map');
  ['notificationCalculation', 'caseDirectPressure', 'builtInEvidence', 'sampleDefaultDimensions']
    .forEach((name) => assert.throws(() => PC.requireCapability(map, name), /is not supported/, name));
  assert.throws(() => PC.requireCapability(map, 'teleport'), /capability must be one of/);
  assert.equal(PC.hasCapability(map, 'projectPressureMap'), true);
  assert.equal(PC.hasCapability(map, 'notificationCalculation'), false);

  // 形の上でも: sourceKind に無い capability、pressure 源の 2 重化、mode と食い違う源
  const l = clone(legacy); l.capabilities.declaredPanes = { panes: [] };
  assert.throws(() => PC.assertProjectContextShape(l), /is not a capability a "legacy_builtin" context can have/);
  const two = clone(packContext('case_direct'));
  two.capabilities.projectPressureMap = clone(map.capabilities.projectPressureMap);
  assert.throws(() => PC.assertProjectContextShape(two), /one source only/);
  const swapped = clone(map); swapped.pressureModel.mode = 'case_direct';
  assert.throws(() => PC.assertProjectContextShape(swapped), /pressure source for mode "case_direct"/);
  const legacyMode = clone(legacy); legacyMode.pressureModel.mode = 'notification1458';
  assert.throws(() => PC.assertProjectContextShape(legacyMode), /must be "project_pressure_map" for a legacy preset/);
  const missing = clone(legacy); delete missing.capabilities.builtInEvidence;
  assert.throws(() => PC.assertProjectContextShape(missing), /missing required capability "builtInEvidence"/);
});

test('P2L-S2A-03: context は deep-frozen', () => {
  [PC.fromLegacyPreset(LEGACY_ID)].concat(MODES.map((m) => packContext(m))).forEach((ctx) => {
    objectsOf(ctx).forEach(([n, at]) => assert.equal(Object.isFrozen(n), true, ctx.sourceKind + ' ' + at));
  });
});

test('P2L-S2A-04: 呼び出し側の object を共有しない', () => {
  const legacy = PC.fromLegacyPreset(LEGACY_ID);
  const presetObjects = new Set(objectsOf(Registry.getPreset(LEGACY_ID)).map(([n]) => n));
  objectsOf(legacy).forEach(([n, at]) => assert.equal(presetObjects.has(n), false, 'legacy ' + at + ' は preset と同じ object'));

  MODES.forEach((mode) => {
    const raw = syntheticPack(mode);
    const validated = Pack.validateProjectPack(raw);
    const ctx = PC.fromProjectPack(validated);
    const shared = new Set(objectsOf(validated).concat(objectsOf(raw)).map(([n]) => n));
    objectsOf(ctx).forEach(([n, at]) => assert.equal(shared.has(n), false, mode + ' ' + at + ' を共有している'));
    const before = JSON.stringify(ctx);
    raw.panes[0].widthMm.value = 1;
    assert.equal(JSON.stringify(ctx), before, mode);
  });
});

test('P2L-S2A-05: 未知の field はどの階層でも拒否', () => {
  const legacy = clone(PC.fromLegacyPreset(LEGACY_ID));
  const pack = clone(packContext('project_pressure_map'));
  const cases = [
    ['top', legacy, (c) => { c.verified = true; }],
    ['top trust-ish', pack, (c) => { c.reviewed = true; }],
    ['pressureModel', pack, (c) => { c.pressureModel.fallback = 'case_direct'; }],
    ['origin legacy', legacy, (c) => { c.origin.config = {}; }],
    ['origin pack', pack, (c) => { c.origin.registryProjectId = 'x'; }],
    ['pressure map', pack, (c) => { c.capabilities.projectPressureMap.defaults = {}; }],
    ['map row', pack, (c) => { c.capabilities.projectPressureMap.positivePressures[0].note = 'x'; }],
    ['pane', pack, (c) => { c.capabilities.declaredPanes.panes[0].label = 'x'; }],
    ['case', pack, (c) => { c.capabilities.declaredGlazingCases.glazingCases[0].openingName = 'x'; }],
    ['source claim', pack, (c) => { c.capabilities.evidenceClaims.sourceScopes[0].sourceClaim.level = 'primary'; }],
    ['source scope', pack, (c) => { c.capabilities.evidenceClaims.sourceScopes[0].evidence = {}; }],
    ['record subject', pack, (c) => { c.capabilities.evidenceClaims.records[0].subject.floor = '1'; }],
    ['sample dims', legacy, (c) => { c.capabilities.sampleDefaultDimensions.verificationStatus = 'verified'; }],
    ['built-in field', legacy, (c) => { c.capabilities.builtInEvidence.fields[0].promoted = true; }],
    ['built-in evidence', legacy, (c) => { c.capabilities.builtInEvidence.fields[1].evidence.extra = 1; }]
  ];
  cases.forEach(([name, base, mutate]) => {
    assert.doesNotThrow(() => PC.assertProjectContextShape(clone(base)), 'control ' + name);
    const c = clone(base); mutate(c);
    assert.throws(() => PC.assertProjectContextShape(c), /unexpected field/, name);
  });
});

test('P2L-S2A-06: 形を真似た object は context として受け入れない（発行元の同一性で判定）', () => {
  const genuine = PC.fromLegacyPreset(LEGACY_ID);
  const lookAlike = clone(genuine);
  assert.equal(PC.assertProjectContextShape(lookAlike), true, '形は正しい');
  assert.equal(PC.isProjectContext(lookAlike), false);
  assert.throws(() => PC.assertProjectContext(lookAlike), /look-alike object is not accepted/);
  assert.throws(() => PC.requireCapability(lookAlike, 'projectPressureMap'), /look-alike/);
  assert.equal(PC.isProjectContext(genuine), true);
  // 偽造した legacy context で built_in_current を名乗っても通らない
  const forged = clone(packContext('case_direct'));
  assert.equal(PC.isProjectContext(forged), false);
  // getter は呼ばずに拒否する
  let calls = 0;
  const withGetter = clone(genuine);
  Object.defineProperty(withGetter, 'publicLabel', { enumerable: true, get() { calls++; return 'x'; } });
  assert.throws(() => PC.assertProjectContextShape(withGetter), /is an accessor, not data/);
  assert.equal(calls, 0);
});

// ============================================================
// LegacyPresetAdapter
// ============================================================

test('P2L-S2A-10: legacy — publicLabel / origin / trust / mode', () => {
  const ctx = PC.fromLegacyPreset(LEGACY_ID);
  assert.equal(ctx.publicLabel, Miyoshi.getPublicLabel());
  assert.equal(ctx.origin.registryProjectId, Miyoshi.projectId);
  assert.equal(ctx.sourceKind, 'legacy_builtin');
  assert.equal(ctx.trust, 'built_in_current');
  assert.equal(ctx.pressureModel.mode, 'project_pressure_map');
  assert.deepEqual(Object.keys(ctx.capabilities).sort(), ['builtInEvidence', 'projectPressureMap', 'sampleDefaultDimensions']);
});

test('P2L-S2A-11: legacy — floor / zone topology は Evidence Closure の scope 契約と一致', () => {
  const ctx = PC.fromLegacyPreset(LEGACY_ID);
  const map = PC.requireCapability(ctx, 'projectPressureMap');
  const scope = Closure.createProjectScopeContract(LEGACY_ID);
  assert.deepEqual(map.positivePressures.map((r) => r.floor).sort(), Array.from(scope.floors).sort());
  assert.deepEqual(map.negativePressures.map((r) => r.zone).sort(), Array.from(scope.zones).sort());
  // 宣言順も preset のまま
  assert.deepEqual(map.positivePressures.map((r) => r.floor), Object.keys(Miyoshi.wind.positivePressureByFloor));
  assert.deepEqual(map.negativePressures.map((r) => r.zone), Object.keys(Miyoshi.wind.negativePressureByZone));
});

test('P2L-S2A-12: legacy — 圧力値は preset と ProjectInput.fromPreset の結果に一致', () => {
  const ctx = PC.fromLegacyPreset(LEGACY_ID);
  const map = PC.requireCapability(ctx, 'projectPressureMap');
  map.positivePressures.forEach((r) => {
    assert.equal(r.pressure.value, Miyoshi.getPositivePressure(r.floor), r.floor);
    assert.equal(r.pressure.unit, Miyoshi.wind.positivePressureByFloor[r.floor].unit);
  });
  map.negativePressures.forEach((r) => {
    assert.equal(r.magnitude.value, Miyoshi.getNegativePressure(r.zone), r.zone);
    assert.equal(r.magnitude.unit, Miyoshi.wind.negativePressureByZone[r.zone].unit);
  });
  // runtime が今使っている経路（fromPreset）と、全 floor × zone で同じ値
  const preset = Registry.getPreset(LEGACY_ID);
  map.positivePressures.forEach((pos) => {
    map.negativePressures.forEach((neg) => {
      const pkg = ProjectInput.fromPreset(preset, { floorKey: pos.floor, zoneKey: neg.zone,
        widthMm: 900, heightMm: 1800, glassType: 'fl_single' });
      assert.equal(pkg.positivePressure, pos.pressure.value, pos.floor);
      assert.equal(pkg.negativePressure, neg.magnitude.value, neg.zone);
    });
  });
});

test('P2L-S2A-13: legacy — sample default と検証状況は preset のまま（昇格も降格もしない）', () => {
  const ctx = PC.fromLegacyPreset(LEGACY_ID);
  const dims = PC.requireCapability(ctx, 'sampleDefaultDimensions');
  const dflt = Miyoshi.getDefaultDimensionsMM();
  assert.equal(dims.widthMm.value, dflt.W);
  assert.equal(dims.heightMm.value, dflt.H);
  assert.equal(dims.mode, Miyoshi.dimensions.mode);
  const ev = PC.requireCapability(ctx, 'builtInEvidence');
  assert.equal(ev.groupStatus.dimensions, Miyoshi.dimensions.status);
  assert.equal(ev.groupStatus.wind, Miyoshi.wind.status);
  const sources = {
    identity: Miyoshi.identity, 'wind.V0': Miyoshi.wind.V0, 'wind.roughnessCategory': Miyoshi.wind.roughnessCategory,
    'dimensions.defaultW': Miyoshi.dimensions.defaultW, 'dimensions.defaultH': Miyoshi.dimensions.defaultH
  };
  assert.deepEqual(ev.fields.map((f) => f.fieldKey), Object.keys(sources));
  ev.fields.forEach((f) => {
    const src = sources[f.fieldKey];
    assert.equal(f.evidenceKind, 'built_in_canonical');
    assert.equal(f.verificationStatus, src.verificationStatus, f.fieldKey);
    assert.deepEqual({ ...f.evidence }, { ...src.evidence }, f.fieldKey);
  });
  // 値を持つのは context の他の場所に値が無い field だけ
  assert.equal(ev.fields.find((f) => f.fieldKey === 'wind.V0').value, Miyoshi.wind.V0.value);
  assert.equal(ev.fields.find((f) => f.fieldKey === 'wind.roughnessCategory').value, Miyoshi.wind.roughnessCategory.value);
  ['identity', 'dimensions.defaultW', 'dimensions.defaultH'].forEach((k) => {
    assert.equal(Object.prototype.hasOwnProperty.call(ev.fields.find((f) => f.fieldKey === k), 'value'), false, k);
  });
});

test('P2L-S2A-14: legacy — verifiedCases は preset と同じ（追加しない）', () => {
  const ev = PC.requireCapability(PC.fromLegacyPreset(LEGACY_ID), 'builtInEvidence');
  assert.deepEqual(clone(ev.verifiedCases), clone(Miyoshi.verifiedCases));
  assert.equal(ev.verifiedCases.length, Miyoshi.verifiedCases.length);
});

test('P2L-S2A-15: legacy — 元の preset を変更しない', () => {
  const preset = Registry.getPreset(LEGACY_ID);
  const snap = () => JSON.stringify(preset, (k, v) => (typeof v === 'function' ? 'fn:' + k : v));
  const frozen = () => objectsOf(preset).map(([n]) => Object.isFrozen(n)).join(',');
  const before = [snap(), frozen()];
  for (let i = 0; i < 3; i++) PC.fromLegacyPreset(LEGACY_ID);
  assert.deepEqual([snap(), frozen()], before);
  assert.equal(Registry.getPreset(LEGACY_ID), preset, 'registry の preset が差し替わった');
});

test('P2L-S2A-16: legacy — 架空の pane / case / 告示算定入力を作らない', () => {
  const ctx = PC.fromLegacyPreset(LEGACY_ID);
  walk(ctx, (n, at) => {
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      ['paneId', 'caseId', 'panes', 'glazingCases', 'designPressure', 'windConditions'].forEach((k) => {
        assert.equal(Object.prototype.hasOwnProperty.call(n, k), false, at + '.' + k);
      });
    }
    if (typeof n === 'string') assert.equal(/^[PG][0-9]{3,4}$/.test(n), false, at + ' = ' + n);
  });
  // legacy の V0 は Evidence 表示用であり、算定入力として出さない
  assert.throws(() => PC.requireCapability(ctx, 'notificationCalculation'), /not supported/);
});

test('P2L-S2A-17: legacy adapter は registry の built-in だけを受け付ける', () => {
  assert.throws(() => PC.fromLegacyPreset('unknown-project'), /not a repository built-in preset/);
  assert.throws(() => PC.fromLegacyPreset(Registry.getPreset(LEGACY_ID)), /not a repository built-in preset/);
  assert.throws(() => PC.fromLegacyPreset(undefined), Error);
  assert.equal(PC.fromLegacyPreset.length, 1);
});

test('P2L-S2A-18: legacy — 昇格可能な object は builtInEvidence の中だけで、preset の写しに限る', () => {
  const ctx = PC.fromLegacyPreset(LEGACY_ID);
  const capable = objectsOf(ctx).filter(([n]) => !Array.isArray(n) && Evidence.canPromoteToVerified(n));
  capable.forEach(([, at]) => assert.match(at, /^\$\.capabilities\.builtInEvidence\./, at));
  // preset 側で昇格可能な Evidence の数より増えていない（新しい trust 経路を作らない）
  const presetCapable = [Miyoshi.identity, Miyoshi.wind.V0, Miyoshi.wind.roughnessCategory,
    Miyoshi.dimensions.defaultW, Miyoshi.dimensions.defaultH].filter((f) => Evidence.canPromoteToVerified(f.evidence));
  assert.equal(capable.length, presetCapable.length);
});

// ============================================================
// ProjectPackAdapter
// ============================================================

test('P2L-S2A-20: pack — 3 mode とも mode と同じ pressure 源を 1 つだけ持つ', () => {
  MODES.forEach((mode) => {
    const ctx = packContext(mode);
    assert.equal(ctx.sourceKind, 'project_pack_unreviewed');
    assert.equal(ctx.trust, 'pack_unreviewed');
    assert.equal(ctx.pressureModel.mode, mode);
    const source = PC.PRESSURE_CAPABILITY_BY_MODE[mode];
    ['projectPressureMap', 'notificationCalculation', 'caseDirectPressure'].forEach((name) => {
      assert.equal(PC.hasCapability(ctx, name), name === source, mode + ' ' + name);
    });
    assert.deepEqual(Object.keys(ctx.capabilities).sort(),
      [source, 'declaredGlazingCases', 'declaredPanes', 'evidenceClaims'].sort());
  });
});

test('P2L-S2A-21: pack notification1458 — 風条件を保持し、WindPressure へそのまま渡せる', () => {
  const validated = Pack.validateProjectPack(syntheticPack('notification1458'));
  const ctx = PC.fromProjectPack(validated);
  const wc = PC.requireCapability(ctx, 'notificationCalculation').windConditions;
  assert.deepEqual(clone(wc), clone(validated.windConditions));
  // 風圧式は context に無い。後段の WindPressure が計算する（ここでは入力として受理されるかだけ）
  PC.requireCapability(ctx, 'declaredGlazingCases').glazingCases.forEach((c) => {
    const h = wc.evaluationHeights.find((r) => r.floor === c.floor).height.value;
    const r = Wind.calculateWindPressure({ V0: wc.V0.value, roughnessCategory: wc.roughnessCategory,
      buildingHeightM: wc.buildingHeightM.value, eavesHeightM: wc.eavesHeightM.value, evaluationHeightM: h,
      buildingType: wc.buildingType, zone: c.zone, basis: wc.basis });
    assert.equal(typeof r, 'object', c.caseId);
  });
  assert.equal(/calculateWindPressure|generateCandidates|computeDesignPressure|Math\.pow|Math\.sqrt/.test(CTX_SRC), false,
    'context に計算が入っている');
});

test('P2L-S2A-22: pack project_pressure_map — floor / zone map を保持', () => {
  const validated = Pack.validateProjectPack(syntheticPack('project_pressure_map'));
  const map = PC.requireCapability(PC.fromProjectPack(validated), 'projectPressureMap');
  assert.deepEqual(clone(map), clone(validated.windConditions));
});

test('P2L-S2A-23: pack case_direct — case ごとの designPressure を保持し、zone を推測しない', () => {
  const validated = Pack.validateProjectPack(syntheticPack('case_direct'));
  const ctx = PC.fromProjectPack(validated);
  const dp = PC.requireCapability(ctx, 'caseDirectPressure').designPressures;
  assert.deepEqual(clone(dp), validated.glazingCases.map((c) => ({ caseId: c.caseId, designPressure: clone(c.designPressure) })));
  const cases = PC.requireCapability(ctx, 'declaredGlazingCases').glazingCases;
  cases.forEach((c) => assert.equal(Object.prototype.hasOwnProperty.call(c, 'designPressure'), false, c.caseId));
  const g021 = cases.find((c) => c.caseId === 'G021');
  assert.equal(Object.prototype.hasOwnProperty.call(g021, 'zone'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(g021, 'floor'), false);
  assert.equal(cases.find((c) => c.caseId === 'G022').floor, '4');
  assert.throws(() => PC.requireCapability(ctx, 'projectPressureMap'), /not supported/);
  // case に風圧を戻すと二重の真実
  const c = clone(ctx);
  c.capabilities.declaredGlazingCases.glazingCases[0].designPressure = q(1321, P);
  assert.throws(() => PC.assertProjectContextShape(c), /double truth/);
  const gap = clone(ctx); gap.capabilities.caseDirectPressure.designPressures.pop();
  assert.throws(() => PC.assertProjectContextShape(gap), /has no designPressure for declared case/);
});

test('P2L-S2A-24: pack — 中立 ID をそのまま運び、実開口名へ変換しない', () => {
  MODES.forEach((mode) => {
    const validated = Pack.validateProjectPack(syntheticPack(mode));
    const ctx = PC.fromProjectPack(validated);
    assert.deepEqual(PC.requireCapability(ctx, 'declaredPanes').panes.map((p) => p.paneId), validated.panes.map((p) => p.paneId));
    assert.deepEqual(PC.requireCapability(ctx, 'declaredGlazingCases').glazingCases.map((c) => c.caseId),
      validated.glazingCases.map((c) => c.caseId));
    const ids = new Set();
    walk(ctx, (n, at) => { if (/\.(paneId|caseId|sourceScopeId)$/.test(at)) ids.add(n); });
    const packIds = new Set();
    walk(validated, (n, at) => { if (/\.(paneId|caseId|sourceScopeId)$/.test(at)) packIds.add(n); });
    assert.deepEqual([...ids].sort(), [...packIds].sort(), mode);
  });
});

test('P2L-S2A-25: pack — sourceClaim は claimed* のまま、pack_unreviewed_claim として運ぶ', () => {
  const validated = Pack.validateProjectPack(syntheticPack('case_direct', true));
  const scopes = PC.requireCapability(PC.fromProjectPack(validated), 'evidenceClaims').sourceScopes;
  scopes.forEach((s, i) => {
    assert.equal(s.evidenceKind, 'pack_unreviewed_claim');
    assert.deepEqual(Object.keys(s.sourceClaim), Array.from(Pack.SOURCE_CLAIM_KEYS));
    assert.deepEqual(clone(s.sourceClaim), clone(validated.evidence.sourceScopes[i].sourceClaim));
  });
  const wrongKind = clone(PC.fromProjectPack(validated));
  wrongKind.capabilities.evidenceClaims.sourceScopes[0].evidenceKind = 'built_in_canonical';
  assert.throws(() => PC.assertProjectContextShape(wrongKind), /must be "pack_unreviewed_claim"/);
});

test('P2L-S2A-26: pack — 陽性対照: 同じ申告を canonical へ詰め替えれば gate は通る', () => {
  const scopes = PC.requireCapability(packContext('project_pressure_map', true), 'evidenceClaims').sourceScopes;
  scopes.forEach((s) => assert.equal(Evidence.canPromoteToVerified(naiveCanonical(s.sourceClaim)), true));
  assert.doesNotThrow(() => Ledger.createEntry({ factKey: 'pane_width_mm', value: 1013, unit: 'mm',
    verificationStatus: 'verified', evidence: naiveCanonical(scopes[0].sourceClaim) }));
});

test('P2L-S2A-27: pack context のどの object も Promotion Gate / Ledger を通らない', () => {
  MODES.forEach((mode) => {
    const ctx = packContext(mode, true);
    assert.equal(ctx.trust, 'pack_unreviewed');
    const nodes = objectsOf(ctx);
    assert.equal(nodes.length > 25, true, 'walk が object を見ていない');
    nodes.forEach(([n, at]) => {
      assert.equal(Evidence.canPromoteToVerified(n), false, mode + ' ' + at);
      assert.equal(Evidence.canPromoteToVerified(n, {}), false, mode + ' ' + at);
      assert.throws(() => Evidence.assertPromotionGate('verified', n), Error, mode + ' ' + at);
      assert.throws(() => Ledger.createEntry({ factKey: 'pane_width_mm', value: 1013, unit: 'mm',
        verificationStatus: 'verified', evidence: n }), Error, 'ledger ' + mode + ' ' + at);
      if (!Array.isArray(n)) {
        ['level', 'checkedAt', 'privateReferenceAvailable', 'verificationStatus', 'verified', 'reviewed'].forEach((k) => {
          assert.equal(Object.prototype.hasOwnProperty.call(n, k), false, mode + ' ' + at + '.' + k);
        });
      }
    });
  });
});

test('P2L-S2A-28: adapter に verified への経路が無く、形の検証が最後の砦として昇格可能 Evidence を拒否する', () => {
  Object.keys(PC).forEach((k) => {
    assert.equal(/promot|canonical|attest|review|toEvidence|verif/i.test(k), false, 'export ' + k);
  });
  // adapter のどこかが canonical Evidence を pack context へ紛れ込ませても、発行前に止まる
  const ctx = clone(packContext('notification1458', true));
  const claim = ctx.capabilities.evidenceClaims.sourceScopes[0].sourceClaim;
  ctx.capabilities.notificationCalculation.windConditions.V0 = naiveCanonical(claim);
  assert.throws(() => PC.assertProjectContextShape(ctx), /promotion-capable Evidence/);
  // 陰性対照: 差し込む前の同じ写しは通る（落ちたのは差し込んだ Evidence のため）
  assert.doesNotThrow(() => PC.assertProjectContextShape(clone(packContext('notification1458', true))));
});

test('P2L-S2A-29: pack adapter は validateProjectPack() の出力（trust: pack_unreviewed）だけを受け付け、出力を変えない', () => {
  const raw = syntheticPack('project_pressure_map');
  assert.throws(() => PC.fromProjectPack(raw), /expected validateProjectPack\(\) output/);
  const validated = Pack.validateProjectPack(raw);
  const before = JSON.stringify(validated);
  PC.fromProjectPack(validated);
  assert.equal(JSON.stringify(validated), before);
  assert.equal(Object.isFrozen(validated), true);

  const reviewed = clone(validated); reviewed.trust = 'pack_reviewed';
  assert.throws(() => PC.fromProjectPack(reviewed), /must be "pack_unreviewed"/);
  const verified = clone(validated); verified.trust = 'verified';
  assert.throws(() => PC.fromProjectPack(verified), /must be "pack_unreviewed"/);
  const extra = clone(validated); extra.verificationStatus = 'verified';
  assert.throws(() => PC.fromProjectPack(extra), /unexpected field "verificationStatus"/);
  // 検証後の書き換えは、もう一度 validator を通すので拒否される
  const tampered = clone(validated); tampered.panes[0].widthMm.unit = 'cm';
  assert.throws(() => PC.fromProjectPack(tampered), /Project Pack/);
  const canonicalized = clone(validated);
  canonicalized.evidence.sourceScopes[0].sourceClaim = naiveCanonical(canonicalized.evidence.sourceScopes[0].sourceClaim);
  assert.throws(() => PC.fromProjectPack(canonicalized), /Project Pack/);
  const advisories = clone(validated); advisories.publicationAdvisories = [{ path: 'x', rule: 'www' }];
  assert.throws(() => PC.fromProjectPack(advisories), /does not match the advisories/);
  // JSON 経由の写し（frozen でない）でも内容が正しければ受け付ける: 判定は再検証による
  assert.equal(PC.fromProjectPack(clone(validated)).trust, 'pack_unreviewed');
  // top-level の getter は呼ばない
  let calls = 0;
  const g = clone(validated);
  Object.defineProperty(g, 'panes', { enumerable: true, get() { calls++; return []; } });
  assert.throws(() => PC.fromProjectPack(g), /is an accessor, not data/);
  assert.equal(calls, 0);
});

test('P2L-S2A-30: pack fixture は実案件の値・名称を使わない', () => {
  const real = new Set();
  Object.values(Miyoshi.wind.positivePressureByFloor).forEach((v) => real.add(v.value));
  Object.values(Miyoshi.wind.negativePressureByZone).forEach((v) => real.add(v.value));
  [Miyoshi.wind.V0.value, Miyoshi.dimensions.defaultW.value, Miyoshi.dimensions.defaultH.value].forEach((v) => real.add(v));
  const Intake = require('../project-config/miyoshi-observations.js');
  Intake.observations.forEach((o) => real.add(o.observedValue));
  assert.equal(real.size >= 12, true);
  MODES.forEach((mode) => {
    walk(syntheticPack(mode), (n, at) => {
      if (typeof n === 'number' && at !== '$.schemaVersion') assert.equal(real.has(n), false, mode + ' ' + at + ' = ' + n);
      if (typeof n === 'string') assert.equal(/miyoshi|みよし|三好/i.test(n), false, mode + ' ' + at);
    });
  });
});

// ============================================================
// Parity / runtime boundary
// ============================================================

test('P2L-S2A-40: context を作っても runtime / probe の状態は変わらない', async () => {
  const probe = await import(path.join(ROOT, 'tools/verification/project-state-probe.mjs'));
  const probeBefore = probe.serializeProjectState(probe.readProjectState());
  const before = runtimeSnapshot();
  for (let i = 0; i < 3; i++) {
    PC.fromLegacyPreset(LEGACY_ID);
    MODES.forEach((m) => packContext(m, true));
  }
  assert.equal(runtimeSnapshot(), before);
  assert.equal(probe.serializeProjectState(probe.readProjectState()), probeBefore);
  // 別 process（context を一度も作っていない）の probe とも一致
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; delete env.NODE_OPTIONS; delete env.NODE_V8_COVERAGE;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/verification/project-state-probe.mjs')], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, probeBefore);
  const state = JSON.parse(probeBefore).project;
  assert.equal(state.closureStatus, 'BLOCKED');
  assert.equal(state.readySlotCount, 0);
  assert.equal(state.verifiedCaseCount, 0);
  assert.equal(state.hasPromotionCandidate, false);
});

test('P2L-S2A-41: runtime consumer は 0（index.html・registry・Closure・probe・browser harness は読まない）', () => {
  const files = ['index.html', 'project-config/registry.js', 'project-config/evidence-closure.js',
    'project-config/project-input.js', 'project-config/project-pack.js', 'project-config/miyoshi.js',
    'tools/verification/project-state-probe.mjs', 'workspace.js', 'project-profile.js', 'review-package.js'];
  fs.readdirSync(path.join(ROOT, 'tools/browser-checks')).filter((f) => /\.m?js$/.test(f))
    .forEach((f) => files.push('tools/browser-checks/' + f));
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.equal(/project-context|ProjectContext/.test(src), false, f + ' が ProjectContext を参照している');
  });
});

test('P2L-S2A-42: network / storage / filesystem / DOM に依存せず、案件固有の値を持たない', () => {
  [/\bfetch\s*\(/, /XMLHttpRequest/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/,
    /\bdocument\./, /\bwindow\./, /\bnavigator\./, /\bimport\s*\(/, /\bprocess\./,
    /require\(\s*['"](?:node:)?(?:fs|path|http|https|net|child_process|os)['"]\s*\)/]
    .forEach((re) => assert.equal(re.test(CTX_SRC), false, CTX_SRC_REL + ' に ' + re));
  // 案件 id・名称・値を module に書かない（registry から引く）
  assert.equal(/miyoshi|みよし|三好/i.test(CTX_SRC), false);
  const real = [];
  Object.values(Miyoshi.wind.positivePressureByFloor).forEach((v) => real.push(v.value));
  Object.values(Miyoshi.wind.negativePressureByZone).forEach((v) => real.push(v.value));
  real.push(Miyoshi.dimensions.defaultW.value, Miyoshi.dimensions.defaultH.value, Miyoshi.wind.V0.value);
  real.forEach((v) => assert.equal(new RegExp('\\b' + v + '\\b').test(CTX_SRC), false, String(v)));
});

// ============================================================
// RF-16-01: built-in の trust は registry にあることではなく、built-in の provenance から来る
// ============================================================
//
// 以下の test は既定 registry へ合成の偽 preset を登録する（process 内で残る）。
// そのため file の最後に置く。

const FAKE_ID = 'synthetic-fake-builtin';

/** 形の上では legacy adapter をすべて満たす、合成の偽 preset（実案件ではない）。 */
function syntheticFakePreset(projectId) {
  const ev = (level, checkedAt, priv) => ({ level, checkedAt,
    publicDescription: '合成テスト用の偽 preset（実案件ではない）', privateReferenceAvailable: priv });
  const strong = ev('primary', '2026-03-04', true);
  const val = (value, unit, status, evidence) => ({ value, unit, verificationStatus: status, evidence, sourceReference: null });
  const floors = { 1: 1111, 2: 1222, R: 1333 };
  const zones = { general: 1444, corner: 1555 };
  const cfg = {
    projectId,
    hasFixedPreset: true,
    identity: { publicLabel: 'Synthetic Fake Preset', verificationStatus: 'verified', disclosureStatus: 'redacted', evidence: strong },
    dimensions: {
      mode: 'sample_default',
      defaultW: val(901, 'mm', 'verified', strong),
      defaultH: val(1901, 'mm', 'verified', strong),
      status: 'verified'
    },
    wind: {
      positivePressureByFloor: {},
      negativePressureByZone: {},
      V0: val(31, 'm/s', 'verified', strong),
      roughnessCategory: val('II', null, 'verified', strong),
      status: 'verified'
    },
    verifiedCases: [],
    getPublicLabel() { return this.identity.publicLabel; },
    getPositivePressure(f) { return this.wind.positivePressureByFloor[f].value; },
    getNegativePressure(z) { return this.wind.negativePressureByZone[z].value; }
  };
  Object.keys(floors).forEach((f) => { cfg.wind.positivePressureByFloor[f] = val(floors[f], P, 'verified', strong); });
  Object.keys(zones).forEach((z) => { cfg.wind.negativePressureByZone[z] = val(zones[z], P, 'verified', strong); });
  return cfg;
}

test('P2L-S2A-50: 陽性対照——built-in 境界は bootstrap で捕まえた instance そのものを返す', () => {
  const builtIn = Registry.getBuiltInPreset(LEGACY_ID);
  assert.equal(builtIn, Miyoshi, 'module instance と同一でない');
  assert.equal(builtIn, Registry.getPreset(LEGACY_ID));
  assert.equal(Registry.getBuiltInPreset(LEGACY_ID), builtIn, '呼ぶたびに同じ instance');
  // 形が同じだけの写しは built-in の同一性を持たない
  const lookAlike = Object.assign({}, builtIn);
  assert.notEqual(lookAlike, builtIn);
  assert.equal(PC.fromLegacyPreset(LEGACY_ID).trust, 'built_in_current');
});

test('P2L-S2A-51: 公開 registerPreset() で登録した偽 preset は built_in_current にならない', () => {
  const fake = syntheticFakePreset(FAKE_ID);
  // 既存の registry 契約はそのまま: 登録でき、getPreset で引ける
  assert.equal(Registry.registerPreset(fake), FAKE_ID);
  assert.equal(Registry.hasPreset(FAKE_ID), true);
  assert.equal(Registry.getPreset(FAKE_ID), fake);
  assert.equal(Registry.listPresets().some((p) => p.projectId === FAKE_ID), true);
  // built-in 境界からは引けない
  assert.throws(() => Registry.getBuiltInPreset(FAKE_ID), /not a repository built-in preset/);
  assert.throws(() => PC.fromLegacyPreset(FAKE_ID), /not a repository built-in preset/);
  // 偽 preset は adapter の他の検査をすべて満たす形にしてある。落ちた理由が provenance だけで
  // あることは、provenance 検査を外す mutation（getBuiltInPreset → getPreset）でこの test が
  // 失敗することで確かめる（negative control M1）。
  // 本物の built-in は引き続き通る
  const ctx = PC.fromLegacyPreset(LEGACY_ID);
  assert.equal(ctx.trust, 'built_in_current');
  assert.equal(ctx.origin.registryProjectId, LEGACY_ID);
  // built-in の id を偽で上書きすることはできない（重複登録は既存契約で拒否）
  assert.throws(() => Registry.registerPreset(syntheticFakePreset(LEGACY_ID)), /duplicate projectId/);
  assert.equal(Registry.getBuiltInPreset(LEGACY_ID), Miyoshi);
});

test('P2L-S2A-52: BUILT_IN_PRESET_IDS を書き換えても写しても trust は増えない', () => {
  assert.equal(Object.isFrozen(Registry.BUILT_IN_PRESET_IDS), true);
  assert.equal(Object.isFrozen(Registry), true);
  assert.throws(() => Registry.BUILT_IN_PRESET_IDS.push(FAKE_ID), TypeError);
  assert.throws(() => { Registry.BUILT_IN_PRESET_IDS = [LEGACY_ID, FAKE_ID]; }, TypeError);
  assert.throws(() => { Registry.getBuiltInPreset = () => syntheticFakePreset(FAKE_ID); }, TypeError);
  assert.deepEqual(Array.from(Registry.BUILT_IN_PRESET_IDS), [LEGACY_ID]);
  // 写しに足しても権威にはならない
  const copy = Registry.BUILT_IN_PRESET_IDS.slice();
  copy.push(FAKE_ID);
  assert.throws(() => Registry.getBuiltInPreset(FAKE_ID), /not a repository built-in preset/);
  assert.throws(() => PC.fromLegacyPreset(FAKE_ID), /not a repository built-in preset/);
  // project-context は built-in 境界を読み込み時に掴んでいる（後から global を差し替えても使わない）
  assert.match(CTX_SRC, /var getBuiltInPreset = Registry\.getBuiltInPreset;/);
  assert.equal(/Registry\.getPreset\(/.test(CTX_SRC), false, 'project-context が getPreset() を使っている');
});

test('P2L-S2A-53: RF-16-01 後も trust の退行が無い（pack は pack_unreviewed、legacy は built-in の写しだけ）', () => {
  MODES.forEach((mode) => {
    const ctx = packContext(mode, true);
    assert.equal(ctx.trust, 'pack_unreviewed');
    objectsOf(ctx).forEach(([n, at]) => assert.equal(Evidence.canPromoteToVerified(n), false, mode + ' ' + at));
  });
  const legacy = PC.fromLegacyPreset(LEGACY_ID);
  assert.equal(PC.isProjectContext(legacy), true);
  assert.equal(PC.isProjectContext(clone(legacy)), false);
  const capable = objectsOf(legacy).filter(([n]) => !Array.isArray(n) && Evidence.canPromoteToVerified(n));
  capable.forEach(([, at]) => assert.match(at, /^\$\.capabilities\.builtInEvidence\./));
  // 偽 preset の Evidence はどの context にも入らない
  const labels = new Set(objectsOf(legacy).map(([n]) => n.publicDescription).filter(Boolean));
  assert.equal(labels.has('合成テスト用の偽 preset（実案件ではない）'), false);
});
