# Decisions — LR-20260921-GLASS-P2J

## D-000 — digest定義

`TASK_PACKET_SNAPSHOT.md` のファイルbytesに対するSHA-256。
Phase 2D〜2Iと同一。Resume時に再計算して一致を確認する。

```text
aa9ce07dac4767afc0ad9ff4b13663ae8cc2ab1be98e9e44ef80498da3acc446
```

## D-001 — 一次資料の可用性を、推測ではなく実測で決める（§17）

Phase 2J の結論は「資料があるか」で大きく変わる。
そこで Wave 0 の時点で、思い込みではなく実際に探した。

```text
この container に存在する repository:
  glass_wind_calc_M / glass_wind_calc_m / obsidian-vault

obsidian-vault（read-only で調査。§18が許す範囲のみ）:
  ファイル数 479
  01_Projects 配下に glass_wind_calc 系のフォルダ  : 無し
  "glass_wind_calc" / "耐風圧" を含むファイル       : 0件
  1297 / 1525 / 1729 / 2050 を含むファイル          : 0件
  1695 / 918 / 1122 / 1250 の一致                   : すべて git SHA の一部（偶然一致）
  「見付」「評価高さ」を含むファイル                : 0件
  ドメインに触れるファイル 2件を確認したが、
  pane寸法・圧力の出典・floor↔Z mapping はいずれも持っていない
```

**判定: 一次資料は本セッションから到達できない（UNAVAILABLE）。**

したがって §17 のとおり:

- 推測しない
- 架空の Observation を現案件の候補として作らない
- software workflow は作る
- project closure は `BLOCKED_BY_MISSING_EVIDENCE`
- promotion は `NONE`

これは失敗ではなく、正しい Evidence boundary である（§17 の明文）。
Phase 2J の成果物は「昇格」ではなく、
**何が揃えば昇格できるかを機械可読にしたもの**になる。

## D-002 — Evidence contractは再利用し、Phase 2J側に再実装しない（§3 / §11）

Wave 1 で実際の export surface を実測した。packet §3 が列挙する canonical API は
`project-config/evidence.js` の export と**完全に一致**していた（推測ではなく実測）。

したがって Phase 2J は以下を**一切書かない**:

```text
checkedAt validation / evidence-level validation / private-provider denylist /
URL validation / credential detection / promotion rules / source-reference正規化 /
fact allowlist / reconciliation順序 / case-level critical facts
```

Phase 2J が持つのは **scope**（どのfloor / どのzoneのfactか）という
orchestration責務だけである（§10）。

## D-003 — inherited-field consumption を Wave 1 で実測・修理した（§18〜§26）

### 実測（修理前 / positive control 付き）

packet §18 の Test A〜D をそのまま実行した。**9経路すべてが継承値を消費した**:

```text
CONSUMED  createEntry(Object.create(spec))                  （A1）
CONSUMED  createEntry({... evidence: Object.create(ev)})    （A2）
CONSUMED  assertPromotionGate('verified', Object.create(ev))（B1）
CONSUMED  assertPromotionGate(..., Object.create(options))  （B2）
CONSUMED  assertSourceReference(Object.create(ref))         （C1）
CONSUMED  canonicalizeSourceReference(Object.create(ref))   （C2）
CONSUMED  validateVerifiedCase(Object.create(caseObj))      （D1）
CONSUMED  validateVerifiedCase: evidence container 継承      （D2）
CONSUMED  validateVerifiedCase: 個別Evidence 継承            （D3）
```

成立機序は3つが重なっている:

1. `Object.keys()` ベースのallowlistは継承keyを見ないので**空虚に真**になる
2. `field in caseObj` は prototype chain を見るので必須field検査として弱い
3. 契約値そのものは `evidence.level` のような素のproperty readで prototype から読まれる

### 名前（§20）

`Object.prototype` は**変更されていない**（実測: own enumerable keys は `[]`、
`({}).level === undefined`）。したがってこれは **prototype pollution ではない**。
正しい名前は **inherited-field consumption /
custom-prototype contract-value injection** である。

名前を取り違えると対策が key sanitization の方向へ逸れる。
正しい名前は修理を「1か所の構造ガード」へ導く。Phase 2I と同じ教訓。

### 最も見落としやすかった経路: A2（snapshot による漂白）

`createEntry` は TOCTOU対策として `spec.evidence.*` を一度だけ読んで
素のliteralへ写す。その結果 **gateが見るのは漂白済みのliteral**になり、
gate側に構造ガードを置いても A2 は塞がらない。
呼び出し側objectを**読む地点**で閉じる必要がある。

### 逆向きの漂白: own `__proto__`（§24）

`JSON.parse('{"__proto__":{...}}')` は prototype を差し替えず **own key** を作る。
よって prototype 判定だけでは通過する。実測すると、このkeyを保持したまま
下流で `Object.assign({}, value)` が起きると `Object.prototype.__proto__` の
setter が発火し、**copyのprototypeが差し替わる**（実測で確認）。

つまり A2 が「prototype → literal」の漂白だったのに対し、
これは「literal own key → prototype」の**再生**である。
値自体は無害でも運搬体として危険なので、予期しないown fieldとして塞いだ。

### 修理（§21 / §22）

canonical guard `assertOrdinaryObject(value, label)` を
`project-config/evidence.js` に**1つだけ**定義し、実際の trust boundary で呼ぶ。
field ごとの継承チェックは増やさない（増やすと前段が生きている限り後段が
発火せず、どちらが効いているのか分からなくなる）。

| module | 閉じた地点 |
|---|---|
| evidence.js | `assertEvidenceConsistency` の evidence / `assertPromotionGate` の options / `assertSourceReference` |
| evidence-ledger.js | `createEntry` の spec と **spec.evidence（漂白前）** / `evaluateCasePromotion` options / `reconcileFact` options と ledgerEntry |
| miyoshi.js | `validateVerifiedCase` の caseObj / evidence container / sourceReferences container、および `in` → `hasOwnProperty` |

修理後、9経路すべてが構造を理由に拒否されることを再実測した。

## D-004 — null prototype は通す（§23 の明示的決定）

`Object.create(null)` は通す。継承元が無い＝継承値が入り得ないため、
required field は必ず own property になる。`Object.prototype` 付きより素直なデータである。

これは「たまたま通っている」のではない。テスト P2J-TB13 で固定し、
mutation（`proto !== null` を削って null prototype を拒否させる）で
テストが落ちることも確認した。

既存の `project-profile.js` / `review-package.js` の同名guardも同じ決定をしており、
リポジトリ内で判断が割れていないことを実測で確認した。

## D-005 — `in` → `hasOwnProperty` は到達可能なので削除せず testで固定した

Wave 1 の mutation test で、`hasOwnProperty` を `field in caseObj` へ戻す mutant が
**生存**した。構造ガードが先に custom prototype を弾くため、通常経路では差が出ない。

ここで「差が出ない＝不要」と判断して削除しない。差が消えるのは
「`Object.prototype` が汚れていない」という前提の下だけであり、
それは本moduleが保証している事実ではない。
つまり**到達不能ではなく、到達可能だがテストが無かった**。

Phase 2H D-011（到達不能なら削除、到達可能なら testで固定する）に従い、
`Object.prototype` を一時的に汚染して必須field検査が成立することを確認する
テスト P2J-TB18 を追加した（`finally` で汚染を必ず戻し、戻ったことも assert する）。
これにより当該 mutant は kill された。

## D-006 — 現案件のfactは一切動かしていない（§27）

Wave 1 は構造ガードとテストのみを追加した。実測で確認:

```text
verifiedCases            : []            （変更なし）
dimensions.mode          : sample_default（変更なし）
dimensions.defaultW      : 1250 / unverified
dimensions.defaultH      : 2050 / unverified
positivePressureByFloor  : 1:1297 2:1525 3:1695 R:1729（全て partially_verified / indirect）
negativePressureByZone   : general:918 corner:1122   （全て partially_verified / indirect）
wind.V0                  : 34            （32へ変更していない）
wind.roughnessCategory   : III           （変更なし）
```

テスト P2J-TB16 でこの状態を固定した。

## D-007 — scope語彙は preset topology から導出する（§5 / §33）

`evidence-closure.js` は階key・区分keyの配列を**定数として持たない**。
`Registry.getPreset(projectId)` から
`wind.positivePressureByFloor` / `wind.negativePressureByZone` のkeyを取り出し、
sortして scope contract にする。

ハードコードしない理由は「汎用だから」だけではない。
ハードコードすると preset が変わってもここが追随せず、
**存在しない階の観測を受理し、存在する階の観測を拒否する**。
どちらも静かに起きて、しかも「観測が足りない/多い」という形でしか表面化しない。

実測（現行の登録preset）:

```text
floors : 4件   zones : 2件   → required observation slots = 2 + 4 + 2 + 4 = 12
```

テストは期待値をテスト側に書かず、presetから導いた集合と一致することを見る。
mutation O4/O5（floor/zone を不完全にハードコードする）は
それぞれ6件・4件のテストを落として KILLED。

