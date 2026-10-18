// Pack Review の出力 UI（Phase 2L-B2 / S3-B3B2-C1-B）を実ブラウザで確かめる。
//
// この harness は page の UI（貼り付け・全ケース計算・キャンセル・解除・詳細と比較の選択・Review の生成と消去・出力の
// 「Markdownを表示」「JSONを表示」「出力を消去」・ページと画面の切替）だけを操作して、出力の欄と page の状態を観測する。
// Pack の検証器・adapter・executor・batch・review・export の module を Node 側で読み込んだり呼んだりしない。期待値は
// page の外で作る: fixture の literal と、wind-pressure.js・calc.js を Node で直接呼んだ値（出力の表示からは作らない）。
// 多ケースの Pack は tests/support/synthetic-pack.js がその場で作る合成のもの。
//
// page の中の操作は、初期化 script で page 内の global への代入を包むこと（export の呼び出しを数える・失敗を注入する・
// 途中のケースの計算を失敗させる）と、page の state を差し替えること・試行の番号を進めることだけ（page の中だけの操作）。
//
// 確かめること（XE01–XE40 前後）:
//   生成      Review の生成まで押せない・自動では作らない・押したときだけ 1 回・出力は 1 つ（置き換え）
//   値        Markdown の表・JSON の行を oracle と照合（表示の桁は画面と同じ・JSON は全桁）、2 形式の一致、2000 ケース × 3 mode
//   鮮度      Review が消える 12 の経路で出力も消える・state の差し替え・失敗の固定文（Review・一括の結果・Pack は残す）
//   安全      信頼と共有の注意が常に見える・入力を HTML として扱わない・読み取り専用・保存・通信・ダウンロード・クリップボードなし
//   UI        1280×800・390×844・keyboard と ARIA・画面とページの切替で作り直さない
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const FIXTURE_DIR = REPO + 'tests/fixtures/project-pack/';

// 期待値の oracle（page の外・executor / batch / review / export を使わない）
const Wind = require(REPO + 'wind-pressure.js');
const Glass = require(REPO + 'calc.js');
const { syntheticPack } = require(REPO + 'tests/support/synthetic-pack.js');

const FIXTURES = {
  notification1458: 'synthetic-notification1458.json',
  project_pressure_map: 'synthetic-project-pressure-map.json',
  case_direct: 'synthetic-case-direct.json'
};
const MODES = Object.keys(FIXTURES);
const fixtureText = (mode) => fs.readFileSync(FIXTURE_DIR + FIXTURES[mode], 'utf8');
const fixture = (mode) => JSON.parse(fixtureText(mode));

const FAILURE = '出力を生成できませんでした。現在有効な出力はありません（Pack Review はそのままです）。';
const CLEARED = 'Pack Review が消えたので、出力も消しました。現在有効な出力はありません。';
const IDLE = '出力は、表示中の Pack Review から「Markdownを表示」「JSONを表示」を押したときだけ作ります。';
const USER_CLEARED = '出力を消去しました。現在有効な出力はありません。';
const SHOWN_TEXT = (label, n) => label + ' を表示しました（全 ' + n + ' ケース・未レビュー。計算済み ≠ 検証済み）。' +
  'コピーして共有する前に内容と共有先を確認してください。';
const TRUST_TEXTS = ['pack_unreviewed', 'calculated_not_verified', '計算済み ≠ 検証済み', 'OK は計算上の候補判定です。',
  'この出力は正式な案件承認の資料ではありません。'];
const SHARE_TEXT = 'この出力にはガラス寸法・設計風圧などの案件入力値が含まれます。外部へ共有する場合は、内容と共有先を確認してください。';
// 固定の注意 4 件（C1-A の契約・G0 HD-3。export module からは取らない）
const NOTICES = [
  '未レビュー：この出力は、未レビュー（pack_unreviewed）の Project Pack から計算した結果です。',
  '計算済み ≠ 検証済み：値は計算したもので、検証されたものではありません（calculated_not_verified）。',
  'OK は計算上の候補判定です。Evidence の確認・安全性の判定・承認ではありません。',
  '正式な案件承認の資料ではありません。値は案件の出典資料・メーカー資料と照合してください。'
];
const ENVELOPE_KEYS = ['exportType', 'exportSchemaVersion', 'sourceKind', 'trust', 'interpretation', 'notices', 'review'];
const DASH = '—';
const NO_CANDIDATE = DASH + '（推奨候補なし）';
const UNDECLARED = DASH + '（宣言なし）';
const PRESSURE_SOURCES = { notification1458: 'pack_notification_calculation', project_pressure_map: 'pack_pressure_map_lookup',
  case_direct: 'pack_case_direct' };
const MODE_FIELDS = { notification1458: ['evaluationHeightM', 'positivePressure', 'negativePressure'],
  project_pressure_map: ['positivePressure', 'negativePressureMagnitude'], case_direct: [] };

