'use strict';

/**
 * Phase 2C Consolidated Closure Wave RF-01のテスト。
 *
 * Manual modeへ切り替えた際、入力カード下部の共通注意書きに
 * 「階別正圧・部位別負圧は「みよし案件プリセット」であり...」という
 * Miyoshi-specific文言が残っていた問題（visible UIへのprovenance漏れ）を
 * ソースレベルで固定する回帰テスト。
 *
 * ブラウザでの実際の表示切替（visibility）はPlaywright実機確認で別途
 * 検証済み（PR説明を参照）。本テストはindex.htmlのHTML構造そのものの
 * 契約（mode-field-miyoshi / mode-field-manual によるラップ）を
 * node:testで静的に固定する。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');

function readIndexHtml() {
  return fs.readFileSync(INDEX_HTML_PATH, 'utf8');
}

test('UI mode separation: index.htmlはproject-config/manual.jsを読み込む', () => {
  const html = readIndexHtml();
  assert.match(html, /<script src="project-config\/manual\.js"><\/script>/);
});

test('UI mode separation: mode-field-miyoshi / mode-field-manual の両クラスが存在する', () => {
  const html = readIndexHtml();
  assert.match(html, /class="[^"]*mode-field-miyoshi[^"]*"/);
  assert.match(html, /class="[^"]*mode-field-manual[^"]*"/);
});

test('UI mode separation: applyModeVisibility()がmode-field-miyoshi/mode-field-manualの両方をtoggleする', () => {
  const html = readIndexHtml();
  assert.match(html, /function applyModeVisibility/);
  assert.match(html, /querySelectorAll\('\.mode-field-miyoshi'\)/);
  assert.match(html, /querySelectorAll\('\.mode-field-manual'\)/);
});

test('UI mode separation (RF-01): 静的HTML内の「みよし案件プリセット」表記は、mode selectorの選択肢名を除きmode-field-miyoshiでラップされている', () => {
  const html = readIndexHtml();
  // <script>より前の静的HTML部分のみを対象とする（<script>内はJSレベルで
  // mode==='miyoshi'のときのみ描画される、既にPlaywrightで検証済みの
  // 別メカニズム）。
  const staticPart = html.split('<script')[0];
  // mode selectorの選択肢テキスト（Closure Waveの指示により除外対象）を取り除く
  const withoutSelectOption = staticPart.replace(/<option value="miyoshi"[\s\S]*?<\/option>/, '');

  assert.ok(
    withoutSelectOption.includes('みよし案件プリセット'),
    'テスト前提が崩れている: 静的部分に「みよし案件プリセット」が出現するはず（mode-field-miyoshi内に存在するはず）'
  );

  const regex = /みよし案件プリセット/g;
  let match;
  let count = 0;
  while ((match = regex.exec(withoutSelectOption)) !== null) {
    count++;
    const idx = match.index;
    const precedingChunk = withoutSelectOption.slice(Math.max(0, idx - 400), idx);
    assert.match(
      precedingChunk,
      /mode-field-miyoshi/,
      `「みよし案件プリセット」の出現箇所(${count}番目)がmode-field-miyoshiでラップされていない`
    );
  }
});

test('UI mode separation (RF-01): Manual mode用の代替notice文言がmode-field-manualでラップされている', () => {
  const html = readIndexHtml();
  const staticPart = html.split('<script')[0];
  assert.match(
    staticPart,
    /class="mode-field mode-field-manual">[^<]*現在画面に表示されている[\s\S]*?<\/span>/
  );
});

test('UI mode separation (RF-01): 手入力モードの入力カード注意書きは「すべてその場で入力した」という断定を避け、初期表示値がサンプルであることに触れている', () => {
  const html = readIndexHtml();
  assert.match(html, /現在画面に表示されているW\/H\/正圧\/負圧をユーザー入力値として扱います/);
  assert.match(html, /初期表示値（サンプル値）も含め/);
  assert.doesNotMatch(html, /W\/H\/正圧\/負圧はすべてその場で入力した値/);
});
