'use strict';

/**
 * S3-B3B2-C2（Wave A）: Pack Review の印刷用 model（project-config/project-pack-review-print.js）。
 *
 *   ProjectPackReview.assertReviewOrigin(review, batch, ctx)   … 発行物で、batch・ctx（同じ instance）から発行された review だけ
 *     → buildPrintModel(review, batch, ctx)   … 見出し・段落・表のセルの文字列だけの block の並び（deep-freeze）
 *
 * 期待値の取り方（oracle）。print module の出力から期待値を作らない:
 *   - 値は発行された review そのものから、この test の中の小さな関数（画面と C1-A の表示の桁の契約）で作る
 *   - C1-A との parity は、C1-A の Markdown（ProjectPackReviewExport.toMarkdown）を、この test の中の parser でセルと行に
 *     分け、Markdown の \ の escape と書式（` と **）だけを外したものと、model の文字列を比べる（⟨U+XXXX⟩ と ＠ はそのまま）
 *   - 文字の可視化は、この test の中の独立した literal の表（code point → 期待する文字列）と比べる
 *   - 敵対的な文字列は、依存を差し替えた別の module instance に、本物の review を写した object を渡して確かめる
 *   - 多ケースの合成 Pack は tests/support/synthetic-pack.js がその場で作る（実案件の値ではない）
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
const Batch = require('../project-config/project-pack-batch.js');
const Review = require('../project-config/project-pack-review.js');
const Export = require('../project-config/project-pack-review-export.js');
const Print = require('../project-config/project-pack-review-print.js');
const { stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PRINT_SRC_REL = 'project-config/project-pack-review-print.js';
const PRINT_SRC = read(PRINT_SRC_REL);
const PRINT_CODE = stripComments(PRINT_SRC);

const FIXTURES = {
  notification1458: 'tests/fixtures/project-pack/synthetic-notification1458.json',
  project_pressure_map: 'tests/fixtures/project-pack/synthetic-project-pressure-map.json',
  case_direct: 'tests/fixtures/project-pack/synthetic-case-direct.json'
};
const MODES = Object.keys(FIXTURES);
const ctxOf = (pack) => ProjectContext.fromProjectPack(Pack.validateProjectPack(pack));
const genuine = (mode) => { const c = ctxOf(JSON.parse(read(FIXTURES[mode]))); return { c, b: Batch.executeAll(c) }; };
const fromPack = (pack) => { const c = ctxOf(pack); return { c, b: Batch.executeAll(c) }; };
const ids = (b) => b.rows.map((r) => r.caseId);
const fullOptions = (b) => ({ detailCaseIds: ids(b).slice(0, 50), comparisonCaseIds: [ids(b)[0], ids(b)[ids(b).length - 1]] });
const plain = (v) => JSON.parse(JSON.stringify(v));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const large = {};
/** 推奨候補の無いケース・未宣言の階 / 部位・null の余裕比を含む合成 Pack（case_direct の極端な設計風圧。C1-A X10 と同じ作り方）。 */
const noCandidate = () => fromPack(syntheticPack(12, 'case_direct', { label: 'Synthetic NoCandidate',
  designPressureOf: (i) => (i % 4 === 0 ? 90000 : 1000 + i) }));
/** 2000 ケースの合成 Pack（mode ごとに 1 度だけ計算する）。 */
function big(mode) {
  if (!large[mode]) large[mode] = fromPack(syntheticPack(2000, mode));
  return large[mode];
}

/** 固定の注意（G0 の notices と、C1-A の Markdown の冒頭の 2 件。module からは取らない）。 */
const NOTICES = [
  '未レビュー：この出力は、未レビュー（pack_unreviewed）の Project Pack から計算した結果です。',
  '計算済み ≠ 検証済み：値は計算したもので、検証されたものではありません（calculated_not_verified）。',
  'OK は計算上の候補判定です。Evidence の確認・安全性の判定・承認ではありません。',
  '正式な案件承認の資料ではありません。値は案件の出典資料・メーカー資料と照合してください。'
];
const MORE_NOTICES = ['余裕比・余裕差は確認用の指標で、安全性の判定・承認ではありません。',
  'この文書は Project Pack・入力 package・Workspace の入力として読み込むものではありません。'];
const TRUST_LINE = '未レビュー（pack_unreviewed）・計算済み ≠ 検証済み（calculated_not_verified）';
const FOOTER = 'pack_unreviewed ／ calculated_not_verified — 未レビュー・計算済み ≠ 検証済み・正式な案件承認の資料ではありません';
const SHARE = 'この資料にはガラス寸法・設計風圧などの案件入力値が含まれます。外部へ共有する場合は、内容と共有先を確認してください。' +
  'publication advisory が 0 件でも公開安全の証明にはなりません。';
const MSG = Object.freeze({
  origin: 'ProjectPackReviewPrint: review: is not an issued Pack review of the given batch result and context',
  version: 'ProjectPackReviewPrint: review: is not a pack_unreviewed review of schemaVersion 1',
  limit: 'ProjectPackReviewPrint: review: exceeds 2000 cases or 50 details (not truncated)',
  broken: 'ProjectPackReviewPrint: model: could not be generated',
  bytes: (n) => 'ProjectPackReviewPrint: model: text exceeds ' + n + ' bytes (not truncated)',
  elements: (n) => 'ProjectPackReviewPrint: model: exceeds ' + n + ' elements (not truncated)'
});

