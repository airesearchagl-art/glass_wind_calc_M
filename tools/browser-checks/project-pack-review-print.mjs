// Pack Review の印刷・PDF（S3-B3B2-C2）を実ブラウザと実際の PDF で確かめる。
//
// 実行: xvfb-run -a -s '-screen 0 1280x1024x24' node tools/browser-checks/project-pack-review-print.mjs
//       （PACK_PRINT_MATRIX=full で、2000 ケース × 3 mode × 詳細 0 / 50 × 比較なし / ありの 12 組を加える。ローカル用）
//
// 経路を区別して記録する（Task Packet §8・§8.1）:
//   [native]   ヘッド付きの Chromium（仮想ディスプレイ）・使い捨ての profile・--kiosk-printing・送信先「PDF に保存」（sticky
//              設定・隔離した出力 directory・ヘッダーとフッター OFF）。実際の UI のボタン → 製品の window.print() → 保存された
//              PDF を Poppler（pdfinfo・pdftotext -layout・pdftoppm）で直接読む。許可された Pack PDF の証拠はこの経路だけ。
//              要求とのひも付けは (a) 要求ごとの合成の publicLabel が本文に 1 回だけ (b) PDF ファイルの作成時刻が window.print()
//              の呼び出し〜戻りの間 (c) 同じ実行の event の列が D-2 の正常終了、の 3 点。素の Ctrl+P は仮想ディスプレイの XTest
//              で送る実際のキー入力。file: 以外の通信は遮断する。
//   [inject]   init script の window.print の包み（ネイティブの呼び出しの前後に合成の event を足す・例外にする）と、page の
//              global の差し替え。状態遷移の検査で、ネイティブの event の証拠ではない（出力は同じ実行のネイティブ PDF で見る）。
//   [stub]     ヘッドレスの page で window.print をネイティブを呼ばない包みに替え、event の列を合成する。print の CSS を
//              emulateMedia('print') で当てて、body 直下のどの要素が印刷に出るかを getComputedStyle で読む。PDF は作らない。
//   [page.pdf] Page.printToPDF（window.print() の同期区間の外の beforeprint）。拒否文・案内文・Workspace の資料など、
//              許可でない出力の検査だけに使う。許可された Pack を出せないことを直接確かめる。
//
// ネイティブの経路（仮想ディスプレイ・ヘッド付きの Chromium・Poppler・XTest）が使えなければ、何も測らずに UNVERIFIED
// （exit 3）で終わる。PASS にはしない。page の外の期待値は、fixture の literal と tests/support/synthetic-pack.js の合成の
// Pack と、印刷の model の契約（Node の test が C1-A と照合したもの）の固定の文面だけ。保存した PDF・画像は一時 directory
// に置き、終わったら消す（PACK_PRINT_EVIDENCE_DIR を指定したときだけ、合成の PDF の数ページを低解像度の PNG で書き出す）。
// headed Chrome / Edge の実ダイアログ（保存・キャンセル・非同期の印刷・ヘッダーとフッター）は手動の確認項目（U-7）で、
// この harness では確かめない。
import { openBrowser, finishRun } from './harness.mjs';
import { classifyBrowserRun } from './browser-outcome.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const INSTRUMENT = 'project-pack-review-print';
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const FIXTURE_DIR = REPO + 'tests/fixtures/project-pack/';
const { syntheticPack } = require(REPO + 'tests/support/synthetic-pack.js');
const MATRIX = process.env.PACK_PRINT_MATRIX === 'full';
const EVIDENCE_DIR = process.env.PACK_PRINT_EVIDENCE_DIR || null;

const FIXTURES = {
  notification1458: 'synthetic-notification1458.json',
  project_pressure_map: 'synthetic-project-pressure-map.json',
  case_direct: 'synthetic-case-direct.json'
};
const MODES = Object.keys(FIXTURES);
const fixtureText = (mode) => fs.readFileSync(FIXTURE_DIR + FIXTURES[mode], 'utf8');
const fixture = (mode) => JSON.parse(fixtureText(mode));

// 固定の文面（index.html と印刷の model の契約。page からは取らない）
const IDLE_TEXT = '印刷用の資料は、表示中の Pack Review から「Pack Reviewを印刷」を押したときだけ作ります。';
const NOT_READY = '印刷できる Pack Review がありません（現在の全ケース計算と選択から生成した Review だけを印刷します）。印刷は開始していません。';
const FAILURE = '印刷用の資料を作れませんでした。印刷は開始していません（Pack Review はそのままです）。';
const REFUSED_HEAD = '印刷の時点で、印刷用の資料が現在の Pack Review と一致することを確認できなかったため';
const DENIED_HEAD = '印刷画面の開始と終了を確認できなかったため、Pack Review の印刷を止めました。';
const REQUESTED = (n) => '印刷画面を要求しました（全 ' + n + ' ケース・未レビュー。計算済み ≠ 検証済み）。';
const TITLE = 'Pack Review（未レビュー）';
const FOOTER = 'pack_unreviewed ／ calculated_not_verified — 未レビュー・計算済み ≠ 検証済み・正式な案件承認の資料ではありません';
const NOTICES = [
  '未レビュー：この出力は、未レビュー（pack_unreviewed）の Project Pack から計算した結果です。',
  '計算済み ≠ 検証済み：値は計算したもので、検証されたものではありません（calculated_not_verified）。',
  'OK は計算上の候補判定です。Evidence の確認・安全性の判定・承認ではありません。',
  '正式な案件承認の資料ではありません。値は案件の出典資料・メーカー資料と照合してください。'
];
const BLOCKED_HEAD = 'この Pack Review は印刷できません。';
const BLOCKED_RELOAD = 'このページの印刷を止めています（Workspace の資料も印刷しません）';
const HINT_HEAD = 'Pack Review は、Project Pack 画面の「Pack Reviewを印刷」ボタンから印刷してください。';
const APP_HEADER = 'ガラス耐風圧 簡易検討ツール';
const TAB_LABELS = ['複数ケース（Workspace）', 'Project Pack（未レビュー）'];
const WS_BLOCKED = 'このReportは印刷できません。';
const BIDI_RAW = /[‎‏‪-‮⁦-⁩؜]/;

/* ---------- 前提: ネイティブの経路に要るもの ---------- */

const have = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return r.status === 0 ? ((r.stdout || '') + (r.stderr || '')).trim() : null; };
const XKEY_PY = [
  'import ctypes, sys, time',
  "x11 = ctypes.CDLL('libX11.so.6'); xtst = ctypes.CDLL('libXtst.so.6')",
  'x11.XOpenDisplay.restype = ctypes.c_void_p; x11.XOpenDisplay.argtypes = [ctypes.c_char_p]',
  'x11.XStringToKeysym.restype = ctypes.c_ulong; x11.XStringToKeysym.argtypes = [ctypes.c_char_p]',
  'x11.XKeysymToKeycode.restype = ctypes.c_ubyte; x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]',
  'x11.XFlush.argtypes = [ctypes.c_void_p]; x11.XCloseDisplay.argtypes = [ctypes.c_void_p]',
  'xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]',
  'xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]',
  'if len(sys.argv) > 1 and sys.argv[1] == "check":',
  '    sys.exit(0)',
  'd = x11.XOpenDisplay(None)',
  'if not d: sys.exit(2)',
  'xtst.XTestFakeMotionEvent(d, -1, 640, 400, 0); x11.XFlush(d); time.sleep(0.2)',
  "ctrl = x11.XKeysymToKeycode(d, x11.XStringToKeysym(b'Control_L')); key = x11.XKeysymToKeycode(d, x11.XStringToKeysym(b'p'))",
  'for code, down in ((ctrl, 1), (key, 1), (key, 0), (ctrl, 0)):',
  '    xtst.XTestFakeKeyEvent(d, code, down, 0); x11.XFlush(d); time.sleep(0.05)',
  'x11.XCloseDisplay(d)'
].join('\n');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'c2-print-'));
const XKEY = path.join(TMP, 'xkey.py');
fs.writeFileSync(XKEY, XKEY_PY);
const env = {
  display: process.env.DISPLAY ? 'set' : null,
  pdfinfo: have('pdfinfo', ['-v']), pdftotext: have('pdftotext', ['-v']), pdftoppm: have('pdftoppm', ['-v']),
  xtest: have('python3', [XKEY, 'check']) !== null ? 'python3 ctypes libXtst.so.6' : null
};
const missing = Object.entries(env).filter(([, v]) => v === null).map(([k]) => k);
if (missing.length > 0) {
  // ネイティブの経路が無ければ、許可された Pack PDF を確かめられない。何も測らずに UNVERIFIED（PASS にしない）
  const verdict = classifyBrowserRun({ browserAvailable: false, checksRun: 0, failures: 0 });
  console.error('native print route unavailable: missing ' + missing.join(', ') +
    ' (needs a virtual display such as xvfb-run, Poppler pdfinfo / pdftotext / pdftoppm and python3 with libXtst)');
  console.log(JSON.stringify({ schemaVersion: 1, instrument: INSTRUMENT, outcome: verdict.outcome, detail: verdict.detail,
    missing }, null, 2));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(verdict.exitCode);
}
const popplerVersion = (env.pdfinfo.match(/pdfinfo version ([\d.]+)/) || [])[1] || 'unknown';

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}
const measurements = {};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (v) => JSON.stringify(v).slice(0, 400);

const { chromium, playwrightSource } = await openBrowser(INSTRUMENT, () => ({ checksRun: pass + fail, failures: fail }));

