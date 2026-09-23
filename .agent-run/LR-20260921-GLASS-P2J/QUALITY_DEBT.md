# Quality Debt — LR-20260921-GLASS-P2J

## QD-J01 — `assertOrdinaryObject` がリポジトリ内に3実装ある（Wave 1実測）

```text
project-config/evidence.js : Wave 1で追加（Evidence契約の正）
project-profile.js:120     : Phase 2H F6 で追加
review-package.js:189      : Phase 2I で追加
```

**3つは同一ではない**（Wave 6の独立検証 A1〜A3 のうち A3 の指摘で判明）。
Wave 1 の時点では同一だったが、Wave 5 で `evidence.js` 側にだけ
2つのガードを足したため、現在は次のように**差がある**:

```text
evidence.js      : null/typeof/Array.isArray ガード
                   prototype 判定
                   own "__proto__" ガード        ← Wave 5で追加
project-profile.js: prototype 判定のみ
review-package.js : prototype 判定のみ
```

判断が割れうる箇所（null prototype を通すか）については3つとも
同じ決定をしている（`proto !== Object.prototype && proto !== null`）。
これは実測で確認済みである（D-004）。

**現時点で脆弱性は生じていない**ことも実測で確認した:
`project-profile.js` は生JSONの段階で `FORBIDDEN_RAW_KEYS` により
own `"__proto__"` を拒否しており、`review-package.js` は deserializer を
そもそも公開していない（`buildReviewPackage` のみ）。
したがって不足しているガードに到達する経路が無い。

debt の内容は2つある:
1. 3実装が**すでに divergent** であり、片方だけ見て他方を推測できない
2. 将来ひとつだけ変更されて判断が割れる可能性
統合しなかった理由:

- `project-profile.js` / `review-package.js` は現在 `evidence.js` に依存していない。
  汎用のobject形状述語のために、UI/report層から Evidence契約層への依存辺を
  足すのは層として逆であり、Wave 1 の mandate（§2 inventory と generic Evidence
  hardening）の外でもある。
- `tests/review-package.test.js` は review-package 側の定義数と呼び出し数を
  pinしている。ここを動かすのは Wave 1 の範囲を超える churn になる。

Hard Gate には該当しない。Hard Gate の "prototype boundary" は
**境界が破れていること**を指すが、境界自体は9経路すべてで閉じていることを
実測済みであり、3実装それぞれが独立にテストで守られている。

対処案（将来phase）: 汎用述語を層に依存しない小moduleへ切り出すか、
`evidence.js` の実装を正として他2つがそれを解決する。
**統合する場合は `evidence.js` 側（ガードが最も多い）を正とすること。**
「同一だから、どれを残してもよい」という読み方は誤りである。
どちらも Phase 2J の目的（Evidence closure）とは独立に行える。


## 規則

Hard Gate（TASK_PACKET_SNAPSHOT.md §32）に該当する事象は Quality Debt 化できない。
発生した場合は `BLOCKED` へ遷移する。

```text
runtimeでのtrust promotion / Evidence-first順序の破れ /
案件事実の推測 / private referenceの流出 / Evidence gateの二重実装 /
partial closureをcase promotionへ格上げ / MISMATCHの握り潰し /
candidateによるcurrent config変更 / apply API / candidate import-to-trust /
prototype boundary / verifiedCasesの変更 / 計算regression
```

Phase 2Fから引き継ぐ Explicit unverified items 4件は Quality Debt ではない。
一次資料が提供されるまで構造的に解消できない外部依存であり、
Phase 2J はそれを**閉じる**phaseではなく、**閉じる条件を機械可読にする**phaseである。

## QD-J02 — `ProjectProfile.createProfile` が継承fieldを消費する（Wave 6 再検証 F3）

```text
再現:
  ProjectProfile.createProfile(Object.create({ label: 'x', windDefaults: <valid> }))
  → ACCEPTED

機序:
  assertAllowedKeys(input, ['label','windDefaults']) は Object.keys ベースなので
  継承keyを見ず**空虚に真**になり、input.windDefaults が prototype chain から読まれる。
  createProfile は assertOrdinaryObject を呼んでいない
  （呼んでいるのは assertRuntimeProfile 側だけ）。
```

