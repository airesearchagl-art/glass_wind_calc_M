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
 *
 * Provenance / disclosure モデル（2026-09-17 Provenance Required Fix）:
 *   - verificationStatus（'verified' / 'partially_verified' / 'unverified'）は、
 *     「その値が社内の一次資料で確認できているか」を表す。
 *   - disclosureStatus（identityにのみ導入）は、「この公開リポジトリで
 *     何を開示するか」を表す、verificationStatusとは独立した軸。
 *   - 社内で確認済みであっても、公開リポジトリには内部資料のURL・
 *     ファイルID・非公開のファイル名・その他内部限定の識別子は
 *     記載しない。社内資料との厳密な対応関係は、社内の非公開ドキュメント
 *     （GitHubではない場所）で管理する。
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

    // 案件識別情報そのものは社内基本設計資料で確認済み（verificationStatus:
    // 'verified'）。ただし本リポジトリは public であるため、施主名・建物名称・
    // 設計番号等の具体的な固有名詞や、社内資料のURL・ファイルID・ファイル名は
    // このリポジトリには記載しない（disclosureStatus: 'redacted'）。
    // UI・ドキュメント上は引き続き publicLabel の「みよし案件」を表示する。
    // 社内での厳密な対応関係は、社内の非公開ドキュメントで管理する。
    identity: {
      publicLabel: 'みよし案件',
      verificationStatus: 'verified',
      disclosureStatus: 'redacted',
      sourceDescription: '社内基本設計資料により案件識別情報を確認済み。本リポジトリは公開のため、固有名詞・社内資料参照は開示しない。',
      checkedAt: '2026-09-17'
    },

    dimensions: {
      // W=1250mmは旧アプリの初期値のまま。今回確認できた社内資料の範囲では、
      // ガラス1枚の見付幅Wと直接対応付けられる根拠は確認できていない
      // （社内資料全体に存在しないことまで確認・証明したものではない）。
      defaultW: verifiedValue(
        1250, 'mm', 'unverified',
        'リポジトリ初回リリースコミット（feat: 初版リリース）でindex.htmlの初期値として導入されたのみで、算定根拠の記載なし。今回確認できた社内資料の範囲では、ガラス1枚の見付幅Wと直接対応付けられる根拠は確認できていない（社内資料全体に存在しないことまでは確認・証明していない）。',
        null, null
      ),
      // H=2050mmは旧アプリの初期値。社内の見積資料にはACW（アルミカーテン
      // ウォール）全体高さとしてH=2050mmに類する記録が存在するが、これは
      // ACW全体寸法であり、ガラス1枚の見付高さと同一であることは未確認。
      // pane（ガラス1枚）の実見付寸法が確認できるまでは案件確定寸法として
      // 使用不可。
      defaultH: verifiedValue(
        2050, 'mm', 'unverified',
        'リポジトリ初回リリースコミット（feat: 初版リリース）でindex.htmlの初期値として導入された値。社内の見積資料にはACW（アルミカーテンウォール）全体高さとしてH=2050mmに類する記録が存在するが、これはACW全体寸法でありガラス1枚の見付高さと同一であることは確認できていない。',
        null, null
      ),
      status: 'unverified',
      source: 'リポジトリ初回リリースコミットのindex.html初期値（UNVERIFIED PROJECT DEFAULT）。今回確認できた社内資料の範囲では、Wと直接対応付けられる根拠は確認できていない。HはACW全体寸法として類似値の記録候補があるのみ。',
      note: '特定案件のガラス1枚の確定見付寸法として検証された値ではない。ACW全体寸法とガラス1枚の見付寸法は別物であり、両者の対応関係は未確認。pane実寸が案件図・メーカー資料で確認できるまで、UI上は常に「参考計算 — 案件実寸未確認」として扱い、verifiedへ昇格させないこと。'
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
      // V0・roughnessCategoryは社内基本設計資料（外構の風荷重条件）で直接
      // 確認済み（verificationStatus: 'verified'）。これは「V0/roughness
      // そのものの確認」であり、「各階ガラス風圧プリセット値の確認」とは
      // 別軸（下記 positivePressureByFloor / negativePressureByZone / status
      // を参照）。公開リポジトリのため、社内資料のURL・ファイルID・
      // ファイル名は記載しない。
      V0: verifiedValue(
        34, 'm/s', 'verified',
        '社内基本設計資料の外構風荷重条件で直接確認済み（みよし市の法定値V0=32m/sより高い値を案件側設計条件として採用）。32m/sへの変更は行わないこと。公開リポジトリのため社内資料の識別子は開示しない。',
        null, '2026-09-17'
      ),
      roughnessCategory: verifiedValue(
        'III', null, 'verified',
        '社内基本設計資料の外構風荷重条件で直接確認済み。公開リポジトリのため社内資料の識別子は開示しない。',
        null, '2026-09-17'
      ),
      status: 'partially_verified',
      source: 'みよし案件の設計風圧プリセット値（calc.js旧 POSITIVE_PRESSURE_MIYOSHI_PRESET / NEGATIVE_PRESSURE_MIYOSHI_PRESET より移設）',
      note: 'V0=34m/s・地表面粗度区分IIIは社内基本設計資料で直接確認済み（verified）。ただしこの資料は外構・地表面の風荷重条件を確認したものであり、階別正圧・部位別負圧プリセット値（下記）の元となった外装材/ガラス構造計算書、および各階評価高さZとの厳密な対応付けを直接確認したものではない。したがって階別プリセット値自体はpartially_verifiedのまま維持し、verifiedへは昇格させない。'
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
  // 公開UI・公開ドキュメントが表示してよい案件ラベルの唯一の取得口
  // （disclosure-safeなフィールドのみを経由させる境界）。
  // projectName（社内呼称としての後方互換フィールド）にはフォールバック
  // しない。identity.publicLabel が未設定の場合は、公開表示側の実装が
  // 誤って非公開情報（例: 将来 projectName に内部正式名称が入った場合の
  // その値）を表示してしまわないよう、ここでfail-closedにエラーとする。
  config.getPublicLabel = function () {
    if (!config.identity || !config.identity.publicLabel) {
      throw new Error('Public project label is required.');
    }
    return config.identity.publicLabel;
  };

  return config;
});
