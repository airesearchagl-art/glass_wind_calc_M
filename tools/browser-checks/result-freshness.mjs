// 結果の鮮度と告示風圧計算の出どころの表示（Phase 2L-B2 / S3-B3B2-B1）を実ブラウザで確かめる。
//
// この harness は page の UI（入力欄・計算・mode 切替・Export / Import・一括検討のボタン）を操作して、
// 鮮度の表示（#single-result-freshness / #batch-summary-freshness / #batch-results-freshness）、
// data-result-freshness の状態、結果 CSV の出力、計算結果の表示を観測する。合成の値だけを使う。
// 期待値は page の外で作る: 案件プリセットの値は Node の registry（runtime default built-in）から、
// 告示風圧計算の値は wind-pressure.js を Node で直接呼んで求める（鮮度の判定の結果からは作らない）。
//
// 故障の注入（計算の途中の例外）は、page の中の global 関数（renderResults / batchRender）を一時的に
// 包んで行い、確かめた後に元へ戻す（page の中だけの操作）。イベントを伴わない値の変更も page の中で行う。
//
// 確かめること:
//   単一ケース S01–S17: 初期は現在の結果 / W・H・構成・係数・階・部位・正圧・負圧・告示の風条件・取り込みの値を
//     変えると「変更前」/ 入力が正規化できないと「以前の入力」/ 再計算で戻る / 計算の失敗で現在扱いしない /
//     mode 切替・Import の自動計算は従来どおり / 選んでいない mode の隠れた入力では変えない / 参考比較の表示も対象 /
//     イベントの無い変更も判定で検出 / Pack 欄と干渉しない
//   Workspace W01–W12: 未計算 / 計算後は現在 / 追加で「変更前」（サマリと一覧の両方）/ 再計算で戻る / 削除・複製 /
//     TSV・JSON の取り込み / 診断の増減 / 件数が同じで内容が違う / 古い結果の CSV は出さない / 現在の結果の CSV /
//     出力欄の古い CSV の注記 / 計算の失敗 / 設計レビュー資料の鮮度・印刷の gate は従来どおり
//   RF27-1–7（RF-27-01）: 出力欄に残った古い結果 CSV の警告は専用の欄（#batch-csv-freshness）に出し、
//     操作の status（#batch-json-status）とは干渉しない / Import の失敗・一括計算し直し・view の切替で消えない /
//     新しい現在の CSV で外れる / 出力欄が Workspace JSON などに置き換わったら出さない
//   出どころの表示 L01–L06: preset / manual / notification / imported の見出しと注記、数値、検証状況
//   加えて: 固定文だけ（入力値を写さない）・保存・通信・URL・console なし
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';

// 期待値の oracle（page の外）
const Registry = require(REPO + 'project-config/registry.js');
const Wind = require(REPO + 'wind-pressure.js');
const RUNTIME_DEFAULT = Registry.getBuiltInPreset(Registry.getRuntimeDefaultBuiltInPresetId());
const NOTIFICATION_DEFAULT = Wind.calculateWindPressure({ V0: 30, roughnessCategory: 'II', buildingHeightM: 12, eavesHeightM: 12,
  evaluationHeightM: 9, buildingType: 'closed', zone: 'general', basis: 'notification_baseline' });
const PACK_FIXTURE = fs.readFileSync(REPO + 'tests/fixtures/project-pack/synthetic-case-direct.json', 'utf8');

const SINGLE_TEXT = {
  stale: '入力が変更されました。この結果は変更前の入力によるものです。再計算してください。',
  invalid: '現在の入力では計算できません。表示中の結果は以前の入力によるもので、現在の入力に対する結果ではありません。',
  failed: '直前の計算を完了できませんでした。表示中の結果は以前の入力によるもので、現在の入力に対する結果ではありません。'
};
const WS_TEXT = {
  summaryStale: 'Workspaceが変更されています。表示中の集計は変更前の結果です。一括計算し直してください。',
  resultsStale: 'Workspaceが変更されています。表示中の一覧は変更前の結果です。一括計算し直してください。',
  summaryFailed: '一括計算を完了できませんでした。表示中の集計は以前のWorkspaceの結果で、現在の内容に対する結果ではありません。',
  resultsFailed: '一括計算を完了できませんでした。表示中の一覧は以前のWorkspaceの結果で、現在の内容に対する結果ではありません。',
  csvNotCurrent: 'CSVを出力しませんでした。表示中の結果は現在のWorkspaceの内容と一致していません。一括計算し直してから出力してください。',
  csvOutputStale: 'この欄の結果CSVは変更前のWorkspaceの結果です。現在の内容のCSVが必要な場合は、一括計算し直してから出力してください。'
};
const LABEL = {
  preset: '設計風圧の選定（案件プリセット: ',
  manual: '設計風圧の選定（手入力値）',
  notification: '設計風圧の選定（告示風圧計算: 入力した風条件から算定）',
  imported: '設計風圧の選定（取り込みデータ・未検証）'
};
const REVIEW_TEXT = {
  FRESH: '資料は現在のWorkspaceと設定に一致しています。',
  WORKSPACE_STALE: 'Workspaceが変更されています。資料を再作成してください。'
};

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('result-freshness', () => ({ checksRun: pass + fail, failures: fail }));
const browser = await chromium.launch();