## D-008 — Observation は trust status ではない（§7 / §14 / §30）

`normalizeObservation()` は「妥当な観測の申告か」だけを判定し、
「昇格に十分か」を判定しない。したがって Wave 2 は
`assertPromotionGate('verified', ...)` を**呼ばない**。

呼んでしまうと、記述できる観測が verified 相当のものだけに狭まり、
**「根拠が不十分である」という観測そのものを記録できなくなる**。
Evidence closure の目的は「何が足りないか」を機械可読にすることなので、
これは目的を直接損なう。

したがって `level: 'indirect'` / `'none'` の Observation も正当に成立する。
テスト P2J-C19 で、`primary` だが reference が無い Evidence について
「Observation としては妥当」かつ `canPromoteToVerified() === false` を同時に固定した。
この2つが同時に成り立つことが、Wave 2 と Wave 3 の責務境界そのものである。

あわせて、Observation が trust を自己申告する経路を塞いだ。
`verificationStatus` / `verified` / `approved` / `promotion` / `verifiedCases` /
`sourceKind` / `evidenceStatus` / `currentVerified` /
`proposedVerificationStatus` / `trusted` はすべて
「予期しないfield」として拒否される（P2J-C27）。

## D-009 — slotKey は呼び出し側が供給できない（§18）

slotKey は `factKey` と**検証済みscope**から計算する。Observationのfieldではない。
`slotKey` を持つObservationは「予期しないfield」として拒否される。

`getObservationSlotKey()` は `normalizeObservation()` を通ったobjectしか受け付けない
（WeakSetで通過の事実を保持する）。未検証のobjectからslotKeyを計算できると、
topologyに無いscopeのslotKeyが公開identifierとして流通しうる。
Phase 2I の Review Package が `BUILT_REVIEWS` で採ったのと同じ形である。

scope key 自体にも公開安全なtoken形式を要求する。これは Phase 2F contract の
複製ではない。slotKey は**公開されるidentifier**なので、図面番号やファイル名が
preset経由でそこへ流れ込む経路を塞ぐ必要がある。
D-012（factKeyのallowlist）と同じ理由が scope key にも等しく当てはまる。

## D-010 — 同一slotの重複は集合ごと拒否する（§22）

last-one-wins も first-one-wins も採らない。どちらも
**どちらの根拠が採用されたかを黙って決めてしまい、監査時に追えない**。
1つのslotに複数のEvidence源を持たせたいなら、それは明示的な設計を要する。

mutation で両方の政策を**別々に**実装して確認した（下記の訂正を参照）。

## D-011 — 単位変換をしない（§12）

fact typeごとに単位を固定し、換算しない。換算を許すと、
別単位で申告された観測が黙って等価になり、
**「一致した」という結論だけが残って換算契約が残らない**。
換算が必要なら申告側が換算してから申告する。

実測で、現行configの単位表記（`mm` / `N/m²` / `m`）と一致していることを確認した。
packetの指定と実際の表記が食い違っていれば、正規化の入口で全件落ちていた。

## D-012 — Wave 2 は index.html へ配線しない

`evidence-closure.js` は UMD で browser 読み込みにも対応しているが、
`index.html` には追加していない。Wave 2 は UI を持たない（§3）ため、
利用者のいない `<script src>` を先に足さない。

既存の script 読み込み順テストは「UIが実際に使うmodule」の順序を見ており、
本moduleを要求していないことを確認済み（未配線でも全テスト緑）。
Wave 4 で read-only status UI を作る場合は、
`registry.js` より後に読み込む必要がある（依存順）。

## D-013 — 現在の真実は呼び出し側から受け取らない（§3 / §11 / §12）

`evaluateClosure(projectId, observations)` は projectId と生のObservationだけを受け取る。
current値・reconciliation結果・case readiness・project readiness・promotion statusを
**引数として一切受け付けない**。現在の主張は必ず `Registry.getPreset()` 経由で引く。

呼び出し側から現在値を受け取れる設計にすると、「何と突き合わせたか」を
呼び出し側が決められることになり、closure評価が自分の前提を検証できなくなる。

あわせて `currentValue` の意味を限定した。これは
**「現在のpresetがいま主張している値」**だけを意味し、
verified / Evidence裏付けあり / 承認済み のいずれでもない。
現在の verificationStatus を closure の根拠として持ち込まない。
reconciliation が問うのは「昇格十分なEvidenceが現在の主張と一致するか」であって
「現在の主張がすでに信用できるか」ではない。

## D-014 — Evidence level から verificationStatus を自前でmappingしない（§9 / §10）

`primary → verified` のような対応表を作らない。
`assertPromotionGate('verified', ...)` が**実際に通った後**にのみ、
`verificationStatus: 'verified'` を持つ一時Ledger entryを作る。

`createEntry()` はそこで gate を再実行する。これは無駄な二重実行ではない。
Ledger entry の生成自体が trust boundary であり、
「gateを通した」と「gateを通ったentryである」は別の主張だからである。

実際、mutation W3-03（levelを見て indirect を PASS 扱いにする）は、
この2つ目の gate にも当たって落ちた。二重化が効いていることの実測になっている。

## D-015 — 3層の判定をわざと重複させ、1本のbooleanに畳まない（§26）

project が READY_CANDIDATE になる条件は3つを**すべて**満たすこと:

```text
slot完全性     : 12 slot すべてが READY_CANDIDATE
category完全性 : 4 概念カテゴリすべてが READY_CANDIDATE（対応関係を含む）
case完全性     : floor × zone の全scopeが READY_CANDIDATE（Phase 2Fのcase契約）
```

1本の条件に畳むと、どれか1つが壊れたときに黙って通る。

### W3-20 は equivalent mutant である（言い換えない）

`allSlotsReady` を空虚に真にする mutant は**生存した**。
理由を実測で詰めたところ、4つのカテゴリが必須slotを**漏れなく覆っている**ため、
slot完全性はcategory完全性に**包含**されており、単独では落ちない。

これはテストの穴ではなく、§26 が要求する冗長性がそのまま現れたものである。
無理に kill するためにテストを捻じ曲げるのではなく、
**包含が成り立っているという前提そのもの**を P2J-C62 で固定した。
将来 closure fact を足してカテゴリに入れ忘れれば、C62 が落ちて前提の崩れを知らせる。

`allSlotsReady` は §26 の明文どおり残す。生存を「kill した」と言い換えない。

## D-016 — floor↔Z 対応は正圧側の対応も要求する（§21 / mutationで発見）

mutation W3-08（対応カテゴリから正圧slotを落とす）が**生存**し、
テストの穴であることが分かった。§21 の対応関係は
「階 ↔ 現在の正圧の主張 ↔ 根拠のある評価高さ」であり、
Zが揃っただけでは対応が言えない。

Z側しか見ない実装を許すと、正圧が MISMATCH のままでも
対応カテゴリが READY と読めてしまう。P2J-C61 を追加して塞いだ。

## D-017 — Candidate は一方向であり、読み戻す経路を作らない（§34 / §35）

`serializePromotionCandidate()` は明示的なkey順で書き出す。
`JSON.stringify(candidate)` をそのまま契約にしない
（内部shapeの変更がそのまま出力契約の変更になり、
「何を出さないか」という約束を構造的に守れない）。

読み戻すAPIは**作らない**。candidate JSON が入力経路になった瞬間、
外から持ち込んだJSONで trust を上げられるようになる。
module内に `JSON.parse` が存在しないことをテストで固定した。

exporter は builder が作った candidate しか受け付けない（WeakSet）。
形だけ真似た偽object・構造を複製したclone・JSONを読み戻したobjectは
いずれも拒否される。Phase 2I の Review Package と同じ形である。

## D-018 — Candidate Markdown は作らない（§36）

JSON が一方向の機械可読監査成果物として十分であり、
Markdown を足すと escaping / 出力契約がもう1つ増える。
Phase 2I の Markdown escaping ロジックを利便性のために複製しない。
人間可読の提示が要るなら Wave 4 の read-only DOM UI 側で扱う。

## D-019 — 合成preset test は vm ではなく同一realmで隔離する（§40）

packet は Node `vm` を挙げていたが、**実測して採らなかった**。

```text
vm realm で作った object の prototype !== host realm の Object.prototype
→ host realm の evidence.js が持つ Wave 1 構造ガードがそれを拒否する
```

closure module が内部で組み立てる ledger entry spec まで落ちるため、
moduleのロジックと無関係な理由でテスト不能になる。
Wave 1 のガードは realm 依存で、これは仕様どおりの挙動である。

そこで §40 の「equivalent isolated UMD context」として、同一realmで隔離した:
`globalThis.PresetRegistry` を一時差し替えし、require cache を落として再評価する。
**本番registryに合成presetを登録しない**ことは P2J-C44 で固定した
（差し替え後も `BUILT_IN_PRESET_IDS` が変わらず、実案件評価が従来どおり動くこと）。

## D-020 — UIは「何を確認すればよいか」だけを答える（§2 / §5）

Evidence Request Matrix は read-only である。verified にする経路を
**構造的に**持たない: Observation入力欄・Evidence level選択・checkedAt入力・
privateReferenceAvailable・sourceReference入力・Verify/Promote/Apply のいずれも作らない。

