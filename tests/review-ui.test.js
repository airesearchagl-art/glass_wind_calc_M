'use strict';

/**
 * Phase 2I Wave 4: Review UI の contract テスト。
 *
 * 見るのは index.html の**実行コード**であり、コメント文ではない
 * （自分の説明文に当たるgrepは、書いた本人以外には意味が無い）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/** コメントと文字列リテラルを落とし、実行コードだけを残す。 */
function scriptCode() {
  const m = HTML.match(/<script>([\s\S]*)<\/script>/);
  assert.notEqual(m, null, 'inline script が取れること');
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ''))
    .join('\n');
}

function bodyOf(code, name) {
  const start = code.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' が存在すること');
  const end = code.indexOf('\n}', start);
  return code.slice(start, end === -1 ? undefined : end);
}

test('UI-1: review-package.js を読み込んでいる', () => {
  assert.match(HTML, /<script src="review-package\.js"><\/script>/);
  // 依存より後に読む
  assert.equal(HTML.indexOf('review-package.js') > HTML.indexOf('workspace.js'), true);
});

test('UI-2: 印刷対象のreport rootが存在する', () => {
  assert.match(HTML, /id="review-report"/);
  assert.match(HTML, /id="review-config-card"/);
});

test('UI-3: report controlのIDが一意である', () => {
  const ids = (HTML.match(/id="(rep-[^"]+|btn-rep-[^"]+|review-[^"]+)"/g) || [])
    .map((m) => m.slice(4, -1));
  assert.equal(ids.length > 10, true, 'report controlが十分にある: ' + ids.length);
  assert.equal(new Set(ids).size, ids.length, '重複ID: ' + ids.join(','));
  for (const required of ['rep-title', 'rep-subtitle', 'rep-note', 'rep-privacy',
                          'rep-detail-list', 'rep-cmp-a', 'rep-cmp-b', 'rep-freshness',
                          'btn-rep-generate', 'btn-rep-markdown', 'btn-rep-json',
                          'btn-rep-print', 'review-report']) {
    assert.equal(ids.includes(required), true, required + ' がある');
  }
});

test('UI-4: reportの描画元は activeReview だけ', () => {
  const render = bodyOf(scriptCode(), 'renderReviewReport');
  assert.match(render, /activeReview/);
  // 生成後にWorkspace側を読み直さない
  for (const forbidden of ['batchResults', 'batchWorkspace', 'activeProfile', 'scenarioMatrix',
                           'evaluateWorkspace', 'summarize(']) {
    assert.equal(render.includes(forbidden), false,
      'renderReviewReport が ' + forbidden + ' を読まない');
  }
});

