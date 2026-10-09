'use strict';

/**
 * Phase 2L-B2 / S3-B2: index.html の Project Pack ケース計算（明示操作・1 ケース・未レビュー）。
 *
 *   - 計算は「選択ケースを計算（未レビュー）」を押したときだけ。Pack を読み込んだだけでは計算しない
 *   - executor へ渡すのは stagedProjectPackContext だけ（生の Pack を渡さない）
 *   - 結果はこの欄の中だけ。active context・案件プリセット・入力欄・通常の計算・入力 package・
 *     一括検討・Closure・Evidence へは流さない
 *   - 新しい Pack の読込開始・読込失敗・解除・選択変更・計算失敗で結果を消す
 *   - 計算失敗は固定文で、Pack は staged のまま（取り込みの失敗とは違う）
 *
 * 前半は実行コードの静的な検査、後半は index.html の intake + ケース計算 block を vm で
 * 動かす挙動の検査（最小の偽 DOM と実際の ProjectPack / ProjectContext / ProjectPackExecution）。
 * 実ブラウザでの挙動は tools/browser-checks/project-pack-execution.mjs が確かめる。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Pack = require('../project-config/project-pack.js');
const ProjectContext = require('../project-config/project-context.js');
const ProjectInput = require('../project-config/project-input.js');
const Exec = require('../project-config/project-pack-execution.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);

const FIXTURE = (name) => read('tests/fixtures/project-pack/' + name + '.json');
const FIXTURES = { notification1458: FIXTURE('synthetic-notification1458'),
  project_pressure_map: FIXTURE('synthetic-project-pressure-map'), case_direct: FIXTURE('synthetic-case-direct') };
const FAILURE_TEXT = '選択ケースを計算できませんでした。未レビューPackの計算結果は現在ありません。';
const STRONG_WORDING = /Verified|承認|確定|安全|問題なし|計算可能|公開可能|確認済|\bsafe\b|\bapproved\b/i;

function fnBody(name) {
  const start = CODE.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const next = CODE.indexOf('\nfunction ', start + 1);
  return CODE.slice(start, next === -1 ? CODE.length : next);
}

/** ケース計算 block（実行コード）。intake の preview 関数の直後から結果表示の関数の終わりまで。 */
function execCode() {
  const start = CODE.indexOf('\nfunction ', CODE.indexOf('function renderProjectPackPreview(') + 1);
  const end = CODE.indexOf('\nfunction ', CODE.indexOf('function renderProjectPackExecutionResult(') + 1);
  assert.equal(start !== -1 && end > start, true, 'ケース計算 block が無い');
  // block 冒頭の state 宣言（preview 関数の後ろ・最初の関数の前）も含める
  const varStart = CODE.lastIndexOf('var stagedProjectPackExecution', start);
  return CODE.slice(varStart, end);
}

const EXEC_FUNCTIONS = ['renderProjectPackExecutionStatus', 'clearProjectPackExecution',
  'renderProjectPackExecutionControls', 'projectPackExecutionCaseChanged', 'executeSelectedProjectPackCase',
  'packPressureText', 'packZoneText', 'renderProjectPackExecutionResult'];

/* ============================================================
   静的
============================================================ */

test('P2L-S3B2-U01: executor は calc.js・wind-pressure.js・project-context.js の後に読み込む', () => {
  const at = (src) => HTML.indexOf('<script src="' + src + '"></script>');
  ['calc.js', 'wind-pressure.js', 'project-config/evidence.js', 'project-config/project-context.js'].forEach((dep) =>
    assert.equal(at(dep) !== -1 && at(dep) < at('project-config/project-pack-execution.js'), true, dep));
  EXEC_FUNCTIONS.forEach((name) => assert.match(execCode(), new RegExp('\\nfunction ' + name + '\\('), name));
});