/** 保存・通信・URL の呼び出しを数える（page を読み込む前に仕込む）。 */
const PROBE = () => {
  const calls = { storage: 0, cookie: 0, idb: 0, beacon: 0, fetch: 0, xhr: 0, history: 0 };
  window.__freshnessProbe = calls;
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
  wrap(navigator, 'sendBeacon', 'beacon');
  wrap(window, 'fetch', 'fetch');
  wrap(XMLHttpRequest.prototype, 'open', 'xhr');
  wrap(history, 'pushState', 'history');
  wrap(history, 'replaceState', 'history');
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleMessages = [];
const pageErrors = [];
const requests = [];
const dialogs = [];
page.on('console', (m) => consoleMessages.push(m.text()));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith('file://')) requests.push(r.url()); });
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
await page.addInitScript(PROBE);
await page.goto(FILE);
await page.waitForSelector('.judge-badge');

/* ---------- helpers ---------- */

/** 単一ケースの鮮度の表示（DOM）と、その場の判定（getSingleResultFreshness）。 */
const single = () => page.evaluate(() => {
  const area = document.getElementById('result-area');
  const host = document.getElementById('single-result-freshness');
  const badge = document.querySelector('#result-area .judge-badge');
  return {
    attr: area.getAttribute('data-result-freshness'),
    text: host.textContent,
    hidden: host.hidden,
    visible: getComputedStyle(host).display !== 'none',
    badgeAfter: badge ? getComputedStyle(badge, '::after').content : null,
    opacity: Number(getComputedStyle(area).opacity),
    judged: getSingleResultFreshness(),
    result: area.innerText
  };
});
const isState = (s, state) => s.attr === state && s.judged === state &&
  (state === 'fresh' || state === 'none' ? s.hidden && !s.visible && s.text === '' : !s.hidden && s.visible && s.text === SINGLE_TEXT[state]);

/** 値を入れて input / change を送る（隠れた入力欄も同じ方法で変える）。 */
const setValue = (id, value) => page.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, value]);
const calc = async () => { await page.click('button.btn-calc'); await page.waitForTimeout(30); };
const setMode = async (mode) => { await page.selectOption('#inp-mode', mode); await page.waitForTimeout(30); };
const optionOtherThan = (id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  const other = [...el.options].find((o) => o.value !== el.value);
  return other ? other.value : null;
}, id);

/** 値を変えて「変更前」になり、元に戻して再計算すると現在の結果に戻ることを確かめる。 */
async function staleThenRecover(id, label, value) {
  const before = await single();
  const original = await page.evaluate((i) => document.getElementById(i).value, id);
  const next = value !== undefined ? value : await optionOtherThan(id);
  await setValue(id, next);
  const s = await single();
  check(label, before.attr === 'fresh' && isState(s, 'stale') && s.result === before.result && s.badgeAfter === '"変更前"' && s.opacity < 1,
    `${id}: ${before.attr} -> ${s.attr}`);
  await setValue(id, original);
  await calc();
  return s;
}

const ws = () => page.evaluate(() => {
  const get = (id) => document.getElementById(id);
  return {
    summaryAttr: get('batch-summary-card').getAttribute('data-result-freshness'),
    resultsAttr: get('batch-results-card').getAttribute('data-result-freshness'),
    summaryText: get('batch-summary-freshness').textContent, summaryHidden: get('batch-summary-freshness').hidden,
    resultsText: get('batch-results-freshness').textContent, resultsHidden: get('batch-results-freshness').hidden,
    summaryRole: get('batch-summary-freshness').getAttribute('role'), summaryLive: get('batch-summary-freshness').getAttribute('aria-live'),
    summaryCardHidden: get('batch-summary-card').hidden, resultsCardHidden: get('batch-results-card').hidden,
    summary: get('batch-summary').innerText, table: get('batch-table').innerText,
    summaryOpacity: Number(getComputedStyle(get('batch-summary')).opacity), tableOpacity: Number(getComputedStyle(get('batch-table')).opacity),
    count: get('batch-count').textContent, judged: getWorkspaceResultFreshness(),
    rows: document.querySelectorAll('#batch-table tbody tr').length
  };
});
const wsFresh = (w) => w.summaryAttr === 'fresh' && w.resultsAttr === 'fresh' && w.judged === 'fresh' &&
  w.summaryHidden && w.resultsHidden && w.summaryText === '' && w.resultsText === '';
const wsStale = (w) => w.summaryAttr === 'stale' && w.resultsAttr === 'stale' && w.judged === 'stale' &&
  !w.summaryHidden && !w.resultsHidden && w.summaryText === WS_TEXT.summaryStale && w.resultsText === WS_TEXT.resultsStale &&
  w.summaryOpacity < 1 && w.tableOpacity < 1;
