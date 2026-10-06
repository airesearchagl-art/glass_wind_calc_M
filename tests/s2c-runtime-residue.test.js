'use strict';

/**
 * Phase 2L-B2 / S2-C: S2-B の後に残った「旧案件を前提にした UI / runtime residue」の静的 guard。
 *
 *   - UI input mode token は generic な 'preset' 1 種類（ProjectContext / ProjectInput の
 *     sourceKind とは別物で、そちらは変えない）
 *   - 階の初期選択は context の先頭（UI 固有の既定階を持たない）
 *   - 案件ラベルは publicLabel だけを表示し、projectId を併記しない
 *   - 案件名・旧案件の階表記・built-in の寸法を index.html に持たない
 *   - Batch / Scenario の見本値は明示した合成値の契約（P2L-S2C-12）。自動で照合できるのは committed な
 *     built-in 値と Phase 2L-A の公開 intake subset だけで、非公開の一次資料全体との非衝突は
 *     証明しない（review 時の手動境界。その値の一覧を repository に置かない）
 *   - browser harness は案件 module の global を読まず、active ProjectContext を観察する。
 *     期待値は page ではなく Node 側（built-in instance と手書きの evidenceStateExpected）から取る
 *
 * 実ブラウザでの挙動（合成 built-in で先頭階が初期選択になること等）は
 * tools/browser-checks/context-runtime.mjs が確かめる。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Registry = require('../project-config/registry.js');
const ProjectContext = require('../project-config/project-context.js');
const ProjectInput = require('../project-config/project-input.js');
const Intake = require('../project-config/miyoshi-observations.js');
const Workspace = require('../workspace.js');
const Profile = require('../project-profile.js');

const { inlineScripts, stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const STATIC = HTML.split('<script')[0];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** inline <script> の実行コード（コメントを除き、文字列は残す）。 */
const CODE = stripComments(inlineScripts(HTML));

/** top-level の `function name(` から、行頭の `}` までを返す（ここで見る関数は行頭 `}` で閉じる）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が無い');
  const end = CODE.indexOf('\n}', start + 1);
  return CODE.slice(start + 1, end + 2);
}

const MODE_TOKENS = ['preset', 'manual', 'notification', 'imported'];

/* ============================================================
   UI input mode token
============================================================ */

