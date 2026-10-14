// Project Pack Review UI（Phase 2L-B2 / S3-B3B2-B3）を実ブラウザで確かめる。
//
// この harness は page の UI（貼り付け・全ケース計算・キャンセル・解除・詳細と比較の選択・Review の生成・ページ切替・消去・
// 画面の切替）だけを操作して、Review の欄の表示と page の状態を観測する。Pack の検証器・adapter・executor・batch・review
// module を Node 側で読み込んだり呼んだりしない。期待値は page の外で作る: fixture の literal と、wind-pressure.js・calc.js を
// Node で直接呼んだ値（review の表示からは作らない）。多ケースの Pack は tests/support/synthetic-pack.js がその場で作る合成のもの。
//
// page の中の操作は、初期化 script で page 内の global への代入を包むこと（buildPackReview の呼び出しを数える・
// 失敗を注入する・途中のケースの計算を失敗させる）と、page の state を JSON の複製へ差し替えることだけ（S3-B2 / S3-B3A /
// S3-B3B1 の harness と同じく、page の中だけの操作）。
//
// 確かめること（R01–R34）:
//   R01–R05 生成     自動では作らない・確定まで押せない・押したときだけ作る・失敗は固定文・発行物でない結果と差し替えた global を使わない
//   R06–R10 集計と組  件数・最大設計風圧と最小余裕比（別の指標・同じ値はすべて）・null は「—」・3 分類・未宣言と推奨候補なし
//   R11–R15 詳細     batch の caseId だけ・重複と 51 件目を拒む・値・選択の変更では作らない・候補の一覧
//   R16–R20 比較     片方だけ・同じケースを拒む・差は B − A・片方に値が無ければ「—」・case_direct に正負圧を補わない
//   R21–R26 寿命     新しい Pack・読込失敗と解除・再計算とキャンセル・計算の失敗・選択の変更で消える。画面の切替では消さない
//   R27–R30 安全     信頼の文言が常に見える・出典の申告を出さない・入力を HTML として扱わない・保存・通信・URL・console なし
//   R31–R34 性能と UI 2000 ケース・ページ切替・1280 / 390・keyboard と ARIA
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const FIXTURE_DIR = REPO + 'tests/fixtures/project-pack/';

// 期待値の oracle（page の外・executor / batch / review を使わない）
const Wind = require(REPO + 'wind-pressure.js');
const Glass = require(REPO + 'calc.js');
const { syntheticPack } = require(REPO + 'tests/support/synthetic-pack.js');

const FIXTURES = {
  notification1458: 'synthetic-notification1458.json',
  project_pressure_map: 'synthetic-project-pressure-map.json',
  case_direct: 'synthetic-case-direct.json'
};
const fixtureText = (mode) => fs.readFileSync(FIXTURE_DIR + FIXTURES[mode], 'utf8');
const fixture = (mode) => JSON.parse(fixtureText(mode));

const FAILURE_TEXT = 'Pack Review を生成できませんでした。現在有効な Review はありません。';
const NOT_READY_TEXT = 'Project Pack を読み込み、全ケース計算を完了すると Pack Review を生成できます。';
const IDLE_TEXT = 'Pack Review は「Pack Reviewを生成」を押したときだけ作ります。詳細・比較は、選んでから生成すると表示します。';
const CLEARED_TEXT = '全ケース計算の結果が変わったので、Pack Review を消しました。現在有効な Review はありません。';
const STALE_TEXT = '詳細・比較の選択が変わったので、前の Pack Review を消しました。「Pack Reviewを生成」を押すと新しい選択で作ります。現在有効な Review はありません。';
const DETAIL_UNKNOWN = 'そのケースは全ケース計算の結果にありません（入力した文字列は表示しません）。詳細には追加していません。';
const DETAIL_DUPLICATE = 'そのケースはすでに詳細に選んでいます。重複しては追加しません。';
const DETAIL_LIMIT = '詳細に選べるのは最大 50 件です。これ以上は追加しません（選択を切り詰めることもしません）。';
const COMPARE_INCOMPLETE = '比較は A と B の 2 ケースを選んでください（片方だけでは比較しません）。現在有効な Review はありません。';
const COMPARE_SAME = '比較の A と B に同じケースは選べません。現在有効な Review はありません。';
const NO_CANDIDATE = '—（推奨候補なし）';
const NO_VALUE = '—（片方に値なし）';
const TRUST_TEXTS = ['pack_unreviewed', 'calculated_not_verified', '計算済み ≠ 検証済み', 'OK は計算上の候補判定です。',
  '案件原典（構造計算書・図面など）とメーカー検討で確認してください。', 'この Review は正式な案件承認の資料ではありません。'];
const NEGATIONS = ['正式な案件承認の資料ではありません', '安全性の判定・承認ではありません', 'どちらが案件に適合するかを判定するものではありません',
  '計算済み ≠ 検証済み', 'calculated_not_verified'];
const STRONG_WORDING = /Verified|承認|確定|安全|適合|問題なし|確認済|検証済|合格|\bsafe\b|\bapproved\b|governing|支配/i;
const ZONES = { general: '一般部', corner: '隅角部' };

/* ---------- oracle ---------- */

const windOf = (wc, evaluationHeightM, zone) => Wind.calculateWindPressure({ V0: wc.V0.value, roughnessCategory: wc.roughnessCategory,
  buildingHeightM: wc.buildingHeightM.value, eavesHeightM: wc.eavesHeightM.value, evaluationHeightM,
  buildingType: wc.buildingType, zone, basis: wc.basis });

/** Pack の i 番目のケースの期待値（wind-pressure.js・calc.js を直接呼ぶ）。 */
function oracle(pack, i) {
  const c = pack.glazingCases[i];
  const pane = pack.panes.find((x) => x.paneId === c.paneId);
  const W = pane.widthMm.value;
  const H = pane.heightMm.value;
  const wc = pack.windConditions;
  const mode = pack.pressureModel.mode;
  const out = { caseId: c.caseId, paneId: c.paneId, glassType: c.glassType, widthMm: W, heightMm: H };
  if (c.floor !== undefined) out.floor = c.floor;
  if (c.zone !== undefined) out.zone = c.zone;
  if (mode === 'notification1458') {
    const h = wc.evaluationHeights.find((e) => e.floor === c.floor).height.value;
    const w = windOf(wc, h, c.zone);
    Object.assign(out, { designPressure: w.designPressure, evaluationHeightM: h, positivePressure: w.positive.pressure,
      negativePressure: w.negative.pressure, pressureSource: 'pack_notification_calculation' });
  } else if (mode === 'project_pressure_map') {
    const pos = wc.positivePressures.find((e) => e.floor === c.floor).pressure.value;
    const neg = wc.negativePressures.find((e) => e.zone === c.zone).magnitude.value;
    Object.assign(out, { designPressure: Math.max(pos, neg), positivePressure: pos, negativePressureMagnitude: neg,
      pressureSource: 'pack_pressure_map_lookup' });
  } else {
    Object.assign(out, { designPressure: c.designPressure.value, pressureSource: 'pack_case_direct' });
  }
  const all = Glass.generateCandidates(c.glassType, Glass.paneAreaM2(W, H), out.designPressure, c.extraFactor);
  const s = Glass.splitCandidates(all);
  const best = s.okCandidates[0] || null;
  Object.assign(out, { bestCandidate: best ? { label: best.label, P: best.P } : null, okCount: s.okCandidates.length,
    ngCount: s.ngCandidates.length, outOfScopeCount: s.outOfScopeCandidates.length, candidateCount: all.length,
    marginRatio: best ? best.P / out.designPressure : null, marginPressure: best ? best.P - out.designPressure : null });
  return out;
}
const oracleAll = (pack) => pack.glazingCases.map((_, i) => oracle(pack, i));

