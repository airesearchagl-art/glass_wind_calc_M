// 単一ケースの入力・結果の見せ方（Phase 2L-B4 / S3-B3B2-B4）を実ブラウザで確かめる。
//
// この harness は page の UI（入力モードの切替・入力欄・計算ボタン・<details> の開閉・キーボード・Export / Import）を使って、
// 何が最初の画面に見えているか（getBoundingClientRect・checkVisibility()・Playwright の可視判定）、
// 何が 1 回の操作で開くか、案件の検証状況の要約がどこから来た値か、狭い画面で横にはみ出さないかを観測する。
// 合成の値だけを使う（runtime default の合成サンプル・手入力の合成値・harness 内で作る合成の長い文字列）。
// 期待値は page の外で求める: 計算は Node 側の calc.js、Evidence Closure は Node 側の evidence-closure.js と registry、
// 固定文は harness の literal。page の値を page で確かめない。
//
// 確かめること:
//   U01–U05 1280×800: preset / manual で W・H・計算ボタン・結果の見出しと結論が最初の画面にある / ①〜⑤ と要約・詳細の順 /
//     選んだ mode の意味が常に見え、詳しい説明は 1 回で開く / 各 mode の必須入力は閉じた details に入っていない
//   U06–U10 案件の検証状況: 要約は常に見え、詳細は最初は閉じている / 1 回で開いて実際の表（行）が見え、要約の数値は
//     Node 側の評価と同じ（評価の ready の件数を差し替えると要約も変わる＝固定文ではない）/ 状況の件数は表の行と同じ /
//     他の mode では見えない / 評価が失敗したら要約は失敗と示す（0 件・検証済みにしない）
//   U11–U15 390×844: 4 mode で横にはみ出さない（details を閉じても開いても）/ 表は表の中で横スクロール・overflow:hidden で
//     文を切らない / 長い表示名・長い検証情報 / 長い publicLabel の取り込み / 変更前の結果の表示
//   U16–U20 安全: B1 の鮮度（details の開閉で変わらず、変更前の表示は details の外で見える）/ 係数 1.00 以外は文で示す /
//     適用範囲外の候補の除外は件数つきで常に見える / 未検証の状態は詳細を開かなくても見える / 計算根拠は詳細を開くと全部ある
//   U21–U24 a11y・privacy: details はキーボードで開閉できる / 入力欄に名前がある / 保存・通信・URL・console なし /
//     非公開の参照・取り込んだ文字列を表示しない
//   U25–U27 RF-29-01 Closure の要約の fail closed: 不完全な評価結果（配列・件数・状態・Promotion Candidate）と詳細の組み立て途中の
//     例外では、正常だった要約・途中の表を残さず「表示できない」と示す（例外の文を出さない）/ 戻すと元どおり /
//     Closure が失敗しても計算は続き、Evidence status と Closure は互いに巻き添えにならない
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';

// ---- page の外で求める期待値 ----
const GlassCalc = require(REPO + 'calc.js');
const Registry = require(REPO + 'project-config/registry.js');
const EvidenceClosure = require(REPO + 'project-config/evidence-closure.js');
const RUNTIME_ID = Registry.getRuntimeDefaultBuiltInPresetId();
const NODE_CLOSURE = EvidenceClosure.evaluateClosure(RUNTIME_ID, []);
const NODE_VERIFIED_CASES = Registry.getBuiltInPreset(RUNTIME_ID).verifiedCases.length;
const CLOSURE_LABEL = { BLOCKED: '未充足', READY_CANDIDATE: '昇格候補条件を満たす' };
// 手入力の合成値（W 900 / H 1800 / Low-E + A + FL / 正圧 1400 / 負圧 -1000 / 係数 1.00）の計算を Node 側で行う
const MANUAL = { W: 900, H: 1800, type: 'lowe_fl', pos: 1400, neg: -1000 };
const NODE_MANUAL = (() => {
  const area = GlassCalc.paneAreaM2(MANUAL.W, MANUAL.H);
  const design = Math.max(Math.abs(MANUAL.pos), Math.abs(MANUAL.neg));
  const split = GlassCalc.splitCandidates(GlassCalc.generateCandidates(MANUAL.type, area, design, 1));
  return { design, best: split.okCandidates[0], ok: split.okCandidates.length, ng: split.ngCandidates.length,
    out: split.outOfScopeCandidates.length };
})();

const MODES = ['preset', 'manual', 'notification', 'imported'];
const HINT = {
  preset: '告示からの自動算定ではありません',
  manual: '現在画面に表示されているW/H/正圧/負圧をユーザー入力値として扱います',
  notification: '式が検証済みであることと、入力値が検証済みであることは別です',
  imported: '本ツールはそれを検証済みとして扱いません'
};
const REQUIRED = {
  preset: ['inp-W', 'inp-H', 'inp-type', 'inp-floor', 'inp-zone', 'inp-coeff'],
  manual: ['inp-W', 'inp-H', 'inp-type', 'inp-manual-pos', 'inp-manual-neg', 'inp-coeff'],
  notification: ['inp-W', 'inp-H', 'inp-type', 'inp-wind-basis', 'inp-wind-v0', 'inp-wind-roughness', 'inp-wind-building-h',
    'inp-wind-eaves-h', 'inp-wind-z', 'inp-wind-building-type', 'inp-wind-zone', 'inp-wind-short-side', 'inp-wind-compare', 'inp-coeff'],
  imported: ['inp-W', 'inp-H', 'inp-type', 'imported-summary', 'inp-coeff']
};
const MODE_ONLY = ['inp-floor', 'inp-zone', 'inp-manual-pos', 'inp-manual-neg', 'inp-wind-basis', 'inp-wind-v0', 'imported-summary'];
const TRUST = {
  preset: ['⚠ 設計風圧プリセット — 未検証', 'verificationStatus: unverified', '⚠ 参考計算 — 案件実寸未確認'],
  manual: ['⚠ ユーザー入力値 — 案件原典との照合は本ツールでは未実施'],
  notification: ['⚠ 算定値 — 式は一次資料で確認済み／入力した風条件は未検証', '式が検証済みであることは、入力値が検証済みであることを意味しません'],
  imported: ['⚠ 取り込みデータ（未検証） — 本ツールは内容を検証していません']
};
const FINAL_DECISION = '最終的な設計判断にはメーカー検討書または専門技術者による確認を優先してください';
const IMPORTED_NONE = '取り込みデータはまだありません。下の「入力条件のExport / Import」に Project Input Package（JSON）を貼り付けて「⬆ Import」を押してください。';
const SINGLE_STALE = '入力が変更されました。この結果は変更前の入力によるものです。再計算してください。';
const EVIDENCE_AREAS = ['evidence-status-table', 'verified-case-selector-area', 'reconciliation-area', 'evidence-closure-area'];
const DETAILS = ['mode-help', 'evidence-details', 'result-details'];
// 合成の長い文字列（区切りのない英字の連続と、日本語の連続）
const LONG = 'SyntheticLongLabelWithoutAnyBreak'.repeat(8) + ' ' + '合成の長い表示名'.repeat(16);
const LONG_PUBLIC = 'Synthetic Imported Label '.repeat(18).trim();
const MARKER_NOTE = 'SYNTHETIC-B4-NOTE-MARKER';
const PRIVATE = /https?:\/\/|file:\/\/|\/home\/|\/Users\/|[A-Z]:\\|sharepoint|notion\.|drive\.google/i;

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

