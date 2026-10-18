'use strict';

/**
 * Phase 2L-B2 / S3-B3B2-C1-B: index.html の Pack Review の出力（ProjectPackReviewExport を Project Pack 画面へ接続する UI だけ）。
 *
 *   - 経路は currentProjectPackReview の state（review・batch・ctx）→ ProjectPackReviewExport.toMarkdown() /
 *     serializeJson() → 読み取り専用の textarea。書き出しは C1-A の module のまま（この UI で作り直さない）
 *   - 作るのは「Markdownを表示」「JSONを表示」を押したときだけ。Review の生成・画面の切替・ページの切替では作らない。
 *     出力は常に 1 つ（別の形式で置き換える）
 *   - 作る直前と表示を確定する直前に、state が表示中の review と同じ・既存の鮮度の確認（projectPackReviewIsCurrent）・
 *     作成時の試行・選択の一致・review が発行物であることを確かめる。発行元は module の assertReviewOrigin
 *   - Review が消える経路（12 の操作）では出力も消える。失敗は固定文で、出力だけを消す（Review・一括の結果・Pack は残す）
 *   - ダウンロード・Blob・クリップボード・保存・通信なし。staged の Pack を出力の block から直接読まない
 *
 * 前半は実行コードの静的な検査、後半は index.html の intake から出力までの block を vm で動かす挙動の検査
 * （最小の偽 DOM・手で進める setTimeout・実際の ProjectPack / ProjectContext / ProjectPackExecution / ProjectPackBatch /
 * ProjectPackReport / ProjectPackReview / ProjectPackReviewExport）。「C1-A の出力と文字列が完全に一致」は、同じ
 * review・batch・ctx を Node 側の ProjectPackReviewExport に渡した結果と比べる。数値そのものの独立した期待値は
 * tools/browser-checks/project-pack-review-export.mjs（実ブラウザ）が fixture の literal と wind-pressure.js / calc.js から作る。
 * 受け入れの番号（V01–V14）は各 test の名前に書く。
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
const Review = require('../project-config/project-pack-review.js');
const Export = require('../project-config/project-pack-review-export.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);
const EXPORT_SRC_REL = 'project-config/project-pack-review-export.js';
const EXPORT_SRC = read(EXPORT_SRC_REL);

const FIXTURE = (name) => read('tests/fixtures/project-pack/' + name + '.json');
const FIXTURES = { notification1458: FIXTURE('synthetic-notification1458'),
  project_pressure_map: FIXTURE('synthetic-project-pressure-map'), case_direct: FIXTURE('synthetic-case-direct') };
const MODES = Object.keys(FIXTURES);

const FAILURE = '出力を生成できませんでした。現在有効な出力はありません（Pack Review はそのままです）。';
const CLEARED = 'Pack Review が消えたので、出力も消しました。現在有効な出力はありません。';
const IDLE = '出力は、表示中の Pack Review から「Markdownを表示」「JSONを表示」を押したときだけ作ります。';
const USER_CLEARED = '出力を消去しました。現在有効な出力はありません。';
const SHOWN_TEXT = (label, n) => label + ' を表示しました（全 ' + n + ' ケース・未レビュー。計算済み ≠ 検証済み）。' +
  'コピーして共有する前に内容と共有先を確認してください。';
const TRUST_TEXTS = ['pack_unreviewed', 'calculated_not_verified', '計算済み ≠ 検証済み', 'OK は計算上の候補判定です。',
  'この出力は正式な案件承認の資料ではありません。'];
const SHARE_TEXT = 'この出力にはガラス寸法・設計風圧などの案件入力値が含まれます。外部へ共有する場合は、内容と共有先を確認してください。' +
  'publication advisory が 0 件でも公開安全の証明にはなりません。';
const NEGATIONS = ['正式な案件承認の資料ではありません', '計算済み ≠ 検証済み', 'calculated_not_verified', '公開安全の証明にはなりません'];
const STRONG_WORDING = /Verified|承認|確定|安全|適合|問題なし|確認済|検証済|合格|\bsafe\b|\bapproved\b|governing|支配/i;

const EXPORT_IDS = ['pack-review-export-section', 'pack-review-export-card', 'pack-review-export-title', 'pack-review-export-trust',
  'pack-review-export-share', 'btn-pack-review-export-md', 'btn-pack-review-export-json', 'btn-pack-review-export-clear',
  'pack-review-export-status', 'pack-review-export-out'];
// 既存の Pack Review 欄の id（S3-B3B2-B3 のまま。変えない）
const REVIEW_IDS = ['pack-review-section', 'pack-review-card', 'pack-review-title', 'pack-review-trust', 'pack-review-options',
  'pack-review-detail-input', 'btn-pack-review-detail-add', 'pack-review-detail-count', 'pack-review-detail-list',
  'btn-pack-review-detail-clear', 'pack-review-compare-label', 'pack-review-compare-a', 'pack-review-compare-b',
  'pack-review-options-note', 'btn-pack-review', 'btn-pack-review-clear', 'pack-review-status', 'pack-review-result'];

/** top-level の関数 1 つ（次の top-level の function / var の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar '].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}

/** 出力の block（実行コード）。module の掴みから利用者の消去の関数の終わりまで。 */
function exportCode() {
  const start = CODE.indexOf('\nvar PACK_REVIEW_EXPORT_MODULE');
  const endFn = CODE.indexOf('\nfunction clearProjectPackReviewExportByUser(');
  const end = CODE.indexOf('\n}\n', endFn) + 3;
  assert.equal(start !== -1 && endFn > start && end > endFn, true, '出力の block が無い');
  return CODE.slice(start, end);
}

