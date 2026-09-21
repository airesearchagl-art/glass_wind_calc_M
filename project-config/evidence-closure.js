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

  // ── Wave 3: closure evaluation contract ───────────────────

  var CLOSURE_STATUSES = ['READY_CANDIDATE', 'BLOCKED'];

  /**
   * blocker の種別。**現在の真実を表すstatusを混ぜない**
   * （VERIFIED / PROMOTED / APPROVED はここに入らない）。
   * closure評価が答えるのは「候補として閉じられるか」であって
   * 「いま検証済みか」ではない。
   */
  var BLOCKER_KINDS = {
    MISSING_OBSERVATION: 'MISSING_OBSERVATION',
    INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
    MISMATCH: 'MISMATCH',
    CASE_NOT_READY: 'CASE_NOT_READY'
  };

  /**
   * current claim と突き合わせられる fact かどうか。
   *
   * evaluation_height が false なのは実装の都合ではない。
   * current config に評価高さ/Zの正が**存在しない**ことを Phase 2J Wave 1 で
   * 実測したためである。比較対象が無いところで MATCH を返すのは、
   * 「Evidenceの有無」を「数値の一致」で置き換える最も静かな形になる。
   */
  var RECONCILIATION_APPLICABLE = {
    pane_width_mm: true,
    pane_height_mm: true,
    positive_pressure: true,
    negative_pressure: true,
    evaluation_height: false
  };

  /**
   * 報告用の概念カテゴリ。**EvidenceLedgerのfactKeyではない。**
   * 12 slot（機械的な観測単位）と 4 category（案件として未解決な論点）は
   * 別の数であり、混同すると進捗の読みを誤る。
   */
  var CATEGORY_IDS = [
    'pane_visible_dimensions',
    'positive_pressure_source',
    'negative_pressure_source',
    'floor_evaluation_height_mapping'
  ];

  var CANDIDATE_SCHEMA_VERSION = 1;
  var CANDIDATE_TYPE = 'project_evidence_promotion_candidate';
  var CANDIDATE_WARNING =
    'This is a promotion candidate, not current project truth. It has not been applied.';

  // builderが作ったcandidateだけをexporterへ通す（Phase 2I Review Packageと同じ形）。
  var PROMOTION_CANDIDATES = new WeakSet();

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

  // ============================================================
  // Wave 3: current claim resolver
  // ============================================================

  /**
   * 現在のpresetが**いま主張している**scalar値を解決する（module private）。
   *
   * 返り値の意味は「現在のpresetの主張」だけである。
   * verified である / Evidenceに裏付けられている / 承認済みである、のいずれでもない。
   * ここで現在の verificationStatus を持ち出して closure の根拠にしてはならない
   * （reconciliation が問うのは「昇格十分なEvidenceが現在の主張と一致するか」であって
   *   「現在の主張がすでに信用できるか」ではない）。
   *
   * 案件固有の数値も floor/zone 語彙もこのmoduleに持たない。presetから引く。
   */
  function resolveCurrentClaim(config, factKey, scope) {
    if (factKey === 'pane_width_mm') {
      return config.dimensions.defaultW.value;
    }
    if (factKey === 'pane_height_mm') {
      return config.dimensions.defaultH.value;
    }
    if (factKey === 'positive_pressure') {
      return config.wind.positivePressureByFloor[scope.floor].value;
    }
    if (factKey === 'negative_pressure') {
      return config.wind.negativePressureByZone[scope.zone].value;
    }
    // evaluation_height: 正が存在しない。null は「まだ観測していない」ではなく
    // 「突き合わせるべき現在の主張が無い」を意味する。
    return null;
  }

  function entrySpecFor(observation) {
    return {
      factKey: observation.factKey,
      value: observation.observedValue,
      unit: observation.unit,
      verificationStatus: 'verified',
      evidence: observation.evidence,
      sourceReference: observation.sourceReference
    };
  }

  // ============================================================
  // Wave 3: Layer 1 — fact / slot closure
  // ============================================================

  /**
   * 1 slot 分の closure を評価する。
   *
   * 判定順序は Phase 2F と同じく **Evidenceが先、数値は後**である。
   * gateを通らないObservationは、値が完全一致していても READY にならない。
   */
  function evaluateFactSlot(slot, observation, config) {
    var applicable = RECONCILIATION_APPLICABLE[slot.factKey] === true;
    var currentValue = applicable ? resolveCurrentClaim(config, slot.factKey, slot.scope) : null;
    var blockerKinds = [];
    var evidenceGateStatus = null;
    var evidenceGateReason = null;
    var reconciliationStatus = null;
    var ledgerEntry = null;

    if (!observation) {
      blockerKinds.push(BLOCKER_KINDS.MISSING_OBSERVATION);
      if (applicable) {
        // 「Evidenceが無い」の正規表現は既存にある。別アルゴリズムを作らない。
        reconciliationStatus = Ledger.reconcileFact(currentValue, null).status;
      }
    } else {
      try {
        // 昇格十分性の唯一の正。ここで規則を作り直さない。
        Evidence.assertPromotionGate(
          'verified', observation.evidence, slot.slotKey,
          { sourceReference: observation.sourceReference });
        evidenceGateStatus = 'PASS';
      } catch (e) {
        evidenceGateStatus = 'FAIL';
        // gate自身の理由だけを残す。生のObservationやsource入力は貼らない。
        evidenceGateReason = e.message;
        blockerKinds.push(BLOCKER_KINDS.INSUFFICIENT_EVIDENCE);
      }

      if (evidenceGateStatus === 'PASS') {
        // gateが通って初めて 'verified' を名乗るentryを作れる。
        // Evidence levelから verificationStatus を自前でmappingしない。
        // createEntry は gate を再実行する（entry生成自体がtrust boundaryなので、
        // ここでの二重チェックは意図的である）。
        ledgerEntry = Ledger.createEntry(entrySpecFor(observation));
        if (applicable) {
          reconciliationStatus = Ledger.reconcileFact(currentValue, ledgerEntry).status;
          if (reconciliationStatus === 'MISMATCH') {
            // 自動修復しない。現在のpresetも変えない。Human Gateへ回付する。
            blockerKinds.push(BLOCKER_KINDS.MISMATCH);
          }
        }
      } else if (applicable) {
        reconciliationStatus = Ledger.reconcileFact(currentValue, null).status;
      }
    }

    var ready;
    if (applicable) {
      ready = !!observation && evidenceGateStatus === 'PASS' && reconciliationStatus === 'MATCH';
    } else {
      // 突き合わせる現在の主張が無いfactは、昇格十分なEvidenceが付いた時点で
      // 「欠けていたfactが埋まった候補」になる。「現在値と一致した」ではない。
      ready = !!observation && evidenceGateStatus === 'PASS';
    }

    return {
      result: Evidence.deepFreeze({
        slotKey: slot.slotKey,
        factKey: slot.factKey,
        scope: slot.scope,
        unit: slot.unit,
        observationPresent: !!observation,
        candidateValue: observation ? observation.observedValue : null,
        currentValue: currentValue,
        evidenceGateStatus: evidenceGateStatus,
        evidenceGateReason: evidenceGateReason,
        reconciliationApplicable: applicable,
        reconciliationStatus: reconciliationStatus,
        closureStatus: ready ? 'READY_CANDIDATE' : 'BLOCKED',
        blockerKinds: blockerKinds.slice()
      }),
      observation: observation,
      hasLedgerEntry: ledgerEntry !== null
    };
  }

  // ============================================================
  // Wave 3: Layer 2 — conceptual categories と case scope
  // ============================================================

  function buildCategory(categoryId, requiredSlotKeys, resultsBySlot) {
    var blocked = requiredSlotKeys.filter(function (k) {
      return resultsBySlot[k].closureStatus !== 'READY_CANDIDATE';
    });
    return Evidence.deepFreeze({
      categoryId: categoryId,
      status: (requiredSlotKeys.length > 0 && blocked.length === 0) ? 'READY_CANDIDATE' : 'BLOCKED',
      requiredSlotKeys: requiredSlotKeys.slice(),
      blockedSlotKeys: blocked
    });
  }

  function buildCategories(contract, slots, resultsBySlot) {
    var keysFor = function (factKey) {
      return slots.filter(function (s) { return s.factKey === factKey; })
        .map(function (s) { return s.slotKey; });
    };

    // floor ↔ Z の対応は「Z観測がn件ある」では閉じない。
    // 同じ階について 正圧 と 評価高さ の**両方**が揃って初めて対応が言える。
    // 3階のZは2階の対応を閉じない。
    var mappingKeys = [];
    contract.floors.forEach(function (floor) {
      mappingKeys.push(slotKeyFor('positive_pressure', { floor: floor }));
      mappingKeys.push(slotKeyFor('evaluation_height', { floor: floor }));
    });

    return Evidence.deepFreeze([
      buildCategory('pane_visible_dimensions',
        keysFor('pane_width_mm').concat(keysFor('pane_height_mm')), resultsBySlot),
      buildCategory('positive_pressure_source', keysFor('positive_pressure'), resultsBySlot),
      buildCategory('negative_pressure_source', keysFor('negative_pressure'), resultsBySlot),
      buildCategory('floor_evaluation_height_mapping', mappingKeys, resultsBySlot)
    ]);
  }

  /**
   * floor × zone の各case scopeについて、**そのscopeのfactだけ**を入れた
   * 一時Ledgerを作り、case-level契約（Phase 2F）へ判定を委ねる。
   *
   * ここで `if (W && H && positive && negative && Z)` と書かない。
   * critical factの定義はPhase 2F側にあり、二重に持つと片方だけ変わる。
   */
  function buildCaseReadiness(contract, evaluated, resultsBySlot) {
    var cases = [];
    contract.floors.forEach(function (floor) {
      contract.zones.forEach(function (zone) {
        var wanted = [
          slotKeyFor('pane_width_mm', null),
          slotKeyFor('pane_height_mm', null),
          slotKeyFor('positive_pressure', { floor: floor }),
          slotKeyFor('negative_pressure', { zone: zone }),
          slotKeyFor('evaluation_height', { floor: floor })
        ];
        var ledger = Ledger.createLedger();
        wanted.forEach(function (slotKey) {
          if (resultsBySlot[slotKey].closureStatus !== 'READY_CANDIDATE') {
            return;
          }
          ledger.add(entrySpecFor(evaluated[slotKey].observation));
        });

        var promotion = Ledger.evaluateCasePromotion(
          ledger, 'glass_pane', { claimsCalculationProvenance: true });

        // 既存APIの `verified` をそのまま外へ出さない。
        // あれはPhase 2J以前からある名前で、ここでの意味は
        // 「候補として揃っているか」であって「いま検証済みか」ではない。
        cases.push(Evidence.deepFreeze({
          scope: { floor: floor, zone: zone },
          readinessStatus: promotion.verified === true ? 'READY_CANDIDATE' : 'BLOCKED',
          requiredFactKeys: promotion.requiredFactKeys.slice(),
          missingFactKeys: promotion.missing.slice(),
          reasons: promotion.reasons.slice(),
          consideredSlotKeys: wanted
        }));
      });
    });
    return Evidence.deepFreeze(cases);
  }

  // ============================================================
  // Wave 3: Layer 3 — project closure と Promotion Candidate
  // ============================================================

  function buildPromotionCandidate(projectId, slots, resultsBySlot, evaluated, summary) {
    var proposedFacts = slots.map(function (slot) {
      var r = resultsBySlot[slot.slotKey];
      var o = evaluated[slot.slotKey].observation;
      return {
        slotKey: slot.slotKey,
        factKey: slot.factKey,
        scope: slot.scope,
        observedValue: o.observedValue,
        unit: o.unit,
        evidence: {
          level: o.evidence.level,
          checkedAt: o.evidence.checkedAt,
          publicDescription: o.evidence.publicDescription,
          privateReferenceAvailable: o.evidence.privateReferenceAvailable
        },
        sourceReference: o.sourceReference,
        reconciliationApplicable: r.reconciliationApplicable,
        reconciliationStatus: r.reconciliationStatus,
        // 呼び出し側は供給できない。canonical gateを通った後に本moduleが生成する。
        // `verificationStatus` という名前は使わない（現在の真実と読まれるため）。
        proposedVerificationStatus: 'verified'
      };
    });

    var candidate = Evidence.deepFreeze({
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      candidateType: CANDIDATE_TYPE,
      projectId: projectId,
      candidateStatus: 'READY_CANDIDATE',
      proposedFacts: proposedFacts,
      gateSummary: {
        requiredSlotCount: summary.requiredSlotCount,
        readySlotCount: summary.readySlotCount,
        categoryCount: summary.categoryCount,
        readyCategoryCount: summary.readyCategoryCount,
        caseScopeCount: summary.caseScopeCount,
        readyCaseScopeCount: summary.readyCaseScopeCount,
        allCriticalFactsSatisfied: true
      },
      notApplied: true,
      currentConfigMutated: false,
      warning: CANDIDATE_WARNING
    });
    PROMOTION_CANDIDATES.add(candidate);
    return candidate;
  }

  /**
   * Closure Evaluation の入口。
   *
   * 呼び出し側は projectId と生のObservation配列だけを渡す。
   * current値・reconciliation結果・case readiness・project readiness・
   * promotion status を**呼び出し側から受け取らない**。
   * 現在の真実は必ずregistry経由で本moduleが引く。
   */
  function evaluateClosure(projectId, observations) {
    // Wave 2 の検証（schema / scope / 単位 / privacy / 構造 / 重複 / 決定性）を
    // 必ず通す。正規化済みObservationを外から受け取る経路は作らない。
    var normalized = normalizeObservationSet(observations, projectId);
    var contract = createProjectScopeContract(projectId);
    var config = Registry.getPreset(projectId);
    var slots = listRequiredObservationSlots(projectId);

    var bySlotKey = Object.create(null);
    normalized.forEach(function (o) {
      bySlotKey[slotKeyFor(o.factKey, o.scope)] = o;
    });

    var evaluated = Object.create(null);
    var resultsBySlot = Object.create(null);
    var factResults = slots.map(function (slot) {
      var one = evaluateFactSlot(slot, bySlotKey[slot.slotKey] || null, config);
      evaluated[slot.slotKey] = one;
      resultsBySlot[slot.slotKey] = one.result;
      return one.result;
    });

    var categoryResults = buildCategories(contract, slots, resultsBySlot);
    var caseReadiness = buildCaseReadiness(contract, evaluated, resultsBySlot);

    var readySlotCount = factResults.filter(function (r) {
      return r.closureStatus === 'READY_CANDIDATE';
    }).length;
    var readyCategoryCount = categoryResults.filter(function (c) {
      return c.status === 'READY_CANDIDATE';
    }).length;
    var readyCaseScopeCount = caseReadiness.filter(function (c) {
      return c.readinessStatus === 'READY_CANDIDATE';
    }).length;

    // 3つの条件はわざと重複させている。
    //   slot全件   : 完全性を守る
    //   category全件: 概念的な閉じを守る（対応関係を含む）
    //   case全件   : Phase 2F の case critical-fact 契約を再利用する
    // 1本のboolean条件に畳むと、どれか1つが壊れたときに黙って通る。
    var allSlotsReady = factResults.length > 0 && readySlotCount === factResults.length;
    var allCategoriesReady = categoryResults.length > 0 &&
      readyCategoryCount === categoryResults.length;
    var allCasesReady = caseReadiness.length > 0 &&
      readyCaseScopeCount === caseReadiness.length;
    var ready = allSlotsReady && allCategoriesReady && allCasesReady;

    var blockerKinds = [];
    factResults.forEach(function (r) {
      r.blockerKinds.forEach(function (k) {
        if (blockerKinds.indexOf(k) === -1) { blockerKinds.push(k); }
      });
    });
    if (!allCasesReady && blockerKinds.indexOf(BLOCKER_KINDS.CASE_NOT_READY) === -1) {
      blockerKinds.push(BLOCKER_KINDS.CASE_NOT_READY);
    }
    blockerKinds.sort();

    var summary = {
      requiredSlotCount: factResults.length,
      readySlotCount: readySlotCount,
      categoryCount: categoryResults.length,
      readyCategoryCount: readyCategoryCount,
      caseScopeCount: caseReadiness.length,
      readyCaseScopeCount: readyCaseScopeCount
    };

    return Evidence.deepFreeze({
      projectId: contract.projectId,
      status: ready ? 'READY_CANDIDATE' : 'BLOCKED',
      blockerKinds: blockerKinds,
      requiredSlotCount: summary.requiredSlotCount,
      readySlotCount: summary.readySlotCount,
      categoryCount: summary.categoryCount,
      readyCategoryCount: summary.readyCategoryCount,
      caseScopeCount: summary.caseScopeCount,
      readyCaseScopeCount: summary.readyCaseScopeCount,
      factResults: factResults,
      categoryResults: categoryResults,
      caseReadiness: caseReadiness,
      // 「だいたい揃っている」candidateは作らない。部分的な進捗は
      // factResults / categoryResults に残るので、失われるものは無い。
      promotionCandidate: ready
        ? buildPromotionCandidate(projectId, slots, resultsBySlot, evaluated, summary)
        : null
    });
  }

  // ============================================================
  // Wave 3: Candidate の一方向export
  // ============================================================

  /**
   * Promotion Candidate を決定的なJSONへ書き出す（**一方向**）。
   *
   * `JSON.stringify(candidate)` をそのまま契約にしない。
   * それでは内部shapeの変更がそのまま出力契約の変更になり、
   * 何を出さないかという約束（private参照・現在config・verifiedCases）を
   * 構造的に守れない。key順も明示する。
   *
   * 読み戻すAPIは**作らない**。candidate JSON が入力経路になった瞬間、
   * 「外から持ち込んだJSON」で trust を上げられるようになる。
   */
  function serializePromotionCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object' || !PROMOTION_CANDIDATES.has(candidate)) {
      throw new Error(
        'serializePromotionCandidate() requires a candidate created by evaluateClosure()'
      );
    }
    var payload = {
      schemaVersion: candidate.schemaVersion,
      candidateType: candidate.candidateType,
      projectId: candidate.projectId,
      candidateStatus: candidate.candidateStatus,
      notApplied: candidate.notApplied,
      currentConfigMutated: candidate.currentConfigMutated,
      warning: candidate.warning,
      gateSummary: {
        requiredSlotCount: candidate.gateSummary.requiredSlotCount,
        readySlotCount: candidate.gateSummary.readySlotCount,
        categoryCount: candidate.gateSummary.categoryCount,
        readyCategoryCount: candidate.gateSummary.readyCategoryCount,
        caseScopeCount: candidate.gateSummary.caseScopeCount,
        readyCaseScopeCount: candidate.gateSummary.readyCaseScopeCount,
        allCriticalFactsSatisfied: candidate.gateSummary.allCriticalFactsSatisfied
      },
      proposedFacts: candidate.proposedFacts.map(function (f) {
        return {
          slotKey: f.slotKey,
          factKey: f.factKey,
          scope: f.scope === null ? null : (
            Object.prototype.hasOwnProperty.call(f.scope, 'floor')
              ? { floor: f.scope.floor } : { zone: f.scope.zone }),
          observedValue: f.observedValue,
          unit: f.unit,
          proposedVerificationStatus: f.proposedVerificationStatus,
          reconciliationApplicable: f.reconciliationApplicable,
          reconciliationStatus: f.reconciliationStatus,
          evidence: {
            level: f.evidence.level,
            checkedAt: f.evidence.checkedAt,
            publicDescription: f.evidence.publicDescription,
            privateReferenceAvailable: f.evidence.privateReferenceAvailable
          },
          sourceReference: f.sourceReference === null ? null : {
            kind: f.sourceReference.kind,
            url: f.sourceReference.url
          }
        };
      })
    };
    return JSON.stringify(payload, null, 2);
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
    normalizeObservationSet: normalizeObservationSet,
    CLOSURE_STATUSES: Evidence.deepFreeze(CLOSURE_STATUSES),
    BLOCKER_KINDS: Evidence.deepFreeze(BLOCKER_KINDS),
    CATEGORY_IDS: Evidence.deepFreeze(CATEGORY_IDS),
    CANDIDATE_SCHEMA_VERSION: CANDIDATE_SCHEMA_VERSION,
    CANDIDATE_TYPE: CANDIDATE_TYPE,
    evaluateClosure: evaluateClosure,
    serializePromotionCandidate: serializePromotionCandidate
  };
});