// 途中で例外が起きた（操作が timeout した）ときも、それまでの check の結果を出してから終える。
// 終わり方（ERROR）は harness.mjs の crash guard のまま（先に登録したこの listener が先に呼ばれる）
process.on('uncaughtException', () => console.log(results.join('\n')));
process.on('unhandledRejection', () => console.log(results.join('\n')));
const { chromium, playwrightSource } =
  await openBrowser('single-ux', () => ({ checksRun: pass + fail, failures: fail }));
const browser = await chromium.launch();

/** 保存・通信・URL の呼び出しを数える（page を読み込む前に仕込む）。 */
const PROBE = () => {
  const calls = { storage: 0, cookie: 0, idb: 0, beacon: 0, fetch: 0, xhr: 0, history: 0 };
  window.__uxProbe = calls;
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

const logs = [];
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
  logs.push({ p, log });
  return p;
}

/* ---------- helpers ---------- */

async function setMode(p, mode) {
  await p.selectOption('#inp-mode', mode);
  await p.waitForTimeout(60);
}
/** 取り込みデータ mode にする（手入力の合成値を Export して、そのまま Import する）。 */
async function importManual(p, edit) {
  await setMode(p, 'manual');
  await setManual(p);
  await p.click('#btn-export');
  if (edit) {
    await p.evaluate((e) => {
      const area = document.getElementById('io-package');
      const pkg = JSON.parse(area.value);
      Object.assign(pkg.provenance, e);
      area.value = JSON.stringify(pkg, null, 2);
    }, edit);
  }
  await p.click('#btn-import');
  await p.waitForTimeout(60);
}
const setValue = (p, id, value) => p.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, value]);
async function setManual(p) {
  await setValue(p, 'inp-W', String(MANUAL.W));
  await setValue(p, 'inp-H', String(MANUAL.H));
  await setValue(p, 'inp-type', MANUAL.type);
  await setValue(p, 'inp-manual-pos', String(MANUAL.pos));
  await setValue(p, 'inp-manual-neg', String(MANUAL.neg));
  await setValue(p, 'inp-coeff', '1.00');
}
async function calc(p) {
  await p.click('#view-single .btn-calc');
  await p.waitForTimeout(60);
}
const toTop = (p) => p.evaluate(() => window.scrollTo(0, 0));
const setOpen = (p, ids, open) => p.evaluate(([list, o]) => list.forEach((id) => {
  const d = document.getElementById(id); if (d) d.open = o;
}), [ids, open]);
/** 要素の位置（viewport 基準と文書基準）と見えているか。 */
const rects = (p, sels) => p.evaluate((list) => list.map((sel) => {
  const e = document.querySelector(sel);
  if (!e) return { sel, missing: true };
  const r = e.getBoundingClientRect();
  return { sel, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
    docTop: Math.round(r.top + window.scrollY), visible: e.checkVisibility() };
}), sels);
const widths = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  body: document.body.scrollWidth }));
const noOverflow = (w) => w.sw === w.cw && w.body <= w.cw;
/** 単一ケースの鮮度（DOM とその場の判定）。 */
const freshness = (p) => p.evaluate(() => {
  const area = document.getElementById('result-area');
  const host = document.getElementById('single-result-freshness');
  const badge = document.querySelector('#result-area .judge-badge');
  const details = document.getElementById('result-details');
  return { attr: area.getAttribute('data-result-freshness'), judged: getSingleResultFreshness(),
    text: host.textContent, visible: host.checkVisibility(), right: Math.round(host.getBoundingClientRect().right),
    insideDetails: !!details && details.contains(host), badgeAfter: badge ? getComputedStyle(badge, '::after').content : null,
    detailsOpen: details ? details.open : null };
});
/** 結果欄の見えている文（details の開閉はそのまま）。 */
const resultVisibleText = (p) => p.evaluate(() => document.getElementById('result-area').innerText);
/** 案件の検証状況の要約。 */
const summary = (p) => p.evaluate(() => {
  const line = (id) => { const e = document.getElementById(id); return { text: e.innerText.trim(), error: e.classList.contains('is-error'), visible: e.checkVisibility() }; };
  return { box: document.getElementById('evidence-summary').checkVisibility(), status: line('evidence-summary-status'),
    closure: line('evidence-summary-closure'), open: document.getElementById('evidence-details').open };
});
const nums = (text, label) => { const m = text.match(new RegExp(label + '[:：]?\\s*(\\d+)\\s*\\/\\s*(\\d+)')); return m ? [Number(m[1]), Number(m[2])] : null; };

/* =================================================================
   1280×800
================================================================= */

const page = await openPage(1280, 800);

/* ---------- U01 / U02 最初の画面（W・H・計算ボタン・結果の見出しと結論） ---------- */

const FIRST_VIEW = ['#inp-W', '#inp-H', '#view-single .btn-calc', '.conclusion-card > .sec-title', '.conclusion-card .judge-badge',
  '.conclusion-card .conclusion-glass', '.conclusion-card .conclusion-meta'];
const inFirstView = (r) => r.every((x) => !x.missing && x.visible && x.top >= 0 && x.bottom <= 800);
{
  await toTop(page);
  const r = await rects(page, FIRST_VIEW);
  const mode = await page.evaluate(() => document.getElementById('inp-mode').value);
  check('U01-preset-first-viewport', mode === 'preset' && inFirstView(r), r.map((x) => `${x.sel}:${x.top}-${x.bottom}`).join(' '));
  await setMode(page, 'manual');
  await setManual(page);
  await calc(page);
  await toTop(page);
  const m = await rects(page, FIRST_VIEW);
  check('U02-manual-first-viewport', inFirstView(m), m.map((x) => `${x.sel}:${x.top}-${x.bottom}`).join(' '));
  await setMode(page, 'preset');
  await calc(page);
}

