'use strict';

/**
 * Phase 2L-B2 / S3-B3B2-C1-A: Pack Review の Markdown / JSON 出力（project-config/project-pack-review-export.js）と、
 * review の発行元の記録（project-config/project-pack-review.js の assertReviewOrigin）。
 *
 *   ProjectPackReview.assertReviewOrigin(review, batch, ctx)   … 発行物で、batch・ctx（同じ instance）から発行された review だけ
 *     → toMarkdown(review, batch, ctx) / serializeJson(review, batch, ctx)
 *
 * 期待値の取り方（oracle）。export の出力から期待値を作らない:
 *   - JSON の値は、発行された review そのもの（同じ位置を並行に辿り、数値は Object.is、文字列は === で比べる）。
 *     書式は JSON.stringify(外枠, null, 2) と比べる（-0 を含まない review のとき）。値の保持と決定性は別の test
 *   - Markdown の表は、この test の中の小さな parser でセルに分け、escape を戻した値を review の値と比べる
 *     （Markdown の escape は非可逆なので、元の値への完全な逆変換は求めない。比べるのは可視化した形）。数値の表示の
 *     桁は画面（index.html の packReviewPressure / packReviewRatio / packReviewMargin / packReviewDifference）の契約:
 *     風圧・余裕差は toFixed(1)、余裕比は toFixed(3)、比較の差は寸法 0 桁・評価高さ 3 桁で、正なら +
 *   - Markdown の構造の安全は、無害な文字列の review と敵対的な文字列の review の差分で確かめる（行の数と種類・
 *     表のセルの数・escape されていない ASCII 記号の並びが同じ）。GitHub / Obsidian での実際の描画はこの test では
 *     確かめない（PR の証跡と Human verification）
 *   - 敵対的な文字列は、Project Pack の検証を通るもの（publicLabel）は本物の経路で、通らないもの・他の field は
 *     依存を差し替えた別の module instance に、本物の review を写した object を渡して確かめる
 *   - 多ケースの合成 Pack は tests/support/synthetic-pack.js がその場で作る（実案件の値ではない）
 *
 * 実行: node --test tests/  （または npm test）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const Pack = require('../project-config/project-pack.js');
const ProjectContext = require('../project-config/project-context.js');
const ProjectInput = require('../project-config/project-input.js');
const Exec = require('../project-config/project-pack-execution.js');
const Batch = require('../project-config/project-pack-batch.js');
const Report = require('../project-config/project-pack-report.js');
const Review = require('../project-config/project-pack-review.js');
const Export = require('../project-config/project-pack-review-export.js');
const WorkspaceCore = require('../workspace.js');
const ReviewPackage = require('../review-package.js');
const { stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const REVIEW_SRC_REL = 'project-config/project-pack-review.js';
const REVIEW_SRC = read(REVIEW_SRC_REL);
const REVIEW_CODE = stripComments(REVIEW_SRC);
const EXPORT_SRC_REL = 'project-config/project-pack-review-export.js';
const EXPORT_SRC = read(EXPORT_SRC_REL);
const EXPORT_CODE = stripComments(EXPORT_SRC);

const FIXTURES = {
  notification1458: 'tests/fixtures/project-pack/synthetic-notification1458.json',
  project_pressure_map: 'tests/fixtures/project-pack/synthetic-project-pressure-map.json',
  case_direct: 'tests/fixtures/project-pack/synthetic-case-direct.json'
};
const MODES = Object.keys(FIXTURES);
const rawPack = (mode) => JSON.parse(read(FIXTURES[mode]));
const ctxOf = (pack) => ProjectContext.fromProjectPack(Pack.validateProjectPack(pack));
const ctx = (mode) => ctxOf(rawPack(mode));
const genuine = (mode) => { const c = ctx(mode); return { c, b: Batch.executeAll(c) }; };
const fromPack = (pack) => { const c = ctxOf(pack); return { c, b: Batch.executeAll(c) }; };
const ids = (b) => b.rows.map((r) => r.caseId);
/** 全ケースの詳細（最大 50）と、最初と最後のケースの比較を選んだ review。 */
const fullOptions = (b) => ({ detailCaseIds: ids(b).slice(0, 50), comparisonCaseIds: [ids(b)[0], ids(b)[ids(b).length - 1]] });
const plain = (v) => JSON.parse(JSON.stringify(v));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const MODE_FIELDS = {
  notification1458: ['evaluationHeightM', 'positivePressure', 'negativePressure'],
  project_pressure_map: ['positivePressure', 'negativePressureMagnitude'],
  case_direct: []
};

const MAX = 8 * 1024 * 1024;
/** 固定の注意 4 件（G0 の notices。順番も文面も固定。module からは取らない）。 */
const NOTICES = Object.freeze([
  '未レビュー：この出力は、未レビュー（pack_unreviewed）の Project Pack から計算した結果です。',
  '計算済み ≠ 検証済み：値は計算したもので、検証されたものではありません（calculated_not_verified）。',
  'OK は計算上の候補判定です。Evidence の確認・安全性の判定・承認ではありません。',
  '正式な案件承認の資料ではありません。値は案件の出典資料・メーカー資料と照合してください。'
]);
const ENVELOPE_KEYS = ['exportType', 'exportSchemaVersion', 'sourceKind', 'trust', 'interpretation', 'notices', 'review'];
const ROUNDING_NOTE = '数値の表示：風圧（設計風圧・正圧・負圧・許容風圧）と余裕差は小数 1 桁、余裕比は小数 3 桁に丸めて表示して' +
  'います（画面と同じ。寸法・評価高さ・面積・係数・件数は review の値のまま）。比較の差も同じ桁で、寸法の差は整数、評価高さの' +
  '差は小数 3 桁です。丸めは表示だけで、計算・照合・差は丸めない値で行っています。全桁の値は JSON 出力にあります。';
const MSG = Object.freeze({
  origin: 'ProjectPackReviewExport: review: is not an issued Pack review of the given batch result and context',
  mdCap: (n) => 'ProjectPackReviewExport: markdown: output exceeds ' + n + ' bytes (not truncated)',
  jsonCap: (n) => 'ProjectPackReviewExport: json: output exceeds ' + n + ' bytes (not truncated)',
  mdBroken: 'ProjectPackReviewExport: markdown: could not be generated',
  jsonBroken: 'ProjectPackReviewExport: json: could not be generated',
  reviewNotIssued: 'ProjectPackReview: review: was not issued by ProjectPackReview',
  otherBatch: 'ProjectPackReview: review: was not issued from the given batch result',
  otherCtx: 'ProjectPackReview: review: was not issued from the given context',
  batchOtherCtx: 'ProjectPackBatch: batch: was not issued from the given context'
});

/* ------------------------------------------------------------
   module instance（vm）
------------------------------------------------------------ */

function load(src, rel, globals) {
  const sb = Object.assign({}, globals);
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: rel });
  return sb;
}
const loadReview = (globals) => load(REVIEW_SRC, REVIEW_SRC_REL, globals);
const loadExport = (globals, src) => load(src || EXPORT_SRC, EXPORT_SRC_REL, globals);
/** 上限だけを変えた export module（依存は本物の ProjectPackReview）。 */
function exportWithCap(bytes) {
  const decl = 'var MAX_OUTPUT_BYTES = 8 * 1024 * 1024;';
  assert.equal(EXPORT_SRC.split(decl).length - 1, 1, '前提: 上限の宣言は 1 か所');
  return loadExport({ ProjectPackReview: Review }, EXPORT_SRC.replace(decl, 'var MAX_OUTPUT_BYTES = ' + bytes + ';'))
    .ProjectPackReviewExport;
}
/**
 * 発行元の gate を何でも通す偽の ProjectPackReview を依存にした export module。本物の review を写した object に
 * 敵対的な文字列・壊れた値を入れて、書き出しの部分だけを確かめるために使う（本物の経路では gate が先に拒否する）。
 */
function stubExport() {
  const fake = Object.freeze({ REVIEW_TYPE: 'glass_wind_pack_review', SCHEMA_VERSION: 1, SOURCE_KIND: 'project_pack_unreviewed',
    TRUST: 'pack_unreviewed', INTERPRETATION: 'calculated_not_verified', assertReviewOrigin: (r) => r });
  return loadExport({ ProjectPackReview: fake }).ProjectPackReviewExport;
}

/* ------------------------------------------------------------
   Markdown を読む（この test の中だけの小さな parser）
------------------------------------------------------------ */

const DASH = '—';
const TOKEN_RE = /⟨U\+[0-9A-F]{4,6}⟩/g;
const num = (v) => (Object.is(v, -0) ? '-0' : String(v));
// 表示の桁（画面の契約）。丸めは review の値をそのまま toFixed するだけ
const p1 = (v) => v.toFixed(1);
const r3 = (v) => v.toFixed(3);
const pOrDash = (v, extra) => (v === null ? DASH + (extra || '') : p1(v));
const rOrDash = (v, extra) => (v === null ? DASH + (extra || '') : r3(v));
const MODE_PRESSURE_KIND = { evaluationHeightM: 'height', positivePressure: 'pressure', negativePressure: 'pressure',
  negativePressureMagnitude: 'pressure' };
const modeValue = (k, v) => (MODE_PRESSURE_KIND[k] === 'pressure' ? p1(v) : num(v));
const modeDigits = (k) => (MODE_PRESSURE_KIND[k] === 'pressure' ? 1 : 3);
const place = (r, k) => (hasOwn(r, k) ? r[k] : DASH + '（宣言なし）');
const signed = (v, digits) => (v === null ? DASH + '（片方に値なし）' : (v > 0 ? '+' : '') + v.toFixed(digits));
const same = (v) => (v === null ? DASH + '（片方に値なし）' : v ? '一致' : '不一致');
const idList = (list) => (list.length === 0 ? DASH : list.join(', '));
const bestLabel = (best) => (best === null ? DASH + '（推奨候補なし）' : best.label);
const bestP = (best) => (best === null ? DASH : p1(best.P));

/** 表の 1 行をセルに分ける（\ の付いた文字はセルの区切りにしない）。セルの前後の 1 文字の空白だけを外す。 */
function cellsOf(line) {
  assert.equal(line.startsWith('| ') && line.endsWith(' |'), true, '表の行ではない: ' + line.slice(0, 60));
  const cells = [];
  let cur = '';
  for (let i = 1; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') { cur += ch + line[i + 1]; i += 1; continue; }
    if (ch === '|') { cells.push(cur.slice(1, -1)); cur = ''; continue; }
    cur += ch;
  }
  assert.equal(cur, '', '行の末尾が | でない');
  return cells;
}