/* ------------------------------------------------------------
   module instance（vm）
------------------------------------------------------------ */

function loadPrint(globals, src) {
  const sb = Object.assign({}, globals);
  vm.createContext(sb);
  vm.runInContext(src || PRINT_SRC, sb, { filename: PRINT_SRC_REL });
  return sb;
}
const FAKE_REVIEW = Object.freeze({ REVIEW_TYPE: 'glass_wind_pack_review', SCHEMA_VERSION: 1, SOURCE_KIND: 'project_pack_unreviewed',
  TRUST: 'pack_unreviewed', INTERPRETATION: 'calculated_not_verified', assertReviewOrigin: (r) => r });
/** 発行元の gate を何でも通す偽の依存の print module（model を作る部分だけを確かめる。本物の経路では gate が先に拒否する）。 */
const stubPrint = (src) => loadPrint({ ProjectPackReview: FAKE_REVIEW }, src).ProjectPackReviewPrint;
/** 上限だけを変えた print module（依存は本物の ProjectPackReview）。 */
function printWith(decl, replacement) {
  assert.equal(PRINT_SRC.split(decl).length - 1, 1, '前提: 宣言は 1 か所: ' + decl);
  return loadPrint({ ProjectPackReview: Review }, PRINT_SRC.replace(decl, replacement)).ProjectPackReviewPrint;
}

/* ------------------------------------------------------------
   model を辿る
------------------------------------------------------------ */

function flatBlocks(model) {
  const out = [];
  const walk = (blocks) => blocks.forEach((b) => { out.push(b); if (b.type === 'detail') walk(b.blocks); });
  walk(model.blocks);
  return out;
}
const tablesOfModel = (model) => flatBlocks(model).filter((b) => b.type === 'table');
const caseTable = (model) => tablesOfModel(model).find((t) => t.role === 'cases');
/** model の文字列をすべて集める（見出し・段落・注意・セル）。 */
function allStrings(model) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k]));
  };
  walk(model.blocks);
  return out;
}

/* ------------------------------------------------------------
   C1-A の Markdown を読む（parity 用。\ の escape と ` ** の書式だけを外す）
------------------------------------------------------------ */

