# INSTRUMENT INVENTORY と VERIFICATION DEPENDENCY GRAPH

Phase 2K Wave 0。**実装はしていない**——調査と測定のみ。

対象 head: `7bef30751ebaa2aa0f306f3bd584c4e025be77a1`（main）

---

## 0. 先に結論

Phase 2J の QD-J20 は「実装と計器が仮定を共有する」と抽象的に書かれていた。
Wave 0 でそれを**具体的に測った**。結果:

```text
guard-diff の differential は、それが corpus を導出している
production 定数を**縮もす**変更に原理的に気づけない。
2 つの別の定数で再現し、いずれも**実害のある回帰**だった。
```

重要な限定: **`npm test` は両方とも捕らえた**。
盲目なのは differential であって、guard の防御は多重に成立していた。
ただし Run Artifact は differential を「回帰 0 を示す計器」として引用しており、
このクラスの変更については**それを示していない**。

---

## 1. 実験 A — `DOT_EQUIVALENTS` を 1 メンバ縮む

手順（誰でも再現できる）:

```text
1. git clone <repo> <scratch> && git checkout 7bef307
2. project-config/evidence.js の DOT_EQUIVALENTS から \u0387 を 1 つ削る（12→11）
3. node -e で assertPublicSafeEvidenceText('構造計算書<U+0387>pdf') を見る
4. npm test
5. node tools/guard-diff/diff-heads.mjs HEAD
```

測定値:

```text
production の振る舞い : 構造計算書<U+0387>pdf  reject → **ACCEPT**
                     （private-document-filename が素通りする）
npm test           : **658 pass / 1 fail** —— P2J-S37 が捕らえた
diff-heads         : corpus 607,956 / **REGRESSIONS 0** / tightened 0
corpus 内の U+0387 : **0 件**
DOTS 軸のメンパ数  : 17 → 16
```

機構:

```text
tools/guard-diff/corpus.mjs は DOTS を
  ['.','．'] + [...evidenceModule.DOT_EQUIVALENTS] + EXCLUDED_DOTS
で作る。よって定数が縮むと corpus も同时に縮む。
diff-heads は corpus を**検査対象の working tree から**生成するので、
base と target の両方を同じ（縮んだ）corpus で比べる。
消えたメンバを含む入力はそもそも生成されない。
```

これは §24 の「verification tool silently skips inputs」の字面に当たる。
ただし**本 Phase が修理するために送られた対象そのもの**（§1 の QD-J20）であり、
作業を止める理由とは考えていない。Human Gate がこの判断を覚えしたい場合は
そう言ってほしい。

---

## 2. 実験 B — `PRIVATE_DOCUMENT_EXTENSION_SOURCE` を 5 拡張子縮む

`|rar|7z|lzh|tar|gz` を削る。

```text
production の振る舞い : 図面一式.rar  reject → **ACCEPT**
                     計算書.7z    reject → **ACCEPT**
                     計算書.pdf   reject（維持）
npm test           : **656 pass / 3 fail** —— P2J-S24 / P2J-S29 / P2J-TB19
diff-heads         : corpus 578,004 / **REGRESSIONS 0** / tightened 0
```

corpus は 643,284 → 578,004 と 65,280 入力分縮んだのに、
その上で「回帰 0」と報告した。

### この欠陥は Phase 2J で既に診断されていた

`tests/evidence-trust-boundary.test.js` の TB19 の中にこう書いてある:

```text
独立検証9 F9-05: この corpus は検査対象の定数から生えているので、
定数を縮める変更には原理的に気づけない（corpus も一緒に縮む）。
```

つまり **機構は 2 フェーズ前に特定され、test 側だけが修理された**。
corpus 側はそのまま残った。それが QD-J20 の中身である。

---

## 3. Instrument inventory

各 instrument を §5 の 12 項目で記録する。

### I-01 `npm test`（node --test / 18 files / 659 tests）

```text
target          : 全 module の契約
oracle source   : 混在。大半は Class A（実装と同じ仕様を固定）。
                  一部は Class B（P2J-S37 / P2J-TB19 の手書き期待列挙）
共有依存        : production module を require する（被検体としては正当）。
                  下記 6 file が production 定数を期待値側でも使う
hand-maintained : P2J-S37 EXPECTED_DOTS 12、P2J-TB19 拡張子 46、他多数の証人
derived         : Evidence.DOT_EQUIVALENTS / PRIVATE_DOCUMENT_EXTENSION_SOURCE /
                  PUBLIC_UNSAFE_TEXT_PATTERNS / HARD_REJECT_RULES / ADVISORY_LINT_RULES /
                  CHECKED_AT_PATTERN / Closure.CLOSURE_FACT_KEYS / FACT_UNITS 他
positive control: ある。多くの test が「安全な入力は通る」を併記する
negative control: 不完全。test 別にある・ないが混在
reproducibility : 高。`npm test` だけ
committed       : yes
failure class   : node:test の pass/fail。PATCH-MISS 等の分類は持たない
proves          : 固定した契約が壊れていない
does NOT prove  : 未知の欠陥が無いこと。仕様そのものの正しさ
```