これは Wave 1 で名付けた **inherited-field consumption** と同じクラスである。

### 現時点で到達可能な害は無い（実測）

```text
- trust elevation なし: 結果は verificationStatus 'user_input_unverified' のまま
- 値の注入なし        : 得られるのは呼び出し側が直接渡せる値と同じもの
- custom-prototype の windDefaults 自体は拒否される
- deserializeProfile は生JSON段階で FORBIDDEN_RAW_KEYS により
  own "__proto__" / "constructor" / "prototype" を拒否する
```

### Phase 2J で修理しない理由

```text
- Phase 2H の API であり Phase 2J の entry point ではない
- packet §46 が「scope を無関係な refactor へ広げない」と明示している
- 独立検証も Info（Hard Gate でも Required Fix でもない）と分類している
```

**無害だから存在しない、ことにはしない。** クラスとしては残っているため、
将来phaseで `assertOrdinaryObject` を Phase 2H 側の入口
（`createProfile` の `input`）にも適用する候補として記録する。
QD-J01 の統合案と同じ方向であり、まとめて扱えるとよい。

## QD-J03 — public-safe prose ガードに残る既知の穴（Wave 6 再検証 F2 の残り）

```text
&lt;script&gt;   entity encode 形
< b>  </ b>      `<` の直後が空白
```

いずれも旧パターンでも通っていた（Wave 6 の変更による後退ではない）。

**塞いでいない理由**: entity形は散文が「エスケープの説明」として書く可能性があり、
拒否すると誤検知側の実害が出る。`< b>` はタグの形というより散文の形である。

本ガードは **known-pattern detector** であり、
非パターンの私的名称（正式案件名・人名）は原理的に検出できない
（`evidence.js` のコメントに明記）。DOM側は `textContent` / `createElement` で
別に守られており、Production UI に Observation 投入経路は存在しない。
公開前の repository privacy scan と Human review は引き続き必要である。

## QD-J04 — public-safe prose の一部パターンが二次コストを持つ（3回目検証 Finding 4）

```text
自己再測定（N を倍にすると時間が約4倍 = 二次）:
  email-like  'a@'+'b.'*N   N=1000  8ms
                            N=2000 25ms
                            N=4000 98ms
                            N=8000 401ms
  tag pattern '<a b=c '*40000（280KB） 7ms   ← 線形。本Phaseで触った箇所は問題なし
```

二次なのは `email-like` / `url-scheme` / `private-document-filename` で、
いずれも Phase 2J で追加・変更していない（`email-like` は Wave 5 追加だが
形は単純な連結であり、二次性は `url-scheme` 等と同じ既存クラス）。

> **【D-038による訂正（独立検証5 Finding 5）】この段落は 2 点誤り。**
>
> 1. `private-document-filename` は Phase 2J で**変更している**。
>    Wave 6d で幹を日本語対応にし、D-038 で拡張子と全角形を追加した。
> 2. `private-document-filename` は**二次ではなく線形**である。
>
> 規則別の再実測（パイプライン全体ではなく規則単体を測る）:
>
> ```text
> 入力 ("ab.")*N            N=1000   2000    4000    8000   16000
>   private-document-filename  1.9ms   3.5ms   7.0ms  14.2ms  28.1ms  ← 線形
>   email-like                 5.0ms  19.9ms  79.9ms 307.6ms 1289.8ms ← 二次
>   url-scheme                 1.7ms   7.4ms  26.4ms 126.9ms  441.5ms ← 二次
>   html-like-tag（新スキャナ）  0.0ms   0.0ms   0.0ms   0.0ms   0.0ms
> ```
>
> 当初の測定は `assertPublicSafeEvidenceText()` 全体を測っており、
> `ab.ab.ab…` は `email-like` の文字クラスに丸ごと収まるため、
> **隣の規則の二次性をこの規則に帰属させていた**。
> 線形なのは `{1,120}` の上限が幹の走査を打ち切るからで、
> tag 規則の `{0,300}`（区切られた本体にかかる上限）とは位置が違う。
> 同じ「上限」でも、自由な前置にかかる上限は素通りを生まず、
> 区切られたスパンにかかる上限は素通りを生む。この非対称が
> Finding 1 を見逃した直接の理由である。