「作らない」を方針ではなくテストで固定した:
renderer が `createElement('input'|'textarea'|'select'|'button'|'form')` を
一切呼ばないこと、Production UIに `serializePromotionCandidate` が出ないこと、
renderer に `JSON.parse` が無いこと（P2J-U08 / U09）。
ブラウザ実測でも closure領域内のフォーム要素は 0 件である。

## D-021 — session固有の可用性判定を製品状態に焼き込まない（§6 / §42）

`UNAVAILABLE` は**この開発セッションで**到達可能なrepositoryを調べた結果であって、
ブラウザが知り得る製品事実ではない。別の場所にいる人が私的な原典を
持っているかどうかを、Production UIは知らない。

したがってUIには「一次資料は利用できません」と書かない。
代わりに runtime の真実を出す:

```text
提出済みEvidence Observation: 0 件
→ 必要な一次Evidenceが登録されていないため closure は未充足
```

`UNAVAILABLE` は Run Artifact 側の調査記録として残す。
P2J-U19 で、UIコードにその語が入らないことを固定した。

## D-022 — closure状態をUIで数え直さない（§7 / §8 / §37）

12 slot / 4 category / case scope数 / BLOCKED をUI側で構成しない。
すべて `EvidenceClosure.evaluateClosure()` の返り値から取る。

数え直すと判定が core と UI の2か所になり、片方だけ壊れても気付けない
（このcampaignで繰り返してきた「1か所で判定する」の適用）。
P2J-U04 / U06 で、renderer が `config.dimensions` / `config.wind` /
`verifiedCases` を読まないこと、slot/case件数の数値リテラルを持たないこと、
floor/zone語彙をUIに持たないことを固定した。

あわせて他機能の入力をEvidenceとして読まないことも固定した（P2J-U05）。
Scenario Matrix に Z を入れても `evaluation_height` の Observation にはならず、
Single/Batch に W/H を入れても pane寸法は閉じない。

## D-023 — Phase 2F パネルと Closure Matrix を別々にguardする（§25 option B）

従来 `renderProjectEvidencePanels()` は1つの try/catch で3パネルを包んでいた。
そこへ closure を足すと、closure表示の失敗で Evidence status / Verified Case /
reconciliation まで消える。消えたこと自体が「問題なし」と読まれるのが最悪である。

`renderPhase2FEvidencePanels()` と `renderEvidenceClosureMatrix()` に分け、
それぞれが自前のguardを持つ形にした。外側は呼ぶだけで catch しない（P2J-U13）。

ブラウザ実測で確認: `evaluateClosure` を強制的に throw させても、
closure領域に警告が出て、Phase 2F の2パネルは残り、計算機能も生きている。

既存の F10 テストは、契約は同じまま**見る場所**が変わったので、
`renderPhase2FEvidencePanels` を指すよう更新した（削除も緩和もしていない）。

## D-024 — U4-13 は最初「KILLED」に見えていたが、実際は生存していた

Wave 4 の mutation で、Matrix を `mode-field-miyoshi` ブロックの外へ出す mutant
（U4-13）が KILLED と表示された。**しかし理由が空欄だった**ため個別に再実行したところ:

```text
npm test : 600 pass / 0 fail  ← 検出できていない
browser  : TypeError: Cannot read properties of null (reading 'style')
```

browser scriptが `el.closest(...)` の null を握らずに例外で落ち、
その異常終了コードを runner が「検出」と読んでいた。**harnessの誤検出**である。

理由の無い kill を成果として数えないルールが効いた。2つとも直した:

- P2J-U02 は「次のブロックより前にあるか」しか見ておらず、外へ出ても通っていた。
  `<div>` の入れ子を数えて**実際の包含**を判定する形にし、
  既存の reconciliation が同ブロック内にあることを positive control として先に確認する。
- browser script は包含が無い場合に例外ではなく `'not-contained'` を返すようにした。

修正後、U4-13 は unit（P2J-U02）と browser（B2/B3/B4/B5）の**両方**で落ちる。

## D-025 — Wave 5 packet は §29 途中で途切れていた

受領した Wave 5 packet は §29「Request Matrix security」の
「Runtime-looking strings in a synthetic/mock renderer result:」で本文が終わっている。
また §4 の HTML marker 行は受領時点で**空**だった（例が描画で消えている）。

欠けた部分を推測して埋めない。§29 については Wave 4 で既に確立済みの
DOM injection probe を**そのまま再実行**し、その結果を記録した
（runtime由来文字列を projectId / slotKey / scope / gate reason / closureStatus へ
仕込む形。合成値なので renderer の安全性を見るprobeであり core validation ではない）。
HTML marker は自分で明示的に合成したタグ（`<b>` / `<script>`）を使った。

§1〜§28 は完全に受領しており、そのまま実施した。

## D-026 — public-safe prose の4クラスを実測して塞いだ（§3〜§9）

### 実測（修正前）

```text
email-like        ACCEPTED   PRIVATEEMAILMARKER991@example.com
document filename ACCEPTED   PRIVATEFILEMARKER992.pdf / .dwg / .xlsx
HTML/script tag   ACCEPTED   <b>…</b> / <script>…</script>
control char      ACCEPTED   \u0001 / \u0000 / \u007F
既知の遮断済み     REJECTED   drive.google URL / C:\ パス   ← 判定器は生きている
正当な散文         ACCEPTED   5<Z<40 / index.html / 通常の説明
```

さらに合成READY contextで確認したところ、**4クラスすべてが
Promotion Candidate JSON まで到達した**。

### 分類（§5）

これは Closure renderer の欠陥では**ない**。`publicDescription` は
Closure が受け取る前に `ProjectEvidence` が検証する。したがって
**generic public-safe Evidence boundary gap** であり、
canonical な `PUBLIC_UNSAFE_TEXT_PATTERNS` を直した。
`evidence-closure.js` / candidate serializer / Matrix UI に
個別のsanitizationを足していない（関門を増やすと、どれが効いているのか
分からなくなり、どれも単独では信用できなくなる）。

### 過剰拒否しないための具体的な線引き（§6 / §7）

```text
`<` を一律に拒否しない   : 5<Z<40 は正当な技術散文である
                          開きタグ相当（`<`+英字 … `>`）だけを拒否する
ドット付き語を一律に拒否しない
                        : 既存Evidence散文は index.html に正当に言及している
                          （実測で2件該当）。拒否すると現行configが読めなくなる
拡張子集合               : caseId 側の既存ポリシー
                          （FILENAME_LIKE_CASE_ID_PATTERN）と同一のものを使う
改行・タブ               : **意図的に許容**する（§9の明示的決定）
```

改行の扱いは推測せず実測して決めた: 現行の publicDescription 11件は
いずれも改行・タブを使っておらず、依存するテストも無い。
privacy上の危険でもないため、ここで新たに拒否するのは理由のない挙動変更になる。

### これは validator hardening であって Evidence mutation ではない（§10）

修正後も現行configは読み込め、11件の publicDescription はすべて通り、
V0=34 / roughness III / evidence level / checkedAt / verifiedCases は
いずれも変わっていない（P2J-S03）。どの publicDescription も書き換えていない。

## D-027 — 構造がpublic-safeであること ≠ 人が一次資料だと確認したこと（§12）

公開一次資料の**正しい経路**も通ることを確認した（拒否側だけを見ると
「常に拒否する実装」でもテストが通ってしまう）。
検証済みURLは canonical形 `{ kind: 'public_primary', url }` として candidate に残る。

ただしテスト本文に明記したとおり、これが証明しているのは
**URLが構造的にpublic-safeであること**だけである。
その資料が本当に一次資料かどうかはコードで決められない。

## D-028 — 最初の mutation 4件は無効な patch だった（数え直した）

W5-01〜W5-04（新しい prose パターンを1つずつ無効化）は初回 SURVIVED と出た。
しかし patch を読み直すと、無効化した entry を**挿入**しただけで
元の正規表現は別名のまま残っており、実際には何も無効化していなかった。
つまり no-op mutant であり、生存ではない。

パターン本体を `/(?!)/` に置換する形へ直し、**置換後に攻撃文字列が
実際に通るようになったか**を先に確認してから再実行した。
4件とも P2J-S01 で KILLED。

W5-03 / W5-04 では自作の確認スクリプト側の name→key マッピングに誤りがあり
`neutered=False` と表示されたが、個別に直接確認して
どちらも真に無効化されている（攻撃が ACCEPTED になる）ことを測った。
表示だけを見て「検出できた」と結論しない。

## D-029 — Wave 6: 独立検証の指摘3件を再現してから修理した

Stage A（本セッション）を exact head `1784fe3` で実施し、リポジトリを一切変更せずに
616/0・保護値5件一致・browser 62件（34+8+10+10）を実測した。
そのうえで Stage B は**別の実行コンテキスト**（自分の clone を作り、自分の
browser harness を組む read-only verifier）へ出した。

