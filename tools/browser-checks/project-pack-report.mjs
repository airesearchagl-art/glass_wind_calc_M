// Project Pack Derived Report（Phase 2L-B2 / S3-B3B1）を実ブラウザで確かめる。
//
// この harness は page の UI（貼り付け・全ケース計算・キャンセル・解除・ページ切替・JSON / CSV の表示・消去）だけを
// 操作して、出力欄のテキストと page の状態を観測する。Pack の検証器・adapter・executor・batch・report module を
// Node 側で読み込んだり呼んだりしない。期待値は page の外で作る: fixture の literal と、wind-pressure.js・calc.js を
// Node で直接呼んだ値（report の出力からは作らない）。CSV はこの harness の中の小さな RFC 4180 parser で読む。
// 多ケースの Pack は tests/support/synthetic-pack.js がその場で作る合成のもの（ファイルに保存しない）。
//
// 故障の注入（途中のケースの失敗）は、新しい page の初期化 script で page 内の global への代入を包んで行う
// （S3-B2 / S3-B3A の harness と同じく、page の中だけの操作）。
//
// 確かめること:
//   1 起動時は出力なし  2 Pack の読込では出力なし  3 一括の結果が確定するまでボタンは押せない
//   4 notification の JSON  5 map の CSV  6 case_direct の CSV / JSON  7 2000 行  8 ページ切替で内容は不変
//   9 JSON → CSV の置き換え  10 Pack の再読込で消える  11 読込失敗で消える  12 キャンセルで消える
//   13 計算の失敗で消える  14 手動の消去  15 数式の中和  16 保存・通信・URL・console・ダウンロード・クリップボードなし
//   17 active runtime は不変  加えて: 自動では出力しない・申告で出力が変わらない・後から差し替えた batch module を使わない
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const FIXTURE_DIR = REPO + 'tests/fixtures/project-pack/';

// 期待値の oracle（page の外・executor / batch / report を使わない）
const Wind = require(REPO + 'wind-pressure.js');
const Glass = require(REPO + 'calc.js');
const Registry = require(REPO + 'project-config/registry.js');
const { syntheticPack } = require(REPO + 'tests/support/synthetic-pack.js');
const RUNTIME_DEFAULT = Registry.getBuiltInPreset(Registry.getRuntimeDefaultBuiltInPresetId());

const FIXTURES = {
  notification1458: 'synthetic-notification1458.json',
  project_pressure_map: 'synthetic-project-pressure-map.json',
  case_direct: 'synthetic-case-direct.json'
};
const fixtureText = (mode) => fs.readFileSync(FIXTURE_DIR + FIXTURES[mode], 'utf8');
const fixture = (mode) => JSON.parse(fixtureText(mode));

function glassOf(glassType, widthMm, heightMm, designPressure) {
  const s = Glass.splitCandidates(Glass.generateCandidates(glassType, Glass.paneAreaM2(widthMm, heightMm), designPressure, 1));
  const best = s.okCandidates[0];
  return { bestCandidate: best ? { label: best.label, P: best.P } : null, okCount: s.okCandidates.length,
    ngCount: s.ngCandidates.length, outOfScopeCount: s.outOfScopeCandidates.length };
}
const windOf = (wc, evaluationHeightM, zone) => Wind.calculateWindPressure({ V0: wc.V0.value, roughnessCategory: wc.roughnessCategory,
  buildingHeightM: wc.buildingHeightM.value, eavesHeightM: wc.eavesHeightM.value, evaluationHeightM,
  buildingType: wc.buildingType, zone, basis: wc.basis });