/** 一覧の 1 行に出るはずの文字列。 */
function rowText(o) {
  const place = [];
  if (o.floor !== undefined) place.push(o.floor === 'PH' ? 'PH' : o.floor + '階');
  if (o.zone !== undefined) place.push(ZONES[o.zone] + '（' + o.zone + '）');
  const b = o.bestCandidate;
  return [o.caseId, o.paneId, place.length ? place.join(' / ') : '—（宣言なし）', o.widthMm + ' × ' + o.heightMm, o.glassType,
    o.designPressure.toFixed(1), b ? b.label : NO_CANDIDATE, b ? b.P.toFixed(1) : '—', b ? o.marginRatio.toFixed(3) : NO_CANDIDATE,
    b ? o.marginPressure.toFixed(1) : NO_CANDIDATE, o.okCount + ' / ' + o.ngCount + ' / ' + o.outOfScopeCount];
}
const signed = (v, d) => (v > 0 ? '+' : '') + v.toFixed(d);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('project-pack-review', () => ({ checksRun: pass + fail, failures: fail }));

const browser = await chromium.launch();

/** 保存・通信・URL・ダウンロード・クリップボードの呼び出しを数える（page を読み込む前に仕込む）。 */
const PROBE = () => {
  const calls = { storage: 0, cookie: 0, idb: 0, caches: 0, beacon: 0, fetch: 0, xhr: 0, history: 0, blob: 0, clipboard: 0, open: 0 };
  window.__reviewProbe = calls;
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

/**
 * ProjectPackReview の global への代入を包み、buildPackReview の呼び出しを数える（window.__failReview なら失敗させる。
 * window.__dropFirstDetail なら、選んだ詳細の先頭を外して module を呼ぶ = 選択と違う詳細を持つ発行物が返る）。
 */
const COUNT_REVIEW = () => {
  let wrapped;
  window.__reviewBuilds = 0;
  window.__failReview = false;
  window.__dropFirstDetail = false;
  Object.defineProperty(window, 'ProjectPackReview', { configurable: true,
    get() { return wrapped; },
    set(real) {
      wrapped = Object.freeze(Object.assign({}, real, {
        buildPackReview: function (b, c, o) {
          window.__reviewBuilds++;
          if (window.__failReview) throw new Error('SECRET-REVIEW-ERROR /private/path <img src=x>');
          const opts = window.__dropFirstDetail ? Object.assign({}, o, { detailCaseIds: o.detailCaseIds.slice(1) }) : o;
          return real.buildPackReview.call(real, b, c, opts);
        }
      }));
    } });
};

async function newPage(viewport, initScripts) {
  const p = await browser.newPage({ viewport });
  const log = { console: [], errors: [], requests: [], downloads: [] };
  p.on('console', (m) => log.console.push({ type: m.type(), text: m.text() }));
  p.on('pageerror', (e) => log.errors.push(e.message));
  p.on('request', (r) => { if (!r.url().startsWith('file://')) log.requests.push(r.url()); });
  p.on('download', (d) => log.downloads.push(d.suggestedFilename()));
  for (const s of initScripts || []) await p.addInitScript(s);
  await p.goto(FILE);
  await p.waitForTimeout(300);
  return { p, log };
}

/* ---------- helpers ---------- */

/**
 * RF-30-01: 文字の読みやすさ（page の中で読む）。描画上の背景は、要素から祖先へ背景色を集め、canvas（白）から順に
 * alpha で重ねて求める（.notice の半透明の背景も含む）。コントラストは WCAG 2.x の相対輝度の比。
 * 返すもの: 信頼の文言の本文・強調部分、集計の見出し（.k）、Review の欄の外の .notice（全体の .notice を変えていないか）。
 */
const READ_TEXT = () => {
  const parse = (v) => { const p = v.match(/rgba?\(([^)]+)\)/)[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) layers.push(parse(getComputedStyle(e).backgroundColor));
    return layers.reverse().reduce((under, layer) => over(layer, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const read = (el) => {
    if (!el) return { ratio: 0, fontSize: null };
    const bg = background(el);
    const fg = over(parse(getComputedStyle(el).color), bg);
    const a = lum(fg), b = lum(bg);
    return { ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100, fontSize: getComputedStyle(el).fontSize };
  };
  const trust = document.getElementById('pack-review-trust');
  const outside = [...document.querySelectorAll('.notice')].find((e) => !e.closest('#pack-review-section'));
  return {
    body: read(trust), strong: read(trust && trust.querySelector('strong')),
    labels: [...document.querySelectorAll('#pack-review-summary .pack-review-stat .k')].map(read),
    otherNotice: outside ? { fontSize: getComputedStyle(outside).fontSize, color: getComputedStyle(outside).color } : null
  };
};
const MIN_CONTRAST = 4.5;
const readable = (t) => t.ratio >= MIN_CONTRAST;

async function showView(p, view) {
  if (await p.evaluate((v) => document.getElementById('view-' + v).hidden, view)) await p.click('#view-tab-' + view);
}
async function paste(p, text) {
  await showView(p, 'pack');
  await p.evaluate((t) => { document.getElementById('pack-paste').value = t; }, text);
  await p.click('#btn-pack-load');
  await p.waitForTimeout(50);
}
const batchSettled = () => !!window.stagedProjectPackBatch ||
  /キャンセル|完了できません|中止/.test(document.getElementById('pack-batch-status').textContent);
async function runBatch(p) {
  await showView(p, 'pack');
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
async function generate(p) {
  await showView(p, 'pack');
  const t = Date.now();
  await p.click('#btn-pack-review');
  await p.waitForTimeout(30);
  return Date.now() - t;
}
async function addDetail(p, text) {
  await p.fill('#pack-review-detail-input', text);
  await p.click('#btn-pack-review-detail-add');
  await p.waitForTimeout(10);
}
async function setCompare(p, a, b) {
  await p.selectOption('#pack-review-compare-a', a);
  await p.selectOption('#pack-review-compare-b', b);
  await p.waitForTimeout(10);
}

/** Review の欄の状態（読めない要素は空として返す。例外にしない）。 */
async function reviewState(p) {
  await showView(p, 'pack');
  return p.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    const text = (el) => (el ? el.textContent : '');
    const result = $('pack-review-result');
    const bodyRows = (el) => (el ? [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent)) : []);
    const trust = $('pack-review-trust');
    const tr = trust ? trust.getBoundingClientRect() : { height: 0 };
    return {
      gen: $('btn-pack-review').disabled, clear: $('btn-pack-review-clear').disabled, optionsHidden: $('pack-review-options').hidden,
      shown: !!result && !result.hidden && result.children.length > 0, resultText: text(result),
      status: text($('pack-review-status')), statusError: $('pack-review-status').classList.contains('is-error'),
      sectionText: $('pack-review-section') ? $('pack-review-section').innerText : '',
      trustText: trust ? trust.innerText : '', trustVisible: !!trust && !!trust.offsetParent && tr.height > 0 && !trust.closest('details:not([open])'),
      stats: [...document.querySelectorAll('#pack-review-summary .pack-review-stat')].map((d) => ({
        k: text(d.children[0]), v: text(d.children[1]), count: d.children[2] ? text(d.children[2].children[0]) : null,
        ids: d.children[2] ? text(d.children[2].querySelector('.pack-review-ids')) : null,
        folded: d.children[2] ? !!d.children[2].querySelector('details') : null })),
      groups: [...document.querySelectorAll('#pack-review-groups table')].map((t) => [...t.querySelectorAll('tbody tr')].map((r) => ({
        label: text(r.children[0]), count: text(r.children[1]), ids: text(r.querySelector('.pack-review-ids')) }))),
      header: [...document.querySelectorAll('#pack-review-rows thead th')].map((th) => th.textContent),
      rows: bodyRows($('pack-review-rows')), compare: bodyRows($('pack-review-comparison')),
      compareText: text($('pack-review-comparison')), detailsText: text($('pack-review-details')),
      nav: text(document.querySelector('#pack-review-rows .batch-count')),
      detailCount: text($('pack-review-detail-count')),
      chips: [...document.querySelectorAll('#pack-review-detail-list .pack-review-chip > span')].map((s) => s.textContent),
      compareOptions: [...document.querySelectorAll('#pack-review-compare-a option')].map((o) => o.value),
      builds: window.__reviewBuilds, hasReview: window.currentProjectPackReview !== null && window.currentProjectPackReview !== undefined,
      batch: !!window.stagedProjectPackBatch, packStaged: !!window.stagedProjectPackContext,
      batchStatus: text($('pack-batch-status')), reportHidden: $('pack-report-out').hidden
    };
  });
}
const gone = (s) => !s.shown && !s.hasReview && s.resultText === '';
const stat = (s, k) => s.stats.find((x) => x.k.startsWith(k)) || { v: null, ids: null };

/** active ProjectContext と、それに依存する UI・計算結果の snapshot（単一ケースの画面で読み、Pack の画面へ戻る）。 */
async function activeSnapshot(p) {
  await showView(p, 'single');
  const snap = await p.evaluate(() => {
    const ctx = activeProjectContext;
    const opts = (id) => [...document.querySelectorAll('#' + id + ' option')].map((o) => o.value + '=' + o.textContent);
    const text = (id) => { const el = document.getElementById(id); return el ? el.innerText : null; };
    return {
      sameObject: ctx === window.__activeAtStart, sourceKind: ctx && ctx.sourceKind, trust: ctx && ctx.trust,
      publicLabel: ctx && ctx.publicLabel, mode: document.getElementById('inp-mode').value,
      floors: opts('inp-floor').join('|'), zones: opts('inp-zone').join('|'),
      w: document.getElementById('inp-W').value, h: document.getElementById('inp-H').value,
      result: text('result-area'), batchView: text('view-batch'),
      otherFields: [...document.querySelectorAll('textarea, input')].filter((el) => !/^pack-/.test(el.id))
        .map((el) => el.id + '=' + (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)).join('|')
    };
  });
  await showView(p, 'pack');
  return snap;
}

/* ============================================================
   main page（1280×800）
============================================================ */

const { p: page, log } = await newPage({ width: 1280, height: 800 }, [PROBE, COUNT_REVIEW]);
await page.evaluate(() => { window.__activeAtStart = activeProjectContext; });
await showView(page, 'single');
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE0 = await activeSnapshot(page);

/* ---------- R01–R03・R27: 起動・読込・確定まで押せない・自動では作らない ---------- */

const s0 = await reviewState(page);
check('R02-startup', s0.gen && s0.clear && s0.optionsHidden && gone(s0) && s0.status === NOT_READY_TEXT, s0.status);
check('R27-trust-startup', s0.trustVisible && TRUST_TEXTS.every((t) => s0.trustText.replace(/\s+/g, ' ').includes(t)), '起動時から信頼の文言が見える');
{
  const t0 = await page.evaluate(READ_TEXT);
  check('R27-trust-readable-startup', readable(t0.body) && t0.body.fontSize === '12px' && readable(t0.strong),
    `本文 ${t0.body.ratio}:1 ${t0.body.fontSize}・強調 ${t0.strong.ratio}:1（${MIN_CONTRAST}:1 以上・本文 12px）`);
  // 全体の .notice（他の注意文）は変えていない（11px・--text3 のまま）
  check('R27-global-notice-unchanged', !!t0.otherNotice && t0.otherNotice.fontSize === '11px' && t0.otherNotice.color === 'rgb(90, 96, 128)',
    JSON.stringify(t0.otherNotice));
}

const NOTIF = fixture('notification1458');
const NOTIF_O = oracleAll(NOTIF);
await paste(page, fixtureText('notification1458'));
const s1 = await reviewState(page);
check('R02-load-not-ready', s1.gen && s1.optionsHidden && gone(s1) && s1.builds === 0, 'Pack の読込だけでは押せない・作らない');

const BIG = syntheticPack(2000, 'project_pressure_map', { label: 'Synthetic Stress Review' });
const BIG_O = oracleAll(BIG);
await paste(page, JSON.stringify(BIG));
await page.click('#btn-pack-batch');
await waitMidRun(page);
const s2 = await reviewState(page);
check('R02-disabled-while-running', s2.gen && s2.optionsHidden && gone(s2) && !s2.batch, '計算中は押せない');
await page.waitForFunction(batchSettled, null, { timeout: 120000, polling: 20 });
await page.waitForTimeout(50);
const s3 = await reviewState(page);
check('R01-no-auto-after-batch', !s3.gen && !s3.optionsHidden && gone(s3) && s3.builds === 0 && s3.status === IDLE_TEXT, s3.status);
check('R01-compare-options', s3.compareOptions.length === 2001 && s3.compareOptions[0] === '' && s3.compareOptions[1] === 'G0001' &&
  s3.compareOptions[2000] === 'G2000', `${s3.compareOptions.length} options（batch の caseId を batch 順）`);
// 一括の結果のページ切替・画面の切替では作らない
await page.click('#pack-batch-result button:nth-of-type(2)');
await page.waitForTimeout(30);
await showView(page, 'single');
await showView(page, 'batch');
await showView(page, 'pack');
const s4 = await reviewState(page);
check('R01-no-auto-on-page-or-tab', gone(s4) && s4.builds === 0, 'ページの切替・画面の切替では作らない');

/* ---------- R31–R32: 2000 ケースの生成・一覧・ページ切替 ---------- */

const genMs = await generate(page);
const s5 = await reviewState(page);
check('R03-explicit-generate', s5.shown && s5.hasReview && s5.builds === 1 && !s5.clear &&
  /^Pack Review を生成しました（全 2000 ケース・詳細 0 件・比較 なし。未レビュー・計算済み ≠ 検証済み）。$/.test(s5.status), s5.status);
check('R03-review-header', s5.resultText.includes('trust: pack_unreviewed（未レビュー）') &&
  s5.resultText.includes('interpretation: calculated_not_verified（計算済み ≠ 検証済み）') &&
  s5.resultText.includes('公開表示名: Synthetic Stress Review') && s5.resultText.includes('全ケース数: 2000'), 'review の trust・interpretation');
const HEADER = ['ケース', 'Pane', '階/部位', '寸法 W×H mm', 'ガラス', '設計風圧 N/m²', '推奨候補', '許容風圧 N/m²', '余裕比',
  '余裕差 N/m²', '候補数 OK/NG/適用範囲外'];
check('R31-rows-2000-first-page', same(s5.header, HEADER) && s5.rows.length === 50 && same(s5.rows, BIG_O.slice(0, 50).map(rowText)) &&
  s5.nav === '1–50 / 2000 ケース（1 / 40 ページ）', s5.nav);
const summary2000 = stat(s5, '全ケース数').v;
check('R31-no-truncation', summary2000 === '2000' && s5.resultText.includes('ケース一覧（全 2000 ケース）'), `全ケース数 ${summary2000}`);
// ページ切替（次へ × 2 → 3 ページ目）・最後のページ（作り直さない）
const tPage = Date.now();
await page.click('#pack-review-rows button:nth-of-type(2)');
await page.click('#pack-review-rows button:nth-of-type(2)');
await page.waitForTimeout(20);
const pageMs = Date.now() - tPage;
const s6 = await reviewState(page);
check('R32-paging', s6.nav === '101–150 / 2000 ケース（3 / 40 ページ）' && same(s6.rows, BIG_O.slice(100, 150).map(rowText)) &&
  s6.builds === 1, s6.nav);
// 「次のページ」が押せる間だけ押す（押せなくなったら止める。押せないボタンを押して待ち続けない）
for (let i = 0; i < 45; i++) {
  if (await page.evaluate(() => { const b = document.querySelector('#pack-review-rows button:nth-of-type(2)'); return !b || b.disabled; })) break;
  await page.click('#pack-review-rows button:nth-of-type(2)');
}
await page.waitForTimeout(20);
const s7 = await reviewState(page);
const nextDisabled = await page.evaluate(() => document.querySelector('#pack-review-rows button:nth-of-type(2)').disabled);
check('R31-last-page', s7.nav === '1951–2000 / 2000 ケース（40 / 40 ページ）' && s7.rows[49] && s7.rows[49][0] === 'G2000' &&
  same(s7.rows, BIG_O.slice(1950).map(rowText)) && nextDisabled && s7.builds === 1, s7.nav);
await page.click('#pack-review-rows button:nth-of-type(1)');
await page.waitForTimeout(20);
const s7b = await reviewState(page);
check('R32-prev', s7b.nav.startsWith('1901–1950') && s7b.builds === 1, s7b.nav);

/* ---------- R06–R09: 集計と組（2000 ケース・map） ---------- */

{
  const withBest = BIG_O.filter((o) => o.bestCandidate);
  const maxP = Math.max(...BIG_O.map((o) => o.designPressure));
  const maxIds = BIG_O.filter((o) => o.designPressure === maxP).map((o) => o.caseId);
  const minR = Math.min(...withBest.map((o) => o.marginRatio));
  const minIds = withBest.filter((o) => o.marginRatio === minR).map((o) => o.caseId);
  check('R06-summary-counts', stat(s5, '全ケース数').v === '2000' && stat(s5, '推奨候補あり').v === String(withBest.length) &&
    stat(s5, '推奨候補なし').v === String(2000 - withBest.length) &&
    stat(s5, '適用範囲外の候補を含むケース').v === String(BIG_O.filter((o) => o.outOfScopeCount > 0).length),
  s5.stats.slice(0, 4).map((x) => x.v).join(' / '));
  check('R07-max-and-min-separate', stat(s5, '最大設計風圧').v === maxP.toFixed(1) && stat(s5, '最大設計風圧').ids === maxIds.join(', ') &&
    stat(s5, '最大設計風圧').count === '該当 ' + maxIds.length + ' 件' && stat(s5, '最大設計風圧').folded === (maxIds.length > 10) &&
    stat(s5, '最小余裕比').v === minR.toFixed(3) && stat(s5, '最小余裕比').ids === minIds.join(', ') &&
    stat(s5, '最小余裕比').count === '該当 ' + minIds.length + ' 件' && maxIds.length > 1 && s5.stats.length === 6,
  `max ${maxP} ×${maxIds.length} / min ${minR.toFixed(3)} ×${minIds.length}（同じ値はすべて batch 順）`);
  // 3 分類（first-appearance order・件数・caseId）
  const groupsOf = (key, label) => {
    const order = [];
    const by = {};
    BIG_O.forEach((o) => { const v = key(o); if (!(v in by)) { by[v] = []; order.push(v); } by[v].push(o.caseId); });
    return order.map((v) => ({ label: label(v), count: String(by[v].length), ids: by[v].join(', ') }));
  };
  const rec = groupsOf((o) => (o.bestCandidate ? o.bestCandidate.label : '\u0000'), (v) => (v === '\u0000' ? '推奨候補なし' : v));
  const recSorted = rec.filter((g) => g.label !== '推奨候補なし').concat(rec.filter((g) => g.label === '推奨候補なし'));
  check('R09-groups-map-2000', s5.groups.length === 3 && same(s5.groups[0], recSorted) &&
    same(s5.groups[1], groupsOf((o) => o.floor, (v) => v + '階')) &&
    same(s5.groups[2], groupsOf((o) => o.zone, (v) => ZONES[v] + '（' + v + '）')),
  `${s5.groups.map((g) => g.length).join(' / ')} 組`);
}

/* ---------- R11–R12: 詳細の選択（2000 ケース） ---------- */

const ATTACK = '<img src=x onerror="window.__xss=1">G0001';
await addDetail(page, ATTACK);
const s8 = await reviewState(page);
const xss = await page.evaluate(() => ({ xss: window.__xss === 1, imgs: document.querySelectorAll('#pack-review-section img').length }));
check('R11-unknown-rejected', s8.status === DETAIL_UNKNOWN && s8.statusError && s8.chips.length === 0 && s8.shown,
  '入力した文字列は表示しない（Review は残る）');
check('R29-input-not-html', !xss.xss && xss.imgs === 0 && !s8.sectionText.includes('onerror') && !s8.status.includes('<img'), JSON.stringify(xss));
await addDetail(page, 'G0002');
const s9 = await reviewState(page);
check('R25-selection-change-clears', gone(s9) && s9.status === STALE_TEXT && s9.builds === 1 && same(s9.chips, ['G0002']),
  '生成後の選択の変更で前の Review を消す（作り直さない）');
await addDetail(page, 'G0002');
const s10 = await reviewState(page);
check('R11-duplicate-rejected', s10.status === DETAIL_DUPLICATE && same(s10.chips, ['G0002']), s10.status);
await page.evaluate(() => {
  for (let i = 3; i <= 51; i++) {
    document.getElementById('pack-review-detail-input').value = 'G' + String(i).padStart(4, '0');
    document.getElementById('btn-pack-review-detail-add').click();
  }
});
const s11 = await reviewState(page);
const fifty = ['G0002'].concat(Array.from({ length: 49 }, (_, k) => 'G' + String(k + 3).padStart(4, '0')));
check('R12-fifty', same(s11.chips, fifty) && s11.detailCount.includes('50 / 50 件'), s11.detailCount);
await addDetail(page, 'G0100');
const s12 = await reviewState(page);
check('R12-51st-rejected', s12.status === DETAIL_LIMIT && same(s12.chips, fifty) && s12.builds === 1, '51 件目は拒む・前の選択を入れ替えない');
await generate(page);
const s13 = await reviewState(page);
check('R12-generate-50-details', s13.shown && s13.builds === 2 && s13.detailsText.includes('選んだケースの詳細（50 件）') &&
  fifty.every((id) => s13.detailsText.includes('caseId: ' + id + ' ／')), s13.status);

/* ---------- R13–R15: 詳細の値（notification fixture） ---------- */

await paste(page, fixtureText('notification1458'));
const s14 = await reviewState(page);
check('R21-new-pack-clears', gone(s14) && s14.gen && s14.chips.length === 0, '新しい Pack の読込で消える（選択も持ち越さない）');
await runBatch(page);
await addDetail(page, 'G002');
const builds0 = (await reviewState(page)).builds;
check('R14-selection-no-generate', builds0 === 2 && !(await reviewState(page)).hasReview, '選択しただけでは作らない');
await generate(page);
const s15 = await reviewState(page);
{
  const o = NOTIF_O[1];
  const d = s15.detailsText;
  check('R13-detail-values', d.includes('caseId: G002 ／ Pane: P002') && d.includes('階/部位: 3階 / 隅角部（corner）') &&
    d.includes('寸法: 760 × 1880 mm') && d.includes('ガラス: lowe_fl') &&
    d.includes('風圧の出どころ: pack_notification_calculation（pressureModel.mode: notification1458）') &&
    d.includes('設計風圧: ' + o.designPressure.toFixed(1) + ' N/m²') && d.includes('正圧: ' + o.positivePressure.toFixed(1)) &&
    d.includes('負圧: ' + o.negativePressure.toFixed(1)) && d.includes('評価高さ: 10.2 m') &&
    d.includes('推奨候補: ' + o.bestCandidate.label + '（許容風圧 ' + o.bestCandidate.P.toFixed(1) + '）') &&
    d.includes('余裕比: ' + o.marginRatio.toFixed(3) + ' ／ 余裕差: ' + o.marginPressure.toFixed(1)) &&
    d.includes('候補数 OK / NG / 適用範囲外: ' + o.okCount + ' / ' + o.ngCount + ' / ' + o.outOfScopeCount), 'G002 の詳細（wind / calc の oracle）');
  check('R15-candidate-summary', d.includes('候補の一覧（' + o.candidateCount + ' 件）') && !/notificationTrace|trace|Cf|Gf|Er/.test(d),
    `${o.candidateCount} 件・trace を出さない`);
  check('R06-summary-notification', stat(s15, '全ケース数').v === '3' && stat(s15, '最大設計風圧').v ===
    Math.max(...NOTIF_O.map((x) => x.designPressure)).toFixed(1) && same(s15.rows, NOTIF_O.map(rowText)), '3 ケースの一覧と集計');
  const detailsOpen = await page.evaluate(() => [document.getElementById('pack-review-details').open, document.getElementById('pack-review-comparison').open]);
  check('R33-details-collapsed', same(detailsOpen, [false, false]), '詳細・比較は折りたたみ（開いて読む）');
  // module が選択と違う詳細を持つ review を返したら（発行物でも）表示しない
  await page.evaluate(() => { window.__dropFirstDetail = true; });
  await generate(page);
  const mismatch = await reviewState(page);
  await page.evaluate(() => { window.__dropFirstDetail = false; });
  check('R13-detail-mismatch-refused', gone(mismatch) && mismatch.status === FAILURE_TEXT && mismatch.statusError, mismatch.status);
  await generate(page);
}

/* ---------- R16–R18: 比較（notification fixture） ---------- */

await setCompare(page, 'G001', '');
const s16a = await reviewState(page);
check('R25-compare-change-clears', gone(s16a) && s16a.status === STALE_TEXT, '比較の片方を選ぶと前の Review を消す');
await generate(page);
const s16 = await reviewState(page);
check('R16-compare-incomplete', gone(s16) && s16.status === COMPARE_INCOMPLETE && s16.statusError, s16.status);
await setCompare(page, 'G001', 'G001');
await generate(page);
const s17 = await reviewState(page);
check('R17-compare-same', gone(s17) && s17.status === COMPARE_SAME, s17.status);
await setCompare(page, 'G003', 'G001');
await generate(page);
const s18 = await reviewState(page);
{
  const a = NOTIF_O[2];
  const b = NOTIF_O[0];
  const row = (k) => s18.compare.find((r) => r[0].startsWith(k)) || [];
  check('R18-b-minus-a', s18.shown && s18.compareText.includes('2 ケースの比較（A: G003 ／ B: G001）') &&
    same(row('設計風圧'), ['設計風圧 N/m²', a.designPressure.toFixed(1), b.designPressure.toFixed(1), signed(b.designPressure - a.designPressure, 1)]) &&
    row('設計風圧')[3].startsWith('-') &&
    row('評価高さ')[3] === signed(b.evaluationHeightM - a.evaluationHeightM, 3) &&
    row('正圧')[3] === signed(b.positivePressure - a.positivePressure, 1) &&
    row('推奨候補の許容風圧')[3] === signed(b.bestCandidate.P - a.bestCandidate.P, 1) &&
    row('余裕比')[3] === signed(b.marginRatio - a.marginRatio, 3) &&
    row('余裕差')[3] === signed(b.marginPressure - a.marginPressure, 1) &&
    row('幅 W')[3] === '0' && row('Pane')[1] === '一致' && row('ガラス')[1] === '不一致',
  `設計風圧の差 ${row('設計風圧')[3]}（B − A）`);
  check('R20-no-judgment', s18.compareText.includes('どちらが案件に適合するかを判定するものではありません') &&
    !/有利|不利|推奨する|適合します|良い方/.test(s18.compareText), '比較から判定を作らない');
}

/* ---------- R19–R20・R08・R10: case_direct（推奨候補なし・未宣言） ---------- */

const DIRECT = syntheticPack(12, 'case_direct', { designPressureOf: (i) => (i === 5 ? 200000 : 1000 + 37 * i) });
const DIRECT_O = oracleAll(DIRECT);
await paste(page, JSON.stringify(DIRECT));
await runBatch(page);
await setCompare(page, 'G0006', 'G0001');
await generate(page);
const s19 = await reviewState(page);
{
  const row = (k) => s19.compare.find((r) => r[0].startsWith(k)) || [];
  check('R19-null-not-zero', s19.shown && same(row('推奨候補の許容風圧').slice(1), [NO_CANDIDATE, DIRECT_O[0].bestCandidate.P.toFixed(1), NO_VALUE]) &&
    same(row('余裕比').slice(1), [NO_CANDIDATE, DIRECT_O[0].marginRatio.toFixed(3), NO_VALUE]) && row('余裕差')[3] === NO_VALUE &&
    row('推奨候補の構成')[1] === '—（片方または両方に値なし）', '片方に推奨候補が無い → 「—」（0 にしない）');
  check('R20-direct-no-pressure-split', !s19.compare.some((r) => /^(正圧|負圧|評価高さ)/.test(r[0])) && row('階')[1] === '—（片方または両方に値なし）',
    'case_direct に正圧・負圧・階を補わない');
  check('R08-null-in-rows', same(s19.rows, DIRECT_O.map(rowText)) && s19.rows[5][8] === NO_CANDIDATE && s19.rows[5][9] === NO_CANDIDATE,
    'G0006 の余裕比・余裕差は「—」');
  const noBest = DIRECT_O.filter((o) => !o.bestCandidate).map((o) => o.caseId);
  check('R10-direct-groups', same(s19.groups[1].map((g) => g.label), ['未宣言（階の宣言なし）']) &&
    same(s19.groups[2].map((g) => g.label), ['未宣言（部位の宣言なし）']) && s19.groups[1][0].count === '12' &&
    s19.groups[0][s19.groups[0].length - 1].label === '推奨候補なし' && s19.groups[0][s19.groups[0].length - 1].ids === noBest.join(', ') &&
    s19.rows.every((r) => r[2] === '—（宣言なし）'), '未宣言は未宣言・推奨候補なしは独立した組（最後）');
}
const ALLNULL = syntheticPack(4, 'case_direct', { designPressureOf: () => 200000 });
await paste(page, JSON.stringify(ALLNULL));
await runBatch(page);
await generate(page);
const s20 = await reviewState(page);
check('R08-null-summary', stat(s20, '最小余裕比').v === '—（推奨候補のあるケースなし）' && stat(s20, '最小余裕比').ids === '—' &&
  stat(s20, '最小余裕比').count === '該当 0 件' &&
  stat(s20, '推奨候補あり').v === '0' && !s20.stats.some((x) => x.v === '0.000'), `最小余裕比 ${stat(s20, '最小余裕比').v}`);

/* ---------- R28: 出典の申告を出さない・強い語なし（3 mode） ---------- */

let privacyOk = true;
const privacyDetail = [];
for (const mode of Object.keys(FIXTURES)) {
  await paste(page, fixtureText(mode));
  await runBatch(page);
  const ids = fixture(mode).glazingCases.map((c) => c.caseId);
  await addDetail(page, ids[0]);
  await setCompare(page, ids[0], ids[1]);
  await generate(page);
  const s = await reviewState(page);
  let text = s.sectionText;
  const leaks = ['合成テスト用', 'sourceClaim', 'claimedLevel', 'publicDescription', 'privateReference', 'claimedCheckedAt',
    'sourceScopes', 'activeProjectContext'].filter((t) => s.resultText.includes(t) || s.sectionText.includes(t));
  NEGATIONS.forEach((n) => { text = text.split(n).join(''); });
  const strong = text.match(STRONG_WORDING);
  if (!s.shown || leaks.length || strong) { privacyOk = false; privacyDetail.push(mode + ':' + leaks.join(',') + (strong ? ' strong=' + strong[0] : '')); }
}
check('R28-no-claims-no-strong-words', privacyOk, privacyOk ? '3 mode（出典の申告・強い語なし）' : privacyDetail.join(' '));

/* ---------- R26: 画面の切替では消さない・作り直さない。Pack Report とは別の state ---------- */

{
  const before = await reviewState(page);
  await showView(page, 'single');
  await showView(page, 'batch');
  await showView(page, 'pack');
  const after = await reviewState(page);
  check('R26-tab-switch-keeps', before.shown && after.shown && after.builds === before.builds && after.resultText === before.resultText,
    '画面の切替で消さない・作り直さない');
  await page.click('#btn-pack-report-json');
  await page.waitForTimeout(30);
  await page.click('#btn-pack-report-clear');
  await page.waitForTimeout(30);
  const r1 = await reviewState(page);
  await page.click('#btn-pack-review-clear');
  await page.waitForTimeout(30);
  const r2 = await reviewState(page);
  check('R26-separate-from-report', r1.shown && r1.builds === before.builds && gone(r2) && r2.reportHidden && !r2.gen &&
    r2.status === 'Pack Review を消去しました。現在有効な Review はありません。', 'Report の消去で Review は消えない・Review の消去は Review だけ');
}

/* ---------- R22–R23: 読込失敗・解除・再計算・キャンセル ---------- */

await generate(page);
await paste(page, '{"schemaVersion": 1');
const s21 = await reviewState(page);
check('R22-invalid-clears', gone(s21) && s21.gen && !s21.packStaged, '読込失敗で消える');
await paste(page, fixtureText('case_direct'));
await runBatch(page);
await generate(page);
await page.click('#btn-pack-unload');
await page.waitForTimeout(50);
const s22 = await reviewState(page);
check('R22-unload-clears', gone(s22) && s22.gen && !s22.packStaged, '解除で消える');
await paste(page, JSON.stringify(syntheticPack(600, 'notification1458')));
await runBatch(page);
await generate(page);
await page.click('#btn-pack-batch');
const s23 = await reviewState(page);
check('R23-restart-clears', gone(s23) && s23.gen && s23.status === CLEARED_TEXT, '計算の開始で消える');
await waitMidRun(page);
await page.click('#btn-pack-batch-cancel');
await page.waitForTimeout(100);
const s24 = await reviewState(page);
check('R23-cancel-clears', gone(s24) && s24.gen && !s24.batch && s24.packStaged, s24.batchStatus);

/* ---------- R05: 発行物でない結果（JSON の複製）では作らない ---------- */

await runBatch(page);
await page.evaluate(() => { stagedProjectPackBatch = JSON.parse(JSON.stringify(stagedProjectPackBatch)); });
const b5 = (await reviewState(page)).builds;
await generate(page);
const s25 = await reviewState(page);
check('R05-copy-rejected', gone(s25) && s25.status === FAILURE_TEXT && s25.statusError && s25.builds === b5, '一括の結果の JSON 複製では作らない');
// 作成時の試行と違う（読込の試行が進んだ）結果からは作らない（発行物で、同じ context の結果でも）
await runBatch(page);
await page.evaluate(() => { projectPackAttempt += 1; });
await generate(page);
const s26 = await reviewState(page);
check('R05-attempt-changed-rejected', gone(s26) && s26.status === FAILURE_TEXT && s26.builds === b5, '読込の試行が変わった結果からは作らない');

/* ---------- R30・R28: 保存・通信・URL・console・active ---------- */

await showView(page, 'single');
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE1 = await activeSnapshot(page);
check('R28-runtime-parity', same(ACTIVE1, ACTIVE0) && ACTIVE1.sameObject === true, 'Review を作っても active context・入力・計算結果・一括検討は同じ');
const calls = await page.evaluate(() => Object.assign({}, window.__reviewProbe));
const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
const url = await page.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
check('R30-no-persistence-network-url', calls.storage === 0 && calls.cookie === 0 && calls.idb === 0 && calls.caches === 0 &&
  storage.ls === 0 && storage.ss === 0 && storage.cookie === 0 && log.requests.length === 0 && calls.fetch === 0 && calls.xhr === 0 &&
  calls.beacon === 0 && log.downloads.length === 0 && calls.blob === 0 && calls.clipboard === 0 && calls.open === 0 &&
  url.hash === '' && url.search === '' && url.href === FILE && calls.history === 0, JSON.stringify({ storage, requests: log.requests.length }));
check('R30-no-console', log.console.length === 0 && log.errors.length === 0, `console=${log.console.length} pageErrors=${log.errors.length}`);
await page.close();

/* ============================================================
   故障の注入・依存の固定（新しい page）
============================================================ */

// R04: 生成の失敗は固定文・前の Review も消える・Pack と一括の結果は残る・例外の文面を出さない
{
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, [COUNT_REVIEW]);
  await paste(p, fixtureText('project_pressure_map'));
  await runBatch(p);
  await generate(p);
  const before = await reviewState(p);
  await p.evaluate(() => { window.__failReview = true; });
  await generate(p);
  const f = await reviewState(p);
  check('R04-failure-fixed-text', before.shown && gone(f) && f.status === FAILURE_TEXT && f.statusError && f.batch && f.packStaged &&
    !f.gen && !/SECRET|private|<img/.test(f.sectionText + f.status) && l.errors.length === 0 &&
    !l.console.some((m) => /SECRET/.test(m.text)), f.status);
  await p.evaluate(() => { window.__failReview = false; });
  await generate(p);
  check('R04-retry-after-failure', (await reviewState(p)).shown, '失敗の後に作り直せる');
  await p.close();
}