/* ---------- oracle（fixture の literal と wind-pressure.js・calc.js だけ） ---------- */

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
  const out = { caseId: c.caseId, paneId: c.paneId, glassType: c.glassType, widthMm: W, heightMm: H, pressureSource: PRESSURE_SOURCES[mode] };
  if (c.floor !== undefined) out.floor = c.floor;
  if (c.zone !== undefined) out.zone = c.zone;
  if (mode === 'notification1458') {
    const h = wc.evaluationHeights.find((e) => e.floor === c.floor).height.value;
    const w = windOf(wc, h, c.zone);
    Object.assign(out, { designPressure: w.designPressure, evaluationHeightM: h, positivePressure: w.positive.pressure,
      negativePressure: w.negative.pressure });
  } else if (mode === 'project_pressure_map') {
    const pos = wc.positivePressures.find((e) => e.floor === c.floor).pressure.value;
    const neg = wc.negativePressures.find((e) => e.zone === c.zone).magnitude.value;
    Object.assign(out, { designPressure: Math.max(pos, neg), positivePressure: pos, negativePressureMagnitude: neg });
  } else {
    out.designPressure = c.designPressure.value;
  }
  const all = Glass.generateCandidates(c.glassType, Glass.paneAreaM2(W, H), out.designPressure, c.extraFactor);
  const s = Glass.splitCandidates(all);
  const best = s.okCandidates[0] || null;
  Object.assign(out, { bestCandidate: best ? { label: best.label, P: best.P } : null, okCount: s.okCandidates.length,
    ngCount: s.ngCandidates.length, outOfScopeCount: s.outOfScopeCandidates.length,
    marginRatio: best ? best.P / out.designPressure : null, marginPressure: best ? best.P - out.designPressure : null });
  return out;
}
const oracleAll = (pack) => pack.glazingCases.map((_, i) => oracle(pack, i));

/** Markdown のケース一覧の 1 行に出るはずの値（表示の桁は画面と同じ: 風圧・余裕差 1 桁・余裕比 3 桁）。 */
function mdRow(o, mode) {
  const b = o.bestCandidate;
  return [o.caseId, o.paneId, o.floor !== undefined ? o.floor : UNDECLARED, o.zone !== undefined ? o.zone : UNDECLARED, o.glassType,
    String(o.widthMm), String(o.heightMm), o.designPressure.toFixed(1), o.pressureSource]
    .concat(MODE_FIELDS[mode].map((k) => (k === 'evaluationHeightM' ? String(o[k]) : o[k].toFixed(1))))
    .concat([b ? b.label : NO_CANDIDATE, b ? b.P.toFixed(1) : DASH, String(o.okCount), String(o.ngCount), String(o.outOfScopeCount),
      b ? o.marginRatio.toFixed(3) : DASH, b ? o.marginPressure.toFixed(1) : DASH]);
}
const close = (a, e) => (e === null ? a === null : typeof a === 'number' && Math.abs(a - e) <= 1e-12 * Math.max(1, Math.abs(e)));
/** JSON の review の行が oracle と一致するか（数値は Node と Chromium の V8 の最下位の差を許して相対 1e-12）。 */
function jsonRowMatches(r, o, mode) {
  if (!r || r.caseId !== o.caseId || r.paneId !== o.paneId || r.glassType !== o.glassType || r.widthMm !== o.widthMm ||
      r.heightMm !== o.heightMm || r.pressureSource !== o.pressureSource) return false;
  if (('floor' in r) !== ('floor' in o) || r.floor !== o.floor || ('zone' in r) !== ('zone' in o) || r.zone !== o.zone) return false;
  if (!close(r.designPressure, o.designPressure)) return false;
  if (!MODE_FIELDS[mode].every((k) => close(r[k], o[k]))) return false;
  if ((r.bestCandidate === null) !== (o.bestCandidate === null)) return false;
  if (o.bestCandidate && (r.bestCandidate.label !== o.bestCandidate.label || !close(r.bestCandidate.P, o.bestCandidate.P))) return false;
  return r.okCount === o.okCount && r.ngCount === o.ngCount && r.outOfScopeCount === o.outOfScopeCount &&
    close(r.marginRatio, o.marginRatio) && close(r.marginPressure, o.marginPressure);
}

/* ---------- Markdown を読む（harness の中だけの小さな parser） ---------- */