**現時点で実害は無い**:

```text
- hang ではなく degradation（指数ではなく二次）
- Production UI に Observation 投入経路が無い（入力要素 0 / 実測）
- 到達するのは config 著述時と API 直接呼び出しのみ
```

対処案（将来phase）: `publicDescription` に長さ上限を設ける。
上限1つで全パターンのコストを同時に有界化できる。
現行の11件は最長でも数百文字であり、4000字程度の上限なら実害なく入る。
本Phaseでは §46（scope を広げない）に従い記録に留める。

> **【D-039による追記（検証6 F6）】scanner の線形性根拠が空だった。**
> 前回掲げた `("ab.")*N` には **`<` が 1 つも無い**ので、scanner は
> 最初の `indexOf('<')` で −1 を返して終わる。何も測っていなかった。
> 結論（線形）は正しかったが、その証拠は無効である。再実測:
>
> ```text
> （すべて `<` を含む）        N=1000  2000  4000  8000 16000 32000
>   "<"*N                        0.08  0.16  0.29  0.10  0.26  0.74 ms
>   "<1"*N （名前なし・最悪ケース） 0.02  0.05  0.09  0.18  0.37  0.72 ms
>   "<a"*N（`>` 無し）            0.00  0.00  0.00  0.00  0.00  0.00 ms
>   "<a "+x*N+">"                0.00  0.00  0.00  0.00  0.00  0.00 ms
> ```
>
> 最悪ケース（すべての `<` を走査する形）できれいに倍増しており線形。
> `>` が無ければ即座に確定するので 0.00ms になる。

## QD-J05 — タグ判定は空白の無い比較を拒否する（意図的に受け入れたコスト）

```text
現実的な散文 20形のうち 8形（40%）が拒否される（実測 / D-036）:
  <Table 2> の値を採用した。      <JIS A 4706> に準拠する。
  記号 <W> は見付幅を表す。        <TBD> 社内資料の再確認待ち。
  配列は Array<number> 形式…      改行は <br> で表す。
  W<H かつ P>Q である。            P<Q かつ R>S のとき
```

比較については「空白を置く」で回避でき、組版としても正しい。
しかし角括弧参照や generics は**記法そのものが変わる**
（`<Table 2>` → `< Table 2 >`）ので、
「書き方が決まるだけ」という説明はそれらについては言い過ぎだった（D-036で訂正）。

回避手段は複数あり、いずれも和文として自然である（実測で通ることを確認）:

```text
＜Table 2＞   〈Table 2〉   「Table 2」   表2   <注1>   <Fig. 3>
W < H かつ P > Q（空白付き比較）   5<Z<40（`>` で閉じないため元から通る）
```

`A<B C>D`（散文）と `<td nowrap>`（タグ）は文字構成が同一であり、
`<…>` の中だけを見る規則では原理的に分離できない（D-032）。
素通りを無くすことを優先し、誤検知側を受け入れた。

**回避方法が存在する**ことが受け入れの根拠である:
比較演算子の前後に空白を置けば通る。組版としても正しい書き方であり、
「書けなくなる」のではなく「書き方が決まる」だけである。

P2J-S17 に `assert.throws` として明示的に固定してあるため、
このコストは暗黙の挙動ではなくテストが読める仕様になっている。

将来、より広い散文形を通したくなった場合でも、
**例外を作り込む方向で解こうとしないこと**。
同じ箇所を3度壊した原因がそれである（D-032）。