test('UI-5: exportは canonical exporter を呼ぶ（UIで組み立て直さない）', () => {
  const code = scriptCode();
  const md = bodyOf(code, 'exportReviewMarkdown');
  const js = bodyOf(code, 'exportReviewJson');

  assert.match(md, /ReviewPackage\.toMarkdown\(activeReview\)/);
  assert.match(js, /ReviewPackage\.serializeReviewPackage\(activeReview\)/);
  assert.equal(/JSON\.stringify\(activeReview/.test(code), false,
    'activeReview を直接 stringify しない');
  // Markdownの組み立てをUIへ複製しない
  assert.equal(code.includes('escapeMarkdown'), false);
});

test('UI-6: export / print は必ず鮮度ゲートを通る', () => {
  const code = scriptCode();
  for (const fn of ['exportReviewMarkdown', 'exportReviewJson', 'printReview']) {
    assert.match(bodyOf(code, fn), /assertReviewExportable\(/, fn + ' がゲートを通る');
  }
  const gate = bodyOf(code, 'assertReviewExportable');
  assert.match(gate, /renderReviewFreshness\(\)/);
  assert.match(gate, /FRESH/);
  // window.print はゲートの後でしか呼ばれない
  const print = bodyOf(code, 'printReview');
  assert.equal(print.indexOf('assertReviewExportable') < print.indexOf('window.print'), true);
  // print呼び出しは 2 か所だけ（S3-B3B2-C2 の Human 承認済みの移行）: Workspace の資料（printReview。上の鮮度ゲートの後で
  // 1 回）と Pack Review（printProjectPackReview。Pack 専用のゲートの後で 1 回）。ほかの関数からは呼ばない
  const calls = [...code.matchAll(/window\.print\(\)/g)].map((m) => m.index);
  assert.equal(calls.length, 2, 'print呼び出しは Workspace と Pack の 2 か所');
  const owner = (i) => { const s = code.lastIndexOf('\nfunction ', i); return code.slice(s + 10, code.indexOf('(', s)); };
  assert.deepEqual(calls.map(owner), ['printReview', 'printProjectPackReview']);
  assert.equal(print.split('window.print()').length - 1, 1, 'Workspace の print は 1 回');
  assert.equal(print.indexOf('if (!assertReviewExportable(\'print\')) return;') < print.indexOf('window.print()'), true);
  // Pack: DENY_PENDING の拒否・現在性の確認（model の前・DOM の前・要求の直前）・module の発行元の gate・要求の class の後で 1 回
  const pack = bodyOf(code, 'printProjectPackReview');
  const at = (s) => { const i = pack.indexOf(s); assert.notEqual(i, -1, s); return i; };
  const callAt = at('window.print()');
  assert.equal(pack.split('window.print()').length - 1, 1, 'Pack の print は 1 回');
  const denyAt = at("if (projectPackPrint.state === 'DENY_PENDING') {");
  assert.equal(denyAt < callAt && pack.indexOf('return false;', denyAt) < callAt, true, 'DENY_PENDING は print の前に返す');
  assert.equal(at("if (projectPackPrint.state !== 'IDLE') return false;") < callAt, true);
  const gates = [...pack.matchAll(/if \(!projectPackReviewPrintIsCurrent\(state\)\) throw/g)].map((m) => m.index);
  assert.equal(gates.length, 4, '現在性の確認は 4 回（model の前・後・DOM を置く前・要求の直前）');
  gates.forEach((g) => assert.equal(g < callAt, true));
  assert.equal(at('PACK_REVIEW_PRINT_MODULE.buildPrintModel(state.review, state.batch, state.ctx)') < callAt, true);
  assert.equal(at("document.body.classList.add('pack-print-requested');") < callAt, true);
  // 確認に失敗したら print の前に返す（catch は print の try より前）
  assert.equal(pack.indexOf('} catch (e) {') < callAt && pack.indexOf('return false;', pack.indexOf('} catch (e) {')) < callAt, true);
  // Workspace の gate（assertReviewExportable）と Pack の gate は互いを呼ばない
  assert.equal(pack.includes('assertReviewExportable'), false);
  assert.equal(/projectPackPrint|ProjectPackReview/.test(print), false);
});

test('UI-7: @media print が report だけを残す', () => {
  assert.match(HTML, /@media print/);
  const block = HTML.slice(HTML.indexOf('@media print'));
  const rules = block.slice(0, block.indexOf('\n  .batch-table'));
  for (const hidden of ['#review-config-card', 'button', 'select', 'textarea', 'input',
                        '.main-wrap', '.app-header']) {
    assert.equal(rules.includes(hidden), true, hidden + ' を印刷しない');
  }
  assert.match(rules, /#review-report\s*\{[^}]*display:\s*block/);
  assert.match(rules, /break-inside:\s*avoid/);

  // GWCM-WP-REPAIR-R-A-001: 文字列があるだけでは通さない（W-P1 は `.app-header` の要素が無いまま通っていた）。
  // W-P1: 隠す class を持つ要素が実際に 1 つあり、それが app の header である
  assert.equal((HTML.match(/class="[^"]*\bapp-header\b[^"]*"/g) || []).length, 1, '.app-header の要素がちょうど 1 つ');
  assert.match(HTML, /\n<header class="app-header">\n  <div class="header-icon">/);
  // W-P2: #view-batch の直下は Report と固定の拒否文の 2 つ以外を印刷しない（隠すカードを並べる方式に頼らない allowlist）
  const allow = '\n    #view-batch > :not(#review-report):not(#review-print-blocked) { display: none !important; }\n';
  assert.equal(rules.split(allow).length - 1, 1, 'Workspace の印刷の allowlist');
  const kids = viewBatchChildren();
  const ids = kids.map((k) => k.id);
  for (const id of ['review-report', 'review-print-blocked', 'workspace-print-hint']) {
    assert.equal(ids.filter((x) => x === id).length, 1, '#' + id + ' は #view-batch の直下に 1 つ');
  }
  // 入力・説明・状態のカード（Profile・Scenario・Workspace・TSV・JSON / CSV・サマリ・結果・資料の設定）はすべて allowlist の外
  const printable = kids.filter((k) => k.id === 'review-report' || k.id === 'review-print-blocked');
  assert.equal(printable.length, 2);
  const cards = kids.filter((k) => /\bcard\b/.test(k.cls) && k.id !== 'review-report');
  assert.equal(cards.length >= 8, true, '#view-batch の直下のカードを読めていない: ' + cards.length);
  // 印刷の CSS（最初の @media print）で display を与える規則はこれだけ。ほかの子を表示し直す規則を置かない
  const shows = [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => /display:\s*block/.test(m[2]))
    .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' '));
  const single = 'body:not(.pack-print-requested):not(.pack-print-deny-pending):has(> #view-single:not([hidden]))';
  assert.deepEqual(shows, [
    '.batch-wrap',
    single + ' > #view-batch',
    single + ' > #view-batch > #workspace-print-hint',
    '#review-print-blocked',
    'body.review-print-allowed #review-report'
  ]);
});

/** #view-batch の直下の要素（tag・id・class）を、静的な markup から順に読む。 */
function viewBatchChildren() {
  const start = HTML.indexOf('<div class="batch-wrap" id="view-batch"');
  assert.notEqual(start, -1);
  const voids = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'wbr']);
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  re.lastIndex = HTML.indexOf('>', start) + 1;
  const kids = [];
  let depth = 1;
  for (let m = re.exec(HTML); m && depth > 0; m = re.exec(HTML)) {
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { depth--; continue; }
    if (depth === 1) {
      const id = (m[3].match(/\sid="([^"]*)"/) || [])[1] || null;
      const cls = (m[3].match(/\sclass="([^"]*)"/) || [])[1] || '';
      kids.push({ tag, id, cls });
    }
    if (!voids.has(tag) && !/\/\s*$/.test(m[3])) depth++;
  }
  assert.equal(depth, 0, '#view-batch の閉じタグまで読めていない');
  return kids;
}