/** Markdown の escape（\x → x）を外し、escape されていない ` を落とす（⟨U+XXXX⟩・＠ はそのまま）。 */
function unmark(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) { out += text[i + 1]; i += 1; continue; }
    if (ch === '`') continue;
    out += ch;
  }
  return out;
}
function cellsOf(line) {
  const cells = [];
  let cur = '';
  for (let i = 1; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') { cur += ch + line[i + 1]; i += 1; continue; }
    if (ch === '|') { cells.push(cur.slice(1, -1)); cur = ''; continue; }
    cur += ch;
  }
  assert.equal(cur, '');
  return cells;
}
/** Markdown を、表（{ headers, rows }）と、表以外の文の行（書式を外したもの）に分ける。 */
function readMarkdown(md) {
  const lines = md.split('\n');
  const tables = [];
  const texts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('| ') && /^\|(---\|)+$/.test(lines[i + 1] || '')) {
      const headers = cellsOf(line).map(unmark);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].startsWith('| ')) { rows.push(cellsOf(lines[j]).map(unmark)); j += 1; }
      tables.push({ headers, rows });
      i = j - 1;
      continue;
    }
    if (line === '' || line === '>' || line === '---') continue;
    texts.push(unmark(line.replace(/^#{1,6} /, '').replace(/^> - /, '').replace(/^> /, '').replace(/\*\*/g, '')));
  }
  return { tables, texts };
}
/** model の表以外の文の並び（印刷だけの共有の注意は除く。C1-A の Markdown には無い）。 */
function modelTexts(model) {
  const out = [];
  const walk = (blocks) => blocks.forEach((b) => {
    if (b.type === 'title' || b.type === 'heading' || b.type === 'paragraph') out.push(b.text);
    if (b.type === 'trust') { out.push(b.heading); b.notices.forEach((n) => out.push(n)); out.push(b.rounding); }
    if (b.type === 'detail') { out.push(b.heading); walk(b.blocks); }
  });
  walk(model.blocks);
  return out;
}

/* ------------------------------------------------------------
   独立の oracle（画面・C1-A の表示の契約。print module からは取らない）
------------------------------------------------------------ */

const DASH = '—';
const num = (v) => (Object.is(v, -0) ? '-0' : String(v));
const p1 = (v) => v.toFixed(1);
const r3 = (v) => v.toFixed(3);
const pOrDash = (v) => (v === null ? DASH : p1(v));
const rOrDash = (v) => (v === null ? DASH : r3(v));
const MODE_FIELDS = {
  notification1458: ['evaluationHeightM', 'positivePressure', 'negativePressure'],
  project_pressure_map: ['positivePressure', 'negativePressureMagnitude'],
  case_direct: []
};
const PRESSURE_KIND = { evaluationHeightM: 'height', positivePressure: 'pressure', negativePressure: 'pressure',
  negativePressureMagnitude: 'pressure' };
const modeValue = (k, v) => (PRESSURE_KIND[k] === 'pressure' ? p1(v) : num(v));
const place = (r, k) => (hasOwn(r, k) ? r[k] : DASH + '（宣言なし）');
const signed = (v, digits) => (v === null ? DASH + '（片方に値なし）' : (v > 0 ? '+' : '') + v.toFixed(digits));
/** 合成 fixture の文字列は ASCII の英数字・記号と日本語だけ（不可視の文字・@ を含まない）ので、そのまま比べられる。 */
function expectedRow(r, mode) {
  return [r.caseId, r.paneId, place(r, 'floor'), place(r, 'zone'), r.glassType, num(r.widthMm), num(r.heightMm), p1(r.designPressure),
    r.pressureSource].concat(MODE_FIELDS[mode].map((k) => modeValue(k, r[k])))
    .concat([r.bestCandidate === null ? DASH + '（推奨候補なし）' : r.bestCandidate.label, r.bestCandidate === null ? DASH : p1(r.bestCandidate.P),
      String(r.okCount), String(r.ngCount), String(r.outOfScopeCount),
      r.marginRatio === null ? DASH : r3(r.marginRatio), r.marginPressure === null ? DASH : p1(r.marginPressure)]);
}

/** 可視化の literal の表（code point → 期待する文字列）。C1-A の module からは取らない。 */
const VISIBLE = [
  ['\u0000', '⟨U+0000⟩'], ['\u0009', '⟨U+0009⟩'], ['\n', '⟨U+000A⟩'], ['\r', '⟨U+000D⟩'], ['\u001B', '⟨U+001B⟩'], ['\u007F', '⟨U+007F⟩'],
  ['\u0085', '⟨U+0085⟩'], ['\u009F', '⟨U+009F⟩'], ['­', '⟨U+00AD⟩'], ['͏', '⟨U+034F⟩'], ['؜', '⟨U+061C⟩'],
  ['ᅟ', '⟨U+115F⟩'], ['᠎', '⟨U+180E⟩'], ['​', '⟨U+200B⟩'], ['‍', '⟨U+200D⟩'], ['‎', '⟨U+200E⟩'],
  ['‏', '⟨U+200F⟩'], [' ', '⟨U+2028⟩'], [' ', '⟨U+2029⟩'], ['‪', '⟨U+202A⟩'], ['‮', '⟨U+202E⟩'],
  ['⁠', '⟨U+2060⟩'], ['⁦', '⟨U+2066⟩'], ['⁩', '⟨U+2069⟩'], ['⠀', '⟨U+2800⟩'], ['ㅤ', '⟨U+3164⟩'],
  ['\uD800', '⟨U+D800⟩'], ['\uDFFF', '⟨U+DFFF⟩'], ['﷐', '⟨U+FDD0⟩'], ['️', '⟨U+FE0F⟩'], ['﻿', '⟨U+FEFF⟩'],
  ['ﾠ', '⟨U+FFA0⟩'], ['￻', '⟨U+FFFB⟩'], ['￾', '⟨U+FFFE⟩'], ['￿', '⟨U+FFFF⟩'], ['\u{1FFFE}', '⟨U+1FFFE⟩'],
  ['\u{E0001}', '⟨U+E0001⟩'], ['\u{E007F}', '⟨U+E007F⟩'], ['\u{E0100}', '⟨U+E0100⟩'], ['\u{E01EF}', '⟨U+E01EF⟩'],
  ['@', '＠']
];
/** そのまま残る文字（記号は \ を付けない・正規化しない）。 */
const KEPT = ['a', 'Z', '0', ' ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>',
  '?', '[', '\\', ']', '^', '_', '`', '{', '|', '}', '~', 'ｱ', 'ﾊﾟ', 'Å', 'Å', 'ﬁ', '①', '㎡', 'Ｗ', '漢', '😀', ' ', '　'];
/** model の文字列に生のまま残ってはならない文字。 */
const RAW_INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}͏ᅟᅠ឴឵᠋-᠏⠀ㅤ︀-️ﾠ\u{E0100}-\u{E01EF}@]/u;

/** review を写した object の文字列を差し替える（版・trust・mode・候補の判定は残す）。 */
function mapStrings(review, fn) {
  const keep = new Set(['reviewType', 'sourceKind', 'trust', 'interpretation', 'status']);
  let n = 0;
  const walk = (node, key, top) => {
    if (typeof node === 'string') return keep.has(key) || (top && key === 'pressureMode') ? node : fn(node, n++);
    if (Array.isArray(node)) return node.map((v) => walk(v, null, false));
    if (node && typeof node === 'object') {
      const out = {};
      Object.keys(node).forEach((k) => { out[k] = walk(node[k], k, node === review); });
      return out;
    }
    return node;
  };
  return walk(review, null, false);
}
const ADVERSARIAL = ['a | b', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '&amp;&lt;', 'line1\nline2', 'cr\rlf',
  'tab\tx', '\u0000\u001B[31m\u007F', '\u0085\u009B', '​‌‍⁠﻿­', '‪‫‬‭‮⁦⁧⁨⁩', '\u{E0041}\u{E007F}', 'v️\u{E0100}', '\uD800', '\uDC00',
  'ㅤᅟᅠﾠ⠀', 'user@example.com', '@user', '\\', '`x`', '**b**', ''];

