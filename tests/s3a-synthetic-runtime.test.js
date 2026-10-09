'use strict';

/**
 * Phase 2L-B2 / S3-A: 公開 browser runtime の標準 built-in を合成サンプルへ切り替える。
 *
 *   - project-config/sample.js は実案件ではない合成 built-in。値と Evidence を契約として固定する
 *     （値を変えるのは Human Review を伴う意図した変更）
 *   - registry の runtime default は宣言（runtimeDefault）で決まる選択の方針で、trust の方針ではない。
 *     0 件・2 件以上・module 未読込は fail closed で、別の built-in や id 一覧の先頭へ fallback しない
 *   - index.html は合成サンプルだけを読み込み、以前の案件 module を読み込まない
 *   - project-state-probe は公開 runtime の現在の状態を index.html と同じ経路で読む。
 *     protectedCalculations は runtime preset から独立した algorithm regression fixture
 *   - 以前の案件 preset と Phase 2L-A intake は LEGACY VALIDATION ONLY として残す
 *
 * 実ブラウザでの挙動は tools/browser-checks/context-runtime.mjs が確かめる。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const Evidence = require('../project-config/evidence.js');
const Registry = require('../project-config/registry.js');
const ProjectContext = require('../project-config/project-context.js');
const ProjectInput = require('../project-config/project-input.js');
const Closure = require('../project-config/evidence-closure.js');
const Sample = require('../project-config/sample.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const CODE = stripComments(inlineScripts(HTML));
const REGISTRY_SRC = read('project-config/registry.js');

/* ============================================================
   合成サンプルの契約（値を変えるなら Human Review）
============================================================ */

const SYNTHETIC_DESCRIPTION = '公開ツール動作確認用の合成サンプル。実案件の一次資料に基づく値ではない。';
const SAMPLE_CONTRACT = Object.freeze({
  projectId: 'synthetic-sample',
  publicLabel: '合成サンプル',
  dimensions: { mode: 'sample_default', W: 900, H: 1800, status: 'unverified' },
  positive: [['1', 1110], ['2', 1330], ['4', 1550], ['R', 1770]],
  negative: [['general', 870], ['corner', 1190]],
  V0: 30,
  roughnessCategory: 'II',
  windStatus: 'unverified'
});

/** sample config の中の値 entry（value と evidence を持つもの）を label 付きで列挙する。 */
function sampleEntries(cfg) {
  const out = [['identity', cfg.identity], ['dimensions.defaultW', cfg.dimensions.defaultW],
    ['dimensions.defaultH', cfg.dimensions.defaultH], ['wind.V0', cfg.wind.V0],
    ['wind.roughnessCategory', cfg.wind.roughnessCategory]];
  Object.keys(cfg.wind.positivePressureByFloor).forEach((f) => out.push(['positive.' + f, cfg.wind.positivePressureByFloor[f]]));
  Object.keys(cfg.wind.negativePressureByZone).forEach((z) => out.push(['negative.' + z, cfg.wind.negativePressureByZone[z]]));
  return out;
}

test('P2L-S3A-01: 合成サンプルの値は契約どおり（id・label・寸法・topology・圧力・V0・粗度）', () => {
  assert.equal(Sample.projectId, SAMPLE_CONTRACT.projectId);
  assert.equal(Sample.hasFixedPreset, true);
  assert.equal(Sample.getPublicLabel(), SAMPLE_CONTRACT.publicLabel);
  assert.equal(globalThis.SyntheticSampleProjectConfig, Sample, 'global 名は SyntheticSampleProjectConfig');
  assert.deepEqual({ mode: Sample.dimensions.mode, W: Sample.dimensions.defaultW.value, H: Sample.dimensions.defaultH.value,
    status: Sample.dimensions.status }, SAMPLE_CONTRACT.dimensions);
  assert.deepEqual(Object.keys(Sample.wind.positivePressureByFloor).map((f) => [f, Sample.wind.positivePressureByFloor[f].value]),
    SAMPLE_CONTRACT.positive);
  assert.deepEqual(Object.keys(Sample.wind.negativePressureByZone).map((z) => [z, Sample.wind.negativePressureByZone[z].value]),
    SAMPLE_CONTRACT.negative);
  assert.equal(Sample.wind.V0.value, SAMPLE_CONTRACT.V0);
  assert.equal(Sample.wind.roughnessCategory.value, SAMPLE_CONTRACT.roughnessCategory);
  assert.equal(Sample.wind.status, SAMPLE_CONTRACT.windStatus);
  assert.equal(Sample.isFullyVerified(), false);
  // 読み込み後に書き換えられない
  assert.equal(Object.isFrozen(Sample.wind) && Object.isFrozen(Sample.dimensions) && Object.isFrozen(Sample.identity), true);
});

