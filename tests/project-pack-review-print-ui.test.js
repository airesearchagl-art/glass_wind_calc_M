'use strict';

/**
 * S3-B3B2-C2（Wave B）: index.html の Pack Review の印刷（ProjectPackReviewPrint を Project Pack 画面へ接続する UI と、
 * 1 回限りの印刷 session の controller）。
 *
 *   - 印刷の要求を作るのは「Pack Reviewを印刷」（printProjectPackReview）だけ。表示中の state（review・batch・ctx）→
 *     ProjectPackReviewPrint.buildPrintModel() → createElement / textContent だけで組んだ detached の DOM → body 直下の
 *     #pack-review-print-root → window.print() を 1 回
 *   - 状態は IDLE → BUILDING → ARMED → PRINT_EVENT → IDLE と、粘着の DENY_PENDING（D-1〜D-9。設計レビュー §3.3・
 *     Task Packet §5 末尾）。受入試験は Task Packet §8.1 の C-01〜C-10・X-1〜X-3（各 test の名前に書く）
 *   - 印刷に出る内容（Pack 本文・Workspace 本文・固定の拒否文・案内文）は CSS が body の class で決める。この file は
 *     class と root の状態までを確かめ、実際の印刷物（PDF）は tools/browser-checks/project-pack-review-print.mjs が
 *     実ブラウザのネイティブ印刷と Poppler で確かめる
 *
 * 前半は index.html の静的な検査、後半は intake から Review までの block と印刷の block を vm で動かす挙動の検査
 * （最小の偽 DOM・偽の window（beforeprint / afterprint の listener と、test が event の列を決める window.print）・
 * 手で進める setTimeout・実際の ProjectPack / ProjectContext / ProjectPackExecution / ProjectPackBatch / ProjectPackReport /
 * ProjectPackReview / ProjectPackReviewPrint）。vm の event の列は模擬で、ネイティブ印刷の証拠ではない。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const Pack = require('../project-config/project-pack.js');
const ProjectContext = require('../project-config/project-context.js');
const Exec = require('../project-config/project-pack-execution.js');
const Batch = require('../project-config/project-pack-batch.js');
const Report = require('../project-config/project-pack-report.js');
const Review = require('../project-config/project-pack-review.js');
const Print = require('../project-config/project-pack-review-print.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);
const PRINT_SRC_REL = 'project-config/project-pack-review-print.js';
const PRINT_SRC = read(PRINT_SRC_REL);
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const FIXTURE = (name) => read('tests/fixtures/project-pack/' + name + '.json');
const FIXTURES = { notification1458: FIXTURE('synthetic-notification1458'),
  project_pressure_map: FIXTURE('synthetic-project-pressure-map'), case_direct: FIXTURE('synthetic-case-direct') };
const MODES = Object.keys(FIXTURES);

const IDLE_TEXT = '印刷用の資料は、表示中の Pack Review から「Pack Reviewを印刷」を押したときだけ作ります。';
const NOT_READY = '印刷できる Pack Review がありません（現在の全ケース計算と選択から生成した Review だけを印刷します）。印刷は開始していません。';
const FAILURE = '印刷用の資料を作れませんでした。印刷は開始していません（Pack Review はそのままです）。';
const REFUSED = '印刷の時点で、印刷用の資料が現在の Pack Review と一致することを確認できなかったため、' +
  'Pack Review の内容は印刷していません（固定の拒否文だけです）。画面を確かめてから、もう一度「Pack Reviewを印刷」を押してください。';
const DENIED = '印刷画面の開始と終了を確認できなかったため、Pack Review の印刷を止めました。ページ全体を再読み込みするまで、' +
  'このページの印刷は固定の案内文だけになります（Workspace の資料も印刷しません）。再読み込みすると、読み込んだ Pack と Pack Review も' +
  '消えます（Pack の読込・全ケース計算・Review の生成からやり直しです）。自動では再読み込みしません。';
const REQUESTED = (n) => '印刷画面を要求しました（全 ' + n + ' ケース・未レビュー。計算済み ≠ 検証済み）。' +
  'PDF の保存や印刷が完了したかどうかは、このページでは確認できません。共有する前に内容と共有先を確認してください。';
const SHARE_TEXT = 'この資料にはガラス寸法・設計風圧などの案件入力値が含まれます。外部へ共有する場合は、内容と共有先を確認してください。' +
  'publication advisory が 0 件でも公開安全の証明にはなりません。';
const NEGATIONS = ['正式な案件承認の資料ではありません', '計算済み ≠ 検証済み', 'calculated_not_verified', '公開安全の証明にはなりません'];
const STRONG_WORDING = /Verified|承認|確定|安全|適合|問題なし|確認済|検証済|合格|\bsafe\b|\bapproved\b|governing|支配/i;

const PRINT_IDS = ['pack-review-print-section', 'pack-review-print-card', 'pack-review-print-title', 'pack-review-print-trust',
  'pack-review-print-share', 'pack-review-print-paper', 'pack-review-print-headers', 'pack-review-print-reload',
  'btn-pack-review-print', 'pack-review-print-status'];
const BODY_IDS = ['pack-review-print-hint', 'pack-review-print-root', 'pack-review-print-blocked'];
const PRINT_MARKER = '/* ============================================================\n   Pack Review の印刷（S3-B3B2-C2）';

/** top-level の関数 1 つ（次の top-level の function / var / window. の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar ', '\nwindow.'].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}
/** 印刷の block（実行コード）。 */
function printCode() {
  const start = CODE.indexOf('\nvar PACK_REVIEW_PRINT_MODULE');
  assert.notEqual(start, -1, '印刷の block が無い');
  return CODE.slice(start);
}
function sectionOf(id) {
  const from = STATIC.indexOf('id="' + id + '"');
  const open = STATIC.lastIndexOf('<section', from);
  return STATIC.slice(open, STATIC.indexOf('</section>', from) + '</section>'.length);
}
/** body 直下の要素 1 つ（開始 tag から同じ tag の入れ子を数えて閉じるまで）。 */
function elementAt(src, openTagStart) {
  const tag = /^<([a-z]+)/.exec(src.slice(openTagStart))[1];
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'g');
  re.lastIndex = openTagStart;
  let depth = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return src.slice(openTagStart, re.lastIndex);
  }
  throw new Error('閉じていない: ' + tag);
}
const bodyElement = (id) => elementAt(STATIC, STATIC.lastIndexOf('<', STATIC.indexOf('id="' + id + '"')));
const textOf = (markup) => markup.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');

/* ============================================================
   静的
============================================================ */

test('P2-C2-U01: script は export の後・Workspace の前に 1 度だけ。module は初期化時に 1 度だけ掴む。section は #view-pack の最後、印刷用の 3 要素は body 直下で #view-batch の後', () => {
  const at = (src) => HTML.indexOf('<script src="' + src + '"></script>');
  assert.equal(HTML.split('<script src="project-config/project-pack-review-print.js"></script>').length - 1, 1);
  assert.equal(at('project-config/project-pack-review.js') < at('project-config/project-pack-review-export.js') &&
    at('project-config/project-pack-review-export.js') < at('project-config/project-pack-review-print.js') &&
    at('project-config/project-pack-review-print.js') < at('workspace.js'), true, 'script の順');
  assert.match(printCode(), /^\nvar PACK_REVIEW_PRINT_MODULE = \(typeof ProjectPackReviewPrint === 'object' && ProjectPackReviewPrint\) \? ProjectPackReviewPrint : null;/);
  assert.equal((CODE.match(/\bProjectPackReviewPrint\b/g) || []).length, 3, 'ProjectPackReviewPrint の参照が初期化の 1 行以外にある');
  // 配置: #view-pack の中、出力の section の後で、#view-pack の最後の要素
  const view = STATIC.indexOf('id="view-pack"');
  const viewEnd = STATIC.indexOf('<div class="batch-wrap" id="view-batch"');
  const exportEnd = STATIC.indexOf('</section>', STATIC.indexOf('id="pack-review-export-section"'));
  const sec = STATIC.indexOf('id="pack-review-print-section"');
  assert.equal(view < exportEnd && exportEnd < sec && sec < viewEnd, true, 'section の配置');
  assert.match(STATIC.slice(sec, viewEnd), /<\/section>\n<\/div>\n\n<!-- ===== Batch \/ Scenario Workspace/);
  ['project-pack-section', 'pack-review-section', 'pack-review-export-section'].forEach((id) =>
    assert.equal(sectionOf(id).includes('pack-review-print'), false, id + ' の中に印刷を入れた'));
  // id は一意で、section の中は新しい id だけ
  PRINT_IDS.concat(BODY_IDS).forEach((id) => assert.equal(HTML.split('id="' + id + '"').length - 1, 1, id));
  assert.deepEqual([...sectionOf('pack-review-print-section').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).sort(), PRINT_IDS.slice().sort());
  // 印刷用の 3 要素: #view-batch の閉じタグの後、script の前、body 直下（hint → root → blocked の順）
  const batchEnd = STATIC.indexOf(elementAt(STATIC, STATIC.indexOf('<div class="batch-wrap" id="view-batch"'))) +
    elementAt(STATIC, STATIC.indexOf('<div class="batch-wrap" id="view-batch"')).length;
  const tail = STATIC.slice(batchEnd);
  const positions = BODY_IDS.map((id) => tail.indexOf('<div id="' + id + '">'));
  assert.equal(positions.every((p) => p > 0), true, 'body 直下に無い');
  assert.deepEqual(positions.slice().sort((a, b) => a - b), positions, '並び');
  let rest = tail.replace(/<!--[\s\S]*?-->/g, '');
  BODY_IDS.forEach((id) => { rest = rest.replace(bodyElement(id), ''); });
  assert.equal(rest.trim(), '', '#view-batch の後に印刷用の 3 要素以外がある');
  assert.equal(bodyElement('pack-review-print-root'), '<div id="pack-review-print-root"></div>', 'root は空で始まる');
});

