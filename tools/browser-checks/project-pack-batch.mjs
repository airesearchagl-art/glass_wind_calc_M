// Project Pack Multi-Case Execution（Phase 2L-B2 / S3-B3A）を実ブラウザで確かめる。
//
// この harness は page の UI（貼り付け・ファイル選択・全ケース計算・キャンセル・解除・ページ切替）だけを
// 操作して、page の状態と画面を観測する。Pack の検証器・adapter・executor・batch module を Node 側で
// 読み込んだり呼んだりしない。期待値は page の外で作る: fixture の literal と、wind-pressure.js・calc.js を
// Node で直接呼んだ値（executor・batch の出力からは作らない）。harness が新しい trust 経路を作らないためである。
// 多ケースの Pack は tests/support/synthetic-pack.js がその場で作る合成のもの（ファイルに保存しない）。
//
// 故障の注入（H: 途中のケースの失敗、I: 確定の直前の token 変化）は、新しい page の初期化 script で
// page 内の global への代入を包んで行う（S3-B2 の D4 と同じく、page の中だけの操作）。
//
// 確かめること:
//   - 起動時は全ケース計算の欄が閉じていて、Pack の読込・ケースの選択では計算しない
//   - ボタンで全ケースを計算し、Pack の順・件数で一覧にする。3 mode の G002 が単独計算の oracle と一致する
//   - case_direct は設計風圧だけ（正圧・負圧に分けない）。無い階・部位を作らない
//   - 一覧は 50 行ずつで、ページの切替は再計算しない
//   - 進捗（処理済み / 全体）が途中の値を取り、計算の間も page が応答する（約 2000 ケース）
//   - キャンセル・別の Pack・壊れた Pack・解除・もう一度の開始で古い run は何も表示しない
//   - 途中の 1 ケースの失敗・確定直前の token 変化では一覧を出さない（固定文・Pack は staged のまま）
//   - trust は pack_unreviewed のまま（申告で変わらない）。active context・案件プリセット UI・計算結果は不変
//   - 初期化後に executor の global を偽物へ差し替えても、batch は掴んだ本物を使う
//   - 保存・通信・URL 反映・console 出力をしない。強い表現を使わない
//   - 約 2000 ケースの時間・メモリを記録する（機械に依存するので閾値にはしない）
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const FIXTURE_DIR = REPO + 'tests/fixtures/project-pack/';

// 期待値の oracle（page の外・executor / batch を使わない）
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
const n1 = (v) => v.toFixed(1);

/** ガラスの列（推奨候補・許容風圧・件数）を calc.js から直接求める。 */
function glassCells(glassType, widthMm, heightMm, designPressure) {
  const s = Glass.splitCandidates(Glass.generateCandidates(glassType, Glass.paneAreaM2(widthMm, heightMm), designPressure, 1));
  const best = s.okCandidates[0];
  return [best ? best.label : '候補なし', best ? n1(best.P) : '—',
    s.okCandidates.length + ' / ' + s.ngCandidates.length + ' / ' + s.outOfScopeCandidates.length];
}

// notification G002: fixture の入力を手で写して wind-pressure.js を直接呼ぶ
const nf = fixture('notification1458');
const windOf = (wc, evaluationHeightM, zone) => Wind.calculateWindPressure({ V0: wc.V0.value, roughnessCategory: wc.roughnessCategory,
  buildingHeightM: wc.buildingHeightM.value, eavesHeightM: wc.eavesHeightM.value, evaluationHeightM,
  buildingType: wc.buildingType, zone, basis: wc.basis });
const N = windOf(nf.windConditions, 10.2, 'corner');
const HEADER = ['ケース', 'Pane', '階/部位', '寸法 W×H mm', 'ガラス', '設計風圧 N/m²', '風圧の内訳 N/m²', '推奨候補', '許容風圧 N/m²',
  '候補数 OK/NG/適用範囲外'];