/* ---------- U03 入力の順（①〜⑤ → 要約 → 詳細 → Export / Import） ---------- */
{
  await toTop(page);
  const order = ['#step-mode-title', '#inp-mode', '#step-glass-title', '#inp-W', '#inp-type', '#step-wind-title', '#inp-floor',
    '#step-coeff-title', '#view-single .btn-calc', '#evidence-summary', '#evidence-details', '#io-block'];
  const r = await rects(page, order);
  const ascending = r.every((x, i) => !x.missing && x.visible && (i === 0 || x.docTop > r[i - 1].docTop ||
    (x.sel === '#step-coeff-title' && x.docTop >= r[i - 1].docTop)));
  const dom = await page.evaluate((areas) => {
    const d = document.getElementById('evidence-details');
    return { inside: areas.every((id) => d.contains(document.getElementById(id))), openAttr: d.hasAttribute('open'),
      sameBlock: d.closest('.mode-field-preset') === document.getElementById('evidence-summary').closest('.mode-field-preset') &&
        !!d.closest('.mode-field-preset'),
      coeffBeforeCalc: !!(document.getElementById('inp-coeff').compareDocumentPosition(document.querySelector('#view-single .btn-calc')) &
        Node.DOCUMENT_POSITION_FOLLOWING) };
  }, EVIDENCE_AREAS);
  check('U03-input-order', ascending && dom.inside && !dom.openAttr && dom.sameBlock && dom.coeffBeforeCalc,
    r.map((x) => `${x.sel}@${x.docTop}`).join(' ') + ' ' + JSON.stringify(dom));
}

/* ---------- U04 選んだ mode の意味は常に見え、詳しい説明は 1 回で開く ---------- */
{
  const per = {};
  for (const m of MODES) {
    await setMode(page, m);
    per[m] = await page.evaluate(() => [...document.querySelectorAll('#view-single .mode-hint')].filter((e) => e.checkVisibility())
      .map((e) => ({ cls: e.className, text: e.innerText, details: !!e.closest('details') })));
  }
  const hintsOk = MODES.every((m) => per[m].length === 1 && per[m][0].cls.includes('mode-field-' + m) && per[m][0].text.includes(HINT[m]) &&
    !per[m][0].details);
  await setMode(page, 'preset');
  const before = await page.evaluate(() => ({ open: document.getElementById('mode-help').open,
    body: document.querySelector('#mode-help .disclosure-body').checkVisibility() }));
  await page.click('#mode-help > summary');
  const after = await page.evaluate(() => ({ open: document.getElementById('mode-help').open,
    body: document.querySelector('#mode-help .disclosure-body').checkVisibility(),
    text: document.querySelector('#mode-help .disclosure-body').innerText }));
  await page.click('#mode-help > summary');
  check('U04-mode-meaning-visible-help-one-action', hintsOk && before.open === false && before.body === false && after.open === true &&
    after.body === true && after.text.includes('本ツールが案件原典と照合したものではありません'),
    JSON.stringify(MODES.map((m) => per[m].length)) + ` help ${before.open}->${after.open}`);
}

/* ---------- U05 各 mode の必須入力は見えていて、閉じた details に入っていない ---------- */
{
  // 取り込みデータが無いときの入口（このページではまだ Import していない）
  await setMode(page, 'imported');
  const none = await page.evaluate(() => ({ text: document.getElementById('imported-summary').innerText.trim(),
    button: [...document.querySelectorAll('#view-single .mode-field-imported button')].filter((b) => b.checkVisibility()).length }));
  await page.click('#view-single .mode-field-imported button');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  const per = {};
  for (const m of MODES) {
    await setMode(page, m);
    per[m] = await page.evaluate(([req, only]) => ({
      missing: req.filter((id) => { const e = document.getElementById(id); return !e || !e.checkVisibility() || !!e.closest('details'); }),
      leaked: only.filter((id) => !req.includes(id) && document.getElementById(id).checkVisibility())
    }), [REQUIRED[m], MODE_ONLY]);
  }
  await setMode(page, 'notification');
  const recurrence = [];
  for (const basis of ['notification_baseline', 'itakyo_recommended', 'notification_baseline']) {
    await setValue(page, 'inp-wind-basis', basis);
    recurrence.push(await page.evaluate(() => document.getElementById('inp-wind-recurrence').checkVisibility()));
  }
  await setMode(page, 'preset');
  await calc(page);
  const ok = MODES.every((m) => per[m].missing.length === 0 && per[m].leaked.length === 0);
  check('U05-required-inputs-not-in-details', ok && none.text === IMPORTED_NONE && none.button === 1 && focused === 'io-package' &&
    recurrence.join(',') === 'false,true,false',
    JSON.stringify(per) + ` none=${none.text === IMPORTED_NONE} focus=${focused} recurrence=${recurrence}`);
}

/* ---------- U06 要約は常に見え、詳細は最初は閉じている ---------- */
{
  await toTop(page);
  const s = await summary(page);
  const areas = await page.evaluate((ids) => ids.map((id) => document.getElementById(id).checkVisibility()), EVIDENCE_AREAS);
  const pw = [];
  for (const id of EVIDENCE_AREAS) pw.push(await page.isVisible('#' + id));
  check('U06-summary-visible-details-closed', s.box && s.status.visible && !s.status.error && s.status.text.startsWith('案件入力値の検証状況: 全 ') &&
    s.closure.visible && !s.closure.error && s.closure.text.startsWith('Evidence Closure: ') && s.open === false &&
    areas.every((v) => v === false) && pw.every((v) => v === false), JSON.stringify(s));
}