### I-02 `tools/evidence-publication-lint.mjs`

```text
target          : 出荷 config の公開面値に advisory 警告が出るか
oracle source   : production の lintPublicEvidenceText（被検体）
共有依存        : **PUBLICATION_FACING_FIELDS を test と共有**（QD-J24）
                  **readdirSync 非再帰を test と共有**（QD-J23）
hand-maintained : PUBLICATION_FACING_FIELDS（3 要素）
derived         : root 集合は project-config/*.js から導出（FP-01 で修理済み）
positive control: ある。FP-01 test が旧動作で落ちることを実演で確認済み
negative control: ある。安全な値で警告 0 を確認
reproducibility : 高。`npm run lint:evidence-publication`
committed       : yes
failure class   : hard 違反で exit 1、advisory だけなら exit 0
proves          : commit された config の公開面値について警告が人に届く
does NOT prove  : runtime 入力の安全（QD-J22）。意味的な開示が無いこと
```

### I-03 `tools/guard-diff/corpus.mjs`

```text
target          : guard の差分検証用入力集合の生成
oracle source   : **なし**。これは oracle でなく入力生成器
共有依存        : **DOT_EQUIVALENTS を production から import**
                  **PRIVATE_DOCUMENT_EXTENSION_SOURCE を呼び出し側経由で受け取る**
hand-maintained : STEMS 4 / DECORATIONS 8 / TRAILING 6 / EXCLUDED_DOTS 3 /
                  PATH_SEGMENTS 17 / LEFT_CONTEXTS / INVISIBLE / RULE_CORES 他
derived         : DOTS（上記 2 定数経由）、拡張子展開
positive control: **なし**。corpus が目的の入力を含んでいることを確かめる test が無い
negative control: なし
reproducibility : 高（関数として）。ただし入力 digest を記録する仕組みが無い
committed       : yes
failure class   : なし（生成器）
proves          : 何も証明しない。入力を作るだけ
does NOT prove  : **網羅性**。導出元の定数が縮むと自分も縮む
```

### I-04 `tools/guard-diff/diff-heads.mjs`

```text
target          : 2 head 間の guard 振る舞い差分
oracle source   : 旧 head の production 自身（differential）
共有依存        : **corpus を working tree から生成**（実験 A/B の根本原因）
                  **first matching rule しか記録しない**（Phase 2J 最終 review の指摘）
hand-maintained : なし
derived         : corpus 全部
positive control: **なし**
negative control: なし
reproducibility : 中。コマンドは簡単だが入力 corpus digest を出さない
committed       : yes
failure class   : REGRESSIONS / tightened の 2 分類だけ
proves          : corpus に含まれる入力について振る舞いが変わったか
does NOT prove  : corpus に含まれない入力。**導出元定数の縮小**。
                  earlier rule に masked された later rule
```

### I-05 `tools/guard-diff/mutants.mjs` + `mutate.mjs`

```text
target          : test が契約を本当に固定しているか
oracle source   : test suite 自身（反事実的）
共有依存        : anchor は source 文字列なので production **意味**には依存しない。
                  ただし SURVIVED/EQUIVALENT の判定に corpus を使うので
                  I-03 の盲点を継承する
hand-maintained : 演算子 30 件（すべて手書き。これは意図的）
derived         : なし
positive control: ある。anchor exact-once 検査と PATCH-MISS 分類
negative control: ある。byte 差分の確認
reproducibility : 高。`node tools/guard-diff/mutate.mjs`。**演算子が commit 済み**
committed       : yes
failure class   : **5 分類**（KILLED/SURVIVED/EQUIVALENT/PATCH-MISS/HARNESS ERROR）
proves          : 各演算子に対して test が反応すること
does NOT prove  : 演算子集合の網羅性。EQUIVALENT は probe の解像度依存（QD-J21）
```

### I-06 browser harness × 5（`tools/browser-checks/`）

