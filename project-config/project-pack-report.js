/**
 * project-config/project-pack-report.js
 *
 * Project Pack Derived Report（Phase 2L-B2 / S3-B3B1）。案件非依存の pure module。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * ProjectPackBatch が発行した一括計算の結果（batch result）から、伝達用の派生レポートを作る:
 *
 *   ProjectPackBatch.assertBatchResult(batchResult)   … 発行物だけを通す（形・文字列の一致だけで信用しない）
 *     → buildReport()   … field を 1 つずつ明示的に写した report（deep-frozen・この module の発行物）
 *     → serializeJson() / toCsv()   … ブラウザ内でコピーするためのテキスト
 *
 * report は「計算済み・未検証」の結果を伝えるためのもので、再計算用の入力ではない。
 * Project Pack・入力 package（ProjectInput）・Workspace・Scenario・Review Package のどれにも戻さない
 * （この module はそれらを参照しない）。風圧・ガラスの計算もしない（batch result の値を写すだけ）。
 *
 * ── trust ────────────────────────────────────────────────
 *
 * sourceKind = project_pack_unreviewed・trust = pack_unreviewed・interpretation = calculated_not_verified
 * で固定する。CSV では各行にも sourceKind・trust・interpretation を書く（一部の行だけをコピーしても
 * trust が失われないように）。OK は計算上の候補判定であって、検証・承認ではない。
 *
 * ── 出力の安全 ───────────────────────────────────────────
 *
 *   - JSON: report だけを固定の key 順で書く（batch result をそのまま文字列化しない）。数値は full precision。
 *   - CSV: 列順は固定（CSV_COLUMNS）。RFC 4180 相当の quote。文字列セルは、先頭の空白・制御文字・
 *     不可視文字を飛ばした先が数式の trigger（= + - @ と全角の同類）なら先頭に ' を付けて文字列として
 *     扱わせる（値は削らない）。数値セルは number のまま書く（負数を壊さない）。mode に無い列は空欄。
 *   - 出力の上限 MAX_OUTPUT_BYTES（各 8 MiB）はブラウザ出力の資源保護で、Project Pack schema の上限
 *     ではない。超えたら切り詰めずに失敗する。
 *
 * ── 依存 ─────────────────────────────────────────────────
 *
 * 依存は ProjectPackBatch だけで、この module の初期化時に 1 度だけ掴む（後から global を読み直さない。
 * 初期化時に無ければ null を持ち、呼び出しが fail closed になる。読み込み自体は失敗しない）。
 * 発行物かどうかの判定は ProjectPackBatch に任せ、別の trust の根を作らない。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして
 * 提供する（<script src> と require() の両対応）。ブラウザでは
 * project-config/project-pack-batch.js の後に読み込むこと。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectPackReport = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  // ============================================================
  // Contract
  // ============================================================

  var REPORT_TYPE = 'glass_wind_pack_derived_report';
  var SCHEMA_VERSION = 1;
  var SOURCE_KIND = 'project_pack_unreviewed';
  var TRUST = 'pack_unreviewed';
  var INTERPRETATION = 'calculated_not_verified';
  var MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

  var MODE_NOTIFICATION = 'notification1458';
  var MODE_PRESSURE_MAP = 'project_pressure_map';
  var MODE_CASE_DIRECT = 'case_direct';

  var REPORT_KEYS = ['reportType', 'schemaVersion', 'sourceKind', 'trust', 'interpretation', 'publicLabel',
    'pressureMode', 'units', 'totalCases', 'executedCases', 'rows'];
  var UNIT_KEYS = ['length', 'height', 'pressure'];
  // mode ごとの風圧の field（batch result の行の pressure と同じ組だけを写す）
  var MODE_PRESSURE_FIELDS = {};
  MODE_PRESSURE_FIELDS[MODE_NOTIFICATION] = ['evaluationHeightM', 'positivePressure', 'negativePressure'];
  MODE_PRESSURE_FIELDS[MODE_PRESSURE_MAP] = ['positivePressure', 'negativePressureMagnitude'];
  MODE_PRESSURE_FIELDS[MODE_CASE_DIRECT] = [];
  var ROW_HEAD_KEYS = ['caseId', 'paneId'];
  var ROW_OPTIONAL_KEYS = ['floor', 'zone'];
  var ROW_BODY_KEYS = ['glassType', 'widthMm', 'heightMm', 'designPressure', 'pressureSource'];
  var ROW_TAIL_KEYS = ['bestCandidate', 'okCount', 'ngCount', 'outOfScopeCount'];
  var BEST_KEYS = ['label', 'P'];

  /** CSV の列（この順で固定。README に記載）。最後の publicLabel は Pack の公開表示名。 */
  var CSV_COLUMNS = ['caseId', 'paneId', 'floor', 'zone', 'sourceKind', 'trust', 'interpretation', 'pressureMode',
    'pressureSource', 'widthMm', 'heightMm', 'glassType', 'designPressure', 'evaluationHeightM', 'positivePressure',
    'negativePressure', 'negativePressureMagnitude', 'bestCandidate', 'allowablePressure', 'okCount', 'ngCount',
    'outOfScopeCount', 'publicLabel'];

  // report のどこにも置かない key（昇格・検証・申告・provenance・入力 package の痕跡）
  var FORBIDDEN_KEYS = ['verified', 'approved', 'reviewed', 'attested', 'attestation', 'canonicalEvidence',
    'promotionCandidate', 'verifiedCases', 'provenance', 'verificationStatus', 'formulaVerificationStatus',
    'formulaSource', 'evidence', 'sourceClaim', 'sourceScopes', 'records', 'claimedLevel', 'candidates',
    'notificationTrace', 'trace', 'packageType', 'workspaceType', 'cases', 'glazingCases', 'panes'];

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

  var CAPTURED_BATCH = captureDependency('ProjectPackBatch', './project-pack-batch.js');
  var Batch = null;

  function requireBatch() {
    if (Batch) return Batch;
    if (!CAPTURED_BATCH) {
      throw new Error('project-pack-report.js: project-config/project-pack-batch.js is required but not available ' +
        '(it was not loaded when this module was initialised)');
    }
    // batch module の trust と一致していなければ使わない（trust の規則を 2 つ持たない）
    if (CAPTURED_BATCH.TRUST !== TRUST || CAPTURED_BATCH.SOURCE_KIND !== SOURCE_KIND) {
      throw new Error('project-pack-report.js: ProjectPackBatch trust is not ' + TRUST);
    }
    Batch = CAPTURED_BATCH;
    return Batch;
  }

  // ============================================================
  // helpers
  // ============================================================

  function fail(where, message) {
    throw new Error('ProjectPackReport: ' + where + ': ' + message);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (k) { deepFreeze(value[k]); });
    }
    return value;
  }

  function requireString(v, where) {
    if (typeof v !== 'string' || v === '') fail(where, 'must be a non-empty string');
    return v;
  }

  function requireFinite(v, where) {
    if (typeof v !== 'number' || !isFinite(v)) fail(where, 'must be a finite number');
    return v;
  }

  function requireCount(v, where) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || Math.floor(v) !== v) fail(where, 'must be a count');
    return v;
  }

  function byteLength(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return Buffer.byteLength(text, 'utf8');
  }

  function requireWithinCap(text, what) {
    if (byteLength(text) > MAX_OUTPUT_BYTES) {
      fail(what, 'output exceeds ' + MAX_OUTPUT_BYTES + ' bytes (not truncated)');
    }
    return text;
  }

  // ============================================================
  // buildReport（batch result → report。field を 1 つずつ写す）
  // ============================================================

  function projectRow(row, mode, i) {
    var at = 'batch.rows[' + i + ']';
    if (!isPlainObject(row) || !isPlainObject(row.pressure)) fail(at, 'must be an object');
    // 風圧の field の組は mode と一致していなければならない（case_direct に正圧・負圧が混ざっていない）
    var fields = MODE_PRESSURE_FIELDS[mode];
    var pressureKeys = Object.keys(row.pressure).sort();
    var expected = ['pressureSource'].concat(fields).sort();
    if (pressureKeys.join('|') !== expected.join('|')) fail(at + '.pressure', 'fields do not match ' + mode);

    var out = {
      caseId: requireString(row.caseId, at + '.caseId'),
      paneId: requireString(row.paneId, at + '.paneId')
    };
    // floor / zone は batch の行にあるときだけ（作らない）
    if (hasOwn(row, 'floor')) out.floor = requireString(row.floor, at + '.floor');
    if (hasOwn(row, 'zone')) out.zone = requireString(row.zone, at + '.zone');
    out.glassType = requireString(row.glassType, at + '.glassType');
    out.widthMm = requireFinite(row.widthMm, at + '.widthMm');
    out.heightMm = requireFinite(row.heightMm, at + '.heightMm');
    out.designPressure = requireFinite(row.designPressure, at + '.designPressure');
    out.pressureSource = requireString(row.pressure.pressureSource, at + '.pressure.pressureSource');
    fields.forEach(function (k) { out[k] = requireFinite(row.pressure[k], at + '.pressure.' + k); });
    out.bestCandidate = row.bestCandidate === null ? null : {
      label: requireString(row.bestCandidate.label, at + '.bestCandidate.label'),
      P: requireFinite(row.bestCandidate.P, at + '.bestCandidate.P')
    };
    out.okCount = requireCount(row.okCount, at + '.okCount');
    out.ngCount = requireCount(row.ngCount, at + '.ngCount');
    out.outOfScopeCount = requireCount(row.outOfScopeCount, at + '.outOfScopeCount');
    return out;
  }

  var issued = new WeakSet();

  /**
   * ProjectPackBatch が発行した batch result から report を作る。発行物でない object（形だけ似せた
   * object・JSON の複製・生の Pack・ProjectContext・単一ケースの結果・部分的な結果）は拒否する。
   */
  function buildReport(batchResult) {
    var B = requireBatch();
    B.assertBatchResult(batchResult);   // 発行物だけ。batchType や trust の文字列一致だけでは通らない
    if (batchResult.trust !== TRUST || batchResult.sourceKind !== SOURCE_KIND) fail('batch', 'is not ' + TRUST);
    var mode = batchResult.pressureMode;
    if (!hasOwn(MODE_PRESSURE_FIELDS, mode)) fail('batch.pressureMode', 'is not supported');
    var rows = batchResult.rows;
    if (rows.length !== batchResult.totalCases || batchResult.executedCases !== batchResult.totalCases) {
      fail('batch', 'does not contain every declared case');
    }
    var report = {
      reportType: REPORT_TYPE,
      schemaVersion: SCHEMA_VERSION,
      sourceKind: SOURCE_KIND,
      trust: TRUST,
      interpretation: INTERPRETATION,
      publicLabel: requireString(batchResult.publicLabel, 'batch.publicLabel'),
      pressureMode: mode,
      units: {
        length: requireString(batchResult.units.length, 'batch.units.length'),
        height: requireString(batchResult.units.height, 'batch.units.height'),
        pressure: requireString(batchResult.units.pressure, 'batch.units.pressure')
      },
      totalCases: requireCount(batchResult.totalCases, 'batch.totalCases'),
      executedCases: requireCount(batchResult.executedCases, 'batch.executedCases'),
      rows: rows.map(function (row, i) { return projectRow(row, mode, i); })
    };
    deepFreeze(report);
    assertReportShape(report);
    issued.add(report);
    return report;
  }

  // ============================================================
  // report validation
  // ============================================================

  function walkForbidden(node, where) {
    if (Array.isArray(node)) {
      node.forEach(function (v, i) { walkForbidden(v, where + '[' + i + ']'); });
      return;
    }
    if (node !== null && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        if (FORBIDDEN_KEYS.indexOf(k) !== -1) fail(where + '.' + k, 'is not allowed in a Pack derived report');
        walkForbidden(node[k], where + '.' + k);
      });
    }
  }

  function exactOrderedKeys(obj, keys, where) {
    if (!isPlainObject(obj)) fail(where, 'must be an object');
    if (Object.keys(obj).join('|') !== keys.join('|')) fail(where, 'fields or field order are not the report contract');
  }

  function rowKeysFor(row, mode) {
    var keys = ROW_HEAD_KEYS.slice();
    ROW_OPTIONAL_KEYS.forEach(function (k) { if (hasOwn(row, k)) keys.push(k); });
    return keys.concat(ROW_BODY_KEYS, MODE_PRESSURE_FIELDS[mode], ROW_TAIL_KEYS);
  }

  function assertReportShape(r) {
    var where = 'report';
    exactOrderedKeys(r, REPORT_KEYS, where);
    if (r.reportType !== REPORT_TYPE) fail(where + '.reportType', 'must be ' + REPORT_TYPE);
    if (r.schemaVersion !== SCHEMA_VERSION) fail(where + '.schemaVersion', 'must be ' + SCHEMA_VERSION);
    if (r.sourceKind !== SOURCE_KIND) fail(where + '.sourceKind', 'must be ' + SOURCE_KIND);
    if (r.trust !== TRUST) fail(where + '.trust', 'must be ' + TRUST);
    if (r.interpretation !== INTERPRETATION) fail(where + '.interpretation', 'must be ' + INTERPRETATION);
    requireString(r.publicLabel, where + '.publicLabel');
    if (!hasOwn(MODE_PRESSURE_FIELDS, r.pressureMode)) fail(where + '.pressureMode', 'is not supported');
    exactOrderedKeys(r.units, UNIT_KEYS, where + '.units');
    requireCount(r.totalCases, where + '.totalCases');
    requireCount(r.executedCases, where + '.executedCases');
    if (!Array.isArray(r.rows)) fail(where + '.rows', 'must be a list');
    if (r.executedCases !== r.totalCases || r.rows.length !== r.totalCases) {
      fail(where, 'a report must contain every declared case');
    }
    var seen = Object.create(null);
    r.rows.forEach(function (row, i) {
      var at = where + '.rows[' + i + ']';
      exactOrderedKeys(row, rowKeysFor(row, r.pressureMode), at);
      if (seen[row.caseId] === true) fail(at + '.caseId', 'is duplicated');
      seen[row.caseId] = true;
      if (row.bestCandidate !== null) exactOrderedKeys(row.bestCandidate, BEST_KEYS, at + '.bestCandidate');
    });
    walkForbidden(r, where);
    return r;
  }

  /** buildReport() が発行した report か（形を真似た object は通らない）。 */
  function isReport(r) {
    return r !== null && typeof r === 'object' && issued.has(r);
  }

  function assertReport(r) {
    if (!isReport(r)) fail('report', 'was not issued by ProjectPackReport.buildReport()');
    return assertReportShape(r);
  }

  // ============================================================
  // JSON
  // ============================================================

  /** 発行された report だけを JSON にする（固定の key 順・full precision・2 space indent）。 */
  function serializeJson(report) {
    assertReport(report);
    return requireWithinCap(JSON.stringify(report, null, 2) + '\n', 'json');
  }

  // ============================================================
  // CSV
  // ============================================================

  // 先頭で読み飛ばされうる文字（空白・制御文字・Unicode の不可視の書式文字・各種の空白）
  var LEADING_IGNORABLE = /^[\s\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB]+/;
  // 数式として解釈されうる先頭文字（半角・全角・数学記号の minus など）
  var FORMULA_TRIGGER = /^[=+\-@\uFF1D\uFF0B\uFF0D\uFF20\u2212\uFE62\uFE63\uFE66\uFF5C|]/;

  /**
   * 文字列セルが表計算ソフトで数式として扱われないようにする。値は削らず、必要なときだけ先頭に ' を付ける。
   *   - 先頭がタブ・CR・LF などの制御文字・空白・不可視文字なら、それらを飛ばした先も調べる
   *   - 先頭（読み飛ばした後）が = + - @ や全角の同類なら数式の trigger とみなす
   *   - 先頭に制御文字（タブ・CR・LF）があるだけでも中和する
   */
  function neutralizeFormula(text) {
    if (text.length === 0) return text;
    var stripped = text.replace(LEADING_IGNORABLE, '');
    if (FORMULA_TRIGGER.test(stripped) || /^[\u0000-\u001F]/.test(text)) return "'" + text;
    return text;
  }

  /** RFC 4180 相当（" , CR LF を含むセルは " で囲み、" は "" にする）。 */
  function csvQuote(text) {
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function csvString(value) {
    if (value === undefined || value === null) return '';
    return csvQuote(neutralizeFormula(String(value)));
  }

  function csvNumber(value) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'number' || !isFinite(value)) fail('csv', 'numeric cell is not a finite number');
    return String(value);   // full precision・符号はそのまま（文字列の中和を通さない）
  }

  /** 発行された report だけを CSV にする（列順は CSV_COLUMNS。mode に無い列は空欄）。 */
  function toCsv(report) {
    assertReport(report);
    var lines = [CSV_COLUMNS.map(csvString).join(',')];
    report.rows.forEach(function (row) {
      lines.push([
        csvString(row.caseId),
        csvString(row.paneId),
        csvString(row.floor),
        csvString(row.zone),
        csvString(report.sourceKind),
        csvString(report.trust),
        csvString(report.interpretation),
        csvString(report.pressureMode),
        csvString(row.pressureSource),
        csvNumber(row.widthMm),
        csvNumber(row.heightMm),
        csvString(row.glassType),
        csvNumber(row.designPressure),
        csvNumber(row.evaluationHeightM),
        csvNumber(row.positivePressure),
        csvNumber(row.negativePressure),
        csvNumber(row.negativePressureMagnitude),
        csvString(row.bestCandidate ? row.bestCandidate.label : null),
        csvNumber(row.bestCandidate ? row.bestCandidate.P : null),
        csvNumber(row.okCount),
        csvNumber(row.ngCount),
        csvNumber(row.outOfScopeCount),
        csvString(report.publicLabel)
      ].join(','));
    });
    return requireWithinCap(lines.join('\r\n') + '\r\n', 'csv');
  }

  return deepFreeze({
    REPORT_TYPE: REPORT_TYPE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SOURCE_KIND: SOURCE_KIND,
    TRUST: TRUST,
    INTERPRETATION: INTERPRETATION,
    MAX_OUTPUT_BYTES: MAX_OUTPUT_BYTES,
    CSV_COLUMNS: CSV_COLUMNS,
    buildReport: buildReport,
    isReport: isReport,
    assertReport: assertReport,
    serializeJson: serializeJson,
    toCsv: toCsv,
    neutralizeFormula: neutralizeFormula
  });
});