verdict は **PASS WITH FINDINGS**（Advisory 3 / Info 1、Hard Gate 0 / Required Fix 0）。
hand-back は model 出力であってユーザ指示ではないので、
**3件とも自分で再現してから**対応した。

### A1（修理した）— タグ判定がドメイン散文を巻き込んでいた

```text
再現: assertPublicSafeEvidenceText('W<H かつ P>Q である。')
      → REJECTED（html-like-tag に一致、部分文字列 "<H かつ P>"）
```

旧パターンは「`<` + 英字 … `>`」なら何でもタグ扱いしていた。
W / H / P / Q / Z は本ドメインの**変数名そのもの**なので、この形の散文は
現実に書かれうる。fail closed 側の誤りではあるが、
将来のEvidence散文が理由の分からないまま書けなくなる。

修理: タグ本体に**属性の形をした内容**だけを許す。

```text
許す  : <name> </name> <name attr> <name attr=value> <name attr="value"> <name/>
弾かない: <H かつ P>   ← 「かつ P」が属性の形になっていない
```

Wave 5 で `5<Z<40` は考慮していたが、この隣接形は見落としていた。
`見付幅W<見付高さH となる場合>注意` が通っていたのは
`<見付高さH` が英字で始まらないためで、たまたま助かっていただけである。

### A2（修理した）— Run Artifact に生の制御バイトが入っていた

```text
再現: RUN_STATE.md の offset 5456/5458/5460 に 0x00 / 0x01 / 0x7F
      file → "data"、git diff → "Bin 0 -> 16498 bytes"
```

Wave 5 で制御文字の拒否規則を**説明している散文**の中に、
エスケープせず生バイトを書いてしまっていた
（python heredoc の通常文字列で `\u0000` が実バイトに解釈された）。

Run Artifact は監査証跡であり、git が行単位で差分を取れないのは実害である。
表記（`\u0000` 等）へ置き換えた。制御文字ガードを足した Wave の成果物自身が
制御文字を含んでいたという、指摘されて当然の見落としである。

### A3（記述を修正した）— QD-J01 の「3つは同一」が古くなっていた

```text
再現: 3実装のガード集合を比較
      evidence.js       : null/typeof/Array + prototype + own "__proto__"
      project-profile.js: prototype のみ
      review-package.js : prototype のみ
```

Wave 1 時点では実際に同一だったが、**Wave 5 で `evidence.js` にだけ**
own `"__proto__"` ガードを足したため、その時点で記述が事実と食い違った。
自分で足しておきながら debt note を更新していなかった。

packet §46 は「verifier が実際の挙動差を示さない限り QD-J01 は scope 外」とするが、
これは**コード修正ではなく記述の誤りの訂正**なので対応した。
脆弱性が生じていないことも実測で確認した:
`project-profile.js` は生JSON段階で `FORBIDDEN_RAW_KEYS` により own `"__proto__"` を
拒否しており、`review-package.js` は deserializer を公開していない。

あわせて「統合するなら `evidence.js` 側（ガードが最多）を正とする」旨を追記した。
「同一だからどれを残してもよい」という読み方を防ぐためである。

### I1（記録のみ）— Evidence-first は3層で守られている

verifier の観測: closure 側の gate だけを外しても slot は BLOCKED のままである。
`reconcileFact` が独立に `INSUFFICIENT_EVIDENCE` を返し、
`createEntry` も gate を再実行するため、3層が独立に効いている。

これは設計意図（D-014 / D-015）どおりであり、修理対象ではない。
単一のガードだけを読んで「ここを通れば終わり」と判断できないことの裏取りとして記録する。

## D-030 — Wave 6 再検証: F1 は自分の修理が意図を裏返していた

`978ab6b` に対する独立再検証は **PASS WITH FINDINGS**
（Hard Gate 0 / Required Fix 0 / Advisory 1 / Info 3）。
verifier は7つの wave commit すべてのテスト数も独立に再実行して一致を確認している
（500 / 518 / 557 / 581 / 600 / 616 / 619）。

### F1（修理した）— 「属性の形だけ拒否」は逆転していた

再現（自分で確認）:

```text
<img src=x onerror=alert(1)>   REJECTED
<img src=x onerror=alert`1`>   **ACCEPTED**   ← バッククォートだけの差
<script "q"> <script =v> <img 1=2> <img -x=1> <img .x=1>
<img x=1 2> <img x=`v`> <img x=a'b> <img x=a"b> <iframe 0x=1>  すべて ACCEPTED
```

Wave 6 の最初の修理は「タグ本体が**属性の形をしている**ものだけ拒否する」
と書いた。これは意図を裏返している。属性の文法に**合わない**本体は
どれも一致せずに素通りするため、**崩れたタグほど通る**。
verifier の計測では 808形中 308が accept、うち約288が旧パターンからの後退だった。

A1 の誤検知（`W<H かつ P>Q である。`）を直そうとして、
その場しのぎに「正しいタグの形」を列挙したのが原因である。
列挙は必ず漏れる側が緩くなる。

### 正しい線引きに置き換えた

本ガードの誤検知リスクは「ASCII変数名を使う**日本語の技術散文**」である。
散文の本体には日本語が入り、タグの本体には入らない。そこで:

```text
タグ形の開き括弧は、**本体に日本語が含まれない限り**拒否する
```

```text
<H かつ P>Q            本体に「かつ」   → 散文として通す
<img src=x onerror=…>  本体に日本語なし → タグとして拒否（書式を問わない）
5<Z<40                 `>` で閉じない   → 通す
```

本体の書式を問わないので、崩れたタグも同じ規則で落ちる。
入れ子の量指定子も消えるため、verifier が計測した backtracking の論点は
**構造的に無くなった**（再検証は旧形も線形で実害なしと結論していたが、
形そのものを無くせるなら無くすほうがよい）。

トレードオフは明示する: `<T 日本語>` のような日本語入りタグ形は散文として通る。
privacy境界としては許容する（日本語を含む時点で機械的な運搬体ではない）。

> **【D-032による訂正】この段落は誤りだった。**
> 「日本語を含む時点で機械的な運搬体ではない」は**事実に反する**。
> 日本語のHTMLは `alt="図面"` のように属性値に日本語を持つのが普通であり、
> 実測では**全タグ名（114/114）が1文字混ぜるだけで素通り**した。
> 「`<T 日本語>` のような」という書き方は影響範囲を著しく過小に述べている。
> 実際には「あらゆるタグ + 任意の位置に1文字」である。D-032 を参照。

### 副次的に F2 の一部も閉じた

`<svg/onload=1>` / `<img/src=x onerror=alert(1)>` は区切りが `/` のため
旧パターンも新パターンも取りこぼしていた。今回 `[\s\/]` を区切りに含めたことで閉じた。
`<!--` / `<!DOCTYPE` / `<?xml` / `<![CDATA[` は別クラス
`markup-construct` として追加した。`-->` は技術散文の矢印（`A --> B`）と
衝突するため**入れない**（S20 で固定）。

### テストの穴も塞いだ

verifier の指摘どおり、P2J-S18 が固定していた12例は**崩れた形を1つも含んでいなかった**。
素通りしていた11形と `/` 区切り2形を S18 に追加し、
markup構文を S20、backtracking を S21 で固定した。

mutation 6件（いずれも挙動変化を先に確認）:

```text
W7-01 F1の「属性の形だけ」へ戻す     tick=ACCEPTED → KILLED (S18)  ← 新S18が効いている
W7-02 元の広すぎる形へ戻す           prose=REJECTED → KILLED (S17)
W7-03 タグ判定を無効化               すべてACCEPTED → KILLED (S01)
W7-04 CJK除外を外す                  prose=REJECTED → KILLED (S17)
W7-05 markup構文クラスを無効化       doctype=ACCEPTED → KILLED (S20)
W7-06 markup構文に `-->` を含める    arrow=REJECTED → KILLED (S20)
```

## D-031 — F2 / F3 / F4 の扱い

### F2（Info / 一部のみ対応）

`<svg/onload=1>` `<img/src=x …>` `<!--` `<!DOCTYPE` `<?xml` `<![CDATA[` は
上記 F1 修理の副産物として閉じた。

**残す**もの:

```text
&lt;script&gt;   entity encode。散文が「エスケープの説明」で書く可能性があり、
                 拒否すると誤検知側の実害が出る
< b>  </ b>      `<` の直後が空白。タグの形というより散文の形である
```

いずれも verifier が「旧パターンでも通っていた（regression ではない）」と
分類したものであり、DOM側は `textContent` / `createElement` で別に守られている。

### F3（Info / **修理しない**）— `ProjectProfile.createProfile` の継承field消費

再現は verifier が示したとおり:
`createProfile(Object.create({label, windDefaults}))` が受理される。
`assertAllowedKeys` が `Object.keys` ベースなので空虚に真になり、
`input.windDefaults` が prototype chain から読まれる。

**修理しない理由**:

```text
- Phase 2H の API であり、Phase 2J の entry point ではない
- trust elevation も値の注入も起きない（結果は user_input_unverified の素のobject。
  攻撃者が直接渡せる値と同じものしか得られない）
- custom-prototype の windDefaults 自体は拒否される
- packet §46 が「scope を無関係な refactor へ広げない」と明示している
```