/* ============================================================
   tests
============================================================ */

test('P2-C2-P01: API・定数・固定の文面（G0 の notices と同じ文面・同じ順）', () => {
  assert.deepEqual(Object.keys(Print).sort(), ['FOOTER_TEXT', 'INTERPRETATION', 'MAX_CASE_ROWS', 'MAX_DETAILS', 'MAX_ELEMENTS',
    'MAX_TEXT_BYTES', 'MODEL_SCHEMA_VERSION', 'MODEL_TYPE', 'NOTICES', 'SOURCE_KIND', 'TRUST', 'buildPrintModel', 'elementCountOf',
    'safePrintableText'].sort());
  assert.equal(Object.isFrozen(Print), true);
  assert.equal(Object.isFrozen(Print.NOTICES), true);
  assert.deepEqual([...Print.NOTICES], NOTICES);
  assert.equal(Print.MODEL_TYPE, 'glass_wind_pack_review_print');
  assert.equal(Print.MODEL_SCHEMA_VERSION, 1);
  assert.equal(Print.TRUST, 'pack_unreviewed');
  assert.equal(Print.SOURCE_KIND, 'project_pack_unreviewed');
  assert.equal(Print.INTERPRETATION, 'calculated_not_verified');
  assert.equal(Print.MAX_CASE_ROWS, 2000);
  assert.equal(Print.MAX_DETAILS, 50);
  assert.equal(Print.MAX_TEXT_BYTES, 8 * 1024 * 1024);
  assert.equal(Print.MAX_ELEMENTS, 60000);
  assert.equal(Print.FOOTER_TEXT, FOOTER);
  // C1-A の JSON の notices と同じ（C1-A の出力から取って比べる）
  const { c, b } = genuine('notification1458');
  const review = Review.buildPackReview(b, c, {});
  assert.deepEqual(JSON.parse(Export.serializeJson(review, b, c)).notices, NOTICES);
});

test('P2-C2-P02: 発行元の gate（発行物・同じ batch・同じ ctx の instance だけ。理由と値は出さない）', () => {
  const { c, b } = genuine('notification1458');
  const review = Review.buildPackReview(b, c, fullOptions(b));
  assert.equal(Print.buildPrintModel(review, b, c).modelType, 'glass_wind_pack_review_print');
  const other = genuine('notification1458');
  const otherReview = Review.buildPackReview(other.b, other.c, {});
  const cases = [
    () => Print.buildPrintModel(plain(review), b, c),                 // JSON の写し（発行物でない）
    () => Print.buildPrintModel(review, other.b, c),                  // 別の batch
    () => Print.buildPrintModel(review, b, other.c),                  // 別の ctx
    () => Print.buildPrintModel(otherReview, b, c),                   // 別の発行物
    () => Print.buildPrintModel(Object.assign({}, review), b, c),     // 浅い写し
    () => Print.buildPrintModel(null, b, c),
    () => Print.buildPrintModel(review, null, c),
    () => Print.buildPrintModel(review, b, undefined)
  ];
  cases.forEach((fn) => assert.throws(fn, (e) => e.message === MSG.origin));
  // 例外の文面に caseId・publicLabel・入力値を含めない
  try { Print.buildPrintModel(plain(review), b, c); } catch (e) {
    assert.equal(e.message.includes(review.rows[0].caseId), false);
    assert.equal(e.message.includes(review.publicLabel), false);
  }
});

test('P2-C2-P03: 依存は初期化時に 1 度だけ掴む（後から置いた global は使わない・無ければ呼び出しが fail closed）', () => {
  const { c, b } = genuine('project_pressure_map');
  const review = Review.buildPackReview(b, c, {});
  const sb = loadPrint({ ProjectPackReview: Review });
  sb.ProjectPackReview = FAKE_REVIEW;                                  // 後から差し替える
  assert.throws(() => sb.ProjectPackReviewPrint.buildPrintModel(plain(review), b, c), (e) => e.message === MSG.origin);
  assert.equal(sb.ProjectPackReviewPrint.buildPrintModel(review, b, c).counts.caseRows, review.rows.length);
  // 初期化時に無い: 読み込みは失敗せず、呼び出しが失敗する
  const none = loadPrint({});
  assert.throws(() => none.ProjectPackReviewPrint.buildPrintModel(review, b, c), /project-pack-review\.js is required but not available/);
  // trust・版の違う依存は使わない
  const wrongTrust = loadPrint({ ProjectPackReview: Object.assign({}, FAKE_REVIEW, { TRUST: 'reviewed' }) });
  assert.throws(() => wrongTrust.ProjectPackReviewPrint.buildPrintModel(review, b, c), /trust is not pack_unreviewed/);
  const wrongVersion = loadPrint({ ProjectPackReview: Object.assign({}, FAKE_REVIEW, { SCHEMA_VERSION: 2 }) });
  assert.throws(() => wrongVersion.ProjectPackReviewPrint.buildPrintModel(review, b, c), /schemaVersion 1/);
});