test('P2L-S3A-02: 合成サンプルの Evidence はすべて unverified / none / checkedAt null / private reference なし', () => {
  const entries = sampleEntries(Sample);
  assert.equal(entries.length, 11, '値 entry を取り出せていない');
  entries.forEach(([label, e]) => {
    assert.equal(e.verificationStatus, 'unverified', label);
    assert.deepEqual(e.evidence, { level: 'none', checkedAt: null, publicDescription: SYNTHETIC_DESCRIPTION,
      privateReferenceAvailable: false }, label);
    assert.equal(Evidence.canPromoteToVerified(e.evidence), false, label + ' が Promotion Gate を通る');
  });
  assert.deepEqual(Array.from(Sample.verifiedCases), [], 'verifiedCases は空');
  assert.deepEqual(Sample.validateAllEvidence(), []);
  // module 自身が実案件の識別子・source prose を持たない（private reference も持たない）
  const src = read('project-config/sample.js');
  assert.equal(/miyoshi|みよし|Miyoshi|projectName|sourceReference:\s*\{|privateReferenceAvailable:\s*true/.test(src), false);
});

/* ============================================================
   trust の意味（built_in_current ≠ verified）
============================================================ */

function walk(node, visit, at) {
  visit(node, at);
  if (node && typeof node === 'object') {
    Object.keys(node).forEach((k) => walk(node[k], visit, at + '.' + k));
  }
}

test('P2L-S3A-03: 合成サンプルの context は built_in_current だが、Promotion Gate を通る Evidence は 0', () => {
  const id = Registry.getRuntimeDefaultBuiltInPresetId();
  const ctx = ProjectContext.fromLegacyPreset(id);
  assert.equal(ctx.sourceKind, 'legacy_builtin');
  assert.equal(ctx.trust, 'built_in_current');
  assert.equal(ctx.publicLabel, SAMPLE_CONTRACT.publicLabel);
  const promotable = [];
  let evidenceNodes = 0;
  walk(JSON.parse(JSON.stringify(ctx)), (node, at) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (Object.prototype.hasOwnProperty.call(node, 'level') && Object.prototype.hasOwnProperty.call(node, 'checkedAt')) evidenceNodes++;
    if (Evidence.canPromoteToVerified(node)) promotable.push(at);
  }, 'context');
  assert.equal(evidenceNodes >= 11, true, 'Evidence を走査できていない: ' + evidenceNodes);
  assert.deepEqual(promotable, [], 'promotion-capable Evidence がある');
  const be = ctx.capabilities.builtInEvidence;
  assert.deepEqual(be.groupStatus, { wind: 'unverified', dimensions: 'unverified' });
  be.fields.forEach((f) => assert.equal(f.verificationStatus, 'unverified', f.fieldKey));
  be.pressureEvidence.positive.concat(be.pressureEvidence.negative).forEach((e) => {
    assert.equal(e.verificationStatus, 'unverified');
    assert.equal(e.evidence.level, 'none');
  });
  assert.deepEqual(Array.from(be.verifiedCases), []);
});