これは Wave 1 で名付けた inherited-field consumption と**同じクラス**である。
現時点で到達可能な害は無いが、クラスとしては残っている。
QUALITY_DEBT へ再現手順付きで記録し、将来phaseで
`assertOrdinaryObject` を Phase 2H 側の入口にも適用する候補とする。
「無害だから無い」ことにはしない。

### F4（修理した）— RUN_MANIFEST の Wave 順序

「Wave別の変更ファイル」ブロックで Wave 6 が Wave 5 より前に並んでいた。
体裁のみだが、監査証跡は読み順が意味を持つので直した。

## D-032 — 同じガードで3度目の欠陥。賢い規則を作るのをやめた

3回目の独立検証（head `1556fc4`）は **PASS WITH FINDINGS**、
Hard Gate 0 だが **Required Fix 2件**を出した。両方とも自分の修理が原因である。

### 経緯（3回とも自分で壊している）

```text
元の規則  `<` + 英字 … `>` を一律拒否
  → A1指摘: `W<H かつ P>Q である。` を巻き込む（誤検知 / Advisory）

修理1     本体が**属性の形**のものだけ拒否
  → F1指摘: 属性文法に合わない本体が素通り（崩れたタグほど通る）

修理2     本体に**日本語**が無いタグ形だけ拒否
  → 3rd指摘: 日本語HTMLは `alt="図面"` のように属性値に日本語を持つ。
             **1文字混ぜるだけで全タグ名が素通り（実測114/114）**。
             さらに誤検知も消えておらず、`<…>` の外に日本語がある散文
             （`W<H かつ P>Q。R<S T>U も成立`）は依然として拒否されていた。
```

自分で再現した結果:

```text
<img src=x onerror=alert(1)>            rejected
<img src=x onerror=alert(1) あ>         ACCEPTED   ← 末尾に1文字
<img src=x alt="図面" onerror=alert(1)> ACCEPTED   ← 自然な日本語HTML
<img src=x onerror=alert(1) Ａ>         ACCEPTED   ← 全角Latin
bypass rate: 29/29（検証者の計測では 114/114）
```

### なぜ賢い規則が作れないのか

```text
A<B C>D        散文（変数の比較）
<td nowrap>    タグ
```

`<` + 識別子 + 空白 + 識別子 + `>` で**文字構成が同一**である。
`<…>` の中だけを見る規則では原理的に分離できない。
3回とも「例外を作り込む」方向で壊しているのは、分離できないものを
分離しようとしたからである。

### 決定: 誤検知(fail closed)を選び、素通りを無くす

どちらの誤りを選ぶかを決めるしかない。選んだのは誤検知側である。

```text
素通りを許す  → このガードは意味を失う（唯一のcanonicalな関門である）
誤検知を許す  → **書き方で回避できる**
```

回避方法が実在することが決め手になった:

```text
W<H かつ P>Q      拒否される
W < H かつ P > Q  通る（演算子の前後に空白）
5<Z<40            通る（`>` で閉じないため一致しない）
```

比較演算子の前後に空白を置くのは組版としても正しい。
「書けなくなる」のではなく「書き方が決まる」だけである。
publicDescription は人が書く公開文であり、この制約は受け入れられる。

規則は**元の広い形へ戻した**（`/` 区切りの修正と markup-construct は維持）。
賢い例外は足さない。3度とも例外の作り込みで壊している。

実測: must-reject 508形すべて拒否 / must-accept 16形すべて受理。

> **【D-034による訂正】この段落の結論は誤りだった。**
> 「素通りを無くした」は**成立していなかった**。本体クラスが `[^<>]*` のため、
> 本体に `<` が1つ入るだけで素通りする穴が**元の規則から**残っていた
> （実測 78/78、検証者は 710/710）。
> つまり誤検知というコストを払いながら、それが買うはずのものを買えていなかった。
> また上記の「508形」corpus は **commit されておらず反証不可能**であり、
> しかも正規表現と同じ思考から作られていたため、
> 独立に組んだcorpusが見つけた穴を1つも報告していなかった。D-034 を参照。

### 受け入れたコストは隠さない

`W<H かつ P>Q である。` が拒否されることを P2J-S17 に
**assert.throws として明示的に書いた**。テストが「既知のコスト」を
読めるようにしてある。コストを持つ決定をコメントだけで済ませない。

### テストが欠陥を仕様として固定していた（Finding 5）

3回目の検証の指摘どおり、旧 S17 の must-accept 一覧は
`見付幅W<見付高さH となる場合>注意` を含んでおり、
**CJKを含む角括弧スパンの受理を要求していた**。
つまりテスト側が欠陥を正常動作として固定しており、
mutation が14/14死んでも実際の穴は残る構造になっていた。

S17 を「空白を置けば通る」という回避方法の固定へ書き換え、
S18 を26タグ名 × 22本体形（1000形超）の網羅チェックへ置換し、
1文字回避を単体で読める S22 を追加した。

### D-030 の記述を訂正した

D-030 は「`<T 日本語>` のような日本語入りタグ形は散文として通る」と
開示していたが、影響範囲を著しく過小に述べていた（実際は全タグ + 任意位置の1文字）。
理由づけ（「日本語を含む時点で機械的な運搬体ではない」）も事実に反していた。
該当段落に訂正を追記した。開示があったこと自体は記録として残す。

## D-033 — Finding 3 / 4 / 5 の扱い

```text
Finding 3（Unicode範囲の誤り）  → **消滅**。CJK範囲を規則から完全に外したため、
                                  範囲の当否という論点自体が無くなった。
Finding 4（他パターンの二次コスト）→ 既存の問題であり本変更由来ではない。
                                  自分で再測定して確認（QD-J04）。
Finding 5（テストが欠陥を固定）  → S17/S18 の書き換え + S22 追加で対応（D-032）。
```

Finding 4 の自己再測定:

```text
email-like  N=1000 → 8ms / 2000 → 25ms / 4000 → 98ms / 8000 → 401ms  （二次）
tag pattern 280KB → 7ms                                              （線形）
```

タグ判定は線形であることを確認した。二次なのは `email-like` /
`url-scheme` / `private-document-filename` であり、いずれも本Phaseで
触っていない。Production UI に投入経路は無く（Observation入力欄は存在しない）、
hang ではなく degradation である。§46 に従い scope を広げず QD-J04 に記録する。

## D-034 — 4回目の検証: 穴は**元の規則から**在った。払ったコストが何も買っていなかった

4回目の独立検証（head `e4434ae`）は **PASS WITH FINDINGS**、
Hard Gate 0 / **Required Fix 2** / Advisory 3 / Info 2。

### Finding 1（Required Fix）— 本体の `<` 1文字で素通りする

```text
<img src=x onerror=alert(1)>         拒否    ← control
<img onerror=alert(1<2)>             **素通り**
<img src=x onerror="alert(1);a<b">   **素通り**
<img src=x onerror=alert(1) alt="<"> **素通り**
実測 78/78（検証者: 142タグ名 × 5形 = 710/710、Chromiumで実要素・handler発火まで確認）
```

原因は本体クラス `[^<>]*` が `<` を除外していたこと。

**これは3度の修理で入った欠陥ではない。元の規則から在った。**
3回の修理も3回の検証も、本体の文字クラスを見ていなかった。
（皮肉にも「意図が裏返っていた」修理1だけは、この3形のうち2つを捕まえていた。）

Wave 6c は「素通りを無くすために誤検知を受け入れる」と述べた。
**素通りは残っていた。払ったコストが買うはずのものを買えていなかった。**
D-032 の当該段落に訂正を入れた。

修理: 本体を `[^>]{0,300}` にする。`*`（無制限）にしないのは二次コストになるためで、
これは P2J-S21 が実際に検出する（検証者が naive fix で実測、こちらでも再現）。

### Finding 2（Required Fix）— 日本語のファイル名だけが素通りしていた

**本campaignで見つかった中で最も実害に近い指摘である。**

```text
plan.pdf         拒否
構造計算書.pdf   **素通り**
図面.dwg         **素通り**
意匠図一式.pdf   **素通り**
実測: 現実にありそうな日本語ファイル名 12/15 が素通り
end-to-end: makeEvidence(...,'社内の 構造計算書.pdf により確認',...) が通る
```

原因は幹を `[A-Za-z0-9_-]+` に限っていたこと。
本案件のEvidence散文は日本語であり、私的文書の名前も日本語である。
つまり**この案件で実際に起こりうる形だけが**素通りしていた。

`publicDescription` は公開repositoryにもCandidate JSONにも出る。
`sourceReference` 側の guard は別途これらを拒否するが、この経路は塞がっていなかった。

これは「ASCIIか日本語か」を「安全か危険か」に重ねた誤りで、
タグ判定の3度目の欠陥（「日本語があれば散文」）と**まったく同じ取り違え**である。
同じ思い込みを別の場所で2回している。

修理: 幹を区切り文字以外の連なり（長さ上限付き）にした。

