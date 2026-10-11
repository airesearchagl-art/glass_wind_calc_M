// 目的別の 3 画面（Phase 2L-B2 / S3-B3B2-B2）を実ブラウザで確かめる。
//
// この harness は page の UI（タブのクリック・キーボード・入力欄・計算・一括検討・Project Pack の操作）を使って、
// どの画面が見えているか（Playwright の可視判定・checkVisibility()・祖先の hidden）、タブの ARIA と focus、
// 画面を切り替えたときの単一ケース・Workspace・staged Pack の状態、印刷の扱い、1280px / 390px の配置を観測する。
// 合成の値だけを使う（Project Pack は tests/fixtures/project-pack の合成 fixture と tests/support/synthetic-pack.js）。
// 期待値は page の外の literal と、page の中で切り替える前に読んだ値（切り替えの前後で比べる）から作る。
//
// 確かめること:
//   N01–N09 画面の切替: 初期は単一ケースだけ / 切り替えると他の 2 画面は隠れる / 入力・結果・Workspace・staged Pack は
//     残る / 未知の値では何も変えない / 同時に 2 画面以上を出さない / [hidden] を CSS が上書きしない
//   A01–A06 アクセシビリティ: aria-controls・aria-labelledby が実在の要素を指す / ←→・Home・End / tabindex と focus /
//     隠れた画面に focus を残さない / 390px でもタブを操作できる
//   S01–S12 非干渉: Pack の画面を開いても単一ケースの結果・鮮度、Workspace の鮮度・CSV gate・古い CSV の警告は変わらない /
//     active context は変わらない / Pack を Workspace へ変換しない / Pack は未レビューのまま / Pack の計算・キャンセルは
//     画面の切替で変わらない / 設計レビュー資料の印刷 gate は従来どおり / Pack は印刷しない / 保存・通信・URL なし
//   L01–L05 配置: Workspace の最初のカードは Pack に押し下げられない / 1280px・390px でタブが読めて選択が分かる /
//     タブの列がページ全体の幅を広げない / 鮮度の表示が消えたり重なったりしない
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const { syntheticPack } = require(REPO + 'tests/support/synthetic-pack.js');
const PACK_FIXTURE = fs.readFileSync(REPO + 'tests/fixtures/project-pack/synthetic-case-direct.json', 'utf8');
const BIG_PACK = JSON.stringify(syntheticPack(2000, 'notification1458', { label: 'Synthetic Stress Nav' }));

const VIEWS = ['single', 'batch', 'pack'];
const TAB_LABELS = { single: '単一ケース', batch: '複数ケース（Workspace）', pack: 'Project Pack（未レビュー）' };
const SINGLE_STALE = '入力が変更されました。この結果は変更前の入力によるものです。再計算してください。';
const WS_SUMMARY_STALE = 'Workspaceが変更されています。表示中の集計は変更前の結果です。一括計算し直してください。';
const CSV_NOT_CURRENT = 'CSVを出力しませんでした。表示中の結果は現在のWorkspaceの内容と一致していません。一括計算し直してから出力してください。';
const CSV_OUTPUT_STALE = 'この欄の結果CSVは変更前のWorkspaceの結果です。現在の内容のCSVが必要な場合は、一括計算し直してから出力してください。';
const PACK_CANCELLED = '全ケースの計算をキャンセルしました。未レビューPackの一括結果は現在ありません。';

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('three-view-navigation', () => ({ checksRun: pass + fail, failures: fail }));
const browser = await chromium.launch();

