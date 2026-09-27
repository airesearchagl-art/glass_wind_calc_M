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

// Phase 2F: Evidence status表示の検証で実際のconfigを参照する
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

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

/* ============================================================
   Phase 2D: imported mode / import-export のUI契約
============================================================ */

test('Phase 2D: index.htmlがregistry.js / project-input.jsを読み込む', () => {
  const html = readIndexHtml();
  assert.match(html, /<script src="project-config\/registry\.js"><\/script>/);
  assert.match(html, /<script src="project-config\/project-input\.js"><\/script>/);
});

test('Phase 2D: imported modeが入力モードとして存在し、mode-field-importedがtoggleされる', () => {
  const html = readIndexHtml();
  assert.match(html, /<option value="imported"/);
  assert.match(html, /class="[^"]*mode-field-imported[^"]*"/);
  assert.match(html, /querySelectorAll\('\.mode-field-imported'\)/);
});

test('AC-05 / AC-11: imported modeのUI文言が「未検証」を明示し、verified表示をしない', () => {
  const html = readIndexHtml();
  const staticPart = html.split('<script')[0];
  // 取り込みモードのラベル・注記
  assert.match(staticPart, /取り込みデータ \(Imported \/ Unverified\)/);
  assert.match(staticPart, /本ツールはそれを検証済みとして扱いません/);
  // 「案件照合済み」「検証済みデータ」等の誤表示がUIテンプレートに存在しない
  assert.equal(staticPart.includes('案件照合済み'), false);
});