const clickText = async (text) => { await page.click(`text=${text}`); await page.waitForTimeout(30); };
const evaluateBatch = async () => { await page.click('#btn-batch-eval'); await page.waitForTimeout(30); };
const resultTitles = () => page.evaluate(() => [...document.querySelectorAll('#result-area .calc-block-title')].map((e) => e.textContent));
const designPressureShown = () => page.evaluate(() => {
  const chip = [...document.querySelectorAll('#result-area .meta-chip')].find((e) => e.textContent.includes('設計風圧'));
  return chip ? chip.querySelector('span').textContent : null;
});

/* ============================================================
   単一ケース
============================================================ */

// S01: 初期表示（自動計算）の後は現在の結果。表示は #result-area の外で、role=status / aria-live
{
  const s = await single();
  const a = await page.evaluate(() => {
    const host = document.getElementById('single-result-freshness');
    const area = document.getElementById('result-area');
    return { role: host.getAttribute('role'), live: host.getAttribute('aria-live'), atomic: host.getAttribute('aria-atomic'),
      inside: area.contains(host), describedBy: area.getAttribute('aria-describedby'), before: host.nextElementSibling === area };
  });
  check('S01-initial-fresh', isState(s, 'fresh') && s.badgeAfter === 'none' && s.opacity === 1, s.attr);
  check('S01-aria', a.role === 'status' && a.live === 'polite' && a.atomic === 'true' && !a.inside && a.before &&
    a.describedBy === 'single-result-freshness', JSON.stringify(a));
}

// S02–S07: 計算に使う入力を変えると「変更前」（案件プリセット・手入力）
await staleThenRecover('inp-W', 'S02-W-stale', '1234');
await staleThenRecover('inp-H', 'S03-H-stale', '2345');
await staleThenRecover('inp-type', 'S04-glassType-stale');
await staleThenRecover('inp-coeff', 'S05-extraFactor-stale', '0.95');
await staleThenRecover('inp-floor', 'S06-preset-floor-stale');
await staleThenRecover('inp-zone', 'S06-preset-zone-stale');
await setMode('manual');
await staleThenRecover('inp-manual-pos', 'S07-manual-positive-stale', '1555');
await staleThenRecover('inp-manual-neg', 'S07-manual-negative-stale', '-1444');

// 固定文だけで、入力値を写さない
{
  await setValue('inp-W', '98765');
  const s = await single();
  check('S02-no-echo', s.text === SINGLE_TEXT.stale && !/98765/.test(s.text), s.text);
  await setValue('inp-W', '900');
  await calc();
}

// S08: 告示風圧計算の風条件
await setMode('notification');
{
  const s = await single();
  check('S13-mode-switch-auto-calc', isState(s, 'fresh') && (await resultTitles()).includes(LABEL.notification), s.attr);
}
for (const [id, value] of [['inp-wind-v0', '32'], ['inp-wind-roughness'], ['inp-wind-building-h', '15'], ['inp-wind-eaves-h', '11'],
  ['inp-wind-z', '7.5'], ['inp-wind-building-type'], ['inp-wind-zone'], ['inp-wind-basis'], ['inp-wind-short-side', '20']]) {
  await staleThenRecover(id, 'S08-notification-' + id.replace('inp-wind-', '') + '-stale', value);
}
// 協会推奨のときだけ再現期間が計算に効く
{
  await setValue('inp-wind-basis', 'itakyo_recommended');
  await calc();
  await staleThenRecover('inp-wind-recurrence', 'S08-notification-recurrence-stale', '200');
  await setValue('inp-wind-basis', 'notification_baseline');
  await calc();
  await setValue('inp-wind-recurrence', '300');   // 告示1458号系では再現期間は使わない
  const s = await single();
  check('S14-recurrence-ignored-in-baseline', isState(s, 'fresh'), s.attr);
}
// S15: 参考比較の表示も結果の表示に効く
await staleThenRecover('inp-wind-compare', 'S15-preset-comparison-stale');

// S14: 選んでいない mode の隠れた入力では「変更前」にしない
{
  await setValue('inp-manual-pos', '2999');
  await setValue('inp-floor', await optionOtherThan('inp-floor'));
  const n = await single();
  await setMode('manual');
  await setValue('inp-wind-v0', '45');
  await setValue('inp-wind-compare', 'off');
  await setValue('inp-floor', await optionOtherThan('inp-floor'));
  const m = await single();
  await setMode('preset');
  await setValue('inp-manual-neg', '-2888');
  await setValue('inp-wind-zone', 'corner');
  const p = await single();
  check('S14-hidden-inputs-ignored', isState(n, 'fresh') && isState(m, 'fresh') && isState(p, 'fresh'), `${n.attr} ${m.attr} ${p.attr}`);
}