const N = windOf(fixture('notification1458').windConditions, 10.2, 'corner');
const EXPECT_ROW = {
  notification1458: Object.assign({ caseId: 'G002', paneId: 'P002', floor: '3', zone: 'corner', glassType: 'lowe_fl', widthMm: 760,
    heightMm: 1880, designPressure: N.designPressure, pressureSource: 'pack_notification_calculation', evaluationHeightM: 10.2,
    positivePressure: N.positive.pressure, negativePressure: N.negative.pressure }, glassOf('lowe_fl', 760, 1880, N.designPressure)),
  project_pressure_map: Object.assign({ caseId: 'G002', paneId: 'P002', floor: '5', zone: 'corner', glassType: 'tp_single',
    widthMm: 760, heightMm: 1880, designPressure: 1835, pressureSource: 'pack_pressure_map_lookup', positivePressure: 1135,
    negativePressureMagnitude: 1835 }, glassOf('tp_single', 760, 1880, 1835)),
  case_direct: Object.assign({ caseId: 'G002', paneId: 'P002', floor: '2', glassType: 'lowe_fl', widthMm: 760, heightMm: 1880,
    designPressure: 1365, pressureSource: 'pack_case_direct' }, glassOf('lowe_fl', 760, 1880, 1365))
};
const LABELS = { notification1458: 'Synthetic Pack N1458', project_pressure_map: 'Synthetic Pack Map', case_direct: 'Synthetic Pack Direct' };
const COUNTS = { notification1458: 3, project_pressure_map: 4, case_direct: 2 };
const CSV_HEADER = ['caseId', 'paneId', 'floor', 'zone', 'sourceKind', 'trust', 'interpretation', 'pressureMode', 'pressureSource',
  'widthMm', 'heightMm', 'glassType', 'designPressure', 'evaluationHeightM', 'positivePressure', 'negativePressure',
  'negativePressureMagnitude', 'bestCandidate', 'allowablePressure', 'okCount', 'ngCount', 'outOfScopeCount', 'publicLabel'];
const REPORT_KEYS = ['reportType', 'schemaVersion', 'sourceKind', 'trust', 'interpretation', 'publicLabel', 'pressureMode',
  'units', 'totalCases', 'executedCases', 'rows'];
const FAILURE_TEXT = 'レポートを生成できませんでした。現在有効な出力はありません。';
const ADVISORY_NOTE = 'publication advisoryが0件でも公開安全の証明にはなりません。';
const PRIVACY_NOTE = 'このレポートにはガラス寸法・設計風圧などの案件入力値が含まれます。ブラウザからコピーして外部共有する場合は、内容と共有先を確認してください。';
const STRONG_WORDING = /Verified|承認|確定|安全|問題なし|計算可能|公開可能|確認済|\bsafe\b|\bapproved\b/i;

/**
 * RFC 4180 の CSV を読む（harness 専用の小さな parser）。module の CSV は CRLF で行を区切るが、textarea の
 * value は HTML の仕様で改行を LF に正規化して返すので、ここでは CRLF と LF のどちらも行の区切りとして読む。
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') throw new Error('bare CR');
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const header = rows[0] || [];
  return { header, records: rows.slice(1).map((cells) => Object.fromEntries(header.map((h, k) => [h, cells[k]]))) };
}
const csvCell = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * 計算値の比較。告示 mode の風圧は Math の関数（累乗・対数）を通るので、Node の V8 と Chromium の V8 で最下位の
 * 桁（1 ulp 程度）がずれることがある（実測: G002 の設計風圧 1685.04324816824 と 1685.0432481682399）。
 * report は page の中で計算した値をそのまま全桁で書くので、ここでは数値を相対 1e-12 で比べる。key の並びは厳密に比べる。
 */
function sameValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.join('|') === kb.join('|') && ka.every((k) => sameValue(a[k], b[k]));
  }
  return a === b;
}
const NUMERIC_COLUMNS = ['widthMm', 'heightMm', 'designPressure', 'evaluationHeightM', 'positivePressure', 'negativePressure',
  'negativePressureMagnitude', 'allowablePressure', 'okCount', 'ngCount', 'outOfScopeCount'];
/** CSV の数値セル: 空欄どうし、または number の文字列表現（全桁）で値が sameValue。 */
function sameCell(column, got, want) {
  if (!NUMERIC_COLUMNS.includes(column)) return got === want;
  if (want === '' || got === '') return got === want;
  return String(Number(got)) === got && sameValue(Number(got), Number(want));
}

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('project-pack-report', () => ({ checksRun: pass + fail, failures: fail }));

const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });

/** 保存・通信・URL・ダウンロード・クリップボードの呼び出しを数える（page を読み込む前に仕込む）。 */
const PROBE = () => {
  const calls = { storage: 0, cookie: 0, idb: 0, caches: 0, beacon: 0, fetch: 0, xhr: 0, history: 0, blob: 0, clipboard: 0, open: 0 };
  window.__reportProbe = calls;
  const wrap = (obj, name, key) => {
    try {
      const orig = obj[name];
      if (typeof orig !== 'function') return;
      obj[name] = function () { calls[key]++; return orig.apply(this, arguments); };
    } catch (e) { /* 読み取り専用なら数えない */ }
  };
  try { wrap(Storage.prototype, 'setItem', 'storage'); } catch (e) { /* none */ }
  try {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true,
      get() { return desc.get.call(this); }, set(v) { calls.cookie++; return desc.set.call(this, v); } });
  } catch (e) { /* none */ }
  if (window.indexedDB) wrap(window.indexedDB, 'open', 'idb');
  if (window.caches) wrap(window.caches, 'open', 'caches');
  wrap(navigator, 'sendBeacon', 'beacon');
  wrap(window, 'fetch', 'fetch');
  wrap(XMLHttpRequest.prototype, 'open', 'xhr');
  wrap(history, 'pushState', 'history');
  wrap(history, 'replaceState', 'history');
  wrap(URL, 'createObjectURL', 'blob');
  wrap(window, 'open', 'open');
  try { if (navigator.clipboard) { wrap(navigator.clipboard, 'writeText', 'clipboard'); wrap(navigator.clipboard, 'write', 'clipboard'); } } catch (e) { /* none */ }
  try { wrap(Document.prototype, 'execCommand', 'clipboard'); } catch (e) { /* none */ }
};

const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];
const requests = [];
const downloads = [];
page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith('file://')) requests.push(r.url()); });
page.on('download', (d) => downloads.push(d.suggestedFilename()));
await page.addInitScript(PROBE);
await page.goto(FILE);
await page.waitForTimeout(400);

/* ---------- helpers ---------- */

async function paste(p, text) {
  await p.evaluate((t) => { document.getElementById('pack-paste').value = t; }, text);
  await p.click('#btn-pack-load');
  await p.waitForTimeout(50);
}
const batchSettled = () => !!window.stagedProjectPackBatch ||
  /キャンセル|完了できません|中止/.test(document.getElementById('pack-batch-status').textContent);
async function runBatch(p) {
  await p.click('#btn-pack-batch');
  await p.waitForFunction(batchSettled, null, { timeout: 120000, polling: 20 });
  await p.waitForTimeout(20);
}
async function waitMidRun(p) {
  await p.waitForFunction(() => {
    const m = /計算中… (\d+) \/ (\d+)/.exec(document.getElementById('pack-batch-status').textContent);
    return m && Number(m[1]) > 0 && Number(m[1]) < Number(m[2]);
  }, null, { timeout: 60000, polling: 5 });
}
/** 派生レポート欄の状態。 */
async function reportState(p) {
  return p.evaluate(() => {
    const out = document.getElementById('pack-report-out');
    const section = document.getElementById('pack-report');
    const status = document.getElementById('pack-report-status');
    return {
      value: out.value, outHidden: out.hidden, outVisible: getComputedStyle(out).display !== 'none', readOnly: out.readOnly,
      sectionVisible: !!section.offsetParent, sectionText: section.innerText,
      status: status.textContent, statusError: status.classList.contains('is-error'),
      json: document.getElementById('btn-pack-report-json').disabled,
      csv: document.getElementById('btn-pack-report-csv').disabled,
      clear: document.getElementById('btn-pack-report-clear').disabled,
      batch: !!window.stagedProjectPackBatch, packStaged: !!window.stagedProjectPackContext,
      batchStatus: document.getElementById('pack-batch-status').textContent
    };
  });
}
async function show(p, kind) {
  await p.click(kind === 'json' ? '#btn-pack-report-json' : '#btn-pack-report-csv');
  await p.waitForTimeout(30);
  return reportState(p);
}
const empty = (s) => s.value === '' && s.outHidden && !s.outVisible;