// R24: 計算の失敗で消える（同じ Pack で、2 回目の計算だけ途中のケースが失敗する executor）
{
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, [() => {
    let wrapped;
    window.__failNext = false;
    Object.defineProperty(window, 'ProjectPackExecution', { configurable: true,
      get() { return wrapped; },
      set(real) {
        wrapped = Object.freeze(Object.assign({}, real, {
          executeCase: function (c, id) {
            if (window.__failNext && id === 'G0040') throw new Error('forced failure SECRET-B');
            return real.executeCase.call(real, c, id);
          }
        }));
      } });
  }]);
  await paste(p, JSON.stringify(syntheticPack(80, 'case_direct')));
  await runBatch(p);
  await generate(p);
  const before = await reviewState(p);
  await p.evaluate(() => { window.__failNext = true; });
  await runBatch(p);
  const after = await reviewState(p);
  check('R24-batch-failure-clears', before.shown && gone(after) && after.gen && !after.batch && after.packStaged &&
    /一括計算を完了できませんでした/.test(after.batchStatus) && !/SECRET-B|forced/.test(after.sectionText) && l.errors.length === 0, after.batchStatus);
  await p.close();
}

// R05: 初期化後に ProjectPackReview の global を偽物へ差し替えても、UI は初期化時に掴んだ module を使う
{
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, []);
  await paste(p, fixtureText('notification1458'));
  await runBatch(p);
  await p.evaluate(() => {
    window.__decoyHits = 0;
    window.ProjectPackReview = new Proxy({}, { get: () => { window.__decoyHits++; return () => ({}); } });
  });
  await generate(p);
  const s = await reviewState(p);
  const hits = await p.evaluate(() => window.__decoyHits);
  check('R05-review-decoy', s.shown && hits === 0 && l.errors.length === 0 && same(s.rows, NOTIF_O.map(rowText)), `decoy hits=${hits}`);
  await p.close();
}

