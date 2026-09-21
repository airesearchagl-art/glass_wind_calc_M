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
  assert.equal((code.match(/window\.print\(\)/g) || []).length, 1, 'print呼び出しは1か所');
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
});

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