async function activeSnapshot() {
  return page.evaluate(() => {
    const ctx = activeProjectContext;
    const opts = (id) => [...document.querySelectorAll('#' + id + ' option')].map((o) => o.value + '=' + o.textContent);
    const text = (id) => { const el = document.getElementById(id); return el ? el.innerText : null; };
    return {
      sameObject: ctx === window.__activeAtStart,
      sourceKind: ctx && ctx.sourceKind, trust: ctx && ctx.trust, publicLabel: ctx && ctx.publicLabel,
      mode: document.getElementById('inp-mode').value, presetLabel: text('preset-name-label'),
      floors: opts('inp-floor').join('|'), zones: opts('inp-zone').join('|'),
      w: document.getElementById('inp-W').value, h: document.getElementById('inp-H').value,
      result: text('result-area'), batchView: text('view-batch'),
      // Pack 欄の外の入力・取り込み欄（Workspace の JSON / TSV など）は変わらない
      otherFields: [...document.querySelectorAll('textarea, input')].filter((el) => !/^pack-/.test(el.id))
        .map((el) => el.id + '=' + (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)).join('|')
    };
  });
}

function checkJson(id, s, mode) {
  let r = null;
  try { r = JSON.parse(s.value); } catch (e) { /* r stays null */ }
  check(id + '-shown', !s.outHidden && s.outVisible && s.readOnly && r !== null && s.status.startsWith('JSON レポートを表示しました'),
    s.status);
  if (!r) return;
  check(id + '-contract', JSON.stringify(Object.keys(r)) === JSON.stringify(REPORT_KEYS) &&
    r.reportType === 'glass_wind_pack_derived_report' && r.schemaVersion === 1 && r.sourceKind === 'project_pack_unreviewed' &&
    r.trust === 'pack_unreviewed' && r.interpretation === 'calculated_not_verified' && r.publicLabel === LABELS[mode] &&
    r.pressureMode === mode && r.totalCases === COUNTS[mode] && r.executedCases === COUNTS[mode] && r.rows.length === COUNTS[mode],
    `${r.trust}/${r.interpretation}/${r.pressureMode}/${r.rows.length}`);
  const g = r.rows.find((x) => x.caseId === 'G002');
  check(id + '-G002', !!g && sameValue(g, EXPECT_ROW[mode]), JSON.stringify(g));
  check(id + '-no-leak', !/verified|approved|attested|provenance|formula|sourceClaim|claimed|candidates|notificationTrace|batchType|合成テスト用/i
    .test(s.value.replace(/calculated_not_verified/g, '')),
    'trust の昇格・申告・provenance・候補の全件・batch の field を含まない');
}

function checkCsv(id, s, mode) {
  const { header, records } = parseCsv(s.value);
  check(id + '-shown', !s.outHidden && s.outVisible && s.status.startsWith('CSV レポートを表示しました') &&
    s.value.endsWith('\n') && !/\r(?!\n)/.test(s.value), s.status);
  check(id + '-header', JSON.stringify(header) === JSON.stringify(CSV_HEADER), header.join(','));
  check(id + '-rows', records.length === COUNTS[mode] && records.every((rec) => rec.sourceKind === 'project_pack_unreviewed' &&
    rec.trust === 'pack_unreviewed' && rec.interpretation === 'calculated_not_verified' && rec.pressureMode === mode &&
    rec.publicLabel === LABELS[mode]), `${records.length} rows`);
  const g = records.find((x) => x.caseId === 'G002') || {};
  const w = EXPECT_ROW[mode];
  const want = { caseId: 'G002', paneId: 'P002', floor: csvCell(w.floor), zone: csvCell(w.zone), pressureSource: w.pressureSource,
    widthMm: '760', heightMm: '1880', glassType: w.glassType, designPressure: String(w.designPressure),
    evaluationHeightM: csvCell(w.evaluationHeightM), positivePressure: csvCell(w.positivePressure),
    negativePressure: csvCell(w.negativePressure), negativePressureMagnitude: csvCell(w.negativePressureMagnitude),
    bestCandidate: w.bestCandidate.label, allowablePressure: String(w.bestCandidate.P), okCount: String(w.okCount),
    ngCount: String(w.ngCount), outOfScopeCount: String(w.outOfScopeCount) };
  const diff = Object.keys(want).filter((k) => !sameCell(k, g[k], want[k]));
  check(id + '-G002', diff.length === 0, diff.length ? diff.map((k) => k + '=' + JSON.stringify(g[k]) + '≠' + JSON.stringify(want[k])).join(' ') : 'G002 の全列');
}

/* ---------- 1–3. 起動・読込・確定まで押せない ---------- */