> **【D-039による追記（検証6 F5）】記法コストは scanner 化で**広がった**。**
> scanner は「`<`+英字がどこかにあり、`>` がそれより後ろにある」で拒否する。
> 2 つは**無関係でよい**ので、旧 regex なら通っていた次の散文が落ちる:
>
> ```text
> たわみd<Dmaxかつ設計風圧力P>Pa        旧: 通る  新: 拒否
> 見付幅W<Hとなる場合、P>Qで検討する   旧: 通る  新: 拒否
> 5<Z<40 の範囲、かつ P>Q                旧: 通る  新: 拒否
> A<B。C>D。                              旧: 通る  新: 拒否
> ```
>
> 重要: `5<Z<40` 単体は通るが、**同じ publicDescription の後ろに `>` を置くと
> 反転する**。P2J-S17 / P2J-S27 は単体形だけを固定している。
>
> ただし Chromium 実測では上の 4 形は**いずれも実要素を生む**ので、
> 拒否すること自体は Wave 5 §8 の要求に合っている。問題はコストの**報告値**であり、
> 「既存の accept をすべて保持」という D-038 の記述は誤りだった。
> 回避手段は従来どおり「比較演算子の前後に空白を置く」（`W < H かつ P > Q` は通る）。

## QD-J06 — tag クラスを retire / 置換すべきか（4回目検証 Q4 / Human Gate 申し送り）

独立検証4の結論を、判断材料としてそのまま残す。

### 残すべきとされたもの: privacy クラス

`url-scheme` / `www` / private provider / path / `email-like` /
`private-document-filename` は**実際の開示リスク**を守っており、他に関門が無い。
本campaign唯一の実害に近い指摘（日本語ファイル名の素通り / D-034 Finding 2）も
ここで見つかった。**effort はここに置くべき**、というのが検証者の評価である。

### この形では retire / 置換を勧められたもの: tag クラス

```text
- DOM は独立に安全（positive control 付きで実証: 実renderer経由で
  要素生成 0 / 実行 0。sink はすべて textContent / createElement）
- Production UI に Observation 投入経路が無い（closure領域の入力要素 0）
- publicDescription は人が書く config 散文であり PR diff に載る
- tag クラスは 4回の試みで 4つの欠陥を出した
- 記法コストは実測で 40%（QD-J05）
```

### 本Phaseで retire しなかった理由

```text
- Task Packet（Wave 5 §8）が「tag形の内容を Evidence 境界で拒否する」ことを
  明示的に要求している。bound requirement であって実装者の裁量ではない
- §46 が scope を広げないことを求めている
- retire は挙動の縮小であり Human Gate の判断が要る
```

### 検証者が測定した選択肢（決定ではなく材料）

```text
(a) 現状維持（本Waveの修理後）
    本体 `[^>]{0,300}`。素通り 0（独立corpus 3458形で確認）／線形／
    既存の accept をすべて保持。記法コストは QD-J05 のまま。

    【D-038による訂正】(a) の記述は誤りだった。
    「素通り 0」は成立していなかった。`{0,300}` の上限そのものが
    **全面的な素通り**であり（本体 301 文字以上で規則が失効）、
    加えて tag name の文字クラスが HTML5 より狭く `<img:` が通っていた。
    「3458形で確認」の 3458 も実測値ではなく（真値 6650）、その corpus は
    上記 2 軸をもともと含んでいなかったので、何も確認していない。
    よって (a) は選択肢として**消滅した**。現在は (d) を採用済み。

(b) `<` と `>` の両方を含むテキストを拒否する
    自明に正しく自明に線形。既存11件と非`>`の accept は保持。
    ただし `W < H かつ P > Q`（文書化した回避手段）も落ちるため、
    記法コストは (a) より**大きくなる**。

(c) tag クラスを retire し、privacy クラスに集中する
    DOM 安全性と入力経路不在が根拠。Task Packet の要求を変更する必要があるため
    Human Gate 案件。

(d) regex をやめ、HTML5 tokenizer に忠実な線形スキャナに置き換える
    ← **採用（D-038）**
    accept 集合は (a) と同じ、記法コストも 40% のまま、線形も維持した上で
    素通り **0**。
    【D-039による訂正】「accept 集合は (a) と同じ」「記法コストも 40% のまま」は誤り。
    scanner は `<`+英字 と `>` が**無関係に並んでいるだけ**で拒否するため、
    `たわみd<Dmaxかつ設計風圧力P>Pa` 等が新たに落ちる。
    拒否自体は正しい（Chromium で実要素を生む）がコストは広がっている。Task Packet の変更を**要さない**——要求された拒否を
    狭めるのではなく**強める**側への変更だからである。
    実測: 16000 繰り返し入力で 0.0ms（旧 regex は 280KB で 7ms）。
```

