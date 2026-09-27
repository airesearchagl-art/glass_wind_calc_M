/**
 * project-config/miyoshi.js
 *
 * 「みよし案件」固有のプリセット値（案件入力）と、各値の検証状況
 * （verification metadata）・根拠状況（evidence metadata）をまとめた
 * モジュール。
 *
 * Phase 2A（案件固有入力と汎用計算コアの分離）の一部として、
 * calc.js に直接埋め込まれていた案件固有定数（階別正圧 / 部位別負圧 /
 * 案件既定寸法）をこのモジュールへ移設した。
 *
 * 位置づけ（Phase 2Dで完了）:
 *   - calc.js は k1・k2・許容耐風圧計算式・candidate generation/sorting等の
 *     「案件非依存の汎用計算コア」のみを担当する。案件固有値は保持しない。
 *   - 本ファイルは「案件固有プリセット」を担当する。index.html（UI）は
 *     Phase 2A以降、本ファイルを案件プリセットの正（authoritative source）
 *     として参照する。
 *   - Phase 2A〜2Cでcalc.js側へ後方互換用に残していた複製は、全consumerの
 *     移行完了に伴いPhase 2Dで削除済み。以後、案件固有値の正は本ファイル
 *     だけが持つ。calc.js側へ値を再複製しないこと。
 *   - 本ファイルは project-config/registry.js を通じてregistered presetとして
 *     lookupできる（Phase 2D）。registered presetのverified stateを持てるのは
 *     repository内のbuilt-in configだけであり、imported dataは昇格できない。
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
 * Evidence model（2026-09-17 Phase 2B。同日のEvidence Guard Required Fixで
 * hard contract化）:
 *   - 各入力値は必ず `evidence` を持つ：
 *       { level, checkedAt, publicDescription, privateReferenceAvailable }
 *     - level: 'primary'（一次資料で直接確認）/ 'indirect'（間接的な
 *       数値整合等の状況証拠のみ）/ 'none'（根拠未発見）。
 *       EVIDENCE_LEVELS 以外の値は assertEvidenceConsistency() が reject する。
 *     - checkedAt: 確認・レビューを行った日付。null、または実在する
 *       "YYYY-MM-DD" 形式の文字列のみ許容（単なるtruthy判定ではなく、
 *       isValidCheckedAt() が形式・実在するカレンダー日付かを検証する）。
 *     - publicDescription: 公開リポジトリに書いてよい、根拠の説明文。
 *     - privateReferenceAvailable: 社内に（未開示の）参照資料が存在するか
 *       どうかの真偽値のみ。実際のURL・ファイルID・ファイル名は含めない。
 *   - `verificationStatus` は VERIFICATION_STATUSES
 *     （'verified' / 'partially_verified' / 'unverified'）のいずれかで
 *     なければ assertEvidenceConsistency() が即rejectする（タイプミストや
 *     大文字小文字違いでpromotion guardを迂回できないようにするため）。
 *   - `verificationStatus`（「値がどれだけ検証されているか」）と
 *     `evidence`（「根拠がどの程度あるか」）は別軸として扱う。
 *     ただし verificationStatus が 'verified' の場合は、
 *     evidence.level === 'primary' かつ evidence.checkedAt が
 *     妥当な日付として設定されていることを必須とする
 *     （assertEvidenceConsistency による promotion guard）。
 *   - この guard は `verifiedValue()` 経由の値だけでなく `identity` の
 *     構築時にも明示的に呼び出しており（下記 identityEvidence の直後を
 *     参照）、'verified' な値はすべてモジュール読み込み
 *     （require() / <script>実行）の時点でこの契約を満たしていない限り、
 *     モジュール自体の評価が例外で失敗する fail-fast設計になっている。
 *     `config.validateAllEvidence()` はあくまで回帰確認用の事後検証補助
 *     であり、検出そのものをこれに依存してはいない。
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
 *
 * Phase 2C（2026-09-17）Evidence contract hardening:
 *   - `makeEvidence()` はfactoryの入口で level・checkedAt を検証するように
 *     変更した。従来の `checkedAt: checkedAt || null` は ''・false・0 等の
 *     不正な入力を無言でnullへ丸め込んでいたため、null/undefined以外の
 *     不正なcheckedAtは例外を投げるようにした（silent coercionの排除）。
 *   - `validateVerifiedCase()` を新設。`verifiedCases` へ将来ケースを追加
 *     する際、必須フィールド（caseId/floor/zone/widthMm/heightMm/
 *     glassType/designPressure/evidence/publicEvidenceDescription）と、
 *     pane W・pane H・pressureそれぞれのevidenceが 'verified'
 *     （level==='primary' かつ妥当なcheckedAt）であることを
 *     assertEvidenceConsistency() 経由で強制する。公開説明文への内部限定
 *     識別子混入も拒否する。このvalidatorはテスト・将来の追加作業向けで
 *     あり、本Campaignでは `verifiedCases` へ実ケースを追加していない。
 *
 * Phase 2C Consolidated Closure Wave（2026-09-17）RF-02:
 *   - public-safe boundaryを、`validateVerifiedCase()` のtop-level
 *     `publicEvidenceDescription` だけでなく、nested evidence
 *     （`evidence.widthEvidence.publicDescription` /
 *     `heightEvidence.publicDescription` / `pressureEvidence.publicDescription`）
 *     にまで拡張した。重複したregexではなく、共通関数
 *     `assertPublicSafeEvidenceText(text, label)` へ集約し、
 *     `makeEvidence()` の入口（＝すべてのevidence構築経路）と
 *     `validateVerifiedCase()` の双方から呼び出す。
 *   - `assertPublicSafeEvidenceText()` が検出するのは、既知のURLスキーム
 *     （http/https/file等）・`www.`・既知の非公開プロバイダ名
 *     （Drive/Notion/SharePoint/Dropbox）・Windows絶対パス（`C:\`）・
 *     UNCパス（`\\server\share`）・Unix系ホームディレクトリ/絶対パス
 *     （`~/`・`/Users/`・`/home/`・`/mnt/`）・長いopaqueトークン
 *     （28文字以上の英数字/_/-の連続）という**既知パターンのみ**である。
 *     正式案件名・機密名称など、パターンマッチでは検出できない秘匿情報は
 *     このガードでは検出できない。**「すべての秘密文字列を自動判定できる」
 *     という主張はしない。** 正式案件名等のrepository-wide reviewは、
 *     引き続き人（Human review）が担う。
 *   - `makeEvidence()` は `publicDescription` に対しても
 *     `assertPublicSafeEvidenceText()` を適用し、`privateReferenceAvailable`
 *     を厳密なboolean型のみ許容するよう変更した（`!!privateReferenceAvailable`
 *     という従来のsilent coercionでは、`"false"`・`1`・`0`・`{}`のような
 *     非boolean値も黙ってtruthy/falsyに変換されてしまっていた）。
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
  // Evidence model
  // ============================================================
  //
  // Evidence contract（level / checkedAt / public-safe boundary /
  // promotion guard）の**単一の正は project-config/evidence.js** にある。
  // Phase 2Fで、案件非依存の契約を案件固有モジュールから切り出した。
  //
  // ここでは解決したものを同名のローカル別名へ束ねるだけなので、
  // 以下のconfig定義のコードと挙動は抽出前と変わらない。
  // 契約を再実装していない（Phase 2F AC-02: 重複実装しない）。
  function resolveEvidenceContract() {
    // 注意: 本ファイルのUMD factoryは global を引数に取らない
    // （registry.js / project-input.js とはsignatureが異なる）。
    // ブラウザでは `global` という識別子が存在しないため、
    // globalThis を直接参照する必要がある。
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
      'MiyoshiProjectConfig: project-config/evidence.js (ProjectEvidence) is required but not available'
    );
  }

  var ProjectEvidence = resolveEvidenceContract();

  var EVIDENCE_LEVELS = ProjectEvidence.EVIDENCE_LEVELS;
  var VERIFICATION_STATUSES = ProjectEvidence.VERIFICATION_STATUSES;
  var isValidCheckedAt = ProjectEvidence.isValidCheckedAt;
  var assertPublicSafeEvidenceText = ProjectEvidence.assertPublicSafeEvidenceText;
  var makeEvidence = ProjectEvidence.makeEvidence;
  var assertEvidenceConsistency = ProjectEvidence.assertEvidenceConsistency;
  var verifiedValue = ProjectEvidence.verifiedValue;
  var assertPromotionGate = ProjectEvidence.assertPromotionGate;
  var deepFreeze = ProjectEvidence.deepFreeze;
  var assertOrdinaryObject = ProjectEvidence.assertOrdinaryObject;

  // 案件識別情報そのものは社内基本設計資料で確認済み（verificationStatus:
  // 'verified'）。ただし本リポジトリは public であるため、施主名・建物名称・
  // 設計番号等の具体的な固有名詞や、社内資料のURL・ファイルID・ファイル名は
  // このリポジトリには記載しない（disclosureStatus: 'redacted'）。
  // UI・ドキュメント上は引き続き publicLabel の「みよし案件」を表示する。
  // 社内での厳密な対応関係は、社内の非公開ドキュメントで管理する。
  //
  // RF-01（Evidence Guard Required Fix）: identity は verifiedValue() を
  // 経由しないため、他の 'verified' な値と異なり construction-time guard
  // を素通りしてしまっていた。ここで明示的に assertEvidenceConsistency() を
  // 呼び、identity もモジュール読み込み時点のfail-fast契約に含める。
  // 契約に違反する evidence（例: level !== 'primary' や checkedAt 欠落）を
  // 渡すと、この行で例外が投げられ、require() / <script> 実行自体が
  // 失敗する。
  var identityEvidence = makeEvidence(
    'primary' /* identity-evidence-level */,
    '2026-09-17',
    '社内基本設計資料により案件識別情報を確認済み。本リポジトリは公開のため、固有名詞・社内資料参照は開示しない。',
    true
  );
  // Phase 2F §3-B: identity の構築も強化後のgateを通す。
  // verified規則を二重に持たない（単一のcanonical path）。
  assertPromotionGate('verified', identityEvidence, 'identity');

  var config = {
    projectId: 'miyoshi',
    projectName: 'みよし案件',

    // Phase 2D（AC-04）: registered presetとして project-config/registry.js へ
    // 登録可能であることを示すマーカー。固定presetを持つbuilt-in案件configだけが
    // trueを持つ。手入力（project-config/manual.js）は false であり、
    // registryはtrusted presetとして受け付けない。
    hasFixedPreset: true,

    identity: {
      publicLabel: 'みよし案件',
      verificationStatus: 'verified',
      disclosureStatus: 'redacted',
      evidence: identityEvidence
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
      // RF-04: このindirect evidence（ACW全体高さの記録候補）は2026-09-17に
      // 確認したものであるため、checkedAtをnullから'2026-09-17'へ修正した。
      // これはH=2050をverifiedへ昇格することを意味しない
      // （verificationStatus="unverified"・evidence.level="indirect"は維持）。
      defaultH: verifiedValue(
        2050, 'mm', 'unverified',
        makeEvidence(
          'indirect',
          '2026-09-17',
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
      source: 'みよし案件の設計風圧プリセット値（Phase 2Aでcalc.jsの案件固有定数から移設。Phase 2Dでcalc.js側の複製は削除済み）',
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
  // （Task 7・Task 8）。この関数はverifiedValue()内部・identity構築時にも
  // 使用されており、config構築時点（モジュール読み込み時点）で既に
  // 自己検証済みだが、テストからの直接呼び出しにも対応する。
  config.EVIDENCE_LEVELS = EVIDENCE_LEVELS;
  config.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
  config.assertEvidenceConsistency = assertEvidenceConsistency;

  // config全体を走査し、すべての verifiedValue()相当のエントリ・identityが
  // Evidence promotion guardを満たしていることを再確認する。
  // （個々の verifiedValue() 呼び出し時点で既にassertEvidenceConsistencyを
  // 通しているため、通常は必ず空配列を返すはずだが、将来の変更に対する
  // 回帰チェックとしてテストから利用できるようにしておく。）
  config.validateAllEvidence = function () {
    var violations = [];

    // F11: ここは**configに実際に載っている値**を検査する唯一の経路である。
    // 以前は assertEvidenceConsistency（privateReferenceAvailableを見ない弱い方）
    // を使っていたため、構築時にgateを通した値と、configのliteralに書かれた値が
    // 食い違っていても検出できなかった（identityは特にliteralで組まれている）。
    // 強化後の assertPromotionGate を使い、構築経路ではなく**結果**を検査する。
    // verified以外のstatusでは挙動は変わらない（gateはconsistency checkに委譲する）。
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

  // ============================================================
  // Verified project case validator（Phase 2C, AC-06）
  //
  // `verifiedCases` は現時点で空配列のまま維持する（架空のケースを追加
  // しない）。このvalidatorは、将来ガラス1枚の実見付W/Hと設計風圧の根拠
  // （元計算書・評価高さZ）の両方が確認できたケースを安全に追加できる
  // よう、必須フィールドと厳格な条件をhard checkするためのものであり、
  // 今回のCampaignで実際のケースをverifiedCasesへ追加するものではない。
  // ============================================================

  var VERIFIED_CASE_REQUIRED_FIELDS = [
    'caseId', 'floor', 'zone', 'widthMm', 'heightMm',
    'glassType', 'designPressure', 'evidence', 'publicEvidenceDescription'
  ];
  var VERIFIED_CASE_VALID_FLOORS = ['1', '2', '3', 'R'];
  var VERIFIED_CASE_VALID_ZONES = ['general', 'corner'];

  // verified caseの妥当性を検証する。違反があれば例外を投げる（true以外は
  // 返さない）。呼び出し側は try/catch するか、事前に妥当性が既知の
  // ケースにのみ使うこと。
  // F9: caseIdはUI・export package・PR本文に**そのまま出る公開identifier**である。
  // ただし注意（独立検証7 F7-04）: **この validator が守っているのは
  // verifiedCases の経路だけ**であり、それは現在空配列である。
  // 実際に export package へ到達する caseId は workspace.js / project-profile.js 経由で、
  // そちらには filename-like の検査が無い（QD-J10）。
  // このコメントを「だからここで塞げている」と読まないこと。
  // D-012が factKey に allowlist を課したのと同じ理由（key自体が公開情報になる）が
  // ここにも等しく当てはまる。図面番号やファイル名をそのままcaseIdに持ち込む経路を
  // 構造的に塞ぐため、公開して差し支えない短い記号IDだけを許す（fail closed）。
  // 長さの上限は **opaque-long-token が throw することに依存しない**。
  // Human Gate §9 / QD-J16: 以前は最大 48 文字を許しており、28 文字以上の
  // 不透明 ID は guard 側の opaque-long-token だけが止めていた。
  // その規則が advisory へ降格されるので、暗黙の依存を残さない。
  // 27 文字は opaque-long-token のしきい値（28）を下回るので、
  // この規則だけで閉じている（閉じた構造契約）。
  //
  // provider 名のような**意味的**な類似はここでは扱わない。
  // CASE_ID_PATTERN に provider 名を編み込むのは開いた集合を
  // 閉じた規則で追うことになる——それは advisory lint + Human Review の仕事。
  var CASE_ID_MAX_LENGTH = 27;
  var CASE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,26}$/;
  // 拡張子集合は evidence.js が唯一の定義を持つ（独立検証6 F3）。
  // 以前はここに同じ一覧を**手で写して**おり、evidence.js 側だけを
  // 日本の実務形式へ拡張した結果 2 つがさし、caseId だけ `plan_jww` が
  // 通る状態になっていた。caseId は UI・export package・PR本文にそのまま出る。
  // 存在を確かめてから使う。undefined のまま連結すると
  // `/[._-](undefined)$/i` という**有効だが何も防がない正規表現**になり、
  // guard が黙って無効化する（独立検証7 F7-05）。
  // 他の輸入は関数・配列なので使用時に必ず例外になるが、
  // これだけは文字列なので気づかれずに通ってしまう。
  // （古い evidence.js がキャッシュされているブラウザで実際に起きうる）
  if (typeof ProjectEvidence.PRIVATE_DOCUMENT_EXTENSION_SOURCE !== 'string' ||
      !ProjectEvidence.PRIVATE_DOCUMENT_EXTENSION_SOURCE) {
    throw new Error(
      'MiyoshiProjectConfig: ProjectEvidence.PRIVATE_DOCUMENT_EXTENSION_SOURCE is required but not available'
    );
  }
  var FILENAME_LIKE_CASE_ID_PATTERN = new RegExp(
    '[._-](' + ProjectEvidence.PRIVATE_DOCUMENT_EXTENSION_SOURCE + ')$', 'i');

  function validateVerifiedCase(caseObj) {
    if (!caseObj || typeof caseObj !== 'object') {
      throw new Error('verified case must be an object');
    }
    // Phase 2J Wave 1: caseObj のfieldはすべて素のproperty readで消費される。
    // custom prototype に必須fieldを載せれば、下の必須field検査も
    // caseId / floor / zone / 寸法 / designPressure の検査も、
    // 「呼び出し側が実際には持っていない値」で通過してしまう。
    assertOrdinaryObject(caseObj, 'verified case');
    for (var i = 0; i < VERIFIED_CASE_REQUIRED_FIELDS.length; i++) {
      var field = VERIFIED_CASE_REQUIRED_FIELDS[i];
      // `field in caseObj` は prototype chain まで見るため、必須field検査として
      // 弱い。own propertyであることを要求する（構造ガードとの二重防御）。
      if (!Object.prototype.hasOwnProperty.call(caseObj, field)) {
        throw new Error('verified case is missing required field: ' + field);
      }
    }
    if (typeof caseObj.caseId !== 'string' || !caseObj.caseId) {
      throw new Error('verified case caseId must be a non-empty string');
    }
    if (!CASE_ID_PATTERN.test(caseObj.caseId)) {
      throw new Error(
        'verified case caseId must be a public-safe short identifier ' +
          '(letter, then letters/digits/_/-, max ' + CASE_ID_MAX_LENGTH + ' chars): ' +
          JSON.stringify(caseObj.caseId)
      );
    }
    if (FILENAME_LIKE_CASE_ID_PATTERN.test(caseObj.caseId)) {
      throw new Error(
        'verified case caseId must not look like a document/drawing filename: ' +
          JSON.stringify(caseObj.caseId)
      );
    }
    // URL ・ path は共通 guard の**構造規則**で塞ぐ。
    // 長い不透明トークンはここではもう止まらない（advisory へ降格された）。
    // 長さは上の CASE_ID_PATTERN が閉じているので、ここは defense in depth ではなく
    // URL / path / 制御文字のための構造検査。
    assertPublicSafeEvidenceText(caseObj.caseId, 'verified case caseId');
    if (VERIFIED_CASE_VALID_FLOORS.indexOf(caseObj.floor) === -1) {
      throw new Error('verified case floor must be one of ' + VERIFIED_CASE_VALID_FLOORS.join(', '));
    }
    if (VERIFIED_CASE_VALID_ZONES.indexOf(caseObj.zone) === -1) {
      throw new Error('verified case zone must be one of ' + VERIFIED_CASE_VALID_ZONES.join(', '));
    }
    if (typeof caseObj.widthMm !== 'number' || !isFinite(caseObj.widthMm) || caseObj.widthMm <= 0) {
      throw new Error('verified case widthMm must be a positive finite number');
    }
    if (typeof caseObj.heightMm !== 'number' || !isFinite(caseObj.heightMm) || caseObj.heightMm <= 0) {
      throw new Error('verified case heightMm must be a positive finite number');
    }
    if (typeof caseObj.glassType !== 'string' || !caseObj.glassType) {
      throw new Error('verified case glassType must be a non-empty string');
    }
    if (typeof caseObj.designPressure !== 'number' || !isFinite(caseObj.designPressure) || caseObj.designPressure <= 0) {
      throw new Error('verified case designPressure must be a positive finite number');
    }
    // RF-02: top-levelのpublicEvidenceDescriptionは共通ガード
    // assertPublicSafeEvidenceText() で検証する（重複regexを廃止）。
    assertPublicSafeEvidenceText(caseObj.publicEvidenceDescription, 'verified case publicEvidenceDescription');

    var evidence = caseObj.evidence;
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('verified case evidence must be an object with widthEvidence/heightEvidence/pressureEvidence');
    }
    // top-levelを閉じてもnestedは閉じない。widthEvidence/heightEvidence/
    // pressureEvidence を継承で供給する経路が別に残るため、ここでも閉じる。
    assertOrdinaryObject(evidence, 'verified case evidence');
    // pane W / pane H / pressure のそれぞれについて、
    // 「primary evidence かつ妥当なcheckedAt」というhard conditionを、
    // Phase 2Fの強化後gate assertPromotionGate('verified', ...) を再利用して強制する
    // （検証ロジックを重複させない）。
    // RF-02: 各evidenceのpublicDescriptionにもpublic-safe boundaryを適用する
    // （top-levelのpublicEvidenceDescriptionだけでなく、nested evidenceの
    // publicDescriptionまで閉じる）。makeEvidence()経由で構築されたevidence
    // であればここでの再検証は冗長になるが、caseObjのevidenceがmakeEvidence()
    // を経由せず直接組み立てられる可能性を考慮し、validateVerifiedCase()側
    // でも独立して強制する（defense in depth）。
    if (evidence.sourceReferences !== null && evidence.sourceReferences !== undefined) {
      assertOrdinaryObject(evidence.sourceReferences, 'verified case evidence.sourceReferences');
    }
    ['widthEvidence', 'heightEvidence', 'pressureEvidence'].forEach(function (key) {
      var entryEvidence = evidence[key];
      // Phase 2F §3-C: case-level検証も強化後のgateを通す。
      // level=primary / checkedAt妥当 でも、privateReferenceAvailable=false かつ
      // 妥当なpublic primary referenceが無い場合は**拒否**する。
      assertPromotionGate(
        'verified',
        entryEvidence,
        'verifiedCase.' + caseObj.caseId + '.' + key,
        { sourceReference: (evidence.sourceReferences || {})[key] || null }
      );
      assertPublicSafeEvidenceText(
        entryEvidence && entryEvidence.publicDescription,
        'verifiedCase.' + caseObj.caseId + '.' + key + '.publicDescription'
      );
    });

    return true;
  }

  config.makeEvidence = makeEvidence;
  config.isValidCheckedAt = isValidCheckedAt;
  config.validateVerifiedCase = validateVerifiedCase;
  config.assertPublicSafeEvidenceText = assertPublicSafeEvidenceText;

  // F3: Ledger entryは深くfreezeされているのに、UIが実際に読む**一次の**
  // trusted objectはmutableのままだった。つまり `config.wind.V0.value = 99` や
  // `config.dimensions.mode = 'verified_project_case'`、
  // `config.verifiedCases.push(...)`（validateVerifiedCaseを一切通らない）が
  // 通ってしまい、「検証後改変の封鎖」は半分しか真でなかった。
  //
  // identity / dimensions / wind / verifiedCases を深くfreezeして、
  // 検証を通った値の事後改変とcaseの裏口登録を構造的に封じる。
  // config自体はfreezeしない（上のhelper付与と、将来のaccessor追加のため）。
  // F11: identityは verifiedValue() を経由せずliteralで組まれているため、
  // 「gateを通したevidence変数」と「literalが実際に載せたevidence」が
  // 別物になっても構築時のgateでは気づけない（規約で繋がっているだけだった）。
  // configに載った**結果**をここで検査し、食い違えばmodule loadごと失敗させる。
  var identityViolations = config.validateAllEvidence();
  if (identityViolations.length > 0) {
    throw new Error(
      'project-config evidence contract violated at module load: ' +
        identityViolations.map(function (v) { return v.label + ': ' + v.message; }).join(' | ')
    );
  }

  deepFreeze(config.identity);
  deepFreeze(config.dimensions);
  deepFreeze(config.wind);
  deepFreeze(config.verifiedCases);

  return config;
});