await page.evaluate(() => { window.__activeAtStart = activeProjectContext; });
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE0 = await activeSnapshot();
const s1 = await reportState(page);
check('S1-startup', empty(s1) && !s1.sectionVisible && s1.json && s1.csv && s1.clear, 'Pack が無ければ欄は閉じていて出力も無い');
check('S1-active', ACTIVE0.sourceKind === 'legacy_builtin' && ACTIVE0.publicLabel === RUNTIME_DEFAULT.getPublicLabel(),
  `${ACTIVE0.sourceKind}/${ACTIVE0.publicLabel}`);

await paste(page, fixtureText('notification1458'));
await page.waitForTimeout(150);
const s2 = await reportState(page);
check('S2-load-no-output', empty(s2) && s2.sectionVisible && s2.json && s2.csv && s2.clear, 'Pack の読込では出力しない・まだ押せない');
check('S2-notes', s2.sectionText.includes(PRIVACY_NOTE) && s2.sectionText.includes(ADVISORY_NOTE) &&
  s2.sectionText.includes('計算済み ≠ 検証済み') && s2.sectionText.includes('再計算用の入力ではありません'), '注意文');
const strongSection = s2.sectionText.replace(/計算済み ≠ 検証済み/g, '').replace(ADVISORY_NOTE, '');
check('S2-wording', !STRONG_WORDING.test(strongSection) && !/検証済/.test(strongSection), (strongSection.match(STRONG_WORDING) || ['none'])[0]);

const BIG = syntheticPack(2000, 'notification1458', { label: 'Synthetic Stress R' });
await paste(page, JSON.stringify(BIG));
await page.click('#btn-pack-batch');
await waitMidRun(page);
const s3 = await reportState(page);
check('S3-disabled-while-running', s3.json && s3.csv && empty(s3) && !s3.batch, '計算中は押せない');
await page.waitForFunction(batchSettled, null, { timeout: 120000, polling: 20 });
await page.waitForTimeout(50);
const s3b = await reportState(page);
check('S3-enabled-after-commit', !s3b.json && !s3b.csv && s3b.clear && s3b.batch, '確定した後に押せる');
check('S3-no-auto-export', empty(s3b) && s3b.status === 'JSON / CSV の派生レポートは、ボタンを押したときだけ作ります。',
  '計算の完了では出力しない');

/* ---------- 7–8. 2000 行・ページ切替で不変 ---------- */

const t7 = Date.now();
const s7 = await show(page, 'json');
const jsonMs = Date.now() - t7;
let big = null;
try { big = JSON.parse(s7.value); } catch (e) { /* null */ }
const ids = Array.from({ length: 2000 }, (_, i) => 'G' + String(i + 1).padStart(4, '0'));
check('S7-json-2000', big && big.rows.length === 2000 && big.totalCases === 2000 &&
  JSON.stringify(big.rows.map((r) => r.caseId)) === JSON.stringify(ids) &&
  big.rows.every((r) => Object.keys(r).join('|') === 'caseId|paneId|floor|zone|glassType|widthMm|heightMm|designPressure|pressureSource|evaluationHeightM|positivePressure|negativePressure|bestCandidate|okCount|ngCount|outOfScopeCount'),
  `${big && big.rows.length} rows`);
// 先頭・途中・末尾の行を wind / calc から直接求めた値と比べる
function bigExpected(i) {
  const c = BIG.glazingCases[i];
  const pane = BIG.panes.find((x) => x.paneId === c.paneId);
  const h = BIG.windConditions.evaluationHeights.find((e) => e.floor === c.floor).height.value;
  const w = windOf(BIG.windConditions, h, c.zone);
  return Object.assign({ caseId: c.caseId, paneId: c.paneId, floor: c.floor, zone: c.zone, glassType: c.glassType,
    widthMm: pane.widthMm.value, heightMm: pane.heightMm.value, designPressure: w.designPressure,
    pressureSource: 'pack_notification_calculation', evaluationHeightM: h, positivePressure: w.positive.pressure,
    negativePressure: w.negative.pressure }, glassOf(c.glassType, pane.widthMm.value, pane.heightMm.value, w.designPressure));
}
const sample = [0, 999, 1999].filter((i) => big && !sameValue(big.rows[i], bigExpected(i)));
check('S7-json-oracle', big && sample.length === 0, sample.length ? 'mismatch at ' + sample.join(',') : 'G0001 / G1000 / G2000');
const jsonBefore = s7.value;
await page.click('#pack-batch-result button:nth-of-type(2)');
await page.waitForTimeout(30);
await page.click('#pack-batch-result button:nth-of-type(2)');
await page.waitForTimeout(30);
const s8 = await reportState(page);
const nav = await page.evaluate(() => document.querySelector('#pack-batch-result .batch-count').textContent);
check('S8-page-unchanged', s8.value === jsonBefore && !s8.outHidden && nav.startsWith('101–150'), nav);
const t9 = Date.now();
const s9 = await show(page, 'csv');
const csvMs = Date.now() - t9;
const bigCsv = parseCsv(s9.value);
check('S7-csv-2000', bigCsv.records.length === 2000 && JSON.stringify(bigCsv.records.map((r) => r.caseId)) === JSON.stringify(ids) &&
  new Set(bigCsv.records.map((r) => r.caseId)).size === 2000 &&
  bigCsv.records.every((r) => r.trust === 'pack_unreviewed' && r.sourceKind === 'project_pack_unreviewed' &&
    r.interpretation === 'calculated_not_verified' && r.negativePressureMagnitude === '' && r.evaluationHeightM !== ''),
  `${bigCsv.records.length} rows`);