const EXPECT = {
  notification1458: { label: 'Synthetic Pack N1458', order: ['G001', 'G002', 'G003'],
    G002: ['G002', 'P002', '3階 / 隅角部（corner）', '760 × 1880', 'lowe_fl', n1(N.designPressure),
      '正圧 ' + n1(N.positive.pressure) + ' / 負圧 ' + n1(N.negative.pressure) + '（評価高さ 10.2 m）']
      .concat(glassCells('lowe_fl', 760, 1880, N.designPressure)) },
  project_pressure_map: { label: 'Synthetic Pack Map', order: ['G001', 'G002', 'G003', 'G004'],
    G002: ['G002', 'P002', '5階 / 隅角部（corner）', '760 × 1880', 'tp_single', n1(1835), '正圧 1135.0 / 負圧（絶対値） 1835.0']
      .concat(glassCells('tp_single', 760, 1880, 1835)) },
  case_direct: { label: 'Synthetic Pack Direct', order: ['G001', 'G002'],
    G002: ['G002', 'P002', '2階', '760 × 1880', 'lowe_fl', n1(1365), 'Packが宣言した設計風圧']
      .concat(glassCells('lowe_fl', 760, 1880, 1365)) }
};

// 約 2000 ケースの合成 Pack（notification）。先頭と 2 ページ目の先頭の行を wind / calc から直接求める
const BIG_N = 2000;
const BIG = syntheticPack(BIG_N, 'notification1458', { label: 'Synthetic Stress A' });
function bigRowCells(i) {
  const c = BIG.glazingCases[i];
  const pane = BIG.panes.find((p) => p.paneId === c.paneId);
  const h = BIG.windConditions.evaluationHeights.find((e) => e.floor === c.floor).height.value;
  const w = windOf(BIG.windConditions, h, c.zone);
  return [c.caseId, c.paneId, c.floor + '階 / ' + (c.zone === 'corner' ? '隅角部（corner）' : '一般部（general）'),
    pane.widthMm.value + ' × ' + pane.heightMm.value, c.glassType, n1(w.designPressure),
    '正圧 ' + n1(w.positive.pressure) + ' / 負圧 ' + n1(w.negative.pressure) + '（評価高さ ' + h + ' m）']
    .concat(glassCells(c.glassType, pane.widthMm.value, pane.heightMm.value, w.designPressure));
}
const FAILURE_TEXT = '一括計算を完了できませんでした。未レビューPackの一括結果は現在ありません。';
const CANCELLED_TEXT = '全ケースの計算をキャンセルしました。未レビューPackの一括結果は現在ありません。';
const STRONG_WORDING = /Verified|承認|確定|安全|問題なし|計算可能|公開可能|確認済|\bsafe\b|\bapproved\b/i;

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('project-pack-batch', () => ({ checksRun: pass + fail, failures: fail }));

const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];
const requests = [];
page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith('file://')) requests.push(r.url()); });

await page.addInitScript(() => {
  const calls = { storage: 0, cookie: 0, idb: 0, caches: 0, beacon: 0, fetch: 0, xhr: 0, history: 0 };
  window.__batchProbe = calls;
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
});

await page.goto(FILE);
await page.waitForTimeout(400);

/* ---------- helpers（どの page でも使う） ---------- */

async function paste(p, text) {
  await p.evaluate((t) => { document.getElementById('pack-paste').value = t; }, text);
  await p.click('#btn-pack-load');
  await p.waitForTimeout(50);
}

/** 全ケース計算の欄と page 変数から状態を読む。 */
async function batchState(p) {
  return p.evaluate(() => {
    const r = window.stagedProjectPackBatch;
    const section = document.getElementById('pack-batch');
    const box = document.getElementById('pack-batch-result');
    const status = document.getElementById('pack-batch-status');
    const bar = document.getElementById('pack-batch-progress');
    const table = box.querySelector('table');
    const out = {
      hasResult: r !== null && r !== undefined,
      sectionHidden: section.hidden,
      sectionVisible: getComputedStyle(section).display !== 'none',
      resultHidden: box.hidden,
      header: table ? [...table.querySelectorAll('th')].map((th) => th.textContent) : [],
      rows: table ? [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)) : [],
      summary: [...box.querySelectorAll('li')].map((li) => li.textContent),
      nav: (box.querySelector('.batch-count') || { textContent: '' }).textContent,
      sectionText: section.innerText,
      status: status.textContent,
      statusError: status.classList.contains('is-error'),
      progressHidden: bar.hidden,
      progress: [bar.value, bar.max],
      startDisabled: document.getElementById('btn-pack-batch').disabled,
      cancelDisabled: document.getElementById('btn-pack-batch-cancel').disabled,
      packStaged: window.stagedProjectPackContext !== null && window.stagedProjectPackContext !== undefined,
      packLabel: window.stagedProjectPackContext ? window.stagedProjectPackContext.publicLabel : null,
      single: window.stagedProjectPackExecution ? window.stagedProjectPackExecution.case.caseId : null
    };
    if (out.hasResult) {
      let frozen = Object.isFrozen(r) && Object.isFrozen(r.rows);
      r.rows.forEach((row) => { frozen = frozen && Object.isFrozen(row) && Object.isFrozen(row.pressure); });
      out.result = { issued: ProjectPackBatch.isBatchResult(r), frozen, trust: r.trust, sourceKind: r.sourceKind,
        label: r.publicLabel, mode: r.pressureMode, total: r.totalCases, executed: r.executedCases,
        ids: r.rows.map((x) => x.caseId), json: JSON.stringify(r) };
    }
    return out;
  });
}