test('P2-C2-P04: 版・trust の違う review は書かない（gate を通っても）', () => {
  const { c, b } = genuine('case_direct');
  const copy = plain(Review.buildPackReview(b, c, {}));
  const P = stubPrint();
  [['trust', 'reviewed'], ['interpretation', 'verified'], ['sourceKind', 'x'], ['reviewType', 'x'], ['schemaVersion', 2]].forEach(([k, v]) => {
    const r = Object.assign({}, copy, { [k]: v });
    assert.throws(() => P.buildPrintModel(r, b, c), (e) => e.message === MSG.version, k);
  });
});

test('P2-C2-P05: block の並び・固定の文面（題・信頼の行・注意 4＋2 件・丸めの注記・共有の注意・結び）', () => {
  const { c, b } = genuine('notification1458');
  const model = Print.buildPrintModel(Review.buildPackReview(b, c, fullOptions(b)), b, c);
  assert.equal(model.modelType, 'glass_wind_pack_review_print');
  assert.equal(model.trust, 'pack_unreviewed');
  assert.equal(model.interpretation, 'calculated_not_verified');
  assert.equal(model.footerText, FOOTER);
  assert.deepEqual(model.blocks[0], { type: 'title', text: 'Pack Review（未レビュー）' });
  const t = model.blocks[1];
  assert.equal(t.type, 'trust');
  assert.equal(t.heading, TRUST_LINE);
  assert.deepEqual([...t.notices], NOTICES.concat(MORE_NOTICES));
  assert.equal(t.share, SHARE);
  assert.match(t.rounding, /^数値の表示：風圧（設計風圧・正圧・負圧・許容風圧）と余裕差は小数 1 桁、余裕比は小数 3 桁/);
  assert.deepEqual(model.blocks[model.blocks.length - 1], { type: 'paragraph', text: TRUST_LINE + '。正式な案件承認の資料ではありません。' });
  const h2 = model.blocks.filter((x) => x.type === 'heading' && x.level === 2).map((x) => x.text);
  assert.deepEqual(h2, ['出力の情報', '集計', 'グループ', 'ケース一覧（全 ' + b.rows.length + ' ケース）', '選んだケースの詳細（' +
    Math.min(50, b.rows.length) + ' 件）', '2 ケースの比較']);
  // 上位の block の種類は決まったものだけ
  model.blocks.forEach((x) => assert.equal(['title', 'trust', 'heading', 'paragraph', 'table', 'detail'].includes(x.type), true));
});

test('P2-C2-P06: 2000 ケースの全行が元の並びで、セルの数は見出しと同じ（3 mode）', () => {
  MODES.forEach((mode) => {
    const { c, b } = big(mode);
    const review = Review.buildPackReview(b, c, {});
    const t = caseTable(Print.buildPrintModel(review, b, c));
    assert.equal(t.rows.length, 2000, mode);
    assert.deepEqual(t.rows.map((r) => r[0]), review.rows.map((r) => r.caseId), mode);
    t.rows.forEach((r) => assert.equal(r.length, t.headers.length));
    assert.equal(t.headers.length, 16 + MODE_FIELDS[mode].length, mode);
  });
});

test('P2-C2-P07: 行の値は review の値と画面の表示の桁（独立の oracle。null は —、0 にしない）', () => {
  MODES.forEach((mode) => {
    const { c, b } = big(mode);
    const review = Review.buildPackReview(b, c, {});
    const t = caseTable(Print.buildPrintModel(review, b, c));
    review.rows.forEach((r, i) => assert.deepEqual(t.rows[i], expectedRow(r, mode), mode + ' ' + r.caseId));
  });
  // 推奨候補なし（余裕比・余裕差が null）の行・未宣言の階も、独立の oracle どおり（0 にならない）
  const { c, b } = noCandidate();
  const review = Review.buildPackReview(b, c, {});
  const nulls = review.rows.filter((r) => r.bestCandidate === null && r.marginRatio === null);
  assert.equal(nulls.length > 0, true, '前提: 推奨候補なしの行がある');
  const t = caseTable(Print.buildPrintModel(review, b, c));
  review.rows.forEach((r, i) => assert.deepEqual(t.rows[i], expectedRow(r, 'case_direct'), r.caseId));
  nulls.forEach((r) => {
    const row = t.rows[review.rows.indexOf(r)];
    assert.equal(row[9], DASH + '（推奨候補なし）');
    assert.equal(row[row.length - 2], DASH);
    assert.equal(row[row.length - 1], DASH);
  });
});

test('P2-C2-P08: C1-A との parity（表のすべてのセルと、表以外の文の並び。Markdown の escape と書式だけが違う）', () => {
  const runs = MODES.map((m) => [m, genuine(m)]).concat([['no candidate', noCandidate()], ['notification1458 x2000', big('notification1458')]]);
  runs.forEach(([name, { c, b }]) => {
    [{}, fullOptions(b)].forEach((opts) => {
      const review = Review.buildPackReview(b, c, opts);
      const md = readMarkdown(Export.toMarkdown(review, b, c));
      const model = Print.buildPrintModel(review, b, c);
      const mt = tablesOfModel(model);
      assert.equal(mt.length, md.tables.length, name + ': 表の数');
      mt.forEach((t, i) => {
        assert.deepEqual([...t.headers], md.tables[i].headers, name + ': 見出し ' + i);
        assert.equal(t.rows.length, md.tables[i].rows.length, name + ': 行の数 ' + i);
        t.rows.forEach((row, j) => {
          // 出力の情報の 1 行目（資料の種類）だけは媒体が違うので比べない
          if (i === 0 && j === 0) {
            assert.deepEqual([...row], ['資料', 'Pack Review の印刷用資料（glass_wind_pack_review_print・版 1）']);
            assert.equal(md.tables[i].rows[j][0], '出力形式');
            return;
          }
          assert.deepEqual([...row], md.tables[i].rows[j], name + ': 表 ' + i + ' 行 ' + j);
        });
      });
      assert.deepEqual(modelTexts(model), md.texts, name + ': 表以外の文');
    });
  });
});