### 現在の状態（D-038 後）

```text
採用: (d) tokenizer 忠実な線形スキャナ
消滅: (a)（前提していた「素通り 0」が偽だった）
残存: (b) と (c) は依然として Human Gate の選択肢

Human Gate への申し送りは**縮小したが消えていない**:
tag クラスは正しくなったが、QD-J05 の記法コスト（40%）と
「DOM は独立に安全なのにこのクラスを持つか」という問いは残る。
ただし「欠陥が出続けるから retire」という根拠は、(d) により弱くなった。

## QD-J07 — 未閉タグの受理は「連結されない」に依存する（D-038 自己測定）

新スキャナは `<img src=x onerror=alert(1)`（`>` 無し）を**受理**する。
根拠は Chromium 実測で要素が 0 個だからであり、これは単体では正しい。

しかし測定中に自分の harness がこれを壊した——`<tbody><tr>` に包んで
`</tr></tbody>` を**後ろに足した**ところ、その `>` が未閉タグを閉じ、
要素が 1 個生まれた。`5<Z<40 の範囲` も同じ理由で `<z<40>` になった。

```text
つまり未閉タグの安全性は「後続テキストに `>` が無い」に依存する。
現在は安全:
  - publicDescription の sink はすべて textContent / createElement（Wave 4 実測）
  - innerHTML への経路が無いので、連結されてパースされる場が無い
壊れる条件:
  - 将来誰かが publicDescription を他の文字列と連結して innerHTML に渡したとき
```

今回は対応しない。`>` 無しを拒否すると `3 < 5` や `5<Z<40` も落ち、
QD-J05 の記法コストが (b) 相当まで上がるからである。
代わりに**依存している不変式をここに明記する**: publicDescription を
innerHTML 経由で描画しないこと。これを破る変更は本 QD を再評価すること。

> **【D-039による訂正（検証6 F9）】不変式の置き場所が 1 つずれていた。**
> 「innerHTML への経路が無い」は正確ではない——index.html に innerHTML sink は存在する。
> 守っているのは (1) `publicDescription` 自体は textContent にしか到達しないことと、
> (2) 他の sink が `escHtml()` を経由すること。結論は変わらないが、
> 「innerHTML 経路が無いから安全」と読んだ人が `escHtml` を外すと壊れる。
> 不変式は「**publicDescription を textContent 以外で描画しない**」と
> 「**他の sink は escHtml を通す**」の 2 つ。

## QD-J08 — `Object.freeze` は浅く、`detect` は影箋経路を増やした（検証6 F8）

`Object.freeze(PUBLIC_UNSAFE_TEXT_PATTERNS)` は**配列だけ**を凍結し、
12 個の entry オブジェクトは extensible のままである。
さらに消費ループが `entry.detect ? entry.detect(text) : entry.pattern.test(text)`
になったことで、pattern のみの entry に `detect` を**後から追加**すると
元の regex を黙って影箋できる。

```text
前提としているのは「同一 realm に敵対コードが居ない」ことであり、
それが崩れるなら guard 以前の問題。よって実害は無い。
ただし既存テストは isFrozen(配列) しか主張していないので
（= overclaim していない）、今回は記録に留める。
deep freeze するなら entry 単位で freeze すること。
```

検証6 が確認した健全性: 12 entry すべてが `detect`/`pattern` の**どちらか一方のみ**を
持ち、順序は変わらず、すべて発火する。配線自体に欠陥は無い。

## QD-J09 — `markup-construct` は comment 構文に一貫していない（検証6 F7）

`<!--x-->` は拒否されるが、`<!社内資料 検討書 による>` は受理される。
後者は Chromium で `#comment` ノードになり、**囲まれたテキストが
描画から黙って消える**。要素は生まないので DOM 安全性の問題ではなく、
描画の欠落（読み手が記述を見失う）の問題である。privacy クラスとは無関係。