### 修理中に既存テストが自分を捕まえた

Finding 2 の修理コメントに例として `みよし案件_計算書.xlsx` と書いたところ、
既存テスト §8「generic moduleに案件固有値・案件名が含まれない」が落ちた。
案件非依存moduleに案件名を書き込んでいた。合成例へ置換した。
ガードが意図どおり働いた事例として記録する。

## D-035 — corpus を commit した（Finding 3 / 4）

検証者の指摘:

```text
Finding 3: 穴を塞ぐ修正を当ててもテストは 622/0 のまま。
           1つのassertionも動かない。suite は穴を要求してはいないが、
           **検出もしていない**。
           S18 の23本体形はすべて `[\s/]` 始まりか空で、
           `<` を含む形も `[\s/]` で始まらない形も無かった。
           corpus が実装の盲点を相続していた。
Finding 4: 「508形すべて拒否」という数字は commit されておらず**反証不可能**。
           しかも同じ思考から作られていたため 508/508 と報告しながら、
           独立corpus は 710/710 の素通りを見つけた。
```

これは3回目の検証の指摘（「14/14死んでも正しさの証明ではない」）が
**corpus のレイヤで再発**したものである。

対応:

```text
- corpus を test へ commit した（HTML_TAG_NAMES 142件 × TAG_BODY_FORMS 25形）
- 本体形に「`<` を含む形」「`[\s/]` で始まらない形」を必ず入れた
- 日本語ファイル名 corpus（15幹 × 16拡張子 = 240形）も commit した
- corpus は**実装からではなくHTML/文書種別の語彙から**組み立てた
```

実測（独立corpus / 修理後）: タグ 3458形すべて拒否 / 日本語ファイル名 240形すべて拒否 /
must-accept 18形すべて受理 / `validateAllEvidence() === []`。

> **【D-038による訂正】上の数字は誤りだった。**
>
> - `HTML_TAG_NAMES 142件` → 実数は **133件**（重複なし）。142 は
>   独立検証4 の**検証者側** corpus の件数（142 × 5 = 710）であり、
>   こちらが commit した corpus の件数ではない。取り違えて転記した。
> - `タグ 3458形` → 当時の真の網羅数は **6650**（133 × 25 × 2）。
>   3458 は 3325（133×25）でも 6650 でもなく、**どの実測値でもない**。
>   test 側の assertion も当時 `checked >= 3000` という下限だけだったため、
>   この数字を検算する手段がどこにも無かった。
> - 上の「`[\s/]` で始まらない形を必ず入れた」は**実装されていなかった**。
>   非空の本体形 25 のうち該当 **0**。5 度目の欠陥はまさにその軸にあった。
> - そして `0 素通り` も誤りだった。詳細は D-038。

## D-036 — 受け入れたコストの範囲を測り直した（Finding 5）

QD-J05 は比較演算子だけを根拠にコストを説明していたが、実際はもっと広い。

```text
現実的な散文 20形のうち 8形（40%）が拒否される
  <Table 2> の値を採用した。      <JIS A 4706> に準拠する。
  記号 <W> は見付幅を表す。        <TBD> 社内資料の再確認待ち。
  配列は Array<number> 形式…      改行は <br> で表す。
  W<H かつ P>Q である。            P<Q かつ R>S のとき
```

比較でないもの（角括弧参照・generics）は「空白を置く」では
**記法そのものが変わる**（`<Table 2>` → `< Table 2 >`）。
「書き方が決まるだけ」という説明は比較については正しいが、
これらについては言い過ぎだった。

ただし回避手段は複数あり、いずれも和文として自然である（実測で通ることを確認）:

```text
＜Table 2＞   〈Table 2〉   「Table 2」   表2      <注1>   <Fig. 3>
W < H かつ P > Q（空白付き比較）
```

QD-J05 を実測値付きで書き直した。

## D-037 — 「このガードを持つべきか」は Human Gate へ上げる（Finding 4/Q4）

検証者の結論: privacy クラス（URL / www / provider / path / email / filename）は
**残すべき**。実際の開示リスクを守っており、他に関門が無く、
今回の実害（Finding 2）もそこで見つかった。
一方 tag クラスは **この形では retire か置換を勧める**:

```text
- DOM は独立に安全（positive control 付きで実証済み: 実renderer経由で
  要素生成0・実行0。sink はすべて textContent / createElement）
- Production UI に Observation 投入経路が無い（closure領域の入力要素 0）
- publicDescription は人が書く config 散文であり、PR diff に載る
- tag クラスは 4回の試みで 4つの欠陥を出し、測定可能な記法コストを課している
```

**本Phaseでは retire しない。** 理由:

```text
- Task Packet（Wave 5 §8）が「tag形の内容を Evidence 境界で拒否する」ことを
  明示的に要求している。bound requirement であって実装者の裁量ではない
- §46 が scope を広げないことを求めている
- retire は挙動の縮小であり、Human Gate の判断が要る
```

したがって本Waveでは Finding 1/2 を修理し、
**retire/置換の提案は Human Gate への申し送りとして記録する**（QD-J06）。
検証者が測定した2案も併記する。

## D-038 — tag 規則を regex から tokenizer 忠実なスキャナへ置き換えた（5回目検証）

独立検証5 の Required Fix 3 件（Finding 1 / 2 / 6）と Advisory 3 件への対応。

### なぜ regex をやめたか

本Phase でこの 1 行は 4 度修正され、そのたびに
「目の前の抜けは塗ぐが 1 文字ずれた同じ抜けは見逃す」を繰り返した。
検証者の指摘は個別のバグではなく**規則の形**に向いていた:

```text
単一 regex では次の 3 つを同時に満たせない:
  線形 ∧ `<` による素通りなし ∧ 長さによる素通りなし
  本体を `[^>]{0,N}` で縛れば N+1 文字で素通り（= Finding 1）
  縛らなければ quadratic（= P2J-S21 が落ちる）
```

Wave 6d の修復で置いた `{0,300}` は、まさにそのトレードオフの代金であり、
**一つの全面的な素通りを別の全面的な素通りと交換しただけ**だった。

### 採用した形

`containsHtmlLikeTag()`: HTML5 の tag open / tag name state に忠実な前方走査。
タグとみなすのは「`<`、任意で `/`、ASCII英字、そしてどこかに `>`」のみ。
名前部に文字クラス制約を置かず、本体長にも上限を置かない。
`>` が無ければそれ以降の `<` にも無いので即座に確定でき、後戻りが生じない。

Task Packet の変更を**要さない**: Wave 5 §8 が求める拒否を狭めるのではなく
強める側への変更だからである（QD-J06 (d)）。

### 境界を実測で置いた

推定ではなく Chromium で 27 形を測り、**guard の判定とパーサの挿入結果が
27/27 一致**することを確認した（§41）。`</ img>` `</1img>` `＜img＞` `< img>` と
`>` 無しは要素を生まないので受理側に置いた（QD-J07 に依存条件を記載）。

### Advisory への対応

```text
Finding 3: 拡張子が欧米ソフト限定だった。JW_CAD(.jww/.jwc) /
           DocuWorks(.xdw) / SXF(.sfc/.p21) / IFC / DWF / ArchiCAD(.pln) 等
           日本の実務形式と、圧縮・メール・写真系を追加（44拡張子）。
           `.html/.js/.md` は本ツール自身の公開ファイル名なので意図的に除外。
Finding 4: 全角形（`．` `ｐｄｆ`）。検査前に U+FF01..U+FF5E を半角へ畳む。
Finding 5: QD-J04 を訂正。規則別に再実測し、二次なのは email-like と
           url-scheme で、private-document-filename は線形だと確認した。
```

### corpus を直した（Finding 6 — こちらが本体）

修理後も `npm test` は 624/0 のままだった。つまり commit 済み corpus は
**2 つの全面的な素通りを 1 つも検出できなかった**。これが本Phase で繰り返し
現れた合図である——欠陥を塞いても件数が動かないなら、動いていないのは
実装ではなく corpus の方だ。

```text
追加した軸（いずれも実装ではなく HTML5 仕様・実務語彙から導出）:
  P2J-S25 名前継続文字  133 × 74 × 2 = 19684  ← Finding 2 の軸
  P2J-S26 本体長          5 × 8 × 2 = 80          ← Finding 1 の軸
  P2J-S27 受理側の境界    14 形                  ← 行き過ぎの検出
  P2J-S24 拡張子・全角      15 幹 × 44 拡張子 + 全角 6 形
既存 P2J-S18 は 133 × 26 × 2 = 6916（`checked >= 3000` を実数の assertion へ）
tag 規則の網羅合計: 26680
```

「`[\s/]` で始まらない形を必ず入れる」という header の約束は、書かれていたが
実装されていなかった（非空 25 形中 0）。今回は 74 形中 70 形が該当し、
**その約束自体を assertion にした**ので、再び破れば test が落ちる。

### mutation（欠陥復元方向）

各 mutant は分類前に**挿入した欠陥が実際に振舞いを反転させたこと**を
probe で確認している。R5-04 は初回 PATCH-MISS——自分の置換アンカーが短く
`jww` が規則に残っていた。probe がなければ SURVIVED と誤報告していた。