test('P2L-S3B2-U02: 計算は明示操作だけ（読込・preview・選択肢の作成では計算しない）', () => {
  assert.equal((CODE.match(/ProjectPackExecution\.executeCase\(/g) || []).length, 1, 'executeCase の呼び出しが 1 か所でない');
  assert.match(fnBody('executeSelectedProjectPackCase'), /ProjectPackExecution\.executeCase\(ctx, select\.value\)/);
  ['loadProjectPackText', 'renderProjectPackPreview', 'renderProjectPackExecutionControls', 'intakeProjectPackFile',
    'loadProjectPackFromPaste', 'projectPackDrop', 'projectPackExecutionCaseChanged', 'beginProjectPackAttempt']
    .forEach((fn) => assert.equal(/executeSelectedProjectPackCase|executeCase/.test(fnBody(fn)), false, fn + ' が計算している'));
  assert.match(STATIC, /id="btn-pack-exec"[^>]*\s+onclick="executeSelectedProjectPackCase\(\)"[^>]*disabled>選択ケースを計算（未レビュー）<\/button>/);
  assert.match(STATIC, /<select id="pack-exec-case" onchange="projectPackExecutionCaseChanged\(\)" disabled><\/select>/);
  assert.match(STATIC, /<div class="pack-exec" id="pack-exec" hidden>/);
  // 全ケースの一括実行は無い
  assert.equal(/executeAll|listCaseIds\([^)]*\)\.forEach|forEach\([^)]*executeCase/.test(CODE), false);
});

test('P2L-S3B2-U03: executor へ渡すのは staged の context だけ（生の Pack・active context は渡さない）', () => {
  const run = fnBody('executeSelectedProjectPackCase');
  assert.match(run, /var ctx = stagedProjectPackContext;/);
  assert.equal(/stagedProjectPack\b(?!Context|Execution)/.test(execCode()), false, 'ケース計算が生の Pack を読んでいる');
  assert.equal(/activeProjectContext/.test(execCode()), false, 'ケース計算が active context に触れている');
  assert.match(run, /ProjectPackExecution\.assertExecutionResult\(result\)/);
  assert.match(run, /result\.trust !== 'pack_unreviewed'/);
});