const settled = () => !!window.stagedProjectPackBatch ||
  /キャンセル|完了できません|中止/.test(document.getElementById('pack-batch-status').textContent);
async function runBatch(p) {
  await p.click('#btn-pack-batch');
  await p.waitForFunction(settled, null, { timeout: 120000, polling: 20 });
  await p.waitForTimeout(20);
  return batchState(p);
}
/** 計算が途中まで進んだ（0 < 処理済み < 全体）ところで止める。 */
async function waitMidRun(p) {
  await p.waitForFunction(() => {
    const m = /計算中… (\d+) \/ (\d+)/.exec(document.getElementById('pack-batch-status').textContent);
    return m && Number(m[1]) > 0 && Number(m[1]) < Number(m[2]);
  }, null, { timeout: 60000, polling: 5 });
  return batchState(p);
}

/** active ProjectContext と、それに依存する案件プリセット UI・計算結果の snapshot。 */
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
      result: text('result-area')
    };
  });
}

/** 全ケース計算の状態行の変化を記録する（どの run が確定したかを数える）。 */
await page.evaluate(() => {
  window.__statusLog = [];
  const status = document.getElementById('pack-batch-status');
  new MutationObserver(() => window.__statusLog.push(status.textContent))
    .observe(status, { childList: true, characterData: true, subtree: true });
});
const logMark = () => page.evaluate(() => window.__statusLog.length);
const logSince = (mark) => page.evaluate((m) => window.__statusLog.slice(m), mark);
const DONE_BIG = '全 ' + BIG_N + ' ケースを計算しました（未レビュー。計算済み ≠ 検証済み）。';

function checkModeResult(id, s, mode) {
  const want = EXPECT[mode];
  const r = s.result || {};
  check(id + '-issued', r.issued === true && r.frozen === true && r.trust === 'pack_unreviewed' &&
    r.sourceKind === 'project_pack_unreviewed' && r.mode === mode && r.label === want.label,
    `${r.trust}/${r.mode}/issued=${r.issued}/frozen=${r.frozen}`);
  check(id + '-all-in-order', JSON.stringify(r.ids) === JSON.stringify(want.order) && r.total === want.order.length &&
    r.executed === want.order.length && s.rows.length === want.order.length &&
    JSON.stringify(s.rows.map((x) => x[0])) === JSON.stringify(want.order), JSON.stringify(r.ids));
  const g = s.rows.find((x) => x[0] === 'G002');
  check(id + '-G002', JSON.stringify(g) === JSON.stringify(want.G002), JSON.stringify(g));
  check(id + '-header', JSON.stringify(s.header) === JSON.stringify(HEADER), s.header.join('|'));
  const strong = s.sectionText.replace(/計算済み ≠ 検証済み/g, '').replace(/publication advisoryが0件でも公開安全の証明にはなりません。/g, '');
  check(id + '-wording', !STRONG_WORDING.test(strong) && !/検証済/.test(strong) &&
    s.summary.includes('trust: pack_unreviewed（未レビュー）— 計算済み ≠ 検証済み'), (strong.match(STRONG_WORDING) || ['none'])[0]);
  check(id + '-status', !s.statusError && s.status === '全 ' + want.order.length + ' ケースを計算しました（未レビュー。計算済み ≠ 検証済み）。' &&
    s.cancelDisabled && !s.startDisabled, s.status);
  check(id + '-no-provenance', !/verified_primary_source|formula|provenance|合成テスト用|notificationTrace|candidates/.test(s.sectionText + (r.json || '')),
    '風圧の provenance・申告文・候補の全件を出さない');
}

/* ---------- 1. clean startup ---------- */