test('UI-7b: 単一ケースの画面の印刷は固定の案内文だけ（W-P3）。Pack の要求中・DENY_PENDING は C2 の規則が先', () => {
  const block = HTML.slice(HTML.indexOf('@media print'));
  const rules = block.slice(0, block.indexOf('\n  .batch-table'));
  const single = 'body:not(.pack-print-requested):not(.pack-print-deny-pending):has(> #view-single:not([hidden]))';
  // 隠れている #view-batch（.batch-wrap[hidden] の詳細度 0,2,0）を、この画面のときだけ表示し、案内文以外の子を隠す
  assert.match(rules, new RegExp(escapeRe(single + ' > #view-batch { display: block !important; }')));
  assert.match(rules, new RegExp(escapeRe(single + ' > #view-batch > :not(#workspace-print-hint) { display: none !important; }')));
  assert.match(rules, new RegExp(escapeRe(single + ' > #view-batch > #workspace-print-hint {') + '[^}]*display: block !important;'));
  // #view-batch / #workspace-print-hint を表示する規則は、すべて C2 の状態の class と単一ケースの画面で絞る（F1 の詳細度の教訓）
  const css = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
  const showing = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => /display:\s*block/.test(m[2]) && /#workspace-print-hint|>\s*#view-batch\s*$/.test(m[1].trim()))
    .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim());
  assert.equal(showing.length, 2);
  showing.forEach((sel) => assert.equal(sel.startsWith(single + ' > #view-batch'), true, sel));
  // 案内文は #view-batch の中・固定の拒否文の後ろの静的な文面で、画面には出さない。script から書き換えない
  assert.match(HTML, /<\/div>\n\n  <!--[^>]*-->\n  <div id="workspace-print-hint">\n    <p><strong>この画面（単一ケース）は印刷に対応していません。<\/strong><\/p>\n    <p>設計レビュー資料は、複数ケース（Workspace）画面で資料を作成し、「印刷 \/ PDF」ボタンから印刷してください。<\/p>\n  <\/div>\n\n<\/div>\n/);
  assert.equal(HTML.indexOf('id="review-print-blocked"') < HTML.indexOf('id="workspace-print-hint"'), true);
  const screen = css.slice(0, css.indexOf('@media print'));
  assert.match(screen, /\n  #workspace-print-hint \{ display: none; \}\n/);
  assert.equal(/workspace-print-hint/.test(scriptCode()), false, 'script から案内文に触れない');
});

