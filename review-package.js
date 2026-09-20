/**
 * review-package.js
 *
 * Design Review Package（Phase 2I）。案件非依存。
 *
 * ── これが何で、何でないか ────────────────────────────────
 *
 * 検討が終わったあと、設計レビューの場で読める資料が要る。
 * このmoduleは現在のWorkspace状態から、その資料を1つ作る。
 *
 * Review Packageは **derived snapshot** である。
 *   - 計算入力の正本ではない
 *   - Project Input Package ではない
 *   - Workspace Package ではない
 *   - Evidence ではない
 *   - 承認記録ではない
 *
 * ── 計算しない ──────────────────────────────────────────
 *
 * summary は WorkspaceCore.summarize() を**呼ぶ**。
 * grouping は WorkspaceCore.groupByRecommended() を**呼ぶ**。
 * 行は WorkspaceCore.evaluateWorkspace() の結果を**射影する**。
 * traceは ProjectInput.windTraceFor() を**そのまま載せる**。
 *
 * このmoduleに風圧式も強度式も候補生成も無い。
 * 自前でsummaryを数え直した瞬間、画面とreportで支配ケースが食い違う余地ができる。
 * 同じ関数を呼ぶ以上、食い違いようがない、という形にしてある。
 *
 * ── 呼び出し側の主張を受け取らない ──────────────────────
 *
 * buildReviewPackage() は results / summary / governingCase といった
 * **計算済みの主張を引数として受け取らない**。Workspaceを受け取り、
 * 自分で evaluateWorkspace() する。
 * 受け取れば、reportは「渡されたとおりの結論」を印刷する道具になる。
 *
 * ── 一方向 ──────────────────────────────────────────────
 *
 * Review JSONを入力へ戻す経路は無い。deserialize も import も置かない。
 * 置けば、derived resultが次の計算の入力として通用してしまう。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ReviewPackage = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  function resolveDependency(globalName, requirePath, label) {
    if (global && global[globalName]) return global[globalName];
    if (typeof require === 'function') {
      try { return require(requirePath); } catch (e) { /* fallthrough */ }
    }
    throw new Error('review-package.js: ' + label + ' is required but not available');
  }

  var WorkspaceCore = resolveDependency('WorkspaceCore', './workspace.js', 'workspace.js (WorkspaceCore)');
  var ProjectInput = resolveDependency(
    'ProjectInput', './project-config/project-input.js', 'project-input.js (ProjectInput)');

  // ============================================================
  // Contract
  // ============================================================

  var REVIEW_SCHEMA_VERSION = 1;
  var REPORT_TYPE = 'glass_design_review';

  var PRIVACY_MODES = ['full', 'redacted'];

  var MAX_DETAIL_CASES = 50;
  var COMPARISON_CASE_COUNT = 2;
  var MAX_DIAGNOSTICS = WorkspaceCore.MAX_CASES;

  var MAX_TITLE_LENGTH = 200;
  var MAX_SUBTITLE_LENGTH = 300;
  var MAX_NOTE_LENGTH = 2000;

  var DEFAULT_TITLE = 'ガラス設計レビュー';
  var REDACTED_PLACEHOLDER = '（非表示）';

  var BUILD_OPTION_KEYS = [
    'workspace', 'diagnostics', 'metadata',
    'detailCaseIds', 'comparisonCaseIds', 'privacyMode'
  ];

  // 呼び出し側が「結論」を持ち込もうとした時に、黙って無視せず名指しで落とす。
  // 無視すると、渡した側は反映されたつもりのまま別の数字を見ることになる。
  var PRECOMPUTED_OPTION_KEYS = [
    'results', 'allResults', 'validResults', 'evaluated', 'evaluation',
    'summary', 'groups', 'governingCase', 'governingCaseId',
    'cases', 'caseRows', 'recommendedLabel', 'designPressure',
    'allowablePressure', 'marginRatio'
  ];

  // case table列（§10）。すべて evaluateWorkspace() の結果に由来する。
  var REVIEW_CASE_KEYS = [
    'caseId', 'label', 'sourceKind', 'verificationStatus',
    'widthMm', 'heightMm', 'areaM2',
    'positivePressure', 'negativePressure', 'designPressure',
    'glassType', 'recommendedLabel', 'allowablePressure',
    'marginRatio', 'marginPressure', 'status', 'outOfScopePresent'
  ];

  // INVALID診断行が持ってよい位置情報（Phase 2Gの契約をそのまま使う）。
  var DIAGNOSTIC_KEYS = ['source', 'lineNumber', 'index', 'field', 'error'];

  // 診断行で null のままでなければならない計算値。
  var DIAGNOSTIC_NULL_FIELDS = [
    'sourceKind', 'verificationStatus', 'widthMm', 'heightMm', 'areaM2',
    'positivePressure', 'negativePressure', 'designPressure', 'glassType',
    'extraFactor', 'recommendedCandidate', 'recommendedLabel',
    'allowablePressure', 'marginRatio', 'marginPressure'
  ];

  var COMPARISON_NUMERIC_FIELDS = [
    'widthMm', 'heightMm', 'areaM2', 'designPressure',
    'allowablePressure', 'marginRatio', 'marginPressure'
  ];
  var COMPARISON_TEXT_FIELDS = ['recommendedLabel', 'sourceKind'];

  /**
   * 製品として固定の解釈注意書き（§22）。
   *
   * runtime metadata でこれを置き換えたり消したりできない。
   * 置き換えられるなら、それは注意書きではなく飾りである。
   */
  var INTERPRETATION = {
    okMeaning:
      'OK は、この入力条件と本ツールの算定契約のうえで候補が成立したことを示す。',
    notApproval:
      '設計承認・製品採用承認を意味しない。',
    notVerified:
      '入力した条件が原典と照合済みであることを意味しない。',
    unverifiedInputNote:
      '手入力・取り込みデータ・Runtime Project Profile 由来の条件は、本ツールでは検証していない。'
  };

  // ============================================================
  // 小道具
  // ============================================================

  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /**
   * source objectから切り離したcopyを作る。
   *
   * 生成後にWorkspaceやmetadataを触られても、既に作ったreportが
   * 書き換わらないようにするため（§19）。参照を持ち回ると、
   * 「印刷したものと画面のものが違う」という最悪の形で表面化する。
   */
  function detach(value) {
    if (Array.isArray(value)) return value.map(detach);
    if (isPlainObject(value)) {
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = detach(value[k]); });
      return out;
    }
    return value;
  }

  function deepFreeze(value) {
    if (Array.isArray(value) || isPlainObject(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (k) { deepFreeze(value[k]); });
    }
    return value;
  }

  function assertAllowedKeys(obj, allowed, label) {
    Object.keys(obj).forEach(function (key) {
      if (allowed.indexOf(key) === -1) {
        throw new Error(label + ' has an unexpected field: ' + JSON.stringify(key));
      }
    });
  }

  function pick(source, keys) {
    var out = {};
    keys.forEach(function (k) { out[k] = source[k] === undefined ? null : source[k]; });
    return out;
  }

  function optionalText(value, max, label) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new Error(label + ' must be a string');
    }
    if (value.length > max) {
      throw new Error(label + ' exceeds the maximum length (' + max + ')');
    }
    // 制御文字だけは落とす。< や | は普通の人間の文章に出る文字であり、
    // ここで拒むべきものではない。escapeは出力側の仕事（§8）。
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      throw new Error(label + ' must not contain control characters');
    }
    return value;
  }

  // ============================================================
  // 診断の受け入れ境界（§4）
  // ============================================================

  /**
   * 既に Phase 2G の正規経路（errorToInvalidResult）を通った診断だけを受け取る。
   *
   * 生のTSV行・生のexception・生のPIPはここで止める。
   * このmoduleは診断を**射影するだけ**で、sanitizeをやり直さない。
   * やり直せる作りにすると、「ここで消しているはず」という思い込みが
   * 2か所に分かれ、どちらも信用できなくなる。
   */
  function assertCanonicalDiagnostic(entry, where) {
    if (!isPlainObject(entry)) {
      throw new Error(where + ' must be a canonical INVALID result object');
    }
    if (entry.status !== 'INVALID') {
      throw new Error(where + ' must have status INVALID');
    }
    if (WorkspaceCore.INVALID_RESULT_SOURCES.indexOf(entry.source) === -1) {
      throw new Error(where + ' has an unknown diagnostic source: ' + JSON.stringify(entry.source));
    }
    DIAGNOSTIC_NULL_FIELDS.forEach(function (field) {
      if (entry[field] !== null && entry[field] !== undefined) {
        throw new Error(
          where + ' must keep ' + field + ' null: a diagnostic row carries no calculated value');
      }
    });
    if (entry.error !== null && entry.error !== undefined && typeof entry.error !== 'string') {
      throw new Error(where + ' error must be a sanitized string or null');
    }
    if (entry.caseId !== null && entry.caseId !== undefined && typeof entry.caseId !== 'string') {
      throw new Error(where + ' caseId must be a string or null');
    }
    if (entry.label !== null && entry.label !== undefined && typeof entry.label !== 'string') {
      throw new Error(where + ' label must be a string or null');
    }
    return entry;
  }

  function assertDiagnostics(diagnostics) {
    if (!Array.isArray(diagnostics)) {
      throw new Error('buildReviewPackage(): diagnostics must be an array');
    }
    if (diagnostics.length > MAX_DIAGNOSTICS) {
      throw new Error(
        'diagnostics exceed the limit of ' + MAX_DIAGNOSTICS +
        ' (got ' + diagnostics.length + ')');
    }
    diagnostics.forEach(function (d, i) {
      assertCanonicalDiagnostic(d, 'diagnostics[' + i + ']');
    });
    return diagnostics;
  }

  // ============================================================
  // Privacy（§9）
  // ============================================================

  function assertPrivacyMode(mode) {
    if (mode === undefined || mode === null) return 'full';
    if (PRIVACY_MODES.indexOf(mode) === -1) {
      throw new Error('unknown privacyMode: ' + JSON.stringify(mode));
    }
    return mode;
  }

  /**
   * redacted では free text を伏せる。
   *
   * 伏せるのは **model側** であって表示側ではない。
   * 表示側だけで伏せると、JSON export と Markdown export が素通りする。
   * 1つの境界を3つの出口が共有する形にしておく。
   */
  function redactFreeText(value, privacyMode) {
    if (privacyMode !== 'redacted') return value === undefined ? null : value;
    return value === null || value === undefined || value === '' ? null : REDACTED_PLACEHOLDER;
  }

  function normalizeMetadata(metadata, privacyMode) {
    var meta = metadata === undefined || metadata === null ? {} : metadata;
    if (!isPlainObject(meta)) {
      throw new Error('buildReviewPackage(): metadata must be an object');
    }
    assertAllowedKeys(meta, ['title', 'subtitle', 'note'], 'metadata');

    var title = optionalText(meta.title, MAX_TITLE_LENGTH, 'metadata.title');
    var subtitle = optionalText(meta.subtitle, MAX_SUBTITLE_LENGTH, 'metadata.subtitle');
    var note = optionalText(meta.note, MAX_NOTE_LENGTH, 'metadata.note');

    if (privacyMode === 'redacted') {
      // titleにも案件名が入りうる。伏せるのではなく、
      // 一般名へ置き換える（表題が空のreportは読めないため）。
      return { title: DEFAULT_TITLE, subtitle: null, note: null };
    }
    return {
      title: title === null ? DEFAULT_TITLE : title,
      subtitle: subtitle,
      note: note
    };
  }

  // ============================================================
  // 行の射影（§10）
  // ============================================================

  function isDiagnosticRow(result) {
    return result.status === 'INVALID' && result.source !== undefined;
  }

  function projectCaseRow(result, privacyMode) {
    var row = pick(result, REVIEW_CASE_KEYS);
    row.label = redactFreeText(result.label, privacyMode);

    if (isDiagnosticRow(result)) {
      var diag = pick(result, DIAGNOSTIC_KEYS);
      DIAGNOSTIC_KEYS.forEach(function (k) { row[k] = diag[k]; });
      row.isDiagnostic = true;
      // 計算値は埋めない。欠けているのであって、推定できるものではない。
      DIAGNOSTIC_NULL_FIELDS.forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(row, field)) row[field] = null;
      });
    } else {
      DIAGNOSTIC_KEYS.forEach(function (k) { row[k] = null; });
      row.isDiagnostic = false;
    }
    return row;
  }

  // ============================================================
  // Detail 選択（§12 / §13）
  // ============================================================

  function assertDetailSelection(detailCaseIds, workspace, diagnostics) {
    if (detailCaseIds === undefined || detailCaseIds === null) return [];
    if (!Array.isArray(detailCaseIds)) {
      throw new Error('detailCaseIds must be an array');
    }
    if (detailCaseIds.length > MAX_DETAIL_CASES) {
      throw new Error(
        'detailCaseIds exceed the limit of ' + MAX_DETAIL_CASES +
        ' (got ' + detailCaseIds.length + ')');
    }
    var diagnosticIds = {};
    diagnostics.forEach(function (d) {
      if (typeof d.caseId === 'string') diagnosticIds[d.caseId] = true;
    });

    var seen = {};
    detailCaseIds.forEach(function (id) {
      if (typeof id !== 'string') {
        throw new Error('detailCaseIds must contain caseId strings');
      }
      if (Object.prototype.hasOwnProperty.call(seen, id)) {
        throw new Error('duplicate detail caseId: ' + JSON.stringify(id));
      }
      seen[id] = true;
      if (Object.prototype.hasOwnProperty.call(diagnosticIds, id) && !workspace.has(id)) {
        throw new Error(
          'an INVALID diagnostic cannot be selected as a detail case: ' + JSON.stringify(id));
      }
      if (!workspace.has(id)) {
        throw new Error('unknown detail caseId: ' + JSON.stringify(id));
      }
    });
    return detailCaseIds.slice();
  }

  /**
   * detailは必ず authoritative Workspace から引き直す（§13）。
   *
   * 呼び出し側が持っていた結果objectを信用しない。
   * 信用すれば、reportは「渡された値」を印刷する。
   */
  function buildDetail(caseId, workspace, resultsById, privacyMode) {
    var stored = workspace.getCase(caseId);
    if (!stored) {
      throw new Error('unknown detail caseId: ' + JSON.stringify(caseId));
    }
    var pkg = stored.inputPackage;
    var result = resultsById[caseId];
    if (!result) {
      throw new Error('detail caseId has no evaluated result: ' + JSON.stringify(caseId));
    }

    var trace = ProjectInput.windTraceFor(pkg);
    var traceAvailable = trace !== null && trace !== undefined;

    return {
      caseId: caseId,
      label: redactFreeText(stored.label, privacyMode),
      input: {
        sourceKind: pkg.sourceKind,
        verificationStatus: pkg.provenance ? pkg.provenance.verificationStatus : null,
        publicLabel: pkg.provenance ? pkg.provenance.publicLabel : null,
        widthMm: pkg.widthMm,
        heightMm: pkg.heightMm,
        glassType: pkg.glassType,
        extraFactor: pkg.extraFactor,
        positivePressure: pkg.positivePressure,
        negativePressure: pkg.negativePressure,
        designPressure: pkg.designPressure
      },
      windInput: pkg.windInput === undefined ? null : detach(pkg.windInput),
      traceAvailable: traceAvailable,
      // 告示算定を通っていない入力には Er も qBar も存在しない。
      // 空欄を嫌って埋めると、そこだけ出所の無い数字になる。
      traceUnavailableReason: traceAvailable
        ? null
        : 'この入力は告示風圧計算の経路を通っていないため、風条件の内訳は存在しない。',
      windTrace: traceAvailable ? detach(trace) : null,
      result: {
        recommendedLabel: result.recommendedLabel === undefined ? null : result.recommendedLabel,
        allowablePressure: result.allowablePressure === undefined ? null : result.allowablePressure,
        marginRatio: result.marginRatio === undefined ? null : result.marginRatio,
        marginPressure: result.marginPressure === undefined ? null : result.marginPressure,
        outOfScopePresent: !!result.outOfScopePresent,
        status: result.status
      }
    };
  }

  // ============================================================
  // Comparison（§16）
  // ============================================================

  function assertComparisonSelection(comparisonCaseIds, workspace, diagnostics) {
    if (comparisonCaseIds === undefined || comparisonCaseIds === null) return [];
    if (!Array.isArray(comparisonCaseIds)) {
      throw new Error('comparisonCaseIds must be an array');
    }
    if (comparisonCaseIds.length === 0) return [];
    if (comparisonCaseIds.length !== COMPARISON_CASE_COUNT) {
      throw new Error(
        'comparisonCaseIds must contain exactly ' + COMPARISON_CASE_COUNT +
        ' caseIds (got ' + comparisonCaseIds.length + ')');
    }
    var diagnosticIds = {};
    diagnostics.forEach(function (d) {
      if (typeof d.caseId === 'string') diagnosticIds[d.caseId] = true;
    });

    var seen = {};
    comparisonCaseIds.forEach(function (id) {
      if (typeof id !== 'string') {
        throw new Error('comparisonCaseIds must contain caseId strings');
      }
      if (Object.prototype.hasOwnProperty.call(seen, id)) {
        throw new Error('duplicate comparison caseId: ' + JSON.stringify(id));
      }
      seen[id] = true;
      if (Object.prototype.hasOwnProperty.call(diagnosticIds, id) && !workspace.has(id)) {
        throw new Error(
          'an INVALID diagnostic cannot be compared: ' + JSON.stringify(id));
      }
      if (!workspace.has(id)) {
        throw new Error('unknown comparison caseId: ' + JSON.stringify(id));
      }
    });
    return comparisonCaseIds.slice();
  }

  /**
   * 事実の差分だけを出す（§16）。
   *
   * どちらが良いかは書かない。better / worse / safer / winner を持たない。
   * 余裕率が大きい方が「良い」とは限らない（過大設計でもそうなる）。
   * 判断は人がする。ツールは差を出す。
   */
  function buildComparison(ids, resultsById, privacyMode) {
    if (ids.length === 0) return null;
    var a = resultsById[ids[0]];
    var b = resultsById[ids[1]];
    if (!a || !b) {
      throw new Error('comparison requires two evaluated cases');
    }

    var fields = [];
    COMPARISON_NUMERIC_FIELDS.forEach(function (field) {
      var av = typeof a[field] === 'number' ? a[field] : null;
      var bv = typeof b[field] === 'number' ? b[field] : null;
      fields.push({
        field: field,
        a: av,
        b: bv,
        delta: (av === null || bv === null) ? null : bv - av
      });
    });
    COMPARISON_TEXT_FIELDS.forEach(function (field) {
      fields.push({
        field: field,
        a: a[field] === undefined ? null : a[field],
        b: b[field] === undefined ? null : b[field],
        delta: null
      });
    });

    return {
      aCaseId: ids[0],
      bCaseId: ids[1],
      aLabel: redactFreeText(a.label, privacyMode),
      bLabel: redactFreeText(b.label, privacyMode),
      deltaDefinition: 'delta = B - A',
      fields: fields
    };
  }

  // ============================================================
  // Evidence summary（§21）
  // ============================================================

  /**
   * Phase 2I は Evidence の真実を持たない。
   *
   * report全体としての事実だけを、public-safe な範囲で述べる。
   * Phase 2F のlogicをここへ複製しない。複製すれば、
   * どちらが正なのか分からない状態が生まれる。
   */
  function buildEvidenceSummary(allResults) {
    var bySourceKind = {};
    var byVerification = {};
    allResults.forEach(function (r) {
      var sk = r.sourceKind === null || r.sourceKind === undefined ? 'diagnostic' : r.sourceKind;
      var vs = r.verificationStatus === null || r.verificationStatus === undefined
        ? 'diagnostic' : r.verificationStatus;
      bySourceKind[sk] = (bySourceKind[sk] || 0) + 1;
      byVerification[vs] = (byVerification[vs] || 0) + 1;
    });
    return {
      verifiedCaseCount: 0,
      projectSpecificPromotion: 'NONE',
      explicitUnresolvedItemCount: 4,
      bySourceKind: bySourceKind,
      byVerificationStatus: byVerification,
      note: 'このreportを出力しても検証状況は変わらない。検証状況はfactの出所に属する。'
    };
  }

  // ============================================================
  // Source snapshot / stale（§6）
  // ============================================================

  function diagnosticsSnapshot(diagnostics) {
    // 既にsanitize済みの診断を、決定的な順序で文字列化する。
    // 自前のhashは作らない（弱いhashは「一致した」という誤った安心を作る）。
    return JSON.stringify(diagnostics.map(function (d) {
      return pick(d, ['caseId', 'label', 'source', 'lineNumber', 'index', 'field', 'error']);
    }));
  }

  function buildSourceSnapshot(workspace, diagnostics) {
    return {
      workspace: WorkspaceCore.serializeWorkspace(workspace),
      diagnostics: diagnosticsSnapshot(diagnostics)
    };
  }

  /**
   * exportに載せてよい、source側の要約（free textを含まない）。
   *
   * source snapshot そのものは **export object に載せない**（下記参照）。
   */
  function buildSourceSummary(workspace, diagnostics) {
    return {
      workspaceCaseCount: workspace.size(),
      diagnosticCount: diagnostics.length,
      workspaceSchemaVersion: WorkspaceCore.SCHEMA_VERSION
    };
  }

  /**
   * 古いかどうかを**答えるだけ**（§6 / §20）。
   *
   * 再生成しない。黙って作り直せば、利用者が見ていた資料が
   * 手元で別物に変わる。それを避けるためにsnapshotにしてある。
   */
  function isReviewStale(review, workspace, diagnostics) {
    if (!isPlainObject(review) || !isPlainObject(review.sourceSnapshot)) {
      throw new Error('isReviewStale(): a review package is required');
    }
    var current = buildSourceSnapshot(workspace, assertDiagnostics(diagnostics || []));
    return current.workspace !== review.sourceSnapshot.workspace ||
           current.diagnostics !== review.sourceSnapshot.diagnostics;
  }

  // ============================================================
  // build
  // ============================================================

  function assertWorkspace(workspace) {
    if (!workspace || typeof workspace.listCases !== 'function' ||
        typeof workspace.getCase !== 'function' || typeof workspace.has !== 'function') {
      throw new Error('buildReviewPackage(): a workspace is required');
    }
    return workspace;
  }

  function assertOptions(options) {
    if (!isPlainObject(options)) {
      throw new Error('buildReviewPackage(): an options object is required');
    }
    PRECOMPUTED_OPTION_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        throw new Error(
          'buildReviewPackage() does not accept precomputed ' + key +
          ': the review is built from the authoritative workspace');
      }
    });
    assertAllowedKeys(options, BUILD_OPTION_KEYS, 'buildReviewPackage() options');
    return options;
  }

  function buildReviewPackage(options) {
    assertOptions(options);

    var workspace = assertWorkspace(options.workspace);
    var diagnostics = assertDiagnostics(options.diagnostics || []);
    var privacyMode = assertPrivacyMode(options.privacyMode);
    var metadata = normalizeMetadata(options.metadata, privacyMode);

    var detailCaseIds = assertDetailSelection(options.detailCaseIds, workspace, diagnostics);
    var comparisonCaseIds = assertComparisonSelection(
      options.comparisonCaseIds, workspace, diagnostics);

    // ここが要点: 結果は**この場で**authoritative Workspaceから作る。
    var validResults = WorkspaceCore.evaluateWorkspace(workspace);
    var allResults = WorkspaceCore.mergeEvaluationResults(validResults, diagnostics);
    var summary = WorkspaceCore.summarize(allResults);
    var groups = WorkspaceCore.groupByRecommended(allResults);

    var resultsById = {};
    validResults.forEach(function (r) { resultsById[r.caseId] = r; });

    var cases = allResults.map(function (r) { return projectCaseRow(r, privacyMode); });

    // governing は summarize() の答えをそのまま使う。探し直さない（§11）。
    var governingCase = null;
    if (summary.governingCaseId !== null) {
      for (var i = 0; i < cases.length; i++) {
        if (cases[i].caseId === summary.governingCaseId) {
          governingCase = {
            caseId: summary.governingCaseId,
            basis: summary.governingBasis,
            row: cases[i]
          };
          break;
        }
      }
    }

    var selectedDetails = detailCaseIds.map(function (id) {
      return buildDetail(id, workspace, resultsById, privacyMode);
    });

    var review = {
      schemaVersion: REVIEW_SCHEMA_VERSION,
      reportType: REPORT_TYPE,
      metadata: metadata,
      privacyMode: privacyMode,
      interpretation: detach(INTERPRETATION),
      sourceSummary: buildSourceSummary(workspace, diagnostics),
      summary: detach(summary),
      groups: detach(groups),
      cases: detach(cases),
      governingCase: detach(governingCase),
      selectedDetails: detach(selectedDetails),
      comparison: detach(buildComparison(comparisonCaseIds, resultsById, privacyMode)),
      evidenceSummary: buildEvidenceSummary(allResults)
    };

    // stale判定用の source snapshot は **enumerableにしない**。
    //
    // 中身は serializeWorkspace() の出力そのもの、つまり全caseのlabelと
    // 入力package一式である。これをexport objectへ載せると、
    // redacted modeで伏せたはずのlabelが Review JSON からそのまま出る
    // （実測で確認した。§44 の Redacted mode leak に当たる）。
    // またreportは derived snapshot であって入力の複製ではないので、
    // 入力一式を成果物へ同梱すること自体が筋として違う。
    //
    // 非enumerableなら JSON.stringify / Markdown / print のどの出口にも出ないまま、
    // isReviewStale() は厳密比較をそのまま続けられる（弱いhashを作らずに済む）。
    Object.defineProperty(review, 'sourceSnapshot', {
      value: deepFreeze(buildSourceSnapshot(workspace, diagnostics)),
      enumerable: false,
      writable: false,
      configurable: false
    });

    // 生成後にWorkspaceやmetadataが変わっても、この資料は変わらない。
    return deepFreeze(review);
  }

  return {
    REVIEW_SCHEMA_VERSION: REVIEW_SCHEMA_VERSION,
    REPORT_TYPE: REPORT_TYPE,
    PRIVACY_MODES: Object.freeze(PRIVACY_MODES.slice()),
    MAX_DETAIL_CASES: MAX_DETAIL_CASES,
    COMPARISON_CASE_COUNT: COMPARISON_CASE_COUNT,
    MAX_DIAGNOSTICS: MAX_DIAGNOSTICS,
    MAX_TITLE_LENGTH: MAX_TITLE_LENGTH,
    MAX_SUBTITLE_LENGTH: MAX_SUBTITLE_LENGTH,
    MAX_NOTE_LENGTH: MAX_NOTE_LENGTH,
    DEFAULT_TITLE: DEFAULT_TITLE,
    REDACTED_PLACEHOLDER: REDACTED_PLACEHOLDER,
    REVIEW_CASE_KEYS: Object.freeze(REVIEW_CASE_KEYS.slice()),
    INTERPRETATION: deepFreeze(detach(INTERPRETATION)),
    buildReviewPackage: buildReviewPackage,
    isReviewStale: isReviewStale
  };
  // 意図的に置いていないもの:
  //   deserializeReviewPackage / importReviewPackage / loadReviewPackage /
  //   reviewToWorkspace / reviewToProjectInput
  // Review JSONは一方向である（§17）。
});
