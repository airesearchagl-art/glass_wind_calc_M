/**
 * project-config/evidence.js
 *
 * 案件非依存のEvidence contract（Phase 2Fで project-config/miyoshi.js から抽出）。
 *
 * ── なぜ抽出したか ─────────────────────────────────────────────
 *
 * Evidence model（level / checkedAt / public-safe boundary / promotion guard）は
 * 本来どの案件にも共通する契約だが、Phase 2Eまでは案件固有モジュールである
 * miyoshi.js の内部に閉じ込められていた。そのため
 *   - 別案件のconfigが同じ契約を使えない
 *   - 案件非依存のEvidence Ledgerが契約を再実装せざるを得ない（＝重複実装）
 * という問題があった。Phase 2F AC-02（重複実装しない）を満たすため、
 * 契約の単一の正をここへ移動する。
 *
 * **ロジックは移動であって再実装ではない。** miyoshi.js はこのモジュールを
 * 解決して同名のローカル別名へ束ねるため、呼び出し側のコードと挙動は変わらない。
 *
 * ── 案件固有のものを置かない ───────────────────────────────────
 *
 * 案件名・案件固有値・案件固有のfactキーをこのモジュールへ持ち込まない。
 * ここにあるのは「Evidenceとは何か」「いつverifiedを名乗れるか」だけである。
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
    global.ProjectEvidence = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ============================================================
  // Evidence model（Phase 2B, Task 1/2/7。2026-09-17 Evidence Guard
  // Required Fixでhard validationを強化）
  // ============================================================

  var EVIDENCE_LEVELS = ['primary', 'indirect', 'none'];

  // 許容されるverificationStatusの全体（RF-02）。
  // assertEvidenceConsistency() の冒頭でこれ以外を即rejectすることで、
  // タイプミス（'verifed'）や大文字小文字違い（'Verified'）でpromotion
  // guardを迂回できないことを保証する。テストからも参照できるよう
  // config.VERIFICATION_STATUSES として公開する。
  var VERIFICATION_STATUSES = ['verified', 'partially_verified', 'unverified'];

  // checkedAt契約（RF-03）: "YYYY-MM-DD" 形式の文字列、または null のみ許容。
  // 単なるtruthy判定ではなく、実在するカレンダー日付であることまで検証する
  // （例: '2026-13-40' や '2026-02-30' のような形式は合っていても実在しない
  // 日付は reject する）。
  var CHECKED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function isValidCheckedAt(checkedAt) {
    if (checkedAt === null) {
      return true;
    }
    if (typeof checkedAt !== 'string' || !CHECKED_AT_PATTERN.test(checkedAt)) {
      return false;
    }
    var parts = checkedAt.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);
    if (month < 1 || month > 12) {
      return false;
    }
    // UTC基準でその年月の末日を求め、dayがその範囲内であることを確認する
    // （うるう年の2月29日等も正しく扱える）。
    var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) {
      return false;
    }
    return true;
  }

  // public-safe boundary（RF-02）: publicDescription（および将来
  // publicEvidenceDescription等）へ渡してよいテキストかどうかを検証する
  // 共通ガード。既知のURL/パス/プロバイダ/opaqueトークンのパターンに
  // マッチした場合のみ拒否する「既知パターンの自動検出」であり、
  // 正式案件名・機密名称等の非パターン文字列までは検出できない
  // （repository-wide review・Human reviewが別途必要）。
  var PUBLIC_UNSAFE_TEXT_PATTERNS = [
    { name: 'url-scheme', pattern: /\b[a-z][a-z0-9+.-]*:\/\//i },
    { name: 'www', pattern: /\bwww\./i },
    { name: 'known-private-provider', pattern: /drive\.google|docs\.google|notion\.(so|com)|sharepoint|dropbox/i },
    { name: 'windows-absolute-path', pattern: /[A-Za-z]:\\/ },
    { name: 'unc-path', pattern: /\\\\[^\\\s]+\\[^\\\s]*/ },
    { name: 'unix-home-or-absolute-path', pattern: /(^|\s)(~\/|\/Users\/|\/home\/|\/mnt\/)/ },
    { name: 'opaque-long-token', pattern: /\b[A-Za-z0-9_-]{28,}\b/ }
  ];

  function assertPublicSafeEvidenceText(text, label) {
    if (typeof text !== 'string' || !text) {
      throw new Error((label || 'publicDescription') + ' must be a non-empty string');
    }
    for (var i = 0; i < PUBLIC_UNSAFE_TEXT_PATTERNS.length; i++) {
      var entry = PUBLIC_UNSAFE_TEXT_PATTERNS[i];
      if (entry.pattern.test(text)) {
        throw new Error(
          (label || 'publicDescription') + ' must not contain private URLs/paths/identifiers (matched known-unsafe pattern: ' + entry.name + ')'
        );
      }
    }
    return true;
  }

  // Evidence記述オブジェクトを組み立てるヘルパー。
  // publicDescription / privateReferenceAvailable のみを保持し、
  // 実際のURL・ファイルID・ファイル名は一切保持しない設計とする
  // （呼び出し側がそれらを渡すこと自体を想定していない）。
  //
  // Phase 2C AC-05（Evidence factory hardening）: 従来は
  // `checkedAt: checkedAt || null` という実装で、''・false・0・undefined等の
  // 不正な入力を静かに（例外を投げずに）null へ丸め込んでいた。これは
  // 「呼び出し側の実装ミスでchecked日付を渡し忘れた」ケースと「意図的に
  // 未確認を表すnull/undefinedを渡した」ケースを区別できず、契約違反を
  // 検知できないまま通過させてしまう危険があった。
  // ここでは level・checkedAt の両方を factory の入口で検証し、
  // null/undefined 以外の不正な checkedAt は即座に例外を投げる
  // （assertEvidenceConsistency() へ委ねる事後検証だけに依存しない）。
  //
  // Phase 2C Closure Wave RF-02: publicDescription にも
  // assertPublicSafeEvidenceText() を適用し（public-safe boundaryを
  // factory入口まで前倒し）、privateReferenceAvailable は
  // `!!privateReferenceAvailable` という従来のsilent boolean coercionを
  // やめ、厳密なboolean型のみ許容するようにした。
  function makeEvidence(level, checkedAt, publicDescription, privateReferenceAvailable) {
    if (EVIDENCE_LEVELS.indexOf(level) === -1) {
      throw new Error('makeEvidence(): invalid evidence level: ' + JSON.stringify(level) + ' (must be one of ' + EVIDENCE_LEVELS.join(', ') + ')');
    }
    var normalizedCheckedAt = (checkedAt === undefined || checkedAt === null) ? null : checkedAt;
    if (!isValidCheckedAt(normalizedCheckedAt)) {
      throw new Error(
        'makeEvidence(): checkedAt must be null/undefined or a valid "YYYY-MM-DD" date string, got: ' + JSON.stringify(checkedAt)
      );
    }
    assertPublicSafeEvidenceText(publicDescription, 'makeEvidence(): publicDescription');
    if (typeof privateReferenceAvailable !== 'boolean') {
      throw new Error(
        'makeEvidence(): privateReferenceAvailable must be a boolean (true/false), got: ' + JSON.stringify(privateReferenceAvailable)
      );
    }
    return {
      level: level,
      checkedAt: normalizedCheckedAt,
      publicDescription: publicDescription,
      privateReferenceAvailable: privateReferenceAvailable
    };
  }

  // Evidence promotion guard（Task 7。RF-01〜RF-03でhard contract化）。
  //
  // - verificationStatus は VERIFICATION_STATUSES のいずれかでなければ
  //   即reject（RF-02）。
  // - evidence は必須。evidence.level は EVIDENCE_LEVELS のいずれかで
  //   なければreject。
  // - evidence.checkedAt は null または妥当な "YYYY-MM-DD" 文字列で
  //   なければreject（単なるtruthy判定ではない。RF-03）。
  // - verificationStatus が 'verified' の場合は、さらに
  //   evidence.level === 'primary' かつ evidence.checkedAt が
  //   設定されていることを必須とする。
  //
  // この関数は verifiedValue() 経由の値だけでなく、identity の構築時にも
  // 直接呼び出す（RF-01）。これにより 'verified' な値はすべて、
  // モジュール読み込み（require / <script>実行）の時点でこの契約を
  // 満たしていない限り、モジュール自体の評価が例外で失敗する
  // fail-fast設計になる。config.validateAllEvidence() による事後検証は
  // あくまで回帰確認用の補助であり、これに依存した検出ではない。
  function assertEvidenceConsistency(verificationStatus, evidence, label) {
    if (VERIFICATION_STATUSES.indexOf(verificationStatus) === -1) {
      throw new Error(
        'Invalid verificationStatus: ' + JSON.stringify(verificationStatus) +
        ' (must be one of ' + VERIFICATION_STATUSES.join(', ') + ')' + (label ? ' (' + label + ')' : '')
      );
    }
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('evidence metadata is required' + (label ? ' for ' + label : ''));
    }
    if (EVIDENCE_LEVELS.indexOf(evidence.level) === -1) {
      throw new Error('evidence.level must be one of ' + EVIDENCE_LEVELS.join(', ') + (label ? ' (' + label + ')' : ''));
    }
    if (!isValidCheckedAt(evidence.checkedAt)) {
      throw new Error(
        'evidence.checkedAt must be null or a valid "YYYY-MM-DD" date string, got: ' +
        JSON.stringify(evidence.checkedAt) + (label ? ' (' + label + ')' : '')
      );
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

  // ============================================================
  // Promotion Gate（Phase 2F §9）
  // ============================================================

  /**
   * verified を名乗るための条件を、既存guardより一段厳しくして強制する。
   *
   * 既存の assertEvidenceConsistency() は
   *   level === 'primary' かつ checkedAt が設定されていること
   * を要求する。Phase 2F §9 はこれに加えて
   *   privateReferenceAvailable === true
   *   または 安全に保持できるpublic primary source reference
   * を要求する。
   *
   * **既存guardと矛盾させない**: 本関数は既存guardを必ず先に通し、
   * そのうえで追加条件だけを課す（strictly stronger であって別基準ではない）。
   *
   * 「Humanがたぶん正しいと言った」「数値が近い」「告示計算でだいたい再現できる」
   * はいずれも根拠にならない。referenceの存在を構造的に要求する。
   *
   * @param {string} verificationStatus
   * @param {object} evidence
   * @param {string} [label]
   * @param {object} [options] `options.publicSourceReference` に
   *        public-safeな一次資料参照（例: 公的機関の公開URL）を渡すと、
   *        privateReferenceAvailable が false でもverifiedを許容する。
   */
  function assertPromotionGate(verificationStatus, evidence, label, options) {
    // まず既存契約を必ず通す（重複実装ではなく再利用）
    assertEvidenceConsistency(verificationStatus, evidence, label);

    if (verificationStatus !== 'verified') {
      return true;
    }

    options = options || {};
    var hasPrivateReference = evidence.privateReferenceAvailable === true;
    var publicReference = options.publicSourceReference;
    var hasPublicReference = typeof publicReference === 'string' && publicReference.length > 0;

    if (!hasPrivateReference && !hasPublicReference) {
      throw new Error(
        'promotion gate: verificationStatus "verified" requires either ' +
          'evidence.privateReferenceAvailable === true or an explicit public source reference' +
          (label ? ' (' + label + ')' : '')
      );
    }
    return true;
  }

  /**
   * 昇格可能かどうかを例外ではなく真偽で返す（診断表示用）。
   * 判定ロジックは assertPromotionGate() の再利用であって別実装ではない。
   */
  function canPromoteToVerified(evidence, options) {
    try {
      assertPromotionGate('verified', evidence, undefined, options);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    EVIDENCE_LEVELS: EVIDENCE_LEVELS,
    VERIFICATION_STATUSES: VERIFICATION_STATUSES,
    CHECKED_AT_PATTERN: CHECKED_AT_PATTERN,
    PUBLIC_UNSAFE_TEXT_PATTERNS: PUBLIC_UNSAFE_TEXT_PATTERNS,
    isValidCheckedAt: isValidCheckedAt,
    assertPublicSafeEvidenceText: assertPublicSafeEvidenceText,
    makeEvidence: makeEvidence,
    assertEvidenceConsistency: assertEvidenceConsistency,
    verifiedValue: verifiedValue,
    assertPromotionGate: assertPromotionGate,
    canPromoteToVerified: canPromoteToVerified
  };
});