/* ============================================================
   Poppler で PDF を読む
============================================================ */

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 512 << 20 });
  if (r.status !== 0) throw new Error(cmd + ' failed');
  return r.stdout;
}
/** 保存された PDF の本文・ページ・metadata（pdfinfo・pdfinfo -meta・pdftotext -layout）。 */
function readPdf(file) {
  const info = sh('pdfinfo', [file]);
  const meta = sh('pdfinfo', ['-meta', file]);
  const text = sh('pdftotext', ['-layout', file, '-']);
  const raw = fs.readFileSync(file).toString('latin1');
  const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1]);
  const size = ((info.match(/^Page size:\s+(.+)$/m) || [])[1] || '').trim();
  const pageTexts = text.split('\f').slice(0, pages);
  return { file: path.basename(file), bytes: fs.statSync(file).size, info, meta, text, raw, pages, size, pageTexts };
}
const count = (text, s) => text.split(s).length - 1;
/** 空白を除いて数える（pdftotext -layout は長い文を行の途中で折り返し、空白を足すため）。 */
const flatCount = (text, s) => count(text.replace(/\s+/g, ''), s.replace(/\s+/g, ''));
const CASE_ROW = /^\s*(G\d{3,4})\s+(P\d{2,4})\s/gm;
/** 印刷に出た内容の分類（P: Pack 本文・B: 固定の拒否文・H: 案内文・W: Workspace の資料・header など）。 */
function kinds(pdf, wsMarker) {
  const t = pdf.text;
  return {
    pack: flatCount(t, TITLE) + flatCount(t, FOOTER) + [...t.matchAll(CASE_ROW)].length + (/\bG\d{3,4}\b/.test(t) ? 1 : 0),
    blocked: flatCount(t, BLOCKED_HEAD), blockedReload: flatCount(t, BLOCKED_RELOAD), hint: flatCount(t, HINT_HEAD),
    workspace: (wsMarker ? flatCount(t, wsMarker) : 0), wsBlocked: flatCount(t, WS_BLOCKED), header: flatCount(t, APP_HEADER),
    tabs: TAB_LABELS.reduce((n, s) => n + flatCount(t, s), 0)
  };
}
/** URL・file path・秘密の混入（本文・Info・XMP・生の byte）。 */
function leaks(pdf) {
  const hay = [pdf.text, pdf.info, pdf.meta, pdf.raw];
  const needles = ['file://', 'file:/', REPO, os.tmpdir(), TMP, '/home/', '/tmp/', 'http://', 'https://', 'about:blank', 'index.html'];
  return needles.filter((n) => hay.some((h) => h.includes(n))).map((n) => (n === REPO || n === TMP || n === os.tmpdir() ? '<local path>' : n));
}
/** 許可された Pack の PDF として期待どおりか（行・詳細・比較・全ページの表示・見出しの繰り返し・用紙・混入）。 */
function judgePack(pdf, e) {
  const t = pdf.text;
  const rows = [...t.matchAll(CASE_ROW)].map((m) => m[1]);
  const details = [...t.matchAll(/詳細 (\d+)：ケース (G\d{3,4})/g)].map((m) => [Number(m[1]), m[2]]);
  const footerPages = pdf.pageTexts.map((p, i) => p.includes(FOOTER) && new RegExp(FOOTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + (i + 1) + ' / ' + pdf.pages + '\\b').test(p));
  const casePages = pdf.pageTexts.map((p) => /^\s*G\d{3,4}\s+P\d{2,4}\s/m.test(p));
  const headerOnCasePages = pdf.pageTexts.map((p, i) => !casePages[i] || /caseId\s+paneId\s+階\s+部位\s+ガラス/.test(p));
  const k = kinds(pdf, e.wsMarker);
  const items = {
    label: flatCount(t, e.label) === 1,
    rows: same(rows, e.ids),
    details: same(details, (e.detailIds || []).map((id, i) => [i + 1, id])),
    noDetails: (e.detailIds || []).length > 0 || t.includes('詳細を表示するケースは選ばれていません。'),
    comparison: e.compare ? t.includes('A: ' + e.compare[0] + ' ／ B: ' + e.compare[1] + '。差は B − A です。') : t.includes('比較は選ばれていません。'),
    title: flatCount(t, TITLE) === 1,
    notices: NOTICES.every((n) => t.replace(/\s+/g, '').includes(n.replace(/\s+/g, ''))),
    footer: footerPages.length === pdf.pages && footerPages.every(Boolean),
    thead: headerOnCasePages.every(Boolean) && casePages.filter(Boolean).length >= 1,
    a3: /^1191\.\d+ x 841\.\d+ pts/.test(pdf.size),
    exclusive: k.blocked === 0 && k.hint === 0 && k.workspace === 0 && k.wsBlocked === 0 && k.header === 0 && k.tabs === 0,
    noLeak: leaks(pdf).length === 0,
    noBidi: !BIDI_RAW.test(t)
  };
  return { ok: Object.values(items).every(Boolean), items, rows: rows.length, casePages: casePages.filter(Boolean).length, pages: pdf.pages };
}
/** 許可でない PDF（拒否文だけ・案内文だけ・Workspace の資料だけ）。 */
function judgeOther(pdf, kind, wsMarker) {
  const k = kinds(pdf, wsMarker);
  const items = {
    noPack: k.pack === 0,
    only: kind === 'blocked' ? k.blocked === 1 && k.hint === 0 && k.workspace === 0 && k.wsBlocked === 0
      : kind === 'blocked-deny' ? k.blocked === 1 && k.blockedReload === 1 && k.hint === 0 && k.workspace === 0 && k.wsBlocked === 0
        : kind === 'hint' ? k.hint === 1 && k.blocked === 0 && k.workspace === 0 && k.wsBlocked === 0
          : kind === 'workspace' ? k.workspace >= 1 && k.blocked === 0 && k.hint === 0 : false,
    noHeader: kind === 'workspace' || (k.header === 0 && k.tabs === 0),
    noLeak: leaks(pdf).length === 0
  };
  return { ok: Object.values(items).every(Boolean), items, k };
}
/** ページを低解像度の gray で画像にし、白でない画素の割合と、下の余白の帯（全ページの表示）の画素を数える。 */
function raster(file, pageNo) {
  const base = path.join(TMP, 'r-' + pageNo + '-' + Math.random().toString(36).slice(2, 8));
  sh('pdftoppm', ['-gray', '-r', '24', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', file, base]);
  const buf = fs.readFileSync(base + '.pgm');
  fs.rmSync(base + '.pgm');
  const header = buf.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  const [w, h] = [Number(header[1]), Number(header[2])];
  const px = buf.subarray(header[0].length);
  let ink = 0, band = 0;
  const bandFrom = Math.floor(h * 0.94);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[y * w + x] < 160) { ink++; if (y >= bandFrom) band++; }
  }
  return { width: w, height: h, ink: ink / (w * h), footerBandInk: band };
}

/* ============================================================
   page の中の計器（init script）
============================================================ */

/** 保存・通信・URL・ダウンロード・クリップボードの呼び出しを数える。 */
const PROBE = () => {
  const calls = { storage: 0, cookie: 0, idb: 0, caches: 0, beacon: 0, fetch: 0, xhr: 0, history: 0, blob: 0, clipboard: 0, open: 0 };
  window.__printProbe = calls;
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

/** ProjectPackReviewPrint の global への代入を包み、buildPrintModel の呼び出しを数える（window.__failPrintModel で 1 回失敗させる）。 */
const COUNT_MODEL = () => {
  let wrapped;
  window.__modelCalls = 0;
  window.__failPrintModel = false;
  Object.defineProperty(window, 'ProjectPackReviewPrint', { configurable: true,
    get() { return wrapped; },
    set(real) {
      wrapped = Object.freeze(Object.assign({}, real, {
        buildPrintModel: function (r, b, c) {
          window.__modelCalls++;
          if (window.__failPrintModel) { window.__failPrintModel = false; throw new Error('SECRET-PRINT-ERROR /private/path <img src=x>'); }
          return real.buildPrintModel.call(real, r, b, c);
        }
      }));
    } });
};

/** その時点の controller と body の状態、print の CSS で body 直下のどの要素が出るか（emulateMedia('print') のとき）。 */
const SNAP = () => {
  window.__snap = (ev) => {
    const c = window.projectPackPrint;
    const root = document.getElementById('pack-review-print-root');
    const shown = [...document.body.children].filter((el) => el.tagName !== 'SCRIPT' && getComputedStyle(el).display !== 'none')
      .map((el) => el.id || (el.className ? '.' + el.className : el.tagName.toLowerCase()));
    // 印刷に出る root の文字と背景の色（emulateMedia('print') のとき。画面の暗い背景用の色が残っていないか）
    const cs = (el) => (el ? [getComputedStyle(el).color, getComputedStyle(el).backgroundColor, getComputedStyle(el).fontWeight] : null);
    const colors = root.childElementCount ? { th: cs(root.querySelector('thead th')), firstTd: cs(root.querySelector('tbody tr:first-child td')),
      td: cs(root.querySelector('tbody tr:nth-child(2) td')), h2: cs(root.querySelector('h2')), li: cs(root.querySelector('.pack-print-trust li')) } : null;
    return { ev, state: c ? c.state : null, last: c ? c.lastSessionId : null, live: c && c.live ? c.live.id : null,
      classes: [...document.body.classList].sort(), rootSession: root.getAttribute('data-print-session'), rootChildren: root.childElementCount,
      rootHasLabel: window.__label ? root.textContent.includes(window.__label) : null, shown, colors };
  };
};

/** [stub] window.print をネイティブを呼ばない包みに替え、window.__plan の列で合成の event を配る（状態遷移の検査だけ）。 */
const PLAN = () => {
  window.__plan = ['before', 'after'];
  window.__printCalls = 0;
  window.__snaps = [];
  window.print = function () {
    window.__printCalls++;
    window.__snaps.push(window.__snap('callEnter'));
    const plan = window.__plan;
    for (const step of plan) {
      if (step === 'throw') throw new Error('synthetic print failure');
      // 区間の途中で Review を古くする（load の試行の番号を進める。page の中だけの操作）
      if (step === 'stale') { window.projectPackAttempt += 1; continue; }
      dispatchEvent(new Event(step === 'before' ? 'beforeprint' : 'afterprint'));
      window.__snaps.push(window.__snap(step));
    }
    window.__snaps.push(window.__snap('callReturn'));
  };
};

/** [native] 本物の window.print を包む: 呼び出しと戻りの時刻を記録し、window.__inj のときだけ合成の event を前後に足す。 */
const NATIVE = () => {
  window.__inj = null;
  window.__trace = [];
  window.__staleAtBefore = false;
  const epoch = () => performance.timeOrigin + performance.now();
  // 製品の listener より先に登録される（Review を古くする注入用。window.__staleAtBefore のときだけ 1 回）
  addEventListener('beforeprint', () => { if (window.__staleAtBefore) { window.__staleAtBefore = false; window.projectPackAttempt += 1; } });
  const native = window.print.bind(window);
  window.print = function () {
    const inj = window.__inj;
    window.__inj = null;
    window.__trace.push({ ev: 'callEnter', t: epoch() });
    try {
      if (inj === 'throw') throw new Error('synthetic print failure');
      if (inj === 'before-only') { dispatchEvent(new Event('beforeprint')); return undefined; }
      if (inj === 'after-first') dispatchEvent(new Event('afterprint'));
      if (inj === 'extra-before-first') dispatchEvent(new Event('beforeprint'));
      const r = native();
      if (inj === 'after-after') dispatchEvent(new Event('afterprint'));
      if (inj === 'after-before') dispatchEvent(new Event('beforeprint'));
      return r;
    } finally {
      window.__trace.push({ ev: 'callReturn', t: epoch() });
    }
  };
};
/** 製品の listener の後に登録する観測用の listener（page を読み込んだ後に page.evaluate で足す）。 */
const OBSERVE = () => {
  const epoch = () => performance.timeOrigin + performance.now();
  for (const type of ['beforeprint', 'afterprint']) {
    addEventListener(type, (e) => { window.__trace.push(Object.assign(window.__snap(type), { t: epoch(), trusted: e.isTrusted })); });
  }
};

/* ============================================================
   page の操作（UI だけ）
============================================================ */

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
  await p.waitForTimeout(30);
}
const batchSettled = () => !!window.stagedProjectPackBatch ||
  /キャンセル|完了できません|中止/.test(document.getElementById('pack-batch-status').textContent);