test('P2-C2-P09: 選んだケースの詳細（最大 50 件・選んだ順・候補の一覧と判定）と、詳細なしの文', () => {
  const { c, b } = big('notification1458');
  const opts = { detailCaseIds: ids(b).slice(100, 150).reverse() };
  const review = Review.buildPackReview(b, c, opts);
  const model = Print.buildPrintModel(review, b, c);
  const details = model.blocks.filter((x) => x.type === 'detail');
  assert.equal(details.length, 50);
  details.forEach((d, i) => {
    const sel = review.selectedDetails[i];
    assert.equal(d.heading, '詳細 ' + (i + 1) + '：ケース ' + opts.detailCaseIds[i]);
    const kv = d.blocks[0];
    assert.equal(kv.rows[0][1], sel.caseId);
    assert.equal(kv.rows.find((r) => r[0] === '告示外の追加低減係数')[1], num(sel.extraFactor));
    assert.equal(kv.rows.find((r) => r[0].startsWith('面積'))[1], num(sel.areaM2));
    const cand = d.blocks[2];
    assert.equal(cand.rows.length, sel.candidateSummary.length);
    cand.rows.forEach((row, k) => {
      const cs = sel.candidateSummary[k];
      assert.deepEqual([...row], [cs.label, p1(cs.P), { ok: 'OK（計算上の候補判定）', ng: 'NG', out_of_scope: '適用範囲外' }[cs.status]]);
    });
  });
  const none = Print.buildPrintModel(Review.buildPackReview(b, c, {}), b, c);
  assert.equal(none.blocks.filter((x) => x.type === 'detail').length, 0);
  assert.equal(none.blocks.some((x) => x.type === 'paragraph' && x.text === '詳細を表示するケースは選ばれていません。'), true);
});

test('P2-C2-P10: 比較（B − A。正は +、片方に値が無ければ —、一致・不一致）と、比較なしの文', () => {
  MODES.forEach((mode) => {
    const { c, b } = big(mode);
    const [x, y] = [ids(b)[3], ids(b)[1999]];
    const review = Review.buildPackReview(b, c, { comparisonCaseIds: [x, y] });
    const model = Print.buildPrintModel(review, b, c);
    const t = tablesOfModel(model).find((tb) => tb.role === 'comparison');
    const cmp = review.comparison;
    const get = (label) => t.rows.find((r) => r[0] === label || r[0].startsWith(label + '（'));
    assert.deepEqual([...get('caseId')], ['caseId', x, y, '']);
    assert.equal(get('幅 W')[3], signed(cmp.difference.widthMm, 0));
    assert.equal(get('高さ H')[3], signed(cmp.difference.heightMm, 0));
    assert.equal(get('設計風圧')[3], signed(cmp.difference.designPressure, 1));
    assert.equal(get('余裕比')[3], signed(cmp.difference.marginRatio, 3));
    assert.equal(get('ガラス')[3], cmp.sameValue.glassType ? '一致' : '不一致');
    MODE_FIELDS[mode].forEach((k) => {
      const row = t.rows.find((r) => r[1] === modeValue(k, cmp.a[k]) && r[2] === modeValue(k, cmp.b[k]));
      assert.equal(row[3], signed(cmp.difference[k], PRESSURE_KIND[k] === 'pressure' ? 1 : 3), mode + ' ' + k);
    });
    assert.equal(model.blocks.some((bl) => bl.type === 'paragraph' && bl.text.startsWith('A: ' + x + ' ／ B: ' + y + '。差は B − A です。')), true);
  });
  // 片方に値が無い差（推奨候補なし）は —（0 にしない）
  const { c, b } = noCandidate();
  const all = Review.buildPackReview(b, c, {});
  const withNone = all.rows.find((r) => r.bestCandidate === null);
  const withOne = all.rows.find((r) => r.bestCandidate !== null);
  const review = Review.buildPackReview(b, c, { comparisonCaseIds: [withOne.caseId, withNone.caseId] });
  const t = tablesOfModel(Print.buildPrintModel(review, b, c)).find((tb) => tb.role === 'comparison');
  assert.equal(t.rows.find((r) => r[0] === '余裕比')[3], DASH + '（片方に値なし）');
  const none = Print.buildPrintModel(all, b, c);
  assert.equal(none.blocks.some((x) => x.type === 'paragraph' && x.text === '比較は選ばれていません。'), true);
});