```text
R5-01 旧regex復元              KILLED  (S25, S26)
R5-02 長さ上限だけ復元          KILLED  (S26)
R5-03 名前を[A-Za-z0-9-]へ狭める  KILLED  (S25)
R5-04 拡張子を旧リストへ        KILLED  (S24)   ← 再実施後
R5-05 全角畳みを外す            KILLED  (S24)
R5-06 `<` を含むなら全拒否     KILLED  (S02, S17, S27, S20) ← 行き過ぎ方向
```

6/6 KILLED。行き過ぎ方向を含めたのは、5 度の修復がすべて
「もっと拒否する」側への移動だったからである。

### 守っているもの

Evidence protected state は未変更: `verifiedCases: []` / promotion NONE /
1250×2050 `sample_default` `unverified` / V0=34 / roughness III。
本修理は public-safe テキスト境界のみに触れ、案件値には一切触れていない。

## D-039 — 自分の全角対応が逆に穴を開けていた（6回目検証）

独立検証6 の判定は **FAIL**。最も重い指摘は D-038 が**自分で入れた回帰**である。

### F1（Required Fix）— 全角畳みが純粋な回帰だった

Wave 5 Finding 4（`構造計算書．ｐｄｆ` が素通り）を直すために
U+FF01..U+FF5E を**一括で**半角へ畳んだ。しかしその範囲には
`（ ） ＂ ＇ ， ；` が含まれ、これらは幹の区切り文字クラスに入ってしまう。

```text
結果: dot の直前で幹が切れ、規則がマッチしなくなる。
  構造計算書（最新）.pdf   修復前: 拒否  →  D-038後: 受理
  見積書（税込）.xlsx     修復前: 拒否  →  D-038後: 受理
実測（グリッド定義を明記する）: 畳みで幹を壊す 8 文字 `＂＇（），；＜＞` ×
展開後の具体拡張子 46 = **368 形すべて**が拒否→受理へ反転していた
（幹は `構造計算書<当該文字>`、比較対象は cb7a75b）。
【D-040による訂正】当初ここに書いた `224/224` は**どのグリッドも記録しておらず
反証不能**だった（検証7 F7-06）。上記の定義で再実測し 368/368、
修理後は 368/368 が拒否へ戻っている。
得たものは `．ｐｄｆ` 形 1 クラスのみ。**差し引きで大幅な悪化。**
```

全角括弧は日本語ファイル名で最もよく使われる装飾である。
修正: 畳むのを **U+FF0E と全角英数字だけ**に限定した。

### なぜ mutation で捕まえられなかったか

D-038 の R5-05（「畳みを外す」）は KILLED と記録した。確かに死んでいる。
しかしその mutant の振舞い差分を見れば、**mutant の方がこのクラスでは正しかった**。
「KILLED なら良し」として差分を読まなかったのが見逃しの直接の原因である。
今後: **KILLED でも mutant の振舞い差分を見る**。死んだことは
「元の実装が正しい」を意味しない——「両者が違う」しか意味しない。

### F2（Required Fix）— corpus 26680 形の識別力が 1

scanner が見るのは「`<` の次の文字」と「`>` の有無」だけなので、
26680 形はすべて**同じ 1 つの判定経路**に落ちる。あの 3 軸は
引退した regex を試していたのであって、現行の実装を試していない。
立証: 「最初の `<` だけ見る」変異が 627/0 で生き残った。

```text
欠けていた軸: 名前を始める `<` より**前**にある文字
  検証4 Finding 1 は名前の**後ろ**の `<` を扱った。前は誰も扱っていない。
  '<1<img src=x onerror=alert(1)>' は Chromium で img 要素になる。
→ P2J-S28（前置き 10 × タグ 4 × 2 = 80 形）を追加。
```

### F3（Required Fix）— 同じ非対称が隣のモジュールで生きていた

evidence.js 側のコメントは「拡張子集合は caseId 側と**同じ**」と述べていたが、
同じだったのは**コメントだけ**で、実体は 2 か所に手書きされていた。
D-038 で片方だけ拡張したため、caseId 側で
`plan_dwg` は拒否 / `plan_jww` は受理 という、**本修理が閉じたのと
まったく同じ反転**が残っていた。caseId は UI・export package・PR本文にそのまま出る。

修正: `PRIVATE_DOCUMENT_EXTENSION_SOURCE` を evidence.js から export し、
project-config/miyoshi.js 側がそれを読んで caseId 規則を組み立てる。

> **【D-040による追記（検証7 F7-04）】閉じたのは空の経路だけだった。**
> `miyoshi.validateVerifiedCase` が守る `verifiedCases` は空配列であり、
> 実際に export package へ到達する caseId は workspace.js / project-profile.js 経由で、
> そちらには filename-like 検査が**そもそも無い**（`plan_jww` も `plan_pdf` も通る）。
> 「例として挙げた `plan_jww` を閉じた」という読み方は誤りである。
> 経路自体の修理はユーザデータの互換性を壊すため QD-J10 で Human Gate へ申し送る。
依存の向き（miyoshi → evidence の一方向）は維持している。
「同じことを 2 か所で判定しない」——本Campaign で何度も出てきた教訓である。
P2J-TB19 が drift を検出する（ハードコードに戻す mutant で KILLED 確認済み）。

### F4 / F5 / F6（主張の訂正）

```text
F4 「accept 集合 == Chromium が要素化しない集合」は偽。正しくは**真部分集合**。
   42 形の実測: bypass 0 / over-rejection 7（すべて end tag または
   引用内 `>` で、要素を生まない）。fail-closed なので安全側のずれ。
   主張を「accept 集合には Chromium が要素化する形が 1 つも無い」へ訂正。
F5 「既存の accept をすべて保持」は偽。記法コストは広がった（QD-J05）。
F6 scanner の線形性根拠が空だった（`("ab.")*N` に `<` が無い）。
   結論は正しいが証拠を差し替えた（QD-J04）。
```

### F7 / F8 / F9（Advisory）

QD-J09 / QD-J08 / QD-J07 にそれぞれ記録した。いずれも実害なし、
ただし F9 は「何が守っているのか」の記述が 1 つずれていたので訂正した。

### mutation（今回）

```text
R6-01 畳み範囲を FF01..FF5E へ戻す  KILLED (S24)
R6-02 畳みを完全に外す              KILLED (S24)
R6-03 最初の `<` だけ見る            KILLED (S28)
R6-04 `/` を複数飛ばす（行き過ぎ）    KILLED (S27)
R6-05 miyoshi をハードコードに戻す    KILLED (TB19)
```

5/5。いずれも D-038 時点では**生き残っていた**ものである。

### 守っているもの

Evidence protected state は未変更: `verifiedCases: []` / promotion NONE /
1250×2050 `sample_default` `unverified` / V0=34 / roughness III。

## D-040 — 畳みの範囲を狭めても同じ形の欠陥が隣に残っていた（7回目検証）

独立検証7 の判定は **PASS WITH FINDINGS**（Required Fix 2 件）。
F1 の形の再発は無かったが、**修理した関数の中で**
corpus が押さえていない枝が 2 つ残っていた。

### F7-01 — 畳み 4 枝のうち 2 枝が未固定

D-039 で畳みを 4 範囲（`．` / 全角小文字 / 全角大文字 / 全角数字）に限定したが、
corpus の全角ブロックは 6 形すべて小文字だった。検証者の計測では
スイート全体で U+FF10..FF19 が**1 文字も現れていない**。
結果、大文字範囲・数字範囲を削除する変異が 629/0 で生き残った。
`構造計算書．ＰＤＦ` も `図面．ｐ２１`（SXF）も普通の IME 出力である。

### F7-02 — caseId 規則の `i` フラグと `$` アンカーが未固定

TB19 は展開した拡張子を**小文字のまま**回していたので、
`i` を外す変異が生き残る。図面番号は慣習的に大文字なので
`PLAN_PDF` の方が現実にはありうる。`$` も同様に未固定だった。

### F7-03 — 畳みは拒否を**減らす**ことがある（構造的な修正）

```text
                 畳み導入前(2659e3c)  D-039後   D-040後
構造計算書.pdfＡ        拒否           受理      拒否
構造計算書.pdf１        拒否           受理      拒否
図面.dwgｚ             拒否           受理      拒否
```

原因は `(?![A-Za-z0-9])` が畳み後のテキストを見ていたこと。
**範囲を狭めるだけではこのクラスは残る**ので、形を変えた:

```js
return P.test(text) || P.test(fold(text));
```

拒否集合が和になるので、畳みは「拒否を増やすだけ」になる。
この不変式を P2J-S29 が**実装に依存しない形**で固定する——
「拒否されるテキストの末尾に全角英数字を足しても受理に転じてはならない」。

### 方法上の反省（同じ省略が 2 度目）

