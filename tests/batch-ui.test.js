'use strict';

/**
 * Phase 2G: Batch / Scenario Workspace の UI 契約テスト。
 *
 * index.html はNode testからDOMとして実行しないため、
 * 「UIが守るべき境界」をソース契約として固定する。
 * 実挙動はPlaywrightのbrowser checkで別途確認する。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const html = () => fs.readFileSync(INDEX_HTML_PATH, 'utf8');

/** index.html末尾のinline scriptだけを取り出す。 */
function inlineScript() {
  const src = html();
  const match = src.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
  assert.ok(match, 'inline scriptが見つかるはず');
  return match[1];
}

/** Phase 2Gで追加したbatch関連のJSだけを取り出す。 */
function batchScript() {
  const script = inlineScript();
  const marker = script.indexOf('Phase 2G: Batch / Scenario Workspace');
  assert.notEqual(marker, -1, 'Batch UIブロックが見つかるはず');
  // markerはblock commentの**内側**にある。コメント開始 `/*` まで戻らないと、
  // 後段のコメント除去が開き記号を見つけられない。
  const start = script.lastIndexOf('/*', marker);
  assert.notEqual(start, -1, 'Batch UIブロックのコメント開始が見つかるはず');
  return script.slice(start);
}

/**
 * コメントと文字列リテラルを除いた「実行されるコードだけ」を返す。
 *
 * 「localStorageを使わない」とコメントに書くとsrc.includes('localStorage')が真になる。
 * 見たいのは実際の呼び出しなので、宣言と実装を分けて判定する。
 */
function batchCodeOnly() {
  return batchScript()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/* ============================================================
   AC-01 Single view が既定のまま
============================================================ */

test('AC-01: Single viewが既定で、Batch viewは初期状態でhidden', () => {
  const src = html();
  assert.match(src, /<div class="main-wrap" id="view-single">/);
  assert.match(src, /<div class="batch-wrap" id="view-batch" hidden>/);
  assert.match(src, /id="view-tab-single" class="view-tab is-active"/);
  // Single側にhidden属性が最初から付いていないこと
  assert.doesNotMatch(src, /id="view-single"[^>]*\shidden/);
});

test('AC-01 regression: display指定が [hidden] を上書きしないこと', () => {
  // .main-wrap / .batch-wrap は display:grid を持つ。
  // [hidden] の既定 display:none はそれに負けるため、明示規則が無いと
  // 初期表示でSingleとBatchが同時に描画される（実際に一度そうなった）。
  const src = html();
  assert.match(src, /\.main-wrap\[hidden\][^}]*display:\s*none/);
  assert.match(src, /\.batch-wrap\[hidden\][^}]*display:\s*none/);
  // 前提（display:grid を持っている）が変わったらこのテストの意味も変わる
  assert.match(src, /\.main-wrap\s*\{[^}]*display:\s*grid/);
  assert.match(src, /\.batch-wrap\s*\{[^}]*display:\s*grid/);
});