check('S9-json-replaced', !s9.value.includes('"reportType"') && s9.value.startsWith(CSV_HEADER.join(',') + '\n'), 'CSV が JSON を置き換える');
check('S7-csv-precision', sameCell('designPressure', bigCsv.records[999].designPressure, String(bigExpected(999).designPressure)) &&
  sameCell('negativePressure', bigCsv.records[999].negativePressure, String(bigExpected(999).negativePressure)) &&
  bigCsv.records[999].designPressure.length > 8, bigCsv.records[999].designPressure + '（全桁）');
const sizes = { jsonBytes: Buffer.byteLength(jsonBefore), csvBytes: Buffer.byteLength(s9.value) };
check('S7-within-cap', sizes.jsonBytes <= 8 * 1024 * 1024 && sizes.csvBytes <= 8 * 1024 * 1024, JSON.stringify(sizes));
results.push(`  info J-2000  json=${sizes.jsonBytes} bytes in ${jsonMs}ms, csv=${sizes.csvBytes} bytes in ${csvMs}ms (machine-dependent; not a threshold)`);

/* ---------- 12. キャンセルで消える ---------- */

await page.click('#btn-pack-batch');
const s12a = await reportState(page);
check('S12-restart-clears', empty(s12a) && s12a.json && s12a.csv, '計算の開始（再生成）で前の出力が消える');
await waitMidRun(page);
await page.click('#btn-pack-batch-cancel');
await page.waitForTimeout(200);
const s12 = await reportState(page);
check('S12-cancel-clears', empty(s12) && s12.json && s12.csv && !s12.batch && s12.packStaged, s12.batchStatus);

/* ---------- 4–6, 9. 3 mode ---------- */

await paste(page, fixtureText('notification1458'));
await runBatch(page);
checkJson('S4-notification-json', await show(page, 'json'), 'notification1458');
checkCsv('S4-notification-csv', await show(page, 'csv'), 'notification1458');
const NOTIF_CSV = (await reportState(page)).value;

await paste(page, fixtureText('project_pressure_map'));
const s10 = await reportState(page);
check('S10-reload-clears', empty(s10) && s10.json && s10.csv, 'Pack の再読込で前の出力が消える');
await runBatch(page);
checkCsv('S5-map-csv', await show(page, 'csv'), 'project_pressure_map');
checkJson('S5-map-json', await show(page, 'json'), 'project_pressure_map');

await paste(page, fixtureText('case_direct'));
await runBatch(page);
const s6c = await show(page, 'csv');
checkCsv('S6-direct-csv', s6c, 'case_direct');
const directRecords = parseCsv(s6c.value).records;
check('S6-direct-empty-columns', directRecords.every((r) => r.positivePressure === '' && r.negativePressure === '' &&
  r.negativePressureMagnitude === '' && r.evaluationHeightM === '') && directRecords[0].floor === '' && directRecords[0].zone === '',
  'case_direct は正負圧の列が空欄・無い階/部位を作らない');
const s6j = await show(page, 'json');
checkJson('S6-direct-json', s6j, 'case_direct');
check('S6-direct-json-keys', !/positive|negative|Magnitude|evaluationHeight/i.test(s6j.value), 'case_direct の JSON に正負圧が無い');