test('UI-7c: 印刷の前に常に見える注意（ヘッダーとフッターは OFF・アプリからは止められない・Report か拒否文だけ）', () => {
  const card = HTML.slice(HTML.indexOf('<div class="card" id="review-config-card">'), HTML.indexOf('<div class="card" id="review-report"'));
  const note = card.indexOf('<div class="notice" id="rep-print-headers" role="note"');
  assert.notEqual(note, -1, '注意は資料の設定のカードの中');
  assert.equal(note < card.indexOf('id="btn-rep-print"'), true, '注意は印刷ボタンより前');
  const text = card.slice(note, card.indexOf('</div>', note)).replace(/\s+/g, ' ');
  for (const s of ['「ヘッダーとフッター」を OFF にしてください', 'URL・日時（手元のファイルで開いた場合はファイルの場所）',
    'アプリからは OFF にできません', '「このReportは印刷できません。」の固定の文だけを印刷します']) {
    assert.equal(text.includes(s), true, s);
  }
  assert.match(card, /<button type="button" id="btn-rep-print" class="btn-secondary" aria-describedby="rep-print-headers"\n\s+onclick="printReview\(\)">印刷 \/ PDF<\/button>/);
});

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

test('UI-8: report値を innerHTML へ入れない', () => {
  const code = scriptCode();
  const reviewFns = ['renderReviewReport', 'revEl', 'revTable', 'revSection',
                     'refreshReportSelectors', 'showExportOutput', 'renderReviewFreshness'];
  for (const fn of reviewFns) {
    const body = bodyOf(code, fn);
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
      assert.equal(body.includes(sink), false, fn + ' が ' + sink + ' を使わない');
    }
  }
  assert.match(bodyOf(code, 'revEl'), /textContent/);
});

test('UI-9: 公開範囲の表示は activeReview.privacyMode を読む', () => {
  const render = bodyOf(scriptCode(), 'renderReviewReport');
  assert.match(render, /rev\.privacyMode/);
  // 現在のトグルから推測しない
  assert.equal(render.includes("getElementById('rep-privacy')"), false);
});

