/**
 * project-config/project-pack-review.js
 *
 * Project Pack Review（Phase 2L-B2 / S3-B3B2-A1）。案件非依存の pure module。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * ProjectPackBatch が発行した一括計算の結果（batch result）を、確認しやすい形にまとめた review を作る:
 *
 *   ProjectPackBatch.assertBatchOrigin(batchResult, ctx)   … 発行物で、かつ ctx（同じ instance）から
 *                                                           発行されたものだけを通す（最初の gate）
 *     → 全ケースの行（batch の行を 1 field ずつ写し、余裕比・余裕差を加える）
 *     → summary（件数・最大設計風圧・最小余裕比）、grouping（推奨候補・階・部位）
 *     → 2 ケースの比較（指定されたときだけ）
 *     → 選んだケースの詳細（同じ ctx で ProjectPackExecution.executeCase() を呼び直し、batch の行と
 *        重なるすべての field が完全に一致したときだけ詳細にする）
 *     → review（deep-frozen・この module の発行物）
 *
 * 一覧と集計の正本は batch result。詳細だけを、発行元と確かめた同じ context から計算し直す。
 * 計算式は持たない（風圧・ガラスは executor の結果を写すだけ）。WindPressure・GlassCalc・Workspace・
 * Review Package を代わりの計算経路として呼ばない。
 *
 * ── 余裕比・余裕差 ───────────────────────────────────────
 *
 *   marginRatio    = 推奨候補の許容風圧 P / 設計風圧
 *   marginPressure = 推奨候補の許容風圧 P − 設計風圧
 *
 * 定義はこの module に置く。推奨候補が無いケースは両方 null（0 で埋めない）。値は丸めない。
 * 確認用の指標であって、安全性の判定・承認ではない。
 *
 * summary の「最大設計風圧」と「最小余裕比」は別の指標で、互いに代用しない。同じ値のケースは
 * すべて batch の並び順で残す。「支配ケース」は定義しない（作らない）。
 *
 * ── これは何でないか ─────────────────────────────────────
 *
 * review は「計算済み・未検証」の結果を確認するための派生物で、入力の正本ではない。trust は
 * pack_unreviewed、interpretation は calculated_not_verified で固定する。出典の申告（claimedLevel など）は
 * 読まない。Evidence・Closure・Promotion・Workspace・Review Package・入力 package のどれにもつながらない。
 * DOM を読まない。context や生の Pack を review に入れない。
 *
 * ── 依存 ─────────────────────────────────────────────────
 *
 * 依存は ProjectPackBatch と ProjectPackExecution で、この module の初期化時に 1 度だけ掴む（後から
 * global を読み直さない。初期化時に無ければ null を持ち、呼び出しが fail closed になる。読み込み自体は
 * 失敗しない）。別の trust の根を作らない: 発行物と発行元の判定は ProjectPackBatch、context と
 * 単一ケースの結果の判定は ProjectPackExecution に任せる。
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
    global.ProjectPackReview = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  // ============================================================
  // Contract
  // ============================================================

  var REVIEW_TYPE = 'glass_wind_pack_review';
  var SCHEMA_VERSION = 1;
  var SOURCE_KIND = 'project_pack_unreviewed';
  var TRUST = 'pack_unreviewed';
  var INTERPRETATION = 'calculated_not_verified';
  var MAX_DETAIL_CASES = 50;

  var MODE_NOTIFICATION = 'notification1458';
  var MODE_PRESSURE_MAP = 'project_pressure_map';
  var MODE_CASE_DIRECT = 'case_direct';

  var REVIEW_KEYS = ['reviewType', 'schemaVersion', 'sourceKind', 'trust', 'interpretation', 'publicLabel',
    'pressureMode', 'units', 'totalCases', 'rows', 'summary', 'groups', 'selectedDetails', 'comparison'];
  var UNIT_KEYS = ['length', 'height', 'pressure', 'area'];
  var OPTION_KEYS = ['detailCaseIds', 'comparisonCaseIds'];

  // mode ごとの風圧の値（batch の行の pressure にある値だけ）。case_direct は設計風圧だけで、正圧・負圧に分けない。
  var MODE_PRESSURE_FIELDS = {};
  MODE_PRESSURE_FIELDS[MODE_NOTIFICATION] = ['evaluationHeightM', 'positivePressure', 'negativePressure'];
  MODE_PRESSURE_FIELDS[MODE_PRESSURE_MAP] = ['positivePressure', 'negativePressureMagnitude'];
  MODE_PRESSURE_FIELDS[MODE_CASE_DIRECT] = [];
  // case_direct の executor の結果に無いはずの風圧の field（あれば作り話の正圧・負圧）
  var NOT_IN_CASE_DIRECT = ['floor', 'zone', 'evaluationHeightM', 'positivePressure', 'negativePressure',
    'negativePressureMagnitude', 'notificationTrace'];

  var ROW_HEAD_KEYS = ['caseId', 'paneId'];
  var LOCATION_KEYS = ['floor', 'zone'];
  var ROW_BODY_KEYS = ['glassType', 'widthMm', 'heightMm', 'designPressure', 'pressureSource'];
  var ROW_TAIL_KEYS = ['bestCandidate', 'okCount', 'ngCount', 'outOfScopeCount', 'marginRatio', 'marginPressure'];
  var BEST_KEYS = ['label', 'P'];
  var SUMMARY_KEYS = ['totalCases', 'withOkCandidateCount', 'withoutOkCandidateCount', 'outOfScopePresentCount',
    'maxDesignPressure', 'maxDesignPressureCaseIds', 'minMarginRatio', 'minMarginRatioCaseIds'];
  var GROUP_KEYS = ['byRecommended', 'byFloor', 'byZone'];
  var RECOMMENDED_GROUP_KEYS = ['label', 'count', 'caseIds'];
  var FLOOR_GROUP_KEYS = ['floor', 'declared', 'count', 'caseIds'];
  var ZONE_GROUP_KEYS = ['zone', 'declared', 'count', 'caseIds'];
  var COMPARISON_KEYS = ['caseIds', 'a', 'b', 'difference', 'sameValue'];
  var SAME_VALUE_KEYS = ['paneId', 'glassType', 'recommendedLabel', 'floor', 'zone'];
  var DIFFERENCE_TAIL_KEYS = ['allowablePressure', 'marginRatio', 'marginPressure'];
  var DETAIL_HEAD_KEYS = ['caseId', 'paneId'];
  var DETAIL_BODY_KEYS = ['glassType', 'extraFactor', 'widthMm', 'heightMm', 'areaM2', 'pressureMode', 'designPressure',
    'pressureSource'];
  var DETAIL_TAIL_KEYS = ['bestCandidate', 'marginRatio', 'marginPressure', 'okCount', 'ngCount', 'outOfScopeCount',
    'candidateSummary'];
  // 候補の一覧は、この 3 つの field だけを写す（候補の detail・計算の途中値は写さない）
  var CANDIDATE_SUMMARY_KEYS = ['label', 'P', 'status'];
  var CANDIDATE_STATUSES = ['ok', 'ng', 'out_of_scope'];

  // review のどこにも置かない key（検証・承認・昇格・出典の申告・provenance・計算の trace・Pack や
  // context の痕跡・定義していない判定）。executor の FORBIDDEN_KEYS に加えて確かめる。
  var FORBIDDEN_KEYS = ['verified', 'approved', 'reviewed', 'attested', 'attestation', 'canonicalEvidence',
    'promotionCandidate', 'verifiedCases', 'provenance', 'verificationStatus', 'formulaVerificationStatus',
    'formulaSource', 'evidence', 'evidenceKind', 'sourceClaim', 'sourceScopes', 'records', 'claimedLevel',
    'privateReferenceAvailable', 'claimedPrivateReferenceAvailable', 'publicationAdvisories',
    'notificationTrace', 'trace', 'detail', 'candidates', 'context', 'projectContext', 'pressureModel',
    'windConditions', 'glazingCases', 'panes', 'packType', 'packageType', 'workspaceType',
    'governing', 'governingCase', 'dominantCase'];

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
  var CAPTURED_EXECUTION = captureDependency('ProjectPackExecution', './project-pack-execution.js');
  var Batch = null;
  var Exec = null;

  function unavailable(label) {
    return new Error('project-pack-review.js: ' + label + ' is required but not available ' +
      '(it was not loaded when this module was initialised)');
  }

  function requireBatch() {
    if (Batch) return Batch;
    if (!CAPTURED_BATCH) throw unavailable('project-config/project-pack-batch.js');
    // batch module の trust と一致していなければ使わない（trust の規則を 2 つ持たない）
    if (CAPTURED_BATCH.TRUST !== TRUST || CAPTURED_BATCH.SOURCE_KIND !== SOURCE_KIND ||
        typeof CAPTURED_BATCH.assertBatchOrigin !== 'function') {
      throw new Error('project-pack-review.js: ProjectPackBatch trust is not ' + TRUST);
    }
    Batch = CAPTURED_BATCH;
    return Batch;
  }

  function requireExecution() {
    if (Exec) return Exec;
    if (!CAPTURED_EXECUTION) throw unavailable('project-config/project-pack-execution.js');
    if (CAPTURED_EXECUTION.TRUST !== TRUST || CAPTURED_EXECUTION.SOURCE_KIND !== SOURCE_KIND ||
        typeof CAPTURED_EXECUTION.executeCase !== 'function' ||
        typeof CAPTURED_EXECUTION.assertExecutionResult !== 'function') {
      throw new Error('project-pack-review.js: ProjectPackExecution trust is not ' + TRUST);
    }
    Exec = CAPTURED_EXECUTION;
    return Exec;
  }

  // ============================================================
  // helpers
  // ============================================================

  // 文面は固定。publicLabel・caseId・入力値・例外の中身を含めない。
  function fail(where, message) {
    throw new Error('ProjectPackReview: ' + where + ': ' + message);
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

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function requireString(v, where) {
    if (typeof v !== 'string' || v === '') fail(where, 'must be a non-empty string');
    return v;
  }

  function requireFinite(v, where) {
    if (!isFiniteNumber(v)) fail(where, 'must be a finite number');
    return v;
  }

  function requirePositive(v, where) {
    if (!isFiniteNumber(v) || !(v > 0)) fail(where, 'must be a positive number');
    return v;
  }

  function requireCount(v, where) {
    if (!isFiniteNumber(v) || v < 0 || Math.floor(v) !== v) fail(where, 'must be a count');
    return v;
  }

  function exactOrderedKeys(obj, keys, where) {
    if (!isPlainObject(obj)) fail(where, 'must be an object');
    if (Object.keys(obj).join('|') !== keys.join('|')) fail(where, 'fields or field order are not the review contract');
  }

  // ============================================================
  // margin（余裕比・余裕差の定義はここだけ）
  // ============================================================

  /**
   * 推奨候補の許容風圧 P と設計風圧から余裕比・余裕差を求める。推奨候補が無ければ両方 null。
   * 設計風圧は正、結果は有限でなければ失敗する（丸めない）。
   */
  function marginOf(best, designPressure, where) {
    if (best === null) return { ratio: null, pressure: null };
    requirePositive(designPressure, where + '.designPressure');
    var P = requireFinite(best.P, where + '.bestCandidate.P');
    var ratio = P / designPressure;
    var pressure = P - designPressure;
    if (!isFiniteNumber(ratio) || !isFiniteNumber(pressure)) fail(where, 'margin is not a finite number');
    return { ratio: ratio, pressure: pressure };
  }

  // ============================================================
  // rows（batch の行 → review の行。field を 1 つずつ写す）
  // ============================================================

  function projectRow(row, mode, i) {
    var at = 'batch.rows[' + i + ']';
    if (!isPlainObject(row) || !isPlainObject(row.pressure)) fail(at, 'must be an object');
    var fields = MODE_PRESSURE_FIELDS[mode];
    // 風圧の field の組は mode のものだけ（case_direct に正圧・負圧が混ざっていない）
    var expected = ['pressureSource'].concat(fields).sort();
    if (Object.keys(row.pressure).sort().join('|') !== expected.join('|')) fail(at + '.pressure', 'fields do not match the mode');

    var out = {
      caseId: requireString(row.caseId, at + '.caseId'),
      paneId: requireString(row.paneId, at + '.paneId')
    };
    // floor / zone は batch の行にあるときだけ（作らない・推測しない）
    if (hasOwn(row, 'floor')) out.floor = requireString(row.floor, at + '.floor');
    if (hasOwn(row, 'zone')) out.zone = requireString(row.zone, at + '.zone');
    out.glassType = requireString(row.glassType, at + '.glassType');
    out.widthMm = requirePositive(row.widthMm, at + '.widthMm');
    out.heightMm = requirePositive(row.heightMm, at + '.heightMm');
    out.designPressure = requirePositive(row.designPressure, at + '.designPressure');
    out.pressureSource = requireString(row.pressure.pressureSource, at + '.pressure.pressureSource');
    fields.forEach(function (k) { out[k] = requireFinite(row.pressure[k], at + '.pressure.' + k); });
    out.bestCandidate = row.bestCandidate === null ? null : {
      label: requireString(row.bestCandidate.label, at + '.bestCandidate.label'),
      P: requireFinite(row.bestCandidate.P, at + '.bestCandidate.P')
    };
    out.okCount = requireCount(row.okCount, at + '.okCount');
    out.ngCount = requireCount(row.ngCount, at + '.ngCount');
    out.outOfScopeCount = requireCount(row.outOfScopeCount, at + '.outOfScopeCount');
    var m = marginOf(out.bestCandidate, out.designPressure, at);
    out.marginRatio = m.ratio;
    out.marginPressure = m.pressure;
    return out;
  }

  function copyRow(row) {
    var out = {};
    Object.keys(row).forEach(function (k) {
      out[k] = k === 'bestCandidate' && row[k] !== null ? { label: row[k].label, P: row[k].P } : row[k];
    });
    return out;
  }

  // ============================================================
  // summary
  // ============================================================

  function summarize(rows) {
    var withOk = 0;
    var outOfScopePresent = 0;
    var maxDesign = null;
    var maxDesignIds = [];
    var minRatio = null;
    var minRatioIds = [];
    rows.forEach(function (r) {
      if (r.bestCandidate !== null) withOk += 1;
      if (r.outOfScopeCount > 0) outOfScopePresent += 1;
      // 最大設計風圧: 全ケースが対象
      if (maxDesign === null || r.designPressure > maxDesign) {
        maxDesign = r.designPressure;
        maxDesignIds = [r.caseId];
      } else if (r.designPressure === maxDesign) {
        maxDesignIds.push(r.caseId);
      }
      // 最小余裕比: 推奨候補があるケースだけが対象（無いケースを 0 や最小として数えない）
      if (r.marginRatio !== null) {
        if (minRatio === null || r.marginRatio < minRatio) {
          minRatio = r.marginRatio;
          minRatioIds = [r.caseId];
        } else if (r.marginRatio === minRatio) {
          minRatioIds.push(r.caseId);
        }
      }
    });
    return {
      totalCases: rows.length,
      withOkCandidateCount: withOk,
      withoutOkCandidateCount: rows.length - withOk,
      outOfScopePresentCount: outOfScopePresent,
      maxDesignPressure: maxDesign,
      maxDesignPressureCaseIds: maxDesignIds,
      minMarginRatio: minRatio,
      minMarginRatioCaseIds: minRatioIds
    };
  }

  // ============================================================
  // grouping（宣言された値ごと。並びは batch の中で最初に現れた順。null / 未宣言の組は最後）
  // ============================================================

  function groupRows(rows, valueOf) {
    var order = [];
    var byValue = Object.create(null);
    var none = [];
    rows.forEach(function (r) {
      var v = valueOf(r);
      if (v === null) {
        none.push(r.caseId);
        return;
      }
      if (!byValue[v]) {
        byValue[v] = [];
        order.push(v);
      }
      byValue[v].push(r.caseId);
    });
    return { order: order, byValue: byValue, none: none };
  }

  function groupByRecommended(rows) {
    var g = groupRows(rows, function (r) { return r.bestCandidate === null ? null : r.bestCandidate.label; });
    var out = g.order.map(function (label) {
      return { label: label, count: g.byValue[label].length, caseIds: g.byValue[label] };
    });
    // 推奨候補が無いケースは label を null とした別の組（それらしい文字列の label を作らない）
    if (g.none.length > 0) out.push({ label: null, count: g.none.length, caseIds: g.none });
    return out;
  }

  function groupByLocation(rows, key) {
    var g = groupRows(rows, function (r) { return hasOwn(r, key) ? r[key] : null; });
    var out = g.order.map(function (v) {
      var group = {};
      group[key] = v;
      group.declared = true;
      group.count = g.byValue[v].length;
      group.caseIds = g.byValue[v];
      return group;
    });
    // 宣言されていないケースは別の組（値を推測しない）
    if (g.none.length > 0) {
      var undeclared = {};
      undeclared[key] = null;
      undeclared.declared = false;
      undeclared.count = g.none.length;
      undeclared.caseIds = g.none;
      out.push(undeclared);
    }
    return out;
  }

  // ============================================================
  // comparison（2 ケース。差は B − A。値の無い側があれば差は null）
  // ============================================================

  function differenceOf(a, b, where) {
    if (a === null || b === null) return null;
    var d = b - a;
    if (!isFiniteNumber(d)) fail(where, 'difference is not a finite number');
    return d;
  }

  function compareRows(a, b, mode) {
    var difference = {};
    ['widthMm', 'heightMm', 'designPressure'].concat(MODE_PRESSURE_FIELDS[mode]).forEach(function (k) {
      difference[k] = differenceOf(a[k], b[k], 'comparison.difference.' + k);
    });
    difference.allowablePressure = differenceOf(a.bestCandidate === null ? null : a.bestCandidate.P,
      b.bestCandidate === null ? null : b.bestCandidate.P, 'comparison.difference.allowablePressure');
    difference.marginRatio = differenceOf(a.marginRatio, b.marginRatio, 'comparison.difference.marginRatio');
    difference.marginPressure = differenceOf(a.marginPressure, b.marginPressure, 'comparison.difference.marginPressure');
    // 文字列の値は一致するかどうかだけ。片方に値が無ければ null（未宣言どうしを「同じ」としない）
    var sameValue = {
      paneId: a.paneId === b.paneId,
      glassType: a.glassType === b.glassType,
      recommendedLabel: a.bestCandidate !== null && b.bestCandidate !== null ? a.bestCandidate.label === b.bestCandidate.label : null,
      floor: hasOwn(a, 'floor') && hasOwn(b, 'floor') ? a.floor === b.floor : null,
      zone: hasOwn(a, 'zone') && hasOwn(b, 'zone') ? a.zone === b.zone : null
    };
    return { caseIds: [a.caseId, b.caseId], a: copyRow(a), b: copyRow(b), difference: difference, sameValue: sameValue };
  }

  // ============================================================
  // options（detailCaseIds / comparisonCaseIds）
  // ============================================================
  //
  // options とその配列は呼び出し側の object で、getter・proxy の trap・継承された property・穴のある配列が
  // ありうる。値は own の data property（列挙可能）からだけ、1 回だけ読み、この module の配列へ写してから
  // 検査する。getter は呼ばない。継承された field・穴・accessor・余分な key は黙って飛ばさずに拒否する。
  // prototype の同一性は比べない（別の realm で作った通常の object・配列も受け付ける）。

  /**
   * 呼び出し側の object を読む操作（proxy の trap を通りうる）を実行する。例外の文面（入力値・caseId を
   * 含みうる）は外へ出さず、固定文にする。fn の中では fail を呼ばない。
   */
  function readPlain(where, fn) {
    try {
      return fn();
    } catch (e) {
      fail(where, 'could not be read as plain data');
    }
  }

  /** own の property の記述子（無ければ undefined）。getter は呼ばない。 */
  function ownDescriptor(obj, key, where) {
    return readPlain(where, function () { return Object.getOwnPropertyDescriptor(obj, key); });
  }

  /** 列挙可能な data property か（accessor・非列挙は通常の入力値として扱わない）。 */
  function isPlainDataDescriptor(d) {
    return hasOwn(d, 'value') && !hasOwn(d, 'get') && !hasOwn(d, 'set') && d.enumerable === true;
  }

  /** 配列であることと、own の data property の length を確かめる。 */
  function listLength(list, where, notListMessage) {
    if (!readPlain(where, function () { return Array.isArray(list); })) fail(where, notListMessage);
    var d = ownDescriptor(list, 'length', where);
    if (d === undefined || !hasOwn(d, 'value')) fail(where, notListMessage);
    var n = d.value;
    if (typeof n !== 'number' || !(n >= 0) || Math.floor(n) !== n) fail(where, notListMessage);
    return n;
  }

  /**
   * 添字 0..n-1 を 1 つずつ own の data property として読み、この module の配列へ写す。穴・accessor・
   * 非列挙の要素・継承された要素は拒否する（黙って飛ばさない）。添字と length 以外の key（symbol・
   * 非列挙を含む）がある配列も拒否する。
   */
  function snapshotList(list, n, where) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var d = ownDescriptor(list, String(i), where);
      if (d === undefined) fail(where, 'must not have holes');
      if (!isPlainDataDescriptor(d)) fail(where, 'elements must be plain data properties');
      out.push(d.value);
    }
    var keys = readPlain(where, function () { return Reflect.ownKeys(list); });
    if (keys.length !== n + 1) fail(where, 'must contain only list elements');
    return out;
  }

  /** caseId の選択を確かめる。重複・batch に無い caseId は拒否する（黙って捨てない・切り詰めない）。 */
  function requireSelection(ids, where, indexById) {
    var seen = Object.create(null);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (typeof id !== 'string' || id === '') fail(where, 'must contain non-empty caseIds');
      if (seen[id] === true) fail(where, 'contains a duplicated caseId');
      seen[id] = true;
      if (indexById[id] === undefined) fail(where, 'contains a caseId that is not in the batch result');
    }
    return ids;
  }

  function readOptions(options, indexById) {
    var out = { detailCaseIds: [], comparisonCaseIds: null };
    if (options === undefined) return out;
    var isObject = readPlain('options', function () {
      return options !== null && typeof options === 'object' && !Array.isArray(options);
    });
    if (!isObject) fail('options', 'must be an object');
    // own の key はすべて（symbol・非列挙を含む）既知の名前でなければならない
    var keys = readPlain('options', function () { return Reflect.ownKeys(options); });
    for (var i = 0; i < keys.length; i++) {
      if (typeof keys[i] !== 'string' || OPTION_KEYS.indexOf(keys[i]) === -1) fail('options', 'has an unsupported field');
    }
    var values = Object.create(null);
    OPTION_KEYS.forEach(function (k) {
      var d = ownDescriptor(options, k, 'options');
      if (d === undefined) {
        // 継承された field（prototype 経由の指定）は選択として使わずに拒否する
        if (readPlain('options', function () { return k in options; })) fail('options', 'has an inherited field');
        return;
      }
      if (!isPlainDataDescriptor(d)) fail('options', 'fields must be plain data properties');
      values[k] = d.value;
    });
    if (values.detailCaseIds !== undefined) {
      var n = listLength(values.detailCaseIds, 'options.detailCaseIds', 'must be a list of caseIds');
      if (n > MAX_DETAIL_CASES) {
        fail('options.detailCaseIds', 'selects more than ' + MAX_DETAIL_CASES + ' cases (not truncated)');
      }
      out.detailCaseIds = requireSelection(snapshotList(values.detailCaseIds, n, 'options.detailCaseIds'),
        'options.detailCaseIds', indexById);
    }
    if (values.comparisonCaseIds !== undefined) {
      var m = listLength(values.comparisonCaseIds, 'options.comparisonCaseIds', 'must select exactly 2 cases');
      if (m !== 2) fail('options.comparisonCaseIds', 'must select exactly 2 cases');
      out.comparisonCaseIds = requireSelection(snapshotList(values.comparisonCaseIds, m, 'options.comparisonCaseIds'),
        'options.comparisonCaseIds', indexById);
    }
    return out;
  }

  // ============================================================
  // selected details（同じ context で計算し直し、batch の行と完全に照合する）
  // ============================================================

  function mismatch() {
    fail('selectedDetails', 'the re-executed case does not match the batch result');
  }

  /**
   * executor の結果と batch の行が、重なるすべての field で完全に一致することを確かめる（数値は ===。
   * 許容誤差を置かない）。1 つでも違えば review 全体を失敗にする。
   */
  function assertOverlap(result, row, batch, caseId) {
    var E = requireExecution();
    var mode = batch.pressureMode;
    var p = result.pressure;
    var calc = result.calculation;
    // 発行物の共通部分（同じ Pack・同じ単位）
    if (result.publicLabel !== batch.publicLabel) mismatch();
    if (result.units.length !== batch.units.length || result.units.height !== batch.units.height ||
        result.units.pressure !== batch.units.pressure) mismatch();
    // ケース・pane・寸法
    if (result.case.caseId !== caseId || row.caseId !== caseId) mismatch();
    if (result.case.paneId !== row.paneId || result.pane.paneId !== row.paneId) mismatch();
    if (result.case.glassType !== row.glassType) mismatch();
    if (result.pane.widthMm !== row.widthMm || result.pane.heightMm !== row.heightMm) mismatch();
    // floor / zone は有無と値の両方
    if (hasOwn(result.case, 'floor') !== hasOwn(row, 'floor') || result.case.floor !== row.floor) mismatch();
    if (hasOwn(result.case, 'zone') !== hasOwn(row, 'zone') || result.case.zone !== row.zone) mismatch();
    // 風圧の mode・出どころ・設計風圧
    if (p.mode !== mode) mismatch();
    if (p.pressureSource !== row.pressure.pressureSource || p.pressureSource !== E.PRESSURE_SOURCES[mode]) mismatch();
    if (p.designPressure !== row.designPressure || calc.designPressure !== row.designPressure) mismatch();
    // mode ごとの風圧（告示は符号付きの負圧、pressure map は負圧の大きさ）
    MODE_PRESSURE_FIELDS[mode].forEach(function (k) {
      if (!hasOwn(p, k) || !hasOwn(row.pressure, k) || p[k] !== row.pressure[k]) mismatch();
    });
    if (mode === MODE_CASE_DIRECT) {
      // case_direct は設計風圧だけ。正圧・負圧・floor / zone を風圧として持たない
      NOT_IN_CASE_DIRECT.forEach(function (k) { if (hasOwn(p, k)) mismatch(); });
    } else if (p.floor !== row.floor || p.zone !== row.zone) {
      mismatch();
    }
    // 推奨候補と件数
    var best = calc.bestCandidate;
    if ((best === null) !== (row.bestCandidate === null)) mismatch();
    if (best !== null && best.label !== row.bestCandidate.label) mismatch();
    if (best !== null && best.P !== row.bestCandidate.P) mismatch();
    if (calc.okCount !== row.okCount || calc.ngCount !== row.ngCount || calc.outOfScopeCount !== row.outOfScopeCount) {
      mismatch();
    }
  }

  function projectCandidate(c, where) {
    if (!isPlainObject(c)) fail(where, 'must be an object');
    if (CANDIDATE_STATUSES.indexOf(c.status) === -1) fail(where + '.status', 'is not supported');
    return {
      label: requireString(c.label, where + '.label'),
      P: requireFinite(c.P, where + '.P'),
      status: c.status
    };
  }

  /** 計算し直した結果から詳細を作る（allowlist の field だけ。trace・候補の detail は写さない）。 */
  function projectDetail(result, mode) {
    var at = 'selectedDetails';
    var calc = result.calculation;
    var p = result.pressure;
    var out = { caseId: result.case.caseId, paneId: result.pane.paneId };
    if (hasOwn(result.case, 'floor')) out.floor = requireString(result.case.floor, at + '.floor');
    if (hasOwn(result.case, 'zone')) out.zone = requireString(result.case.zone, at + '.zone');
    out.glassType = result.case.glassType;
    out.extraFactor = requirePositive(result.case.extraFactor, at + '.extraFactor');
    out.widthMm = result.pane.widthMm;
    out.heightMm = result.pane.heightMm;
    out.areaM2 = requirePositive(calc.areaM2, at + '.areaM2');
    out.pressureMode = mode;
    out.designPressure = calc.designPressure;
    out.pressureSource = p.pressureSource;
    MODE_PRESSURE_FIELDS[mode].forEach(function (k) { out[k] = requireFinite(p[k], at + '.' + k); });
    out.bestCandidate = calc.bestCandidate === null ? null : { label: calc.bestCandidate.label, P: calc.bestCandidate.P };
    // 照合済みの P と設計風圧から、行と同じ定義で求める
    var m = marginOf(out.bestCandidate, out.designPressure, at);
    out.marginRatio = m.ratio;
    out.marginPressure = m.pressure;
    out.okCount = calc.okCount;
    out.ngCount = calc.ngCount;
    out.outOfScopeCount = calc.outOfScopeCount;
    if (!Array.isArray(calc.candidates)) fail(at + '.candidates', 'must be a list');
    out.candidateSummary = calc.candidates.map(function (c, i) {
      return projectCandidate(c, at + '.candidateSummary[' + i + ']');
    });
    return out;
  }

  function reExecute(ctx, caseId) {
    var E = requireExecution();
    var result;
    try {
      result = E.executeCase(ctx, caseId);
      E.assertExecutionResult(result);
    } catch (e) {
      // 例外の中身（入力値・caseId）を外へ出さない
      fail('selectedDetails', 'a selected case could not be re-executed from the given context');
    }
    return result;
  }

  // ============================================================
  // buildPackReview
  // ============================================================

  var issued = new WeakSet();

  /**
   * batchResult（ProjectPackBatch の発行物で、ctx から発行されたもの）から review を作る。
   * options: { detailCaseIds?: string[]（最大 50）, comparisonCaseIds?: [string, string] }
   * 途中で 1 つでも失敗すれば review を返さない（部分的な review・以前の review を返さない）。
   */
  function buildPackReview(batchResult, ctx, options) {
    var B = requireBatch();
    requireExecution();
    // 1. 発行物で、この ctx（同じ instance）から発行されたものだけ
    B.assertBatchOrigin(batchResult, ctx);
    if (batchResult.trust !== TRUST || batchResult.sourceKind !== SOURCE_KIND) fail('batch', 'is not ' + TRUST);
    var mode = batchResult.pressureMode;
    if (!hasOwn(MODE_PRESSURE_FIELDS, mode)) fail('batch.pressureMode', 'is not supported');
    var batchRows = batchResult.rows;
    if (batchRows.length === 0 || batchRows.length !== batchResult.totalCases ||
        batchResult.executedCases !== batchResult.totalCases) {
      fail('batch', 'does not contain every declared case');
    }
    var indexById = Object.create(null);
    batchRows.forEach(function (row, i) {
      if (indexById[row.caseId] !== undefined) fail('batch.rows', 'contains a duplicated caseId');
      indexById[row.caseId] = i;
    });

    // 2. options
    var opts = readOptions(options, indexById);

    // 3. 全ケースの行と summary（batch の並びのまま。省かない・並べ替えない・切り詰めない）
    var rows = batchRows.map(function (row, i) { return projectRow(row, mode, i); });
    var summary = summarize(rows);

    // 4. grouping と比較
    var groups = {
      byRecommended: groupByRecommended(rows),
      byFloor: groupByLocation(rows, 'floor'),
      byZone: groupByLocation(rows, 'zone')
    };
    var comparison = opts.comparisonCaseIds === null ? null :
      compareRows(rows[indexById[opts.comparisonCaseIds[0]]], rows[indexById[opts.comparisonCaseIds[1]]], mode);

    // 5–6. 選んだケースを同じ ctx で計算し直し、batch の行と完全に照合する（選んだ順）
    var selectedDetails = opts.detailCaseIds.map(function (caseId) {
      var i = indexById[caseId];
      var result = reExecute(ctx, caseId);
      assertOverlap(result, batchRows[i], batchResult, caseId);
      return projectDetail(result, mode);
    });

    var review = {
      reviewType: REVIEW_TYPE,
      schemaVersion: SCHEMA_VERSION,
      sourceKind: SOURCE_KIND,
      trust: TRUST,
      interpretation: INTERPRETATION,
      publicLabel: requireString(batchResult.publicLabel, 'batch.publicLabel'),
      pressureMode: mode,
      units: {
        length: requireString(batchResult.units.length, 'batch.units.length'),
        height: requireString(batchResult.units.height, 'batch.units.height'),
        pressure: requireString(batchResult.units.pressure, 'batch.units.pressure'),
        area: requireString(Exec.UNITS && Exec.UNITS.area, 'execution.units.area')
      },
      totalCases: rows.length,
      rows: rows,
      summary: summary,
      groups: groups,
      selectedDetails: selectedDetails,
      comparison: comparison
    };

    // 7. 形の検査 → 8. deep-freeze → 9. 発行
    assertPackReviewShape(review);
    deepFreeze(review);
    issued.add(review);
    return review;
  }

  // ============================================================
  // review validation
  // ============================================================

  function walkForbidden(node, where, forbidden) {
    if (Array.isArray(node)) {
      node.forEach(function (v, i) { walkForbidden(v, where + '[' + i + ']', forbidden); });
      return;
    }
    if (node !== null && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        if (forbidden.indexOf(k) !== -1) fail(where + '.' + k, 'is not allowed in a Pack review');
        walkForbidden(node[k], where + '.' + k, forbidden);
      });
    }
  }

  function rowKeysFor(row, mode) {
    var keys = ROW_HEAD_KEYS.slice();
    LOCATION_KEYS.forEach(function (k) { if (hasOwn(row, k)) keys.push(k); });
    return keys.concat(ROW_BODY_KEYS, MODE_PRESSURE_FIELDS[mode], ROW_TAIL_KEYS);
  }

  function detailKeysFor(detail, mode) {
    var keys = DETAIL_HEAD_KEYS.slice();
    LOCATION_KEYS.forEach(function (k) { if (hasOwn(detail, k)) keys.push(k); });
    return keys.concat(DETAIL_BODY_KEYS, MODE_PRESSURE_FIELDS[mode], DETAIL_TAIL_KEYS);
  }

  function assertBest(best, where) {
    if (best === null) return;
    exactOrderedKeys(best, BEST_KEYS, where);
    requireString(best.label, where + '.label');
    requireFinite(best.P, where + '.P');
  }

  function assertMarginFields(r, where) {
    var m = marginOf(r.bestCandidate, r.designPressure, where);
    if (r.marginRatio !== m.ratio || r.marginPressure !== m.pressure) fail(where, 'margin does not match its definition');
  }

  function assertPartition(groups, rowIds, where) {
    var seen = Object.create(null);
    var total = 0;
    groups.forEach(function (g, i) {
      if (!Array.isArray(g.caseIds) || g.count !== g.caseIds.length || g.count < 1) fail(where + '[' + i + ']', 'count does not match');
      g.caseIds.forEach(function (id) {
        if (rowIds[id] === undefined || seen[id] === true) fail(where + '[' + i + ']', 'is not a partition of the cases');
        seen[id] = true;
      });
      // 組の中は batch の並び順
      for (var j = 1; j < g.caseIds.length; j++) {
        if (rowIds[g.caseIds[j - 1]] >= rowIds[g.caseIds[j]]) fail(where + '[' + i + ']', 'caseIds are not in batch order');
      }
      total += g.count;
    });
    if (total !== Object.keys(rowIds).length) fail(where, 'group totals do not match the case count');
  }

  function assertPackReviewShape(r) {
    var where = 'review';
    exactOrderedKeys(r, REVIEW_KEYS, where);
    if (r.reviewType !== REVIEW_TYPE) fail(where + '.reviewType', 'must be ' + REVIEW_TYPE);
    if (r.schemaVersion !== SCHEMA_VERSION) fail(where + '.schemaVersion', 'must be ' + SCHEMA_VERSION);
    if (r.sourceKind !== SOURCE_KIND) fail(where + '.sourceKind', 'must be ' + SOURCE_KIND);
    if (r.trust !== TRUST) fail(where + '.trust', 'must be ' + TRUST);
    if (r.interpretation !== INTERPRETATION) fail(where + '.interpretation', 'must be ' + INTERPRETATION);
    requireString(r.publicLabel, where + '.publicLabel');
    if (!hasOwn(MODE_PRESSURE_FIELDS, r.pressureMode)) fail(where + '.pressureMode', 'is not supported');
    var mode = r.pressureMode;
    exactOrderedKeys(r.units, UNIT_KEYS, where + '.units');
    requireCount(r.totalCases, where + '.totalCases');
    if (!Array.isArray(r.rows) || r.rows.length !== r.totalCases || r.totalCases < 1) {
      fail(where + '.rows', 'must contain every case');
    }

    var rowIds = Object.create(null);
    r.rows.forEach(function (row, i) {
      var at = where + '.rows[' + i + ']';
      exactOrderedKeys(row, rowKeysFor(row, mode), at);
      if (rowIds[row.caseId] !== undefined) fail(at + '.caseId', 'is duplicated');
      rowIds[row.caseId] = i;
      assertBest(row.bestCandidate, at + '.bestCandidate');
      if ((row.bestCandidate === null) !== (row.okCount === 0)) fail(at + '.bestCandidate', 'does not match the OK count');
      assertMarginFields(row, at);
    });

    // summary は行から決まる値と一致する
    exactOrderedKeys(r.summary, SUMMARY_KEYS, where + '.summary');
    var expected = summarize(r.rows);
    SUMMARY_KEYS.forEach(function (k) {
      var a = r.summary[k];
      var b = expected[k];
      if (Array.isArray(b) ? !Array.isArray(a) || a.join('|') !== b.join('|') : a !== b) {
        fail(where + '.summary.' + k, 'does not match the rows');
      }
    });

    exactOrderedKeys(r.groups, GROUP_KEYS, where + '.groups');
    if (!Array.isArray(r.groups.byRecommended) || !Array.isArray(r.groups.byFloor) || !Array.isArray(r.groups.byZone)) {
      fail(where + '.groups', 'must be lists');
    }
    r.groups.byRecommended.forEach(function (g, i) {
      exactOrderedKeys(g, RECOMMENDED_GROUP_KEYS, where + '.groups.byRecommended[' + i + ']');
      if (g.label !== null) requireString(g.label, where + '.groups.byRecommended[' + i + '].label');
    });
    [['byFloor', 'floor', FLOOR_GROUP_KEYS], ['byZone', 'zone', ZONE_GROUP_KEYS]].forEach(function (spec) {
      r.groups[spec[0]].forEach(function (g, i) {
        var at = where + '.groups.' + spec[0] + '[' + i + ']';
        exactOrderedKeys(g, spec[2], at);
        if (g.declared === true) requireString(g[spec[1]], at + '.' + spec[1]);
        else if (g.declared !== false || g[spec[1]] !== null) fail(at, 'an undeclared group has no value');
      });
    });
    assertPartition(r.groups.byRecommended, rowIds, where + '.groups.byRecommended');
    assertPartition(r.groups.byFloor, rowIds, where + '.groups.byFloor');
    assertPartition(r.groups.byZone, rowIds, where + '.groups.byZone');

    if (!Array.isArray(r.selectedDetails) || r.selectedDetails.length > MAX_DETAIL_CASES) {
      fail(where + '.selectedDetails', 'must be a list of at most ' + MAX_DETAIL_CASES);
    }
    var detailIds = Object.create(null);
    r.selectedDetails.forEach(function (d, i) {
      var at = where + '.selectedDetails[' + i + ']';
      exactOrderedKeys(d, detailKeysFor(d, mode), at);
      if (rowIds[d.caseId] === undefined || detailIds[d.caseId] === true) fail(at + '.caseId', 'is not a single case of the review');
      detailIds[d.caseId] = true;
      assertBest(d.bestCandidate, at + '.bestCandidate');
      assertMarginFields(d, at);
      if (!Array.isArray(d.candidateSummary)) fail(at + '.candidateSummary', 'must be a list');
      d.candidateSummary.forEach(function (c, j) { exactOrderedKeys(c, CANDIDATE_SUMMARY_KEYS, at + '.candidateSummary[' + j + ']'); });
    });

    if (r.comparison !== null) {
      var c = r.comparison;
      exactOrderedKeys(c, COMPARISON_KEYS, where + '.comparison');
      if (!Array.isArray(c.caseIds) || c.caseIds.length !== 2 || c.caseIds[0] === c.caseIds[1] ||
          rowIds[c.caseIds[0]] === undefined || rowIds[c.caseIds[1]] === undefined) {
        fail(where + '.comparison.caseIds', 'must be 2 cases of the review');
      }
      exactOrderedKeys(c.a, rowKeysFor(c.a, mode), where + '.comparison.a');
      exactOrderedKeys(c.b, rowKeysFor(c.b, mode), where + '.comparison.b');
      if (c.a.caseId !== c.caseIds[0] || c.b.caseId !== c.caseIds[1]) fail(where + '.comparison', 'sides do not match the caseIds');
      exactOrderedKeys(c.difference, ['widthMm', 'heightMm', 'designPressure'].concat(MODE_PRESSURE_FIELDS[mode], DIFFERENCE_TAIL_KEYS),
        where + '.comparison.difference');
      exactOrderedKeys(c.sameValue, SAME_VALUE_KEYS, where + '.comparison.sameValue');
    }

    walkForbidden(r, where, FORBIDDEN_KEYS);
    return r;
  }

  /** buildPackReview() が発行した review か（形を真似た object・JSON の複製は通らない）。 */
  function isPackReview(r) {
    return r !== null && typeof r === 'object' && issued.has(r);
  }

  function assertPackReview(r) {
    if (!isPackReview(r)) fail('review', 'was not issued by ProjectPackReview');
    return assertPackReviewShape(r);
  }

  return deepFreeze({
    REVIEW_TYPE: REVIEW_TYPE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SOURCE_KIND: SOURCE_KIND,
    TRUST: TRUST,
    INTERPRETATION: INTERPRETATION,
    MAX_DETAIL_CASES: MAX_DETAIL_CASES,
    buildPackReview: buildPackReview,
    isPackReview: isPackReview,
    assertPackReview: assertPackReview
  });
});