// L01 / L05: 案件プリセットの出どころと数値（Node の registry と一致）
{
  const floor = await page.evaluate(() => document.getElementById('inp-floor').value);
  const zone = await page.evaluate(() => document.getElementById('inp-zone').value);
  const design = Math.max(Math.abs(RUNTIME_DEFAULT.getPositivePressure(floor)), Math.abs(RUNTIME_DEFAULT.getNegativePressure(zone)));
  const titles = await resultTitles();
  const text = (await single()).result;
  check('L01-preset-label', titles.some((t) => t.startsWith(LABEL.preset)) && text.includes('正圧・負圧は告示から自動算定した値ではなく、現在の案件プリセットの値です'),
    titles.join(' | '));
  check('L05-preset-values', (await designPressureShown()) === design + ' N/m²', `${await designPressureShown()} vs ${design}`);
}

// L02 / L05: 手入力
{
  await setMode('manual');
  await setValue('inp-manual-pos', '1400');
  await setValue('inp-manual-neg', '-1000');
  await calc();
  const text = (await single()).result;
  check('L02-manual-label', (await resultTitles()).includes(LABEL.manual) && text.includes('source: user_input'), '');
  check('L05-manual-values', (await designPressureShown()) === '1400 N/m²', await designPressureShown());
}

// L03 / L05 / L06: 告示風圧計算（「手入力値」「user_input」を出さない。算定値を verified にしない）
{
  await setMode('notification');
  await setValue('inp-wind-v0', '30');
  await setValue('inp-wind-compare', 'on');
  await calc();
  const text = (await single()).result;
  const shown = await designPressureShown();
  check('L03-notification-label', (await resultTitles()).includes(LABEL.notification) && !text.includes('手入力値') && !text.includes('user_input') &&
    text.includes('入力した風条件から告示1458号系の算定式で計算した値です（sourceKind: notification_calculation）'), '');
  check('L05-notification-values', shown === Math.round(NOTIFICATION_DEFAULT.designPressure) + ' N/m²',
    `${shown} vs ${NOTIFICATION_DEFAULT.designPressure}`);
  check('L06-notification-unverified', text.includes('（verificationStatus: unverified）') &&
    text.includes('⚠ 算定値 — 式は一次資料で確認済み／入力した風条件は未検証') && !/verificationStatus: verified/.test(text), '');
}

// S09 / S13 / L04: 取り込みデータ（Export → Import で imported mode。Import 後は現在の結果）
{
  await setMode('manual');
  await calc();
  await page.click('#btn-export');
  await page.click('#btn-import');
  await page.waitForTimeout(50);
  const s = await single();
  const mode = await page.evaluate(() => document.getElementById('inp-mode').value);
  const text = s.result;
  check('S13-import-auto-calc-fresh', mode === 'imported' && isState(s, 'fresh'), `${mode} ${s.attr}`);
  check('L04-imported-label', (await resultTitles()).includes(LABEL.imported) && text.includes('verificationStatus: unverified'), '');
  check('L05-imported-values', (await designPressureShown()) === '1400 N/m²', await designPressureShown());
  await staleThenRecover('inp-W', 'S09-imported-W-stale', '1111');
  await staleThenRecover('inp-type', 'S09-imported-glassType-stale');
}

// S10: 入力が正規化できないと「以前の入力」。計算ボタンを押しても（失敗して）現在扱いしない
{
  await setMode('manual');
  await calc();
  const before = await single();
  await page.fill('#inp-W', '');
  const s = await single();
  check('S10-invalid-not-current', isState(s, 'invalid') && s.badgeAfter === '"以前の入力"' && s.result === before.result && s.opacity < 1, s.attr);
  const n = dialogs.length;
  await calc();
  const s2 = await single();
  check('S10-invalid-calc-still-not-current', dialogs.length === n + 1 && isState(s2, 'invalid') && s2.result === before.result, s2.attr);
  // 入力を元の値に戻しても、計算が失敗した後は再計算するまで現在の結果として扱わない
  await page.fill('#inp-W', '900');
  const s3 = await single();
  check('S12-failed-attempt-keeps-not-current', isState(s3, 'failed'), s3.attr);
  // S11: 明示の再計算に成功すると戻る
  await calc();
  const s4 = await single();
  check('S11-recalc-fresh', isState(s4, 'fresh') && s4.badgeAfter === 'none', `${s3.attr} -> ${s4.attr}`);
}

// S12: 計算の途中の例外（描画の失敗を注入）では、前の結果を現在扱いしない
{
  const before = await single();
  await page.evaluate(() => { window.__realRenderResults = window.renderResults; window.renderResults = () => { throw new Error('injected'); }; });
  await page.fill('#inp-W', '1000');
  await calc();
  const s = await single();
  check('S12-failed-not-current', isState(s, 'failed') && s.badgeAfter === '"以前の入力"' && s.result === before.result, s.attr);
  await page.fill('#inp-W', '900');
  const s2 = await single();
  check('S12-failed-even-if-inputs-match', isState(s2, 'failed'), s2.attr);
  await page.evaluate(() => { window.renderResults = window.__realRenderResults; delete window.__realRenderResults; });
  await calc();
  check('S12-recover-after-success', isState(await single(), 'fresh'), '');
  pageErrors.splice(pageErrors.indexOf('injected'), 1);
}