async function runBatch(p) {
  await showView(p, 'pack');
  await p.click('#btn-pack-batch');
  await p.waitForFunction(batchSettled, null, { timeout: 300000, polling: 20 });
  await p.waitForTimeout(20);
}
async function addDetail(p, id) {
  await p.fill('#pack-review-detail-input', id);
  await p.click('#btn-pack-review-detail-add');
}
async function setCompare(p, a, b) {
  await p.selectOption('#pack-review-compare-a', a);
  await p.selectOption('#pack-review-compare-b', b);
}
/** Pack を読み込み、全ケース計算・詳細・比較・Review の生成まで UI で進める。 */
async function prepare(p, packText, opts) {
  const o = opts || {};
  await paste(p, packText);
  await runBatch(p);
  for (const id of o.details || []) await addDetail(p, id);
  if (o.compare) await setCompare(p, o.compare[0], o.compare[1]);
  await clickIf(p, '#btn-pack-review');
  await p.waitForTimeout(30);
  if (o.label !== undefined) await p.evaluate((l) => { window.__label = l; }, o.label);
}
/** Workspace の資料を FRESH にする（現在の入力を 1 ケース追加 → 一括計算 → 資料を作成）。 */
async function workspaceFresh(p) {
  await showView(p, 'batch');
  await p.click('text=＋ 現在の入力条件を追加');
  await p.click('#btn-batch-eval');
  await p.click('#btn-rep-generate');
  await p.waitForTimeout(50);
  return p.evaluate(() => {
    const fresh = getReviewFreshness() === 'FRESH';
    const lines = document.getElementById('review-report').innerText.split('\n').map((s) => s.trim()).filter((s) => s.length >= 6);
    return { fresh, marker: lines[0] || null };
  });
}
const printState = (p) => p.evaluate(() => {
  const $ = (id) => document.getElementById(id);
  const c = window.projectPackPrint;
  return { state: c.state, last: c.lastSessionId, live: c.live ? c.live.id : null, button: $('btn-pack-review-print').disabled,
    status: $('pack-review-print-status').textContent, statusError: $('pack-review-print-status').classList.contains('is-error'),
    classes: [...document.body.classList].sort(), rootChildren: $('pack-review-print-root').childElementCount,
    rootSession: $('pack-review-print-root').getAttribute('data-print-session'), modelCalls: window.__modelCalls,
    printCalls: window.__printCalls, probe: Object.assign({}, window.__printProbe) };
});
const isDeny = (s) => s.state === 'DENY_PENDING' && s.live === null && s.rootChildren === 0 && s.rootSession === null &&
  same(s.classes.filter((c) => c.startsWith('pack-print-')), ['pack-print-deny-pending']) && s.button === true &&
  s.status.startsWith(DENIED_HEAD) && s.statusError;
const isIdleClean = (s) => s.state === 'IDLE' && s.live === null && s.rootChildren === 0 && s.rootSession === null &&
  s.classes.filter((c) => c.startsWith('pack-print-')).length === 0;
const probeZero = (s) => Object.values(s.probe || {}).every((v) => v === 0);

/** [page.pdf] 印刷の media で PDF にする（emulateMedia を既定に戻す。screen のままだと画面の CSS で PDF になる）。 */
async function pagePdf(p, name) {
  await p.emulateMedia({ media: null });
  const file = path.join(TMP, name + '.pdf');
  await p.pdf({ path: file, preferCSSPageSize: true, displayHeaderFooter: false, printBackground: false });
  return readPdf(file);
}

/* ============================================================
   [headless] UI・stub・page.pdf
============================================================ */

const browser = await chromium.launch();
const logs = [];
async function newPage(viewport, initScripts) {
  const p = await browser.newPage({ viewport });
  const log = { console: [], errors: [], requests: [], downloads: [] };
  logs.push(log);
  p.on('console', (m) => log.console.push({ type: m.type(), text: m.text() }));
  p.on('pageerror', (e) => log.errors.push(e.message));
  p.on('request', (r) => { if (!r.url().startsWith('file://')) log.requests.push(r.url()); });
  p.on('download', (d) => log.downloads.push(d.suggestedFilename()));
  for (const s of initScripts || []) await p.addInitScript(s);
  await p.goto(FILE);
  await p.waitForTimeout(200);
  return { p, log };
}
const STUB = [PROBE, COUNT_MODEL, SNAP, PLAN];
const smallLabel = (mode) => fixture(mode).projectMetadata.publicLabel;

