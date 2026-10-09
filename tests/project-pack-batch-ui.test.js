'use strict';

/**
 * Phase 2L-B2 / S3-B3A: index.html の Project Pack 全ケース計算（明示操作・チャンク・全件そろったときだけ・未レビュー）。
 *
 *   - 計算は「Pack全ケースを計算（未レビュー）」を押したときだけ。読込・preview・ケースの選択では計算しない
 *   - 渡すのは stagedProjectPackContext だけ。計算は ProjectPackBatch（＝ executeCase の繰り返し）だけ
 *   - チャンクの間は setTimeout でイベントループへ戻す。進捗は 処理済み / 全体
 *   - キャンセル・Pack の読込開始・読込失敗・解除・新しい計算の開始で run を捨てる。チャンクの前と
 *     確定の直前に token・試行・context の同一性を確かめる
 *   - 1 ケースでも失敗したら一覧を出さず固定文。Pack は staged のまま
 *   - 一覧は 50 行ずつ。ページの切替で計算しない
 *
 * 前半は実行コードの静的な検査、後半は index.html の intake + ケース計算 + 全ケース計算 block を vm で
 * 動かす挙動の検査（最小の偽 DOM・手で進める setTimeout・実際の ProjectPack / ProjectContext /
 * ProjectPackExecution / ProjectPackBatch）。実ブラウザでの挙動は tools/browser-checks/project-pack-batch.mjs。
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
const Batch = require('../project-config/project-pack-batch.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);
const BATCH_SRC_REL = 'project-config/project-pack-batch.js';

const FIXTURE = (name) => read('tests/fixtures/project-pack/' + name + '.json');
const FIXTURES = { notification1458: FIXTURE('synthetic-notification1458'),
  project_pressure_map: FIXTURE('synthetic-project-pressure-map'), case_direct: FIXTURE('synthetic-case-direct') };
const FAILURE_TEXT = '一括計算を完了できませんでした。未レビューPackの一括結果は現在ありません。';
const CANCELLED_TEXT = '全ケースの計算をキャンセルしました。未レビューPackの一括結果は現在ありません。';
const STRONG_WORDING = /Verified|承認|確定|安全|問題なし|計算可能|公開可能|確認済|\bsafe\b|\bapproved\b/i;

/** top-level の関数 1 つ（次の top-level の function / var の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar '].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}

/**
 * 全ケース計算 block（実行コード）。state 宣言から一覧表示の関数の終わりまで
 * （その後ろに続く S3-B3B1 の派生レポート block は含めない）。
 */
function batchCode() {
  const start = CODE.indexOf('\nvar PACK_BATCH_MODULE');
  const reportStart = CODE.indexOf('\nvar PACK_REPORT_MODULE');
  assert.equal(start !== -1 && reportStart > start, true, '全ケース計算 block が無い');
  return CODE.slice(start, reportStart);
}

const BATCH_FUNCTIONS = ['renderProjectPackBatchStatus', 'renderProjectPackBatchProgress', 'clearProjectPackBatch',
  'renderProjectPackBatchControls', 'projectPackBatchIsCurrent', 'projectPackBatchYield', 'startProjectPackBatch',
  'cancelProjectPackBatch', 'abandonProjectPackBatch', 'failProjectPackBatch', 'stepProjectPackBatch',
  'showProjectPackBatchPage', 'packBatchNumber', 'packBatchPlaceText', 'packBatchPressureText', 'packBatchCell',
  'renderProjectPackBatchResult'];

/* ============================================================
   静的
============================================================ */

test('P2L-S3B3A-U01: batch module は executor の後に読み込み、UI は初期化時に 1 度だけ掴む', () => {
  const at = (src) => HTML.indexOf('<script src="' + src + '"></script>');
  assert.equal(at('project-config/project-pack-execution.js') !== -1 &&
    at('project-config/project-pack-execution.js') < at(BATCH_SRC_REL) && at(BATCH_SRC_REL) < at('workspace.js'), true);
  BATCH_FUNCTIONS.forEach((name) => assert.match(batchCode(), new RegExp('\\nfunction ' + name + '\\('), name));
  assert.match(batchCode(), /\nvar PACK_BATCH_MODULE = \(typeof ProjectPackBatch === 'object' && ProjectPackBatch\) \? ProjectPackBatch : null;/);
  // ProjectPackBatch の global を読むのはその 1 行だけ（後から差し替えた global を使わない）
  assert.equal((CODE.match(/(?<!\w)ProjectPackBatch\b/g) || []).length, 3, 'ProjectPackBatch の参照が初期化の 1 行以外にある');
});

