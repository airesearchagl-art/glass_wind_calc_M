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
