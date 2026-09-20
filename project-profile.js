/**
 * project-profile.js
 *
 * Runtime Project Profile / Scenario Matrix（Phase 2H）。案件非依存。
 *
 * ── これが何で、何でないか ────────────────────────────────
 *
 * 大量の告示風圧caseを作るとき、案件共通の風条件を毎回打ち直すのは現実的でない。
 * Profileはそれを1回だけ入力するための**利用者の便宜レイヤ**である。
 *
 *   Profile（案件共通）  : V0 / 粗度 / 建物高さ / 軒高 / 建物タイプ / 算定基準
 *   Scenario（pane固有） : W / H / 評価高さ Z / 部位 / ガラス種別 / extraFactor
 *
 * Profileは **registered preset ではない**。**verified Evidence でもない**。
 * 保存しても、exportしても、100 caseで使っても、検証状況は変わらない。
 * 検証状況はfactの出所に属し、入力回数にも一致回数にも属さない。
 *
 * ── なぜ evaluationHeightM と zone をProfileに入れないか ──────
 *
 * この2つは pane / location ごとに違い、設計風圧を直接左右する。
 * 案件共通Profileから暗黙継承させると、別階・別部位へ同じ値が黙って適用され、
 * しかも画面上は正常に見える。
 *
 * だからこの2つは「入れてはいけない」という規約ではなく、
 * **入れる場所が無い**構造にしてある。schemaが持たないので継承しようがない。
 *
 * ── 計算は書かない ──────────────────────────────────────
 *
 * Profile + Scenario は effective WindInput へ展開するだけで、
 * そこから先は既存の ProjectInput.fromWindCalculation() → wind-pressure.js が行う。
 * このmoduleに風圧式・強度式は無い。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectProfile = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  function resolveDependency(globalName, requirePath, label) {
    if (global && global[globalName]) return global[globalName];
    if (typeof require === 'function') {
      try { return require(requirePath); } catch (e) { /* fallthrough */ }
    }
    throw new Error('project-profile.js: ' + label + ' is required but not available');
  }

  var ProjectInput = resolveDependency(
    'ProjectInput', './project-config/project-input.js', 'project-input.js (ProjectInput)');
  var WorkspaceCore = resolveDependency('WorkspaceCore', './workspace.js', 'workspace.js (WorkspaceCore)');

  // ============================================================
  // Contract
  // ============================================================

  var PROFILE_SCHEMA_VERSION = 1;
  var PROFILE_TYPE = 'runtime_wind_profile';
  var SUPPORTED_PROFILE_SCHEMA_VERSIONS = [1];

  /** Runtime Profileが名乗れる検証状況はこれ1つだけ（§6）。 */
  var PROFILE_STATUS = 'user_input_unverified';

  // Profileが持つ風条件。ProjectInput.WIND_INPUT_KEYS から
  // evaluationHeightM と zone を**除いた**もの。
  var PROFILE_WIND_FIELDS = [
    'V0', 'roughnessCategory', 'buildingHeightM', 'eavesHeightM',
    'buildingType', 'basis', 'recurrenceYears', 'buildingShortSideM'
  ];
  var PROFILE_WIND_REQUIRED = [
    'V0', 'roughnessCategory', 'buildingHeightM', 'eavesHeightM', 'buildingType', 'basis'
  ];
  var PROFILE_WIND_NUMERIC = [
    'V0', 'buildingHeightM', 'eavesHeightM', 'recurrenceYears', 'buildingShortSideM'
  ];

  // Profileに現れてはいけないfield。
  // 単に「未知field」として落としてもよいが、なぜ駄目かを伝えたいので名指しする。
  var PROFILE_PER_SCENARIO_FIELDS = ['evaluationHeightM', 'zone'];
  var PROFILE_TRUST_FIELDS = [
    'verificationStatus', 'verified', 'evidence', 'sourceReference',
    'privateReferenceAvailable', 'sourceKind', 'sourceId', 'provenance',
    'verifiedCases', 'registeredPreset', 'presetId'
  ];

  var PROFILE_TOP_LEVEL_KEYS = ['schemaVersion', 'profileType', 'label', 'windDefaults'];

  // Scenarioが持つ pane / location 固有の値
  var SCENARIO_FIELDS = [
    'scenarioId', 'label', 'widthMm', 'heightMm',
    'evaluationHeightM', 'zone', 'glassType', 'extraFactor'
  ];
  var SCENARIO_REQUIRED = ['widthMm', 'heightMm', 'evaluationHeightM', 'zone', 'glassType'];
  var SCENARIO_NUMERIC = ['widthMm', 'heightMm', 'evaluationHeightM', 'extraFactor'];

  var MAX_PROFILE_BYTES = 64 * 1024;
  var MAX_PROFILE_DEPTH = 6;
  var MAX_LABEL_LENGTH = WorkspaceCore.MAX_LABEL_LENGTH;
  var MAX_SCENARIOS = WorkspaceCore.MAX_CASES;
  var SCENARIO_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
  var MAX_SCENARIO_ID_LENGTH = 64;

  var FORBIDDEN_RAW_KEYS = ['__proto__', 'constructor', 'prototype'];

  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function byteLengthOf(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return Buffer.byteLength(text, 'utf8');
  }

  function assertSafeStructure(value, depth) {
    if (depth > MAX_PROFILE_DEPTH) {
      throw new Error('profile payload is nested too deeply (max ' + MAX_PROFILE_DEPTH + ')');
    }
    if (Array.isArray(value)) {
      value.forEach(function (v) { assertSafeStructure(v, depth + 1); });
      return;
    }
    if (!isPlainObject(value)) return;
    Object.keys(value).forEach(function (key) {
      if (FORBIDDEN_RAW_KEYS.indexOf(key) !== -1) {
        throw new Error('profile payload contains a forbidden key: ' + key);
      }
      assertSafeStructure(value[key], depth + 1);
    });
  }

  function assertAllowedKeys(obj, allowed, label) {
    Object.keys(obj).forEach(function (key) {
      if (allowed.indexOf(key) === -1) {
        throw new Error(label + ' has an unexpected field: ' + JSON.stringify(key));
      }
    });
  }

  function requireFiniteNumber(value, field) {
    if (value === undefined || value === null || value === '') {
      throw new Error(field + ' is required');
    }
    var n = typeof value === 'number' ? value : Number(String(value).trim());
    if (typeof value !== 'number' && String(value).trim() === '') {
      throw new Error(field + ' is required');
    }
    if (!isFinite(n)) {
      throw new Error(field + ' must be a finite number');
    }
    return n;
  }

  function requireNonEmptyString(value, field) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(field + ' is required');
    }
    return value.trim();
  }

  // ============================================================
  // Profile
  // ============================================================

  /**
   * Runtime Project Profile を作る。
   *
   * 検証状況は常に `user_input_unverified`。呼び出し側が何を渡しても変わらない。
   * windDefaults に evaluationHeightM / zone / trust系fieldがあれば**拒否**する。
   */
  function createProfile(input) {
    if (!isPlainObject(input)) {
      throw new Error('profile input must be an object');
    }
    assertAllowedKeys(input, ['label', 'windDefaults'], 'profile input');

    var windDefaults = input.windDefaults;
    if (!isPlainObject(windDefaults)) {
      throw new Error('profile windDefaults must be an object');
    }

    // なぜこの2つが駄目なのかを、未知fieldの一般メッセージで済ませない
    PROFILE_PER_SCENARIO_FIELDS.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(windDefaults, field)) {
        throw new Error(
          'profile must not carry ' + field + ': it varies per pane/location and ' +
            'is required on each scenario instead (inheriting it silently applies ' +
            'one location\'s value to another)'
        );
      }
    });
    PROFILE_TRUST_FIELDS.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(windDefaults, field) ||
          Object.prototype.hasOwnProperty.call(input, field)) {
        throw new Error(
          'profile must not carry ' + field + ': a runtime profile is user input and ' +
            'never carries a verification claim'
        );
      }
    });
    assertAllowedKeys(windDefaults, PROFILE_WIND_FIELDS, 'profile windDefaults');

    var resolved = {};
    PROFILE_WIND_REQUIRED.forEach(function (field) {
      // §12: 既定値を作らない。欠けていれば fail closed。
      if (!Object.prototype.hasOwnProperty.call(windDefaults, field)) {
        throw new Error('profile windDefaults.' + field + ' is required (no default is assumed)');
      }
      resolved[field] = PROFILE_WIND_NUMERIC.indexOf(field) !== -1
        ? requireFiniteNumber(windDefaults[field], 'windDefaults.' + field)
        : requireNonEmptyString(windDefaults[field], 'windDefaults.' + field);
    });
    ['recurrenceYears', 'buildingShortSideM'].forEach(function (field) {
      if (windDefaults[field] === undefined || windDefaults[field] === null || windDefaults[field] === '') return;
      resolved[field] = requireFiniteNumber(windDefaults[field], 'windDefaults.' + field);
    });

    return Object.freeze({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profileType: PROFILE_TYPE,
      label: WorkspaceCore.normalizeLabel(input.label),
      // 検証状況はここで固定する。入力から持ち込めない。
      verificationStatus: PROFILE_STATUS,
      windDefaults: Object.freeze(resolved)
    });
  }

  /** Profile Package v1（入力のみ。計算結果・検証主張を含まない / §7）。 */
  function serializeProfile(profile) {
    if (!isPlainObject(profile) || profile.profileType !== PROFILE_TYPE) {
      throw new Error('serializeProfile(): a runtime profile is required');
    }
    var windDefaults = {};
    PROFILE_WIND_FIELDS.forEach(function (field) {
      if (profile.windDefaults[field] !== undefined) windDefaults[field] = profile.windDefaults[field];
    });
    return JSON.stringify({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profileType: PROFILE_TYPE,
      label: profile.label === undefined ? null : profile.label,
      windDefaults: windDefaults
    }, null, 2);
  }

  /**
   * 外部Profile JSONを読み込む（§25）。
   *
   * 外部データなので、何を名乗っても runtime unverified にしかならない。
   * createProfile() を通すので、trust系fieldもper-scenario fieldも同じ理由で落ちる。
   */
  function deserializeProfile(jsonText) {
    if (typeof jsonText !== 'string') {
      throw new Error('deserializeProfile(): input must be a JSON string');
    }
    if (byteLengthOf(jsonText) > MAX_PROFILE_BYTES) {
      throw new Error('profile payload is too large (max ' + MAX_PROFILE_BYTES + ' bytes)');
    }
    // parse前の生テキストでも危険キーを遮断する
    for (var i = 0; i < FORBIDDEN_RAW_KEYS.length; i++) {
      if (jsonText.indexOf('"' + FORBIDDEN_RAW_KEYS[i] + '"') !== -1) {
        throw new Error('profile payload contains a forbidden key: ' + FORBIDDEN_RAW_KEYS[i]);
      }
    }
    var parsed;
    try { parsed = JSON.parse(jsonText); }
    catch (e) { throw new Error('profile payload is not valid JSON'); }

    if (!isPlainObject(parsed)) throw new Error('profile payload must be an object');
    assertSafeStructure(parsed, 0);
    assertAllowedKeys(parsed, PROFILE_TOP_LEVEL_KEYS, 'profile payload');

    if (parsed.profileType !== PROFILE_TYPE) {
      throw new Error('unsupported profileType: ' + JSON.stringify(parsed.profileType));
    }
    if (SUPPORTED_PROFILE_SCHEMA_VERSIONS.indexOf(parsed.schemaVersion) === -1) {
      throw new Error('unsupported profile schemaVersion: ' + JSON.stringify(parsed.schemaVersion));
    }
    return createProfile({ label: parsed.label, windDefaults: parsed.windDefaults });
  }

  // ============================================================
  // Scenario
  // ============================================================

  /**
   * Scenario を作る。
   *
   * §10: labelに「2F」と書かれていても evaluationHeightM は**必ず独立入力**。
   * 階から評価高さを導く経路はこのmoduleに存在しない。
   */
  function createScenario(input) {
    if (!isPlainObject(input)) {
      throw new Error('scenario input must be an object');
    }
    assertAllowedKeys(input, SCENARIO_FIELDS, 'scenario');

    var scenarioId = null;
    if (input.scenarioId !== undefined && input.scenarioId !== null && input.scenarioId !== '') {
      if (typeof input.scenarioId !== 'string' || input.scenarioId.length > MAX_SCENARIO_ID_LENGTH ||
          !SCENARIO_ID_PATTERN.test(input.scenarioId)) {
        throw new Error('scenarioId must start with a letter and use letters/digits/_/- (max 64)');
      }
      scenarioId = input.scenarioId;
    }

    SCENARIO_REQUIRED.forEach(function (field) {
      if (input[field] === undefined || input[field] === null || input[field] === '') {
        throw new Error('scenario ' + field + ' is required (no default is assumed)');
      }
    });

    return Object.freeze({
      scenarioId: scenarioId,
      label: WorkspaceCore.normalizeLabel(input.label),
      widthMm: requireFiniteNumber(input.widthMm, 'widthMm'),
      heightMm: requireFiniteNumber(input.heightMm, 'heightMm'),
      evaluationHeightM: requireFiniteNumber(input.evaluationHeightM, 'evaluationHeightM'),
      zone: requireNonEmptyString(input.zone, 'zone'),
      glassType: requireNonEmptyString(input.glassType, 'glassType'),
      extraFactor: (input.extraFactor === undefined || input.extraFactor === null || input.extraFactor === '')
        ? 1.0
        : requireFiniteNumber(input.extraFactor, 'extraFactor')
    });
  }

  // ============================================================
  // Effective input resolver（§11 / §12）
  // ============================================================

  /**
   * Profile + Scenario を1つの WindInput へ展開する pure function。
   *
   * ここで**何も推測しない**。欠けていれば fail closed。
   * 特に:
   *   - basis を notification_baseline へ自動設定しない
   *   - evaluationHeightM を建物高さで代用しない
   *   - zone を general へ落とさない
   * どれも「それらしい値」が入るため、間違っていても気づけない。
   */
  function resolveEffectiveWindInput(profile, scenario) {
    if (!isPlainObject(profile) || profile.profileType !== PROFILE_TYPE) {
      throw new Error('resolveEffectiveWindInput(): a runtime profile is required');
    }
    if (!isPlainObject(scenario)) {
      throw new Error('resolveEffectiveWindInput(): a scenario is required');
    }

    var windInput = {};
    PROFILE_WIND_REQUIRED.forEach(function (field) {
      var value = profile.windDefaults[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('profile windDefaults.' + field + ' is missing; no default is assumed');
      }
      windInput[field] = value;
    });
    ['recurrenceYears', 'buildingShortSideM'].forEach(function (field) {
      if (profile.windDefaults[field] !== undefined) windInput[field] = profile.windDefaults[field];
    });

    // pane / location 固有。Profileからは絶対に来ない。
    if (scenario.evaluationHeightM === undefined || scenario.evaluationHeightM === null) {
      throw new Error('scenario evaluationHeightM is missing; it is never inherited from the profile');
    }
    if (scenario.zone === undefined || scenario.zone === null || scenario.zone === '') {
      throw new Error('scenario zone is missing; it is never inherited from the profile');
    }
    windInput.evaluationHeightM = scenario.evaluationHeightM;
    windInput.zone = scenario.zone;

    return windInput;
  }

  /**
   * 「このcaseは何を使って計算したのか」を表示するためのtrace（§13）。
   *
   * 「Profileから継承」とだけ書いて隠さず、**最終的なeffective値**を返す。
   */
  function describeEffectiveInput(profile, scenario) {
    var windInput = resolveEffectiveWindInput(profile, scenario);
    var fromProfile = [];
    var fromScenario = [];

    Object.keys(windInput).forEach(function (field) {
      var entry = { field: field, value: windInput[field] };
      if (field === 'evaluationHeightM' || field === 'zone') fromScenario.push(entry);
      else fromProfile.push(entry);
    });
    ['widthMm', 'heightMm', 'glassType', 'extraFactor'].forEach(function (field) {
      fromScenario.push({ field: field, value: scenario[field] });
    });

    return {
      profileLabel: profile.label,
      profileStatus: profile.verificationStatus,
      scenarioId: scenario.scenarioId,
      scenarioLabel: scenario.label,
      fromProfile: fromProfile,
      fromScenario: fromScenario,
      effectiveWindInput: windInput
    };
  }

  /**
   * Profile + Scenario から既存の Project Input Package v2 を作る（§22 / §27）。
   *
   * 新しい pressure calculation は書かない。既存の
   * ProjectInput.fromWindCalculation() へ渡すだけである。
   * 生成されたpackageは計算に必要な値を**すべて展開して**持つので、
   * Profile file が無くても Workspace JSON だけで再計算できる。
   */
  function scenarioToProjectInput(profile, scenario) {
    return ProjectInput.fromWindCalculation({
      widthMm: scenario.widthMm,
      heightMm: scenario.heightMm,
      glassType: scenario.glassType,
      extraFactor: scenario.extraFactor,
      windInput: resolveEffectiveWindInput(profile, scenario)
    });
  }


  // ============================================================
  // Scenario Matrix（§15-§23）
  // ============================================================

  var SCENARIO_TSV_COLUMNS = [
    'scenario_id', 'label', 'width_mm', 'height_mm',
    'evaluation_height_m', 'zone', 'glass_type', 'extra_factor'
  ];
  var SCENARIO_TSV_REQUIRED = [
    'width_mm', 'height_mm', 'evaluation_height_m', 'zone', 'glass_type'
  ];

  // §17: Scenario行に風条件を書かせない。
  // 「共通条件Profile」という意味を曖昧にしないため、override列そのものを拒否する。
  // 個別に風条件を変えたい場合は Phase 2G の Workspace TSV を使う。
  var SCENARIO_TSV_FORBIDDEN = [
    'v0', 'roughness', 'roughness_category', 'building_height_m', 'eaves_height_m',
    'building_type', 'basis', 'recurrence_years', 'building_short_side_m',
    // trust / derived 側（Phase 2Gと同じ理由）
    'source_kind', 'verified', 'verification_status', 'evidence', 'source_reference',
    'design_pressure', 'positive_pressure', 'negative_pressure',
    'recommended_glass', 'allowable_pressure', 'status', 'margin',
    // floor → Z を持ち込ませない（§10 / Hard Gate）
    'floor', 'floor_key', 'storey', 'story', 'level'
  ];

  var SCENARIO_TSV_FIELD_MAP = {
    scenario_id: 'scenarioId',
    label: 'label',
    width_mm: 'widthMm',
    height_mm: 'heightMm',
    evaluation_height_m: 'evaluationHeightM',
    zone: 'zone',
    glass_type: 'glassType',
    extra_factor: 'extraFactor'
  };

  /**
   * Scenario Matrix TSV を解析する。
   *
   * 表としての構造（物理行番号 / header規約 / 行数上限）は
   * WorkspaceCore.parseTsvTable() が持つ。ここで再実装しない。
   * 物理行番号の規約がPhase 2Gとずれないのはそのためである。
   */
  function parseScenarioTsv(text) {
    var table = WorkspaceCore.parseTsvTable(text, {
      label: 'Scenario TSV',
      knownColumns: SCENARIO_TSV_COLUMNS,
      forbiddenColumns: SCENARIO_TSV_FORBIDDEN,
      requiredColumns: SCENARIO_TSV_REQUIRED,
      maxRows: MAX_SCENARIOS,
      forbiddenMessage: function (name) {
        if (['floor', 'floor_key', 'storey', 'story', 'level'].indexOf(name) !== -1) {
          return 'Scenario TSV must not carry ' + JSON.stringify(name) +
            ': evaluation height is never derived from a floor label';
        }
        return 'Scenario TSV must not carry the wind or trust column ' + JSON.stringify(name) +
          ': common wind conditions belong to the profile, and per-row wind overrides ' +
          'are not part of this contract';
      }
    });

    var rows = [];
    var errors = [];

    table.rows.forEach(function (dataRow) {
      var record = dataRow.record;
      var safeScenarioId = null;
      var safeLabel = null;
      var currentField = null;
      try {
        if (dataRow.tooManyCells) {
          throw new Error('row has more cells than the header declares');
        }
        var input = {};
        Object.keys(SCENARIO_TSV_FIELD_MAP).forEach(function (column) {
          if (!table.seen[column]) return;
          var raw = record[column];
          if (raw === '' || raw === undefined) return;
          input[SCENARIO_TSV_FIELD_MAP[column]] = raw;
        });

        if (input.scenarioId !== undefined) {
          currentField = 'scenario_id';
          if (typeof input.scenarioId !== 'string' ||
              input.scenarioId.length > MAX_SCENARIO_ID_LENGTH ||
              !SCENARIO_ID_PATTERN.test(input.scenarioId)) {
            throw new Error('scenarioId must start with a letter and use letters/digits/_/- (max 64)');
          }
          safeScenarioId = input.scenarioId;
        }
        if (input.label !== undefined) {
          currentField = 'label';
          safeLabel = WorkspaceCore.normalizeLabel(input.label);
        }
        currentField = null;
        rows.push({ lineNumber: dataRow.lineNumber, scenario: createScenario(input) });
      } catch (e) {
        // §26 / Phase 2G §37: 位置と理由だけ。生の行は残さない。
        errors.push({
          lineNumber: dataRow.lineNumber,
          caseId: safeScenarioId,
          label: safeLabel,
          field: currentField,
          reason: WorkspaceCore.sanitizeReason(e && e.message ? e.message : String(e))
        });
      }
    });

    return { rows: rows, errors: errors };
  }

  /**
   * 明示された値リストから scenario を直積生成する（§19）。
   *
   * すべて利用者が明示入力した値だけを使う。
   * 階のラベルから評価高さを作る経路は無い（§10 / Hard Gate）。
   *
   * 順序は deterministic: width → height → evaluationHeight → zone → glassType。
   */
  function generateScenarioMatrix(lists, options) {
    options = options || {};
    if (!isPlainObject(lists)) {
      throw new Error('generateScenarioMatrix(): value lists are required');
    }
    assertAllowedKeys(lists, ['widths', 'heights', 'evaluationHeights', 'zones', 'glassTypes', 'extraFactor'],
      'matrix lists');

    var axes = ['widths', 'heights', 'evaluationHeights', 'zones', 'glassTypes'];
    axes.forEach(function (axis) {
      if (!Array.isArray(lists[axis]) || lists[axis].length === 0) {
        throw new Error('matrix axis ' + axis + ' must be a non-empty list (no value is assumed)');
      }
    });

    var count = axes.reduce(function (n, axis) { return n * lists[axis].length; }, 1);

    // §20: 既存Workspace件数を含めて判定する。
    // 生成だけで上限内でも、既にcaseがあれば合計で超えうる。
    var existing = typeof options.existingCaseCount === 'number' ? options.existingCaseCount : 0;
    var cap = typeof options.maxTotal === 'number' ? options.maxTotal : MAX_SCENARIOS;
    if (existing + count > cap) {
      throw new Error(
        'matrix would produce ' + count + ' scenarios; with ' + existing +
          ' existing case(s) that exceeds the limit of ' + cap
      );
    }

    var scenarios = [];
    lists.widths.forEach(function (w) {
      lists.heights.forEach(function (h) {
        lists.evaluationHeights.forEach(function (z) {
          lists.zones.forEach(function (zone) {
            lists.glassTypes.forEach(function (glassType) {
              scenarios.push(createScenario({
                widthMm: w, heightMm: h, evaluationHeightM: z,
                zone: zone, glassType: glassType,
                extraFactor: lists.extraFactor
              }));
            });
          });
        });
      });
    });
    return scenarios;
  }

  /** 生成前に件数だけ知りたい場合（§20 preview count）。 */
  function countScenarioMatrix(lists) {
    var axes = ['widths', 'heights', 'evaluationHeights', 'zones', 'glassTypes'];
    if (!isPlainObject(lists)) return 0;
    return axes.reduce(function (n, axis) {
      return n * (Array.isArray(lists[axis]) ? lists[axis].length : 0);
    }, 1);
  }

  /**
   * Scenario の集合。Workspace とは別物である（§21）。
   * scenarioId と Workspace caseId を同一視しない。
   */
  function createScenarioMatrix() {
    var scenarios = [];
    var nextOrdinal = 1;

    function indexOf(scenarioId) {
      for (var i = 0; i < scenarios.length; i++) {
        if (scenarios[i].scenarioId === scenarioId) return i;
      }
      return -1;
    }

    function nextId() {
      for (var guard = 0; guard < MAX_SCENARIOS * 2 + 10; guard++) {
        var candidate = 'sc-' + String(nextOrdinal).padStart(3, '0');
        nextOrdinal += 1;
        if (indexOf(candidate) === -1) return candidate;
      }
      throw new Error('could not allocate a unique scenarioId');
    }

    function add(scenario) {
      if (scenarios.length >= MAX_SCENARIOS) {
        throw new Error('scenario matrix is full (max ' + MAX_SCENARIOS + ')');
      }
      var id = scenario.scenarioId;
      if (id === null || id === undefined) id = nextId();
      else if (indexOf(id) !== -1) throw new Error('duplicate scenarioId: ' + JSON.stringify(id));
      var stored = Object.freeze(Object.assign({}, scenario, { scenarioId: id }));
      scenarios.push(stored);
      return id;
    }

    return {
      add: add,
      addMany: function (list) { return list.map(add); },
      duplicate: function (scenarioId) {
        var index = indexOf(scenarioId);
        if (index === -1) throw new Error('unknown scenarioId: ' + JSON.stringify(scenarioId));
        var source = scenarios[index];
        var label = source.label === null ? null
          : WorkspaceCore.normalizeLabel((source.label + ' (copy)').slice(0, MAX_LABEL_LENGTH));
        return add(Object.assign({}, source, { scenarioId: null, label: label }));
      },
      remove: function (scenarioId) {
        var index = indexOf(scenarioId);
        if (index === -1) return false;
        scenarios.splice(index, 1);
        return true;
      },
      clear: function () { var n = scenarios.length; scenarios = []; return n; },
      list: function () { return scenarios.slice(); },
      get: function (scenarioId) { var i = indexOf(scenarioId); return i === -1 ? null : scenarios[i]; },
      size: function () { return scenarios.length; }
    };
  }

  /**
   * Scenario を Workspace case として確定する（§14 snapshot semantics）。
   *
   * ここで effective input を PIP v2 として**固定**する。
   * 以後 Profile を変更しても、既に Workspace にある case は変わらない
   * （過去の検討結果が知らないうちに書き換わらないようにするため）。
   * 再適用は呼び出し側の明示操作でしかできない。
   *
   * row isolation: 1件が失敗しても他を止めず、診断として残す。
   */
  function addScenariosToWorkspace(workspace, profile, scenarios) {
    if (!workspace || typeof workspace.addCase !== 'function') {
      throw new Error('addScenariosToWorkspace(): a workspace is required');
    }
    if (!Array.isArray(scenarios)) {
      throw new Error('addScenariosToWorkspace(): a scenario array is required');
    }
    var added = [];
    var errors = [];

    scenarios.forEach(function (scenario, index) {
      try {
        var pkg = scenarioToProjectInput(profile, scenario);
        added.push(workspace.addCase(pkg, { label: scenario.label }));
      } catch (e) {
        errors.push({
          index: index,
          caseId: scenario && scenario.scenarioId ? scenario.scenarioId : null,
          label: scenario && scenario.label ? scenario.label : null,
          field: null,
          reason: WorkspaceCore.sanitizeReason(e && e.message ? e.message : String(e))
        });
      }
    });
    return { added: added, errors: errors };
  }

  return {
    PROFILE_SCHEMA_VERSION: PROFILE_SCHEMA_VERSION,
    PROFILE_TYPE: PROFILE_TYPE,
    PROFILE_STATUS: PROFILE_STATUS,
    PROFILE_WIND_FIELDS: Object.freeze(PROFILE_WIND_FIELDS),
    PROFILE_WIND_REQUIRED: Object.freeze(PROFILE_WIND_REQUIRED),
    PROFILE_PER_SCENARIO_FIELDS: Object.freeze(PROFILE_PER_SCENARIO_FIELDS),
    PROFILE_TRUST_FIELDS: Object.freeze(PROFILE_TRUST_FIELDS),
    PROFILE_TOP_LEVEL_KEYS: Object.freeze(PROFILE_TOP_LEVEL_KEYS),
    SCENARIO_FIELDS: Object.freeze(SCENARIO_FIELDS),
    SCENARIO_REQUIRED: Object.freeze(SCENARIO_REQUIRED),
    MAX_PROFILE_BYTES: MAX_PROFILE_BYTES,
    MAX_SCENARIOS: MAX_SCENARIOS,
    SCENARIO_ID_PATTERN: SCENARIO_ID_PATTERN,
    createProfile: createProfile,
    serializeProfile: serializeProfile,
    deserializeProfile: deserializeProfile,
    createScenario: createScenario,
    resolveEffectiveWindInput: resolveEffectiveWindInput,
    describeEffectiveInput: describeEffectiveInput,
    scenarioToProjectInput: scenarioToProjectInput,
    SCENARIO_TSV_COLUMNS: Object.freeze(SCENARIO_TSV_COLUMNS),
    SCENARIO_TSV_REQUIRED: Object.freeze(SCENARIO_TSV_REQUIRED),
    SCENARIO_TSV_FORBIDDEN: Object.freeze(SCENARIO_TSV_FORBIDDEN),
    parseScenarioTsv: parseScenarioTsv,
    generateScenarioMatrix: generateScenarioMatrix,
    countScenarioMatrix: countScenarioMatrix,
    createScenarioMatrix: createScenarioMatrix,
    addScenariosToWorkspace: addScenariosToWorkspace
  };
});