// U01–U04: 初期状態・押せる条件・常に見える注意・ARIA・keyboard・2 つの幅
{
  const { p } = await newPage({ width: 1280, height: 800 }, STUB);
  await showView(p, 'pack');
  const s0 = await printState(p);
  const hidden = await p.evaluate(() => ['pack-review-print-root', 'pack-review-print-blocked', 'pack-review-print-hint']
    .map((id) => getComputedStyle(document.getElementById(id)).display));
  check('PR-U01-initial-idle-no-session', isIdleClean(s0) && s0.last === 0 && s0.button === true && s0.status === IDLE_TEXT &&
    same(hidden, ['none', 'none', 'none']), short({ s0, hidden }));
  await paste(p, fixtureText('notification1458'));
  const afterLoad = await printState(p);
  await runBatch(p);
  const afterBatch = await printState(p);
  await clickIf(p, '#btn-pack-review');
  await p.waitForTimeout(30);
  const afterReview = await printState(p);
  check('PR-U02-enabled-only-with-current-review-and-nothing-built', afterLoad.button && afterBatch.button && !afterReview.button &&
    afterReview.last === 0 && afterReview.modelCalls === 0 && afterReview.rootChildren === 0 && afterReview.printCalls === 0,
    short({ afterLoad: afterLoad.button, afterBatch: afterBatch.button, afterReview }));
  const notes = await p.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    const vis = (el) => !!el && el.checkVisibility() && el.getClientRects().length > 0 && !el.closest('details:not([open])');
    const btn = $('btn-pack-review-print').getBoundingClientRect();
    const ids = ['pack-review-print-trust', 'pack-review-print-share', 'pack-review-print-paper', 'pack-review-print-headers', 'pack-review-print-reload'];
    return { visible: ids.map((id) => vis($(id))), beforeButton: ids.map((id) => $(id).getBoundingClientRect().top < btn.top),
      trustSize: getComputedStyle($('pack-review-print-trust')).fontSize, trust: $('pack-review-print-trust').innerText,
      reload: $('pack-review-print-reload').innerText, headers: $('pack-review-print-headers').innerText };
  });
  check('PR-U03-notices-always-visible-before-button', notes.visible.every(Boolean) && notes.beforeButton.every(Boolean) &&
    notes.trustSize === '12px' && /pack_unreviewed/.test(notes.trust) && /calculated_not_verified/.test(notes.trust) &&
    /再読み込みすると、\s*読み込んだ Pack と Pack Review も消えます/.test(notes.reload) && /自動では再読み込みしません/.test(notes.reload) &&
    /「ヘッダーとフッター」を OFF/.test(notes.headers), short(notes));
  const aria = await p.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    const b = $('btn-pack-review-print');
    const sec = $('pack-review-print-section');
    return { status: [$('pack-review-print-status').getAttribute('role'), $('pack-review-print-status').getAttribute('aria-live')],
      name: b.textContent.trim(), described: (b.getAttribute('aria-describedby') || '').split(' ').map((id) => !!$(id)),
      label: $(sec.getAttribute('aria-labelledby')).textContent, tag: b.tagName, type: b.type };
  });
  const snapshot = await p.locator('#pack-review-print-section').ariaSnapshot();
  check('PR-U04-aria-roles-and-names', same(aria.status, ['status', 'polite']) && aria.name === 'Pack Reviewを印刷' &&
    aria.described.length === 2 && aria.described.every(Boolean) && aria.label === 'Pack Review の印刷・PDF（未レビュー）' &&
    aria.tag === 'BUTTON' && aria.type === 'button' && /button "Pack Reviewを印刷"/.test(snapshot) && /status/.test(snapshot), short({ aria, snapshot: snapshot.slice(0, 200) }));
  // keyboard だけで印刷を要求する（Tab で focus を移し Enter）
  await p.focus('#btn-pack-review');
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await p.keyboard.press('Tab');
    reached = await p.evaluate(() => document.activeElement && document.activeElement.id === 'btn-pack-review-print');
  }
  await p.evaluate(() => { window.__plan = ['before', 'after']; });
  if (reached) await p.keyboard.press('Enter');
  await p.waitForTimeout(30);
  const kb = await printState(p);
  check('PR-U05-keyboard-tab-and-enter-request-print', reached && kb.printCalls === 1 && isIdleClean(kb) &&
    kb.status.startsWith(REQUESTED(3)) && !kb.statusError, short({ reached, kb }));
  // 2 つの幅: 印刷用の要素は画面に出ない・横に溢れない
  const widths = [];
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await p.setViewportSize(vp);
    await p.waitForTimeout(50);
    widths.push(await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      button: document.getElementById('btn-pack-review-print').checkVisibility(),
      buttonRight: document.getElementById('btn-pack-review-print').getBoundingClientRect().right <= document.documentElement.clientWidth,
      roots: ['pack-review-print-root', 'pack-review-print-blocked', 'pack-review-print-hint'].map((id) => document.getElementById(id).checkVisibility()) })));
  }
  check('PR-U06-1280-and-390-no-overflow-roots-not-on-screen', widths.every((w) => w.overflow <= 0 && w.button && w.buttonRight &&
    w.roots.every((v) => v === false)), short(widths));
  await p.close();
}

// S01–S12 [stub]: 印刷の CSS を当て、合成の event の列で状態と「印刷に出る要素」を見る
async function stubPage(mode, opts) {
  const { p, log } = await newPage({ width: 1280, height: 800 }, STUB);
  const o = opts || {};
  let ws = null;
  if (o.workspaceFresh) ws = await workspaceFresh(p);
  await prepare(p, o.packText || fixtureText(mode), { label: o.label || smallLabel(mode), details: o.details, compare: o.compare });
  await showView(p, 'pack');
  await p.emulateMedia({ media: 'print' });
  return { p, log, ws };
}
// print の CSS を当てた間はボタンも印刷には出ない（display: none）ので、[stub] ではボタンの click() を page の中で呼ぶ
// （onclick の handler をそのまま通す。disabled のボタンは click() でも handler を呼ばない）
const stubPrint = async (p, plan) => {
  await p.evaluate((pl) => { window.__snaps = []; window.__plan = pl; document.getElementById('btn-pack-review-print').click(); }, plan);
  await p.waitForTimeout(20);
  return p.evaluate(() => window.__snaps);
};
/** disabled を外してボタンを押す（押せないはずのボタンを強制で押したときも、handler 自身が拒否することを確かめる）。 */
const forceClick = (p) => p.evaluate(() => { const b = document.getElementById('btn-pack-review-print'); b.disabled = false; b.click(); });
const fire = (p, type) => p.evaluate((t) => { dispatchEvent(new Event(t)); return window.__snap(t); }, type);
const onlyShown = (s, id) => same(s.shown, [id]);

{
  // C-01: Workspace FRESH でも、許可された印刷では root だけが出る（Workspace・header・タブ 0）
  const { p, ws } = await stubPage('notification1458', { workspaceFresh: true });
  const snaps = await stubPrint(p, ['before', 'after']);
  const s = await printState(p);
  const bp = snaps.find((x) => x.ev === 'before');
  check('PR-S01-C01-only-root-printed-workspace-fresh', ws.fresh && bp.state === 'PRINT_EVENT' && onlyShown(bp, 'pack-review-print-root') &&
    bp.rootHasLabel === true && bp.classes.includes('review-print-allowed') && bp.classes.includes('pack-print-allowed') &&
    isIdleClean(s) && s.last === 1 && s.status.startsWith(REQUESTED(3)), short({ bp: Object.assign({}, bp, { colors: undefined }), s }));
  // 印刷の文字は黒・背景なし（画面の表の規則の薄い文字色・先頭行の強調が印刷に残らない。先頭のケースの行も他の行と同じ）
  const black = (c) => !!c && c[0] === 'rgb(0, 0, 0)' && (c[1] === 'rgba(0, 0, 0, 0)' || c[1] === 'rgb(255, 255, 255)');
  const col = bp.colors || {};
  check('PR-S21-print-text-black-first-row-not-emphasised', ['th', 'firstTd', 'td', 'h2', 'li'].every((k) => black(col[k])) &&
    col.firstTd[2] === col.td[2] && col.firstTd[2] === '400', short(col));
  // C-04: IDLE の孤立 afterprint（× 3）→ 素の印刷: Pack 画面は案内文だけ、session を作らない
  for (let i = 0; i < 3; i++) await fire(p, 'afterprint');
  const plainBefore = await fire(p, 'beforeprint');
  await fire(p, 'afterprint');
  const s4 = await printState(p);
  check('PR-S02-C04-orphan-events-idle-hint-only', isIdleClean(s4) && s4.last === 1 && onlyShown(plainBefore, 'pack-review-print-hint') &&
    plainBefore.rootChildren === 0, short({ plainBefore, s4 }));
  // N: 直接の page.pdf()（同期区間の外）は、許可された Pack を出せない。body に許可の class を付けても同じ
  await p.evaluate(() => document.body.classList.add('pack-print-requested', 'pack-print-allowed'));
  const direct = await pagePdf(p, 'n-direct-pack-view');
  const jd = judgeOther(direct, 'hint');
  const sd = await printState(p);
  check('PR-N01-direct-page-pdf-cannot-print-pack', jd.ok && isIdleClean(sd) && direct.text.includes(HINT_HEAD), short({ jd: jd.items, k: jd.k, sd }));
  // N: Workspace の画面の素の印刷（IDLE・FRESH）は従来どおり Workspace の資料で、Pack 0
  await p.emulateMedia({ media: 'screen' });
  await showView(p, 'batch');
  const wsPdf = await pagePdf(p, 'n-workspace-idle');
  const jw = judgeOther(wsPdf, 'workspace', ws.marker);
  check('PR-N02-workspace-view-unchanged-pack-zero', jw.ok, short({ items: jw.items, k: jw.k }));
  await showView(p, 'single');
  const single = await pagePdf(p, 'n-single-idle');
  const ks = kinds(single, ws.marker);
  check('PR-N03-single-view-no-pack-no-hint', ks.pack === 0 && ks.hint === 0 && ks.blocked === 0 && leaks(single).length === 0, short(ks));
  await p.close();
}

{
  // C-02 / X-3 / C-06 / C-08(b): DENY_PENDING に入る列（各回新しい page）
  const runs = [
    // C-02(a): 区間内の beforeprint は確かめて許可する（印刷そのものは起きない）。afterprint を見ないまま戻るので DENY_PENDING
    ['PR-S03-C02a-before-only-return', ['before'], true],
    ['PR-S04-C02b-no-events-return', [], false],
    ['PR-S05-X3-print-throws', ['throw'], false],
    ['PR-S06-C06a-after-then-before', ['after', 'before'], false],
    ['PR-S07-C06b-second-afterprint', ['before', 'after', 'after'], true],
    ['PR-S08-C06c-before-after-afterprint', ['before', 'after', 'before'], true]
  ];
  for (const [id, plan, allowedFirst] of runs) {
    const { p } = await stubPage('project_pressure_map');
    const snaps = await stubPrint(p, plan);
    const s = await printState(p);
    const evs = snaps.filter((x) => x.ev !== 'callEnter' && x.ev !== 'callReturn');
    const firstAllowed = evs.length > 0 && evs[0].ev === 'before' && onlyShown(evs[0], 'pack-review-print-root');
    const laterBlocked = evs.slice(allowedFirst ? 2 : 0).every((x) => !x.classes.includes('pack-print-allowed'));
    // 以後のどの印刷も拒否文だけ（ボタンは window.print() を呼ばない）
    await forceClick(p);
    const after = await printState(p);
    const deny = await pagePdf(p, 'deny-' + id);
    const jd = judgeOther(deny, 'blocked-deny');
    check(id, isDeny(s) && firstAllowed === allowedFirst && laterBlocked && after.printCalls === 1 && after.last === 1 && isDeny(after) && jd.ok,
      short({ plan, evs: evs.map((x) => [x.ev, x.state, x.shown]), s: s.state, after: after.printCalls, pdf: jd.items, k: jd.k }));
  }
}

