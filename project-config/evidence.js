/**
 * project-config/evidence.js
 *
 * 案件非依存のEvidence contract（Phase 2Fで project-config/miyoshi.js から抽出）。
 *
 * ── なぜ抽出したか ─────────────────────────────────────────────
 *
 * Evidence model（level / checkedAt / public-safe boundary / promotion guard）は
 * 本来どの案件にも共通する契約だが、Phase 2Eまでは案件固有モジュールである
 * project-config/miyoshi.js の内部に閉じ込められていた。そのため
 *   - 別案件のconfigが同じ契約を使えない
 *   - 案件非依存のEvidence Ledgerが契約を再実装せざるを得ない（＝重複実装）
 * という問題があった。Phase 2F AC-02（重複実装しない）を満たすため、
 * 契約の単一の正をここへ移動する。
 *
 * **ロジックは移動であって再実装ではない。** project-config/miyoshi.js はこのモジュールを
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

  // ============================================================
  // 構造ガード（Phase 2J Wave 1）
  // ============================================================

  /**
   * prototype chain に細工の無い素の object だけを通す。
   *
   * ── なぜ field ごとの検査では閉じないか ──────────────────────
   *
   * `Object.create({level: 'primary', ...})` で継承させたkeyは
   * `Object.keys()` にも `hasOwnProperty()` にも現れない。したがって
   *   - 「余計なfieldが無いこと」を Object.keys で確かめる allowlist は**空虚に真**になり
   *   - `evidence.level` のような素の property read は継承値を読んでしまう
   * という形で、契約検査を通り抜けたまま契約値を注入できる。
   *
   * これは prototype pollution ではない（Object.prototype は一切変更されない）。
   * 呼び出し側objectの prototype に契約値を載せる
   * **inherited-field consumption / custom-prototype contract-value injection** である。
   * 名前を取り違えると、対策が key sanitization の方向へ逸れて的を外す。
   *
   * ── null prototype を通す理由（Phase 2J §23 の明示的決定）────
   *
   * 継承元が無い＝継承値が入り得ないため、`Object.prototype` 付きより素直な
   * データである。required fieldは必ず own property になる。
   * これは「たまたま通っている」のではなく意図した決定であり、testで固定する。
   *
   * ── 判定はここ1か所だけで行う ────────────────────────────────
   *
   * field ごとの継承チェックを増やさない。増やすと、前段が生きている限り
   * 後段が発火せず、どちらが効いているのか分からなくなる。
   */
  function assertOrdinaryObject(value, label) {
    var where = label || 'value';
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(where + ' must be a plain object');
    }
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(where + ' must be a plain object with no inherited properties');
    }
    // own "__proto__" は**別の形**であり、prototypeの付け替えではない（実測）。
    // `JSON.parse('{"__proto__":{...}}')` はprototypeを変えないので上の判定を通る。
    // しかしこのkeyを持ったまま下流で `Object.assign({}, value)` のような
    // [[Set]] を使ったcopyが起きると、`Object.prototype.__proto__` のsetterが
    // 発火してcopyのprototypeが差し替わる。つまり「素のdata」として通した値が、
    // 一手先で custom prototype として**再生する**。
    // 値そのものは無害でも運搬体として危険なので、予期しないown fieldとして塞ぐ。
    if (Object.prototype.hasOwnProperty.call(value, '__proto__')) {
      throw new Error(where + ' must not carry an own "__proto__" field');
    }
    return value;
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
    { name: 'opaque-long-token', pattern: /\b[A-Za-z0-9_-]{28,}\b/ },

    // ── Phase 2J Wave 5 で実測により追加 ───────────────────────
    //
    // 下の4クラスは Wave 5 の probe で**実際に通り抜け**、
    // 合成READY contextでは Promotion Candidate JSON まで到達した。
    // publicDescription は公開リポジトリと Candidate JSON の両方に出るため、
    // ここが唯一の canonical な関門である。
    // evidence-closure.js / candidate serializer / Matrix UI 側に
    // 個別のsanitizationを足して塞がない（関門を増やすと、どれが効いているか
    // 分からなくなり、どれも単独では信用できなくなる）。

    // 担当者のメールアドレス等。個人を特定しうる連絡先は公開しない。
    { name: 'email-like', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/ },

    // 私的文書・図面のファイル名。拡張子集合は caseId 側の既存ポリシー
    // （FILENAME_LIKE_CASE_ID_PATTERN）と**同じ**ものを使う。
    // 「ドットを含む語」を一律に弾かない: 既存のEvidence散文は
    // `index.html` のようなリポジトリ内ファイルに正当に言及しており、
    // それを新たに拒否すると現行configが読み込めなくなる（実測で2件該当）。
    // 幹を ASCII に限定しない（独立検証4 Finding 2）。
    // 本案件のEvidence散文は日本語であり、私的文書の名前も日本語である:
    //   構造計算書.pdf / 図面.dwg / 意匠図一式.pdf / 検討資料_001.xlsx
    // 旧実装は幹を `[A-Za-z0-9_-]+` としていたため、
    // **現実にありそうな日本語ファイル名だけが素通り**していた（実測 12/15）。
    // `plan.pdf` は落ちるのに `構造計算書.pdf` は通る、という逆転である。
    // これは「ASCIIか日本語か」を「安全か危険か」に重ねた誤りで、
    // タグ判定の3度目の欠陥とまったく同じ取り違えである。
    //
    // 幹は「区切り文字以外の連なり」とする。長さは上限を置く
    // （否定クラス + リテラルの組は witness 次第で二次コストになりうる。QD-J04）。
    { name: 'private-document-filename', pattern: /[^\s<>"'(),;:：、。「」『』]{1,120}\.(pdf|dwg|dxf|xls[xm]?|doc[xm]?|ppt[xm]?|jpe?g|png|zip|rvt|skp)(?![A-Za-z0-9])/i },

    // タグの形をした内容。これは**privacy/内容の境界**であって、
    // XSS対策そのものではない（DOM側は textContent / createElement で別に守る）。
    //
    // ── ここは3度間違えた。経緯を残す ──────────────────────────
    //
    // (1) 元の規則は `<` + 英字 … `>` を一律に拒否していた。
    //     `W<H かつ P>Q である。` を巻き込む（誤検知）と指摘された。
    // (2) 「本体が**属性の形**のものだけ拒否」へ変更した。意図が裏返り、
    //     属性文法に合わない本体が素通りした（崩れたタグほど通る）。
    // (3) 「本体に**日本語**が無いタグ形だけ拒否」へ変更した。前提が誤りで、
    //     日本語のHTMLは `alt="図面"` のように属性値に日本語を持つ。
    //     結果、**1文字混ぜるだけで全タグ名が素通り**した（実測 114/114）。
    //
    // ── なぜ賢い規則が作れないのか ───────────────────────────
    //
    //     A<B C>D        散文（変数の比較）
    //     <td nowrap>    タグ
    //
    // この2つは `<` + 識別子 + 空白 + 識別子 + `>` で**文字構成が同一**である。
    // `<…>` の中だけを見る規則では原理的に分離できない。
    // したがって「どちらの誤りを選ぶか」を決めるしかない。
    //
    // ── 選択: 誤検知(fail closed)を取り、素通りを無くす ──────────
    //
    // 素通りを許すとこのガードは意味を失う（唯一のcanonicalな関門である）。
    // 一方、誤検知には**書き方で回避できる**という性質がある:
    //
    //     W<H かつ P>Q      拒否される
    //     W < H かつ P > Q  通る（演算子の前後に空白を置く）
    //     5<Z<40            通る（`>` で閉じないため一致しない）
    //
    // 比較演算子の前後に空白を置くのは組版としても正しい。
    // 「書けなくなる」のではなく「書き方が決まる」だけなので、
    // 誤検知側の実害は受け入れられる。
    // 賢い例外を足さない。3度とも例外の作り込みで壊している。
    //
    // ── 4度目の指摘（独立検証4 Finding 1）─────────────────────
    //
    // 本体クラスが `[^<>]*` だったため、**本体に `<` が1つ入るだけで**
    // 一致しなくなり、reject → accept へ反転していた:
    //
    //     <img src=x onerror=alert(1)>        拒否
    //     <img onerror=alert(1<2)>            **素通り**
    //     <img src=x onerror="alert(1);a<b">  **素通り**
    //     <img src=x onerror=alert(1) alt="<"> **素通り**
    //
    // 実測 78/78（検証者は 142タグ名 × 5形 = 710/710）。Chromium で
    // 実際に要素が生成され handler が発火することまで確認されている。
    //
    // **これは3度の修理で入った欠陥ではなく、元の規則から在った。**
    // 3回の修理も3回の検証も、本体の文字クラスを見ていなかった。
    // Wave 6c は「素通りを無くすために誤検知を受け入れる」と述べたが、
    // 素通りは残っていた。**払ったコストが買うはずのものを買えていなかった。**
    //
    // 本体を `[^>]` にする（`<` を許す）。`*` ではなく上限付きにするのは、
    // 無制限だと二次コストになり P2J-S21 が落ちるためである
    // （検証者が naive fix で実測。上限付きなら線形のままであることも実測済み）。
    { name: 'html-like-tag', pattern: /<\/?[A-Za-z][A-Za-z0-9-]*(?:[\s\/][^>]{0,300})?>/ },

    { name: 'markup-construct', pattern: /<!--|<!\[CDATA\[|<!DOCTYPE|<\?[A-Za-z]/i },

    // 非印字の制御文字。黙って落とさず fail closed にする。
    // 改行 (\n \r) と タブ (\t) は**意図的に許容**する:
    // 現行の publicDescription 11件はいずれも使っていないが、
    // 使うこと自体は privacy 上の危険ではなく、
    // ここで新たに拒否すると理由のない挙動変更になる（Wave 5 で実測して決めた）。
    { name: 'control-character', pattern: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/ }
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
    // Phase 2J Wave 1: 以降の `evidence.level` / `evidence.checkedAt` /
    // `evidence.privateReferenceAvailable` はすべて素のproperty readであり、
    // custom prototype に載せた契約値をそのまま読んでしまう。読む前に構造を閉じる。
    assertOrdinaryObject(evidence, 'evidence' + (label ? ' (' + label + ')' : ''));
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
  // Phase 2F §3-A: verified を名乗る値の**実際の構築経路**が強化後のgateを通る。
  // （assertEvidenceConsistency だけでは privateReferenceAvailable が検査されず、
  //   強化要件が実質advisoryになってしまう。）
  // partially_verified / unverified の挙動は変わらない。
  function verifiedValue(value, unit, verificationStatus, evidence, label, options) {
    assertPromotionGate(verificationStatus, evidence, label, options);
    // §8 Option A: public referenceで検証した場合、その参照を**値に保持する**。
    // 一時optionとして渡して捨てると、監査時に「何を根拠にverifiedにしたか」が
    // 失われる（ephemeral-public-reference path を残さない）。
    // private Evidence由来の値は従来どおり sourceReference: null。
    var sourceReference = canonicalizeSourceReference(
      (options || {}).sourceReference, label
    );
    // F3: gateを通った後に evidence.level や verificationStatus を
    // 書き換えられると、gateが「構築時のみのチェック」に退化する。
    // Ledger entryと同じく深くfreezeして、検証後の改変を構造的に封じる。
    return deepFreeze({
      value: value,
      unit: unit,
      verificationStatus: verificationStatus,
      evidence: evidence,
      sourceReference: sourceReference
    });
  }


  // ============================================================
  // Public primary source reference（Phase 2F §4 / §5）
  // ============================================================

  /**
   * publicSourceReferenceとして保持してよいURLの構造要件。
   *
   * ── この関数が検証すること / しないこと ──────────────────────
   *
   * 検証する: **public-safeな構造**であること。
   *   公開HTTPS URLであり、資格情報を含まず、ローカル/私設ネットワークを指さず、
   *   既知のprivate providerでないこと。
   *
   * 検証しない: その資料が本当に**一次資料かどうか**、発行者が信頼できるかどうか。
   *   これはHuman / reviewerの判断であり、コードで決定できない。
   *   構造が通ったことを「一次資料であることの証明」と読み替えてはならない。
   *
   * ── assertPublicSafeEvidenceText() を再利用しない理由 ──────────
   *
   * あちらは publicDescription 用で、URLを**含むこと自体**を拒否する
   * （説明文に参照先を書かせないため）。一方こちらは公的な公開URLを
   * 受け入れる場所なので、要件が正反対である。混用してはならない。
   */
  //
  // 注意: ここに並ぶhost判定はすべて**末尾ドットを除去し終えたhost**に対して
  // 適用すること。`drive.google.com.` はDNS上まったく同じホストを指すが、
  // 正規化前は `$` アンカーのこのdenylistにも、後段の「ドットを含むか」による
  // 完全修飾ホスト名判定にも一致せず、private provider URLと単一ラベルの
  // intranet名の**両方**を素通りさせる。
  var PRIVATE_PROVIDER_HOST_PATTERN =
    /(^|\.)(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com|storage\.cloud\.google\.com|notion\.so|notion\.com|dropbox\.com|onedrive\.live\.com|box\.com|1drv\.ms)$|sharepoint/i;

  // ICANN予約TLD・mDNS・慣習的な私設TLD。公開一次資料がこの空間に存在することはない。
  var PRIVATE_USE_TLD_PATTERN =
    /\.(local|internal|intranet|corp|home|lan|private|test|localhost|example|invalid)$/i;

  // ワイルドカードDNS。任意のIPアドレスをホスト名に埋め込めるため、
  // これを許すとIPリテラル判定と私設アドレス判定の両方を迂回できる。
  var WILDCARD_DNS_HOST_PATTERN =
    /(^|\.)(nip\.io|sslip\.io|xip\.io|traefik\.me|localtest\.me)$/i;

  // ループバック・私設ネットワーク・リンクローカルのリテラル表記
  var LOOPBACK_HOST_PATTERN = /^(localhost|127(\.\d+){3}|\[?::1\]?|0\.0\.0\.0)$/i;
  // 10/8・192.168/16・172.16-31/12・169.254/16 に加え、
  // 100.64/10（CGNAT / RFC 6598）と 0/8（"this network"）も塞ぐ。
  // 注: このgeneric moduleに案件固有値を持ち込まないため、RFC番号は書かない。
  var PRIVATE_IPV4_PATTERN =
    /^(10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|169\.254(\.\d+){2}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d+){2}|0(\.\d+){3})$/;
  // fc00::/7（ユニークローカル: fc00–fdff）と fe80::/10（リンクローカル: fe80–febf）、
  // および未指定アドレス `::`。
  //
  // 旧実装は `fe80:` のみに一致し、fe90 / fea0 / febf を取りこぼしていた
  // （コメントは fe80::/10 を主張していたので、実装が説明より弱かった）。
  // 現状はIPv6リテラルが後段の「単一ラベルホスト」判定でも落ちるが、
  // **別のチェックに救われている状態に依存しない**ため、ここを正しくする。
  var PRIVATE_IPV6_PATTERN = /^\[?(f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:|::1?\]?$|::\]?$)/i;

  // IPv6リテラルはクラスとして公開一次資料の参照になりえないため、
  // 私設レンジか否かに関わらず拒否する（IPv4-mapped IPv6での迂回も塞ぐ）。
  var IPV6_LITERAL_PATTERN = /^\[.*\]$|^\[?[0-9a-f]{0,4}:[0-9a-f:.]*\]?$/i;

  // トークン様の文字列（これ単体をprovenanceの実体にしない）
  var CREDENTIAL_LIKE_PATTERN =
    /(^|[?&#/=])(token|apikey|api_key|access_token|refresh_token|id_token|secret|signature|sig|key|password|passwd|pwd|auth|authorization|session_token|sessiontoken|session_id|sessionid|credential)=/i;

  // 上のregexは生のURL文字列に当てるため、percent-encodeされたparam名
  // （`?%74oken=...`）を取りこぼす。searchParamsのkeyはdecode済みなので、
  // そちらにはこのname単位のregexを当てる。
  var CREDENTIAL_LIKE_PARAM_NAME =
    /^(token|apikey|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|secret|signature|sig|key|password|passwd|pwd|auth|authorization|session[-_]?token|session[-_]?id|credential)$/i;

  /**
   * public primary source referenceのURLを検証する。
   * 通れば正規化した文字列を返し、通らなければ例外を投げる（fail closed）。
   */
  function assertPublicPrimarySourceReference(url, label) {
    var where = label ? ' (' + label + ')' : '';
    if (typeof url !== 'string' || !url) {
      throw new Error('public source reference must be a non-empty string' + where);
    }

    var parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      throw new Error(
        'public source reference must be a syntactically valid absolute URL' + where +
          ' (got ' + JSON.stringify(url) + ')'
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(
        'public source reference must use https (got ' + JSON.stringify(parsed.protocol) + ')' + where
      );
    }
    if (parsed.username || parsed.password) {
      throw new Error('public source reference must not embed credentials' + where);
    }

    // ルート末尾ドットを正規化してから**すべての**host判定を行う（F1）。
    // `drive.google.com.` / `intranet.` は同一ホストを指すのに、
    // 正規化しないとdenylistにも完全修飾判定にも一致しない。
    var host = parsed.hostname.replace(/\.+$/, '').toLowerCase();
    if (!host) {
      throw new Error('public source reference must have a hostname' + where);
    }
    if (LOOPBACK_HOST_PATTERN.test(host)) {
      throw new Error('public source reference must not point at localhost/loopback' + where);
    }
    if (PRIVATE_IPV4_PATTERN.test(host) || PRIVATE_IPV6_PATTERN.test(host)) {
      throw new Error('public source reference must not point at a private-network address' + where);
    }
    // IPv6リテラルはクラスとして拒否する（fail closed）。
    // 公開一次資料がIPv6リテラルで参照されることは想定せず、
    // IPv4-mapped IPv6（::ffff:192.168.0.1 等）による迂回も同時に塞ぐ。
    if (IPV6_LITERAL_PATTERN.test(host)) {
      throw new Error(
        'public source reference must not use an IP-literal host' + where +
          ' (got ' + JSON.stringify(host) + ')'
      );
    }
    // 単一ラベルのホスト名（イントラネット名等）は公開資料の参照になりえない
    if (host.indexOf('.') === -1) {
      throw new Error(
        'public source reference must use a public fully-qualified hostname' + where +
          ' (got ' + JSON.stringify(host) + ')'
      );
    }
    if (PRIVATE_PROVIDER_HOST_PATTERN.test(host)) {
      throw new Error(
        'public source reference must not be a known private-document provider' + where +
          ' (host: ' + JSON.stringify(host) + ')'
      );
    }
    if (PRIVATE_USE_TLD_PATTERN.test(host)) {
      throw new Error(
        'public source reference must not use a private-use/reserved TLD' + where +
          ' (host: ' + JSON.stringify(host) + ')'
      );
    }
    if (WILDCARD_DNS_HOST_PATTERN.test(host)) {
      throw new Error(
        'public source reference must not use a wildcard-DNS host' + where +
          ' (host: ' + JSON.stringify(host) + ')'
      );
    }
    if (CREDENTIAL_LIKE_PATTERN.test(url)) {
      throw new Error(
        'public source reference must not carry a credential/token as its provenance' + where
      );
    }
    // percent-encodeされたparam名を塞ぐ（searchParamsのkeyはdecode済み）
    var paramNames = [];
    parsed.searchParams.forEach(function (_value, name) {
      paramNames.push(name);
    });
    for (var pi = 0; pi < paramNames.length; pi++) {
      if (CREDENTIAL_LIKE_PARAM_NAME.test(paramNames[pi])) {
        throw new Error(
          'public source reference must not carry a credential/token as its provenance' + where
        );
      }
    }
    // 正規化したhostで保存する。同じホストの別表記が別referenceとして
    // 残らないようにするため（末尾ドット等）。
    parsed.hostname = host;
    return parsed.toString();
  }

  /**
   * 再帰的にfreezeする。
   *
   * top-levelだけのfreezeでは nested object（evidence / sourceReference）を
   * 書き換えられてしまい、Promotion Gateが「構築時のみのチェック」に
   * 退化する。深くfreezeすることで、検証を通った後の改変を防ぐ。
   */
  function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) {
      deepFreeze(value[keys[i]]);
    }
    return value;
  }

  /**
   * Ledger entry等が保持するsourceReferenceの正規形（§5）。
   *
   *   private evidence -> null （URL / filename / ID は**保持しない**）
   *   public evidence  -> { kind: 'public_primary', url: <検証済みURL> }
   *
   * validation時にだけ渡す一時的なoptionではなく、
   * entryが保持できる形として定義する（監査可能性のため）。
   */
  function makePublicPrimarySourceReference(url, label) {
    // 呼び出し側のobjectを保持せず、正規化したURLから新しいobjectを作る。
    // 余計なfieldは持ち込まれない。
    return deepFreeze({
      kind: 'public_primary',
      url: assertPublicPrimarySourceReference(url, label)
    });
  }

  /**
   * 任意のsourceReference入力から、呼び出し側と切り離された正規形を作る（§7）。
   * null / undefined はそのまま null（private Evidence）。
   */
  function canonicalizeSourceReference(sourceReference, label) {
    assertSourceReference(sourceReference, label);
    if (sourceReference === null || sourceReference === undefined) {
      return null;
    }
    return makePublicPrimarySourceReference(sourceReference.url, label);
  }

  /** sourceReferenceが正規形であることを検証する。null（private）も許容。 */
  function assertSourceReference(sourceReference, label) {
    if (sourceReference === null || sourceReference === undefined) {
      return true;
    }
    if (typeof sourceReference !== 'object' || Array.isArray(sourceReference)) {
      throw new Error('sourceReference must be null or an object' + (label ? ' (' + label + ')' : ''));
    }
    // 継承させた kind/url は Object.keys ベースのallowlistに現れないため、
    // 「余計なfieldが無い」検査が空虚に真になったまま契約値だけが通る。
    assertOrdinaryObject(sourceReference, 'sourceReference' + (label ? ' (' + label + ')' : ''));
    if (sourceReference.kind !== 'public_primary') {
      throw new Error(
        'sourceReference.kind must be "public_primary" (got ' +
          JSON.stringify(sourceReference.kind) + ')' + (label ? ' (' + label + ')' : '')
      );
    }
    var allowed = ['kind', 'url'];
    var keys = Object.keys(sourceReference);
    for (var i = 0; i < keys.length; i++) {
      if (allowed.indexOf(keys[i]) === -1) {
        throw new Error('sourceReference has an unexpected field: ' + JSON.stringify(keys[i]));
      }
    }
    assertPublicPrimarySourceReference(sourceReference.url, label);
    return true;
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
   * @param {object} [options] `options.sourceReference` に §5の正規形
   *        `{ kind: 'public_primary', url }` を渡すと、
   *        privateReferenceAvailable が false でもverifiedを許容する。
   *        URLは assertPublicPrimarySourceReference() の構造要件を満たす必要がある
   *        （任意の非空文字列では通らない）。
   */
  function assertPromotionGate(verificationStatus, evidence, label, options) {
    // まず既存契約を必ず通す（重複実装ではなく再利用）
    assertEvidenceConsistency(verificationStatus, evidence, label);

    if (verificationStatus !== 'verified') {
      // partially_verified / unverified に reference要件を課さない
      return true;
    }

    // options.sourceReference も素のproperty readなので、同じ経路で
    // 「検証済みpublic referenceがある」と偽れる。ここで構造を閉じる。
    if (options !== null && options !== undefined) {
      assertOrdinaryObject(options, 'promotion options' + (label ? ' (' + label + ')' : ''));
    }
    options = options || {};
    var sourceReference = options.sourceReference;

    // sourceReferenceが与えられた場合、それ自体が正規形であることを必ず検証する
    // （不正な参照を「参照がある」として数えない）。
    assertSourceReference(sourceReference, label);

    var hasPrivateReference = evidence.privateReferenceAvailable === true;
    var hasPublicReference = !!(sourceReference && sourceReference.kind === 'public_primary');

    if (!hasPrivateReference && !hasPublicReference) {
      throw new Error(
        'promotion gate: verificationStatus "verified" requires either ' +
          'evidence.privateReferenceAvailable === true or a validated public primary source reference' +
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

  // F4: これらはcontractの定義そのものなので、**live mutable**で公開すると
  // 呼び出し側から緩められる（例: EVIDENCE_LEVELSへの追加）。freezeして返す。
  return {
    EVIDENCE_LEVELS: Object.freeze(EVIDENCE_LEVELS),
    VERIFICATION_STATUSES: Object.freeze(VERIFICATION_STATUSES),
    CHECKED_AT_PATTERN: CHECKED_AT_PATTERN,
    PUBLIC_UNSAFE_TEXT_PATTERNS: Object.freeze(PUBLIC_UNSAFE_TEXT_PATTERNS),
    isValidCheckedAt: isValidCheckedAt,
    assertOrdinaryObject: assertOrdinaryObject,
    assertPublicSafeEvidenceText: assertPublicSafeEvidenceText,
    makeEvidence: makeEvidence,
    assertEvidenceConsistency: assertEvidenceConsistency,
    verifiedValue: verifiedValue,
    assertPromotionGate: assertPromotionGate,
    canPromoteToVerified: canPromoteToVerified,
    assertPublicPrimarySourceReference: assertPublicPrimarySourceReference,
    makePublicPrimarySourceReference: makePublicPrimarySourceReference,
    canonicalizeSourceReference: canonicalizeSourceReference,
    assertSourceReference: assertSourceReference,
    deepFreeze: deepFreeze
  };
});