test('AC-01: Single計算のcontractを変えていない', () => {
  const script = inlineScript();
  // runCalc / buildCurrentProjectInput / 既存入力IDは残っている
  assert.match(script, /function runCalc\(\)/);
  assert.match(script, /function buildCurrentProjectInput\(\)/);
  for (const id of ['inp-mode', 'inp-W', 'inp-H', 'inp-coeff', 'inp-type']) {
    assert.ok(html().includes('id="' + id + '"'), '既存入力ID ' + id + ' が残っている');
  }
  // Batch側がrunCalcの結果表示を書き換えていない
  assert.doesNotMatch(batchScript(), /renderResults\(/);
  assert.doesNotMatch(batchScript(), /getElementById\('result-area'\)/);
});

/* ============================================================
   AC-02 Batch UIが計算を持たない
============================================================ */

test('AC-02: Batch UIは WorkspaceCore 経由でのみ計算する', () => {
  const batch = batchScript();
  for (const api of ['createWorkspace', 'evaluateWorkspace', 'summarize',
                     'groupByRecommended', 'sortResults', 'filterResults',
                     'parseTsv', 'addTsvRows', 'serializeWorkspace',
                     'deserializeWorkspace', 'toCsv']) {
    assert.ok(batch.includes('WorkspaceCore.' + api),
      'Batch UIは WorkspaceCore.' + api + ' を使う');
  }
  // 自前で計算コアを呼ばない（orchestrationはworkspace.js側の責務）
  assert.doesNotMatch(batch, /GlassCalc\.generateCandidates/);
  assert.doesNotMatch(batch, /GlassCalc\.splitCandidates/);
  assert.doesNotMatch(batch, /WindPressure\./);
  // 自前の式を持たない
  assert.doesNotMatch(batch, /\/\s*1000000/);
  assert.doesNotMatch(batch, /\/\s*1_000_000/);
});

/* ============================================================
   AC-19 HTML injection
============================================================ */

test('AC-19: Batch UIはユーザー由来の文字列をinnerHTMLへ入れない', () => {
  const batch = batchScript();
  assert.doesNotMatch(batch, /\.innerHTML/,
    'Batch UIは innerHTML を一切使わない（textContent / createElement のみ）');
  assert.doesNotMatch(batch, /insertAdjacentHTML/);
  assert.doesNotMatch(batch, /document\.write/);
  assert.doesNotMatch(batch, /outerHTML/);
  // 表示はtextContentで行っている
  assert.match(batch, /td\.textContent =/);
  assert.match(batch, /host\.textContent = ''/);
  // ラベル・エラー文もtextContent（位置情報を前置しても textContent のまま）
  assert.match(batch, /reason\.textContent = \(where\.length > 0[\s\S]*?\) \+ r\.error;/);
  assert.match(batch, /note\.textContent = r\.source === 'tsv'/);
});

test('AC-19: 行の操作ボタンはaddEventListenerで繋ぐ（onclick文字列を組み立てない）', () => {
  const batch = batchScript();
  // caseIdやlabelをHTML属性へ文字列連結しない
  assert.doesNotMatch(batch, /onclick\s*=\s*['"`][^'"`]*\+/,
    'onclick属性へ値を文字列連結してはならない');
  assert.match(batch, /addEventListener\('click', function \(\) \{ batchDuplicate\(r\.caseId\); \}\)/);
  assert.match(batch, /addEventListener\('click', function \(\) \{ batchRemove\(r\.caseId\); \}\)/);
});

/* ============================================================
   AC-21 persistence / §37 error reporting
============================================================ */

test('AC-21: Batch UIは永続化しない（memory-only）', () => {
  const code = batchCodeOnly();
  for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'cookie',
                     'XMLHttpRequest', 'sendBeacon', 'WebSocket']) {
    assert.doesNotMatch(code, new RegExp('\\b' + api + '\\b'),
      'Batch UIは ' + api + ' を使わない');
  }
  assert.doesNotMatch(code, /\bfetch\s*\(/);
  // コメント側では memory-only である旨を宣言していること
  assert.match(batchScript(), /memory-only/);
  // 保存はexplicit Exportのみであることを画面に書いている
  assert.match(html(), /ブラウザにもサーバーにも保存しません/);
});

test('§37: import errorの整形が生データを出さない', () => {
  const batch = batchScript();
  const fn = batch.slice(batch.indexOf('function batchFormatErrors'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  // 出してよいのは lineNumber / index / caseId / field / reason だけ
  assert.match(body, /e\.lineNumber/);
  assert.match(body, /e\.caseId/);
  assert.match(body, /e\.field/);
  assert.match(body, /e\.reason/);
  for (const forbidden of ['e.row', 'e.raw', 'e.rawRow', 'JSON.stringify(e)']) {
    assert.equal(body.includes(forbidden), false, 'error整形に ' + forbidden + ' を含めない');
  }
});

/* ============================================================
   読み込み順 / 表示文言
============================================================ */

test('workspace.js は project-input.js / calc.js の後に読み込む', () => {
  const src = html();
  const order = ['calc.js', 'project-config/project-input.js', 'workspace.js']
    .map((f) => src.indexOf('<script src="' + f + '"></script>'));
  assert.ok(order.every((i) => i !== -1), 'すべて読み込まれている');
  assert.ok(order[0] < order[2], 'calc.js が workspace.js より先');
  assert.ok(order[1] < order[2], 'project-input.js が workspace.js より先');
});

test('governing caseの定義を画面に明示し、曖昧な表現を使わない', () => {
  const batch = batchScript();
  assert.match(batch, /定義: OKケースのうち/);
  assert.match(batch, /定義: OKケースが無いため/);
  // 画面に出る文字列（文字列リテラル）に曖昧な表現が無いこと。
  // 「使わない」とコメントに書くこと自体は許すので、コメントを外してから見る。
  const withoutComments = batchScript()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  const literals = (withoutComments.match(/'(?:[^'\\]|\\.)*'/g) || []).join(' ');
  assert.equal(literals.includes('最も危険'), false, '曖昧な「最も危険」表現を表示しない');
  assert.equal(literals.includes('安全率'), false, '計算上の余裕を安全率と呼ばない');
  // 静的マークアップ（script外）にも出ていないこと。
  // script内のコメントで「使わない」と書くのは許す。
  const markup = html().replace(/<script>[\s\S]*?<\/script>/g, ' ');
  assert.equal(markup.includes('最も危険'), false);
  assert.equal(markup.includes('安全率'), false);
});

test('取り込みデータが未検証である旨を画面に明示する', () => {
  const src = html();
  assert.match(src, /未検証の取り込みデータ/);
  assert.match(src, /計算結果側の列は受け付けません/);
  assert.match(src, /入力だけ/);
});

/* ============================================================
   Required Fix 2 — 診断配線のソース契約
   （M9: 「取り込めなかった行を黙って捨てる」変更を殺すためのテスト）
============================================================ */

test('RF2: import診断がINVALID resultとして必ず表示層へ渡る', () => {
  const batch = batchScript();

  // 隔離した診断レイヤを持っている
  assert.match(batch, /var batchInvalidDiagnostics = \[\];/);

  // TSVはWorkspaceへ「追加」するので、診断も追加する
  assert.match(batch,
    /batchInvalidDiagnostics = batchInvalidDiagnostics\.concat\(\s*WorkspaceCore\.errorsToInvalidResults\(outcome\.errors, 'tsv'\)\s*\);/,
    'TSV importの診断をINVALID resultへ変換して保持すること');

  // Workspace JSONはWorkspaceを「置き換える」ので、診断も置き換える
  assert.match(batch,
    /batchInvalidDiagnostics = WorkspaceCore\.errorsToInvalidResults\(imported\.errors, 'workspace_json'\);/,
    'JSON importの診断をINVALID resultへ変換して置き換えること');

  // 評価結果と診断をmergeして表示する
  assert.match(batch,
    /batchResults = WorkspaceCore\.mergeEvaluationResults\(\s*WorkspaceCore\.evaluateWorkspace\(batchWorkspace\),\s*batchInvalidDiagnostics\s*\);/,
    '表示listは valid結果 + INVALID診断 のmergeであること');

  // clearは診断も消す（消したはずの行が残らない）
  assert.match(batch, /batchInvalidDiagnostics = \[\];[\s\S]{0,120}batchResults = \[\];/,
    'clear時に診断も空にすること');

  // INVALID行をindex.html側で手組みしない（canonical helperを使う / §5）
  assert.doesNotMatch(batch, /status:\s*'INVALID'/,
    'INVALID resultをUI側で組み立ててはならない');
});

test('RF2: 診断行はWorkspace / 計算コアへ渡らない', () => {
  const batch = batchScript();
  // serializeWorkspace はWorkspaceだけを受け取る（診断を混ぜない）
  assert.match(batch, /WorkspaceCore\.serializeWorkspace\(batchWorkspace\)/);
  assert.doesNotMatch(batch, /serializeWorkspace\([^)]*batchInvalidDiagnostics/);
  assert.doesNotMatch(batch, /addCase\([^)]*batchInvalidDiagnostics/);
  assert.doesNotMatch(batch, /evaluateWorkspace\([^)]*batchInvalidDiagnostics/);
  // 診断行には操作ボタンを出さない（存在しないcaseへの操作になる）
  assert.match(batch, /if \(r\.status === 'INVALID' && r\.source\)/);
});
