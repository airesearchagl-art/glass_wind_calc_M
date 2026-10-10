'use strict';

/**
 * Phase 2L-B2 / S3-B3B1: index.html の Project Pack 派生レポート（明示操作・確定した一括結果からだけ・未レビュー）。
 *
 *   - 作るのは「JSONレポートを表示」「CSVレポートを表示」を押したときだけ。読込・選択・計算の開始・完了・
 *     ページの切替では作らない。JSON の後に CSV を押せば置き換える
 *   - 作る直前と表示の直前に、batch result が発行物で現在のもので、作成時の試行・context と一致し、
 *     計算中の run が無いことを確かめる
 *   - 新しい Pack の読込開始・読込失敗・解除・計算の開始・キャンセル・計算の失敗で消える
 *   - 失敗は固定文。Pack と一括の結果は残す
 *   - ダウンロード・Blob・クリップボード・保存・通信・console なし。入力 package・Workspace・Review へ流さない
 *
 * 前半は実行コードの静的な検査、後半は index.html の intake から派生レポートまでの block を vm で動かす
 * 挙動の検査（最小の偽 DOM・手で進める setTimeout・実際の ProjectPack / ProjectContext /
 * ProjectPackExecution / ProjectPackBatch / ProjectPackReport）。実ブラウザは tools/browser-checks/project-pack-report.mjs。
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
const Exec = require('../project-config/project-pack-execution.js');
const Batch = require('../project-config/project-pack-batch.js');
const Report = require('../project-config/project-pack-report.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);
const REPORT_SRC_REL = 'project-config/project-pack-report.js';

const FIXTURE = (name) => read('tests/fixtures/project-pack/' + name + '.json');
const FIXTURES = { notification1458: FIXTURE('synthetic-notification1458'),
  project_pressure_map: FIXTURE('synthetic-project-pressure-map'), case_direct: FIXTURE('synthetic-case-direct') };
const FAILURE_TEXT = 'レポートを生成できませんでした。現在有効な出力はありません。';
const PRIVACY_NOTE = 'このレポートにはガラス寸法・設計風圧などの案件入力値が含まれます。ブラウザからコピーして外部共有する場合は、内容と共有先を確認してください。';
const ADVISORY_NOTE = 'publication advisoryが0件でも公開安全の証明にはなりません。';
const STRONG_WORDING = /Verified|承認|確定|安全|問題なし|計算可能|公開可能|確認済|\bsafe\b|\bapproved\b/i;
const CSV_HEADER = 'caseId,paneId,floor,zone,sourceKind,trust,interpretation,pressureMode,pressureSource,widthMm,heightMm,' +
  'glassType,designPressure,evaluationHeightM,positivePressure,negativePressure,negativePressureMagnitude,bestCandidate,' +
  'allowablePressure,okCount,ngCount,outOfScopeCount,publicLabel';

/** top-level の関数 1 つ（次の top-level の function / var の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar '].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}

/** 派生レポート block（実行コード）。state 宣言から利用者の消去の関数の終わりまで。 */
function reportCode() {
  const start = CODE.indexOf('\nvar PACK_REPORT_MODULE');
  const end = CODE.indexOf('\nfunction ', CODE.indexOf('\nfunction clearProjectPackReportByUser(') + 1);
  assert.equal(start !== -1 && end > start, true, '派生レポート block が無い');
  return CODE.slice(start, end);
}

const REPORT_FUNCTIONS = ['renderProjectPackReportStatus', 'clearProjectPackReport', 'renderProjectPackReportControls',
  'projectPackReportIsCurrent', 'showProjectPackReport', 'clearProjectPackReportByUser'];

/* ============================================================
   静的
============================================================ */

test('P2L-S3B3B1-U01: report module は batch module の後に読み込み、UI は初期化時に 1 度だけ掴む', () => {
  const at = (src) => HTML.indexOf('<script src="' + src + '"></script>');
  assert.equal(at('project-config/project-pack-batch.js') !== -1 &&
    at('project-config/project-pack-batch.js') < at(REPORT_SRC_REL) && at(REPORT_SRC_REL) < at('workspace.js'), true);
  REPORT_FUNCTIONS.forEach((name) => assert.match(reportCode(), new RegExp('\\nfunction ' + name + '\\('), name));
  assert.match(reportCode(), /\nvar PACK_REPORT_MODULE = \(typeof ProjectPackReport === 'object' && ProjectPackReport\) \? ProjectPackReport : null;/);
  assert.equal((CODE.match(/(?<!\w)ProjectPackReport\b/g) || []).length, 3, 'ProjectPackReport の参照が初期化の 1 行以外にある');
});

