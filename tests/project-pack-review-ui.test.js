'use strict';

/**
 * Phase 2L-B2 / S3-B3B2-B3: index.html の Pack Review（ProjectPackReview を Project Pack 画面へ接続する UI だけ）。
 *
 *   - 作るのは「Pack Reviewを生成」を押したときだけ。読込・preview・ケースの選択・計算の完了・ページの切替・
 *     選択の変更では作らない
 *   - 経路は stagedProjectPackBatch + stagedProjectPackContext → ProjectPackReview.buildPackReview() →
 *     assertPackReview() → 表示。発行元の確認は module（assertBatchOrigin）。UI の確認はその代わりではない
 *   - 作る直前と表示を確定する直前に、発行物・現在の結果と context・作成時の試行・計算中でないことを確かめる
 *   - 値は review の発行物から読む（UI で余裕比・差・集計・グループを作り直さない）。null は「—」（0 にしない）
 *   - 新しい Pack の読込開始・読込失敗・解除・計算の開始・キャンセル・計算の失敗・context の変化・生成の失敗・
 *     選択の変更（前の review と一致しなくなった）で消える
 *   - 失敗は固定文。保存・通信・console・innerHTML なし。active context・入力 package・Workspace・Evidence へ流さない
 *
 * 前半は実行コードの静的な検査、後半は index.html の intake から Pack Review までの block を vm で動かす
 * 挙動の検査（最小の偽 DOM・手で進める setTimeout・実際の ProjectPack / ProjectContext / ProjectPackExecution /
 * ProjectPackBatch / ProjectPackReport / ProjectPackReview）。実ブラウザは tools/browser-checks/project-pack-review.mjs。
 * 受け入れの番号（R01–R34）は各 test の名前に書く。
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
const { inlineScripts, stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);
const REVIEW_SRC_REL = 'project-config/project-pack-review.js';
const REVIEW_SRC = read(REVIEW_SRC_REL);

const FIXTURE = (name) => read('tests/fixtures/project-pack/' + name + '.json');
const FIXTURES = { notification1458: FIXTURE('synthetic-notification1458'),
  project_pressure_map: FIXTURE('synthetic-project-pressure-map'), case_direct: FIXTURE('synthetic-case-direct') };
const MODES = Object.keys(FIXTURES);

const FAILURE_TEXT = 'Pack Review を生成できませんでした。現在有効な Review はありません。';
const NOT_READY_TEXT = 'Project Pack を読み込み、全ケース計算を完了すると Pack Review を生成できます。';
const IDLE_TEXT = 'Pack Review は「Pack Reviewを生成」を押したときだけ作ります。詳細・比較は、選んでから生成すると表示します。';
const CLEARED_TEXT = '全ケース計算の結果が変わったので、Pack Review を消しました。現在有効な Review はありません。';
const STALE_TEXT = '詳細・比較の選択が変わったので、前の Pack Review を消しました。「Pack Reviewを生成」を押すと新しい選択で作ります。現在有効な Review はありません。';
const DETAIL_UNKNOWN = 'そのケースは全ケース計算の結果にありません（入力した文字列は表示しません）。詳細には追加していません。';
const DETAIL_DUPLICATE = 'そのケースはすでに詳細に選んでいます。重複しては追加しません。';
const DETAIL_LIMIT = '詳細に選べるのは最大 50 件です。これ以上は追加しません（選択を切り詰めることもしません）。';
const DETAIL_TOO_MANY = '詳細の選択が 50 件を超えているため、Pack Review を生成しませんでした（切り詰めません）。現在有効な Review はありません。';
const COMPARE_INCOMPLETE = '比較は A と B の 2 ケースを選んでください（片方だけでは比較しません）。現在有効な Review はありません。';
const COMPARE_SAME = '比較の A と B に同じケースは選べません。現在有効な Review はありません。';
const NO_CANDIDATE = '—（推奨候補なし）';
const NO_VALUE = '—（片方に値なし）';
const TRUST_TEXTS = ['pack_unreviewed', 'calculated_not_verified', '計算済み ≠ 検証済み', 'OK は計算上の候補判定です。',
  '案件原典（構造計算書・図面など）とメーカー検討で確認してください。', 'この Review は正式な案件承認の資料ではありません。'];
// 否定として必要な文（これを除いた残りに強い語を使わない）
const NEGATIONS = ['正式な案件承認の資料ではありません', '安全性の判定・承認ではありません', 'どちらが案件に適合するかを判定するものではありません',
  '計算済み ≠ 検証済み', 'calculated_not_verified'];
const STRONG_WORDING = /Verified|承認|確定|安全|適合|問題なし|確認済|検証済|合格|\bsafe\b|\bapproved\b|governing|支配/i;

/** top-level の関数 1 つ（次の top-level の function / var の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar '].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}

/** Pack Review block（実行コード）。module の掴みから利用者の消去の関数の終わりまで。 */
function reviewCode() {
  const start = CODE.indexOf('\nvar PACK_REVIEW_MODULE');
  const end = CODE.indexOf('\nfunction ', CODE.indexOf('\nfunction clearProjectPackReviewByUser(') + 1);
  assert.equal(start !== -1 && end > start, true, 'Pack Review block が無い');
  return CODE.slice(start, end);
}

/** Pack Review の静的な section（markup）。 */
function reviewSection() {
  const from = STATIC.indexOf('<section class="pack-wrap pack-review" id="pack-review-section"');
  assert.notEqual(from, -1, 'Pack Review の section が無い');
  return STATIC.slice(from, STATIC.indexOf('</section>', from) + '</section>'.length);
}

const REVIEW_IDS = ['pack-review-section', 'pack-review-card', 'pack-review-title', 'pack-review-trust', 'pack-review-options',
  'pack-review-detail-input', 'btn-pack-review-detail-add', 'pack-review-detail-count', 'pack-review-detail-list',
  'btn-pack-review-detail-clear', 'pack-review-compare-label', 'pack-review-compare-a', 'pack-review-compare-b',
  'pack-review-options-note', 'btn-pack-review', 'btn-pack-review-clear', 'pack-review-status', 'pack-review-result'];
// 表示の中で作る要素の id（review の発行物から組み立てる）
const REVIEW_VIEW_IDS = ['pack-review-summary', 'pack-review-groups', 'pack-review-rows', 'pack-review-details', 'pack-review-comparison'];

/* ============================================================
   静的
============================================================ */

