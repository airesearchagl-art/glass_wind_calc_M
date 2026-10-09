/**
 * project-config/sample.js
 *
 * 公開 browser runtime の標準 built-in となる**合成サンプル**（Phase 2L-B2 / S3-A）。
 *
 * 実案件ではない。公開ツールの動作確認のためだけに作った値で、どの案件の一次資料にも
 * 基づかない。したがって:
 *   - すべての値は verificationStatus: 'unverified'、evidence.level: 'none'、
 *     checkedAt: null、privateReferenceAvailable: false
 *   - verifiedCases は空
 *   - repository の built-in なので、context では sourceKind legacy_builtin / trust built_in_current、
 *     入力 package では registered_preset になるが、built_in_current は「repository に
 *     同梱された current の preset」という意味であって verified ではない
 *
 * 値は tests/s3a-synthetic-runtime.test.js の合成サンプル契約で固定している。
 * 値を変えるのは Human Review を伴う意図した変更である。
 *
 * 静的 HTML / ビルド不要の制約に合わせ、UMD 形式（<script src> と require() の両対応）。
 * ブラウザでは project-config/evidence.js の後、registry.js の前に読み込むこと。
 */
(function (global, factory) {
  var mod = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.SyntheticSampleProjectConfig = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function resolveEvidenceContract() {
    var g = (typeof globalThis !== 'undefined') ? globalThis : null;
    if (g && g.ProjectEvidence) {
      return g.ProjectEvidence;
    }
    if (typeof require === 'function') {
      try {
        return require('./evidence.js');
      } catch (e) {
        /* fallthrough */
      }
    }
    throw new Error(
      'SyntheticSampleProjectConfig: project-config/evidence.js (ProjectEvidence) is required but not available'
    );
  }

  var ProjectEvidence = resolveEvidenceContract();
  var makeEvidence = ProjectEvidence.makeEvidence;
  var verifiedValue = ProjectEvidence.verifiedValue;
  var assertPromotionGate = ProjectEvidence.assertPromotionGate;
  var deepFreeze = ProjectEvidence.deepFreeze;

  var SYNTHETIC_DESCRIPTION = '公開ツール動作確認用の合成サンプル。実案件の一次資料に基づく値ではない。';
  var PRESSURE_UNIT = 'N/m²';

  /** 合成サンプルの Evidence。根拠は無い（level none）ので、検証済みにはなれない。 */
  function syntheticEvidence() {
    return makeEvidence('none', null, SYNTHETIC_DESCRIPTION, false);
  }

  function syntheticValue(value, unit, label) {
    return verifiedValue(value, unit, 'unverified', syntheticEvidence(), label);
  }

  var config = {
    projectId: 'synthetic-sample',
    hasFixedPreset: true,

    identity: {
      publicLabel: '合成サンプル',
      verificationStatus: 'unverified',
      disclosureStatus: 'public',
      evidence: syntheticEvidence()
    },

    dimensions: {
      mode: 'sample_default',
      defaultW: syntheticValue(900, 'mm', 'dimensions.defaultW'),
      defaultH: syntheticValue(1800, 'mm', 'dimensions.defaultH'),
      status: 'unverified'
    },

    wind: {
      positivePressureByFloor: {
        '1': syntheticValue(1110, PRESSURE_UNIT, 'wind.positivePressureByFloor.1'),
        '2': syntheticValue(1330, PRESSURE_UNIT, 'wind.positivePressureByFloor.2'),
        '4': syntheticValue(1550, PRESSURE_UNIT, 'wind.positivePressureByFloor.4'),
        'R': syntheticValue(1770, PRESSURE_UNIT, 'wind.positivePressureByFloor.R')
      },
      negativePressureByZone: {
        general: syntheticValue(870, PRESSURE_UNIT, 'wind.negativePressureByZone.general'),
        corner: syntheticValue(1190, PRESSURE_UNIT, 'wind.negativePressureByZone.corner')
      },
      V0: syntheticValue(30, 'm/s', 'wind.V0'),
      roughnessCategory: syntheticValue('II', null, 'wind.roughnessCategory'),
      status: 'unverified'
    },

    verifiedCases: []
  };

  config.getPositivePressure = function (floorKey) {
    return config.wind.positivePressureByFloor[floorKey].value;
  };
  config.getNegativePressure = function (zoneKey) {
    return config.wind.negativePressureByZone[zoneKey].value;
  };
  config.getDefaultDimensionsMM = function () {
    return { W: config.dimensions.defaultW.value, H: config.dimensions.defaultH.value };
  };
  config.isFullyVerified = function () {
    return false;
  };
  config.getPublicLabel = function () {
    if (!config.identity || !config.identity.publicLabel) {
      throw new Error('Public project label is required.');
    }
    return config.identity.publicLabel;
  };

  /** すべての値の Evidence を canonical gate に通す（読み込み時にも 1 度実行する）。 */
  config.validateAllEvidence = function () {
    var violations = [];
    function check(label, entry) {
      try {
        assertPromotionGate(entry.verificationStatus, entry.evidence, label, {
          sourceReference: entry.sourceReference || null
        });
      } catch (e) {
        violations.push({ label: label, message: e.message });
      }
    }
    check('identity', config.identity);
    check('dimensions.defaultW', config.dimensions.defaultW);
    check('dimensions.defaultH', config.dimensions.defaultH);
    check('wind.V0', config.wind.V0);
    check('wind.roughnessCategory', config.wind.roughnessCategory);
    Object.keys(config.wind.positivePressureByFloor).forEach(function (f) {
      check('wind.positivePressureByFloor.' + f, config.wind.positivePressureByFloor[f]);
    });
    Object.keys(config.wind.negativePressureByZone).forEach(function (z) {
      check('wind.negativePressureByZone.' + z, config.wind.negativePressureByZone[z]);
    });
    return violations;
  };

  var violations = config.validateAllEvidence();
  if (violations.length > 0) {
    throw new Error('synthetic sample evidence contract violated at module load: ' +
      violations.map(function (v) { return v.label + ': ' + v.message; }).join(' | '));
  }

  deepFreeze(config.identity);
  deepFreeze(config.dimensions);
  deepFreeze(config.wind);
  deepFreeze(config.verifiedCases);

  return config;
});