/** escape と可視化を戻す（ASCII の記号の前の \ を外し、⟨U+XXXX⟩ を文字に戻す。左から 1 回だけ）。 */
const decode = (cell) => cell.replace(/\\([!-/:-@[-`{-~])|⟨U\+([0-9A-F]{4,6})⟩/g,
  (m, p, h) => (p !== undefined ? p : String.fromCodePoint(parseInt(h, 16))));

/** 見出しの下の表をすべて集める（{ heading, headers, rows }。値は decode 済み）。 */
function tablesOf(md) {
  const lines = md.split('\n');
  const out = [];
  let heading = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6} /.test(lines[i])) heading = lines[i];
    if (lines[i].startsWith('| ') && /^\|(---\|)+$/.test(lines[i + 1] || '')) {
      const headers = cellsOf(lines[i]).map(decode);
      assert.equal(lines[i + 1], '|' + headers.map(() => '---').join('|') + '|', '区切り行のセルの数');
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].startsWith('| ')) {
        const cells = cellsOf(lines[j]);
        assert.equal(cells.length, headers.length, 'セルの数が見出しと違う');
        rows.push(cells.map(decode));
        j += 1;
      }
      out.push({ heading, headers, rows });
      i = j - 1;
    }
  }
  return out;
}
const tableUnder = (md, heading, nth) => {
  const found = tablesOf(md).filter((t) => t.heading === heading);
  assert.equal(found.length > (nth || 0), true, '表が無い: ' + heading);
  return found[nth || 0];
};

/** 行の種類（見出しの深さ・引用・区切り・表のセルの数・段落）。値は行の種類を変えてはならない。 */
function kinds(md) {
  return md.split('\n').map((line) => {
    if (line === '') return 'blank';
    const h = /^(#{1,6}) /.exec(line);
    if (h) return 'h' + h[1].length;
    if (line === '>') return 'quote-blank';
    if (line.startsWith('> ')) return 'quote';
    if (line === '---') return 'hr';
    if (/^\|(---\|)+$/.test(line)) return 'delim:' + (line.split('|').length - 2);
    if (line.startsWith('| ')) return 'row:' + cellsOf(line).length;
    return 'para';
  });
}

/** 行ごとの「escape されていない ASCII の記号」の並び（\ の付いた組と ⟨U+XXXX⟩ を除いた後に残る記号）。 */
const skeleton = (md) => md.split('\n').map((line) =>
  line.replace(/\\[\s\S]/g, '').replace(TOKEN_RE, '').replace(/[^!-/:-@[-`{-~]/g, ''));

/** 出力に生のまま残ってはならない文字（改行は除いて調べる）。 */
const RAW_INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}͏ᅟᅠ឴឵᠋-᠏⠀ㅤ︀-️ﾠ\u{E0100}-\u{E01EF}]/u;

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