await page.evaluate(() => { window.__activeAtStart = activeProjectContext; });
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE0 = await activeSnapshot();
const s1 = await batchState(page);
check('B1-clean', !s1.hasResult && s1.sectionHidden && !s1.sectionVisible && s1.startDisabled && s1.cancelDisabled &&
  s1.progressHidden && s1.status === '', JSON.stringify({ hidden: s1.sectionHidden, start: s1.startDisabled }));
check('B1-active', ACTIVE0.sourceKind === 'legacy_builtin' && ACTIVE0.publicLabel === RUNTIME_DEFAULT.getPublicLabel(),
  `${ACTIVE0.sourceKind}/${ACTIVE0.publicLabel}`);

/* ---------- 2. 読込・選択では計算しない ---------- */

await paste(page, fixtureText('notification1458'));
await page.waitForTimeout(150);
const s2 = await batchState(page);
check('B2-no-auto', !s2.hasResult && s2.resultHidden && s2.rows.length === 0 && s2.sectionVisible && !s2.startDisabled &&
  s2.cancelDisabled && s2.status.includes('押したときだけ'), s2.status);
await page.selectOption('#pack-exec-case', 'G002');
await page.waitForTimeout(150);
check('B2-no-auto-select', !(await batchState(page)).hasResult, 'ケースの選択では計算しない');
await page.setInputFiles('#pack-file', { name: 'pack.json', mimeType: 'application/json', buffer: Buffer.from(fixtureText('case_direct'), 'utf8') });
await page.waitForFunction(() => /読み込み経路: ファイル選択/.test(document.getElementById('pack-status').textContent));
await page.waitForTimeout(150);
const s2f = await batchState(page);
check('B2-no-auto-file', !s2f.hasResult && !s2f.startDisabled && s2f.packLabel === 'Synthetic Pack Direct', 'ファイル読込でも計算しない');

/* ---------- 3–5. 3 mode の全ケース ---------- */

await paste(page, fixtureText('notification1458'));
const s3 = await runBatch(page);
checkModeResult('B3-notification', s3, 'notification1458');
const NOTIF_JSON = s3.result ? s3.result.json : '';
check('B3-active', JSON.stringify(await activeSnapshot()) === JSON.stringify(ACTIVE0), 'active context・preset UI・結果は不変');

await paste(page, fixtureText('project_pressure_map'));
const s4pre = await batchState(page);
check('B4-new-pack-clears', !s4pre.hasResult && s4pre.resultHidden && s4pre.rows.length === 0, '新しい Pack で前の一覧が消える');
const s4 = await runBatch(page);
checkModeResult('B4-map', s4, 'project_pressure_map');
check('B4-panes', s4.rows[2] && s4.rows[2][1] === 'P003' && s4.rows[2][3] === '640 × 1720' &&
  s4.rows[0][6] === '正圧 1045.0 / 負圧（絶対値） 1565.0' && s4.rows[0][9] === '6 / 1 / 0', JSON.stringify(s4.rows[2]));

await paste(page, fixtureText('case_direct'));
const s5 = await runBatch(page);
checkModeResult('B5-direct', s5, 'case_direct');
check('B5-design-only', s5.rows.every((cells) => !cells.some((c) => /正圧|負圧|部位|corner|general/.test(c))) &&
  s5.rows[0][2] === '—' && !/positive|negative|Magnitude/.test((s5.result || {}).json || 'x'),
  'case_direct は設計風圧だけ・無い階/部位を作らない');

/* ---------- 6. 単一ケースの結果と取り違えない ---------- */

await page.selectOption('#pack-exec-case', 'G002');
await page.click('#btn-pack-exec');
await page.waitForTimeout(50);
check('B6-single-precondition', (await batchState(page)).single === 'G002', '選択ケースを計算済み');
const s6 = await runBatch(page);
check('B6-single-cleared', s6.single === null && s6.hasResult &&
  (await page.textContent('#pack-exec-status')).includes('選択ケースの計算結果を消しました'), '全ケース計算の開始で選択ケースの結果を消す');

/* ---------- 7. 約 2000 ケース: 進捗・応答・ページ・時間とメモリ（J・B） ---------- */