{
  // C-03・C-05(c)・C-07・C-08(a)・C-09・C-10: DENY_PENDING は粘着で、解除は再読み込みだけ
  const { p, ws } = await stubPage('notification1458', { workspaceFresh: true });
  // fake clock は DENY_PENDING に入る前に入れる（入った時に page が置く timer も、この clock で進める）
  await p.clock.install();
  await stubPrint(p, ['before']);
  const steps = {};
  for (let i = 0; i < 3; i++) await fire(p, 'afterprint');
  steps.lateAfterprint = await printState(p);
  const lateBefore = await fire(p, 'beforeprint');
  await fire(p, 'beforeprint');
  steps.lateBeforeprint = await printState(p);
  check('PR-S09-C03-C05c-late-events-keep-deny', isDeny(steps.lateAfterprint) && isDeny(steps.lateBeforeprint) &&
    onlyShown(lateBefore, 'pack-review-print-blocked') && !lateBefore.classes.includes('pack-print-allowed'), short({ lateBefore }));
  // C-07(a) 強制クリック (b) 時間（fake clock で 61 秒）(c) 3 画面のタブ (d) Review の生成し直し・Pack の読み直し (e) class の消去
  await p.emulateMedia({ media: 'screen' });
  await forceClick(p);
  steps.forced = await printState(p);
  await p.clock.fastForward(61000);
  steps.time = await printState(p);
  for (const v of ['batch', 'single', 'pack']) await p.click('#view-tab-' + v);
  steps.tabs = await printState(p);
  await clickIf(p, '#btn-pack-review');
  await prepare(p, fixtureText('case_direct'), {});
  steps.regenerate = await printState(p);
  await p.evaluate(() => { document.body.className = ''; });
  await p.emulateMedia({ media: 'print' });
  const afterReset = await fire(p, 'beforeprint');
  await fire(p, 'afterprint');
  steps.cssReset = await printState(p);
  check('PR-S10-C07-click-time-tabs-regenerate-class-reset-keep-deny', Object.values(steps).every(isDeny) &&
    Object.values(steps).every((s) => s.printCalls === 1 && s.last === 1) && onlyShown(afterReset, 'pack-review-print-blocked'),
    short(Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, [v.state, v.printCalls, v.last]]))));
  // C-09: Workspace が FRESH でも、Workspace・Pack・単一ケースの各画面の素の印刷は拒否文だけ（W 0・P 0）
  const c09 = [];
  for (const v of ['batch', 'pack', 'single']) {
    await p.emulateMedia({ media: 'screen' });
    await showView(p, v);
    const pdf = await pagePdf(p, 'c09-' + v);
    c09.push(judgeOther(pdf, 'blocked-deny', ws.marker));
  }
  check('PR-S11-C09-deny-overrides-fresh-workspace-every-view', ws.fresh && c09.every((j) => j.ok), short(c09.map((j) => [j.items, j.k])));
  // C-10: 再読み込みで IDLE。印刷の許可・session を storage・URL に置かない。Pack・Review も消える
  const before = await p.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    idb: indexedDB.databases ? (await indexedDB.databases()).length : 0, url: location.search + location.hash }));
  await p.reload();
  await p.waitForTimeout(200);
  const r = await printState(p);
  const afterStore = await p.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    idb: indexedDB.databases ? (await indexedDB.databases()).length : 0, url: location.search + location.hash,
    pack: window.stagedProjectPackContext, review: window.currentProjectPackReview }));
  await showView(p, 'pack');
  await p.emulateMedia({ media: 'print' });
  const plain = await fire(p, 'beforeprint');
  await fire(p, 'afterprint');
  check('PR-S12-C10-reload-only-recovery-nothing-persisted', isIdleClean(r) && r.last === 0 && r.button === true &&
    same(before, { local: 0, session: 0, cookie: '', idb: 0, url: '' }) && afterStore.local === 0 && afterStore.session === 0 &&
    afterStore.cookie === '' && afterStore.idb === 0 && afterStore.url === '' && afterStore.pack === null && afterStore.review === null &&
    onlyShown(plain, 'pack-review-print-hint'), short({ r, before, afterStore: Object.assign({}, afterStore, { pack: !!afterStore.pack }) }));
  await p.emulateMedia({ media: 'screen' });
  await prepare(p, fixtureText('notification1458'), { label: smallLabel('notification1458') });
  await p.emulateMedia({ media: 'print' });
  const again = await stubPrint(p, ['before', 'after']);
  const ra = await printState(p);
  check('PR-S13-C10-explicit-button-after-reload-new-session', onlyShown(again.find((x) => x.ev === 'before'), 'pack-review-print-root') &&
    isIdleClean(ra) && ra.last === 1, short(ra));
  await p.close();
}

{
  // C-05(a)・C-05(a')・C-08(b)(c)・X-1・X-2・gate
  const { p } = await stubPage('notification1458');
  const twice = await stubPrint(p, ['before', 'before', 'after']);
  const s1 = await printState(p);
  const bps = twice.filter((x) => x.ev === 'before');
  check('PR-S14-C05a-duplicate-beforeprint-each-revalidated', bps.length === 2 && bps.every((x) => onlyShown(x, 'pack-review-print-root')) &&
    isIdleClean(s1) && s1.status.startsWith(REQUESTED(3)), short({ bps: bps.map((x) => x.shown), s1 }));
  const stale = await stubPrint(p, ['before', 'stale', 'before', 'after']);
  const s2 = await printState(p);
  const [b1, b2] = stale.filter((x) => x.ev === 'before');
  check('PR-S15-C05a-stale-between-beforeprints-blocked-from-then', onlyShown(b1, 'pack-review-print-root') && onlyShown(b2, 'pack-review-print-blocked') &&
    isIdleClean(s2) && s2.status.startsWith(REFUSED_HEAD) && s2.statusError, short({ b1: b1.shown, b2: b2.shown, s2 }));
  await p.close();
}
{
  const { p } = await stubPage('notification1458');
  const s1 = await stubPrint(p, ['before', 'after']);
  const s2 = await stubPrint(p, ['after', 'before', 'after']);
  const st = await printState(p);
  const s1Return = s1.find((x) => x.ev === 'callReturn');
  check('PR-S16-C08b-early-afterprint-in-next-session-deny', !!s1Return && s1Return.state === 'PRINT_EVENT' && isDeny(st) && st.last === 2 &&
    s2.filter((x) => x.ev === 'before').every((x) => !x.classes.includes('pack-print-allowed')) && s2[1].state === 'DENY_PENDING', short(st));
  await p.close();
}
{
  // C-08(c): S1 の後に別の Pack（別の label）で S2。余分の beforeprint は受け付けうるが、出るのは S2 の root だけ
  const L1 = 'Synthetic Print S1';
  const L2 = 'Synthetic Print S2';
  const { p } = await stubPage('notification1458', { packText: JSON.stringify(Object.assign(fixture('notification1458'),
    { projectMetadata: { publicLabel: L1 } })), label: L1 });
  const a = await stubPrint(p, ['before', 'after']);
  await p.emulateMedia({ media: 'screen' });
  await prepare(p, JSON.stringify(Object.assign(fixture('notification1458'), { projectMetadata: { publicLabel: L2 } })), { label: L2 });
  await p.emulateMedia({ media: 'print' });
  const b = await stubPrint(p, ['before', 'before', 'after']);
  const s1Text = await p.evaluate((l) => document.getElementById('pack-review-print-root').textContent.includes(l), L1);
  const st = await printState(p);
  const bb = b.filter((x) => x.ev === 'before');
  check('PR-S17-C08c-extra-beforeprint-accepted-current-session-only', a.find((x) => x.ev === 'before').rootSession === '1' &&
    bb.length === 2 && bb.every((x) => x.rootSession === '2' && x.rootHasLabel === true && onlyShown(x, 'pack-review-print-root')) &&
    !s1Text && isIdleClean(st) && st.last === 2, short({ bb: bb.map((x) => [x.rootSession, x.rootHasLabel]), st }));
  await p.close();
}
{
  // X-1: model の生成の失敗（init script の包みで 1 回）→ IDLE・window.print() を呼ばない・固定文（例外の文面なし）。次の押下は通る
  const { p } = await stubPage('case_direct');
  await p.evaluate(() => { window.__failPrintModel = true; });
  await stubPrint(p, ['before', 'after']);
  const s = await printState(p);
  const retry = await stubPrint(p, ['before', 'after']);
  const r = await printState(p);
  check('PR-S18-X1-failure-before-print-idle-fixed-text', isIdleClean(s) && s.printCalls === 0 && s.status === FAILURE && s.statusError &&
    !/SECRET|private|img/.test(s.status) && onlyShown(retry.find((x) => x.ev === 'before'), 'pack-review-print-root') && r.last === 2 && r.printCalls === 1,
    short({ s, r }));
  // X-2: 区間内の beforeprint の handler の例外 → DENY_PENDING・その印刷は拒否文だけ
  await p.evaluate(() => { window.projectPackPrintSessionIsLive = () => { throw new Error('synthetic handler fault'); }; });
  const x2 = await stubPrint(p, ['before', 'after']);
  const sx = await printState(p);
  check('PR-S19-X2-handler-exception-deny-blocked-only', isDeny(sx) && onlyShown(x2.find((x) => x.ev === 'before'), 'pack-review-print-blocked'),
    short({ x2: x2.map((x) => [x.ev, x.state, x.shown]) }));
  await p.close();
}
{
  // gate: state の差し替え（JSON の写し・古い試行・別の選択）と、初期化の後に置いた decoy の global は使わない
  const { p } = await stubPage('project_pressure_map');
  const swaps = {
    'json copy': () => { window.currentProjectPackReview = Object.assign({}, window.currentProjectPackReview, { review: JSON.parse(JSON.stringify(window.currentProjectPackReview.review)) }); },
    'old attempt': () => { window.currentProjectPackReview = Object.assign({}, window.currentProjectPackReview, { attempt: window.currentProjectPackReview.attempt - 1 }); },
    'other selection': () => { window.currentProjectPackReview = Object.assign({}, window.currentProjectPackReview, { selection: { detailCaseIds: ['G001'], comparisonCaseIds: null } }); }
  };
  const out = {};
  for (const [name, fn] of Object.entries(swaps)) {
    await p.emulateMedia({ media: 'screen' });
    await prepare(p, fixtureText('project_pressure_map'), {});
    await p.evaluate(fn);
    const calls = (await printState(p)).modelCalls;
    await forceClick(p);
    const s = await printState(p);
    out[name] = s.modelCalls === calls && s.printCalls === 0 && isIdleClean(s) && s.status === NOT_READY;
  }
  await prepare(p, fixtureText('project_pressure_map'), {});
  await p.evaluate(() => { window.ProjectPackReviewPrint = Object.freeze({ buildPrintModel() { throw new Error('decoy'); } }); });
  await p.emulateMedia({ media: 'print' });
  const decoy = await stubPrint(p, ['before', 'after']);
  const ds = await printState(p);
  check('PR-S20-gate-stale-states-refused-decoy-global-unused', Object.values(out).every(Boolean) && ds.printCalls === 1 &&
    onlyShown(decoy.find((x) => x.ev === 'before'), 'pack-review-print-root'), short({ out, ds }));
  await p.close();
}