/* ---------- U07 1 回で開くと実際の表が見え、要約の数値は評価の値（評価を差し替えると要約も変わる） ---------- */
{
  await page.click('#evidence-details > summary');
  const opened = await page.evaluate((ids) => ({
    open: document.getElementById('evidence-details').open,
    areas: ids.map((id) => document.getElementById(id).checkVisibility() && document.getElementById(id).innerText.trim().length > 0),
    statusRows: [...document.querySelectorAll('#evidence-status-table tr')].filter((tr) => tr.querySelector('td') && tr.checkVisibility()).length,
    matrixRows: [...document.querySelectorAll('#evidence-closure-matrix tr')].filter((tr) => tr.querySelector('td') && tr.checkVisibility()).length,
    head: document.getElementById('evidence-closure-area').innerText
  }), EVIDENCE_AREAS);
  const s = await summary(page);
  const want = [[NODE_CLOSURE.readySlotCount, NODE_CLOSURE.requiredSlotCount], [NODE_CLOSURE.readyCategoryCount, NODE_CLOSURE.categoryCount],
    [NODE_CLOSURE.readyCaseScopeCount, NODE_CLOSURE.caseScopeCount]];
  const labels = ['必要な確認項目', 'closureカテゴリ', '想定case scope'];
  const fromSummary = labels.map((l) => nums(s.closure.text, l));
  const fromHead = labels.map((l) => nums(opened.head, l));
  const nodeOk = JSON.stringify(fromSummary) === JSON.stringify(want) && JSON.stringify(fromHead) === JSON.stringify(want) &&
    s.closure.text.startsWith('Evidence Closure: ' + CLOSURE_LABEL[NODE_CLOSURE.status] + ' — ') &&
    s.closure.text.includes('Promotion Candidate ' + (NODE_CLOSURE.promotionCandidate ? '生成済み' : 'なし'));
  // 評価の ready の件数を合成の値（各全体 − 1。全体・配列の長さとは食い違わない）に差し替えて描き直すと、
  // 要約も詳細もその値になる（UI の固定文ではない）。最後に元へ戻す
  // （RF-29-01 以降、全体の件数と配列の長さが食い違う評価は形の確認で「表示できない」になるので、全体は変えない）
  const swapReady = [NODE_CLOSURE.requiredSlotCount - 1, NODE_CLOSURE.categoryCount - 1, NODE_CLOSURE.caseScopeCount - 1];
  const swapped = await page.evaluate((r) => {
    const real = window.EvidenceClosure;
    window.EvidenceClosure = Object.assign({}, real, { evaluateClosure: (id, obs) => Object.assign({}, real.evaluateClosure(id, obs),
      { readySlotCount: r[0], readyCategoryCount: r[1], readyCaseScopeCount: r[2] }) });
    renderEvidenceClosureMatrix();
    const out = { summary: document.getElementById('evidence-summary-closure').innerText, head: document.getElementById('evidence-closure-area').innerText };
    window.EvidenceClosure = real;
    renderEvidenceClosureMatrix();
    out.restored = document.getElementById('evidence-summary-closure').innerText;
    return out;
  }, swapReady);
  const swapWant = [[swapReady[0], NODE_CLOSURE.requiredSlotCount], [swapReady[1], NODE_CLOSURE.categoryCount],
    [swapReady[2], NODE_CLOSURE.caseScopeCount]];
  const swapOk = JSON.stringify(labels.map((l) => nums(swapped.summary, l))) === JSON.stringify(swapWant) &&
    JSON.stringify(labels.map((l) => nums(swapped.head, l))) === JSON.stringify(swapWant) && swapped.restored === s.closure.text;
  check('U07-details-one-action-real-table-authoritative-numbers', opened.open && opened.areas.every(Boolean) && opened.statusRows === 6 &&
    opened.matrixRows === NODE_CLOSURE.factResults.length && nodeOk && swapOk,
    `rows ${opened.statusRows}/${opened.matrixRows} summary=${JSON.stringify(fromSummary)} node=${JSON.stringify(want)} swapped=${JSON.stringify(labels.map((l) => nums(swapped.summary, l)))}`);
}

/* ---------- U08 状況の件数は開いた表の行と同じ（数え方は表の行から。別に判定しない） ---------- */
{
  const t = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#evidence-status-table tbody tr')].map((tr) => tr.querySelectorAll('td')[1].innerText.trim());
    return { cells, summary: document.getElementById('evidence-summary-status').innerText.trim() };
  });
  const order = [];
  const counts = {};
  t.cells.forEach((c) => { if (!(c in counts)) { counts[c] = 0; order.push(c); } counts[c] += 1; });
  const want = '案件入力値の検証状況: 全 ' + t.cells.length + ' 項目 — ' + order.map((c) => c + ' ' + counts[c]).join(' / ') +
    '（Verified Cases: ' + NODE_VERIFIED_CASES + ' 件）';
  // 合成の状況の並びを渡すと、その並びの件数になる（固定文ではない）。最後に描き直す
  const synthetic = await page.evaluate(() => {
    renderEvidenceStatusSummary(['verified', 'unverified', 'partially_verified', 'unverified', 'verified', 'unverified'], 3);
    const out = document.getElementById('evidence-summary-status').innerText.trim();
    renderProjectEvidencePanels();
    return { out, restored: document.getElementById('evidence-summary-status').innerText.trim() };
  });
  check('U08-status-summary-from-table-rows', t.summary === want && synthetic.restored === want &&
    synthetic.out === '案件入力値の検証状況: 全 6 項目 — Verified 2 / Unverified 3 / Partially Verified 1（Verified Cases: 3 件）',
    `${t.summary} | want ${want} | synthetic ${synthetic.out}`);
}

/* ---------- U09 他の mode では案件の検証状況（要約・詳細）を見せない ---------- */
{
  const per = {};
  for (const m of ['manual', 'notification', 'imported']) {
    await setMode(page, m);
    per[m] = await page.evaluate((ids) => ['evidence-summary', 'evidence-details'].concat(ids)
      .filter((id) => document.getElementById(id).checkVisibility()), EVIDENCE_AREAS);
    for (const id of ['evidence-summary', 'evidence-details']) if (await page.isVisible('#' + id)) per[m].push('pw:' + id);
  }
  await setMode(page, 'preset');
  const back = await summary(page);
  check('U09-other-modes-hide-evidence', Object.values(per).every((v) => v.length === 0) && back.box && back.open === true,
    JSON.stringify(per));
}

/* ---------- U10 評価が失敗したら、要約は失敗をはっきり示す（数値・0 件・検証済みにしない）。描き直すと戻る ---------- */
{
  const failed = await page.evaluate(() => {
    const realClosure = window.EvidenceClosure;
    window.EvidenceClosure = Object.assign({}, realClosure, { evaluateClosure: () => { throw new Error('forced closure failure'); } });
    renderEvidenceClosureMatrix();
    const realRender = window.renderEvidenceStatus;
    window.renderEvidenceStatus = () => { throw new Error('forced status failure'); };
    renderPhase2FEvidencePanels();
    const line = (id) => { const e = document.getElementById(id); return { text: e.innerText.trim(), error: e.classList.contains('is-error'), visible: e.checkVisibility() }; };
    const out = { closure: line('evidence-summary-closure'), status: line('evidence-summary-status'),
      detail: document.getElementById('evidence-closure-area').innerText };
    window.EvidenceClosure = realClosure;
    window.renderEvidenceStatus = realRender;
    renderProjectEvidencePanels();
    out.recovered = { closure: line('evidence-summary-closure'), status: line('evidence-summary-status') };
    return out;
  });
  const explicit = (l) => l.error && l.visible && /表示できません/.test(l.text) && /「検証済み」と解釈しないでください/.test(l.text) &&
    !/\d+\s*\/\s*\d+|0\s*件|問題なし|Verified|検証済みです/.test(l.text);
  check('U10-failure-explicit-in-summary', explicit(failed.closure) && explicit(failed.status) && /表示できませんでした/.test(failed.detail) &&
    !failed.recovered.closure.error && !failed.recovered.status.error, JSON.stringify(failed));
  await setOpen(page, ['evidence-details'], false);
}