test('AC-07 / AC-10 #17: 取り込み由来の文字列はinnerHTMLではなくtextContentでDOMへ渡す', () => {
  const html = readIndexHtml();
  // import結果の表示に用いる2箇所がtextContentであること
  assert.match(html, /function setIoStatus[\s\S]*?el\.textContent\s*=/);
  assert.match(html, /summary\.textContent\s*=/);
  // importハンドラ周辺でinnerHTMLを使っていないこと
  const importSection = html.slice(html.indexOf('function importProjectInput'), html.indexOf('function exportProjectInput') + 400);
  assert.equal(importSection.includes('innerHTML'), false, 'import pathでinnerHTMLを使ってはならない');
  // eval / Function をUI側でも使っていないこと
  assert.doesNotMatch(html, /\beval\s*\(/);
  assert.doesNotMatch(html, /new\s+Function\s*\(/);
});

test('AC-02: runCalc()はProject Input Package経由で計算する（designPを直接組み立てない）', () => {
  const html = readIndexHtml();
  assert.match(html, /function buildCurrentProjectInput/);
  assert.match(html, /pkg\s*=\s*buildCurrentProjectInput\(\)/);
  // 旧実装のように MiyoshiProjectConfig から直接designPを組み立てていないこと
  assert.doesNotMatch(html, /designP\s*=\s*Math\.max\(posP,\s*negP\)/);
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

/* ============================================================
   Phase 2E: 告示風圧計算モードのUI契約（AC-05 / AC-11 / AC-13）
============================================================ */

test('AC-05: 告示風圧計算モードが選択肢として存在し、既存3モードを壊さない', () => {
  const html = readIndexHtml();
  assert.match(html, /<option value="notification">/);
  // 既存3モードが残っていること
  assert.match(html, /<option value="miyoshi" selected>/);
  assert.match(html, /<option value="manual">/);
  assert.match(html, /<option value="imported">/);
  // 既定は案件プリセットのまま（既存挙動を変えない）
  assert.match(html, /<option value="miyoshi" selected>/);
});

test('AC-05: 風圧入力欄はすべて mode-field-notification でラップされている', () => {
  const html = readIndexHtml();
  const windFieldIds = [
    'inp-wind-basis', 'inp-wind-recurrence', 'inp-wind-v0', 'inp-wind-roughness',
    'inp-wind-building-h', 'inp-wind-eaves-h', 'inp-wind-z',
    'inp-wind-building-type', 'inp-wind-zone', 'inp-wind-short-side'
  ];
  for (const id of windFieldIds) {
    assert.ok(html.includes('id="' + id + '"'), id + ' が存在すること');
    // 各入力は mode-field-notification のブロック内にある
    const idx = html.indexOf('id="' + id + '"');
    const before = html.slice(0, idx);
    const lastBlock = before.lastIndexOf('mode-field-notification');
    const lastOtherBlock = Math.max(
      before.lastIndexOf('mode-field-miyoshi'),
      before.lastIndexOf('mode-field-manual'),
      before.lastIndexOf('mode-field-imported')
    );
    assert.ok(lastBlock > lastOtherBlock, id + ' は notification ブロック内にあること');
  }
});

test('AC-11: UIに階→評価高さ/建物高さの自動変換が存在しない', () => {
  const html = readIndexHtml();
  // buildWindInputFromUI() の本体そのものに階・住所由来の入力が現れない。
  // （呼び出し側の近傍に inp-floor があっても無関係なので、本体だけを切り出す）
  const fnStart = html.indexOf('function buildWindInputFromUI');
  assert.ok(fnStart > -1, 'buildWindInputFromUI が存在すること');
  const fnBody = html.slice(fnStart, html.indexOf('\n}', fnStart));
  for (const token of ['inp-floor', 'floorKey', 'floor', 'MiyoshiProjectConfig', '住所']) {
    assert.equal(
      fnBody.includes(token), false,
      'buildWindInputFromUI() が ' + token + ' を参照してはならない'
    );
  }
  // 風圧入力はすべて風圧用の明示フィールドから読む
  for (const id of ['inp-wind-v0', 'inp-wind-roughness', 'inp-wind-building-h',
                    'inp-wind-eaves-h', 'inp-wind-z']) {
    assert.ok(fnBody.includes(id), 'buildWindInputFromUI() は ' + id + ' を読むこと');
  }
  // 明示入力であることをUIが述べている
  assert.match(html, /階（1F \/ 2F \/ 3F \/ RF）から Z を自動生成しません/);
  assert.match(html, /階数からは推定しません/);
});

test('AC-13: 風圧入力欄が単位を明示している', () => {
  const html = readIndexHtml();
  // V0 は m/s、高さ系は m
  const v0Block = html.slice(html.indexOf('id="inp-wind-v0"'), html.indexOf('id="inp-wind-v0"') + 300);
  assert.match(v0Block, /m\/s/);
  for (const id of ['inp-wind-building-h', 'inp-wind-eaves-h', 'inp-wind-z', 'inp-wind-short-side']) {
    const block = html.slice(html.indexOf('id="' + id + '"'), html.indexOf('id="' + id + '"') + 300);
    assert.match(block, /unit-label">m</, id + ' の単位が m であること');
  }
});

test('AC-04: UIが式の検証状況と入力値の検証状況を分けて表示する', () => {
  const html = readIndexHtml();
  assert.match(html, /式の検証状況/);
  assert.match(html, /入力値の検証状況/);
  assert.match(html, /式が検証済みであることは、入力値が検証済みであることを意味しません/);
});

test('AC-10: Miyoshi比較が「参考比較」であり置換でないことをUIが明示する', () => {
  const html = readIndexHtml();
  assert.match(html, /参考比較/);
  assert.match(html, /comparison only/);
  assert.match(html, /preset provenance unresolved|案件プリセットの算定根拠は未解決/);
  assert.match(html, /数値が近くても、プリセットの検証状況は変わりません/);
  assert.match(html, /この比較でプリセット値を置き換えることもしません/);
});

test('AC-19 / §11: 業界推奨を法的要求として記述していない', () => {
  const html = readIndexHtml();
  assert.match(html, /板硝子協会が推奨する設計手法であり/);
  assert.match(html, /法的に必須.*ではありません|法的要求ではありません/);
  // 「すべての建物に法的に必須」という主張がないこと
  assert.doesNotMatch(html, /すべての建物・すべての壁に法的に必須です/);
});

test('AC-03: 表示層だけで丸め、取り込みサマリも丸める', () => {
  const html = readIndexHtml();
  // 取り込みサマリの設計風圧がfmt()を通っている（生の浮動小数を出さない）
  assert.match(html, /設計風圧 ' \+ fmt\(pkg\.designPressure, 0\)/);
  assert.match(html, /表示のみ丸めています。内部計算では丸めていません/);
});

test('AC-06: wind-pressure.js がcalc.jsの後・project-input.jsの前に読み込まれる', () => {
  const html = readIndexHtml();
  const calcIdx = html.indexOf('src="calc.js"');
  const windIdx = html.indexOf('src="wind-pressure.js"');
  const piIdx = html.indexOf('src="project-config/project-input.js"');
  assert.ok(calcIdx > -1 && windIdx > -1 && piIdx > -1, '3つのscriptが存在すること');
  assert.ok(calcIdx < windIdx, 'calc.js が wind-pressure.js より先');
  assert.ok(windIdx < piIdx, 'wind-pressure.js が project-input.js より先');
});

/* ============================================================
   Independent verification repair（Phase 2E Wave 8）
   index.html のruntime分岐をソース契約として固定する。
   （node:testはUIを実行しないため、変更されれば落ちる形で書く）
============================================================ */

test('AC-03: trace表示がHTMLエスケープを通している', () => {
  const html = readIndexHtml();
  assert.match(html, /function escHtml\(/, 'escHtml が定義されていること');
  // trace行の4セルすべてがescHtmlを通る
  assert.match(html, /<td>\$\{escHtml\(step\.step\)\}<\/td>/);
  assert.match(html, /\$\{escHtml\(step\.formula\)\}/);
  assert.match(html, /\$\{escHtml\(fmtTrace\(step\.value, step\.unit\)\)\}/);
  assert.match(html, /<td>\$\{escHtml\(step\.unit\)\}<\/td>/);
  // 未エスケープの生interpolationが残っていないこと
  assert.doesNotMatch(html, /<td>\$\{step\.formula\}<\/td>/);
  assert.doesNotMatch(html, /\$\{trace\.normalized\.roughnessSubstitutionNote\}/);
});

test('AC-05: recurrenceYears は itakyo_recommended のときだけ送られる', () => {
  const html = readIndexHtml();
  const fnStart = html.indexOf('function buildWindInputFromUI');
  const fnBody = html.slice(fnStart, html.indexOf('\n}', fnStart));
  // 条件付きであること（無条件に送ると notification_baseline が例外になる）
  assert.match(fnBody, /if \(basis === 'itakyo_recommended'\)[\s\S]{0,200}recurrenceYears/);
  // recurrenceYears の代入がその条件の外に無いこと
  const assignments = (fnBody.match(/windInput\.recurrenceYears\s*=/g) || []).length;
  assert.equal(assignments, 1, 'recurrenceYears の代入は1箇所だけ');
});

test('AC-08: 取り込みpackageの windInput が再構築時に引き継がれる', () => {
  const html = readIndexHtml();
  // これが失われるとimport後にtraceを再計算できず、replayが成立しない
  assert.match(html, /if \(importedPackage\.windInput\) \{\s*\n?\s*rebuilt\.windInput = importedPackage\.windInput;/);
});

test('AC-10: 参考比較は明示選択したときだけ表示される', () => {
  const html = readIndexHtml();
  assert.match(html, /id="inp-wind-compare"/);
  assert.match(html, /compareSel\.value !== 'on'/);
});

/* ============================================================
   Phase 2F Wave 4: Evidence status UI / case selector / reconciliation
============================================================ */

test('AC-16: Evidence status表示はconfigのmetadataから導出し、UIに固定値を持たない', () => {
  const html = readIndexHtml();
  assert.match(html, /id="evidence-status-table"/);
  // 検証状況はconfigから読む
  assert.match(html, /config\.wind\.V0\.verificationStatus/);
  assert.match(html, /config\.wind\.roughnessCategory\.verificationStatus/);
  assert.match(html, /config\.identity\.verificationStatus/);
  assert.match(html, /dims\.status/);
  assert.match(html, /config\.wind\.status/);
  // UI側に検証状況をハードコードしていない
  assert.doesNotMatch(html, /'ガラス見付寸法',\s*'verified'/);
  assert.doesNotMatch(html, /V0[^\n]*'verified'/);
});

test('AC-16: Verified Case selectorはcaseが存在するときだけ描画される', () => {
  const html = readIndexHtml();
  const fnStart = html.indexOf('function renderVerifiedCaseSelector');
  assert.ok(fnStart > -1);
  const fn = html.slice(fnStart, html.indexOf('\n}', fnStart));
  // 0件のとき早期returnし、selectを作らない
  assert.match(fn, /verifiedCases\.length === 0/);
  assert.match(fn, /case selectorは表示しません/);
  // selectの生成が0件分岐より後にあること
  assert.ok(fn.indexOf('verifiedCases.length === 0') < fn.indexOf('<select'),
    '0件分岐がselect生成より前にあること');
  // 現状 verifiedCases は空
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
});

test('AC-11 / AC-12: reconciliation表示は数値一致を検証済みと読み替えない', () => {
  const html = readIndexHtml();
  assert.match(html, /id="reconciliation-area"/);
  assert.match(html, /数値的一致は検証済みを意味しません/);
  assert.match(html, /INSUFFICIENT_EVIDENCE/);
  assert.match(html, /read-onlyで、presetを書き換えることはありません/);
  // 告示計算の近似一致も根拠にしない旨
  assert.match(html, /告示風圧計算の結果がpreset値に近いことも、検証の根拠にはなりません/);
});

test('AC-15: UIはpresetの値をverifiedとしてLedgerへ登録しない', () => {
  const html = readIndexHtml();
  const fnStart = html.indexOf('function buildProjectEvidenceLedger');
  const fn = html.slice(fnStart, html.indexOf('\n}', fnStart));
  // 現在の検証状況をそのまま使い、'verified' を注入しない
  assert.match(fn, /verificationStatus: dims\.defaultW\.verificationStatus/);
  assert.match(fn, /verificationStatus: dims\.defaultH\.verificationStatus/);
  assert.doesNotMatch(fn, /verificationStatus: 'verified'/, 'verifiedを直接注入してはならない');
  assert.doesNotMatch(fn, /makeEvidence\('primary'/, 'primary evidenceを捏造してはならない');
});

test('Phase 2F: evidence-ledger.js が evidence.js の後に読み込まれる', () => {
  const html = readIndexHtml();
  const ev = html.indexOf('src="project-config/evidence.js"');
  const led = html.indexOf('src="project-config/evidence-ledger.js"');
  assert.ok(led > -1 && ev > -1);
  assert.ok(ev < led, 'evidence.js が evidence-ledger.js より前');
});

/* ============================================================
   独立検証(Phase 2F) F10 — Evidence panelは黙って消えない
============================================================ */

test('F10: Phase 2F Evidence panel の catch は失敗を画面に出す（黙殺しない）', () => {
  // Phase 2J Wave 4 で、Phase 2F パネル群と Closure Matrix を
  // **別々にguardする**ためにこの本体は renderPhase2FEvidencePanels へ移した
  // （片方の失敗でもう片方が消えると、消えたこと自体が「問題なし」と読まれる）。
  // 契約は変わっていない。見る場所だけを移動する。
  const src = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const start = src.indexOf('function renderPhase2FEvidencePanels');
  assert.notEqual(start, -1, 'renderPhase2FEvidencePanels が見つかるはず');
  const fn = src.slice(start, src.indexOf('\nfunction ', start + 10));

  // Evidence contract / promotion gate が失敗したとき、panelが何も言わずに
  // 消えると「検証状況の表示が無い＝問題なし」と読めてしまう。
  // catch節は必ず panel host へ失敗を書き出すこと。
  const catchBody = fn.slice(fn.indexOf('catch'));
  assert.match(catchBody, /getElementById\('evidence-status-table'\)/,
    'catch節はEvidence status panelのhostを取得して表示を書き換えるべき');
  assert.match(catchBody, /textContent/,
    'catch節は例外メッセージをtextContentで表示すべき（HTMLとして解釈させない）');
  assert.doesNotMatch(catchBody, /innerHTML/,
    'catch節で例外メッセージをinnerHTMLに入れてはならない');
  assert.match(catchBody, /検証済み|検証状況が不明/,
    '表示できなかったことを「検証済み」と解釈させない文言を出すべき');

  // 計算機能自体は止めない（catchで握ること自体は維持する）
  assert.match(fn, /try \{/);
  assert.match(fn, /catch \(e\)/);
});