// S13: 取り込みデータが無いまま imported mode にすると（自動計算が失敗し）以前の結果を現在扱いしない
{
  await page.evaluate(() => { importedPackage = null; });
  const n = dialogs.length;
  await setMode('imported');
  const s = await single();
  check('S13-imported-without-package-not-current', dialogs.length === n + 1 && isState(s, 'invalid'), s.attr);
  await setMode('manual');
  check('S13-back-to-manual-fresh', isState(await single(), 'fresh'), '');
}

// S16: イベントを伴わない値の変更も、次の判定で検出する
{
  await page.evaluate(() => { document.getElementById('inp-H').value = '2100'; });
  const judged = await page.evaluate(() => getSingleResultFreshness());
  const shownBefore = await single();
  await page.click('#view-single .card-title');   // 何かの操作で表示が判定し直される
  const shownAfter = await single();
  check('S16-programmatic-change-detected', judged === 'stale' && shownAfter.attr === 'stale' && shownAfter.text === SINGLE_TEXT.stale,
    `judged=${judged} shownBefore=${shownBefore.attr}`);
  await page.fill('#inp-H', '1800');
  await calc();
}

// S17: Project Pack 欄と干渉しない（Pack の読込で単一ケースの結果も鮮度も変わらず、鮮度の変化で Pack 欄も変わらない）
{
  const before = await single();
  await page.evaluate((t) => { document.getElementById('pack-paste').value = t; }, PACK_FIXTURE);
  await page.click('#btn-pack-load');
  await page.waitForSelector('#pack-preview:not([hidden])');
  const afterLoad = await single();
  const packBefore = await page.evaluate(() => document.getElementById('project-pack-section').innerText);
  await page.fill('#inp-W', '1300');
  const packAfter = await page.evaluate(() => document.getElementById('project-pack-section').innerText);
  check('S17-pack-noninterference', isState(afterLoad, 'fresh') && afterLoad.result === before.result && packBefore === packAfter &&
    !(await page.evaluate(() => document.getElementById('project-pack-section').contains(document.getElementById('single-result-freshness')))), '');
  await page.fill('#inp-W', '900');
  await calc();
  await page.click('#btn-pack-unload');
}

/* ============================================================
   Workspace
============================================================ */

await page.click('#view-tab-batch');
{
  const w = await ws();
  check('W01-initial-none', w.summaryAttr === 'none' && w.resultsAttr === 'none' && w.judged === 'none' && w.summaryCardHidden &&
    w.resultsCardHidden && w.summaryHidden && w.resultsHidden && w.summaryRole === 'status' && w.summaryLive === 'polite', JSON.stringify(w).slice(0, 120));
}
await clickText('＋ 現在の入力条件を追加');
await evaluateBatch();
let w2 = await ws();
check('W02-evaluated-fresh', wsFresh(w2) && !w2.summaryCardHidden && w2.count === '1 件' && w2.rows === 1, w2.summaryAttr);
await clickText('＋ 現在の入力条件を追加');
{
  const w = await ws();
  check('W03-add-stale', w.count === '2 件' && wsStale(w) && w.rows === 1, `${w.count} rows=${w.rows} ${w.summaryAttr}`);
  check('W04-old-results-kept-and-marked', w.summary === w2.summary && w.table === w2.table && wsStale(w), '');
}
await evaluateBatch();
w2 = await ws();
check('W05-reevaluated-fresh', wsFresh(w2) && w2.rows === 2, `rows=${w2.rows}`);

// W06: 行の削除・複製（どちらも計算し直す）
{
  await page.click('#batch-table tbody tr:nth-child(1) button:has-text("複製")');
  await page.waitForTimeout(30);
  const d = await ws();
  await page.click('#batch-table tbody tr:nth-child(1) button:has-text("削除")');
  await page.waitForTimeout(30);
  const r = await ws();
  check('W06-duplicate-delete-fresh', wsFresh(d) && d.rows === 3 && wsFresh(r) && r.rows === 2, `${d.rows} ${r.rows}`);
}

// W09: 件数が同じで内容が変わった（イベントを伴わない変更も、判定で検出する）
{
  await page.evaluate(() => {
    const ids = batchWorkspace.listCases().map((c) => c.caseId);
    const pkg = batchWorkspace.listCases()[0].inputPackage;
    batchWorkspace.removeCase(ids[0]);
    batchWorkspace.addCase(Object.assign({}, pkg, { widthMm: pkg.widthMm + 1 }));
    batchUpdateCount();
  });
  const w = await ws();
  check('W09-same-count-different-content-stale', w.count === '2 件' && wsStale(w), w.summaryAttr);
  await evaluateBatch();
}