/* ---------- U25–U27 RF-29-01: Closure の要約の fail closed ---------- */

const CLOSURE_FAILED_TEXT = 'Evidence Closure: 表示できませんでした。表示できないことを「検証済み」と解釈しないでください。';
const CLOSURE_WARN_TEXT = 'Evidence Closure Statusを表示できませんでした。表示できないことを「検証済み」と解釈しないでください。';
const SECRET = 'SYNTHETIC-RF29-SECRET-MARKER';
/** Closure の欄を描き直した結果（要約・詳細の表・文・matrix の行）。 */
const closureState = () => page.evaluate(() => {
  const area = document.getElementById('evidence-closure-area');
  const c = document.getElementById('evidence-summary-closure');
  const st = document.getElementById('evidence-summary-status');
  const matrix = document.getElementById('evidence-closure-matrix');
  return { summary: c.textContent, error: c.classList.contains('is-error'), visible: c.checkVisibility(),
    status: st.textContent, statusError: st.classList.contains('is-error'),
    tables: area.querySelectorAll('table').length, areaText: area.textContent.trim(), areaChildren: area.children.length,
    rows: matrix ? [...matrix.querySelectorAll('tr')].filter((tr) => tr.querySelector('td')).length : -1 };
});
const failClosed = (x) => x.summary === CLOSURE_FAILED_TEXT && x.error && x.visible && x.tables === 0 && x.areaChildren === 1 &&
  x.areaText === CLOSURE_WARN_TEXT && !x.summary.includes(SECRET) && !x.areaText.includes(SECRET);

/* U25 不完全な評価結果（配列・件数・状態・Promotion Candidate の欠落・不正）は要約も詳細も「表示できない」。戻すと元どおり */
{
  await setMode(page, 'preset');
  await setOpen(page, ['evidence-details'], true);
  const before = await closureState();
  const variants = ['factResults:missing', 'categoryResults:null', 'categoryResults:short', 'readySlotCount:NaN', 'requiredSlotCount:missing',
    'caseScopeCount:-1', 'status:VERIFIED', 'promotionCandidate:missing', 'factRow:closureStatus'];
  const per = {};
  for (const v of variants) {
    await page.evaluate((variant) => {
      const real = window.__realClosure || (window.__realClosure = window.EvidenceClosure);
      window.EvidenceClosure = Object.assign({}, real, { evaluateClosure: (id, obs) => {
        const c = Object.assign({}, real.evaluateClosure(id, obs));
        const [key, how] = variant.split(':');
        if (key === 'factRow') c.factResults = [Object.assign({}, c.factResults[0], { closureStatus: 'VERIFIED' })].concat(c.factResults.slice(1));
        else if (how === 'missing') delete c[key];
        else if (how === 'null') c[key] = null;
        else if (how === 'short') c[key] = c[key].slice(1);
        else if (how === 'NaN') c[key] = NaN;
        else if (how === '-1') c[key] = -1;
        else c[key] = how;
        return c;
      } });
      renderEvidenceClosureMatrix();
    }, v);
    per[v] = await closureState();
  }
  await page.evaluate(() => { window.EvidenceClosure = window.__realClosure; renderEvidenceClosureMatrix(); });
  const after = await closureState();
  check('U25-closure-malformed-evaluation-fail-closed', !before.error && before.rows === NODE_CLOSURE.factResults.length &&
    variants.every((v) => failClosed(per[v])) && after.summary === before.summary && !after.error && after.rows === before.rows &&
    after.areaText === before.areaText,
    JSON.stringify(Object.fromEntries(variants.filter((v) => !failClosed(per[v])).map((v) => [v, per[v]]))) + ` restored=${after.summary === before.summary}`);
}

/* U26 詳細を組み立てる途中の例外: 正常だった要約・途中の表を残さない（例外の文も出さない）。戻すと元どおり */
{
  const before = await closureState();
  const per = {};
  for (const failAt of [3, 40]) {
    per[failAt] = await page.evaluate(([n, secret]) => {
      const real = window.closureCell;
      let calls = 0;
      window.closureCell = function () { calls += 1; if (calls === n) throw new Error('cell failure ' + secret); return real.apply(this, arguments); };
      try { renderEvidenceClosureMatrix(); } finally { window.closureCell = real; }
      return calls;
    }, [failAt, SECRET]);
    per[failAt] = { calls: per[failAt], state: await closureState() };
  }
  await page.evaluate(() => renderEvidenceClosureMatrix());
  const after = await closureState();
  check('U26-closure-render-exception-no-stale-summary', !before.error && Object.entries(per).every(([n, r]) => r.calls >= Number(n) && failClosed(r.state)) &&
    after.summary === before.summary && !after.error && after.rows === before.rows,
    JSON.stringify(per) + ` restored=${after.summary === before.summary}`);
}

/* U27 Closure の失敗で計算は止まらない。Evidence status と Closure は独立して失敗を示す */
{
  const statusBefore = await closureState();
  await page.evaluate((secret) => {
    window.__realClosure = window.EvidenceClosure;
    window.EvidenceClosure = Object.assign({}, window.__realClosure, { evaluateClosure: () => { throw new Error(secret); } });
    renderProjectEvidencePanels();
  }, SECRET);
  const closureOnly = await closureState();
  await setValue(page, 'inp-W', '1000');
  await calc(page);
  const presetCalc = await page.evaluate(() => ({ badge: !!document.querySelector('#result-area .judge-badge'), fresh: getSingleResultFreshness(),
    glass: (document.querySelector('.conclusion-card .conclusion-glass') || {}).textContent || '' }));
  await setMode(page, 'manual');
  await setManual(page);
  await calc(page);
  const manualCalc = await page.evaluate(() => ({ badge: !!document.querySelector('#result-area .judge-badge'), fresh: getSingleResultFreshness(),
    glass: document.querySelector('.conclusion-card .conclusion-glass').textContent }));
  await setMode(page, 'preset');
  // 次は Closure を戻し、status だけを（表を書いた後の欄で）失敗させる
  await page.evaluate((secret) => {
    window.EvidenceClosure = window.__realClosure;
    window.__realRecon = window.renderReconciliation;
    window.renderReconciliation = () => { throw new Error('recon ' + secret); };
    renderProjectEvidencePanels();
  }, SECRET);
  const statusOnly = await closureState();
  const statusTable = await page.evaluate(() => document.getElementById('evidence-status-table').textContent);
  await page.evaluate(() => { window.renderReconciliation = window.__realRecon; renderProjectEvidencePanels(); });
  const restored = await closureState();
  await calc(page);
  check('U27-closure-failure-calc-continues-independent', failClosed(closureOnly) && !closureOnly.statusError &&
    closureOnly.status === statusBefore.status && presetCalc.badge && presetCalc.fresh === 'fresh' && presetCalc.glass.length > 0 &&
    manualCalc.badge && manualCalc.fresh === 'fresh' && manualCalc.glass === NODE_MANUAL.best.label &&
    statusOnly.statusError && /表示できませんでした/.test(statusOnly.status) && !statusOnly.status.includes(SECRET) && !statusTable.includes(SECRET) &&
    !statusOnly.error && statusOnly.summary === statusBefore.summary &&
    !restored.error && !restored.statusError && restored.summary === statusBefore.summary && restored.status === statusBefore.status,
    JSON.stringify({ closureOnly: { error: closureOnly.error, statusError: closureOnly.statusError }, presetCalc, manualCalc,
      statusOnly: { error: statusOnly.error, statusError: statusOnly.statusError }, restored: { error: restored.error, statusError: restored.statusError } }));
  await setOpen(page, ['evidence-details'], false);
}