function sectionOf(id) {
  const from = STATIC.indexOf('id="' + id + '"');
  const open = STATIC.lastIndexOf('<section', from);
  return STATIC.slice(open, STATIC.indexOf('</section>', from) + '</section>'.length);
}

/* ============================================================
   静的
============================================================ */

test('P2L-S3B3B2C1B-V01: script は review の後・Workspace の前に 1 度だけ。module は初期化時に 1 度だけ掴む。section は #view-pack の中で既存 2 つの section の外', () => {
  const at = (src) => HTML.indexOf('<script src="' + src + '"></script>');
  ['project-config/project-pack-review-export.js', 'project-config/project-pack-review.js'].forEach((src) =>
    assert.equal(HTML.split('<script src="' + src + '"></script>').length - 1, 1, src));
  assert.equal(at('project-config/project-pack-batch.js') < at('project-config/project-pack-report.js') &&
    at('project-config/project-pack-report.js') < at('project-config/project-pack-review.js') &&
    at('project-config/project-pack-review.js') < at('project-config/project-pack-review-export.js') &&
    at('project-config/project-pack-review-export.js') < at('workspace.js'), true, 'script の順');
  assert.match(exportCode(), /^\nvar PACK_REVIEW_EXPORT_MODULE = \(typeof ProjectPackReviewExport === 'object' && ProjectPackReviewExport\) \? ProjectPackReviewExport : null;/);
  assert.equal((CODE.match(/\bProjectPackReviewExport\b/g) || []).length, 3, 'ProjectPackReviewExport の参照が初期化の 1 行以外にある');
  // 配置: #view-pack の中、Pack Review の section の閉じタグの後（既存の 2 つの section の中には入れない）
  const view = STATIC.indexOf('id="view-pack"');
  const viewEnd = STATIC.indexOf('<div class="batch-wrap" id="view-batch"');
  const reviewEnd = STATIC.indexOf('</section>', STATIC.indexOf('id="pack-review-section"'));
  const exp = STATIC.indexOf('id="pack-review-export-section"');
  assert.equal(view < reviewEnd && reviewEnd < exp && exp < viewEnd, true, '配置');
  ['project-pack-section', 'pack-review-section'].forEach((id) =>
    assert.equal(sectionOf(id).includes('pack-review-export'), false, id + ' の中に出力を入れた'));
  // id は新しく定義したものだけで、重複しない。既存の Pack Review の id はそのまま
  EXPORT_IDS.forEach((id) => assert.equal(HTML.split('id="' + id + '"').length - 1, 1, id));
  assert.deepEqual([...sectionOf('pack-review-export-section').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).sort(), EXPORT_IDS.slice().sort());
  assert.deepEqual([...sectionOf('pack-review-section').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).sort(), REVIEW_IDS.slice().sort());
});

test('P2L-S3B3B2C1B-V02: 3 つのボタン・読み取り専用の textarea・状態の欄・常に見える信頼と共有の注意（強い判定の語なし）', () => {
  const section = sectionOf('pack-review-export-section');
  assert.match(section, /<button type="button" id="btn-pack-review-export-md" class="btn-secondary"\s+onclick="showProjectPackReviewExport\('markdown'\)" disabled>Markdownを表示<\/button>/);
  assert.match(section, /<button type="button" id="btn-pack-review-export-json" class="btn-secondary"\s+onclick="showProjectPackReviewExport\('json'\)" disabled>JSONを表示<\/button>/);
  assert.match(section, /<button type="button" id="btn-pack-review-export-clear" class="btn-secondary"\s+onclick="clearProjectPackReviewExportByUser\(\)" disabled>出力を消去<\/button>/);
  assert.match(section, /<textarea id="pack-review-export-out" rows="10" spellcheck="false" autocomplete="off" readonly hidden\s+aria-label="Pack Review の出力（読み取り専用）"><\/textarea>/);
  assert.match(section, /<div class="pack-status" id="pack-review-export-status" role="status" aria-live="polite">出力は、表示中の Pack Review から「Markdownを表示」「JSONを表示」を押したときだけ作ります。<\/div>/);
  assert.equal((section.match(/<button\b/g) || []).length, 3);
  assert.equal(/<a\b|download=|<input|<form|contenteditable/.test(section), false, 'download・入力・link を置いた');
  const trust = section.slice(section.indexOf('id="pack-review-export-trust"'), section.indexOf('</div>', section.indexOf('id="pack-review-export-trust"')));
  TRUST_TEXTS.forEach((t) => assert.equal(trust.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), true, t));
  assert.equal(section.replace(/\s+/g, '').includes(SHARE_TEXT.replace(/\s+/g, '')), true, '共有の注意');
  // 信頼と共有の注意は操作の前にあり、折りたたみの中に入れない（常に見える）
  assert.equal(section.indexOf('id="pack-review-export-trust"') < section.indexOf('id="btn-pack-review-export-md"'), true);
  assert.equal(section.indexOf('id="pack-review-export-share"') < section.indexOf('id="btn-pack-review-export-md"'), true);
  assert.equal(/<details/.test(section), false);
  // 信頼の文言は 12px・--text2（全体の .notice の 11px・--text3 に上書きされない selector）。全体の .notice は変えない
  assert.match(STATIC, /\n  \.notice\.pack-review-export-trust \{[^}]*font-size: 12px;[^}]*color: var\(--text2\);/);
  assert.match(STATIC, /\n  textarea#pack-review-export-out\[hidden\] \{ display: none; \}/);
  // 強い判定の語を使わない（否定として必要な文を除く）
  const literals = (exportCode().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
  let text = section.replace(/<[^>]+>/g, '') + '\n' + literals;
  NEGATIONS.forEach((n) => { text = text.split(n).join(''); });
  assert.equal(STRONG_WORDING.test(text), false, (text.match(STRONG_WORDING) || [])[0]);
});