await paste(page, JSON.stringify(BIG));
await page.waitForTimeout(100);
await page.evaluate(() => {
  window.__gaps = [];
  window.__progress = [];
  let last = performance.now();
  window.__sampler = setInterval(() => {
    const now = performance.now();
    window.__gaps.push(now - last);
    last = now;
    const m = /計算中… (\d+) \/ (\d+)/.exec(document.getElementById('pack-batch-status').textContent);
    if (m) window.__progress.push(Number(m[1]));
  }, 10);
  window.__heap0 = performance.memory ? performance.memory.usedJSHeapSize : null;
});
const t0 = Date.now();
const s7 = await runBatch(page);
const elapsedMs = Date.now() - t0;
const perf = await page.evaluate(() => {
  clearInterval(window.__sampler);
  const gaps = window.__gaps;
  const sorted = gaps.slice().sort((a, b) => a - b);
  return { samplerTicks: gaps.length, maxGapMs: Math.round(Math.max(...gaps)),
    p95GapMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0),
    progressValues: [...new Set(window.__progress)],
    heapBefore: window.__heap0, heapAfter: performance.memory ? performance.memory.usedJSHeapSize : null };
});
const intermediate = perf.progressValues.filter((v) => v > 0 && v < BIG_N);
check('B7-complete', s7.result && s7.result.total === BIG_N && s7.result.executed === BIG_N && s7.result.ids.length === BIG_N &&
  s7.result.ids.every((id, i) => id === 'G' + String(i + 1).padStart(4, '0')), `${s7.result && s7.result.total} rows`);
check('B7-progress', intermediate.length >= 2 && intermediate.every((v) => v % 25 === 0) && perf.samplerTicks >= 2,
  `intermediate progress values=${intermediate.length} sampler ticks=${perf.samplerTicks}`);
check('B7-page-1', s7.rows.length === 50 && JSON.stringify(s7.rows[0]) === JSON.stringify(bigRowCells(0)) &&
  s7.nav === '1–50 / 2000 ケース（1 / 40 ページ）', s7.nav);
const identity = await page.evaluate(() => { window.__keep = window.stagedProjectPackBatch; return true; });
const mark7 = await logMark();
await page.click('#pack-batch-result button:nth-of-type(2)');
const s7b = await batchState(page);
check('B7-page-2', s7b.rows.length === 50 && JSON.stringify(s7b.rows[0]) === JSON.stringify(bigRowCells(50)) &&
  s7b.nav === '51–100 / 2000 ケース（2 / 40 ページ）' && s7b.status === s7.status && s7b.progressHidden === false,
  s7b.nav);
await page.click('#pack-batch-result button:nth-of-type(1)');
const s7c = await batchState(page);
const kept = await page.evaluate(() => window.stagedProjectPackBatch === window.__keep);
check('B7-page-no-recompute', identity && kept && s7c.nav === '1–50 / 2000 ケース（1 / 40 ページ）' && s7c.status === s7.status &&
  (await logSince(mark7)).length === 0, 'ページの切替は同じ結果 object を表示し直すだけ（状態行も変わらない）');
const domRows = await page.evaluate(() => document.querySelectorAll('#pack-batch-result tbody tr').length);
check('B7-no-full-render', domRows === 50, `${domRows} rows in DOM`);
results.push(`  info J-performance  cases=${BIG_N} elapsed=${elapsedMs}ms maxGap=${perf.maxGapMs}ms p95Gap=${perf.p95GapMs}ms ` +
  `heap=${perf.heapBefore}→${perf.heapAfter} bytes (machine-dependent; not a threshold)`);

/* ---------- 8. キャンセル（C） ---------- */

await page.click('#btn-pack-batch');
const m8 = await waitMidRun(page);
check('B8-midrun', !m8.hasResult && !m8.cancelDisabled && !m8.progressHidden && m8.progress[1] === BIG_N &&
  m8.progress[0] > 0 && m8.progress[0] < BIG_N, `progress=${m8.progress.join('/')}`);
await page.click('#btn-pack-batch-cancel');
await page.waitForTimeout(400);
const s8 = await batchState(page);
check('B8-cancel', !s8.hasResult && s8.resultHidden && s8.rows.length === 0 && s8.status === CANCELLED_TEXT &&
  s8.progressHidden && s8.cancelDisabled && !s8.startDisabled && s8.packStaged, s8.status);

/* ---------- 9. 途中で別の Pack（D）・壊れた Pack（E）・解除（F）・もう一度の開始（G） ---------- */