test('P2-C2-U02: ボタン 1 つ・状態の欄・常に見える信頼／共有／用紙／ヘッダー・フッター OFF／再読み込みの注意（U-2）。固定の案内文・拒否文（強い判定の語なし）', () => {
  const section = sectionOf('pack-review-print-section');
  assert.match(section, /<button type="button" id="btn-pack-review-print" class="btn-secondary"\s+aria-describedby="pack-review-print-trust pack-review-print-reload"\s+onclick="printProjectPackReview\(\)" disabled>Pack Reviewを印刷<\/button>/);
  assert.equal((section.match(/<button\b/g) || []).length, 1);
  assert.match(section, new RegExp('<div class="pack-status" id="pack-review-print-status" role="status" aria-live="polite">' + IDLE_TEXT + '</div>'));
  assert.equal(/<a\b|download=|<input|<form|<textarea|contenteditable|<details|<iframe/.test(section), false);
  const trust = textOf(section.slice(section.indexOf('id="pack-review-print-trust"'), section.indexOf('</div>', section.indexOf('id="pack-review-print-trust"'))));
  ['pack_unreviewed', 'calculated_not_verified', '計算済み≠検証済み', 'OKは計算上の候補判定です。', '印刷・PDFは正式な案件承認の資料ではありません。',
    '各ページの下に未レビューの表示とページ番号を印刷します。'].forEach((t) => assert.equal(trust.includes(t), true, t));
  const text = textOf(section);
  assert.equal(text.includes(SHARE_TEXT.replace(/\s+/g, '')), true, '共有の注意');
  ['全ケース（最大2000）・選んだケースの詳細（最大50）・比較を、省略せずに印刷します。', 'A3横・本文10pt',
    'ブラウザの印刷（Ctrl+P・メニュー）からはPackReviewの内容を印刷しません。', '「ヘッダーとフッター」をOFFにしてください',
    'PDFの保存や印刷が完了したかどうかは、このページでは確認できません。',
    '再開できるのはページ全体の再読み込みだけで、再読み込みすると、読み込んだPackとPackReviewも消えます', '自動では再読み込みしません。',
    'Workspaceの資料を含め、固定の案内文だけを印刷します'].forEach((t) => assert.equal(text.includes(t), true, t));
  // 注意はボタンの前にあり、折りたたまない
  ['pack-review-print-trust', 'pack-review-print-share', 'pack-review-print-headers', 'pack-review-print-reload'].forEach((id) =>
    assert.equal(section.indexOf('id="' + id + '"') < section.indexOf('id="btn-pack-review-print"'), true, id));
  assert.match(STATIC, /\n  \.notice\.pack-review-print-trust \{[^}]*font-size: 12px;[^}]*color: var\(--text2\);/);
  // body 直下の固定文（静的な markup。runtime の文字列ではない）
  assert.equal(textOf(bodyElement('pack-review-print-hint')), 'PackReviewは、ProjectPack画面の「PackReviewを印刷」ボタンから印刷してください。' +
    'ブラウザの印刷（Ctrl+P・メニュー）からはPackReviewの内容を印刷しません（未レビュー・pack_unreviewed／計算済み≠検証済み）。');
  const blocked = bodyElement('pack-review-print-blocked');
  assert.equal(textOf(blocked).startsWith('このPackReviewは印刷できません。'), true);
  assert.match(blocked, /<p class="pack-print-blocked-reload">[^<]*ページ全体を再読み込みするまで、このページの印刷を止めています（Workspace の資料も印刷しません）。再読み込みすると、読み込んだ Pack と Pack Review も消えます。<\/p>/);
  // 強い判定の語を使わない（否定として必要な文を除く）
  const literals = (printCode().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
  let all = section.replace(/<[^>]+>/g, '') + BODY_IDS.map((id) => bodyElement(id).replace(/<[^>]+>/g, '')).join('\n') + '\n' + literals;
  NEGATIONS.forEach((n) => { all = all.split(n).join(''); });
  assert.equal(STRONG_WORDING.test(all), false, (all.match(STRONG_WORDING) || [])[0]);
});