test('P2L-S3B3B2C1B-V03: 出力は showProjectPackReviewExport の中だけで作る。作る直前と確定の直前に確かめ、staged の Pack を直接読まない', () => {
  const block = exportCode();
  assert.equal(/stagedProjectPack/.test(block), false, '出力の block が staged の Pack を直接読んでいる');
  assert.equal((CODE.match(/showProjectPackReviewExport\(/g) || []).length, 1, 'コードから出力を作っている（定義の 1 か所だけのはず）');
  assert.equal(STATIC.split('showProjectPackReviewExport(').length - 1, 2, 'ボタン以外の markup から出力を作っている');
  assert.equal((CODE.match(/PACK_REVIEW_EXPORT_MODULE\.toMarkdown\(/g) || []).length, 1);
  assert.equal((CODE.match(/PACK_REVIEW_EXPORT_MODULE\.serializeJson\(/g) || []).length, 1);
  const show = fnBody('showProjectPackReviewExport');
  const at = (s) => { const i = show.indexOf(s); assert.notEqual(i, -1, s); return i; };
  const checks = [...show.matchAll(/if \(!projectPackReviewExportIsCurrent\(state\)\) throw/g)].map((m) => m.index);
  assert.equal(checks.length, 2, '確かめるのは 2 回（作る直前と確定の直前）');
  assert.equal(at('var state = currentProjectPackReview;') < checks[0], true);
  assert.equal(checks[0] < at('PACK_REVIEW_EXPORT_MODULE.toMarkdown(state.review, state.batch, state.ctx)'), true);
  assert.equal(at('PACK_REVIEW_EXPORT_MODULE.serializeJson(state.review, state.batch, state.ctx)') < checks[1], true);
  assert.equal(checks[1] < at('out.value = text;'), true, '確定の直前に確かめていない');
  assert.equal(at('out.value = text;') < at('projectPackReviewExportOutput = { kind: kind, state: state };'), true);
  const cur = fnBody('projectPackReviewExportIsCurrent');
  ['state === currentProjectPackReview', 'PACK_REVIEW_MODULE.isPackReview(state.review)',
    'projectPackReviewIsCurrent(state.batch, state.ctx)', 'state.attempt === projectPackAttempt',
    'projectPackReviewSelectionMatches(state)'].forEach((s) => assert.equal(cur.includes(s), true, s));
  // 失敗は固定文（例外の文面を出さない）
  assert.match(show, /\} catch \(e\) \{\n    clearProjectPackReviewExport\(PROJECT_PACK_REVIEW_EXPORT_FAILURE, true\);/);
  assert.equal(/e\.message|e\.stack|String\(e\)/.test(block), false);
  // ダウンロード・Blob・クリップボード・保存・通信・console・HTML の文字列への書き込みなし
  ['Blob', 'createObjectURL', 'download', 'clipboard', 'execCommand', 'navigator', 'localStorage', 'sessionStorage',
    'indexedDB', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'console.', 'innerHTML', 'outerHTML', 'insertAdjacentHTML',
    'location', 'history.', 'window.open', 'setTimeout', 'postMessage']
    .forEach((token) => assert.equal(block.includes(token), false, '出力の block が ' + token + ' を使っている'));
  // 出力の block が触れる要素は自分の欄だけ。Review・一括の結果・Pack の state を書き換えない
  const ids = [...block.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)].filter((id) => !EXPORT_IDS.includes(id)), []);
  assert.equal(/currentProjectPackReview\s*=(?!=)|projectPackAttempt\s*(?:\+\+|\+=|=(?!=))|projectPackBatchOrigin\s*=(?!=)|clearProjectPackReview\(|clearProjectPackBatch\(|generateProjectPackReview\(|buildPackReview\(/.test(block), false);
});

test('P2L-S3B3B2C1B-V04: 既存の関数に加えたのは 2 つの連携の hook だけ（Review の生成・選択・集計・グループ・比較は変えない）', () => {
  const clear = fnBody('clearProjectPackReview');
  assert.equal(clear.endsWith('  clearProjectPackReviewExportForReview();\n}\n') || clear.trimEnd().endsWith('clearProjectPackReviewExportForReview();\n}'), true, 'clearProjectPackReview の最後で出力を消す');
  assert.match(fnBody('renderProjectPackReviewControls'), /renderProjectPackReviewDetailList\(\);\n\s*renderProjectPackReviewExportControls\(\);\n\}/);
  // 出力の関数を呼ぶ既存の関数はこの 2 つだけ
  const start = CODE.indexOf('\nvar MAX_PROJECT_PACK_IMPORT_BYTES');
  const exportStart = CODE.indexOf('\nvar PACK_REVIEW_EXPORT_MODULE');
  const callers = CODE.slice(start, exportStart).split('\nfunction ').slice(1)
    .filter((f) => /ProjectPackReviewExport|projectPackReviewExport/.test(f)).map((f) => f.slice(0, f.indexOf('(')));
  assert.deepEqual(callers.sort(), ['clearProjectPackReview', 'renderProjectPackReviewControls']);
  // 出力の block の外（Pack の block より後）から出力の関数を呼ばない
  const after = CODE.slice(CODE.indexOf('\n}\n', CODE.indexOf('\nfunction clearProjectPackReviewExportByUser(')) + 3);
  assert.equal(/ProjectPackReviewExport|projectPackReviewExport/.test(after), false);
});

/* ============================================================
   挙動: intake から出力までの block を vm で動かす
============================================================ */

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this._text = '';
    this.children = [];
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this._value = '';
    this.attrs = {};
    const set = new Set();
    this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  }
  // textarea の value は改行を LF にそろえる（ブラウザと同じ正規化。出力に CR は含まれないはず）
  get value() { return this._value; }
  set value(v) { this._value = this.tagName === 'textarea' ? String(v).replace(/\r\n?/g, '\n') : String(v); }
  get textContent() { return [this._text].concat(this.children.map((c) => c.textContent)).filter(Boolean).join('\n'); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  items(tag) {
    const out = [];
    const visit = (el) => { if (el.tagName === tag) out.push(el); el.children.forEach(visit); };
    visit(this);
    return out;
  }
  find(id) {
    if (this.id === id) return this;
    for (const c of this.children) { const f = c.find(id); if (f) return f; }
    return null;
  }
}

/** intake から出力までの block の raw text（コメント込み）と、表示に使う小さな helper。 */
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
  'btn-pack-report-csv', 'btn-pack-report-clear', 'pack-report-status', 'pack-report-out'].concat(REVIEW_IDS, EXPORT_IDS);

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

/** batch module（と executor）に合わせた review module と、その review module を依存にした export module（vm で初期化）。 */
function modulesOver(batchModule) {
  const rsb = { ProjectPackBatch: batchModule, ProjectPackExecution: Exec };
  vm.createContext(rsb);
  vm.runInContext(read('project-config/project-pack-review.js'), rsb, { filename: 'project-pack-review.js' });
  const esb = { ProjectPackReview: rsb.ProjectPackReview };
  vm.createContext(esb);
  vm.runInContext(EXPORT_SRC, esb, { filename: EXPORT_SRC_REL });
  return { review: rsb.ProjectPackReview, exportModule: esb.ProjectPackReviewExport };
}

/** 上限だけを変えた export module（依存は本物の ProjectPackReview）。 */
function exportWithCap(bytes) {
  const decl = 'var MAX_OUTPUT_BYTES = 8 * 1024 * 1024;';
  assert.equal(EXPORT_SRC.split(decl).length - 1, 1, '前提: 上限の宣言は 1 か所');
  const sb = { ProjectPackReview: Review };
  vm.createContext(sb);
  vm.runInContext(EXPORT_SRC.replace(decl, 'var MAX_OUTPUT_BYTES = ' + bytes + ';'), sb, { filename: EXPORT_SRC_REL });
  return sb.ProjectPackReviewExport;
}

/** 呼び出しを記録する export module（hook で途中に割り込める）。 */
function exportSpy(real, hook) {
  const calls = [];
  const wrap = (name) => (r, b, c) => {
    calls.push({ name, review: r, batch: b, ctx: c });
    if (hook) hook(name, r, b, c);
    return real[name](r, b, c);
  };
  return { mod: Object.freeze(Object.assign({}, real, { toMarkdown: wrap('toMarkdown'), serializeJson: wrap('serializeJson') })), calls };
}

function page(options) {
  const opts = options || {};
  const els = {};
  IDS.forEach((id) => {
    els[id] = new FakeElement(/compare-[ab]$|pack-exec-case/.test(id) ? 'select' : /-out$/.test(id) ? 'textarea' :
      id === 'pack-review-detail-input' ? 'input' : 'div');
    els[id].id = id;
  });
  ['pack-exec', 'pack-exec-result', 'pack-batch', 'pack-batch-result', 'pack-batch-progress', 'pack-report-out',
    'pack-review-options', 'pack-review-result', 'pack-review-export-out'].forEach((id) => { els[id].hidden = true; });
  ['pack-exec-case', 'btn-pack-exec', 'btn-pack-batch', 'btn-pack-batch-cancel', 'btn-pack-report-json',
    'btn-pack-report-csv', 'btn-pack-report-clear', 'btn-pack-review', 'btn-pack-review-clear', 'btn-pack-review-export-md',
    'btn-pack-review-export-json', 'btn-pack-review-export-clear'].forEach((id) => { els[id].disabled = true; });
  els['pack-review-export-status'].textContent = IDLE;
  const timers = [];
  // 別の batch module を使うときは、その batch を発行物として通す review / export module の組にする
  const over = opts.batch ? modulesOver(opts.batch) : null;
  const spy = exportSpy(opts.exportModule || (over ? over.exportModule : Export), opts.hook);
  const sandbox = {
    document: {
      getElementById: (id) => {
        if (els[id]) return els[id];
        for (const root of Object.values(els)) { const f = root.find(id); if (f) return f; }
        return null;
      },
      createElement: (tag) => new FakeElement(tag)
    },
    ProjectPack: Pack, ProjectContext, ProjectPackExecution: Exec, ProjectPackBatch: opts.batch || Batch,
    ProjectPackReport: Report, ProjectPackReview: over ? over.review : Review, TextEncoder,
    JSON: { parse: (...a) => JSON.parse(...a), stringify: JSON.stringify },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    activeProjectContext: ACTIVE_SENTINEL
  };
  if (opts.exportModule !== null) sandbox.ProjectPackReviewExport = spy.mod;
  vm.createContext(sandbox);
  vm.runInContext(blockSource(), sandbox, { filename: 'index.html#project-pack' });
  const w = sandbox;
  const tick = () => { const t = timers.shift(); if (!t) return false; t(); return true; };
  const drain = () => { let n = 0; while (tick()) { n++; if (n > 100000) throw new Error('runaway'); } return n; };
  const out = els['pack-review-export-out'];
  return {
    w, els, drain, calls: spy.calls,
    load: (mode) => w.loadProjectPackText(FIXTURES[mode], '貼り付け'),
    loadPack: (pack) => w.loadProjectPackText(JSON.stringify(pack), '貼り付け'),
    runBatch: () => { w.startProjectPackBatch(); drain(); return w.stagedProjectPackBatch; },
    gen: () => w.generateProjectPackReview(),
    detail: (id) => { els['pack-review-detail-input'].value = id; return w.addProjectPackReviewDetailFromInput(); },
    compare: (a, b) => { els['pack-review-compare-a'].value = a; els['pack-review-compare-b'].value = b; w.projectPackReviewSelectionChanged(); },
    md: () => w.showProjectPackReviewExport('markdown'),
    json: () => w.showProjectPackReviewExport('json'),
    review: () => w.currentProjectPackReview,
    reviewShown: () => !els['pack-review-result'].hidden && els['pack-review-result'].children.length > 0,
    out: () => out.value,
    outShown: () => !out.hidden && out.value !== '',
    output: () => w.projectPackReviewExportOutput,
    status: () => els['pack-review-export-status'].textContent,
    statusError: () => els['pack-review-export-status'].className === 'pack-status is-error',
    buttons: () => ({ md: els['btn-pack-review-export-md'].disabled, json: els['btn-pack-review-export-json'].disabled,
      clear: els['btn-pack-review-export-clear'].disabled })
  };
}
const OFF = { md: true, json: true, clear: true };
const READY = { md: false, json: false, clear: true };
const SHOWN = { md: false, json: false, clear: false };

/** Pack を読み込み、全ケース計算・詳細と比較つきの Review の生成まで進める。 */
function ready(mode, options) {
  const p = page(options);
  assert.equal(p.load(mode), true);
  const batch = p.runBatch();
  const ids = batch.rows.map((r) => r.caseId);
  ids.slice(0, 2).forEach((id) => assert.equal(p.detail(id), true));
  p.compare(ids[0], ids[ids.length - 1]);
  assert.equal(p.gen(), true);
  return p;
}

/** 出力が無いこと（state・欄・消去のボタン）。 */
function noOutput(p, why) {
  assert.equal(p.output(), null, why + ': 出力の state が残った');
  assert.equal(p.out(), '', why + ': 出力の欄に文字が残った');
  assert.equal(p.els['pack-review-export-out'].hidden, true, why + ': 出力の欄が見えている');
  assert.equal(p.buttons().clear, true, why + ': 消去のボタンが押せる');
}

test('P2L-S3B3B2C1B-V05: Review の生成まで押せず、生成しても自動では作らない。押したときだけ表示中の state の review・batch・ctx で 1 回作る', () => {
  for (const mode of MODES) {
    const p = page();
    assert.deepEqual(p.buttons(), OFF);
    assert.equal(p.status(), IDLE);
    p.load(mode);
    assert.deepEqual(p.buttons(), OFF, 'Pack の読込だけで押せる');
    p.w.startProjectPackBatch();
    assert.deepEqual(p.buttons(), OFF, '計算中に押せる');
    p.drain();
    assert.deepEqual(p.buttons(), OFF, '全ケース計算の完了だけで押せる（Review はまだ無い）');
    assert.equal(p.md(), false, 'Review が無いのに作った');
    assert.equal(p.status(), FAILURE);
    assert.equal(p.statusError(), true);
    assert.equal(p.calls.length, 0, 'Review が無いのに module を呼んだ');
    assert.equal(p.gen(), true);
    assert.deepEqual(p.buttons(), READY);
    assert.equal(p.outShown(), false, 'Review の生成で自動的に作った');
    assert.equal(p.calls.length, 0);
    // ページ・選択（変えない）・Review の欄の操作では作らない
    p.w.showProjectPackReviewPage(0);
    p.w.projectPackReviewSelectionChanged();
    assert.equal(p.calls.length, 0);
    const state = p.review();
    assert.equal(p.md(), true);
    assert.equal(p.calls.length, 1);
    assert.equal(p.calls[0].name, 'toMarkdown');
    assert.equal(p.calls[0].review, state.review, 'state の review を渡していない');
    assert.equal(p.calls[0].batch, state.batch);
    assert.equal(p.calls[0].ctx, state.ctx);
    assert.equal(state.batch, p.w.stagedProjectPackBatch, '前提: state の batch は現在の一括結果');
    assert.deepEqual(p.buttons(), SHOWN);
    assert.equal(p.status(), SHOWN_TEXT('Markdown', state.review.totalCases));
    assert.equal(p.statusError(), false);
  }
});

test('P2L-S3B3B2C1B-V06: Markdown / JSON は C1-A の出力と文字列が完全に一致。出力は常に 1 つで、別の形式で完全に置き換える', () => {
  for (const mode of MODES) {
    const p = ready(mode);
    const s = p.review();
    const md = Export.toMarkdown(s.review, s.batch, s.ctx);
    const json = Export.serializeJson(s.review, s.batch, s.ctx);
    assert.equal(p.md(), true);
    assert.equal(p.out(), md, mode + ': Markdown');
    assert.equal(p.output().kind, 'markdown');
    assert.equal(p.json(), true);
    assert.equal(p.out(), json, mode + ': JSON（Markdown を完全に置き換える）');
    assert.equal(p.out().includes('# Pack Review（未レビュー）'), false, 'Markdown が残った');
    assert.equal(p.output().kind, 'json');
    assert.equal(p.output().state, s);
    assert.equal(p.md(), true);
    assert.equal(p.out(), md, '戻すと同じ Markdown');
    // JSON の外枠と全行（2 形式とも Review の全ケースと詳細・比較を持つ）
    const parsed = JSON.parse(json);
    assert.deepEqual(Object.keys(parsed), ['exportType', 'exportSchemaVersion', 'sourceKind', 'trust', 'interpretation', 'notices', 'review']);
    assert.equal(parsed.trust, 'pack_unreviewed');
    assert.equal(parsed.review.rows.length, s.batch.totalCases);
    assert.equal(parsed.review.selectedDetails.length, 2);
    assert.notEqual(parsed.review.comparison, null);
    // 押すたびに作り直すだけで、Review・一括の結果は変えない
    assert.equal(p.review(), s);
    assert.equal(p.w.stagedProjectPackBatch, s.batch);
  }
});

test('P2L-S3B3B2C1B-V07: 現在の state・発行元・選択と一致しない Review からは出力しない（作る直前・確定の直前・module の assertReviewOrigin）', () => {
  // 1. 確定の直前: module が書き出している間に、試行が変わる / 選択が変わる / 新しい計算が始まる / Review が消える
  const cases = [
    ['attempt', (p) => vm.runInContext('projectPackAttempt += 1;', p.w)],
    ['selection', (p) => { const ids = p.review().batch.rows.map((r) => r.caseId); p.compare(ids[1], ids[0]); }],
    ['new batch', (p) => p.w.startProjectPackBatch()],
    ['review cleared', (p) => p.w.clearProjectPackReviewByUser()],
    ['review regenerated', (p) => p.w.generateProjectPackReview()]
  ];
  for (const [name, act] of cases) {
    let target = null;
    const p = ready('project_pressure_map', { hook: () => { if (target) { const t = target; target = null; act(t); } } });
    target = p;
    const before = p.review();
    assert.equal(p.md(), false, name + ': 確定の直前に変わったのに表示した');
    noOutput(p, name);
    assert.equal(p.status(), FAILURE, name);
    assert.equal(p.statusError(), true, name);
    assert.equal(p.calls.length, 1, name + ': module は 1 回だけ');
    if (name === 'attempt') assert.equal(p.review(), before, 'Review は残す（出力だけを消す）');
  }
  // 2. 作る直前: state を差し替えた（発行物でない review・別の batch・別の ctx）→ module を呼ばない
  const swaps = [
    ['json copy', (s) => Object.assign({}, s, { review: JSON.parse(JSON.stringify(s.review)) })],
    ['other batch', (s) => Object.assign({}, s, { batch: Batch.executeAll(s.ctx) })],
    ['other ctx', (s) => Object.assign({}, s, { ctx: ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.project_pressure_map))) })],
    ['old attempt', (s) => Object.assign({}, s, { attempt: s.attempt - 1 })],
    ['other selection', (s) => Object.assign({}, s, { selection: { detailCaseIds: [], comparisonCaseIds: null } })]
  ];
  for (const [name, swap] of swaps) {
    const p = ready('project_pressure_map');
    p.w.currentProjectPackReview = swap(p.review());
    assert.equal(p.md(), false, name);
    assert.equal(p.json(), false, name);
    assert.equal(p.calls.length, 0, name + ': 古い / 不一致の state で module を呼んだ');
    noOutput(p, name);
    assert.equal(p.status(), FAILURE);
  }
  // 3. UI の確認は通るが発行元が違う（別の instance の batch から作った内容の同じ review）→ module の assertReviewOrigin が拒否
  const p = ready('project_pressure_map');
  const s = p.review();
  const twinCtx = ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.project_pressure_map)));
  const twinBatch = Batch.executeAll(twinCtx);
  const twinReview = Review.buildPackReview(twinBatch, twinCtx, { detailCaseIds: s.selection.detailCaseIds.slice(),
    comparisonCaseIds: s.selection.comparisonCaseIds.slice() });
  assert.deepEqual(JSON.parse(JSON.stringify(twinReview)), JSON.parse(JSON.stringify(s.review)), '前提: 内容はまったく同じ');
  p.w.currentProjectPackReview = Object.assign({}, s, { review: twinReview });
  assert.equal(p.md(), false, '発行元の違う review から出力した');
  assert.equal(p.json(), false);
  assert.equal(p.calls.length, 2, '前提: UI の確認は通り、module まで届いた');
  noOutput(p, 'origin');
  assert.equal(p.status(), FAILURE);
  assert.throws(() => Export.toMarkdown(twinReview, s.batch, s.ctx), /is not an issued Pack review of the given batch result and context/);
});

