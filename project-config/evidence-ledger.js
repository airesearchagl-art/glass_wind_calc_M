/**
 * project-config/evidence-ledger.js
 *
 * 案件factをfield単位で管理する、案件非依存のEvidence Ledger（Phase 2F）。
 *
 * ── このモジュールが持たないもの ─────────────────────────────
 *
 * 案件名・案件固有値・案件固有のfloorキー・案件固有の圧力値を持たない。
 * それらは project-config/<project>.js 側のfactである。
 *
 * ── Evidence contractは再実装しない ─────────────────────────
 *
 * level / checkedAt / public-safe boundary / promotion gate の正は
 * project-config/evidence.js にある。ここではそれを**解決して使う**だけで、
 * 値域や判定規則を再定義しない（Phase 2F AC-02）。
 *
 * ── privacy boundary（最重要）────────────────────────────────
 *
 * private Evidenceの所在（URL / ファイル名 / ID / パス）を**保持しない**。
 * private Evidenceについて保持するのは `privateReferenceAvailable: true` だけである。
 * public一次資料に限り、構造検証を通したURLを `sourceReference` として保持できる。
 *
 * ── field verified と case verified は別 ─────────────────────
 *
 * あるfactがverifiedでも、caseがverifiedになるとは限らない。
 * caseがverifiedを名乗るには、そのcase typeのcritical fieldが**すべて**
 * promotion gateを通っている必要がある。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式の
 * プレーンJSとして提供する（<script src> と require() の両対応）。
 * ブラウザでは evidence.js の後に読み込むこと。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.EvidenceLedger = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

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
    throw new Error('EvidenceLedger: project-config/evidence.js (ProjectEvidence) is required but not available');
  }

  var Evidence = resolveEvidenceContract();

  /**
   * 許可されたfact key（§8 / Wave 2H Required Fix B）。
   *
   * **allowlistであり推奨一覧ではない。** ここに無いkeyは拒否する。
   *
   * 理由: 識別子として形式が正しいだけのkey（`A_102_pdf` / `drawing_123` /
   * `client_code_001` 等）は、private filenameやdrawing numberに由来しうる。
   * public Evidence Ledgerでは、keyそのものが公開情報になるため、
   * 「形式が安全」では不十分で「レビュー済みである」ことを要求する。
   *
   * 新しいgeneric fact typeを足す場合は、このsourceへ意図的に追加し、
   * レビューとテストを通してから使う。runtime/custom登録は本Phaseでは行わない。
   *
   * 案件固有キー・floor固有キーをここに入れない。
   */
  var KNOWN_FACT_KEYS = [
    'pane_width_mm',
    'pane_height_mm',
    'positive_pressure',
    'negative_pressure',
    'evaluation_height',
    'floor_height_mapping',
    'building_height',
    'eaves_height',
    'V0',
    'roughness_category'
  ];

  // 形式検証は allowlist の**補助**であって代替ではない。
  var FACT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

  var RECONCILIATION_STATUSES = ['MATCH', 'MISMATCH', 'INSUFFICIENT_EVIDENCE'];

  function assertFactKey(factKey) {
    if (typeof factKey !== 'string' || !FACT_KEY_PATTERN.test(factKey)) {
      throw new Error(
        'factKey must match ' + FACT_KEY_PATTERN +
          ' (got ' + JSON.stringify(factKey) + '). private filenames/IDs must not be used as keys.'
      );
    }
    // allowlist: レビュー済みのgeneric fact keyのみ（fail closed）
    if (KNOWN_FACT_KEYS.indexOf(factKey) === -1) {
      throw new Error(
        'factKey is not in the reviewed allowlist: ' + JSON.stringify(factKey) +
          '. Allowed: ' + KNOWN_FACT_KEYS.join(', ') +
          '. Add a new generic fact type to KNOWN_FACT_KEYS in source (with review and tests) before using it.'
      );
    }
    return factKey;
  }

  /**
   * Ledger entryを構築する。
   *
   * verified を名乗る場合、promotion gate（privateReference または
   * 構造検証済みpublic primary reference）を通らなければ例外になる。
   *
   * @param {object} spec
   *   {factKey, value, unit, verificationStatus, evidence, sourceReference?}
   */
  function createEntry(spec) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new Error('ledger entry spec must be an object');
    }
    // Phase 2J Wave 1: 継承させたfieldは Object.keys に現れないため、
    // 直下のallowlist検査が**空虚に真**になったまま factKey / value /
    // verificationStatus / evidence のすべてを prototype から読めてしまう。
    // allowlistを意味のある検査にするため、先に構造を閉じる。
    Evidence.assertOrdinaryObject(spec, 'ledger entry spec');
    var allowed = ['factKey', 'value', 'unit', 'verificationStatus', 'evidence', 'sourceReference'];
    var keys = Object.keys(spec);
    for (var i = 0; i < keys.length; i++) {
      if (allowed.indexOf(keys[i]) === -1) {
        throw new Error('ledger entry has an unexpected field: ' + JSON.stringify(keys[i]));
      }
    }

    var factKey = assertFactKey(spec.factKey);
    var label = 'ledger[' + factKey + ']';

    if (spec.value === undefined) {
      throw new Error(label + ': value is required');
    }
    if (spec.unit !== null && typeof spec.unit !== 'string') {
      throw new Error(label + ': unit must be a string or null');
    }

    // §7: 呼び出し側のobjectを保持せず、正規化した**新しい**objectを作る。
    // これにより add() 後に呼び出し側が元objectを書き換えても、
    // Ledgerに保存された内容は変わらない。
    var sourceReference = Evidence.canonicalizeSourceReference(spec.sourceReference, label);

    // F2 (TOCTOU): gateと保存用snapshotが `spec.evidence.*` を**2回**読むと、
    // accessorを仕込んだobjectが「gateには正しい値、snapshotには別の値」を
    // 返せてしまい、gateを通らないevidenceを持つ verified entry が実際に
    // 生成される。呼び出し側のfieldはここで**一度だけ**読んで確定させ、
    // gateにはその確定済みsnapshotを渡す（読み取り順ではなく値を固定する）。
    var specEvidence = spec.evidence;
    if (!specEvidence || typeof specEvidence !== 'object' || Array.isArray(specEvidence)) {
      throw new Error(label + ': evidence must be an object');
    }
    // Phase 2J Wave 1: 下のsnapshotは `specEvidence.level` 等を素のproperty readで
    // 写すため、custom prototype に載せた契約値を**素の literal へ漂白**してしまう。
    // その結果 gate は漂白後のobjectだけを見ることになり、gate側の構造ガードが
    // ここでは効かない。呼び出し側objectを読む**この地点**で閉じる必要がある。
    Evidence.assertOrdinaryObject(specEvidence, label + ': evidence');
    var verificationStatus = spec.verificationStatus;
    var evidence = {
      level: specEvidence.level,
      checkedAt: specEvidence.checkedAt,
      publicDescription: specEvidence.publicDescription,
      privateReferenceAvailable: specEvidence.privateReferenceAvailable
    };

    // Evidence contractとpromotion gateを再利用（再実装しない）。
    // 検査対象は呼び出し側のobjectではなく、上で確定させたsnapshotである。
    Evidence.assertPromotionGate(verificationStatus, evidence, label, {
      sourceReference: sourceReference
    });

    // Wave 2H Required Fix A: 検証を通った後に改変されないよう、
    // 呼び出し側と切り離したcanonical snapshotを深くfreezeして返す。
    // top-levelだけのfreezeでは evidence / sourceReference を書き換えられ、
    // Promotion Gateが「構築時のみのチェック」に退化してしまう。
    return Evidence.deepFreeze({
      factKey: factKey,
      value: spec.value,
      unit: spec.unit === undefined ? null : spec.unit,
      verificationStatus: verificationStatus,
      evidence: evidence,
      sourceReference: sourceReference
    });
  }

  /** factKeyごとに1件のentryを保持するLedger。 */
  function createLedger() {
    var entries = {};

    return {
      /** entryを追加する。既存factKeyの上書きは明示的に拒否する。 */
      add: function (spec) {
        var entry = createEntry(spec);
        if (Object.prototype.hasOwnProperty.call(entries, entry.factKey)) {
          throw new Error('ledger already has an entry for factKey: ' + JSON.stringify(entry.factKey));
        }
        entries[entry.factKey] = entry;
        return entry;
      },
      has: function (factKey) {
        return Object.prototype.hasOwnProperty.call(entries, factKey);
      },
      /** 未登録factKeyは undefined ではなく例外（fail closed）。 */
      get: function (factKey) {
        if (!Object.prototype.hasOwnProperty.call(entries, factKey)) {
          throw new Error('ledger has no entry for factKey: ' + JSON.stringify(factKey));
        }
        return entries[factKey];
      },
      /** 未登録なら null を返す参照（診断表示用）。 */
      find: function (factKey) {
        return Object.prototype.hasOwnProperty.call(entries, factKey) ? entries[factKey] : null;
      },
      listFactKeys: function () {
        return Object.keys(entries).sort();
      },
      /** verified なentryだけを返す。 */
      listVerifiedFactKeys: function () {
        return Object.keys(entries)
          .filter(function (k) { return entries[k].verificationStatus === 'verified'; })
          .sort();
      },
      size: function () {
        return Object.keys(entries).length;
      }
    };
  }

  /**
   * case typeごとのcritical field定義（§9）。
   * 案件固有のfloor値域等はここに置かない。
   */
  var CASE_TYPE_CRITICAL_FACTS = {
    // ガラス/preset case: 寸法と圧力の出どころが揃って初めてcase verified
    glass_pane: ['pane_width_mm', 'pane_height_mm', 'positive_pressure', 'negative_pressure']
  };

  /**
   * 「算定由来のprovenanceを主張する」case は、評価高さの根拠も必要になる。
   * 主張していない場合にまで要求しない。
   */
  var CALCULATION_PROVENANCE_EXTRA_FACTS = ['evaluation_height'];

  /**
   * case-level verified の可否を判定する（§9 / §10）。
   *
   * field verified が揃っていても、**すべての**critical factが
   * promotion gateを通っていなければ case は verified にならない。
   *
   * @returns {{verified: boolean, missing: string[], reasons: string[]}}
   */
  function evaluateCasePromotion(ledger, caseTypeKey, options) {
    // options.claimsCalculationProvenance も素のproperty readである。
    // ここを継承で false 側へ倒されると evaluation_height の要求が静かに消える。
    if (options !== null && options !== undefined) {
      Evidence.assertOrdinaryObject(options, 'evaluateCasePromotion() options');
    }
    options = options || {};
    if (!Object.prototype.hasOwnProperty.call(CASE_TYPE_CRITICAL_FACTS, caseTypeKey)) {
      throw new Error('unknown case type: ' + JSON.stringify(caseTypeKey));
    }
    var required = CASE_TYPE_CRITICAL_FACTS[caseTypeKey].slice();
    if (options.claimsCalculationProvenance === true) {
      required = required.concat(CALCULATION_PROVENANCE_EXTRA_FACTS);
    }

    var missing = [];
    var reasons = [];
    for (var i = 0; i < required.length; i++) {
      var key = required[i];
      var entry = ledger.find(key);
      if (!entry) {
        missing.push(key);
        reasons.push(key + ': no ledger entry');
        continue;
      }
      if (entry.verificationStatus !== 'verified') {
        missing.push(key);
        reasons.push(key + ': verificationStatus is "' + entry.verificationStatus + '", not "verified"');
        continue;
      }
      try {
        Evidence.assertPromotionGate('verified', entry.evidence, 'case.' + key, {
          sourceReference: entry.sourceReference
        });
      } catch (e) {
        missing.push(key);
        reasons.push(key + ': ' + e.message);
      }
    }

    // F12: requiredが空のとき `missing.length === 0` は**空虚に真**になる。
    // critical factが1件も無い状態でcase verifiedを名乗らせない（fail closed）。
    if (required.length === 0) {
      reasons.push('no critical facts are defined for this case type');
    }
    return {
      verified: required.length > 0 && missing.length === 0,
      requiredFactKeys: required,
      missing: missing,
      reasons: reasons
    };
  }

  /**
   * case-level verified を強制する（fail closed）。
   * partial factsからverified caseを作れない。
   */
  function assertCaseCanBeVerified(ledger, caseTypeKey, options) {
    var result = evaluateCasePromotion(ledger, caseTypeKey, options);
    if (!result.verified) {
      throw new Error(
        'case cannot be promoted to verified; unmet critical facts: ' +
          result.missing.join(', ') + ' [' + result.reasons.join(' | ') + ']'
      );
    }
    return true;
  }

  /**
   * preset値とLedgerのEvidenceを突き合わせる read-only diagnostic（§11）。
   *
   * **重要**: 判定順序は「Evidenceが先、数値は後」である。
   * Evidenceがverifiedでなければ、数値が完全一致していても
   * `INSUFFICIENT_EVIDENCE` を返す。数値の一致は検証の代わりにならない
   * （MATCH ≠ verified / AC-12）。
   *
   * presetを変更しない。呼び出し側が変更に使うことも想定しない。
   */
  function reconcileFact(presetValue, ledgerEntry, options) {
    if (options !== null && options !== undefined) {
      Evidence.assertOrdinaryObject(options, 'reconcileFact() options');
    }
    options = options || {};
    var tolerance = typeof options.tolerance === 'number' ? options.tolerance : 0;

    // F5と同じ理由: ledgerEntry は Ledger 由来とは限らず、呼び出し側が組み立てた
    // objectでもありうる。verificationStatus / value / evidence / sourceReference は
    // いずれも素のproperty readなので、継承経路で MATCH を作れてしまう。
    if (ledgerEntry !== null && ledgerEntry !== undefined) {
      Evidence.assertOrdinaryObject(ledgerEntry, 'reconcileFact() ledgerEntry');
    }

    if (!ledgerEntry) {
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        presetValue: presetValue,
        evidenceValue: null,
        difference: null,
        differencePercent: null,
        note: 'Evidenceが存在しないため比較できない'
      };
    }
    if (ledgerEntry.verificationStatus !== 'verified') {
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        presetValue: presetValue,
        evidenceValue: ledgerEntry.value,
        difference: null,
        differencePercent: null,
        note: 'Evidenceの検証状況が "' + ledgerEntry.verificationStatus +
          '" のため、数値が一致していても検証済みとして扱わない'
      };
    }

    // F5: `verificationStatus === 'verified'` という**自己申告**だけを信じると、
    // gateを通っていないduck-typedなobject（あるいはF2で作られた実体）でも
    // MATCHを返してしまう。数値比較に進む前にgateを**この場で再実行**する。
    // Evidenceが先、数値は後という順序はここでも変わらない。
    try {
      Evidence.assertPromotionGate('verified', ledgerEntry.evidence, 'reconcile', {
        sourceReference: ledgerEntry.sourceReference
      });
    } catch (e) {
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        presetValue: presetValue,
        evidenceValue: ledgerEntry.value,
        difference: null,
        differencePercent: null,
        note: 'verificationStatusは "verified" だがpromotion gateを通らないため、' +
          '数値が一致していても検証済みとして扱わない: ' + e.message
      };
    }

    if (typeof presetValue !== 'number' || typeof ledgerEntry.value !== 'number') {
      return {
        status: presetValue === ledgerEntry.value ? 'MATCH' : 'MISMATCH',
        presetValue: presetValue,
        evidenceValue: ledgerEntry.value,
        difference: null,
        differencePercent: null,
        note: '非数値factの比較'
      };
    }

    var difference = ledgerEntry.value - presetValue;
    var differencePercent = presetValue === 0 ? null : (difference / presetValue) * 100;
    var matched = Math.abs(difference) <= tolerance;

    return {
      status: matched ? 'MATCH' : 'MISMATCH',
      presetValue: presetValue,
      evidenceValue: ledgerEntry.value,
      difference: difference,
      differencePercent: differencePercent,
      // MATCHはpresetを昇格させる根拠ではない
      note: matched
        ? 'Evidenceと一致。ただしこの一致自体はpresetの検証状況を変えない'
        : 'Evidenceと不一致。presetを自動変更せずHuman Gateへ回付する'
    };
  }

  // F4: allowlistとcritical fact表をlive mutableで公開すると、
  // `KNOWN_FACT_KEYS.push(...)` でD-012のfail closedが破られ、
  // `CASE_TYPE_CRITICAL_FACTS.glass_pane.length = 0` でcase promotionが
  // 空虚に真になる。定義そのものなので深くfreezeして返す。
  return {
    KNOWN_FACT_KEYS: Evidence.deepFreeze(KNOWN_FACT_KEYS),
    FACT_KEY_PATTERN: FACT_KEY_PATTERN,
    RECONCILIATION_STATUSES: Evidence.deepFreeze(RECONCILIATION_STATUSES),
    CASE_TYPE_CRITICAL_FACTS: Evidence.deepFreeze(CASE_TYPE_CRITICAL_FACTS),
    CALCULATION_PROVENANCE_EXTRA_FACTS: Evidence.deepFreeze(CALCULATION_PROVENANCE_EXTRA_FACTS),
    createEntry: createEntry,
    createLedger: createLedger,
    evaluateCasePromotion: evaluateCasePromotion,
    assertCaseCanBeVerified: assertCaseCanBeVerified,
    reconcileFact: reconcileFact
  };
});