/** 保存・通信・URL の呼び出しを数える（page を読み込む前に仕込む）。 */
const PROBE = () => {
  const calls = { storage: 0, cookie: 0, idb: 0, beacon: 0, fetch: 0, xhr: 0, history: 0 };
  window.__navProbe = calls;
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

async function openPage(width, height) {
  const p = await browser.newPage({ viewport: { width, height } });
  const log = { console: [], errors: [], requests: [] };
  p.on('console', (m) => log.console.push(m.text()));
  p.on('pageerror', (e) => log.errors.push(e.message));
  p.on('request', (r) => { if (!r.url().startsWith('file://')) log.requests.push(r.url()); });
  p.on('dialog', async (d) => { await d.accept(); });
  await p.addInitScript(PROBE);
  await p.goto(FILE);
  await p.waitForSelector('.judge-badge');
  return { p, log };
}

const { p: page, log } = await openPage(1280, 900);

/* ---------- helpers ---------- */

/** どの画面が見えているか（Playwright の可視判定・checkVisibility()・祖先の hidden を合わせて見る）。 */
async function shownViews(p = page) {
  const dom = await p.evaluate(() => {
    const probe = { single: '#result-area', batch: '#batch-tsv', pack: '#pack-paste' };
    const out = {};
    Object.keys(probe).forEach((v) => {
      const panel = document.getElementById('view-' + v);
      const inner = document.querySelector(probe[v]);
      out[v] = { hidden: panel.hidden, display: getComputedStyle(panel).display, panel: panel.checkVisibility(),
        inner: inner.checkVisibility(), innerInHidden: !!inner.closest('[hidden]') && inner.closest('[hidden]') === panel };
    });
    return out;
  });
  const shown = [];
  for (const v of VIEWS) {
    const pw = await p.isVisible('#view-' + v);
    const d = dom[v];
    const visible = pw && d.panel && d.inner && !d.hidden;
    const invisible = !pw && !d.panel && !d.inner && d.hidden && d.display === 'none';
    if (visible) shown.push(v);
    else if (!invisible) shown.push(v + '?');   // 食い違い（見えているのか隠れているのか判定が揃わない）
  }
  return shown;
}
/** タブの ARIA・tabindex・class と focus。 */
const tabState = (p = page) => p.evaluate(() => {
  const tabs = [...document.querySelectorAll('.view-switch [role="tab"]')];
  return {
    tabs: tabs.map((t) => ({ id: t.id, selected: t.getAttribute('aria-selected'), tabindex: t.getAttribute('tabindex'),
      active: t.classList.contains('is-active'), controls: t.getAttribute('aria-controls'), label: t.textContent.trim() })),
    focus: document.activeElement ? document.activeElement.id : null
  };
});
const selectedOnly = (st, view) => st.tabs.every((t) => (t.id === 'view-tab-' + view)
  ? t.selected === 'true' && t.tabindex === '0' && t.active
  : t.selected === 'false' && t.tabindex === '-1' && !t.active);
const observed = [];   // 切り替えのたびに見えていた画面（N08）
async function go(view, p = page) {
  await p.click('#view-tab-' + view);
  const s = await shownViews(p);
  if (p === page) observed.push(s.join(','));
  return s;
}
const singleState = () => page.evaluate(() => ({
  result: document.getElementById('result-area').innerText,
  attr: document.getElementById('result-area').getAttribute('data-result-freshness'),
  judged: getSingleResultFreshness(),
  banner: document.getElementById('single-result-freshness').textContent,
  bannerHidden: document.getElementById('single-result-freshness').hidden,
  inputs: ['inp-mode', 'inp-W', 'inp-H', 'inp-type', 'inp-coeff', 'inp-floor', 'inp-zone'].map((id) => document.getElementById(id).value).join('|')
}));
const workspaceState = () => page.evaluate(() => ({
  count: document.getElementById('batch-count').textContent,
  table: document.getElementById('batch-table').innerText,
  summary: document.getElementById('batch-summary').innerText,
  serialized: WorkspaceCore.serializeWorkspace(batchWorkspace),
  results: batchResults.length,
  judged: getWorkspaceResultFreshness(),
  summaryBanner: document.getElementById('batch-summary-freshness').textContent,
  csvWarn: document.getElementById('batch-csv-freshness').textContent,
  csvWarnHidden: document.getElementById('batch-csv-freshness').hidden,
  field: document.getElementById('batch-json').value,
  status: document.getElementById('batch-json-status').textContent
}));
const packState = () => page.evaluate(() => ({
  staged: JSON.stringify(window.stagedProjectPack) + JSON.stringify(window.stagedProjectPackContext),
  trust: window.stagedProjectPackContext ? window.stagedProjectPackContext.trust : null,
  status: document.getElementById('pack-status').textContent,
  preview: document.getElementById('pack-preview').innerText,
  previewHidden: document.getElementById('pack-preview').hidden,
  exec: window.stagedProjectPackExecution ? JSON.stringify(window.stagedProjectPackExecution) : null,
  execText: document.getElementById('pack-exec-result').innerText,
  batch: window.stagedProjectPackBatch ? JSON.stringify(window.stagedProjectPackBatch) : null,
  batchStatus: document.getElementById('pack-batch-status').textContent
}));
const activeState = () => page.evaluate(() => ({
  same: activeProjectContext === window.__activeAtStart,
  sourceKind: activeProjectContext.sourceKind, trust: activeProjectContext.trust, label: activeProjectContext.publicLabel,
  presetLabel: document.getElementById('preset-name-label').textContent
}));

await page.evaluate(() => { window.__activeAtStart = activeProjectContext; });
const ACTIVE0 = await activeState();

/* ---------- N01 初期表示 ---------- */

{
  const s = await shownViews();
  const t = await tabState();
  observed.push(s.join(','));
  check('N01-initial-single-only', s.join(',') === 'single' && selectedOnly(t, 'single') &&
    t.tabs.map((x) => x.label).join('|') === VIEWS.map((v) => TAB_LABELS[v]).join('|'), `${s.join(',')} ${t.tabs.map((x) => x.label).join('|')}`);
}

/* ---------- A01 ARIA の参照・アクセシビリティツリー ---------- */

{
  const refs = await page.evaluate(() => {
    const list = document.querySelector('.view-switch');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    return { role: list.getAttribute('role'), label: list.getAttribute('aria-label'), count: tabs.length,
      pairs: tabs.map((t) => {
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        return { tab: t.id, panel: panel ? panel.id : null, panelRole: panel && panel.getAttribute('role'),
          labelledBy: panel && panel.getAttribute('aria-labelledby'), button: t.tagName === 'BUTTON' && t.type === 'button' };
      }),
      panels: document.querySelectorAll('[role="tabpanel"]').length };
  });
  const a11yTabs = await page.getByRole('tab').count();
  const a11yPanels = await page.getByRole('tabpanel').count();
  const singlePanel = await page.getByRole('tabpanel', { name: TAB_LABELS.single }).count();
  const selectedTab = await page.getByRole('tab', { selected: true }).count();
  check('A01-aria-references', refs.role === 'tablist' && !!refs.label && refs.count === 3 && refs.panels === 3 &&
    refs.pairs.every((x) => x.button && x.panel === x.tab.replace('view-tab-', 'view-') && x.panelRole === 'tabpanel' && x.labelledBy === x.tab) &&
    a11yTabs === 3 && a11yPanels === 1 && singlePanel === 1 && selectedTab === 1,
    `tabs=${a11yTabs} panels in a11y tree=${a11yPanels} selected=${selectedTab}`);
}

/* ---------- N02 / N03 / N09 / L01 ---------- */

{
  const b = await go('batch');
  const tb = await tabState();
  // L01: Workspace の最初のカード（案件プロファイル）はタブの直下にあり、Pack 欄に押し下げられない
  const first = await page.evaluate(() => {
    const tabs = document.querySelector('.view-switch').getBoundingClientRect();
    const card = document.querySelector('#view-batch > .card');
    return { gap: Math.round(card.getBoundingClientRect().top - tabs.bottom), title: card.querySelector('.card-title').textContent,
      packH: document.getElementById('project-pack-section').getBoundingClientRect().height };
  });
  check('N02-batch-only', b.join(',') === 'batch' && selectedOnly(tb, 'batch'), b.join(','));
  check('L01-workspace-first-card-not-pushed-down', first.gap >= 0 && first.gap < 60 && first.title === '案件プロファイル（風条件の共通値）' &&
    first.packH === 0, JSON.stringify(first));
  const k = await go('pack');
  const tk = await tabState();
  check('N03-pack-only', k.join(',') === 'pack' && selectedOnly(tk, 'pack') &&
    await page.getByRole('tabpanel', { name: TAB_LABELS.pack }).count() === 1, k.join(','));
  // N09: 隠れた画面は [hidden] のとおり display: none（CSS の display: grid / block が上書きしない）
  const disp = await page.evaluate(() => ['single', 'batch', 'pack'].map((v) => {
    const el = document.getElementById('view-' + v);
    return v + ':' + el.hidden + ':' + getComputedStyle(el).display;
  }));
  await go('single');
  const disp2 = await page.evaluate(() => ['single', 'batch', 'pack'].map((v) => {
    const el = document.getElementById('view-' + v);
    return v + ':' + el.hidden + ':' + getComputedStyle(el).display;
  }));
  check('N09-hidden-not-overridden', disp.join(' ') === 'single:true:none batch:true:none pack:false:block' &&
    disp2.join(' ') === 'single:false:grid batch:true:none pack:true:none', disp.join(' ') + ' / ' + disp2.join(' '));
}

/* ---------- N04 / S01 / S02 単一ケースの入力・結果・鮮度 ---------- */

{
  await page.fill('#inp-W', '1234');
  await page.click('button.btn-calc');
  await page.waitForTimeout(50);
  const fresh = await singleState();
  await go('batch');
  await go('pack');
  const backFresh = await (async () => { await go('single'); return singleState(); })();
  check('N04-single-kept', backFresh.inputs === fresh.inputs && backFresh.result === fresh.result && fresh.inputs.includes('|1234|'), fresh.inputs);
  await page.fill('#inp-W', '1300');
  const stale = await singleState();
  await go('pack');
  const packSeen = await page.evaluate(() => document.getElementById('result-area').getAttribute('data-result-freshness'));
  await go('single');
  const backStale = await singleState();
  check('S01-pack-switch-keeps-single-result', backStale.result === fresh.result && stale.result === fresh.result, '');
  check('S02-pack-switch-keeps-single-freshness', fresh.attr === 'fresh' && fresh.judged === 'fresh' &&
    stale.attr === 'stale' && backStale.attr === 'stale' && backStale.judged === 'stale' && packSeen === 'stale' &&
    !backStale.bannerHidden && backStale.banner === SINGLE_STALE, `${fresh.attr} → ${stale.attr} → (pack: ${packSeen}) → ${backStale.attr}`);
  // L05（単一ケース）: 鮮度の文は表示され、結果と重ならない
  const l5 = await page.evaluate(() => {
    const b = document.getElementById('single-result-freshness').getBoundingClientRect();
    const r = document.getElementById('result-area').getBoundingClientRect();
    return { shown: b.height > 0, gap: Math.round(r.top - b.bottom) };
  });
  results.push(`  info L05-single  banner shown=${l5.shown} gap to result=${l5.gap}px`);
  globalThis.__l5single = l5;
  await page.fill('#inp-W', '1234');
  await page.click('button.btn-calc');
  await page.waitForTimeout(50);
}

/* ---------- N05 / S03 / S04 / S05 Workspace ---------- */

{
  await go('batch');
  await page.click('text=＋ 現在の入力条件を追加');
  await page.click('#btn-batch-eval');
  await page.waitForTimeout(50);
  await page.click('text=⬇ 結果CSVを出力');
  const fresh = await workspaceState();
  await go('single');
  await go('pack');
  await go('batch');
  const back = await workspaceState();
  check('N05-workspace-kept', back.serialized === fresh.serialized && back.table === fresh.table && back.summary === fresh.summary &&
    back.results === fresh.results && back.count === fresh.count && fresh.results === 1 && back.judged === 'fresh', `${fresh.count} ${back.judged}`);
  // Workspace を変える（追加）→ Pack の画面へ → 戻る: 変更前のまま・古い CSV の警告もそのまま
  await page.click('text=＋ 現在の入力条件を追加');
  const stale = await workspaceState();
  await go('pack');
  await go('batch');
  const backStale = await workspaceState();
  // Pack の画面を開いている間にイベントを伴わずに Workspace が変わっても、Workspace の画面を開いたときに判定し直す
  await page.click('#btn-batch-eval');
  await page.waitForTimeout(50);
  await go('pack');
  await page.evaluate(() => { window.__navExtraCase = batchWorkspace.listCases()[0].inputPackage; batchWorkspace.addCase(window.__navExtraCase); });
  await go('batch');
  const silent = await workspaceState();
  await page.evaluate(() => { const cs = batchWorkspace.listCases(); batchWorkspace.removeCase(cs[cs.length - 1].caseId); delete window.__navExtraCase; });
  await page.click('text=＋ 現在の入力条件を追加');
  check('S03-workspace-freshness-kept', stale.judged === 'stale' && backStale.judged === 'stale' &&
    backStale.summaryBanner === WS_SUMMARY_STALE && backStale.table === stale.table &&
    silent.judged === 'stale' && silent.summaryBanner === WS_SUMMARY_STALE, `${stale.judged} → ${backStale.judged}; silent change → ${silent.summaryBanner ? 'stale shown' : 'not shown'}`);
  check('S05-old-csv-warning-kept', stale.csvWarn === CSV_OUTPUT_STALE && !stale.csvWarnHidden &&
    backStale.csvWarn === CSV_OUTPUT_STALE && !backStale.csvWarnHidden && backStale.field === fresh.field, backStale.csvWarn.slice(0, 12));
  await page.click('text=⬇ 結果CSVを出力');
  const refused = await workspaceState();
  check('S04-stale-csv-refused', refused.status === CSV_NOT_CURRENT && refused.field === fresh.field && refused.csvWarn === CSV_OUTPUT_STALE,
    refused.status.slice(0, 16));
  // L05（Workspace）: 鮮度の文・古い CSV の警告が表示され、重ならない
  const l5w = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect();
    const s = rect('batch-summary-freshness'), c = rect('batch-csv-freshness'), st = rect('batch-json-status');
    return { summary: s.height > 0, csv: c.height > 0, csvBelowStatus: c.top >= st.bottom };
  });
  const l5 = globalThis.__l5single;
  check('L05-freshness-banners-not-lost-or-overlapping', l5.shown && l5.gap >= 0 && l5w.summary && l5w.csv && l5w.csvBelowStatus,
    JSON.stringify({ single: l5, workspace: l5w }));
  await page.click('#btn-batch-eval');
  await page.waitForTimeout(50);
}

