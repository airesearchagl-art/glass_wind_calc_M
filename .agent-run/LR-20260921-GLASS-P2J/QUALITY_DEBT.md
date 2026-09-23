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

(b) `<` と `>` の両方を含むテキストを拒否する
    自明に正しく自明に線形。既存11件と非`>`の accept は保持。
    ただし `W < H かつ P > Q`（文書化した回避手段）も落ちるため、
    記法コストは (a) より**大きくなる**。

(c) tag クラスを retire し、privacy クラスに集中する
    DOM 安全性と入力経路不在が根拠。Task Packet の要求を変更する必要があるため
    Human Gate 案件。
```