test('P2L-S3B3B2C1B-V08: Review が消える 12 の経路で出力も消える（状態は「出力も消しました」）', () => {
  const shown = (p) => { assert.equal(p.md(), true); assert.equal(p.outShown(), true, '前提: 出力がある'); };
  const gone = (p, why) => {
    noOutput(p, why);
    assert.equal(p.review(), null, why + ': 前提: Review が消えた');
    assert.equal(p.buttons().md, true, why + ': 出力のボタンが押せる');
  };
  const paths = {
    'E01 新しい Pack の読込': (p) => p.load('case_direct'),
    'E02 読込の失敗': (p) => p.w.loadProjectPackText('{ not json', '貼り付け'),
    'E03 Pack の解除': (p) => p.w.unloadProjectPack(),
    'E04 新しい全ケース計算': (p) => p.w.startProjectPackBatch(),
    'E05 計算のキャンセル': (p) => { p.w.startProjectPackBatch(); p.w.cancelProjectPackBatch(); },
    'E07 Pack の変化による計算の中止': (p) => { p.w.startProjectPackBatch(); p.load('notification1458'); p.drain(); },
    'E08 詳細・比較の選択の変更': (p) => p.compare('', ''),
    'E09 Review の生成し直し': (p) => { assert.equal(p.gen(), true); },
    'E10 Review の生成の失敗': (p) => { const ids = p.review().batch.rows.map((r) => r.caseId); p.els['pack-review-compare-a'].value = ids[0]; p.els['pack-review-compare-b'].value = ''; assert.equal(p.gen(), false); },
    'E11 Review の消去': (p) => p.w.clearProjectPackReviewByUser(),
    'E12 ページの切替で古いと分かった': (p) => { vm.runInContext('projectPackAttempt += 1;', p.w); p.w.showProjectPackReviewPage(0); }
  };
  for (const [name, act] of Object.entries(paths)) {
    const p = ready('project_pressure_map');
    shown(p);
    act(p);
    if (name.startsWith('E09')) {
      // 生成し直した Review は新しい Review。前の Review から作った出力は消え、新しいものは押すまで作らない
      noOutput(p, name);
      assert.equal(p.status(), CLEARED, name);
      assert.deepEqual(p.buttons(), READY, name);
      continue;
    }
    gone(p, name);
    assert.equal(p.status(), CLEARED, name);
    assert.equal(p.statusError(), false, name);
  }
  // E06 計算の失敗（1 ケースだけ失敗する batch module）
  let fail = false;
  const p = ready('project_pressure_map', { batch: batchOver((id) => fail && id === 'G002') });
  shown(p);
  fail = true;
  p.w.startProjectPackBatch();
  p.drain();
  gone(p, 'E06 計算の失敗');
  assert.equal(p.w.stagedProjectPackBatch, null, '前提: 計算は失敗した');
});

