/**
 * workspace.js
 *
 * Batch / Scenario Workspace（Phase 2G）。案件非依存。
 *
 * ── このmoduleが持たないもの ──────────────────────────────
 *
 * ガラス強度式・風圧式・Evidence昇格・preset変更を**持たない**。
 * 1 caseの評価は必ず既存の経路を通る:
 *
 *   Project Input Package v2 (project-config/project-input.js)
 *     → GlassCalc.paneAreaM2 / generateCandidates / splitCandidates (calc.js)
 *
 * single-case calculatorが正であり、本moduleはそのorchestration layerである。
 * ここに数式を1つでも書いた時点で「Batchだけ結果が違う」経路が生まれる。
 *
 * ── trust境界 ────────────────────────────────────────────
 *
 * case追加経路は3つあり、信頼レベルが異なる（Phase 2G §10）:
 *
 *   A. Add Current Case   … アプリ内部で生成済みのnormalized PIP。
 *                           内部stateなのでsourceKindを保持してよい。
 *   B. Workspace JSON     … 外部データ。各caseは ProjectInput.deserialize()
 *                           を**必ず**通す。あちらが16KB cap・禁止キー・
 *                           構造検査・imported_unverifiedへの強制降格を
 *                           すべて行う。ここで再実装しない。
 *   C. TSV paste          … 外部user input。manual / notification のみ。
 *                           registered_preset / verified / Evidence を作れない。
 *
 * ブラウザ(<script src>)とNode(require())の両方で動く。build stepなし。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.WorkspaceCore = mod;
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
    throw new Error('workspace.js: ' + label + ' is required but not available');
  }

  var GlassCalc = resolveDependency('GlassCalc', './calc.js', 'calc.js (GlassCalc)');
  var ProjectInput = resolveDependency(
    'ProjectInput', './project-config/project-input.js',
    'project-config/project-input.js (ProjectInput)'
  );

  // ============================================================
  // Contract constants
  // ============================================================

  var SCHEMA_VERSION = 1;
  var WORKSPACE_TYPE = 'glass_batch_workspace';
  var SUPPORTED_SCHEMA_VERSIONS = [1];

  // §25 limits。1 caseあたりの上限は ProjectInput 側（16KB / depth 8 /
  // string 512）がそのまま効く。ここで定義するのはworkspace全体の上限であり、
  // 両方を満たさなければ fail closed（DECISIONS D-002）。
  var MAX_CASES = 1000;
  var MAX_WORKSPACE_BYTES = 1024 * 1024;   // 1MB
  var MAX_TSV_BYTES = 1024 * 1024;         // 1MB
  var MAX_LABEL_LENGTH = 200;
  var MAX_CASE_ID_LENGTH = 64;

  // caseIdはruntime local identifier（§11）。
  // 図面番号・ファイル名・private document IDを持ち込ませない形に限定する。
  var CASE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

  // labelはuntrusted stringだが、制御文字はTSV/CSVの行・列構造そのものを
  // 壊すため受け付けない（quotingで隠すより、入口で落とすほうが読みやすい）。
  var CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

  var CASE_STATUSES = ['OK', 'NO_SOLUTION', 'INVALID'];
  var FILTER_VALUES = ['ALL', 'OK', 'NO_SOLUTION', 'INVALID'];
  var SORT_KEYS = ['caseId', 'designPressure', 'areaM2', 'marginRatio'];

  var TOP_LEVEL_WORKSPACE_KEYS = ['schemaVersion', 'workspaceType', 'cases'];
  var CASE_KEYS = ['caseId', 'label', 'inputPackage'];

  // ============================================================
  // Small shared helpers
  // ============================================================

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function byteLengthOf(text) {
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(text).length;
    }
    return Buffer.byteLength(text, 'utf8');
  }

  function assertAllowedKeys(obj, allowed, label) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      if (allowed.indexOf(keys[i]) === -1) {
        throw new Error(label + ' has an unexpected field: ' + JSON.stringify(keys[i]));
      }
    }
  }

  /**
   * caseIdを検証する。
   * 通れば同じ文字列を返し、通らなければ例外（fail closed）。
   */
  function assertCaseId(caseId) {
    if (typeof caseId !== 'string' || !caseId) {
      throw new Error('caseId must be a non-empty string');
    }
    if (caseId.length > MAX_CASE_ID_LENGTH) {
      throw new Error('caseId is too long (max ' + MAX_CASE_ID_LENGTH + ' characters)');
    }
    if (!CASE_ID_PATTERN.test(caseId)) {
      throw new Error(
        'caseId must start with a letter and contain only letters, digits, "_" or "-"'
      );
    }
    return caseId;
  }

  /**
   * labelを検証する。null / '' は「labelなし」として null に正規化する。
   */
  function normalizeLabel(label) {
    if (label === undefined || label === null || label === '') {
      return null;
    }
    if (typeof label !== 'string') {
      throw new Error('label must be a string or null');
    }
    if (label.length > MAX_LABEL_LENGTH) {
      throw new Error('label is too long (max ' + MAX_LABEL_LENGTH + ' characters)');
    }
    if (CONTROL_CHAR_PATTERN.test(label)) {
      throw new Error('label must not contain control characters');
    }
    return label;
  }

  // ------------------------------------------------------------
  // 診断メッセージのsanitize（独立検証 F1）
  // ------------------------------------------------------------
  //
  // validatorの例外メッセージは、落ちた**値そのもの**を引用符で埋め込む
  //   例: unsupported glassType: "SECRET-PROJECT-DWG-A1023"
  // これがそのまま画面に出て、さらに**エクスポートされたCSVに書かれる**。
  // CSVは共有されるファイルなので、ここが実際のegress pathになる。
  //
  // 行全体やJSON object全体は元から載せていないが、「落ちたセル1つ」は載っていた。
  // §8が挙げる禁止リストの文言には入っていないものの、
  // 利用者の案件名・図面番号がそのまま出る以上、同じ性質の漏れである。
  //
  // ── 方針 ──────────────────────────────────────────────
  //
  // 引用符で囲まれた部分は、**このシステム自身が定義している語彙**に
  // 一致するときだけそのまま残し、それ以外は伏せる。
  // 語彙に無いものは利用者由来とみなす（fail safe側に倒す）。
  // 過剰に伏せる方向のズレは安全側であり、計算には一切影響しない。
  //
  // これは「利用者の入力が絶対に出ない」ことの保証ではなく、
  // **無制限に出ることを止め、既知の語彙以外を伏せる**ための境界である。
  var MAX_REASON_LENGTH = 200;
  var REDACTED_QUOTED = '"…"';

  // 表示用のsanitizeにだけ使う語彙。**契約ではない**ので、
  // ここが実装からズレても計算・検証には影響しない（伏せすぎるだけ）。
  // 風圧側の語彙は wind-pressure.js を require せずに持つ必要があるため
  // リテラルで置く（AC-02: Batch layerは風圧エンジンに依存しない）。
  var WIND_DISPLAY_VOCABULARY = [
    'I', 'II', 'III', 'IV',
    'closed', 'open',
    'general', 'corner',
    'notification_baseline', 'itakyo_recommended'
  ];

  // 「拒否することが分かっている」field名。これらは利用者データではなく
  // こちら側が定義している語彙なので、伏せずに名指ししたほうが診断として有用
  // （evidence を混ぜてしまった人に「どれが問題か」を返せる）。
  var KNOWN_REJECTED_FIELD_NAMES = [
    'evidence', 'verifiedCases', 'sourceReference', 'recommendedGlass',
    'recommendedCandidate', 'allowablePressure', 'marginRatio', 'marginPressure',
    'trace', 'windTrace', 'okCount', 'ngCount', 'outOfScopeCount',
    'areaM2', 'status', 'source', 'verified'
  ];

  function buildSafeReasonVocabulary() {
    var vocabulary = [];
    function addAll(list) {
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        if (typeof list[i] === 'string' && vocabulary.indexOf(list[i]) === -1) {
          vocabulary.push(list[i]);
        }
      }
    }
    addAll(TSV_KNOWN_COLUMNS);
    addAll(TSV_FORBIDDEN_COLUMNS);
    addAll(KNOWN_REJECTED_FIELD_NAMES);
    addAll(CASE_KEYS);
    addAll(TOP_LEVEL_WORKSPACE_KEYS);
    addAll(CASE_STATUSES);
    addAll(FILTER_VALUES);
    addAll(SORT_KEYS);
    addAll(INVALID_RESULT_SOURCES);
    addAll(['manual', 'notification']);
    addAll(WIND_DISPLAY_VOCABULARY);
    addAll([WORKSPACE_TYPE]);
    // 依存moduleが公開している語彙（enumそのもの）
    addAll(ProjectInput.SOURCE_KINDS);
    addAll(ProjectInput.VERIFICATION_STATUSES);
    addAll(ProjectInput.ALLOWED_TOP_LEVEL_KEYS);
    addAll(ProjectInput.WIND_INPUT_KEYS);
    addAll(GlassCalc.GLASS_TYPES ? Object.keys(GlassCalc.GLASS_TYPES) : []);
    return vocabulary;
  }

  var SAFE_REASON_VOCABULARY = buildSafeReasonVocabulary();

  /**
   * 診断reasonを表示・出力できる形に整える。
   *
   * 既知語彙に一致しない引用部分を伏せ、全体長を上限で切る。
   */
  function sanitizeReason(message) {
    if (message === null || message === undefined) return null;
    var text = String(message).replace(/"((?:[^"\\]|\\.)*)"/g, function (whole, inner) {
      return SAFE_REASON_VOCABULARY.indexOf(inner) !== -1 ? whole : REDACTED_QUOTED;
    });
    if (text.length > MAX_REASON_LENGTH) {
      text = text.slice(0, MAX_REASON_LENGTH - 1) + '…';
    }
    return text;
  }


  // ============================================================
  // Workspace（case lifecycle）
  // ============================================================

  /**
   * memory-onlyのWorkspaceを作る（§31）。
   * localStorage / sessionStorage / server へ一切書かない。
   * 永続化はexplicit Exportのみ。
   */
  function createWorkspace() {
    var cases = [];
    var nextOrdinal = 1;

    function indexOfCaseId(caseId) {
      for (var i = 0; i < cases.length; i++) {
        if (cases[i].caseId === caseId) return i;
      }
      return -1;
    }

    /**
     * case-001 形式の次のIDを払い出す。
     *
     * 番号は単調増加で、removeで空いた番号を再利用しない。
     * 再利用すると、remove直後に追加したcaseが「消したはずのcase」と
     * 同じIDを名乗り、CSV/JSONを突き合わせたときに別物が同一視される。
     *
     * 明示caseIdでのimportと衝突しうるため、空きが見つかるまで進める。
     */
    function generateCaseId() {
      for (var guard = 0; guard < MAX_CASES * 2 + 10; guard++) {
        var candidate = 'case-' + String(nextOrdinal).padStart(3, '0');
        nextOrdinal += 1;
        if (indexOfCaseId(candidate) === -1) return candidate;
      }
      throw new Error('could not allocate a unique caseId');
    }

    function assertCapacity() {
      if (cases.length >= MAX_CASES) {
        throw new Error('workspace is full (max ' + MAX_CASES + ' cases)');
      }
    }

    /**
     * 既にnormalizeされたProject Input Packageをcaseとして追加する。
     *
     * inputPackageは**呼び出し側と切り離した**正規化済みcopyとして保持する。
     * 追加後に呼び出し側が元objectを書き換えても、workspaceの内容は変わらない。
     */
    function addCase(inputPackage, options) {
      options = options || {};
      assertCapacity();
      if (!isPlainObject(inputPackage)) {
        throw new Error('inputPackage must be an object');
      }
      // 既存の正規化を通す（ここで独自のvalidationを作らない）
      var normalized = ProjectInput.validateProjectInput(inputPackage);

      var caseId;
      if (options.caseId === undefined || options.caseId === null) {
        caseId = generateCaseId();
      } else {
        caseId = assertCaseId(options.caseId);
        if (indexOfCaseId(caseId) !== -1) {
          throw new Error('duplicate caseId: ' + JSON.stringify(caseId));
        }
      }

      var entry = {
        caseId: caseId,
        label: normalizeLabel(options.label),
        inputPackage: normalized
      };
      cases.push(entry);
      return entry.caseId;
    }

    /**
     * 既存caseを複製する。新しいcaseIdを払い出し、入力は同じ。
     * 元caseはmutationしない（§15）。結果はevaluate時に再計算される。
     */
    function duplicateCase(caseId, options) {
      options = options || {};
      assertCapacity();
      var index = indexOfCaseId(caseId);
      if (index === -1) {
        throw new Error('unknown caseId: ' + JSON.stringify(caseId));
      }
      var source = cases[index];
      var label = source.label;
      if (options.label !== undefined) {
        label = normalizeLabel(options.label);
      } else if (source.label !== null) {
        var suffixed = source.label + ' (copy)';
        label = suffixed.length > MAX_LABEL_LENGTH
          ? suffixed.slice(0, MAX_LABEL_LENGTH)
          : suffixed;
      }
      // 入力をJSON round-tripしてから再normalizeし、元caseとobjectを共有しない
      var copy = ProjectInput.validateProjectInput(
        JSON.parse(JSON.stringify(source.inputPackage))
      );
      var newId = generateCaseId();
      cases.push({ caseId: newId, label: label, inputPackage: copy });
      return newId;
    }

    function removeCase(caseId) {
      var index = indexOfCaseId(caseId);
      if (index === -1) return false;
      cases.splice(index, 1);
      return true;
    }

    /** browser runtime stateだけを空にする（§16）。repositoryには影響しない。 */
    function clear() {
      var removed = cases.length;
      cases = [];
      return removed;
    }

    /**
     * 追加順のcase一覧を返す。
     * 呼び出し側から中身を書き換えられないよう、detachしたcopyを返す。
     */
    function listCases() {
      return cases.map(function (entry) {
        return {
          caseId: entry.caseId,
          label: entry.label,
          inputPackage: JSON.parse(JSON.stringify(entry.inputPackage))
        };
      });
    }

    function getCase(caseId) {
      var index = indexOfCaseId(caseId);
      if (index === -1) return null;
      var entry = cases[index];
      return {
        caseId: entry.caseId,
        label: entry.label,
        inputPackage: JSON.parse(JSON.stringify(entry.inputPackage))
      };
    }

    function setLabel(caseId, label) {
      var index = indexOfCaseId(caseId);
      if (index === -1) {
        throw new Error('unknown caseId: ' + JSON.stringify(caseId));
      }
      cases[index].label = normalizeLabel(label);
      return true;
    }

    return {
      addCase: addCase,
      duplicateCase: duplicateCase,
      removeCase: removeCase,
      clear: clear,
      listCases: listCases,
      getCase: getCase,
      setLabel: setLabel,
      size: function () { return cases.length; },
      has: function (caseId) { return indexOfCaseId(caseId) !== -1; }
    };
  }

  // ============================================================
  // Evaluation（既存関数を呼ぶだけ）
  // ============================================================

  /**
   * 1 caseを評価する。
   *
   * single-case UIとまったく同じ順序・同じ関数を通る:
   *   area = GlassCalc.paneAreaM2(W, H)
   *   candidates = GlassCalc.generateCandidates(glassType, area, designP, extraFactor)
   *   { ok, ng, outOfScope } = GlassCalc.splitCandidates(candidates)
   *   best = ok[0] || null
   *
   * 推奨候補は必ず**OKかつ適用範囲内**の先頭から選ぶ。
   * out-of-scope候補をrecommendedへ昇格しない（§17）。
   */
  function evaluateCase(entry) {
    var base = {
      caseId: entry && entry.caseId,
      label: (entry && entry.label) || null,
      sourceKind: null,
      verificationStatus: null,
      widthMm: null,
      heightMm: null,
      areaM2: null,
      positivePressure: null,
      negativePressure: null,
      designPressure: null,
      glassType: null,
      extraFactor: null,
      recommendedCandidate: null,
      recommendedLabel: null,
      allowablePressure: null,
      marginRatio: null,
      marginPressure: null,
      okCount: 0,
      ngCount: 0,
      outOfScopeCount: 0,
      outOfScopePresent: false,
      status: 'INVALID',
      error: null
    };

    try {
      if (!entry || !isPlainObject(entry.inputPackage)) {
        throw new Error('case has no input package');
      }
      // 既存の正規化を通す（designPressureはここで再計算される）
      var pkg = ProjectInput.validateProjectInput(entry.inputPackage);

      base.sourceKind = pkg.sourceKind;
      base.verificationStatus = pkg.provenance ? pkg.provenance.verificationStatus : null;
      base.widthMm = pkg.widthMm;
      base.heightMm = pkg.heightMm;
      base.positivePressure = pkg.positivePressure;
      base.negativePressure = pkg.negativePressure;
      base.designPressure = pkg.designPressure;
      base.glassType = pkg.glassType;
      base.extraFactor = pkg.extraFactor;

      var area = GlassCalc.paneAreaM2(pkg.widthMm, pkg.heightMm);
      base.areaM2 = area;

      var all = GlassCalc.generateCandidates(
        pkg.glassType, area, pkg.designPressure, pkg.extraFactor
      );
      var split = GlassCalc.splitCandidates(all);

      base.okCount = split.okCandidates.length;
      base.ngCount = split.ngCandidates.length;
      base.outOfScopeCount = split.outOfScopeCandidates.length;
      base.outOfScopePresent = split.outOfScopeCandidates.length > 0;

      var best = split.okCandidates.length > 0 ? split.okCandidates[0] : null;
      if (best) {
        base.recommendedCandidate = best;
        base.recommendedLabel = best.label;
        base.allowablePressure = best.P;
        // §20: 単なる計算上の余裕であり、設計判断上の追加安全率ではない。
        if (typeof pkg.designPressure === 'number' && pkg.designPressure > 0) {
          base.marginRatio = best.P / pkg.designPressure;
          base.marginPressure = best.P - pkg.designPressure;
        }
        base.status = 'OK';
      } else {
        base.status = 'NO_SOLUTION';
      }
    } catch (e) {
      base.status = 'INVALID';
      base.error = e && e.message ? e.message : String(e);
    }

    return base;
  }

  /**
   * Workspace全体を評価する。
   *
   * row-isolated（§18）: 1 rowが壊れていても他rowの評価を止めない。
   * silent skipもしない — 壊れたrowは INVALID として**必ず結果に残る**。
   *
   * deterministic（§36）: 同じworkspaceを2回評価すれば、
   * 同じcase order・同じnormalized input・同じresultsになる。
   */
  function evaluateWorkspace(workspace) {
    var entries = typeof workspace.listCases === 'function'
      ? workspace.listCases()
      : workspace;
    if (!Array.isArray(entries)) {
      throw new Error('evaluateWorkspace(): expected a workspace or a case array');
    }
    return entries.map(function (entry) { return evaluateCase(entry); });
  }


  // ============================================================
  // Invalid診断レイヤ（Required Fix 2 / §4 / §5）
  // ============================================================

  var INVALID_RESULT_SOURCES = ['tsv', 'workspace_json'];


  /**
   * import時に弾かれた行を、**表示専用の** INVALID resultへ変換する。
   *
   * ── なぜWorkspaceへ入れないか ─────────────────────────────
   *
   * Workspaceが保持する入力は「常に妥当なPIP v2」でなければならない（AC-03）。
   * 壊れた入力をWorkspaceへ入れて INVALID を出せるようにすると、
   * authoritativeな入力モデルに妥当でないものが混ざり、
   * serializeWorkspace() がそれを書き出してしまう。
   *
   * そこで、妥当なcaseとは**別の層**として診断レコードだけを持つ。
   * これはreport用のオブジェクトであり、Project Input Packageではない。
   * ProjectInput / GlassCalc / WindPressure / serializeWorkspace のいずれにも渡さない。
   *
   * ── 何を載せてよいか（§8） ────────────────────────────────
   *
   * TSV            : lineNumber / 安全なcaseId / field / reason
   * Workspace JSON : case index / 安全なcaseId / reason
   * label          : normalizeLabel を通った後の値のみ
   *
   * 生のTSV行・生のJSON object・入力package全体・ファイル名・パスは**載せない**。
   */
  function errorToInvalidResult(error, source) {
    if (!isPlainObject(error)) {
      throw new Error('errorToInvalidResult(): error record must be an object');
    }
    if (INVALID_RESULT_SOURCES.indexOf(source) === -1) {
      throw new Error('errorToInvalidResult(): unknown source ' + JSON.stringify(source));
    }
    // F4: この関数は「INVALID行を作る唯一の正規経路」と位置づけている以上、
    // labelがnormalizeLabelを通っていることを**呼び出し側の規約に頼らない**。
    // ここを通らないlabelはCSVまで届いてしまう。
    var label = normalizeLabel(error.label === undefined ? null : error.label);
    return {
      caseId: error.caseId === undefined ? null : error.caseId,
      label: label,
      source: source,
      lineNumber: typeof error.lineNumber === 'number' ? error.lineNumber : null,
      index: typeof error.index === 'number' ? error.index : null,
      field: error.field === undefined ? null : error.field,
      // F1: 落ちた値がそのままCSVへ出ないようsanitizeを通す
      error: sanitizeReason(error.reason === undefined ? null : error.reason),
      status: 'INVALID',
      // 計算に属する値は**すべてnull**。INVALID行が数値を持つと、
      // summaryのmax値やgoverning caseへ混ざってしまう。
      sourceKind: null,
      verificationStatus: null,
      widthMm: null,
      heightMm: null,
      areaM2: null,
      positivePressure: null,
      negativePressure: null,
      designPressure: null,
      glassType: null,
      extraFactor: null,
      recommendedCandidate: null,
      recommendedLabel: null,
      allowablePressure: null,
      marginRatio: null,
      marginPressure: null,
      okCount: 0,
      ngCount: 0,
      outOfScopeCount: 0,
      outOfScopePresent: false
    };
  }

  /** import診断の配列をまとめてINVALID resultへ変換する。 */
  function errorsToInvalidResults(errors, source) {
    if (!Array.isArray(errors)) {
      throw new Error('errorsToInvalidResults(): errors array is required');
    }
    return errors.map(function (error) { return errorToInvalidResult(error, source); });
  }

  /**
   * 妥当caseの評価結果と、import診断のINVALID行を1つの表示用listにまとめる。
   *
   * 妥当case（追加順）→ INVALID診断（検出順）の順で並べる。
   * これ自体は表示用の並びであり、sort / filter は別途この結果に対して行う。
   */
  function mergeEvaluationResults(validResults, invalidResults) {
    if (!Array.isArray(validResults) || !Array.isArray(invalidResults)) {
      throw new Error('mergeEvaluationResults(): two result arrays are required');
    }
    for (var i = 0; i < validResults.length; i++) {
      if (validResults[i].status === 'INVALID' && validResults[i].source !== undefined) {
        throw new Error('mergeEvaluationResults(): diagnostic rows must be passed as invalidResults');
      }
    }
    for (var j = 0; j < invalidResults.length; j++) {
      if (invalidResults[j].status !== 'INVALID') {
        throw new Error('mergeEvaluationResults(): invalidResults must all be INVALID');
      }
    }
    return validResults.concat(invalidResults);
  }

  // ============================================================
  // Summary / Grouping
  // ============================================================

  /**
   * §19 summary。
   *
   * governing caseの定義を**明示する**（曖昧な「最も危険」を使わない）:
   *   基本   : OK caseのうち margin ratio が最小のもの
   *            （採用候補に対する余裕が最も小さい）
   *   代替   : OK caseが1件も無い場合は designPressure が最大のもの
   * どちらを採ったかは governingBasis で返す。
   */
  function summarize(results) {
    if (!Array.isArray(results)) {
      throw new Error('summarize(): results array is required');
    }
    var summary = {
      totalCases: results.length,
      okCount: 0,
      noSolutionCount: 0,
      invalidCount: 0,
      outOfScopePresentCount: 0,
      maxDesignPressure: null,
      maxAreaM2: null,
      governingCaseId: null,
      governingBasis: null
    };

    var minRatio = null;
    var maxPressureCaseId = null;

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.status === 'OK') summary.okCount += 1;
      else if (r.status === 'NO_SOLUTION') summary.noSolutionCount += 1;
      else summary.invalidCount += 1;

      if (r.outOfScopePresent) summary.outOfScopePresentCount += 1;

      if (typeof r.designPressure === 'number') {
        if (summary.maxDesignPressure === null || r.designPressure > summary.maxDesignPressure) {
          summary.maxDesignPressure = r.designPressure;
          maxPressureCaseId = r.caseId;
        }
      }
      if (typeof r.areaM2 === 'number') {
        if (summary.maxAreaM2 === null || r.areaM2 > summary.maxAreaM2) {
          summary.maxAreaM2 = r.areaM2;
        }
      }
      if (r.status === 'OK' && typeof r.marginRatio === 'number') {
        if (minRatio === null || r.marginRatio < minRatio) {
          minRatio = r.marginRatio;
          summary.governingCaseId = r.caseId;
          summary.governingBasis = 'min_margin_ratio';
        }
      }
    }

    if (summary.governingCaseId === null && maxPressureCaseId !== null) {
      summary.governingCaseId = maxPressureCaseId;
      summary.governingBasis = 'max_design_pressure';
    }

    return summary;
  }

  /**
   * §21 recommended glass configurationごとの集約。
   * NO_SOLUTION / INVALID は独立したgroupとして数える（混ぜない）。
   */
  function groupByRecommended(results) {
    if (!Array.isArray(results)) {
      throw new Error('groupByRecommended(): results array is required');
    }
    var order = [];
    var buckets = Object.create(null);

    results.forEach(function (r) {
      var key;
      if (r.status === 'OK' && r.recommendedLabel) key = r.recommendedLabel;
      else if (r.status === 'NO_SOLUTION') key = 'NO_SOLUTION';
      else key = 'INVALID';

      if (!Object.prototype.hasOwnProperty.call(buckets, key)) {
        buckets[key] = { key: key, count: 0, caseIds: [] };
        order.push(key);
      }
      buckets[key].count += 1;
      buckets[key].caseIds.push(r.caseId);
    });

    return order.map(function (key) { return buckets[key]; });
  }

  // ============================================================
  // Sort / Filter（結果をmutationしない）
  // ============================================================

  function sortResults(results, key, direction) {
    if (SORT_KEYS.indexOf(key) === -1) {
      throw new Error('unknown sort key: ' + JSON.stringify(key));
    }
    var sign = direction === 'desc' ? -1 : 1;
    // slice()で新しい配列を作る。evaluation resultそのものは並べ替えない（§36）。
    return results.slice().sort(function (a, b) {
      if (key === 'caseId') return sign * String(a.caseId).localeCompare(String(b.caseId));
      var av = a[key];
      var bv = b[key];
      // 値を持たない行（INVALID等）は方向によらず末尾へ置く
      var aMissing = typeof av !== 'number';
      var bMissing = typeof bv !== 'number';
      if (aMissing && bMissing) return String(a.caseId).localeCompare(String(b.caseId));
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (av === bv) return String(a.caseId).localeCompare(String(b.caseId));
      return sign * (av - bv);
    });
  }

  function filterResults(results, status) {
    if (FILTER_VALUES.indexOf(status) === -1) {
      throw new Error('unknown filter: ' + JSON.stringify(status));
    }
    if (status === 'ALL') return results.slice();
    return results.filter(function (r) { return r.status === status; });
  }


  // ============================================================
  // Workspace Package v1（§8 / §26 / §30）
  // ============================================================

  /**
   * Workspace Package v1 を組み立てる。
   *
   * **保存するのは入力だけである。** designPressure / recommendedGlass /
   * allowablePressure / trace といったderived resultは正本として保存しない（§8 / AC-05）。
   * 保存してしまうと、再importしたときに「計算し直した値」と「ファイルが主張する値」の
   * 2つの正本ができ、古いほうを信じる経路が生まれる。
   * import後は必ず recompute する。
   *
   * Evidence objectも出さない（§26 / §30）。
   */
  function toWorkspacePackage(workspace) {
    var entries = typeof workspace.listCases === 'function'
      ? workspace.listCases()
      : workspace;
    if (!Array.isArray(entries)) {
      throw new Error('toWorkspacePackage(): expected a workspace or a case array');
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      workspaceType: WORKSPACE_TYPE,
      cases: entries.map(function (entry) {
        return {
          caseId: entry.caseId,
          label: entry.label === undefined ? null : entry.label,
          inputPackage: entry.inputPackage
        };
      })
    };
  }

  /** deterministic serialization（キー順固定・2space indent / §26）。 */
  function serializeWorkspace(workspace) {
    var pkg = toWorkspacePackage(workspace);
    var ordered = {
      schemaVersion: pkg.schemaVersion,
      workspaceType: pkg.workspaceType,
      cases: pkg.cases.map(function (c) {
        return {
          caseId: c.caseId,
          label: c.label,
          // 1 case分の正規化済みpackageは ProjectInput.serialize() の
          // deterministic orderingをそのまま使う（キー順を二重管理しない）。
          inputPackage: JSON.parse(ProjectInput.serialize(c.inputPackage))
        };
      })
    };
    return JSON.stringify(ordered, null, 2);
  }

  /**
   * 外部Workspace JSONを読み込む（§10-B / §26 / §30）。
   *
   * 各caseの inputPackage は **ProjectInput.deserialize() を必ず通す**。
   * あちらが 16KB cap / 禁止キーの生テキスト遮断 / 構造検査 /
   * imported_unverified への強制降格 をすべて行う。ここで再実装しない。
   * したがって、ファイルが registered_preset / verified / primary を名乗っても
   * trusted stateにはならない。
   *
   * whole-fileの問題（size / malformed / unsafe / 未知schema）は fail closed で throw する。
   * 個別caseの問題は、そのcaseを**採用せず** errors に残す。silent skipはしない（§18）。
   *
   * @returns {{workspace: object, errors: Array<{index:number, caseId:(string|null), reason:string}>}}
   */
  function deserializeWorkspace(jsonText) {
    if (typeof jsonText !== 'string') {
      throw new Error('deserializeWorkspace(): input must be a JSON string');
    }
    if (byteLengthOf(jsonText) > MAX_WORKSPACE_BYTES) {
      throw new Error('workspace payload is too large (max ' + MAX_WORKSPACE_BYTES + ' bytes)');
    }

    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('workspace payload is not valid JSON');
    }
    if (!isPlainObject(parsed)) {
      throw new Error('workspace payload must be an object');
    }
    assertAllowedKeys(parsed, TOP_LEVEL_WORKSPACE_KEYS, 'workspace payload');

    if (parsed.workspaceType !== WORKSPACE_TYPE) {
      throw new Error('unsupported workspaceType: ' + JSON.stringify(parsed.workspaceType));
    }
    if (SUPPORTED_SCHEMA_VERSIONS.indexOf(parsed.schemaVersion) === -1) {
      throw new Error('unsupported workspace schemaVersion: ' + JSON.stringify(parsed.schemaVersion));
    }
    if (!Array.isArray(parsed.cases)) {
      throw new Error('workspace payload: cases must be an array');
    }
    if (parsed.cases.length > MAX_CASES) {
      throw new Error('workspace has too many cases (max ' + MAX_CASES + ')');
    }

    var workspace = createWorkspace();
    var errors = [];

    parsed.cases.forEach(function (rawCase, index) {
      var safeCaseId = null;
      var safeLabel = null;
      try {
        if (!isPlainObject(rawCase)) {
          throw new Error('case must be an object');
        }
        assertAllowedKeys(rawCase, CASE_KEYS, 'case');
        // caseIdはpatternを通ったときだけerror報告に載せてよい（§37）
        var caseId = assertCaseId(rawCase.caseId);
        safeCaseId = caseId;
        var label = normalizeLabel(rawCase.label);
        safeLabel = label;
        if (!isPlainObject(rawCase.inputPackage)) {
          throw new Error('case inputPackage must be an object');
        }
        // 既存の外部import境界をそのまま通す（trust downgradeを含む）
        var normalized = ProjectInput.deserialize(JSON.stringify(rawCase.inputPackage));
        workspace.addCase(normalized, { caseId: caseId, label: label });
      } catch (e) {
        // §37: 生のrow全体をerrorへ貼り付けない。理由だけを残す。
        errors.push({
          index: index,
          caseId: safeCaseId,
          label: safeLabel,
          field: null,
          reason: sanitizeReason(e && e.message ? e.message : String(e))
        });
      }
    });

    return { workspace: workspace, errors: errors };
  }

  // ============================================================
  // TSV paste（§23 / §24 / §37）
  // ============================================================

  var TSV_COMMON_COLUMNS = [
    'case_id', 'label', 'mode', 'width_mm', 'height_mm', 'glass_type', 'extra_factor'
  ];
  var TSV_MANUAL_COLUMNS = ['positive_pressure', 'negative_pressure'];
  var TSV_NOTIFICATION_COLUMNS = [
    'v0', 'roughness', 'building_height_m', 'eaves_height_m', 'evaluation_height_m',
    'building_type', 'zone', 'basis', 'recurrence_years', 'building_short_side_m'
  ];
  var TSV_KNOWN_COLUMNS = TSV_COMMON_COLUMNS
    .concat(TSV_MANUAL_COLUMNS)
    .concat(TSV_NOTIFICATION_COLUMNS);

  var TSV_REQUIRED_COLUMNS = ['mode', 'width_mm', 'height_mm', 'glass_type'];
  var TSV_MANUAL_REQUIRED = ['positive_pressure', 'negative_pressure'];
  // basis は既定値を持たない。Phase 2Eが意図的にそうしている——
  // notification_baseline と itakyo_recommended は「どちらを設計の根拠にするか」
  // という判断であり、片方を黙って既定にすると、業界推奨値が法定最低値として
  // 通ってしまう（またはその逆）。TSVでも必須列として要求する。
  var TSV_NOTIFICATION_REQUIRED = [
    'v0', 'roughness', 'building_height_m', 'eaves_height_m', 'evaluation_height_m',
    'building_type', 'zone', 'basis'
  ];

  // TSVから受け付けてはいけない列。unknown column判定でも落ちるが、
  // 「なぜ駄目なのか」を明確に伝えるため個別に名指しする（§24）。
  var TSV_FORBIDDEN_COLUMNS = [
    'design_pressure', 'designpressure', 'recommended_glass', 'recommendedglass',
    'allowable_pressure', 'allowablepressure', 'verified', 'verification_status',
    'verificationstatus', 'evidence', 'source_kind', 'sourcekind', 'provenance',
    'verified_cases', 'verifiedcases', 'status', 'margin'
  ];

  var TSV_NOTIFICATION_FIELD_MAP = {
    v0: 'V0',
    roughness: 'roughnessCategory',
    building_height_m: 'buildingHeightM',
    eaves_height_m: 'eavesHeightM',
    evaluation_height_m: 'evaluationHeightM',
    building_type: 'buildingType',
    zone: 'zone',
    basis: 'basis',
    recurrence_years: 'recurrenceYears',
    building_short_side_m: 'buildingShortSideM'
  };
  var TSV_NOTIFICATION_NUMERIC = [
    'v0', 'building_height_m', 'eaves_height_m', 'evaluation_height_m',
    'recurrence_years', 'building_short_side_m'
  ];

  function parseNumericField(raw, columnName) {
    var text = String(raw).trim();
    if (text === '') {
      throw new Error(columnName + ': value is required');
    }
    // Number()は '' や空白を0にするため、先に空を弾いてから使う
    var value = Number(text);
    if (!isFinite(value)) {
      throw new Error(columnName + ': value must be a finite number');
    }
    return value;
  }


  /**
   * TSVの「表としての構造」だけを解釈する汎用パーサ。
   *
   * ここが見るのはsizeとheaderと物理行だけで、列の意味は見ない。
   * Phase 2GのWorkspace TSVも、Phase 2HのScenario Matrix TSVも、
   * 同じ物理行番号規約・同じheader規約・同じfail closedの形で動く必要がある。
   * 2か所に書くと、片方だけ直したときに片方の行番号がずれる。
   *
   * whole-fileの問題（size / 空 / header不正 / 列不正 / 行数超過）はthrowする。
   * 個別行の解釈は呼び出し側が行う。
   *
   * @returns {{header: string[], seen: object, rows: Array<{lineNumber:number, text:string, record:object}>}}
   */
  function parseTsvTable(text, options) {
    options = options || {};
    var label = options.label || 'TSV';
    var knownColumns = options.knownColumns || [];
    var forbiddenColumns = options.forbiddenColumns || [];
    var requiredColumns = options.requiredColumns || [];
    var maxBytes = typeof options.maxBytes === 'number' ? options.maxBytes : MAX_TSV_BYTES;
    var maxRows = typeof options.maxRows === 'number' ? options.maxRows : MAX_CASES;
    var forbiddenMessage = options.forbiddenMessage ||
      function (name) { return label + ' must not carry the column: ' + JSON.stringify(name); };

    if (typeof text !== 'string') {
      throw new Error(label + ': input must be a string');
    }
    if (byteLengthOf(text) > maxBytes) {
      throw new Error(label + ' payload is too large (max ' + maxBytes + ' bytes)');
    }

    // 物理行番号を保つ。空行はデータにしないが**番号は消費する**。
    // 空行を先に捨てて番号を振ると、Excel上の行番号とずれる。
    var physicalLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (physicalLines.length === 0) {
      throw new Error(label + ' payload is empty');
    }
    // headerは必ず物理1行目。空でも後ろへずらさない。
    if (physicalLines[0].trim() === '') {
      throw new Error(label + ' line 1 must be the header row (it is blank)');
    }

    var header = physicalLines[0].split('\t').map(function (h) { return h.trim().toLowerCase(); });
    if (header.length > knownColumns.length) {
      throw new Error(label + ' has too many columns (max ' + knownColumns.length + ')');
    }

    var seen = Object.create(null);
    for (var h = 0; h < header.length; h++) {
      var name = header[h];
      if (name === '') {
        throw new Error(label + ' header has an empty column name at position ' + (h + 1));
      }
      if (forbiddenColumns.indexOf(name) !== -1) {
        throw new Error(forbiddenMessage(name));
      }
      if (knownColumns.indexOf(name) === -1) {
        throw new Error(label + ' has an unknown column: ' + JSON.stringify(name));
      }
      if (seen[name]) {
        throw new Error(label + ' has a duplicate column: ' + JSON.stringify(name));
      }
      seen[name] = true;
    }
    for (var r = 0; r < requiredColumns.length; r++) {
      if (!seen[requiredColumns[r]]) {
        throw new Error(label + ' is missing a required column: ' + JSON.stringify(requiredColumns[r]));
      }
    }

    var dataRows = [];
    for (var li = 1; li < physicalLines.length; li++) {
      if (physicalLines[li].trim() === '') continue;
      dataRows.push({ lineNumber: li + 1, text: physicalLines[li] });
    }
    // 上限は**実データ行数**で数える（空行でcapを回避できない）
    if (dataRows.length > maxRows) {
      throw new Error(label + ' has too many rows (max ' + maxRows + ')');
    }

    var rows = dataRows.map(function (dataRow) {
      var cells = dataRow.text.split('\t');
      var record = Object.create(null);
      var tooManyCells = cells.length > header.length;
      header.forEach(function (colName, ci) {
        record[colName] = ci < cells.length ? String(cells[ci]).trim() : '';
      });
      return {
        lineNumber: dataRow.lineNumber,
        text: dataRow.text,
        record: record,
        tooManyCells: tooManyCells
      };
    });

    return { header: header, seen: seen, rows: rows };
  }

  /**
   * ExcelからのTSV貼り付けを解析して、case specの配列にする。
   *
   * 返すのは **入力だけ** である。designPressure / recommendedGlass /
   * verified / Evidence といったderived・trust fieldは受け付けない（§24 / AC-14）。
   * unknown columnはsilent ignoreせず reject する。
   *
   * @returns {{rows: Array<{lineNumber:number, caseId:(string|null), label:(string|null), mode:string, input:object}>,
   *            errors: Array<{lineNumber:number, caseId:(string|null), field:(string|null), reason:string}>}}
   */
  function parseTsv(text) {
    var table = parseTsvTable(text, {
      label: 'TSV',
      knownColumns: TSV_KNOWN_COLUMNS,
      forbiddenColumns: TSV_FORBIDDEN_COLUMNS,
      requiredColumns: TSV_REQUIRED_COLUMNS,
      maxBytes: MAX_TSV_BYTES,
      maxRows: MAX_CASES,
      forbiddenMessage: function (name) {
        return 'TSV must not carry a derived or trust column: ' + JSON.stringify(name) +
          ' (pressures and glass selection are computed, never imported)';
      }
    });
    var seen = table.seen;

    var rows = [];
    var errors = [];

    table.rows.forEach(function (dataRow) {
      var lineNumber = dataRow.lineNumber;   // 物理行番号（1-based）
      var record = dataRow.record;
      var safeCaseId = null;
      var safeLabel = null;
      var currentField = null;
      try {
        if (dataRow.tooManyCells) {
          throw new Error('row has more cells than the header declares');
        }

        if (record.case_id) {
          currentField = 'case_id';
          safeCaseId = assertCaseId(record.case_id);
        }
        currentField = 'label';
        var label = normalizeLabel(record.label === '' ? null : record.label);
        // normalizeLabel を通った後の値だけを診断に載せてよい（§8）
        safeLabel = label;

        currentField = 'mode';
        var mode = (record.mode || '').toLowerCase();
        if (mode !== 'manual' && mode !== 'notification') {
          throw new Error('mode must be "manual" or "notification"');
        }

        currentField = 'width_mm';
        var widthMm = parseNumericField(record.width_mm, 'width_mm');
        currentField = 'height_mm';
        var heightMm = parseNumericField(record.height_mm, 'height_mm');
        currentField = 'glass_type';
        var glassType = record.glass_type;
        if (!glassType) {
          throw new Error('glass_type: value is required');
        }
        currentField = 'extra_factor';
        var extraFactor = record.extra_factor === '' || record.extra_factor === undefined
          ? 1.0
          : parseNumericField(record.extra_factor, 'extra_factor');

        var input;
        if (mode === 'manual') {
          TSV_MANUAL_REQUIRED.forEach(function (col) {
            if (!seen[col]) {
              // F2: currentFieldを更新せずにthrowすると、直前に触った列
              // （extra_factor）が原因として報告されてしまう。
              currentField = col;
              throw new Error('mode=manual requires column: ' + col);
            }
          });
          currentField = 'positive_pressure';
          var positive = parseNumericField(record.positive_pressure, 'positive_pressure');
          currentField = 'negative_pressure';
          var negative = parseNumericField(record.negative_pressure, 'negative_pressure');
          input = {
            widthMm: widthMm, heightMm: heightMm,
            positivePressure: positive, negativePressure: negative,
            glassType: glassType, extraFactor: extraFactor
          };
        } else {
          TSV_NOTIFICATION_REQUIRED.forEach(function (col) {
            if (!seen[col]) {
              currentField = col;
              throw new Error('mode=notification requires column: ' + col);
            }
          });
          var windInput = {};
          Object.keys(TSV_NOTIFICATION_FIELD_MAP).forEach(function (col) {
            if (!seen[col]) return;
            var rawValue = record[col];
            if (rawValue === '' || rawValue === undefined) {
              if (TSV_NOTIFICATION_REQUIRED.indexOf(col) !== -1) {
                currentField = col;
                throw new Error(col + ': value is required');
              }
              return;   // optional column, left blank
            }
            currentField = col;
            windInput[TSV_NOTIFICATION_FIELD_MAP[col]] =
              TSV_NOTIFICATION_NUMERIC.indexOf(col) !== -1
                ? parseNumericField(rawValue, col)
                : rawValue;
          });
          input = {
            widthMm: widthMm, heightMm: heightMm,
            glassType: glassType, extraFactor: extraFactor,
            windInput: windInput
          };
        }

        rows.push({
          lineNumber: lineNumber,
          caseId: safeCaseId,
          label: label,
          mode: mode,
          input: input
        });
      } catch (e) {
        // §37: line number / safeなcase id / field / reason のみ。
        // 生のrowそのものは残さない（案件名や寸法がそのままlogへ出ない）。
        errors.push({
          lineNumber: lineNumber,
          caseId: safeCaseId,
          label: safeLabel,
          field: currentField,
          // 境界はここ1か所にする。呼び出し側それぞれでsanitizeすると、
          // 必ずどこか1つ忘れる（実際、status行だけ生のまま出ていた）。
          reason: sanitizeReason(e && e.message ? e.message : String(e))
        });
      }
    });

    return { rows: rows, errors: errors };
  }

  /**
   * parseTsv() の結果をWorkspaceへ流し込む。
   *
   * TSVは常に外部user inputであり、manual / notification にしかならない（§10-C）。
   * registered_preset / verified / Evidence をここから作る経路は存在しない。
   */
  function addTsvRows(workspace, parsed) {
    var errors = parsed.errors.slice();
    var added = [];

    parsed.rows.forEach(function (row) {
      try {
        var pkg = row.mode === 'manual'
          ? ProjectInput.fromManual(row.input)
          : ProjectInput.fromWindCalculation(row.input);
        var caseId = workspace.addCase(pkg, { caseId: row.caseId, label: row.label });
        added.push(caseId);
      } catch (e) {
        // §9: parseTsvを通った後、既存ProjectInputのvalidationで落ちる場合がある
        // （glass type / 寸法範囲 / extraFactor / 圧力contract / wind contract）。
        // その判定ロジックをここへ複製すると、契約が二重になり必ずズレる。
        // かといって error textを正規表現で切り分けるのも脆い。
        // したがって「ProjectInput正規化に由来する失敗」という**安定した上位field**を返す。
        // field: null は、fieldに属しようがない構造的失敗のために残しておく。
        errors.push({
          lineNumber: row.lineNumber,
          caseId: row.caseId,
          label: row.label,
          field: 'project_input',
          reason: sanitizeReason(e && e.message ? e.message : String(e))
        });
      }
    });

    return { added: added, errors: errors };
  }

  // ============================================================
  // CSV result export（§27 / §28）
  // ============================================================

  // Excel / LibreOffice は先頭がこれらの文字のセルを数式として解釈しうる。
  // タブ・CR も先頭にあると同じ扱いを受けることがある。
  var CSV_FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

  /**
   * untrustedなstring cellを、表計算ソフトが数式として実行しないように中和する。
   *
   * 値を削らず、先頭へシングルクォートを付ける（Excelのliteral text prefix）。
   * 数値セルには適用しない — 負数の先頭 '-' を潰してしまうため、
   * 数値は呼び出し側が number として渡し、ここを通さない。
   */
  function neutralizeCsvCell(value) {
    if (value === null || value === undefined) return '';
    var text = String(value);
    if (text.length === 0) return text;
    if (CSV_FORMULA_TRIGGERS.indexOf(text.charAt(0)) !== -1) {
      return "'" + text;
    }
    return text;
  }

  /** RFC4180準拠のescaping（quote / comma / newline / double quote）。 */
  function csvEscape(text) {
    var value = text === null || text === undefined ? '' : String(text);
    if (/[",\n\r]/.test(value)) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  function csvStringCell(value) {
    return csvEscape(neutralizeCsvCell(value));
  }

  function csvNumberCell(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '';
    return String(value);
  }

  var CSV_COLUMNS = [
    'caseId', 'label', 'sourceKind', 'widthMm', 'heightMm', 'areaM2',
    'designPressure', 'glassType', 'recommendedGlass', 'allowablePressure',
    'marginRatio', 'marginPressure', 'status', 'error'
  ];

  /**
   * 評価結果をCSVにする。
   *
   * CSVは**derived report**であり、Workspace input packageとは別物である（§27）。
   * これを再importして入力に戻す経路は作らない。
   */
  function toCsv(results) {
    if (!Array.isArray(results)) {
      throw new Error('toCsv(): results array is required');
    }
    var lines = [CSV_COLUMNS.map(csvStringCell).join(',')];
    results.forEach(function (r) {
      lines.push([
        csvStringCell(r.caseId),
        csvStringCell(r.label),
        csvStringCell(r.sourceKind),
        csvNumberCell(r.widthMm),
        csvNumberCell(r.heightMm),
        csvNumberCell(r.areaM2),
        csvNumberCell(r.designPressure),
        csvStringCell(r.glassType),
        csvStringCell(r.recommendedLabel),
        csvNumberCell(r.allowablePressure),
        csvNumberCell(r.marginRatio),
        csvNumberCell(r.marginPressure),
        csvStringCell(r.status),
        csvStringCell(r.error)
      ].join(','));
    });
    return lines.join('\n');
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    WORKSPACE_TYPE: WORKSPACE_TYPE,
    SUPPORTED_SCHEMA_VERSIONS: Object.freeze(SUPPORTED_SCHEMA_VERSIONS),
    MAX_CASES: MAX_CASES,
    MAX_WORKSPACE_BYTES: MAX_WORKSPACE_BYTES,
    MAX_TSV_BYTES: MAX_TSV_BYTES,
    MAX_LABEL_LENGTH: MAX_LABEL_LENGTH,
    MAX_CASE_ID_LENGTH: MAX_CASE_ID_LENGTH,
    CASE_ID_PATTERN: CASE_ID_PATTERN,
    CASE_STATUSES: Object.freeze(CASE_STATUSES),
    FILTER_VALUES: Object.freeze(FILTER_VALUES),
    SORT_KEYS: Object.freeze(SORT_KEYS),
    TOP_LEVEL_WORKSPACE_KEYS: Object.freeze(TOP_LEVEL_WORKSPACE_KEYS),
    CASE_KEYS: Object.freeze(CASE_KEYS),
    assertCaseId: assertCaseId,
    normalizeLabel: normalizeLabel,
    createWorkspace: createWorkspace,
    evaluateCase: evaluateCase,
    evaluateWorkspace: evaluateWorkspace,
    summarize: summarize,
    groupByRecommended: groupByRecommended,
    sortResults: sortResults,
    filterResults: filterResults,
    parseTsvTable: parseTsvTable,
    INVALID_RESULT_SOURCES: Object.freeze(INVALID_RESULT_SOURCES),
    MAX_REASON_LENGTH: MAX_REASON_LENGTH,
    SAFE_REASON_VOCABULARY: Object.freeze(SAFE_REASON_VOCABULARY),
    sanitizeReason: sanitizeReason,
    errorToInvalidResult: errorToInvalidResult,
    errorsToInvalidResults: errorsToInvalidResults,
    mergeEvaluationResults: mergeEvaluationResults,
    toWorkspacePackage: toWorkspacePackage,
    serializeWorkspace: serializeWorkspace,
    deserializeWorkspace: deserializeWorkspace,
    TSV_KNOWN_COLUMNS: Object.freeze(TSV_KNOWN_COLUMNS),
    TSV_REQUIRED_COLUMNS: Object.freeze(TSV_REQUIRED_COLUMNS),
    TSV_MANUAL_REQUIRED: Object.freeze(TSV_MANUAL_REQUIRED),
    TSV_NOTIFICATION_REQUIRED: Object.freeze(TSV_NOTIFICATION_REQUIRED),
    TSV_FORBIDDEN_COLUMNS: Object.freeze(TSV_FORBIDDEN_COLUMNS),
    parseTsv: parseTsv,
    addTsvRows: addTsvRows,
    CSV_COLUMNS: Object.freeze(CSV_COLUMNS),
    CSV_FORMULA_TRIGGERS: Object.freeze(CSV_FORMULA_TRIGGERS),
    neutralizeCsvCell: neutralizeCsvCell,
    csvEscape: csvEscape,
    toCsv: toCsv
  };
});