/** 敵対的な合成文字列（GitHub / Obsidian の記法・HTML・改行・制御文字・不可視の文字・孤立したサロゲート）。 */
const ADVERSARIAL = [
  'a | b', '| x |\n|---|', '**b** __u__ *i* _j_', '[l](javascript:alert(1))', '![i](x.png)', '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>', '<!-- c -->', '&amp;&#124;&lt;', '[[wiki|alias]]', '![[embed]]', '==mark==', '%%comment%%',
  '$x$ $$y$$', '#tag', 'end ^block', '[^1]', '~~s~~', '`code` ``x``', '```', '~~~', '> [!note] callout', '- [ ] task',
  '+ item', '* item', '1. item', '1) item', '---', '===', '***', '# h1', '    code', '\tindent', 'line1\nline2', 'cr\rlf',
  'crlf\r\n', ':smile:', '@user', '#123', 'www.example.com', 'https://example.com', '<https://example.com>',
  'user@example.com', '\\', 'x\\', '\\|', '{{x}}', '{#id}', '<div>', 'a  ', '  ', '\u0000\u0001\u001B[31m\u007F',
  '\u0085\u009B', '  ', '​‌‍⁠﻿­', '‪‫‬‭‮⁦⁧⁨⁩',
  '\u{E0041}\u{E007F}', 'v️\u{E0100}', '\uD800', '\uDC00', 'ㅤᅟᅠﾠ⠀', ''
];
/** Project Pack の検証を通る敵対的な publicLabel（本物の経路で review まで届く）。 */
const ACCEPTED_LABELS = [
  'a | b | c', '**bold** __u__ *i* _j_', '[x](javascript:alert(1)) ![i](x)', '![[embed]] [[wiki|alias]]',
  '==mark== %%comment%% $x$ $$y$$', '#tag ^block [^1] ~~s~~ {{t}}', '`code` ``x``', 'line1\nline2\r\nline3\ttab',
  '> [!note] callout', '- [ ] task', '1. item', '---', '&amp; &#124; &lt;', ':smile: @user #123 www.example.com',
  'back\\slash \\| \\*', 'z​w‍⁠﻿­', '‮evil‬ ⁦iso⁩',
  'tag\u{E0041}\u{E0042}\u{E007F} vs️\u{E0100}', 'lone\uD800 low\uDC00', 'hangulㅤᅟﾠ braille⠀',
  'a  ', '| a | b |\n|---|---|', 'a<b', '\\', 'x\\', 'Ｘ｜全角', ' nbsp　ideo'
];
const visualized = (s) => Array.from(s).map((ch) => {
  const cp = ch.codePointAt(0);
  if (ch === '@') return '＠';
  if (/[!-/:-@[-`{-~]/.test(ch)) return '\\' + ch;
  if (RAW_INVISIBLE.test(ch) || (cp & 0xFFFE) === 0xFFFE || (cp >= 0xE0000 && cp <= 0xE007F) ||
      (cp >= 0xFDD0 && cp <= 0xFDEF) || (cp >= 0xFFF0 && cp <= 0xFFF8)) {
    return '⟨U+' + cp.toString(16).toUpperCase().padStart(4, '0') + '⟩';
  }
  return ch;
}).join('');

/* ============================================================
   X01: 契約（API・定数・取り込み口が無いこと）
============================================================ */

test('P2L-S3B3B2C1A-X01: export の API は toMarkdown / serializeJson と定数だけ（取り込み・逆変換の関数は無い）', () => {
  assert.deepEqual(Object.keys(Export), ['EXPORT_TYPE', 'EXPORT_SCHEMA_VERSION', 'SOURCE_KIND', 'TRUST', 'INTERPRETATION',
    'MAX_OUTPUT_BYTES', 'toMarkdown', 'serializeJson']);
  assert.equal(Export.EXPORT_TYPE, 'glass_wind_pack_review_export');
  assert.equal(Export.EXPORT_SCHEMA_VERSION, 1);
  assert.equal(Export.EXPORT_VERSION, undefined, 'G0 の名前は exportSchemaVersion');
  assert.equal(Export.SOURCE_KIND, 'project_pack_unreviewed');
  assert.equal(Export.TRUST, 'pack_unreviewed');
  assert.equal(Export.INTERPRETATION, 'calculated_not_verified');
  assert.equal(Export.MAX_OUTPUT_BYTES, MAX);
  assert.equal(Object.isFrozen(Export), true);
  assert.equal(Object.isFrozen(Export.toMarkdown), true);
  assert.equal(Object.keys(Export).some((k) => /import|deserial|parse|load|from|read|toReview|toPack|toWorkspace/i.test(k)), false);
  // review module に足したのは assertReviewOrigin だけ（記録した batch・ctx を返す API は無い）
  assert.deepEqual(Object.keys(Review), ['REVIEW_TYPE', 'SCHEMA_VERSION', 'SOURCE_KIND', 'TRUST', 'INTERPRETATION',
    'MAX_DETAIL_CASES', 'buildPackReview', 'isPackReview', 'assertPackReview', 'assertReviewOrigin']);
  assert.equal(Object.keys(Review).some((k) => /origin(?!$)|getOrigin|batchOf|contextOf|ctxOf|sourceOf/i.test(k) && k !== 'assertReviewOrigin'), false);
});

/* ============================================================
   X02–X06: 発行元（assertReviewOrigin）と最初の gate
============================================================ */

test('P2L-S3B3B2C1A-X02: 正規に発行された review と、それを作った batch・ctx なら出力できる（返り値は文字列だけ）', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    assert.equal(Review.assertReviewOrigin(r, b, c), r, 'assertReviewOrigin は review を返す（batch・ctx ではない）');
    const md = Export.toMarkdown(r, b, c);
    const json = Export.serializeJson(r, b, c);
    assert.equal(typeof md, 'string');
    assert.equal(typeof json, 'string');
    assert.equal(md.length > 0 && json.length > 0, true);
    // 入力（review・batch・ctx）を書き換えない。発行元の検査は以後も通る
    assert.equal(Batch.assertBatchOrigin(b, c), b);
    assert.equal(Review.assertReviewOrigin(r, b, c), r);
  }
});

test('P2L-S3B3B2C1A-X03: 古い review を別の batch・ctx と組み合わせると拒否する（内容が同じ instance でも・どの組み合わせでも）', () => {
  const { c, b } = genuine('notification1458');
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G002'] });
  const twinCtx = ctx('notification1458');            // 同じ fixture の別 instance
  const twinBatch = Batch.executeAll(twinCtx);
  const twinReview = Review.buildPackReview(twinBatch, twinCtx, { detailCaseIds: ['G002'] });
  const againBatch = Batch.executeAll(c);              // 同じ ctx からもう一度計算した batch
  const againReview = Review.buildPackReview(againBatch, c, { detailCaseIds: ['G002'] });
  assert.deepEqual(plain(twinReview), plain(r), '前提: 内容はまったく同じ');
  assert.deepEqual(plain(againReview), plain(r), '前提: 内容はまったく同じ');
  const other = genuine('case_direct');
  const foreign = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: Exec }).ProjectPackReview.buildPackReview(b, c);
  const cases = [
    [r, twinBatch, twinCtx, MSG.otherBatch], [r, b, twinCtx, MSG.otherCtx], [r, twinBatch, c, MSG.otherBatch],
    [r, againBatch, c, MSG.otherBatch], [againReview, b, c, MSG.otherBatch], [twinReview, b, c, MSG.otherBatch],
    [r, other.b, other.c, MSG.otherBatch], [r, b, other.c, MSG.otherCtx], [r, b, null, MSG.otherCtx], [r, b, undefined, MSG.otherCtx],
    [r, plain(b), c, MSG.otherBatch], [r, Object.create(b), c, MSG.otherBatch], [r, b, plain(c), MSG.otherCtx],
    [plain(r), b, c, MSG.reviewNotIssued], [Object.assign({}, r), b, c, MSG.reviewNotIssued], [Object.create(r), b, c, MSG.reviewNotIssued],
    [foreign, b, c, MSG.reviewNotIssued], [Report.buildReport(b), b, c, MSG.reviewNotIssued], [b, b, c, MSG.reviewNotIssued],
    [null, b, c, MSG.reviewNotIssued], [undefined, b, c, MSG.reviewNotIssued], ['review', b, c, MSG.reviewNotIssued]
  ];
  cases.forEach(([rv, bt, cx, reason], i) => {
    assert.throws(() => Review.assertReviewOrigin(rv, bt, cx), { message: reason }, 'case ' + i);
    assert.throws(() => Export.toMarkdown(rv, bt, cx), { message: MSG.origin }, 'markdown case ' + i);
    assert.throws(() => Export.serializeJson(rv, bt, cx), { message: MSG.origin }, 'json case ' + i);
  });
  // 拒否した呼び出しは何も返さない
  let out = 'none';
  try { out = Export.toMarkdown(r, twinBatch, twinCtx); } catch (e) { /* expected */ }
  assert.equal(out, 'none');
  // それぞれ自分の batch・ctx となら通る
  [[r, b, c], [twinReview, twinBatch, twinCtx], [againReview, againBatch, c]].forEach(([rv, bt, cx]) => {
    assert.equal(Export.serializeJson(rv, bt, cx), Export.serializeJson(r, b, c), '内容が同じなら出力も同じ');
  });
});

test('P2L-S3B3B2C1A-X04: 発行元の確認の限界: 古い review と、それを作った batch・ctx をすべて持っていれば出力できる（現在性は呼び出し側の責務）', () => {
  const { c, b } = genuine('project_pressure_map');
  const old = Review.buildPackReview(b, c, { detailCaseIds: ['G001'] });
  const before = { md: Export.toMarkdown(old, b, c), json: Export.serializeJson(old, b, c) };
  // 画面ではこの後、同じ Pack の再計算・別の選択の review・別の Pack の読み込みへ進んだとする
  const newer = Batch.executeAll(c);
  const newerReview = Review.buildPackReview(newer, c, { detailCaseIds: ['G002'] });
  const nextCtx = ctx('project_pressure_map');
  const nextBatch = Batch.executeAll(nextCtx);
  Review.buildPackReview(nextBatch, nextCtx);
  // pure module はそれを知らない。古い 3 つの組み合わせはそのまま通り、同じ出力になる（これは限界として記録する）
  assert.equal(Export.toMarkdown(old, b, c), before.md);
  assert.equal(Export.serializeJson(old, b, c), before.json);
  assert.equal(Review.assertReviewOrigin(old, b, c), old);
  // 一方、古い review を新しい batch・ctx と組み合わせることはできない（X03）
  assert.throws(() => Export.toMarkdown(old, newer, c), { message: MSG.origin });
  assert.throws(() => Export.toMarkdown(old, nextBatch, nextCtx), { message: MSG.origin });
  assert.throws(() => Export.toMarkdown(newerReview, b, c), { message: MSG.origin });
  // export module は「いま有効か」を決める状態を持たない（画面の状態の名前・時刻を読まない）
  ['stagedProjectPack', 'currentProjectPackReview', 'projectPackAttempt', 'projectPackBatchOrigin', 'Date', 'performance']
    .forEach((token) => assert.equal(EXPORT_CODE.includes(token), false, token));
  assert.equal(/new WeakMap|new WeakSet|new Map|new Set/.test(EXPORT_CODE), false, 'export module は発行・失効の記録を持たない');
});

test('P2L-S3B3B2C1A-X05: assertReviewOrigin は batch 自身の assertBatchOrigin も確かめ直す（batch の gate を維持する）', () => {
  const calls = [];
  let fault = false;
  const batchSpy = Object.freeze(Object.assign({}, Batch, {
    assertBatchOrigin: (r, cx) => {
      calls.push([r, cx]);
      if (fault) throw new Error('batch gate refused');
      return Batch.assertBatchOrigin(r, cx);
    }
  }));
  const R2 = loadReview({ ProjectPackBatch: batchSpy, ProjectPackExecution: Exec }).ProjectPackReview;
  const X2 = loadExport({ ProjectPackReview: R2 }).ProjectPackReviewExport;
  const { c, b } = genuine('case_direct');
  const r = R2.buildPackReview(b, c);
  assert.equal(calls.length, 1, 'buildPackReview の最初の gate');
  assert.equal(R2.assertReviewOrigin(r, b, c), r);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], b);
  assert.equal(calls[1][1], c);
  X2.toMarkdown(r, b, c);
  X2.serializeJson(r, b, c);
  assert.equal(calls.length, 4, 'export の 2 つの関数も、それぞれ 1 回 batch の gate を通る');
  // review の記録が一致していても、batch の gate が拒否すれば拒否する
  fault = true;
  assert.throws(() => R2.assertReviewOrigin(r, b, c), /batch gate refused/);
  assert.throws(() => X2.toMarkdown(r, b, c), { message: MSG.origin });
  assert.throws(() => X2.serializeJson(r, b, c), { message: MSG.origin });
  // 静的: assertReviewOrigin の中で、review の記録の一致の後に batch の gate を呼ぶ
  const body = REVIEW_CODE.slice(REVIEW_CODE.indexOf('function assertReviewOrigin('), REVIEW_CODE.indexOf('return deepFreeze({'));
  const at = (s) => { const i = body.indexOf(s); assert.notEqual(i, -1, s); return i; };
  ['assertPackReview(r)', 'originByReview.get(r)', 'origin.batch !== batchResult', 'origin.ctx !== ctx', 'B.assertBatchOrigin(batchResult, ctx)']
    .reduce((prev, s) => { const i = at(s); assert.equal(i > prev, true, s + ' の順'); return i; }, -1);
});

test('P2L-S3B3B2C1A-X06: 発行元は正式な発行が成功したときだけ記録する（module private・返す API なし・review の形は変わらない）', () => {
  const body = REVIEW_CODE.slice(REVIEW_CODE.indexOf('function buildPackReview('), REVIEW_CODE.indexOf('function walkForbidden('));
  const at = (s) => { const i = body.indexOf(s); assert.notEqual(i, -1, s); return i; };
  ['B.assertBatchOrigin(', 'assertPackReviewShape(review)', 'deepFreeze(review)',
    'originByReview.set(review, Object.freeze({ batch: batchResult, ctx: ctx }))', 'issued.add(review)', 'return review']
    .reduce((prev, s) => { const i = at(s); assert.equal(i > prev, true, s + ' の順'); return i; }, -1);
  assert.equal((REVIEW_CODE.match(/originByReview/g) || []).length, 3, '宣言・記録・読み出しの 3 か所だけ');
  assert.equal((REVIEW_CODE.match(/originByReview\.set\(/g) || []).length, 1);
  assert.match(REVIEW_CODE, /var originByReview = new WeakMap\(\);/);
  const exportsBlock = REVIEW_CODE.slice(REVIEW_CODE.indexOf('return deepFreeze({'));
  assert.equal(/originByReview|origin\.|\.batch|\.ctx/.test(exportsBlock), false, '記録を外へ出さない');
  // 失敗した build（照合の不一致）は review を返さず、出力の入口に渡せる物が無い
  const p = rawPack('notification1458');
  p.glazingCases[1].extraFactor = 0.95;
  const decoyExec = Object.freeze(Object.assign({}, Exec, { executeCase: (cx, id) => Exec.executeCase(ctxOf(p), id) }));
  const R2 = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: decoyExec }).ProjectPackReview;
  const { c, b } = genuine('notification1458');
  let returned = 'none';
  try { returned = R2.buildPackReview(b, c, { detailCaseIds: ['G002'] }); } catch (e) { /* expected */ }
  assert.equal(returned, 'none');
  // review の key・schema・trust は変わらない（記録は review の object に載らない）
  const r = Review.buildPackReview(b, c);
  assert.deepEqual(Object.keys(r), ['reviewType', 'schemaVersion', 'sourceKind', 'trust', 'interpretation', 'publicLabel',
    'pressureMode', 'units', 'totalCases', 'rows', 'summary', 'groups', 'selectedDetails', 'comparison']);
  assert.equal(Object.getOwnPropertySymbols(r).length, 0);
  assert.equal(Object.getOwnPropertyNames(r).length, 14);
  assert.equal(Object.isFrozen(r), true);
});

/* ============================================================
   X07–X09: JSON（外枠・値の保持・決定性）
============================================================ */

test('P2L-S3B3B2C1A-X07: JSON は version 付きの外枠に review をそのまま入れる（trust 固定・全ケース・全グループ・詳細・比較）', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    const json = Export.serializeJson(r, b, c);
    const parsed = JSON.parse(json);
    assert.deepEqual(Object.keys(parsed), ENVELOPE_KEYS);
    assert.equal(parsed.exportType, 'glass_wind_pack_review_export');
    assert.equal(parsed.exportSchemaVersion, 1);
    assert.deepEqual(parsed.notices, NOTICES);
    assert.equal(parsed.sourceKind, 'project_pack_unreviewed');
    assert.equal(parsed.trust, 'pack_unreviewed');
    assert.equal(parsed.interpretation, 'calculated_not_verified');
    assert.equal(parsed.review.trust, 'pack_unreviewed');
    assert.equal(parsed.review.interpretation, 'calculated_not_verified');
    assert.deepEqual(parsed.review, plain(r));
    assert.equal(parsed.review.rows.length, b.totalCases);
    assert.equal(parsed.review.selectedDetails.length, Math.min(50, b.totalCases));
    assert.notEqual(parsed.review.comparison, null);
    // 書式は JSON.stringify(外枠, null, 2) と同じ（末尾に改行 1 つ）
    const envelope = { exportType: 'glass_wind_pack_review_export', exportSchemaVersion: 1, sourceKind: 'project_pack_unreviewed',
      trust: 'pack_unreviewed', interpretation: 'calculated_not_verified', notices: NOTICES, review: r };
    assert.equal(json, JSON.stringify(envelope, null, 2) + '\n');
  }
});

test('P2L-S3B3B2C1A-X08: JSON は検査済みの値と精度を保つ（数値は Object.is・文字列は完全一致・-0 も保つ）', () => {
  /** 2 つの値を並行に辿り、key の順・数値（Object.is）・文字列（===）・null・配列の長さを比べる。 */
  const sameValues = (a, e, at) => {
    if (typeof e === 'number') { assert.equal(Object.is(a, e), true, at + ': ' + a + ' vs ' + e); return; }
    if (e === null || typeof e !== 'object') { assert.equal(a, e, at); return; }
    assert.equal(Array.isArray(a), Array.isArray(e), at);
    assert.deepEqual(Object.keys(a), Object.keys(e), at + ' の key の順');
    Object.keys(e).forEach((k) => sameValues(a[k], e[k], at + '.' + k));
  };
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    sameValues(JSON.parse(Export.serializeJson(r, b, c)).review, r, mode);
  }
  // 本物の経路: Pack の検証を通る敵対的な publicLabel（改行・タブ・不可視の文字・孤立したサロゲート）も完全に戻る
  for (const label of ACCEPTED_LABELS) {
    const pack = rawPack('case_direct');
    pack.projectMetadata.publicLabel = label;
    const { c, b } = fromPack(pack);
    const r = Review.buildPackReview(b, c);
    const json = Export.serializeJson(r, b, c);
    assert.equal(JSON.parse(json).review.publicLabel, label, JSON.stringify(label));
    assert.equal(/\p{Cs}/u.test(json), false, '孤立したサロゲートは JSON の escape になる（出力は UTF-8 として正しい）');
    assert.equal(/[\u0000-\u0009\u000B-\u001F]/.test(json), false, '制御文字は JSON の escape になる');
  }
  // 書き出しの部分（依存を差し替えた instance）: -0・丸めに弱い値・大きい / 小さい値も、そのまま戻る
  const X = stubExport();
  const { c, b } = genuine('project_pressure_map');
  const forged = plain(Review.buildPackReview(b, c, fullOptions(b)));
  const tricky = [-0, 0.1 + 0.2, 1e21, 5e-324, -1.7976931348623157e308, 2 ** 53 + 2, 1 / 3];
  forged.rows.forEach((row, i) => { row.widthMm = tricky[i % tricky.length]; });
  forged.summary.maxDesignPressure = -0;
  const out = X.serializeJson(forged, null, null);
  assert.match(out, /"maxDesignPressure": -0,/);
  sameValues(JSON.parse(out).review, forged, 'forged');
  // 文字列の値は JSON の escape で完全に戻る（Markdown と違い可逆）
  const adversarial = mapStrings(forged, (s, i) => ADVERSARIAL[i % ADVERSARIAL.length]);
  sameValues(JSON.parse(X.serializeJson(adversarial, null, null)).review, adversarial, 'adversarial');
});

test('P2L-S3B3B2C1A-X09: JSON は決定的（同じ review・同じ入力から作り直した review・別の module instance で byte 列が同じ。時刻・乱数なし）', () => {
  for (const mode of MODES) {
    const opts = (b) => ({ detailCaseIds: ids(b).slice(0, 2), comparisonCaseIds: ids(b).slice(0, 2) });
    const g1 = genuine(mode);
    const r1 = Review.buildPackReview(g1.b, g1.c, opts(g1.b));
    const first = Export.serializeJson(r1, g1.b, g1.c);
    assert.equal(Export.serializeJson(r1, g1.b, g1.c), first, '同じ review を 2 回');
    const g2 = genuine(mode);   // 同じ fixture から ctx・batch・review を作り直す
    const r2 = Review.buildPackReview(g2.b, g2.c, opts(g2.b));
    assert.equal(Export.serializeJson(r2, g2.b, g2.c), first, '作り直した review');
    // 別の review / export module instance（同じ batch / executor の module を依存にする）
    const R2 = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: Exec }).ProjectPackReview;
    const X2 = loadExport({ ProjectPackReview: R2 }).ProjectPackReviewExport;
    assert.equal(X2.serializeJson(R2.buildPackReview(g1.b, g1.c, opts(g1.b)), g1.b, g1.c), first, '別の instance');
    // Markdown も同じく決定的
    const md = Export.toMarkdown(r1, g1.b, g1.c);
    assert.equal(Export.toMarkdown(r2, g2.b, g2.c), md);
  }
  // 時刻・乱数・環境に依存する値を読まない（静的）
  ['Date', 'Math.random', 'performance', 'process', 'navigator', 'crypto', 'toLocale', 'Intl', 'localeCompare', '.sort(']
    .forEach((token) => assert.equal(EXPORT_CODE.includes(token), false, token));
  // 外枠の key の順は literal で固定（prototype の汚染・toJSON を使わない）
  const saved = Object.prototype.toJSON;
  Object.defineProperty(Object.prototype, 'toJSON', { value: () => 'polluted', configurable: true, writable: true });
  try {
    const { c, b } = genuine('case_direct');
    const r = Review.buildPackReview(b, c);
    const json = Export.serializeJson(r, b, c);
    assert.equal(json.includes('polluted'), false, 'Object.prototype.toJSON を使った');
    assert.equal(json.startsWith('{\n  "exportType": "glass_wind_pack_review_export",'), true);
  } finally {
    if (saved === undefined) delete Object.prototype.toJSON; else Object.prototype.toJSON = saved;
  }
});

/* ============================================================
   X10–X12: Markdown（省略しない・構造の安全・不可視の文字）
============================================================ */

function expectedRowCells(review, r) {
  return [r.caseId, r.paneId, place(r, 'floor'), place(r, 'zone'), r.glassType, num(r.widthMm), num(r.heightMm),
    p1(r.designPressure), r.pressureSource]
    .concat(MODE_FIELDS[review.pressureMode].map((k) => modeValue(k, r[k])))
    .concat([bestLabel(r.bestCandidate), bestP(r.bestCandidate), num(r.okCount), num(r.ngCount), num(r.outOfScopeCount),
      rOrDash(r.marginRatio), pOrDash(r.marginPressure)]);
}

/** Markdown の内容を review の値と照合する（全ケース・全グループ・詳細・比較・trust）。 */
function assertMarkdownMatches(md, r) {
  const u = r.units;
  // trust: 冒頭と末尾
  const lines = md.split('\n');
  assert.equal(lines[0], '# Pack Review（未レビュー）');
  assert.equal(lines[2], '> **未レビュー**（`pack_unreviewed`）・**計算済み ≠ 検証済み**（`calculated_not_verified`）');
  assert.equal(lines[3], '>');
  NOTICES.forEach((notice, i) => assert.equal(lines[4 + i], '> - ' + visualized(notice), '固定の注意 ' + i));
  assert.equal(lines[8], '> - 余裕比・余裕差は確認用の指標で、安全性の判定・承認ではありません。');
  assert.equal(lines[9], '> - この文書は Project Pack・入力 package・Workspace の入力として読み込むものではありません。');
  assert.equal(lines[10], '');
  assert.equal(lines[11], ROUNDING_NOTE, '丸めの注記');
  assert.equal(lines[lines.length - 2], '> **未レビュー**（`pack_unreviewed`）・**計算済み ≠ 検証済み**（`calculated_not_verified`）。' +
    '正式な案件承認の資料ではありません。');
  assert.equal(lines[lines.length - 1], '', '末尾は改行 1 つ');
  // 出力の情報
  assert.deepEqual(tableUnder(md, '## 出力の情報').rows, [
    ['出力形式', '`glass_wind_pack_review_export`（exportSchemaVersion 1）'], ['review', 'glass_wind_pack_review（schemaVersion 1）'],
    ['sourceKind', '`project_pack_unreviewed`'], ['trust', '`pack_unreviewed`'], ['interpretation', '`calculated_not_verified`'],
    ['公開表示名', r.publicLabel], ['pressureModel.mode', r.pressureMode],
    ['単位', '長さ ' + u.length + ' ／ 高さ ' + u.height + ' ／ 風圧 ' + u.pressure + ' ／ 面積 ' + u.area],
    ['全ケース数', String(r.totalCases)], ['詳細を選んだケース数', String(r.selectedDetails.length)],
    ['2 ケースの比較', r.comparison === null ? 'なし' : 'あり']
  ]);
  // 集計
  const s = r.summary;
  assert.deepEqual(tableUnder(md, '## 集計', 0).rows, [['全ケース数', String(s.totalCases)],
    ['推奨候補あり', String(s.withOkCandidateCount)], ['推奨候補なし', String(s.withoutOkCandidateCount)],
    ['適用範囲外の候補を含むケース', String(s.outOfScopePresentCount)]]);
  const metrics = tableUnder(md, '## 集計', 1).rows;
  [['最大設計風圧（' + u.pressure + '）', pOrDash(s.maxDesignPressure), String(s.maxDesignPressureCaseIds.length), idList(s.maxDesignPressureCaseIds)],
    ['最小余裕比（推奨候補の許容風圧 ÷ 設計風圧）', rOrDash(s.minMarginRatio, '（推奨候補のあるケースなし）'),
      String(s.minMarginRatioCaseIds.length), idList(s.minMarginRatioCaseIds)]
  ].forEach((cells, i) => cells.forEach((cell, j) => assert.equal(metrics[i][j] === cell, true, '集計の指標 [' + i + '][' + j + ']')));
  assert.equal(metrics.length, 2);
  // グループ（3 分類のすべての組・すべての caseId）
  const groupRows = (h, expected) => {
    const got = tableUnder(md, h).rows;
    assert.equal(got.length, expected.length, h + ' の組の数');
    expected.forEach((cells, i) => cells.forEach((cell, j) =>
      assert.equal(got[i][j] === cell, true, h + ' [' + i + '][' + j + ']')));
  };
  groupRows('### 推奨候補の構成別',
    r.groups.byRecommended.map((g) => [g.label === null ? DASH + '（推奨候補なし）' : g.label, String(g.count), idList(g.caseIds)]));
  [['### 階別', 'byFloor', 'floor'], ['### 部位別', 'byZone', 'zone']].forEach(([h, key, field]) => {
    groupRows(h, r.groups[key].map((g) =>
      [g.declared ? g[field] : DASH + '（宣言なし）', g.declared ? 'あり' : 'なし', String(g.count), idList(g.caseIds)]));
  });
  // 全ケースの行（並び・件数・すべての field）
  const rowsTable = tableUnder(md, '## ケース一覧（全 ' + r.totalCases + ' ケース）');
  assert.equal(rowsTable.rows.length, r.totalCases);
  // 行ごとに比べる（大きな表の差分で assert が資源を使い切らないように）
  r.rows.forEach((row, i) => assert.deepEqual(rowsTable.rows[i], expectedRowCells(r, row), 'row ' + i));
  // 選んだケースの詳細（選んだ順・すべての field・候補の一覧のすべて）
  assert.equal(md.includes('## 選んだケースの詳細（' + r.selectedDetails.length + ' 件）'), true);
  r.selectedDetails.forEach((d, i) => {
    const heading = '### 詳細 ' + (i + 1) + '：ケース ' + visualized(d.caseId);
    const t = tableUnder(md, heading);
    const expected = [['caseId', d.caseId], ['paneId', d.paneId], ['階', place(d, 'floor')], ['部位', place(d, 'zone')],
      ['ガラス', d.glassType], ['告示外の追加低減係数', num(d.extraFactor)], ['幅 W（' + u.length + '）', num(d.widthMm)],
      ['高さ H（' + u.length + '）', num(d.heightMm)], ['面積（' + u.area + '）', num(d.areaM2)], ['pressureModel.mode', d.pressureMode],
      ['設計風圧（' + u.pressure + '）', p1(d.designPressure)], ['風圧の出どころ', d.pressureSource]];
    MODE_FIELDS[r.pressureMode].forEach((k) => expected.push([t.rows[expected.length][0], modeValue(k, d[k])]));
    expected.push(['推奨候補', bestLabel(d.bestCandidate)], ['許容風圧（' + u.pressure + '）', bestP(d.bestCandidate)],
      ['余裕比', rOrDash(d.marginRatio)], ['余裕差（' + u.pressure + '）', pOrDash(d.marginPressure)], ['OK', num(d.okCount)],
      ['NG', num(d.ngCount)], ['適用範囲外', num(d.outOfScopeCount)]);
    assert.deepEqual(t.rows, expected, heading);
  });
  // 候補の一覧は、詳細の順にすべて（見出しの件数と、見出しの順に並べた表の中身を照合する）
  const statusText = { ok: 'OK（計算上の候補判定）', ng: 'NG', out_of_scope: '適用範囲外' };
  assert.deepEqual(md.split('\n').filter((line) => /^#### /.test(line)),
    r.selectedDetails.map((d) => '#### 候補の一覧（' + d.candidateSummary.length + ' 件）'));
  const candidateTables = tablesOf(md).filter((t) => /^#### 候補の一覧/.test(t.heading));
  const withCandidates = r.selectedDetails.filter((d) => d.candidateSummary.length > 0);
  assert.equal(candidateTables.length, withCandidates.length, '候補の一覧の表の数');
  withCandidates.forEach((d, i) => d.candidateSummary.forEach((cand, j) =>
    assert.deepEqual(candidateTables[i].rows[j], [cand.label, p1(cand.P), statusText[cand.status]], '候補 ' + i + '/' + j)));
  candidateTables.forEach((t, i) => assert.equal(t.rows.length, withCandidates[i].candidateSummary.length, '候補の数 ' + i));
  // 比較（a・b・差・一致のすべて）
  const c = r.comparison;
  if (c === null) {
    assert.equal(md.includes('## 2 ケースの比較\n\n比較は選ばれていません。\n'), true);
  } else {
    const t = tableUnder(md, '## 2 ケースの比較');
    const a = c.a;
    const b = c.b;
    const expected = [['caseId', a.caseId, b.caseId, ''], ['paneId', a.paneId, b.paneId, same(c.sameValue.paneId)],
      ['階', place(a, 'floor'), place(b, 'floor'), same(c.sameValue.floor)], ['部位', place(a, 'zone'), place(b, 'zone'), same(c.sameValue.zone)],
      ['ガラス', a.glassType, b.glassType, same(c.sameValue.glassType)],
      ['幅 W（' + u.length + '）', num(a.widthMm), num(b.widthMm), signed(c.difference.widthMm, 0)],
      ['高さ H（' + u.length + '）', num(a.heightMm), num(b.heightMm), signed(c.difference.heightMm, 0)],
      ['設計風圧（' + u.pressure + '）', p1(a.designPressure), p1(b.designPressure), signed(c.difference.designPressure, 1)],
      ['風圧の出どころ', a.pressureSource, b.pressureSource, '']];
    MODE_FIELDS[r.pressureMode].forEach((k) => expected.push([t.rows[expected.length][0], modeValue(k, a[k]), modeValue(k, b[k]),
      signed(c.difference[k], modeDigits(k))]));
    expected.push(['推奨候補', bestLabel(a.bestCandidate), bestLabel(b.bestCandidate), same(c.sameValue.recommendedLabel)],
      ['許容風圧（' + u.pressure + '）', bestP(a.bestCandidate), bestP(b.bestCandidate), signed(c.difference.allowablePressure, 1)],
      ['余裕比', rOrDash(a.marginRatio), rOrDash(b.marginRatio), signed(c.difference.marginRatio, 3)],
      ['余裕差（' + u.pressure + '）', pOrDash(a.marginPressure), pOrDash(b.marginPressure), signed(c.difference.marginPressure, 1)],
      ['OK', num(a.okCount), num(b.okCount), ''], ['NG', num(a.ngCount), num(b.ngCount), ''],
      ['適用範囲外', num(a.outOfScopeCount), num(b.outOfScopeCount), '']);
    assert.deepEqual(t.rows, expected);
    assert.equal(md.includes('A: ' + visualized(c.caseIds[0]) + ' ／ B: ' + visualized(c.caseIds[1]) + '。差は B − A です。'), true);
  }
}

test('P2L-S3B3B2C1A-X10: Markdown は全ケース・全グループ・選んだ詳細・比較を省略せず、値は review のまま（丸めない・null は「—」）', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    assertMarkdownMatches(Export.toMarkdown(r, b, c), r);
    // 詳細・比較なし
    const bare = Review.buildPackReview(b, c);
    const md = Export.toMarkdown(bare, b, c);
    assertMarkdownMatches(md, bare);
    assert.equal(md.includes('詳細を表示するケースは選ばれていません。'), true);
  }
  // 推奨候補の無いケース・未宣言の階 / 部位・null の余裕比（case_direct の極端な設計風圧）
  const pack = syntheticPack(12, 'case_direct', { label: 'Synthetic NoCandidate', designPressureOf: (i) => (i % 4 === 0 ? 90000 : 1000 + i) });
  const { c, b } = fromPack(pack);
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G0001', 'G0002'], comparisonCaseIds: ['G0001', 'G0002'] });
  assert.equal(r.rows.some((row) => row.bestCandidate === null && row.marginRatio === null), true, '前提: 推奨候補なしのケース');
  assert.equal(r.groups.byFloor.some((g) => g.declared === false), true, '前提: 未宣言の階');
  const md = Export.toMarkdown(r, b, c);
  assertMarkdownMatches(md, r);
  assert.equal(/\| 0 \| —（推奨候補なし）|余裕比 \| 0 \|/.test(md), false, 'null を 0 にしていない');
});

test('P2L-S3B3B2C1A-X11: 本物の経路の敵対的な publicLabel（Pack の検証を通るもの）でも Markdown の構造は変わらない', () => {
  const benignPack = rawPack('notification1458');
  benignPack.projectMetadata.publicLabel = 'Synthetic Benign';
  const g0 = fromPack(benignPack);
  const opts = { detailCaseIds: ['G002'], comparisonCaseIds: ['G001', 'G003'] };
  const benign = Export.toMarkdown(Review.buildPackReview(g0.b, g0.c, opts), g0.b, g0.c);
  for (const label of ACCEPTED_LABELS) {
    const pack = rawPack('notification1458');
    pack.projectMetadata.publicLabel = label;
    const { c, b } = fromPack(pack);   // Pack の検証を通ること自体が前提
    const r = Review.buildPackReview(b, c, opts);
    const md = Export.toMarkdown(r, b, c);
    const tag = JSON.stringify(label);
    assert.deepEqual(kinds(md), kinds(benign), tag + ': 行の数・種類・表のセルの数');
    assert.deepEqual(skeleton(md), skeleton(benign), tag + ': escape されていない記号の並び');
    assert.equal(RAW_INVISIBLE.test(md.replace(/\n/g, '')), false, tag + ': 不可視の文字が生のまま');
    const row = tableUnder(md, '## 出力の情報').rows.find((x) => x[0] === '公開表示名');
    assert.equal(row[1], decode(visualized(label)), tag + ': 可視化した形（escape を戻した値）');
    assert.equal(md.includes('| 公開表示名 | ' + visualized(label) + ' |'), true, tag + ': escape の形');
  }
});

test('P2L-S3B3B2C1A-X12: すべての文字列の field に敵対的な合成文字列を入れても構造は変わらず、不可視の文字はすべて可視化する', () => {
  const X = stubExport();
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const base = plain(Review.buildPackReview(b, c, fullOptions(b)));
    const benign = X.toMarkdown(mapStrings(base, () => 'safe'), null, null);
    const adversarial = mapStrings(base, (s, i) => ADVERSARIAL[i % ADVERSARIAL.length]);
    const md = X.toMarkdown(adversarial, null, null);
    assert.deepEqual(kinds(md), kinds(benign), mode + ': 行の数・種類・表のセルの数');
    assert.deepEqual(skeleton(md), skeleton(benign), mode + ': escape されていない記号の並び');
    assert.equal(RAW_INVISIBLE.test(md.replace(/\n/g, '')), false, mode + ': 不可視の文字が生のまま');
    assert.equal(/\p{Cs}/u.test(md), false);
    // 敵対的な文字列は、可視化した形のまま表のセルに入る（行・セルを壊さない）
    const rows = tableUnder(md, '## ケース一覧（全 ' + base.totalCases + ' ケース）').rows;
    rows.forEach((cells, i) => assert.equal(cells[0], decode(visualized(adversarial.rows[i].caseId)), mode + ' row ' + i));
  }
  // 可視化の範囲: Unicode の制御文字・書式文字・サロゲート・行 / 段落の区切り（この Node の Unicode のすべて）と、
  // 異体字セレクタ・タグ文字・空白に見える埋め字・非文字
  const targets = [];
  for (let cp = 0; cp <= 0x10FFFF; cp++) {
    const ch = String.fromCodePoint(cp);
    if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(ch)) targets.push(cp);
  }
  const extra = [0x034F, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x180B, 0x180C, 0x180D, 0x180F, 0x2800, 0x3164, 0xFFA0, 0xFFFE,
    0xFFFF, 0x1FFFE, 0x10FFFF, 0xFDD0, 0xFDEF];
  for (let cp = 0xFE00; cp <= 0xFE0F; cp++) extra.push(cp);
  for (let cp = 0xE0100; cp <= 0xE01EF; cp++) extra.push(cp);
  for (let cp = 0xE0000; cp <= 0xE007F; cp++) extra.push(cp);
  const all = Array.from(new Set(targets.concat(extra))).sort((p, q) => p - q);
  assert.equal(targets.length > 2048 + 65 + 150, true, '前提: サロゲート・C0 / C1・書式文字を数えている');
  const { c, b } = genuine('case_direct');
  const forged = plain(Review.buildPackReview(b, c));
  forged.publicLabel = all.map((cp) => String.fromCodePoint(cp) + 'a').join('');
  const md = X.toMarkdown(forged, null, null);
  const expected = all.map((cp) => '⟨U+' + cp.toString(16).toUpperCase().padStart(4, '0') + '⟩a').join('');
  assert.equal(md.includes('| 公開表示名 | ' + expected + ' |'), true, '不可視の文字の可視化');
  assert.equal(RAW_INVISIBLE.test(md.replace(/\n/g, '')), false);
  // ASCII の記号は @ 以外すべて \ を付け、@ は全角の ＠（GitHub の cmark-gfm は escape を解いた後の e-mail を
  // 自動リンクにする）。それ以外の文字（日本語・絵文字・NBSP・全角空白・全角記号・結合文字）はそのまま
  const punct = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
  forged.publicLabel = punct + 'あ漢字😀 　｜＊é';
  const md2 = X.toMarkdown(forged, null, null);
  assert.equal(md2.includes('| 公開表示名 | ' + Array.from(punct).map((ch) => (ch === '@' ? '＠' : '\\' + ch)).join('') +
    'あ漢字😀 　｜＊é |'), true);
  // e-mail・mailto:・xmpp: の形と GitHub のメンションの形は、ASCII の @ を含まない
  ['user@example.com', 'mailto:a@b.co', 'xmpp:a@b.co', '@user'].forEach((s) => {
    forged.publicLabel = s;
    const row = X.toMarkdown(forged, null, null).split('\n').find((line) => line.startsWith('| 公開表示名 | '));
    assert.equal(row.includes('@'), false, s);
    assert.equal(row.includes('＠'), true, s);
  });
});

/* ============================================================
   X13–X14: 規模（2000 ケース × 3 mode）と 8 MiB の上限
============================================================ */

test('P2L-S3B3B2C1A-X13: 2000 ケース × 3 mode を省略せずに書き出す（時間と大きさは記録だけ・上限の内側）', (t) => {
  const cpu = (os.cpus()[0] || { model: 'unknown' }).model;
  t.diagnostic('environment: node ' + process.version + ' / ' + os.platform() + ' ' + os.arch() + ' / ' + cpu +
    ' / ' + os.cpus().length + ' cpus（時間は参考値。assert しない）');
  for (const mode of MODES) {
    const { c, b } = fromPack(syntheticPack(2000, mode));
    const r = Review.buildPackReview(b, c, fullOptions(b));
    assert.equal(r.rows.length, 2000);
    let t0 = process.hrtime.bigint();
    const md = Export.toMarkdown(r, b, c);
    const mdMs = Number(process.hrtime.bigint() - t0) / 1e6;
    t0 = process.hrtime.bigint();
    const json = Export.serializeJson(r, b, c);
    const jsonMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const mdBytes = Buffer.byteLength(md, 'utf8');
    const jsonBytes = Buffer.byteLength(json, 'utf8');
    t.diagnostic(mode + ': markdown ' + mdBytes + ' bytes ' + mdMs.toFixed(1) + ' ms / json ' + jsonBytes + ' bytes ' +
      jsonMs.toFixed(1) + ' ms（2000 ケース・詳細 50・比較 1）');
    assert.equal(mdBytes <= MAX && jsonBytes <= MAX, true);
    // 全行・全詳細・比較が省略されていない
    assertMarkdownMatches(md, r);
    const parsed = JSON.parse(json);
    // 大きな object の差分を assert に作らせない（一致しなければ明示的に失敗する）
    assert.equal(JSON.stringify(parsed.review) === JSON.stringify(r), true, mode + ': JSON の review が発行された review と同じ');
    assert.equal(parsed.review.rows.length, 2000);
    assert.equal(parsed.review.selectedDetails.length, 50);
    // grouping の caseId はすべて（Markdown にも JSON にも）
    const total = (groups) => groups.reduce((n, g) => n + g.count, 0);
    assert.equal(total(r.groups.byRecommended), 2000);
    assert.equal(tableUnder(md, '### 推奨候補の構成別').rows.reduce((n, row) => n + row[2].split(', ').length, 0), 2000);
  }
});

test('P2L-S3B3B2C1A-X14: 8 MiB（UTF-8）は hard 上限。超えたら切り詰めず、一部も返さずに固定文で失敗する', () => {
  assert.equal(Export.MAX_OUTPUT_BYTES, 8388608);
  assert.match(EXPORT_CODE, /if \(utf8Length\(text\) > MAX_OUTPUT_BYTES\) \{\n\s+fail\(what, 'output exceeds ' \+ MAX_OUTPUT_BYTES \+ ' bytes \(not truncated\)'\);/);
  const pack = rawPack('notification1458');
  pack.projectMetadata.publicLabel = '合成 😀 Synthetic';   // 2・3・4 byte の文字を含む
  const { c, b } = fromPack(pack);
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G002'], comparisonCaseIds: ['G001', 'G002'] });
  const md = Export.toMarkdown(r, b, c);
  const json = Export.serializeJson(r, b, c);
  const mdBytes = Buffer.byteLength(md, 'utf8');
  const jsonBytes = Buffer.byteLength(json, 'utf8');
  assert.equal(mdBytes > md.length && jsonBytes > json.length, true, '前提: 多 byte の文字を含む');
  // ちょうど上限なら通る（数え方は UTF-8 の byte 数）
  assert.equal(exportWithCap(mdBytes).toMarkdown(r, b, c), md);
  assert.equal(exportWithCap(jsonBytes).serializeJson(r, b, c), json);
  // 1 byte でも超えたら失敗し、何も返さない
  const small = exportWithCap(mdBytes - 1);
  let out = 'none';
  try { out = small.toMarkdown(r, b, c); } catch (e) { assert.equal(e.message, MSG.mdCap(mdBytes - 1)); }
  assert.equal(out, 'none');
  const smallJson = exportWithCap(jsonBytes - 1);
  out = 'none';
  try { out = smallJson.serializeJson(r, b, c); } catch (e) { assert.equal(e.message, MSG.jsonCap(jsonBytes - 1)); }
  assert.equal(out, 'none');
  // 上限は出力ごと: 小さい方の大きさを上限にすると、小さい方は書け、大きい方だけが失敗する
  assert.notEqual(mdBytes, jsonBytes, '前提: 大きさが違う');
  const lo = Math.min(mdBytes, jsonBytes);
  const mid = exportWithCap(lo);
  if (mdBytes < jsonBytes) {
    assert.equal(mid.toMarkdown(r, b, c), md);
    assert.throws(() => mid.serializeJson(r, b, c), { message: MSG.jsonCap(lo) });
  } else {
    assert.equal(mid.serializeJson(r, b, c), json);
    assert.throws(() => mid.toMarkdown(r, b, c), { message: MSG.mdCap(lo) });
  }
});

/* ============================================================
   X15–X18: 例外の文面・一方向・依存と純粋さ・privacy
============================================================ */

test('P2L-S3B3B2C1A-X15: 例外の文面は固定（入力値・caseId・内部の例外を含めない）', () => {
  const SECRET = 'G9 Synthetic SECRET {"x":1} 1685';
  const pack = rawPack('notification1458');
  pack.projectMetadata.publicLabel = 'SECRET label {"x":1}';
  const { c, b } = fromPack(pack);
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G002'] });
  const messages = [];
  const capture = (fn) => { try { fn(); messages.push('no throw'); } catch (e) { messages.push(e.message); } };
  capture(() => Export.toMarkdown(r, Batch.executeAll(c), c));
  capture(() => Export.serializeJson(r, b, ctx('notification1458')));
  capture(() => Export.toMarkdown(plain(r), b, c));
  capture(() => Export.toMarkdown({ publicLabel: SECRET }, b, c));
  capture(() => Export.serializeJson(SECRET, SECRET, SECRET));
  // 書き出しの途中の失敗（依存を差し替えた instance に、壊れた値を入れた object を渡す）
  const X = stubExport();
  const forged = plain(r);
  forged.rows[0].widthMm = NaN;
  forged.rows[1].caseId = SECRET;
  capture(() => X.toMarkdown(forged, null, null));
  const forged2 = plain(r);
  forged2.selectedDetails[0].candidateSummary[0].status = 'verified';
  capture(() => X.toMarkdown(forged2, null, null));
  const forged3 = plain(r);
  Object.defineProperty(forged3.rows[0], 'secret', { get() { throw new Error(SECRET); }, enumerable: true });
  capture(() => X.serializeJson(forged3, null, null));
  const forged4 = plain(r);
  forged4.rows[0].okCount = undefined;
  capture(() => X.serializeJson(forged4, null, null));
  capture(() => exportWithCap(10).toMarkdown(r, b, c));
  assert.deepEqual(messages, [MSG.origin, MSG.origin, MSG.origin, MSG.origin, MSG.origin, MSG.mdBroken, MSG.mdBroken,
    MSG.jsonBroken, MSG.jsonBroken, MSG.mdCap(10)]);
  // 静的: 例外の中身を文面に繋げない
  assert.equal(/e\.message|e\.stack|\+ e\b|String\(e\)|JSON\.stringify\(e\)/.test(EXPORT_CODE), false);
  // 依存の review module が無い・trust / 版が違うときも固定文
  assert.throws(() => loadExport({}).ProjectPackReviewExport.toMarkdown(r, b, c),
    { message: 'project-pack-review-export.js: project-config/project-pack-review.js is required but not available (it was not loaded when this module was initialised)' });
  assert.throws(() => loadExport({ ProjectPackReview: Object.assign({}, Review, { TRUST: 'verified' }) }).ProjectPackReviewExport.serializeJson(r, b, c),
    { message: 'project-pack-review-export.js: ProjectPackReview trust is not pack_unreviewed' });
  assert.throws(() => loadExport({ ProjectPackReview: Object.assign({}, Review, { SCHEMA_VERSION: 2 }) }).ProjectPackReviewExport.toMarkdown(r, b, c),
    { message: 'project-pack-review-export.js: ProjectPackReview is not glass_wind_pack_review schemaVersion 1' });
  assert.throws(() => loadExport({ ProjectPackReview: Object.assign({}, Review, { assertReviewOrigin: undefined }) }).ProjectPackReviewExport.toMarkdown(r, b, c),
    /ProjectPackReview trust is not pack_unreviewed/);
});

test('P2L-S3B3B2C1A-X16: 出力は計算・review の入力にならない（取り込み口が無く、既存の取り込み経路も受け付けない）', () => {
  const { c, b } = genuine('project_pressure_map');
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G001'] });
  const json = Export.serializeJson(r, b, c);
  const md = Export.toMarkdown(r, b, c);
  const parsed = JSON.parse(json);
  // review として通らない（JSON の review は発行物ではない）
  assert.throws(() => Review.assertPackReview(parsed.review), { message: MSG.reviewNotIssued });
  assert.throws(() => Export.toMarkdown(parsed.review, b, c), { message: MSG.origin });
  assert.throws(() => Export.serializeJson(parsed, b, c), { message: MSG.origin });
  assert.throws(() => Review.buildPackReview(parsed.review, c), /was not issued by ProjectPackBatch/);
  assert.throws(() => Review.buildPackReview(parsed, c), /was not issued by ProjectPackBatch/);
  // 入力 package・Project Pack・Workspace
  assert.throws(() => ProjectInput.deserialize(json), Error);
  assert.throws(() => ProjectInput.deserialize(md), Error);
  assert.throws(() => Pack.validateProjectPack(parsed), Error);
  assert.throws(() => Pack.validateProjectPack(parsed.review), Error);
  assert.throws(() => WorkspaceCore.deserializeWorkspace(json), Error);
  assert.throws(() => WorkspaceCore.deserializeWorkspace(md), Error);
  assert.throws(() => WorkspaceCore.parseTsv(md), Error);
  assert.equal(Object.keys(ReviewPackage).some((k) => /import|deserial|load|parse/i.test(k)), false);
  // この module は文字列を読まない（逆向きの処理が無い）
  ['JSON.parse', 'deserialize', 'fromJson', 'fromMarkdown', 'parseMarkdown', 'import('].forEach((token) =>
    assert.equal(EXPORT_CODE.includes(token), false, token));
});

test('P2L-S3B3B2C1A-X17: 依存は初期化時の ProjectPackReview だけ。計算・Workspace・DOM・保存・通信に触れず、入力を書き換えない', () => {
  const touched = [];
  const spy = (name) => new Proxy(function () {}, {
    get(_t, k) { touched.push(name + '.' + String(k)); return spy(name + '.' + String(k)); },
    apply() { touched.push(name + '()'); return undefined; },
    has(_t, k) { touched.push(name + ' has ' + String(k)); return false; },
    set(_t, k) { touched.push(name + ' set ' + String(k)); return true; }
  });
  const sb = loadExport({ ProjectPackReview: Review, ProjectPackBatch: spy('ProjectPackBatch'),
    ProjectPackExecution: spy('ProjectPackExecution'), ProjectPackReport: spy('ProjectPackReport'),
    WorkspaceCore: spy('WorkspaceCore'), ReviewPackage: spy('ReviewPackage'), WindPressure: spy('WindPressure'),
    GlassCalc: spy('GlassCalc'), ProjectInput: spy('ProjectInput'), ProjectContext: spy('ProjectContext'),
    document: spy('document'), window: spy('window'), localStorage: spy('localStorage'), sessionStorage: spy('sessionStorage'),
    fetch: spy('fetch'), navigator: spy('navigator'), console: spy('console') });
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    const before = [JSON.stringify(r), JSON.stringify(b), JSON.stringify(c)];
    assert.equal(sb.ProjectPackReviewExport.toMarkdown(r, b, c), Export.toMarkdown(r, b, c));
    assert.equal(sb.ProjectPackReviewExport.serializeJson(r, b, c), Export.serializeJson(r, b, c));
    assert.deepEqual([JSON.stringify(r), JSON.stringify(b), JSON.stringify(c)], before, mode + ': 入力を書き換えない');
  }
  assert.deepEqual(touched, []);
  ['WindPressure', 'GlassCalc', 'calculateWindPressure', 'generateCandidates', 'ProjectPackBatch', 'ProjectPackExecution',
    'executeCase', 'executeAll', 'buildPackReview', 'ProjectPackReport', 'WorkspaceCore', 'ReviewPackage', 'ProjectInput',
    'ProjectContext', 'activeProjectContext', 'document', 'window', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch(',
    'XMLHttpRequest', 'sendBeacon', 'console.', 'setTimeout', 'Blob', 'createObjectURL', 'clipboard', 'download', 'innerHTML']
    .forEach((token) => assert.equal(EXPORT_CODE.includes(token), false, 'export module が ' + token + ' を使っている'));
  // 依存は初期化時の 1 か所だけ。gate は assertReviewOrigin（各関数の最初に 1 回）
  assert.equal((EXPORT_CODE.match(/captureDependency\('/g) || []).length, 1);
  assert.equal((EXPORT_CODE.match(/global\[/g) || []).length, 2, 'captureDependency の 1 行だけ');
  assert.equal((EXPORT_CODE.match(/R\.assertReviewOrigin\(/g) || []).length, 1);
  ['function toMarkdown(', 'function serializeJson('].forEach((fn) => {
    const body = EXPORT_CODE.slice(EXPORT_CODE.indexOf(fn));
    assert.equal(body.indexOf('gate(review, batchResult, ctx);') < body.indexOf('try {'), true, fn + ' は最初に gate');
  });
  // 初期化の後に global を差し替えても、掴んだ依存を使い続ける
  const late = loadExport({ ProjectPackReview: Review });
  let decoyCalls = 0;
  late.ProjectPackReview = Object.assign({}, Review, { assertReviewOrigin: () => { decoyCalls++; return true; } });
  const { c, b } = genuine('case_direct');
  const r = Review.buildPackReview(b, c);
  assert.throws(() => late.ProjectPackReviewExport.toMarkdown(plain(r), b, c), { message: MSG.origin });
  assert.equal(late.ProjectPackReviewExport.serializeJson(r, b, c), Export.serializeJson(r, b, c));
  assert.equal(decoyCalls, 0);
  // 初期化時に無ければ、後から現れた本物も使わない（読み込み自体は失敗しない）
  const empty = loadExport({});
  empty.ProjectPackReview = Review;
  assert.throws(() => empty.ProjectPackReviewExport.serializeJson(r, b, c), /project-pack-review\.js is required but not available/);
  // C1-A は pure module だけ。index.html にはまだ読み込まない（画面への接続は C1-B）
  assert.equal(read('index.html').includes('project-pack-review-export'), false);
});

test('P2L-S3B3B2C1A-X18: privacy（出典の申告・context・Pack の痕跡・計算の途中値を出さない）', () => {
  const forbiddenKeys = /^(verified|approved|reviewed|attested|attestation|canonicalEvidence|verifiedCases|promotion|promotionCandidate|closure|sourceClaim|claimedLevel|evidence|records|sourceScopes|sourceScopeId|candidates|detail|notificationTrace|trace|provenance|formulaSource|windConditions|glazingCases|panes|pressureModel|context|projectContext|packType|packageType|workspaceType|governing|governingCase|dominantCase)$/i;
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const pack = rawPack(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    const json = Export.serializeJson(r, b, c);
    const md = Export.toMarkdown(r, b, c);
    const walk = (node, at) => {
      if (node && typeof node === 'object') {
        if (!Array.isArray(node)) Object.keys(node).forEach((k) => assert.equal(forbiddenKeys.test(k), false, at + '.' + k));
        Object.keys(node).forEach((k) => walk(node[k], at + '.' + k));
      }
      if (typeof node === 'string') {
        assert.equal(/https?:|:\/\/|[\\]|\/home|\/Users|C:|sharepoint|notion|\.pdf|@/i.test(node), false, at + ' ' + node);
      }
    };
    walk(JSON.parse(json), '$');
    pack.evidence.sourceScopes.forEach((s) => {
      assert.equal(json.includes(s.sourceClaim.publicDescription), false);
      assert.equal(md.includes(s.sourceClaim.publicDescription), false);
    });
    assert.equal(/k1_outer|k2_inner|rawRatio|adopted_side|wouldPass|t_total|t_max|sourceScopeId|claimedLevel/.test(json + md), false);
    assert.equal(/https?:|sharepoint|notion|\.pdf/i.test(md), false);
  }
});

/* ============================================================
   C1A-G0-RF-01: G0 の契約との整合（X19 JSON の外枠・X20 固定の注意 4 件・X21 Markdown の表示の桁）
============================================================ */

test('P2L-S3B3B2C1A-X19: JSON の外枠は G0 の契約（exportSchemaVersion・notices 4 件・key の順）。review の中身・発行元の検査・-0 は変えない', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    const json = Export.serializeJson(r, b, c);
    const parsed = JSON.parse(json);
    // 旧（3c08ecc）からの差分: exportVersion → exportSchemaVersion、notices を interpretation と review の間に追加
    assert.deepEqual(Object.keys(parsed), ENVELOPE_KEYS);
    assert.equal(hasOwn(parsed, 'exportVersion'), false);
    assert.equal(parsed.exportSchemaVersion, 1);
    assert.deepEqual(parsed.notices, NOTICES);
    assert.deepEqual(json.split('\n').slice(0, 8), ['{', '  "exportType": "glass_wind_pack_review_export",',
      '  "exportSchemaVersion": 1,', '  "sourceKind": "project_pack_unreviewed",', '  "trust": "pack_unreviewed",',
      '  "interpretation": "calculated_not_verified",', '  "notices": [', '    ' + JSON.stringify(NOTICES[0]) + ',']);
    // review の中身・key の順・値は変わらない（外枠だけが変わった）
    assert.equal(JSON.stringify(parsed.review) === JSON.stringify(r), true, mode + ': review の中身');
    // 発行元の検査は保たれる
    assert.throws(() => Export.serializeJson(r, Batch.executeAll(c), c), { message: MSG.origin });
    assert.throws(() => Export.serializeJson(r, b, ctx(mode)), { message: MSG.origin });
  }
  // 標準の JSON.stringify との差は -0 だけ: JSON.stringify は 0 と書き、この module は -0 と書く（JSON.parse で -0 に戻る）
  const X = stubExport();
  const { c, b } = genuine('case_direct');
  const forged = plain(Review.buildPackReview(b, c));
  forged.rows[0].marginPressure = -0;
  const out = X.serializeJson(forged, null, null);
  const std = JSON.stringify({ exportType: 'glass_wind_pack_review_export', exportSchemaVersion: 1,
    sourceKind: 'project_pack_unreviewed', trust: 'pack_unreviewed', interpretation: 'calculated_not_verified',
    notices: NOTICES, review: forged }, null, 2) + '\n';
  assert.equal(out.split('"marginPressure": -0').length - 1, 1, '前提: -0 は 1 か所');
  assert.notEqual(out, std);
  assert.equal(out.replace('"marginPressure": -0', '"marginPressure": 0'), std);
  assert.equal(Object.is(JSON.parse(out).review.rows[0].marginPressure, -0), true);
});

test('P2L-S3B3B2C1A-X20: 固定の注意 4 件（JSON の notices と Markdown の冒頭が同じ文面・同じ順。review の値に依存しない）', () => {
  // 4 件が示すこと: 未レビュー・計算済み ≠ 検証済み・OK の限定的な意味・正式な承認資料ではない
  assert.equal(NOTICES.length, 4);
  assert.match(NOTICES[0], /^未レビュー：.*pack_unreviewed/);
  assert.match(NOTICES[1], /^計算済み ≠ 検証済み：.*calculated_not_verified/);
  assert.match(NOTICES[2], /^OK は計算上の候補判定です。.*承認ではありません/);
  assert.match(NOTICES[3], /^正式な案件承認の資料ではありません。/);
  const X = stubExport();
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c, fullOptions(b));
    assert.deepEqual(JSON.parse(Export.serializeJson(r, b, c)).notices, NOTICES, mode + ': JSON');
    const md = Export.toMarkdown(r, b, c);
    const quoted = md.split('\n').filter((line) => line.startsWith('> - ')).slice(0, 4).map((line) => decode(line.slice(4)));
    assert.deepEqual(quoted, NOTICES, mode + ': Markdown（JSON と同じ文面・順）');
    // review の文字列を敵対的にしても、notices と Markdown の冒頭は変わらない
    const adversarial = mapStrings(plain(r), (s, i) => ADVERSARIAL[i % ADVERSARIAL.length]);
    assert.deepEqual(JSON.parse(X.serializeJson(adversarial, null, null)).notices, NOTICES);
    assert.deepEqual(X.toMarkdown(adversarial, null, null).split('\n').slice(0, 12), md.split('\n').slice(0, 12));
  }
  // 静的: notices は module の中の 4 件の literal（凍結）で、review の値から作らない
  assert.match(EXPORT_CODE, /var NOTICES = Object\.freeze\(\[\n(\s+'[^'\n]+',?\n){4}\s+\]\);/);
  assert.match(EXPORT_CODE, /notices: NOTICES\.slice\(\),/);
});

test('P2L-S3B3B2C1A-X21: Markdown の数値は画面と同じ表示の桁（風圧・余裕差 1 桁・余裕比 3 桁・差は + 付き・null は「—」）。丸めは表示だけで全桁は JSON', () => {
  const { c, b } = genuine('notification1458');
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G002'], comparisonCaseIds: ['G001', 'G003'] });
  const md = Export.toMarkdown(r, b, c);
  const json = Export.serializeJson(r, b, c);
  // G002 の行（固定値: 設計風圧 1685.04324816824・負圧 -1409.5342125273235・P 3543.183090705487・
  // 余裕比 2.1027253125741283・余裕差 1858.1398425372467。評価高さ・寸法は review の値のまま）
  const row = tableUnder(md, '## ケース一覧（全 3 ケース）').rows.find((x) => x[0] === 'G002');
  assert.deepEqual(row, ['G002', 'P002', '3', 'corner', 'lowe_fl', '760', '1880', '1685.0', 'pack_notification_calculation',
    '10.2', '1685.0', '-1409.5', 'Low-E5 + A + FL5', '3543.2', '43', '0', '6', '2.103', '1858.1']);
  ['1685.04324816824', '-1409.5342125273235', '3543.183090705487', '2.1027253125741283', '1858.1398425372467']
    .forEach((v) => {
      assert.equal(json.includes(v), true, 'JSON は全桁: ' + v);
      assert.equal(md.includes(v.replace('-', '\\-')) || md.includes(v), false, 'Markdown は丸めた表示: ' + v);
    });
  // 詳細と候補の一覧も同じ桁
  const detail = tableUnder(md, '### 詳細 1：ケース G002').rows;
  assert.deepEqual(detail.filter((x) => /^(設計風圧|正圧|負圧・符号付き|許容風圧|余裕比|余裕差|評価高さ|面積|告示外)/.test(x[0])).map((x) => x[1]),
    ['1', '1.4288', '1685.0', '10.2', '1685.0', '-1409.5', '3543.2', '2.103', '1858.1']);
  assert.deepEqual(tableUnder(md, '#### 候補の一覧（49 件）').rows[0], ['Low-E5 + A + FL5', '3543.2', 'OK（計算上の候補判定）']);
  // 集計（最大設計風圧 1 桁・最小余裕比 3 桁）
  assert.deepEqual(tableUnder(md, '## 集計', 1).rows.map((x) => x[1]), ['1833.1', '1.015']);
  // 比較: A G001 / B G003。正の差は +、寸法の差は整数、評価高さの差は 3 桁、0 の差に + を付けない
  const cmp = tableUnder(md, '## 2 ケースの比較').rows;
  const at = (label) => cmp.find((x) => x[0] === label).slice(1);
  assert.deepEqual(at('幅 W（mm）'), ['1020', '1020', '0']);
  assert.deepEqual(at('設計風圧（N/m²）'), ['1454.7', '1833.1', '+378.4']);
  assert.deepEqual(at('評価高さ（m）'), ['3.4', '16.1', '+12.700']);
  assert.deepEqual(at('負圧・符号付き（N/m²）'), ['-1153.3', '-1153.3', '0.0']);
  assert.deepEqual(at('許容風圧（N/m²）'), ['1477.2', '2215.7', '+738.6']);
  assert.deepEqual(at('余裕比'), ['1.015', '1.209', '+0.193']);
  assert.deepEqual(at('余裕差（N/m²）'), ['22.5', '382.6', '+360.2']);
  // 丸めの注記
  assert.equal(md.split('\n')[11], ROUNDING_NOTE);
  // 丸めは表示だけ: 差は review の差を丸める（丸めた A・B から計算し直さない）。負の差は - のまま、null は「—」
  const X = stubExport();
  const forged = plain(r);
  forged.comparison.a.designPressure = 1.04;
  forged.comparison.b.designPressure = 1.16;
  forged.comparison.difference.designPressure = 0.12;   // 丸めた A（1.0）・B（1.2）の差なら +0.2 になる
  forged.comparison.difference.widthMm = -10;
  forged.comparison.difference.allowablePressure = null;
  forged.rows[0].bestCandidate = null;
  forged.rows[0].marginRatio = null;
  forged.rows[0].marginPressure = null;
  forged.summary.minMarginRatio = null;
  const fmd = X.toMarkdown(forged, null, null);
  const fc = tableUnder(fmd, '## 2 ケースの比較').rows;
  const fat = (label) => fc.find((x) => x[0] === label).slice(1);
  assert.deepEqual(fat('設計風圧（N/m²）'), ['1.0', '1.2', '+0.1']);
  assert.equal(fat('幅 W（mm）')[2], '-10');
  assert.equal(fat('許容風圧（N/m²）')[2], '—（片方に値なし）');
  const frow = tableUnder(fmd, '## ケース一覧（全 3 ケース）').rows[0];
  assert.deepEqual(frow.slice(12, 14).concat(frow.slice(17)), ['—（推奨候補なし）', '—', '—', '—'], 'null は 0 にしない');
  assert.equal(tableUnder(fmd, '## 集計', 1).rows[1][1], '—（推奨候補のあるケースなし）');
  // 表示の丸めは初期化時に掴んだ toFixed（後から Number.prototype を差し替えても表示は変わらない）
  const sb = loadExport({ ProjectPackReview: Review });
  const before = sb.ProjectPackReviewExport.toMarkdown(r, b, c);
  vm.runInContext('Number.prototype.toFixed = function () { return "TAMPERED"; };', sb);
  assert.equal(sb.ProjectPackReviewExport.toMarkdown(r, b, c), before);
  assert.equal(before, md);
  // 静的: 表示の丸めは toFixed だけで、値を計算し直す関数を使わない
  ['Math.round', 'Math.trunc', 'Math.ceil', 'toPrecision', 'parseFloat', 'Number('].forEach((token) =>
    assert.equal(EXPORT_CODE.includes(token), false, token));
  assert.equal((EXPORT_CODE.match(/toFixed\.call\(/g) || []).length, 1);
});