test('UI-10: stale判定を UI で再実装しない', () => {
  const code = scriptCode();
  const fresh = bodyOf(code, 'getReviewFreshness');
  assert.match(fresh, /ReviewPackage\.isReviewStale\(/);
  assert.match(fresh, /readCurrentReportSettings\(\)/);
  // serializeWorkspace を使った自前比較を持たない
  assert.equal(fresh.includes('serializeWorkspace'), false);
});

test('UI-11: 鮮度は旗ではなく、その場の設定から計算し直す', () => {
  const code = scriptCode();
  const fresh = bodyOf(code, 'getReviewFreshness');
  // 「どこかで立てたフラグ」を読むのではなく、現在値を読んで比較する
  assert.match(fresh, /serializeReportSettings\(readCurrentReportSettings\(\)\)/);
  assert.match(fresh, /activeReportSettingsSnapshot/);
  assert.equal(/reportSettingsDirty\s*=/.test(code), false,
    'dirtyフラグ変数を判定の根拠にしない');

  const settings = bodyOf(code, 'readCurrentReportSettings');
  for (const id of ['rep-title', 'rep-subtitle', 'rep-note', 'rep-privacy',
                    'rep-cmp-a', 'rep-cmp-b']) {
    assert.equal(settings.includes(id), true, id + ' を読む');
  }
  assert.match(settings, /rep-detail-list/);
});

test('UI-12: activeReview を作れるのは builder だけ', () => {
  const code = scriptCode();
  const assignments = code.match(/activeReview\s*=\s*[^;]+/g) || [];
  assert.equal(assignments.length >= 2, true);
  for (const a of assignments) {
    assert.equal(
      /activeReview\s*=\s*(null|ReviewPackage\.buildReviewPackage\()/.test(a), true,
      'activeReview への代入は builder か null のみ: ' + a.slice(0, 60));
  }
});

test('UI-13: Report生成は読み取り専用（Workspace等を変更しない）', () => {
  const code = scriptCode();
  const gen = bodyOf(code, 'generateReview');
  for (const mutator of ['addCase', 'removeCase', 'duplicateCase', 'clear()', 'setLabel',
                         'activeProfile =', 'scenarioMatrix =', 'batchResults =']) {
    assert.equal(gen.includes(mutator), false, 'generateReview が ' + mutator + ' を呼ばない');
  }
});

test('UI-14: Review UI は保存も通信もしない', () => {
  const code = scriptCode();
  const start = code.indexOf('var activeReview');
  assert.notEqual(start, -1);
  const reviewSection = code.slice(start);
  for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie',
                     'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'eval(']) {
    assert.equal(reviewSection.includes(api), false, api + ' を使わない');
  }
});

test('UI-15: 承認を名乗る語をUIに持たない', () => {
  const code = scriptCode();
  const start = code.indexOf('var activeReview');
  const reviewSection = code.slice(start);
  for (const word of ['Approved', 'Certified', 'Final Design', '承認済', '検定済']) {
    assert.equal(reviewSection.includes(word), false, word + ' を出さない');
  }
  for (const word of ['winner', 'better', 'safer']) {
    assert.equal(reviewSection.toLowerCase().includes(word), false, word + ' を出さない');
  }
});

// ============================================================
// Wave 4H: 印刷の最終関門と、比較設定の片側状態
// ============================================================

test('4H-1: 印刷は既定で不可。許可の印が付いたときだけ資料が出る（RF-P1）', () => {
  const block = HTML.slice(HTML.indexOf('@media print'));
  const rules = block.slice(0, block.indexOf('\n  .batch-table'));

  // 既定で隠す → 許可時だけ出す、の順で書かれていること
  const hideAt = rules.indexOf('#review-report { display: none !important; }');
  const showAt = rules.indexOf('body.review-print-allowed #review-report');
  assert.notEqual(hideAt, -1, '既定で #review-report を隠す');
  assert.notEqual(showAt, -1, '許可時のみ表示する');
  assert.equal(hideAt < showAt, true, '既定が先、許可が後');

  // 警告の裏に資料を残さない（display切り替えであること）
  assert.match(rules, /#review-print-blocked \{[^}]*display: block !important/);
  assert.match(rules, /body\.review-print-allowed #review-print-blocked[^}]*display: none !important/);
  // 警告文は静的markupで、runtime文字列ではない
  assert.match(HTML, /id="review-print-blocked"/);
  assert.match(HTML, /このReportは印刷できません/);
});

test('4H-2: beforeprint がその場で鮮度を計算し直す（旗を読まない）', () => {
  const code = scriptCode();
  assert.match(code, /addEventListener\('beforeprint'/);
  const idx = code.indexOf("addEventListener('beforeprint'");
  const handler = code.slice(idx, idx + 260);
  assert.match(handler, /getReviewFreshness\(\)/, 'その場で計算する');
  assert.match(handler, /applyPrintEligibility\(/);
  // 保存された状態を読むだけの実装にしない
  assert.equal(/beforeprint[\s\S]{0,200}cachedFreshness/.test(code), false);

  assert.match(code, /addEventListener\('afterprint'/);
  const aidx = code.indexOf("addEventListener('afterprint'");
  assert.match(code.slice(aidx, aidx + 200), /applyPrintEligibility\(false\)/,
    '許可状態を印刷後に持ち越さない');
});

test('4H-3: アプリのボタン側のgateも残っている（§8）', () => {
  const code = scriptCode();
  assert.match(bodyOf(code, 'printReview'), /assertReviewExportable\(/);
  // 二層である: ボタン = 早い案内 / beforeprint = 最終境界
  assert.match(code, /addEventListener\('beforeprint'/);
});

test('4H-4: 比較の片側選択を [] へ潰さない（RF-P2）', () => {
  const code = scriptCode();
  const settings = bodyOf(code, 'readCurrentReportSettings');
  assert.match(settings, /comparisonA/);
  assert.match(settings, /comparisonB/);
  // 旧実装の (a && b) ? [a, b] : [] を残さない
  assert.equal(/\(a && b\)\s*\?/.test(settings), false);
  assert.equal(settings.includes('comparisonCaseIds'), false,
    '生の選択値を読む段階で配列へ畳まない');

  // snapshot が A / B を別々に含む
  const ser = bodyOf(code, 'serializeReportSettings');
  assert.match(ser, /comparisonA/);
  assert.match(ser, /comparisonB/);
});

test('4H-5: 片側だけの比較指定は fail closed（§11）', () => {
  const code = scriptCode();
  const fn = bodyOf(code, 'comparisonIdsFrom');
  assert.match(fn, /両方を選択/, '明示的なメッセージで止める');
  assert.match(fn, /throw new Error/);
  // 自動補完しない
  assert.equal(/comparisonB\s*=\s*settings\.comparisonA/.test(fn), false);
  // 生成時にこの関数を通る
  assert.match(bodyOf(code, 'generateReview'), /comparisonIdsFrom\(settings\)/);
});

test('4H-6: 古くなったらexport bufferを残さない（§13 / §14）', () => {
  const code = scriptCode();
  const fresh = bodyOf(code, 'renderReviewFreshness');
  assert.match(fresh, /rep-export-out/);
  assert.match(fresh, /hidden = true/);
  assert.match(fresh, /value = ''/, '値も消す（表示を隠すだけにしない）');
  // 同じ再計算が print 可否とbufferの両方を守る
  assert.match(fresh, /applyPrintEligibility\(/);
});

test('W5-37: Report操作のコードに通信・保存の呼び出しが無い（実行コードのみを見る）', () => {
  const code = scriptCode();
  // Review UIの実行コード範囲だけを対象にする
  const start = code.indexOf('var activeReview');
  assert.notEqual(start, -1);
  const reviewCode = code.slice(start);

  for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource',
                     'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie',
                     'navigator.send', 'caches.open', 'serviceWorker']) {
    assert.equal(reviewCode.includes(api), false, api + ' を持たない');
  }
  // Report操作の各関数にも無い
  for (const fn of ['generateReview', 'exportReviewMarkdown', 'exportReviewJson',
                    'printReview', 'renderReviewReport', 'renderReviewFreshness']) {
    const body = bodyOf(code, fn);
    for (const api of ['fetch(', 'localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest']) {
      assert.equal(body.includes(api), false, fn + ' が ' + api + ' を使わない');
    }
  }
});

test('W5-30: previewは支配ケースを自分で選び直さない', () => {
  const code = scriptCode();
  const render = bodyOf(code, 'renderReviewReport');

  // rev は activeReview から1度だけ束縛し、以後差し替えない
  const assignments = render.match(/\brev\s*=\s*[^=][^;]*/g) || [];
  assert.equal(assignments.length, 1, 'rev への代入は1回だけ: ' + JSON.stringify(assignments));
  assert.match(assignments[0], /rev\s*=\s*activeReview/);

  // governing は model の値をそのまま読む
  assert.match(render, /rev\.governingCase\.caseId/);
  assert.match(render, /rev\.governingCase\.basis/);
  // preview側で governingCase を組み立てない
  assert.equal(/governingCase\s*:/.test(render), false,
    'preview が governingCase を自作していない');
  assert.equal(/Object\.assign\(\s*\{\}\s*,\s*rev/.test(render), false,
    'rev を差し替えたcopyで描画しない');
  // summary 由来の値も同様に model から読む
  assert.equal(render.includes('summarize('), false);
});

test('W6: 設定snapshotは6項目すべてを含む（browser suiteに頼らず npm test で守る）', () => {
  const code = scriptCode();
  const ser = bodyOf(code, 'serializeReportSettings');

  // privacyMode が抜けると、Full で作った資料を Redacted へ切り替えても
  // SETTINGS_DIRTY にならず、そのまま export / print できてしまう。
  // これを落とせるのが browser suite だけだと、repo外の資産に依存することになる。
  for (const field of ['title', 'subtitle', 'note', 'privacyMode',
                       'detailCaseIds', 'comparisonA', 'comparisonB']) {
    assert.match(ser, new RegExp('settings\\.' + field + '\\b'),
      'snapshot に ' + field + ' が入る');
  }
  // 読み取り側も同じ6系統を読む
  const read = bodyOf(code, 'readCurrentReportSettings');
  for (const id of ['rep-title', 'rep-subtitle', 'rep-note', 'rep-privacy',
                    'rep-detail-list', 'rep-cmp-a', 'rep-cmp-b']) {
    assert.equal(read.includes(id), true, id + ' を読む');
  }
});