// W07: TSV・JSON の取り込みは計算し直す
{
  await clickText('列見本（manual）');
  const tpl = await page.inputValue('#batch-tsv');
  const header = tpl.split('\n')[0].split('\t');
  const row = header.map((h) => ({ case_id: 'T1', label: 'tsv', mode: 'manual', width_mm: '1200', height_mm: '2000', glass_type: 'fl_single',
    extra_factor: '1', positive_pressure: '1500', negative_pressure: '-1100' }[h] ?? ''));
  await page.fill('#batch-tsv', header.join('\t') + '\n' + row.join('\t'));
  await page.click('#btn-batch-tsv-import');
  await page.waitForTimeout(30);
  const t = await ws();
  await clickText('⬇ Workspace JSONをExport');
  await clickText('⬆ Workspace JSONをImport');
  const j = await ws();
  check('W07-tsv-json-import-fresh', wsFresh(t) && t.rows === 3 && wsFresh(j) && j.rows === 3, `${t.rows} ${j.rows}`);
}

// W08: 診断（取り込めなかった行）の増減も検出する
{
  const bad = await page.evaluate(() => {
    const before = batchInvalidDiagnostics.length;
    const tsv = document.getElementById('batch-tsv');
    tsv.value = tsv.value.split('\n')[0] + '\nT2\tbad\tmanual\tx\t2000\tfl_single\t1\t1500\t-1100';
    return before;
  });
  await page.click('#btn-batch-tsv-import');
  await page.waitForTimeout(30);
  const withDiag = await ws();
  const added = await page.evaluate(() => batchInvalidDiagnostics.length);
  await page.evaluate(() => {
    window.__savedDiagnostics = batchInvalidDiagnostics.slice();
    batchInvalidDiagnostics = batchInvalidDiagnostics.slice(0, -1);
    renderWorkspaceResultFreshness();
  });
  const removed = await ws();
  await evaluateBatch();
  await page.evaluate(() => { batchInvalidDiagnostics = window.__savedDiagnostics; delete window.__savedDiagnostics; batchUpdateCount(); });
  const readded = await ws();
  check('W08-diagnostics-change-stale', added === bad + 1 && wsFresh(withDiag) && wsStale(removed) && wsStale(readded),
    `${bad} -> ${added}: ${withDiag.summaryAttr} ${removed.summaryAttr} ${readded.summaryAttr}`);
  await page.evaluate(() => { batchInvalidDiagnostics = []; });
  await evaluateBatch();
}

// W10 / W11: 古い結果の CSV は出さず（出力欄を書き換えない）、現在の結果の CSV は従来どおり
{
  await clickText('＋ 現在の入力条件を追加');
  await page.fill('#batch-json', '{"keep":"this text"}');
  await clickText('⬇ 結果CSVを出力');
  const refused = await page.evaluate(() => ({ value: document.getElementById('batch-json').value,
    status: document.getElementById('batch-json-status').textContent, error: document.getElementById('batch-json-status').classList.contains('is-error') }));
  check('W10-stale-csv-refused', refused.value === '{"keep":"this text"}' && refused.status === WS_TEXT.csvNotCurrent && refused.error, refused.status);
  await evaluateBatch();
  await clickText('⬇ 結果CSVを出力');
  const csv = await page.evaluate(() => ({ value: document.getElementById('batch-json').value,
    expected: WorkspaceCore.toCsv(WorkspaceCore.mergeEvaluationResults(WorkspaceCore.evaluateWorkspace(batchWorkspace), batchInvalidDiagnostics)).replace(/\r\n/g, '\n'),
    columns: WorkspaceCore.CSV_COLUMNS.join(',') }));
  const lines = csv.value.split('\n');
  check('W11-fresh-csv-unchanged', csv.value === csv.expected && lines[0] === csv.columns && lines.length === 5, `lines=${lines.length}`);
  // 出力欄に残った CSV が古くなったら、欄を書き換えずに専用の欄で注記する（操作の status には書かない）
  await clickText('＋ 現在の入力条件を追加');
  const note = await page.evaluate(() => ({ value: document.getElementById('batch-json').value,
    warn: document.getElementById('batch-csv-freshness').textContent, warnHidden: document.getElementById('batch-csv-freshness').hidden,
    status: document.getElementById('batch-json-status').textContent }));
  check('W11-old-csv-output-noted', note.value === csv.value && note.warn === WS_TEXT.csvOutputStale && !note.warnHidden &&
    note.status !== WS_TEXT.csvOutputStale, note.warn);
  await evaluateBatch();
}