await page.click('#btn-pack-batch');
await waitMidRun(page);
await paste(page, fixtureText('project_pressure_map'));
const mark9 = await logMark();
await page.waitForTimeout(400);
const s9 = await batchState(page);
check('B9-switch-pack', !s9.hasResult && s9.rows.length === 0 && s9.packLabel === 'Synthetic Pack Map' &&
  !/Stress/.test(s9.sectionText) && s9.status.includes('押したときだけ') &&
  !(await logSince(mark9)).some((t) => /計算中|全 \d+ ケース/.test(t)), s9.status);
const s9b = await runBatch(page);
check('B9-new-pack-runs', s9b.result && s9b.result.label === 'Synthetic Pack Map' && s9b.result.total === 4, 'B の計算は B の結果');

await paste(page, JSON.stringify(BIG));
await page.click('#btn-pack-batch');
await waitMidRun(page);
await paste(page, '{"schemaVersion": 1');
const mark10 = await logMark();
await page.waitForTimeout(400);
const s10 = await batchState(page);
check('B10-invalid-pack', !s10.hasResult && !s10.packStaged && s10.sectionHidden && s10.startDisabled && s10.rows.length === 0 &&
  !(await logSince(mark10)).some((t) => /計算中|全 \d+ ケース/.test(t)), `result=${s10.hasResult} staged=${s10.packStaged}`);

await paste(page, JSON.stringify(BIG));
await page.click('#btn-pack-batch');
await waitMidRun(page);
await page.click('#btn-pack-unload');
const mark11 = await logMark();
await page.waitForTimeout(400);
const s11 = await batchState(page);
check('B11-unload', !s11.hasResult && !s11.packStaged && s11.sectionHidden && s11.progressHidden && s11.rows.length === 0 &&
  !(await logSince(mark11)).some((t) => /計算中|全 \d+ ケース/.test(t)), `result=${s11.hasResult} staged=${s11.packStaged}`);

await paste(page, JSON.stringify(BIG));
const mark12 = await logMark();
await page.click('#btn-pack-batch');
const g1 = await waitMidRun(page);
await page.click('#btn-pack-batch');
await page.waitForFunction(settled, null, { timeout: 120000, polling: 20 });
await page.waitForTimeout(400);
const s12 = await batchState(page);
const log12 = await logSince(mark12);
const done12 = log12.filter((t) => t === DONE_BIG).length;
const restartAt = log12.findIndex((t, k) => k > 0 && t === '計算中… 0 / ' + BIG_N + ' ケース（未レビュー）');
check('B12-restart', s12.result && s12.result.total === BIG_N && s12.rows.length === 50 && done12 === 1 && restartAt > 0 &&
  log12.indexOf(DONE_BIG) > restartAt, `first run stopped at ${g1.progress[0]}; restarted at status log ${restartAt}; completions=${done12}`);

/* ---------- 13. trust: 申告を primary にしても同じ ---------- */

const strong = fixture('notification1458');
strong.evidence.sourceScopes.forEach((sc) => { sc.sourceClaim.claimedLevel = 'primary'; sc.sourceClaim.claimedPrivateReferenceAvailable = true; });
await paste(page, JSON.stringify(strong));
const s13 = await runBatch(page);
check('B13-claims-no-effect', s13.result && s13.result.trust === 'pack_unreviewed' && s13.result.json === NOTIF_JSON,
  '申告を primary にしても一括結果は同じ');

/* ---------- 14–16. active parity・保存・通信・文言 ---------- */

await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE1 = await activeSnapshot();
check('B14-runtime-parity', JSON.stringify(ACTIVE1) === JSON.stringify(ACTIVE0) && ACTIVE1.sameObject === true,
  'Pack を一括計算しても active context・案件プリセット UI・計算結果は同じ');
const calls = await page.evaluate(() => Object.assign({}, window.__batchProbe));
const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
check('B15-no-persistence', calls.storage === 0 && calls.cookie === 0 && calls.idb === 0 && calls.caches === 0 &&
  storage.ls === 0 && storage.ss === 0 && storage.cookie === 0, JSON.stringify(storage));
check('B15-no-network', requests.length === 0 && calls.fetch === 0 && calls.xhr === 0 && calls.beacon === 0, `requests=${requests.length}`);
const url = await page.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
check('B15-no-url', url.hash === '' && url.search === '' && url.href === FILE && calls.history === 0, JSON.stringify(url));
check('B15-no-console', consoleMessages.length === 0 && pageErrors.length === 0,
  `console=${consoleMessages.length} pageErrors=${pageErrors.length}`);