/* ============================================================
   [native] ヘッド付き Chromium・kiosk・PDF に保存・Poppler
============================================================ */

const NATIVE_DIR = path.join(TMP, 'native');
const PROFILE = path.join(NATIVE_DIR, 'profile');
const OUT = path.join(NATIVE_DIR, 'pdf');
fs.mkdirSync(path.join(PROFILE, 'Default'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const appState = { version: 2, recentDestinations: [{ id: 'Save as PDF', origin: 'local', account: '' }], selectedDestinationId: 'Save as PDF',
  isHeaderFooterEnabled: false };
fs.writeFileSync(path.join(PROFILE, 'Default', 'Preferences'), JSON.stringify({
  printing: { print_preview_sticky_settings: { appState: JSON.stringify(appState) } },
  savefile: { default_directory: OUT }, download: { default_directory: OUT, prompt_for_download: false } }));
const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, args: ['--kiosk-printing'], viewport: { width: 1280, height: 800 } });
const nativeVersion = ctx.browser() ? ctx.browser().version() : 'unknown';
const blocked = [];
await ctx.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('file:')) return rt.continue(); blocked.push(u); return rt.abort(); });
for (const s of [PROBE, COUNT_MODEL, SNAP, NATIVE]) await ctx.addInitScript(s);
const np = ctx.pages()[0] || await ctx.newPage();
const nlog = { console: [], errors: [], downloads: [] };
logs.push(nlog);
np.on('console', (m) => nlog.console.push({ type: m.type(), text: m.text() }));
np.on('pageerror', (e) => nlog.errors.push(e.message));
np.on('download', (d) => nlog.downloads.push(d.suggestedFilename()));

// 出力 directory を見張る（ファイルの最初の観測時刻・作成時刻・大きさの最後の変化）
const files = {};
const epoch = () => performance.timeOrigin + performance.now();
const poll = setInterval(() => {
  for (const f of fs.readdirSync(OUT)) {
    let st;
    try { st = fs.statSync(path.join(OUT, f)); } catch (e) { continue; }
    const now = epoch();
    const e = files[f] || (files[f] = { firstSeen: now, birth: st.birthtimeMs || null, size: -1, lastChange: now });
    if (st.size !== e.size) { e.size = st.size; e.lastChange = now; }
  }
}, 4);
/** 新しい PDF が n 個そろって書き終わるまで待つ（既にあったファイルは数えない）。 */
async function newPdfs(known, n, ms) {
  const end = Date.now() + (ms || 60000);
  for (;;) {
    const fresh = Object.keys(files).filter((f) => !known.has(f) && f.endsWith('.pdf'));
    if (fresh.length >= n && fresh.every((f) => files[f].size > 0 && epoch() - files[f].lastChange > 700)) return fresh.sort((a, b) => files[a].firstSeen - files[b].firstSeen);
    if (Date.now() > end) return fresh;
    await sleep(40);
  }
}
async function reloadNative() {
  await np.goto(FILE);
  await np.waitForTimeout(150);
  await np.evaluate(OBSERVE);
}
const nativeTrace = () => np.evaluate(() => window.__trace.slice());
/** 実際の UI のボタンで印刷を要求し、その要求の PDF（0 個または 1 個）と trace を返す。 */
async function nativePrint(inj, expectFile) {
  const known = new Set(Object.keys(files));
  const from = (await nativeTrace()).length;
  await np.evaluate((i) => { window.__inj = i; }, inj || null);
  await np.click('#btn-pack-review-print', { force: true });
  await np.waitForFunction((n) => window.__trace.slice(n).some((x) => x.ev === 'callReturn') || window.projectPackPrint.state !== 'PRINT_EVENT', from,
    { timeout: 300000, polling: 50 }).catch(() => null);
  const got = expectFile ? await newPdfs(known, 1, 120000) : (await sleep(2500), Object.keys(files).filter((f) => !known.has(f)));
  const trace = (await nativeTrace()).slice(from);
  return { files: got, trace, state: await printState(np) };
}
/** 仮想ディスプレイの XTest で実際の Ctrl+P を送り、その印刷の PDF を返す。 */
async function ctrlP() {
  const known = new Set(Object.keys(files));
  const from = (await nativeTrace()).length;
  await np.bringToFront();
  const r = spawnSync('python3', [XKEY], { encoding: 'utf8' });
  const got = r.status === 0 ? await newPdfs(known, 1, 60000) : [];
  return { files: got, trace: (await nativeTrace()).slice(from), state: await printState(np), sent: r.status === 0 };
}
const traceSeq = (tr) => tr.map((x) => x.ev + (x.ev === 'beforeprint' ? (x.classes.includes('pack-print-allowed') ? '+' : '-') : '') + (x.trusted === false ? '(synthetic)' : '')).join(' > ');
const d2 = (tr) => /^callEnter > beforeprint\+ > afterprint > callReturn$/.test(traceSeq(tr)) && tr.filter((x) => x.ev !== 'callEnter' && x.ev !== 'callReturn').every((x) => x.trusted === true);
/** (b) PDF の作成時刻が window.print() の呼び出し〜戻りの間か。 */
function inWindow(tr, file) {
  const enter = (tr.find((x) => x.ev === 'callEnter') || {}).t;
  const ret = (tr.find((x) => x.ev === 'callReturn') || {}).t;
  const f = files[file];
  const created = f ? Math.min(f.firstSeen, f.birth || Infinity) : NaN;
  return { ok: created >= enter && created <= ret, createdMinusEnter: Math.round(created - enter), createdMinusReturn: Math.round(created - ret),
    birth: !!(f && f.birth) };
}
const pdfOf = (name) => readPdf(path.join(OUT, name));
const uniq = (s) => s + ' ' + Math.random().toString(36).slice(2, 8).toUpperCase();
const packWithLabel = (mode, label) => JSON.stringify(Object.assign(fixture(mode), { projectMetadata: { publicLabel: label } }));
const nativeIds = (pack) => pack.glazingCases.map((c) => c.caseId);

await reloadNative();

// K00: 素の Ctrl+P（実キー入力）。要求も Review も無い Pack 画面 → 案内文だけ（最初のネイティブ印刷を兼ねる）
{
  await showView(np, 'pack');
  const r = await ctrlP();
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const j = pdf ? judgeOther(pdf, 'hint') : null;
  check('PR-K00-native-ctrl-p-pack-view-idle-hint-only', r.sent && !!j && j.ok && isIdleClean(r.state) && r.state.last === 0 &&
    !r.trace.some((x) => x.ev === 'callEnter'), short({ sent: r.sent, files: r.files.length, j: j && j.items, seq: traceSeq(r.trace) }));
}