// RF27-1–7（RF-27-01）: 出力欄に残った古い結果 CSV の警告は専用の欄。操作の status とは干渉しない
{
  const csvState = () => page.evaluate(() => {
    const w = document.getElementById('batch-csv-freshness');
    const st = document.getElementById('batch-json-status');
    const field = document.getElementById('batch-json');
    return { warnHidden: w.hidden, warnText: w.textContent, shown: !w.hidden && w.getBoundingClientRect().height > 0,
      role: w.getAttribute('role'), live: w.getAttribute('aria-live'), describedBy: field.getAttribute('aria-describedby'),
      status: st.textContent, statusError: st.classList.contains('is-error'), value: field.value };
  });
  const warned = (c) => !c.warnHidden && c.shown && c.warnText === WS_TEXT.csvOutputStale;
  const clear = (c) => c.warnHidden && c.warnText === '';
  const CSV_DONE = '結果CSVを出力しました。';
  const JSON_DONE = 'Workspace JSONを出力しました（入力のみ。計算結果は含みません）。';
  const seen = [];
  const snap = async () => { const c = await csvState(); seen.push(c); return c; };

  // 1: 現在の CSV を出す → Workspace を変える → 警告
  await clickText('⬇ 結果CSVを出力');
  const issued = await snap();
  await clickText('＋ 現在の入力条件を追加');
  const changed = await snap();
  check('RF27-1-fresh-csv-then-change-warns', clear(issued) && issued.status.startsWith(CSV_DONE) && warned(changed) &&
    changed.value === issued.value && changed.role === 'status' && changed.live === 'polite' && changed.describedBy === 'batch-csv-freshness',
    `${issued.warnHidden} ${changed.warnHidden}`);

  // 2: 古い CSV が残ったまま Import（CSV は Workspace JSON として読めない）→ エラーの status が出ても警告は残る
  await clickText('⬆ Workspace JSONをImport');
  const badImport = await snap();
  check('RF27-2-invalid-json-import-keeps-warning', badImport.status.startsWith('読み込めませんでした: ') && badImport.statusError &&
    warned(badImport) && badImport.value === issued.value, `${badImport.statusError} ${badImport.warnHidden}`);

  // 3: 一括計算し直しても、以前の CSV が出力欄に残る間は警告を出し続ける
  await evaluateBatch();
  const reevaluated = await snap();
  const w3 = await ws();
  check('RF27-3-reevaluate-keeps-warning-while-old-csv', wsFresh(w3) && warned(reevaluated) && reevaluated.value === issued.value, w3.summaryAttr);

  // 7a: 現在の結果でないときに CSV を押す → gate の status（エラー）と警告が別々に出る
  await clickText('＋ 現在の入力条件を追加');
  await clickText('⬇ 結果CSVを出力');
  const refused = await snap();
  await evaluateBatch();

  // 4: 新しい現在の CSV を出すと警告は外れる
  await clickText('⬇ 結果CSVを出力');
  const reissued = await snap();
  check('RF27-4-new-fresh-csv-clears-warning', clear(reissued) && reissued.value !== issued.value && reissued.status.startsWith(CSV_DONE) &&
    !reissued.statusError, `${reissued.warnHidden}`);

  // 5: 出力欄が Workspace JSON などに置き換わったら、以前の CSV の警告は出さない
  //    （Export のボタン / 貼り付け / イベントを伴わない batchExportJson()。欄に CSV が戻れば内容で判定し直す）
  await clickText('＋ 現在の入力条件を追加');
  const beforeReplace = await snap();
  await clickText('⬇ Workspace JSONをExport');
  const exported = await snap();
  await page.fill('#batch-json', reissued.value);
  const restored = await snap();
  await page.fill('#batch-json', '{"pasted":"text"}');
  const pasted = await snap();
  await page.fill('#batch-json', reissued.value);
  const restoredAgain = await snap();
  await page.evaluate(() => batchExportJson());
  const programmatic = await snap();
  check('RF27-5-json-export-replace-no-false-warning', warned(beforeReplace) && clear(exported) && exported.value.startsWith('{') &&
    exported.status === JSON_DONE && warned(restored) && clear(pasted) && warned(restoredAgain) && clear(programmatic) &&
    programmatic.value.startsWith('{'), [beforeReplace, exported, restored, pasted, restoredAgain, programmatic].map((c) => (c.warnHidden ? '-' : 'W')).join(''));

  // 6: setView で切り替えても状態が正しい（単一ケースの表示中に、イベントを伴わずに Workspace を変えた場合も）
  await page.fill('#batch-json', reissued.value);
  const pre6 = await snap();
  await page.click('#view-tab-single');
  await page.click('#view-tab-batch');
  const back = await snap();
  await page.click('#view-tab-single');
  await page.evaluate(() => {
    const cs = batchWorkspace.listCases();
    window.__rf27Case = cs[cs.length - 1].inputPackage;
    batchWorkspace.removeCase(cs[cs.length - 1].caseId);   // CSV を出したときの内容へ戻す（イベントなし）
  });
  await page.click('#view-tab-batch');
  const matched = await snap();
  await page.click('#view-tab-single');
  await page.evaluate(() => { batchWorkspace.addCase(window.__rf27Case); delete window.__rf27Case; });   // また変える（イベントなし）
  await page.click('#view-tab-batch');
  const changedAgain = await snap();
  check('RF27-6-setview-warning-state', warned(pre6) && warned(back) && clear(matched) && warned(changedAgain),
    [pre6, back, matched, changedAgain].map((c) => (c.warnHidden ? '-' : 'W')).join(''));

  // 7: 操作の status と専用の警告は干渉しない（gate の拒否・Import の失敗と警告が並ぶ、Export の status は警告を書き換えない、
  //    警告の文は status に入らず、status の文は警告の欄に入らない）
  check('RF27-7-status-and-warning-independent', refused.status === WS_TEXT.csvNotCurrent && refused.statusError && warned(refused) &&
    refused.value === issued.value && warned(badImport) && badImport.statusError && exported.status === JSON_DONE &&
    seen.every((c) => c.status !== WS_TEXT.csvOutputStale && (c.warnText === '' || c.warnText === WS_TEXT.csvOutputStale)),
    `${refused.statusError} ${refused.warnHidden} ${seen.length}`);
  await evaluateBatch();
}

