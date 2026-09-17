/**
 * project-config/miyoshi.js
 *
 * 「みよし案件」固有のプリセット値（案件入力）と、各値の検証状況
 * （verification metadata）・根拠状況（evidence metadata）をまとめた
 * モジュール。
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
 *
 * Evidence model（2026-09-17 Phase 2B）:
 *   - 各入力値は必ず `evidence` を持つ：
 *       { level, checkedAt, publicDescription, privateReferenceAvailable }
 *     - level: 'primary'（一次資料で直接確認）/ 'indirect'（間接的な
 *       数値整合等の状況証拠のみ）/ 'none'（根拠未発見）。
 *     - checkedAt: 確認・レビューを行った日付（ISO文字列）。未実施なら null。
 *     - publicDescription: 公開リポジトリに書いてよい、根拠の説明文。
 *     - privateReferenceAvailable: 社内に（未開示の）参照資料が存在するか
 *       どうかの真偽値のみ。実際のURL・ファイルID・ファイル名は含めない。
 *   - `verificationStatus`（「値がどれだけ検証されているか」）と
 *     `evidence`（「根拠がどの程度あるか」）は別軸として扱う。
 *     ただし verificationStatus が 'verified' の場合は、
 *     evidence.level === 'primary' かつ evidence.checkedAt が
 *     設定されていることを必須とする（assertEvidenceConsistency による
 *     promotion guard。詳細は下記）。
 *   - このリポジトリは public であるため、evidence.publicDescription /
 *     privateReferenceAvailable のいずれにも、Google Drive URL・
 *     Drive file ID・Notion等の非公開URL・SharePoint URL・社内ネットワーク
 *     path・社外秘ファイル名・正式案件名等の非公開固有情報を含めない。
 *     正確な社内参照先は、社内の非公開プロジェクト記録（Notion等）で
 *     別途管理する。
 *
 * Sample default vs verified project case（2026-09-17 Phase 2B, Task 6/5）:
 *   - `dimensions.mode = 'sample_default'` は、現在のW/H既定値が
 *     「本ツールのサンプル既定値」であり「検証済みの案件確定寸法」ではない
 *     ことをコード上で明示するフラグ。
 *   - `verifiedCases`（下記）は、将来ガラス実寸・風圧根拠の両方が確認できた
 *     案件ケースを追加するための配列。現時点では実寸が未確認のため、
 *     架空のverified caseを作らず空配列のまま維持する。
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

  // ============================================================
  // Evidence model（Phase 2B, Task 1/2/7）
  // ============================================================

  var EVIDENCE_LEVELS = ['primary', 'indirect', 'none'];

  // Evidence記述オブジェクトを組み立てるヘルパー。
  // publicDescription / privateReferenceAvailable のみを保持し、
  // 実際のURL・ファイルID・ファイル名は一切保持しない設計とする
  // （呼び出し側がそれらを渡すこと自体を想定していない）。
  function makeEvidence(level, checkedAt, publicDescription, privateReferenceAvailable) {
    if (EVIDENCE_LEVELS.indexOf(level) === -1) {
      throw new Error('Invalid evidence level: ' + level + ' (must be one of ' + EVIDENCE_LEVELS.join(', ') + ')');
    }
    return {
      level: level,
      checkedAt: checkedAt || null,
      publicDescription: publicDescription,
      privateReferenceAvailable: !!privateReferenceAvailable
    };
  }

  // Evidence promotion guard（Task 7）。
  // verificationStatusが'verified'の値は、必ずevidence.level==='primary'
  // かつevidence.checkedAtが設定されていなければならない。
  // すべての値はevidenceそのものを必須とする（'unverified'/'partially_verified'
  // であっても、evidenceオブジェクト自体は必要。中身がlevel:'none'で
  // checkedAt:nullであってもよい）。
  function assertEvidenceConsistency(verificationStatus, evidence, label) {
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('evidence metadata is required' + (label ? ' for ' + label : ''));
    }
    if (EVIDENCE_LEVELS.indexOf(evidence.level) === -1) {
      throw new Error('evidence.level must be one of ' + EVIDENCE_LEVELS.join(', ') + (label ? ' (' + label + ')' : ''));
    }
    if (verificationStatus === 'verified') {
      if (evidence.level !== 'primary') {
        throw new Error(
          'verificationStatus "verified" requires evidence.level === "primary"' + (label ? ' (' + label + ')' : '')
        );
      }
      if (!evidence.checkedAt) {
        throw new Error(
          'verificationStatus "verified" requires evidence.checkedAt to be set' + (label ? ' (' + label + ')' : '')
        );
      }
    }
    return true;
  }

  // 個々の入力値に検証メタデータ・根拠メタデータを付与するヘルパー。
  // verificationStatus: 'verified' | 'partially_verified' | 'unverified'
  function verifiedValue(value, unit, verificationStatus, evidence, label) {
    assertEvidenceConsistency(verificationStatus, evidence, label);
    return {
      value: value,
      unit: unit,
      verificationStatus: verificationStatus,
      evidence: evidence
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
      evidence: makeEvidence(
        'primary',
        '2026-09-17',
        '社内基本設計資料により案件識別情報を確認済み。本リポジトリは公開のため、固有名詞・社内資料参照は開示しない。',
        true
      )
    },

    // 現在のW/H既定値は「本ツールのサンプル既定値」であり、検証済みの案件
    // 確定寸法ではない（Task 6）。UIの「⚠ 参考計算 — 案件実寸未確認」は
    // このモードに対応する。
    dimensions: {
      mode: 'sample_default',

      // W=1250mmは旧アプリの初期値のまま。今回確認できた社内資料の範囲では、
      // ガラス1枚の見付幅Wと直接対応する根拠は見つかっていない
      // （社内資料全体に存在しないことまでは確認・証明していない）。
      defaultW: verifiedValue(
        1250, 'mm', 'unverified',
        makeEvidence(
          'none',
          null,
          'リポジトリ初回リリースコミット（feat: 初版リリース）でindex.htmlの初期値として導入されたのみで、算定根拠の記載なし。今回確認できた社内資料の範囲では、ガラス1枚の見付幅Wと直接対応付けられる根拠は確認できていない（社内資料全体に存在しないことまでは確認・証明していない）。',
          false
        ),
        'dimensions.defaultW'
      ),
      // H=2050mmは旧アプリの初期値。社内の見積資料にはACW（アルミカーテン
      // ウォール）全体高さとしてH=2050mmに類する記録候補が存在するが、これは
      // ACW全体寸法であり、ガラス1枚の見付高さと同一であることは未確認。
      // pane（ガラス1枚）の実見付寸法が確認できるまでは案件確定寸法として
      // 使用不可。
      defaultH: verifiedValue(
        2050, 'mm', 'unverified',
        makeEvidence(
          'indirect',
          null,
          'リポジトリ初回リリースコミット（feat: 初版リリース）でindex.htmlの初期値として導入された値。社内の見積資料にはACW（アルミカーテンウォール）全体高さとしてH=2050mmに類する記録候補が存在するが、これはACW全体寸法でありガラス1枚の見付高さと同一であることは確認できていない。',
          true
        ),
        'dimensions.defaultH'
      ),
      status: 'unverified',
      source: 'リポジトリ初回リリースコミットのindex.html初期値（UNVERIFIED PROJECT DEFAULT / sample_default）。今回確認できた社内資料の範囲では、Wと直接対応付けられる根拠は確認できていない。HはACW全体寸法として類似値の記録候補があるのみ。',
      note: '特定案件のガラス1枚の確定見付寸法として検証された値ではない。ACW全体寸法とガラス1枚の見付寸法は別物であり、両者の対応関係は未確認。pane実寸が案件図・メーカー資料で確認できるまで、UI上は常に「参考計算 — 案件実寸未確認」として扱い、verifiedへ昇格させないこと。'
    },

    wind: {
      positivePressureByFloor: {
        '1': verifiedValue(1297, 'N/m²', 'partially_verified', makeEvidence(
          'indirect', '2026-09-17',
          'みよし案件の設計風圧プリセット値。V0=34m/s・地表面粗度区分IIIとの数値整合は確認済み（qbar≈510N/m²）。元の外装材/ガラス構造計算書・評価高さZとの直接対応は未確認。',
          false
        ), 'wind.positivePressureByFloor.1'),
        '2': verifiedValue(1525, 'N/m²', 'partially_verified', makeEvidence(
          'indirect', '2026-09-17', '同上（1階と同じ数値整合の状況証拠のみ）。', false
        ), 'wind.positivePressureByFloor.2'),
        '3': verifiedValue(1695, 'N/m²', 'partially_verified', makeEvidence(
          'indirect', '2026-09-17', '同上（1階と同じ数値整合の状況証拠のみ）。', false
        ), 'wind.positivePressureByFloor.3'),
        'R': verifiedValue(1729, 'N/m²', 'partially_verified', makeEvidence(
          'indirect', '2026-09-17', '同上（1階と同じ数値整合の状況証拠のみ）。', false
        ), 'wind.positivePressureByFloor.R')
      },
      negativePressureByZone: {
        general: verifiedValue(918, 'N/m²', 'partially_verified', makeEvidence(
          'indirect', '2026-09-17',
          '告示1458号Cpe(-1.8)で逆算するとqbar≈510N/m²相当。V0=34m/s・地表面粗度区分IIIとの数値整合は確認済み。元の外装材/ガラス構造計算書・評価高さZとの直接対応は未確認。',
          false
        ), 'wind.negativePressureByZone.general'),
        corner: verifiedValue(1122, 'N/m²', 'partially_verified', makeEvidence(
          'indirect', '2026-09-17',
          '告示1458号Cpe(-2.2)で逆算するとqbar≈510N/m²相当。V0=34m/s・地表面粗度区分IIIとの数値整合は確認済み。元の外装材/ガラス構造計算書・評価高さZとの直接対応は未確認。',
          false
        ), 'wind.negativePressureByZone.corner')
      },
      // V0・roughnessCategoryは社内基本設計資料（外構の風荷重条件）で直接
      // 確認済み（verificationStatus: 'verified'、evidence.level: 'primary'）。
      // これは「V0/roughnessそのものの確認」であり、「各階ガラス風圧プリセット
      // 値の確認」とは別軸（上記 positivePressureByFloor / negativePressureByZone
      // / 下記 status を参照）。公開リポジトリのため、社内資料のURL・
      // ファイルID・ファイル名は記載しない。
      V0: verifiedValue(
        34, 'm/s', 'verified',
        makeEvidence(
          'primary', '2026-09-17',
          '社内基本設計資料の外構風荷重条件で直接確認済み（みよし市の法定値V0=32m/sより高い値を案件側設計条件として採用）。32m/sへの変更は行わないこと。公開リポジトリのため社内資料の識別子は開示しない。',
          true
        ),
        'wind.V0'
      ),
      roughnessCategory: verifiedValue(
        'III', null, 'verified',
        makeEvidence(
          'primary', '2026-09-17',
          '社内基本設計資料の外構風荷重条件で直接確認済み。公開リポジトリのため社内資料の識別子は開示しない。',
          true
        ),
        'wind.roughnessCategory'
      ),
      status: 'partially_verified',
      source: 'みよし案件の設計風圧プリセット値（calc.js旧 POSITIVE_PRESSURE_MIYOSHI_PRESET / NEGATIVE_PRESSURE_MIYOSHI_PRESET より移設）',
      note: 'V0=34m/s・地表面粗度区分IIIは社内基本設計資料で直接確認済み（verified、evidence.level: primary）。ただしこの資料は外構・地表面の風荷重条件を確認したものであり、階別正圧・部位別負圧プリセット値（上記）の元となった外装材/ガラス構造計算書、および各階評価高さZとの厳密な対応付けを直接確認したものではない（evidence.level: indirect）。したがって階別プリセット値自体はpartially_verifiedのまま維持し、verifiedへは昇格させない。'
    },

    // ------------------------------------------------------------
    // Verified project cases（Phase 2B, Task 5）
    //
    // 将来、ガラス1枚の実見付W/Hと、その階・部位に対応する設計風圧の
    // 根拠（元計算書・評価高さZ）の両方が確認できた場合に、以下の
    // スキーマでケースを追加できるようにするための領域。
    //
    // ケーススキーマ:
    //   {
    //     caseId: string,                    // 一意なID
    //     floor: '1'|'2'|'3'|'R',
    //     zone: 'general'|'corner',
    //     widthMm: number,                   // ガラス1枚の実見付幅（確認済み）
    //     heightMm: number,                  // ガラス1枚の実見付高さ（確認済み）
    //     glassType: string,                 // GLASS_TYPES のキー等
    //     designPressure: number,            // N/m²
    //     evidenceStatus: 'verified',         // このケース自体は原則'verified'のみ追加する
    //     publicEvidenceDescription: string  // 公開可能な根拠説明（内部識別子を含めない）
    //   }
    //
    // 現時点ではガラス1枚の実寸が未確認のため、架空のverified caseは
    // 作らない。実寸・根拠の両方が確認できるまでは空配列のまま維持する。
    // ------------------------------------------------------------
    verifiedCases: []
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

  // Evidence promotion guardをテスト・外部から直接検証できるように公開する
  // （Task 7・Task 8）。この関数はverifiedValue()内部でも使用されており、
  // config構築時点で既に自己検証済みだが、テストからの直接呼び出しにも
  // 対応する。
  config.EVIDENCE_LEVELS = EVIDENCE_LEVELS;
  config.assertEvidenceConsistency = assertEvidenceConsistency;

  // config全体を走査し、すべての verifiedValue()相当のエントリ・identityが
  // Evidence promotion guardを満たしていることを再確認する。
  // （個々の verifiedValue() 呼び出し時点で既にassertEvidenceConsistencyを
  // 通しているため、通常は必ず空配列を返すはずだが、将来の変更に対する
  // 回帰チェックとしてテストから利用できるようにしておく。）
  config.validateAllEvidence = function () {
    var violations = [];

    function check(label, verificationStatus, evidence) {
      try {
        assertEvidenceConsistency(verificationStatus, evidence, label);
      } catch (e) {
        violations.push({ label: label, message: e.message });
      }
    }

    check('identity', config.identity.verificationStatus, config.identity.evidence);
    check('dimensions.defaultW', config.dimensions.defaultW.verificationStatus, config.dimensions.defaultW.evidence);
    check('dimensions.defaultH', config.dimensions.defaultH.verificationStatus, config.dimensions.defaultH.evidence);
    check('wind.V0', config.wind.V0.verificationStatus, config.wind.V0.evidence);
    check('wind.roughnessCategory', config.wind.roughnessCategory.verificationStatus, config.wind.roughnessCategory.evidence);
    Object.keys(config.wind.positivePressureByFloor).forEach(function (f) {
      var entry = config.wind.positivePressureByFloor[f];
      check('wind.positivePressureByFloor.' + f, entry.verificationStatus, entry.evidence);
    });
    Object.keys(config.wind.negativePressureByZone).forEach(function (z) {
      var entry = config.wind.negativePressureByZone[z];
      check('wind.negativePressureByZone.' + z, entry.verificationStatus, entry.evidence);
    });

    return violations;
  };

  return config;
});
