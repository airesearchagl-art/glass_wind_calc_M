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

  // ---- 検出ヘルパ（regexでは正しく書けない2クラス） -------------------------
  //
  // 本Phaseでこの2規則は4度修正され、そのたび「目の前の抜けは塞いだが
  // 1文字ずれた同じ抜けは見落とす」を繰り返した。原因は規則の形にある。
  // 単一regexでは「線形時間」「`<` による素通りなし」「長さによる素通り
  // なし」を同時に満たせない（本体を `[^>]{0,N}` で縛れば N+1 文字で素通り、
  // 縛らなければ quadratic）。よって regex をやめ、後戻りのない前方走査に
  // 置き換える。以後この2関数は「文字クラスを足す」形では触らない。

  // HTML5 の tag open / tag name state に忠実な線形スキャナ。
  // タグとみなす条件は「`<`、任意で `/`、ASCII英字、そしてどこかに `>`」
  // のみ。tag name は tab/LF/FF/space/`/`/`>` 以外では終わらないため、
  // 名前部分に文字クラス制約を置かない（`<img:` `<a_` `<img\u200b` は
  // Chromium実測で live handler を持つ実要素になる）。本体長の上限も置かない。
  // この形に当てはまらないものはブラウザが要素として解釈しない（実測）:
  // `</ img>` `</1img>` は bogus comment、`＜img＞` はテキスト、
  // `<img src=x`（`>` なし）は閉じられない。
  function containsHtmlLikeTag(text) {
    var i = 0;
    while (true) {
      i = text.indexOf('<', i);
      if (i === -1) {
        return false;
      }
      var j = i + 1;
      if (text.charAt(j) === '/') {
        j += 1;
      }
      var c = text.charAt(j);
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
        // 名前が始まった。閉じられて初めて実タグ。ここに `>` が無ければ
        // これより後ろの `<` にも `>` は無いので、残り全体がタグ無しと確定。
        return text.indexOf('>', j) !== -1;
      }
      i += 1;
    }
  }

  // 全角 ASCII（U+FF01..U+FF5E）と全角スペースを半角へ畳む。
  //
  // この関数は Wave 6d で一度導入し、**重大な回帰を生んだ**。
  // 理由は範囲ではなく**使い方**だった——畳んだテキストだけを見ていたので、
  // `（）` が幹の区切り文字に化けて拒否が**消えた**（独立検証6 F1、368形）。
  // 範囲を狭めてしのいだが、それでも同じ形の欠陥が隣に残っていた
  // （独立検証7 F7-03、続いて 検証8 F8-01）。
  //
  // 正しい形は「畳みを**和**で使う」ことだけである。
  // raw と folded の両方を見れば、畳みは拒否を**増やすだけ**になり、
  // 範囲を広げても決して壊れない。だから範囲を狭める必要がなくなり、
  // 「4 つの範囲の端点」を個別に押さえる問題も消える（検証8 F8-03）。
  function foldFullwidthAscii(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code >= 0xff01 && code <= 0xff5e) {
        out += String.fromCharCode(code - 0xfee0);
      } else if (code === 0x3000) {
        out += ' ';
      } else {
        out += text.charAt(i);
      }
    }
    return out;
  }

  // 正規化の**集合**。規則はいずれかの形でマッチすれば拒否する。
  //
  // この形になった理由（独立検証9 F9-01）:
  // 前回は「raw ∨ fold は単調なので回帰は原理的に起きない」と書いたが、
  // 単調なのは **raw に対してだけ**である。同じ commit で fold 関数自体を
  // 広いものに**差し替えていた**ので、実際は
  //   旧: raw ∨ narrowFold      新: raw ∨ wideFold
  // という比較になり、どちらも他方を含まない。
  // 結果 `構造計算書（最新）．ｐｄｆ` が通るようになっていた（1472形）——
  // wideFold は `（）` を区切り文字に変えてしまい、raw は全角 dot を見られない。
  //
  // よって fold を**差し替えない**。集合へ追加する。
  // 追加は単調（拒否が増えるだけ）だが、**削除と差し替えは単調ではない**。
  // この配列から要素を減らす変更は回帰である（P2J-S33 が固定）。
  // dot 相当の符号を ASCII の `.` へ写す。
  //
  // 日本語 IME は日本語入力モードのピリオドキーで `。`(U+3002) を出す——
  // F1 が対象にした `．`(U+FF0E) よりむしろありふれた artefact であるのに、
  // 6 度の修理を通して一度も見ていなかった（独立検証10 F10-06）。
  // U+3002 は NFKC 不変なので「NFKC をかける」では閉じない。写像を明示する。
  //
  // 中黒（U+30FB `・` / U+FF65）は**意図的に除外**する。
  // 「仕様・図面」のように散文の並列区切りとして普通に使われ、
  // `PDF・doc形式で提出` のような普通の技術文を落としてしまう。
  // 採用基準（独立検証12 F12-04 を受けて言い直した）:
  //   **文末ピリオド類は入れる / 中黒・高さ付きドット類は入れない**。
  //
  // 旧基準は「ファイル名の拡張子区切りとして現れるか」だったが、
  // 12 メンバ中 9 はそれを満たさない（縦書き提示形、ギリシャ文字等）。
  // さらに U+0387（ギリシャの高さ付きドット）を入れながら
  // 字形がほとんど同じ U+00B7 を除外しており、どちらの基準でも
  // 実際の 12/2 の分け方を説明できていなかった——基準が
  // 「`。` と `・` を分ける」だけのために逆算されていた。
  //
  // 今の基準は形式的に適用できる:
  //   入れる: 。 ｡ ︒ ․ ﹒ ۔ ܁ ꓸ —— いずれも full stop
  //   除く: ・ ･ · · ‧ ⸳ —— いずれも中黒・高さ付きドットで、
  //         文中の並列区切りとして普通に使われる（`PDF・doc形式`）。
  // U+02D9（上付き点）もドット類だが full stop ではないので除く。
  // 前回この集合を 12 → 8 へ**縮めてしまった**（独立検証13 F13-03）。
  // 縮めるのは回帰であると D-044 に自分で書いていたのに、
  // 「基準を一貫させる」という理由で 16 形の拒否を失った。
  // 検証13 は 7,084 の実散文で測り、戻しても偽陽性は**0**だと示した。戻した。
  //
  // この集合に**導出原理は無い**。3 度基準を言い直し、そのたびに
  // 例外が見つかった（U+A4F8 は full stop ではなく Lm の**文字**、
  // U+0701 を入れて U+0702 を除く等）。四度目は試みない。
  // **導出されたクラスではなく、列挙された脅威リストである**と明記する。
  // P2J-S37 が全員と除外側を固定し、増減は Human Gate の判断（QD-J13）。
  var DOT_EQUIVALENTS = '\u3002\uff61\ufe12\u2024\ufe52\u2027\u2e33\u0387\u06d4\u0701\ua4f8\u02d9';
  function foldDotEquivalents(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      out += (DOT_EQUIVALENTS.indexOf(ch) !== -1) ? '.' : ch;
    }
    return out;
  }

  // 全角のうち**ファイル名判定に必要な文字だけ**を畳む（dot と英数字）。
  //
  // これは一度「幹を捨てたので寄与 0」と判断して削除し、**回帰を生んだ**（独立検証11 F11-01）。
  // 寄与が無いのはファイル名規則に対してだけで、**他規則に対してはあった**:
  //   U+FF3F `＿` は広い畳みで `_`（**単語文字**）になるが、狭い畳みでは変わらない。
  //   `www` 規則は `\b` を使うので、`＿www` には境界があり `_www` には無い。
  //   つまり `資料＿ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ` は狭い畳みだけが捕まえられる。
  //
  // 教訓: **畳みは他規則の境界アンカーを壊せる**。
  // 「この規則にとって寄与が無い」を「全体にとって寄与が無い」と読み替えてはならない。
  function foldFullwidthFilenameChars(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if ((code >= 0xff10 && code <= 0xff19) ||
          (code >= 0xff21 && code <= 0xff3a) ||
          (code >= 0xff41 && code <= 0xff5a) ||
          code === 0xff0e) {
        out += String.fromCharCode(code - 0xfee0);
      } else {
        out += text.charAt(i);
      }
    }
    return out;
  }

  // 不可視の書式制御文字を**削除**する。
  //
  // 独立検証12 F12-06。これまでの normalizer はすべて**置換**写像だったので、
  // 文字を**挿入**する回避には原理的に届かなかった:
  //   `www\u200b.example.com` / `https\u200b://…` / `tanaka\u200b@…` / `構造計算書.p\u200bdf`
  // これは「集合の全員を押さえたか」では見つからない——
  // 集合は完全だったが、**種類**が欠けていた。
  // U+00AD や U+FEFF は Word / PDF / メーラからの貼り付けで**事故的に**入る。
  // 不可視文字は**Unicode クラスから導出**する。手書きの 24 文字列挙だったときは
  // 実際に存在する 430 のうち 23 しか閉じていなかった（独立検証13 F13-01）。
  // U+FE0F（絵文字対応エディタが日常的に出す）や TAG ブロックが抜けていた。
  // 「種類を追加した」だけでは不十分で、**集合を導出する**必要があった。
  var FORMAT_CHARS = /[\p{Cf}\p{Variation_Selector}\u034f]/gu;
  function stripFormatChars(text) {
    return text.replace(FORMAT_CHARS, '');
  }

  // 日本語 Windows の path 区切りは画面上も入力も `\u00a5` である
  // （JIS X 0201 で 0x5C が YEN SIGN）。`C:\u00a5Users\u00a5案件` は実際にこう書かれる。
  // windows-absolute-path / unc-path は本Campaign で一度も見ていなかった規則で、
  // この形は全部素通りしていた（独立検証13 F13-07）。
  // 通貨表記（`\u00a51,500,000`）は規則が英字+コロンか重複区切りを要求するので影響しない。
  function foldYenToBackslash(text) {
    return text.replace(/[\u00a5\uffe5]/g, '\\');
  }

  // Unicode 正規化（NFKC）。数学用英字等の astral lookalike
  // （`\ud835\uddc0\ud835\uddc0\ud835\uddc0.example.com`）を ASCII へ戻す。
  // 手書きの畳みでは追いきれない範囲なので、標準の写像を使う。
  function foldCompatibility(text) {
    try {
      return text.normalize('NFKC');
    } catch (e) {
      return text;
    }
  }

  // この配列は**追加のみ単調**である。削除と差し替えは回帰しうる。
  // P2J-S34 は**どの normalizer が居るか**を名前で固定する——
  // 以前は個数（=== 2）しか見ておらず、削除と追加を同時にやると
  // 個数が変わらず **guard が黙って通した**（検証11 F11-01）。
  // 集合は 3 つの**種類**を持つ: 置換写像 / 削除 / 標準正規化。
  // 「全員を押さえたか」だけでは種類の欠落は見えない（検証12 F12-06）。
  var TEXT_NORMALIZERS = [foldFullwidthFilenameChars, foldFullwidthAscii, foldDotEquivalents,
                          stripFormatChars, foldCompatibility,
                          foldYenToBackslash];

  // 拡張子集合は**ここが唯一の定義**である。
  // 消費側の一つは project-config/miyoshi.js の FILENAME_LIKE_CASE_ID_PATTERN
  // で、そちらがこの値を読んで組み立てる（依存の向きは一方向のまま）。
  // 独立検証6 F3: 以前は「同じ集合を使う」と**コメントで述べているだけ**
  // だったため、こちらを拡張した瞬間に 2 つがさして、caseId 側で
  // `plan_dwg` は拒否 / `plan_jww` は受理 という、本修理が閉じたのと
  // まったく同じ非対称が隣のモジュールで再現していた。
  // 同じことを 2 か所で判定しない（本Campaignの反復する教訓）。
  var PRIVATE_DOCUMENT_EXTENSION_SOURCE = 'pdf|dwg|dxf|jww|jwc|xdw|sfc|p21|ifc|dwf|pln|rvt|skp|xls[xm]?|doc[xm]?|ppt[xm]?|od[tsp]|jpe?g|png|gif|bmp|tiff?|heic|heif|webp|zip|rar|7z|lzh|tar|gz|msg|eml|txt|csv|bak';
  // 幹（dot の前の非区切り文字列）を**要求しない**。`.ext` だけを見る。
  //
  // 幹を要求する形は本Phase で 6 度修理され、そのたびに区切り文字の選び方で
  // 新しい素通りを生んだ。原因は要求が矛盾していることである（独立検証10）:
  //   幹が周囲の散文を飲み込まないよう → 区切り文字は**多く**したい
  //   区切りを含むファイル名を見逃さないよう → 区切り文字は**少なく**したい
  // space / 括弧 / 引用符 / カンマは散文の区切りであり、同時に Windows・macOS で
  // 合法なファイル名文字でもある。どちらを取ってももう一方が壊れる。
  // 実際 `plan (1).pdf`（Explorer が自分で付ける名前）は 10304/10304 素通りしていた。
  //
  // よって幹を捨てる。これは tag 規則で既に下したのと同じ判断である——
  // 「巧妙な例外を足さない。偽陽性を受け入れて素通りを消す」。
  // 実測: 出荷済みの publicDescription 9 件は 1 件も影響を受けない。
  // 副次効果として `{1,120}` の ReDoS 面と QD-J04 のコストガードも消える。
  //
  // 語境界 `(?![A-Za-z])` は残す: `.doc` が `document` の中でマッチしないよう。
  var PRIVATE_DOCUMENT_FILENAME = new RegExp(
    '\\.(' + PRIVATE_DOCUMENT_EXTENSION_SOURCE + ')(?![A-Za-z])', 'i');


  // public-safe boundary（RF-02）: publicDescription（および将来
  // publicEvidenceDescription等）へ渡してよいテキストかどうかを検証する
  // 共通ガード。既知のURL/パス/プロバイダ/opaqueトークンのパターンに
  // マッチした場合のみ拒否する「既知パターンの自動検出」であり、
  // 正式案件名・機密名称等の非パターン文字列までは検出できない
  // （repository-wide review・Human reviewが別途必要）。
  var PUBLIC_UNSAFE_TEXT_PATTERNS = [
    // 左文脈のアンカー（`\b` / `(^|\s)`）は外してある（独立検証12 F12-01）。
    // 日本語の散文は URL や path の前に空白を置かないので、
    // `図面は/home/user/案件/最新版 に置いた` はアンカー付きでは**一度も発火しない**。
    // commit したグリッド（P2J-S38 / corpus.mjs LEFT_CONTEXTS）では
    // 17 前置き × 7 payload = 119 中 74 が通っていた（測定可能な値）。
    // 最も痛いのは、この規則が `資料＿ｗｗｗ．…`（全角）を拒否しながら
    // それが正規化された先の `資料_www.example.com` を通していたこと。
    // 過剰拒否側のコスト（`showwww.` 等）は受け入れる——fail closed。
    { name: 'url-scheme', pattern: /[a-z][a-z0-9+.-]*:\/\//i },
    { name: 'www', pattern: /www\./i },
    { name: 'known-private-provider', pattern: /drive\.google|docs\.google|notion\.(so|com)|sharepoint|dropbox/i },
    { name: 'windows-absolute-path', pattern: /[A-Za-z]:\\/ },
    { name: 'unc-path', pattern: /\\\\[^\\\s]+\\[^\\\s]*/ },
    { name: 'unix-home-or-absolute-path', pattern: /(~\/|\/Users\/|\/home\/|\/mnt\/)/ },
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
    // 正規化形にも同じ pattern を使う。
    // 以前は正規化形専用の「語境界無し」変種を当てていたが、
    // 正規化形は**入力のどこかに**全角があれば存在するので、
    // 無関係な ASCII 識別子まで境界無しで見られていた（独立検証10 F10-01）。
    // 入力全体の性質から局所の語境界を推定できるという前提が誤りだった。
    { name: 'private-document-filename', pattern: PRIVATE_DOCUMENT_FILENAME },

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
    { name: 'html-like-tag', detect: containsHtmlLikeTag },

    { name: 'markup-construct', pattern: /<!--|<!\[CDATA\[|<!DOCTYPE|<\?[A-Za-z]/i },

    // 非印字の制御文字。黙って落とさず fail closed にする。
    // 改行 (\n \r) と タブ (\t) は**意図的に許容**する:
    // 現行の publicDescription 11件はいずれも使っていないが、
    // 使うこと自体は privacy 上の危険ではなく、
    // ここで新たに拒否すると理由のない挙動変更になる（Wave 5 で実測して決めた）。
    { name: 'control-character', pattern: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/ }
  ];

  function assertPublicSafeEvidenceText(text, label) {
    if (typeof text !== 'string' || !text) {
      throw new Error((label || 'publicDescription') + ' must be a non-empty string');
    }
    // 正規化形を一度だけ作る。元と同じなら検査する意味が無いので落とす。
    // （以前は `hasFullwidthForm` が範囲を**2 重に持っていた**ので、
    //  そちらの下端だけが未固定で変異が生き残った——独立検証9 F9-04。
    //  同じ判定を 2 か所に置かない）
    // 正規化形の**閉包**を作る。各 normalizer を個別に 1 回だけかけるのでは不十分で、
    // 合成が必要な形がある（独立検証10 F10-06）:
    //   `構造計算書。ｐｄｆ` は dot 写像だけでも全角畳みだけでも届かず、
    //   両方をかけて初めて `構造計算書.pdf` になる。
    // 閉包なので normalizer を追加しても合成を手で列挙し直す必要がない。
    var normalized = [];
    var frontier = [text];
    // guard は「黙って打ち切る」形にしない。打ち切ったら閉包が不完全になり、
    // どの形を見逃したか誰も気づかない（本Campaign が繰り返し罰してきた形）。
    // 現在の normalizer はすべて冪等かつ可換なので深さは高々 3。
    var guard = 0;
    while (frontier.length) {
      guard++;
      if (guard > 16) {
        throw new Error('assertPublicSafeEvidenceText: normalization closure did not converge');
      }
      var next = [];
      for (var q = 0; q < frontier.length; q++) {
        for (var k = 0; k < TEXT_NORMALIZERS.length; k++) {
          var form = TEXT_NORMALIZERS[k](frontier[q]);
          if (form !== text && normalized.indexOf(form) === -1) {
            normalized.push(form);
            next.push(form);
          }
        }
      }
      frontier = next;
    }
    for (var i = 0; i < PUBLIC_UNSAFE_TEXT_PATTERNS.length; i++) {
      var entry = PUBLIC_UNSAFE_TEXT_PATTERNS[i];
      // 全角畳みは**ここ 1 か所だけ**で行う。以前はファイル名規則の
      // 中だけで畳んでいたため、他の 10 規則は全角の IME 出力を見逃していた
      // （検証8 F8-05: `ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ` や全角の private provider URL が素通り）。
      // raw ∨ folded なので単調——拒否を増やすだけで決して減らさない。
      // detect 規則（html-like-tag）には適用しない: `＜img＞` は Chromium で
      // 要素を生まないので、畳んで拒否すると過剰拒否になる（P2J-S27）。
      var matched;
      if (entry.detect) {
        matched = entry.detect(text);
      } else {
        matched = entry.pattern.test(text);
        for (var f = 0; !matched && f < normalized.length; f++) {
          matched = entry.pattern.test(normalized[f]);
        }
      }
      if (matched) {
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
    PRIVATE_DOCUMENT_EXTENSION_SOURCE: PRIVATE_DOCUMENT_EXTENSION_SOURCE,
    // 範囲の端点をテストから直接押さえるために export する（P2J-S32）。
    foldFullwidthAscii: foldFullwidthAscii,
    foldFullwidthFilenameChars: foldFullwidthFilenameChars,
    foldDotEquivalents: foldDotEquivalents,
    stripFormatChars: stripFormatChars,
    foldYenToBackslash: foldYenToBackslash,
    foldCompatibility: foldCompatibility,
    DOT_EQUIVALENTS: DOT_EQUIVALENTS,
    TEXT_NORMALIZER_COUNT: TEXT_NORMALIZERS.length,
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
