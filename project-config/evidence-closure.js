/**
 * project-config/evidence-closure.js
 *
 * Evidence Closure Observation v1（Phase 2J Wave 2）。案件非依存。
 *
 * ── このmoduleが答える問い ───────────────────────────────────
 *
 *   「この Observation は**妥当な観測の申告**か？」
 *
 * だけである。次の問いには答えない（Wave 3の責務）:
 *
 *   「この Observation は昇格に**十分**か？」
 *   「current config と**一致**するか？」
 *
 * この区別は意図的である。Observationは Evidence の**入力**であって
 * trust status ではない。入力の妥当性と昇格の十分性を同じ関数で判定すると、
 * 「構造的に正しい観測」＝「昇格してよい観測」という読み替えが起きる。
 *
 * ── このmoduleが持たないもの ────────────────────────────────
 *
 * Evidence validationを一切再実装しない。level / checkedAt / public-safe prose /
 * public URL / private-provider denylist / credential検出 / promotion gate /
 * sourceReference正規化 はすべて project-config/evidence.js の正を呼ぶ。
 * fact allowlist の正は project-config/evidence-ledger.js にある。
 *
 * 案件固有の値・floor語彙・zone語彙も持たない。scope語彙は
 * **registered presetのtopologyから導出する**（ハードコードしない）。
 * ハードコードすると、presetが変わってもここが追随せず、
 * 「存在しない階の観測」を受理したり「存在する階の観測」を拒否したりする。
 *
 * ── privacy ───────────────────────────────────────────────
 *
 * private Evidenceの所在（URL / ファイル名 / ID / パス）を保持しない。
 * private Evidenceについて保持するのは privateReferenceAvailable だけである。
 * slotKey も公開されるidentifierなので、topology由来のtokenに限定する。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式の
 * プレーンJSとして提供する（<script src> と require() の両対応）。
 * ブラウザでは evidence.js / evidence-ledger.js / registry.js の後に読み込むこと。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.EvidenceClosure = mod;
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
    throw new Error('evidence-closure.js: ' + label + ' is required but not available');
  }

  var Evidence = resolveDependency(
    'ProjectEvidence', './evidence.js', 'project-config/evidence.js (ProjectEvidence)');
  var Ledger = resolveDependency(
    'EvidenceLedger', './evidence-ledger.js', 'project-config/evidence-ledger.js (EvidenceLedger)');
  var Registry = resolveDependency(
    'PresetRegistry', './registry.js', 'project-config/registry.js (PresetRegistry)');

  // ============================================================
  // Contract
  // ============================================================

  var OBSERVATION_SCHEMA_VERSION = 1;
  var OBSERVATION_TYPE = 'evidence_closure_observation';

  /**
   * Phase 2Jが閉じようとしている未解決factだけに絞った**部分集合**。
   * generic allowlist（EvidenceLedger.KNOWN_FACT_KEYS）を置き換えるものではない。
   *
   * V0 / 粗度区分 / 建物高さ / 軒高 を含めないのは、
   * それらが Phase 2J の対象4カテゴリに含まれないからであって、
   * generic allowlistから外れたからではない。
   */
  var CLOSURE_FACT_KEYS = [
    'pane_width_mm',
    'pane_height_mm',
    'positive_pressure',
    'negative_pressure',
    'evaluation_height'
  ];

  // module評価時のfail-fast: Phase 2Jのfactが generic allowlist から外れていたら
  // その時点で落とす。片方だけ直して不整合に気付かない状態を作らない。
  (function assertClosureFactsAreKnown() {
    for (var i = 0; i < CLOSURE_FACT_KEYS.length; i++) {
      if (Ledger.KNOWN_FACT_KEYS.indexOf(CLOSURE_FACT_KEYS[i]) === -1) {
        throw new Error(
          'evidence-closure.js: closure fact key is not in the generic allowlist: ' +
            JSON.stringify(CLOSURE_FACT_KEYS[i])
        );
      }
    }
  })();

  /**
   * fact typeごとに単位を固定する。**単位変換は一切しない。**
   *
   * 変換を許すと、圧力を別単位で申告した観測が黙って等価になり、
   * 「一致した」という結論だけが残って換算契約が残らない。
   * 換算が必要なら、申告側が換算してから申告する。
   */
  var FACT_UNITS = {
    pane_width_mm: 'mm',
    pane_height_mm: 'mm',
    positive_pressure: 'N/m²',
    negative_pressure: 'N/m²',
    evaluation_height: 'm'
  };

  /**
   * fact typeごとのscope種別。
   *
   *   null    : scopeを持たない（pane1枚の寸法はfloor/zoneに依存しない）
   *   'floor' : { floor } を要求する
   *   'zone'  : { zone } を要求する
   *
   * scope binding は Phase 2J の新規責務である（Phase 2Fのcontractには無い）。
   */
  var FACT_SCOPE_KIND = {
    pane_width_mm: null,
    pane_height_mm: null,
    positive_pressure: 'floor',
    negative_pressure: 'zone',
    evaluation_height: 'floor'
  };

  var SCOPE_KIND_FIELD = { floor: 'floor', zone: 'zone' };

  var OBSERVATION_REQUIRED_KEYS = [
    'schemaVersion', 'observationType', 'factKey', 'scope', 'observedValue', 'unit', 'evidence'
  ];
  var OBSERVATION_OPTIONAL_KEYS = ['sourceReference'];
  var EVIDENCE_REQUIRED_KEYS = ['level', 'checkedAt', 'publicDescription', 'privateReferenceAvailable'];

  var MAX_OBSERVATIONS = 64;

  /**
   * scope値（階key / 区分key）として公開してよいtokenの形。
   *
   * これは Phase 2F contractの複製ではない。scope語彙は Phase 2J が新たに
   * 公開identifier（slotKey）へ埋め込むものなので、図面番号やファイル名が
   * preset経由で公開identifierへ流れ込む経路をここで閉じる必要がある。
   * D-012（factKeyのallowlist）と同じ理由が scope key にも等しく当てはまる。
   */
  var SCOPE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

  // normalize() を通った Observation だけを slotKey計算等の入口で受け付ける。
  // 「検証済みであること」を型で持てないJSでは、通過の事実を別に持つしかない。
  var NORMALIZED_OBSERVATIONS = new WeakSet();

  // ============================================================
  // Project scope contract（topologyのみ）
  // ============================================================

  function assertKnownClosureFactKey(factKey, label) {
    if (typeof factKey !== 'string' || CLOSURE_FACT_KEYS.indexOf(factKey) === -1) {
      throw new Error(
        label + ': factKey must be one of ' + CLOSURE_FACT_KEYS.join(', ') +
          ' (got ' + JSON.stringify(factKey) + ')'
      );
    }
    return factKey;
  }

  function deriveScopeKeys(container, what, projectId) {
    if (!container || typeof container !== 'object') {
      throw new Error(
        'createProjectScopeContract(): preset ' + JSON.stringify(projectId) +
          ' does not expose ' + what
      );
    }
    var keys = Object.keys(container).slice().sort();
    if (keys.length === 0) {
      throw new Error(
        'createProjectScopeContract(): preset ' + JSON.stringify(projectId) +
          ' has no ' + what + ' entries'
      );
    }
    for (var i = 0; i < keys.length; i++) {
      if (!SCOPE_KEY_PATTERN.test(keys[i])) {
        throw new Error(
          'createProjectScopeContract(): ' + what + ' key is not a public-safe token: ' +
            JSON.stringify(keys[i])
        );
      }
    }
    return keys;
  }

  /**
   * 登録済みpresetのtopologyから scope contract を作る（純関数）。
   *
   * 含めるのは**topologyだけ**である。案件名・identity・現在の圧力値・
   * 現在の寸法・Evidence参照は入れない。この契約が答えるのは
   * 「どのscopeが存在しうるか」であって「現在何が正しいか」ではない。
   */
  function createProjectScopeContract(projectId) {
    var config = Registry.getPreset(projectId);
    var wind = config && config.wind;
    if (!wind || typeof wind !== 'object') {
      throw new Error(
        'createProjectScopeContract(): preset ' + JSON.stringify(projectId) + ' has no wind topology'
      );
    }
    return Evidence.deepFreeze({
      projectId: config.projectId,
      floors: deriveScopeKeys(wind.positivePressureByFloor, 'positive-pressure floor', projectId),
      zones: deriveScopeKeys(wind.negativePressureByZone, 'negative-pressure zone', projectId)
    });
  }

  // ============================================================
  // Observation v1
  // ============================================================

  function assertExactOwnKeys(value, requiredKeys, optionalKeys, label) {
    var own = Object.keys(value);
    var allowed = requiredKeys.concat(optionalKeys || []);
    for (var i = 0; i < own.length; i++) {
      if (allowed.indexOf(own[i]) === -1) {
        throw new Error(label + ' has an unexpected field: ' + JSON.stringify(own[i]));
      }
    }
    for (var r = 0; r < requiredKeys.length; r++) {
      if (!Object.prototype.hasOwnProperty.call(value, requiredKeys[r])) {
        throw new Error(label + ' is missing required field: ' + requiredKeys[r]);
      }
    }
    return value;
  }

  /**
   * scopeを検証し、正規化した新しいobjectを返す（floor/zone種別ごと）。
   * scope語彙は scopeContract 由来であり、このmodule内の定数ではない。
   */
  function normalizeScope(factKey, scope, contract, label) {
    var kind = FACT_SCOPE_KIND[factKey];

    if (kind === null) {
      // 「scopeを持たない」ことを空objectで表現させない。
      // {} は「scopeがある/まだ埋めていない」とも読めてしまい、意味が一意にならない。
      if (scope !== null) {
        throw new Error(
          label + ': factKey ' + JSON.stringify(factKey) +
            ' requires scope === null (got ' + JSON.stringify(scope) + ')'
        );
      }
      return null;
    }

    if (scope === null || scope === undefined) {
      throw new Error(
        label + ': factKey ' + JSON.stringify(factKey) + ' requires a scope object with ' + kind
      );
    }
    Evidence.assertOrdinaryObject(scope, label + ': scope');
    var field = SCOPE_KIND_FIELD[kind];
    assertExactOwnKeys(scope, [field], [], label + ': scope');

    var value = scope[field];
    var vocabulary = kind === 'floor' ? contract.floors : contract.zones;
    if (typeof value !== 'string' || vocabulary.indexOf(value) === -1) {
      throw new Error(
        label + ': scope.' + field + ' must be one of ' + vocabulary.join(', ') +
          ' for project ' + JSON.stringify(contract.projectId) +
          ' (got ' + JSON.stringify(value) + ')'
      );
    }

    var normalized = {};
    normalized[field] = value;
    return normalized;
  }

  /** factKey + 検証済みscope から slot identity を決める。呼び出し側は供給できない。 */
  function slotKeyFor(factKey, normalizedScope) {
    if (normalizedScope === null) {
      return factKey;
    }
    var field = Object.keys(normalizedScope)[0];
    return factKey + '|' + field + '=' + normalizedScope[field];
  }

  function normalizeObservedValue(factKey, observedValue, label) {
    // 数値文字列を受け入れない。'2345' を黙って 2345 にすると、
    // 「どの型で申告されたか」という情報が消えたまま比較に進む。
    if (typeof observedValue !== 'number' || !isFinite(observedValue)) {
      throw new Error(
        label + ': observedValue must be a finite number (got ' + JSON.stringify(observedValue) + ')'
      );
    }
    if (observedValue <= 0) {
      throw new Error(
        label + ': observedValue must be greater than 0 (got ' + JSON.stringify(observedValue) + ')'
      );
    }
    return observedValue;
  }

  function normalizeUnit(factKey, unit, label) {
    var expected = FACT_UNITS[factKey];
    if (unit !== expected) {
      throw new Error(
        label + ': unit for ' + factKey + ' must be exactly ' + JSON.stringify(expected) +
          ' (got ' + JSON.stringify(unit) + '). this module performs no unit conversion.'
      );
    }
    return unit;
  }

  /**
   * Observation.evidence を canonical Evidence へ正規化する。
   *
   * **primary を要求しない。** Observationは「根拠が不十分である」ことも
   * 正当に記述できなければならない。十分性の判定はWave 3のpromotion gateで行う。
   * ここで promotion gate を呼ぶと、記述できる観測が verified 相当のものだけに
   * 狭まり、Evidenceの不足を記録する手段が無くなる。
   */
  function normalizeObservationEvidence(rawEvidence, label) {
    if (rawEvidence === null || rawEvidence === undefined) {
      throw new Error(label + ': evidence is required');
    }
    Evidence.assertOrdinaryObject(rawEvidence, label + ': evidence');
    assertExactOwnKeys(rawEvidence, EVIDENCE_REQUIRED_KEYS, [], label + ': evidence');
    // level / checkedAt / public-safe prose / boolean の検証は正を呼ぶ（複製しない）。
    return Evidence.makeEvidence(
      rawEvidence.level,
      rawEvidence.checkedAt,
      rawEvidence.publicDescription,
      rawEvidence.privateReferenceAvailable
    );
  }

  function normalizeWithContract(observation, contract, label) {
    // 何かを読む前に構造を閉じる。継承させたfieldは Object.keys に現れないため、
    // 下のallowlistが空虚に真になったまま契約値だけが通る（Phase 2J Wave 1 D-003）。
    Evidence.assertOrdinaryObject(observation, label);
    assertExactOwnKeys(observation, OBSERVATION_REQUIRED_KEYS, OBSERVATION_OPTIONAL_KEYS, label);

    if (observation.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
      throw new Error(
        label + ': schemaVersion must be ' + OBSERVATION_SCHEMA_VERSION +
          ' (got ' + JSON.stringify(observation.schemaVersion) + ')'
      );
    }
    if (observation.observationType !== OBSERVATION_TYPE) {
      throw new Error(
        label + ': observationType must be ' + JSON.stringify(OBSERVATION_TYPE) +
          ' (got ' + JSON.stringify(observation.observationType) + ')'
      );
    }

    var factKey = assertKnownClosureFactKey(observation.factKey, label);
    var scope = normalizeScope(factKey, observation.scope, contract, label);
    var observedValue = normalizeObservedValue(factKey, observation.observedValue, label);
    var unit = normalizeUnit(factKey, observation.unit, label);
    var evidence = normalizeObservationEvidence(observation.evidence, label);
    // private Evidence は sourceReference: null のまま。URL/path/名称は保持しない。
    var sourceReference = Evidence.canonicalizeSourceReference(observation.sourceReference, label);

    // 呼び出し側のobjectを一切保持しない。正規化後に元objectを書き換えられても、
    // ここで作ったObservationは変わらない。
    var normalized = Evidence.deepFreeze({
      schemaVersion: OBSERVATION_SCHEMA_VERSION,
      observationType: OBSERVATION_TYPE,
      factKey: factKey,
      scope: scope,
      observedValue: observedValue,
      unit: unit,
      evidence: evidence,
      sourceReference: sourceReference
    });
    NORMALIZED_OBSERVATIONS.add(normalized);
    return normalized;
  }

  /** 単一Observationを検証・正規化する。 */
  function normalizeObservation(observation, projectId) {
    return normalizeWithContract(
      observation, createProjectScopeContract(projectId), 'evidence closure observation');
  }

  /** normalize() を通ったObservationのslot identityを返す。 */
  function getObservationSlotKey(observation) {
    if (!observation || typeof observation !== 'object' || !NORMALIZED_OBSERVATIONS.has(observation)) {
      throw new Error(
        'getObservationSlotKey() requires an observation created by normalizeObservation()'
      );
    }
    return slotKeyFor(observation.factKey, observation.scope);
  }

  // ============================================================
  // Required observation slots
  // ============================================================

  /**
   * そのprojectで観測が必要なslotを、topologyから導出して返す。
   *
   * これは「今なにが正しいか」ではなく「なにを観測する必要があるか」の一覧である。
   * したがって現在の数値・現在のverificationStatus・private evidence metadata を
   * 含めない（含めると、必要事項の一覧が現状の主張の写しに変わってしまう）。
   *
   * 順序はJSのkey挿入順に依存させず、導出keyを明示的にsortして決める。
   */
  function listRequiredObservationSlots(projectId) {
    var contract = createProjectScopeContract(projectId);
    var slots = [];

    function push(factKey, scope) {
      slots.push(Evidence.deepFreeze({
        slotKey: slotKeyFor(factKey, scope),
        factKey: factKey,
        scope: scope,
        unit: FACT_UNITS[factKey]
      }));
    }

    push('pane_width_mm', null);
    push('pane_height_mm', null);
    contract.floors.forEach(function (floor) { push('positive_pressure', { floor: floor }); });
    contract.zones.forEach(function (zone) { push('negative_pressure', { zone: zone }); });
    contract.floors.forEach(function (floor) { push('evaluation_height', { floor: floor }); });

    return Evidence.deepFreeze(slots);
  }

  // ============================================================
  // Observation set
  // ============================================================

  /**
   * Observationの集合を検証・正規化する。
   *
   * 同じslotを指す観測が2件あれば**集合ごと拒否する**。
   * last-one-wins も first-one-wins も採らない。どちらも
   * 「どちらの根拠が採用されたか」を黙って決めてしまい、監査時に追えない。
   * 1つのslotに複数のEvidence源を持たせたいなら、それは明示的な設計を要する。
   *
   * 完全性（12slotが揃っているか）はここでは判定しない。部分集合は正当である。
   */
  function normalizeObservationSet(observations, projectId) {
    if (!Array.isArray(observations)) {
      throw new Error('normalizeObservationSet(): observations must be an array');
    }
    if (observations.length > MAX_OBSERVATIONS) {
      throw new Error(
        'normalizeObservationSet(): too many observations (max ' + MAX_OBSERVATIONS +
          ', got ' + observations.length + ')'
      );
    }
    var contract = createProjectScopeContract(projectId);
    var seen = Object.create(null);
    var normalized = [];

    for (var i = 0; i < observations.length; i++) {
      var one = normalizeWithContract(
        observations[i], contract, 'evidence closure observation[' + i + ']');
      var slotKey = slotKeyFor(one.factKey, one.scope);
      if (Object.prototype.hasOwnProperty.call(seen, slotKey)) {
        throw new Error(
          'normalizeObservationSet(): duplicate observation slot: ' + slotKey +
            ' (indexes ' + seen[slotKey] + ' and ' + i + '). ' +
            'multiple evidence sources for one slot require an explicit design, not an implicit overwrite.'
        );
      }
      seen[slotKey] = i;
      normalized.push(one);
    }

    // 入力順に依存しない正規形にする（同じ観測集合なら同じ配列になる）。
    normalized.sort(function (a, b) {
      var ka = slotKeyFor(a.factKey, a.scope);
      var kb = slotKeyFor(b.factKey, b.scope);
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    });
    return Evidence.deepFreeze(normalized);
  }

  return {
    OBSERVATION_SCHEMA_VERSION: OBSERVATION_SCHEMA_VERSION,
    OBSERVATION_TYPE: OBSERVATION_TYPE,
    CLOSURE_FACT_KEYS: Evidence.deepFreeze(CLOSURE_FACT_KEYS),
    FACT_UNITS: Evidence.deepFreeze(FACT_UNITS),
    FACT_SCOPE_KIND: Evidence.deepFreeze(FACT_SCOPE_KIND),
    MAX_OBSERVATIONS: MAX_OBSERVATIONS,
    createProjectScopeContract: createProjectScopeContract,
    normalizeObservation: normalizeObservation,
    getObservationSlotKey: getObservationSlotKey,
    listRequiredObservationSlots: listRequiredObservationSlots,
    normalizeObservationSet: normalizeObservationSet
  };
});
