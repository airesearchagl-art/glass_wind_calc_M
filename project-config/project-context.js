/**
 * project-config/project-context.js
 *
 * Generic ProjectContext contract + adapters（Phase 2L-B2 / S2-A）。案件非依存。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * generic core が、案件データを**どの源から来たかによらず同じ境界から**受け取るための
 * 契約である。源ごとに adapter を 1 つ置く:
 *
 *   fromLegacyPreset(projectId)  … repository の built-in 案件 preset（registry 経由）
 *   fromProjectPack(validated)   … validateProjectPack() 済みの Project Pack
 *
 * どちらも新しい deep-frozen な context を返す。この module が作った context だけが
 * isProjectContext() / assertProjectContext() を通る（形を真似た object は通らない）。
 *
 * ── これは何でないか ─────────────────────────────────────
 *
 * この phase では runtime に接続しない（runtime consumer 0）。index.html・registry の
 * runtime selection・Evidence Closure・probe・browser UI はこの module を読まない。
 * 案件 preset の削除・sample の移行もしない。
 *
 * 計算をしない。ガラス強度式・風圧式・設計風圧の再計算はここに無い。context は
 * 入力データを保持し、後段の ProjectInput / WindPressure / GlassCalc へ渡すだけである。
 *
 * ── variant を 1 つの形へ潰さない ─────────────────────────
 *
 * legacy preset と Project Pack は持っているものが違う。それを共通の形へ無理に揃えず、
 * capability として明示する。持っていない capability は**作らない**:
 *
 *   legacy_builtin           : projectPressureMap / sampleDefaultDimensions / builtInEvidence
 *   project_pack_unreviewed  : (pressure 源 1 つ) / declaredPanes / declaredGlazingCases / evidenceClaims
 *
 * legacy preset に pane registry や glazing case は無い。架空の P001 / G001 を作らない。
 * legacy の初期寸法は sample default であって pane ではない。
 * legacy の V0 / 粗度区分は Evidence 表示用の built-in 値であり、告示算定の入力
 * （notificationCalculation）として扱わない（preset の風圧がその V0 から算定された
 * ことは確認されていない）。
 *
 * pressure の源は pressureModel.mode と 1 対 1 の capability である:
 *   project_pressure_map → projectPressureMap / notification1458 → notificationCalculation /
 *   case_direct → caseDirectPressure
 * 対応しない組み合わせ・持っていない capability の要求は fail closed（曖昧な fallback なし）。
 *
 * ── trust ────────────────────────────────────────────────
 *
 * trust は sourceKind から**だけ**決まる。呼び出し側・pack からは渡せない:
 *   legacy_builtin → built_in_current / project_pack_unreviewed → pack_unreviewed
 *
 * Evidence は 2 つの別の型として持つ:
 *   evidenceKind 'built_in_canonical'    … registry の built-in preset が持つ canonical
 *                                           Evidence の写し（legacy context の builtInEvidence だけ）
 *   evidenceKind 'pack_unreviewed_claim' … pack の sourceClaim（claimed* field、canonical ではない）
 *
 * pack 由来の context には、ProjectEvidence.canPromoteToVerified() を通る object が
 * 1 つも無い。adapter は sourceClaim を canonical Evidence へ変換しない。これは規約ではなく
 * 形の検証（assertProjectContextShape）で強制され、pack context のどこかに昇格可能な
 * object があれば context は作られない。legacy context で昇格可能な object が許されるのは
 * builtInEvidence の中だけで、それは registry の built-in preset が既に持っているものの
 * 写しである（新しい trust 経路を作らない）。review 済み pack の attestation は S5。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして
 * 提供する（<script src> と require() の両対応）。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectContext = mod;
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
    throw new Error('project-context.js: ' + label + ' is required but not available');
  }

  var Evidence = resolveDependency('ProjectEvidence', './evidence.js', 'project-config/evidence.js');
  var Registry = resolveDependency('PresetRegistry', './registry.js', 'project-config/registry.js');
  var Pack = resolveDependency('ProjectPack', './project-pack.js', 'project-config/project-pack.js');
  var Wind = resolveDependency('WindPressure', '../wind-pressure.js', 'wind-pressure.js');

  // built-in の trust は「registry にあること」ではなく、registry が bootstrap で捕まえた
  // built-in instance であることから来る（RF-16-01）。その境界を読み込み時に 1 度だけ掴む。
  var getBuiltInPreset = Registry.getBuiltInPreset;
  if (typeof getBuiltInPreset !== 'function') {
    throw new Error('project-context.js: PresetRegistry.getBuiltInPreset() is required (built-in provenance boundary)');
  }

  // ============================================================
  // Contract
  // ============================================================

  var CONTEXT_TYPE = 'glass_wind_project_context';
  var SCHEMA_VERSION = 1;

  var SOURCE_LEGACY = 'legacy_builtin';
  var SOURCE_PACK = 'project_pack_unreviewed';
  var SOURCE_KINDS = [SOURCE_LEGACY, SOURCE_PACK];

  /** trust は sourceKind から決まる。ほかの経路は無い。 */
  var TRUST_BY_SOURCE_KIND = {};
  TRUST_BY_SOURCE_KIND[SOURCE_LEGACY] = 'built_in_current';
  TRUST_BY_SOURCE_KIND[SOURCE_PACK] = 'pack_unreviewed';

  var CAPABILITIES = [
    'projectPressureMap', 'notificationCalculation', 'caseDirectPressure',
    'declaredPanes', 'declaredGlazingCases', 'evidenceClaims',
    'sampleDefaultDimensions', 'builtInEvidence'
  ];

  /** sourceKind ごとに持ちうる capability（これ以外は fail closed）。 */
  var ALLOWED_CAPABILITIES = {};
  ALLOWED_CAPABILITIES[SOURCE_LEGACY] = ['projectPressureMap', 'sampleDefaultDimensions', 'builtInEvidence'];
  ALLOWED_CAPABILITIES[SOURCE_PACK] = ['projectPressureMap', 'notificationCalculation', 'caseDirectPressure',
    'declaredPanes', 'declaredGlazingCases', 'evidenceClaims'];

  /** sourceKind ごとに必ず持つ capability（pressure 源は別に mode から決まる）。 */
  var REQUIRED_CAPABILITIES = {};
  REQUIRED_CAPABILITIES[SOURCE_LEGACY] = ['sampleDefaultDimensions', 'builtInEvidence'];
  REQUIRED_CAPABILITIES[SOURCE_PACK] = ['declaredPanes', 'declaredGlazingCases', 'evidenceClaims'];

  /** pressure の源は mode と 1 対 1。 */
  var PRESSURE_CAPABILITY_BY_MODE = {
    project_pressure_map: 'projectPressureMap',
    notification1458: 'notificationCalculation',
    case_direct: 'caseDirectPressure'
  };
  var PRESSURE_CAPABILITIES = ['projectPressureMap', 'notificationCalculation', 'caseDirectPressure'];

  /** legacy preset が表せる pressure mode は案件 map だけである。 */
  var LEGACY_PRESSURE_MODE = 'project_pressure_map';

  var EVIDENCE_KIND_BUILT_IN = 'built_in_canonical';
  var EVIDENCE_KIND_PACK_CLAIM = 'pack_unreviewed_claim';
  var EVIDENCE_KINDS = [EVIDENCE_KIND_BUILT_IN, EVIDENCE_KIND_PACK_CLAIM];

  /**
   * legacy context の builtInEvidence に写す field。inventory で runtime が実際に読んでいる
   * ものだけ（識別情報・V0・粗度区分・初期寸法 W/H）。値を持つのは context の他の場所に
   * 値が無い V0 / 粗度区分だけで、識別情報と寸法の値は publicLabel / sampleDefaultDimensions
   * にある（同じ値を 2 か所に置かない）。
   */
  var BUILT_IN_FIELDS = [
    { fieldKey: 'identity', carriesValue: false },
    { fieldKey: 'wind.V0', carriesValue: true },
    { fieldKey: 'wind.roughnessCategory', carriesValue: true },
    { fieldKey: 'dimensions.defaultW', carriesValue: false },
    { fieldKey: 'dimensions.defaultH', carriesValue: false }
  ];
  var LEGACY_DIMENSIONS_MODE = 'sample_default';
  var CANONICAL_EVIDENCE_KEYS = ['level', 'checkedAt', 'publicDescription', 'privateReferenceAvailable'];

  var PRESSURE_UNIT = Pack.UNITS.pressure;
  var LENGTH_UNIT = Pack.UNITS.length;
  var HEIGHT_UNIT = Pack.UNITS.height;
  var MAX_DEPTH = 12;

  /** この module が作った context だけを覚える（形の真似では通らない）。 */
  var issued = new WeakSet();

  // ============================================================
  // helpers
  // ============================================================

  function fail(where, message) {
    throw new Error('ProjectContext: ' + where + ' ' + message);
  }

  function show(v) {
    return JSON.stringify(v);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * 任意の値が「accessor を持たない素のデータ」であることを、property descriptor
   * だけを見て確かめる（getter を呼ばない）。形の検証はこれを通った後でだけ読む。
   */
  function assertPlainData(value, where, depth, path) {
    if (depth > MAX_DEPTH) fail(where, 'is nested deeper than ' + MAX_DEPTH + ' levels');
    if (value === null) return;
    var type = typeof value;
    if (type === 'string' || type === 'boolean') return;
    if (type === 'number') {
      if (!isFinite(value)) fail(where, 'must be a finite number');
      return;
    }
    if (type !== 'object') fail(where, 'has an unsupported value type ' + show(type));
    if (path.indexOf(value) !== -1) fail(where, 'contains a circular reference');
    if (Object.getOwnPropertySymbols(value).length > 0) fail(where, 'has symbol-keyed properties');
    path.push(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) fail(where, 'array has a custom prototype');
      var length = Object.getOwnPropertyDescriptor(value, 'length').value;
      Object.getOwnPropertyNames(value).forEach(function (name) {
        if (name === 'length') return;
        var idx = Number(name);
        if (String(idx) !== name || idx < 0 || idx >= length) fail(where, 'array carries a non-index property ' + show(name));
      });
      for (var i = 0; i < length; i++) {
        var d = Object.getOwnPropertyDescriptor(value, String(i));
        if (!d) fail(where + '[' + i + ']', 'is a hole in a sparse array');
        if (!hasOwn(d, 'value')) fail(where + '[' + i + ']', 'is an accessor, not data');
        assertPlainData(d.value, where + '[' + i + ']', depth + 1, path);
      }
    } else {
      Evidence.assertOrdinaryObject(value, 'ProjectContext: ' + where);
      Object.getOwnPropertyNames(value).forEach(function (name) {
        var desc = Object.getOwnPropertyDescriptor(value, name);
        if (!hasOwn(desc, 'value')) fail(where + '.' + name, 'is an accessor, not data');
        if (!desc.enumerable) fail(where + '.' + name, 'is non-enumerable');
        assertPlainData(desc.value, where + '.' + name, depth + 1, path);
      });
    }
    path.pop();
  }

  /** assertPlainData() を通った値の新しい写し（呼び出し側の object を共有しない）。 */
  function copyData(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(copyData);
    var out = {};
    Object.keys(value).forEach(function (k) { out[k] = copyData(value[k]); });
    return out;
  }

  function requireObject(value, where) {
    if (!isPlainObject(value)) fail(where, 'must be an object');
    return value;
  }

  function requireArray(value, where, min) {
    if (!Array.isArray(value)) fail(where, 'must be an array');
    if (value.length < min) fail(where, 'must contain at least ' + min + ' item(s)');
    return value;
  }

  function exactKeys(obj, required, optional, where) {
    var allowed = required.concat(optional || []);
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) === -1) fail(where, 'has an unexpected field ' + show(k));
    });
    required.forEach(function (k) {
      if (!hasOwn(obj, k)) fail(where, 'is missing required field ' + show(k));
    });
  }

  function requireOneOf(value, allowed, where) {
    if (allowed.indexOf(value) === -1) {
      fail(where, 'must be one of ' + allowed.join(', ') + ' (got ' + show(value) + ')');
    }
    return value;
  }

  function requireNonEmptyString(value, where) {
    if (typeof value !== 'string' || value.trim() === '') fail(where, 'must be a non-empty string');
    return value;
  }

  function requireId(value, pattern, where) {
    if (typeof value !== 'string' || !pattern.test(value)) {
      fail(where, 'must match ' + pattern + ' (got ' + show(value) + ')');
    }
    return value;
  }

  function requireQuantity(value, unit, where) {
    requireObject(value, where);
    exactKeys(value, ['value', 'unit'], [], where);
    if (value.unit !== unit) fail(where + '.unit', 'must be exactly ' + show(unit));
    if (typeof value.value !== 'number' || !isFinite(value.value) || value.value <= 0) {
      fail(where + '.value', 'must be a finite number greater than 0');
    }
  }

  function rejectDuplicate(seen, key, where, what) {
    if (hasOwn(seen, key)) fail(where, 'repeats ' + what + ' ' + show(key));
    seen[key] = true;
  }

  function walk(node, visit, at) {
    visit(node, at);
    if (node !== null && typeof node === 'object') {
      Object.keys(node).forEach(function (k) { walk(node[k], visit, at + '.' + k); });
    }
  }

  // ============================================================
  // capability shapes
  // ============================================================

  function checkFloorTable(list, valueField, unit, where) {
    requireArray(list, where, 1);
    var seen = {};
    list.forEach(function (row, i) {
      var at = where + '[' + i + ']';
      requireObject(row, at);
      exactKeys(row, ['floor', valueField], [], at);
      requireId(row.floor, Pack.ID_PATTERNS.floor, at + '.floor');
      rejectDuplicate(seen, row.floor, at, 'floor');
      requireQuantity(row[valueField], unit, at + '.' + valueField);
    });
  }

  function checkProjectPressureMap(cap, where) {
    exactKeys(cap, ['positivePressures', 'negativePressures'], ['evaluationHeights'], where);
    checkFloorTable(cap.positivePressures, 'pressure', PRESSURE_UNIT, where + '.positivePressures');
    requireArray(cap.negativePressures, where + '.negativePressures', 1);
    var seen = {};
    cap.negativePressures.forEach(function (row, i) {
      var at = where + '.negativePressures[' + i + ']';
      requireObject(row, at);
      exactKeys(row, ['zone', 'magnitude'], [], at);
      requireOneOf(row.zone, Wind.ZONES, at + '.zone');
      rejectDuplicate(seen, row.zone, at, 'zone');
      requireQuantity(row.magnitude, PRESSURE_UNIT, at + '.magnitude');
    });
    if (hasOwn(cap, 'evaluationHeights')) {
      checkFloorTable(cap.evaluationHeights, 'height', HEIGHT_UNIT, where + '.evaluationHeights');
    }
  }

  function checkNotificationCalculation(cap, where) {
    exactKeys(cap, ['windConditions'], [], where);
    var wc = requireObject(cap.windConditions, where + '.windConditions');
    var fields = Pack.WIND_FIELDS.notification1458;
    exactKeys(wc, fields.required, fields.optional, where + '.windConditions');
  }

  function checkDeclaredPanes(cap, where) {
    exactKeys(cap, ['panes'], [], where);
    requireArray(cap.panes, where + '.panes', 1);
    var seen = {};
    cap.panes.forEach(function (p, i) {
      var at = where + '.panes[' + i + ']';
      requireObject(p, at);
      exactKeys(p, ['paneId', 'widthMm', 'heightMm'], [], at);
      requireId(p.paneId, Pack.ID_PATTERNS.pane, at + '.paneId');
      rejectDuplicate(seen, p.paneId, at, 'paneId');
      requireQuantity(p.widthMm, LENGTH_UNIT, at + '.widthMm');
      requireQuantity(p.heightMm, LENGTH_UNIT, at + '.heightMm');
    });
  }

  function checkDeclaredGlazingCases(cap, where, paneIds) {
    exactKeys(cap, ['glazingCases'], [], where);
    requireArray(cap.glazingCases, where + '.glazingCases', 1);
    var seen = {};
    cap.glazingCases.forEach(function (c, i) {
      var at = where + '.glazingCases[' + i + ']';
      requireObject(c, at);
      // case は topology（pane / ガラス / 係数 / 文脈）だけを持つ。風圧は pressure capability
      // にだけ置く。ここに designPressure があれば同じ case の風圧が 2 か所になる。
      if (hasOwn(c, 'designPressure')) {
        fail(at, 'double truth: a case carries no pressure; pressure lives only in the pressure capability');
      }
      exactKeys(c, ['caseId', 'paneId', 'glassType', 'extraFactor'], ['floor', 'zone'], at);
      requireId(c.caseId, Pack.ID_PATTERNS.glazingCase, at + '.caseId');
      rejectDuplicate(seen, c.caseId, at, 'caseId');
      requireId(c.paneId, Pack.ID_PATTERNS.pane, at + '.paneId');
      if (paneIds.indexOf(c.paneId) === -1) fail(at + '.paneId', 'refers to an undeclared pane ' + show(c.paneId));
      requireNonEmptyString(c.glassType, at + '.glassType');
      if (typeof c.extraFactor !== 'number' || !isFinite(c.extraFactor)) fail(at + '.extraFactor', 'must be a finite number');
      if (hasOwn(c, 'floor')) requireId(c.floor, Pack.ID_PATTERNS.floor, at + '.floor');
      if (hasOwn(c, 'zone')) requireOneOf(c.zone, Wind.ZONES, at + '.zone');
    });
  }

  function checkCaseDirectPressure(cap, where, caseIds) {
    exactKeys(cap, ['designPressures'], [], where);
    requireArray(cap.designPressures, where + '.designPressures', 1);
    var seen = {};
    cap.designPressures.forEach(function (row, i) {
      var at = where + '.designPressures[' + i + ']';
      requireObject(row, at);
      exactKeys(row, ['caseId', 'designPressure'], [], at);
      requireId(row.caseId, Pack.ID_PATTERNS.glazingCase, at + '.caseId');
      rejectDuplicate(seen, row.caseId, at, 'caseId');
      if (caseIds.indexOf(row.caseId) === -1) fail(at + '.caseId', 'refers to an undeclared case ' + show(row.caseId));
      requireQuantity(row.designPressure, PRESSURE_UNIT, at + '.designPressure');
    });
    caseIds.forEach(function (id) {
      if (!hasOwn(seen, id)) fail(where, 'has no designPressure for declared case ' + show(id));
    });
  }

  function checkEvidenceClaims(cap, where) {
    exactKeys(cap, ['sourceScopes', 'records'], [], where);
    requireArray(cap.sourceScopes, where + '.sourceScopes', 0);
    var seen = {};
    cap.sourceScopes.forEach(function (s, i) {
      var at = where + '.sourceScopes[' + i + ']';
      requireObject(s, at);
      exactKeys(s, ['sourceScopeId', 'evidenceKind', 'sourceClaim'], [], at);
      requireId(s.sourceScopeId, Pack.ID_PATTERNS.sourceScope, at + '.sourceScopeId');
      rejectDuplicate(seen, s.sourceScopeId, at, 'sourceScopeId');
      if (s.evidenceKind !== EVIDENCE_KIND_PACK_CLAIM) {
        fail(at + '.evidenceKind', 'must be ' + show(EVIDENCE_KIND_PACK_CLAIM) + ' (got ' + show(s.evidenceKind) + ')');
      }
      requireObject(s.sourceClaim, at + '.sourceClaim');
      exactKeys(s.sourceClaim, Pack.SOURCE_CLAIM_KEYS, [], at + '.sourceClaim');
    });
    requireArray(cap.records, where + '.records', 0);
    cap.records.forEach(function (r, i) {
      var at = where + '.records[' + i + ']';
      requireObject(r, at);
      exactKeys(r, ['sourceScopeId', 'subject', 'quantity'], [], at);
      if (!hasOwn(seen, r.sourceScopeId)) fail(at + '.sourceScopeId', 'refers to an undeclared source scope');
      requireObject(r.subject, at + '.subject');
      var kind = requireOneOf(r.subject.kind, Object.keys(Pack.RECORD_SUBJECTS), at + '.subject.kind');
      var refField = Pack.RECORD_SUBJECTS[kind].refField;
      exactKeys(r.subject, refField === null ? ['kind'] : ['kind', refField], [], at + '.subject');
      requireQuantity(r.quantity, Pack.RECORD_SUBJECTS[kind].unit, at + '.quantity');
    });
  }

  function checkSampleDefaultDimensions(cap, where) {
    exactKeys(cap, ['mode', 'widthMm', 'heightMm'], [], where);
    if (cap.mode !== LEGACY_DIMENSIONS_MODE) fail(where + '.mode', 'must be ' + show(LEGACY_DIMENSIONS_MODE));
    requireQuantity(cap.widthMm, LENGTH_UNIT, where + '.widthMm');
    requireQuantity(cap.heightMm, LENGTH_UNIT, where + '.heightMm');
  }

  function checkBuiltInEvidence(cap, where) {
    exactKeys(cap, ['fields', 'groupStatus', 'verifiedCases'], [], where);
    requireArray(cap.fields, where + '.fields', BUILT_IN_FIELDS.length);
    if (cap.fields.length !== BUILT_IN_FIELDS.length) fail(where + '.fields', 'must list exactly the built-in fields');
    cap.fields.forEach(function (f, i) {
      var at = where + '.fields[' + i + ']';
      var spec = BUILT_IN_FIELDS[i];
      requireObject(f, at);
      var optional = spec.carriesValue ? ['value', 'unit', 'sourceReference'] : ['sourceReference'];
      exactKeys(f, ['fieldKey', 'evidenceKind', 'verificationStatus', 'evidence'], optional, at);
      if (f.fieldKey !== spec.fieldKey) fail(at + '.fieldKey', 'must be ' + show(spec.fieldKey));
      if (f.evidenceKind !== EVIDENCE_KIND_BUILT_IN) {
        fail(at + '.evidenceKind', 'must be ' + show(EVIDENCE_KIND_BUILT_IN) + ' (got ' + show(f.evidenceKind) + ')');
      }
      if (spec.carriesValue && !hasOwn(f, 'value')) fail(at, 'is missing required field "value"');
      requireObject(f.evidence, at + '.evidence');
      exactKeys(f.evidence, CANONICAL_EVIDENCE_KEYS, [], at + '.evidence');
      // built-in の Evidence は既存の canonical 契約をそのまま満たすこと（昇格も降格もしない）
      Evidence.assertEvidenceConsistency(f.verificationStatus, f.evidence, at);
    });
    requireObject(cap.groupStatus, where + '.groupStatus');
    exactKeys(cap.groupStatus, ['wind', 'dimensions'], [], where + '.groupStatus');
    requireOneOf(cap.groupStatus.wind, Evidence.VERIFICATION_STATUSES, where + '.groupStatus.wind');
    requireOneOf(cap.groupStatus.dimensions, Evidence.VERIFICATION_STATUSES, where + '.groupStatus.dimensions');
    requireArray(cap.verifiedCases, where + '.verifiedCases', 0);
  }

  /**
   * trust の構造不変条件。
   *   pack context   : どの object も Promotion Gate を通らない
   *   legacy context : Promotion Gate を通る object は builtInEvidence の中にだけある
   * 判定は Evidence の canonical gate 自身に任せる（規則を写さない）。
   */
  function checkPromotionInvariant(ctx) {
    walk(ctx, function (node, at) {
      if (!isPlainObject(node)) return;
      if (!Evidence.canPromoteToVerified(node)) return;
      var insideBuiltIn = ctx.sourceKind === SOURCE_LEGACY &&
        at.indexOf('context.capabilities.builtInEvidence.') === 0;
      if (!insideBuiltIn) {
        fail(at, 'is promotion-capable Evidence, which a ' + show(ctx.sourceKind) + ' context must not carry here');
      }
    }, 'context');
  }

  /**
   * 形だけを検証する（provenance は確かめない。それは assertProjectContext の役目）。
   * 形の検証は adapter が context を発行する前に必ず通す。
   */
  function assertProjectContextShape(ctx) {
    assertPlainData(ctx, 'context', 1, []);
    requireObject(ctx, 'context');
    exactKeys(ctx, ['contextType', 'schemaVersion', 'sourceKind', 'trust', 'publicLabel',
      'pressureModel', 'origin', 'capabilities'], [], 'context');
    if (ctx.contextType !== CONTEXT_TYPE) fail('context.contextType', 'must be ' + show(CONTEXT_TYPE));
    if (ctx.schemaVersion !== SCHEMA_VERSION) fail('context.schemaVersion', 'must be ' + SCHEMA_VERSION);
    var kind = requireOneOf(ctx.sourceKind, SOURCE_KINDS, 'context.sourceKind');
    if (ctx.trust !== TRUST_BY_SOURCE_KIND[kind]) {
      fail('context.trust', 'must be ' + show(TRUST_BY_SOURCE_KIND[kind]) + ' for sourceKind ' + show(kind) +
        ' (trust is derived from sourceKind only)');
    }
    requireNonEmptyString(ctx.publicLabel, 'context.publicLabel');

    requireObject(ctx.pressureModel, 'context.pressureModel');
    exactKeys(ctx.pressureModel, ['mode'], [], 'context.pressureModel');
    var mode = requireOneOf(ctx.pressureModel.mode, Pack.PRESSURE_MODES, 'context.pressureModel.mode');
    if (kind === SOURCE_LEGACY && mode !== LEGACY_PRESSURE_MODE) {
      fail('context.pressureModel.mode', 'must be ' + show(LEGACY_PRESSURE_MODE) + ' for a legacy preset');
    }

    requireObject(ctx.origin, 'context.origin');
    if (kind === SOURCE_LEGACY) {
      exactKeys(ctx.origin, ['registryProjectId'], [], 'context.origin');
      requireNonEmptyString(ctx.origin.registryProjectId, 'context.origin.registryProjectId');
    } else {
      exactKeys(ctx.origin, ['packType', 'packSchemaVersion', 'publicationAdvisories'], [], 'context.origin');
      if (ctx.origin.packType !== Pack.PACK_TYPE) fail('context.origin.packType', 'must be ' + show(Pack.PACK_TYPE));
      if (ctx.origin.packSchemaVersion !== Pack.SCHEMA_VERSION) fail('context.origin.packSchemaVersion', 'must be ' + Pack.SCHEMA_VERSION);
      requireArray(ctx.origin.publicationAdvisories, 'context.origin.publicationAdvisories', 0);
    }

    var caps = requireObject(ctx.capabilities, 'context.capabilities');
    Object.keys(caps).forEach(function (name) {
      requireOneOf(name, CAPABILITIES, 'context.capabilities key');
      if (ALLOWED_CAPABILITIES[kind].indexOf(name) === -1) {
        fail('context.capabilities.' + name, 'is not a capability a ' + show(kind) + ' context can have');
      }
      requireObject(caps[name], 'context.capabilities.' + name);
    });
    REQUIRED_CAPABILITIES[kind].forEach(function (name) {
      if (!hasOwn(caps, name)) fail('context.capabilities', 'is missing required capability ' + show(name));
    });
    var pressureCap = PRESSURE_CAPABILITY_BY_MODE[mode];
    PRESSURE_CAPABILITIES.forEach(function (name) {
      if (name === pressureCap && !hasOwn(caps, name)) {
        fail('context.capabilities', 'is missing ' + show(name) + ', the pressure source for mode ' + show(mode));
      }
      if (name !== pressureCap && hasOwn(caps, name)) {
        fail('context.capabilities.' + name, 'is not the pressure source for mode ' + show(mode) + ' (one source only)');
      }
    });

    var at = 'context.capabilities.';
    if (hasOwn(caps, 'projectPressureMap')) checkProjectPressureMap(caps.projectPressureMap, at + 'projectPressureMap');
    if (hasOwn(caps, 'notificationCalculation')) checkNotificationCalculation(caps.notificationCalculation, at + 'notificationCalculation');
    var paneIds = [];
    if (hasOwn(caps, 'declaredPanes')) {
      checkDeclaredPanes(caps.declaredPanes, at + 'declaredPanes');
      paneIds = caps.declaredPanes.panes.map(function (p) { return p.paneId; });
    }
    var caseIds = [];
    if (hasOwn(caps, 'declaredGlazingCases')) {
      checkDeclaredGlazingCases(caps.declaredGlazingCases, at + 'declaredGlazingCases', paneIds);
      caseIds = caps.declaredGlazingCases.glazingCases.map(function (c) { return c.caseId; });
    }
    if (hasOwn(caps, 'caseDirectPressure')) checkCaseDirectPressure(caps.caseDirectPressure, at + 'caseDirectPressure', caseIds);
    if (hasOwn(caps, 'evidenceClaims')) checkEvidenceClaims(caps.evidenceClaims, at + 'evidenceClaims');
    if (hasOwn(caps, 'sampleDefaultDimensions')) checkSampleDefaultDimensions(caps.sampleDefaultDimensions, at + 'sampleDefaultDimensions');
    if (hasOwn(caps, 'builtInEvidence')) checkBuiltInEvidence(caps.builtInEvidence, at + 'builtInEvidence');

    checkPromotionInvariant(ctx);
    return true;
  }

  function issue(spec) {
    assertProjectContextShape(spec);
    var ctx = Evidence.deepFreeze(copyData(spec));
    issued.add(ctx);
    return ctx;
  }

  // ============================================================
  // provenance / capability access
  // ============================================================

  /** この module の adapter が発行した context かどうか（形ではなく同一性で判定）。 */
  function isProjectContext(value) {
    return value !== null && typeof value === 'object' && issued.has(value);
  }

  function assertProjectContext(value) {
    if (!isProjectContext(value)) {
      fail('value', 'is not a ProjectContext issued by an adapter of this module ' +
        '(a look-alike object is not accepted)');
    }
    return value;
  }

  function hasCapability(ctx, name) {
    assertProjectContext(ctx);
    requireOneOf(name, CAPABILITIES, 'capability');
    return hasOwn(ctx.capabilities, name);
  }

  /** capability の payload を返す。持っていなければ fail closed（代わりの値を作らない）。 */
  function requireCapability(ctx, name) {
    assertProjectContext(ctx);
    requireOneOf(name, CAPABILITIES, 'capability');
    if (!hasOwn(ctx.capabilities, name)) {
      fail('capability ' + show(name), 'is not supported by this ' + show(ctx.sourceKind) + ' context ' +
        '(pressureModel.mode ' + show(ctx.pressureModel.mode) + ')');
    }
    return ctx.capabilities[name];
  }

  // ============================================================
  // LegacyPresetAdapter
  // ============================================================

  function quantityOf(entry, unit, where) {
    if (!entry || typeof entry !== 'object' || entry.unit !== unit) {
      fail(where, 'must carry a value in ' + show(unit));
    }
    return { value: entry.value, unit: unit };
  }

  function builtInField(spec, source, where) {
    if (!source || typeof source !== 'object' || !source.evidence) {
      fail(where, 'has no built-in Evidence');
    }
    var out = {
      fieldKey: spec.fieldKey,
      evidenceKind: EVIDENCE_KIND_BUILT_IN,
      verificationStatus: source.verificationStatus,
      evidence: {
        level: source.evidence.level,
        checkedAt: source.evidence.checkedAt,
        publicDescription: source.evidence.publicDescription,
        privateReferenceAvailable: source.evidence.privateReferenceAvailable
      }
    };
    if (spec.carriesValue) {
      out.value = source.value;
      out.unit = source.unit === undefined ? null : source.unit;
    }
    if (hasOwn(source, 'sourceReference')) out.sourceReference = copyData(source.sourceReference);
    return out;
  }

  function readPath(obj, dotted) {
    return dotted.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj);
  }

  /**
   * repository の built-in preset を context へ写す。
   * 引くのは PresetRegistry.getBuiltInPreset()（bootstrap で捕まえた built-in instance）だけで、
   * getPreset() ではない。後から registerPreset() で登録された config は、形が正しくても
   * built_in_current にならない。呼び出し側から config object も受け取らない。
   * pane registry / glazing case / 告示算定入力は作らない（legacy preset に無いため）。
   */
  function fromLegacyPreset(projectId) {
    var config = getBuiltInPreset(projectId);
    if (!config || config.hasFixedPreset !== true || config.projectId !== projectId) {
      fail('legacy preset ' + show(projectId), 'is not a built-in registered preset');
    }
    var wind = config.wind;
    var dims = config.dimensions;
    if (!wind || !wind.positivePressureByFloor || !wind.negativePressureByZone) {
      fail('legacy preset ' + show(projectId), 'has no floor / zone pressure map');
    }
    if (!dims || dims.mode !== LEGACY_DIMENSIONS_MODE) {
      fail('legacy preset ' + show(projectId) + ' dimensions.mode', 'must be ' + show(LEGACY_DIMENSIONS_MODE) +
        ' (got ' + show(dims && dims.mode) + '); no other legacy dimension mode is supported');
    }

    var positivePressures = Object.keys(wind.positivePressureByFloor).map(function (floor) {
      return { floor: floor,
        pressure: quantityOf(wind.positivePressureByFloor[floor], PRESSURE_UNIT, 'positivePressureByFloor.' + floor) };
    });
    var negativePressures = Object.keys(wind.negativePressureByZone).map(function (zone) {
      return { zone: zone,
        magnitude: quantityOf(wind.negativePressureByZone[zone], PRESSURE_UNIT, 'negativePressureByZone.' + zone) };
    });

    return issue({
      contextType: CONTEXT_TYPE,
      schemaVersion: SCHEMA_VERSION,
      sourceKind: SOURCE_LEGACY,
      trust: TRUST_BY_SOURCE_KIND[SOURCE_LEGACY],
      publicLabel: config.getPublicLabel(),
      pressureModel: { mode: LEGACY_PRESSURE_MODE },
      origin: { registryProjectId: config.projectId },
      capabilities: {
        projectPressureMap: { positivePressures: positivePressures, negativePressures: negativePressures },
        sampleDefaultDimensions: {
          mode: dims.mode,
          widthMm: quantityOf(dims.defaultW, LENGTH_UNIT, 'dimensions.defaultW'),
          heightMm: quantityOf(dims.defaultH, LENGTH_UNIT, 'dimensions.defaultH')
        },
        builtInEvidence: {
          fields: BUILT_IN_FIELDS.map(function (spec) {
            return builtInField(spec, readPath(config, spec.fieldKey), spec.fieldKey);
          }),
          groupStatus: { wind: wind.status, dimensions: dims.status },
          verifiedCases: copyData(config.verifiedCases)
        }
      }
    });
  }

  // ============================================================
  // ProjectPackAdapter
  // ============================================================

  var PACK_OUTPUT_ONLY_KEYS = ['trust', 'publicationAdvisories'];

  /**
   * validateProjectPack() の出力を context へ写す。
   *
   * 受け取った object は信用せず、出力専用の field を外して validateProjectPack() に
   * **もう一度通し**、その結果だけを使う（validator の規則を写さずに、形の真似や
   * 検証後の書き換えを拒否する）。出力の trust は pack_unreviewed でなければならない。
   * sourceClaim は claimed* のまま pack_unreviewed_claim として運び、canonical Evidence へ
   * 変換しない。
   */
  function fromProjectPack(validated) {
    var where = 'ProjectPackAdapter input';
    if (!isPlainObject(validated)) fail(where, 'must be the object returned by validateProjectPack()');
    var expectedKeys = Pack.TOP_LEVEL_KEYS.concat(PACK_OUTPUT_ONLY_KEYS);
    var top = {};
    Object.getOwnPropertyNames(validated).forEach(function (name) {
      var d = Object.getOwnPropertyDescriptor(validated, name);
      if (!hasOwn(d, 'value')) fail(where + '.' + name, 'is an accessor, not data');
      top[name] = d.value;
    });
    exactKeys(top, expectedKeys, [], where + ' (expected validateProjectPack() output)');
    if (top.trust !== Pack.TRUST_LEVELS[0] || Pack.TRUST_LEVELS.length !== 1) {
      fail(where + '.trust', 'must be ' + show(Pack.TRUST_LEVELS[0]) + ' (got ' + show(top.trust) + ')');
    }
    assertPlainData(top.publicationAdvisories, where + '.publicationAdvisories', 1, []);

    var rawInput = {};
    Pack.TOP_LEVEL_KEYS.forEach(function (k) { rawInput[k] = top[k]; });
    var pack = Pack.validateProjectPack(rawInput);
    if (pack.trust !== TRUST_BY_SOURCE_KIND[SOURCE_PACK]) {
      fail(where, 're-validated to an unexpected trust ' + show(pack.trust));
    }
    if (show(copyData(top.publicationAdvisories)) !== show(pack.publicationAdvisories)) {
      fail(where + '.publicationAdvisories', 'does not match the advisories of the re-validated pack');
    }

    var mode = pack.pressureModel.mode;
    var caps = {
      declaredPanes: { panes: copyData(pack.panes) },
      declaredGlazingCases: {
        glazingCases: pack.glazingCases.map(function (c) {
          var out = { caseId: c.caseId, paneId: c.paneId, glassType: c.glassType, extraFactor: c.extraFactor };
          // 入力に無かった floor / zone は作らない（case_direct で zone を推測しない）
          if (hasOwn(c, 'floor')) out.floor = c.floor;
          if (hasOwn(c, 'zone')) out.zone = c.zone;
          return out;
        })
      },
      evidenceClaims: {
        sourceScopes: pack.evidence.sourceScopes.map(function (s) {
          return { sourceScopeId: s.sourceScopeId, evidenceKind: EVIDENCE_KIND_PACK_CLAIM,
            sourceClaim: copyData(s.sourceClaim) };
        }),
        records: copyData(pack.evidence.records)
      }
    };
    if (mode === 'notification1458') {
      caps.notificationCalculation = { windConditions: copyData(pack.windConditions) };
    } else if (mode === 'project_pressure_map') {
      caps.projectPressureMap = copyData(pack.windConditions);
    } else if (mode === 'case_direct') {
      caps.caseDirectPressure = {
        designPressures: pack.glazingCases.map(function (c) {
          return { caseId: c.caseId, designPressure: copyData(c.designPressure) };
        })
      };
    } else {
      fail(where + '.pressureModel.mode', 'is not supported: ' + show(mode));
    }

    return issue({
      contextType: CONTEXT_TYPE,
      schemaVersion: SCHEMA_VERSION,
      sourceKind: SOURCE_PACK,
      trust: TRUST_BY_SOURCE_KIND[SOURCE_PACK],
      publicLabel: pack.projectMetadata.publicLabel,
      pressureModel: { mode: mode },
      origin: { packType: pack.packType, packSchemaVersion: pack.schemaVersion,
        publicationAdvisories: copyData(pack.publicationAdvisories) },
      capabilities: caps
    });
  }

  return Evidence.deepFreeze({
    CONTEXT_TYPE: CONTEXT_TYPE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SOURCE_KINDS: SOURCE_KINDS,
    TRUST_BY_SOURCE_KIND: TRUST_BY_SOURCE_KIND,
    CAPABILITIES: CAPABILITIES,
    ALLOWED_CAPABILITIES: ALLOWED_CAPABILITIES,
    REQUIRED_CAPABILITIES: REQUIRED_CAPABILITIES,
    PRESSURE_CAPABILITY_BY_MODE: PRESSURE_CAPABILITY_BY_MODE,
    EVIDENCE_KINDS: EVIDENCE_KINDS,
    fromLegacyPreset: fromLegacyPreset,
    fromProjectPack: fromProjectPack,
    isProjectContext: isProjectContext,
    assertProjectContext: assertProjectContext,
    assertProjectContextShape: assertProjectContextShape,
    hasCapability: hasCapability,
    requireCapability: requireCapability
  });
});
