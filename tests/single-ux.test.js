'use strict';

/**
 * Phase 2L-B4 / S3-B3B2-B4: 単一ケースの入力・結果の見せ方（表示の優先順位だけ。機能・値は変えない）。
 *
 *   - 入力は ① 設計風圧の決め方 → ② ガラス条件 → ③ 設計風圧条件（選んだ mode の入力だけ）→ ④ 告示外の追加低減係数 → ⑤ 計算する
 *   - 必須入力は閉じた <details> に入れない。選んだ mode の意味と trust の要点は常に見せ、詳しい説明は 1 回の操作で開く
 *   - 案件の検証状況は「要約（常に表示）」と「詳細（Evidence status・Verified Case・照合・Closure。最初は閉じる）」に分ける。
 *     要約の値は各 renderer が同じ評価結果から書く（UI で数え直さない）。失敗したら失敗と書く（0 件・検証済みにしない）
 *   - 結果は結論（検証状況・判定・推奨構成・許容 / 設計風圧・係数・適用範囲外の除外）を常に見せ、計算根拠・候補一覧は詳細へ
 *   - 狭い画面で横にはみ出さない（grid の列は minmax(0, …)、表は表の中で横スクロール）
 *
 * 前半は index.html の静的な検査、後半は B4 の関数を vm で動かす挙動の検査（最小の偽 DOM）。
 * 実ブラウザは tools/browser-checks/single-ux.mjs。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inlineScripts, stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const STATIC = HTML.split('<script')[0];
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const CODE = stripComments(inlineScripts(HTML));

/** top-level の関数 1 つ（次の top-level の function / var の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar '].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}
/** 開始 tag から、その要素の終わりまで（同じ tag 名の入れ子を数える）。 */
function element(src, openTagStart) {
  const tag = /^<([a-z0-9]+)/.exec(src.slice(openTagStart))[1];
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
/** top-level の関数 1 つ（関数の閉じ括弧まで。後ろの top-level の文を含めない）。 */
function fnOnly(name) {
  const body = fnBody(name);
  return body.slice(0, body.indexOf('\n}') + 2);
}
const elementById = (src, id) => element(src, src.lastIndexOf('<', src.indexOf('id="' + id + '"')));
const SINGLE = elementById(STATIC, 'view-single');
/** markup の中の <details> の範囲（開始〜終わり）。 */
function detailsRanges(src) {
  const out = [];
  const re = /<details\b/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push([m.index, m.index + element(src, m.index).length]);
  return out;
}
const inDetails = (src, idx) => detailsRanges(src).some(([a, b]) => idx > a && idx < b);
const idIndex = (src, id) => { const i = src.indexOf('id="' + id + '"'); assert.notEqual(i, -1, id + ' が無い'); return i; };
/** 文がどこかで details の外に出ているか（同じ文が details の中にもあってよい）。 */
function visibleOutsideDetails(src, phrase) {
  let i = src.indexOf(phrase);
  while (i !== -1) {
    if (!inDetails(src, i)) return true;
    i = src.indexOf(phrase, i + 1);
  }
  return false;
}
const ruleBody = (selectorRe) => { const m = new RegExp(selectorRe + '\\s*\\{([^}]*)\\}').exec(CSS); return m ? m[1] : null; };

const REQUIRED_INPUTS = ['inp-mode', 'inp-W', 'inp-H', 'inp-type', 'inp-floor', 'inp-zone', 'inp-manual-pos', 'inp-manual-neg',
  'inp-wind-basis', 'inp-wind-recurrence', 'inp-wind-v0', 'inp-wind-roughness', 'inp-wind-building-h', 'inp-wind-eaves-h', 'inp-wind-z',
  'inp-wind-building-type', 'inp-wind-zone', 'inp-wind-short-side', 'inp-wind-compare', 'imported-summary', 'inp-coeff'];
const EVIDENCE_AREAS = ['evidence-status-table', 'verified-case-selector-area', 'reconciliation-area', 'evidence-closure-area'];
const B4_FUNCTIONS = ['setEvidenceSummaryLine', 'renderEvidenceStatusSummary', 'conclusionNotesHtml', 'renderCoeffNotice',
  'renderImportedNone', 'focusProjectInputImport'];

/* ============================================================
   静的な検査
============================================================ */

test('UX-01: 入力の順は ①決め方 → ②ガラス条件 → ③設計風圧条件 → ④係数 → ⑤計算する → 検証状況の要約 → 詳細 → Export / Import', () => {
  const order = ['step-mode-title', 'inp-mode', 'step-glass-title', 'inp-W', 'inp-H', 'inp-type', 'step-wind-title', 'inp-floor', 'inp-zone',
    'inp-manual-pos', 'inp-wind-basis', 'imported-summary', 'step-coeff-title', 'inp-coeff'];
  const idx = order.map((id) => idIndex(SINGLE, id));
  idx.forEach((v, i) => { if (i > 0) assert.ok(v > idx[i - 1], order[i - 1] + ' → ' + order[i] + ' の順でない'); });
  const calc = SINGLE.indexOf('<button class="btn-calc" onclick="runCalc()">▶ 計算する</button>');
  assert.ok(calc > idx[idx.length - 1], '計算ボタンが係数の直後にない');
  assert.ok(idIndex(SINGLE, 'evidence-summary') > calc && idIndex(SINGLE, 'evidence-details') > idIndex(SINGLE, 'evidence-summary') &&
    idIndex(SINGLE, 'io-block') > idIndex(SINGLE, 'evidence-details'), '計算ボタン → 要約 → 詳細 → Export / Import の順でない');
  // 4 つの段は見出し（h3）で名前がつく section
  for (const [title, no] of [['step-mode-title', 1], ['step-glass-title', 2], ['step-wind-title', 3], ['step-coeff-title', 4]]) {
    assert.match(SINGLE, new RegExp('<section class="single-step" aria-labelledby="' + title + '">'));
    assert.match(SINGLE, new RegExp('<h3 class="single-step-title" id="' + title + '"><span class="step-no" aria-hidden="true">' + no + '</span>'));
  }
});

test('UX-02: 必須入力は <details> に入っていない（閉じた中に隠さない）。入力モードと係数にも名前がある', () => {
  for (const id of REQUIRED_INPUTS) assert.equal(inDetails(SINGLE, idIndex(SINGLE, id)), false, id + ' が details の中にある');
  assert.match(SINGLE, /<label for="inp-mode" class="sr-only">入力モード（設計風圧の決め方）<\/label>/);
  assert.match(SINGLE, /<input type="range" id="inp-coeff"[^>]*aria-labelledby="step-coeff-title"[^>]*aria-describedby="coeff-note"/);
  // 4 mode の選択肢は残る（初期は案件プリセット）
  for (const v of ['preset" selected', 'manual"', 'notification"', 'imported"']) assert.ok(SINGLE.includes('<option value="' + v), v);
});

test('UX-03: 案件の検証状況は案件プリセットの block の中で「要約（details の外）」と「詳細（閉じた details）」に分かれる', () => {
  const block = element(SINGLE, SINGLE.indexOf('<div class="mode-field mode-field-preset form-group evidence-block">'));
  const summaryAt = block.indexOf('id="evidence-summary"');
  assert.notEqual(summaryAt, -1);
  assert.equal(inDetails(block, summaryAt), false, '要約が details の中にある');
  const details = elementById(block, 'evidence-details');
  assert.match(details, /^<details class="disclosure evidence-details" id="evidence-details">/, '詳細は最初は閉じている（open 属性なし）');
  for (const id of EVIDENCE_AREAS) assert.ok(details.includes('id="' + id + '"'), id + ' が詳細の中にない');
  // P2J-U02: Closure 欄は Evidence status と同じ mode-field-preset の block（別の block を作らない）
  assert.equal(SINGLE.match(/evidence-block/g).length, 1);
  assert.equal(block.match(/mode-field-preset/g).length, 1, 'block の中に別の mode-field-preset の入れ子がある');
});

test('UX-04: 要約の初期値は「表示できない」（fail closed）。数値も「検証済み」も書かない', () => {
  for (const id of ['evidence-summary-status', 'evidence-summary-closure']) {
    const m = new RegExp('<div class="evidence-summary-line is-error" id="' + id + '">([^<]*)</div>').exec(SINGLE);
    assert.ok(m, id + ' の初期 markup');
    assert.match(m[1], /表示できません。表示されないことを「検証済み」と解釈しないでください。/);
    assert.doesNotMatch(m[1], /\d|問題なし|Verified/);
  }
});

test('UX-05: Closure の要約は評価結果の値から書く（固定の件数を持たない）。失敗時は isError で書く', () => {
  const body = fnBody('renderEvidenceClosureMatrix');
  const write = body.slice(body.indexOf("setEvidenceSummaryLine('evidence-summary-closure',\n    'Evidence Closure: ' +"));
  assert.ok(write.length > 0, '成功時の要約');
  const stmt = write.slice(0, write.indexOf(', false);') + 9);
  for (const f of ['evaluation.status', 'evaluation.readySlotCount', 'evaluation.requiredSlotCount', 'evaluation.readyCategoryCount',
    'evaluation.categoryCount', 'evaluation.readyCaseScopeCount', 'evaluation.caseScopeCount', 'evaluation.promotionCandidate']) {
    assert.ok(stmt.includes(f), f + ' を使っていない');
  }
  assert.doesNotMatch(stmt, /\/ (12|4|8)\b|'0 \/|blockers/);
  // 確認項目・カテゴリ・case scope は別々の値として書く（取り違えない）
  assert.match(stmt, /必要な確認項目 ' \+ evaluation\.readySlotCount \+ ' \/ ' \+ evaluation\.requiredSlotCount/);
  assert.match(stmt, /'・closureカテゴリ ' \+ evaluation\.readyCategoryCount \+ ' \/ ' \+ evaluation\.categoryCount/);
  assert.match(stmt, /'・想定case scope ' \+ evaluation\.readyCaseScopeCount \+ ' \/ ' \+ evaluation\.caseScopeCount/);
  // 失敗時（catch）は失敗の固定文を isError=true で書いて終わる
  const catchPart = body.slice(body.indexOf('} catch (e) {'), body.indexOf('return;', body.indexOf('} catch (e) {')));
  assert.match(catchPart, /setEvidenceSummaryLine\('evidence-summary-closure',\s*'Evidence Closure: 表示できませんでした。表示できないことを「検証済み」と解釈しないでください。', true\)/);
  // 要約の成功の書き込みは評価の検査（factResults の形）の後
  assert.ok(body.indexOf("throw new Error('unexpected closure evaluation shape')") < body.indexOf(stmt));
});

test('UX-06: Evidence status の要約は表と同じ行・同じ状況から作り、失敗時は isError で書く', () => {
  const status = fnBody('renderEvidenceStatus');
  assert.match(status, /renderEvidenceStatusSummary\(rows\.map\(function \(r\) \{ return r\[1\]; \}\), evidence\.verifiedCases\.length\);/);
  // 要約は表を書いた後（表を書く前に失敗したら要約は成功を書かない）
  assert.ok(status.indexOf('host.innerHTML =') < status.indexOf('renderEvidenceStatusSummary('));
  const panels = fnBody('renderPhase2FEvidencePanels');
  const catchPart = panels.slice(panels.indexOf('} catch (e) {'));
  assert.match(catchPart, /setEvidenceSummaryLine\('evidence-summary-status',\s*'案件入力値の検証状況: 表示できませんでした。[^']*「検証済み」と解釈しないでください。', true\)/);
});

test('UX-07: 結果は結論を常に表示し、計算根拠・候補一覧（6 つの部分すべて）は 1 回で開く details へ。値・並びは変えない', () => {
  const body = fnBody('renderResults');
  const conclusion = body.slice(body.indexOf('const conclusionHtml = `'), body.indexOf('</div>`;', body.indexOf('const conclusionHtml = `')));
  for (const part of ['${unverifiedHtml}', '${judgeHtml}', '${bestLabel}', '許容風圧 <span>${bestP} N/m²</span>',
    '設計風圧 <span>${fmt(designP, 0)} N/m²</span>', "<div class=\"meta-chip${coeffFlagged ? ' is-flagged' : ''}\">告示外の追加低減係数 <span>${fmt(extraFactor, 2)}</span>",
    '${conclusionNotesHtml(mode, windStatusWarningHtml, coeffFlagged, extraFactor, outOfScopeCandidates.length)}']) {
    assert.ok(conclusion.includes(part), '結論に ' + part + ' が無い');
  }
  assert.match(body, /const coeffFlagged = extraFactor !== 1;/);
  assert.match(body, /<div class="result-details-body">\$\{traceHtml \+ windHtml \+ calcDetailHtml \+ okTableHtml \+ ngTableHtml \+ scopeTableHtml\}<\/div>/);
  assert.match(body, /document\.getElementById\('result-area'\)\.innerHTML = conclusionHtml \+ detailsHtml;/);
  // 詳細は最初は閉じ、開いた状態は描き直す直前の details から引き継ぐ（保存しない）
  assert.match(body, /const prevDetails = document\.getElementById\('result-details'\);\s*const detailsOpen = !!\(prevDetails && prevDetails\.open\);/);
  assert.match(body, /<details class="disclosure result-details" id="result-details"\$\{detailsOpen \? ' open' : ''\}>/);
  // 案件プリセットの未検証警告は計算根拠の中ではなく結論の注記に出す（定義そのものは変えない）
  const windHtml = body.slice(body.indexOf('const windHtml = `'), body.indexOf('`;', body.indexOf('const windHtml = `')));
  assert.equal(windHtml.includes('windStatusWarningHtml'), false);
  // 候補の選び方は変えない（best は OK の先頭）
  assert.doesNotMatch(body, /okCandidates\.(sort|reverse)|outOfScopeCandidates\[0\]/);
});

test('UX-08: 計算根拠の表は表の中で横スクロールする wrapper に入る（風圧算定トレース・参考比較を含む）', () => {
  for (const name of ['renderWindTraceHtml', 'renderPresetComparisonHtml']) {
    const body = fnOnly(name);
    const tables = body.match(/<table/g) || [];
    assert.equal(tables.length, 1, name + ' の表');
    assert.equal((body.match(/<div class="table-wrap"><table>/g) || []).length, 1, name + ' の表に wrapper が無い');
  }
  const body = fnBody('renderResults');
  assert.equal((body.match(/<div class="table-wrap">\s*<table>/g) || []).length, (body.match(/<table>/g) || []).length);
});

test('UX-09: 狭い画面で grid の列が中身で広がらない。B4 の CSS は overflow:hidden で文を切らない', () => {
  assert.match(ruleBody('\\.main-wrap') || '', /grid-template-columns:\s*minmax\(0, 480px\) minmax\(0, 1fr\)/);
  assert.match(CSS, /\.main-wrap > \* \{ min-width: 0; \}/);
  assert.match(CSS, /@media \(max-width: 800px\) \{\s*\.main-wrap \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(ruleBody('\\.table-scroll') || '', /overflow-x:\s*auto/);
  assert.match(ruleBody('\\.field-row') || '', /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(CSS, /\.coeff-flag\[hidden\] \{ display: none; \}/);
  const b4 = CSS.slice(CSS.indexOf('/* ===== S3-B3B2-B4'), CSS.indexOf('/* 印刷不可の文面は画面には出さない */'));
  assert.ok(b4.length > 0);
  // overflow: hidden は .sr-only（視覚的に隠す label）だけ
  const hidden = b4.match(/[^{}]*\{[^}]*overflow:\s*hidden[^}]*\}/g) || [];
  assert.deepEqual(hidden.map((r) => r.trim().split('{')[0].trim()), ['.sr-only']);
  // 計算ボタンを固定表示にしない
  assert.doesNotMatch(b4, /position:\s*(fixed|sticky)/);
});

test('UX-10: B1 の鮮度の表示は結果欄の外のまま。判定バッジは結論にあり（変更前 / 以前の入力の印が詳細に隠れない）', () => {
  const host = idIndex(SINGLE, 'single-result-freshness');
  const area = idIndex(SINGLE, 'result-area');
  assert.ok(host < area && !elementById(SINGLE, 'single-result-freshness').includes('id="result-area"'));
  assert.equal(inDetails(SINGLE, host), false);
  const body = fnBody('renderResults');
  const conclusion = body.slice(body.indexOf('const conclusionHtml = `'), body.indexOf('const detailsHtml = `'));
  assert.ok(conclusion.includes('${judgeHtml}'));
  assert.doesNotMatch(body, /single-result-freshness|data-result-freshness/, 'renderResults が鮮度を書き換える');
});

test('UX-11: trust の事実は詳細を開かなくても読める（短くしても弱めない）', () => {
  const always = [
    '告示からの自動算定ではありません',                                   // 案件プリセットの値 ≠ 自動算定
    '現在画面に表示されているW/H/正圧/負圧をユーザー入力値として扱います',
    '初期表示値（サンプル値）も含め、案件原典（構造計算書・製品資料等）で検証済みの値ではありません',
    '算定式は一次資料で確認していますが、入力した風条件（V0・粗度区分・高さ・評価高さ等）は本ツールでは検証していません',
    '式が検証済みであることと、入力値が検証済みであることは別です',     // 検証済みの式 ≠ 検証済みの入力
    '本ツールはそれを検証済みとして扱いません',
    'ガラス1枚の見付寸法',
    'サッシ枠を含む建具全体寸法ではない',
    '未検証な既定値（サンプル値）',                                      // 未検証の寸法は原典確認が要る
    '案件図・メーカー資料で実寸を確認してください',
    '現在の案件プリセット',
    '告示に規定なし',                                                    // 告示外の係数は告示にない
    '最終的な設計判断にはメーカー検討書または専門技術者による確認を優先してください'
  ];
  for (const phrase of always) assert.ok(visibleOutsideDetails(SINGLE, phrase), '常に見える位置に無い: ' + phrase);
  // 詳しい説明は 1 回で開く details に残す（消さない）
  const help = elementById(SINGLE, 'mode-help');
  assert.match(help, /^<details class="disclosure" id="mode-help">\s*<summary>入力モードの詳しい説明<\/summary>/);
  assert.ok(help.includes('本ツールが案件原典と照合したものではありません'));
  assert.ok(help.includes('「すべての建物・すべての壁に法的に必須」という意味ではありません'));
  // 結果側: 未検証の表示・適用範囲外の除外・係数の注記は結論（常に表示）に出る
  const notes = fnBody('conclusionNotesHtml');
  assert.match(notes, /自動推奨から除外しています/);
  assert.match(notes, /この低減は告示には規定がありません/);
});

test('UX-12: B4 の関数は保存・通信・URL・console を使わず、強い語（承認・安全・検証済みです・問題なし）で判定しない', () => {
  for (const name of B4_FUNCTIONS) {
    const body = fnBody(name);
    assert.doesNotMatch(body, /localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|console\.|location\.|history\./, name);
    assert.doesNotMatch(body, /承認|安全|検証済みです|問題なし/, name);
  }
  // 要約・係数・取り込みの文は textContent で書く（innerHTML にしない）
  for (const name of ['setEvidenceSummaryLine', 'renderCoeffNotice', 'renderImportedNone']) assert.doesNotMatch(fnBody(name), /innerHTML/, name);
  // 取り込みの入口は focus するだけ（値を変えない・計算しない・Import しない）
  assert.doesNotMatch(fnBody('focusProjectInputImport'), /runCalc|importProjectInput|\.value\s*=/);
  assert.match(CODE, /var IMPORTED_NONE_TEXT =\s*'取り込みデータはまだありません。[^'+]*';/);
});

/* ============================================================
   vm で動かす
============================================================ */

function fakeElement(value) {
  const classes = new Set();
  return {
    value, textContent: '', hidden: false,
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c), add: (c) => classes.add(c) },
    focused: false, scrolled: null, focus() { this.focused = true; }, scrollIntoView(o) { this.scrolled = o; }
  };
}
function sandboxWith(elements, extra) {
  const sandbox = Object.assign({ document: { getElementById: (id) => elements[id] || null } }, extra || {});
  vm.createContext(sandbox);
  return sandbox;
}

test('UX-13: renderEvidenceStatusSummary は渡された状況を数え、setEvidenceSummaryLine は失敗の印を切り替える', () => {
  const els = { 'evidence-summary-status': fakeElement(), 'evidence-summary-closure': fakeElement() };
  els['evidence-summary-status'].classList.add('is-error');
  const sb = sandboxWith(els);
  vm.runInContext([fnOnly('evidenceStatusLabel'), fnOnly('setEvidenceSummaryLine'), fnOnly('renderEvidenceStatusSummary')].join('\n'), sb);
  sb.renderEvidenceStatusSummary(['unverified', 'verified', 'unverified', 'partially_verified', 'mystery'], 2);
  assert.equal(els['evidence-summary-status'].textContent,
    '案件入力値の検証状況: 全 5 項目 — Unverified 3 / Verified 1 / Partially Verified 1（Verified Cases: 2 件）');
  assert.equal(els['evidence-summary-status'].classList.contains('is-error'), false);
  sb.renderEvidenceStatusSummary(['unverified'], 0);
  assert.equal(els['evidence-summary-status'].textContent, '案件入力値の検証状況: 全 1 項目 — Unverified 1（Verified Cases: 0 件）');
  sb.setEvidenceSummaryLine('evidence-summary-closure', 'x', true);
  assert.equal(els['evidence-summary-closure'].classList.contains('is-error'), true);
  sb.setEvidenceSummaryLine('evidence-summary-closure', 'y', false);
  assert.equal(els['evidence-summary-closure'].classList.contains('is-error'), false);
  assert.doesNotThrow(() => sb.setEvidenceSummaryLine('no-such-id', 'z', false));
});

test('UX-14: conclusionNotesHtml は係数 1.00 以外・適用範囲外の件数・プリセットの未検証警告を常に見える注記にする', () => {
  const sb = sandboxWith({});
  vm.runInContext([fnOnly('fmt'), fnOnly('conclusionNotesHtml')].join('\n'), sb);
  assert.equal(sb.conclusionNotesHtml('manual', '', false, 1, 0), '');
  const coeff = sb.conclusionNotesHtml('manual', '', true, 0.9, 0);
  assert.match(coeff, /<div class="conclusion-note is-warn">⚠ 告示外の追加低減係数 0\.90 を適用しています（1\.00 = 告示準拠。この低減は告示には規定がありません）。<\/div>/);
  const scope = sb.conclusionNotesHtml('manual', '', false, 1, 6);
  assert.match(scope, /⚠ 板硝子協会計算法の適用範囲外の候補 6 件は自動推奨から除外しています/);
  assert.match(scope, /採用する場合はメーカー個別検討が必要です/);
  const warn = '<div class="calc-line">⚠ 設計風圧プリセット — 未検証</div>';
  const all = sb.conclusionNotesHtml('preset', warn, true, 0.95, 2);
  assert.ok(all.startsWith('<div class="conclusion-notes">' + warn));
  assert.ok(all.includes('0.95') && all.includes('候補 2 件'));
});

test('UX-15: renderCoeffNotice は 1.00 以外のときだけ文を出し、1.00 では隠す', () => {
  const els = { 'inp-coeff': fakeElement('0.90'), 'coeff-flag': fakeElement() };
  const sb = sandboxWith(els);
  vm.runInContext(fnOnly('renderCoeffNotice'), sb);
  sb.renderCoeffNotice();
  assert.equal(els['coeff-flag'].hidden, false);
  assert.equal(els['coeff-flag'].textContent, '告示外の追加低減係数 0.90 を適用中です（1.00 以外。告示には規定のない低減です）。');
  els['inp-coeff'].value = '1.00';
  sb.renderCoeffNotice();
  assert.equal(els['coeff-flag'].hidden, true);
  assert.equal(els['coeff-flag'].textContent, '');
  els['inp-coeff'].value = 'abc';
  sb.renderCoeffNotice();
  assert.equal(els['coeff-flag'].hidden, false, '読めない値を 1.00 扱いにしない');
});

test('UX-16: 取り込みデータが無いときは固定文で入口を示し、入口は Import 欄へ focus するだけ', () => {
  const els = { 'imported-summary': fakeElement(), 'io-block': fakeElement(), 'io-package': fakeElement('') };
  const sb = sandboxWith(els, { importedPackage: null });
  vm.runInContext(CODE.slice(CODE.indexOf('var IMPORTED_NONE_TEXT ='), CODE.indexOf('\nfunction renderImportedNone')) + '\n' +
    fnOnly('renderImportedNone') + '\n' + fnOnly('focusProjectInputImport'), sb);
  sb.renderImportedNone();
  assert.equal(els['imported-summary'].textContent, sb.IMPORTED_NONE_TEXT);
  els['imported-summary'].textContent = '取り込み内容: …';
  sb.importedPackage = { widthMm: 1 };
  sb.renderImportedNone();
  assert.equal(els['imported-summary'].textContent, '取り込み内容: …', '取り込み済みの概要を上書きしない');
  sb.focusProjectInputImport();
  assert.equal(els['io-package'].focused, true);
  assert.equal(JSON.stringify(els['io-block'].scrolled), '{"block":"center"}');   // vm の realm の object なので JSON で比べる
  assert.equal(els['io-package'].value, '');
});