// K01 (C-01 代表): 2000 ケース・notification1458・詳細 50・比較・Workspace FRESH → ネイティブの PDF
let k01 = null;
{
  await reloadNative();
  const ws = await workspaceFresh(np);
  const label = uniq('Synthetic Print K01');
  const pack = syntheticPack(2000, 'notification1458', { label });
  const ids = nativeIds(pack);
  const t0 = Date.now();
  await prepare(np, JSON.stringify(pack), { label, details: ids.slice(0, 50), compare: [ids[0], ids[1999]] });
  const prepMs = Date.now() - t0;
  await showView(np, 'pack');
  const t1 = Date.now();
  const r = await nativePrint(null, true);
  const printMs = Date.now() - t1;
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const j = pdf ? judgePack(pdf, { label, ids, detailIds: ids.slice(0, 50), compare: [ids[0], ids[1999]], wsMarker: ws.marker }) : null;
  const w = pdf ? inWindow(r.trace, r.files[0]) : null;
  const bp = r.trace.find((x) => x.ev === 'beforeprint');
  k01 = { pdf, label };
  check('PR-K01-native-button-print-d2-trace', d2(r.trace) && bp && bp.rootSession === String(bp.last) && bp.rootHasLabel === true &&
    isIdleClean(r.state) && r.state.status.startsWith(REQUESTED(2000)), short({ seq: traceSeq(r.trace), state: r.state.state }));
  check('PR-K02-native-pdf-bound-to-request', !!pdf && r.files.length === 1 && !!w && w.ok && j.items.label, short({ w, files: r.files.length }));
  check('PR-K03-native-pdf-2000-rows-in-order', !!j && j.items.rows && j.rows === 2000, short(j && { rows: j.rows, casePages: j.casePages }));
  check('PR-K04-native-pdf-50-details-and-comparison', !!j && j.items.details && j.items.comparison, short(j && j.items));
  check('PR-K05-native-pdf-trust-and-page-number-every-page', !!j && j.items.footer && j.items.title && j.items.notices && j.items.a3, short(j && { pages: j.pages, size: pdf.size }));
  check('PR-K06-native-pdf-thead-repeated-on-case-pages', !!j && j.items.thead, short(j && { casePages: j.casePages }));
  check('PR-K07-native-pdf-exclusive-no-workspace-header-leak', ws.fresh && !!j && j.items.exclusive && j.items.noLeak && j.items.noBidi,
    short(j && { k: kinds(pdf, ws.marker), leaks: leaks(pdf) }));
  const pages = pdf ? [1, Math.ceil(pdf.pages / 2), pdf.pages] : [];
  const ras = pdf ? pages.map((n) => raster(path.join(OUT, r.files[0]), n)) : [];
  check('PR-K08-native-pdf-raster-first-middle-last-not-blank-footer-band', ras.length === 3 && ras.every((x) => x.ink > 0.01 && x.footerBandInk > 0),
    short(ras));
  measurements.k01 = { cases: 2000, details: 50, comparison: true, pages: pdf && pdf.pages, bytes: pdf && pdf.bytes, size: pdf && pdf.size,
    prepareMs: prepMs, clickToPdfMs: printMs, beforeToAfterMs: bp ? Math.round(r.trace.find((x) => x.ev === 'afterprint').t - bp.t) : null,
    fileCreatedMinusEnterMs: w && w.createdMinusEnter, fileCreatedMinusReturnMs: w && w.createdMinusReturn,
    metadata: pdf ? { title: (pdf.info.match(/^Title:\s+(.*)$/m) || [])[1] || '', producer: (pdf.info.match(/^Producer:\s+(.*)$/m) || [])[1] || '', xmp: pdf.meta.trim() === '' ? 'none' : 'present' } : null };
  // 同じ page で、正常終了の後の素の Ctrl+P: Pack 画面は案内文だけ、Workspace 画面（FRESH）は従来の Workspace の資料
  await np.waitForTimeout(1200);
  const h = await ctrlP();
  const jh = h.files.length === 1 ? judgeOther(pdfOf(h.files[0]), 'hint') : null;
  await showView(np, 'batch');
  await np.waitForTimeout(800);
  const wsr = await ctrlP();
  const jw = wsr.files.length === 1 ? judgeOther(pdfOf(wsr.files[0]), 'workspace', ws.marker) : null;
  check('PR-K09-native-ctrl-p-after-c01-hint-and-workspace-unchanged', !!jh && jh.ok && !!jw && jw.ok && isIdleClean(wsr.state) &&
    wsr.state.last === 1, short({ jh: jh && jh.items, jw: jw && jw.items, k: jw && jw.k }));
}

// K10: ほかの 2 mode（小さな fixture）と、Pack の検証を通る敵対的な publicLabel（Bidi・@・記法）
{
  const out = [];
  for (const mode of ['project_pressure_map', 'case_direct']) {
    await reloadNative();
    const label = uniq('Synthetic Print ' + mode);
    const pack = JSON.parse(packWithLabel(mode, label));
    await prepare(np, JSON.stringify(pack), { label });
    const r = await nativePrint(null, true);
    const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
    const j = pdf ? judgePack(pdf, { label, ids: nativeIds(pack) }) : null;
    out.push({ mode, ok: d2(r.trace) && !!j && j.ok && inWindow(r.trace, r.files[0]).ok, items: j && j.items, pages: pdf && pdf.pages });
  }
  check('PR-K10-native-other-two-modes-small', out.every((x) => x.ok), short(out));
  await reloadNative();
  const adv = '‮evil‬ ⁦iso⁩ :smile: @user `code` | a';
  await prepare(np, packWithLabel('notification1458', adv), {});
  const r = await nativePrint(null, true);
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const t = pdf ? pdf.text : '';
  check('PR-K11-native-adversarial-label-visible-tokens-no-raw-bidi', d2(r.trace) && !!pdf && !BIDI_RAW.test(t) && t.includes('⟨U+202E⟩evil⟨U+202C⟩') &&
    t.includes('⟨U+2066⟩iso⟨U+2069⟩') && t.includes('＠user') && !t.includes('@user') && leaks(pdf).length === 0,
    short({ seq: traceSeq(r.trace), line: (t.split('\n').find((l) => l.includes('公開表示名')) || '').trim() }));
}

// K12 (C-05(a)): 区間内に合成の beforeprint を足す（beforeprint → beforeprint → afterprint）→ 正常終了・P
{
  await reloadNative();
  const label = uniq('Synthetic Print K12');
  await prepare(np, packWithLabel('notification1458', label), { label });
  const r = await nativePrint('extra-before-first', true);
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const j = pdf ? judgePack(pdf, { label, ids: nativeIds(fixture('notification1458')) }) : null;
  check('PR-K12-native-C05a-extra-beforeprint-revalidated-pack', traceSeq(r.trace) === 'callEnter > beforeprint+(synthetic) > beforeprint+ > afterprint > callReturn' &&
    isIdleClean(r.state) && !!j && j.ok, short({ seq: traceSeq(r.trace), j: j && j.items }));
}

// K13 (C-06(a)・C-09・C-10 ネイティブ): afterprint → beforeprint → DENY_PENDING・拒否文だけの PDF。以後の Ctrl+P（Pack・Workspace FRESH）も拒否文、
// ボタンは window.print() を呼ばない。再読み込みの後は保存なしで IDLE、明示のボタンで新しい session
{
  await reloadNative();
  const ws = await workspaceFresh(np);
  const label = uniq('Synthetic Print K13');
  await prepare(np, packWithLabel('notification1458', label), { label });
  const r = await nativePrint('after-first', true);
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const j = pdf ? judgeOther(pdf, 'blocked-deny', ws.marker) : null;
  check('PR-K13-native-C06a-deny-blocked-pdf', /^callEnter > afterprint\(synthetic\) > beforeprint- > afterprint > callReturn$/.test(traceSeq(r.trace)) &&
    isDeny(r.state) && !!j && j.ok && flatCount(pdf.text, label) === 0, short({ seq: traceSeq(r.trace), j: j && j.items, k: j && j.k }));
  await np.waitForTimeout(800);
  const c1 = await ctrlP();
  await showView(np, 'batch');
  await np.waitForTimeout(800);
  const c2 = await ctrlP();
  const j1 = c1.files.length === 1 ? judgeOther(pdfOf(c1.files[0]), 'blocked-deny', ws.marker) : null;
  const j2 = c2.files.length === 1 ? judgeOther(pdfOf(c2.files[0]), 'blocked-deny', ws.marker) : null;
  await showView(np, 'pack');
  const click = await nativePrint(null, false);
  check('PR-K14-native-deny-ctrl-p-every-view-blocked-button-no-print', ws.fresh && !!j1 && j1.ok && !!j2 && j2.ok && isDeny(c2.state) &&
    click.files.length === 0 && !click.trace.some((x) => x.ev === 'callEnter') && isDeny(click.state) && click.state.last === 1,
    short({ j1: j1 && j1.items, j2: j2 && j2.items, click: click.trace.length }));
  await np.reload();
  await np.waitForTimeout(150);
  await np.evaluate(OBSERVE);
  const rs = await printState(np);
  const store = await np.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    idb: indexedDB.databases ? (await indexedDB.databases()).length : 0, url: location.search + location.hash }));
  const label2 = uniq('Synthetic Print K13 after reload');
  await prepare(np, packWithLabel('notification1458', label2), { label: label2 });
  await np.waitForTimeout(800);
  const again = await nativePrint(null, true);
  const pdf2 = again.files.length === 1 ? pdfOf(again.files[0]) : null;
  const ja = pdf2 ? judgePack(pdf2, { label: label2, ids: nativeIds(fixture('notification1458')) }) : null;
  check('PR-K15-native-C10-reload-only-recovery', isIdleClean(rs) && rs.last === 0 && same(store, { local: 0, session: 0, cookie: '', idb: 0, url: '' }) &&
    d2(again.trace) && !!ja && ja.ok && flatCount(pdf2.text, label) === 0 && again.state.last === 1, short({ rs, store, ja: ja && ja.items }));
}

// K16 / K17 (C-06(b)(c)): 正常な beforeprint の後の異常 → DENY_PENDING。出力済みの P は取り消さない（PDF は P）
for (const [id, inj, expect] of [['PR-K16-native-C06b-second-afterprint-deny-pack-already-out', 'after-after', 'callEnter > beforeprint+ > afterprint > afterprint(synthetic) > callReturn'],
  ['PR-K17-native-C06c-beforeprint-after-afterprint-deny-pack-already-out', 'after-before', 'callEnter > beforeprint+ > afterprint > beforeprint-(synthetic) > callReturn']]) {
  await reloadNative();
  const label = uniq('Synthetic Print ' + inj);
  await prepare(np, packWithLabel('notification1458', label), { label });
  const r = await nativePrint(inj, true);
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const j = pdf ? judgePack(pdf, { label, ids: nativeIds(fixture('notification1458')) }) : null;
  check(id, traceSeq(r.trace) === expect && isDeny(r.state) && !!j && j.ok, short({ seq: traceSeq(r.trace), j: j && j.items }));
}