/* ---------- N06 / S06 / S07 / S08 Project Pack ---------- */

{
  const wsBefore = await workspaceState();
  await go('pack');
  await page.evaluate((t) => { document.getElementById('pack-paste').value = t; }, PACK_FIXTURE);
  await page.click('#btn-pack-load');
  await page.waitForSelector('#pack-preview:not([hidden])');
  await page.selectOption('#pack-exec-case', 'G002');
  await page.click('#btn-pack-exec');
  await page.waitForTimeout(50);
  // 選択ケースの計算結果がある状態で往復する
  const executed = await packState();
  await go('single');
  await go('batch');
  await go('pack');
  const backExecuted = await packState();
  // 全ケースの計算結果がある状態で往復する（全ケース計算の開始で選択ケースの結果が消えるのは従来どおり）
  await page.click('#btn-pack-batch');
  await page.waitForFunction(() => !!window.stagedProjectPackBatch, null, { timeout: 30000 });
  const packed = await packState();
  await go('single');
  await go('batch');
  const wsAfter = await workspaceState();
  await go('pack');
  const back = await packState();
  const same = (a, b) => a.staged === b.staged && a.exec === b.exec && a.batch === b.batch && a.preview === b.preview &&
    a.status === b.status && a.execText === b.execText && a.batchStatus === b.batchStatus && !a.previewHidden && !b.previewHidden;
  check('N06-pack-staged-kept', !!executed.exec && same(executed, backExecuted) && !!packed.batch && same(packed, back),
    `exec=${!!executed.exec} batch=${!!packed.batch}`);
  const active = await activeState();
  check('S06-active-context-unchanged', JSON.stringify(active) === JSON.stringify(ACTIVE0) && active.same === true,
    `${active.sourceKind}/${active.trust}`);
  check('S07-no-implicit-workspace-conversion', wsAfter.serialized === wsBefore.serialized && wsAfter.results === wsBefore.results &&
    wsAfter.table === wsBefore.table && wsAfter.count === wsBefore.count, wsAfter.count);
  check('S08-pack-stays-unreviewed', back.trust === 'pack_unreviewed' &&
    await page.evaluate(() => activeProjectContext !== window.stagedProjectPackContext && window.stagedProjectPackBatch.trust === 'pack_unreviewed'),
    back.trust);
}