// W12: 設計レビュー資料の鮮度・印刷の gate は従来どおり（Workspace の鮮度とは別）
{
  await page.click('#btn-rep-generate');
  await page.waitForTimeout(30);
  const printAllowed = () => page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const allowed = document.body.classList.contains('review-print-allowed');
    window.dispatchEvent(new Event('afterprint'));
    return allowed;
  });
  const rep = () => page.evaluate(() => document.getElementById('rep-freshness').textContent);
  const fresh = { text: await rep(), print: await printAllowed() };
  await clickText('＋ 現在の入力条件を追加');
  const staleWs = { text: await rep(), print: await printAllowed(), ws: (await ws()).summaryAttr };
  await evaluateBatch();
  const reevaluated = { text: await rep(), print: await printAllowed(), ws: (await ws()).summaryAttr };
  await page.click('#btn-rep-generate');
  await page.waitForTimeout(30);
  const regenerated = { text: await rep(), print: await printAllowed() };
  check('W12-review-gate-unchanged', fresh.text === REVIEW_TEXT.FRESH && fresh.print === true &&
    staleWs.text === REVIEW_TEXT.WORKSPACE_STALE && staleWs.print === false && staleWs.ws === 'stale' &&
    reevaluated.print === false && reevaluated.ws === 'fresh' && regenerated.text === REVIEW_TEXT.FRESH && regenerated.print === true,
    JSON.stringify({ fresh, staleWs, reevaluated, regenerated }));
}

// W-failed: 一括計算の途中の例外（描画の失敗を注入）では、前の結果を現在扱いしない
{
  const before = await ws();
  await page.evaluate(() => { window.__realBatchRender = window.batchRender; window.batchRender = () => { throw new Error('injected'); }; });
  await clickText('＋ 現在の入力条件を追加');
  await evaluateBatch();
  const f = await ws();
  await page.evaluate(() => { window.batchRender = window.__realBatchRender; delete window.__realBatchRender; });
  check('W-evaluation-failed-not-current', f.summaryAttr === 'failed' && f.judged === 'failed' && f.summaryText === WS_TEXT.summaryFailed &&
    f.resultsText === WS_TEXT.resultsFailed && f.summary === before.summary, f.summaryAttr);
  await page.fill('#batch-json', '');
  await clickText('⬇ 結果CSVを出力');
  const csv = await page.evaluate(() => ({ value: document.getElementById('batch-json').value, status: document.getElementById('batch-json-status').textContent }));
  check('W-failed-csv-refused', csv.value === '' && csv.status === WS_TEXT.csvNotCurrent, csv.status);
  await evaluateBatch();
  check('W-recover-after-success', wsFresh(await ws()), '');
}

// W-clear: すべて削除で未計算に戻る
{
  await clickText('✕ すべて削除');
  const w = await ws();
  check('W-clear-none', w.summaryAttr === 'none' && w.judged === 'none' && w.summaryCardHidden && w.resultsCardHidden, w.summaryAttr);
}

// W-first-export: 未計算で CSV を押すと、従来どおり一括計算してから出す（現在の結果だけ）
{
  await page.click('#view-tab-single');
  await setMode('manual');
  await page.click('#view-tab-batch');
  await clickText('＋ 現在の入力条件を追加');
  await clickText('⬇ 結果CSVを出力');
  const r = await page.evaluate(() => ({ lines: document.getElementById('batch-json').value.split('\n').length, judged: getWorkspaceResultFreshness() }));
  check('W-first-export-evaluates-then-exports', r.lines === 2 && r.judged === 'fresh', JSON.stringify(r));
}

/* ---------- 保存・通信・URL・console ---------- */

{
  const calls = await page.evaluate(() => Object.assign({}, window.__freshnessProbe));
  const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
  check('P-no-persistence', calls.storage === 0 && calls.cookie === 0 && calls.idb === 0 && storage.ls === 0 && storage.ss === 0 && storage.cookie === 0,
    JSON.stringify(storage));
  check('P-no-network', requests.length === 0 && calls.fetch === 0 && calls.xhr === 0 && calls.beacon === 0, `requests=${requests.length}`);
  const url = await page.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
  check('P-no-url', url.hash === '' && url.search === '' && url.href === FILE && calls.history === 0, JSON.stringify(url));
  const unexpected = pageErrors.filter((e) => e !== 'injected');
  check('P-no-console', consoleMessages.length === 0 && unexpected.length === 0, `console=${consoleMessages.length} errors=${unexpected.length}`);
}

console.log(results.join('\n'));
await browser.close();

console.log(`\nresult-freshness: ${pass} pass / ${fail} fail`);
finishRun('result-freshness', pass + fail, fail, { playwrightSource });