/* ---------- U16 B1 の鮮度: details の開閉で変わらず、変更前の表示は details の外で見える ---------- */
{
  await setMode(page, 'manual');
  await setManual(page);
  await calc(page);
  const f0 = await freshness(page);
  // toggle event は非同期なので、開閉の後は 1 tick 待ってから読む（toggle で鮮度が変わるなら、ここで現れる）
  await page.click('#result-details > summary');
  await page.waitForTimeout(50);
  const f1 = await freshness(page);
  await setValue(page, 'inp-W', '1234');
  const f2 = await freshness(page);
  await page.click('#result-details > summary');   // 閉じても変更前のまま・表示は details の外で見える
  await page.waitForTimeout(50);
  const f3 = await freshness(page);
  await page.click('#result-details > summary');
  await page.waitForTimeout(50);
  await setValue(page, 'inp-W', String(MANUAL.W));
  await calc(page);
  const f4 = await freshness(page);
  check('U16-freshness-independent-of-details', f0.attr === 'fresh' && f0.judged === 'fresh' && f1.attr === 'fresh' && f1.detailsOpen === true &&
    f2.attr === 'stale' && f2.judged === 'stale' && f2.visible && f2.text === SINGLE_STALE && !f2.insideDetails && f2.badgeAfter === '"変更前"' &&
    f3.attr === 'stale' && f3.visible && f3.detailsOpen === false && f4.attr === 'fresh' && !f4.visible && f4.detailsOpen === true,
    [f0, f1, f2, f3, f4].map((f) => `${f.attr}/${f.visible}/${f.detailsOpen}`).join(' '));
  await setOpen(page, ['result-details'], false);
}

/* ---------- U17 係数 1.00 以外は入力欄と結論で文として示す ---------- */
{
  await setValue(page, 'inp-coeff', '0.90');
  const flag = await page.evaluate(() => { const e = document.getElementById('coeff-flag'); return { visible: e.checkVisibility(), text: e.innerText }; });
  await calc(page);
  const c = await page.evaluate(() => ({
    chip: [...document.querySelectorAll('.conclusion-card .meta-chip.is-flagged')].filter((e) => e.checkVisibility()).map((e) => e.innerText),
    notes: [...document.querySelectorAll('.conclusion-card .conclusion-note.is-warn')].filter((e) => e.checkVisibility()).map((e) => e.innerText),
    detailsOpen: document.getElementById('result-details').open
  }));
  await setValue(page, 'inp-coeff', '1.00');
  const flag1 = await page.evaluate(() => { const e = document.getElementById('coeff-flag'); return { visible: e.checkVisibility(), hidden: e.hidden }; });
  await calc(page);
  const c1 = await page.evaluate(() => ({ chip: document.querySelectorAll('.conclusion-card .meta-chip.is-flagged').length,
    text: document.querySelector('.conclusion-card').innerText }));
  check('U17-coefficient-not-1-shown-as-text', flag.visible && flag.text.includes('0.90') && flag.text.includes('告示') && c.detailsOpen === false &&
    c.chip.length === 1 && c.chip[0].includes('0.90') && c.notes.some((n) => n.includes('告示外の追加低減係数 0.90 を適用しています')) &&
    !flag1.visible && flag1.hidden && c1.chip === 0 && !c1.text.includes('を適用しています'), JSON.stringify({ flag, c, flag1 }));
}

/* ---------- U18 適用範囲外の候補の除外は件数つきで常に見える（件数は Node 側の計算と同じ） ---------- */
{
  const visible = await resultVisibleText(page);
  const shown = Math.min(5, NODE_MANUAL.out);   // 詳細の表は上位 5 件（従来どおり）
  const note = `⚠ 板硝子協会計算法の適用範囲外の候補 ${NODE_MANUAL.out} 件は自動推奨から除外しています（計算根拠・候補一覧の「適用範囲外」に上位 ${shown} 件を表示。`;
  await page.click('#result-details > summary');
  const table = await page.evaluate(() => {
    const t = [...document.querySelectorAll('#result-details .sec-title')].find((e) => e.innerText.includes('適用範囲外'));
    const card = t ? t.closest('.card') : null;
    return { title: t ? t.innerText : null, rows: card ? [...card.querySelectorAll('tbody tr')].filter((tr) => tr.checkVisibility()).length : -1 };
  });
  await page.click('#result-details > summary');
  check('U18-out-of-scope-count-always-visible', NODE_MANUAL.out > 0 && visible.includes(note) && table.title !== null &&
    table.rows === shown, `node out=${NODE_MANUAL.out} rows=${table.rows} visible=${visible.includes(note)}`);
}

/* ---------- U19 未検証の状態は詳細を開かなくても見える（4 mode） ---------- */
{
  const per = {};
  for (const m of MODES) {
    if (m === 'imported') await importManual(page);
    else { await setMode(page, m); if (m === 'manual') await setManual(page); await calc(page); }
    if (m === 'preset') {   // 初期寸法（未検証な既定値）に戻す
      await page.evaluate(() => { const d = contextCapability(requireActiveProjectContext(), 'sampleDefaultDimensions');
        document.getElementById('inp-W').value = d.widthMm.value; document.getElementById('inp-H').value = d.heightMm.value; });
      await calc(page);
    }
    const s = await page.evaluate(() => ({ text: document.getElementById('result-area').innerText,
      open: document.getElementById('result-details').open, view: document.getElementById('view-single').innerText }));
    per[m] = { missing: TRUST[m].filter((t) => !s.text.includes(t)), open: s.open, final: s.view.includes(FINAL_DECISION) };
  }
  check('U19-unverified-state-visible-without-details', MODES.every((m) => per[m].missing.length === 0 && per[m].open === false && per[m].final),
    JSON.stringify(per));
}