test('P2L-S3A-04: 計算 bridge は合成サンプルの全 8 ケースで registered_preset / unverified、designPressure = max(|正圧|, |負圧|)', () => {
  const id = Registry.getRuntimeDefaultBuiltInPresetId();
  const preset = Registry.getBuiltInPreset(id);
  let n = 0;
  SAMPLE_CONTRACT.positive.forEach(([floor, pos]) => SAMPLE_CONTRACT.negative.forEach(([zone, neg]) => {
    const pkg = ProjectInput.fromPreset(preset, { floorKey: floor, zoneKey: zone, widthMm: 900, heightMm: 1800, glassType: 'fl_single' });
    assert.equal(pkg.sourceKind, 'registered_preset');
    assert.equal(pkg.sourceId, SAMPLE_CONTRACT.projectId);
    assert.equal(pkg.provenance.verificationStatus, 'unverified');
    assert.equal(pkg.positivePressure, pos);
    assert.equal(pkg.negativePressure, neg);
    assert.equal(pkg.designPressure, Math.max(Math.abs(pos), Math.abs(neg)));
    n++;
  }));
  assert.equal(n, 8);
});

test('P2L-S3A-05: 合成サンプルの runtime Closure は BLOCKED 0/12 · 0/4 · 0/8、candidate なし', () => {
  const r = Closure.evaluateClosure(Registry.getRuntimeDefaultBuiltInPresetId(), []);
  assert.equal(r.status, 'BLOCKED');
  assert.deepEqual([r.readySlotCount, r.requiredSlotCount, r.readyCategoryCount, r.categoryCount,
    r.readyCaseScopeCount, r.caseScopeCount], [0, 12, 0, 4, 0, 8]);
  assert.equal(r.promotionCandidate, null);
});

/* ============================================================
   registry: runtime default は選択の方針（trust ではない）
============================================================ */

const DECLARATION_RE = /\{ projectId: '([^']+)', nodePath: '([^']+)', globalName: '([^']+)', runtimeDefault: (true|false) \}/g;
const declarations = () => [...REGISTRY_SRC.matchAll(DECLARATION_RE)]
  .map((m) => ({ projectId: m[1], nodePath: m[2], globalName: m[3], runtimeDefault: m[4] === 'true' }));