/* ---------- 14. 手動の消去 ---------- */

await page.click('#btn-pack-report-clear');
await page.waitForTimeout(30);
const s14 = await reportState(page);
check('S14-manual-clear', empty(s14) && s14.clear && !s14.json && s14.status === '出力を消去しました。現在有効な出力はありません。' && s14.batch,
  '消去しても一括の結果は残る');

/* ---------- 11. 読込失敗で消える ---------- */

await show(page, 'json');
await paste(page, '{"schemaVersion": 1');
const s11 = await reportState(page);
check('S11-invalid-clears', empty(s11) && !s11.sectionVisible && !s11.packStaged && s11.json && s11.csv, '読込失敗で消える');

/* ---------- 解除で消える ---------- */

await paste(page, fixtureText('case_direct'));
await runBatch(page);
await show(page, 'csv');
await page.click('#btn-pack-unload');
await page.waitForTimeout(50);
const sU = await reportState(page);
check('S10-unload-clears', empty(sU) && !sU.packStaged && !sU.sectionVisible, '解除で消える');

/* ---------- 15. 数式の中和 ---------- */

const FORMULA_LABELS = ['=HYPERLINK("x","y")', '+1,2', '-3"4', '@SUM(A1)', '\u200B=1+1', ' =1', '\t=1', '\uFF1D1+1'];
let formulaOk = true;
const formulaDetail = [];
for (const label of FORMULA_LABELS) {
  const pack = fixture('case_direct');
  pack.projectMetadata.publicLabel = label;
  await paste(page, JSON.stringify(pack));
  await runBatch(page);
  const sc = await show(page, 'csv');
  const recs = parseCsv(sc.value).records;
  const ok = recs.length === 2 && recs.every((r) => r.publicLabel === "'" + label);
  const sj = await show(page, 'json');
  let jl = null;
  try { jl = JSON.parse(sj.value).publicLabel; } catch (e) { /* null */ }
  if (!ok || jl !== label) { formulaOk = false; formulaDetail.push(JSON.stringify(label)); }
}
check('S15-formula-neutralized', formulaOk, formulaOk ? FORMULA_LABELS.length + ' labels（CSV は先頭に \' / JSON は値のまま）' : formulaDetail.join(' '));
const numericNegative = parseCsv(NOTIF_CSV).records.every((r) => /^-\d/.test(r.negativePressure));
check('S15-negative-numbers-kept', numericNegative, '負数のセルは文字列として中和しない');

/* ---------- 申告で出力が変わらない ---------- */

const strong = fixture('notification1458');
strong.evidence.sourceScopes.forEach((sc) => { sc.sourceClaim.claimedLevel = 'primary'; sc.sourceClaim.claimedPrivateReferenceAvailable = true; });
await paste(page, JSON.stringify(strong));
await runBatch(page);
const sClaims = await show(page, 'csv');
check('S-claims-no-effect', sClaims.value === NOTIF_CSV, '申告を primary にしても CSV は同じ');

/* ---------- 16–17. 保存・通信・URL・console・ダウンロード・クリップボード・active ---------- */

await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE1 = await activeSnapshot();
check('S17-runtime-parity', JSON.stringify(ACTIVE1) === JSON.stringify(ACTIVE0) && ACTIVE1.sameObject === true,
  'レポートを出しても active context・案件プリセット UI・計算結果・一括検討の表示は同じ');
const calls = await page.evaluate(() => Object.assign({}, window.__reportProbe));
const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
check('S16-no-persistence', calls.storage === 0 && calls.cookie === 0 && calls.idb === 0 && calls.caches === 0 &&
  storage.ls === 0 && storage.ss === 0 && storage.cookie === 0, JSON.stringify(storage));
check('S16-no-network', requests.length === 0 && calls.fetch === 0 && calls.xhr === 0 && calls.beacon === 0, `requests=${requests.length}`);
check('S16-no-download-clipboard', downloads.length === 0 && calls.blob === 0 && calls.clipboard === 0 && calls.open === 0,
  `downloads=${downloads.length} blob=${calls.blob} clipboard=${calls.clipboard}`);