test('P2L-S3B3B2C1B-V09: 失敗は固定文で出力だけを消す（Review・一括の結果・Pack は残す。例外の文面・入力値を出さない）', () => {
  const p = ready('notification1458', { hook: (name) => { if (name === 'serializeJson') throw new Error('SECRET G002 Synthetic {"x":1}'); } });
  const s = p.review();
  const batch = p.w.stagedProjectPackBatch;
  const ctx = p.w.stagedProjectPackContext;
  assert.equal(p.md(), true);
  assert.equal(p.json(), false);
  noOutput(p, 'module の失敗');
  assert.equal(p.status(), FAILURE);
  assert.equal(/SECRET|G002|Synthetic|\{/.test(p.status()), false);
  assert.equal(p.review(), s, 'Review を消した');
  assert.equal(p.reviewShown(), true, 'Review の表示を消した');
  assert.equal(p.w.stagedProjectPackBatch, batch, '一括の結果を消した');
  assert.equal(p.w.stagedProjectPackContext, ctx, 'Pack を消した');
  assert.deepEqual(p.buttons(), READY, '失敗の後も押せる（Review は現在のまま）');
  assert.equal(p.md(), true, '失敗の後にもう一度作れる');
  // 未知の形式
  assert.equal(p.w.showProjectPackReviewExport('csv'), false);
  noOutput(p, '未知の形式');
  assert.equal(p.status(), FAILURE);
  assert.equal(p.review(), s);
});

test('P2L-S3B3B2C1B-V10: export module が無くても Review の生成・表示・消去は動き、出力のボタンは押せない', () => {
  const p = page({ exportModule: null });
  assert.equal(p.load('case_direct'), true);
  p.runBatch();
  assert.equal(p.gen(), true);
  assert.equal(p.reviewShown(), true);
  assert.deepEqual(p.buttons(), OFF);
  assert.equal(p.md(), false);
  noOutput(p, 'module なし');
  assert.equal(p.status(), FAILURE);
  assert.equal(p.reviewShown(), true, 'Review の表示を消した');
  assert.equal(p.w.clearProjectPackReviewByUser(), true);
  assert.equal(p.review(), null);
  assert.equal(p.reviewShown(), false);
  assert.equal(vm.runInContext('PACK_REVIEW_EXPORT_MODULE', p.w), null);
  // 初期化の後に global を置いても使わない（初期化時に 1 度だけ掴む）
  p.w.ProjectPackReviewExport = Export;
  assert.equal(p.gen(), true);
  assert.deepEqual(p.buttons(), OFF);
  assert.equal(p.md(), false);
});

test('P2L-S3B3B2C1B-V11: 8 MiB の上限を超える出力は表示しない（一部も出さない）。上限は module の契約のまま', () => {
  const real = ready('project_pressure_map');
  const s = real.review();
  const mdBytes = Buffer.byteLength(Export.toMarkdown(s.review, s.batch, s.ctx), 'utf8');
  const jsonBytes = Buffer.byteLength(Export.serializeJson(s.review, s.batch, s.ctx), 'utf8');
  const cap = Math.min(mdBytes, jsonBytes) - 1;
  const p = ready('project_pressure_map', { exportModule: exportWithCap(cap) });
  assert.equal(p.md(), false);
  noOutput(p, 'Markdown の上限');
  assert.equal(p.status(), FAILURE);
  assert.equal(p.json(), false);
  noOutput(p, 'JSON の上限');
  assert.equal(p.reviewShown(), true, 'Review は残す');
  // ちょうど上限なら表示する（一部を削った出力ではない）
  const q = ready('project_pressure_map', { exportModule: exportWithCap(Math.max(mdBytes, jsonBytes)) });
  assert.equal(q.md(), true);
  assert.equal(Buffer.byteLength(q.out(), 'utf8'), mdBytes);
  assert.equal(q.json(), true);
  assert.equal(Buffer.byteLength(q.out(), 'utf8'), jsonBytes);
  assert.equal(Export.MAX_OUTPUT_BYTES, 8 * 1024 * 1024);
});

test('P2L-S3B3B2C1B-V12: 画面・ページの切替と Report の消去では作り直さない・消さない。利用者の消去は出力だけを消す', () => {
  const pack = syntheticPack(120, 'project_pressure_map', { label: 'Synthetic Export Paging' });
  const p = page();
  assert.equal(p.loadPack(pack), true);
  p.runBatch();
  assert.equal(p.gen(), true);
  assert.equal(p.json(), true);
  const text = p.out();
  const calls = p.calls.length;
  [1, 2, 0].forEach((n) => assert.equal(p.w.showProjectPackReviewPage(n), true));
  p.w.clearProjectPackReportByUser();
  p.w.projectPackReviewSelectionChanged();   // 選択を変えていない（Review は一致したまま）
  assert.equal(p.out(), text, 'ページ・Report の消去・選択の確認で出力が変わった');
  assert.equal(p.calls.length, calls, '作り直した');
  assert.deepEqual(p.buttons(), SHOWN);
  const s = p.review();
  assert.equal(p.w.clearProjectPackReviewExportByUser(), true);
  noOutput(p, '利用者の消去');
  assert.equal(p.status(), USER_CLEARED);
  assert.equal(p.review(), s, '出力の消去で Review を消した');
  assert.deepEqual(p.buttons(), READY);
});

test('P2L-S3B3B2C1B-V13: 2000 ケース × 3 mode × 2 形式を、C1-A の出力と同じ文字列で省略せずに表示する', () => {
  for (const mode of MODES) {
    const p = page();
    assert.equal(p.loadPack(syntheticPack(2000, mode)), true);
    p.runBatch();
    const ids = p.w.stagedProjectPackBatch.rows.map((r) => r.caseId);
    ids.slice(0, 50).forEach((id) => assert.equal(p.detail(id), true));
    p.compare(ids[0], ids[1999]);
    assert.equal(p.gen(), true);
    const s = p.review();
    assert.equal(p.md(), true);
    assert.equal(p.out() === Export.toMarkdown(s.review, s.batch, s.ctx), true, mode + ': Markdown');
    const rowLines = p.out().split('\n').filter((line) => /^\| G\d{4} \| /.test(line));
    assert.equal(rowLines.length >= 2000, true, mode + ': Markdown の行');
    const listed = new Set(rowLines.map((line) => line.split(' | ')[0].slice(2)));
    assert.equal(ids.every((id) => listed.has(id)), true, mode + ': 欠けたケース');
    assert.equal(p.json(), true);
    assert.equal(p.out() === Export.serializeJson(s.review, s.batch, s.ctx), true, mode + ': JSON');
    const parsed = JSON.parse(p.out());
    assert.equal(parsed.review.rows.length, 2000);
    assert.equal(parsed.review.rows.every((r, i) => r.caseId === ids[i]), true, mode + ': JSON の並び');
    assert.equal(parsed.review.selectedDetails.length, 50);
    assert.equal(Buffer.byteLength(p.out(), 'utf8') <= Export.MAX_OUTPUT_BYTES, true);
  }
});

test('P2L-S3B3B2C1B-V14: 保存・通信・ダウンロード・クリップボード・console なし。active context・入力 package・Workspace へ流さない', () => {
  const touched = [];
  const spy = (name) => new Proxy(function () {}, {
    get(_t, k) { touched.push(name + '.' + String(k)); return spy(name + '.' + String(k)); },
    apply() { touched.push(name + '()'); return undefined; }
  });
  const p = page();
  ['localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'navigator', 'console', 'Blob', 'URL', 'window',
    'location', 'history', 'WorkspaceCore', 'ProjectInput', 'ReviewPackage'].forEach((name) => { p.w[name] = spy(name); });
  p.load('notification1458');
  p.runBatch();
  assert.equal(p.gen(), true);
  assert.equal(p.md(), true);
  assert.equal(p.json(), true);
  assert.equal(p.w.clearProjectPackReviewExportByUser(), true);
  assert.deepEqual(touched, []);
  assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL, 'active context を変えた');
  // 出力の欄は読み取り専用（markup）で、コピーは利用者が手で行う
  assert.match(sectionOf('pack-review-export-section'), /<textarea id="pack-review-export-out"[^>]*\sreadonly\s/);
});