test('P2L-S3B3A-U02: 計算は明示操作だけ（読込・preview・選択・ページの切替では計算しない）', () => {
  assert.match(STATIC, /<button type="button" id="btn-pack-batch" class="btn-secondary"\s+onclick="startProjectPackBatch\(\)" disabled>Pack全ケースを計算（未レビュー）<\/button>/);
  assert.match(STATIC, /<button type="button" id="btn-pack-batch-cancel" class="btn-secondary"\s+onclick="cancelProjectPackBatch\(\)" disabled>計算をキャンセル<\/button>/);
  assert.match(STATIC, /<div class="pack-exec pack-batch" id="pack-batch" hidden>/);
  // run を作るのは startProjectPackBatch の 1 か所だけ。executeAll・executor の直接呼び出しは UI に無い
  assert.equal((CODE.match(/createBatchRun\(/g) || []).length, 1);
  assert.match(fnBody('startProjectPackBatch'), /PACK_BATCH_MODULE\.createBatchRun\(ctx\)/);
  assert.equal(/executeAll|listCaseIds/.test(CODE), false);
  assert.equal(/ProjectPackExecution\./.test(batchCode()), false, '全ケース計算 block が executor を直接使っている');
  // startProjectPackBatch を呼ぶのはボタンだけ
  assert.equal((CODE.match(/startProjectPackBatch\(/g) || []).length, 1, 'コードから startProjectPackBatch を呼んでいる');
  ['loadProjectPackText', 'renderProjectPackPreview', 'renderProjectPackBatchControls', 'renderProjectPackExecutionControls',
    'projectPackExecutionCaseChanged', 'beginProjectPackAttempt', 'showProjectPackBatchPage', 'renderProjectPackBatchResult',
    'intakeProjectPackFile', 'projectPackDrop']
    .forEach((fn) => assert.equal(/startProjectPackBatch|createBatchRun|nextChunk|stepProjectPackBatch/.test(fnBody(fn)), false, fn + ' が計算している'));
});

test('P2L-S3B3A-U03: 渡すのは staged の context だけ。active context・生の Pack に触れない', () => {
  const start = fnBody('startProjectPackBatch');
  assert.match(start, /var ctx = stagedProjectPackContext;/);
  assert.equal(/stagedProjectPack\b(?!Context|Execution|Batch)/.test(batchCode()), false, '全ケース計算が生の Pack を読んでいる');
  assert.equal(/activeProjectContext/.test(batchCode()), false);
  assert.equal(/activeProjectContext\s*=(?!=)\s*[^;]*(stagedProjectPack|ProjectPackBatch|PACK_BATCH|batch)/i.test(CODE), false);
  const step = fnBody('stepProjectPackBatch');
  assert.match(step, /PACK_BATCH_MODULE\.assertBatchResult\(result\);/);
  assert.match(step, /result\.trust !== 'pack_unreviewed'/);
});

test('P2L-S3B3A-U04: run の同一性（token・試行・context）をチャンクの前と確定の直前に確かめる', () => {
  assert.match(fnBody('projectPackBatchIsCurrent'),
    /job !== null && job === projectPackBatchJob && job\.token === projectPackBatchToken &&\s*job\.attempt === projectPackAttempt && job\.ctx === stagedProjectPackContext/);
  const step = fnBody('stepProjectPackBatch');
  const checks = [...step.matchAll(/if \(!projectPackBatchIsCurrent\(job\)\) \{ abandonProjectPackBatch\(job\); return; \}/g)].map((m) => m.index);
  assert.equal(checks.length, 2, 'チャンクの前と確定の直前の 2 か所で確かめていない');
  assert.equal(checks[0] < step.indexOf('nextChunk('), true, 'チャンクの前に確かめていない');
  assert.equal(checks[1] > step.indexOf('.finish()') && checks[1] < step.indexOf('stagedProjectPackBatch = result;'), true,
    '確定の直前に確かめていない');
  // 結果を置くのは確定の 1 か所だけ
  assert.deepEqual(CODE.match(/stagedProjectPackBatch = (?!null)[^;]+;/g), ['stagedProjectPackBatch = result;']);
  // 読込開始・失敗・解除は preview を作り直す経路で run を捨てる
  assert.match(fnBody('renderProjectPackPreview'), /renderProjectPackBatchControls\(null\); return; \}/);
  assert.match(fnBody('renderProjectPackPreview'), /renderProjectPackBatchControls\(ctx\);/);
  assert.match(fnBody('beginProjectPackAttempt'), /renderProjectPackPreview\(null\)/);
  const clear = fnBody('clearProjectPackBatch');
  ['projectPackBatchToken += 1;', 'projectPackBatchJob = null;', 'stagedProjectPackBatch = null;',
    "box.textContent = ''; box.hidden = true;", 'renderProjectPackBatchProgress(0, null);', 'cancel.disabled = true']
    .forEach((s) => assert.equal(clear.includes(s), true, s));
  assert.equal(fnBody('renderProjectPackBatchControls').indexOf('clearProjectPackBatch(') <
    fnBody('renderProjectPackBatchControls').indexOf('if (!ctx)'), true);
  assert.match(fnBody('startProjectPackBatch'), /^function startProjectPackBatch\(\) \{\n  clearProjectPackBatch\(''\);/);
});

test('P2L-S3B3A-U05: チャンクは 25 ケース・setTimeout で戻る。一覧は 50 行ずつ', () => {
  assert.match(CODE, /\nvar PROJECT_PACK_BATCH_CHUNK = 25;/);
  assert.match(CODE, /\nvar PROJECT_PACK_BATCH_PAGE_SIZE = 50;/);
  assert.match(fnBody('projectPackBatchYield'), /setTimeout\(next, 0\);/);
  assert.equal(/Promise|queueMicrotask|async |await /.test(batchCode()), false, 'microtask だけで戻っている');
  assert.match(fnBody('stepProjectPackBatch'), /job\.run\.nextChunk\(PROJECT_PACK_BATCH_CHUNK\)/);
  assert.match(fnBody('renderProjectPackBatchResult'), /result\.rows\.slice\(from, from \+ size\)/);
});

test('P2L-S3B3A-U06: 入力欄・通常の計算・入力 package・一括検討・Closure・保存・通信へ流さない', () => {
  const block = batchCode();
  ['activeProjectContext', 'inp-W', 'inp-H', 'inp-mode', 'runCalc', 'buildCurrentProjectInput', 'ProjectInput',
    'EvidenceClosure', 'EvidenceLedger', 'Promotion', 'promot', 'verifiedCases', 'evaluateClosure', 'GlassCalc',
    'WindPressure', 'WorkspaceCore', 'ProjectProfile', 'ReviewPackage', 'Workspace', 'renderResults', 'sourceClaim',
    'evidenceClaims', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches', 'fetch(',
    'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'location', 'history.', 'console.', 'innerHTML', 'insertAdjacentHTML',
    'eval(', 'e.message', 'e.stack', 'String(e)']
    .forEach((token) => assert.equal(block.includes(token), false, '全ケース計算 block が ' + token + ' を使っている'));
  // 取り込み側の state を消さない（計算失敗で Pack は残る）
  assert.equal(/beginProjectPackAttempt|stagedProjectPack(?:Context)? = |unloadProjectPack|renderProjectPackFailure/.test(block), false);
  assert.deepEqual([...ProjectInput.SOURCE_KINDS], ['registered_preset', 'manual', 'notification_calculation', 'imported_unverified']);
});

test('P2L-S3B3A-U07: 文言——未レビュー・計算済み ≠ 検証済み。失敗は固定文。強い表現を使わない', () => {
  const from = STATIC.indexOf('<div class="pack-exec pack-batch" id="pack-batch" hidden>');
  assert.notEqual(from, -1);
  const section = STATIC.slice(from, STATIC.indexOf('</div>\n  </div>\n</section>', from));
  assert.match(section, /Project Pack 全ケース計算（未レビュー）/);
  assert.match(section, /計算済み ≠ 検証済み/);
  assert.match(section, /pack_unreviewed/);
  const literals = (batchCode().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
  // S3-B3B1 の派生レポートの注意文（「…公開安全の証明にはなりません」という否定の文）だけは除いて調べる
  const strong = (section + '\n' + literals).replace(/計算済み ≠ 検証済み/g, '')
    .replace(/publication advisoryが0件でも公開安全の証明にはなりません。/g, '');
  assert.equal(STRONG_WORDING.test(strong), false, (strong.match(STRONG_WORDING) || [])[0]);
  assert.equal(/検証済/.test(strong), false);
  assert.match(batchCode(), /'trust: ' \+ result\.trust \+ '（未レビュー）— 計算済み ≠ 検証済み'/);
  assert.match(CODE, /var PROJECT_PACK_BATCH_FAILURE = '一括計算を完了できませんでした。未レビューPackの一括結果は現在ありません。';/);
  assert.match(literals, /OK は計算上の候補判定で、Evidence の確認ではありません。/);
  assert.match(literals, /'候補なし'/);
  // case_direct の表示は正圧・負圧を出さない
  const pressureText = fnBody('packBatchPressureText');
  const directBranch = pressureText.slice(pressureText.lastIndexOf('return '));
  assert.equal(/正圧|負圧|positive|negative/.test(directBranch), false);
});

/* ============================================================
   挙動: intake + ケース計算 + 全ケース計算 block を vm で動かす
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

/** intake + ケース計算 + 全ケース計算 block の raw text（コメント込み）と、表示に使う小さな helper。 */
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

/**
 * 本物の executor を包んだ executor の上で batch module を初期化する（vm）。
 * failAt(caseId) が true のケースは失敗する。calls は executeCase の呼び出し。
 */
function batchOver(failAt) {
  const calls = [];
  const wrapped = Object.freeze(Object.assign({}, Exec, {
    executeCase: (c, id) => { calls.push(id); if (failAt && failAt(id)) throw new Error('forced failure ' + id); return Exec.executeCase(c, id); }
  }));
  const sb = { ProjectPackExecution: wrapped };
  vm.createContext(sb);
  vm.runInContext(read(BATCH_SRC_REL), sb, { filename: BATCH_SRC_REL });
  return { B: sb.ProjectPackBatch, calls };
}

function page(options) {
  const opts = options || {};
  const els = {};
  ['pack-status', 'pack-preview', 'pack-paste', 'pack-file', 'pack-drop', 'pack-exec', 'pack-exec-case',
    'btn-pack-exec', 'pack-exec-status', 'pack-exec-result', 'pack-batch', 'btn-pack-batch', 'btn-pack-batch-cancel',
    'pack-batch-progress', 'pack-batch-status', 'pack-batch-result']
    .forEach((id) => { els[id] = new FakeElement(id === 'pack-exec-case' ? 'select' : 'div'); });
  ['pack-exec', 'pack-exec-result', 'pack-batch', 'pack-batch-result', 'pack-batch-progress'].forEach((id) => { els[id].hidden = true; });
  ['pack-exec-case', 'btn-pack-exec', 'btn-pack-batch', 'btn-pack-batch-cancel'].forEach((id) => { els[id].disabled = true; });
  const timers = [];
  const over = opts.batch || { B: Batch, calls: null };
  const sandbox = {
    document: { getElementById: (id) => els[id] || null, createElement: (tag) => new FakeElement(tag) },
    ProjectPack: Pack, ProjectContext, ProjectPackExecution: Exec, ProjectPackBatch: over.B, TextEncoder,
    JSON: { parse: (...a) => JSON.parse(...a), stringify: JSON.stringify },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    activeProjectContext: ACTIVE_SENTINEL
  };
  vm.createContext(sandbox);
  vm.runInContext(blockSource(), sandbox, { filename: 'index.html#project-pack' });
  const w = sandbox;
  const tick = () => { const t = timers.shift(); if (!t) return false; t.fn(); return true; };
  const drain = () => { let n = 0; while (tick()) { n++; if (n > 10000) throw new Error('runaway'); } return n; };
  const table = () => els['pack-batch-result'].items('table')[0];
  return {
    w, els, timers, tick, drain, calls: over.calls,
    load: (mode) => w.loadProjectPackText(FIXTURES[mode], '貼り付け'),
    loadPack: (pack) => w.loadProjectPackText(JSON.stringify(pack), '貼り付け'),
    start: () => w.startProjectPackBatch(),
    cancel: () => w.cancelProjectPackBatch(),
    batch: () => w.stagedProjectPackBatch,
    status: () => els['pack-batch-status'].textContent,
    statusError: () => els['pack-batch-status'].className === 'pack-status is-error',
    progress: () => ({ hidden: els['pack-batch-progress'].hidden, value: els['pack-batch-progress'].value, max: els['pack-batch-progress'].max }),
    header: () => (table() ? table().items('th').map((th) => th.textContent) : []),
    bodyRows: () => (table() ? table().items('tbody')[0].items('tr').map((tr) => tr.items('td').map((td) => td.textContent)) : []),
    summary: () => els['pack-batch-result'].items('li').map((li) => li.textContent),
    buttons: () => els['pack-batch-result'].items('button'),
    navText: () => (els['pack-batch-result'].items('span')[0] || { textContent: '' }).textContent,
    resultText: () => els['pack-batch-result'].textContent
  };
}

const HEADER_WITH_PLACE = ['ケース', 'Pane', '階/部位', '寸法 W×H mm', 'ガラス', '設計風圧 N/m²', '風圧の内訳 N/m²', '推奨候補',
  '許容風圧 N/m²', '候補数 OK/NG/適用範囲外'];

test('P2L-S3B3A-U08: 読み込んだだけでは計算せず、ボタンで全ケースを計算して一覧を出す（notification）', () => {
  const p = page();
  assert.equal(p.els['pack-batch'].hidden, true);
  assert.equal(p.els['btn-pack-batch'].disabled, true);
  assert.equal(p.load('notification1458'), true);
  assert.equal(p.timers.length, 0, '読込で計算を始めた');
  assert.equal(p.batch(), null);
  assert.equal(p.els['pack-batch'].hidden, false);
  assert.equal(p.els['btn-pack-batch'].disabled, false);
  assert.equal(p.els['btn-pack-batch-cancel'].disabled, true);
  assert.match(p.status(), /押したときだけ/);
  // ケースの選択でも計算しない
  p.els['pack-exec-case'].value = 'G002';
  p.w.projectPackExecutionCaseChanged();
  assert.equal(p.timers.length, 0);

  assert.equal(p.start(), true);
  assert.equal(p.batch(), null, 'チャンクを進める前に結果を置いた');
  assert.equal(p.els['btn-pack-batch-cancel'].disabled, false);
  assert.deepEqual(p.progress(), { hidden: false, value: 0, max: 3 });
  assert.equal(p.status(), '計算中… 0 / 3 ケース（未レビュー）');
  assert.equal(p.timers[0].ms, 0);
  p.drain();
  const r = p.batch();
  assert.equal(Batch.isBatchResult(r), true);
  assert.equal(r.trust, 'pack_unreviewed');
  assert.equal(p.status(), '全 3 ケースを計算しました（未レビュー。計算済み ≠ 検証済み）。');
  assert.equal(p.els['btn-pack-batch-cancel'].disabled, true);
  assert.deepEqual(p.progress(), { hidden: false, value: 3, max: 3 });
  assert.deepEqual(p.header(), HEADER_WITH_PLACE);
  const rows = p.bodyRows();
  assert.deepEqual(rows.map((x) => x[0]), ['G001', 'G002', 'G003']);
  assert.deepEqual(rows[1], ['G002', 'P002', '3階 / 隅角部（corner）', '760 × 1880', 'lowe_fl', '1685.0',
    '正圧 1685.0 / 負圧 -1409.5（評価高さ 10.2 m）', 'Low-E5 + A + FL5', '3543.2', '43 / 0 / 6']);
  ['trust: pack_unreviewed（未レビュー）— 計算済み ≠ 検証済み', '公開表示名: Synthetic Pack N1458',
    'pressureModel.mode: notification1458', '計算したケース: 3 / 3']
    .forEach((s) => assert.equal(p.summary().includes(s), true, s));
  assert.equal(STRONG_WORDING.test(p.resultText().replace(/計算済み ≠ 検証済み/g, '')), false);
  assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL);
});

test('P2L-S3B3A-U09: map と case_direct の一覧（case_direct は正圧・負圧に分けず、無い階・部位を作らない）', () => {
  const p = page();
  p.load('project_pressure_map');
  p.start();
  p.drain();
  const map = p.bodyRows();
  assert.deepEqual(map.map((x) => x[0]), ['G001', 'G002', 'G003', 'G004']);
  assert.deepEqual(map[1], ['G002', 'P002', '5階 / 隅角部（corner）', '760 × 1880', 'tp_single', '1835.0',
    '正圧 1135.0 / 負圧（絶対値） 1835.0', 'TP5', '8267.4', '6 / 0 / 0']);
  assert.deepEqual(map[0].slice(5), ['1565.0', '正圧 1045.0 / 負圧（絶対値） 1565.0', 'FL6', '1969.5', '6 / 1 / 0']);
  assert.deepEqual(map[2].slice(1, 4), ['P003', 'R階 / 一般部（general）', '640 × 1720']);

  p.load('case_direct');
  assert.equal(p.batch(), null, '新しい Pack で前の一覧が消えない');
  p.start();
  p.drain();
  const direct = p.bodyRows();
  assert.deepEqual(p.header(), HEADER_WITH_PLACE, 'G002 が floor を宣言しているので 階/部位 の列はある');
  assert.deepEqual(direct[0], ['G001', 'P001', '—', '1020 × 2240', 'fl_single', '1245.0', 'Packが宣言した設計風圧', 'FL5', '1477.2', '7 / 0 / 0']);
  assert.deepEqual(direct[1], ['G002', 'P002', '2階', '760 × 1880', 'lowe_fl', '1365.0', 'Packが宣言した設計風圧',
    'Low-E5 + A + FL5', '3543.2', '43 / 0 / 6']);
  assert.equal(direct.some((cells) => cells.some((c) => /正圧|負圧|部位|corner|general/.test(c))), false);
});

test('P2L-S3B3A-U10: 50 行ずつのページ。切替は確定した一覧を表示し直すだけで計算しない。候補なしも表示する', () => {
  const over = batchOver(null);
  const p = page({ batch: over });
  const pack = syntheticPack(120, 'case_direct', { designPressureOf: (i) => (i === 60 ? 60000 : 1200) });
  assert.equal(p.loadPack(pack), true);
  p.start();
  const chunks = p.drain();
  assert.equal(chunks, Math.ceil(120 / 25), 'チャンクの数');
  assert.equal(over.calls.length, 120);
  assert.equal(p.bodyRows().length, 50);
  assert.equal(p.bodyRows()[0][0], 'G0001');
  assert.equal(p.navText(), '1–50 / 120 ケース（1 / 3 ページ）');
  const [prev, next] = p.buttons();
  assert.equal(prev.disabled, true);
  assert.equal(next.disabled, false);
  next.onclick();
  assert.equal(p.navText(), '51–100 / 120 ケース（2 / 3 ページ）');
  assert.equal(p.bodyRows()[0][0], 'G0051');
  const g61 = p.bodyRows().find((cells) => cells[0] === 'G0061');
  assert.deepEqual(g61.slice(-3), ['候補なし', '—', '0 / 7 / 0']);
  p.buttons()[1].onclick();
  assert.equal(p.navText(), '101–120 / 120 ケース（3 / 3 ページ）');
  assert.equal(p.bodyRows().length, 20);
  assert.equal(p.buttons()[1].disabled, true);
  p.buttons()[0].onclick();
  assert.equal(p.bodyRows()[0][0], 'G0051');
  assert.equal(p.w.showProjectPackBatchPage(99), true);
  assert.equal(p.navText(), '101–120 / 120 ケース（3 / 3 ページ）');
  assert.equal(over.calls.length, 120, 'ページの切替で計算した');
  assert.equal(p.timers.length, 0);
  assert.match(p.summary().join('\n'), /OK の候補が無いケース: 1/);
});

test('P2L-S3B3A-U11: キャンセルすると run を捨て、残りのチャンクは何もしない', () => {
  const over = batchOver(null);
  const p = page({ batch: over });
  p.loadPack(syntheticPack(100, 'notification1458'));
  p.start();
  p.tick();
  assert.equal(over.calls.length, 25);
  assert.equal(p.status(), '計算中… 25 / 100 ケース（未レビュー）');
  assert.deepEqual(p.progress(), { hidden: false, value: 25, max: 100 });
  assert.equal(p.cancel(), true);
  assert.equal(p.status(), CANCELLED_TEXT);
  assert.equal(p.els['btn-pack-batch-cancel'].disabled, true);
  assert.equal(p.progress().hidden, true);
  p.drain();
  assert.equal(over.calls.length, 25, 'キャンセルの後も計算した');
  assert.equal(p.batch(), null);
  assert.equal(p.els['pack-batch-result'].hidden, true);
  assert.equal(p.status(), CANCELLED_TEXT);
  assert.equal(p.cancel(), false, '走っていないのにキャンセルできた');
  // もう一度押せば最初から計算できる
  p.start();
  p.drain();
  assert.equal(p.batch().totalCases, 100);
});

test('P2L-S3B3A-U12: 途中で別の Pack・壊れた Pack・解除に切り替えると、古い run は何も表示しない', () => {
  // D: Pack A → B
  {
    const over = batchOver(null);
    const p = page({ batch: over });
    p.loadPack(syntheticPack(100, 'project_pressure_map', { label: 'Synthetic Pack A' }));
    p.start();
    p.tick();
    assert.equal(p.load('case_direct'), true);
    assert.equal(p.status(), '全ケースの計算は「Pack全ケースを計算（未レビュー）」を押したときだけ行います。');
    const callsAtSwitch = over.calls.length;
    p.drain();
    assert.equal(over.calls.length, callsAtSwitch, '古い run が計算を続けた');
    assert.equal(p.batch(), null, '古い Pack の結果が新しい Pack の画面に出た');
    assert.equal(p.els['pack-batch-result'].hidden, true);
    assert.equal(/Synthetic Pack A/.test(p.resultText() + p.status()), false);
    p.start();
    p.drain();
    assert.equal(p.batch().publicLabel, 'Synthetic Pack Direct');
  }
  // E: 壊れた Pack
  {
    const p = page();
    p.loadPack(syntheticPack(100, 'notification1458'));
    p.start();
    p.tick();
    assert.equal(p.w.loadProjectPackText('{"schemaVersion": 1', '貼り付け'), false);
    p.drain();
    assert.equal(p.batch(), null);
    assert.equal(p.els['pack-batch'].hidden, true);
    assert.equal(p.els['btn-pack-batch'].disabled, true);
    assert.equal(p.w.stagedProjectPackContext, null);
  }
  // F: 解除
  {
    const p = page();
    p.loadPack(syntheticPack(100, 'case_direct'));
    p.start();
    p.tick();
    p.w.unloadProjectPack();
    p.drain();
    assert.equal(p.batch(), null);
    assert.equal(p.els['pack-batch'].hidden, true);
    assert.equal(p.progress().hidden, true);
    assert.equal(p.w.projectPackBatchJob, null);
  }
});

test('P2L-S3B3A-U13: 計算中にもう一度押すと前の run を捨て、後の run の結果だけを置く', () => {
  const over = batchOver(null);
  const p = page({ batch: over });
  p.loadPack(syntheticPack(60, 'case_direct'));
  p.start();
  p.tick();
  const first = p.w.projectPackBatchJob;
  p.start();
  const second = p.w.projectPackBatchJob;
  assert.notEqual(first, second);
  assert.equal(first.run.hasFailed(), false);
  assert.throws(() => first.run.nextChunk(25), /was cancelled/);
  p.drain();
  assert.equal(over.calls.length, 25 + 60, '前の run が計算を続けた');
  assert.equal(p.batch().totalCases, 60);
  assert.deepEqual([...p.batch().rows.map((r) => r.caseId)], syntheticPack(60, 'case_direct').glazingCases.map((c) => c.caseId));
});

test('P2L-S3B3A-U14: 途中の 1 ケースが失敗したら一覧を出さず固定文。Pack は staged のまま、選択ケースの計算は使える', () => {
  const over = batchOver((id) => id === 'G0040');
  const p = page({ batch: over });
  p.loadPack(syntheticPack(80, 'notification1458'));
  const ctx = p.w.stagedProjectPackContext;
  p.start();
  p.tick();
  assert.equal(p.status(), '計算中… 25 / 80 ケース（未レビュー）');
  p.drain();
  assert.equal(over.calls.length, 40, '失敗の後も計算した');
  assert.equal(p.batch(), null);
  assert.equal(p.status(), FAILURE_TEXT);
  assert.equal(p.statusError(), true);
  assert.equal(p.progress().hidden, true, '進捗の表示が残っている');
  assert.equal(p.els['pack-batch-result'].hidden, true);
  assert.equal(p.bodyRows().length, 0, '途中までの行を表示した');
  assert.equal(/G0040|forced|Error|ProjectPack/.test(p.status()), false);
  assert.equal(p.w.stagedProjectPackContext, ctx, '計算失敗で Pack まで消した');
  assert.equal(p.els['btn-pack-batch'].disabled, false);
  p.els['pack-exec-case'].value = 'G0002';
  assert.equal(p.w.executeSelectedProjectPackCase(), true, '選択ケースの計算が使えない');
  assert.equal(p.w.stagedProjectPackExecution.case.caseId, 'G0002');
});

test('P2L-S3B3A-U15: 確定の直前に token が変わったら確定しない', () => {
  // finish の中で別の run が始まった（token が進んだ）ことにする
  const wrapper = Object.freeze(Object.assign({}, Batch, {
    createBatchRun: (c) => {
      const run = Batch.createBatchRun(c);
      return Object.freeze(Object.assign({}, run, { finish: () => { const r = run.finish(); vm.runInContext('projectPackBatchToken += 1;', sb); return r; } }));
    }
  }));
  const p = page({ batch: { B: wrapper, calls: null } });
  const sb = p.w;
  p.load('notification1458');
  p.start();
  p.drain();
  assert.equal(p.batch(), null, 'token が変わった後に確定した');
  assert.equal(p.els['pack-batch-result'].hidden, true);
  assert.equal(/全 3 ケースを計算しました/.test(p.status()), false);
  // context が別の instance に変わった場合も同じ
  const swap = Object.freeze(Object.assign({}, Batch, {
    createBatchRun: (c) => {
      const run = Batch.createBatchRun(c);
      return Object.freeze(Object.assign({}, run, { finish: () => { const r = run.finish();
        q.w.stagedProjectPackContext = ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.notification1458)));
        return r; } }));
    }
  }));
  const q = page({ batch: { B: swap, calls: null } });
  q.load('notification1458');
  q.start();
  q.drain();
  assert.equal(q.batch(), null, 'context が変わった後に確定した');
  assert.equal(/全 3 ケースを計算しました/.test(q.status()), false);
});

