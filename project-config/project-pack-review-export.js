/**
 * project-config/project-pack-review-export.js
 *
 * Project Pack Review Export（Phase 2L-B2 / S3-B3B2-C1-A）。案件非依存の pure module。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * ProjectPackReview が発行した review を、伝達用のテキスト（Markdown / JSON）にする:
 *
 *   ProjectPackReview.assertReviewOrigin(review, batch, ctx)   … 発行物で、batch と ctx（どちらも同じ instance）
 *                                                                から発行された review だけを通す（最初の gate）
 *     → toMarkdown()     … 人が読む文書（入力の文字列はすべて同じ escape を通す・不可視の文字は可視化する）
 *     → serializeJson()  … exportSchemaVersion 付きの外枠（固定の notices 4 件）に review をそのまま入れた JSON（値と精度を保つ）
 *
 * どちらも review の全ケースの行・全グループ・選んだケースの詳細・比較を省略しない。計算はしない（review の
 * 値を写すだけ）。取り込み（import / deserialize）の機能は持たない。出力は再計算用の入力ではなく、Project Pack・
 * 入力 package・Workspace・Review Package のどれにも戻さない。
 *
 * ── trust ────────────────────────────────────────────────
 *
 * sourceKind = project_pack_unreviewed・trust = pack_unreviewed・interpretation = calculated_not_verified で
 * 固定する（JSON の外枠と Markdown の冒頭・末尾）。固定の注意 4 件（NOTICES）を JSON の notices と Markdown の冒頭の
 * 両方に書く。OK は計算上の候補判定で、検証・承認ではない。
 *
 * ── 発行元の真正性と画面の現在性 ─────────────────────────
 *
 * 最初の gate は「この review が、渡された batch と ctx から正式に発行された」ことだけを確かめる。古い review と、
 * それを作った batch・ctx をすべて持っていれば gate は通る。その review が画面でいま有効かどうかは、この module
 * では確かめられない（呼び出し側の責務）。
 *
 * ── 出力の安全 ───────────────────────────────────────────
 *
 *   - Markdown: review の文字列はすべて escapeMarkdownText() を通す。ASCII の記号（!"#$%&'()*+,-./:;<=>?[\]^_`{|}~）は
 *     すべて前に \ を付け、@ は全角の ＠ にし（GitHub の e-mail 自動リンク・メンションを防ぐ）、制御文字・不可視の
 *     書式文字・異体字セレクタ・タグ文字・孤立したサロゲートなど（INVISIBLE_RANGES）は ⟨U+XXXX⟩ の形で見えるように
 *     する。改行・| を含む値でも行や表のセルは増えない。この変換は元に戻せない（非可逆。正確な値は JSON）。
 *   - Markdown の数値は画面（S3-B3B2-B3）と同じ表示の桁: 風圧（設計風圧・正圧・負圧・許容風圧）と余裕差は小数 1 桁、
 *     余裕比は小数 3 桁（toFixed）。寸法・評価高さ・面積・係数は review の値のまま。比較の差は正なら + を付ける。
 *     丸めは表示だけで、値を計算し直さない（余裕比・差は review の値を丸めて書く）。全桁の値は JSON にある。
 *   - JSON: 外枠 { exportType, exportSchemaVersion, sourceKind, trust, interpretation, notices, review } を固定の key 順で
 *     書く。notices は固定の 4 件（未レビュー・計算済み ≠ 検証済み・OK の限定的な意味・正式な承認資料ではない）。
 *     値は own の data だけを型を確かめながら書き（toJSON・prototype を使わない）、数値は丸めない（-0 も -0 と書く。
 *     標準の JSON.stringify は -0 を 0 と書く点だけが違う）。同じ review からは常に同じ byte 列になる（時刻・乱数なし）。
 *   - 上限 MAX_OUTPUT_BYTES（各 8 MiB・UTF-8）は出力の資源保護。超えたら切り詰めず、一部も返さずに失敗する。
 *   - 例外の文面は固定。入力値・caseId・内部の例外の文面を含めない。
 *
 * ── 依存 ─────────────────────────────────────────────────
 *
 * 依存は ProjectPackReview だけで、この module の初期化時に 1 度だけ掴む（後から global を読み直さない。
 * 初期化時に無ければ null を持ち、呼び出しが fail closed になる。読み込み自体は失敗しない）。発行物・発行元の
 * 判定は ProjectPackReview に任せ、別の trust の根を作らない。DOM・storage・network に触れない。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして
 * 提供する（<script src> と require() の両対応）。ブラウザでは
 * project-config/project-pack-review.js の後に読み込むこと。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectPackReviewExport = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  // ============================================================
  // Contract
  // ============================================================

  var EXPORT_TYPE = 'glass_wind_pack_review_export';
  var EXPORT_SCHEMA_VERSION = 1;
  var SOURCE_KIND = 'project_pack_unreviewed';
  var TRUST = 'pack_unreviewed';
  var INTERPRETATION = 'calculated_not_verified';
  var MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

  /**
   * 出力に必ず付ける固定の注意（JSON の notices・Markdown の冒頭の引用）。順番も文面も固定で、review の値から
   * 作らない。
   */
  var NOTICES = Object.freeze([
    '未レビュー：この出力は、未レビュー（pack_unreviewed）の Project Pack から計算した結果です。',
    '計算済み ≠ 検証済み：値は計算したもので、検証されたものではありません（calculated_not_verified）。',
    'OK は計算上の候補判定です。Evidence の確認・安全性の判定・承認ではありません。',
    '正式な案件承認の資料ではありません。値は案件の出典資料・メーカー資料と照合してください。'
  ]);

  // この module が書ける review の版（違う版の review を推測で書かない）
  var REVIEW_TYPE = 'glass_wind_pack_review';
  var REVIEW_SCHEMA_VERSION = 1;

  var MODE_NOTIFICATION = 'notification1458';
  var MODE_PRESSURE_MAP = 'project_pressure_map';
  var MODE_CASE_DIRECT = 'case_direct';

  // mode ごとの風圧の field（review の行・詳細にある値だけ）と、Markdown の見出し（単位は review.units から）
  var MODE_PRESSURE_FIELDS = {};
  MODE_PRESSURE_FIELDS[MODE_NOTIFICATION] = ['evaluationHeightM', 'positivePressure', 'negativePressure'];
  MODE_PRESSURE_FIELDS[MODE_PRESSURE_MAP] = ['positivePressure', 'negativePressureMagnitude'];
  MODE_PRESSURE_FIELDS[MODE_CASE_DIRECT] = [];
  // [見出し, 単位の種類]。単位の種類が pressure なら小数 1 桁で表示し、height（評価高さ）は review の値のまま
  // （比較の差は小数 3 桁。画面と同じ）
  var PRESSURE_FIELD_LABELS = {
    evaluationHeightM: ['評価高さ', 'height'],
    positivePressure: ['正圧', 'pressure'],
    negativePressure: ['負圧・符号付き', 'pressure'],
    negativePressureMagnitude: ['負圧の大きさ', 'pressure']
  };
  // 表示の桁（画面の packReviewPressure / packReviewRatio / packReviewMargin / packReviewDifference と同じ）
  var DIGITS_PRESSURE = 1;
  var DIGITS_RATIO = 3;
  var DIGITS_LENGTH_DIFFERENCE = 0;
  var DIGITS_HEIGHT_DIFFERENCE = 3;
  var ROUNDING_NOTE = '数値の表示：風圧（設計風圧・正圧・負圧・許容風圧）と余裕差は小数 ' + DIGITS_PRESSURE + ' 桁、余裕比は小数 ' +
    DIGITS_RATIO + ' 桁に丸めて表示しています（画面と同じ。寸法・評価高さ・面積・係数・件数は review の値のまま）。比較の差も' +
    '同じ桁で、寸法の差は整数、評価高さの差は小数 ' + DIGITS_HEIGHT_DIFFERENCE + ' 桁です。丸めは表示だけで、計算・照合・差は' +
    '丸めない値で行っています。全桁の値は JSON 出力にあります。';
  // 表示の丸めに使う関数（初期化時に 1 度だけ掴む。後から Number.prototype を差し替えても使わない）
  var toFixed = Number.prototype.toFixed;
  var STATUS_LABELS = { ok: 'OK（計算上の候補判定）', ng: 'NG', out_of_scope: '適用範囲外' };

  /**
   * Markdown で ⟨U+XXXX⟩ と書いて見えるようにする code point（両端を含む）。制御文字（C0・DEL・C1）・
   * 書式文字（Unicode の Cf）・行 / 段落の区切り・孤立したサロゲート・異体字セレクタ・タグ文字・
   * 見た目が空白になる埋め字・非文字。通常の空白（U+0020 など）は対象にしない。
   */
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

  /**
   * この module を初期化した時点で読み込まれている instance を掴む（browser では先に読み込まれた
   * global、Node では require()）。無ければ null。掴んだ後は global を読み直さない。
   */
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
      throw new Error('project-pack-review-export.js: project-config/project-pack-review.js is required but not available ' +
        '(it was not loaded when this module was initialised)');
    }
    // review module の trust・版と一致していなければ使わない（trust の規則を 2 つ持たない）
    if (CAPTURED_REVIEW.TRUST !== TRUST || CAPTURED_REVIEW.SOURCE_KIND !== SOURCE_KIND ||
        CAPTURED_REVIEW.INTERPRETATION !== INTERPRETATION || typeof CAPTURED_REVIEW.assertReviewOrigin !== 'function') {
      throw new Error('project-pack-review-export.js: ProjectPackReview trust is not ' + TRUST);
    }
    if (CAPTURED_REVIEW.REVIEW_TYPE !== REVIEW_TYPE || CAPTURED_REVIEW.SCHEMA_VERSION !== REVIEW_SCHEMA_VERSION) {
      throw new Error('project-pack-review-export.js: ProjectPackReview is not ' + REVIEW_TYPE + ' schemaVersion ' +
        REVIEW_SCHEMA_VERSION);
    }
    Review = CAPTURED_REVIEW;
    return Review;
  }

  // ============================================================
  // helpers
  // ============================================================

  // 文面は固定。publicLabel・caseId・入力値・内部の例外の中身を含めない。
  function fail(where, message) {
    throw new Error('ProjectPackReviewExport: ' + where + ': ' + message);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function deepFreeze(value) {
    if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (k) { deepFreeze(value[k]); });
    }
    return value;
  }

  /** 書き出しの途中の検査（この関数の例外は外へ出る前に固定文へ置き換えられる）。 */
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

  function requireWithinCap(text, what) {
    if (utf8Length(text) > MAX_OUTPUT_BYTES) {
      fail(what, 'output exceeds ' + MAX_OUTPUT_BYTES + ' bytes (not truncated)');
    }
    return text;
  }

  /**
   * 最初の gate。review が発行物で、batch と ctx（同じ instance）から発行されたものだけを通す。
   * 理由（どの検査で落ちたか）と例外の文面は外へ出さない。
   */
  function gate(review, batchResult, ctx) {
    var R = requireReview();
    try {
      R.assertReviewOrigin(review, batchResult, ctx);
    } catch (e) {
      fail('review', 'is not an issued Pack review of the given batch result and context');
    }
    // 版と trust（形の検査は assertReviewOrigin が済ませている）
    if (review.reviewType !== REVIEW_TYPE || review.schemaVersion !== REVIEW_SCHEMA_VERSION ||
        review.sourceKind !== SOURCE_KIND || review.trust !== TRUST || review.interpretation !== INTERPRETATION) {
      fail('review', 'is not a ' + TRUST + ' review of schemaVersion ' + REVIEW_SCHEMA_VERSION);
    }
  }

  // ============================================================
  // Markdown: 文字列の escape と数値の表記
  // ============================================================

  function isAsciiPunctuation(cp) {
    return (cp >= 0x21 && cp <= 0x2F) || (cp >= 0x3A && cp <= 0x40) || (cp >= 0x5B && cp <= 0x60) ||
      (cp >= 0x7B && cp <= 0x7E);
  }

  function isInvisible(cp) {
    // 各 plane の末尾 2 つ（U+xFFFE・U+xFFFF）は非文字
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
   * review の文字列を Markdown の地の文・表のセルに置ける形にする（すべての文字列がこの 1 つの関数を通る）。
   * ASCII の記号には \ を付け（CommonMark の backslash escape。強調・リンク・画像・HTML・コード・表の区切り・
   * 見出し・引用・取り消し線・数式・wiki link・コメント・タグなどの記法として働かない）、不可視の文字は
   * ⟨U+XXXX⟩ にする（改行・タブも含む。値が行や表のセルを増やさない）。それ以外の文字はそのまま。
   * ただし @ だけは全角の ＠（U+FF20）にする: GitHub の cmark-gfm は backslash escape を解いた後の文字列から
   * e-mail（user@example.com・mailto:・xmpp:）を自動リンクにするため（GitHub のメンションにもならない）。
   */
  function escapeMarkdownText(text) {
    if (typeof text !== 'string') broken();
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var cp = text.codePointAt(i);
      if (cp > 0xFFFF) i += 1;
      if (cp === 0x40) out.push('\uFF20');
      else if (isAsciiPunctuation(cp)) out.push('\\' + String.fromCharCode(cp));
      else if (isInvisible(cp)) out.push(visibleToken(cp));
      else out.push(String.fromCodePoint(cp));
    }
    return out.join('');
  }

  /** 数値の表記（丸めない。JavaScript の最短表記。-0 は -0 のまま）。 */
  function num(v) {
    if (typeof v !== 'number' || !isFinite(v)) broken();
    return v === 0 && 1 / v < 0 ? '-0' : String(v);
  }

  function count(v) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || Math.floor(v) !== v) broken();
    return String(v);
  }

  /** 表示の丸め（toFixed。値を計算し直さない）。有限の number だけ。 */
  function fixed(v, digits) {
    if (typeof v !== 'number' || !isFinite(v)) broken();
    return toFixed.call(v, digits);
  }

  var DASH = '—';

  /** 風圧・余裕差（小数 1 桁）。null は「—」のまま（0 にしない）。 */
  function pressureOrDash(v, whenNull) {
    return v === null ? DASH + (whenNull || '') : fixed(v, DIGITS_PRESSURE);
  }

  /** 余裕比（小数 3 桁）。null は「—」のまま（0 にしない）。 */
  function ratioOrDash(v, whenNull) {
    return v === null ? DASH + (whenNull || '') : fixed(v, DIGITS_RATIO);
  }

  /** 差（B − A。review の差を丸めて書くだけ）。正なら + を付ける。片方に値が無ければ「—」（0 にしない）。 */
  function signed(v, digits) {
    if (v === null) return DASH + '（片方に値なし）';
    return (v > 0 ? '+' : '') + fixed(v, digits);
  }

  /** mode ごとの風圧の field の表示（風圧は小数 1 桁、評価高さは review の値のまま）。 */
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
    return hasOwn(row, key) ? escapeMarkdownText(row[key]) : DASH + '（宣言なし）';
  }

  function idList(ids) {
    if (!Array.isArray(ids)) broken();
    return ids.length === 0 ? DASH : ids.map(escapeMarkdownText).join(', ');
  }

  function bestLabel(best) {
    return best === null ? DASH + '（推奨候補なし）' : escapeMarkdownText(best.label);
  }

  function bestP(best) {
    return best === null ? DASH : fixed(best.P, DIGITS_PRESSURE);
  }

  function unitOf(review, kind) {
    return escapeMarkdownText(review.units[kind]);
  }

  // ============================================================
  // Markdown: 文書
  // ============================================================

  function table(lines, headers, rows) {
    lines.push('| ' + headers.join(' | ') + ' |');
    lines.push('|' + headers.map(function () { return '---'; }).join('|') + '|');
    rows.forEach(function (cells) {
      if (cells.length !== headers.length) broken();
      lines.push('| ' + cells.join(' | ') + ' |');
    });
    lines.push('');
  }

  function pressureHeader(review, k) {
    var spec = PRESSURE_FIELD_LABELS[k];
    return spec[0] + '（' + unitOf(review, spec[1]) + '）';
  }

  function trustBlock(lines) {
    lines.push('> **未レビュー**（`' + TRUST + '`）・**計算済み ≠ 検証済み**（`' + INTERPRETATION + '`）');
    lines.push('>');
    // JSON の notices と同じ固定の 4 件（同じ escape を通す）
    NOTICES.forEach(function (notice) { lines.push('> - ' + escapeMarkdownText(notice)); });
    lines.push('> - 余裕比・余裕差は確認用の指標で、安全性の判定・承認ではありません。');
    lines.push('> - この文書は Project Pack・入力 package・Workspace の入力として読み込むものではありません。');
    lines.push('');
    lines.push(ROUNDING_NOTE);
    lines.push('');
  }

  function infoSection(lines, review) {
    lines.push('## 出力の情報');
    lines.push('');
    table(lines, ['項目', '値'], [
      ['出力形式', '`' + EXPORT_TYPE + '`（exportSchemaVersion ' + EXPORT_SCHEMA_VERSION + '）'],
      ['review', escapeMarkdownText(review.reviewType) + '（schemaVersion ' + num(review.schemaVersion) + '）'],
      ['sourceKind', '`' + SOURCE_KIND + '`'],
      ['trust', '`' + TRUST + '`'],
      ['interpretation', '`' + INTERPRETATION + '`'],
      ['公開表示名', escapeMarkdownText(review.publicLabel)],
      ['pressureModel.mode', escapeMarkdownText(review.pressureMode)],
      ['単位', '長さ ' + unitOf(review, 'length') + ' ／ 高さ ' + unitOf(review, 'height') + ' ／ 風圧 ' +
        unitOf(review, 'pressure') + ' ／ 面積 ' + unitOf(review, 'area')],
      ['全ケース数', count(review.totalCases)],
      ['詳細を選んだケース数', count(review.selectedDetails.length)],
      ['2 ケースの比較', review.comparison === null ? 'なし' : 'あり']
    ]);
  }

  function summarySection(lines, review) {
    var s = review.summary;
    lines.push('## 集計');
    lines.push('');
    table(lines, ['項目', '値'], [
      ['全ケース数', count(s.totalCases)],
      ['推奨候補あり', count(s.withOkCandidateCount)],
      ['推奨候補なし', count(s.withoutOkCandidateCount)],
      ['適用範囲外の候補を含むケース', count(s.outOfScopePresentCount)]
    ]);
    table(lines, ['指標', '値', '該当ケース数', '該当 caseId（全ケース計算の並び順）'], [
      ['最大設計風圧（' + unitOf(review, 'pressure') + '）', pressureOrDash(s.maxDesignPressure),
        count(s.maxDesignPressureCaseIds.length), idList(s.maxDesignPressureCaseIds)],
      ['最小余裕比（推奨候補の許容風圧 ÷ 設計風圧）', ratioOrDash(s.minMarginRatio, '（推奨候補のあるケースなし）'),
        count(s.minMarginRatioCaseIds.length), idList(s.minMarginRatioCaseIds)]
    ]);
    lines.push('最大設計風圧と最小余裕比は別の指標です（同じケースとは限りません）。同じ値のケースはすべて全ケース計算の' +
      '並び順で示します。余裕比は安全性の判定・承認ではありません。');
    lines.push('');
  }

  function groupsSection(lines, review) {
    lines.push('## グループ');
    lines.push('');
    lines.push('### 推奨候補の構成別');
    lines.push('');
    table(lines, ['推奨候補', 'ケース数', 'caseId（全ケース計算の並び順）'], review.groups.byRecommended.map(function (g) {
      return [g.label === null ? DASH + '（推奨候補なし）' : escapeMarkdownText(g.label), count(g.count), idList(g.caseIds)];
    }));
    [['byFloor', 'floor', '階別', '階'], ['byZone', 'zone', '部位別', '部位']].forEach(function (spec) {
      lines.push('### ' + spec[2]);
      lines.push('');
      table(lines, [spec[3], '宣言', 'ケース数', 'caseId（全ケース計算の並び順）'], review.groups[spec[0]].map(function (g) {
        if (g.declared !== true && g.declared !== false) broken();
        return [g.declared ? escapeMarkdownText(g[spec[1]]) : DASH + '（宣言なし）', g.declared ? 'あり' : 'なし',
          count(g.count), idList(g.caseIds)];
      }));
    });
    lines.push('グループは Review の確認用です。Evidence の分類や、案件の正式な階・部位の一覧ではありません。');
    lines.push('');
  }

  function rowsSection(lines, review) {
    var fields = MODE_PRESSURE_FIELDS[review.pressureMode];
    var headers = ['caseId', 'paneId', '階', '部位', 'ガラス', '幅 W（' + unitOf(review, 'length') + '）',
      '高さ H（' + unitOf(review, 'length') + '）', '設計風圧（' + unitOf(review, 'pressure') + '）', '風圧の出どころ']
      .concat(fields.map(function (k) { return pressureHeader(review, k); }))
      .concat(['推奨候補', '許容風圧（' + unitOf(review, 'pressure') + '）', 'OK', 'NG', '適用範囲外', '余裕比',
        '余裕差（' + unitOf(review, 'pressure') + '）']);
    lines.push('## ケース一覧（全 ' + count(review.totalCases) + ' ケース）');
    lines.push('');
    table(lines, headers, review.rows.map(function (r) {
      return [escapeMarkdownText(r.caseId), escapeMarkdownText(r.paneId), declared(r, 'floor'), declared(r, 'zone'),
        escapeMarkdownText(r.glassType), num(r.widthMm), num(r.heightMm), fixed(r.designPressure, DIGITS_PRESSURE),
        escapeMarkdownText(r.pressureSource)]
        .concat(fields.map(function (k) { return modeValue(k, r[k]); }))
        .concat([bestLabel(r.bestCandidate), bestP(r.bestCandidate), count(r.okCount), count(r.ngCount),
          count(r.outOfScopeCount), ratioOrDash(r.marginRatio), pressureOrDash(r.marginPressure)]);
    }));
  }

  function detailsSection(lines, review) {
    var fields = MODE_PRESSURE_FIELDS[review.pressureMode];
    lines.push('## 選んだケースの詳細（' + count(review.selectedDetails.length) + ' 件）');
    lines.push('');
    if (review.selectedDetails.length === 0) {
      lines.push('詳細を表示するケースは選ばれていません。');
      lines.push('');
      return;
    }
    lines.push('詳細は、同じ Pack から計算し直して一覧の値と完全に一致したケースだけです（選んだ順）。');
    lines.push('');
    review.selectedDetails.forEach(function (d, i) {
      lines.push('### 詳細 ' + (i + 1) + '：ケース ' + escapeMarkdownText(d.caseId));
      lines.push('');
      table(lines, ['項目', '値'], [
        ['caseId', escapeMarkdownText(d.caseId)],
        ['paneId', escapeMarkdownText(d.paneId)],
        ['階', declared(d, 'floor')],
        ['部位', declared(d, 'zone')],
        ['ガラス', escapeMarkdownText(d.glassType)],
        ['告示外の追加低減係数', num(d.extraFactor)],
        ['幅 W（' + unitOf(review, 'length') + '）', num(d.widthMm)],
        ['高さ H（' + unitOf(review, 'length') + '）', num(d.heightMm)],
        ['面積（' + unitOf(review, 'area') + '）', num(d.areaM2)],
        ['pressureModel.mode', escapeMarkdownText(d.pressureMode)],
        ['設計風圧（' + unitOf(review, 'pressure') + '）', fixed(d.designPressure, DIGITS_PRESSURE)],
        ['風圧の出どころ', escapeMarkdownText(d.pressureSource)]
      ].concat(fields.map(function (k) { return [pressureHeader(review, k), modeValue(k, d[k])]; })).concat([
        ['推奨候補', bestLabel(d.bestCandidate)],
        ['許容風圧（' + unitOf(review, 'pressure') + '）', bestP(d.bestCandidate)],
        ['余裕比', ratioOrDash(d.marginRatio)],
        ['余裕差（' + unitOf(review, 'pressure') + '）', pressureOrDash(d.marginPressure)],
        ['OK', count(d.okCount)],
        ['NG', count(d.ngCount)],
        ['適用範囲外', count(d.outOfScopeCount)]
      ]));
      lines.push('#### 候補の一覧（' + count(d.candidateSummary.length) + ' 件）');
      lines.push('');
      if (d.candidateSummary.length === 0) {
        lines.push('候補はありません。');
        lines.push('');
        return;
      }
      table(lines, ['候補', '許容風圧（' + unitOf(review, 'pressure') + '）', '判定'], d.candidateSummary.map(function (c) {
        if (!hasOwn(STATUS_LABELS, c.status)) broken();
        return [escapeMarkdownText(c.label), fixed(c.P, DIGITS_PRESSURE), STATUS_LABELS[c.status]];
      }));
    });
  }

  function comparisonSection(lines, review) {
    var c = review.comparison;
    lines.push('## 2 ケースの比較');
    lines.push('');
    if (c === null) {
      lines.push('比較は選ばれていません。');
      lines.push('');
      return;
    }
    var fields = MODE_PRESSURE_FIELDS[review.pressureMode];
    var a = c.a;
    var b = c.b;
    var d = c.difference;
    var same = c.sameValue;
    lines.push('A: ' + escapeMarkdownText(c.caseIds[0]) + ' ／ B: ' + escapeMarkdownText(c.caseIds[1]) + '。差は B − A です。' +
      '片方に値が無いときは差・一致を「—」とし、0 や作り話の差を出しません。順位・優劣は付けません。');
    lines.push('');
    table(lines, ['項目', 'A', 'B', '差（B − A）・一致'], [
      ['caseId', escapeMarkdownText(a.caseId), escapeMarkdownText(b.caseId), ''],
      ['paneId', escapeMarkdownText(a.paneId), escapeMarkdownText(b.paneId), sameText(same.paneId)],
      ['階', declared(a, 'floor'), declared(b, 'floor'), sameText(same.floor)],
      ['部位', declared(a, 'zone'), declared(b, 'zone'), sameText(same.zone)],
      ['ガラス', escapeMarkdownText(a.glassType), escapeMarkdownText(b.glassType), sameText(same.glassType)],
      ['幅 W（' + unitOf(review, 'length') + '）', num(a.widthMm), num(b.widthMm), signed(d.widthMm, DIGITS_LENGTH_DIFFERENCE)],
      ['高さ H（' + unitOf(review, 'length') + '）', num(a.heightMm), num(b.heightMm), signed(d.heightMm, DIGITS_LENGTH_DIFFERENCE)],
      ['設計風圧（' + unitOf(review, 'pressure') + '）', fixed(a.designPressure, DIGITS_PRESSURE),
        fixed(b.designPressure, DIGITS_PRESSURE), signed(d.designPressure, DIGITS_PRESSURE)],
      ['風圧の出どころ', escapeMarkdownText(a.pressureSource), escapeMarkdownText(b.pressureSource), '']
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
    ]));
  }

  function renderMarkdown(review) {
    if (!hasOwn(MODE_PRESSURE_FIELDS, review.pressureMode)) broken();
    var lines = [];
    lines.push('# Pack Review（未レビュー）');
    lines.push('');
    trustBlock(lines);
    infoSection(lines, review);
    summarySection(lines, review);
    groupsSection(lines, review);
    rowsSection(lines, review);
    detailsSection(lines, review);
    comparisonSection(lines, review);
    lines.push('---');
    lines.push('');
    lines.push('> **未レビュー**（`' + TRUST + '`）・**計算済み ≠ 検証済み**（`' + INTERPRETATION + '`）。' +
      '正式な案件承認の資料ではありません。');
    return lines.join('\n') + '\n';
  }

  /**
   * 発行された review を Markdown にする。review は batchResult と ctx（どちらも同じ instance）から発行された
   * ものでなければならない。全ケース・全グループ・選んだケースの詳細・比較を省略しない。
   */
  function toMarkdown(review, batchResult, ctx) {
    gate(review, batchResult, ctx);
    var text;
    try {
      text = renderMarkdown(review);
    } catch (e) {
      fail('markdown', 'could not be generated');
    }
    return requireWithinCap(text, 'markdown');
  }

  // ============================================================
  // JSON
  // ============================================================

  /**
   * 値を JSON にする（JSON.stringify(value, null, 2) と同じ書式）。own の data だけを、型を確かめながら書く:
   * 文字列・有限の数値・真偽値・null・配列・object だけ。toJSON・prototype・accessor は使わない。-0 は -0。
   */
  function jsonText(value, indent) {
    if (value === null) return 'null';
    var type = typeof value;
    if (type === 'string') return JSON.stringify(value);   // 文字列の primitive は toJSON を経由しない
    if (type === 'number') return num(value);
    if (type === 'boolean') return value ? 'true' : 'false';
    var inner = indent + '  ';
    var parts = [];
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      for (var i = 0; i < value.length; i++) {
        var d = Object.getOwnPropertyDescriptor(value, String(i));
        if (d === undefined || !hasOwn(d, 'value')) broken();
        parts.push(inner + jsonText(d.value, inner));
      }
      return '[\n' + parts.join(',\n') + '\n' + indent + ']';
    }
    if (!isPlainObject(value)) broken();
    var keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    keys.forEach(function (k) {
      var desc = Object.getOwnPropertyDescriptor(value, k);
      if (desc === undefined || !hasOwn(desc, 'value')) broken();
      parts.push(inner + JSON.stringify(k) + ': ' + jsonText(desc.value, inner));
    });
    return '{\n' + parts.join(',\n') + '\n' + indent + '}';
  }

  /**
   * 発行された review を JSON にする（exportSchemaVersion 付きの外枠と固定の notices。review は key の順・値・精度のまま）。review は
   * batchResult と ctx（どちらも同じ instance）から発行されたものでなければならない。
   */
  function serializeJson(review, batchResult, ctx) {
    gate(review, batchResult, ctx);
    var text;
    try {
      text = jsonText({
        exportType: EXPORT_TYPE,
        exportSchemaVersion: EXPORT_SCHEMA_VERSION,
        sourceKind: SOURCE_KIND,
        trust: TRUST,
        interpretation: INTERPRETATION,
        notices: NOTICES.slice(),
        review: review
      }, '') + '\n';
    } catch (e) {
      fail('json', 'could not be generated');
    }
    return requireWithinCap(text, 'json');
  }

  return deepFreeze({
    EXPORT_TYPE: EXPORT_TYPE,
    EXPORT_SCHEMA_VERSION: EXPORT_SCHEMA_VERSION,
    SOURCE_KIND: SOURCE_KIND,
    TRUST: TRUST,
    INTERPRETATION: INTERPRETATION,
    MAX_OUTPUT_BYTES: MAX_OUTPUT_BYTES,
    toMarkdown: toMarkdown,
    serializeJson: serializeJson
  });
});
