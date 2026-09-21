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
