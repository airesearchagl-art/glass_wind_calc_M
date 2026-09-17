/**
 * project-config/miyoshi.js
 *
 * 「みよし案件」固有のプリセット値（案件入力）と、各値の検証状況
 * （verification metadata）をまとめたモジュール。
 *
 * Phase 2A（案件固有入力と汎用計算コアの分離）の一部として、
 * calc.js に直接埋め込まれていた案件固有定数
 * （POSITIVE_PRESSURE_MIYOSHI_PRESET / NEGATIVE_PRESSURE_MIYOSHI_PRESET /
 * UNVERIFIED_DEFAULT_DIMENSIONS_MM）をこのモジュールへ移設した。
 *
 * 位置づけ:
 *   - calc.js は k1・k2・許容耐風圧計算式・candidate generation/sorting等の
 *     「案件非依存の汎用計算コア」のみを担当する設計へ徐々に移行する。
 *   - 本ファイルは「案件固有プリセット」を担当する。index.html（UI）は
 *     Phase 2A以降、本ファイルを案件プリセットの正（authoritative source）
 *     として参照する。
 *   - calc.js 内に残る POSITIVE_PRESSURE_MIYOSHI_PRESET 等は、既存の
 *     Production挙動・既存テストを壊さないための後方互換用の複製であり、
 *     非推奨（deprecated）。値は本ファイルと完全に一致させること。
 *     将来のフェーズで全消費者が本ファイルへ移行した後、calc.js側は削除予定。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、JSONではなく
 * UMD形式のプレーンJSとして提供する（<script src>でのブラウザグローバル
 * 読み込みと、Node.jsでのrequire()読み込みの両方に対応）。
 * JSONにしなかった理由: index.htmlをブラウザで直接開く（file://）運用を
 * 維持するため。file://からのfetch()はブラウザのセキュリティ制限により
 * 失敗することがあるが、<script src>によるJS読み込みはfile://でも動作する。
 *
 * 重要: 1250×2050mm・各階風圧プリセットの元となった構造計算書・評価高さZは
 * まだ完全には確認できていない。未検証の値を verificationStatus: "verified"
 * へ昇格させてはならない。
 */
(function (global, factory) {
  var mod = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.MiyoshiProjectConfig = mod;
    // Task 5（Generic preset準備）: 将来 miyoshi / manual / 他案件を
    // 切り替えられるよう、projectIdをキーにしたレジストリへも登録しておく。
    // Phase 2AではUI側の切替機能は実装しない（data model / module boundaryの
    // 準備のみ）。
    global.PROJECT_CONFIGS = global.PROJECT_CONFIGS || {};
    global.PROJECT_CONFIGS[mod.projectId] = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 個々の入力値に検証メタデータを付与するヘルパー。
  // verificationStatus: 'verified' | 'partially_verified' | 'unverified'
  function verifiedValue(value, unit, verificationStatus, sourceDescription, sourceReference, checkedAt) {
    return {
      value: value,
      unit: unit,
      verificationStatus: verificationStatus,
      sourceDescription: sourceDescription,
      sourceReference: sourceReference, // 資料名・図面番号等。未確認の場合はnull
      checkedAt: checkedAt // ISO日付文字列。未確認の場合はnull
    };
  }

  var config = {
    projectId: 'miyoshi',
    projectName: 'みよし案件',

    // 施主名・建物名称などの具体的な案件識別情報は、リポジトリ履歴・
    // 設計資料のいずれからも確認できていない。特定の企業名・施設名を
    // 断定的に記載することは事実誤認のリスクがあるため採用していない。
    // 確認が取れ次第、案件担当者がこのフィールドを更新すること。
    identity: {
      status: 'unverified',
      note: '施主名・建物名称等の具体的な案件識別情報は未確認。「みよし案件」はリポジトリ内の既存の呼称をそのまま使ったプレースホルダーであり、確定した固有名詞ではない。'
    },

    dimensions: {
      defaultW: verifiedValue(
        1250, 'mm', 'unverified',
        'リポジトリ初回リリースコミット（feat: 初版リリース）でindex.htmlの初期値として導入されたのみで、算定根拠の記載なし',
        null, null
      ),
      defaultH: verifiedValue(
        2050, 'mm', 'unverified',
        'リポジトリ初回リリースコミット（feat: 初版リリース）でindex.htmlの初期値として導入されたのみで、算定根拠の記載なし',
        null, null
      ),
      status: 'unverified',
      source: 'リポジトリ初回リリースコミットのindex.html初期値（UNVERIFIED PROJECT DEFAULT）',
      note: '特定案件のガラス確定寸法として検証された値ではない。UI上は常に「参考計算 — 案件実寸未確認」として扱い、verifiedへ昇格させないこと。'
    },

    wind: {
      positivePressureByFloor: {
        '1': verifiedValue(1297, 'N/m²', 'partially_verified', 'みよし案件の設計風圧プリセット値。V0=34m/s・地表面粗度区分IIIとの数値整合は確認済み（qbar≈510N/m²）', null, null),
        '2': verifiedValue(1525, 'N/m²', 'partially_verified', '同上', null, null),
        '3': verifiedValue(1695, 'N/m²', 'partially_verified', '同上', null, null),
        'R': verifiedValue(1729, 'N/m²', 'partially_verified', '同上', null, null)
      },
      negativePressureByZone: {
        general: verifiedValue(918, 'N/m²', 'partially_verified', '告示1458号Cpe(-1.8)で逆算するとqbar≈510N/m²相当。V0=34m/s・地表面粗度区分IIIとの数値整合は確認済み', null, null),
        corner: verifiedValue(1122, 'N/m²', 'partially_verified', '告示1458号Cpe(-2.2)で逆算するとqbar≈510N/m²相当。V0=34m/s・地表面粗度区分IIIとの数値整合は確認済み', null, null)
      },
      V0: verifiedValue(34, 'm/s', 'partially_verified', '案件基本設計資料に記載の基準風速。みよし市の法定値V0=32m/sとは異なる値であり、32m/sへの変更は行わないこと', null, null),
      roughnessCategory: verifiedValue('III', null, 'partially_verified', '案件基本設計資料に記載の地表面粗度区分', null, null),
      status: 'partially_verified',
      source: 'みよし案件の設計風圧プリセット値（calc.js旧 POSITIVE_PRESSURE_MIYOSHI_PRESET / NEGATIVE_PRESSURE_MIYOSHI_PRESET より移設）',
      note: 'V0=34m/s・地表面粗度区分IIIとの数値整合（qbar≈510N/m²）は確認済みだが、元の外装材/ガラス構造計算書および各階評価高さZとの厳密な対応付けは未確認。告示から自動算定した値でもない。したがってverifiedへ昇格させないこと。'
    }
  };

  // ------------------------------------------------------------
  // 小さなアクセサ（module boundary）。
  // 呼び出し側（index.html等）が verifiedValue の内部構造を意識せずに
  // 生の数値を取得できるようにする薄いヘルパー。
  // ------------------------------------------------------------
  config.getPositivePressure = function (floorKey) {
    return config.wind.positivePressureByFloor[floorKey].value;
  };
  config.getNegativePressure = function (zoneKey) {
    return config.wind.negativePressureByZone[zoneKey].value;
  };
  config.getDefaultDimensionsMM = function () {
    return { W: config.dimensions.defaultW.value, H: config.dimensions.defaultH.value };
  };
  // 全体としての検証ステータスが 'verified' かどうか（両方とも 'verified' の場合のみtrue）。
  config.isFullyVerified = function () {
    return config.dimensions.status === 'verified' && config.wind.status === 'verified';
  };

  return config;
});
