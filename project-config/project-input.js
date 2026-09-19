/**
 * project-config/project-input.js
 *
 * Versioned Project Input Package（Phase 2D, AC-02 / AC-03 / AC-06 / AC-07）。
 *
 * 任意案件の「入力条件」を、案件presetにも手入力にも取り込みデータにも
 * 共通のversioned schemaで表現し、安全に検証・正規化・直列化するモジュール。
 *
 * package shape（必要以上に大きくしない）:
 *   {
 *     schemaVersion: 1,
 *     sourceKind: 'registered_preset' | 'manual' | 'imported_unverified',
 *     sourceId: string | null,        // registered presetのprojectId（それ以外はnull）
 *     widthMm: number,                // > 0
 *     heightMm: number,               // > 0
 *     positivePressure: number,       // 有限数（符号は強制しない）
 *     negativePressure: number,       // 有限数（符号は強制しない）
 *     designPressure: number,         // 常に再計算する（下記）
 *     glassType: string,              // calc.jsのGLASS_TYPESに存在するキーのみ
 *     extraFactor: number,            // 0 < v <= 1.0
 *     provenance: {
 *       publicLabel: string,          // 公開してよい表示ラベル
 *       verificationStatus: 'verified' | 'partially_verified' | 'unverified',
 *       note: string                  // 公開してよい補足（内部識別子を含めない）
 *     }
 *   }
 *
 * designPressureの扱い（AC-02）:
 *   serialize済みのdesignPressureを盲信しない。常に
 *     designPressure = max(abs(positivePressure), abs(negativePressure))
 *   から再計算し、値が入力と矛盾していても再計算値を正とする。
 *
 * trust model（AC-05）:
 *   - `registered_preset` は repository内のbuilt-in configからのみ生成できる
 *     （fromPreset()）。verified / partially_verified を保持し得る。
 *   - `manual` はユーザー入力。常に unverified。
 *   - `imported_unverified` は外部から取り込んだpackage。payloadが
 *     sourceKind / verificationStatus / publicLabel で何を主張していても、
 *     deserialize()がそれらを破棄し、必ず imported_unverified / unverified /
 *     固定の中立ラベルへdowngradeする。したがってimported payloadから
 *     案件のverified provenanceを偽装できない。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式の
 * プレーンJSとして提供する（<script src> と require() の両対応）。
 * calc.js（GLASS_TYPESの参照元）に依存するが、案件固有値には依存しない。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectInput = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  // Phase 2Eで v2 へ。v2は windInput（告示風圧計算の入力条件）を任意で保持する。
  var SCHEMA_VERSION = 2;
  var SUPPORTED_SCHEMA_VERSIONS = [1, 2];

  var SOURCE_KINDS = [
    'registered_preset', 'manual', 'notification_calculation', 'imported_unverified'
  ];
  // verificationStatusの値域は案件非依存のEvidence contractが正（Phase 2F）。
  // ここで配列を再定義すると、一方だけ変更されたときに黙って乖離する。
  var VERIFICATION_STATUSES = resolveEvidenceContract().VERIFICATION_STATUSES;

  // package top-levelで許可されるキー（これ以外はreject: AC-07 unknown field）
  var ALLOWED_TOP_LEVEL_KEYS = [
    'schemaVersion', 'sourceKind', 'sourceId',
    'widthMm', 'heightMm',
    'positivePressure', 'negativePressure', 'designPressure',
    'glassType', 'extraFactor', 'provenance',
    'windInput'
  ];
  var ALLOWED_PROVENANCE_KEYS = ['publicLabel', 'verificationStatus', 'note'];

  /**
   * v2の windInput で許可されるキー（wind-pressure.js の入力契約と一致させる）。
   *
   * package内には**算定済みのtraceを保存しない**。保存するのは入力だけで、
   * traceは常に再計算する。理由は designPressure と同じで、
   * payloadが主張する中間値・結果を信用しないため（AC-18）。
   */
  var WIND_INPUT_KEYS = [
    'V0', 'roughnessCategory', 'buildingHeightM', 'eavesHeightM',
    'evaluationHeightM', 'buildingType', 'zone', 'buildingShortSideM',
    'basis', 'recurrenceYears'
  ];

  /** windInput を保持できる sourceKind。 */
  var WIND_INPUT_SOURCE_KINDS = ['notification_calculation', 'imported_unverified'];

  // 安全境界（AC-07）
  var MAX_PAYLOAD_BYTES = 16 * 1024;   // 16KB
  var MAX_NEST_DEPTH = 8;
  var MAX_STRING_LENGTH = 512;
  var MAX_DIMENSION_MM = 100000;       // 100m。実用外の巨大値を弾く
  var MAX_PRESSURE = 1000000;          // 1e6 N/m²
  var FORBIDDEN_KEYS = ['__proto__', 'prototype', 'constructor'];

  // 公開文字列に許可しないパターン（HTML/script payload・URL・パス等）
  var UNSAFE_STRING_PATTERNS = [
    { name: 'html-or-script', pattern: /[<>]/ },
    { name: 'url-scheme', pattern: /\b[a-z][a-z0-9+.-]*:\/\//i },
    { name: 'js-scheme', pattern: /javascript:/i },
    { name: 'windows-absolute-path', pattern: /[A-Za-z]:\\/ },
    { name: 'unix-absolute-path', pattern: /(^|\s)(~\/|\/Users\/|\/home\/|\/mnt\/)/ },
    { name: 'control-char', pattern: /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/ }
  ];

  var IMPORTED_PUBLIC_LABEL = '取り込みデータ (Imported / Unverified)';
  var NOTIFICATION_PUBLIC_LABEL = '告示風圧計算 (Notification / Calculated)';
  var NOTIFICATION_NOTE =
    '告示1458号系算定・板硝子協会推奨に基づく算定値。式は一次資料で確認しているが、' +
    '入力した風条件（V0・粗度区分・高さ・評価高さ等）は本ツールでは検証していない。';
  var IMPORTED_NOTE = '外部から取り込んだ入力条件。本ツールは内容を検証しておらず、案件原典との照合も行っていない。';

  // ------------------------------------------------------------
  // 依存解決（calc.jsのGLASS_TYPES）
  // ------------------------------------------------------------
  function resolveGlassCalc() {
    if (global && global.GlassCalc) {
      return global.GlassCalc;
    }
    if (typeof require === 'function') {
      try {
        return require('../calc.js');
      } catch (e) {
        /* fallthrough */
      }
    }
    throw new Error('ProjectInput: GlassCalc (calc.js) is required but not available');
  }

  function knownGlassTypes() {
    return Object.keys(resolveGlassCalc().GLASS_TYPES);
  }

  // 依存解決（project-config/evidence.js）。verificationStatusの値域の正。
  function resolveEvidenceContract() {
    if (global && global.ProjectEvidence) {
      return global.ProjectEvidence;
    }
    if (typeof require === 'function') {
      try {
        return require('./evidence.js');
      } catch (e) {
        /* fallthrough */
      }
    }
    throw new Error('ProjectInput: project-config/evidence.js (ProjectEvidence) is required but not available');
  }

  // 依存解決（wind-pressure.js）。windInputを持つpackageでのみ必要になる。
  function resolveWindPressure() {
    if (global && global.WindPressure) {
      return global.WindPressure;
    }
    if (typeof require === 'function') {
      try {
        return require('../wind-pressure.js');
      } catch (e) {
        /* fallthrough */
      }
    }
    throw new Error('ProjectInput: WindPressure (wind-pressure.js) is required but not available');
  }

  // 依存解決（project-config/registry.jsのpreset registry）
  // registryはrepository内built-in presetのみを保持する信頼境界であり、
  // `registered_preset` を名乗れる対象をregistry登録済みのものに限定するために使う。
  function resolveRegistry() {
    if (global && global.PresetRegistry) {
      return global.PresetRegistry;
    }
    if (typeof require === 'function') {
      try {
        return require('./registry.js');
      } catch (e) {
        /* fallthrough */
      }
    }
    throw new Error('ProjectInput: PresetRegistry (project-config/registry.js) is required but not available');
  }

  // ------------------------------------------------------------
  // 原始的なvalidator
  // ------------------------------------------------------------
  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function requireFiniteNumber(v, label) {
    if (!isFiniteNumber(v)) {
      throw new Error(label + ' must be a finite number, got: ' + JSON.stringify(v));
    }
    return v;
  }

  function requirePositiveInRange(v, label, max) {
    requireFiniteNumber(v, label);
    if (v <= 0) {
      throw new Error(label + ' must be > 0, got: ' + JSON.stringify(v));
    }
    if (v > max) {
      throw new Error(label + ' exceeds the allowed maximum (' + max + '), got: ' + JSON.stringify(v));
    }
    return v;
  }

  function assertPublicSafeString(v, label) {
    if (typeof v !== 'string') {
      throw new Error(label + ' must be a string, got: ' + JSON.stringify(v));
    }
    if (v.length > MAX_STRING_LENGTH) {
      throw new Error(label + ' exceeds the maximum length (' + MAX_STRING_LENGTH + ')');
    }
    for (var i = 0; i < UNSAFE_STRING_PATTERNS.length; i++) {
      if (UNSAFE_STRING_PATTERNS[i].pattern.test(v)) {
        throw new Error(
          label + ' contains disallowed content (matched: ' + UNSAFE_STRING_PATTERNS[i].name + ')'
        );
      }
    }
    return v;
  }

  function assertAllowedKeys(obj, allowed, label) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      if (allowed.indexOf(keys[i]) === -1) {
        throw new Error(label + ' contains an unknown field: ' + JSON.stringify(keys[i]));
      }
    }
    return true;
  }

  // ------------------------------------------------------------
  // designPressureは常に再計算する（AC-02）
  // ------------------------------------------------------------
  function computeDesignPressure(positivePressure, negativePressure) {
    return Math.max(Math.abs(positivePressure), Math.abs(negativePressure));
  }

  // ------------------------------------------------------------
  // validate + normalize
  //
  // deterministic normalization: キー順を固定し、designPressureを再計算し、
  // 同じ入力からは常に同じpackageが得られるようにする。
  // ------------------------------------------------------------
  function validateAndNormalize(raw, options) {
    options = options || {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('project input package must be an object');
    }
    assertAllowedKeys(raw, ALLOWED_TOP_LEVEL_KEYS, 'project input package');

    // schemaVersion（未知バージョンはfail closed: AC-09）
    if (SUPPORTED_SCHEMA_VERSIONS.indexOf(raw.schemaVersion) === -1) {
      throw new Error(
        'unsupported schemaVersion: ' + JSON.stringify(raw.schemaVersion) +
        ' (supported: ' + SUPPORTED_SCHEMA_VERSIONS.join(', ') + ')'
      );
    }

    // v1 → v2 migration（決定的。v1は windInput を持たないので null になる）
    var incomingVersion = raw.schemaVersion;
    if (incomingVersion === 1 && raw.windInput !== undefined && raw.windInput !== null) {
      throw new Error('schemaVersion 1 package must not carry windInput');
    }

    // sourceKind
    if (SOURCE_KINDS.indexOf(raw.sourceKind) === -1) {
      throw new Error(
        'unsupported sourceKind: ' + JSON.stringify(raw.sourceKind) +
        ' (supported: ' + SOURCE_KINDS.join(', ') + ')'
      );
    }
    var sourceKind = options.forceSourceKind || raw.sourceKind;

    // sourceId（registered_presetのときのみ非null）
    var sourceId = null;
    if (sourceKind === 'registered_preset') {
      if (!raw.sourceId || typeof raw.sourceId !== 'string') {
        throw new Error('registered_preset requires a non-empty string sourceId');
      }
      assertPublicSafeString(raw.sourceId, 'sourceId');
      // registryに登録されていないprojectIdは `registered_preset` を名乗れない。
      if (!resolveRegistry().hasPreset(raw.sourceId)) {
        throw new Error(
          'registered_preset requires a sourceId registered in the built-in preset registry: ' +
            JSON.stringify(raw.sourceId)
        );
      }
      sourceId = raw.sourceId;
    }

    // 寸法
    var widthMm = requirePositiveInRange(raw.widthMm, 'widthMm', MAX_DIMENSION_MM);
    var heightMm = requirePositiveInRange(raw.heightMm, 'heightMm', MAX_DIMENSION_MM);

    // windInput（v2。告示風圧計算の入力条件）
    //
    // packageには**入力だけ**を保存し、算定済みのtrace・中間値は保存しない。
    // windInputがある場合、正圧・負圧は payloadの主張値ではなく
    // wind-pressure.js の算定結果で**必ず上書きする**（designPressureと同じ思想）。
    // したがって改竄されたpressure値は取り込まれない（AC-18）。
    var windInput = null;
    var windTrace = null;
    if (raw.windInput !== undefined && raw.windInput !== null) {
      if (WIND_INPUT_SOURCE_KINDS.indexOf(sourceKind) === -1) {
        throw new Error(
          'windInput is only allowed for sourceKind ' + JSON.stringify(WIND_INPUT_SOURCE_KINDS) +
            ' (got ' + JSON.stringify(sourceKind) + ')'
        );
      }
      if (typeof raw.windInput !== 'object' || Array.isArray(raw.windInput)) {
        throw new Error('windInput must be an object');
      }
      assertAllowedKeys(raw.windInput, WIND_INPUT_KEYS, 'windInput');
      // wind-pressure.js 側が値域・型・列挙値・NaN/Infinityをfail closedで検証する。
      windTrace = resolveWindPressure().calculateWindPressure(raw.windInput);
      windInput = {};
      for (var wi = 0; wi < WIND_INPUT_KEYS.length; wi++) {
        var wk = WIND_INPUT_KEYS[wi];
        if (raw.windInput[wk] !== undefined) windInput[wk] = raw.windInput[wk];
      }
    } else if (sourceKind === 'notification_calculation') {
      throw new Error('sourceKind "notification_calculation" requires windInput');
    }

    // 圧力（符号は強制しないが、有限かつ絶対値が上限内であること）
    // windInputがある場合は算定値を正とし、payload側の主張値を読まない。
    var positivePressure = windTrace
      ? windTrace.positive.pressure
      : requireFiniteNumber(raw.positivePressure, 'positivePressure');
    var negativePressure = windTrace
      ? windTrace.negative.pressure
      : requireFiniteNumber(raw.negativePressure, 'negativePressure');
    if (Math.abs(positivePressure) > MAX_PRESSURE || Math.abs(negativePressure) > MAX_PRESSURE) {
      throw new Error('pressure magnitude exceeds the allowed maximum (' + MAX_PRESSURE + ')');
    }

    // designPressureは常に再計算する（payloadの値は信用しない）
    var designPressure = computeDesignPressure(positivePressure, negativePressure);
    if (!(designPressure > 0)) {
      throw new Error(
        'designPressure must be > 0 (positivePressure and negativePressure cannot both be zero)'
      );
    }

    // glassType
    var types = knownGlassTypes();
    if (typeof raw.glassType !== 'string' || types.indexOf(raw.glassType) === -1) {
      throw new Error(
        'unsupported glassType: ' + JSON.stringify(raw.glassType) +
        ' (supported: ' + types.join(', ') + ')'
      );
    }

    // extraFactor（告示外の追加低減係数: 0 < v <= 1.0）
    var extraFactor = requireFiniteNumber(raw.extraFactor, 'extraFactor');
    if (extraFactor <= 0 || extraFactor > 1.0) {
      throw new Error('extraFactor must satisfy 0 < value <= 1.0, got: ' + JSON.stringify(extraFactor));
    }

    // provenance
    var rawProv = raw.provenance;
    if (!rawProv || typeof rawProv !== 'object' || Array.isArray(rawProv)) {
      throw new Error('provenance must be an object');
    }
    assertAllowedKeys(rawProv, ALLOWED_PROVENANCE_KEYS, 'provenance');

    var publicLabel, verificationStatus, note;
    if (options.forceUntrustedProvenance) {
      // 取り込みデータ: payloadのprovenance主張を一切採用しない（AC-05）
      publicLabel = IMPORTED_PUBLIC_LABEL;
      verificationStatus = 'unverified';
      note = IMPORTED_NOTE;
      // payload側の値も形式検証だけは行い、明らかに不正な型は弾く
      if (rawProv.publicLabel !== undefined) assertPublicSafeString(rawProv.publicLabel, 'provenance.publicLabel');
      if (rawProv.note !== undefined) assertPublicSafeString(rawProv.note, 'provenance.note');
      if (rawProv.verificationStatus !== undefined &&
          VERIFICATION_STATUSES.indexOf(rawProv.verificationStatus) === -1) {
        throw new Error('unsupported provenance.verificationStatus: ' + JSON.stringify(rawProv.verificationStatus));
      }
    } else {
      publicLabel = assertPublicSafeString(rawProv.publicLabel, 'provenance.publicLabel');
      if (VERIFICATION_STATUSES.indexOf(rawProv.verificationStatus) === -1) {
        throw new Error(
          'unsupported provenance.verificationStatus: ' + JSON.stringify(rawProv.verificationStatus)
        );
      }
      verificationStatus = rawProv.verificationStatus;
      note = assertPublicSafeString(rawProv.note === undefined ? '' : rawProv.note, 'provenance.note');
    }

    // 手入力・取り込みデータは verified を名乗れない（AC-03 / AC-05）
    if (sourceKind !== 'registered_preset' && verificationStatus !== 'unverified') {
      throw new Error(
        'sourceKind "' + sourceKind + '" must have provenance.verificationStatus "unverified"'
      );
    }

    // deterministic key order
    return {
      schemaVersion: SCHEMA_VERSION,
      sourceKind: sourceKind,
      sourceId: sourceKind === 'registered_preset' ? sourceId : null,
      widthMm: widthMm,
      heightMm: heightMm,
      positivePressure: positivePressure,
      negativePressure: negativePressure,
      designPressure: designPressure,
      glassType: raw.glassType,
      extraFactor: extraFactor,
      provenance: {
        publicLabel: publicLabel,
        verificationStatus: verificationStatus,
        note: note
      },
      windInput: windInput
    };
  }

  // ------------------------------------------------------------
  // factory
  // ------------------------------------------------------------
  function createProjectInput(raw) {
    return validateAndNormalize(raw, {});
  }

  /**
   * registered presetから入力packageを組み立てる。
   * presetConfigはregistry経由で取得したrepository内built-in configであること。
   */
  function fromPreset(presetConfig, input) {
    if (!presetConfig || typeof presetConfig !== 'object' || presetConfig.hasFixedPreset !== true) {
      throw new Error('fromPreset(): a built-in registered preset config is required');
    }
    // hasFixedPresetマーカーの自称だけでは足りない。registryが保持している
    // built-in preset object *そのもの* であることを同一性で確認する
    // （`registered_preset` を名乗る偽装objectを構造的に排除する）。
    var registry = resolveRegistry();
    if (
      typeof presetConfig.projectId !== 'string' ||
      !registry.hasPreset(presetConfig.projectId) ||
      registry.getPreset(presetConfig.projectId) !== presetConfig
    ) {
      throw new Error('fromPreset(): a built-in registered preset config is required');
    }
    if (!input || typeof input !== 'object') {
      throw new Error('fromPreset(): input is required');
    }
    var positivePressure = presetConfig.getPositivePressure(input.floorKey);
    var negativePressure = presetConfig.getNegativePressure(input.zoneKey);

    // presetの検証状況をそのままprovenanceへ反映する（昇格させない）。
    var windStatus = presetConfig.wind && presetConfig.wind.status;
    var verificationStatus =
      VERIFICATION_STATUSES.indexOf(windStatus) === -1 ? 'unverified' : windStatus;

    return validateAndNormalize({
      schemaVersion: SCHEMA_VERSION,
      sourceKind: 'registered_preset',
      sourceId: presetConfig.projectId,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      positivePressure: positivePressure,
      negativePressure: negativePressure,
      designPressure: 0, // 再計算されるためplaceholder
      glassType: input.glassType,
      extraFactor: input.extraFactor === undefined ? 1.0 : input.extraFactor,
      provenance: {
        publicLabel: presetConfig.getPublicLabel(),
        verificationStatus: verificationStatus,
        note: '案件プリセット由来の設計風圧。告示から自動算定した値ではない。'
      }
    }, {});
  }

  /** 手入力から入力packageを組み立てる（常にunverified）。 */
  function fromManual(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('fromManual(): input is required');
    }
    return validateAndNormalize({
      schemaVersion: SCHEMA_VERSION,
      sourceKind: 'manual',
      sourceId: null,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      positivePressure: input.positivePressure,
      negativePressure: input.negativePressure,
      designPressure: 0,
      glassType: input.glassType,
      extraFactor: input.extraFactor === undefined ? 1.0 : input.extraFactor,
      provenance: {
        publicLabel: '手入力 (Manual / Generic)',
        verificationStatus: 'unverified',
        note: '現在画面に表示されている値をユーザー入力値として扱う。案件原典との照合は本ツールでは未実施。'
      }
    }, {});
  }

  // ------------------------------------------------------------
  // serialize / deserialize
  // ------------------------------------------------------------

  /** deterministic serialization（キー順固定・2space indent）。 */
  /**
   * 告示風圧計算（notification_calculation）から入力packageを組み立てる。
   *
   * windInputだけを保持し、正圧・負圧・designPressureは
   * wind-pressure.js が算定した値で必ず上書きされる（validateAndNormalize内）。
   *
   * 式は一次資料で検証済みだが、ユーザーが入力した風条件はunverifiedのままである
   * （AC-04）。したがってprovenanceは 'unverified' を名乗る。
   */
  function fromWindCalculation(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('fromWindCalculation(): input is required');
    }
    if (!input.windInput || typeof input.windInput !== 'object') {
      throw new Error('fromWindCalculation(): windInput is required');
    }
    return validateAndNormalize({
      schemaVersion: SCHEMA_VERSION,
      sourceKind: 'notification_calculation',
      sourceId: null,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      // windInputから再計算されるためplaceholder
      positivePressure: 0,
      negativePressure: 0,
      designPressure: 0,
      glassType: input.glassType,
      extraFactor: input.extraFactor === undefined ? 1.0 : input.extraFactor,
      provenance: {
        publicLabel: NOTIFICATION_PUBLIC_LABEL,
        verificationStatus: 'unverified',
        note: NOTIFICATION_NOTE
      },
      windInput: input.windInput
    }, {});
  }

  /**
   * packageからWind Pressure Traceを再計算して返す。
   *
   * traceはpackageに保存していない（保存すると payloadが主張する中間値を
   * 信用する経路ができてしまうため）。常にwindInputから導出する。
   *
   * windInputを持たないpackageでは null を返す。
   */
  function windTraceFor(pkg) {
    if (!pkg || typeof pkg !== 'object') {
      throw new Error('windTraceFor(): package is required');
    }
    if (!pkg.windInput) return null;
    return resolveWindPressure().calculateWindPressure(pkg.windInput);
  }

  function serialize(pkg) {
    var normalized = validateAndNormalize(pkg, {});
    return JSON.stringify(
      normalized,
      ALLOWED_TOP_LEVEL_KEYS.concat(ALLOWED_PROVENANCE_KEYS).concat(WIND_INPUT_KEYS),
      2
    );
  }

  /** 危険なキーが含まれていないか、深さが許容範囲かを再帰的に確認する。 */
  function assertSafeStructure(value, depth) {
    if (depth > MAX_NEST_DEPTH) {
      throw new Error('payload nesting is too deep (max ' + MAX_NEST_DEPTH + ')');
    }
    if (value === null || typeof value !== 'object') {
      return true;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        assertSafeStructure(value[i], depth + 1);
      }
      return true;
    }
    var keys = Object.getOwnPropertyNames(value);
    for (var k = 0; k < keys.length; k++) {
      if (FORBIDDEN_KEYS.indexOf(keys[k]) !== -1) {
        throw new Error('payload contains a forbidden key: ' + keys[k]);
      }
      assertSafeStructure(value[keys[k]], depth + 1);
    }
    return true;
  }

  /**
   * 外部JSON文字列から入力packageを取り込む。
   *
   * 安全境界（AC-07）:
   *   - payload size上限
   *   - JSON.parseのみを使用（eval / Function / dynamic script injectionは使わない）
   *   - __proto__ / prototype / constructor キーのreject
   *   - nest depth上限
   *   - unknown top-level fieldのreject
   *   - 文字列長・HTML/script・URL・path patternのreject
   *
   * trust downgrade（AC-05）:
   *   payloadのsourceKind / provenanceの主張に関わらず、
   *   常に imported_unverified / unverified へ落とす。
   */
  function deserialize(jsonText) {
    if (typeof jsonText !== 'string') {
      throw new Error('deserialize(): input must be a JSON string');
    }
    var byteLength = (typeof TextEncoder === 'function')
      ? new TextEncoder().encode(jsonText).length
      : Buffer.byteLength(jsonText, 'utf8');
    if (byteLength > MAX_PAYLOAD_BYTES) {
      throw new Error('payload is too large (max ' + MAX_PAYLOAD_BYTES + ' bytes)');
    }
    // 生テキストの段階でも危険キーを拒否する（parse前の早期遮断）
    for (var i = 0; i < FORBIDDEN_KEYS.length; i++) {
      if (jsonText.indexOf('"' + FORBIDDEN_KEYS[i] + '"') !== -1) {
        throw new Error('payload contains a forbidden key: ' + FORBIDDEN_KEYS[i]);
      }
    }

    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('payload is not valid JSON');
    }

    assertSafeStructure(parsed, 0);

    return validateAndNormalize(parsed, {
      forceSourceKind: 'imported_unverified',
      forceUntrustedProvenance: true
    });
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS: SUPPORTED_SCHEMA_VERSIONS,
    SOURCE_KINDS: SOURCE_KINDS,
    VERIFICATION_STATUSES: VERIFICATION_STATUSES,
    ALLOWED_TOP_LEVEL_KEYS: ALLOWED_TOP_LEVEL_KEYS,
    WIND_INPUT_KEYS: WIND_INPUT_KEYS,
    WIND_INPUT_SOURCE_KINDS: WIND_INPUT_SOURCE_KINDS,
    MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
    MAX_NEST_DEPTH: MAX_NEST_DEPTH,
    MAX_STRING_LENGTH: MAX_STRING_LENGTH,
    IMPORTED_PUBLIC_LABEL: IMPORTED_PUBLIC_LABEL,
    NOTIFICATION_PUBLIC_LABEL: NOTIFICATION_PUBLIC_LABEL,
    computeDesignPressure: computeDesignPressure,
    createProjectInput: createProjectInput,
    validateProjectInput: function (pkg) { return validateAndNormalize(pkg, {}); },
    fromPreset: fromPreset,
    fromManual: fromManual,
    fromWindCalculation: fromWindCalculation,
    windTraceFor: windTraceFor,
    serialize: serialize,
    deserialize: deserialize
  };
});