/* ============================================================
   R33–R34: 1280 / 390 の配置・keyboard と ARIA
============================================================ */

async function layout(p, width) {
  return p.evaluate((w) => {
    const $ = (id) => document.getElementById(id);
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const scrollers = [...document.querySelectorAll('#pack-review-result .pack-batch-scroll')];
    const visible = (el) => !!el && !!el.offsetParent && r(el).width > 0;
    const inside = (el) => visible(el) && r(el).left >= -0.5 && r(el).right <= w + 0.5;
    return {
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      trust: r($('pack-review-trust')), gen: r($('btn-pack-review')), summary: r($('pack-review-summary')), groups: r($('pack-review-groups')),
      rows: r($('pack-review-rows')), trustVisible: visible($('pack-review-trust')) && !$('pack-review-trust').closest('details'),
      controlsInside: ['pack-review-detail-input', 'btn-pack-review-detail-add', 'pack-review-compare-a', 'pack-review-compare-b',
        'btn-pack-review', 'btn-pack-review-clear'].every((id) => inside($(id))),
      tablesScroll: scrollers.length > 0 && scrollers.every((s) => r(s).right <= w + 0.5 && getComputedStyle(s).overflowX === 'auto'),
      rowsScrolls: (() => { const s = document.querySelector('#pack-review-rows .pack-batch-scroll'); return !!s && s.scrollWidth > s.clientWidth; })(),
      cardRight: r($('pack-review-card')).right,
      // 表の先頭行を他の行と同じ見た目にする（先頭のケース・組を「支配」のように強調しない）
      firstRowPlain: [...document.querySelectorAll('#pack-review-result tbody')].every((tb) => {
        const rows = [...tb.children];
        if (rows.length < 2) return true;
        const look = (tr) => { const c = getComputedStyle(tr.children[0]); return [c.color, c.fontWeight, getComputedStyle(tr).backgroundColor].join('|'); };
        return look(rows[0]) === look(rows[1]);
      })
    };
  }, width);
}

