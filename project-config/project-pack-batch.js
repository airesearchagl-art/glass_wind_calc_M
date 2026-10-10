/**
 * project-config/project-pack-batch.js
 *
 * Project Pack Multi-Case Execution（Phase 2L-B2 / S3-B3A）。案件非依存の pure module。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * staged の Project Pack の全ケースを、既存の ProjectPackExecution.executeCase() で 1 ケースずつ
 * 計算し、表示用の小さな summary 行へまとめる:
 *
 *   ProjectPackExecution.listCaseIds(ctx)  … ケースの並び（executor の gate を通る）
 *     → ケースごとに ProjectPackExecution.executeCase(ctx, caseId)（発行物であることを確かめる）
 *     → summary 行（寸法・設計風圧・推奨候補・件数だけ。候補の全件や風圧の trace は複製しない）
 *     → 全ケースがそろったときだけ batch result（deep-frozen）
 *
 * 計算はすべて executor に任せる。この module は風圧・ガラスの式、pressure map の参照、
 * case_direct の扱いを持たない（executor の結果を写すだけ）。
 *
 * ── 少しずつ進める ───────────────────────────────────────
 *
 * createBatchRun(ctx) が返す run は nextChunk(n) で最大 n ケースだけを同期的に計算する。
 * 画面側はチャンクの間でイベントループへ制御を戻し、進捗の表示・キャンセルができる。
 * タイマーや DOM はこの module に無い（呼び出し側の責務）。
 *
 * finish() は、全ケースが計算済みで、行の数・並び・caseId の一意性が listCaseIds() と一致する
 * ときだけ結果を発行する。1 ケースでも失敗した run は以後使えず、途中までの行は外へ出さない
 * （部分的な結果を完了として確定しない）。
 *
 * ── これは何でないか ─────────────────────────────────────
 *
 * 結果は「計算済み」であって「検証済み」ではない。trust は最後まで pack_unreviewed で、
 * 出典の申告は読まない。入力 package・Workspace・Scenario・export・Review・Closure・Evidence・
 * Promotion のどれにもつながらない。active context を読まない。
 *
 * ── 発行元の context（S3-B3B2-A0） ─────────────────────────
 *
 * 発行した結果ごとに、その結果を作った context（createBatchRun に渡され、executor の gate を通った
 * instance）を module private の WeakMap に記録する。assertBatchOrigin(batchResult, ctx) は、
 * 発行物であること・記録された context と ctx が同じ instance であることを確かめる。比較は object の
 * 同一性だけで、publicLabel・mode・caseId・値の一致・JSON・hash では代用しない（内容が同じでも別の
 * instance なら拒否する）。記録は結果の object に載せない（key・schema・JSON / CSV は変わらない）。
 * 記録を作るのは、全ケースが成功して結果の形の検査を通った finish() の中だけ。
 *
 * ── 依存 ─────────────────────────────────────────────────
 *
 * 依存は ProjectPackExecution だけで、この module の初期化時に 1 度だけ掴む（後から global を
 * 読み直さない。初期化時に無ければ null を持ち、呼び出しが fail closed になる。読み込み自体は
 * 失敗しない）。別の trust の根を作らない: context の検査は executor の gate に任せる。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして
 * 提供する（<script src> と require() の両対応）。ブラウザでは
 * project-config/project-pack-execution.js の後に読み込むこと。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectPackBatch = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  // ============================================================
  // Contract
  // ============================================================

  var BATCH_TYPE = 'glass_wind_project_pack_batch_execution';
  var SCHEMA_VERSION = 1;
  var SOURCE_KIND = 'project_pack_unreviewed';
  var TRUST = 'pack_unreviewed';
  var MAX_CHUNK = 500;

  var RESULT_KEYS = ['batchType', 'schemaVersion', 'sourceKind', 'trust', 'publicLabel', 'pressureMode',
    'units', 'totalCases', 'executedCases', 'rows'];
  var ROW_REQUIRED = ['caseId', 'paneId', 'glassType', 'widthMm', 'heightMm', 'designPressure', 'pressure',
    'bestCandidate', 'okCount', 'ngCount', 'outOfScopeCount'];
  var ROW_OPTIONAL = ['floor', 'zone'];
  var BEST_KEYS = ['label', 'P'];
  // 行に写す風圧の値（mode ごと）。executor の結果にある値をそのまま写すだけで、作らない。
  // 風圧の trace・候補の全件は写さない。case_direct は設計風圧だけ（正圧・負圧に分けない）。
  var ROW_PRESSURE_KEYS = {
    notification1458: ['pressureSource', 'evaluationHeightM', 'positivePressure', 'negativePressure'],
    project_pressure_map: ['pressureSource', 'positivePressure', 'negativePressureMagnitude'],
    case_direct: ['pressureSource']
  };

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

  var CAPTURED_EXECUTION = captureDependency('ProjectPackExecution', './project-pack-execution.js');
  var Exec = null;

  function requireExecution() {
    if (Exec) return Exec;
    if (!CAPTURED_EXECUTION) {
      throw new Error('project-pack-batch.js: project-config/project-pack-execution.js is required but not available ' +
        '(it was not loaded when this module was initialised)');
    }
    // executor の trust と一致していなければ使わない（trust の規則を 2 つ持たない）
    if (CAPTURED_EXECUTION.TRUST !== TRUST || CAPTURED_EXECUTION.SOURCE_KIND !== SOURCE_KIND) {
      throw new Error('project-pack-batch.js: ProjectPackExecution trust is not ' + TRUST);
    }
    Exec = CAPTURED_EXECUTION;
    return Exec;
  }

  // ============================================================
  // helpers
  // ============================================================

  function fail(where, message) {
    throw new Error('ProjectPackBatch: ' + where + ': ' + message);
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

  function exactKeys(obj, required, optional, where) {
    if (!isPlainObject(obj)) fail(where, 'must be an object');
    var allowed = required.concat(optional || []);
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) === -1) fail(where, 'unexpected field ' + JSON.stringify(k));
    });
    required.forEach(function (k) {
      if (!hasOwn(obj, k)) fail(where, 'missing required field ' + JSON.stringify(k));
    });
  }

  function requireCount(v, where) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || Math.floor(v) !== v) fail(where, 'must be a count');
    return v;
  }

  function requirePositive(v, where) {
    if (typeof v !== 'number' || !isFinite(v) || !(v > 0)) fail(where, 'must be a positive number');
    return v;
  }

  // ============================================================
  // summary（executor の発行物から、表示に要る値だけを写す）
  // ============================================================

  function summarize(result, expectedCaseId) {
    var E = requireExecution();
    // executor が発行した結果だけを使う（形の検証も executor が行う）
    E.assertExecutionResult(result);
    if (result.case.caseId !== expectedCaseId) fail('row', 'executor returned a different case');
    var calc = result.calculation;
    var keys = ROW_PRESSURE_KEYS[result.pressure.mode];
    if (!keys) fail('row.pressure', 'mode is not supported');
    var pressure = {};
    keys.forEach(function (k) {
      if (!hasOwn(result.pressure, k)) fail('row.pressure', 'executor result has no ' + k);
      pressure[k] = result.pressure[k];
    });
    var row = {
      caseId: result.case.caseId,
      paneId: result.pane.paneId,
      glassType: result.case.glassType,
      widthMm: result.pane.widthMm,
      heightMm: result.pane.heightMm,
      designPressure: calc.designPressure,
      pressure: pressure,
      bestCandidate: calc.bestCandidate ? { label: calc.bestCandidate.label, P: calc.bestCandidate.P } : null,
      okCount: calc.okCount,
      ngCount: calc.ngCount,
      outOfScopeCount: calc.outOfScopeCount
    };
    // floor / zone は Pack にあるときだけ（executor の結果の case にあるものだけを写す）
    if (hasOwn(result.case, 'floor')) row.floor = result.case.floor;
    if (hasOwn(result.case, 'zone')) row.zone = result.case.zone;
    return row;
  }

  // ============================================================
  // run
  // ============================================================

  var issued = new WeakSet();
  // 発行した結果 → その結果を作った context（module private。外へ出さない・保存しない）
  var originByBatch = new WeakMap();

  /**
   * ctx の全ケースを計算する run を作る。ctx の検査は executor の gate（listCaseIds）が行う。
   * run.nextChunk(n) で最大 n ケースを同期的に計算し、run.finish() で結果を発行する。
   */
  function createBatchRun(ctx) {
    var E = requireExecution();
    var caseIds = E.listCaseIds(ctx);   // genuine な Pack context でなければここで失敗する
    var originContext = ctx;            // gate を通った instance。発行時にこの結果の発行元として記録する
    var seen = Object.create(null);
    caseIds.forEach(function (id) {
      if (typeof id !== 'string' || id === '') fail('caseIds', 'must be non-empty strings');
      if (seen[id] === true) fail('caseIds', 'duplicate caseId ' + JSON.stringify(id));
      seen[id] = true;
    });
    var publicLabel = ctx.publicLabel;
    var pressureMode = ctx.pressureModel.mode;
    var units = { length: E.UNITS.length, height: E.UNITS.height, pressure: E.UNITS.pressure };
    var rows = [];
    var state = 'running';   // running → done → finished、または failed / cancelled

    function nextChunk(maxCases) {
      if (state === 'failed') fail('run', 'has failed and cannot continue');
      if (state === 'cancelled') fail('run', 'was cancelled');
      if (state !== 'running') fail('run', 'has no remaining cases');
      var n = Math.floor(maxCases);
      if (!(n >= 1 && n <= MAX_CHUNK)) fail('nextChunk', 'chunk size must be between 1 and ' + MAX_CHUNK);
      try {
        var end = Math.min(rows.length + n, caseIds.length);
        for (var i = rows.length; i < end; i++) {
          var result = E.executeCase(ctx, caseIds[i]);
          if (result.publicLabel !== publicLabel || result.pressure.mode !== pressureMode ||
              result.units.length !== units.length || result.units.pressure !== units.pressure) {
            fail('row', 'result does not belong to this Pack');
          }
          rows.push(summarize(result, caseIds[i]));
        }
      } catch (e) {
        // 1 ケースでも失敗したら run 全体を失敗にする。途中までの行は捨てる
        state = 'failed';
        rows = [];
        throw e;
      }
      if (rows.length === caseIds.length) state = 'done';
      return rows.length;
    }

    /** 中止する。途中までの行は捨て、以後この run は使えない。 */
    function cancel() {
      if (state === 'finished') return false;
      state = 'cancelled';
      rows = [];
      return true;
    }

    function finish() {
      if (state !== 'done') fail('finish', state === 'running' ? 'not every case has been executed' : 'the run was ' + state);
      if (rows.length !== caseIds.length) fail('finish', 'row count does not match the declared cases');
      rows.forEach(function (r, i) {
        if (r.caseId !== caseIds[i]) fail('finish', 'row order does not match the declared cases');
      });
      var result = deepFreeze({
        batchType: BATCH_TYPE,
        schemaVersion: SCHEMA_VERSION,
        sourceKind: SOURCE_KIND,
        trust: TRUST,
        publicLabel: publicLabel,
        pressureMode: pressureMode,
        units: units,
        totalCases: caseIds.length,
        executedCases: rows.length,
        rows: rows.slice()
      });
      assertBatchResultShape(result, caseIds);
      // 全ケースが成功し、形の検査も通った後でだけ、発行元を記録して発行する
      originByBatch.set(result, originContext);
      issued.add(result);
      state = 'finished';
      return result;
    }

    return Object.freeze({
      total: caseIds.length,
      caseIds: caseIds,
      executed: function () { return rows.length; },
      isDone: function () { return state === 'done'; },
      hasFailed: function () { return state === 'failed'; },
      nextChunk: nextChunk,
      cancel: cancel,
      finish: finish
    });
  }

  /** 全ケースを一度に計算する（テスト・小さな Pack 用。画面はチャンクで進める）。 */
  function executeAll(ctx) {
    var run = createBatchRun(ctx);
    while (!run.isDone()) run.nextChunk(MAX_CHUNK);
    return run.finish();
  }

  // ============================================================
  // result validation
  // ============================================================

  function walkForbidden(node, where, forbidden) {
    if (Array.isArray(node)) {
      node.forEach(function (v, i) { walkForbidden(v, where + '[' + i + ']', forbidden); });
      return;
    }
    if (node !== null && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        if (forbidden.indexOf(k) !== -1) fail(where + '.' + k, 'is not allowed in a Pack batch result');
        walkForbidden(node[k], where + '.' + k, forbidden);
      });
    }
  }

  function assertBatchResultShape(r, caseIds) {
    var E = requireExecution();
    var where = 'batch';
    exactKeys(r, RESULT_KEYS, [], where);
    if (r.batchType !== BATCH_TYPE) fail(where + '.batchType', 'must be ' + BATCH_TYPE);
    if (r.schemaVersion !== SCHEMA_VERSION) fail(where + '.schemaVersion', 'must be ' + SCHEMA_VERSION);
    if (r.sourceKind !== SOURCE_KIND) fail(where + '.sourceKind', 'must be ' + SOURCE_KIND);
    if (r.trust !== TRUST) fail(where + '.trust', 'must be ' + TRUST);
    if (typeof r.publicLabel !== 'string' || r.publicLabel === '') fail(where + '.publicLabel', 'must be a non-empty string');
    if (!hasOwn(E.PRESSURE_SOURCES, r.pressureMode) || !hasOwn(ROW_PRESSURE_KEYS, r.pressureMode)) {
      fail(where + '.pressureMode', 'is not supported');
    }
    exactKeys(r.units, ['length', 'height', 'pressure'], [], where + '.units');
    requireCount(r.totalCases, where + '.totalCases');
    requireCount(r.executedCases, where + '.executedCases');
    if (!Array.isArray(r.rows)) fail(where + '.rows', 'must be a list');
    if (r.executedCases !== r.totalCases || r.rows.length !== r.totalCases) {
      fail(where, 'a batch result must contain every declared case');
    }
    var seen = Object.create(null);
    r.rows.forEach(function (row, i) {
      var at = where + '.rows[' + i + ']';
      exactKeys(row, ROW_REQUIRED, ROW_OPTIONAL, at);
      if (seen[row.caseId] === true) fail(at + '.caseId', 'is duplicated');
      seen[row.caseId] = true;
      if (caseIds && row.caseId !== caseIds[i]) fail(at + '.caseId', 'is out of order');
      requirePositive(row.widthMm, at + '.widthMm');
      requirePositive(row.heightMm, at + '.heightMm');
      requirePositive(row.designPressure, at + '.designPressure');
      exactKeys(row.pressure, ROW_PRESSURE_KEYS[r.pressureMode], [], at + '.pressure');
      if (row.pressure.pressureSource !== E.PRESSURE_SOURCES[r.pressureMode]) fail(at + '.pressure.pressureSource', 'does not match the mode');
      ['okCount', 'ngCount', 'outOfScopeCount'].forEach(function (k) { requireCount(row[k], at + '.' + k); });
      if (row.bestCandidate !== null) {
        exactKeys(row.bestCandidate, BEST_KEYS, [], at + '.bestCandidate');
        if (row.okCount < 1) fail(at + '.bestCandidate', 'exists without an OK candidate');
      } else if (row.okCount !== 0) {
        fail(at + '.bestCandidate', 'is missing although OK candidates exist');
      }
    });
    walkForbidden(r, where, E.FORBIDDEN_KEYS);
    return r;
  }

  /** createBatchRun().finish() / executeAll() が発行した結果か（形を真似た object は通らない）。 */
  function isBatchResult(r) {
    return r !== null && typeof r === 'object' && issued.has(r);
  }

  function assertBatchResult(r) {
    if (!isBatchResult(r)) fail('batch', 'was not issued by ProjectPackBatch');
    return assertBatchResultShape(r, null);
  }

  /**
   * r が発行物で、ctx（同じ instance）から発行されたものであることを確かめる。違えば throw する。
   * 比較は object の同一性だけ（内容・ラベル・mode・caseId・JSON の一致では通さない）。
   */
  function assertBatchOrigin(r, ctx) {
    assertBatchResult(r);
    if (!originByBatch.has(r)) fail('batch', 'has no recorded origin');
    if (ctx === null || typeof ctx !== 'object' || originByBatch.get(r) !== ctx) {
      fail('batch', 'was not issued from the given context');
    }
    return r;
  }

  return deepFreeze({
    BATCH_TYPE: BATCH_TYPE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SOURCE_KIND: SOURCE_KIND,
    TRUST: TRUST,
    MAX_CHUNK: MAX_CHUNK,
    createBatchRun: createBatchRun,
    executeAll: executeAll,
    isBatchResult: isBatchResult,
    assertBatchResult: assertBatchResult,
    assertBatchOrigin: assertBatchOrigin
  });
});