const panel = await page.evaluate(() => document.getElementById('project-pack-section').innerText);
// S3-B3B1 の派生レポートの注意文（「…公開安全の証明にはなりません」という否定の文）だけは除いて調べる
const strongPanel = panel.replace(/計算済み ≠ 検証済み/g, '').replace(/publication advisoryが0件でも公開安全の証明にはなりません。/g, '');
check('B16-wording', !STRONG_WORDING.test(strongPanel) && !/検証済/.test(strongPanel), (strongPanel.match(STRONG_WORDING) || ['none'])[0]);

/* ---------- 故障の注入（新しい page） ---------- */

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

// H: 途中の 1 ケースだけ失敗する executor（page の global への代入を包む）
{
  const { p, errors, logs } = await freshPage((failCase) => {
    let wrapped;
    Object.defineProperty(window, 'ProjectPackExecution', { configurable: true,
      get() { return wrapped; },
      set(real) {
        wrapped = Object.freeze(Object.assign({}, real, {
          executeCase: function (c, id) { if (id === failCase) throw new Error('forced failure SECRET-H'); return real.executeCase.call(real, c, id); }
        }));
      } });
  }, 'G1037');
  await paste(p, JSON.stringify(BIG));
  const h = await runBatch(p);
  check('H-middle-failure', !h.hasResult && h.rows.length === 0 && h.resultHidden && h.status === FAILURE_TEXT && h.statusError &&
    h.progressHidden && h.packStaged && !h.startDisabled, h.status);
  check('H-no-raw-error', !/SECRET-H|forced|G1037|Error/.test(h.sectionText) && errors.length === 0 &&
    !logs.some((t) => /SECRET-H|forced/.test(t)), '例外の文面を出さない');
  await p.selectOption('#pack-exec-case', 'G0002');
  await p.click('#btn-pack-exec');
  await p.waitForTimeout(50);
  check('H-single-still-works', (await batchState(p)).single === 'G0002', '失敗の後も選択ケースの計算は使える');
  await p.close();
}

// I: 確定の直前に token が変わる（finish の中で別の run が始まったことにする）
{
  const { p, errors } = await freshPage(() => {
    let wrapped;
    Object.defineProperty(window, 'ProjectPackBatch', { configurable: true,
      get() { return wrapped; },
      set(real) {
        wrapped = Object.freeze(Object.assign({}, real, {
          createBatchRun: function (c) {
            const run = real.createBatchRun.call(real, c);
            return Object.freeze(Object.assign({}, run, { finish: function () {
              const r = run.finish.call(run);
              window.projectPackBatchToken += 1;
              return r;
            } }));
          }
        }));
      } });
  });
  await paste(p, fixtureText('project_pressure_map'));
  await p.click('#btn-pack-batch');
  await p.waitForTimeout(500);
  const i = await batchState(p);
  check('I-token-before-commit', !i.hasResult && i.rows.length === 0 && i.resultHidden && !/全 4 ケースを計算しました/.test(i.status) &&
    errors.length === 0, i.status);
  await p.close();
}

// M13: 初期化後に executor の global を偽物へ差し替えても、batch は掴んだ本物を使う
{
  const { p, errors } = await freshPage();
  await paste(p, fixtureText('notification1458'));
  await p.evaluate(() => {
    window.__decoyHits = 0;
    window.ProjectPackExecution = new Proxy({}, { get: (t, k) => {
      window.__decoyHits++;
      if (k === 'TRUST') return 'pack_unreviewed';
      if (k === 'SOURCE_KIND') return 'project_pack_unreviewed';
      return () => { throw new Error('DECOY executor'); };
    } });
  });
  const d = await runBatch(p);
  const hits = await p.evaluate(() => window.__decoyHits);
  check('D-executor-decoy', d.result && d.result.json === NOTIF_JSON && hits === 0 && errors.length === 0,
    `decoy hits=${hits} same result=${d.result && d.result.json === NOTIF_JSON}`);
  await p.close();
}

console.log(results.join('\n'));
await browser.close();

console.log(`\nproject-pack-batch: ${pass} pass / ${fail} fail`);
finishRun('project-pack-batch', pass + fail, fail, { playwrightSource,
  performance: { cases: BIG_N, elapsedMs, maxGapMs: perf.maxGapMs, p95GapMs: perf.p95GapMs,
    heapBefore: perf.heapBefore, heapAfter: perf.heapAfter, note: 'machine-dependent; recorded, not asserted' } });