/* ---------- U20 計算根拠・候補一覧は 1 回で開き、値は Node 側の計算と同じ ---------- */
{
  await setMode(page, 'manual');
  await setManual(page);
  await calc(page);
  const closed = await page.evaluate(() => ({ body: document.querySelector('#result-details .result-details-body').checkVisibility(),
    chips: [...document.querySelectorAll('.conclusion-card .meta-chip')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    glass: document.querySelector('.conclusion-card .conclusion-glass').innerText.trim() }));
  await page.click('#result-details > summary');
  const opened = await page.evaluate(() => {
    const body = document.querySelector('#result-details .result-details-body');
    const firstOk = [...body.querySelectorAll('.sec-title')].find((e) => e.innerText.startsWith('推奨候補'));
    const row = firstOk ? firstOk.closest('.card').querySelector('tbody tr') : null;
    return { visible: body.checkVisibility(), text: body.innerText,
      okRow: row ? [row.querySelector('.glass-name').innerText.trim(), row.querySelector('.pval').innerText.trim()] : null };
  });
  const sections = ['入力条件・設計風圧', '設計風圧の選定（手入力値）', 'ガラス許容風圧の計算根拠（採用構成）', '推奨候補（OK・上位',
    '⚠ 板硝子協会計算法の適用範囲外（自動推奨から除外）'];
  const best = NODE_MANUAL.best;
  const valuesOk = closed.glass === best.label && closed.chips.includes(`許容風圧 ${best.P.toFixed(0)} N/m²`) &&
    closed.chips.includes(`設計風圧 ${NODE_MANUAL.design.toFixed(0)} N/m²`) && opened.okRow && opened.okRow[0] === best.label &&
    opened.okRow[1] === best.P.toFixed(0) && opened.text.includes(`→ 設計風圧 = ${NODE_MANUAL.design.toFixed(0)} N/m²`);
  await setOpen(page, ['result-details'], false);
  // 告示風圧計算: 風圧算定トレースは詳細の中にあり、開くと見える
  await setMode(page, 'notification');
  await calc(page);
  const traceClosed = await page.evaluate(() => document.querySelector('#result-details .result-details-body').checkVisibility());
  await page.click('#result-details > summary');
  const trace = await page.evaluate(() => {
    const t = document.querySelector('#result-details .result-details-body').innerText;
    return { trace: /風圧算定/.test(t), status: t.includes('（verificationStatus: unverified）') };
  });
  await setOpen(page, ['result-details'], false);
  check('U20-calculation-basis-in-details', !closed.body && opened.visible && sections.every((s) => opened.text.includes(s)) && valuesOk &&
    !traceClosed && trace.trace && trace.status,
    `sections=${sections.filter((s) => !opened.text.includes(s)).join('|') || 'all'} values=${!!valuesOk} okRow=${JSON.stringify(opened.okRow)} trace=${JSON.stringify(trace)}`);
}

/* ---------- U21 details はキーボードで開閉できる ---------- */
{
  await setMode(page, 'preset');
  await calc(page);
  await setOpen(page, DETAILS, false);
  const per = {};
  for (const id of DETAILS) {
    await page.focus(`#${id} > summary`);
    const focused = await page.evaluate((i) => document.activeElement === document.querySelector(`#${i} > summary`) &&
      document.querySelector(`#${i} > summary`).tabIndex >= 0, id);
    await page.keyboard.press('Enter');
    const a = await page.evaluate((i) => document.getElementById(i).open, id);
    await page.keyboard.press('Space');
    const b = await page.evaluate((i) => document.getElementById(i).open, id);
    per[id] = { focused, enter: a, space: b };
  }
  check('U21-details-keyboard', DETAILS.every((id) => per[id].focused && per[id].enter === true && per[id].space === false), JSON.stringify(per));
}

/* ---------- U22 入力欄・状態表示に名前と役割がある ---------- */
{
  const per = {};
  for (const m of MODES) {
    await setMode(page, m);
    per[m] = await page.evaluate(() => {
      const nameOf = (e) => {
        if (e.getAttribute('aria-label')) return e.getAttribute('aria-label');
        const by = e.getAttribute('aria-labelledby');
        if (by) return by.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim();
        if (e.id) { const l = document.querySelector(`label[for="${e.id}"]`); if (l) return l.textContent.trim(); }
        const wrap = e.closest('label'); if (wrap) return wrap.textContent.trim();
        return e.tagName === 'BUTTON' ? e.textContent.trim() : '';
      };
      return [...document.querySelectorAll('#view-single .single-input input, #view-single .single-input select, #view-single .single-input textarea, #view-single .single-input button')]
        .filter((e) => e.checkVisibility() && !nameOf(e)).map((e) => e.id || e.tagName);
    });
  }
  const roles = await page.evaluate(() => ({
    imported: document.getElementById('imported-summary').getAttribute('role'), coeff: document.getElementById('coeff-flag').getAttribute('role'),
    sections: [...document.querySelectorAll('#view-single section.single-step')].map((s) => {
      const t = document.getElementById(s.getAttribute('aria-labelledby')); return !!t && /^H[1-6]$/.test(t.tagName) && t.textContent.trim().length > 0;
    })
  }));
  await setMode(page, 'preset');
  check('U22-names-and-roles', MODES.every((m) => per[m].length === 0) && roles.imported === 'status' && roles.coeff === 'status' &&
    roles.sections.length === 4 && roles.sections.every(Boolean), JSON.stringify({ per, roles }));
}

/* =================================================================
   390×844
================================================================= */

const mobile = await openPage(390, 844);

/* ---------- U11 4 mode・details を閉じたまま横にはみ出さない ---------- */
{
  const per = {};
  for (const m of MODES) {
    if (m === 'imported') await importManual(mobile); else { await setMode(mobile, m); await calc(mobile); }
    await setOpen(mobile, DETAILS, false);
    per[m] = await widths(mobile);
  }
  check('U11-390-closed-no-overflow', MODES.every((m) => noOverflow(per[m])), JSON.stringify(per));
}

/* ---------- U12 details をすべて開いても横にはみ出さない。表は表の中で横スクロールし、overflow:hidden で文を切らない ---------- */
const layoutAudit = (p) => p.evaluate(() => {
  const view = document.getElementById('view-single');
  const vw = document.documentElement.clientWidth;
  const tables = [...view.querySelectorAll('table')].filter((t) => t.checkVisibility()).map((t) => {
    let a = t.parentElement;
    while (a && a !== view && !['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) a = a.parentElement;
    const scroller = a && a !== view ? a : null;
    const r = (scroller || t).getBoundingClientRect();
    return { id: t.id || t.closest('[id]').id, scroller: !!scroller, right: Math.round(r.right), fits: t.getBoundingClientRect().right <= vw + 0.5 };
  });
  const clipped = [...view.querySelectorAll('*')].filter((e) => {
    if (!e.checkVisibility() || e.classList.contains('sr-only')) return false;
    const s = getComputedStyle(e);
    return ['hidden', 'clip'].includes(s.overflowX) && e.scrollWidth > e.clientWidth + 1;
  }).map((e) => e.id || e.className || e.tagName);
  return { tables, clipped, vw };
});
{
  const per = {};
  for (const m of MODES) {
    if (m === 'imported') await importManual(mobile); else { await setMode(mobile, m); await calc(mobile); }
    await setOpen(mobile, DETAILS, true);
    await mobile.waitForTimeout(30);
    const w = await widths(mobile);
    const a = await layoutAudit(mobile);
    per[m] = { w, tables: a.tables.length, badTables: a.tables.filter((t) => !(t.fits || (t.scroller && t.right <= a.vw + 0.5))), clipped: a.clipped };
  }
  await setOpen(mobile, DETAILS, false);
  check('U12-390-open-no-overflow-tables-scroll', MODES.every((m) => noOverflow(per[m].w) && per[m].tables > 0 && per[m].badTables.length === 0 &&
    per[m].clipped.length === 0), JSON.stringify(per));
}

/* ---------- U13 長い表示名・長い検証情報でも横にはみ出さず、文を切らない ---------- */
{
  await setMode(mobile, 'preset');
  await calc(mobile);
  const injected = await mobile.evaluate((long) => {
    const set = (sel, text) => { const e = document.querySelector(sel); if (e) e.textContent = text; return !!e; };
    return [
      set('#preset-name-label', long), set('#inp-mode option[value="preset"]', '案件プリセット（' + long + '）'), set('#preset-identity-note', long),
      set('#evidence-summary-status', '案件入力値の検証状況: ' + long), set('#evidence-summary-closure', 'Evidence Closure: ' + long),
      set('.conclusion-card .conclusion-glass', long), set('#imported-summary', long)
    ].every(Boolean);
  }, LONG);
  await setOpen(mobile, DETAILS, true);
  const w = await widths(mobile);
  const els = await mobile.evaluate(() => ['#preset-name-label', '#inp-mode', '#preset-identity-note', '#evidence-summary-status',
    '#evidence-summary-closure', '.conclusion-card .conclusion-glass'].map((sel) => {
    const e = document.querySelector(sel); const r = e.getBoundingClientRect();
    return { sel, right: Math.round(r.right), cut: e.tagName !== 'SELECT' && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline' };
  }));
  const a = await layoutAudit(mobile);
  check('U13-390-long-labels', injected && noOverflow(w) && els.every((e) => e.right <= 390 && !e.cut) && a.clipped.length === 0,
    JSON.stringify({ w, els: els.filter((e) => e.right > 390 || e.cut), clipped: a.clipped }));
  await mobile.reload();
  await mobile.waitForSelector('.judge-badge');
}

/* ---------- U14 長い publicLabel の取り込み: 横にはみ出さず、取り込んだ文字列を表示しない ---------- */
{
  await importManual(mobile, { publicLabel: LONG_PUBLIC, note: MARKER_NOTE });
  const status = await mobile.evaluate(() => document.getElementById('io-status').innerText.trim());
  const mode = await mobile.evaluate(() => document.getElementById('inp-mode').value);
  await setOpen(mobile, DETAILS, true);
  const w = await widths(mobile);
  const text = await mobile.evaluate(() => document.getElementById('view-single').innerText);
  const summaryText = await mobile.evaluate(() => document.getElementById('imported-summary').innerText);
  await setOpen(mobile, DETAILS, false);
  check('U14-390-long-imported-publicLabel', status.startsWith('✓') && mode === 'imported' && noOverflow(w) && summaryText.includes('取り込み内容: ') &&
    !text.includes('Synthetic Imported Label') && !text.includes(MARKER_NOTE), `${status.slice(0, 30)} mode=${mode} ${JSON.stringify(w)}`);
}

/* ---------- U15 変更前の結果の表示は 390px でも見え、はみ出さない ---------- */
{
  await setMode(mobile, 'preset');
  await calc(mobile);
  await setValue(mobile, 'inp-W', '1111');
  const f = await freshness(mobile);
  const w = await widths(mobile);
  await setOpen(mobile, ['result-details'], true);
  const w2 = await widths(mobile);
  const f2 = await freshness(mobile);
  await setOpen(mobile, ['result-details'], false);
  await calc(mobile);
  const f3 = await freshness(mobile);
  check('U15-390-stale-visible-no-overflow', f.attr === 'stale' && f.judged === 'stale' && f.visible && f.text === SINGLE_STALE && f.right <= 390 &&
    !f.insideDetails && f.badgeAfter === '"変更前"' && noOverflow(w) && noOverflow(w2) && f2.attr === 'stale' && f3.attr === 'fresh',
    `${f.attr}/${f.visible}/${f.right} ${JSON.stringify(w)} ${JSON.stringify(w2)} -> ${f3.attr}`);
}

/* =================================================================
   U23 / U24 保存・通信・URL・console・privacy（全 page）
================================================================= */
{
  const per = [];
  for (const { p, log } of logs) {
    const calls = await p.evaluate(() => Object.assign({}, window.__uxProbe));
    const storage = await p.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
    const url = await p.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
    per.push({ calls, storage, url, requests: log.requests.length, console: log.console.length, errors: log.errors.length });
  }
  check('U23-no-storage-network-url-console', per.every((x) => Object.values(x.calls).every((n) => n === 0) && x.storage.ls === 0 &&
    x.storage.ss === 0 && x.storage.cookie === 0 && x.url.hash === '' && x.url.search === '' && x.url.href === FILE && x.requests === 0 &&
    x.console === 0 && x.errors === 0), JSON.stringify(per));
}
{
  const texts = [];
  for (const p of [page, mobile]) {
    await setMode(p, 'preset');
    await calc(p);
    await setOpen(p, DETAILS, true);
    texts.push(await p.evaluate(() => document.getElementById('view-single').innerText));
    await setOpen(p, DETAILS, false);
  }
  const summaries = await page.evaluate(() => ['evidence-summary-status', 'evidence-summary-closure', 'coeff-flag', 'imported-summary']
    .map((id) => document.getElementById(id).textContent).join(' '));
  check('U24-privacy-no-private-reference-no-echo', texts.every((t) => !PRIVATE.test(t) && !t.includes(MARKER_NOTE) && !t.includes('Synthetic Imported Label')) &&
    !PRIVATE.test(summaries), texts.map((t) => (t.match(PRIVATE) || ['none'])[0]).join(','));
}

console.log(results.join('\n'));
await browser.close();

console.log(`\nsingle-ux: ${pass} pass / ${fail} fail`);
finishRun('single-ux', pass + fail, fail, { playwrightSource });
