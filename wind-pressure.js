/**
 * wind-pressure.js
 *
 * 帳壁ガラスの設計風圧を、入力値・式・係数・中間値・最終値まで追跡可能に
 * 算定する汎用コア（Phase 2E）。
 *
 * 案件非依存。特定案件の値・名称・provenance・presetを一切持たない。
 * GlassCalc（calc.js）は風圧式を知らず、本モジュールは板ガラス強度式を知らない。
 *
 * ── 実装根拠（Research Gate / Phase 2E Wave 1）────────────────────────
 *
 * 採用根拠は Run Artifact の EVIDENCE.md §4 に記録している。
 * provenance: human_supplied_primary_evidence
 *   （Humanが本実行環境の外部で public primary / official-industry sources に対して
 *     独立に確認した内容。本実行環境が当該文書を取得したわけではない。）
 *
 *   Source A: 国土交通省「風圧力を算定する基準（地表面粗度区分）の合理化
 *             （平成12年建設省告示第1454号）」
 *   Source B: 建築研究所（告示1454号 / 1458号 本文再掲）
 *   Source C: 板硝子協会「帳壁に用いる板ガラスの風圧力計算法 /
 *             4辺支持板ガラスの耐風圧強度計算法」  ← 帳壁ガラスの主根拠
 *
 * 一次資料で確認できなかった規則は実装しない。特に:
 *   - 住所・都市計画区域からの粗度区分の自動判定 → 実装しない（明示入力）
 *   - 階ラベルからの評価高さZ・建物高さHの推定   → 実装しない（明示入力）
 *   - 自治体別V0 lookup                          → 実装しない（明示入力 / D-007）
 *   - 図面からの隅角部自動判定                    → 実装しない（明示入力）
 *
 * ── 単位（AC-13）──────────────────────────────────────────────────
 *
 *   V0, 速度      : m/s
 *   H, Z, b, Zb, ZG : m
 *   qBar, 風圧 W  : N/m²
 *   α, Er, Cpe, Gpe, Cf, y : 無次元
 *
 * 暗黙の単位変換は行わない。入力はすべて上記単位で受け取る。
 *
 * ── 丸め（AC-03）──────────────────────────────────────────────────
 *
 * 内部計算では一切丸めない。丸めは表示層（index.html）の責務。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式の
 * プレーンJSとして提供する（<script src> と require() の両対応）。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.WindPressure = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  // ------------------------------------------------------------
  // 定数（EVIDENCE.md §4 のとおり）
  // ------------------------------------------------------------

  /**
   * 地表面粗度区分ごとの Zb / ZG / α（告示1454号）。
   *
   * 注意: 板ガラスでは区分IVのとき区分IIIの数値を用いる（Source C）。
   * IV行は出典の表として保持するが、板ガラス計算では到達しない（D-006）。
   */
  var ROUGHNESS_PARAMETERS = {
    I:   { Zb: 5,  ZG: 250, alpha: 0.10 },
    II:  { Zb: 5,  ZG: 350, alpha: 0.15 },
    III: { Zb: 5,  ZG: 450, alpha: 0.20 },
    IV:  { Zb: 10, ZG: 550, alpha: 0.27 }
  };

  var ROUGHNESS_CATEGORIES = ['I', 'II', 'III', 'IV'];

  /**
   * 板ガラスの粗度区分読み替え（Source C）。
   * 「板ガラスでは、地表面粗度区分が IV の場合、区分 III の数値を用いる」
   */
  var GLASS_ROUGHNESS_SUBSTITUTION = { IV: 'III' };

  /**
   * 正圧側 Gpe の端点値（Source C）。
   * Z <= 5 と Z >= 40 を端点とし、その間は線形補間する。
   *
   * 区分IVは読み替え後のIIIを用いるため、ここにIV行は持たない。
   */
  var GPE_POSITIVE_ENDPOINTS = {
    I:   { atZ5: 2.2, atZ40: 1.9 },
    II:  { atZ5: 2.6, atZ40: 2.1 },
    III: { atZ5: 3.1, atZ40: 2.3 }
  };

  var GPE_Z_LOW_M = 5;
  var GPE_Z_HIGH_M = 40;

  /**
   * 負圧側 外圧ピーク係数（Cpe × Gpe が一体の表値、Source C）。
   * H <= 45 と H >= 60 を端点とし、その間は線形補間する。
   */
  var NEGATIVE_PEAK_ENDPOINTS = {
    atH45: { general: -1.8, corner: -2.2 },
    atH60: { general: -2.4, corner: -3.0 }
  };

  var NEGATIVE_H_LOW_M = 45;
  var NEGATIVE_H_HIGH_M = 60;

  /**
   * 内圧ピーク係数 CpiGpi（Source C）。
   * 外圧の符号ごとに値が異なる。
   */
  var INTERNAL_PEAK_COEFFICIENTS = {
    closed: { whenExternalPositive: -0.5, whenExternalNegative: 0 },
    open:   { whenExternalPositive: -1.2, whenExternalNegative: 1.5 }
  };

  var BUILDING_TYPES = ['closed', 'open'];
  var ZONES = ['general', 'corner'];

  /** 正圧側 Cpe が 1.0 固定となる H の上限（Source C）。 */
  var CPE_POSITIVE_FLAT_H_MAX_M = 5;
  /** 正圧側 Cpe で Z の代わりに 5 を用いる Z の上限（Source C）。 */
  var CPE_POSITIVE_Z_FLOOR_M = 5;

  /** Er 式の係数（告示1454号 / Source C）。 */
  var ER_COEFFICIENT = 1.7;
  /** 平均速度圧式の係数（Source C）。 */
  var QBAR_COEFFICIENT = 0.6;

  // 算定基準（D-005）
  var BASIS_NOTIFICATION_BASELINE = 'notification_baseline';
  var BASIS_ITAKYO_RECOMMENDED = 'itakyo_recommended';
  var CALCULATION_BASES = [BASIS_NOTIFICATION_BASELINE, BASIS_ITAKYO_RECOMMENDED];

  /**
   * 再現期間係数 y（板硝子協会推奨。告示の最低基準ではない）。
   * notification_baseline では常に 1.00 を用い、この表は参照しない。
   */
  var RECURRENCE_MULTIPLIERS = {
    50: 1.00,
    100: 1.07,
    200: 1.15,
    300: 1.19,
    500: 1.25
  };

  var RECURRENCE_YEARS = [50, 100, 200, 300, 500];

  /** notification_baseline の再現期間係数（固定）。 */
  var BASELINE_RECURRENCE_MULTIPLIER = 1.00;

  // ------------------------------------------------------------
  // 入力検証（AC-12: fail closed）
  // ------------------------------------------------------------

  /**
   * V0 の保守的なhard bounds。
   *
   * 告示1454号のV0は国土交通大臣が定める範囲（おおむね30〜46 m/s）だが、
   * 本ツールは全国のV0表を持たない（D-007）ため、
   * 「明らかに入力誤り」を弾くための広めの範囲として設定する。
   * この範囲内であることはV0がverifiedであることを意味しない。
   */
  var V0_MIN_MS = 1;
  var V0_MAX_MS = 200;

  /** 高さ系の保守的な上限。実在しない値・入力誤りを弾くためのもの。 */
  var HEIGHT_MAX_M = 2000;

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function requireFiniteNumber(value, label) {
    if (typeof value !== 'number') {
      throw new Error(label + ' must be a number (got ' + typeof value + ')');
    }
    if (isNaN(value)) {
      throw new Error(label + ' must not be NaN');
    }
    if (!isFinite(value)) {
      throw new Error(label + ' must be finite (got ' + value + ')');
    }
    return value;
  }

  function requirePositive(value, label) {
    requireFiniteNumber(value, label);
    if (value <= 0) {
      throw new Error(label + ' must be > 0 (got ' + value + ')');
    }
    return value;
  }

  function requireInRange(value, label, min, max, unit) {
    requireFiniteNumber(value, label);
    if (value < min || value > max) {
      throw new Error(
        label + ' must be within [' + min + ', ' + max + '] ' + unit + ' (got ' + value + ')'
      );
    }
    return value;
  }

  function requireOneOf(value, label, allowed) {
    if (allowed.indexOf(value) === -1) {
      throw new Error(
        label + ' must be one of ' + JSON.stringify(allowed) + ' (got ' + JSON.stringify(value) + ')'
      );
    }
    return value;
  }

  // ------------------------------------------------------------
  // 個別の算定ステップ（それぞれ単体でテスト可能にする）
  // ------------------------------------------------------------

  /**
   * 板ガラス計算に用いる粗度区分を解決する。
   *
   * 入力区分を書き換えず、計算用区分を別に返す（D-006）。
   * 区分IVのときのみ III へ読み替わる。
   */
  function resolveGlassRoughness(inputCategory) {
    requireOneOf(inputCategory, 'roughnessCategory', ROUGHNESS_CATEGORIES);
    var substituted = Object.prototype.hasOwnProperty.call(
      GLASS_ROUGHNESS_SUBSTITUTION, inputCategory
    );
    var calculationCategory = substituted
      ? GLASS_ROUGHNESS_SUBSTITUTION[inputCategory]
      : inputCategory;
    var params = ROUGHNESS_PARAMETERS[calculationCategory];
    return {
      inputRoughnessCategory: inputCategory,
      calculationRoughnessCategory: calculationCategory,
      substitutionApplied: substituted,
      substitutionNote: substituted
        ? '板ガラスでは地表面粗度区分IVのとき区分IIIの数値を用いる（板硝子協会）'
        : null,
      Zb: params.Zb,
      ZG: params.ZG,
      alpha: params.alpha
    };
  }

  /**
   * 建築物の高さと軒の高さの平均 H [m]。
   *
   * 階ラベルからは決して導出しない（AC-11）。
   */
  function calcMeanHeightH(buildingHeightM, eavesHeightM) {
    requirePositive(buildingHeightM, 'buildingHeightM');
    requirePositive(eavesHeightM, 'eavesHeightM');
    requireInRange(buildingHeightM, 'buildingHeightM', 0, HEIGHT_MAX_M, 'm');
    requireInRange(eavesHeightM, 'eavesHeightM', 0, HEIGHT_MAX_M, 'm');
    if (eavesHeightM > buildingHeightM) {
      throw new Error(
        'eavesHeightM must not exceed buildingHeightM (got eaves ' +
          eavesHeightM + ' m > building ' + buildingHeightM + ' m)'
      );
    }
    return (buildingHeightM + eavesHeightM) / 2;
  }

  /**
   * 平均風速の鉛直分布を示す係数 Er。
   *
   *   HPrime = max(H, Zb)
   *   Er     = 1.7 × (HPrime / ZG)^α
   */
  function calcEr(H, Zb, ZG, alpha) {
    requirePositive(H, 'H');
    var HPrime = Math.max(H, Zb);
    return {
      HPrime: HPrime,
      clampedToZb: H <= Zb,
      Er: ER_COEFFICIENT * Math.pow(HPrime / ZG, alpha)
    };
  }

  /**
   * 平均速度圧 qBar [N/m²]。
   *
   *   qBar = 0.6 × Er² × (V0 × y)²
   */
  function calcMeanVelocityPressure(Er, V0, recurrenceMultiplier) {
    requireFiniteNumber(Er, 'Er');
    requireFiniteNumber(V0, 'V0');
    requireFiniteNumber(recurrenceMultiplier, 'recurrenceMultiplier');
    var designSpeed = V0 * recurrenceMultiplier;
    return QBAR_COEFFICIENT * Er * Er * designSpeed * designSpeed;
  }

  /**
   * 正圧側 外圧係数 Cpe。
   *
   *   H <= 5              -> 1.0
   *   H >  5 かつ Z <= 5  -> (5 / H)^(2α)
   *   H >  5 かつ Z >  5  -> (Z / H)^(2α)
   */
  function calcCpePositive(H, Z, alpha) {
    requirePositive(H, 'H');
    requirePositive(Z, 'evaluationHeightM');
    if (H <= CPE_POSITIVE_FLAT_H_MAX_M) {
      return { Cpe: 1.0, branch: 'H<=5' };
    }
    if (Z <= CPE_POSITIVE_Z_FLOOR_M) {
      return {
        Cpe: Math.pow(CPE_POSITIVE_Z_FLOOR_M / H, 2 * alpha),
        branch: 'H>5,Z<=5'
      };
    }
    return { Cpe: Math.pow(Z / H, 2 * alpha), branch: 'H>5,Z>5' };
  }

  /** 2点間の線形補間。端点の外側はクランプせず、呼び出し側で範囲を保証する。 */
  function interpolateLinear(x, x0, y0, x1, y1) {
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }

  /**
   * 正圧側 ガスト係数 Gpe。
   *
   *   Z <= 5  -> 端点値
   *   Z >= 40 -> 端点値
   *   5 < Z < 40 -> 線形補間
   */
  function calcGpePositive(Z, calculationRoughnessCategory) {
    requirePositive(Z, 'evaluationHeightM');
    if (!Object.prototype.hasOwnProperty.call(
      GPE_POSITIVE_ENDPOINTS, calculationRoughnessCategory
    )) {
      throw new Error(
        'no Gpe endpoints for calculation roughness category ' +
          JSON.stringify(calculationRoughnessCategory)
      );
    }
    var ep = GPE_POSITIVE_ENDPOINTS[calculationRoughnessCategory];
    if (Z <= GPE_Z_LOW_M) {
      return { Gpe: ep.atZ5, branch: 'Z<=5' };
    }
    if (Z >= GPE_Z_HIGH_M) {
      return { Gpe: ep.atZ40, branch: 'Z>=40' };
    }
    return {
      Gpe: interpolateLinear(Z, GPE_Z_LOW_M, ep.atZ5, GPE_Z_HIGH_M, ep.atZ40),
      branch: '5<Z<40 (linear interpolation)'
    };
  }

  /**
   * 負圧側 外圧ピーク係数（Cpe × Gpe 一体の表値）。
   *
   *   H <= 45 -> 端点値
   *   H >= 60 -> 端点値
   *   45 < H < 60 -> 線形補間
   */
  function calcNegativeExternalPeak(H, zone) {
    requirePositive(H, 'H');
    requireOneOf(zone, 'zone', ZONES);
    var lo = NEGATIVE_PEAK_ENDPOINTS.atH45[zone];
    var hi = NEGATIVE_PEAK_ENDPOINTS.atH60[zone];
    if (H <= NEGATIVE_H_LOW_M) {
      return { externalPeakCoefficient: lo, branch: 'H<=45' };
    }
    if (H >= NEGATIVE_H_HIGH_M) {
      return { externalPeakCoefficient: hi, branch: 'H>=60' };
    }
    return {
      externalPeakCoefficient:
        interpolateLinear(H, NEGATIVE_H_LOW_M, lo, NEGATIVE_H_HIGH_M, hi),
      branch: '45<H<60 (linear interpolation)'
    };
  }

  /**
   * 内圧ピーク係数 CpiGpi。外圧の符号によって値が変わる。
   */
  function calcInternalPeak(buildingType, externalIsPositive) {
    requireOneOf(buildingType, 'buildingType', BUILDING_TYPES);
    var t = INTERNAL_PEAK_COEFFICIENTS[buildingType];
    return externalIsPositive ? t.whenExternalPositive : t.whenExternalNegative;
  }

  /**
   * ピーク風力係数 Cf = 外圧ピーク係数 − 内圧ピーク係数。
   * 正圧・負圧を別々に算定し、符号の意味を統合しない。
   */
  function calcPeakForceCoefficient(externalPeak, internalPeak) {
    requireFiniteNumber(externalPeak, 'externalPeakCoefficient');
    requireFiniteNumber(internalPeak, 'internalPeakCoefficient');
    return externalPeak - internalPeak;
  }

  /**
   * 隅角部の帯幅。
   *
   *   aPrime      = min(b, 2H)
   *   cornerStrip = 0.1 × aPrime
   *
   * 図面からのpoint-in-zone自動判定は行わない（zoneは明示入力）。
   */
  function calcCornerGeometry(buildingShortSideM, H) {
    requirePositive(buildingShortSideM, 'buildingShortSideM');
    requireInRange(buildingShortSideM, 'buildingShortSideM', 0, HEIGHT_MAX_M, 'm');
    requirePositive(H, 'H');
    var aPrime = Math.min(buildingShortSideM, 2 * H);
    return { aPrime: aPrime, cornerStripWidth: 0.1 * aPrime };
  }

  /**
   * 算定基準と再現期間係数を解決する（D-005）。
   *
   * notification_baseline: y = 1.00 固定。recurrenceYears は受け付けない。
   * itakyo_recommended:    y を 50/100/200/300/500年 から明示選択。
   *
   * y > 1.00 へ暗黙にdefaultすることはない。
   */
  function resolveBasis(basis, recurrenceYears) {
    requireOneOf(basis, 'basis.type', CALCULATION_BASES);
    if (basis === BASIS_NOTIFICATION_BASELINE) {
      if (recurrenceYears !== undefined && recurrenceYears !== null) {
        throw new Error(
          'notification_baseline does not take recurrenceYears ' +
            '(the recurrence-period multiplier is an industry recommendation, ' +
            'not part of the notification baseline); got ' + JSON.stringify(recurrenceYears)
        );
      }
      return {
        type: BASIS_NOTIFICATION_BASELINE,
        recurrenceYears: null,
        recurrenceMultiplier: BASELINE_RECURRENCE_MULTIPLIER,
        note: '告示1458号系算定（再現期間による割増を適用しない）'
      };
    }
    if (recurrenceYears === undefined || recurrenceYears === null) {
      throw new Error(
        'itakyo_recommended requires an explicit recurrenceYears ' +
          '(one of ' + JSON.stringify(RECURRENCE_YEARS) + '); ' +
          'it never defaults to a multiplier greater than 1.00'
      );
    }
    if (RECURRENCE_YEARS.indexOf(recurrenceYears) === -1) {
      throw new Error(
        'recurrenceYears must be one of ' + JSON.stringify(RECURRENCE_YEARS) +
          ' (got ' + JSON.stringify(recurrenceYears) + ')'
      );
    }
    return {
      type: BASIS_ITAKYO_RECOMMENDED,
      recurrenceYears: recurrenceYears,
      recurrenceMultiplier: RECURRENCE_MULTIPLIERS[recurrenceYears],
      note: '板硝子協会推奨による帳壁ガラス設計風圧（再現期間 ' + recurrenceYears + ' 年）'
    };
  }

  // ------------------------------------------------------------
  // Wind Pressure Trace
  // ------------------------------------------------------------

  var ALLOWED_INPUT_KEYS = [
    'V0', 'roughnessCategory', 'buildingHeightM', 'eavesHeightM',
    'evaluationHeightM', 'buildingType', 'zone', 'buildingShortSideM',
    'basis', 'recurrenceYears'
  ];

  function rejectUnknownInputKeys(input) {
    var keys = Object.keys(input);
    for (var i = 0; i < keys.length; i++) {
      if (ALLOWED_INPUT_KEYS.indexOf(keys[i]) === -1) {
        throw new Error('unknown wind input field: ' + JSON.stringify(keys[i]));
      }
    }
  }

  /**
   * 帳壁ガラスの設計風圧を算定し、追跡可能なTraceを返す。
   *
   * 中間値は丸めない（AC-03）。丸めは表示層の責務。
   *
   * 検証状態の分離（AC-04）:
   *   式は一次資料でverifiedだが、ユーザーが入力したV0 / 粗度区分 / 高さ / Z /
   *   建物種別 / zone / b はverifiedにならない。
   */
  function calculateWindPressure(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('calculateWindPressure(): input object is required');
    }
    rejectUnknownInputKeys(input);

    // --- 基準 ---
    var basis = resolveBasis(input.basis, input.recurrenceYears);

    // --- 入力検証 ---
    var V0 = requireInRange(input.V0, 'V0', V0_MIN_MS, V0_MAX_MS, 'm/s');
    var Z = requirePositive(input.evaluationHeightM, 'evaluationHeightM');
    requireInRange(Z, 'evaluationHeightM', 0, HEIGHT_MAX_M, 'm');
    var buildingType = requireOneOf(input.buildingType, 'buildingType', BUILDING_TYPES);
    var zone = requireOneOf(input.zone, 'zone', ZONES);

    // --- 正規化 ---
    var roughness = resolveGlassRoughness(input.roughnessCategory);
    var H = calcMeanHeightH(input.buildingHeightM, input.eavesHeightM);
    var er = calcEr(H, roughness.Zb, roughness.ZG, roughness.alpha);
    var qBar = calcMeanVelocityPressure(er.Er, V0, basis.recurrenceMultiplier);

    // --- 正圧 ---
    var cpe = calcCpePositive(H, Z, roughness.alpha);
    var gpe = calcGpePositive(Z, roughness.calculationRoughnessCategory);
    var externalPositive = cpe.Cpe * gpe.Gpe;
    var internalForPositive = calcInternalPeak(buildingType, true);
    var cfPositive = calcPeakForceCoefficient(externalPositive, internalForPositive);
    var positivePressure = qBar * cfPositive;

    // --- 負圧 ---
    var neg = calcNegativeExternalPeak(H, zone);
    var internalForNegative = calcInternalPeak(buildingType, false);
    var cfNegative = calcPeakForceCoefficient(neg.externalPeakCoefficient, internalForNegative);
    var negativePressure = qBar * cfNegative;

    // --- 設計風圧（既存contract） ---
    var designPressure = Math.max(Math.abs(positivePressure), Math.abs(negativePressure));

    // --- 隅角部の幾何（buildingShortSideMが与えられたときのみ） ---
    var geometry = null;
    if (input.buildingShortSideM !== undefined && input.buildingShortSideM !== null) {
      geometry = calcCornerGeometry(input.buildingShortSideM, H);
    } else if (zone === 'corner') {
      geometry = null; // 幅を表示できないだけで、係数の算定には影響しない
    }

    var trace = [
      { step: 'basis', formula: 'y = ' + basis.recurrenceMultiplier, value: basis.recurrenceMultiplier, unit: '-', note: basis.note },
      { step: 'meanHeightH', formula: 'H = (buildingHeight + eavesHeight) / 2', value: H, unit: 'm' },
      { step: 'roughness', formula: 'Zb / ZG / α', value: roughness.calculationRoughnessCategory, unit: '-', note: roughness.substitutionNote },
      { step: 'HPrime', formula: "H' = max(H, Zb)", value: er.HPrime, unit: 'm' },
      { step: 'Er', formula: "Er = 1.7 × (H' / ZG)^α", value: er.Er, unit: '-' },
      { step: 'qBar', formula: 'qBar = 0.6 × Er² × (V0 × y)²', value: qBar, unit: 'N/m²' },
      { step: 'CpePositive', formula: 'Cpe (' + cpe.branch + ')', value: cpe.Cpe, unit: '-' },
      { step: 'GpePositive', formula: 'Gpe (' + gpe.branch + ')', value: gpe.Gpe, unit: '-' },
      { step: 'externalPeakPositive', formula: 'Cpe × Gpe', value: externalPositive, unit: '-' },
      { step: 'internalPeakPositive', formula: 'CpiGpi (' + buildingType + ', external +)', value: internalForPositive, unit: '-' },
      { step: 'CfPositive', formula: 'Cf = external − internal', value: cfPositive, unit: '-' },
      { step: 'positivePressure', formula: 'W+ = qBar × Cf+', value: positivePressure, unit: 'N/m²' },
      { step: 'externalPeakNegative', formula: 'Cpe×Gpe table (' + neg.branch + ', ' + zone + ')', value: neg.externalPeakCoefficient, unit: '-' },
      { step: 'internalPeakNegative', formula: 'CpiGpi (' + buildingType + ', external −)', value: internalForNegative, unit: '-' },
      { step: 'CfNegative', formula: 'Cf = external − internal', value: cfNegative, unit: '-' },
      { step: 'negativePressure', formula: 'W− = qBar × Cf−', value: negativePressure, unit: 'N/m²' },
      { step: 'designPressure', formula: 'max(|W+|, |W−|)', value: designPressure, unit: 'N/m²' }
    ];

    return {
      schemaVersion: SCHEMA_VERSION,
      sourceKind: 'notification_calculation',

      basis: {
        type: basis.type,
        recurrenceYears: basis.recurrenceYears,
        recurrenceMultiplier: basis.recurrenceMultiplier,
        note: basis.note
      },

      inputs: {
        V0: V0,
        inputRoughnessCategory: roughness.inputRoughnessCategory,
        buildingHeightM: input.buildingHeightM,
        eavesHeightM: input.eavesHeightM,
        evaluationHeightM: Z,
        buildingType: buildingType,
        zone: zone,
        buildingShortSideM:
          input.buildingShortSideM === undefined ? null : input.buildingShortSideM
      },

      normalized: {
        meanHeightH: H,
        calculationRoughnessCategory: roughness.calculationRoughnessCategory,
        roughnessSubstitutionApplied: roughness.substitutionApplied,
        roughnessSubstitutionNote: roughness.substitutionNote,
        Zb: roughness.Zb,
        ZG: roughness.ZG,
        alpha: roughness.alpha,
        HPrime: er.HPrime,
        recurrenceMultiplier: basis.recurrenceMultiplier
      },

      positive: {
        Er: er.Er,
        qBar: qBar,
        Cpe: cpe.Cpe,
        CpeBranch: cpe.branch,
        Gpe: gpe.Gpe,
        GpeBranch: gpe.branch,
        externalPeakCoefficient: externalPositive,
        internalPeakCoefficient: internalForPositive,
        Cf: cfPositive,
        pressure: positivePressure
      },

      negative: {
        externalPeakCoefficient: neg.externalPeakCoefficient,
        externalPeakBranch: neg.branch,
        internalPeakCoefficient: internalForNegative,
        Cf: cfNegative,
        pressure: negativePressure
      },

      geometry: geometry,

      designPressure: designPressure,

      trace: trace,

      provenance: {
        // 式は一次資料で検証済み（Human提供Evidence経由）
        formulaVerificationStatus: 'verified_primary_source',
        formulaSource: '板硝子協会「帳壁に用いる板ガラスの風圧力計算法 / 4辺支持板ガラスの耐風圧強度計算法」' +
          '、平成12年建設省告示第1454号（地表面粗度区分・Er）',
        // 入力はユーザーが与えた値であり、式の検証とは無関係にunverified
        inputVerificationStatus: 'user_input_unverified',
        calculationStatus: 'calculated'
      }
    };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    ROUGHNESS_PARAMETERS: ROUGHNESS_PARAMETERS,
    ROUGHNESS_CATEGORIES: ROUGHNESS_CATEGORIES,
    GLASS_ROUGHNESS_SUBSTITUTION: GLASS_ROUGHNESS_SUBSTITUTION,
    GPE_POSITIVE_ENDPOINTS: GPE_POSITIVE_ENDPOINTS,
    GPE_Z_LOW_M: GPE_Z_LOW_M,
    GPE_Z_HIGH_M: GPE_Z_HIGH_M,
    NEGATIVE_PEAK_ENDPOINTS: NEGATIVE_PEAK_ENDPOINTS,
    NEGATIVE_H_LOW_M: NEGATIVE_H_LOW_M,
    NEGATIVE_H_HIGH_M: NEGATIVE_H_HIGH_M,
    INTERNAL_PEAK_COEFFICIENTS: INTERNAL_PEAK_COEFFICIENTS,
    BUILDING_TYPES: BUILDING_TYPES,
    ZONES: ZONES,
    CALCULATION_BASES: CALCULATION_BASES,
    BASIS_NOTIFICATION_BASELINE: BASIS_NOTIFICATION_BASELINE,
    BASIS_ITAKYO_RECOMMENDED: BASIS_ITAKYO_RECOMMENDED,
    RECURRENCE_MULTIPLIERS: RECURRENCE_MULTIPLIERS,
    RECURRENCE_YEARS: RECURRENCE_YEARS,
    ER_COEFFICIENT: ER_COEFFICIENT,
    QBAR_COEFFICIENT: QBAR_COEFFICIENT,
    V0_MIN_MS: V0_MIN_MS,
    V0_MAX_MS: V0_MAX_MS,
    HEIGHT_MAX_M: HEIGHT_MAX_M,

    resolveGlassRoughness: resolveGlassRoughness,
    resolveBasis: resolveBasis,
    calcMeanHeightH: calcMeanHeightH,
    calcEr: calcEr,
    calcMeanVelocityPressure: calcMeanVelocityPressure,
    calcCpePositive: calcCpePositive,
    calcGpePositive: calcGpePositive,
    calcNegativeExternalPeak: calcNegativeExternalPeak,
    calcInternalPeak: calcInternalPeak,
    calcPeakForceCoefficient: calcPeakForceCoefficient,
    calcCornerGeometry: calcCornerGeometry,
    calculateWindPressure: calculateWindPressure
  };
});
