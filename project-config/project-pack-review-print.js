/**
 * project-config/project-pack-review-print.js
 *
 * Project Pack Review Print Model（S3-B3B2-C2）。案件非依存の pure module。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * ProjectPackReview が発行した review を、印刷用の DOM を組むための model（見出し・段落・表のセルの文字列だけ）にする:
 *
 *   ProjectPackReview.assertReviewOrigin(review, batch, ctx)   … 発行物で、batch と ctx（どちらも同じ instance）
 *                                                                から発行された review だけを通す（最初の gate）
 *     → buildPrintModel()   … 全ケースの行・全グループ・選んだケースの詳細・比較を、省略せずに block の並びにする
 *
 * 計算はしない（review の値を写すだけ）。印刷の可否（画面でいまの review か、印刷 session の状態）はこの module では
 * 決めない（呼び出し側の Print Gate の責務。D-1〜D-9）。model を DOM にするのは呼び出し側で、createElement と
 * textContent だけを使う（model の文字列を HTML として解釈しない）。
 *
 * ── trust ────────────────────────────────────────────────
 *
 * sourceKind = project_pack_unreviewed・trust = pack_unreviewed・interpretation = calculated_not_verified で固定する。
 * 固定の注意 4 件（NOTICES）は C1-A の出力（project-pack-review-export.js）と同じ文面・同じ順で、冒頭に書く。
 * 各ページの余白の注意（FOOTER_TEXT）は印刷の CSS が全ページに出す。OK は計算上の候補判定で、検証・承認ではない。
 *
 * ── 文字と数値（C1-A と同じ規則） ─────────────────────────
 *
 *   - review の文字列はすべて safePrintableText() を通す。制御文字・不可視の書式文字・双方向の制御文字・異体字
 *     セレクタ・タグ文字・孤立したサロゲート・非文字（INVISIBLE_RANGES）は ⟨U+XXXX⟩ の形で見えるようにし、@ は全角の
 *     ＠ にする（C1-A の Markdown と同じ。媒体で意味を変えない）。元の文字には戻さない（非可逆）。Unicode の正規化は
 *     しない。Markdown の \ の escape は付けない（印刷は Markdown ではない）。
 *   - 数値は画面（S3-B3B2-B3）・C1-A と同じ表示の桁: 風圧と余裕差は小数 1 桁、余裕比は小数 3 桁（toFixed）。寸法・
 *     評価高さ・面積・係数は review の値のまま（-0 は -0）。比較の差は寸法 0 桁・評価高さ 3 桁・風圧 1 桁で、正なら +。
 *     null は「—」（0 にしない）。丸めは表示だけで、値を計算し直さない。
 *
 * ── 上限（資源保護。超えたら切り詰めず、何も返さずに失敗する） ──────────────
 *
 *   MAX_CASE_ROWS（2000。Project Pack の上限）・MAX_DETAILS（50。Review の上限）・MAX_TEXT_BYTES（model の文字列の
 *   UTF-8 の合計 8 MiB）・MAX_ELEMENTS（印刷用 DOM の element の数 60,000。text node は数えない）。element の数は
 *   呼び出し側が組む DOM と同じ数え方（elementCountOf）で model に記録する。
 *
 * ── 依存 ─────────────────────────────────────────────────
 *
 * 依存は ProjectPackReview だけで、この module の初期化時に 1 度だけ掴む（後から global を読み直さない。初期化時に
 * 無ければ null を持ち、呼び出しが fail closed になる）。DOM・storage・network・console に触れない。例外の文面は
 * 固定で、入力値・caseId・内部の例外の文面を含めない。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして提供する（<script src> と
 * require() の両対応）。ブラウザでは project-config/project-pack-review.js の後に読み込むこと。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectPackReviewPrint = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  // ============================================================
  // Contract
  // ============================================================

  var MODEL_TYPE = 'glass_wind_pack_review_print';
  var MODEL_SCHEMA_VERSION = 1;
  var SOURCE_KIND = 'project_pack_unreviewed';
  var TRUST = 'pack_unreviewed';
  var INTERPRETATION = 'calculated_not_verified';
  var MAX_CASE_ROWS = 2000;
  var MAX_DETAILS = 50;
  var MAX_TEXT_BYTES = 8 * 1024 * 1024;
  var MAX_ELEMENTS = 60000;

  /** 固定の注意 4 件（C1-A の NOTICES と同じ文面・同じ順。review の値から作らない）。 */
  var NOTICES = Object.freeze([
    '未レビュー：この出力は、未レビュー（pack_unreviewed）の Project Pack から計算した結果です。',
    '計算済み ≠ 検証済み：値は計算したもので、検証されたものではありません（calculated_not_verified）。',
    'OK は計算上の候補判定です。Evidence の確認・安全性の判定・承認ではありません。',
    '正式な案件承認の資料ではありません。値は案件の出典資料・メーカー資料と照合してください。'
  ]);
  /** 固定の注意に続く 2 件（C1-A の Markdown の冒頭と同じ）。 */
  var MORE_NOTICES = Object.freeze([
    '余裕比・余裕差は確認用の指標で、安全性の判定・承認ではありません。',
    'この文書は Project Pack・入力 package・Workspace の入力として読み込むものではありません。'
  ]);
  var TITLE = 'Pack Review（未レビュー）';
  var TRUST_LINE = '未レビュー（' + TRUST + '）・計算済み ≠ 検証済み（' + INTERPRETATION + '）';
  var CLOSING = TRUST_LINE + '。正式な案件承認の資料ではありません。';
  /** 各ページの余白に出す注意（印刷の CSS の @page と同じ文面。CSS は model を読めないので test で一致を確かめる）。 */
  var FOOTER_TEXT = 'pack_unreviewed ／ calculated_not_verified — 未レビュー・計算済み ≠ 検証済み・正式な案件承認の資料ではありません';
  var SHARE_NOTE = 'この資料にはガラス寸法・設計風圧などの案件入力値が含まれます。外部へ共有する場合は、内容と共有先を確認して' +
    'ください。publication advisory が 0 件でも公開安全の証明にはなりません。';

  var REVIEW_TYPE = 'glass_wind_pack_review';
  var REVIEW_SCHEMA_VERSION = 1;

  var MODE_NOTIFICATION = 'notification1458';
  var MODE_PRESSURE_MAP = 'project_pressure_map';
  var MODE_CASE_DIRECT = 'case_direct';
  var MODE_PRESSURE_FIELDS = {};
  MODE_PRESSURE_FIELDS[MODE_NOTIFICATION] = ['evaluationHeightM', 'positivePressure', 'negativePressure'];
  MODE_PRESSURE_FIELDS[MODE_PRESSURE_MAP] = ['positivePressure', 'negativePressureMagnitude'];
  MODE_PRESSURE_FIELDS[MODE_CASE_DIRECT] = [];
  var PRESSURE_FIELD_LABELS = {
    evaluationHeightM: ['評価高さ', 'height'],
    positivePressure: ['正圧', 'pressure'],
    negativePressure: ['負圧・符号付き', 'pressure'],
    negativePressureMagnitude: ['負圧の大きさ', 'pressure']
  };
  var DIGITS_PRESSURE = 1;
  var DIGITS_RATIO = 3;
  var DIGITS_LENGTH_DIFFERENCE = 0;
  var DIGITS_HEIGHT_DIFFERENCE = 3;
  var ROUNDING_NOTE = '数値の表示：風圧（設計風圧・正圧・負圧・許容風圧）と余裕差は小数 ' + DIGITS_PRESSURE + ' 桁、余裕比は小数 ' +
    DIGITS_RATIO + ' 桁に丸めて表示しています（画面と同じ。寸法・評価高さ・面積・係数・件数は review の値のまま）。比較の差も' +
    '同じ桁で、寸法の差は整数、評価高さの差は小数 ' + DIGITS_HEIGHT_DIFFERENCE + ' 桁です。丸めは表示だけで、計算・照合・差は' +
    '丸めない値で行っています。全桁の値は JSON 出力にあります。';
  var toFixed = Number.prototype.toFixed;
  var STATUS_LABELS = { ok: 'OK（計算上の候補判定）', ng: 'NG', out_of_scope: '適用範囲外' };

  /** ⟨U+XXXX⟩ と書いて見えるようにする code point（両端を含む。C1-A の INVISIBLE_RANGES と同じ）。 */
  var INVISIBLE_RANGES = [
    [0x0000, 0x001F], [0x007F, 0x009F], [0x00AD, 0x00AD], [0x034F, 0x034F], [0x0600, 0x0605], [0x061C, 0x061C],
    [0x06DD, 0x06DD], [0x070F, 0x070F], [0x0890, 0x0891], [0x08E2, 0x08E2], [0x115F, 0x1160], [0x17B4, 0x17B5],
    [0x180B, 0x180F], [0x200B, 0x200F], [0x2028, 0x202E], [0x2060, 0x206F], [0x2800, 0x2800], [0x3164, 0x3164],
    [0xD800, 0xDFFF], [0xFDD0, 0xFDEF], [0xFE00, 0xFE0F], [0xFEFF, 0xFEFF], [0xFFA0, 0xFFA0], [0xFFF0, 0xFFFB],
    [0x110BD, 0x110BD], [0x110CD, 0x110CD], [0x13430, 0x1343F], [0x1BCA0, 0x1BCA3], [0x1D173, 0x1D17A],
    [0xE0000, 0xE007F], [0xE0100, 0xE01EF]
  ];

  // ============================================================
  // dependency（初期化時に 1 度だけ掴む）
  // ============================================================

  function captureDependency(globalName, requirePath) {
    try {
      if (global && global[globalName]) return global[globalName];
    } catch (e) {
      return null;
    }
    if (typeof require === 'function') {
      try {
        return require(requirePath);
      } catch (e) {
        /* unavailable */
      }
    }
    return null;
  }

  var CAPTURED_REVIEW = captureDependency('ProjectPackReview', './project-pack-review.js');
  var Review = null;

  function requireReview() {
    if (Review) return Review;
    if (!CAPTURED_REVIEW) {
      throw new Error('project-pack-review-print.js: project-config/project-pack-review.js is required but not available ' +
        '(it was not loaded when this module was initialised)');
    }
    if (CAPTURED_REVIEW.TRUST !== TRUST || CAPTURED_REVIEW.SOURCE_KIND !== SOURCE_KIND ||
        CAPTURED_REVIEW.INTERPRETATION !== INTERPRETATION || typeof CAPTURED_REVIEW.assertReviewOrigin !== 'function') {
      throw new Error('project-pack-review-print.js: ProjectPackReview trust is not ' + TRUST);
    }
    if (CAPTURED_REVIEW.REVIEW_TYPE !== REVIEW_TYPE || CAPTURED_REVIEW.SCHEMA_VERSION !== REVIEW_SCHEMA_VERSION) {
      throw new Error('project-pack-review-print.js: ProjectPackReview is not ' + REVIEW_TYPE + ' schemaVersion ' +
        REVIEW_SCHEMA_VERSION);
    }
    Review = CAPTURED_REVIEW;
    return Review;
  }

  // ============================================================
  // helpers
  // ============================================================

  function fail(where, message) {
    throw new Error('ProjectPackReviewPrint: ' + where + ': ' + message);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function deepFreeze(value) {
    if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (k) { deepFreeze(value[k]); });
    }
    return value;
  }

  /** model を作る途中の検査（この関数の例外は外へ出る前に固定文へ置き換えられる）。 */
  function broken() {
    throw new TypeError('unexpected value');
  }

  /** UTF-8 の byte 数（孤立したサロゲートは U+FFFD と同じ 3 byte と数える）。 */
  function utf8Length(text) {
    var n = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) {
        n += 1;
      } else if (c < 0x800) {
        n += 2;
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length &&
          text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) {
        n += 4;
        i += 1;
      } else {
        n += 3;
      }
    }
    return n;
  }

  function gate(review, batchResult, ctx) {
    var R = requireReview();
    try {
      R.assertReviewOrigin(review, batchResult, ctx);
    } catch (e) {
      fail('review', 'is not an issued Pack review of the given batch result and context');
    }
    if (review.reviewType !== REVIEW_TYPE || review.schemaVersion !== REVIEW_SCHEMA_VERSION ||
        review.sourceKind !== SOURCE_KIND || review.trust !== TRUST || review.interpretation !== INTERPRETATION) {
      fail('review', 'is not a ' + TRUST + ' review of schemaVersion ' + REVIEW_SCHEMA_VERSION);
    }
    if (!Array.isArray(review.rows) || review.rows.length > MAX_CASE_ROWS ||
        !Array.isArray(review.selectedDetails) || review.selectedDetails.length > MAX_DETAILS) {
      fail('review', 'exceeds ' + MAX_CASE_ROWS + ' cases or ' + MAX_DETAILS + ' details (not truncated)');
    }
  }

  // ============================================================
  // 文字と数値（C1-A と同じ規則。Markdown の \ の escape だけを付けない）
  // ============================================================

  function isInvisible(cp) {
    if ((cp & 0xFFFE) === 0xFFFE) return true;
    for (var i = 0; i < INVISIBLE_RANGES.length; i++) {
      if (cp >= INVISIBLE_RANGES[i][0] && cp <= INVISIBLE_RANGES[i][1]) return true;
    }
    return false;
  }

  function visibleToken(cp) {
    var hex = cp.toString(16).toUpperCase();
    while (hex.length < 4) hex = '0' + hex;
    return '⟨U+' + hex + '⟩';
  }

  /**
   * review の文字列を印刷に置ける形にする（すべての文字列がこの 1 つの関数を通る）。不可視の文字は ⟨U+XXXX⟩ にし
   * （改行・タブも含む。値が見た目の行や段落を増やさない）、@ は全角の ＠ にする。それ以外の文字はそのまま。
   */
  function safePrintableText(text) {
    if (typeof text !== 'string') broken();
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var cp = text.codePointAt(i);
      if (cp > 0xFFFF) i += 1;
      if (cp === 0x40) out.push('＠');
      else if (isInvisible(cp)) out.push(visibleToken(cp));
      else out.push(String.fromCodePoint(cp));
    }
    return out.join('');
  }

  function num(v) {
    if (typeof v !== 'number' || !isFinite(v)) broken();
    return v === 0 && 1 / v < 0 ? '-0' : String(v);
  }

  function count(v) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || Math.floor(v) !== v) broken();
    return String(v);
  }

  function fixed(v, digits) {
    if (typeof v !== 'number' || !isFinite(v)) broken();
    return toFixed.call(v, digits);
  }

  var DASH = '—';

  function pressureOrDash(v, whenNull) {
    return v === null ? DASH + (whenNull || '') : fixed(v, DIGITS_PRESSURE);
  }

  function ratioOrDash(v, whenNull) {
    return v === null ? DASH + (whenNull || '') : fixed(v, DIGITS_RATIO);
  }

  function signed(v, digits) {
    if (v === null) return DASH + '（片方に値なし）';
    return (v > 0 ? '+' : '') + fixed(v, digits);
  }

  function modeValue(k, v) {
    return PRESSURE_FIELD_LABELS[k][1] === 'pressure' ? fixed(v, DIGITS_PRESSURE) : num(v);
  }

  function modeDigits(k) {
    return PRESSURE_FIELD_LABELS[k][1] === 'pressure' ? DIGITS_PRESSURE : DIGITS_HEIGHT_DIFFERENCE;
  }

  function sameText(v) {
    if (v === null) return DASH + '（片方に値なし）';
    if (v === true) return '一致';
    if (v === false) return '不一致';
    return broken();
  }

  function declared(row, key) {
    return hasOwn(row, key) ? safePrintableText(row[key]) : DASH + '（宣言なし）';
  }

  function idList(ids) {
    if (!Array.isArray(ids)) broken();
    return ids.length === 0 ? DASH : ids.map(safePrintableText).join(', ');
  }

  function bestLabel(best) {
    return best === null ? DASH + '（推奨候補なし）' : safePrintableText(best.label);
  }

  function bestP(best) {
    return best === null ? DASH : fixed(best.P, DIGITS_PRESSURE);
  }

  function unitOf(review, kind) {
    return safePrintableText(review.units[kind]);
  }

  function pressureHeader(review, k) {
    var spec = PRESSURE_FIELD_LABELS[k];
    return spec[0] + '（' + unitOf(review, spec[1]) + '）';
  }

  // ============================================================
  // model（block の並び）
  // ============================================================

  function heading(level, text) {
    return { type: 'heading', level: level, text: text };
  }

  function paragraph(text) {
    return { type: 'paragraph', text: text };
  }

  function table(role, headers, rows) {
    rows.forEach(function (cells) {
      if (cells.length !== headers.length) broken();
    });
    return { type: 'table', role: role, headers: headers, rows: rows };
  }

  function infoBlocks(review) {
    return [heading(2, '出力の情報'), table('kv', ['項目', '値'], [
      ['資料', 'Pack Review の印刷用資料（' + MODEL_TYPE + '・版 ' + MODEL_SCHEMA_VERSION + '）'],
      ['review', safePrintableText(review.reviewType) + '（schemaVersion ' + num(review.schemaVersion) + '）'],
      ['sourceKind', SOURCE_KIND],
      ['trust', TRUST],
      ['interpretation', INTERPRETATION],
      ['公開表示名', safePrintableText(review.publicLabel)],
      ['pressureModel.mode', safePrintableText(review.pressureMode)],
      ['単位', '長さ ' + unitOf(review, 'length') + ' ／ 高さ ' + unitOf(review, 'height') + ' ／ 風圧 ' +
        unitOf(review, 'pressure') + ' ／ 面積 ' + unitOf(review, 'area')],
      ['全ケース数', count(review.totalCases)],
      ['詳細を選んだケース数', count(review.selectedDetails.length)],
      ['2 ケースの比較', review.comparison === null ? 'なし' : 'あり']
    ])];
  }

  function summaryBlocks(review) {
    var s = review.summary;
    return [heading(2, '集計'), table('kv', ['項目', '値'], [
      ['全ケース数', count(s.totalCases)],
      ['推奨候補あり', count(s.withOkCandidateCount)],
      ['推奨候補なし', count(s.withoutOkCandidateCount)],
      ['適用範囲外の候補を含むケース', count(s.outOfScopePresentCount)]
    ]), table('metrics', ['指標', '値', '該当ケース数', '該当 caseId（全ケース計算の並び順）'], [
      ['最大設計風圧（' + unitOf(review, 'pressure') + '）', pressureOrDash(s.maxDesignPressure),
        count(s.maxDesignPressureCaseIds.length), idList(s.maxDesignPressureCaseIds)],
      ['最小余裕比（推奨候補の許容風圧 ÷ 設計風圧）', ratioOrDash(s.minMarginRatio, '（推奨候補のあるケースなし）'),
        count(s.minMarginRatioCaseIds.length), idList(s.minMarginRatioCaseIds)]
    ]), paragraph('最大設計風圧と最小余裕比は別の指標です（同じケースとは限りません）。同じ値のケースはすべて全ケース計算の' +
      '並び順で示します。余裕比は安全性の判定・承認ではありません。')];
  }

  function groupBlocks(review) {
    var out = [heading(2, 'グループ'), heading(3, '推奨候補の構成別'),
      table('groups', ['推奨候補', 'ケース数', 'caseId（全ケース計算の並び順）'], review.groups.byRecommended.map(function (g) {
        return [g.label === null ? DASH + '（推奨候補なし）' : safePrintableText(g.label), count(g.count), idList(g.caseIds)];
      }))];
    [['byFloor', 'floor', '階別', '階'], ['byZone', 'zone', '部位別', '部位']].forEach(function (spec) {
      out.push(heading(3, spec[2]));
      out.push(table('groups', [spec[3], '宣言', 'ケース数', 'caseId（全ケース計算の並び順）'], review.groups[spec[0]].map(function (g) {
        if (g.declared !== true && g.declared !== false) broken();
        return [g.declared ? safePrintableText(g[spec[1]]) : DASH + '（宣言なし）', g.declared ? 'あり' : 'なし',
          count(g.count), idList(g.caseIds)];
      })));
    });
    out.push(paragraph('グループは Review の確認用です。Evidence の分類や、案件の正式な階・部位の一覧ではありません。'));
    return out;
  }

  function caseBlocks(review) {
    var fields = MODE_PRESSURE_FIELDS[review.pressureMode];
    var headers = ['caseId', 'paneId', '階', '部位', 'ガラス', '幅 W（' + unitOf(review, 'length') + '）',
      '高さ H（' + unitOf(review, 'length') + '）', '設計風圧（' + unitOf(review, 'pressure') + '）', '風圧の出どころ']
      .concat(fields.map(function (k) { return pressureHeader(review, k); }))
      .concat(['推奨候補', '許容風圧（' + unitOf(review, 'pressure') + '）', 'OK', 'NG', '適用範囲外', '余裕比',
        '余裕差（' + unitOf(review, 'pressure') + '）']);
    return [heading(2, 'ケース一覧（全 ' + count(review.totalCases) + ' ケース）'), table('cases', headers, review.rows.map(function (r) {
      return [safePrintableText(r.caseId), safePrintableText(r.paneId), declared(r, 'floor'), declared(r, 'zone'),
        safePrintableText(r.glassType), num(r.widthMm), num(r.heightMm), fixed(r.designPressure, DIGITS_PRESSURE),
        safePrintableText(r.pressureSource)]
        .concat(fields.map(function (k) { return modeValue(k, r[k]); }))
        .concat([bestLabel(r.bestCandidate), bestP(r.bestCandidate), count(r.okCount), count(r.ngCount),
          count(r.outOfScopeCount), ratioOrDash(r.marginRatio), pressureOrDash(r.marginPressure)]);
    }))];
  }

  function detailBlocks(review) {
    var fields = MODE_PRESSURE_FIELDS[review.pressureMode];
    var out = [heading(2, '選んだケースの詳細（' + count(review.selectedDetails.length) + ' 件）')];
    if (review.selectedDetails.length === 0) {
      out.push(paragraph('詳細を表示するケースは選ばれていません。'));
      return out;
    }
    out.push(paragraph('詳細は、同じ Pack から計算し直して一覧の値と完全に一致したケースだけです（選んだ順）。'));
    review.selectedDetails.forEach(function (d, i) {
      var inner = [table('kv', ['項目', '値'], [
        ['caseId', safePrintableText(d.caseId)],
        ['paneId', safePrintableText(d.paneId)],
        ['階', declared(d, 'floor')],
        ['部位', declared(d, 'zone')],
        ['ガラス', safePrintableText(d.glassType)],
        ['告示外の追加低減係数', num(d.extraFactor)],
        ['幅 W（' + unitOf(review, 'length') + '）', num(d.widthMm)],
        ['高さ H（' + unitOf(review, 'length') + '）', num(d.heightMm)],
        ['面積（' + unitOf(review, 'area') + '）', num(d.areaM2)],
        ['pressureModel.mode', safePrintableText(d.pressureMode)],
        ['設計風圧（' + unitOf(review, 'pressure') + '）', fixed(d.designPressure, DIGITS_PRESSURE)],
        ['風圧の出どころ', safePrintableText(d.pressureSource)]
      ].concat(fields.map(function (k) { return [pressureHeader(review, k), modeValue(k, d[k])]; })).concat([
        ['推奨候補', bestLabel(d.bestCandidate)],
        ['許容風圧（' + unitOf(review, 'pressure') + '）', bestP(d.bestCandidate)],
        ['余裕比', ratioOrDash(d.marginRatio)],
        ['余裕差（' + unitOf(review, 'pressure') + '）', pressureOrDash(d.marginPressure)],
        ['OK', count(d.okCount)],
        ['NG', count(d.ngCount)],
        ['適用範囲外', count(d.outOfScopeCount)]
      ])), heading(4, '候補の一覧（' + count(d.candidateSummary.length) + ' 件）')];
      if (d.candidateSummary.length === 0) {
        inner.push(paragraph('候補はありません。'));
      } else {
        inner.push(table('candidates', ['候補', '許容風圧（' + unitOf(review, 'pressure') + '）', '判定'], d.candidateSummary.map(function (c) {
          if (!hasOwn(STATUS_LABELS, c.status)) broken();
          return [safePrintableText(c.label), fixed(c.P, DIGITS_PRESSURE), STATUS_LABELS[c.status]];
        })));
      }
      out.push({ type: 'detail', heading: '詳細 ' + (i + 1) + '：ケース ' + safePrintableText(d.caseId), blocks: inner });
    });
    return out;
  }

  function comparisonBlocks(review) {
    var c = review.comparison;
    var out = [heading(2, '2 ケースの比較')];
    if (c === null) {
      out.push(paragraph('比較は選ばれていません。'));
      return out;
    }
    var fields = MODE_PRESSURE_FIELDS[review.pressureMode];
    var a = c.a;
    var b = c.b;
    var d = c.difference;
    var same = c.sameValue;
    out.push(paragraph('A: ' + safePrintableText(c.caseIds[0]) + ' ／ B: ' + safePrintableText(c.caseIds[1]) + '。差は B − A です。' +
      '片方に値が無いときは差・一致を「—」とし、0 や作り話の差を出しません。順位・優劣は付けません。'));
    out.push(table('comparison', ['項目', 'A', 'B', '差（B − A）・一致'], [
      ['caseId', safePrintableText(a.caseId), safePrintableText(b.caseId), ''],
      ['paneId', safePrintableText(a.paneId), safePrintableText(b.paneId), sameText(same.paneId)],
      ['階', declared(a, 'floor'), declared(b, 'floor'), sameText(same.floor)],
      ['部位', declared(a, 'zone'), declared(b, 'zone'), sameText(same.zone)],
      ['ガラス', safePrintableText(a.glassType), safePrintableText(b.glassType), sameText(same.glassType)],
      ['幅 W（' + unitOf(review, 'length') + '）', num(a.widthMm), num(b.widthMm), signed(d.widthMm, DIGITS_LENGTH_DIFFERENCE)],
      ['高さ H（' + unitOf(review, 'length') + '）', num(a.heightMm), num(b.heightMm), signed(d.heightMm, DIGITS_LENGTH_DIFFERENCE)],
      ['設計風圧（' + unitOf(review, 'pressure') + '）', fixed(a.designPressure, DIGITS_PRESSURE),
        fixed(b.designPressure, DIGITS_PRESSURE), signed(d.designPressure, DIGITS_PRESSURE)],
      ['風圧の出どころ', safePrintableText(a.pressureSource), safePrintableText(b.pressureSource), '']
    ].concat(fields.map(function (k) {
      return [pressureHeader(review, k), modeValue(k, a[k]), modeValue(k, b[k]), signed(d[k], modeDigits(k))];
    })).concat([
      ['推奨候補', bestLabel(a.bestCandidate), bestLabel(b.bestCandidate), sameText(same.recommendedLabel)],
      ['許容風圧（' + unitOf(review, 'pressure') + '）', bestP(a.bestCandidate), bestP(b.bestCandidate),
        signed(d.allowablePressure, DIGITS_PRESSURE)],
      ['余裕比', ratioOrDash(a.marginRatio), ratioOrDash(b.marginRatio), signed(d.marginRatio, DIGITS_RATIO)],
      ['余裕差（' + unitOf(review, 'pressure') + '）', pressureOrDash(a.marginPressure), pressureOrDash(b.marginPressure),
        signed(d.marginPressure, DIGITS_PRESSURE)],
      ['OK', count(a.okCount), count(b.okCount), ''],
      ['NG', count(a.ngCount), count(b.ngCount), ''],
      ['適用範囲外', count(a.outOfScopeCount), count(b.outOfScopeCount), '']
    ])));
    return out;
  }

  /**
   * 印刷用 DOM の element の数（呼び出し側の組み方と同じ数え方。text node は数えない）。
   *   title・heading・paragraph: 1。trust: 外枠 1 ＋ 見出し 1 ＋ ul 1 ＋ li（注意の数）＋ 丸め・共有の段落 2。
   *   table: table・thead・見出し行・tbody の 4 ＋ 見出しのセル ＋ 行ごとに（tr 1 ＋ セル）。
   *   detail: 外枠 1 ＋ 見出し 1 ＋ 中の block。外側の root（印刷 root の中の 1 つの容器）は model の外で 1 と数える。
   */
  function elementCountOf(block) {
    switch (block.type) {
      case 'title':
      case 'heading':
      case 'paragraph':
        return 1;
      case 'trust':
        return 3 + block.notices.length + 2;
      case 'table':
        return 4 + block.headers.length + block.rows.length * (1 + block.headers.length);
      case 'detail':
        return 2 + block.blocks.reduce(function (n, b) { return n + elementCountOf(b); }, 0);
      default:
        return broken();
    }
  }

  function textBytesOf(value) {
    if (typeof value === 'string') return utf8Length(value);
    if (Array.isArray(value)) return value.reduce(function (n, v) { return n + textBytesOf(v); }, 0);
    if (value !== null && typeof value === 'object') {
      return Object.keys(value).reduce(function (n, k) { return n + textBytesOf(value[k]); }, 0);
    }
    return 0;
  }

  function renderModel(review) {
    if (!hasOwn(MODE_PRESSURE_FIELDS, review.pressureMode)) broken();
    var blocks = [
      { type: 'title', text: TITLE },
      { type: 'trust', heading: TRUST_LINE, notices: NOTICES.concat(MORE_NOTICES), rounding: ROUNDING_NOTE, share: SHARE_NOTE }
    ].concat(infoBlocks(review), summaryBlocks(review), groupBlocks(review), caseBlocks(review), detailBlocks(review),
      comparisonBlocks(review), [paragraph(CLOSING)]);
    var elements = 1 + blocks.reduce(function (n, b) { return n + elementCountOf(b); }, 0);
    return {
      modelType: MODEL_TYPE,
      modelSchemaVersion: MODEL_SCHEMA_VERSION,
      sourceKind: SOURCE_KIND,
      trust: TRUST,
      interpretation: INTERPRETATION,
      footerText: FOOTER_TEXT,
      counts: {
        caseRows: review.rows.length,
        details: review.selectedDetails.length,
        comparison: review.comparison !== null,
        elements: elements,
        textBytes: textBytesOf(blocks)
      },
      blocks: blocks
    };
  }

  /**
   * 発行された review を印刷用の model にする。review は batchResult と ctx（どちらも同じ instance）から発行された
   * ものでなければならない。全ケース・全グループ・選んだケースの詳細・比較を省略しない。上限を超えたら何も返さない。
   */
  function buildPrintModel(review, batchResult, ctx) {
    gate(review, batchResult, ctx);
    var model;
    try {
      model = renderModel(review);
    } catch (e) {
      fail('model', 'could not be generated');
    }
    if (model.counts.textBytes > MAX_TEXT_BYTES) {
      fail('model', 'text exceeds ' + MAX_TEXT_BYTES + ' bytes (not truncated)');
    }
    if (model.counts.elements > MAX_ELEMENTS) {
      fail('model', 'exceeds ' + MAX_ELEMENTS + ' elements (not truncated)');
    }
    return deepFreeze(model);
  }

  return deepFreeze({
    MODEL_TYPE: MODEL_TYPE,
    MODEL_SCHEMA_VERSION: MODEL_SCHEMA_VERSION,
    SOURCE_KIND: SOURCE_KIND,
    TRUST: TRUST,
    INTERPRETATION: INTERPRETATION,
    NOTICES: NOTICES,
    FOOTER_TEXT: FOOTER_TEXT,
    MAX_CASE_ROWS: MAX_CASE_ROWS,
    MAX_DETAILS: MAX_DETAILS,
    MAX_TEXT_BYTES: MAX_TEXT_BYTES,
    MAX_ELEMENTS: MAX_ELEMENTS,
    safePrintableText: safePrintableText,
    elementCountOf: elementCountOf,
    buildPrintModel: buildPrintModel
  });
});