test('P2-C2-U03: 印刷の CSS は後ろに足した別の規則（Workspace の規則は 1 文字も変えない）。body 直下の allowlist・状態で絞った案内文・名前付きの A3 横の page と全ページの未レビューの表示', () => {
  // Workspace の印刷の CSS（最初の @media print）・印刷の handler・設計レビュー資料の block は main と同じ（SHA-256）
  const first = HTML.indexOf('  @media print {');
  assert.equal(sha256(HTML.slice(first, HTML.indexOf('\n  }\n', first) + 4)), '2ab6c05f976aefcd0524d6574e9adeaf09f362e9863c6446959b799184269783');
  const mk = '// ============================================================\n// 設計レビュー資料（Phase 2I / Wave 4）';
  assert.equal(sha256(HTML.slice(HTML.indexOf(mk), HTML.indexOf(PRINT_MARKER))), '8b628b0d2baf6d945a45b8bfac33d00d15c77abfa2e896e89cf5156c01d62c0a',
    '設計レビュー資料の block（Workspace の印刷の gate・handler を含む）を変えた');
  // Pack の印刷の規則は 2 つ目の @media print（Workspace の規則より後）
  const blocks = [...CSS.matchAll(/\n  @media print \{/g)].map((m) => m.index);
  assert.equal(blocks.length, 2);
  const pack = CSS.slice(blocks[1], CSS.indexOf('\n  }\n', blocks[1]));
  const rule = (sel) => { const i = pack.indexOf(sel); assert.notEqual(i, -1, sel); return pack.slice(i, pack.indexOf('}', i)); };
  assert.match(rule('    body.pack-print-requested > :not(#pack-review-print-root):not(#pack-review-print-blocked) {'), /display: none !important;/);
  assert.match(rule('    body.pack-print-deny-pending > :not(#pack-review-print-blocked) {'), /display: none !important;/);
  assert.match(rule('    body.pack-print-requested.pack-print-allowed:not(.pack-print-deny-pending) > #pack-review-print-root {'), /display: block !important;/);
  assert.match(rule('    body.pack-print-requested:not(.pack-print-allowed) > #pack-review-print-blocked,\n    body.pack-print-deny-pending > #pack-review-print-blocked {'), /display: block !important;/);
  // 案内文: 要求も DENY_PENDING も無く、Project Pack の画面が見えているときだけ（状態の class で絞る）
  assert.match(rule('    body:not(.pack-print-requested):not(.pack-print-deny-pending) > #view-pack:not([hidden]) ~ #pack-review-print-hint {'), /display: block !important;/);
  assert.match(rule('    body:not(.pack-print-requested):not(.pack-print-deny-pending):has(> #view-pack:not([hidden])) > :not(#pack-review-print-hint) {'), /display: none !important;/);
  // root・拒否文・案内文を表示する規則はこれだけ（ほかに display を与える規則を置かない）
  const shows = [...CSS.matchAll(/([^{}]*#pack-review-print-(?:root|blocked|hint)[^{}]*)\{[^}]*display: block/g)].map((m) => m[1].trim().replace(/\s+/g, ' '));
  assert.deepEqual(shows, [
    'body:not(.pack-print-requested):not(.pack-print-deny-pending) > #view-pack:not([hidden]) ~ #pack-review-print-hint',
    'body.pack-print-requested.pack-print-allowed:not(.pack-print-deny-pending) > #pack-review-print-root',
    'body.pack-print-requested:not(.pack-print-allowed) > #pack-review-print-blocked, body.pack-print-deny-pending > #pack-review-print-blocked',
    'body.pack-print-deny-pending > #pack-review-print-blocked .pack-print-blocked-reload'
  ]);
  assert.match(CSS, /\n  #pack-review-print-root, #pack-review-print-blocked, #pack-review-print-hint \{ display: none; \}/);
  // 拒否の再読み込みの段落は DENY_PENDING のときだけ
  assert.match(pack, /    #pack-review-print-blocked \.pack-print-blocked-reload \{ display: none; \}\n    body\.pack-print-deny-pending > #pack-review-print-blocked \.pack-print-blocked-reload \{ display: block; \}/);
  // 用紙と全ページの表示: root だけが名前付きの page を使う
  assert.match(pack, /#pack-review-print-root \{ page: pack-review; font-size: 10pt;/);
  assert.equal((CSS.match(/page: pack-review;/g) || []).length, 1);
  assert.match(pack, /#pack-review-print-root thead \{ display: table-header-group; \}/);
  // 画面の表の規則（薄い文字色・先頭行の強調）を印刷用 root に使わない: 黒い文字・背景なし・先頭行も同じ太さ
  assert.match(pack, /    #pack-review-print-root th, #pack-review-print-root td, #pack-review-print-root tr:first-child td \{\n      color: #000; background: none; font-size: inherit; letter-spacing: normal; font-weight: 400;\n    \}/);
  assert.match(pack, /    #pack-review-print-root tr, #pack-review-print-root tr:first-child \{ background: none; \}/);
  assert.match(pack, /#pack-review-print-root tr \{ break-inside: avoid; \}/);
  const page = CSS.slice(CSS.indexOf('\n  @page pack-review {'));
  assert.match(page, /^\n  @page pack-review \{\n    size: A3 landscape;\n    margin: 12mm 10mm 16mm;\n    @bottom-center \{\n      content: ([^;]+);/);
  const content = /content: ([^;]+);/.exec(page)[1];
  assert.equal(content, '"' + Print.FOOTER_TEXT + '　" counter(page) " / " counter(pages)', '全ページの表示が model の FOOTER_TEXT と違う');
  assert.equal((CSS.match(/@page/g) || []).length, 1, 'ほかの @page を足した');
});

test('P2-C2-U04: controller の静的な契約（listener は Workspace の後・staged の Pack と出力の module を読まない・保存／通信／timer／HTML の文字列なし・hook は V04 の 2 行の前で guard 付き）', () => {
  const code = printCode();
  // listener の順: Workspace（最初の beforeprint / afterprint）→ Pack
  const before = [...CODE.matchAll(/window\.addEventListener\('beforeprint'/g)].map((m) => m.index);
  const after = [...CODE.matchAll(/window\.addEventListener\('afterprint'/g)].map((m) => m.index);
  assert.equal(before.length, 2);
  assert.equal(after.length, 2);
  const blockAt = CODE.indexOf('\nvar PACK_REVIEW_PRINT_MODULE');
  assert.equal(before[0] < blockAt && after[0] < blockAt && before[1] > blockAt && after[1] > blockAt, true, 'Pack の listener が Workspace の前にある');
  assert.match(CODE.slice(before[0], before[0] + 200), /applyPrintEligibility\(false\)/, '最初の beforeprint は Workspace のもの');
  // 読まないもの・使わないもの
  ['stagedProjectPack', 'ProjectPackReviewExport', 'projectPackReviewExport', 'localStorage', 'sessionStorage', 'indexedDB', 'cookie',
    'location', 'history.', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'navigator', 'console.', 'Blob', 'createObjectURL', 'download',
    'clipboard', 'execCommand', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'iframe', 'setTimeout',
    'setInterval', 'requestAnimationFrame', 'Date', 'performance', 'Math.random', 'postMessage', 'window.open', 'reload', 'isTrusted',
    'e.message', 'e.stack', 'String(e)', 'classList.contains', 'className.indexOf']
    .forEach((token) => assert.equal(code.includes(token), false, '印刷の block が ' + token + ' を使っている'));
  // window.print はボタンの handler の中で 1 回だけ。印刷の要求を作るのはボタンだけ
  assert.equal((CODE.match(/\bprintProjectPackReview\(/g) || []).length, 1, 'コードから印刷を要求している');
  assert.equal(STATIC.split('printProjectPackReview(').length - 1, 1, 'ボタン以外の markup から印刷を要求している');
  assert.equal(code.split('window.print()').length - 1, 1);
  assert.equal((code.match(/PACK_REVIEW_PRINT_MODULE\.buildPrintModel\(/g) || []).length, 1);
  // 発行元の gate は module（buildPrintModel）と、印刷の直前の assertReviewOrigin の 2 つ
  assert.match(fnBody('projectPackPrintOriginMatches'), /PACK_REVIEW_MODULE\.assertReviewOrigin\(state\.review, state\.batch, state\.ctx\);/);
  const cur = fnBody('projectPackReviewPrintIsCurrent');
  ['state === currentProjectPackReview', 'PACK_REVIEW_MODULE.isPackReview(state.review)', 'projectPackReviewIsCurrent(state.batch, state.ctx)',
    'state.attempt === projectPackAttempt', 'projectPackReviewSelectionMatches(state)'].forEach((s) => assert.equal(cur.includes(s), true, s));
  const live = fnBody('projectPackPrintSessionIsLive');
  ["projectPackPrint.state === 'PRINT_EVENT'", 'projectPackPrint.live === live', 'live.inCall === true',
    "root.getAttribute('data-print-session') === String(live.id)", 'root.childElementCount === 1', 'root.firstElementChild === live.dom',
    "live.dom.getAttribute('data-print-session') === String(live.id)", 'projectPackReviewPrintIsCurrent(live.state)',
    'projectPackPrintOriginMatches(live.state)'].forEach((s) => assert.equal(live.includes(s), true, s));
  // DOM は createElement / textContent だけ
  assert.match(fnBody('packPrintEl'), /document\.createElement\(tag\)[\s\S]*el\.textContent = text;/);
  // beforeprint: 最初に許可の class を外す。afterprint も
  const bp = code.slice(code.indexOf("window.addEventListener('beforeprint'"));
  assert.match(bp, /^window\.addEventListener\('beforeprint', function \(\) \{\n  if \(document\.body\) document\.body\.classList\.remove\('pack-print-allowed'\);\n  try \{/);
  const ap = code.slice(code.indexOf("window.addEventListener('afterprint'"));
  assert.match(ap, /^window\.addEventListener\('afterprint', function \(\) \{\n  if \(document\.body\) document\.body\.classList\.remove\('pack-print-allowed'\);\n  try \{/);
  // 状態から class を作る（class から状態を作らない）。DENY_PENDING を外すコードは無い
  assert.equal(/classList\.remove\('pack-print-deny-pending'\)/.test(CODE), false, 'DENY_PENDING の class を外すコードがある');
  assert.deepEqual(code.match(/projectPackPrint\.state = '[A-Z_]+'/g).sort(), ["projectPackPrint.state = 'ARMED'", "projectPackPrint.state = 'BUILDING'",
    "projectPackPrint.state = 'DENY_PENDING'", "projectPackPrint.state = 'IDLE'", "projectPackPrint.state = 'IDLE'",
    "projectPackPrint.state = 'PRINT_EVENT'"].sort());
  assert.equal((code.match(/projectPackPrint\.lastSessionId = /g) || []).length, 1, 'session の番号を書き換える所は 1 か所');
  assert.match(fnBody('printProjectPackReview'), /var sessionId = projectPackPrint\.lastSessionId \+ 1;\n  projectPackPrint\.lastSessionId = sessionId;/);
  // hook: renderProjectPackReviewControls の最後の 2 行（C1-B V04）の前に、guard 付きで 1 つ
  const controls = fnBody('renderProjectPackReviewControls');
  assert.match(controls, /\n  if \(typeof renderProjectPackReviewPrintControls === 'function'\) renderProjectPackReviewPrintControls\(\);\n\s*renderProjectPackReviewDetailList\(\);\n\s*renderProjectPackReviewExportControls\(\);\n\}/);
  assert.equal((CODE.match(/renderProjectPackReviewPrintControls\(\)/g) || []).length, 7, '定義・hook・printProjectPackReview の 3 か所・DENY・初期化');
  assert.equal(/Print/.test(fnBody('clearProjectPackReview')), false, 'clearProjectPackReview を変えた');
  assert.equal(/projectPackPrint|PackReviewPrint/.test(fnBody('setView') + fnBody('onViewTabKeydown')), false, '画面の切替が印刷に触れる');
});

/* ============================================================
   挙動: intake から Review までの block と、印刷の block を vm で動かす
============================================================ */

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this._text = '';
    this.children = [];
    this.parentNode = null;
    this._index = -1;
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this._value = '';
    this.attrs = {};
    const set = new Set();
    this._classes = set;
    this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c),
      toggle: (c, on) => { const v = on === undefined ? !set.has(c) : !!on; if (v) set.add(c); else set.delete(c); return v; } };
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  get textContent() { return [this._text].concat(this.children.map((c) => c.textContent)).filter(Boolean).join('\n'); }
  set textContent(v) {
    this._text = String(v);
    this.children.forEach((c) => { c.parentNode = null; c._index = -1; });
    this.children = [];
  }
  appendChild(c) {
    c.parentNode = this;
    c._index = this.children.length;
    this.children.push(c);
    return c;
  }
  get firstElementChild() { return this.children[0] || null; }
  get childElementCount() { return this.children.length; }
  get nextElementSibling() { return this.parentNode ? this.parentNode.children[this._index + 1] || null : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
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
  count() { return 1 + this.children.reduce((n, c) => n + c.count(), 0); }
}

/** intake から Review の出力までの block の raw text（コメント込み）と、表示に使う小さな helper（C1-B の test と同じ切り出し）。 */
function packBlockSource() {
  const start = RAW_CODE.indexOf('var MAX_PROJECT_PACK_IMPORT_BYTES');
  const marker = RAW_CODE.indexOf('入力モード切替', start);
  const helpers = ['floorDisplayLabel'].map((name) => {
    const s = RAW_CODE.indexOf('function ' + name + '(');
    return RAW_CODE.slice(s, RAW_CODE.indexOf('\n}\n', s) + 3);
  }).join('\n') + '\nvar ZONE_DISPLAY_LABELS = { general: "一般部", corner: "隅角部" };\n';
  return helpers + RAW_CODE.slice(start, RAW_CODE.lastIndexOf('/*', marker));
}
/** 印刷の block の raw text（script の最後まで）。 */
function printBlockSource() {
  const start = RAW_CODE.indexOf(PRINT_MARKER);
  assert.notEqual(start, -1);
  return RAW_CODE.slice(start);
}

const ACTIVE_SENTINEL = Object.freeze({ sentinel: 'runtime-default-built-in' });
const PACK_IDS = ['pack-status', 'pack-preview', 'pack-paste', 'pack-file', 'pack-drop', 'pack-exec', 'pack-exec-case',
  'btn-pack-exec', 'pack-exec-status', 'pack-exec-result', 'pack-batch', 'btn-pack-batch', 'btn-pack-batch-cancel',
  'pack-batch-progress', 'pack-batch-status', 'pack-batch-result', 'pack-report', 'btn-pack-report-json',
  'btn-pack-report-csv', 'btn-pack-report-clear', 'pack-report-status', 'pack-report-out',
  'pack-review-section', 'pack-review-card', 'pack-review-title', 'pack-review-trust', 'pack-review-options',
  'pack-review-detail-input', 'btn-pack-review-detail-add', 'pack-review-detail-count', 'pack-review-detail-list',
  'btn-pack-review-detail-clear', 'pack-review-compare-label', 'pack-review-compare-a', 'pack-review-compare-b',
  'pack-review-options-note', 'btn-pack-review', 'btn-pack-review-clear', 'pack-review-status', 'pack-review-result',
  'pack-review-export-section', 'pack-review-export-card', 'pack-review-export-title', 'pack-review-export-trust',
  'pack-review-export-share', 'btn-pack-review-export-md', 'btn-pack-review-export-json', 'btn-pack-review-export-clear',
  'pack-review-export-status', 'pack-review-export-out'].concat(PRINT_IDS, BODY_IDS);

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
/** batch module に合わせた review module と、それを依存にした print module（vm で初期化）。 */
function modulesOver(batchModule) {
  const rsb = { ProjectPackBatch: batchModule, ProjectPackExecution: Exec };
  vm.createContext(rsb);
  vm.runInContext(read('project-config/project-pack-review.js'), rsb, { filename: 'project-pack-review.js' });
  return { review: rsb.ProjectPackReview, print: printOver(rsb.ProjectPackReview) };
}
function printOver(reviewModule, src) {
  const sb = { ProjectPackReview: reviewModule };
  vm.createContext(sb);
  vm.runInContext(src || PRINT_SRC, sb, { filename: PRINT_SRC_REL });
  return sb.ProjectPackReviewPrint;
}
/** 呼び出しを記録する print module（hook で途中に割り込める）。 */
function printSpy(real, hook) {
  const calls = [];
  const mod = Object.freeze(Object.assign({}, real, {
    buildPrintModel: (r, b, c) => { calls.push({ review: r, batch: b, ctx: c }); if (hook) hook(r, b, c); return real.buildPrintModel(r, b, c); }
  }));
  return { mod, calls };
}

/**
 * 偽のページ。window.print() が呼ばれると、test が決めた列（opts.onPrint または p.onPrint）で beforeprint / afterprint を
 * 同期で配る（ネイティブ印刷の模擬。listener の例外は配る側へ伝えない）。snap() はその時点の状態の写し。
 */
function page(options) {
  const opts = options || {};
  const els = {};
  PACK_IDS.forEach((id) => {
    els[id] = new FakeElement(/compare-[ab]$|pack-exec-case/.test(id) ? 'select' : /-out$/.test(id) ? 'textarea' :
      id === 'pack-review-detail-input' ? 'input' : /^btn-/.test(id) ? 'button' : 'div');
    els[id].id = id;
  });
  ['pack-exec', 'pack-exec-result', 'pack-batch', 'pack-batch-result', 'pack-batch-progress', 'pack-report-out',
    'pack-review-options', 'pack-review-result', 'pack-review-export-out'].forEach((id) => { els[id].hidden = true; });
  ['pack-exec-case', 'btn-pack-exec', 'btn-pack-batch', 'btn-pack-batch-cancel', 'btn-pack-report-json', 'btn-pack-report-csv',
    'btn-pack-report-clear', 'btn-pack-review', 'btn-pack-review-clear', 'btn-pack-review-export-md', 'btn-pack-review-export-json',
    'btn-pack-review-export-clear', 'btn-pack-review-print'].forEach((id) => { els[id].disabled = true; });
  els['pack-review-print-status'].textContent = IDLE_TEXT;
  const body = new FakeElement('body');
  const timers = [];
  const listeners = { beforeprint: [], afterprint: [] };
  const trace = [];
  const touched = [];
  const listenerErrors = [];
  const over = opts.batch ? modulesOver(opts.batch) : null;
  const spy = printSpy(opts.printModule || (over ? over.print : Print), opts.hook);
  const p = { els, body, trace, listenerErrors, onPrint: null, printCalls: 0 };
  const fire = (type) => {
    listeners[type].forEach((fn) => { try { fn({ type }); } catch (e) { listenerErrors.push(e); } });
    trace.push(Object.assign({ ev: type }, p.snap()));
  };
  const win = {
    addEventListener: (type, fn) => { if (listeners[type]) listeners[type].push(fn); },
    print: () => {
      p.printCalls += 1;
      trace.push(Object.assign({ ev: 'callEnter' }, p.snap()));
      const script = p.onPrint || opts.onPrint || ((f) => { f('beforeprint'); f('afterprint'); });
      script(fire, p);
    }
  };
  // Workspace の handler（印刷の block より前に登録される）の代わり: FRESH なら review-print-allowed を付ける（既定は不許可）
  if (opts.workspaceFresh !== undefined) {
    win.addEventListener('beforeprint', () => { body.classList.remove('review-print-allowed'); if (p.workspaceFresh) body.classList.add('review-print-allowed'); });
    win.addEventListener('afterprint', () => { body.classList.remove('review-print-allowed'); });
    p.workspaceFresh = opts.workspaceFresh;
  }
  const watch = (name) => new Proxy(function () {}, {
    get(_t, k) { touched.push(name + '.' + String(k)); return watch(name + '.' + String(k)); },
    apply() { touched.push(name + '()'); return undefined; }
  });
  const sandbox = {
    document: {
      getElementById: (id) => {
        if (els[id]) return els[id];
        for (const root of Object.values(els)) { const f = root.find(id); if (f) return f; }
        return null;
      },
      createElement: (tag) => new FakeElement(tag),
      body
    },
    window: win,
    ProjectPack: Pack, ProjectContext, ProjectPackExecution: Exec, ProjectPackBatch: opts.batch || Batch,
    ProjectPackReport: Report, ProjectPackReview: over ? over.review : Review, TextEncoder,
    JSON: { parse: (...a) => JSON.parse(...a), stringify: JSON.stringify },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    activeProjectContext: ACTIVE_SENTINEL
  };
  ['localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'navigator', 'console', 'Blob', 'URL', 'location',
    'history', 'WorkspaceCore', 'ProjectInput', 'ReviewPackage', 'ProjectPackReviewExport'].forEach((name) => { sandbox[name] = watch(name); });
  if (opts.printModule !== null) sandbox.ProjectPackReviewPrint = spy.mod;
  vm.createContext(sandbox);
  vm.runInContext(packBlockSource(), sandbox, { filename: 'index.html#project-pack' });
  vm.runInContext(printBlockSource(), sandbox, { filename: 'index.html#pack-review-print' });
  const w = sandbox;
  const root = els['pack-review-print-root'];
  const tick = () => { const t = timers.shift(); if (!t) return false; t(); return true; };
  const drain = () => { let n = 0; while (tick()) { n++; if (n > 100000) throw new Error('runaway'); } return n; };
  return Object.assign(p, {
    w, drain, timers, touched, calls: spy.calls, root, fire,
    snap: () => ({ state: w.projectPackPrint.state, classes: [...body._classes].sort(), rootSession: root.getAttribute('data-print-session'),
      rootChildren: root.childElementCount, live: w.projectPackPrint.live ? w.projectPackPrint.live.id : null }),
    load: (mode) => w.loadProjectPackText(FIXTURES[mode], '貼り付け'),
    loadPack: (pack) => w.loadProjectPackText(JSON.stringify(pack), '貼り付け'),
    runBatch: () => { w.startProjectPackBatch(); drain(); return w.stagedProjectPackBatch; },
    gen: () => w.generateProjectPackReview(),
    detail: (id) => { els['pack-review-detail-input'].value = id; return w.addProjectPackReviewDetailFromInput(); },
    compare: (a, b) => { els['pack-review-compare-a'].value = a; els['pack-review-compare-b'].value = b; w.projectPackReviewSelectionChanged(); },
    print: () => w.printProjectPackReview(),
    review: () => w.currentProjectPackReview,
    ctl: () => w.projectPackPrint,
    status: () => els['pack-review-print-status'].textContent,
    statusError: () => els['pack-review-print-status'].className === 'pack-status is-error',
    button: () => els['btn-pack-review-print'].disabled,
    classes: () => [...body._classes].sort(),
    invalidate: () => vm.runInContext('projectPackAttempt += 1;', w)
  });
}

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
/** IDLE で、印刷の痕跡（root・許可と要求の class・session）が無いこと。 */
function idleClean(p, why) {
  assert.equal(p.ctl().state, 'IDLE', why + ': state');
  assert.equal(p.ctl().live, null, why + ': live session');
  assert.equal(p.root.childElementCount, 0, why + ': root に資料が残った');
  assert.equal(p.root.getAttribute('data-print-session'), null, why + ': root の session');
  ['pack-print-allowed', 'pack-print-requested', 'pack-print-deny-pending'].forEach((c) => assert.equal(p.body.classList.contains(c), false, why + ': ' + c));
}
/** DENY_PENDING で、session・model・root が無く、拒否の class だけがあること。 */
function denyPending(p, why) {
  assert.equal(p.ctl().state, 'DENY_PENDING', why + ': state');
  assert.equal(p.ctl().live, null, why + ': live session');
  assert.equal(p.root.childElementCount, 0, why + ': root に資料が残った');
  assert.equal(p.root.getAttribute('data-print-session'), null, why + ': root の session');
  assert.deepEqual(p.classes().filter((c) => c.startsWith('pack-print-')), ['pack-print-deny-pending'], why + ': class');
  assert.equal(p.button(), true, why + ': ボタンが押せる');
  assert.equal(p.status(), DENIED, why + ': 状態の文');
  assert.equal(p.statusError(), true);
}
/** 区間内で、その時点の Pack の印刷が許可されていた（root に現在の session の資料）。 */
const allowedAt = (s, id) => s.state === 'PRINT_EVENT' && s.classes.includes('pack-print-requested') && s.classes.includes('pack-print-allowed') &&
  !s.classes.includes('pack-print-deny-pending') && s.rootSession === String(id) && s.rootChildren === 1 && s.live === id;
const packAllowed = (s) => s.classes.includes('pack-print-allowed');
/** DENY_PENDING へ入れる（C-02(a): beforeprint だけで戻る）。 */
function toDeny(p) {
  p.onPrint = (f) => { f('beforeprint'); };
  assert.equal(p.print(), false);
  p.onPrint = null;
  denyPending(p, '前提: DENY_PENDING');
}

test('P2-C2-U05 (C-01): 正常終了。ボタン → 区間内で beforeprint（Pack 全件・許可）→ afterprint → return で IDLE。次の押下は新しい session で全 gate から', () => {
  for (const workspaceFresh of [undefined, true]) {
    const p = page({ workspaceFresh });
    assert.equal(p.button(), true, 'Review の前に押せる');
    assert.equal(p.status(), IDLE_TEXT);
    assert.equal(p.print(), false, 'Review が無いのに印刷した');
    assert.equal(p.printCalls, 0);
    assert.equal(p.status(), NOT_READY);
    assert.equal(p.load('notification1458'), true);
    p.runBatch();
    assert.equal(p.button(), true, '全ケース計算だけで押せる');
    assert.equal(p.gen(), true);
    assert.equal(p.button(), false, 'Review を生成しても押せない');
    assert.equal(p.calls.length, 0, 'Review の生成で印刷用の資料を作った');
    const state = p.review();
    const traced = p.trace.length;
    assert.equal(p.print(), true);
    const id = p.ctl().lastSessionId;
    assert.equal(id, 2, 'session の番号は押下ごとに増える（印刷しなかった押下の番号も使い回さない）');
    assert.equal(p.printCalls, 1);
    assert.equal(p.calls.length, 1);
    assert.equal(p.calls[0].review, state.review, 'state の review を渡していない');
    assert.equal(p.calls[0].batch, state.batch);
    assert.equal(p.calls[0].ctx, state.ctx);
    const [enter, bp, ap] = p.trace.slice(traced);
    assert.deepEqual(p.trace.slice(traced).map((t) => t.ev), ['callEnter', 'beforeprint', 'afterprint']);
    assert.equal(enter.state, 'ARMED');
    assert.deepEqual(enter.classes.filter((c) => c.startsWith('pack-')), ['pack-print-requested']);
    assert.equal(allowedAt(bp, id), true, JSON.stringify(bp));
    if (workspaceFresh) assert.equal(bp.classes.includes('review-print-allowed'), true, '前提: Workspace の handler は FRESH で許可（CSS が Pack 以外を隠す）');
    assert.equal(packAllowed(ap), false, 'afterprint で許可の class が残った');
    assert.equal(ap.rootChildren, 0, 'afterprint で root が残った');
    idleClean(p, 'C-01 の後');
    assert.equal(p.status(), REQUESTED(state.review.totalCases));
    assert.equal(p.statusError(), false);
    assert.equal(p.button(), false, '正常終了の後に押せない');
    // 次の押下: 新しい session の番号・新しい model と DOM
    let seen = null;
    p.onPrint = (f, q) => { f('beforeprint'); seen = { root: q.root.firstElementChild, snap: q.snap() }; f('afterprint'); };
    assert.equal(p.print(), true);
    assert.equal(p.ctl().lastSessionId, id + 1);
    assert.equal(allowedAt(seen.snap, id + 1), true);
    assert.equal(seen.root.getAttribute('data-print-session'), String(id + 1));
    assert.equal(p.calls.length, 2, 'model を作り直していない');
    idleClean(p, '2 回目の後');
  }
});

test('P2-C2-U06 (C-02・X-3): afterprint の無い return・event の無い return・window.print() の例外は DENY_PENDING。押下は window.print() を呼ばず、新しい session も作らない', () => {
  const runs = {
    'C-02(a) beforeprint だけで return': (f) => { f('beforeprint'); },
    'C-02(b) event 0 のまま return（連続抑止）': () => {},
    'X-3 window.print() の例外': () => { throw new Error('print failed'); },
    'X-3 beforeprint の後の例外': (f) => { f('beforeprint'); throw new Error('print failed'); },
    'X-3 beforeprint・afterprint の後の例外': (f) => { f('beforeprint'); f('afterprint'); throw new Error('print failed'); }
  };
  for (const [name, run] of Object.entries(runs)) {
    const p = ready('project_pressure_map');
    p.onPrint = run;
    assert.equal(p.print(), false, name);
    denyPending(p, name);
    const id = p.ctl().lastSessionId;
    const calls = p.calls.length;
    p.onPrint = null;
    assert.equal(p.print(), false, name + ': 押下で印刷した');
    assert.equal(p.printCalls, 1, name + ': window.print() を呼んだ');
    assert.equal(p.ctl().lastSessionId, id, name + ': 新しい session を作った');
    assert.equal(p.calls.length, calls, name + ': 新しい model を作った');
    denyPending(p, name + ' の押下の後');
  }
});

test('P2-C2-U07 (C-03・C-04): DENY_PENDING 中の遅れた afterprint は何度来ても cleanup だけ。IDLE の孤立 afterprint / beforeprint は session を作らない', () => {
  // C-03
  const p = ready('notification1458');
  toDeny(p);
  for (let i = 0; i < 3; i++) { p.fire('afterprint'); denyPending(p, 'C-03 afterprint ' + (i + 1)); }
  // C-04: IDLE（初期・C-01 の後）の孤立 afterprint → 素の印刷（beforeprint → afterprint。window.print() の外）
  for (const after of ['initial', 'after C-01']) {
    const q = ready('case_direct');
    if (after === 'after C-01') assert.equal(q.print(), true);
    const id = q.ctl().lastSessionId;
    for (let i = 0; i < 3; i++) q.fire('afterprint');
    idleClean(q, after + ': 孤立 afterprint');
    q.fire('beforeprint');
    const plain = q.trace[q.trace.length - 1];
    assert.equal(packAllowed(plain), false, after + ': 素の印刷で Pack を許可した');
    assert.equal(plain.rootChildren, 0);
    q.fire('afterprint');
    idleClean(q, after + ': 素の印刷');
    assert.equal(q.ctl().lastSessionId, id, after + ': event で session を作った');
    assert.equal(q.printCalls, after === 'initial' ? 0 : 1);
    // 明示のボタンだけが新しい session を作る
    assert.equal(q.print(), true);
    assert.equal(q.ctl().lastSessionId, id + 1);
  }
});

test('P2-C2-U08 (C-05): 重複した beforeprint は毎回許可を外して確かめ直す。途中で古くなればその回から拒否文だけ。IDLE・DENY_PENDING の beforeprint は許可しない', () => {
  // (a) 区間内で beforeprint × 2 → afterprint。全条件が成り立てば 2 回とも許可、正常終了
  const p = ready('notification1458');
  const checks = [];
  const realLive = p.w.projectPackPrintSessionIsLive;
  p.w.projectPackPrintSessionIsLive = (live) => { checks.push(p.classes().includes('pack-print-allowed')); return realLive(live); };
  p.onPrint = (f) => { f('beforeprint'); f('beforeprint'); f('afterprint'); };
  assert.equal(p.print(), true);
  assert.deepEqual(checks, [false, false], '確かめる時点で前の許可が残っていた');
  const bps = p.trace.filter((t) => t.ev === 'beforeprint');
  assert.equal(bps.length, 2);
  bps.forEach((s) => assert.equal(allowedAt(s, 1), true));
  idleClean(p, 'C-05(a)');
  assert.equal(p.status(), REQUESTED(p.review().review.totalCases));
  // (a') 1 回目と 2 回目の間に試行が変わった → 2 回目から拒否文だけ（要求の class は残り、許可は無い）。終わり方は正常終了
  const q = ready('notification1458');
  q.onPrint = (f, qq) => { f('beforeprint'); qq.invalidate(); f('beforeprint'); f('afterprint'); };
  assert.equal(q.print(), false);
  const [first, second] = q.trace.filter((t) => t.ev === 'beforeprint');
  assert.equal(allowedAt(first, 1), true);
  assert.equal(packAllowed(second), false, '古くなったのに許可した');
  assert.equal(second.classes.includes('pack-print-requested'), true, '要求中は拒否文が出る');
  idleClean(q, "C-05(a')");
  assert.equal(q.status(), REFUSED);
  assert.equal(q.statusError(), true);
  // (b) IDLE の beforeprint だけ
  const r = ready('case_direct');
  r.fire('beforeprint');
  idleClean(r, 'C-05(b)');
  assert.equal(r.ctl().lastSessionId, 0);
  // (c) DENY_PENDING の beforeprint（遅延・重複）
  toDeny(r);
  r.fire('beforeprint');
  r.fire('beforeprint');
  denyPending(r, 'C-05(c)');
  assert.equal(r.trace.slice(-2).every((s) => !packAllowed(s) && s.classes.includes('pack-print-deny-pending')), true);
});

test('P2-C2-U09 (C-06): 区間内の異常な順序は DENY_PENDING（afterprint → beforeprint、2 回目の afterprint、afterprint の後の beforeprint）', () => {
  const runs = {
    '(a) afterprint → beforeprint': { seq: ['afterprint', 'beforeprint'], allowedBefore: false },
    '(b) beforeprint → afterprint → afterprint': { seq: ['beforeprint', 'afterprint', 'afterprint'], allowedBefore: true },
    '(c) beforeprint → afterprint → beforeprint': { seq: ['beforeprint', 'afterprint', 'beforeprint'], allowedBefore: true }
  };
  for (const [name, spec] of Object.entries(runs)) {
    const p = ready('project_pressure_map');
    p.onPrint = (f) => spec.seq.forEach((ev) => f(ev));
    assert.equal(p.print(), false, name);
    denyPending(p, name);
    const events = p.trace.filter((t) => t.ev !== 'callEnter');
    // (a): 最初の afterprint で DENY_PENDING、後の beforeprint で許可しない
    if (!spec.allowedBefore) {
      assert.equal(events[0].state, 'DENY_PENDING', name);
      assert.equal(events.some(packAllowed), false, name + ': 許可した');
    } else {
      // (b)(c): 区間内の最初の beforeprint では許可（出力済みの紙面は取り消さない）、2 つ目の異常で DENY_PENDING
      assert.equal(allowedAt(events[0], 1), true, name);
      assert.equal(events[1].state, 'PRINT_EVENT', name);
      assert.equal(events[2].state, 'DENY_PENDING', name);
      assert.equal(packAllowed(events[2]), false, name);
    }
    assert.equal(p.print(), false);
    assert.equal(p.printCalls, 1, name + ': DENY_PENDING の後に印刷した');
  }
});

test('P2-C2-U10 (C-07): DENY_PENDING はクリック（disabled を外した強制）・時間・Review の生成し直し・Pack の読み直し・class の消去で解除しない（状態は JS から）', () => {
  const p = ready('notification1458');
  toDeny(p);
  const id = p.ctl().lastSessionId;
  // (a) 強制クリック
  p.els['btn-pack-review-print'].disabled = false;
  assert.equal(p.print(), false);
  denyPending(p, '(a) 強制クリック');
  // (b) 時間（この block は timer を持たない。残った timer をすべて進めても変わらない）
  p.drain();
  denyPending(p, '(b) 時間');
  // (d) ページ内の Review の生成し直し・Pack の読み直し・全ケース計算
  assert.equal(p.gen(), true);
  denyPending(p, '(d) Review の生成し直し');
  assert.equal(p.load('case_direct'), true);
  p.runBatch();
  assert.equal(p.gen(), true);
  denyPending(p, '(d) Pack の読み直し・計算・生成');
  // (e) body の印刷の class を外しても、次の印刷の直前に JS の状態から付け直す
  p.body.classList.remove('pack-print-deny-pending');
  assert.equal(p.ctl().state, 'DENY_PENDING');
  p.fire('beforeprint');
  denyPending(p, '(e) class を外した後の beforeprint');
  p.body.classList.remove('pack-print-deny-pending');
  assert.equal(p.print(), false, '(e) class を外した後の押下で印刷した');
  assert.equal(p.printCalls, 1);
  assert.equal(p.ctl().lastSessionId, id, '新しい session を作った');
  // (c) 画面の切替は印刷の block に触れない（静的: U04）。renderProjectPackReviewControls を何度呼んでも変わらない
  p.w.renderProjectPackReviewControls();
  p.w.renderProjectPackReviewPrintControls();
  assert.equal(p.ctl().state, 'DENY_PENDING');
  assert.equal(p.button(), true);
});

test('P2-C2-U11 (C-08): 前の印刷の遅れた event。S1 の DENY_PENDING は S2 を作らない／S2 の区間内の早すぎる afterprint は DENY_PENDING／もっともらしい余分の beforeprint は区別できないが S1 の model・DOM・番号を使わない', () => {
  // (a)
  const a = ready('notification1458');
  toDeny(a);
  assert.equal(a.print(), false);
  a.fire('afterprint');
  a.fire('beforeprint');
  denyPending(a, '(a)');
  assert.equal(a.ctl().lastSessionId, 1, '(a) S2 を作った');
  // (b) S1 正常終了 → S2 の区間で S2 の beforeprint より前に afterprint（注入）
  const b = ready('notification1458');
  assert.equal(b.print(), true);
  b.onPrint = (f) => { f('afterprint'); f('beforeprint'); f('afterprint'); };
  assert.equal(b.print(), false);
  denyPending(b, '(b)');
  assert.equal(b.trace.filter((t) => t.ev !== 'callEnter').slice(3).some(packAllowed), false, '(b) S2 で許可した');
  // (c) S1 正常終了 → S2 の区間に余分の beforeprint（注入）: 受け付けうる。印刷されるのは S2 の root だけ
  const c = ready('notification1458');
  let s1 = null;
  c.onPrint = (f, q) => { f('beforeprint'); s1 = { dom: q.root.firstElementChild, model: q.ctl().live.model }; f('afterprint'); };
  assert.equal(c.print(), true);
  let s2 = null;
  c.onPrint = (f, q) => { f('beforeprint'); f('beforeprint'); s2 = { dom: q.root.firstElementChild, model: q.ctl().live.model, snap: q.snap() }; f('afterprint'); };
  assert.equal(c.print(), true);
  assert.equal(allowedAt(s2.snap, 2), true);
  assert.notEqual(s2.dom, s1.dom, 'S1 の DOM を使った');
  assert.notEqual(s2.model, s1.model, 'S1 の model を使った');
  assert.equal(s2.dom.getAttribute('data-print-session'), '2');
  assert.equal(s1.dom.parentNode, null, 'S1 の DOM が root に残った');
  idleClean(c, '(c)');
});

test('P2-C2-U12 (C-09・X-2): Workspace が FRESH でも DENY_PENDING は拒否の class だけ（Pack の許可・要求なし）。beforeprint の handler の例外は DENY_PENDING', () => {
  const p = ready('project_pressure_map', { workspaceFresh: true });
  toDeny(p);
  // Workspace・Pack・単一ケースの各画面で素の印刷（画面は CSS の条件で、class はどの画面でも同じ）
  for (let i = 0; i < 3; i++) {
    p.fire('beforeprint');
    const s = p.trace[p.trace.length - 1];
    assert.equal(s.classes.includes('review-print-allowed'), true, '前提: Workspace の handler は FRESH で許可');
    assert.equal(s.classes.includes('pack-print-deny-pending'), true, 'DENY_PENDING の class が無い');
    assert.equal(packAllowed(s) || s.classes.includes('pack-print-requested'), false);
    p.fire('afterprint');
    denyPending(p, 'C-09 ' + i);
  }
  // X-2: 区間内の beforeprint の handler の例外 → DENY_PENDING（許可の class を残さない）
  const q = ready('project_pressure_map');
  q.w.projectPackPrintSessionIsLive = () => { throw new Error('handler fault'); };
  assert.equal(q.print(), false);
  denyPending(q, 'X-2');
  assert.equal(q.trace.filter((t) => t.ev === 'beforeprint').every((s) => !packAllowed(s)), true);
  assert.deepEqual(q.listenerErrors, [], 'handler の例外が外へ出た');
});

test('P2-C2-U13 (C-10): 再読み込み（新しいページ）だけが DENY_PENDING から戻る。印刷の許可・session は storage・URL 等に置かない。Pack・Review も再読込で消える', () => {
  const p = ready('notification1458');
  assert.equal(p.print(), true);
  toDeny(p);
  assert.deepEqual(p.touched, [], '保存・通信・console などに触れた: ' + p.touched.join(','));
  const q = page();
  idleClean(q, '再読み込みの後');
  assert.equal(q.ctl().lastSessionId, 0);
  assert.equal(q.review(), null, 'Review が持ち越された');
  assert.equal(q.button(), true);
  q.fire('beforeprint');
  idleClean(q, '再読み込みの後の素の印刷');
  assert.equal(q.load('notification1458'), true);
  q.runBatch();
  assert.equal(q.gen(), true);
  assert.equal(q.print(), true, '再読み込みの後の明示のボタン');
  assert.equal(q.ctl().lastSessionId, 1);
  assert.deepEqual(q.touched, []);
});

test('P2-C2-U14 (X-1): window.print() を呼ぶ前の失敗（model の失敗・生成中の変化・DOM の数の不一致・root が無い）は IDLE と固定文。印刷しない', () => {
  const runs = {
    'module の例外': { printModule: Object.freeze(Object.assign({}, Print, { buildPrintModel: () => { throw new Error('SECRET G001'); } })), text: FAILURE },
    '生成中に試行が変わった': { hook: 'invalidate', text: NOT_READY },
    '生成中に Review が消えた': { hook: 'clear', text: NOT_READY },
    'element の数が model と違う': { printModule: Object.freeze(Object.assign({}, Print, { buildPrintModel: (r, b, c) => {
      const m = Print.buildPrintModel(r, b, c);
      return Object.freeze(Object.assign({}, m, { counts: Object.freeze(Object.assign({}, m.counts, { elements: m.counts.elements + 1 })) }));
    } })), text: FAILURE },
    'module が無い': { printModule: null, text: FAILURE }
  };
  for (const [name, spec] of Object.entries(runs)) {
    let target = null;
    const hook = spec.hook ? () => { if (target) { const t = target; target = null; if (spec.hook === 'invalidate') t.invalidate(); else t.w.clearProjectPackReviewByUser(); } } : undefined;
    const p = ready('notification1458', { printModule: spec.printModule, hook });
    target = p;
    if (spec.printModule === null) assert.equal(p.button(), true, 'module が無いのに押せる');
    assert.equal(p.print(), false, name);
    assert.equal(p.printCalls, 0, name + ': window.print() を呼んだ');
    idleClean(p, name);
    assert.equal(p.status(), spec.text, name);
    assert.equal(p.statusError(), true);
    assert.equal(/SECRET|G00/.test(p.status()), false, '例外の文面を出した');
  }
  // 失敗の後も、明示のボタンで新しい session として印刷できる
  let fail = true;
  const p = ready('notification1458', { printModule: Object.freeze(Object.assign({}, Print, { buildPrintModel: (r, b, c) => {
    if (fail) { fail = false; throw new Error('once'); }
    return Print.buildPrintModel(r, b, c);
  } })) });
  assert.equal(p.print(), false);
  idleClean(p, '1 回目');
  assert.equal(p.print(), true);
  assert.equal(p.ctl().lastSessionId, 2, '失敗した session の番号を使い回した');
  // root が無い
  const q = ready('notification1458');
  const getById = q.w.document.getElementById;
  q.w.document.getElementById = (id) => (id === 'pack-review-print-root' ? null : getById(id));
  assert.equal(q.print(), false);
  assert.equal(q.printCalls, 0);
  assert.equal(q.ctl().state, 'IDLE');
  assert.equal(q.status(), FAILURE);
});

test('P2-C2-U15: 現在の state・発行元・選択と一致しない Review からは印刷しない（押下の時・印刷の直前の beforeprint。発行元は module の assertReviewOrigin）', () => {
  // 押下の時: state の差し替え → model を作らず、window.print() も呼ばない
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
    assert.equal(p.print(), false, name);
    assert.equal(p.calls.length, 0, name + ': model を作った');
    assert.equal(p.printCalls, 0, name);
    idleClean(p, name);
  }
  // 発行元: 内容は同じでも別の instance から発行された review → module の gate が拒否
  const p = ready('project_pressure_map');
  const s = p.review();
  const twinCtx = ProjectContext.fromProjectPack(Pack.validateProjectPack(JSON.parse(FIXTURES.project_pressure_map)));
  const twinBatch = Batch.executeAll(twinCtx);
  const twin = Review.buildPackReview(twinBatch, twinCtx, { detailCaseIds: s.selection.detailCaseIds.slice(), comparisonCaseIds: s.selection.comparisonCaseIds.slice() });
  p.w.currentProjectPackReview = Object.assign({}, s, { review: twin });
  assert.equal(p.print(), false);
  assert.equal(p.calls.length, 1, '前提: UI の確認は通り、module まで届いた');
  assert.equal(p.printCalls, 0);
  idleClean(p, 'origin');
  // 印刷の直前（beforeprint）: 押下の後に Review が変わった・root が差し替えられた → 許可しない（拒否文だけ）
  const changes = {
    'Review の消去': (q) => q.w.clearProjectPackReviewByUser(),
    '選択の変更': (q) => q.compare('', ''),
    '新しい全ケース計算': (q) => q.w.startProjectPackBatch(),
    'root の session の書き換え': (q) => q.root.setAttribute('data-print-session', '999'),
    'root の中身の差し替え': (q) => { q.root.textContent = ''; q.root.appendChild(new FakeElement('div')); },
    'root への追加': (q) => q.root.appendChild(new FakeElement('div')),
    '発行元の不一致（state の review だけ差し替え）': (q) => { q.ctl().live.state = Object.assign({}, q.ctl().live.state, { review: twin }); }
  };
  for (const [name, change] of Object.entries(changes)) {
    const q = ready('project_pressure_map');
    q.onPrint = (f, qq) => { change(qq); f('beforeprint'); f('afterprint'); };
    assert.equal(q.print(), false, name);
    const bp = q.trace.find((t) => t.ev === 'beforeprint');
    assert.equal(packAllowed(bp), false, name + ': 許可した');
    assert.equal(q.ctl().state, 'IDLE', name);
    assert.equal(q.status(), REFUSED, name);
  }
});

test('P2-C2-U16: 2000 ケース × 3 mode・詳細 50・比較を、model のとおり省略せずに DOM にする（element の数・表の全セル・並び）', () => {
  const tablesOf = (el) => el.items('table').map((t) => ({
    headers: t.children[0].children[0].children.map((th) => th.textContent),
    rows: t.children[1].children.map((tr) => tr.children.map((td) => td.textContent))
  }));
  const modelTables = (model) => {
    const out = [];
    const walk = (blocks) => blocks.forEach((b) => { if (b.type === 'table') out.push({ headers: [...b.headers], rows: b.rows.map((r) => [...r]) }); if (b.type === 'detail') walk(b.blocks); });
    walk(model.blocks);
    return out;
  };
  for (const mode of MODES) {
    const p = page();
    assert.equal(p.loadPack(syntheticPack(2000, mode)), true);
    p.runBatch();
    const ids = p.w.stagedProjectPackBatch.rows.map((r) => r.caseId);
    ids.slice(0, 50).forEach((id) => assert.equal(p.detail(id), true));
    p.compare(ids[0], ids[1999]);
    assert.equal(p.gen(), true);
    const s = p.review();
    let seen = null;
    p.onPrint = (f, q) => { f('beforeprint'); seen = { doc: q.root.firstElementChild, snap: q.snap() }; f('afterprint'); };
    assert.equal(p.print(), true, mode);
    assert.equal(allowedAt(seen.snap, 1), true);
    const model = Print.buildPrintModel(s.review, s.batch, s.ctx);
    assert.equal(seen.doc.count(), model.counts.elements, mode + ': element の数');
    assert.equal(model.counts.caseRows, 2000);
    assert.equal(model.counts.details, 50);
    const dom = tablesOf(seen.doc);
    assert.deepEqual(dom, modelTables(model), mode + ': 表');
    const cases = dom.find((t) => t.headers[0] === 'caseId' && t.rows.length === 2000);
    assert.deepEqual(cases.rows.map((r) => r[0]), ids, mode + ': 並び');
    assert.equal(seen.doc.items('div').filter((d) => d.className === 'pack-print-detail').length, 50);
    assert.equal(seen.doc.items('h1')[0].textContent, 'Pack Review（未レビュー）');
    const trust = seen.doc.items('div').find((d) => d.className === 'pack-print-trust');
    assert.deepEqual(trust.items('li').map((li) => li.textContent).slice(0, 4), [...Print.NOTICES]);
    idleClean(p, mode);
  }
});

test('P2-C2-U17: ボタンは Review の現在性に従う（Review が消える経路・生成し直し・選択の変更）。押下の handler も同期で確かめる', () => {
  const paths = {
    'E01 新しい Pack の読込': (p) => p.load('case_direct'),
    'E02 読込の失敗': (p) => p.w.loadProjectPackText('{ not json', '貼り付け'),
    'E03 Pack の解除': (p) => p.w.unloadProjectPack(),
    'E04 新しい全ケース計算': (p) => p.w.startProjectPackBatch(),
    'E05 計算のキャンセル': (p) => { p.w.startProjectPackBatch(); p.w.cancelProjectPackBatch(); },
    'E07 Pack の変化による計算の中止': (p) => { p.w.startProjectPackBatch(); p.load('notification1458'); p.drain(); },
    'E08 詳細・比較の選択の変更': (p) => p.compare('', ''),
    'E10 Review の生成の失敗': (p) => { const ids = p.review().batch.rows.map((r) => r.caseId); p.els['pack-review-compare-a'].value = ids[0]; p.els['pack-review-compare-b'].value = ''; assert.equal(p.gen(), false); },
    'E11 Review の消去': (p) => p.w.clearProjectPackReviewByUser(),
    'E12 ページの切替で古いと分かった': (p) => { p.invalidate(); p.w.showProjectPackReviewPage(0); }
  };
  for (const [name, act] of Object.entries(paths)) {
    const p = ready('project_pressure_map');
    assert.equal(p.button(), false, name + ': 前提');
    act(p);
    assert.equal(p.button(), true, name + ': Review が無いのに押せる');
    p.els['btn-pack-review-print'].disabled = false;
    assert.equal(p.print(), false, name + ': 強制クリックで印刷した');
    assert.equal(p.printCalls, 0);
    idleClean(p, name);
  }
  // E06 計算の失敗（1 ケースだけ失敗する batch module）
  let fail = false;
  const p = ready('project_pressure_map', { batch: batchOver((id) => fail && id === 'G002') });
  assert.equal(p.button(), false);
  assert.equal(p.print(), true, '前提: 別の batch module の組でも印刷できる');
  fail = true;
  p.w.startProjectPackBatch();
  p.drain();
  assert.equal(p.button(), true, 'E06 計算の失敗');
  assert.equal(p.print(), false);
  // E09 生成し直し: 新しい Review で押せる
  const q = ready('project_pressure_map');
  assert.equal(q.gen(), true);
  assert.equal(q.button(), false);
  assert.equal(q.print(), true);
});

test('P2-C2-U18: 区間内の再入（handler からの再押下）は二重に起動しない。印刷の後の Review・一括の結果・Pack は変えない', () => {
  const p = ready('notification1458');
  const s = p.review();
  const batch = p.w.stagedProjectPackBatch;
  const ctx = p.w.stagedProjectPackContext;
  const nested = [];
  p.onPrint = (f, q) => { nested.push(q.print()); f('beforeprint'); nested.push(q.print()); f('afterprint'); nested.push(q.print()); };
  assert.equal(p.print(), true);
  assert.deepEqual(nested, [false, false, false]);
  assert.equal(p.printCalls, 1, '二重に window.print() を呼んだ');
  assert.equal(p.ctl().lastSessionId, 1);
  idleClean(p, '再入の後');
  assert.equal(p.review(), s, 'Review を変えた');
  assert.equal(p.w.stagedProjectPackBatch, batch);
  assert.equal(p.w.stagedProjectPackContext, ctx);
  assert.equal(p.w.activeProjectContext, ACTIVE_SENTINEL, 'active context を変えた');
  assert.deepEqual(p.touched, []);
});

test('P2-C2-U19: module は初期化時に 1 度だけ掴む（後から置いた global は使わない）。module が無くても Review の生成・表示・消去は動く', () => {
  const p = page({ printModule: null });
  assert.equal(p.load('case_direct'), true);
  p.runBatch();
  assert.equal(p.gen(), true);
  assert.equal(p.button(), true);
  assert.equal(p.print(), false);
  assert.equal(p.printCalls, 0);
  p.w.ProjectPackReviewPrint = Print;
  assert.equal(p.gen(), true);
  assert.equal(p.button(), true);
  assert.equal(p.print(), false, '後から置いた global を使った');
  assert.equal(vm.runInContext('PACK_REVIEW_PRINT_MODULE', p.w), null);
  assert.equal(p.w.clearProjectPackReviewByUser(), true);
  assert.equal(p.review(), null);
});