// K18 / K19 (C-08(b)(c)): S1 の正常終了の後の S2
{
  await reloadNative();
  const l1 = uniq('Synthetic Print S1');
  await prepare(np, packWithLabel('notification1458', l1), { label: l1 });
  const s1 = await nativePrint(null, true);
  await np.waitForTimeout(800);
  const s2 = await nativePrint('after-first', true);
  const pdf = s2.files.length === 1 ? pdfOf(s2.files[0]) : null;
  const j = pdf ? judgeOther(pdf, 'blocked-deny') : null;
  check('PR-K18-native-C08b-early-afterprint-in-s2-deny-no-s1-content', d2(s1.trace) && isDeny(s2.state) && s2.state.last === 2 && !!j && j.ok &&
    flatCount(pdf.text, l1) === 0, short({ s2: traceSeq(s2.trace), j: j && j.items, k: j && j.k }));
  await reloadNative();
  const la = uniq('Synthetic Print S1');
  const lb = uniq('Synthetic Print S2');
  await prepare(np, packWithLabel('notification1458', la), { label: la });
  const a = await nativePrint(null, true);
  await prepare(np, packWithLabel('project_pressure_map', lb), { label: lb });
  await np.waitForTimeout(800);
  const b = await nativePrint('extra-before-first', true);
  const pb = b.files.length === 1 ? pdfOf(b.files[0]) : null;
  const jb = pb ? judgePack(pb, { label: lb, ids: nativeIds(fixture('project_pressure_map')) }) : null;
  check('PR-K19-native-C08c-extra-beforeprint-only-s2-printed', d2(a.trace) && /^callEnter > beforeprint\+\(synthetic\) > beforeprint\+ > afterprint > callReturn$/.test(traceSeq(b.trace)) &&
    isIdleClean(b.state) && b.state.last === 2 && !!jb && jb.ok && flatCount(pb.text, la) === 0 &&
    b.trace.filter((x) => x.ev === 'beforeprint').every((x) => x.rootSession === '2'), short({ seq: traceSeq(b.trace), jb: jb && jb.items }));
}

// K20 (X-2): 区間内の handler の例外 → DENY_PENDING・拒否文だけ。K21 (X-3): window.print() の例外 → PDF 0。K22 (C-02(a)): beforeprint だけで戻る → PDF 0
{
  await reloadNative();
  await prepare(np, fixtureText('case_direct'), {});
  await np.evaluate(() => { window.projectPackPrintSessionIsLive = () => { throw new Error('synthetic handler fault'); }; });
  const r = await nativePrint(null, true);
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const j = pdf ? judgeOther(pdf, 'blocked-deny') : null;
  check('PR-K20-native-X2-handler-exception-deny-blocked-pdf', isDeny(r.state) && !!j && j.ok, short({ seq: traceSeq(r.trace), j: j && j.items, k: j && j.k }));
  for (const [id, inj] of [['PR-K21-native-X3-print-throws-no-pdf-deny', 'throw'], ['PR-K22-native-C02a-beforeprint-only-no-pdf-deny', 'before-only']]) {
    await reloadNative();
    await prepare(np, fixtureText('case_direct'), {});
    const x = await nativePrint(inj, false);
    check(id, x.files.length === 0 && isDeny(x.state) && x.trace.some((e) => e.ev === 'callReturn'), short({ seq: traceSeq(x.trace), files: x.files.length }));
  }
}

// K23 (X-1): model の生成の失敗 → window.print() を呼ばない・PDF 0・IDLE。次の押下は新しい session で P
// K24: 印刷の直前（ネイティブの beforeprint）に Review が古くなった → その印刷は拒否文だけ・IDLE・固定文
{
  await reloadNative();
  const label = uniq('Synthetic Print K23');
  await prepare(np, packWithLabel('case_direct', label), { label });
  await np.evaluate(() => { window.__failPrintModel = true; });
  const f = await nativePrint(null, false);
  const r = await nativePrint(null, true);
  const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
  const j = pdf ? judgePack(pdf, { label, ids: nativeIds(fixture('case_direct')) }) : null;
  check('PR-K23-native-X1-failure-before-print-no-pdf-then-retry', f.files.length === 0 && !f.trace.some((x) => x.ev === 'callEnter') &&
    isIdleClean(f.state) && f.state.status === FAILURE && d2(r.trace) && !!j && j.ok && r.state.last === 2, short({ f: f.state.status, j: j && j.items }));
  await np.waitForTimeout(800);
  await np.evaluate(() => { window.__staleAtBefore = true; });
  const s = await nativePrint(null, true);
  const ps = s.files.length === 1 ? pdfOf(s.files[0]) : null;
  const js = ps ? judgeOther(ps, 'blocked') : null;
  check('PR-K24-native-stale-at-beforeprint-blocked-pdf-idle', traceSeq(s.trace) === 'callEnter > beforeprint- > afterprint > callReturn' &&
    isIdleClean(s.state) && s.state.status.startsWith(REFUSED_HEAD) && !!js && js.ok && js.k.blockedReload === 0, short({ seq: traceSeq(s.trace), js: js && js.items }));
}

// 全量 matrix（ローカル。PACK_PRINT_MATRIX=full）: 2000 ケース × 3 mode × 詳細 0 / 50 × 比較なし / あり
const matrix = [];
if (MATRIX) {
  for (const mode of MODES) {
    for (const details of [0, 50]) {
      for (const cmp of [false, true]) {
        await reloadNative();
        const label = uniq('Synthetic Print M ' + mode + ' ' + details + (cmp ? ' cmp' : ''));
        const pack = syntheticPack(2000, mode, { label });
        const ids = nativeIds(pack);
        const t0 = Date.now();
        await prepare(np, JSON.stringify(pack), { label, details: ids.slice(0, details), compare: cmp ? [ids[0], ids[1999]] : null });
        const prep = Date.now() - t0;
        const t1 = Date.now();
        const r = await nativePrint(null, true);
        const ms = Date.now() - t1;
        const pdf = r.files.length === 1 ? pdfOf(r.files[0]) : null;
        const j = pdf ? judgePack(pdf, { label, ids, detailIds: ids.slice(0, details), compare: cmp ? [ids[0], ids[1999]] : null }) : null;
        const w = pdf ? inWindow(r.trace, r.files[0]) : null;
        matrix.push({ mode, details, comparison: cmp, ok: d2(r.trace) && !!j && j.ok && !!w && w.ok, rows: j && j.rows, pages: pdf && pdf.pages,
          bytes: pdf && pdf.bytes, prepareMs: prep, clickToPdfMs: ms, createdMinusReturnMs: w && w.createdMinusReturn, failed: j ? Object.keys(j.items).filter((k) => !j.items[k]) : ['no pdf'] });
        await np.waitForTimeout(600);
      }
    }
  }
  check('PR-M01-full-matrix-12-native-pdfs', matrix.length === 12 && matrix.every((m) => m.ok), short(matrix.map((m) => [m.mode, m.details, m.comparison, m.ok, m.failed])));
}

// 合成の証拠の画像（指定したときだけ。数ページを低解像度の PNG で書き出す。PDF は残さない）
if (EVIDENCE_DIR) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shots = [];
  await reloadNative();
  await prepare(np, fixtureText('notification1458'), { details: ['G002'], compare: ['G001', 'G003'] });
  const r = await nativePrint(null, true);
  if (r.files.length === 1) shots.push(['pack-print-notification-p1', path.join(OUT, r.files[0]), 1]);
  if (k01 && k01.pdf) {
    const kf = Object.keys(files).find((f) => f === k01.pdf.file);
    if (kf) shots.push(['pack-print-2000-cases-p10', path.join(OUT, kf), 10]);
  }
  await np.waitForTimeout(800);
  const d = await nativePrint('after-first', true);
  if (d.files.length === 1) shots.push(['pack-print-deny-pending', path.join(OUT, d.files[0]), 1]);
  await reloadNative();
  await showView(np, 'pack');
  const h = await ctrlP();
  if (h.files.length === 1) shots.push(['pack-print-ctrl-p-hint', path.join(OUT, h.files[0]), 1]);
  for (const [name, file, pageNo] of shots) {
    sh('pdftoppm', ['-png', '-r', '50', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', file, path.join(EVIDENCE_DIR, name)]);
  }
  measurements.evidence = shots.map((s) => s[0] + '.png');
}

clearInterval(poll);
await ctx.close();
await browser.close();

// 全体: 通信・console・ダウンロード・ページの例外・保存なし
{
  const errors = logs.flatMap((l) => l.errors);
  const consoleOut = logs.flatMap((l) => l.console);
  const requests = logs.flatMap((l) => l.requests || []);
  const downloads = logs.flatMap((l) => l.downloads);
  check('PR-Z01-no-network-console-download-or-page-error', errors.length === 0 && consoleOut.length === 0 && requests.length === 0 &&
    blocked.length === 0 && downloads.length === 0, short({ errors, consoleOut: consoleOut.slice(0, 3), requests: requests.length, blocked: blocked.length, downloads }));
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(results.join('\n'));
console.log('environment: Playwright via ' + playwrightSource + '; headless ' + browser.version() + '; native headed ' + nativeVersion +
  ' (--kiosk-printing, Save as PDF, headers and footers off, virtual display); Poppler ' + popplerVersion + '; XTest ' + env.xtest);
console.log('measurements: ' + JSON.stringify(Object.assign({ matrix: MATRIX ? matrix : 'not run (set PACK_PRINT_MATRIX=full)' }, measurements)));
finishRun(INSTRUMENT, pass + fail, fail, { nativeChromium: nativeVersion, poppler: popplerVersion, matrix: MATRIX ? 'full' : 'representative' });