test('P2-C2-P11: safePrintableText の独立の literal（不可視・Bidi・タグ・異体字・孤立サロゲート・非文字・＠。\\ を付けない・正規化しない）', () => {
  VISIBLE.forEach(([input, expected]) => assert.equal(Print.safePrintableText(input), expected, JSON.stringify(input)));
  KEPT.forEach((ch) => assert.equal(Print.safePrintableText(ch), ch, JSON.stringify(ch)));
  assert.equal(Print.safePrintableText('a‮b\u{E0041}c@d\n'), 'a⟨U+202E⟩b⟨U+E0041⟩c＠d⟨U+000A⟩');
  assert.equal(Print.safePrintableText(''), '');
  // 可視化した形を元の文字に戻さない（2 回通しても ⟨U+XXXX⟩ は文字のまま）
  assert.equal(Print.safePrintableText('⟨U+202E⟩'), '⟨U+202E⟩');
  assert.throws(() => Print.safePrintableText(1), TypeError);
});

test('P2-C2-P12: 敵対的な文字列（記法・HTML・改行・制御・不可視・Bidi・タグ・孤立サロゲート・@）は生のまま残らない', () => {
  const { c, b } = genuine('notification1458');
  const copy = plain(Review.buildPackReview(b, c, fullOptions(b)));
  const P = stubPrint();
  ADVERSARIAL.forEach((adv) => {
    const model = P.buildPrintModel(mapStrings(copy, () => adv), b, c);
    allStrings(model).forEach((s) => assert.equal(RAW_INVISIBLE.test(s), false, JSON.stringify(adv) + ' → ' + JSON.stringify(s.slice(0, 40))));
    const cell = caseTable(model).rows[0][0];
    assert.equal(cell, Print.safePrintableText(adv));
  });
  // HTML として解釈される文字列も、ただの文字（model は文字列だけ）
  const html = P.buildPrintModel(mapStrings(copy, () => '<img src=x onerror=alert(1)>'), b, c);
  assert.equal(caseTable(html).rows[0][0], '<img src=x onerror=alert(1)>');
});

test('P2-C2-P13: model は deep-freeze（block・表・行・セルの配列まで）で、review を変えない', () => {
  const { c, b } = genuine('project_pressure_map');
  const review = Review.buildPackReview(b, c, fullOptions(b));
  const before = JSON.stringify(review);
  const model = Print.buildPrintModel(review, b, c);
  const walk = (v) => { if (v && typeof v === 'object') { assert.equal(Object.isFrozen(v), true); Object.keys(v).forEach((k) => walk(v[k])); } };
  walk(model);
  assert.throws(() => { 'use strict'; model.blocks.push({}); }, TypeError);
  assert.throws(() => { 'use strict'; caseTable(model).rows[0][0] = 'x'; }, TypeError);
  assert.equal(JSON.stringify(review), before);
});

test('P2-C2-P14: 決定的（同じ review からは同じ model。時刻・乱数・session の値を含まない）', () => {
  const { c, b } = big('notification1458');
  const review = Review.buildPackReview(b, c, fullOptions(b));
  const a = Print.buildPrintModel(review, b, c);
  const again = Print.buildPrintModel(review, b, c);
  assert.notEqual(a, again);
  assert.equal(JSON.stringify(a), JSON.stringify(again));
  assert.equal(/Date|Math\.random|performance|crypto/.test(PRINT_CODE), false);
});

test('P2-C2-P15: element の数は数え方の定義どおりで、記録した counts と一致する', () => {
  const E = Print.elementCountOf;
  assert.equal(E({ type: 'heading', level: 2, text: 'x' }), 1);
  assert.equal(E({ type: 'paragraph', text: 'x' }), 1);
  assert.equal(E({ type: 'title', text: 'x' }), 1);
  assert.equal(E({ type: 'trust', heading: 'h', notices: ['a', 'b', 'c'], rounding: 'r', share: 's' }), 3 + 3 + 2);
  assert.equal(E({ type: 'table', role: 'kv', headers: ['a', 'b'], rows: [['1', '2'], ['3', '4']] }), 4 + 2 + 2 * 3);
  assert.equal(E({ type: 'detail', heading: 'd', blocks: [{ type: 'paragraph', text: 'x' }] }), 2 + 1);
  assert.throws(() => E({ type: 'script' }), TypeError);
  const { c, b } = big('notification1458');
  const model = Print.buildPrintModel(Review.buildPackReview(b, c, fullOptions(b)), b, c);
  assert.equal(model.counts.elements, 1 + model.blocks.reduce((n, x) => n + E(x), 0));
  assert.equal(model.counts.caseRows, 2000);
  assert.equal(model.counts.details, 50);
  assert.equal(model.counts.comparison, true);
  const bytes = allStrings(model).reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0);
  assert.equal(model.counts.textBytes, bytes);
});

test('P2-C2-P16: element の上限（ちょうど上限は全量・1 つ超えたら何も返さない）', () => {
  const { c, b } = genuine('notification1458');
  const review = Review.buildPackReview(b, c, fullOptions(b));
  const n = Print.buildPrintModel(review, b, c).counts.elements;
  const decl = 'var MAX_ELEMENTS = 60000;';
  assert.equal(printWith(decl, 'var MAX_ELEMENTS = ' + n + ';').buildPrintModel(review, b, c).counts.elements, n);
  assert.throws(() => printWith(decl, 'var MAX_ELEMENTS = ' + (n - 1) + ';').buildPrintModel(review, b, c),
    (e) => e.message === MSG.elements(n - 1));
});

