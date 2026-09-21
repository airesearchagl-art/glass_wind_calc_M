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

  /**
   * buildReviewPackage() が作ったobjectだけを覚えておく（§7）。
   *
   * exporterはこの印を要求する。印が無ければ、
   * 「reportTypeとsummaryを自分で書いたobject」を渡しても
   * 本ツール名義のreportにはならない。
   * WeakSetなので、reportを捨てれば印も消える（漏れない・溜まらない）。
   */
  var BUILT_REVIEWS = new WeakSet();

  // export出力の上限。1000caseのreportが通る大きさで、
  // 暴走だけを止める（実測値と根拠は DECISIONS.md D-009）。
  var MAX_EXPORT_JSON_BYTES = 8 * 1024 * 1024;
  var MAX_EXPORT_MARKDOWN_BYTES = 8 * 1024 * 1024;

  // export objectのkey順（§8）。JSON.stringify(review) をそのまま出さない。
  // 内部fieldがenumerableになった日に、黙ってexport契約へ混ざるのを防ぐ。
  var EXPORT_KEY_ORDER = [
    'schemaVersion', 'reportType', 'metadata', 'privacyMode', 'interpretation',
    'sourceSummary', 'summary', 'groups', 'cases', 'governingCase',
    'selectedDetails', 'comparison', 'evidenceSummary'
  ];

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
   * 素性の分かる object だけを入口で通す。
   *
   * 実測（Wave 5）: `Object.create({title: '...'})` で渡した metadata の
   * 継承 title がそのまま資料の表題になった。build options も diagnostic も同じで、
   * 継承した workspace / privacyMode / status / source が採用された。
   * own-key検査（Object.keys / hasOwnProperty）は継承を見ないため、
   * 「未知のfieldは無い」と判断したあとで、値だけが prototype から読まれていた。
   *
   * これは prototype pollution ではない（Object.prototype は汚れていない）。
   * **利用者が用意した prototype の値を、契約の値として消費していた**という話である。
   *
   * 直し方は Phase 2H D-010 と同じにする。継承の判定は**ここ1か所**だけに置き、
   * 各fieldごとの継承チェックを増やさない。増やすと、前段が生きている限り
   * 後段が発火せず、どちらが効いているのか分からなくなる。
   *
   * null prototype は通す。継承元が無い＝継承値が入り得ないためで、
   * Object.prototype 付きより素直なデータである。
   */
  function assertOrdinaryObject(value, label) {
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(label + ' must be a plain object with no inherited properties');
    }
    return value;
  }

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
    assertOrdinaryObject(entry, where);
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
    assertOrdinaryObject(meta, 'metadata');
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
   * このmoduleが自分の結果集合から**正直に言えること**だけを述べる。
   *
   * 以前ここには
   *   verifiedCaseCount: 0 / projectSpecificPromotion: 'NONE' /
   *   explicitUnresolvedItemCount: 4
   * が固定値で入っていた。現在の案件のEvidence状態としては正しいが、
   * **genericなReview coreの事実ではない**。
   * 手入力だけのWorkspaceでも「未解決4件」と報告してしまう。
   * 実測で確認したうえで外した。
   *
   * 案件のEvidence状態は Phase 2F が正であり、必要なら
   * presentation層が public-safe な既存APIを条件付きで呼ぶ。
   * ここへ写すと、正がどちらか分からなくなる。
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
      bySourceKind: bySourceKind,
      byVerificationStatus: byVerification,
      reportChangesVerification: false,
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
    assertBuiltReview(review, 'isReviewStale()');
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
    assertOrdinaryObject(options, 'buildReviewPackage() options');
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
    deepFreeze(review);
    BUILT_REVIEWS.add(review);
    return review;
  }

  // ============================================================
  // Exporter gate（§7）
  // ============================================================

  /**
   * exporterは「buildReviewPackage()が作ったobject」しか受け取らない。
   *
   * 形が合っているだけのobjectを通すと、
   *   serializeReviewPackage({ reportType: 'glass_design_review',
   *                            summary: { ...好きな数字... } })
   * が本ツール名義のreportとして出てしまう。
   * reportは一方向なので、作り直したobjectを受け付ける理由が無い。
   */
  function assertBuiltReview(review, where) {
    if (!isPlainObject(review) || !BUILT_REVIEWS.has(review)) {
      throw new Error(
        where + ' requires a Review Package created by buildReviewPackage()');
    }
    return review;
  }

  function byteLengthOf(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return Buffer.byteLength(text, 'utf8');
  }

  function assertExportSize(text, max, what) {
    var size = byteLengthOf(text);
    if (size > max) {
      throw new Error(what + ' exceeds the maximum size (' + max + ' bytes, got ' + size + ')');
    }
    return text;
  }

  // ============================================================
  // Review JSON export（§8）
  // ============================================================

  /**
   * 明示したkeyだけを、明示した順で出す。
   * sourceSnapshot も内部の印も出さない。
   */
  function toExportModel(review) {
    assertBuiltReview(review, 'serializeReviewPackage()');
    var out = {};
    EXPORT_KEY_ORDER.forEach(function (key) {
      out[key] = review[key] === undefined ? null : detach(review[key]);
    });
    return out;
  }

  function serializeReviewPackage(review) {
    var json = JSON.stringify(toExportModel(review), null, 2);
    return assertExportSize(json, MAX_EXPORT_JSON_BYTES, 'review JSON');
  }

  // ============================================================
  // Markdown export（§10 - §13）
  // ============================================================

  /**
   * report本文に出る文字列を、**出所で区別せず**同じ関数で無害化する（§11）。
   *
   * ユーザー入力だけを対象にする作りにしない。
   * traceの中には既に `5<Z<40 (linear interpolation)` のような文字列があり、
   * 「内部由来だから安全」という前提は内部文字列の変更1回で崩れる。
   */
  function escapeMarkdown(value) {
    if (value === null || value === undefined) return '—';
    var text = String(value);
    // 改行・タブは構造を作らせない。行頭に立てなければ、
    // - や # や ``` が新しい見出し・箇条書き・コードフェンスにならない（§12）。
    text = text.replace(/\r\n|\r|\n/g, ' ⏎ ').replace(/\t/g, ' ');
    // 先に backslash、そのあと構造文字
    text = text.replace(/\\/g, '\\\\');
    // - と = も落とす。行頭に来ると箇条書き / setext見出しになり、
    // runtime文字列がreportの構造を決めてしまう（noteやsubtitleは行頭に置かれる）。
    text = text.replace(/([`*_{}\[\]()#+!|<>~=-])/g, '\\$1');
    return text;
  }

  function fmt(value, digits) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toFixed(digits === undefined ? 2 : digits);
  }

  function mdRow(cells) { return '| ' + cells.join(' | ') + ' |'; }

  function markdownCaseTable(cases) {
    var lines = [];
    lines.push(mdRow([
      'ケースID', 'ラベル', '出所', '検証状況', 'W (mm)', 'H (mm)', '面積 (m²)',
      '設計風圧 (N/m²)', 'ガラス種別', '推奨構成', '許容耐力 (N/m²)',
      '余裕率', '余裕圧 (N/m²)', '判定'
    ]));
    lines.push(mdRow([
      '---', '---', '---', '---', '---:', '---:', '---:', '---:',
      '---', '---', '---:', '---:', '---:', '---'
    ]));
    cases.forEach(function (c) {
      lines.push(mdRow([
        escapeMarkdown(c.caseId),
        escapeMarkdown(c.label),
        escapeMarkdown(c.isDiagnostic ? '（取り込みエラー）' : c.sourceKind),
        escapeMarkdown(c.isDiagnostic ? '—' : c.verificationStatus),
        fmt(c.widthMm, 0), fmt(c.heightMm, 0), fmt(c.areaM2, 4),
        fmt(c.designPressure, 2),
        escapeMarkdown(c.glassType),
        escapeMarkdown(c.recommendedLabel),
        fmt(c.allowablePressure, 2), fmt(c.marginRatio, 4), fmt(c.marginPressure, 2),
        escapeMarkdown(c.status)
      ]));
    });
    return lines;
  }

  function markdownDetail(detail) {
    var lines = [];
    lines.push('### ' + escapeMarkdown(detail.caseId) + ' — ' + escapeMarkdown(detail.label));
    lines.push('');
    lines.push('- 出所: ' + escapeMarkdown(detail.input.sourceKind) +
               ' / 検証状況: ' + escapeMarkdown(detail.input.verificationStatus));
    if (detail.input.publicLabel) {
      lines.push('- 表示名: ' + escapeMarkdown(detail.input.publicLabel));
    }
    lines.push('- W × H: ' + fmt(detail.input.widthMm, 0) + ' × ' + fmt(detail.input.heightMm, 0) +
               ' mm / ガラス種別: ' + escapeMarkdown(detail.input.glassType) +
               ' / 追加係数: ' + fmt(detail.input.extraFactor, 3));
    lines.push('- 正圧 / 負圧 / 設計風圧: ' + fmt(detail.input.positivePressure, 2) + ' / ' +
               fmt(detail.input.negativePressure, 2) + ' / ' +
               fmt(detail.input.designPressure, 2) + ' N/m²');
    lines.push('');

    if (!detail.traceAvailable) {
      // 無いものを埋めない。
      lines.push('- 風条件の内訳: ' + escapeMarkdown(detail.traceUnavailableReason));
    } else {
      var t = detail.windTrace;
      lines.push('- 風条件の内訳:');
      lines.push('    - V0 / 粗度区分: ' + fmt(t.inputs.V0, 1) + ' m/s / ' +
                 escapeMarkdown(t.inputs.inputRoughnessCategory));
      lines.push('    - 建物高さ / 軒高 / 評価高さ Z: ' + fmt(t.inputs.buildingHeightM, 2) + ' / ' +
                 fmt(t.inputs.eavesHeightM, 2) + ' / ' + fmt(t.inputs.evaluationHeightM, 2) + ' m');
      lines.push('    - 建物タイプ / 部位: ' + escapeMarkdown(t.inputs.buildingType) + ' / ' +
                 escapeMarkdown(t.inputs.zone));
      lines.push('    - 算定基準: ' + escapeMarkdown(t.basis.type));
      lines.push('    - Er / qBar: ' + t.positive.Er + ' / ' + t.positive.qBar);
      lines.push('    - Gpe分岐: ' + escapeMarkdown(t.positive.GpeBranch));
      lines.push('    - 正圧 / 負圧: ' + fmt(t.positive.pressure, 2) + ' / ' +
                 fmt(t.negative.pressure, 2) + ' N/m²');
      lines.push('');
      // 式の検証と入力の検証は別物。1つのbadgeへ潰さない（§15）。
      lines.push('- 式の検証: ' + escapeMarkdown(t.provenance.formulaVerificationStatus));
      lines.push('- 入力の検証: ' + escapeMarkdown(t.provenance.inputVerificationStatus));
    }
    lines.push('');
    lines.push('- 推奨構成: ' + escapeMarkdown(detail.result.recommendedLabel) +
               ' / 許容耐力: ' + fmt(detail.result.allowablePressure, 2) + ' N/m²');
    lines.push('- 余裕率 / 余裕圧: ' + fmt(detail.result.marginRatio, 4) + ' / ' +
               fmt(detail.result.marginPressure, 2) + ' N/m²');
    lines.push('- 判定: ' + escapeMarkdown(detail.result.status));
    lines.push('');
    return lines;
  }

  function toMarkdown(review) {
    assertBuiltReview(review, 'toMarkdown()');
    var lines = [];

    lines.push('# ' + escapeMarkdown(review.metadata.title));
    lines.push('');
    if (review.metadata.subtitle) {
      lines.push(escapeMarkdown(review.metadata.subtitle));
      lines.push('');
    }

    // 固定の解釈注意書き。runtime metadataで消せない。
    lines.push('> **この資料の読み方**');
    lines.push('> ');
    lines.push('> - ' + escapeMarkdown(review.interpretation.okMeaning));
    lines.push('> - ' + escapeMarkdown(review.interpretation.notApproval));
    lines.push('> - ' + escapeMarkdown(review.interpretation.notVerified));
    lines.push('> - ' + escapeMarkdown(review.interpretation.unverifiedInputNote));
    lines.push('');

    if (review.metadata.note) {
      lines.push('## 備考');
      lines.push('');
      lines.push(escapeMarkdown(review.metadata.note));
      lines.push('');
    }

    var s = review.summary;
    lines.push('## 集計');
    lines.push('');
    lines.push('- 総ケース数: ' + fmt(s.totalCases, 0));
    lines.push('- OK / 候補なし / 入力エラー: ' + fmt(s.okCount, 0) + ' / ' +
               fmt(s.noSolutionCount, 0) + ' / ' + fmt(s.invalidCount, 0));
    lines.push('- 適用範囲外を含むケース: ' + fmt(s.outOfScopePresentCount, 0));
    lines.push('- 最大設計風圧: ' + fmt(s.maxDesignPressure, 2) + ' N/m²');
    lines.push('- 最大見付面積: ' + fmt(s.maxAreaM2, 4) + ' m²');
    lines.push('');

    lines.push('## 推奨構成ごとの件数');
    lines.push('');
    lines.push(mdRow(['推奨構成', '件数']));
    lines.push(mdRow(['---', '---:']));
    review.groups.forEach(function (g) {
      lines.push(mdRow([escapeMarkdown(g.key), fmt(g.count, 0)]));
    });
    lines.push('');

    lines.push('## ケース一覧');
    lines.push('');
    markdownCaseTable(review.cases).forEach(function (l) { lines.push(l); });
    lines.push('');

    lines.push('## 支配ケース');
    lines.push('');
    if (review.governingCase === null) {
      lines.push('- 支配ケースなし（計算できたケースがない）');
    } else {
      lines.push('- ケースID: ' + escapeMarkdown(review.governingCase.caseId));
      lines.push('- 選定根拠: ' + escapeMarkdown(review.governingCase.basis));
    }
    lines.push('');

    if (review.selectedDetails.length > 0) {
      lines.push('## 選択ケースの詳細');
      lines.push('');
      review.selectedDetails.forEach(function (d) {
        markdownDetail(d).forEach(function (l) { lines.push(l); });
      });
    }

    if (review.comparison !== null) {
      var c = review.comparison;
      lines.push('## 2ケース比較');
      lines.push('');
      lines.push('- A: ' + escapeMarkdown(c.aCaseId) + ' — ' + escapeMarkdown(c.aLabel));
      lines.push('- B: ' + escapeMarkdown(c.bCaseId) + ' — ' + escapeMarkdown(c.bLabel));
      lines.push('');
      lines.push(mdRow(['項目', 'A', 'B', '差分 (B − A)']));
      lines.push(mdRow(['---', '---', '---', '---']));
      c.fields.forEach(function (f) {
        var isNumeric = typeof f.a === 'number' || typeof f.b === 'number';
        lines.push(mdRow([
          escapeMarkdown(f.field),
          isNumeric ? fmt(f.a, 4) : escapeMarkdown(f.a),
          isNumeric ? fmt(f.b, 4) : escapeMarkdown(f.b),
          f.delta === null ? '—' : fmt(f.delta, 4)
        ]));
      });
      lines.push('');
      lines.push('※ 差分は事実の差であり、優劣の判定ではない。');
      lines.push('');
    }

    lines.push('## 出所と検証状況');
    lines.push('');
    lines.push(mdRow(['出所', '件数']));
    lines.push(mdRow(['---', '---:']));
    Object.keys(review.evidenceSummary.bySourceKind).forEach(function (k) {
      lines.push(mdRow([escapeMarkdown(k), fmt(review.evidenceSummary.bySourceKind[k], 0)]));
    });
    lines.push('');
    lines.push(mdRow(['検証状況', '件数']));
    lines.push(mdRow(['---', '---:']));
    Object.keys(review.evidenceSummary.byVerificationStatus).forEach(function (k) {
      lines.push(mdRow([
        escapeMarkdown(k), fmt(review.evidenceSummary.byVerificationStatus[k], 0)]));
    });
    lines.push('');
    lines.push('- ' + escapeMarkdown(review.evidenceSummary.note));
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('表示は丸めた値である。full precisionは Review JSON を参照。');
    lines.push('privacy mode: ' + escapeMarkdown(review.privacyMode));

    var text = lines.join('\n');
    return assertExportSize(text, MAX_EXPORT_MARKDOWN_BYTES, 'review Markdown');
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
    MAX_EXPORT_JSON_BYTES: MAX_EXPORT_JSON_BYTES,
    MAX_EXPORT_MARKDOWN_BYTES: MAX_EXPORT_MARKDOWN_BYTES,
    EXPORT_KEY_ORDER: Object.freeze(EXPORT_KEY_ORDER.slice()),
    buildReviewPackage: buildReviewPackage,
    isReviewStale: isReviewStale,
    serializeReviewPackage: serializeReviewPackage,
    toMarkdown: toMarkdown
  };
  // 意図的に置いていないもの:
  //   deserializeReviewPackage / importReviewPackage / loadReviewPackage /
  //   reviewToWorkspace / reviewToProjectInput
  // Review JSONは一方向である（§17）。
});