for (const [w, h] of [[1280, 800], [390, 844]]) {
  const { p, log: l } = await newPage({ width: w, height: h }, []);
  await paste(p, fixtureText('notification1458'));
  await runBatch(p);
  await addDetail(p, 'G002');
  await setCompare(p, 'G001', 'G003');
  await generate(p);
  await p.locator('#pack-review-section').scrollIntoViewIfNeeded();
  await p.evaluate(() => document.getElementById('pack-review-title').scrollIntoView());
  const L = await layout(p, w);
  const T = await p.evaluate(READ_TEXT);
  check('R27-' + w + '-trust-readable', readable(T.body) && T.body.fontSize === '12px' && readable(T.strong),
    `本文 ${T.body.ratio}:1 ${T.body.fontSize}・強調 ${T.strong.ratio}:1`);
  check('R33-' + w + '-summary-labels-readable', T.labels.length === 6 && T.labels.every(readable),
    `集計の見出し ${T.labels.map((x) => x.ratio + ':1').join(' / ')}（最大設計風圧・最小余裕比を含む 6 項目）`);
  if (w === 1280) {
    check('R33-1280-layout', L.docOverflow <= 0 && L.trustVisible && L.controlsInside && L.gen.bottom - L.trust.top < h &&
      L.summary.top < L.groups.top && L.groups.top < L.rows.top && L.tablesScroll && L.firstRowPlain,
    `overflow=${L.docOverflow} trust→button=${Math.round(L.gen.bottom - L.trust.top)}px（ボタンは信頼の文言と同じ画面）・表の先頭行を強調しない=${L.firstRowPlain}`);
  } else {
    check('R33-390-layout', L.docOverflow <= 0 && L.trustVisible && L.controlsInside && L.tablesScroll && L.rowsScrolls && L.cardRight <= w,
      `overflow=${L.docOverflow} 一覧は欄の中で横スクロール・信頼の文言は折りたたまない`);
  }
  check('R33-' + w + '-no-errors', l.errors.length === 0 && l.console.length === 0, `pageErrors=${l.errors.length}`);
  await p.close();
}