/* ---------- S09 Pack の計算・キャンセルは画面の切替で変わらない ---------- */

{
  const midRun = () => page.waitForFunction(() => {
    const m = /計算中… (\d+) \/ (\d+)/.exec(document.getElementById('pack-batch-status').textContent);
    return m && Number(m[1]) > 0 && Number(m[1]) < Number(m[2]);
  }, null, { timeout: 60000, polling: 5 });
  await page.evaluate((t) => { document.getElementById('pack-paste').value = t; }, BIG_PACK);
  await page.click('#btn-pack-load');
  await page.waitForTimeout(100);
  // 計算中に単一ケース・Workspace へ切り替えて戻っても、run は止まらず最後まで確定する
  await page.click('#btn-pack-batch');
  await midRun();
  await go('single');
  await go('batch');
  await go('pack');
  await page.waitForFunction(() => !!window.stagedProjectPackBatch || /キャンセル|完了できません|中止/.test(document.getElementById('pack-batch-status').textContent),
    null, { timeout: 120000, polling: 20 });
  const done = await page.evaluate(() => ({ total: window.stagedProjectPackBatch && window.stagedProjectPackBatch.executedCases,
    status: document.getElementById('pack-batch-status').textContent }));
  // 計算中に切り替えてからキャンセル: キャンセルの意味（結果を出さない・Pack は残る）は変わらない
  await page.click('#btn-pack-batch');
  await midRun();
  await go('single');
  await go('pack');
  await page.click('#btn-pack-batch-cancel');
  await page.waitForTimeout(300);
  const cancelled = await page.evaluate(() => ({ batch: !!window.stagedProjectPackBatch, staged: !!window.stagedProjectPackContext,
    status: document.getElementById('pack-batch-status').textContent }));
  check('S09-pack-run-and-cancel-unchanged-by-switching', done.total === 2000 && /全 2000 ケースを計算しました/.test(done.status) &&
    !cancelled.batch && cancelled.staged && cancelled.status === PACK_CANCELLED, `${done.total} / ${cancelled.status.slice(0, 14)}`);
}