```text
target          : index.html を実ブラウザが file:// で解釈したときの振る舞い
oracle source   : **実 Chromium**。これが本リポジトリで最も独立な oracle（Class B/C）
共有依存        : parser-boundary は production を require するが
                  期待値は Chromium が供給するので §8 違反ではない
hand-maintained : 証人集合（tag 名 13 × 不可視 15 他）
derived         : なし
positive control: ある。README が sabotage 実験を記録（containsHtmlLikeTag を
                  return false へした copy が 19 bypass を報告することを実測）
negative control: ある。over-rejection を bypass と別々に報告
reproducibility : **中**。committed で self-locating だが
                  Playwright を `/opt/node22/...` の絶対 path で import する。
                  devDependencies は空。別環境では import 行の修正が必要
committed       : yes（README 59 行付き）
failure class   : exit code + 件数。parser-boundary は bypass / over-rejection を分離
proves          : その head の index.html が実ブラウザでどう振る舞うか
does NOT prove  : 別環境・別ブラウザでの振る舞い。実行していない head のこと
```

### I-07 protected-value probe / project-state probe

```text
target          : verifiedCases / V0 / roughness / dimensions / closure state
oracle source   : なし——**committed されていない**
共有依存        : （存在しない）
hand-maintained : 毎回手で書く node -e
derived         : なし
positive/negative control : なし
reproducibility : **低**。前回のコマンドがどこにも残っていない
committed       : **no**（browser-w4 の B-facts と stageA-regression に部分的にある）
failure class   : なし
proves          : その場で見たということ
does NOT prove  : 再現可能でないので証拠として弱い
```

> **実測した具体例**: 本セッションは closure 結果の key 名を Phase を越えて
> **3 度違えた**（`closureStatus` / `factSlots` / `slots` は存在しない）。
> 正しいのは `status` / `readySlotCount` / `requiredSlotCount` /
> `readyCategoryCount` / `categoryCount` / `readyCaseScopeCount` / `caseScopeCount` /
> `promotionCandidate`。これが §23 の形そのものである。

### I-08 source / privacy scan

```text
target          : config 全体に private URL/ID が混入しないこと
oracle source   : 手書き regex（project-config.test.js 内）
共有依存        : なし（独立な regex）
hand-maintained : すべて
derived         : なし
positive control: なし（検出されることを確かめる証人が無い）
reproducibility : 高（npm test の一部）
committed       : yes
proves          : その regex に当たる文字列が serialize 結果に無い
does NOT prove  : regex に当たらない開示が無いこと
```

### I-09 Independent Review procedure

```text
target          : 実装セッションが自己認証しないこと
oracle source   : 別実行文脈の検証者（人間が scope を事前固定）
共有依存        : **手順が repo に committed されていない**。
                  Phase 2J では Human Gate が毎回 scope を文章で与えた
hand-maintained : scope 文書（会話内のみ）
reproducibility : **低**。§15 の verifier package が存在しない
committed       : **no**
proves          : 実装者以外が同じ結論に達した（または達しなかった）
does NOT prove  : 次の検証者が同じ scope を再構成できること
```

---

## 4. Verification Dependency Graph

```text
project-config/evidence.js
 ├─ DOT_EQUIVALENTS ............... SHARED  → corpus.mjs DOTS            [実験 A で盲目を証明]
 │                                 SHARED  → P2J-S37                    [手書き期待列と length 一致で盲目を閉じている]
 ├─ PRIVATE_DOCUMENT_EXTENSION_SOURCE
 │                                 SHARED  → corpus.mjs 拡張子軸         [実験 B で盲目を証明]
 │                                 SHARED  → P2J-TB19                   [手書き 46 列挙で盲目を閉じている]
 │                                 SHARED  → miyoshi.js FILENAME_LIKE   [production 内部。意図的]
 ├─ PUBLIC_UNSAFE_TEXT_PATTERNS ... SHARED  → P2J-S48                    [全 entry 列挙。freeze 検査なので審問なし]
 ├─ HARD_REJECT_RULES / ADVISORY_LINT_RULES
 │                                 SHARED  → §17 test                   [名前を deepEqual で固定しているので閉じている]
 └─ normalizationClosure .......... INDEPENDENT → ブラウザは使わない

tools/evidence-publication-lint.mjs
 ├─ PUBLICATION_FACING_FIELDS ..... SHARED  → FP-01 test                 [deepEqual で別途固定。部分的に閉じている]
 └─ readdirSync 非再帰 ........... SHARED  → FP-01 test                 [**UNKNOWN / 未閉**。QD-J23]

tools/guard-diff/corpus.mjs
 └─ 生成した corpus ............... SHARED  → diff-heads / mutate        [両方が同じ盲点を継承]

実 Chromium ....................... INDEPENDENT → browser-checks 5 件
手書き spec 列挙 ................... INDEPENDENT → P2J-S37 / TB19 / §17 / FP-01b
```