// R34: keyboard だけで詳細の追加・比較の選択・生成・詳細を開く。ARIA の役割と名前
{
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, [COUNT_REVIEW]);
  await paste(p, fixtureText('notification1458'));
  await runBatch(p);
  await p.focus('#pack-review-detail-input');
  await p.keyboard.type('G003');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(20);
  const chips = (await reviewState(p)).chips;
  await p.focus('#pack-review-compare-a');
  await p.keyboard.press('ArrowDown');
  await p.focus('#pack-review-compare-b');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Tab');
  const focused = await p.evaluate(() => document.activeElement && document.activeElement.id);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(50);
  const s = await reviewState(p);
  await p.focus('#pack-review-details > summary');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(20);
  const opened = await p.evaluate(() => document.getElementById('pack-review-details').open);
  check('R34-keyboard', same(chips, ['G003']) && focused === 'btn-pack-review' && s.shown && s.builds === 1 &&
    s.compareText.includes('A: G001 ／ B: G002') && opened,
  `Enter で追加・Tab で生成ボタン（${focused}）・Enter で生成・summary を開く`);
  const aria = await p.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    const labelFor = (id) => !!document.querySelector('label[for="' + id + '"]');
    return {
      section: $('pack-review-section').getAttribute('aria-labelledby') === 'pack-review-title',
      status: $('pack-review-status').getAttribute('role') === 'status' && $('pack-review-status').getAttribute('aria-live') === 'polite',
      count: $('pack-review-detail-count').getAttribute('role') === 'status',
      trust: $('pack-review-trust').getAttribute('role') === 'note',
      labels: ['pack-review-detail-input', 'pack-review-compare-a', 'pack-review-compare-b'].every(labelFor),
      group: document.querySelector('.pack-review-compare').getAttribute('role') === 'group',
      chipButtons: [...document.querySelectorAll('#pack-review-detail-list button')].every((b) => /^詳細の選択から外す: G\d+$/.test(b.getAttribute('aria-label') || '')),
      th: [...document.querySelectorAll('#pack-review-result th')].every((th) => th.getAttribute('scope') === 'col'),
      buttons: [...document.querySelectorAll('#pack-review-section button')].every((b) => b.type === 'button' && b.textContent.trim() !== '')
    };
  });
  check('R34-aria', Object.values(aria).every(Boolean), JSON.stringify(aria));
  check('R34-no-errors', l.errors.length === 0 && l.console.length === 0, `pageErrors=${l.errors.length}`);
  await p.close();
}

console.log(results.join('\n'));
await browser.close();

results.push(`  info J-2000  generate=${genMs}ms page-switch×2=${pageMs}ms (machine-dependent; not a threshold)`);
console.log(`  info J-2000  generate=${genMs}ms page-switch×2=${pageMs}ms (machine-dependent; not a threshold)`);
console.log(`\nproject-pack-review: ${pass} pass / ${fail} fail`);
finishRun('project-pack-review', pass + fail, fail, { playwrightSource,
  performance: { cases: 2000, generateMs: genMs, pageSwitchTwiceMs: pageMs, note: 'machine-dependent; recorded, not asserted' } });