const decode = (cell) => cell.replace(/\\([!-/:-@[-`{-~])|⟨U\+([0-9A-F]{4,6})⟩/g,
  (m, p, h) => (p !== undefined ? p : String.fromCodePoint(parseInt(h, 16))));
function cellsOf(line) {
  const cells = [];
  let cur = '';
  for (let i = 1; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') { cur += ch + line[i + 1]; i += 1; continue; }
    if (ch === '|') { cells.push(cur.slice(1, -1)); cur = ''; continue; }
    cur += ch;
  }
  return cells;
}
/** 見出しの直後の表（行は decode 済み）。 */
function tableUnder(md, heading) {
  const lines = md.split('\n');
  const at = lines.indexOf(heading);
  if (at === -1) return null;
  let i = at + 1;
  while (i < lines.length && !lines[i].startsWith('| ')) i++;
  const headers = cellsOf(lines[i]).map(decode);
  const rows = [];
  for (let j = i + 2; j < lines.length && lines[j].startsWith('| '); j++) rows.push(cellsOf(lines[j]).map(decode));
  return { headers, rows };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('project-pack-review-export', () => ({ checksRun: pass + fail, failures: fail }));

const browser = await chromium.launch();

/** 保存・通信・URL・ダウンロード・クリップボードの呼び出しを数える（page を読み込む前に仕込む）。 */
const PROBE = () => {
  const calls = { storage: 0, cookie: 0, idb: 0, caches: 0, beacon: 0, fetch: 0, xhr: 0, history: 0, blob: 0, clipboard: 0, open: 0 };
  window.__exportProbe = calls;
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
 * ProjectPackReviewExport の global への代入を包み、toMarkdown / serializeJson の呼び出しを数える
 * （window.__failExport なら失敗させる）。値は本物の module がそのまま返す。
 */
const COUNT_EXPORT = () => {
  let wrapped;
  window.__exportCalls = { toMarkdown: 0, serializeJson: 0 };
  window.__failExport = false;
  window.__duringExport = null;
  Object.defineProperty(window, 'ProjectPackReviewExport', { configurable: true,
    get() { return wrapped; },
    set(real) {
      const wrap = (name) => function (r, b, c) {
        window.__exportCalls[name]++;
        if (window.__failExport) throw new Error('SECRET-EXPORT-ERROR /private/path <img src=x>');
        // 書き出しの最中に page の state を変える（確定の直前の確認を確かめるため。1 回だけ）
        if (typeof window.__duringExport === 'function') { const f = window.__duringExport; window.__duringExport = null; f(); }
        return real[name].call(real, r, b, c);
      };
      wrapped = Object.freeze(Object.assign({}, real, { toMarkdown: wrap('toMarkdown'), serializeJson: wrap('serializeJson') }));
    } });
};

/** ProjectPackExecution の global への代入を包み、window.__failCaseId のケースだけ計算を失敗させる。 */
const FAIL_CASE = () => {
  let wrapped;
  window.__failCaseId = null;
  Object.defineProperty(window, 'ProjectPackExecution', { configurable: true,
    get() { return wrapped; },
    set(real) {
      wrapped = Object.freeze(Object.assign({}, real, {
        executeCase: function (c, id) { if (id === window.__failCaseId) throw new Error('forced failure'); return real.executeCase.call(real, c, id); }
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

/** 押せるときだけ押す（押せないボタンを待ち続けて run を壊さない。押せなかったことは false で返し、check が明示的に失敗する）。 */
async function clickIf(p, selector) {
  const el = await p.$(selector);
  if (!el || await el.isDisabled() || !(await el.isVisible())) return false;
  await el.click();
  return true;
}

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
  await p.waitForFunction(batchSettled, null, { timeout: 180000, polling: 20 });
  await p.waitForTimeout(20);
}
async function waitMidRun(p) {
  await p.waitForFunction(() => {
    const m = /計算中… (\d+) \/ (\d+)/.exec(document.getElementById('pack-batch-status').textContent);
    return m && Number(m[1]) > 0 && Number(m[1]) < Number(m[2]);
  }, null, { timeout: 60000, polling: 5 });
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
async function generateReview(p) {
  await showView(p, 'pack');
  await clickIf(p, '#btn-pack-review');
  await p.waitForTimeout(30);
}
async function show(p, kind) {
  await showView(p, 'pack');
  const t = Date.now();
  const clicked = await clickIf(p, kind === 'md' ? '#btn-pack-review-export-md' : '#btn-pack-review-export-json');
  await p.waitForTimeout(20);
  return clicked ? Date.now() - t : -1;
}

/** 出力の欄の状態（読めない要素は空として返す。例外にしない）。 */
async function exportState(p) {
  return p.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    const out = $('pack-review-export-out');
    const trust = $('pack-review-export-trust');
    const share = $('pack-review-export-share');
    const visible = (el) => !!el && el.getClientRects().length > 0 && !el.closest('details:not([open])');
    return {
      md: $('btn-pack-review-export-md').disabled, json: $('btn-pack-review-export-json').disabled,
      clear: $('btn-pack-review-export-clear').disabled, outHidden: out.hidden, value: out.value, readOnly: out.readOnly,
      status: $('pack-review-export-status').textContent, statusError: $('pack-review-export-status').classList.contains('is-error'),
      hasOutput: window.projectPackReviewExportOutput !== null && window.projectPackReviewExportOutput !== undefined,
      calls: Object.assign({}, window.__exportCalls),
      trustText: trust ? trust.innerText : '', shareText: share ? share.innerText : '',
      notesVisible: visible(trust) && visible(share),
      hasReview: window.currentProjectPackReview !== null && window.currentProjectPackReview !== undefined,
      reviewShown: !$('pack-review-result').hidden && $('pack-review-result').children.length > 0,
      batch: !!window.stagedProjectPackBatch, packStaged: !!window.stagedProjectPackContext
    };
  });
}
const noOutput = (s) => !s.hasOutput && s.outHidden && s.value === '' && s.clear;

/** active ProjectContext と、それに依存する UI・計算結果の snapshot（単一ケースの画面で読み、Pack の画面へ戻る）。 */
async function activeSnapshot(p) {
  await showView(p, 'single');
  const snap = await p.evaluate(() => {
    const ctx = activeProjectContext;
    const text = (id) => { const el = document.getElementById(id); return el ? el.innerText : null; };
    return { sourceKind: ctx && ctx.sourceKind, trust: ctx && ctx.trust, publicLabel: ctx && ctx.publicLabel,
      mode: document.getElementById('inp-mode').value, w: document.getElementById('inp-W').value,
      h: document.getElementById('inp-H').value, result: text('result-area') };
  });
  await showView(p, 'pack');
  return snap;
}

/** Pack を読み込み、全ケース計算・（選んだ詳細と比較つきの）Review の生成まで進める。 */
async function readyReview(p, text, opts) {
  await paste(p, text);
  await runBatch(p);
  for (const id of (opts && opts.details) || []) await addDetail(p, id);
  if (opts && opts.compare) await setCompare(p, opts.compare[0], opts.compare[1]);
  await generateReview(p);
}

/* ============================================================
   main page（1280×800）: 生成・値・置き換え
============================================================ */

const { p: page, log } = await newPage({ width: 1280, height: 800 }, [PROBE, COUNT_EXPORT]);
const ACTIVE0 = await activeSnapshot(page);
await showView(page, 'pack');
const s0 = await exportState(page);
check('XE01-initial', s0.md && s0.json && s0.clear && s0.outHidden && s0.value === '' && s0.status === IDLE && s0.calls.toMarkdown === 0 &&
  s0.calls.serializeJson === 0, 'ボタンは押せず、出力は無い');
check('XE02-notes-always-visible', s0.notesVisible && TRUST_TEXTS.every((t) => s0.trustText.replace(/\s+/g, '').includes(t.replace(/\s+/g, ''))) &&
  s0.shareText.includes(SHARE_TEXT), '信頼と共有の注意は最初から見える（折りたたまない）');

const NOTIF = fixture('notification1458');
const NOTIF_O = oracleAll(NOTIF);
await paste(page, fixtureText('notification1458'));
await runBatch(page);
const s1 = await exportState(page);
check('XE03-not-before-review', s1.md && s1.json && s1.calls.toMarkdown === 0 && s1.batch, '全ケース計算の後でも Review が無ければ押せない');
await addDetail(page, 'G002');
await setCompare(page, 'G001', 'G003');
await generateReview(page);
const s2 = await exportState(page);
check('XE04-ready-no-auto', !s2.md && !s2.json && s2.clear && s2.outHidden && s2.calls.toMarkdown === 0 && s2.calls.serializeJson === 0 && s2.hasReview,
  'Review の生成で押せるようになるが、自動では作らない');

await show(page, 'md');
const s3 = await exportState(page);
check('XE05-markdown-once', !s3.outHidden && s3.value.startsWith('# Pack Review（未レビュー）\n') && s3.calls.toMarkdown === 1 &&
  s3.calls.serializeJson === 0 && s3.status === SHOWN_TEXT('Markdown', 3) && !s3.statusError && !s3.clear,
  `押したときだけ 1 回（toMarkdown=${s3.calls.toMarkdown}）`);
const md = s3.value;
const mdLines = md.split('\n');
check('XE06-markdown-trust-notices', mdLines[2] === '> **未レビュー**（`pack_unreviewed`）・**計算済み ≠ 検証済み**（`calculated_not_verified`）' &&
  NOTICES.every((n, i) => decode(mdLines[4 + i].slice(4)) === n) && mdLines[11].startsWith('数値の表示：') &&
  mdLines[mdLines.length - 2].startsWith('> **未レビュー**'), '冒頭と末尾の trust・固定の注意 4 件・丸めの注記');
const mdRows = tableUnder(md, '## ケース一覧（全 3 ケース）');
check('XE07-markdown-rows-oracle', !!mdRows && mdRows.rows.length === 3 && NOTIF_O.every((o, i) => same(mdRows.rows[i], mdRow(o, 'notification1458'))),
  'ケース一覧の全行が oracle（fixture・wind-pressure.js・calc.js）の表示の桁と一致');
const mdDetail = tableUnder(md, '### 詳細 1：ケース G002');
const g2 = NOTIF_O[1];
check('XE08-markdown-detail-compare', !!mdDetail && same(mdDetail.rows.find((r) => r[0].startsWith('設計風圧')).slice(1), [g2.designPressure.toFixed(1)]) &&
  same(mdDetail.rows.find((r) => r[0] === '余裕比').slice(1), [g2.marginRatio.toFixed(3)]) &&
  md.includes('A: G001 ／ B: G003。差は B − A です。') &&
  same(tableUnder(md, '## 2 ケースの比較').rows.find((r) => r[0].startsWith('設計風圧')).slice(1),
    [NOTIF_O[0].designPressure.toFixed(1), NOTIF_O[2].designPressure.toFixed(1),
      ((d) => (d > 0 ? '+' : '') + d.toFixed(1))(NOTIF_O[2].designPressure - NOTIF_O[0].designPressure)]),
  'G002 の詳細と G001 / G003 の比較（差は B − A・正なら +）');

await show(page, 'json');
const s4 = await exportState(page);
let parsed = null;
try { parsed = JSON.parse(s4.value); } catch (e) { parsed = null; }
check('XE09-json-replaces', !!parsed && !s4.value.includes('# Pack Review') && s4.calls.toMarkdown === 1 && s4.calls.serializeJson === 1 &&
  s4.status === SHOWN_TEXT('JSON', 3) && (await page.locator('#pack-review-export-section textarea').count()) === 1,
'JSON が Markdown を完全に置き換える（出力は 1 つ）');
check('XE10-json-envelope', !!parsed && same(Object.keys(parsed), ENVELOPE_KEYS) && parsed.exportType === 'glass_wind_pack_review_export' &&
  parsed.exportSchemaVersion === 1 && parsed.trust === 'pack_unreviewed' && parsed.interpretation === 'calculated_not_verified' &&
  same(parsed.notices, NOTICES) && parsed.review.trust === 'pack_unreviewed',
'外枠 7 key・exportSchemaVersion 1・固定の notices 4 件・trust 固定');
check('XE11-json-rows-oracle', !!parsed && parsed.review.rows.length === 3 &&
  NOTIF_O.every((o, i) => jsonRowMatches(parsed.review.rows[i], o, 'notification1458')) &&
  parsed.review.selectedDetails.length === 1 && parsed.review.selectedDetails[0].caseId === 'G002' &&
  same(parsed.review.comparison.caseIds, ['G001', 'G003']),
'JSON の全行が oracle と一致（全桁・相対 1e-12）・詳細と比較');
check('XE12-markdown-json-consistent', !!parsed && parsed.review.rows.every((r, i) => mdRows.rows[i][7] === r.designPressure.toFixed(1) &&
  mdRows.rows[i][17] === (r.marginRatio === null ? DASH : r.marginRatio.toFixed(3))),
'Markdown の表示は同じ page の JSON の全桁を画面の桁に丸めたもの');
await show(page, 'md');
const s5 = await exportState(page);
check('XE13-markdown-again-same', s5.value === md && s5.calls.toMarkdown === 2, '押し直すと同じ文字列（決定的）');

// 読み取り専用（利用者がコピーするだけ。入力しても変わらない）
await page.focus('#pack-review-export-out');
await page.keyboard.type('EDIT');
await page.waitForTimeout(10);
const s6 = await exportState(page);
check('XE14-readonly', s6.readOnly && s6.value === md, '読み取り専用（入力しても出力は変わらない）');

// 画面・ページの切替と Report の消去では作り直さない・消さない
await showView(page, 'single');
await showView(page, 'batch');
await showView(page, 'pack');
await clickIf(page, '#btn-pack-report-json');
await clickIf(page, '#btn-pack-report-clear');
const s7 = await exportState(page);
check('XE15-view-switch-keeps', s7.value === md && s7.calls.toMarkdown === 2 && s7.calls.serializeJson === 1 && !s7.outHidden,
  '画面の切替・Report の生成と消去で作り直さない・消さない');

// 失敗の注入: 出力だけが消え、Review・一括の結果・Pack は残る（固定文・例外の文面を出さない）
await page.evaluate(() => { window.__failExport = true; });
await show(page, 'json');
const s8 = await exportState(page);
await page.evaluate(() => { window.__failExport = false; });
check('XE16-failure-fixed-text', noOutput(s8) && s8.status === FAILURE && s8.statusError && !/SECRET|private|<img/.test(s8.status) &&
  s8.hasReview && s8.reviewShown && s8.batch && s8.packStaged && !s8.md,
'失敗は固定文で出力だけを消す（Review・一括の結果・Pack は残り、もう一度押せる）');
// Review が残っていなければ（XE16 が失敗として記録した）、以後の確認のために生成し直す（run を壊さずに続ける）
if (!s8.hasReview) await generateReview(page);

// state の差し替え（発行物でない review・古い試行）: module を呼ばずに失敗する
const callsBefore = (await exportState(page)).calls;
await page.evaluate(() => { window.__savedState = currentProjectPackReview;
  currentProjectPackReview = Object.assign({}, currentProjectPackReview, { review: JSON.parse(JSON.stringify(currentProjectPackReview.review)) }); });
await show(page, 'md');
const s9 = await exportState(page);
// 本物の state に戻してボタンを押せる状態にしてから、古い試行の state へ差し替える（ボタンは押せたまま）
await page.evaluate(() => { currentProjectPackReview = window.__savedState; renderProjectPackReviewExportControls();
  currentProjectPackReview = Object.assign({}, window.__savedState, { attempt: window.__savedState.attempt - 1 }); });
await show(page, 'json');
const s10 = await exportState(page);
await page.evaluate(() => { currentProjectPackReview = window.__savedState; });
check('XE17-forged-state-refused', noOutput(s9) && noOutput(s10) && s9.status === FAILURE && s10.status === FAILURE &&
  same(s10.calls, callsBefore), '発行物でない review・古い試行の state からは作らない（module を呼ばない）');

// state の batch を JSON の複製にした（既存の鮮度の確認が拒む。module を呼ばない）
await page.evaluate(() => { renderProjectPackReviewExportControls();
  currentProjectPackReview = Object.assign({}, window.__savedState, { batch: JSON.parse(JSON.stringify(window.__savedState.batch)) }); });
await show(page, 'md');
const s10b = await exportState(page);
await page.evaluate(() => { currentProjectPackReview = window.__savedState; renderProjectPackReviewExportControls(); });
check('XE45-batch-copy-refused', noOutput(s10b) && s10b.status === FAILURE && same(s10b.calls, callsBefore),
  'state の batch が現在の一括結果でなければ、module を呼ばずに拒む（staged を直接読まず、state と既存の鮮度の確認で決める）');

// 書き出しの最中に変わった: 試行が進む / 表示中の state が同じ内容の別の object に置き換わる → 確定の直前に拒む
await page.evaluate(() => { window.__duringExport = () => { projectPackAttempt += 1; }; });
await show(page, 'md');
const s10c = await exportState(page);
await page.evaluate(() => { projectPackAttempt -= 1; renderProjectPackReviewExportControls();
  window.__duringExport = () => { currentProjectPackReview = Object.assign({}, currentProjectPackReview); }; });
await show(page, 'json');
const s10d = await exportState(page);
await page.evaluate(() => { currentProjectPackReview = window.__savedState; renderProjectPackReviewExportControls(); });
check('XE46-changed-during-export', noOutput(s10c) && noOutput(s10d) && s10c.status === FAILURE && s10d.status === FAILURE &&
  s10d.calls.toMarkdown === callsBefore.toMarkdown + 1 && s10d.calls.serializeJson === callsBefore.serializeJson + 1 && s10d.hasReview,
'module が書き出している間に試行が進んだ・表示中の state が別の object になったら、確定の直前に拒む（Review は残す）');

// change の event なしに比較の選択が変わった（一致しない選択の Review からは作らない）
await page.evaluate(() => { document.getElementById('pack-review-compare-a').value = 'G002'; });
await show(page, 'md');
const s10e = await exportState(page);
await page.evaluate(() => { document.getElementById('pack-review-compare-a').value = 'G001'; renderProjectPackReviewExportControls(); });
check('XE47-selection-mismatch-refused', noOutput(s10e) && s10e.status === FAILURE && s10e.calls.toMarkdown === callsBefore.toMarkdown + 1,
  '選択が Review と一致しなければ module を呼ばずに拒む');

// 初期化の後に global を差し替えても使わない（初期化時に 1 度だけ掴んだ module で作る）
await page.evaluate(() => { window.ProjectPackReviewExport = { toMarkdown: () => 'DECOY', serializeJson: () => 'DECOY' }; });
await show(page, 'md');
const s10f = await exportState(page);
check('XE48-late-global-ignored', s10f.value === md && s10f.calls.toMarkdown === callsBefore.toMarkdown + 2,
  '初期化の後に置いた global は使わない（出力は本物の module のもの）');

// 入力を HTML / Markdown の記法として扱わない（Pack の検証を通る敵対的な publicLabel）
const ATTACK = '[x](javascript:alert(1)) ![i](x) **b** | a';
const attackPack = fixture('case_direct');
attackPack.projectMetadata.publicLabel = ATTACK;
await readyReview(page, JSON.stringify(attackPack));
await show(page, 'md');
const s11 = await exportState(page);
const infoLabel = (tableUnder(s11.value, '## 出力の情報') || { rows: [] }).rows.find((r) => r[0] === '公開表示名');
const elems = await page.evaluate(() => document.querySelectorAll('#pack-review-export-section img, #pack-review-export-section a, #pack-review-export-section strong').length);
check('XE18-input-not-markup', !!infoLabel && infoLabel[1] === ATTACK &&
  s11.value.includes('| 公開表示名 | \\[x\\]\\(javascript\\:alert\\(1\\)\\) \\!\\[i\\]\\(x\\) \\*\\*b\\*\\* \\| a |') && elems === 1,
'publicLabel は escape した文字列として 1 つのセルに入り、page に要素を作らない（strong は信頼の文言の 1 つだけ）');

/* ============================================================
   Review が消える 12 の経路で出力も消える
============================================================ */

const SMALL = fixtureText('project_pressure_map');
const MID = JSON.stringify(syntheticPack(120, 'project_pressure_map', { label: 'Synthetic Export Paging' }));
const BIG_RUN = JSON.stringify(syntheticPack(2000, 'project_pressure_map', { label: 'Synthetic Export Run' }));
async function clearPath(id, label, setupText, act) {
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, [PROBE, COUNT_EXPORT, FAIL_CASE]);
  await readyReview(p, setupText, { details: ['G001'] });
  await show(p, 'md');
  const before = await exportState(p);
  await act(p);
  await p.waitForTimeout(30);
  const after = await exportState(p);
  check(id, !before.outHidden && before.value !== '' && noOutput(after) && !after.hasReview && after.md && after.json &&
    after.status === CLEARED && !after.statusError && l.errors.length === 0,
  label + `（status=${after.status === CLEARED ? '出力も消しました' : after.status}）`);
  await p.close();
}
await clearPath('XE19-E01-new-pack', '新しい Pack の読込', SMALL, (p) => paste(p, fixtureText('case_direct')));
await clearPath('XE20-E02-invalid-pack', '読込の失敗', SMALL, (p) => paste(p, '{ not json'));
await clearPath('XE21-E03-unload', 'Pack の解除', SMALL, (p) => clickIf(p, '#btn-pack-unload'));
await clearPath('XE22-E04-new-batch', '新しい全ケース計算', SMALL, (p) => clickIf(p, '#btn-pack-batch'));
await clearPath('XE23-E05-cancel', '計算のキャンセル', BIG_RUN, async (p) => { await clickIf(p, '#btn-pack-batch'); await waitMidRun(p); await clickIf(p, '#btn-pack-batch-cancel'); });
await clearPath('XE24-E06-batch-failure', '計算の失敗', BIG_RUN, async (p) => {
  await p.evaluate(() => { window.__failCaseId = 'G1500'; });
  await clickIf(p, '#btn-pack-batch');
  await p.waitForFunction(() => /完了できません/.test(document.getElementById('pack-batch-status').textContent), null, { timeout: 120000, polling: 20 });
});
await clearPath('XE25-E07-abandoned', 'Pack の変化による計算の中止', BIG_RUN, async (p) => {
  await clickIf(p, '#btn-pack-batch'); await waitMidRun(p); await paste(p, fixtureText('notification1458')); await p.waitForTimeout(100);
});
await clearPath('XE26-E08-selection', '詳細・比較の選択の変更', SMALL, (p) => setCompare(p, 'G001', 'G002'));
await clearPath('XE27-E10-review-failure', 'Review の生成の失敗', SMALL, async (p) => {
  await p.selectOption('#pack-review-compare-a', 'G001'); await clickIf(p, '#btn-pack-review'); await p.waitForTimeout(20);
});
await clearPath('XE28-E11-review-clear', 'Review の消去', SMALL, (p) => clickIf(p, '#btn-pack-review-clear'));
await clearPath('XE29-E12-page-stale', 'ページの切替で古いと分かった', MID, async (p) => {
  await p.evaluate(() => { projectPackAttempt += 1; });
  await clickIf(p, '#pack-review-rows button:nth-of-type(2)');
});
// E09: Review の生成し直し（前の Review から作った出力は消え、新しい Review では押すまで作らない）
{
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, [PROBE, COUNT_EXPORT]);
  await readyReview(p, SMALL, { details: ['G001'] });
  await show(p, 'json');
  await generateReview(p);
  const after = await exportState(p);
  check('XE30-E09-regenerate', noOutput(after) && after.hasReview && !after.md && after.status === CLEARED && after.calls.serializeJson === 1 &&
    l.errors.length === 0, '生成し直すと前の出力は消え、新しい Review からは押したときだけ作る');
  // 利用者の消去は出力だけを消す
  await show(p, 'md');
  await clickIf(p, '#btn-pack-review-export-clear');
  const cleared = await exportState(p);
  check('XE31-user-clear-output-only', noOutput(cleared) && cleared.status === USER_CLEARED && cleared.hasReview && cleared.reviewShown && !cleared.md,
    '「出力を消去」は出力だけを消す（Review は残る）');
  // ページの切替（現在の Review）では作り直さない・消さない
  await p.close();
}
{
  const { p } = await newPage({ width: 1280, height: 800 }, [PROBE, COUNT_EXPORT]);
  await readyReview(p, MID);
  await show(p, 'md');
  const before = await exportState(p);
  await clickIf(p, '#pack-review-rows button:nth-of-type(2)');
  await clickIf(p, '#pack-review-rows button:nth-of-type(1)');
  const after = await exportState(p);
  check('XE32-page-switch-keeps', after.value === before.value && after.calls.toMarkdown === 1 && !after.outHidden,
    'Review の一覧のページ切替で出力を作り直さない・消さない');
  await p.close();
}

/* ============================================================
   2000 ケース × 3 mode × 2 形式（欠落 0）
============================================================ */

const perf = {};
for (const mode of MODES) {
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, [COUNT_EXPORT]);
  const pack = syntheticPack(2000, mode, { label: 'Synthetic Export ' + mode });
  const O = oracleAll(pack);
  await readyReview(p, JSON.stringify(pack), { compare: ['G0001', 'G2000'] });
  const mdMs = await show(p, 'md');
  const sm = await exportState(p);
  const table = tableUnder(sm.value, '## ケース一覧（全 2000 ケース）');
  check('XE33-2000-' + mode + '-markdown', !!table && table.rows.length === 2000 && O.every((o, i) => same(table.rows[i], mdRow(o, mode))) &&
    !sm.outHidden, `Markdown の全 2000 行が oracle と一致（欠落 0・${new TextEncoder().encode(sm.value).length} bytes）`);
  const jsonMs = await show(p, 'json');
  const sj = await exportState(p);
  let pj = null;
  try { pj = JSON.parse(sj.value); } catch (e) { pj = null; }
  check('XE34-2000-' + mode + '-json', !!pj && pj.review.rows.length === 2000 && O.every((o, i) => jsonRowMatches(pj.review.rows[i], o, mode)) &&
    pj.review.comparison.caseIds[1] === 'G2000', `JSON の全 2000 行が oracle と一致（全桁・${new TextEncoder().encode(sj.value).length} bytes）`);
  check('XE35-2000-' + mode + '-no-errors', l.errors.length === 0 && l.console.length === 0, `pageErrors=${l.errors.length}`);
  perf[mode] = { markdownClickMs: mdMs, jsonClickMs: jsonMs, markdownBytes: new TextEncoder().encode(sm.value).length,
    jsonBytes: new TextEncoder().encode(sj.value).length };
  await p.close();
}

/* ============================================================
   副作用と active context
============================================================ */

const probe = await page.evaluate(() => window.__exportProbe);
const ACTIVE1 = await activeSnapshot(page);
check('XE36-no-side-effects', Object.values(probe).every((n) => n === 0) && log.requests.length === 0 && log.downloads.length === 0 &&
  page.url() === FILE, `保存・通信・URL・ダウンロード・クリップボード 0（${JSON.stringify(probe)}）`);
check('XE37-active-context-unchanged', same(ACTIVE0, ACTIVE1), 'active ProjectContext・単一ケースの入力と結果は変わらない');
check('XE38-no-console', log.errors.length === 0 && log.console.length === 0, `pageErrors=${log.errors.length} console=${log.console.length}`);
await page.close();

/* ============================================================
   1280×800・390×844・keyboard と ARIA
============================================================ */

const READ_TRUST = () => {
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
  const trust = document.getElementById('pack-review-export-trust');
  return { body: read(trust), strong: read(trust && trust.querySelector('strong')) };
};

for (const [w, h] of [[1280, 800], [390, 844]]) {
  const { p, log: l } = await newPage({ width: w, height: h }, []);
  await readyReview(p, fixtureText('notification1458'), { details: ['G002'], compare: ['G001', 'G003'] });
  await show(p, 'md');
  await p.evaluate(() => document.getElementById('pack-review-export-title').scrollIntoView());
  const L = await p.evaluate((vw) => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect();
    const sec = rect('pack-review-export-section');
    const out = rect('pack-review-export-out');
    const review = document.getElementById('pack-review-section').getBoundingClientRect();
    const btns = ['btn-pack-review-export-md', 'btn-pack-review-export-json', 'btn-pack-review-export-clear'].map(rect);
    return { docOverflow: document.documentElement.scrollWidth - vw, sectionRight: sec.right, outRight: out.right, outWidth: out.width,
      below: review.bottom <= sec.top + 1, inView: !!document.getElementById('pack-review-export-section').closest('#view-pack'),
      buttonsInside: btns.every((b) => b.right <= sec.right + 1 && b.width > 0 && b.height >= 24) };
  }, w);
  const T = await p.evaluate(READ_TRUST);
  check('XE39-' + w + '-layout', L.docOverflow <= 0 && L.sectionRight <= w && L.outRight <= w && L.outWidth > 0 && L.below && L.inView && L.buttonsInside,
    `overflow=${L.docOverflow} 出力の欄の右端=${Math.round(L.outRight)}px・Review の下・#view-pack の中`);
  check('XE40-' + w + '-trust-readable', T.body.ratio >= 4.5 && T.body.fontSize === '12px' && T.strong.ratio >= 4.5,
    `本文 ${T.body.ratio}:1 ${T.body.fontSize}・強調 ${T.strong.ratio}:1`);
  check('XE41-' + w + '-no-errors', l.errors.length === 0 && l.console.length === 0, `pageErrors=${l.errors.length}`);
  await p.close();
}

{
  const { p, log: l } = await newPage({ width: 1280, height: 800 }, [COUNT_EXPORT]);
  await readyReview(p, fixtureText('case_direct'));
  await p.focus('#btn-pack-review-clear');
  await p.keyboard.press('Tab');
  const focused = await p.evaluate(() => document.activeElement && document.activeElement.id);
  if (await p.$('#btn-pack-review-export-md:not([disabled])')) await p.focus('#btn-pack-review-export-md');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(20);
  await p.keyboard.press('Tab');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(20);
  const s = await exportState(p);
  check('XE42-keyboard', s.calls.toMarkdown === 1 && s.calls.serializeJson === 1 && s.value.startsWith('{\n') && focused !== null,
    `Enter で Markdown・Tab で JSON のボタン・Enter で JSON（tab の次=${focused}）`);
  const aria = await p.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    return {
      section: $('pack-review-export-section').getAttribute('aria-labelledby') === 'pack-review-export-title',
      status: $('pack-review-export-status').getAttribute('role') === 'status' && $('pack-review-export-status').getAttribute('aria-live') === 'polite',
      trust: $('pack-review-export-trust').getAttribute('role') === 'note',
      out: $('pack-review-export-out').getAttribute('aria-label') === 'Pack Review の出力（読み取り専用）' && $('pack-review-export-out').readOnly,
      buttons: [...document.querySelectorAll('#pack-review-export-section button')].every((b) => b.type === 'button' && b.textContent.trim() !== '')
    };
  });
  check('XE43-aria', Object.values(aria).every(Boolean), JSON.stringify(aria));
  check('XE44-no-errors', l.errors.length === 0 && l.console.length === 0, `pageErrors=${l.errors.length}`);
  await p.close();
}

console.log(results.join('\n'));
await browser.close();

const env = `node ${process.version} / ${os.platform()} ${os.arch()} / ${(os.cpus()[0] || { model: 'unknown' }).model} / ${os.cpus().length} cpus / Playwright ${playwrightSource}`;
for (const [mode, v] of Object.entries(perf)) {
  const line = `  info J-2000 ${mode}  markdown click=${v.markdownClickMs}ms ${v.markdownBytes} bytes / json click=${v.jsonClickMs}ms ${v.jsonBytes} bytes (machine-dependent; not a threshold)`;
  results.push(line);
  console.log(line);
}
console.log(`  info environment  ${env}`);
console.log(`\nproject-pack-review-export: ${pass} pass / ${fail} fail`);
finishRun('project-pack-review-export', pass + fail, fail, { playwrightSource,
  performance: { cases: 2000, perMode: perf, environment: env, note: 'click-to-settled times include a fixed 20 ms wait; machine-dependent; recorded, not asserted' } });