### 分類集計

```text
INDEPENDENT           : 実 Chromium oracle、手書き spec 列挙（4 箇所）
SHARED_INTENTIONALLY  : production 内部の定数共有（miyoshi ← evidence）。
                        被検体としての production import。
                        定数を読みながら**手書き期待値で閉じている** test 4 件
UNKNOWN / 未閉        : corpus.mjs の 2 定数導出（実験 A/B で盲目確定。UNKNOWN でなく
                        **確定した盲点**へ格下げ）
                        （publication-lint の readdirSync 非再帰 = QD-J23 は
                         Wave 2 で閉じた。下記 §41 参照）
                        protected-value probe が未 committed（I-07）
                        Independent Review 手順が未 committed（I-09）
```

---

## 5. Wave 0 の結論と次の Wave への引き継ぎ

```text
P2K-F01  diff-heads / corpus は導出元定数の縮小に原理的に盲目。
         2 定数で再現。いずれも private-document-filename の実害あり。
         → Wave 3
P2K-F02  corpus に positive control が無い（目的の入力を含んでいるかを調べない）。
         → Wave 3
P2K-F03  diff-heads が first match しか記録しない。→ Wave 3
P2K-F04  protected-value / project-state probe が committed されていない。
         key 名を 3 度違えたのがその徒。→ Wave 1
P2K-F05  Independent Review 手順（§15 package）が存在しない。→ Wave 1 / Wave 5
P2K-F06  browser harness の Playwright import が環境固定の絶対 path。→ Wave 4
P2K-F07  入力 corpus digest を記録する仕組みが無い（§16 provenance）。→ Wave 1 / Wave 3
```

注: いずれも **Wave 0 では修理していない**。§5 の「最初は実装しない」に従う。

---

# Wave 1 追記 — 分類表（§40）

この表の機械可読版が `tools/verification/verification-spec.json`。
`node tools/verification/manifest.mjs` で展開される。

| Instrument | Class | Admissibility | Why |
|---|---|---|---|
| `npm-test` | regression | **ADMISSIBLE** | 契約を固定する。うち 4 箇所は定数と独立な手書き期待列を持ち、定数の縮小を捕らえる（実験 A/B で実証） |
| `publication-lint` | regression | **ADMISSIBLE** | 警告が描画されることを FP-01 test が positive control 付きで押さえている。Wave 2 で discovery を再帰化し、oracle を実装と別機構に分離（QD-J23 閉） |
| `lint-discovery-depth-experiment` | independent | **ADMISSIBLE** | 外から shipped lint と shipped suite を見る。guard から何も import しない。before/after が両方再現可能 |
| `guard-diff` | regression | **ADMISSIBLE**（Wave 3 で再認定） | corpus が自分の脅威リストを持ち、project-config を一行も参照しない（P2K-D01 が source で錠）。Wave 0 の盲点 2 例が 0 → 26,496 / 0 → 32,000 と見えるようになった。completeness は証明しない（P2K-F10） |
| `mutation` | regression | DIAGNOSTIC_ONLY | KILLED は npm test が判定するので強いが、SURVIVED/EQUIVALENT の分岐は guard corpus の probe が判定するので他 file には適用できない。Wave 3 で suite の読み方を修正（P2K-F09）。この分類は **判断**であり P2K-M09 が literal で固定する |
| `project-state-probe` | observational | **ADMISSIBLE** | 実 API 経由。期待値は test 側の手書き。式を転記していないことを test が検査 |
| `browser-w4` | observational | UNVERIFIED | 現 target head の測定が存在しない |
| `probe-w4` | observational | UNVERIFIED | 同上 |
| `failopen-w4` | observational | UNVERIFIED | 同上 |
| `stageA-regression` | observational | UNVERIFIED | 同上 |
| `parser-boundary` | **independent** | UNVERIFIED | oracle は実 Chromium——本 repo で最も独立。ただし現 head 未測定 |
| `independent-review` | independent | ADMISSIBLE | 別実行文脈。Wave 1 で初めて handoff が committed された |

## 分類上の判断 1 件（明記）

`mutation` を ADMISSIBLE でなく **DIAGNOSTIC_ONLY** にした。

```text
KILLED の oracle    : npm test（ADMISSIBLE）
SURVIVED/EQUIVALENT : corpus（INADMISSIBLE）
```