test('P2L-S3B2-U04: 古い結果は、読込開始・読込失敗・解除・選択変更・計算失敗のどれでも消える', () => {
  // 読込開始・失敗・解除はすべて beginProjectPackAttempt → renderProjectPackPreview(null) を通る
  assert.match(fnBody('beginProjectPackAttempt'), /renderProjectPackPreview\(null\)/);
  assert.match(fnBody('unloadProjectPack'), /beginProjectPackAttempt\(\)/);
  assert.match(fnBody('renderProjectPackFailure'), /renderProjectPackPreview\(null\)/);
  assert.match(fnBody('renderProjectPackPreview'), /if \(!ctx\) \{ box\.hidden = true; renderProjectPackExecutionControls\(null\); return; \}/);
  assert.match(fnBody('renderProjectPackPreview'), /renderProjectPackExecutionControls\(ctx\);/);
  const controls = fnBody('renderProjectPackExecutionControls');
  assert.equal(controls.indexOf('clearProjectPackExecution(') < controls.indexOf('if (!ctx)'), true, '選択肢を作る前に消していない');
  assert.match(fnBody('projectPackExecutionCaseChanged'), /clearProjectPackExecution\(/);
  const run = fnBody('executeSelectedProjectPackCase');
  assert.equal(run.indexOf('clearProjectPackExecution(') < run.indexOf('executeCase('), true, '計算の前に消していない');
  assert.match(run, /catch \(e\) \{\s*clearProjectPackExecution\(''\);/);
  const clear = fnBody('clearProjectPackExecution');
  assert.match(clear, /stagedProjectPackExecution = null;/);
  assert.match(clear, /box\.textContent = ''; box\.hidden = true;/);
  // 結果を置くのは表示が終わった後の 1 か所だけ
  assert.deepEqual(CODE.match(/stagedProjectPackExecution = (?!null)[^;]+;/g), ['stagedProjectPackExecution = result;']);
});

test('P2L-S3B2-U05: 計算失敗は固定文で、Pack は staged のまま（例外の文面・stack を出さない）', () => {
  const run = fnBody('executeSelectedProjectPackCase');
  assert.match(CODE, /var PROJECT_PACK_EXECUTION_FAILURE = '選択ケースを計算できませんでした。未レビューPackの計算結果は現在ありません。';/);
  assert.match(run, /renderProjectPackExecutionStatus\(PROJECT_PACK_EXECUTION_FAILURE, true\)/);
  assert.equal(/e\.message|e\.stack|String\(e\)|\.stack\b/.test(execCode()), false, '例外の文面を使っている');
  // ケース計算の失敗では取り込み側の state を消さない
  assert.equal(/beginProjectPackAttempt|stagedProjectPack(?:Context)? = |unloadProjectPack|renderProjectPackFailure/.test(execCode()), false);
});

test('P2L-S3B2-U06: active context の切替・入力欄・通常の計算・入力 package・一括検討・Closure へ流さない', () => {
  const block = execCode();
  ['activeProjectContext', 'inp-W', 'inp-H', 'inp-mode', 'runCalc', 'buildCurrentProjectInput', 'ProjectInput',
    'EvidenceClosure', 'EvidenceLedger', 'Promotion', 'promot', 'verifiedCases', 'evaluateClosure', 'GlassCalc',
    'WindPressure', 'WorkspaceCore', 'ProjectProfile', 'ReviewPackage', 'batch', 'Workspace', 'renderResults',
    'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches', 'fetch(', 'XMLHttpRequest',
    'sendBeacon', 'WebSocket', 'location', 'history.', 'console.', 'innerHTML', 'insertAdjacentHTML', 'eval(']
    .forEach((token) => assert.equal(block.includes(token), false, 'ケース計算 block が ' + token + ' を使っている'));
  // 実行コード全体でも active context を Pack にしない
  assert.equal(/activeProjectContext\s*=(?!=)\s*[^;]*(stagedProjectPack|ProjectPackExecution|execution)/i.test(CODE), false);
  assert.deepEqual([...ProjectInput.SOURCE_KINDS], ['registered_preset', 'manual', 'notification_calculation', 'imported_unverified']);
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
});

test('P2L-S3B2-U07: 文言——未レビュー・計算済み ≠ 検証済みを示し、強い表現を使わない', () => {
  const from = STATIC.indexOf('<div class="pack-exec" id="pack-exec" hidden>');
  assert.notEqual(from, -1);
  const section = STATIC.slice(from, STATIC.indexOf('</div>\n  </div>\n</section>', from));
  assert.match(section, /Project Pack ケース計算（未レビュー）/);
  assert.match(section, /計算済み ≠ 検証済み/);
  assert.match(section, /pack_unreviewed/);
  const literals = (execCode().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
  const strong = (section + '\n' + literals).replace(/計算済み ≠ 検証済み/g, '');
  assert.equal(STRONG_WORDING.test(strong), false, (strong.match(STRONG_WORDING) || [])[0]);
  assert.equal(/検証済/.test(strong), false, '「計算済み ≠ 検証済み」以外で検証済みと書いている');
  assert.match(execCode(), /'trust: ' \+ result\.trust \+ '（未レビュー）— 計算済み ≠ 検証済み'/);
  assert.match(literals, /OK は計算上の候補判定で、Evidence の確認ではありません。/);
  assert.match(literals, /風圧の出どころ: Pack入力から算定/);
  assert.match(literals, /風圧の出どころ: Pack map lookup/);
  assert.match(literals, /風圧の出どころ: Packがcaseに宣言したdesignPressure/);
});

test('P2L-S3B2-U08: 結果の表示は結果 object だけから作り、provenance・申告を読まない', () => {
  const render = fnBody('renderProjectPackExecutionResult');
  ['.provenance', 'formula', 'sourceClaim', 'claimed', 'evidenceClaims', 'stagedProjectPack', 'Context']
    .forEach((token) => assert.equal(render.includes(token), false, '結果表示が ' + token + ' を読んでいる'));
  assert.match(render, /box\.textContent = '';/);
  // case_direct の行に正圧・負圧が無い
  const directBranch = render.slice(render.lastIndexOf('} else {'), render.indexOf("packSection(box, '風圧', rows);"));
  assert.equal(/正圧|負圧|positive|negative/.test(directBranch), false, 'case_direct で正圧・負圧を表示している');
});

/* ============================================================
   挙動: intake + ケース計算 block を vm で動かす
============================================================ */

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this._text = '';
    this.children = [];
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    const set = new Set();
    this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  }
  get textContent() { return [this._text].concat(this.children.map((c) => c.textContent)).filter(Boolean).join('\n'); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  items(tag) {
    const out = [];
    const visit = (el) => { if (el.tagName === tag) out.push(el); el.children.forEach(visit); };
    visit(this);
    return out;
  }
}

/** intake + ケース計算 block の raw text（コメント込み）と、表示に使う小さな helper。 */
function blockSource() {
  const start = RAW_CODE.indexOf('var MAX_PROJECT_PACK_IMPORT_BYTES');
  const marker = RAW_CODE.indexOf('入力モード切替', start);
  const helpers = ['floorDisplayLabel'].map((name) => {
    const s = RAW_CODE.indexOf('function ' + name + '(');
    return RAW_CODE.slice(s, RAW_CODE.indexOf('\n}\n', s) + 3);
  }).join('\n') + '\nvar ZONE_DISPLAY_LABELS = { general: "一般部", corner: "隅角部" };\n';
  return helpers + RAW_CODE.slice(start, RAW_CODE.lastIndexOf('/*', marker));
}

const ACTIVE_SENTINEL = Object.freeze({ sentinel: 'runtime-default-built-in' });

function page() {
  const els = {};
  ['pack-status', 'pack-preview', 'pack-paste', 'pack-file', 'pack-drop', 'pack-exec', 'pack-exec-case',
    'btn-pack-exec', 'pack-exec-status', 'pack-exec-result'].forEach((id) => { els[id] = new FakeElement(id === 'pack-exec-case' ? 'select' : 'div'); });
  els['pack-exec'].hidden = true;
  els['pack-exec-result'].hidden = true;
  els['pack-exec-case'].disabled = true;
  els['btn-pack-exec'].disabled = true;
  const sandbox = {
    document: { getElementById: (id) => els[id] || null, createElement: (tag) => new FakeElement(tag) },
    ProjectPack: Pack, ProjectContext, ProjectPackExecution: Exec, TextEncoder,
    JSON: { parse: (...a) => JSON.parse(...a), stringify: JSON.stringify },
    activeProjectContext: ACTIVE_SENTINEL
  };
  vm.createContext(sandbox);
  vm.runInContext(blockSource(), sandbox, { filename: 'index.html#project-pack' });
  const w = sandbox;
  return {
    w, els,
    load: (mode) => w.loadProjectPackText(FIXTURES[mode], '貼り付け'),
    select: (id) => { els['pack-exec-case'].value = id; },
    change: (id) => { els['pack-exec-case'].value = id; w.projectPackExecutionCaseChanged(); },
    run: () => w.executeSelectedProjectPackCase(),
    execution: () => w.stagedProjectPackExecution,
    rows: () => els['pack-exec-result'].items('li').map((li) => li.textContent),
    resultText: () => els['pack-exec-result'].textContent,
    status: () => els['pack-exec-status'].textContent,
    options: () => els['pack-exec-case'].children.map((o) => [o.value, o.textContent])
  };
}

test('P2L-S3B2-U09: 読み込んだだけでは計算せず、選択肢は caseId と paneId だけ', () => {
  const p = page();
  assert.equal(p.els['pack-exec'].hidden, true, '起動時は閉じている');
  assert.equal(p.els['btn-pack-exec'].disabled, true);
  assert.equal(p.load('notification1458'), true);
  assert.equal(p.execution(), null, '読込で計算した');
  assert.equal(p.els['pack-exec-result'].hidden, true);
  assert.equal(p.els['pack-exec'].hidden, false);
  assert.equal(p.els['btn-pack-exec'].disabled, false);
  assert.deepEqual(p.options(), [['G001', 'G001 — P001'], ['G002', 'G002 — P002'], ['G003', 'G003 — P001']]);
  assert.match(p.status(), /押したときだけ/);
});

test('P2L-S3B2-U10: 明示操作で選んだ 1 ケースだけを計算し、未レビューとして表示する', () => {
  const p = page();
  p.load('notification1458');
  p.select('G002');
  assert.equal(p.run(), true);
  const r = p.execution();
  assert.equal(Exec.isExecutionResult(r), true);
  assert.equal(r.case.caseId, 'G002');
  assert.equal(r.trust, 'pack_unreviewed');
  assert.equal(r.pressure.evaluationHeightM, 10.2);
  const rows = p.rows();
  ['trust: pack_unreviewed（未レビュー）— 計算済み ≠ 検証済み', 'caseId: G002 / paneId: P002', 'W × H: 760 × 1880 mm',
    'glassType: lowe_fl', 'pressureModel.mode: notification1458', '設計風圧（designPressure）: 1685.0 N/m²',
    '風圧の出どころ: Pack入力から算定（告示1458号系の式）', '階: 3階', '部位: 隅角部（corner）', '評価高さ: 10.2 m',
    '正圧: 1685.0 N/m²', '負圧: -1409.5 N/m²', '推奨候補（OK の最小構成）: Low-E5 + A + FL5',
    '許容風圧 P: 3543.2 N/m²', 'OK 43 / NG 0 / 適用範囲外 6']
    .forEach((row) => assert.equal(rows.includes(row), true, row + ' が無い: ' + rows.join(' | ')));
  assert.equal(STRONG_WORDING.test(p.resultText().replace(/計算済み ≠ 検証済み/g, '')), false);
  assert.equal(/formula|provenance|verified_primary_source/.test(p.resultText()), false);
  assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL);
});

test('P2L-S3B2-U11: map と case_direct の表示（case_direct は正圧・負圧を出さない）', () => {
  const p = page();
  p.load('project_pressure_map');
  p.select('G002');
  p.run();
  const mapRows = p.rows();
  ['階: 5階', '部位: 隅角部（corner）', '正圧: 1135.0 N/m²', '負圧（絶対値）: 1835.0 N/m²',
    '設計風圧（designPressure）: 1835.0 N/m²', '推奨候補（OK の最小構成）: TP5', 'OK 6 / NG 0 / 適用範囲外 0']
    .forEach((row) => assert.equal(mapRows.includes(row), true, row));
  p.load('case_direct');
  p.select('G002');
  p.run();
  const directRows = p.rows();
  assert.equal(directRows.includes('設計風圧（designPressure）: 1365.0 N/m²'), true);
  assert.equal(directRows.includes('風圧の出どころ: Packがcaseに宣言したdesignPressure'), true);
  assert.equal(directRows.some((t) => /正圧|負圧|部位/.test(t)), false, 'case_direct で正圧・負圧・部位を表示した: ' + directRows.join(' | '));
});

test('P2L-S3B2-U12: 古い結果は選択変更・新しい Pack・読込失敗・解除で消える', () => {
  const p = page();
  const executed = () => { p.select('G002'); assert.equal(p.run(), true); assert.notEqual(p.execution(), null); };
  p.load('notification1458');
  executed();
  p.change('G001');
  assert.equal(p.execution(), null, '選択変更で消えない');
  assert.equal(p.els['pack-exec-result'].hidden, true);
  assert.match(p.status(), /前の計算結果を消しました/);
  executed();
  assert.equal(p.load('project_pressure_map'), true);
  assert.equal(p.execution(), null, '新しい Pack で消えない');
  assert.equal(p.resultText(), '');
  executed();
  assert.equal(p.w.loadProjectPackText('{"schemaVersion": 1', '貼り付け'), false);
  assert.equal(p.execution(), null, '読込失敗で消えない');
  assert.equal(p.w.stagedProjectPackContext, null, '読込失敗では Pack も消える（S3-B1）');
  assert.equal(p.els['pack-exec'].hidden, true);
  p.load('case_direct');
  executed();
  p.w.unloadProjectPack();
  assert.equal(p.execution(), null, '解除で消えない');
  assert.equal(p.els['pack-exec'].hidden, true);
  assert.equal(p.els['btn-pack-exec'].disabled, true);
  assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL);
});