test('P2L-S3B3B2B3-U01 (R01・R28): script は execution → batch → report → review の順で 1 度だけ。module は初期化時に 1 度だけ掴む。section は #project-pack-section の外・#view-pack の中', () => {
  const at = (src) => HTML.indexOf('<script src="project-config/' + src + '"></script>');
  assert.equal(HTML.split('project-pack-review.js').length - 1, 1);
  assert.equal(at('project-pack-execution.js') !== -1 && at('project-pack-execution.js') < at('project-pack-batch.js') &&
    at('project-pack-batch.js') < at('project-pack-report.js') && at('project-pack-report.js') < at(REVIEW_SRC_REL.slice(15)) &&
    at(REVIEW_SRC_REL.slice(15)) < HTML.indexOf('<script src="workspace.js"></script>'), true, 'script の順');
  assert.match(reviewCode(), /\nvar PACK_REVIEW_MODULE = \(typeof ProjectPackReview === 'object' && ProjectPackReview\) \? ProjectPackReview : null;/);
  assert.equal((CODE.match(/(?<!\w)ProjectPackReview\b/g) || []).length, 3, 'ProjectPackReview の参照が初期化の 1 行以外にある');
  // 配置: #view-pack の中、#project-pack-section の閉じタグの後（既存 section の中には入れない）
  const view = STATIC.indexOf('id="view-pack"');
  const packSection = STATIC.indexOf('id="project-pack-section"');
  const packSectionEnd = STATIC.indexOf('</section>', packSection);
  const review = STATIC.indexOf('id="pack-review-section"');
  assert.equal(view !== -1 && view < packSection && packSectionEnd < review, true, '配置');
  assert.equal(STATIC.slice(packSection, packSectionEnd).includes('pack-review'), false, '既存の Pack section の中に Review を入れた');
  const viewEnd = STATIC.indexOf('<div class="view-panel', view + 1);
  assert.equal(viewEnd === -1 || review < viewEnd, true, '#view-pack の外に置いた');
  // id は新しく定義したものだけで、重複しない
  REVIEW_IDS.forEach((id) => assert.equal(HTML.split('id="' + id + '"').length - 1, 1, id));
  REVIEW_VIEW_IDS.forEach((id) => assert.equal(HTML.split('id="' + id + '"').length - 1, 0, id + ' を markup に置いた'));
  const sectionIds = [...reviewSection().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sectionIds.slice().sort(), REVIEW_IDS.slice().sort());
  // 全体の tr:first-child の強調（単一ケースの候補表の推奨行）を Review の表には使わない（先頭のケース・組を強調しない）
  assert.match(STATIC, /\.pack-review-table tr:first-child \{ background: none; \}/);
  assert.match(STATIC, /\.pack-review-table tr:first-child td \{ color: var\(--text2\); font-weight: 400; \}/);
  // 結果の grid は列を minmax(0, 1fr) にする（中の表の幅でページを広げない）
  assert.match(STATIC, /\.pack-review-result \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
});

test('P2L-S3B3B2B3-U02 (R01): 生成は明示操作だけ（読込・preview・ケース選択・計算の完了・ページ切替・選択の変更では作らない）', () => {
  assert.match(reviewSection(), /<button type="button" id="btn-pack-review" class="btn-secondary"\s+onclick="generateProjectPackReview\(\)" disabled>Pack Reviewを生成<\/button>/);
  assert.match(reviewSection(), /<button type="button" id="btn-pack-review-clear" class="btn-secondary"\s+onclick="clearProjectPackReviewByUser\(\)" disabled>Reviewを消去<\/button>/);
  assert.equal(STATIC.split('generateProjectPackReview(').length - 1, 1, 'ボタン以外の markup から生成を呼んでいる');
  assert.equal((CODE.match(/generateProjectPackReview\(/g) || []).length, 1, 'コードから生成を呼んでいる（定義の 1 か所だけのはず）');
  assert.equal((CODE.match(/buildPackReview\(/g) || []).length, 1, 'buildPackReview の呼び出しは 1 か所');
  assert.equal(fnBody('generateProjectPackReview').includes('PACK_REVIEW_MODULE.buildPackReview(batch, ctx, options)'), true);
  ['loadProjectPackText', 'renderProjectPackPreview', 'renderProjectPackBatchControls', 'startProjectPackBatch',
    'stepProjectPackBatch', 'showProjectPackBatchPage', 'renderProjectPackBatchResult', 'cancelProjectPackBatch',
    'clearProjectPackBatch', 'projectPackExecutionCaseChanged', 'executeSelectedProjectPackCase', 'showProjectPackReport',
    'renderProjectPackReviewControls', 'projectPackReviewSelectionChanged', 'addProjectPackReviewDetail',
    'removeProjectPackReviewDetail', 'showProjectPackReviewPage', 'setView']
    .forEach((fn) => assert.equal(/generateProjectPackReview|buildPackReview/.test(fnBody(fn)), false, fn + ' が Review を作っている'));
  // 画面の切替は Review に触れない（消さない・作り直さない）
  assert.equal(/Review|review/.test(fnBody('setView').replace(/review-config-card/g, '')), false, 'setView が Review に触れている');
});

test('P2L-S3B3B2B3-U03 (R02・R03): 作る直前と確定の直前に state を確かめ、module の発行物を assertPackReview で確かめる。options は指定どおり', () => {
  const cur = fnBody('projectPackReviewIsCurrent');
  ['PACK_REVIEW_MODULE !== null', 'PACK_BATCH_MODULE.isBatchResult(batch)', 'batch === stagedProjectPackBatch',
    'ctx === stagedProjectPackContext', 'projectPackBatchJob === null', 'projectPackBatchOrigin.batch === batch',
    'projectPackBatchOrigin.attempt === projectPackAttempt', 'projectPackBatchOrigin.ctx === ctx']
    .forEach((s) => assert.equal(cur.includes(s), true, s));
  const gen = fnBody('generateProjectPackReview');
  assert.match(gen, /^function generateProjectPackReview\(\) \{\n  clearProjectPackReview\(''\);/, '前の review を消してから作っていない');
  const at = (s, from) => { const i = gen.indexOf(s, from || 0); assert.notEqual(i, -1, s); return i; };
  const check1 = at('if (!projectPackReviewIsCurrent(batch, ctx)) throw');
  const build = at('PACK_REVIEW_MODULE.buildPackReview(batch, ctx, options)');
  const assertReview = at('PACK_REVIEW_MODULE.assertPackReview(review)');
  const check2 = at('if (!projectPackReviewIsCurrent(batch, ctx) || attempt !== projectPackAttempt) throw');
  const attach = at('box.appendChild(view);');
  const commit = at('currentProjectPackReview = state;');
  assert.equal(check1 < build && build < assertReview && assertReview < check2 && check2 < attach && attach < commit, true, '順序');
  // 比較しないときは comparisonCaseIds を渡さない（空配列・null を値として渡さない）
  assert.match(gen, /var options = \{ detailCaseIds: selection\.detailCaseIds\.slice\(\) \};\n    if \(selection\.comparisonCaseIds !== null\) options\.comparisonCaseIds = selection\.comparisonCaseIds\.slice\(\);/);
  // review を置くのは生成の 1 か所だけ
  assert.deepEqual(CODE.match(/currentProjectPackReview = (?!null)[^;]+;/g), ['currentProjectPackReview = state;']);
  // 一括の結果が消えるときは review も消える（Pack Report とは別の state）
  const clearBatch = fnBody('clearProjectPackBatch');
  assert.match(clearBatch, /clearProjectPackReview\(currentProjectPackReview \? PROJECT_PACK_REVIEW_CLEARED : PROJECT_PACK_REVIEW_NOT_READY\);\n  projectPackReviewResetSelection\(\);\n  renderProjectPackReviewControls\(\);\n\}/);
  assert.equal(/projectPackReport/.test(reviewCode()), false, 'Review が Pack Report の state を使っている');
  assert.equal(/currentProjectPackReview/.test(fnBody('clearProjectPackReport') + fnBody('showProjectPackReport')), false);
});

test('P2L-S3B3B2B3-U04 (R27–R30): 保存・通信・console・innerHTML・例外の文面なし。active context・入力 package・Workspace・Evidence・計算 module へ流さない。UI で計算し直さない', () => {
  const block = reviewCode();
  ['Blob', 'createObjectURL', 'download', 'clipboard', 'execCommand', 'localStorage', 'sessionStorage', 'indexedDB',
    'document.cookie', 'caches', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'location', 'history.', 'console.',
    'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'eval(', 'new Function', 'e.message', 'e.stack', 'String(e)', 'activeProjectContext',
    'ProjectInput', 'WorkspaceCore', 'workspace', 'ReviewPackage', 'Scenario', 'ProjectProfile', 'EvidenceClosure', 'EvidenceLedger',
    'Promotion', 'GlassCalc', 'WindPressure', 'ProjectPackExecution', 'executeCase', 'createBatchRun', 'executeAll',
    'assertBatchOrigin', 'stagedProjectPack.', 'stagedProjectPackExecution', 'sourceClaim', 'privateReference', 'sourceScopes',
    'JSON.parse', 'JSON.stringify', 'ProjectPack.', 'validateProjectPack', 'fromProjectPack']
    .forEach((token) => assert.equal(block.includes(token), false, 'Pack Review block が ' + token + ' を使っている'));
  // 余裕比・差・集計・グループを UI で作らない（値は review から読むだけ）
  assert.equal(/\.P\s*[-+*/]|[-+*/]\s*[\w.]*\.P\b|designPressure\s*[-+*/]|[-+*/]\s*[\w.]*designPressure\b/.test(block), false, '風圧・許容風圧の演算');
  assert.equal(/marginRatio\s*=(?!=)|marginPressure\s*=(?!=)|difference\.[\w]+\s*=(?!=)|\.sort\(|\.reduce\(|Math\.(min|max)\((?!Math\.max\(0)|\.count\s*=(?!=)/.test(block.replace('Math.min(Math.max(0, Math.floor(page) || 0), pages - 1)', '').replace('Math.max(1, Math.ceil(review.rows.length / size))', '')), false, '集計・並べ替えを UI で作っている');
  // 触る DOM は Review の欄だけ
  const ids = [...block.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  ids.push(...(block.match(/'pack-review-compare-[ab]'/g) || []).map((s) => s.slice(1, -1)));
  assert.equal(ids.length > 0 && ids.every((id) => REVIEW_IDS.includes(id) || REVIEW_VIEW_IDS.includes(id)), true,
    'Pack Review block が自分の欄以外の要素に触れている: ' + ids.filter((id) => !REVIEW_IDS.includes(id) && !REVIEW_VIEW_IDS.includes(id)).join(','));
  assert.equal(/querySelector|\.forms\b|\bdocument\.body\b/.test(block), false);
  // Pack・一括の結果の state を変えない（Review の失敗で Pack と一括の結果は残る）
  assert.equal(/beginProjectPackAttempt|stagedProjectPack(?:Context|Batch)? = |projectPackBatchOrigin = |projectPackAttempt\s*(?:\+\+|\+=|=(?!=))|unloadProjectPack|renderProjectPackFailure|clearProjectPackBatch\(|startProjectPackBatch\(/.test(block), false);
});

test('P2L-S3B3B2B3-U05 (R27): 信頼の文言は常に見える場所にあり（折りたたみの中に入れない）、新しい強い判定の語を使わない', () => {
  const section = reviewSection();
  const trust = section.slice(section.indexOf('id="pack-review-trust"'), section.indexOf('</div>', section.indexOf('id="pack-review-trust"')));
  TRUST_TEXTS.forEach((t) => assert.equal(trust.replace(/\s+/g, ' ').includes(t), true, t));
  assert.equal(section.indexOf('id="pack-review-trust"') < section.indexOf('id="pack-review-options"'), true, '信頼の文言が操作の後にある');
  assert.equal(/<details[^>]*>[\s\S]*id="pack-review-trust"/.test(section), false, '信頼の文言を折りたたみの中に入れた');
  // RF-30-01: 信頼の文言の本文は 12px・--text2（後に定義される .notice の 11px・--text3 に上書きされない selector）。
  // 集計の見出しも --text2。全体の .notice は変えない。実際の描画上のコントラスト（4.5:1 以上）は browser の R27 / R33 が測る
  const rule = (sel) => {
    const m = STATIC.match(new RegExp('\\n  ' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'));
    assert.ok(m, sel + ' の CSS が無い');
    return m[1];
  };
  assert.match(rule('.notice.pack-review-trust'), /font-size: 12px;/);
  assert.match(rule('.notice.pack-review-trust'), /color: var\(--text2\);/);
  assert.match(rule('.pack-review-stat .k'), /color: var\(--text2\);/);
  assert.match(rule('.notice'), /font-size: 11px;[\s\S]*color: var\(--text3\);/, '全体の .notice を変えた');
  assert.equal(/\n  \.pack-review-trust \{/.test(STATIC), false, '.notice に上書きされる selector が残っている');
  // 静的な目安: --text2 を、.notice の半透明の背景を card（--surface）に重ねた色の上に置いたコントラスト
  const vars = Object.fromEntries([...STATIC.matchAll(/--(\w+): (#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
  const noticeBg = rule('.notice').match(/background: rgba\((\d+),(\d+),(\d+),([\d.]+)\)/).slice(1).map(Number);
  const bg = rgb(vars.surface).map((v, i) => noticeBg[i] * noticeBg[3] + v * (1 - noticeBg[3]));
  const contrast = (fg, back) => { const a = lum(fg), b = lum(back); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  assert.equal(contrast(rgb(vars.text2), bg) >= 4.5, true, '信頼の文言の本文の色が 4.5:1 に届かない');
  assert.equal(contrast(rgb(vars.text2), rgb(vars.surface)) >= 4.5, true, '集計の見出しの色が 4.5:1 に届かない');
  const literals = (reviewCode().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
  let text = section + '\n' + literals;
  NEGATIONS.forEach((n) => { text = text.split(n).join(''); });
  assert.equal(STRONG_WORDING.test(text), false, (text.match(STRONG_WORDING) || [])[0]);
  // 失敗の文は固定（例外の文面を足さない）
  assert.match(CODE, /var PROJECT_PACK_REVIEW_FAILURE = 'Pack Review を生成できませんでした。現在有効な Review はありません。';/);
  assert.match(fnBody('generateProjectPackReview'), /PROJECT_PACK_REVIEW_SELECTION_FAILURES\.indexOf\(e\.projectPackReviewFixedText\) !== -1\n      \? e\.projectPackReviewFixedText : PROJECT_PACK_REVIEW_FAILURE;/);
});

/* ============================================================
   挙動: intake から Pack Review までの block を vm で動かす
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
    this.attrs = {};
    const set = new Set();
    this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  }
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
  'btn-pack-report-csv', 'btn-pack-report-clear', 'pack-report-status', 'pack-report-out'].concat(REVIEW_IDS);

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

/** batch module（と executor）に合わせて review module を vm で初期化する。 */
function reviewOver(batchModule, execModule) {
  const sb = { ProjectPackBatch: batchModule, ProjectPackExecution: execModule || Exec };
  vm.createContext(sb);
  vm.runInContext(REVIEW_SRC, sb, { filename: REVIEW_SRC_REL });
  return sb.ProjectPackReview;
}

/** buildPackReview の呼び出しを記録する review module（hook で戻り値を差し替えられる）。 */
function reviewSpy(real, hook) {
  const calls = [];
  const mod = Object.freeze(Object.assign({}, real, {
    buildPackReview: (b, c, o) => {
      calls.push({ batch: b, ctx: c, keys: Object.keys(o), options: JSON.parse(JSON.stringify(o)) });
      return hook ? hook(real, b, c, o) : real.buildPackReview(b, c, o);
    }
  }));
  return { mod, calls };
}

function page(options) {
  const opts = options || {};
  const els = {};
  IDS.forEach((id) => {
    els[id] = new FakeElement(/compare-[ab]$|pack-exec-case/.test(id) ? 'select' : id === 'pack-report-out' ? 'textarea' :
      id === 'pack-review-detail-input' ? 'input' : 'div');
    els[id].id = id;
  });
  ['pack-exec', 'pack-exec-result', 'pack-batch', 'pack-batch-result', 'pack-batch-progress', 'pack-report-out',
    'pack-review-options', 'pack-review-result'].forEach((id) => { els[id].hidden = true; });
  ['pack-exec-case', 'btn-pack-exec', 'btn-pack-batch', 'btn-pack-batch-cancel', 'btn-pack-report-json',
    'btn-pack-report-csv', 'btn-pack-report-clear', 'btn-pack-review', 'btn-pack-review-clear'].forEach((id) => { els[id].disabled = true; });
  els['pack-review-status'].textContent = NOT_READY_TEXT;
  const timers = [];
  const B = opts.batch || Batch;
  const spy = reviewSpy(opts.review !== undefined ? opts.review : (opts.batch ? reviewOver(opts.batch) : Review), opts.hook);
  const sandbox = {
    document: {
      getElementById: (id) => {
        if (els[id]) return els[id];
        for (const root of Object.values(els)) { const f = root.find(id); if (f) return f; }
        return null;
      },
      createElement: (tag) => new FakeElement(tag)
    },
    ProjectPack: Pack, ProjectContext, ProjectPackExecution: Exec, ProjectPackBatch: B, ProjectPackReport: Report, TextEncoder,
    JSON: { parse: (...a) => JSON.parse(...a), stringify: JSON.stringify },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    activeProjectContext: ACTIVE_SENTINEL
  };
  if (opts.review !== null) sandbox.ProjectPackReview = spy.mod;
  vm.createContext(sandbox);
  vm.runInContext(blockSource(), sandbox, { filename: 'index.html#project-pack' });
  const w = sandbox;
  const tick = () => { const t = timers.shift(); if (!t) return false; t(); return true; };
  const drain = () => { let n = 0; while (tick()) { n++; if (n > 100000) throw new Error('runaway'); } return n; };
  const result = els['pack-review-result'];
  const view = (id) => result.find(id);
  const rowsOf = (el) => (el ? el.items('tbody').flatMap((tb) => tb.children) : []).map((tr) => tr.children.map((td) => td.textContent));
  return {
    w, els, timers, tick, drain, calls: spy.calls,
    load: (mode) => w.loadProjectPackText(FIXTURES[mode], '貼り付け'),
    loadPack: (pack) => w.loadProjectPackText(JSON.stringify(pack), '貼り付け'),
    runBatch: () => { w.startProjectPackBatch(); drain(); return w.stagedProjectPackBatch; },
    gen: () => w.generateProjectPackReview(),
    compare: (a, b) => { els['pack-review-compare-a'].value = a; els['pack-review-compare-b'].value = b; w.projectPackReviewSelectionChanged(); },
    state: () => w.currentProjectPackReview,
    shown: () => !result.hidden && result.children.length > 0,
    text: () => result.textContent,
    status: () => els['pack-review-status'].textContent,
    statusError: () => els['pack-review-status'].className === 'pack-status is-error',
    buttons: () => ({ gen: els['btn-pack-review'].disabled, clear: els['btn-pack-review-clear'].disabled,
      options: els['pack-review-options'].hidden }),
    view,
    stats: () => view('pack-review-summary').items('div').filter((d) => d.className === 'pack-review-stat').map((d) => {
      const ids = d.children[2] || null;
      return { k: d.children[0].textContent, v: d.children[1].textContent, count: ids ? ids.children[0].textContent : null,
        ids: ids ? ids.items('div').filter((x) => x.className === 'pack-review-ids')[0].textContent : null,
        folded: ids ? ids.items('details').length === 1 : null };
    }),
    groupTables: () => view('pack-review-groups').items('table').map((t) => t.items('tbody')[0].children.map((tr) => ({
      label: tr.children[0].textContent, count: tr.children[1].textContent,
      ids: tr.children[2].items('div').filter((d) => d.className === 'pack-review-ids')[0].textContent }))),
    caseRows: () => rowsOf(view('pack-review-rows')),
    compareRows: () => rowsOf(view('pack-review-comparison'))
  };
}
const NOT_READY = { gen: true, clear: true, options: true };
const READY = { gen: false, clear: true, options: false };
const SHOWN = { gen: false, clear: false, options: false };
const ROW_COLUMNS = ['ケース', 'Pane', '階/部位', '寸法 W×H mm', 'ガラス', '設計風圧 N/m²', '推奨候補', '許容風圧 N/m²',
  '余裕比', '余裕差 N/m²', '候補数 OK/NG/適用範囲外'];

/** review の行から、一覧の 1 行に出るはずの文字列（oracle は batch の行。review の表示関数は使わない）。 */
function expectedRow(r) {
  const place = [];
  if (Object.prototype.hasOwnProperty.call(r, 'floor')) place.push(r.floor === 'PH' ? 'PH' : r.floor + '階');
  if (Object.prototype.hasOwnProperty.call(r, 'zone')) place.push(({ general: '一般部', corner: '隅角部' })[r.zone] + '（' + r.zone + '）');
  const best = r.bestCandidate;
  return [r.caseId, r.paneId, place.length ? place.join(' / ') : '—（宣言なし）', r.widthMm + ' × ' + r.heightMm, r.glassType,
    r.designPressure.toFixed(1), best ? best.label : NO_CANDIDATE, best ? best.P.toFixed(1) : '—',
    best ? (best.P / r.designPressure).toFixed(3) : NO_CANDIDATE, best ? (best.P - r.designPressure).toFixed(1) : NO_CANDIDATE,
    r.okCount + ' / ' + r.ngCount + ' / ' + r.outOfScopeCount];
}

test('P2L-S3B3B2B3-U06 (R01・R05): 全ケース計算が確定するまで押せず、確定しても自動では作らない。押したときだけ batch と同じ ctx で 1 回作る', () => {
  for (const mode of MODES) {
    const p = page();
    assert.deepEqual(p.buttons(), NOT_READY);
    assert.equal(p.load(mode), true);
    assert.deepEqual(p.buttons(), NOT_READY, 'Pack の読込だけで押せる');
    p.w.startProjectPackBatch();
    assert.deepEqual(p.buttons(), NOT_READY, '計算中に押せる');
    assert.equal(p.gen(), false, '計算中に作った');
    assert.equal(p.status(), FAILURE_TEXT);
    assert.equal(p.calls.length, 0, '計算中に module を呼んだ');
    p.drain();
    const batch = p.w.stagedProjectPackBatch;
    assert.deepEqual(p.buttons(), READY);
    assert.equal(p.state(), null, '計算の完了で自動的に作った');
    assert.equal(p.shown(), false);
    assert.equal(p.status(), IDLE_TEXT);
    p.w.showProjectPackBatchPage(0);
    p.w.projectPackReviewSelectionChanged();
    assert.equal(p.calls.length, 0, 'ページの切替・選択の変更で作った');
    assert.equal(p.gen(), true, mode);
    assert.equal(p.calls.length, 1);
    assert.equal(p.calls[0].batch, batch, '一括の結果と違うものを渡した');
    assert.equal(p.calls[0].ctx, p.w.stagedProjectPackContext, '別の context を渡した');
    assert.deepEqual(p.calls[0].keys, ['detailCaseIds'], '比較しないのに comparisonCaseIds を渡した');
    assert.deepEqual(p.calls[0].options, { detailCaseIds: [] });
    const s = p.state();
    assert.equal(Review.isPackReview(s.review), true, '発行物でない review を表示した');
    assert.equal(s.batch, batch);
    assert.equal(s.review.rows.length, batch.rows.length);
    assert.equal(p.shown(), true);
    assert.deepEqual(p.buttons(), SHOWN);
    assert.match(p.status(), /^Pack Review を生成しました（全 \d+ ケース・詳細 0 件・比較 なし。未レビュー・計算済み ≠ 検証済み）。$/);
    // 作っても Pack・一括の結果・active は変わらない
    assert.equal(p.w.stagedProjectPackBatch, batch);
    assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL);
    // 消去
    assert.equal(p.w.clearProjectPackReviewByUser(), true);
    assert.equal(p.state(), null);
    assert.equal(p.shown(), false);
    assert.deepEqual(p.buttons(), READY);
  }
});

test('P2L-S3B3B2B3-U07 (R02・R03): 発行物・現在の結果と context・作成時の試行と違えば作らない。UI の確認を満たしても module の assertBatchOrigin が拒めば作らない', () => {
  const setup = (opts) => { const p = page(opts); p.load('project_pressure_map'); p.runBatch(); return p; };
  const failsClosed = (p, why, calledModule) => {
    assert.equal(p.gen(), false, why);
    assert.equal(p.state(), null, why);
    assert.equal(p.shown(), false, why);
    assert.equal(p.status(), FAILURE_TEXT, why);
    assert.equal(p.statusError(), true, why);
    assert.equal(p.calls.length, calledModule ? 1 : 0, why + '（module の呼び出し）');
  };
  { const p = setup(); vm.runInContext('projectPackAttempt += 1;', p.w); failsClosed(p, '試行が変わった'); }
  {
    const p = setup();
    p.w.stagedProjectPackContext = ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.project_pressure_map)));
    failsClosed(p, 'context が別の instance');
  }
  { const p = setup(); p.w.stagedProjectPackBatch = JSON.parse(JSON.stringify(p.w.stagedProjectPackBatch)); failsClosed(p, 'JSON の複製'); }
  {
    // 同じ ctx から発行された別の batch（module の assertBatchOrigin は通る）→ UI の同一性の確認で止める
    const p = setup();
    p.w.stagedProjectPackBatch = Batch.executeAll(p.w.stagedProjectPackContext);
    failsClosed(p, '作成時の結果と違う（同じ ctx の発行物ではある）');
  }
  { const p = setup(); p.w.projectPackBatchJob = { run: { cancel: () => true } }; failsClosed(p, '計算中の run がある'); }
  {
    // UI の記録を揃えても、別の ctx から発行された batch は module の assertBatchOrigin が拒む（UI の確認は代わりではない）
    const p = setup();
    const other = ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.project_pressure_map)));
    const foreign = Batch.executeAll(other);
    p.w.stagedProjectPackBatch = foreign;
    p.w.projectPackBatchOrigin = { batch: foreign, attempt: p.w.projectPackAttempt, ctx: p.w.stagedProjectPackContext };
    failsClosed(p, '別の ctx の batch（UI の記録だけ揃えた）', true);
  }
  {
    const p = page({ review: null });
    p.load('case_direct');
    p.runBatch();
    assert.deepEqual(p.buttons(), NOT_READY, 'module が無いのに押せる');
    failsClosed(p, 'module が無い');
  }
});

test('P2L-S3B3B2B3-U08 (R04・R05): 生成の失敗は固定文だけ・途中の review を残さない・前の review も消す。Pack と一括の結果は残る。確定の直前の変化でも捨てる', () => {
  const secret = 'SECRET-REVIEW-ERROR /private/path <img src=x>';
  let mode = 'ok';
  const p = page({ hook: (real, b, c, o) => {
    if (mode === 'throw') throw new Error(secret);
    if (mode === 'unissued') return JSON.parse(JSON.stringify(real.buildPackReview(b, c, o)));
    if (mode === 'unload') { const r = real.buildPackReview(b, c, o); p.w.unloadProjectPack(); return r; }
    if (mode === 'restart') { const r = real.buildPackReview(b, c, o); p.w.startProjectPackBatch(); return r; }
    return real.buildPackReview(b, c, o);
  } });
  p.load('notification1458');
  const batch = p.runBatch();
  const ctx = p.w.stagedProjectPackContext;
  assert.equal(p.gen(), true);
  for (const m of ['throw', 'unissued']) {
    mode = m;
    assert.equal(p.gen(), false, m);
    assert.equal(p.state(), null, m + ': 前の review が残った');
    assert.equal(p.shown(), false, m);
    assert.equal(p.text(), '', m + ': 途中の表示が残った');
    assert.equal(p.status(), FAILURE_TEXT, m);
    assert.equal(p.status().includes('SECRET') || p.text().includes('SECRET'), false);
    assert.equal(p.w.stagedProjectPackBatch, batch, '一括の結果を捨てた');
    assert.equal(p.w.stagedProjectPackContext, ctx, 'Pack を捨てた');
    assert.equal(p.els['pack-batch-result'].hidden, false);
    assert.deepEqual(p.buttons(), READY, m);
    mode = 'ok';
    assert.equal(p.gen(), true, m + ': 失敗の後に作り直せない');
  }
  // 生成の途中で解除・計算の再開始があれば、確定の直前の確認で捨てる
  mode = 'restart';
  assert.equal(p.gen(), false);
  assert.equal(p.state(), null);
  assert.equal(p.shown(), false);
  p.drain();
  mode = 'unload';
  assert.equal(p.gen(), false);
  assert.equal(p.state(), null);
  assert.equal(p.shown(), false);
  assert.deepEqual(p.buttons(), NOT_READY);
});

test('P2L-S3B3B2B3-U09 (R06–R08): 集計は review.summary の値。最大設計風圧と最小余裕比は別の指標で、同じ値のケースはすべて batch 順。推奨候補が無ければ「—」（0 にしない）', () => {
  // 設計風圧を交互に 2 値にして同じ値を作り、一部は推奨候補が無いほど大きくする
  const pressureOf = (i) => (i % 5 === 4 ? 200000 : i % 2 === 0 ? 1200 : 1500);
  const p = page();
  p.loadPack(syntheticPack(20, 'case_direct', { designPressureOf: pressureOf }));
  const batch = p.runBatch();
  assert.equal(p.gen(), true);
  const s = p.state().review.summary;
  const stats = p.stats();
  const stat = (k) => stats.find((x) => x.k.startsWith(k));
  // oracle（batch の行から。review の値と UI の表示を突き合わせる）
  const rows = batch.rows;
  const maxP = Math.max(...rows.map((r) => r.designPressure));
  const maxIds = rows.filter((r) => r.designPressure === maxP).map((r) => r.caseId);
  const ratios = rows.filter((r) => r.bestCandidate !== null).map((r) => ({ id: r.caseId, v: r.bestCandidate.P / r.designPressure }));
  const minR = Math.min(...ratios.map((x) => x.v));
  const minIds = ratios.filter((x) => x.v === minR).map((x) => x.id);
  assert.equal(maxIds.length > 1, true, '前提: 最大設計風圧が同じケースが複数');
  assert.equal(rows.some((r) => r.bestCandidate === null), true, '前提: 推奨候補の無いケースがある');
  assert.equal(stat('全ケース数').v, '20');
  assert.equal(stat('推奨候補あり').v, String(rows.filter((r) => r.bestCandidate !== null).length));
  assert.equal(stat('推奨候補なし').v, String(rows.filter((r) => r.bestCandidate === null).length));
  assert.equal(stat('適用範囲外の候補を含むケース').v, String(rows.filter((r) => r.outOfScopeCount > 0).length));
  assert.equal(stat('最大設計風圧').v, maxP.toFixed(1));
  assert.equal(stat('最大設計風圧').ids, maxIds.join(', '), '最大設計風圧の caseId（すべて・batch 順）');
  assert.equal(stat('最大設計風圧').count, '該当 ' + maxIds.length + ' 件');
  assert.equal(stat('最大設計風圧').folded, maxIds.length > 10, '10 件を超える該当は開いて読む（切り詰めない）');
  assert.equal(stat('最小余裕比').v, minR.toFixed(3));
  assert.equal(stat('最小余裕比').ids, minIds.join(', '), '最小余裕比の caseId（すべて・batch 順）');
  assert.equal(stat('最小余裕比').count, '該当 ' + minIds.length + ' 件');
  assert.deepEqual([s.maxDesignPressureCaseIds, s.minMarginRatioCaseIds], [maxIds, minIds], 'review の値と oracle が違う');
  assert.notDeepEqual(maxIds, minIds, '前提: 2 つの指標の該当が違う');
  assert.equal(stats.filter((x) => /最大設計風圧|最小余裕比/.test(x.k)).length, 2, '2 つの指標を 1 つにまとめた');
  assert.equal(/支配|governing/i.test(p.text()), false);
  // 推奨候補のあるケースが無ければ、最小余裕比は「—」（0 にしない）
  const q = page();
  q.loadPack(syntheticPack(4, 'case_direct', { designPressureOf: () => 200000 }));
  q.runBatch();
  assert.equal(q.gen(), true);
  assert.equal(q.state().review.summary.minMarginRatio, null);
  const none = q.stats().find((x) => x.k.startsWith('最小余裕比'));
  assert.equal(none.v, '—（推奨候補のあるケースなし）');
  assert.equal(none.ids, '—');
  assert.equal(none.count, '該当 0 件');
  assert.equal(q.caseRows().every((r) => r[8] === NO_CANDIDATE && r[9] === NO_CANDIDATE && r[6] === NO_CANDIDATE), true, '余裕比・余裕差を 0 で埋めた');
});

test('P2L-S3B3B2B3-U10 (R09・R10): グループは review.groups の 3 分類のまま（並び・件数・caseId）。未宣言・推奨候補なしは独立した組。case_direct の階・部位を補わない', () => {
  for (const [label, setup] of [['notification', (p) => p.load('notification1458')],
    ['map 2000', (p) => p.loadPack(syntheticPack(2000, 'project_pressure_map'))],
    ['case_direct fixture', (p) => p.load('case_direct')],
    ['case_direct synthetic', (p) => p.loadPack(syntheticPack(30, 'case_direct', { designPressureOf: (i) => (i % 4 === 0 ? 200000 : 1300) }))]]) {
    const p = page();
    setup(p);
    p.runBatch();
    assert.equal(p.gen(), true, label);
    const g = p.state().review.groups;
    const [rec, floor, zone] = p.groupTables();
    assert.deepEqual(rec, g.byRecommended.map((x) => ({ label: x.label === null ? '推奨候補なし' : x.label, count: String(x.count), ids: x.caseIds.join(', ') })), label + ' 推奨候補');
    assert.deepEqual(floor, g.byFloor.map((x) => ({ label: x.declared ? (x.floor === 'PH' ? 'PH' : x.floor + '階') : '未宣言（階の宣言なし）',
      count: String(x.count), ids: x.caseIds.join(', ') })), label + ' 階');
    assert.deepEqual(zone, g.byZone.map((x) => ({ label: x.declared ? ({ general: '一般部', corner: '隅角部' })[x.zone] + '（' + x.zone + '）' : '未宣言（部位の宣言なし）',
      count: String(x.count), ids: x.caseIds.join(', ') })), label + ' 部位');
    const total = (t) => t.reduce((n, x) => n + Number(x.count), 0);
    assert.equal([rec, floor, zone].every((t) => total(t) === p.state().review.totalCases), true, label + ': 件数の合計');
  }
  // case_direct: 階・部位の宣言が無いケースは「未宣言」だけ。補わない
  const p = page();
  p.loadPack(syntheticPack(30, 'case_direct', { designPressureOf: (i) => (i % 4 === 0 ? 200000 : 1300) }));
  p.runBatch();
  p.gen();
  const [rec, floor, zone] = p.groupTables();
  assert.deepEqual(floor.map((x) => x.label), ['未宣言（階の宣言なし）']);
  assert.deepEqual(zone.map((x) => x.label), ['未宣言（部位の宣言なし）']);
  assert.equal(rec[rec.length - 1].label, '推奨候補なし', '推奨候補なしが最後の独立した組でない');
  assert.equal(rec.filter((x) => x.label === '推奨候補なし').length, 1);
  assert.equal(p.caseRows().every((r) => r[2] === '—（宣言なし）'), true, 'case_direct の階・部位を補った');
});

test('P2L-S3B3B2B3-U11 (R11–R13・R31・R32): 一覧は review.rows の全件を 50 行ずつ。2000 ケースでも切り詰めず、ページの切替で作り直さない', () => {
  const p = page();
  p.loadPack(syntheticPack(2000, 'notification1458'));
  const batch = p.runBatch();
  assert.equal(p.gen(), true);
  const review = p.state().review;
  assert.equal(review.rows.length, 2000, 'review を切り詰めた');
  assert.equal(review.totalCases, 2000);
  const header = p.view('pack-review-rows').items('thead')[0].items('th').map((th) => th.textContent);
  assert.deepEqual(header, ROW_COLUMNS);
  let rows = p.caseRows();
  assert.equal(rows.length, 50);
  assert.deepEqual(rows[0], expectedRow(batch.rows[0]));
  assert.deepEqual(rows[49], expectedRow(batch.rows[49]));
  assert.match(p.view('pack-review-rows').textContent, /1–50 \/ 2000 ケース（1 \/ 40 ページ）/);
  const calls = p.calls.length;
  assert.equal(p.w.showProjectPackReviewPage(39), true);
  rows = p.caseRows();
  assert.equal(rows.length, 50);
  assert.deepEqual(rows[49], expectedRow(batch.rows[1999]));
  assert.equal(rows[49][0], 'G2000');
  assert.match(p.view('pack-review-rows').textContent, /1951–2000 \/ 2000 ケース（40 \/ 40 ページ）/);
  p.w.showProjectPackReviewPage(17);
  assert.deepEqual(p.caseRows(), batch.rows.slice(850, 900).map(expectedRow));
  p.w.showProjectPackReviewPage(99);
  assert.equal(p.caseRows()[49][0], 'G2000', '範囲外のページは最後のページ');
  assert.equal(p.calls.length, calls, 'ページの切替で review を作り直した');
  assert.equal(p.state().review, review, 'ページの切替で review が変わった');
  // 3 mode の一覧の値（batch の行と一致。推奨候補の無いケースは「—」）
  for (const mode of MODES) {
    const q = page();
    q.load(mode);
    const b = q.runBatch();
    q.gen();
    assert.deepEqual(q.caseRows(), b.rows.map(expectedRow), mode);
  }
  // 解除された後のページ切替は何も表示しない
  p.w.unloadProjectPack();
  assert.equal(p.w.showProjectPackReviewPage(1), false);
  assert.equal(p.shown(), false);
});

test('P2L-S3B3B2B3-U12 (R11–R15): 詳細は batch の caseId だけ・重複と 51 件目を拒む（切り詰めない）。選択の変更では作らず、表示は review.selectedDetails から。照合の不一致は失敗', () => {
  const p = page();
  p.loadPack(syntheticPack(120, 'project_pressure_map'));
  const batch = p.runBatch();
  const ids = batch.rows.map((r) => r.caseId);
  // 入力欄から追加（入力した文字列は表示しない）
  p.els['pack-review-detail-input'].value = '  <b>G9999</b>  ';
  assert.equal(p.w.addProjectPackReviewDetailFromInput(), false);
  assert.equal(p.status(), DETAIL_UNKNOWN);
  assert.equal(p.status().includes('G9999') || p.els['pack-review-detail-list'].textContent.includes('G9999'), false);
  p.els['pack-review-detail-input'].value = ' G0003 ';
  assert.equal(p.w.addProjectPackReviewDetailFromInput(), true);
  assert.equal(p.els['pack-review-detail-input'].value, '');
  assert.equal(p.w.addProjectPackReviewDetail('G0003'), DETAIL_DUPLICATE);
  assert.equal(p.w.addProjectPackReviewDetail(''), DETAIL_UNKNOWN);
  assert.equal(p.w.addProjectPackReviewDetail(3), DETAIL_UNKNOWN);
  for (let i = 0; i < 60; i++) if (ids[i] !== 'G0003') p.w.addProjectPackReviewDetail(ids[i]);
  const chosen = Array.from(p.w.projectPackReviewDetailIds);
  assert.equal(chosen.length, 50);
  assert.deepEqual(chosen, ['G0003'].concat(ids.filter((id) => id !== 'G0003').slice(0, 49)), '51 件目以降で前の選択を入れ替えた');
  assert.equal(p.w.addProjectPackReviewDetail('G0100'), DETAIL_LIMIT);
  assert.equal(p.w.projectPackReviewDetailIds.length, 50);
  assert.match(p.els['pack-review-detail-count'].textContent, /50 \/ 50 件/);
  assert.equal(p.calls.length, 0, '選択の変更で作った');
  assert.equal(p.gen(), true);
  assert.deepEqual(p.calls[0].options.detailCaseIds, chosen, '選択どおりに渡していない');
  const review = p.state().review;
  assert.deepEqual(review.selectedDetails.map((d) => d.caseId), chosen);
  const details = p.view('pack-review-details');
  const text = details.textContent;
  assert.match(text, /選んだケースの詳細（50 件）/);
  review.selectedDetails.forEach((d) => {
    assert.equal(text.includes('caseId: ' + d.caseId + ' ／ Pane: ' + d.paneId), true, d.caseId);
    assert.equal(text.includes('風圧の出どころ: ' + d.pressureSource + '（pressureModel.mode: project_pressure_map）'), true);
    assert.equal(text.includes('余裕比: ' + (d.marginRatio === null ? NO_CANDIDATE : d.marginRatio.toFixed(3))), true);
  });
  const first = review.selectedDetails[0];
  assert.equal(text.includes('候補の一覧（' + first.candidateSummary.length + ' 件）'), true);
  // 51 件が state にあっても切り詰めずに拒む（module は呼ばない）
  vm.runInContext("projectPackReviewDetailIds.push('G0110');", p.w);
  const before = p.calls.length;
  assert.equal(p.gen(), false);
  assert.equal(p.status(), DETAIL_TOO_MANY);
  assert.equal(p.calls.length, before, '51 件で module を呼んだ（切り詰めた）');
  assert.equal(p.state(), null);
  // 詳細の照合が合わない（executor が別の context の結果を返す）→ module が拒み、UI は失敗にする
  const other = ProjectContext.fromProjectPack(Pack.validateProjectPack(syntheticPack(5, 'case_direct', { designPressureOf: () => 1234 })));
  const lying = Object.freeze(Object.assign({}, Exec, { executeCase: (c, id) => Exec.executeCase(other, 'G0001') }));
  const q = page({ review: reviewOver(Batch, lying) });
  q.loadPack(syntheticPack(5, 'case_direct'));
  q.runBatch();
  assert.equal(q.w.addProjectPackReviewDetail('G0002'), null);
  assert.equal(q.gen(), false);
  assert.equal(q.status(), FAILURE_TEXT);
  assert.equal(q.state(), null);
  // module が選択と違う詳細を返したら（発行物でも）表示しない
  const r = page({ hook: (real, b, c, o) => real.buildPackReview(b, c, { detailCaseIds: o.detailCaseIds.slice(1) }) });
  r.load('notification1458');
  r.runBatch();
  r.w.addProjectPackReviewDetail('G001');
  r.w.addProjectPackReviewDetail('G003');
  assert.equal(r.gen(), false, '選択と違う詳細を表示した');
  assert.equal(r.state(), null);
  assert.equal(r.status(), FAILURE_TEXT);
});

test('P2L-S3B3B2B3-U13 (R16–R20): 比較は異なる 2 件を選んだときだけ。差は B − A（review.comparison）。片方に値が無ければ「—」。case_direct に正圧・負圧を補わない', () => {
  const p = page();
  p.loadPack(syntheticPack(12, 'case_direct', { designPressureOf: (i) => (i === 5 ? 200000 : 1000 + 37 * i) }));
  const batch = p.runBatch();
  const opts = p.els['pack-review-compare-a'].children.map((o) => [o.value, o.textContent]);
  assert.deepEqual(opts, [['', '（比較しない）']].concat(batch.rows.map((r) => [r.caseId, r.caseId])), '比較の選択肢は batch の caseId を batch 順');
  p.compare('G0002', '');
  assert.equal(p.gen(), false);
  assert.equal(p.status(), COMPARE_INCOMPLETE);
  p.compare('', 'G0002');
  assert.equal(p.gen(), false);
  assert.equal(p.status(), COMPARE_INCOMPLETE);
  p.compare('G0002', 'G0002');
  assert.equal(p.gen(), false);
  assert.equal(p.status(), COMPARE_SAME);
  assert.equal(p.calls.length, 0, '不完全な比較で module を呼んだ');
  // A = G0009, B = G0003（B − A は負になる）
  p.compare('G0009', 'G0003');
  assert.equal(p.gen(), true);
  assert.deepEqual(p.calls[0].keys, ['detailCaseIds', 'comparisonCaseIds']);
  assert.deepEqual(p.calls[0].options.comparisonCaseIds, ['G0009', 'G0003']);
  const c = p.state().review.comparison;
  const a = batch.rows[8];
  const b = batch.rows[2];
  const rows = p.compareRows();
  const row = (k) => rows.find((r) => r[0].startsWith(k));
  const signed = (v, d) => (v > 0 ? '+' : '') + v.toFixed(d);
  assert.deepEqual(row('設計風圧'), ['設計風圧 N/m²', a.designPressure.toFixed(1), b.designPressure.toFixed(1), signed(b.designPressure - a.designPressure, 1)]);
  assert.equal(b.designPressure - a.designPressure < 0 && row('設計風圧')[3].startsWith('-'), true, '差の向きが B − A でない');
  assert.deepEqual(row('推奨候補の許容風圧'), ['推奨候補の許容風圧 N/m²', a.bestCandidate.P.toFixed(1), b.bestCandidate.P.toFixed(1), signed(b.bestCandidate.P - a.bestCandidate.P, 1)]);
  assert.equal(row('余裕比')[3], signed(c.difference.marginRatio, 3));
  assert.equal(row('幅 W')[3], signed(b.widthMm - a.widthMm, 0));
  assert.equal(rows.some((r) => /正圧|負圧|評価高さ/.test(r[0])), false, 'case_direct に正圧・負圧を補った');
  assert.match(p.view('pack-review-comparison').textContent, /2 ケースの比較（A: G0009 ／ B: G0003）/);
  assert.match(p.view('pack-review-comparison').textContent, /どちらが案件に適合するかを判定するものではありません/);
  // 片方に推奨候補が無い → 差は「—」（0 にしない）。一致の判定ができない属性は「—」
  p.compare('G0006', 'G0001');
  assert.equal(p.state(), null, '選択の変更で前の review が残った');
  assert.equal(p.gen(), true);
  const rows2 = p.compareRows();
  const row2 = (k) => rows2.find((r) => r[0].startsWith(k));
  assert.deepEqual(row2('推奨候補の許容風圧').slice(1), [NO_CANDIDATE, batch.rows[0].bestCandidate.P.toFixed(1), NO_VALUE]);
  assert.deepEqual(row2('余裕比').slice(1), [NO_CANDIDATE, (batch.rows[0].bestCandidate.P / batch.rows[0].designPressure).toFixed(3), NO_VALUE]);
  assert.equal(row2('余裕差')[3], NO_VALUE);
  assert.equal(row2('推奨候補の構成')[1], '—（片方または両方に値なし）');
  assert.equal(row2('階')[1], '—（片方または両方に値なし）');
  // 告示 mode の比較は mode の風圧の差を出す
  const q = page();
  q.load('notification1458');
  const nb = q.runBatch();
  q.compare('G001', 'G003');
  assert.equal(q.gen(), true);
  const nrows = q.compareRows();
  const nrow = (k) => nrows.find((r) => r[0].startsWith(k));
  assert.equal(nrow('評価高さ')[3], signed(nb.rows[2].pressure.evaluationHeightM - nb.rows[0].pressure.evaluationHeightM, 3));
  assert.equal(nrow('正圧')[3], signed(nb.rows[2].pressure.positivePressure - nb.rows[0].pressure.positivePressure, 1));
  assert.equal(nrow('負圧')[3], signed(nb.rows[2].pressure.negativePressure - nb.rows[0].pressure.negativePressure, 1));
  // batch に無い caseId は module が拒む（UI で補わない）
  q.compare('G001', 'G999');
  assert.equal(q.gen(), false);
  assert.equal(q.status(), FAILURE_TEXT);
});

test('P2L-S3B3B2B3-U14 (R21–R26): 古い review は、新しい Pack・読込失敗・解除・計算の開始・キャンセル・計算の失敗・context の変化・選択の変更で消える', () => {
  const shown = (p) => { assert.equal(p.gen(), true); assert.equal(p.shown(), true); };
  const gone = (p, why, text) => {
    assert.equal(p.state(), null, why);
    assert.equal(p.shown(), false, why);
    assert.equal(p.text(), '', why);
    if (text) assert.equal(p.status(), text, why);
  };
  { const p = page(); p.load('notification1458'); p.runBatch(); shown(p); p.load('project_pressure_map'); gone(p, '新しい Pack'); assert.deepEqual(p.buttons(), NOT_READY); }
  {
    const p = page(); p.load('notification1458'); p.runBatch(); shown(p);
    assert.equal(p.w.loadProjectPackText('{"schemaVersion": 1', '貼り付け'), false);
    gone(p, '読込失敗'); assert.deepEqual(p.buttons(), NOT_READY);
  }
  { const p = page(); p.load('case_direct'); p.runBatch(); shown(p); p.w.unloadProjectPack(); gone(p, '解除'); assert.deepEqual(p.buttons(), NOT_READY); }
  {
    const p = page(); p.loadPack(syntheticPack(100, 'notification1458')); p.runBatch(); shown(p);
    p.w.startProjectPackBatch();
    gone(p, '計算の開始', CLEARED_TEXT);
    assert.deepEqual(p.buttons(), NOT_READY);
    assert.equal(p.w.projectPackReviewDetailIds.length, 0, '計算の開始で詳細の選択を持ち越した');
    p.tick();
    assert.equal(p.w.cancelProjectPackBatch(), true);
    gone(p, 'キャンセル');
    assert.deepEqual(p.buttons(), NOT_READY);
    p.drain();
    p.runBatch(); shown(p);
    p.w.startProjectPackBatch(); p.tick();
    p.w.cancelProjectPackBatch();
    gone(p, '生成後に計算をやり直してキャンセル');
  }
  {
    let failing = false;
    const B = batchOver((id) => failing && id === 'G0040');
    const p = page({ batch: B });
    p.loadPack(syntheticPack(80, 'case_direct'));
    p.runBatch(); shown(p);
    failing = true;
    p.runBatch();
    assert.equal(p.w.stagedProjectPackBatch, null, '前提: 計算が失敗した');
    gone(p, '計算の失敗');
    assert.deepEqual(p.buttons(), NOT_READY);
    assert.equal(p.gen(), false);
  }
  {
    // context の変化（staged context が別の instance になった）→ 次のページ切替・生成で捨てる・作らない
    const p = page(); p.load('project_pressure_map'); p.runBatch(); shown(p);
    p.w.stagedProjectPackContext = ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.project_pressure_map)));
    assert.equal(p.w.showProjectPackReviewPage(0), false);
    gone(p, 'context の変化', CLEARED_TEXT);
  }
  {
    // 選択の変更（前の review が新しい指定と一致しなくなった）→ 消す。作り直さない
    const p = page(); p.load('notification1458'); p.runBatch();
    p.w.addProjectPackReviewDetail('G002');
    shown(p);
    const calls = p.calls.length;
    p.w.removeProjectPackReviewDetail('G002');
    gone(p, '詳細の選択を外した', STALE_TEXT);
    assert.equal(p.calls.length, calls, '選択の変更で作り直した');
    assert.deepEqual(p.buttons(), READY);
    shown(p);
    p.w.addProjectPackReviewDetail('G003');
    gone(p, '詳細を追加した', STALE_TEXT);
    shown(p);
    p.compare('G001', '');
    gone(p, '比較の片方だけを選んだ', STALE_TEXT);
    p.compare('G001', 'G002');
    shown(p);
    p.compare('G001', 'G002');
    assert.equal(p.shown(), true, '同じ選択のままなのに消した');
    p.compare('G002', 'G001');
    gone(p, '比較の A と B を入れ替えた', STALE_TEXT);
    shown(p);
    p.w.clearProjectPackReviewDetailSelection();
    gone(p, '詳細の選択をすべて外した', STALE_TEXT);
  }
  {
    // 全ケース計算の結果を使う Pack Report とは別の state（Report の消去で Review は消えない）
    const p = page(); p.load('notification1458'); p.runBatch(); shown(p);
    assert.equal(p.w.showProjectPackReport('json'), true);
    p.w.clearProjectPackReportByUser();
    assert.equal(p.shown(), true, 'Report の消去で Review が消えた');
    p.w.clearProjectPackReviewByUser();
    assert.equal(p.els['pack-report-out'].hidden, true);
    assert.equal(p.shown(), false);
  }
});

test('P2L-S3B3B2B3-U15 (R27–R30): 出典の申告・Pack の生の値・例外の文面を表示しない。保存・通信の global が無くても動く（使わない）', () => {
  for (const mode of MODES) {
    const p = page();
    p.load(mode);
    const b = p.runBatch();
    p.w.addProjectPackReviewDetail(b.rows[0].caseId);
    p.compare(b.rows[0].caseId, b.rows[1].caseId);
    assert.equal(p.gen(), true, mode);
    const text = p.text();
    ['合成テスト用の参考資料', 'sourceClaim', 'claimedLevel', 'publicDescription', 'privateReference', 'sourceScopes',
      'claimedCheckedAt', 'records', 'activeProjectContext', 'Verified', 'verified:', 'approved']
      .forEach((t) => assert.equal(text.includes(t), false, mode + ': ' + t));
    TRUST_TEXTS.slice(0, 3).forEach((t) => assert.equal(text.includes(t), true, mode + ': ' + t));
  }
});

test('P2L-S3B3B2B3-U16 (R31–R34): browser harness は登録され、Pack の検証器・adapter・executor・batch・review を Node で呼ばない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const inst = spec.instruments.find((i) => i.id === 'project-pack-review');
  assert.ok(inst, 'verification-spec に project-pack-review が無い');
  assert.equal(inst.command, 'node tools/browser-checks/project-pack-review.mjs');
  assert.equal(inst.admissibility, 'UNVERIFIED');
  assert.ok(spec.browserAssertions.some((a) => a.id === 'project-pack-review-explicit-unreviewed' && a.instrument === 'project-pack-review'));
  const src = read('tools/browser-checks/project-pack-review.mjs');
  assert.match(src, /openBrowser\(/);
  assert.match(src, /finishRun\(/);
  assert.equal(/validateProjectPack|fromProjectPack|executeCase\(|createBatchRun\(|executeAll\(|buildPackReview\(|assertPackReview\(|require\([^)]*(project-pack|project-context)/.test(src), false,
    'harness が Pack の検証器・adapter・executor・batch・review を使っている（新しい trust 経路）');
  assert.equal(/import[^;]*(project-pack|project-context)/.test(src), false);
  assert.match(src, /require\(REPO \+ 'wind-pressure\.js'\)/);
  assert.match(src, /require\(REPO \+ 'calc\.js'\)/);
  for (let i = 1; i <= 34; i++) assert.match(src, new RegExp("'R" + String(i).padStart(2, '0') + '[-\']'), 'R' + i + ' の check が無い');
});