1 つの field に 1 つの値しか入らないので、**低い方へ寄せた**。
KILLED の強さを過小評価する側の誤りを取っている。
Human Gate が ADMISSIBLE が適当と考えるならそう言ってほしい。

## Wave 0 からの状態変化

```text
P2K-F04  閉じた——project-state-probe が committed + test 済み
P2K-F05  閉じた——verifier-package が committed。verdict を指示しないことを test で押さえた
P2K-F07  部分的に閉じた——inputDigest の schema slot と instrumentSourceSha はできた。
         独立な corpus digest を計算する instrument はまだ無い（Wave 3）
P2K-F01  確認済み / 隔離済み / INADMISSIBLE（Wave 3 が修理と再認定を持つ）
P2K-F02  未閉（Wave 3）
P2K-F03  未閉（Wave 3）
P2K-F06  未閉（Wave 4）。manifest に known limitation として記録済み

---

## §41 — Wave 2 での変更（QD-J23）

### I-02 `tools/evidence-publication-lint.mjs` の分類は変わらないが、根拠が変わった

```text
従来の UNKNOWN 項 : defaultRoots() と FP-01 test が同じ flat readdirSync
現在           : 実装 = 明示 stack 下降
                 oracle 1 = 手書き literal（committed fixture 木）
                 oracle 2 = git ls-files（git の index）
                 oracle 3 = test がその場で作る木
→ SHARED_INTENTIONALLY でも UNKNOWN でもなく **INDEPENDENT**
```

### 新規 I-10 `tools/verification/experiments/lint-discovery-depth.mjs`

```text
class        : independent
admissibility: ADMISSIBLE
見ているもの : shipped lint と shipped suite を**外から**
共有依存     : なし（guard を import しない）
positive control : discovery を flat に戻すと 0/3 と報告し、suite は緑になる
                   （= D-006 の before 列。mutant K2-01 で再現）
negative control : probe 無しなら inventory は不変
証明しないこと : project-config の外の値。開集合 heuristic（homoglyph 等）
```

### 計器の限界を 1 つ追記（mutation の分類根拠を強める）

mutate.mjs の SURVIVED / EQUIVALENT の分岐は **guard corpus の probe** で決まるので、
`project-config/evidence.js` 以外の file を変異させた場合には適用できない。
K1-xx / K2-xx の SURVIVED は厳密には「SURVIVED か EQUIVALENT か未判定」である。

K2-03（symlink guard）はその未判定を**別途測定**で埋めた初例。
Dirent が symlink を isDirectory=false / isFile=false と報告するので
guard は冗長——file / directory / 循環 symlink を含む木で
出力が byte-identical だった。よって EQUIVALENT。

この限界を踏まえても `mutation → DIAGNOSTIC_ONLY` は変えない。
むしろこの制約がその分類の根拠である。

---

## §42 — Wave 3 での変更

### guard-diff の依存グラフが変わった

```text
従来 : corpus.mjs → evidence.js（DOT_EQUIVALENTS）
       diff-heads  → head.PRIVATE_DOCUMENT_EXTENSION_SOURCE → corpus
現在 : corpus.mjs は project-config を一行も参照しない。
       自分の committed 脅威リスト（dot 12 / excluded 3 / atom 36）を持つ。
       production との差は constantCoverage() が**報告**する。採用しない
```

### 新規 I-11 `tools/guard-diff/differential.mjs`

```text
compare()             regression / tightened / **reattributed** の 3 bucket
ruleCoverageGaps()    hard rule で行使されていないものを名指す
advisoryCoverageGaps() advisory 3 規則について同じことを lint 経由で
exitCodeFor()         regression または coverage gap で 1
```

### 新規 I-12 `tools/guard-diff/suite-verdict.mjs`

```text
childEnvironment()   NODE_TEST_CONTEXT / NODE_OPTIONS / NODE_V8_COVERAGE を落とす
classifySuiteRun()   TAP summary 無し、または exit code と fail 数が矛盾したら
                     HARNESS_ERROR。「失敗なし」と読まない
```

### 分類を literal で固定した（mutation が教えてくれた）

K1-01（非 admissible な instrument を黙って再認定する）を
guard-diff から mutation へ retarget したところ PATCH-MISS になり、
**どの instrument の admissibility も test で固定されていなかった**ことが分かった。
語彙の所属検査しかなかったので、
mutation を ADMISSIBLE に書き換えても全 suite が通ってしまった。

→ P2K-M09 が 12 instrument 全部の class × admissibility を
   手書きの表で deepEqual する。分類変更はこれ以降意図的な編集になる。