/* ---------- N07 / N08 未知の値・常に 1 画面 ---------- */

{
  await go('batch');
  const before = await shownViews();
  const bad = await page.evaluate(() => ['bogus', '', 'SINGLE', ' pack', '__proto__', 'constructor', 'toString', 'hasOwnProperty', null, undefined, 0, {}]
    .map((v) => setView(v)));
  const after = await shownViews();
  const t = await tabState();
  check('N07-unknown-view-rejected', bad.every((r) => r === false) && before.join(',') === 'batch' && after.join(',') === 'batch' &&
    selectedOnly(t, 'batch'), `${bad.join(',')} → ${after.join(',')}`);
  check('N08-never-more-than-one', observed.length >= 10 && observed.every((s) => VIEWS.includes(s)), `${observed.length} switches: ${[...new Set(observed)].join(' ')}`);
}

/* ---------- A02–A05 キーボード・tabindex・focus ---------- */

{
  await go('single');
  await page.focus('#view-tab-single');
  const seq = [];
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(key);
    const t = await tabState();
    const s = await shownViews();
    seq.push({ key, focus: t.focus, shown: s.join(','), ok: selectedOnly(t, s[0]) && t.focus === 'view-tab-' + s[0] });
  }
  check('A02-arrow-keys', seq.map((x) => x.shown).join(' ') === 'batch pack single pack batch' && seq.every((x) => x.ok),
    seq.map((x) => `${x.key}→${x.shown}`).join(' '));
  await page.keyboard.press('End');
  const end = { t: await tabState(), s: await shownViews() };
  await page.keyboard.press('Home');
  const home = { t: await tabState(), s: await shownViews() };
  check('A03-home-end', end.s.join(',') === 'pack' && end.t.focus === 'view-tab-pack' && selectedOnly(end.t, 'pack') &&
    home.s.join(',') === 'single' && home.t.focus === 'view-tab-single' && selectedOnly(home.t, 'single'), `${end.s} / ${home.s}`);
  // A04: 選んだタブだけが tabindex=0。Tab キーは選んだ画面の中へ進み、Enter / Space は従来どおりタブを押す
  await page.keyboard.press('Tab');
  const intoPanel = await page.evaluate(() => {
    const el = document.activeElement;
    const panel = el && el.closest('[role="tabpanel"]');
    return { id: el && el.id, panel: panel && panel.id, inTabs: !!(el && el.closest('.view-switch')) };
  });
  await page.focus('#view-tab-batch');
  await page.keyboard.press('Enter');
  const enter = await shownViews();
  await page.focus('#view-tab-pack');
  await page.keyboard.press(' ');
  const space = await shownViews();
  const t4 = await tabState();
  check('A04-tabindex-and-focus', intoPanel.panel === 'view-single' && !intoPanel.inTabs && enter.join(',') === 'batch' &&
    space.join(',') === 'pack' && selectedOnly(t4, 'pack') && t4.focus === 'view-tab-pack', JSON.stringify(intoPanel));
  // A05: 隠れる画面の中に focus があるとき（プログラムからの切替）、focus は選んだ画面のタブへ移る
  await go('single');
  await page.focus('#inp-W');
  await page.evaluate(() => setView('batch'));
  const f1 = await page.evaluate(() => ({ id: document.activeElement.id, inHidden: !!document.activeElement.closest('[role="tabpanel"][hidden]') }));
  await page.focus('#batch-tsv');
  await page.evaluate(() => setView('pack'));
  const f2 = await page.evaluate(() => ({ id: document.activeElement.id, inHidden: !!document.activeElement.closest('[role="tabpanel"][hidden]') }));
  // Tab キーで隠れた画面の要素へ入らない（タブから進むと、見えている Pack の画面の中へ入る）
  await page.focus('#view-tab-pack');
  await page.keyboard.press('Tab');
  const f3 = await page.evaluate(() => { const p = document.activeElement.closest('[role="tabpanel"]'); return p ? p.id : null; });
  check('A05-no-focus-left-in-hidden-panel', f1.id === 'view-tab-batch' && !f1.inHidden && f2.id === 'view-tab-pack' && !f2.inHidden && f3 === 'view-pack',
    `${f1.id} ${f2.id} ${f3}`);
}