D-039 は「KILLED でも mutant の振舞い差分を見る」と書いた。
その上で R6-02（「畳みを外す」）の差分を見ていない。
見ていれば F7-03 はその場で見つかっていた（R6-02 下では `構造計算書.pdfＡ` は拒否）。
**教訓を書くことと実行することは別**である。
今回は R7-01..R7-05 の全数について、KILLED のものも含めて
「mutant の方が正しいクラスが無いか」を確認した。

### その他

```text
F7-04 閉じたのは空の経路だけだった → QD-J10（Human Gate）、
      誤読を防ぐ注記を miyoshi.js へ。D-039 F3 に追記した。
F7-05 輸入定数が無いと `/[._-](undefined)$/i` になり黙って無効化 → 型検査を追加
F7-06 `224/224` は反証不能だった → グリッド定義を明記し 368/368 へ訂正。
      「browser 62 checks」は repository に harness が無く**6 wave にわたり
      読み手が検算できなかった** → tools/browser-checks/ へ commit した。
F7-07 docm / pptm が corpus に無かった → 追加。
```

### mutation（今回）

```text
R7-01 全角大文字範囲を削除        KILLED (S24)
R7-02 全角数字範囲を削除          KILLED (S24)
R7-03 union をやめ畳みのみ見る       KILLED (S29)
R7-04 caseId 規則の `i` を外す      KILLED (TB19)
R7-05 caseId 規則の `$` を外す      KILLED (TB19)
```

5/5。いずれも 54b15a7 時点では生き残っていた。

### KILLED mutant の振舞い差分を実際に読んだ（今度は実行した）

判定基準: 「**mutant が拒否し、shipped が受理する**証人」があれば、
そのクラスでは mutant の方が正しい可能性がある。

```text
R7-01  stricter 0 / looser 3   （ＰＤＦ ＤＷＧ ＸＬＳＸ を漏らす）
R7-02  stricter 0 / looser 2   （ｐ２１ ７ｚ を漏らす）
R7-03  stricter 0 / looser 3   （.pdfＡ .pdf１ .dwgｚ を漏らす）
R7-04  stricter 0 / looser 4   （SYN_PDF SYN_Pdf SYN_JWW SYN_7Z を漏らす）
R7-05  stricter 2 / looser 0   ← **これだけは判断が要った**
```

R7-05（`$` アンカーを外す）は `SYN_pdf_x` と `SYN_dwg_rev2` を
shipped より厳しく拒否する。これを「 mutant の方が正しい」と見るべきか:

```text
規則の目的は「caseId が**ファイル名のように終わる**」ことを捕まえること。
`SYN_pdf_x` は `.pdf` で終わっておらず、ファイル名の漏洩ではない。
よって R7-05 は**過剰拒否**であり、shipped が正しいと判断した。
ただしこれは判断であって自明では無いので、TB19 に
「`SYN_pdf_x` は受理される」を明示的な assertion として置いた。
将来この判断を覚すなら、その assertion を直すところから始めること。
```

結論: 5 件のうち 4 件は mutant が一方的に緩く、残り 1 件は過剰拒否。
**shipped より正しい mutant は無い**——今回はそれを推論ではなく差分で確認した。

> **【D-041による訂正（検証8 F8-02）】この表の `stricter 0` は誤り。**
> 差分を読むという**手順は実行したが、証人集合が 23 件しか無く、
> 判別に必要なクラス（全角拡張子 + 末尾全角英数字）を含んでいなかった**。
> 4,968 件のグリッドで再測定すると:
>
> ```text
>   R7-01（全角大文字範囲を削除）  stricter 1104（記載は 0）  例: 図面.ｐｄｆＡ
>   R7-02（全角数字範囲を削除）    stricter 2412（記載は 0）  例: 図面.ｐｄｆ９
> ```
>
> つまり「shipped より正しい mutant は無い」という結論はデータが否定していた。
> 原因は `(?![A-Za-z0-9])` で、畳みを**減らす**と lookahead が通るため
> 拒否が**増える**という非単調性があった。D-041 で lookahead を除去したので、
> 現在は畳みを狭める mutant は単調に緩くなる（実測: 2208 証人で stricter 0）。
>
> 教訓: 「差分を読む」は手順ではなく**証人集合の問題**だった。
> 証人を手で選ぶ限り、同じ見落としが 1 階上で繰り返される。

### 守っているもの

Evidence protected state は未変更: `verifiedCases: []` / promotion NONE /
1250×2050 `sample_default` `unverified` / V0=34 / roughness III。

## D-041 — lookahead が真の原因だった / 畳みを 1 か所へ集約した（8回目検証）

独立検証8 の判定は **FAIL**。回帰は無かった（190,067 証人で 0）が、
D-040 が「構造的に閉じた」と宣言したクラスが実際には開いていた。

### F8-01 — union だけでは足りなかった、が原因は畳みではなかった

報告された証人:

```text
図面．ｄｗｇ    拒否（P2J-S24 が主張）
図面．ｄｗｇ１   受理   ← 末尾に 1 文字足すだけで guard を抜ける
```

ただし自分で確かめて分かったのは、これが**全角固有ではない**こと:

```text
構造計算書.pdf2   受理   ← 純 ASCII。畳みとは無関係に、最初からこうだった
図面.dwg1        受理
```

真の原因は `(?![A-Za-z0-9])` である。この lookahead は
「`.pdfx` を `.pdf` と数えない」ことを意図していたが、privacy の観点では
`構造計算書.pdf2` も十分に漏洩である。削除した。

副次効果: 畳みを**減らす**と lookahead が通って拒否が**増える**という
非単調性が消えた。これが D-040 の差分表が誤っていた原因でもある（F8-02）。

### F8-01b — P2J-S29 は不変式ではなく**標本**を押さえていた

S29 の `REJECTED_BASES` はすべて半角拡張子だった——つまり
**不変式が成立する側の半分を手で選んでいた**。
同じファイルの 6 行上で S24 が拒否を主張している全角拡張子形を入れると落ちた。

修正: base を手で選ばず、**実装が持つ唯一の拡張子定義から生成する**
（3 幹 × 46 拡張子 × dot 2 形 × 半角/全角 = 552 base）。
生成した base が全部拒否されることを positive control として先に要求する。

### F8-05 — 畳みが 11 規則中 1 にしか効いていなかった（記録ではなく修理した）

検証者はこれを Human Gate 送りとして提案したが、ファイル名クラスより
**大きい**漏洩であり、修理が単調（拒否を増やすだけ）なので本Wave で閉じた。

```text
                                   修理前   修理後
ａｂｃ＠ｅｘａｍｐｌｅ．ｃｏｍ              受理     拒否
ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ                 受理     拒否
Ｃ：＼Ｕｓｅｒｓ＼ｘ                       受理     拒否
ｎｏｔｉｏｎ．ｓｏ/ｐａｇｅ                  受理     拒否
```

全角の private provider URL は**ヒントではなく参照そのもの**である。

### 結果として形が単純になった

畳みは `assertPublicSafeEvidenceText` のループ**1 か所だけ**で行う。

```js
matched = entry.pattern.test(text) || (folded !== null && entry.pattern.test(folded));
```

- union なので単調——畳みは拒否を増やすだけ。F1 の形の回帰は**原理的に起きない**。
- だから範囲を狭める必要がなく、U+FF01..U+FF5E 全体を畳める。
  4 サブ範囲を個別に押さえる問題自体が消えた（F8-03 の M05/M07/M08/M10）。
- detect 規則（html-like-tag）には適用しない: `＜img＞` は Chromium で要素を生まないので、
  畳んで拒否すると過剰拒否になる。

### F8-03 — 生き残っていた 11 変異 → 全滌

```text
R8-01/02  fold 範囲の端点        KILLED (S32)
R8-03     fold を identity へ     KILLED (S24, S29)
R8-04     union をやめ raw のみ    KILLED (S24, S29)
R8-05     indexOf('>', 0)        KILLED (S31)
R8-06/07/08 tag name 範囲の端点  KILLED (S30)
R8-09     caseId 区切り [._-]     KILLED (TB19)
R8-10     型検査を削除            KILLED (TB20)
R8-11     fold を FF41..FF5A へ     KILLED (S24, S29)
```

範囲を持つ実装は「代表的な文字」では押さえられない。
P2J-S32 は畳みを**写像として全数検査**し、S30 は ASCII 英字 52 文字全部を回す。

### F8-04 — harness が自分の tree を測っていなかった

commit した 5 つは絶対パスを埋め込んでおり、**どの tree に置いても
元の checkout を測っていた**。検証者は tag guard を `return false;` にした copy で
なお「bypass 0」が出ることを実証した——反証可能性のために commit したのに
**原理的に反証できない**形だった。

修正後に同じ sabotage を自分で再現:

```text
sabotage した copy の harness : BYPASSES 19   ← 検出できるようになった
実 repository の harness      : BYPASSES  0
```

### F8-06 — 型検査は load-bearing だが未テストだった → P2J-TB20

「コメントにしか存在しない guard」は本Campaignの反復する教訓であり、
「テストにしか存在しない guard」も同じだけ悪い。

### 守っているもの

Evidence protected state は未変更: `verifiedCases: []` / promotion NONE /
1250×2050 `sample_default` `unverified` / V0=34 / roughness III。