test('P2L-S3A-06: registry は runtimeDefault をちょうど 1 件宣言し、getter は宣言と捕まえた instance だけで決める', () => {
  const decl = declarations();
  const body = REGISTRY_SRC.match(/var BUILT_IN_PRESET_MODULES = \[\n([\s\S]*?)\n {2}\];/)[1];
  assert.equal(body.split('\n').length, decl.length, 'すべての宣言が runtimeDefault を明示している');
  assert.equal(decl.filter((d) => d.runtimeDefault).length, 1);
  const def = decl.filter((d) => d.runtimeDefault)[0];
  assert.deepEqual(def, { projectId: SAMPLE_CONTRACT.projectId, nodePath: './sample.js',
    globalName: 'SyntheticSampleProjectConfig', runtimeDefault: true });
  assert.equal(Registry.getRuntimeDefaultBuiltInPresetId(), def.projectId);
  assert.equal(Registry.getBuiltInPreset(def.projectId), Sample);
  // getter の実装: 宣言の件数を確かめ、捕まえた built-in だけを返す。id 一覧・先頭・getPreset を使わない
  const fn = REGISTRY_SRC.slice(REGISTRY_SRC.indexOf('function getRuntimeDefaultBuiltInPresetId('),
    REGISTRY_SRC.indexOf('// export object も凍結する'));
  assert.match(fn, /RUNTIME_DEFAULT_DECLARATIONS\.length !== 1/);
  assert.match(fn, /hasOwnProperty\.call\(builtInPresets, projectId\)/);
  assert.match(fn, /getBuiltInPreset\(projectId\);/);
  assert.equal(/BUILT_IN_PRESET_IDS|getPreset\(|\.filter\(|\[1\]|\|\|/.test(fn), false, 'getter に fallback がある');
  assert.match(REGISTRY_SRC, /var RUNTIME_DEFAULT_DECLARATIONS = Object\.freeze\(BUILT_IN_PRESET_MODULES\n\s*\.filter\(function \(e\) \{ return e\.runtimeDefault === true; \}\)/);
  // export は凍結されていて差し替えられない
  assert.throws(() => { Registry.getRuntimeDefaultBuiltInPresetId = () => 'x'; }, TypeError);
});

/** project-config の写しで registry の宣言を書き換え、子 process で評価する（module cache を汚さない）。 */
function registryVariant({ mods, extraModules = {}, remove = [], script }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3a-registry-'));
  try {
    const src = path.join(ROOT, 'project-config');
    fs.readdirSync(src).filter((f) => f.endsWith('.js')).forEach((f) => fs.copyFileSync(path.join(src, f), path.join(dir, f)));
    const decl = (m) => `{ projectId: '${m.projectId}', nodePath: '${m.nodePath}', globalName: '${m.globalName}', runtimeDefault: ${m.runtimeDefault} }`;
    const reg = path.join(dir, 'registry.js');
    const before = fs.readFileSync(reg, 'utf8');
    let found = false;
    const after = before.replace(/(var BUILT_IN_PRESET_MODULES = \[\n)([\s\S]*?)(\n {2}\];)/,
      (all, open, body, close) => { found = true; return open + mods.map((m) => '    ' + decl(m)).join(',\n') + close; });
    assert.equal(found, true, '宣言の位置を見つけられない');
    fs.writeFileSync(reg, after);
    Object.keys(extraModules).forEach((f) => fs.writeFileSync(path.join(dir, f), extraModules[f]));
    remove.forEach((f) => fs.rmSync(path.join(dir, f)));
    const env = Object.assign({}, process.env);
    delete env.NODE_TEST_CONTEXT; delete env.NODE_OPTIONS; delete env.NODE_V8_COVERAGE;
    const out = execFileSync(process.execPath, ['-e', script], { cwd: dir, env, encoding: 'utf8' });
    return JSON.parse(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const PROBE_SCRIPT = `
const R = require('./registry.js');
let def; try { def = R.getRuntimeDefaultBuiltInPresetId(); } catch (e) { def = 'ERR: ' + e.message; }
const captured = R.BUILT_IN_PRESET_IDS.filter((id) => { try { R.getBuiltInPreset(id); return true; } catch (e) { return false; } });
process.stdout.write(JSON.stringify({ def, ids: Array.from(R.BUILT_IN_PRESET_IDS), captured }));`;
const SECOND_MODULE = `module.exports = { projectId: 'synthetic-second', hasFixedPreset: true, getPublicLabel: function () { return 'Second'; },
  wind: { positivePressureByFloor: {}, negativePressureByZone: {} } };`;
const SECOND = { projectId: 'synthetic-second', nodePath: './second.js', globalName: 'SyntheticSecondConfig' };

test('P2L-S3A-07: runtime default の曖昧さ・欠損は fail closed、他の built-in へ fallback しない（A / B / C）', () => {
  const mods = declarations();
  // A: runtimeDefault 0 件
  const none = registryVariant({ mods: mods.map((m) => Object.assign({}, m, { runtimeDefault: false })), script: PROBE_SCRIPT });
  assert.match(none.def, /^ERR: .*exactly one built-in must be declared runtimeDefault \(found 0\)/);
  assert.equal(none.captured.length, mods.length, 'built-in は捕まえられている（fallback 先はある）');
  // B: runtimeDefault 2 件
  const two = registryVariant({ mods: mods.concat([Object.assign({}, SECOND, { runtimeDefault: true })]),
    extraModules: { 'second.js': SECOND_MODULE }, script: PROBE_SCRIPT });
  assert.match(two.def, /^ERR: .*exactly one built-in must be declared runtimeDefault \(found 2\)/);
  // C: runtime default の module が読み込めない（他の built-in は捕まえられている）
  const missing = registryVariant({ mods, remove: ['sample.js'], script: PROBE_SCRIPT });
  assert.match(missing.def, /^ERR: .*is not loaded in this environment/);
  assert.equal(missing.captured.length >= 1 && !missing.captured.includes(SAMPLE_CONTRACT.projectId), true,
    '別の built-in が捕まえられていても、それを選ばない');
});

test('P2L-S3A-08: 非 default built-in の追加・宣言の並び替え・後からの registerPreset() では runtime default は変わらない（D / E / F）', () => {
  const mods = declarations();
  // D: 非 default の built-in が追加で存在
  const extra = registryVariant({ mods: mods.concat([Object.assign({}, SECOND, { runtimeDefault: false })]),
    extraModules: { 'second.js': SECOND_MODULE }, script: PROBE_SCRIPT });
  assert.equal(extra.def, SAMPLE_CONTRACT.projectId);
  assert.equal(extra.captured.includes('synthetic-second'), true);
  // F: 宣言の並び替え（id 一覧の先頭が変わる）
  const reversed = registryVariant({ mods: mods.slice().reverse(), script: PROBE_SCRIPT });
  assert.equal(reversed.def, SAMPLE_CONTRACT.projectId);
  assert.notEqual(reversed.ids[0], Registry.BUILT_IN_PRESET_IDS[0], '並び替えが効いている');
  // E: runtime default の module が無い環境で、同じ id を名乗る config を後から登録しても default にならない
  const late = registryVariant({ mods, remove: ['sample.js'], script: `
const R = require('./registry.js');
const fake = { projectId: '${SAMPLE_CONTRACT.projectId}', hasFixedPreset: true, getPublicLabel: function () { return 'FAKE'; } };
let registered = false; try { R.registerPreset(fake); registered = true; } catch (e) {}
let def; try { def = R.getRuntimeDefaultBuiltInPresetId(); } catch (e) { def = 'ERR'; }
let builtIn; try { R.getBuiltInPreset('${SAMPLE_CONTRACT.projectId}'); builtIn = true; } catch (e) { builtIn = false; }
process.stdout.write(JSON.stringify({ registered, def, builtIn }));` });
  assert.deepEqual(late, { registered: true, def: 'ERR', builtIn: false });
  // E（この process）: 別 id の config を登録しても default は変わらない
  Registry.registerPreset({ projectId: 'synthetic-late-registration', hasFixedPreset: true, getPublicLabel: () => 'Late' });
  assert.equal(Registry.getRuntimeDefaultBuiltInPresetId(), SAMPLE_CONTRACT.projectId);
  assert.throws(() => Registry.getBuiltInPreset('synthetic-late-registration'), /not a repository built-in preset/);
});

/* ============================================================
   browser の読み込み境界・初期化
============================================================ */

test('P2L-S3A-09: index.html は合成サンプルだけを読み込み、runtime default でだけ選ぶ', () => {
  const at = (src) => HTML.indexOf('<script src="' + src + '"></script>');
  assert.notEqual(at('project-config/sample.js'), -1, 'sample.js を読み込んでいない');
  assert.equal(at('project-config/evidence.js') < at('project-config/sample.js'), true, 'sample.js は evidence.js の後');
  assert.equal(at('project-config/sample.js') < at('project-config/registry.js'), true, 'sample.js は registry.js の前');
  // runtimeDefault でない宣言の module は読み込まない（以前の案件 module を含む）
  declarations().filter((d) => !d.runtimeDefault).forEach((d) => {
    assert.equal(HTML.includes(path.basename(d.nodePath)), false, d.nodePath + ' を読み込んでいる');
    assert.equal(HTML.includes(d.globalName), false, d.globalName + ' を参照している');
  });
  // runtime の選択は registry の runtime default だけ（id 一覧・件数・先頭・id literal を使わない）
  assert.match(CODE, /ProjectContext\.fromLegacyPreset\(PresetRegistry\.getRuntimeDefaultBuiltInPresetId\(\)\)/);
  assert.equal(/BUILT_IN_PRESET_IDS/.test(CODE), false, '実行コードが id 一覧を使っている');
  assert.equal(HTML.includes(SAMPLE_CONTRACT.projectId), false, 'runtime sample の id を hard-code している');
  // S3-B1: Project Pack は staged preview の intake でだけ扱い、runtime default の選択には関わらない
  // （intake の境界は tests/s3b1-project-pack-intake.test.js）
  const initStart = CODE.indexOf('function initActiveProjectContext(');
  const init = CODE.slice(initStart, CODE.indexOf('\nfunction ', initStart + 1));
  assert.equal(/ProjectPack|fromProjectPack|staged/.test(init), false, 'runtime default の選択に Project Pack が関わっている');
  assert.equal((CODE.match(/ProjectPack\.validateProjectPack\(/g) || []).length, 1, 'Project Pack の読込経路が 1 つでない');
  const markup = STATIC.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<section class="pack-wrap"[\s\S]*?<\/section>/, '');
  assert.equal(/type="file"|\sondrop=|\sondragover=/.test(markup), false, 'Project Pack 欄の外に読込 UI がある');
});

/* ============================================================
   告示モードの初期値（S3-A で合成値へ切り替え）
============================================================ */

const NOTIFICATION_DEFAULTS = Object.freeze({ V0: '30', roughness: 'II', buildingHeight: '12.0', eavesHeight: '12.0', Z: '9.0' });

test('P2L-S3A-10: 告示モードの初期値は合成値（以前の案件 preset の V0 / 粗度と一致しない）', () => {
  const value = (id) => (STATIC.match(new RegExp('<input type="number" id="' + id + '" value="([^"]*)"')) || [])[1];
  const selected = [...STATIC.match(/<select id="inp-wind-roughness">([\s\S]*?)<\/select>/)[1]
    .matchAll(/<option value="([^"]+)" selected>/g)].map((m) => m[1]);
  assert.deepEqual({ V0: value('inp-wind-v0'), roughness: selected.join(','), buildingHeight: value('inp-wind-building-h'),
    eavesHeight: value('inp-wind-eaves-h'), Z: value('inp-wind-z') }, NOTIFICATION_DEFAULTS);
  // 以前の案件 preset（legacy validation 用）の V0・粗度を初期値にしない（module から読む）
  declarations().filter((d) => !d.runtimeDefault).forEach((d) => {
    const legacy = Registry.getBuiltInPreset(d.projectId);
    assert.notEqual(Number(NOTIFICATION_DEFAULTS.V0), legacy.wind.V0.value);
    assert.notEqual(NOTIFICATION_DEFAULTS.roughness, legacy.wind.roughnessCategory.value);
  });
  // 告示モードの計算契約（buildWindInputFromUI が読む欄）は変えていない
  const fn = CODE.slice(CODE.indexOf('function buildWindInputFromUI'), CODE.indexOf('\n}', CODE.indexOf('function buildWindInputFromUI')));
  ['inp-wind-v0', 'inp-wind-roughness', 'inp-wind-building-h', 'inp-wind-eaves-h', 'inp-wind-z'].forEach((id) =>
    assert.equal(fn.includes(id), true, id));
});

/* ============================================================
   project-state-probe と browser harness
============================================================ */

test('P2L-S3A-11: probe は runtime default を index.html と同じ経路で読み、wind fixture は runtime preset から独立', () => {
  const src = read('tools/verification/project-state-probe.mjs');
  const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/miyoshi/i.test(src), false, 'probe が以前の案件 module / id を名指ししている');
  assert.equal(/BUILT_IN_PRESET_IDS/.test(code), false);
  assert.match(code, /const runtimeId = Registry\.getRuntimeDefaultBuiltInPresetId\(\);/);
  assert.match(code, /ProjectContext\.fromLegacyPreset\(runtimeId\)/);
  assert.match(code, /Closure\.evaluateClosure\(context\.origin\.registryProjectId, \[\]\)/);
  // Er / qBar は WIND_FIXTURE の入力だけから求める
  assert.match(code, /const WIND_FIXTURE = Object\.freeze\(\{\n\s*meanHeightM: 14\.2, recurrenceFactor: 1\.00, V0: 34, roughnessCategory: 'III'\n\}\);/);
  assert.match(code, /Wind\.ROUGHNESS_PARAMETERS\[WIND_FIXTURE\.roughnessCategory\]/);
  assert.match(code, /Wind\.calcMeanVelocityPressure\(er\.Er, WIND_FIXTURE\.V0, WIND_FIXTURE\.recurrenceFactor\)/);
});

test('P2L-S3A-12: browser harness は id 一覧の位置を runtime として扱わない', () => {
  const dir = 'tools/browser-checks';
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.mjs')).forEach((f) => {
    const src = read(path.join(dir, f));
    assert.equal(/(getBuiltInPreset|fromLegacyPreset)\(\s*Registry\.BUILT_IN_PRESET_IDS\[/.test(src), false, f);
    assert.equal(/(REAL_ID|BUILT_IN|runtimeId)\s*=\s*Registry\.BUILT_IN_PRESET_IDS\[/.test(src), false, f);
  });
  ['browser-w4.mjs', 'stageA-regression.mjs'].forEach((f) =>
    assert.match(read(path.join(dir, f)), /Registry\.getBuiltInPreset\(Registry\.getRuntimeDefaultBuiltInPresetId\(\)\)/, f));
  const cr = read(path.join(dir, 'context-runtime.mjs'));
  assert.match(cr, /const REAL_ID = Registry\.getRuntimeDefaultBuiltInPresetId\(\);/);
  ['missing', 'duplicate', 'extra', 'reordered', 'decoy', 'syn', 'fail'].forEach((s) =>
    assert.match(cr, new RegExp("await scenario\\('" + s + "'"), 'context-runtime scenario ' + s));
});

/* ============================================================
   legacy validation（runtime とは別）
============================================================ */

test('P2L-S3A-13: 以前の案件 preset と Phase 2L-A intake は LEGACY VALIDATION ONLY として残る', () => {
  const legacy = declarations().filter((d) => !d.runtimeDefault);
  assert.equal(legacy.length, 1);
  const id = legacy[0].projectId;
  assert.equal(fs.existsSync(path.join(ROOT, 'project-config', path.basename(legacy[0].nodePath))), true);
  const Intake = require('../project-config/miyoshi-observations.js');
  assert.equal(Intake.projectId, id, 'intake は legacy preset のもの');
  assert.notEqual(id, Registry.getRuntimeDefaultBuiltInPresetId(), 'legacy preset は runtime default ではない');
  const empty = Closure.evaluateClosure(id, []);
  const intake = Closure.evaluateClosure(id, Intake.observations);
  assert.deepEqual([empty.readySlotCount, empty.requiredSlotCount, empty.readyCategoryCount, empty.categoryCount,
    empty.readyCaseScopeCount, empty.caseScopeCount], [0, 12, 0, 4, 0, 8]);
  assert.deepEqual([intake.readySlotCount, intake.requiredSlotCount, intake.readyCategoryCount, intake.categoryCount,
    intake.readyCaseScopeCount, intake.caseScopeCount], [10, 12, 3, 4, 0, 8]);
  assert.equal(intake.promotionCandidate, null);
  assert.deepEqual(Array.from(Registry.getBuiltInPreset(id).verifiedCases), []);
  // 構造的な分離: runtime の context と legacy の context は別物（値は書き写さない）
  const runtimeCtx = ProjectContext.fromLegacyPreset(Registry.getRuntimeDefaultBuiltInPresetId());
  const legacyCtx = ProjectContext.fromLegacyPreset(id);
  assert.notEqual(Registry.getBuiltInPreset(id), Sample);
  assert.notEqual(legacyCtx.publicLabel, runtimeCtx.publicLabel);
  assert.notDeepEqual(legacyCtx.capabilities.projectPressureMap, runtimeCtx.capabilities.projectPressureMap);
  assert.notDeepEqual(legacyCtx.capabilities.sampleDefaultDimensions, runtimeCtx.capabilities.sampleDefaultDimensions);
});

/* ============================================================
   RF-20-01 / RF-20-02
============================================================ */

/** CODE の中で、needle から end（を含む）までを返す。 */
function sliceFrom(code, needle, end) {
  const at = code.indexOf(needle);
  assert.notEqual(at, -1, needle + ' が無い');
  const stop = code.indexOf(end, at);
  assert.notEqual(stop, -1, end + ' が無い');
  return code.slice(at, stop + end.length);
}

test('P2L-S3A-14: preset の文言は built-in の出どころを前提にしない（案件資料が背後にあると読ませない）', () => {
  // 旧文言（実案件の一次資料・構造計算書が背後にある前提）は index.html のどこにも無い
  ['元の構造計算書', '案件一次資料によるEvidenceが未取得', '原典照合'].forEach((old) =>
    assert.equal(HTML.includes(old), false, '旧文言が残っている: ' + old));
  // 0 件の verified case: 登録が無いことだけを述べる
  const verified = CODE.slice(CODE.indexOf('function renderVerifiedCaseSelector('),
    CODE.indexOf('\n}', CODE.indexOf('function renderVerifiedCaseSelector(')));
  assert.match(verified, /'Verified Case は現在 0 件です。このプリセットには verifiedCases が登録されていないため、' \+\n\s*'case selectorは表示しません。<\/div>'/);
  // 風圧 preset の警告: 検証状況だけを述べ、採用時の確認を促す
  const warning = sliceFrom(CODE, 'const windStatusWarningHtml', "` : '';");
  assert.match(warning, /⚠ 設計風圧プリセット — 未検証<br>このプリセットの正圧・負圧は verificationStatus: \$\{windStatus\} です。実案件に使用する場合は、採用する入力条件と根拠を別途確認してください。/);
  assert.match(warning, /\(mode === 'preset' && windStatus !== 'verified'\)/);
  // 特定の built-in 向けの分岐を作らない・強い検証表現を作らない
  [verified, warning].forEach((src) => {
    assert.equal(/synthetic|合成|sample|registryProjectId|publicLabel|sourceKind|projectId/i.test(src), false, '特定の built-in 向けの分岐がある');
    assert.equal(/確認済|検証済|一次資料|構造計算書/.test(src), false, '出どころ・検証を前提にした表現がある');
  });
});

test('P2L-S3A-15: verification-spec は runtimeDefault の曖昧さを述べ、built-in の件数の曖昧さを述べない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const a = spec.browserAssertions.find((x) => x.id === 'preset-ui-from-project-context');
  assert.ok(a, 'preset-ui-from-project-context が無い');
  // 件数モデル（built-in が 2 件なら失敗 / ちょうど 1 件の built-in）を書かない
  assert.equal(/two built-ins|2 built-ins|built-ins exist|exactly one built-in(?! must)|first-entry choice/i.test(a.statement), false,
    'built-in の件数で失敗するという古いモデル: ' + a.statement);
  // runtimeDefault のモデル
  ['Several built-ins may coexist', 'exactly one runtimeDefault declaration', 'Zero or duplicate runtimeDefault declarations',
    'a missing runtime-default module', 'fail closed', 'extra non-default built-in', 'declaration order does not change the selection']
    .forEach((phrase) => assert.equal(a.statement.includes(phrase), true, 'runtimeDefault のモデルが無い: ' + phrase));
  // knownNonGoals: S3-A は公開 runtime の preset を意図して変えるので、一般的な「preset change」は non-goal ではない
  assert.equal(spec.knownNonGoals.some((g) => /(^|, )preset change($|,)/.test(g)), false, '古い non-goal「preset change」が残っている');
  assert.equal(spec.knownNonGoals.some((g) => /legacy preset mutation/.test(g)), true);
});
