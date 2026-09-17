/**
 * project-config/manual.js
 *
 * 「手入力 / Generic」モードの入力契約（input contract）を定義するモジュール。
 *
 * project-config/miyoshi.js が「みよし案件」固有の固定プリセット値
 * （verificationStatus付き）を保持するのに対し、本モジュールは
 * **一切の固定プリセット値を保持しない**。ユーザーがUI上でその場で
 * 入力したW/H・正圧・負圧・extraFactorを検証し、汎用計算コア（calc.js）
 * が要求する形へ変換するだけの薄い層である。
 *
 * Phase 2C（案件プリセットと汎用・手入力モードの安全な共存）:
 *   - project-config/miyoshi.js の値・検証状況は一切変更しない。
 *   - Manual modeにMiyoshiのpressure presetを暗黙適用しない
 *     （本ファイルはmiyoshi.jsを一切requireせず、依存しない）。
 *   - Manual入力値は "user_input" として明確に扱い、本モジュールが
 *     "verified" と主張することはない（AC-03）。
 *     `identity.verificationStatus` は常に 'unverified' であり、
 *     project-config/miyoshi.js の Evidence promotion guardの対象
 *     （'verified' の場合の primary+checkedAt必須）には該当しない
 *     （'unverified' のため）。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、JSONではなく
 * UMD形式のプレーンJSとして提供する（project-config/miyoshi.js と同様、
 * <script src> でのブラウザグローバル読み込みと、Node.js での
 * require() 読み込みの両方に対応する）。
 */
(function (global, factory) {
  var mod = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ManualProjectConfig = mod;
    // project-config/miyoshi.js と同じ PROJECT_CONFIGS レジストリへ
    // 自己登録する（Phase 2A Task 5 / Phase 2C AC-04 の module boundary）。
    global.PROJECT_CONFIGS = global.PROJECT_CONFIGS || {};
    global.PROJECT_CONFIGS[mod.projectId] = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 案件識別情報を持たない（＝案件プリセットではない）ことを明示する。
  // disclosureStatus: 'public' — そもそも非公開情報を一切保持していない。
  var identity = {
    publicLabel: '手入力 (Manual / Generic)',
    verificationStatus: 'unverified',
    disclosureStatus: 'public',
    evidence: {
      level: 'none',
      checkedAt: null,
      publicDescription: 'ユーザーがその場で入力した値。特定の案件プリセットではなく、本ツールによる案件原典との照合は行っていない。',
      privateReferenceAvailable: false
    }
  };

  var config = {
    projectId: 'manual',
    projectName: '手入力 (Manual / Generic)',
    identity: identity,
    // Manual modeは固定のdimensions/windプリセットを持たない
    // （miyoshi.jsのdimensions/windに相当する固定値は存在しない）。
    // 入力値はbuildManualDesignInput()で都度検証・組み立てる。
    hasFixedPreset: false
  };

  // ------------------------------------------------------------
  // 入力バリデーション
  // ------------------------------------------------------------

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function requirePositiveFiniteNumber(value, label) {
    if (!isFiniteNumber(value) || value <= 0) {
      throw new Error(label + ' must be a positive finite number, got: ' + JSON.stringify(value));
    }
    return value;
  }

  function requireFiniteNumber(value, label) {
    if (!isFiniteNumber(value)) {
      throw new Error(label + ' must be a finite number, got: ' + JSON.stringify(value));
    }
    return value;
  }

  // Manual入力（raw: { W, H, positivePressure, negativePressure, extraFactor }）
  // を汎用計算コアへ渡せる形に検証・変換する。
  //
  // 符号の扱い（sign handling、AC-02で明示要求）:
  //   - positivePressure は正の値（例: 1400 N/m²）を想定する。
  //   - negativePressure は負圧（吸引側）を表す値で、慣習的に負の数
  //     （例: -1000 N/m²）として入力されることを想定するが、符号そのものは
  //     強制しない。設計風圧の算定には両者の絶対値のみを用いるため、
  //     符号を取り違えても数値の大小関係が保たれていれば結果は変わらない。
  //   - designP = max(abs(positivePressure), abs(negativePressure))
  //     （告示1458号の「正圧・負圧のうち大きい方を設計風圧とする」考え方を
  //     踏襲。miyoshi.jsのdesignP算定と同じ式）。
  //
  // 戻り値には source: 'user_input' を必ず含め、"verified" 等ツールが
  // 検証したことを意味するフィールドは一切含めない（AC-03）。
  config.buildManualDesignInput = function (raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('buildManualDesignInput(): input must be an object');
    }

    var W = requirePositiveFiniteNumber(raw.W, 'W');
    var H = requirePositiveFiniteNumber(raw.H, 'H');
    var positivePressure = requireFiniteNumber(raw.positivePressure, 'positivePressure');
    var negativePressure = requireFiniteNumber(raw.negativePressure, 'negativePressure');

    var extraFactorInput = raw.extraFactor;
    var extraFactor = (extraFactorInput === undefined || extraFactorInput === null) ? 1.0 : extraFactorInput;
    requirePositiveFiniteNumber(extraFactor, 'extraFactor');

    var designP = Math.max(Math.abs(positivePressure), Math.abs(negativePressure));

    return {
      W: W,
      H: H,
      positivePressure: positivePressure,
      negativePressure: negativePressure,
      designP: designP,
      extraFactor: extraFactor,
      // AC-03: この結果はユーザー入力であり、本ツールが原典と照合して
      // "verified" と主張するものではない。UIはこのフラグに基づいて
      // 「ユーザー入力値 — 案件原典との照合は本ツールでは未実施」という
      // 注記を表示すること。
      source: 'user_input',
      verificationStatus: 'unverified'
    };
  };

  config.getPublicLabel = function () {
    return identity.publicLabel;
  };

  return config;
});