test('P2L-S2C-01: UI input mode token は generic な preset 1 種類で、旧 token は 0', () => {
  // 旧 token（一時的な runtime token）は index.html のどこにも無い
  assert.equal(/value="miyoshi"|mode-field-miyoshi|mode === 'miyoshi'|'miyoshi'/.test(HTML), false, '旧 mode token が残っている');
  // 選択肢は 4 mode で、既定は preset
  const options = [...STATIC.match(/<select id="inp-mode">([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options, MODE_TOKENS);
  assert.match(STATIC, /<option value="preset" selected>案件プリセット<\/option>/);
  // 表示切替 class は 4 mode に対応する（itakyo は告示モード内の basis 用の下位 class で、入力 mode ではない）
  const classes = new Set([...HTML.matchAll(/mode-field-([a-z]+)/g)].map((m) => m[1]));
  assert.deepEqual([...classes].filter((c) => !MODE_TOKENS.includes(c)), ['itakyo']);
  MODE_TOKENS.forEach((t) => assert.equal(classes.has(t), true, 'mode-field-' + t + ' が無い'));
  const vis = fnBody('applyModeVisibility');
  assert.match(vis, /querySelectorAll\('\.mode-field-preset'\)[\s\S]*?mode === 'preset'/);
  // 入力 mode の比較はすべて 4 token のどれか（reportSelectDetails の mode は report 選択の別語彙）
  const inputModeCode = CODE.replace(fnBody('reportSelectDetails'), '');
  const compared = new Set([...inputModeCode.matchAll(/(?<![.\w])mode\s*[!=]==\s*'([^']+)'/g)].map((m) => m[1]));
  assert.equal([...compared].every((t) => MODE_TOKENS.includes(t)), true, 'mode 比較に未知の token: ' + [...compared]);
  assert.equal(compared.has('preset'), true);
});

test('P2L-S2C-02: mode token の変更は ProjectContext / ProjectInput の sourceKind を変えない', () => {
  const id = Registry.BUILT_IN_PRESET_IDS[0];
  const ctx = ProjectContext.fromLegacyPreset(id);
  assert.equal(ctx.sourceKind, 'legacy_builtin');
  assert.deepEqual(Array.from(ProjectContext.SOURCE_KINDS).sort(), ['legacy_builtin', 'project_pack_unreviewed']);
  const floor = ctx.capabilities.projectPressureMap.positivePressures[0].floor;
  const zone = ctx.capabilities.projectPressureMap.negativePressures[0].zone;
  const pkg = ProjectInput.fromPreset(Registry.getBuiltInPreset(id),
    { floorKey: floor, zoneKey: zone, widthMm: 900, heightMm: 1800, glassType: 'fl_single' });
  assert.equal(pkg.sourceKind, 'registered_preset');
  // UI token を data の sourceKind として使わない
  assert.equal(/sourceKind\s*[!=]==\s*'preset'|sourceKind:\s*'preset'/.test(CODE), false);
});

/* ============================================================
   初期階
============================================================ */

test('P2L-S2C-03: 階の初期選択は context の先頭（UI 固有の既定階を持たない）', () => {
  assert.equal(HTML.includes('data-initial-value'), false, 'data-initial-value が残っている');
  assert.match(STATIC, /<select id="inp-floor"><\/select>/, 'inp-floor に属性・選択肢がある');
  const fill = fnBody('fillContextSelect');
  assert.match(fill, /select\.value = values\[0\];\n\}$/, '先頭以外を初期選択している');
  assert.equal(/getAttribute|dataset|indexOf\(/.test(fill), false, 'UI 側の既定値を参照している');
  assert.equal((CODE.match(/fillContextSelect\(/g) || []).length, 3, 'fillContextSelect の呼び出しが増減した');
  // 初期階を ProjectContext へ移していない（UI hint の capability を新設しない）
  const src = read('project-config/project-context.js');
  assert.equal(/initialFloor|initial_floor|uiHint|ui_hint/i.test(src), false, 'ProjectContext に UI 既定が入った');
  assert.deepEqual(Array.from(ProjectContext.ALLOWED_CAPABILITIES.legacy_builtin),
    ['projectPressureMap', 'sampleDefaultDimensions', 'builtInEvidence']);
});

/* ============================================================
   表示文言
============================================================ */

test('P2L-S2C-04: 案件ラベルは publicLabel だけで、projectId を人間向け表示に併記しない', () => {
  const apply = fnBody('applyActiveProjectContextToUI');
  assert.match(apply, /if \(nameLabel\) nameLabel\.textContent = ctx\.publicLabel;/);
  assert.equal(/nameLabel\.textContent = ctx\.publicLabel \+/.test(apply), false);
  // projectId は内部 origin として bridge と Closure の 2 か所でだけ読む
  assert.equal((CODE.match(/registryProjectId/g) || []).length, 2);
  assert.equal((CODE.match(/\.origin\.registryProjectId/g) || []).length, 2);
  // 表示文言（文字列 literal）に projectId を書かない
  const literals = [...CODE.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
  assert.equal(literals.length > 500, true, '文字列 literal を取り出せていない');
  assert.deepEqual(literals.filter((l) => /projectId/i.test(l)), [], '表示文言に projectId がある');
});

test('P2L-S2C-05: index.html に案件名を持たない（script path 以外に案件 id も無い）', () => {
  assert.equal(/みよし|Miyoshi|三好|MIYOSHI/.test(HTML), false, 'index.html に案件名がある');
  const lower = [...HTML.matchAll(/[^\n]*miyoshi[^\n]*/g)].map((m) => m[0].trim());
  assert.deepEqual(lower, ['<script src="project-config/miyoshi.js"></script>'], 'script path 以外に案件 id がある');
});

test('P2L-S2C-06: 告示モードの説明は generic な階識別子で例示する（評価高さの自動生成はしない）', () => {
  assert.match(STATIC, /<strong>階識別子（例: 1 \/ B1 \/ R \/ PH）から Z を自動生成しません。<\/strong>/);
  // 旧案件の階表記（1F / 2F / 3F / RF）を説明に使わない。RF-P1 等の修正番号や自由記述ラベルの例は対象外
  const floorish = /(^|[^0-9A-Za-z])[123]F([^0-9A-Za-z-]|$)|(^|[^A-Za-z])RF([^A-Za-z0-9-]|$)/;
  assert.equal(floorish.test(STATIC.replace(/placeholder="例: 北面 2F A"/, '')), false, '旧案件由来の階表記がある');
  assert.equal(floorish.test('階（1F / 2F / 3F / RF）'), true, '検出 pattern が旧表記を捉えない');
});

/* ============================================================
   見本値
============================================================ */

/**
 * repository に commit されている案件の数値: built-in preset の値と、Phase 2L-A で取り込んだ公開 intake
 * subset（Intake.observations）。module から読む。
 *
 * これは一次資料の全数ではない。Phase 2L-A は pane の実寸 W/H などを意図的に intake していないので、
 * ここに無い一次資料の値は照合できない。非公開の一次資料との非衝突は review 時の手動確認であり、
 * test を完全にするためにその値の一覧を公開 repository に書き込むことはしない。
 */
function committedProjectNumbers() {
  const id = Registry.BUILT_IN_PRESET_IDS[0];
  const ctx = ProjectContext.fromLegacyPreset(id);
  const cap = ctx.capabilities;
  const nums = new Set();
  cap.projectPressureMap.positivePressures.forEach((r) => nums.add(r.pressure.value));
  cap.projectPressureMap.negativePressures.forEach((r) => nums.add(r.magnitude.value));
  nums.add(cap.sampleDefaultDimensions.widthMm.value);
  nums.add(cap.sampleDefaultDimensions.heightMm.value);
  cap.builtInEvidence.fields.filter((f) => typeof f.value === 'number').forEach((f) => nums.add(f.value));
  Intake.observations.forEach((o) => nums.add(o.observedValue));
  return nums;
}
function builtInRoughness() {
  const ctx = ProjectContext.fromLegacyPreset(Registry.BUILT_IN_PRESET_IDS[0]);
  return ctx.capabilities.builtInEvidence.fields.find((f) => f.fieldKey === 'wind.roughnessCategory').value;
}
function templateLiterals(fn) {
  return [...fnBody(fn).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\t/g, '\t').replace(/\\n/g, '\n'));
}
/** Scenario TSV の列見本（header 行 + 見本行）。 */
function scenarioTemplate() {
  return templateLiterals('insertScenarioTsvTemplate').filter((t) => /^(scenario_id|S1)\t/.test(t)).join('');
}
const SAMPLE_PLACEHOLDER_IDS = ['sc-w', 'sc-h', 'sc-z', 'gen-w', 'gen-h', 'gen-z', 'prof-v0', 'prof-building-h', 'prof-eaves-h'];
function placeholder(id) {
  const m = STATIC.match(new RegExp('id="' + id + '"[^>]*placeholder="([^"]*)"'));
  assert.ok(m, id + ' の placeholder が無い');
  return m[1];
}

test('P2L-S2C-07: index.html に built-in の寸法 1250 / 2050 が無い（見本・placeholder・コメントを含む）', () => {
  assert.equal(/1250|2050/.test(HTML), false, 'index.html に 1250 / 2050 がある');
});

test('P2L-S2C-08: 見本値は committed な built-in 値・公開 intake subset と一致しない（非公開一次資料全体との非衝突は証明しない）', () => {
  const project = committedProjectNumbers();
  assert.equal(project.size > 10, true, '照合先を取り出せていない');
  const scenario = scenarioTemplate();
  assert.equal(scenario.split('\n').length, 2, 'Scenario の列見本を取り出せていない');
  const batch = templateLiterals('batchInsertTsvTemplate').join('\n');
  const sampleRows = [scenario.split('\n')[1]].concat(batch.split('\n').filter((l) => /^Sample-001\t/.test(l)));
  assert.equal(sampleRows.length, 3, '見本行（scenario 1 + batch notification / manual）を取り出せていない');
  const numbers = sampleRows.join('\t').split('\t').concat(SAMPLE_PLACEHOLDER_IDS.flatMap((id) =>
    placeholder(id).replace(/^例:\s*/, '').split(/,\s*/)))
    .filter((t) => /^-?\d+(\.\d+)?$/.test(t)).map(Number);
  assert.equal(numbers.length >= 20, true, '数値を取り出せていない: ' + numbers.length);
  const hits = numbers.filter((n) => n !== 1 && project.has(Math.abs(n)));
  assert.deepEqual(hits, [], '見本値が committed な案件の値（built-in / 公開 intake subset）と一致している');
  // 粗度区分の見本も built-in と同じ値にしない
  const notif = sampleRows.find((r) => r.includes('\tnotification\t')).split('\t');
  assert.notEqual(notif[8], builtInRoughness());
  // 見本であって真値ではないことを UI が述べる
  [fnBody('insertScenarioTsvTemplate'), fnBody('batchInsertTsvTemplate')].forEach((body) =>
    assert.match(body, /数値は合成した入力例で、特定案件の値ではありません/));
  assert.equal((STATIC.match(/入力欄の薄い数値は合成した入力例で、特定案件の値ではありません。/g) || []).length, 2);
});

test('P2L-S2C-09: 見本値は既存の計算契約のまま通る（TSV parser / ProjectInput を変えていない）', () => {
  const batch = templateLiterals('batchInsertTsvTemplate');
  const header = (mode) => batch.find((t) => t.startsWith('case_id\t') && (mode === 'notification') === t.includes('\tv0\t'));
  const row = (mode) => batch.find((t) => t.startsWith('Sample-001\t\t' + mode + '\t'));
  ['notification', 'manual'].forEach((mode) => {
    const ws = Workspace.createWorkspace();
    const added = Workspace.addTsvRows(ws, Workspace.parseTsv(header(mode) + '\n' + row(mode)));
    assert.deepEqual(added.errors, [], mode + ' の見本が通らない');
    const results = Workspace.evaluateWorkspace(ws);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'OK', mode + ' の見本が計算できない');
  });
  const parsed = Profile.parseScenarioTsv(scenarioTemplate());
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 1);
});

/**
 * 合成見本の契約（RF-19-01）。どの合成値を使うかを明示して固定する。
 *
 * これは禁止値の一覧（denylist）ではない。値を変えると、変えたこと自体でここが落ちる。
 * 値を変えるのは意図した変更であり、そのときは新しい値が非公開の一次資料に現れないことを
 * review 時に手動で確かめる（P2L-S2C-08 は commit 済みの値としか照合できないため）。
 * gen-z と sc-label は S2-C で変えていない既存の見本なので、この契約に含めない。
 */
const SYNTHETIC_SAMPLE_CONTRACT = Object.freeze({
  placeholders: Object.freeze({
    'sc-w': '900', 'sc-h': '1800', 'sc-z': '9.0',
    'gen-w': '900, 1350', 'gen-h': '1800',
    'prof-v0': '例: 30', 'prof-building-h': '例: 12.0', 'prof-eaves-h': '例: 12.0'
  }),
  scenarioRow: 'S1\t\t900\t1800\t9.0\tgeneral\tfl_single\t1.00',
  batchRows: Object.freeze([
    'Sample-001\t\tnotification\t900\t1800\tfl_single\t1.00\t30\tII\t12.0\t12.0\t9.0\tclosed\tgeneral\tnotification_baseline',
    'Sample-001\t\tmanual\t900\t1800\tfl_single\t1.00\t1500\t-900'
  ])
});

test('P2L-S2C-12: 合成見本は明示した契約の値そのもの（変えるなら契約と review を伴う）', () => {
  Object.keys(SYNTHETIC_SAMPLE_CONTRACT.placeholders).forEach((id) =>
    assert.equal(placeholder(id), SYNTHETIC_SAMPLE_CONTRACT.placeholders[id], id + ' の合成見本が契約と違う'));
  assert.equal(scenarioTemplate().split('\n')[1], SYNTHETIC_SAMPLE_CONTRACT.scenarioRow, 'Scenario TSV の合成見本が契約と違う');
  const batchRows = templateLiterals('batchInsertTsvTemplate').filter((t) => /^Sample-001\t/.test(t));
  assert.deepEqual(batchRows, Array.from(SYNTHETIC_SAMPLE_CONTRACT.batchRows), 'Batch TSV の合成見本が契約と違う');
});

/* ============================================================
   browser harness の観察経路
============================================================ */

const HARNESS_DIR = 'tools/browser-checks';
const harnessFiles = () => fs.readdirSync(path.join(ROOT, HARNESS_DIR)).filter((f) => f.endsWith('.mjs'));

test('P2L-S2C-10: browser harness は案件 module の global も旧 mode token も読まない', () => {
  const files = harnessFiles();
  assert.equal(files.includes('browser-w4.mjs') && files.includes('stageA-regression.mjs') && files.includes('context-runtime.mjs'), true);
  files.forEach((f) => {
    const src = read(path.join(HARNESS_DIR, f));
    assert.equal(/MiyoshiProjectConfig/.test(src), false, f + ' が案件 module の global を読む');
    assert.equal(/mode-field-miyoshi|value="miyoshi"|setMode\('miyoshi'\)|=== 'miyoshi'|value = 'miyoshi'/.test(src), false,
      f + ' が旧 mode token を使う');
  });
});

test('P2L-S2C-11: browser-w4 / stageA-regression は active ProjectContext を観察し、期待値を page の外から取る', () => {
  [['browser-w4.mjs', 'B-facts', 'sameFacts'], ['stageA-regression.mjs', 'A-facts', 'same']].forEach(([f, id, eq]) => {
    const src = read(path.join(HARNESS_DIR, f));
    // 期待値: Node 側の built-in instance と、tree から読まない手書きの evidenceStateExpected
    assert.match(src, /Registry\.getBuiltInPreset\(Registry\.BUILT_IN_PRESET_IDS\[0\]\)/, f);
    assert.match(src, /\.evidenceStateExpected;/, f);
    const nodeAt = src.indexOf('const NODE_FACTS');
    const specAt = src.indexOf('const SPEC_FACTS');
    const pageAt = src.indexOf('page.evaluate(');
    assert.equal(nodeAt > -1 && specAt > -1 && nodeAt < pageAt && specAt < pageAt, true, f + ': 期待値が page より前に Node 側で決まっていない');
    // page 側は runtime と同じ active ProjectContext から capability 経由で読む
    assert.match(src, /ProjectContext\.requireCapability\((ctx|activeProjectContext), 'builtInEvidence'\)/, f);
    assert.match(src, /ProjectContext\.requireCapability\((ctx|activeProjectContext), 'sampleDefaultDimensions'\)/, f);
    // 判定は page == Node かつ Node == spec（literal の写しや page 同士の比較ではない）
    const line = src.split('\n').find((l) => l.includes("'" + id + "'"));
    assert.ok(line, f + ' に ' + id + ' が無い');
    assert.equal(line.includes(eq + '(facts, NODE_FACTS) && ' + eq + '(NODE_FACTS, SPEC_FACTS)'), true, f + ': ' + line.trim());
    assert.equal(/1250|2050|=== 34|'III'/.test(line), false, f + ': 期待値を literal で持っている');
  });
  const stage = read(path.join(HARNESS_DIR, 'stageA-regression.mjs'));
  assert.match(stage, /EvidenceClosure\.evaluateClosure\(activeProjectContext\.origin\.registryProjectId, \[\]\)/);
  assert.match(stage, /before !== null && JSON\.stringify\(before\)===JSON\.stringify\(after\)/, 'context が無いと空虚に一致する');
});