/* ---------- S10 / S11 印刷 ---------- */

{
  await go('batch');
  await page.click('#btn-rep-generate');
  await page.waitForTimeout(50);
  const printAllowed = () => page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const allowed = document.body.classList.contains('review-print-allowed');
    window.dispatchEvent(new Event('afterprint'));
    return allowed;
  });
  const fresh = await printAllowed();
  await go('pack');
  const fromPack = await printAllowed();
  await go('batch');
  await page.click('text=＋ 現在の入力条件を追加');
  const stale = await printAllowed();
  check('S10-review-print-gate-unchanged', fresh === true && fromPack === true && stale === false, `${fresh} ${fromPack} ${stale}`);
  await page.click('#btn-batch-eval');
  await page.click('#btn-rep-generate');
  // S11: 印刷では Pack の画面・Pack 欄・タブを出さない（Pack の画面を開いたまま印刷しても）
  await go('pack');
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const d = (sel) => getComputedStyle(document.querySelector(sel)).display;
    const out = { packView: d('#view-pack'), packSection: d('#project-pack-section'), tabs: d('.view-switch'),
      packPaste: document.getElementById('pack-paste').checkVisibility(), packPreview: document.getElementById('pack-preview').checkVisibility() };
    window.dispatchEvent(new Event('afterprint'));
    return out;
  });
  const packVisibleInPrint = await page.isVisible('#project-pack-section');
  await page.emulateMedia({ media: 'screen' });
  check('S11-pack-not-printed', printed.packView === 'none' && printed.packSection === 'none' && printed.tabs === 'none' &&
    !printed.packPaste && !printed.packPreview && !packVisibleInPrint, JSON.stringify(printed));
}