const url = await page.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
check('S16-no-url', url.hash === '' && url.search === '' && url.href === FILE && calls.history === 0, JSON.stringify(url));
check('S16-no-console', consoleMessages.length === 0 && pageErrors.length === 0,
  `console=${consoleMessages.length} pageErrors=${pageErrors.length}`);

/* ---------- 故障の注入・依存の固定（新しい page） ---------- */

async function freshPage(initScript, arg) {
  const p = await browser.newPage();
  const errors = [];
  const logs = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => logs.push(m.text()));
  if (initScript) await p.addInitScript(initScript, arg);
  await p.goto(FILE);
  await p.waitForTimeout(300);
  return { p, errors, logs };
}

// 13: 計算の失敗で消える（同じ Pack で、2 回目の計算だけ途中のケースが失敗する executor）
{
  const { p, errors, logs } = await freshPage(() => {
    let wrapped;
    window.__failNext = false;
    Object.defineProperty(window, 'ProjectPackExecution', { configurable: true,
      get() { return wrapped; },
      set(real) {
        wrapped = Object.freeze(Object.assign({}, real, {
          executeCase: function (c, id) {
            if (window.__failNext && id === 'G0040') throw new Error('forced failure SECRET-R');
            return real.executeCase.call(real, c, id);
          }
        }));
      } });
  });
  await paste(p, JSON.stringify(syntheticPack(80, 'case_direct')));
  await runBatch(p);
  await show(p, 'json');
  const before = await reportState(p);
  await p.evaluate(() => { window.__failNext = true; });
  await runBatch(p);
  const after = await reportState(p);
  check('S13-batch-failure-clears', !before.outHidden && empty(after) && !after.batch && after.packStaged && after.json && after.csv &&
    /一括計算を完了できませんでした/.test(after.batchStatus), after.batchStatus);
  check('S13-no-raw-error', !/SECRET-R|forced/.test(after.sectionText + after.status) && errors.length === 0 &&
    !logs.some((t) => /SECRET-R|forced/.test(t)), '例外の文面を出さない');
  await p.close();
}

// レポートの生成の失敗: 固定文・前の出力も消える・Pack と一括の結果は残る（report module の toCsv だけを失敗させる）
{
  const { p, errors } = await freshPage(() => {
    let wrapped;
    Object.defineProperty(window, 'ProjectPackReport', { configurable: true,
      get() { return wrapped; },
      set(real) { wrapped = Object.freeze(Object.assign({}, real, { toCsv: function () { throw new Error('SECRET-CSV /private/path'); } })); } });
  });
  await paste(p, fixtureText('project_pressure_map'));
  await runBatch(p);
  await show(p, 'json');
  const f = await show(p, 'csv');
  check('S19-report-failure', empty(f) && f.status === FAILURE_TEXT && f.statusError && f.batch && f.packStaged &&
    !/SECRET|private/.test(f.sectionText) && errors.length === 0, f.status);
  const again = await show(p, 'json');
  check('S19-retry-after-failure', !again.outHidden && again.value.includes('"reportType"'), '失敗の後も JSON は作れる');
  await p.close();
}

// R12: 初期化後に ProjectPackBatch の global を偽物へ差し替えても、report は掴んだ本物の gate を使う
{
  const { p, errors } = await freshPage();
  await paste(p, fixtureText('notification1458'));
  await runBatch(p);
  await p.evaluate(() => {
    window.__decoyHits = 0;
    window.ProjectPackBatch = new Proxy({}, { get: (t, k) => {
      window.__decoyHits++;
      if (k === 'TRUST') return 'pack_unreviewed';
      if (k === 'SOURCE_KIND') return 'project_pack_unreviewed';
      return () => true;
    } });
  });
  const d = await show(p, 'csv');
  const hits = await p.evaluate(() => window.__decoyHits);
  check('S-batch-decoy', d.value === NOTIF_CSV && hits === 0 && errors.length === 0, `decoy hits=${hits}`);
  await p.close();
}

console.log(results.join('\n'));
await browser.close();

console.log(`\nproject-pack-report: ${pass} pass / ${fail} fail`);
finishRun('project-pack-report', pass + fail, fail, { playwrightSource,
  performance: { cases: 2000, jsonBytes: sizes.jsonBytes, csvBytes: sizes.csvBytes, jsonMs, csvMs,
    note: 'machine-dependent; recorded, not asserted' } });