test('P2L-S3B3A-U16: 全ケース計算を始めると選択ケースの結果を消す。active context は変わらない', () => {
  const p = page();
  p.load('project_pressure_map');
  p.els['pack-exec-case'].value = 'G002';
  assert.equal(p.w.executeSelectedProjectPackCase(), true);
  assert.notEqual(p.w.stagedProjectPackExecution, null);
  p.start();
  assert.equal(p.w.stagedProjectPackExecution, null, '選択ケースの結果が残っている');
  assert.match(p.els['pack-exec-status'].textContent, /選択ケースの計算結果を消しました/);
  p.drain();
  assert.equal(p.batch().totalCases, 4);
  assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL);
  // Pack が無ければ計算しない（固定文）
  p.w.unloadProjectPack();
  assert.equal(p.start(), false);
  assert.equal(p.status(), FAILURE_TEXT);
  assert.equal(p.timers.length, 0);
});

test('P2L-S3B3A-U17: browser harness は登録され、Pack の検証器・adapter・executor・batch を Node で呼ばない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const inst = spec.instruments.find((i) => i.id === 'project-pack-batch');
  assert.ok(inst, 'verification-spec に project-pack-batch が無い');
  assert.equal(inst.command, 'node tools/browser-checks/project-pack-batch.mjs');
  assert.equal(inst.admissibility, 'UNVERIFIED');
  assert.ok(spec.browserAssertions.some((a) => a.id === 'project-pack-batch-explicit-atomic-unreviewed' && a.instrument === 'project-pack-batch'));
  const src = read('tools/browser-checks/project-pack-batch.mjs');
  assert.match(src, /openBrowser\(/);
  assert.match(src, /finishRun\(/);
  assert.equal(/validateProjectPack|fromProjectPack|executeCase\(|createBatchRun\(|executeAll\(|require\([^)]*(project-pack|project-context)/.test(src), false,
    'harness が Pack の検証器・adapter・executor・batch を使っている（新しい trust 経路）');
  assert.equal(/import[^;]*(project-pack|project-context)/.test(src), false);
  assert.match(src, /require\(REPO \+ 'wind-pressure\.js'\)/);
  assert.match(src, /require\(REPO \+ 'calc\.js'\)/);
  assert.match(src, /tests\/support\/synthetic-pack\.js/);
});