## QD-J10 — caseId の filename-like 検査があるのは空の経路だけ（検証7 F7-04 / Human Gate）

D-039 F3 で `PRIVATE_DOCUMENT_EXTENSION_SOURCE` を単一化し、
`miyoshi.validateVerifiedCase` の caseId 検査を直した。それ自体は正しい。
しかし**その validator が守っている `verifiedCases` は空配列**である。

実際に export package へ到達する caseId は別の経路を通る:

```text
workspace.js        assertCaseId          → filename-like の検査 **無し**
project-profile.js  SCENARIO_ID_PATTERN   → 同じパターン、検査 **無し**
review-package.js   REVIEW_CASE_KEYS に caseId を含み、伏せるのは label のみ
                    → privacyMode:'redacted' でも caseId はそのまま出る
```

自己実測（workspace.assertCaseId）:

```text
  ACCEPT  plan_jww          ← D-039 F3 が「閉じた」と書いたまさにその例
  ACCEPT  plan_pdf          ← 拡張子を広げる前の一覧ですら検査されない
  ACCEPT  A-102_dwg
  ACCEPT  structural_xlsx
```

つまり問題は「片方だけ拡張した」ではなく、**もともと検査の無い経路がある**ことである。

### 本Phase で直さない理由

```text
- workspace.js は「Evidence を持たない」ことを明示的な契約としているモジュールであり、
  evidence.js への依存を足すのはその契約を破る
- こちらは**空ではない経路**であり、検査を追加すると
  既存の保存済み workspace（caseId が `plan_pdf` 等）が読めなくなる
- よって「拒否を強めるのだから packet 変更不要」とは言えない——
  ユーザデータの互換性を壊す変更である
- §46（scope を広げない）
```

Human Gate の判断材料として残す。選択肢は
(a) workspace/profile 側にも同じ検査を入れる（既存データの移行が必要）、
(b) review-package.js の export 境界でだけ拒否または伏せる、
(c) caseId を redacted モードで伏せる。

なお `miyoshi.js` 側の根拠コメント（「caseId は export package にそのまま出る」）は
一般論としては真だが、**この validator がその経路を守っていると読めてしまう**ので、
誤読を防ぐ注記をコード側に入れた。

## QD-J11 — 幹を捨てたことの記法コスト（D-043）

`.ext` を含む文字列は前が何であれ拒否されるようになった。
これは意図した fail-closed だが、コストはある。

```text
落ちるようになった例:
  形式は .zip とする        ← 回避: 「ZIP形式とする」（dot を置かない）
  拡張子 .pdf の場合          ← 回避: 「PDF の場合」
落ちない例（実測）:
  index.html / calc.js / README.md / data.json —— 拡張子集合に含まない
  window.document / Workspace.csvEscape —— 語境界 `(?![A-Za-z])` が守る
  出荷済み publicDescription 9 件すべて
```

このトレードは tag 規則で既に受け入れたものと同じであり（QD-J05）、
差し引きでは大幅に良い——徕に 100% 素通りするクラスがあった。
ただし**コストを記録せずに「純粋な利得」と書くのは本Phase で 2 度やっている**ので、
ここに明記する。

## QD-J12 — 「収束していない」という診断への回答（D-043 / Human Gate 向け）

独立検証10 は「6 度の修理は収束しておらず、この設計は局所修理では正しくならない」
と結論した。検証した結果、**理由の部分は正しい**。

```text
正しかった点: 幹を要求する形は要求が矛盾しており、
            区切り文字の選び方を変える限り新しい素通りが出続ける。
したがって  : 局所修理（corpus を増やす）をやめ、述語の形を変えた（D-043）。
            幹を捨てれば矛盾自体が消え、不変式で書ける。
```

残っている Human Gate 案件は変わらない:

```text
QD-J06  tag クラスを retire / 置換すべきか（(b) (c) が残る）
QD-J10  caseId の検査があるのは空の経路だけ。populated な経路は未ガード
QD-J11  幹を捨てたことの記法コストを受け入れるか
```