test('P2L-S3B2-U13: 計算失敗は固定文で前の結果を消し、Pack は staged のまま', () => {
  const p = page();
  p.load('notification1458');
  p.select('G002');
  p.run();
  const ctx = p.w.stagedProjectPackContext;
  p.select('G999');
  assert.equal(p.run(), false);
  assert.equal(p.status(), FAILURE_TEXT);
  assert.equal(p.els['pack-exec-status'].className, 'pack-status is-error');
  assert.equal(p.execution(), null);
  assert.equal(p.els['pack-exec-result'].hidden, true);
  assert.equal(p.w.stagedProjectPackContext, ctx, '計算失敗で Pack まで消した');
  assert.equal(/G999|ProjectPackExecution|no entry|Error/.test(p.status()), false);
  // 選択が空でも同じ（例外の文面を出さない）
  p.select('');
  assert.equal(p.run(), false);
  assert.equal(p.status(), FAILURE_TEXT);
  // Pack が無いときも計算しない
  p.w.unloadProjectPack();
  p.select('G002');
  assert.equal(p.run(), false);
  assert.equal(p.status(), FAILURE_TEXT);
  assert.equal(p.execution(), null);
});

test('P2L-S3B2-U14: browser harness は登録され、Pack の検証器・adapter・executor を呼ばない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const inst = spec.instruments.find((i) => i.id === 'project-pack-execution');
  assert.ok(inst, 'verification-spec に project-pack-execution が無い');
  assert.equal(inst.command, 'node tools/browser-checks/project-pack-execution.mjs');
  assert.equal(inst.admissibility, 'UNVERIFIED');
  assert.ok(spec.browserAssertions.some((a) => a.id === 'project-pack-execution-explicit-unreviewed' && a.instrument === 'project-pack-execution'));
  const src = read('tools/browser-checks/project-pack-execution.mjs');
  assert.match(src, /openBrowser\(/);
  assert.match(src, /finishRun\(/);
  // Node 側で検証器・adapter・executor を読み込んだり呼んだりしない（page へ本物を注入する D4 は除く）
  assert.equal(/validateProjectPack|fromProjectPack|executeCase\(|require\([^)]*(project-pack|project-context|project-pack-execution)/.test(src), false,
    'harness が Pack の検証器・adapter・executor を使っている（新しい trust 経路）');
  assert.equal(/import[^;]*(project-pack|project-context)/.test(src), false);
  // 期待値は fixture と、Node で直接呼ぶ風圧・ガラスの計算から作る
  assert.match(src, /require\(REPO \+ 'wind-pressure\.js'\)/);
  assert.match(src, /require\(REPO \+ 'calc\.js'\)/);
  assert.match(src, /tests\/fixtures\/project-pack\//);
});