test('P2L-S3B3B1-U02: 出力は明示操作だけ（読込・選択・計算の開始・完了・ページの切替では作らない）', () => {
  assert.match(STATIC, /<button type="button" id="btn-pack-report-json" class="btn-secondary"\s+onclick="showProjectPackReport\('json'\)" disabled>JSONレポートを表示<\/button>/);
  assert.match(STATIC, /<button type="button" id="btn-pack-report-csv" class="btn-secondary"\s+onclick="showProjectPackReport\('csv'\)" disabled>CSVレポートを表示<\/button>/);
  assert.match(STATIC, /<button type="button" id="btn-pack-report-clear" class="btn-secondary"\s+onclick="clearProjectPackReportByUser\(\)" disabled>出力を消去<\/button>/);
  assert.match(STATIC, /<textarea id="pack-report-out" rows="8" spellcheck="false" autocomplete="off" readonly hidden/);
  // showProjectPackReport を呼ぶのはボタンだけ。buildReport / serializeJson / toCsv は showProjectPackReport の中だけ
  assert.equal((CODE.match(/showProjectPackReport\(/g) || []).length, 1, 'コードから showProjectPackReport を呼んでいる');
  ['buildReport(', 'serializeJson(', 'toCsv('].forEach((t) =>
    assert.equal(CODE.split(t).length - 1, t === 'toCsv(' ? 2 : 1, t + ' の呼び出し箇所'));   // toCsv( は Workspace の既存 1 か所 + ここ
  const show = fnBody('showProjectPackReport');
  ['PACK_REPORT_MODULE.buildReport(batch)', 'PACK_REPORT_MODULE.serializeJson(report)', 'PACK_REPORT_MODULE.toCsv(report)']
    .forEach((s) => assert.equal(show.includes(s), true, s));
  ['loadProjectPackText', 'renderProjectPackPreview', 'renderProjectPackBatchControls', 'startProjectPackBatch',
    'stepProjectPackBatch', 'showProjectPackBatchPage', 'renderProjectPackBatchResult', 'cancelProjectPackBatch',
    'clearProjectPackBatch', 'projectPackExecutionCaseChanged', 'executeSelectedProjectPackCase']
    .forEach((fn) => assert.equal(/showProjectPackReport|buildReport|serializeJson|PACK_REPORT_MODULE\.toCsv/.test(fnBody(fn)), false, fn + ' が出力を作っている'));
});

test('P2L-S3B3B1-U03: 作る直前と表示の直前に、発行物・現在の結果・作成時の試行と context・計算中でないことを確かめる', () => {
  const cur = fnBody('projectPackReportIsCurrent');
  ['PACK_BATCH_MODULE.isBatchResult(batch)', 'batch === stagedProjectPackBatch', 'projectPackBatchJob === null',
    'projectPackBatchOrigin.batch === batch', 'projectPackBatchOrigin.attempt === projectPackAttempt',
    'projectPackBatchOrigin.ctx === stagedProjectPackContext']
    .forEach((s) => assert.equal(cur.includes(s), true, s));
  const show = fnBody('showProjectPackReport');
  const checks = [...show.matchAll(/if \(!projectPackReportIsCurrent\(batch\)\) throw/g)].map((m) => m.index);
  assert.equal(checks.length, 2);
  assert.equal(checks[0] < show.indexOf('buildReport('), true, '作る前に確かめていない');
  assert.equal(checks[1] > show.indexOf('toCsv(') && checks[1] < show.indexOf('out.value = text;'), true, '表示の直前に確かめていない');
  assert.match(show, /^function showProjectPackReport\(kind\) \{\n  clearProjectPackReport\(''\);/, '前の出力を消してから作っていない');
  // 一括の結果が消えるときは出力も消える。作成時の試行と context は確定のときに記録する
  const clearBatch = fnBody('clearProjectPackBatch');
  assert.match(clearBatch, /projectPackBatchOrigin = null;/);
  assert.match(clearBatch, /clearProjectPackReport\(/);
  assert.match(fnBody('stepProjectPackBatch'), /stagedProjectPackBatch = result;\n  projectPackBatchOrigin = \{ batch: result, attempt: job\.attempt, ctx: job\.ctx \};/);
  const clear = fnBody('clearProjectPackReport');
  ['projectPackReportOutput = null;', "out.value = ''; out.hidden = true;"].forEach((s) => assert.equal(clear.includes(s), true, s));
  // 出力を置くのは表示の 1 か所だけ
  assert.deepEqual(CODE.match(/projectPackReportOutput = (?!null)[^;]+;/g), ['projectPackReportOutput = { kind: kind, batch: batch, rows: report.totalCases };']);
});

test('P2L-S3B3B1-U04: ダウンロード・Blob・クリップボード・保存・通信・console なし。入力 package・Workspace・Review へ流さない', () => {
  const block = reportCode();
  ['Blob', 'createObjectURL', 'download', 'clipboard', 'execCommand', 'localStorage', 'sessionStorage', 'indexedDB',
    'document.cookie', 'caches', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'location', 'history.', 'console.',
    'innerHTML', 'insertAdjacentHTML', 'eval(', 'e.message', 'e.stack', 'String(e)', 'activeProjectContext', 'ProjectInput',
    'WorkspaceCore', 'workspace', 'ReviewPackage', 'Scenario', 'ProjectProfile', 'EvidenceClosure', 'Promotion',
    'GlassCalc', 'WindPressure', 'ProjectPackExecution', 'createBatchRun', 'stagedProjectPack.', 'sourceClaim']
    .forEach((token) => assert.equal(block.includes(token), false, '派生レポート block が ' + token + ' を使っている'));
  // 触る DOM は派生レポートの欄だけ（Workspace の取り込み欄・入力欄などへ書かない）
  const ids = [...block.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  ids.push(...[...block.matchAll(/\[('btn-pack-report-[^']+'(?:, )?)+\]/g)].join(' ').match(/btn-pack-report-[a-z]+/g) || []);
  assert.equal(ids.length > 0 && ids.every((id) => /^(pack-report-(out|status)|btn-pack-report-(json|csv|clear))$/.test(id)), true,
    '派生レポート block が自分の欄以外の要素に触れている: ' + ids.join(','));
  assert.equal(/querySelector|\.forms\b|\bdocument\.body\b/.test(block), false);
  // 取り込み側・一括計算側の state を消さない（レポートの失敗で Pack と一括の結果は残る）
  assert.equal(/beginProjectPackAttempt|stagedProjectPack(?:Context|Batch)? = |unloadProjectPack|renderProjectPackFailure|clearProjectPackBatch\(/.test(block), false);
});

test('P2L-S3B3B1-U05: 文言——未レビュー・計算済み ≠ 検証済み・案件入力値の注意・advisory の注意。失敗は固定文', () => {
  const from = STATIC.indexOf('<div class="pack-report" id="pack-report">');
  assert.notEqual(from, -1);
  const section = STATIC.slice(from, STATIC.indexOf('</textarea>', from));
  assert.match(section, /Project Pack 派生レポート（未レビュー）/);
  assert.match(section, /計算済み ≠ 検証済み/);
  assert.match(section, /pack_unreviewed/);
  assert.equal(section.includes(PRIVACY_NOTE), true);
  assert.equal(section.includes(ADVISORY_NOTE), true);
  assert.match(section, /これらの注意は privacy の判定や検証を意味しません。/);
  assert.match(section, /再計算用の入力ではありません/);
  const literals = (reportCode().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
  const strong = (section + '\n' + literals).replace(/計算済み ≠ 検証済み/g, '').replace(ADVISORY_NOTE, '');
  assert.equal(STRONG_WORDING.test(strong), false, (strong.match(STRONG_WORDING) || [])[0]);
  assert.equal(/検証済/.test(strong), false);
  assert.match(CODE, /var PROJECT_PACK_REPORT_FAILURE = 'レポートを生成できませんでした。現在有効な出力はありません。';/);
  assert.match(fnBody('showProjectPackReport'), /renderProjectPackReportStatus\(PROJECT_PACK_REPORT_FAILURE, true\);/);
});

/* ============================================================
   挙動: intake から派生レポートまでの block を vm で動かす
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
const IDS = ['pack-status', 'pack-preview', 'pack-paste', 'pack-file', 'pack-drop', 'pack-exec', 'pack-exec-case',
  'btn-pack-exec', 'pack-exec-status', 'pack-exec-result', 'pack-batch', 'btn-pack-batch', 'btn-pack-batch-cancel',
  'pack-batch-progress', 'pack-batch-status', 'pack-batch-result', 'pack-report', 'btn-pack-report-json',
  'btn-pack-report-csv', 'btn-pack-report-clear', 'pack-report-status', 'pack-report-out'];

/** 本物の executor を包み、failAt(caseId) が true のケースだけ失敗させる batch module（vm で初期化）。 */
function batchOver(failAt) {
  const wrapped = Object.freeze(Object.assign({}, Exec, {
    executeCase: (c, id) => { if (failAt(id)) throw new Error('forced failure ' + id); return Exec.executeCase(c, id); }
  }));
  const sb = { ProjectPackExecution: wrapped };
  vm.createContext(sb);
  vm.runInContext(read('project-config/project-pack-batch.js'), sb, { filename: 'project-pack-batch.js' });
  return sb.ProjectPackBatch;
}

/** batch module に合わせて report module を vm で初期化する（hooks で関数を差し替えられる）。 */
function reportOver(batchModule, hooks) {
  const sb = { ProjectPackBatch: batchModule, TextEncoder };
  vm.createContext(sb);
  vm.runInContext(read(REPORT_SRC_REL), sb, { filename: REPORT_SRC_REL });
  return hooks ? Object.freeze(Object.assign({}, sb.ProjectPackReport, hooks(sb.ProjectPackReport))) : sb.ProjectPackReport;
}

function page(options) {
  const opts = options || {};
  const els = {};
  IDS.forEach((id) => { els[id] = new FakeElement(id === 'pack-exec-case' ? 'select' : id === 'pack-report-out' ? 'textarea' : 'div'); });
  ['pack-exec', 'pack-exec-result', 'pack-batch', 'pack-batch-result', 'pack-batch-progress', 'pack-report-out']
    .forEach((id) => { els[id].hidden = true; });
  ['pack-exec-case', 'btn-pack-exec', 'btn-pack-batch', 'btn-pack-batch-cancel', 'btn-pack-report-json',
    'btn-pack-report-csv', 'btn-pack-report-clear'].forEach((id) => { els[id].disabled = true; });
  const timers = [];
  const B = opts.batch || Batch;
  const R = opts.report || (opts.batch ? reportOver(opts.batch) : Report);
  const sandbox = {
    document: { getElementById: (id) => els[id] || null, createElement: (tag) => new FakeElement(tag) },
    ProjectPack: Pack, ProjectContext, ProjectPackExecution: Exec, ProjectPackBatch: B, ProjectPackReport: R, TextEncoder,
    JSON: { parse: (...a) => JSON.parse(...a), stringify: JSON.stringify },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    activeProjectContext: ACTIVE_SENTINEL
  };
  vm.createContext(sandbox);
  vm.runInContext(blockSource(), sandbox, { filename: 'index.html#project-pack' });
  const w = sandbox;
  const tick = () => { const t = timers.shift(); if (!t) return false; t(); return true; };
  const drain = () => { let n = 0; while (tick()) { n++; if (n > 10000) throw new Error('runaway'); } return n; };
  const out = els['pack-report-out'];
  return {
    w, els, timers, tick, drain,
    load: (mode) => w.loadProjectPackText(FIXTURES[mode], '貼り付け'),
    loadPack: (pack) => w.loadProjectPackText(JSON.stringify(pack), '貼り付け'),
    runBatch: () => { w.startProjectPackBatch(); drain(); return w.stagedProjectPackBatch; },
    json: () => w.showProjectPackReport('json'),
    csv: () => w.showProjectPackReport('csv'),
    output: () => ({ value: out.value, hidden: out.hidden }),
    status: () => els['pack-report-status'].textContent,
    statusError: () => els['pack-report-status'].className === 'pack-status is-error',
    buttons: () => ({ json: els['btn-pack-report-json'].disabled, csv: els['btn-pack-report-csv'].disabled,
      clear: els['btn-pack-report-clear'].disabled })
  };
}
const EMPTY = { value: '', hidden: true };
const DISABLED = { json: true, csv: true, clear: true };

test('P2L-S3B3B1-U06: 一括の結果が確定するまでボタンは押せず、出力も無い', () => {
  const p = page();
  assert.deepEqual(p.buttons(), DISABLED);
  assert.equal(p.load('notification1458'), true);
  assert.deepEqual(p.buttons(), DISABLED, 'Pack の読込だけで押せる');
  assert.deepEqual(p.output(), EMPTY);
  p.w.startProjectPackBatch();
  assert.deepEqual(p.buttons(), DISABLED, '計算中に押せる');
  assert.equal(p.json(), false, '計算中に出力した');
  assert.equal(p.status(), FAILURE_TEXT);
  p.drain();
  assert.deepEqual(p.buttons(), { json: false, csv: false, clear: true });
  assert.deepEqual(p.output(), EMPTY, '計算の完了で自動的に出力した');
  assert.equal(p.status(), 'JSON / CSV の派生レポートは、ボタンを押したときだけ作ります。');
  // ページの切替でも作らない
  p.w.showProjectPackBatchPage(0);
  assert.deepEqual(p.output(), EMPTY);
});

test('P2L-S3B3B1-U07: JSON を出し、CSV で置き換え、消去できる（値は report module の契約どおり）', () => {
  const p = page();
  p.load('notification1458');
  const batch = p.runBatch();
  assert.equal(p.json(), true);
  const json = p.output();
  assert.equal(json.hidden, false);
  const back = JSON.parse(json.value);
  assert.equal(back.reportType, 'glass_wind_pack_derived_report');
  assert.equal(back.trust, 'pack_unreviewed');
  assert.equal(back.interpretation, 'calculated_not_verified');
  assert.deepEqual(back.rows.map((r) => r.caseId), ['G001', 'G002', 'G003']);
  assert.equal(back.rows[1].negativePressure, -1409.5342125273235);
  assert.match(p.status(), /^JSON レポートを表示しました（全 3 ケース・未レビュー。計算済み ≠ 検証済み）。/);
  assert.deepEqual(p.buttons(), { json: false, csv: false, clear: false });
  assert.equal(p.csv(), true);
  const csv = p.output();
  assert.equal(csv.value.startsWith(CSV_HEADER + '\r\n'), true, 'CSV が JSON を置き換えていない');
  assert.equal(csv.value.includes('"reportType"'), false);
  assert.equal(csv.value.split('\r\n').length, 1 + 3 + 1);
  assert.match(p.status(), /^CSV レポートを表示しました/);
  // 出力しても一括の結果・Pack・active は変わらない
  assert.equal(p.w.stagedProjectPackBatch, batch);
  assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL);
  assert.equal(p.w.clearProjectPackReportByUser(), true);
  assert.deepEqual(p.output(), EMPTY);
  assert.equal(p.status(), '出力を消去しました。現在有効な出力はありません。');
  assert.deepEqual(p.buttons(), { json: false, csv: false, clear: true });
});

test('P2L-S3B3B1-U08: 3 mode の出力（map の負圧は絶対値・case_direct は正負圧の列が空欄）', () => {
  const p = page();
  p.load('project_pressure_map');
  p.runBatch();
  p.csv();
  const map = p.output().value.split('\r\n')[2].split(',');
  assert.deepEqual(map.slice(0, 4), ['G002', 'P002', '5', 'corner']);
  assert.deepEqual(map.slice(12, 17), ['1835', '', '1135', '', '1835']);
  p.load('case_direct');
  assert.deepEqual(p.output(), EMPTY, '新しい Pack で前の出力が消えない');
  p.runBatch();
  p.json();
  const direct = JSON.parse(p.output().value);
  assert.equal(direct.pressureMode, 'case_direct');
  assert.deepEqual(Object.keys(direct.rows[1]), ['caseId', 'paneId', 'floor', 'glassType', 'widthMm', 'heightMm',
    'designPressure', 'pressureSource', 'bestCandidate', 'okCount', 'ngCount', 'outOfScopeCount']);
  p.csv();
  const row = p.output().value.split('\r\n')[2].split(',');
  assert.deepEqual(row.slice(0, 4), ['G002', 'P002', '2', '']);
  assert.deepEqual(row.slice(12, 17), ['1365', '', '', '', '']);
});

test('P2L-S3B3B1-U09: 古い出力は、新しい Pack・読込失敗・解除・計算の開始・キャンセル・計算の失敗で消える', () => {
  const shown = (p) => { assert.equal(p.json(), true); assert.equal(p.output().hidden, false); };
  // 新しい Pack の読込
  {
    const p = page();
    p.load('notification1458'); p.runBatch(); shown(p);
    p.load('project_pressure_map');
    assert.deepEqual(p.output(), EMPTY);
    assert.deepEqual(p.buttons(), DISABLED);
  }
  // 読込失敗
  {
    const p = page();
    p.load('notification1458'); p.runBatch(); shown(p);
    assert.equal(p.w.loadProjectPackText('{"schemaVersion": 1', '貼り付け'), false);
    assert.deepEqual(p.output(), EMPTY);
    assert.deepEqual(p.buttons(), DISABLED);
  }
  // 解除
  {
    const p = page();
    p.load('case_direct'); p.runBatch(); shown(p);
    p.w.unloadProjectPack();
    assert.deepEqual(p.output(), EMPTY);
    assert.equal(p.w.projectPackReportOutput, null);
  }
  // 計算の開始（再生成）とキャンセル
  {
    const p = page();
    p.loadPack(syntheticPack(100, 'notification1458'));
    p.runBatch(); shown(p);
    p.w.startProjectPackBatch();
    assert.deepEqual(p.output(), EMPTY, '計算の開始で前の出力が消えない');
    assert.match(p.status(), /派生レポートを消しました/);
    assert.deepEqual(p.buttons(), DISABLED);
    p.tick();
    assert.equal(p.w.cancelProjectPackBatch(), true);
    assert.deepEqual(p.output(), EMPTY);
    assert.deepEqual(p.buttons(), DISABLED, 'キャンセルの後に押せる（一括の結果が無い）');
    p.drain();
    assert.deepEqual(p.output(), EMPTY);
    p.runBatch(); shown(p);
    p.w.startProjectPackBatch(); p.tick();
    p.w.cancelProjectPackBatch();
    assert.deepEqual(p.output(), EMPTY);
  }
  // 計算の失敗（同じ Pack で、2 回目の計算だけ途中のケースが失敗する）
  {
    let failing = false;
    const B = batchOver((id) => failing && id === 'G0040');
    const p = page({ batch: B });
    p.loadPack(syntheticPack(80, 'case_direct'));
    p.runBatch(); shown(p);
    failing = true;
    p.runBatch();
    assert.equal(p.w.stagedProjectPackBatch, null, '前提: 計算が失敗した');
    assert.notEqual(p.w.stagedProjectPackContext, null, '前提: Pack は残る');
    assert.deepEqual(p.output(), EMPTY);
    assert.deepEqual(p.buttons(), DISABLED);
    assert.equal(p.json(), false);
    assert.deepEqual(p.output(), EMPTY);
  }
});

test('P2L-S3B3B1-U10: 作成時の試行・context・結果と違えば出力しない（fail closed・固定文）', () => {
  const setup = () => { const p = page(); p.load('project_pressure_map'); p.runBatch(); return p; };
  const failsClosed = (p, why) => {
    assert.equal(p.json(), false, why);
    assert.deepEqual(p.output(), EMPTY, why);
    assert.equal(p.status(), FAILURE_TEXT, why);
    assert.equal(p.statusError(), true, why);
    assert.equal(p.csv(), false, why);
    assert.deepEqual(p.output(), EMPTY, why);
  };
  {
    const p = setup();
    vm.runInContext('projectPackAttempt += 1;', p.w);
    failsClosed(p, '試行が変わった');
  }
  {
    const p = setup();
    p.w.stagedProjectPackContext = ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.project_pressure_map)));
    failsClosed(p, 'context が別の instance');
  }
  {
    const p = setup();
    p.w.stagedProjectPackBatch = JSON.parse(JSON.stringify(p.w.stagedProjectPackBatch));
    failsClosed(p, '結果が発行物でない複製');
  }
  {
    const p = setup();
    const other = Batch.executeAll(p.w.stagedProjectPackContext);
    p.w.stagedProjectPackBatch = other;
    failsClosed(p, '結果が作成時のものと違う（発行物ではある）');
  }
  {
    const p = setup();
    p.w.projectPackBatchJob = { run: { cancel: () => true } };
    failsClosed(p, '計算中の run がある');
  }
  {
    const p = setup();
    assert.equal(p.w.showProjectPackReport('xml'), false);
    assert.equal(p.status(), FAILURE_TEXT);
  }
});

test('P2L-S3B3B1-U11: 生成の失敗は固定文だけで、Pack と一括の結果は残る。前の出力も消える', () => {
  const secret = 'SECRET-REPORT-ERROR /private/path';
  const R = reportOver(Batch, (real) => ({ toCsv: () => { throw new Error(secret); },
    serializeJson: (r) => real.serializeJson(r) }));
  const p = page({ report: R });
  p.load('notification1458');
  const batch = p.runBatch();
  const ctx = p.w.stagedProjectPackContext;
  assert.equal(p.json(), true);
  assert.equal(p.csv(), false);
  assert.deepEqual(p.output(), EMPTY, '失敗の後に前の JSON が残っている');
  assert.equal(p.status(), FAILURE_TEXT);
  assert.equal(p.status().includes('SECRET'), false);
  assert.equal(p.w.stagedProjectPackBatch, batch, '一括の結果を捨てた');
  assert.equal(p.w.stagedProjectPackContext, ctx, 'Pack を捨てた');
  assert.equal(p.els['pack-batch-result'].hidden, false);
  assert.deepEqual(p.buttons(), { json: false, csv: false, clear: true });
  assert.equal(p.json(), true, '失敗の後に作り直せない');
  // 上限を超える出力も同じ扱い（切り詰めずに失敗）
  const tiny = page({ report: reportOver(Batch, (real) => ({ serializeJson: () => { throw new Error('json: output exceeds 1 bytes (not truncated)'); },
    toCsv: real.toCsv })) });
  tiny.load('case_direct');
  tiny.runBatch();
  assert.equal(tiny.json(), false);
  assert.deepEqual(tiny.output(), EMPTY);
  assert.equal(tiny.status(), FAILURE_TEXT);
});

test('P2L-S3B3B1-U12: 2000 ケースの一括結果から JSON / CSV の全行を出し、ページを切り替えても内容は変わらない', () => {
  const p = page();
  p.loadPack(syntheticPack(2000, 'project_pressure_map'));
  p.runBatch();
  assert.equal(p.json(), true);
  const json = p.output().value;
  assert.equal(JSON.parse(json).rows.length, 2000);
  p.w.showProjectPackBatchPage(5);
  assert.equal(p.output().value, json, 'ページの切替で出力が変わった');
  assert.equal(p.csv(), true);
  const lines = p.output().value.split('\r\n');
  assert.equal(lines.length, 2002);
  assert.equal(lines[1].startsWith('G0001,'), true);
  assert.equal(lines[2000].startsWith('G2000,'), true);
});

test('P2L-S3B3B1-U13: browser harness は登録され、Pack の検証器・adapter・executor・batch・report を Node で呼ばない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const inst = spec.instruments.find((i) => i.id === 'project-pack-report');
  assert.ok(inst, 'verification-spec に project-pack-report が無い');
  assert.equal(inst.command, 'node tools/browser-checks/project-pack-report.mjs');
  assert.equal(inst.admissibility, 'UNVERIFIED');
  assert.ok(spec.browserAssertions.some((a) => a.id === 'project-pack-report-explicit-derived-unreviewed' && a.instrument === 'project-pack-report'));
  const src = read('tools/browser-checks/project-pack-report.mjs');
  assert.match(src, /openBrowser\(/);
  assert.match(src, /finishRun\(/);
  assert.equal(/validateProjectPack|fromProjectPack|executeCase\(|createBatchRun\(|executeAll\(|buildReport\(|serializeJson\(|toCsv\(|require\([^)]*(project-pack|project-context)/.test(src), false,
    'harness が Pack の検証器・adapter・executor・batch・report を使っている（新しい trust 経路）');
  assert.equal(/import[^;]*(project-pack|project-context)/.test(src), false);
  assert.match(src, /require\(REPO \+ 'wind-pressure\.js'\)/);
  assert.match(src, /require\(REPO \+ 'calc\.js'\)/);
});