/* ---------- L02 1280px ---------- */

{
  const bar = await page.evaluate(() => {
    const list = document.querySelector('.view-switch');
    const tabs = [...list.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect());
    return { scroll: list.scrollWidth, client: list.clientWidth, right: Math.round(Math.max(...tabs.map((r) => r.right))), vw: window.innerWidth,
      pageScroll: document.documentElement.scrollWidth };
  });
  const views = [];
  for (const v of VIEWS) views.push((await go(v)).join(','));
  check('L02-1280-navigation', bar.scroll <= bar.client && bar.right <= bar.vw && views.join(' ') === 'single batch pack' && bar.pageScroll <= 1280,
    JSON.stringify(bar));
}

/* ---------- A06 / L03 / L04 390px ---------- */

{
  const { p: m, log: mlog } = await openPage(390, 844);
  const seen = [];
  for (const v of ['pack', 'batch', 'single', 'pack']) {
    await m.click('#view-tab-' + v);
    seen.push((await shownViews(m)).join(','));
  }
  await m.focus('#view-tab-pack');
  await m.keyboard.press('Home');
  const homeShown = (await shownViews(m)).join(',');
  const homeFocus = await m.evaluate(() => document.activeElement.id);
  check('A06-390-tabs-operable', seen.join(' ') === 'pack batch single pack' && homeShown === 'single' && homeFocus === 'view-tab-single' &&
    mlog.errors.length === 0, seen.join(' '));
  // L03: 文字は切れずに 1 行で読め、選択中は色以外（下側の線）でも区別でき、文字と背景の対比は 4.5 以上
  const look = await m.evaluate(() => {
    const lum = (c) => {
      const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    return [...document.querySelectorAll('.view-switch [role="tab"]')].map((t) => {
      const cs = getComputedStyle(t);
      return { id: t.id, full: t.scrollWidth <= t.clientWidth + 1, oneLine: t.getClientRects().length === 1 && t.offsetHeight < 50,
        selected: t.getAttribute('aria-selected') === 'true', shadow: cs.boxShadow, contrast: Math.round(ratio(cs.color, cs.backgroundColor) * 100) / 100 };
    });
  });
  const sel = look.find((x) => x.selected);
  const others = look.filter((x) => !x.selected);
  check('L03-390-tab-text-and-selection', look.length === 3 && look.every((x) => x.full && x.oneLine && x.contrast >= 4.5) &&
    sel && sel.shadow !== 'none' && others.every((x) => x.shadow === 'none'), look.map((x) => `${x.id}:${x.contrast}`).join(' '));
  // L04: タブの列はページ全体の幅を広げない（列を外しても scrollWidth が変わらない・列は画面の幅に収まりその中でスクロールする）
  const widths = [];
  for (const v of VIEWS) {
    await m.click('#view-tab-' + v);
    widths.push(await m.evaluate(() => {
      const list = document.querySelector('.view-switch');
      const withTabs = document.documentElement.scrollWidth;
      list.style.display = 'none';
      const without = document.documentElement.scrollWidth;
      list.style.display = '';
      return { withTabs, without, listW: Math.round(list.getBoundingClientRect().width), vw: window.innerWidth,
        scrolls: list.scrollWidth > list.clientWidth };
    }));
  }
  check('L04-390-tabs-do-not-widen-page', widths.every((w) => w.withTabs === w.without && w.listW <= w.vw),
    widths.map((w) => `${w.withTabs}/${w.without}`).join(' ') + (widths[0].scrolls ? ' (tab row scrolls)' : ''));
  await m.close();
}

/* ---------- S12 保存・通信・URL・console ---------- */

{
  const calls = await page.evaluate(() => Object.assign({}, window.__navProbe));
  const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
  const url = await page.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
  check('S12-no-storage-network-url', calls.storage === 0 && calls.cookie === 0 && calls.idb === 0 && storage.ls === 0 && storage.ss === 0 &&
    storage.cookie === 0 && log.requests.length === 0 && calls.fetch === 0 && calls.xhr === 0 && calls.beacon === 0 &&
    url.hash === '' && url.search === '' && url.href === FILE && calls.history === 0 && log.console.length === 0 && log.errors.length === 0,
    JSON.stringify({ calls, storage, requests: log.requests.length, console: log.console.length, errors: log.errors.length }));
}

console.log(results.join('\n'));
await browser.close();

console.log(`\nthree-view-navigation: ${pass} pass / ${fail} fail`);
finishRun('three-view-navigation', pass + fail, fail, { playwrightSource });
