/**
 * project-config/project-pack-execution.js
 *
 * Project Pack Case Execution（Phase 2L-B2 / S3-B2）。案件非依存の pure module。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * ProjectContext.fromProjectPack() が発行した context（未レビューの Project Pack）から、
 * 利用者が明示的に選んだ caseId の 1 ケースだけを計算する:
 *
 *   ProjectContext（project_pack_unreviewed / pack_unreviewed）
 *     → case の解決（caseId 完全一致） → pane の解決（paneId 完全一致）
 *     → 風圧の解決（pressureModel.mode ごと） → GlassCalc の候補判定
 *     → Pack Case Execution result（deep-frozen）
 *
 * ── これは何でないか ─────────────────────────────────────
 *
 * 入力 package（Phase 2D の versioned package）ではない。その sourceKind・schemaVersion を
 * 増やさず、Pack の case をそちらへ変換しない。Workspace・Scenario・Review・export・
 * Evidence・Closure・Promotion のどれにもつながらない。
 *
 * 結果は「計算済み」であって「検証済み」ではない。trust は最後まで pack_unreviewed で、
 * Pack の出典の申告（claimedLevel など）は読まない。計算したことで Evidence が増える経路は無い。
 * wind-pressure.js が返す provenance（計算式側の検証状況）も結果へ写さない。それは計算式の
 * 出どころであって、Pack の入力の trust ではないからである。
 *
 * 1 回に 1 ケースだけ。全ケースの一括実行は持たない。
 *
 * ── fail closed ─────────────────────────────────────────
 *
 * - 受け取るのは ProjectContext.fromProjectPack() が発行した context だけ。built-in の context、
 *   形を真似た object、生の Pack、validate 済みの Pack object はすべて拒否する。
 * - case・pane・評価高さ・正圧の階・負圧の部位・ケース別の設計風圧は、すべて完全一致で
 *   ちょうど 1 件を要求する。0 件・複数件なら失敗する。先頭の行・先頭の pane・別の case へは
 *   fallback しない（validator が通常は防いでいても、この境界でも黙って補わない）。
 * - case_direct の designPressure を正圧・負圧へ分けない。入力に無い floor / zone を作らない。
 *
 * 計算式は持たない。風圧は wind-pressure.js、ガラスは calc.js の既存の関数を呼ぶだけ。
 * 副作用（DOM・保存・通信）は無い。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして
 * 提供する（<script src> と require() の両対応）。ブラウザでは calc.js・wind-pressure.js・
 * project-config/project-context.js の後に読み込むこと。依存は最初の呼び出しで解決するので、
 * それらが読み込めない page でも読み込み自体は失敗しない（呼び出しが失敗する）。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectPackExecution = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  function resolveDependency(globalName, requirePath, label) {
    if (global && global[globalName]) {
      return global[globalName];
    }
    if (typeof require === 'function') {
      try {
        return require(requirePath);
      } catch (e) {
        /* fallthrough */
      }
    }
    throw new Error('project-pack-execution.js: ' + label + ' is required but not available');
  }

  // 依存は呼ばれたときに解決する。読み込みの時点では例外を投げない: ProjectContext などが
  // 読み込めない page でも、この module のせいで page 全体が止まらないようにする
  // （そのときは呼び出しが失敗し、画面は固定文の失敗表示になる。fail closed は変わらない）。
  var Context, Wind, Glass;
  var dependenciesReady = false;
  function requireDependencies() {
    if (dependenciesReady) return;
    var context = resolveDependency('ProjectContext', './project-context.js', 'project-config/project-context.js');
    var wind = resolveDependency('WindPressure', '../wind-pressure.js', 'wind-pressure.js');
    var glass = resolveDependency('GlassCalc', '../calc.js', 'calc.js');
    // trust は ProjectContext の規則（sourceKind からだけ決まる）と一致していなければ使わない
    if (!context.TRUST_BY_SOURCE_KIND || context.TRUST_BY_SOURCE_KIND[SOURCE_KIND] !== TRUST) {
      throw new Error('project-pack-execution.js: ProjectContext trust for ' + SOURCE_KIND + ' is not ' + TRUST);
    }
    Context = context;
    Wind = wind;
    Glass = glass;
    dependenciesReady = true;
  }

  // ============================================================
  // Contract
  // ============================================================

  var EXECUTION_TYPE = 'glass_wind_project_pack_case_execution';
  var SCHEMA_VERSION = 1;
  var SOURCE_KIND = 'project_pack_unreviewed';
  var TRUST = 'pack_unreviewed';

  var MODE_NOTIFICATION = 'notification1458';
  var MODE_PRESSURE_MAP = 'project_pressure_map';
  var MODE_CASE_DIRECT = 'case_direct';

  /** 単位は量ごとに 1 つ。変換はしない（Project Pack の単位と一致することを test が確かめる）。 */
  var UNITS = { length: 'mm', height: 'm', speed: 'm/s', pressure: 'N/m²', area: 'm²' };

  /** 風圧の出どころ（表示・判別用の語。trust ではない）。 */
  var PRESSURE_SOURCES = {};
  PRESSURE_SOURCES[MODE_NOTIFICATION] = 'pack_notification_calculation';
  PRESSURE_SOURCES[MODE_PRESSURE_MAP] = 'pack_pressure_map_lookup';
  PRESSURE_SOURCES[MODE_CASE_DIRECT] = 'pack_case_direct';

  var RESULT_KEYS = ['executionType', 'schemaVersion', 'sourceKind', 'trust', 'publicLabel', 'units',
    'case', 'pane', 'pressure', 'calculation'];
  var CASE_REQUIRED = ['caseId', 'paneId', 'glassType', 'extraFactor'];
  var CASE_OPTIONAL = ['floor', 'zone'];
  var PANE_KEYS = ['paneId', 'widthMm', 'heightMm'];
  var PRESSURE_KEYS = {};
  PRESSURE_KEYS[MODE_NOTIFICATION] = ['mode', 'pressureSource', 'floor', 'zone', 'evaluationHeightM',
    'positivePressure', 'negativePressure', 'designPressure', 'notificationTrace'];
  PRESSURE_KEYS[MODE_PRESSURE_MAP] = ['mode', 'pressureSource', 'floor', 'zone', 'positivePressure',
    'negativePressureMagnitude', 'designPressure'];
  PRESSURE_KEYS[MODE_CASE_DIRECT] = ['mode', 'pressureSource', 'designPressure'];
  var NOTIFICATION_TRACE_KEYS = ['inputs', 'normalized', 'positive', 'negative', 'geometry', 'trace'];
  var CALCULATION_KEYS = ['areaM2', 'designPressure', 'bestCandidate', 'okCount', 'ngCount',
    'outOfScopeCount', 'candidates'];
  var BEST_KEYS = ['label', 'P', 'status', 'detail'];

  /**
   * 結果のどの階層にも置かない key。検証・承認・Evidence・昇格・出典の申告・計算式側の
   * provenance を、計算結果の一部として読ませない。
   */
  var FORBIDDEN_KEYS = ['verified', 'approved', 'reviewed', 'attested', 'attestation', 'canonicalEvidence',
    'promotionCandidate', 'provenance', 'verificationStatus', 'formulaVerificationStatus', 'formulaSource',
    'evidence', 'evidenceKind', 'sourceClaim', 'sourceScopes', 'records', 'claimedLevel',
    'privateReferenceAvailable', 'claimedPrivateReferenceAvailable', 'publicationAdvisories'];

  // ============================================================
  // helpers
  // ============================================================

  function fail(where, message) {
    throw new Error('ProjectPackExecution: ' + where + ': ' + message);
  }

  function show(value) {
    var s = JSON.stringify(value);
    if (typeof s !== 'string') return String(value);
    return s.length > 48 ? s.slice(0, 45) + '...' : s;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (k) { deepFreeze(value[k]); });
    }
    return value;
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) &&
      Object.getPrototypeOf(v) === Object.prototype;
  }

  /** 純粋な data だけを複製する（呼び出し側・依存 module の object を共有しない）。 */
  function copyData(value, where) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!isFinite(value)) fail(where, 'number must be finite');
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(function (v, i) { return copyData(v, where + '[' + i + ']'); });
    }
    if (isPlainObject(value)) {
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = copyData(value[k], where + '.' + k); });
      return out;
    }
    fail(where, 'unsupported value type ' + show(typeof value));
  }

  function exactKeys(obj, required, optional, where) {
    if (!isPlainObject(obj)) fail(where, 'must be a plain object');
    var allowed = required.concat(optional || []);
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) === -1) fail(where, 'unexpected field ' + show(k));
    });
    required.forEach(function (k) {
      if (!hasOwn(obj, k)) fail(where, 'missing required field ' + show(k));
    });
  }

  function requireFinite(value, where) {
    if (typeof value !== 'number' || !isFinite(value)) fail(where, 'must be a finite number');
    return value;
  }

  function requirePositive(value, where) {
    requireFinite(value, where);
    if (!(value > 0)) fail(where, 'must be greater than 0');
    return value;
  }

  /** { value, unit } の量から値だけを取り出す。単位が違えば変換せずに失敗する。 */
  function quantity(q, unit, where) {
    if (!isPlainObject(q) || q.unit !== unit) fail(where, 'must be a quantity in ' + unit);
    return requireFinite(q.value, where + '.value');
  }

  /** key が value に完全一致する行がちょうど 1 件であることを要求する（先頭・index へ fallback しない）。 */
  function exactlyOne(rows, key, value, where) {
    if (!Array.isArray(rows)) fail(where, 'is not a list');
    var hits = rows.filter(function (r) { return isPlainObject(r) && r[key] === value; });
    if (hits.length === 0) fail(where, 'no entry with ' + key + ' ' + show(value));
    if (hits.length > 1) fail(where, hits.length + ' entries with ' + key + ' ' + show(value) + ' (ambiguous)');
    return hits[0];
  }

  // ============================================================
  // genuine-context gate
  // ============================================================

  /**
   * ProjectContext.fromProjectPack() が発行した context だけを通す。
   * assertProjectContext() は adapter が発行していない object（形を真似た object・生の Pack・
   * validate 済みの Pack object）を拒否し、ここで sourceKind / trust が Pack のものかを確かめる
   * （built-in の context を拒否する）。
   */
  function requirePackContext(ctx, where) {
    requireDependencies();
    Context.assertProjectContext(ctx);
    if (ctx.sourceKind !== SOURCE_KIND) fail(where, 'requires a ' + SOURCE_KIND + ' context (got ' + show(ctx.sourceKind) + ')');
    if (ctx.trust !== TRUST) fail(where, 'requires trust ' + TRUST + ' (got ' + show(ctx.trust) + ')');
    var mode = ctx.pressureModel.mode;
    if (!hasOwn(PRESSURE_SOURCES, mode)) fail(where + '.pressureModel.mode', 'is not supported: ' + show(mode));
    return ctx;
  }

  /** 実行できる caseId の一覧（context の並び順）。 */
  function listCaseIds(ctx) {
    requirePackContext(ctx, 'listCaseIds');
    var cases = Context.requireCapability(ctx, 'declaredGlazingCases').glazingCases;
    return deepFreeze(cases.map(function (c) { return c.caseId; }));
  }

  // ============================================================
  // pressure resolution（mode ごと。曖昧な fallback なし）
  // ============================================================

  function requireCaseField(c, field, where) {
    if (!hasOwn(c, field) || typeof c[field] !== 'string' || c[field] === '') {
      fail(where, 'the case has no ' + field + ' (required for this pressure model)');
    }
    return c[field];
  }

  function resolveNotification(ctx, c) {
    var where = 'notificationCalculation';
    var wc = Context.requireCapability(ctx, 'notificationCalculation').windConditions;
    var floor = requireCaseField(c, 'floor', where);
    var zone = requireCaseField(c, 'zone', where);
    var row = exactlyOne(wc.evaluationHeights, 'floor', floor, where + '.evaluationHeights');
    var input = {
      V0: quantity(wc.V0, UNITS.speed, where + '.V0'),
      roughnessCategory: wc.roughnessCategory,
      buildingHeightM: quantity(wc.buildingHeightM, UNITS.height, where + '.buildingHeightM'),
      eavesHeightM: quantity(wc.eavesHeightM, UNITS.height, where + '.eavesHeightM'),
      evaluationHeightM: quantity(row.height, UNITS.height, where + '.evaluationHeights.height'),
      buildingType: wc.buildingType,
      zone: zone,
      basis: wc.basis
    };
    if (hasOwn(wc, 'recurrenceYears')) input.recurrenceYears = wc.recurrenceYears;
    if (hasOwn(wc, 'buildingShortSideM')) {
      input.buildingShortSideM = quantity(wc.buildingShortSideM, UNITS.height, where + '.buildingShortSideM');
    }
    var r = Wind.calculateWindPressure(input);
    // 計算式側の provenance は写さない。数値と計算の trace だけを持つ。
    return {
      mode: MODE_NOTIFICATION,
      pressureSource: PRESSURE_SOURCES[MODE_NOTIFICATION],
      floor: floor,
      zone: zone,
      evaluationHeightM: input.evaluationHeightM,
      positivePressure: requireFinite(r.positive.pressure, where + '.positive.pressure'),
      negativePressure: requireFinite(r.negative.pressure, where + '.negative.pressure'),
      designPressure: requirePositive(r.designPressure, where + '.designPressure'),
      notificationTrace: {
        inputs: copyData(r.inputs, where + '.inputs'),
        normalized: copyData(r.normalized, where + '.normalized'),
        positive: copyData(r.positive, where + '.positive'),
        negative: copyData(r.negative, where + '.negative'),
        geometry: copyData(r.geometry, where + '.geometry'),
        trace: copyData(r.trace, where + '.trace')
      }
    };
  }

  function resolvePressureMap(ctx, c) {
    var where = 'projectPressureMap';
    var map = Context.requireCapability(ctx, 'projectPressureMap');
    var floor = requireCaseField(c, 'floor', where);
    var zone = requireCaseField(c, 'zone', where);
    var pos = exactlyOne(map.positivePressures, 'floor', floor, where + '.positivePressures');
    var neg = exactlyOne(map.negativePressures, 'zone', zone, where + '.negativePressures');
    var positive = quantity(pos.pressure, UNITS.pressure, where + '.positivePressures.pressure');
    var negativeMagnitude = quantity(neg.magnitude, UNITS.pressure, where + '.negativePressures.magnitude');
    if (negativeMagnitude < 0) fail(where + '.negativePressures.magnitude', 'must be a magnitude (not signed)');
    return {
      mode: MODE_PRESSURE_MAP,
      pressureSource: PRESSURE_SOURCES[MODE_PRESSURE_MAP],
      floor: floor,
      zone: zone,
      positivePressure: positive,
      negativePressureMagnitude: negativeMagnitude,
      designPressure: requirePositive(Math.max(Math.abs(positive), negativeMagnitude), where + '.designPressure')
    };
  }

  function resolveCaseDirect(ctx, c) {
    var where = 'caseDirectPressure';
    var direct = Context.requireCapability(ctx, 'caseDirectPressure');
    var row = exactlyOne(direct.designPressures, 'caseId', c.caseId, where + '.designPressures');
    // case の designPressure だけが風圧の正。正圧・負圧へ分けず、floor / zone も使わない。
    return {
      mode: MODE_CASE_DIRECT,
      pressureSource: PRESSURE_SOURCES[MODE_CASE_DIRECT],
      designPressure: requirePositive(quantity(row.designPressure, UNITS.pressure, where + '.designPressure'),
        where + '.designPressure')
    };
  }

  function resolvePressure(ctx, c) {
    var mode = ctx.pressureModel.mode;
    // mode と capability は 1 対 1（ProjectContext の規則）。対応しない組み合わせは requireCapability が拒否する
    if (Context.PRESSURE_CAPABILITY_BY_MODE[mode] === undefined) fail('pressureModel.mode', 'has no capability');
    if (mode === MODE_NOTIFICATION) return resolveNotification(ctx, c);
    if (mode === MODE_PRESSURE_MAP) return resolvePressureMap(ctx, c);
    if (mode === MODE_CASE_DIRECT) return resolveCaseDirect(ctx, c);
    fail('pressureModel.mode', 'is not supported: ' + show(mode));
  }

  // ============================================================
  // execution
  // ============================================================

  var issued = new WeakSet();

  function countStatus(candidates, status) {
    return candidates.filter(function (x) { return x.status === status; }).length;
  }

  /**
   * 1 ケースだけを計算する。ctx は ProjectContext.fromProjectPack() の発行物、caseId は
   * その context の declared glazing case の caseId（完全一致）。
   */
  function executeCase(ctx, caseId) {
    requirePackContext(ctx, 'executeCase');
    if (typeof caseId !== 'string' || caseId === '') fail('executeCase', 'caseId must be a non-empty string');

    var cases = Context.requireCapability(ctx, 'declaredGlazingCases').glazingCases;
    var c = exactlyOne(cases, 'caseId', caseId, 'declaredGlazingCases');
    var panes = Context.requireCapability(ctx, 'declaredPanes').panes;
    var pane = exactlyOne(panes, 'paneId', c.paneId, 'declaredPanes');
    var widthMm = requirePositive(quantity(pane.widthMm, UNITS.length, 'declaredPanes.widthMm'), 'pane.widthMm');
    var heightMm = requirePositive(quantity(pane.heightMm, UNITS.length, 'declaredPanes.heightMm'), 'pane.heightMm');
    if (!hasOwn(Glass.GLASS_TYPES, c.glassType)) fail('case.glassType', 'is not a known glass type ' + show(c.glassType));
    var extraFactor = requirePositive(c.extraFactor, 'case.extraFactor');

    var pressure = resolvePressure(ctx, c);

    var areaM2 = Glass.paneAreaM2(widthMm, heightMm);
    var all = Glass.generateCandidates(c.glassType, areaM2, pressure.designPressure, extraFactor);
    var split = Glass.splitCandidates(all);
    var best = split.okCandidates.length > 0 ? split.okCandidates[0] : null;
    var sorted = Glass.sortCandidates(all);

    // 入力に無い floor / zone は作らない
    var caseOut = { caseId: c.caseId, paneId: c.paneId, glassType: c.glassType, extraFactor: extraFactor };
    if (hasOwn(c, 'floor')) caseOut.floor = c.floor;
    if (hasOwn(c, 'zone')) caseOut.zone = c.zone;

    var result = {
      executionType: EXECUTION_TYPE,
      schemaVersion: SCHEMA_VERSION,
      sourceKind: SOURCE_KIND,
      trust: TRUST,
      publicLabel: ctx.publicLabel,
      units: { length: UNITS.length, height: UNITS.height, pressure: UNITS.pressure, area: UNITS.area },
      case: caseOut,
      pane: { paneId: pane.paneId, widthMm: widthMm, heightMm: heightMm },
      pressure: pressure,
      calculation: {
        areaM2: areaM2,
        designPressure: pressure.designPressure,
        bestCandidate: best ? { label: best.label, P: best.P, status: best.status, detail: best.detail } : null,
        okCount: split.okCandidates.length,
        ngCount: split.ngCandidates.length,
        outOfScopeCount: split.outOfScopeCandidates.length,
        candidates: sorted
      }
    };
    var out = deepFreeze(copyData(result, 'result'));
    assertExecutionResultShape(out);
    issued.add(out);
    return out;
  }

  // ============================================================
  // result validation
  // ============================================================

  function walkForbidden(node, where) {
    if (Array.isArray(node)) {
      node.forEach(function (v, i) { walkForbidden(v, where + '[' + i + ']'); });
      return;
    }
    if (node !== null && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        if (FORBIDDEN_KEYS.indexOf(k) !== -1) fail(where + '.' + k, 'is not allowed in a Pack case execution result');
        walkForbidden(node[k], where + '.' + k);
      });
    }
  }

  function assertExecutionResultShape(r) {
    var where = 'result';
    exactKeys(r, RESULT_KEYS, [], where);
    if (r.executionType !== EXECUTION_TYPE) fail(where + '.executionType', 'must be ' + show(EXECUTION_TYPE));
    if (r.schemaVersion !== SCHEMA_VERSION) fail(where + '.schemaVersion', 'must be ' + SCHEMA_VERSION);
    if (r.sourceKind !== SOURCE_KIND) fail(where + '.sourceKind', 'must be ' + show(SOURCE_KIND));
    if (r.trust !== TRUST) fail(where + '.trust', 'must be ' + show(TRUST));
    if (typeof r.publicLabel !== 'string' || r.publicLabel === '') fail(where + '.publicLabel', 'must be a non-empty string');
    exactKeys(r.units, ['length', 'height', 'pressure', 'area'], [], where + '.units');
    exactKeys(r.case, CASE_REQUIRED, CASE_OPTIONAL, where + '.case');
    exactKeys(r.pane, PANE_KEYS, [], where + '.pane');
    if (r.pane.paneId !== r.case.paneId) fail(where + '.pane.paneId', 'does not match the case');
    var mode = r.pressure && r.pressure.mode;
    if (!hasOwn(PRESSURE_KEYS, mode)) fail(where + '.pressure.mode', 'is not supported');
    exactKeys(r.pressure, PRESSURE_KEYS[mode], [], where + '.pressure');
    if (r.pressure.pressureSource !== PRESSURE_SOURCES[mode]) fail(where + '.pressure.pressureSource', 'does not match the mode');
    if (mode === MODE_NOTIFICATION) exactKeys(r.pressure.notificationTrace, NOTIFICATION_TRACE_KEYS, [], where + '.pressure.notificationTrace');
    exactKeys(r.calculation, CALCULATION_KEYS, [], where + '.calculation');
    if (r.calculation.designPressure !== r.pressure.designPressure) {
      fail(where + '.calculation.designPressure', 'does not match the resolved pressure');
    }
    if (r.calculation.bestCandidate !== null) {
      exactKeys(r.calculation.bestCandidate, BEST_KEYS, [], where + '.calculation.bestCandidate');
      if (r.calculation.bestCandidate.status !== 'ok') fail(where + '.calculation.bestCandidate.status', 'must be ok');
    }
    var cands = r.calculation.candidates;
    if (!Array.isArray(cands)) fail(where + '.calculation.candidates', 'must be a list');
    if (countStatus(cands, 'ok') !== r.calculation.okCount || countStatus(cands, 'ng') !== r.calculation.ngCount ||
        countStatus(cands, 'out_of_scope') !== r.calculation.outOfScopeCount) {
      fail(where + '.calculation', 'candidate counts do not match the candidates');
    }
    walkForbidden(r, where);
    return r;
  }

  /** executeCase() が発行した結果か（形を真似た object は通らない）。 */
  function isExecutionResult(r) {
    return r !== null && typeof r === 'object' && issued.has(r);
  }

  function assertExecutionResult(r) {
    if (!isExecutionResult(r)) fail('result', 'was not issued by ProjectPackExecution.executeCase()');
    return assertExecutionResultShape(r);
  }

  return deepFreeze({
    EXECUTION_TYPE: EXECUTION_TYPE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SOURCE_KIND: SOURCE_KIND,
    TRUST: TRUST,
    UNITS: UNITS,
    PRESSURE_SOURCES: PRESSURE_SOURCES,
    FORBIDDEN_KEYS: FORBIDDEN_KEYS,
    listCaseIds: listCaseIds,
    executeCase: executeCase,
    isExecutionResult: isExecutionResult,
    assertExecutionResult: assertExecutionResult
  });
});