test('P2-C2-P17: 文字の byte 数の上限（ちょうど上限は全量・1 byte 超えたら何も返さない）', () => {
  const { c, b } = genuine('project_pressure_map');
  const review = Review.buildPackReview(b, c, fullOptions(b));
  const n = Print.buildPrintModel(review, b, c).counts.textBytes;
  const decl = 'var MAX_TEXT_BYTES = 8 * 1024 * 1024;';
  assert.equal(printWith(decl, 'var MAX_TEXT_BYTES = ' + n + ';').buildPrintModel(review, b, c).counts.textBytes, n);
  assert.throws(() => printWith(decl, 'var MAX_TEXT_BYTES = ' + (n - 1) + ';').buildPrintModel(review, b, c),
    (e) => e.message === MSG.bytes(n - 1));
});

test('P2-C2-P18: 2000 ケース・50 詳細を超える review は書かない（切り詰めない）', () => {
  const { c, b } = big('case_direct');
  const copy = plain(Review.buildPackReview(b, c, fullOptions(b)));
  const P = stubPrint();
  const moreRows = Object.assign({}, copy, { rows: copy.rows.concat([copy.rows[0]]) });
  assert.throws(() => P.buildPrintModel(moreRows, b, c), (e) => e.message === MSG.limit);
  const moreDetails = Object.assign({}, copy, { selectedDetails: copy.selectedDetails.concat([copy.selectedDetails[0]]) });
  assert.throws(() => P.buildPrintModel(moreDetails, b, c), (e) => e.message === MSG.limit);
  assert.equal(P.buildPrintModel(copy, b, c).counts.caseRows, 2000);
});

test('P2-C2-P19: 正規の最大の Pack（110 階・候補 49 件の詳細 50 件・比較・2000 ケース）が element の上限に収まる', () => {
  const pack = syntheticPack(2000, 'notification1458', { label: 'Synthetic Print Worst Case' });
  const floors = [];
  for (let i = 1; i <= 9; i++) floors.push('B' + i);
  for (let i = 1; i <= 99; i++) floors.push(String(i));
  floors.push('R', 'PH');
  assert.equal(floors.length, 110);
  pack.windConditions.evaluationHeights = floors.map((f, k) => ({ floor: f, height: { value: Math.round(3 * (k + 1)) / 10, unit: 'm' } }));
  pack.glazingCases.forEach((gc, i) => {
    gc.floor = floors[i % floors.length];
    if (i < 50) gc.glassType = i % 2 === 0 ? 'lowe_fl' : 'fl_fl';
  });
  const { c, b } = fromPack(pack);
  const review = Review.buildPackReview(b, c, fullOptions(b));
  assert.equal(review.groups.byFloor.length, 110);
  assert.equal(Math.min(...review.selectedDetails.map((d) => d.candidateSummary.length)), 49);
  const model = Print.buildPrintModel(review, b, c);
  assert.equal(model.counts.elements <= Print.MAX_ELEMENTS, true, String(model.counts.elements));
  assert.equal(model.counts.textBytes <= Print.MAX_TEXT_BYTES, true);
  assert.equal(caseTable(model).rows.length, 2000);
});

test('P2-C2-P20: 書き出しの途中の壊れた値は固定文（入力値・内部の例外の文面を出さない）', () => {
  const { c, b } = genuine('notification1458');
  const copy = plain(Review.buildPackReview(b, c, {}));
  const P = stubPrint();
  const bad = [
    Object.assign({}, copy, { pressureMode: 'unknown_mode' }),
    Object.assign({}, copy, { rows: copy.rows.map((r, i) => (i === 0 ? Object.assign({}, r, { widthMm: 'SECRET-123' }) : r)) }),
    Object.assign({}, copy, { totalCases: -1 }),
    Object.assign({}, copy, { units: null })
  ];
  bad.forEach((r) => assert.throws(() => P.buildPrintModel(r, b, c), (e) => e.message === MSG.broken && !e.message.includes('SECRET')));
});

test('P2-C2-P21: 副作用がない（DOM・storage・network・console・Export module・HTML の文字列に触れない）', () => {
  const forbidden = ['document', 'window', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'navigator',
    'console', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'eval(', 'Function(', 'setTimeout', 'setInterval', 'Blob',
    'ProjectPackReviewExport', 'stagedProjectPack'];
  forbidden.forEach((tok) => assert.equal(PRINT_CODE.includes(tok), false, tok));
  // require は依存を掴む 1 か所だけ（project-pack-review.js）
  assert.deepEqual(PRINT_CODE.match(/require\([^)]*\)/g), ['require(requirePath)']);
  assert.equal((PRINT_CODE.match(/'\.\/[^']+'/g) || []).join(), "'./project-pack-review.js'");
  // 依存は ProjectPackReview だけ（global の参照は captureDependency の 1 か所）
  assert.deepEqual(PRINT_CODE.match(/global\[[^\]]*\]/g), ['global[globalName]', 'global[globalName]']);
  assert.equal((PRINT_CODE.match(/captureDependency\(/g) || []).length, 2);
});
