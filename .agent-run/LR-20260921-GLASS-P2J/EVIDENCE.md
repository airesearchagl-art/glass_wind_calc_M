# Evidence — LR-20260921-GLASS-P2J

## §1 Phase 2J 開始時点の正本（変更しない）

```text
verifiedCases             : []
project-specific promotion: NONE
V0                        : 34 m/s   verified / primary
roughness                 : III      verified / primary
正圧 1F/2F/3F/RF           : 1297 / 1525 / 1695 / 1729   partially_verified / indirect
負圧 general / corner      : 918 / 1122                  partially_verified / indirect
dimensions                : 1250 × 2050  sample_default / unverified
```

H=2050 は既存資料に ACW 全体高さとして類似値の記録候補があるが、
ガラス見付高さと同一であることは確認されていない。
**1250×2050 を verified pane dimensions へ昇格しない。**

法定 V0=32 と案件 config の V0=34 を混同しない。
Phase 2J で V0=34 を 32 へ変更しない。

## §2 一次資料の可用性（Wave 0 実測 / §17 / AC-J21）

```text
判定: UNAVAILABLE
```

`obsidian-vault` を read-only で調査した結果、
本案件の一次資料（pane寸法 / 圧力の原計算 / floor↔Z mapping）は
このセッションから到達できないことを実測で確認した（詳細は DECISIONS.md D-001）。

したがって Phase 2J は:

```text
software workflow : 実装・検証する
project closure   : BLOCKED_BY_MISSING_EVIDENCE
promotion         : NONE
verifiedCases     : [] のまま
explicit unresolved items : 4件のまま
```

**閉じられないものを閉じたことにしない。**
COMPLETE_VERIFIED を得るために closure を偽装しない（§33）。

## §3 Phase 2F から引き継ぐ Explicit unverified items（4件・維持）

```text
1. ガラス1枚の実見付 W / H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m^2 の元計算根拠
3. 負圧 918 / 1122 N/m^2 の元計算根拠
4. 各階評価高さ Z と preset の exact mapping
```

Phase 2J はこの4件を**閉じない**。
閉じるために何が必要かを、機械可読な契約として表現することが目的である。

## §3 — Evidence architecture inventory（Wave 1実測 / packet §28）

「packetにそう書いてあるから」ではなく、実際の export / 定義から起こした表である。

| Concern | Owner（実測） | Phase 2Jの扱い |
|---|---|---|
| Evidence object | `ProjectEvidence.makeEvidence` / `assertEvidenceConsistency` | reuse |
| checkedAt validation | `ProjectEvidence.isValidCheckedAt`（実在日まで検証） | reuse・**copy禁止** |
| evidence level値域 | `ProjectEvidence.EVIDENCE_LEVELS`（frozen） | reuse |
| public-safe prose | `ProjectEvidence.assertPublicSafeEvidenceText` | reuse |
| public source URL | `ProjectEvidence.assertPublicPrimarySourceReference` | reuse・**copy禁止** |
| private-provider denylist | `evidence.js` 内 `PRIVATE_PROVIDER_HOST_PATTERN` 他 | reuse・**copy禁止** |
| credential detection | `evidence.js` 内 `CREDENTIAL_LIKE_*` | reuse・**copy禁止** |
| sourceReference正規形 | `ProjectEvidence.canonicalizeSourceReference` / `assertSourceReference` | reuse |
| promotion readiness | `ProjectEvidence.assertPromotionGate`（唯一の正） | reuse・**再実装禁止** |
| 構造ガード | `ProjectEvidence.assertOrdinaryObject`（Wave 1で追加） | reuse |
| fact allowlist | `EvidenceLedger.KNOWN_FACT_KEYS`（frozen / 10件） | reuse |
| reconciliation | `EvidenceLedger.reconcileFact`（Evidence先・値は後） | reuse |
| case critical facts | `EvidenceLedger.evaluateCasePromotion` / `CASE_TYPE_CRITICAL_FACTS` | reuse |
| verified-case最終形 | `MiyoshiProjectConfig.validateVerifiedCase` | 将来のcandidate検証時のみ reuse |
| floor vocabulary | current config（実測） | `1` / `2` / `3` / `R` のみ |
| zone vocabulary | current config（実測） | `general` / `corner` のみ |
| **scope binding** | **なし（存在しない）** | **Phase 2Jの新規責務** |

実測した allowlist（10件、packet §6と一致）:

```text
pane_width_mm  pane_height_mm  positive_pressure  negative_pressure
evaluation_height  floor_height_mapping  building_height  eaves_height
V0  roughness_category
```

実測した case-level contract:

```text
CASE_TYPE_CRITICAL_FACTS.glass_pane =
  [pane_width_mm, pane_height_mm, positive_pressure, negative_pressure]
CALCULATION_PROVENANCE_EXTRA_FACTS = [evaluation_height]
```

→ Phase 2J は `if (W && H && positive && negative && Z) ready = true` を書かない（§7）。

## §4 — current project topology（Wave 1実測 / packet §8）

```text
wind の実キー: positivePressureByFloor, negativePressureByZone,
               V0, roughnessCategory, status, source, note

positivePressureByFloor : "1"→1297  "2"→1525  "3"→1695  "R"→1729
                          すべて partially_verified / indirect
negativePressureByZone  : "general"→918  "corner"→1122
                          すべて partially_verified / indirect
dimensions              : mode=sample_default / status=unverified
                          defaultW=1250(unverified) defaultH=2050(unverified)
```

### evaluation_height に対する重要な実測（packet §13 の裏取り）

```text
wind 配下に評価高さ / Z を表すキーは 存在しない（0件）
```

つまり W/H・圧力には**現行の主張が存在する**が、
floor↔Z mapping には**突き合わせる正が存在しない**。

したがって Phase 2J は evaluation_height について `MATCH` を報告してはならない。
比較対象が無いところで「一致した」と言うのは、
Evidenceの有無を数値の一致で置き換える最も静かな形だからである。
§13 のとおり `reconciliationApplicable: false` / `reconciliationStatus: null` を用いる。

## §5 — trust boundary の実測と修理（Wave 1 / packet §18〜§26）

修理前: packet §18 の Test A〜D の**9経路すべてで継承値が消費された**。
修理後: 9経路すべてが構造を理由に拒否される。

`Object.prototype` は修理前後いずれも**変更されていない**（実測）。
よってこれは prototype pollution ではなく
**inherited-field consumption** である（D-003 / §20）。

### §24 の形ごとの実測結果

| 形 | 修理前 | 修理後 | 備考 |
|---|---|---|---|
| `Object.create({...})` | 消費 | reject | custom prototype |
| literal `__proto__:` | 消費 | reject | prototype差し替え。own keyではない（実測） |
| `JSON.parse('{"__proto__":...}')` | 拒否（偶然） | reject（明示） | own key。prototypeは変わらない |
| `Object.create(null)` + own | 通過 | **通過（意図した決定）** | D-004 |
| 素のliteral | 通過 | 通過 | 過剰拒否していない |
| class instance / `Date` / `Map` | 消費 | reject | |

`JSON.parse` 形は修理前も「拒否」だったが、それは
`level` が読めなかったという**別の理由での偶然**であり、
own field として拒否していたわけではない。
さらに実測で、この own key を保持したまま `Object.assign({}, v)` を通すと
copy の prototype が差し替わることを確認した（D-003）。
偶然の拒否に依存せず、運搬体として明示的に塞いだ。

## §6 — Wave 1 の mutation 結果

```text
M1 proto判定を無効化                → KILLED（10件失敗）
M2 own "__proto__"判定を無効化      → KILLED
M3 createEntryのevidenceガード除去  → KILLED（A2漂白経路）
M4 hasOwnProperty→`in` へ差し戻し   → SURVIVED → P2J-TB18 追加後 KILLED
M5 null prototypeを拒否（§23反転）  → KILLED
```

M4 は生存を SURVIVED としてそのまま記録した上で、
到達可能性を評価して testで固定した（D-005）。生存を言い換えていない。

## §7 — Evidence state は変更していない

```text
一次資料の可用性 : UNAVAILABLE（Wave 0判定のまま）
実際のObservation: 0件
closed facts     : 0 / 4
Promotion        : NONE
verifiedCases    : []
```

Wave 1 で追加したのは構造ガードとテストだけであり、
Evidence・案件事実・検証状況のいずれも動かしていない（D-006 / P2J-TB16）。

## §8 — Wave 2 成果物（Observation v1 / scope contract）

```yaml
module: project-config/evidence-closure.js
observation_schema_version: 1
observation_type: evidence_closure_observation
closure_fact_keys:
  - pane_width_mm        # scope: null
  - pane_height_mm       # scope: null
  - positive_pressure    # scope: { floor }
  - negative_pressure    # scope: { zone }
  - evaluation_height    # scope: { floor }
scope_source: PresetRegistry.getPreset(projectId) の wind topology（導出）
required_observation_slots: 12
unresolved_conceptual_categories: 4
actual_project_observations: 0
primary_evidence_availability: UNAVAILABLE
promotion: NONE
verifiedCases: []
reconciliation_performed: false
promotion_candidate_generated: false
```

`closure_fact_keys` は `EvidenceLedger.KNOWN_FACT_KEYS`（10件）の**部分集合**であり、
generic allowlist を置き換えるものではない。module評価時に部分集合であることを
assertしており、片方だけ変更すると読み込み自体が失敗する。

### 12 slot と 4 カテゴリは別の数である

```text
required observation slots      : 12（2 + 4 + 2 + 4、topologyから導出）
unresolved conceptual categories: 4（pane寸法 / 正圧 / 負圧 / 評価高さ）
```

混同すると「4件しか無いのに12件要求している」または
「12件あるので12カテゴリ未解決」という誤読が生じる。P2J-C08 で両方を同時に固定した。

## §9 — Wave 2 mutation 結果（§35）

```text
O1  observation構造ガード除去          KILLED (2)
O2  未知top-level fieldを許可          KILLED (5)
O3  fact不一致のscopeを許可            KILLED (2)
O4  floor語彙を不完全にハードコード    KILLED (6)
O5  zone語彙を不完全にハードコード     KILLED (4)
O6  数値文字列のobservedValueを許可    KILLED (1)
O7  単位不一致を許可                   KILLED (1)
O8  makeEvidence正規化を省略           KILLED (3)
O9  sourceReference正規化を省略        KILLED (3)
O10 重複slotを許可                     KILLED (1)
O11 last-one-wins（真の上書き）        KILLED (1)
O11b first-one-wins（黙って捨てる）    KILLED (1)
O12 正規化集合をsortしない             KILLED (1)
O13 呼び出し側evidence参照を保持       KILLED (1)
O14 V0をclosure factに追加             KILLED (2)
O15 verificationStatus fieldを許可     KILLED (1)

distinct mutants: 16 / KILLED 16 / SURVIVED 0 / PATCH-MISS 0
```

### 訂正（結果の言い換えをしないための記録）

最初の実行では O10 と O11 に**同一のpatch**を当てていた（どちらも同じ `if` を
無効化するだけで、生成されるsourceがbyte一致していた）。
つまり O11「last-one-wins」は**別のmutantとして試験されていなかった**。
O10 を2回数えていただけである。

真の last-one-wins（既存entryを上書きする）と first-one-wins（後続を黙って捨てる）を
別々に実装して再実行し、いずれも P2J-C32 で KILLED であることを確認した。
上の表はその再実行結果である。

## §10 — Wave 2 で発見した自分の誤り

テスト P2J-C38（現行値がclosure moduleに現れない）が、
自分が書いたコメントの中の現行圧力値を検出して落ちた。
packet §11 の説明例をそのままコメントへ書き写したことが原因である。

コメントであっても、案件非依存moduleに現行の案件値が入るのは §27 / §28 に反する。
合成値へ置き換えた。テストが意図どおり機能した事例として記録する。

またテスト P2J-C24 で、`{ __proto__: ... }` を `Object.assign` 経由のhelperへ
渡していたため、override が own enumerable property を1つも持たず
**素の妥当なObservationが出来てしまい、拒否を何も確かめていない空虚なテスト**に
なっていた。prototypeが実際に差し替わっていることを先にassertしてから
判定する形へ修正した（Phase 2G/2I で繰り返した positive control の教訓と同じ）。

## §11 — 現案件のfactは Wave 2 でも変更していない

```text
verifiedCases            : []
dimensions               : sample_default / unverified / 1250 × 2050
positivePressureByFloor  : 1297 / 1525 / 1695 / 1729（全て partially_verified）
negativePressureByZone   : 918 / 1122（全て partially_verified）
V0                       : 34（32へ変更していない）
roughnessCategory        : III
actual observations      : 0
facts closed             : 0 / 4
```

P2J-C39 で、Observation正規化とslot列挙を実行した**後**にこの状態を再確認している
（呼び出しが現状に副作用を持たないことの確認）。

## §12 — Wave 3: 実案件の closure 状態（実測）

**これが現在の案件の状態である。** 合成テストの結果と混同しない。

```yaml
software_closure_evaluation: implemented / PASS
actual_evidence_availability: UNAVAILABLE
actual_project_observations: 0
actual_required_slots: 12
actual_ready_slots: 0
actual_categories: 0 / 4
actual_prospective_case_scopes: 8        # 4 floors × 2 zones（topologyから導出）
actual_ready_case_scopes: 0
actual_project_status: BLOCKED
operational_reason: BLOCKED_BY_MISSING_EVIDENCE
promotion_candidate: NONE
verifiedCases: []
current_config_mutation: none
```

`evaluateClosure('miyoshi', [])` の実測出力:

```text
status            : BLOCKED
slots             : 0 / 12
categories        : 0 / 4
case scopes       : 0 / 8
blockerKinds      : [CASE_NOT_READY, MISSING_OBSERVATION]
promotionCandidate: null
```

fact単位では、突き合わせ対象のある fact が canonical な `INSUFFICIENT_EVIDENCE` を返し、
`evaluation_height` は `reconciliationApplicable: false` / `reconciliationStatus: null` /
`currentValue: null` になる（Wave 1 実測の結論がそのまま効いている）。

## §13 — Wave 3: 合成preset test（**実案件の状態ではない**）

READY 経路を確かめるために、合成preset（`synthetic_closure_test`）を使った。
これは実案件が primary Evidence を持っていることを意味**しない**。

```text
合成topology : floors 2 / zones 2 → 8 slots / 4 case scopes
合成値       : 777 / 1888 / 3111 / 3222 / 4111 / 4222（明らかに人工的）
```

| テスト | 結果 |
|---|---|
| 全slot充足 + 全Evidence昇格十分 | project READY_CANDIDATE / candidate 生成 |
| 1件を indirect に変更（値は一致のまま） | gate FAIL → INSUFFICIENT_EVIDENCE → BLOCKED |
| 1件の値を変更（Evidenceは十分） | gate PASS → MISMATCH → BLOCKED / 自動修復なし |
| evaluation_height 昇格十分 | gate PASS / applicable false / status null / READY |
| floor A の Z を欠落（floor B の Z はある） | 対応カテゴリ BLOCKED / floor A の case のみ BLOCKED |
| 負圧をすべて欠落 | 3 / 4 カテゴリ READY のまま部分進捗が残る |

**本番registryは汚染されていない**ことを実測で確認した（P2J-C44）:
差し替え後も `BUILT_IN_PRESET_IDS` は `['miyoshi']` のままで、
実案件の評価も従来どおり `BLOCKED` を返す。

## §14 — Wave 3 mutation 結果（§53）

```text
W3-01 assertPromotionGate を飛ばす            KILLED (3)
W3-02 gate失敗でも値一致で十分とする          KILLED (2)
W3-03 levelからstatusをmapping（indirect=PASS）KILLED (3)  ← createEntry側の再gateにも当たった
W3-04 evaluation_height を突き合わせ可能に     KILLED (11)
W3-05 MISMATCH を READY 扱い                  KILLED (1)
W3-06 欠測を READY 扱い                        KILLED (6)
W3-07 部分カテゴリを READY 扱い                KILLED (3)
W3-08 floor/Z対応から正圧を外す                SURVIVED → P2J-C61 追加後 KILLED (1)
W3-09 evaluateCasePromotion を迂回             KILLED (4)
W3-10 claimsCalculationProvenance=false        KILLED (3)
W3-11 全caseで最初の階の正圧を使う             KILLED (1)
W3-12 全caseで最初の区分の負圧を使う           KILLED (1)
W3-13 全caseで最初の階のZを使う                KILLED (2)
W3-14 BLOCKEDでもcandidateを生成               KILLED (11)
W3-15 評価がcurrent configを書き換える         KILLED (5)
W3-16 exporterが偽candidateを受理              KILLED (1)
W3-17 candidate JSONにcurrent configを含める   KILLED (1)
W3-18 apply/import APIを追加                   KILLED (1)
W3-19 blockerKinds を sort しない              SURVIVED → P2J-C63 追加後 KILLED (1)
W3-20 slot完全性を空虚に真にする               **EQUIVALENT（生存のまま）**

distinct mutants : 20
KILLED           : 19
EQUIVALENT       : 1（W3-20。下記の分析を経て生存のまま記録する）
PATCH-MISS       : 0
```

### W3-20 を「kill した」と言い換えない

`allSlotsReady` を空虚に真にしても、4つの概念カテゴリが必須slotを
**漏れなく覆っている**ため、slot完全性は category完全性に包含されており単独では落ちない。
どのテストも区別できないのは、§26 が要求する冗長性がそのまま現れた結果である。

テストを捻じ曲げて kill するのではなく、**包含が成り立っているという前提**を
P2J-C62 で固定した。将来 closure fact を足してカテゴリに入れ忘れれば C62 が落ちる。
`allSlotsReady` は §26 の明文どおり残す。

byte一致するmutantの二重計上も避けた（実行前にsource hashで重複検出）。
Wave 2 で O10/O11 を二重計上した反省を仕組みに落とした。

## §15 — Wave 3: 保護対象の計算値（再実測）

```text
FL6 1250×2050 : 1756.09756097561      （直接再計算して一致）
FL6 1500×2050 : 1463.4146341463415    （直接再計算して一致）
Er            : 0.8516557589672942    （known-answerテストで緑）
qBar          : 503.08024004410464    （known-answerテストで緑）
手入力 1400   : manual-config suite で緑
```

Wave 3 はこれらに影響していない。

## §16 — Wave 3: 現案件のfactは変更していない

```text
verifiedCases           : []
dimensions              : sample_default / unverified / 1250 × 2050
positivePressureByFloor : 1297 / 1525 / 1695 / 1729（partially_verified のまま）
negativePressureByZone  : 918 / 1122（partially_verified のまま）
V0                      : 34    roughnessCategory : III
```

P2J-C58 で、closure評価 → candidate生成 → serialize を実行した**前後**の
config構造が等しいことを確認している（一連の操作に副作用が無いことの確認）。

## §17 — Wave 4: Evidence Request Matrix（実測）

```yaml
ui_decision: IMPLEMENTED
reason: 収集すべき一次Evidenceを項目単位で示すチェックリストとして機能するため
displayed_status: 未充足（BLOCKED）
displayed_categories: 0 / 4
displayed_slots: 0 / 12
displayed_case_scopes: 0 / 8
displayed_observations: 0 件
promotion_candidate: なし
observation_input_controls: 0
promotion_controls: 0
private_references: 0
network_requests_added: 0
storage_writes_added: 0
```

### ブラウザ実測（Chromium / file:// で実際に開いて計測）

```text
browser checks : 34 pass / 0 fail
```

| 確認 | 実測 |
|---|---|
| script読み込み順 | closure@7 > registry@6、`EvidenceClosure` 解決済み |
| 案件preset mode | Matrix表示あり |
| Manual / Notification / Imported | いずれも非表示 |
| 全体status | 未充足 |
| 必要な確認項目 | 0 / 12 |
| closureカテゴリ | 0 / 4 |
| 想定case scope | 0 / 8 |
| 提出済みObservation | 0 件 |
| Promotion Candidate | なし |
| 行数 | 12（寸法2 / 正圧4 / 負圧2 / 評価高さ4） |
| 全行のClosure | 未充足 |
| 全行のObservation | 未提出（0や現在値で埋めていない） |
| 全行のEvidence Gate | 未評価 |
| 評価高さの現在値 | 「— 現在の正なし」 |
| 評価高さの照合 | 「比較対象なし」（MATCHではない） |
| それ以外の照合 | 「Evidenceが不十分」 |
| Matrix内のフォーム要素 | 0 |
| promote/apply操作 | 無し |
| Verified系の語 | 無し |
| page error / console error | 0 / 0 |
| 非file:// リクエスト | 0 |
| localStorage / sessionStorage / cookie | 0 / 0 / 0 |
| 案件fact（UI操作後） | verifiedCases 0 / sample_default / 1250 / 2050 / V0 34 / III |

### 実際の表示（§43 の到達確認）

```text
ガラス見付幅 W   共通          mm     1250   未提出  未評価  Evidenceが不十分  未充足
ガラス見付高さ H 共通          mm     2050   未提出  未評価  Evidenceが不十分  未充足
階別正圧         floor 1       N/m²   1297   未提出  未評価  Evidenceが不十分  未充足
階別正圧         floor 2       N/m²   1525   未提出  未評価  Evidenceが不十分  未充足
階別正圧         floor 3       N/m²   1695   未提出  未評価  Evidenceが不十分  未充足
階別正圧         floor R       N/m²   1729   未提出  未評価  Evidenceが不十分  未充足
部位別負圧       zone corner   N/m²   1122   未提出  未評価  Evidenceが不十分  未充足
部位別負圧       zone general  N/m²    918   未提出  未評価  Evidenceが不十分  未充足
評価高さ Z       floor 1       m      — 現在の正なし  未提出  未評価  比較対象なし  未充足
評価高さ Z       floor 2       m      — 現在の正なし  未提出  未評価  比較対象なし  未充足
評価高さ Z       floor 3       m      — 現在の正なし  未提出  未評価  比較対象なし  未充足
評価高さ Z       floor R       m      — 現在の正なし  未提出  未評価  比較対象なし  未充足
```

各行には「何を集めればよいか」の静的説明が付く
（例: 「このfloorの正圧値と算定根拠を直接確認できる一次資料」）。
private資料名・ファイル名・IDは一切含まない。

## §18 — Wave 4: DOM injection probe（rendererの安全性）

これは **renderer の安全性**を見るprobeであり、core の validation を見るものではない
（core は合成攻撃値を通さないため、renderer単体の挙動は別に確かめる必要がある）。

評価結果を差し替え、`projectId` / `slotKey` / `scope` / gate reason /
`closureStatus` に `<img onerror>` と `<script>` を仕込んだ。

```text
probe : 8 pass / 0 fail

img要素の生成      : 0
script要素の生成   : 0
onerror発火        : なし
inline script実行  : なし
攻撃文字列の扱い   : **リテラルtextとして描画された**（＝攻撃は確かに到達している）
innerHTML内の生markup: なし
dialog             : なし
page error         : 0
```

「攻撃文字列がテキストとして現れた」ことを先に確認している。
これが無いと、攻撃がrendererへ届かないまま
「何も起きなかった」と読む空虚な確認になる（Phase 2G/2I で3度学んだ形）。

## §19 — Wave 4: fail-closed 表示（§38）

`evaluateClosure` を強制的に throw させた実測:

```text
fail-open check : 10 pass / 0 fail

closure領域        : 空欄にならない
警告               : 「Evidence Closure Statusを表示できませんでした。
                      表示できないことを「検証済み」と解釈しないでください: ...」
matrix表             : 正常時のように描かれない
"0 blockers" 的表示  : なし
Verified 的表示      : なし
Phase 2F status panel: **残る**
Phase 2F reconcile   : **残る**
計算機能             : 生存（GlassCalc 利用可能）
uncaught page error  : 0
```

Phase 2F の2パネルが残ることが、§25 option B（独立guard）が
実際に効いていることの確認である。

## §20 — Wave 4 mutation 結果（§39）

```text
U4-01 evidence-closure script を外す        KILLED  unit P2J-U01
U4-02 registry より前に読み込む              KILLED  unit P2J-U01
U4-03 全体statusをREADYに固定                KILLED  browser B6
U4-04 現在値をEvidence値として表示           KILLED  unit P2J-U15 / browser B20a
U4-05 評価高さをMATCHと表示                  KILLED  unit P2J-U16 / browser B17
U4-06 欠測slotを表示しない                   KILLED  browser B11
U4-07 READY_CANDIDATEをVerifiedと表示        KILLED  unit P2J-U14
U4-08 Observation入力欄を足す                KILLED  unit P2J-U08 / browser B20
U4-09 Promoteボタンを足す                    KILLED  unit P2J-U08 / browser B20
U4-10 rendererがconfigを直接読む             KILLED  unit P2J-U04
U4-11 runtime値をinnerHTMLへ                 KILLED  unit P2J-U11
U4-12 closure例外を黙殺                      KILLED  unit P2J-U12
U4-13 Matrixをpreset modeブロックの外へ出す  ※下記（当初は誤検出）→ KILLED
U4-14 Scenario Z をEvidence扱い              KILLED  unit P2J-U05
U4-15 カテゴリ数にslot数を表示               KILLED  browser B33

distinct mutants : 15 / KILLED 15 / SURVIVED 0 / PATCH-MISS 0
```

### U4-13: 理由の無い「KILLED」を疑って正解だった

U4-13 は当初 KILLED と表示されたが、**失敗したテスト名が空欄**だった。
個別に再実行したところ:

```text
npm test : 600 pass / 0 fail   ← 検出できていない
browser  : TypeError: Cannot read properties of null (reading 'style')
```

browser script が `el.closest('.mode-field-miyoshi')` の null を握らずに
例外で落ち、その異常終了を runner が「検出」と読んでいた。
つまりこれは **harness の誤検出**であり、実際には生存していた。

隠れていた穴は2つ:

1. P2J-U02 が「次のブロックより前にあるか」しか見ておらず、
   要素がブロックの外へ出ても通ってしまう判定だった。
2. browser script が包含の不在を例外にしていた。

両方を直した。U02 は `<div>` の入れ子を数えて**実際の包含**を判定し、
既存の reconciliation が同ブロック内にあることを positive control として先に確認する。
browser script は包含が無ければ例外ではなく `'not-contained'` を返す。

修正後、U4-13 は unit（P2J-U02）と browser（B2/B3/B4/B5）の**両方**で落ちる。

## §21 — Wave 4: 現案件のfactは変更していない

```text
npm test : 600 pass / 0 fail（Wave 3の581 → +19）
browser  : 34 pass / 0 fail
probe    :  8 pass / 0 fail
fail-open: 10 pass / 0 fail

verifiedCases : []          dimensions : sample_default / 1250 × 2050
pressures     : partially_verified のまま
V0            : 34          roughnessCategory : III
promotion     : NONE
```

UI操作（mode切替・計算実行・Matrix描画）の**後**にブラウザ内で再測定して確認した。

## §22 — Wave 5: public-safe prose boundary（実測 → 修正 → 再実測）

### 修正前（Wave 5 probe / §3・§4）

```text
クラス                入力                                          結果
email-like            PRIVATEEMAILMARKER991@example.com             ACCEPTED
document filename     PRIVATEFILEMARKER992.pdf / .dwg / .xlsx       ACCEPTED
HTML / script tag     <b>…</b> / <script>…</script>                 ACCEPTED
control char          \u0001 / \u0000 / \u007F                      ACCEPTED
--- 既知の遮断済みcontrol ---
drive.google URL      https://drive.google.com/PRIVATEURLMARKER995  REJECTED
Windows path          C:\private\PRIVATEPATHMARKER996.dwg           REJECTED
--- 正当な散文（壊してはいけない） ---
inequality            評価高さは 5<Z<40 の範囲で確認した             ACCEPTED
repository file       index.html の初期値として導入された値          ACCEPTED
```

既知の遮断済みcontrolが REJECTED であることが、
「判定器が動いている」ことの裏取りである（全ACCEPTEDなら検証器が
死んでいるだけかもしれない）。

### 到達可能性（§3）

合成READY contextで、4クラスすべてが **Promotion Candidate JSON まで到達**した。

```text
email-like    *** REACHES Candidate JSON ***
filename      *** REACHES Candidate JSON ***
HTML tag      *** REACHES Candidate JSON ***
control char  *** REACHES Candidate JSON ***
```

### 分類と修正場所（§5）

Closure renderer の欠陥ではない。`publicDescription` は Closure が受け取る前に
`ProjectEvidence` が検証する。したがって **generic public-safe Evidence
boundary gap** であり、canonical な `PUBLIC_UNSAFE_TEXT_PATTERNS` に
4クラスを追加した。closure module / serializer / UI 側には
個別のsanitizationを足していない。

### 修正後（再実測）

```text
email / pdf / dwg / xlsx / <b> / <script> / \u0001 / \u0000 / \u007F  → すべて REJECTED
5<Z<40 / index.html / 通常の説明 / 改行 / タブ                        → すべて ACCEPTED
現行 miyoshi config                                                   → 読み込み OK
```

### 現行Evidenceは変更していない（§10）

```text
publicDescription 11件  : すべて強化後の検証器を通る（書き換えなし）
V0 / roughness          : 34 / III（不変）
evidence level          : defaultW=none / defaultH=indirect（不変）
checkedAt               : defaultH='2026-09-17'（不変）
verifiedCases           : []（不変）
```

validator hardening であって Evidence mutation ではない。

## §23 — Wave 5: Candidate の privacy sweep（§11 / §12 / §25 / §26）

```text
private Evidence : privateReferenceAvailable=true のみが残り
                   sourceReference は null（所在は一切保持しない）
public Evidence  : canonical形 { kind:'public_primary', url } のみ
evidence の key   : checkedAt / level / privateReferenceAvailable / publicDescription の4つだけ
proposedFact の key: slotKey / factKey / scope / observedValue / unit /
                   proposedVerificationStatus / reconciliationApplicable /
                   reconciliationStatus / evidence / sourceReference
top-level の key   : schemaVersion / candidateType / projectId / candidateStatus /
                   notApplied / currentConfigMutated / warning / gateSummary / proposedFacts
出力されないもの   : currentConfig / verifiedCases / privateReference / rawObservation /
                   registry / preset / profile / workspace / review /
                   dimensions / wind / generatedAt / timestamp
```

**構造がpublic-safeであること ≠ 人が一次資料だと確認したこと**（§12）。
公開URLの正常系も通ることを確認しているが、証明されているのは前者だけである。

## §24 — Wave 5: Candidate JSON を既存importerへ通した（§24）

```text
ProjectInput.deserialize          → trust にならない
WorkspaceCore.deserializeWorkspace → trust にならない
ProjectProfile.deserializeProfile  → trust にならない
```

拒否されるか、受理されても既存のdowngrade契約により
`verified` にも `registered_preset` にもならないことを確認した。
Candidate 専用の受け入れ口は**足していない**（拒否を試すためだけに
対応を追加しない）。現案件の状態も変わらない。

## §25 — Wave 5 mutation 結果

```text
W5-01 email パターン無効化          KILLED (P2J-S01)   ※初回は無効patch。下記参照
W5-02 filename パターン無効化       KILLED (P2J-S01)   ※同上
W5-03 html-tag パターン無効化       KILLED (P2J-S01)   ※同上
W5-04 control-char パターン無効化   KILLED (P2J-S01)   ※同上
W5-05 `<` を一律拒否                KILLED (P2J-S02)   過剰拒否を検出
W5-06 ドット付き語を一律拒否        KILLED (12件)      index.html を巻き込む
W5-07 改行を制御文字として拒否      KILLED (P2J-S02)   明示的決定を固定
W5-08 notApplied=false              KILLED (P2J-C43)
W5-09 currentConfigMutated=true     KILLED (P2J-C43)
W5-10 candidateStatus=VERIFIED      KILLED (P2J-C43)
W5-11 candidate から warning を削除 KILLED (P2J-C56)
W5-12 exporter の WeakSet gate 削除 KILLED (P2J-S11)
W5-13 candidate に raw observation  KILLED (P2J-S14)
W5-14 未知Observation fieldを許可   KILLED (P2J-S07)

distinct mutants : 14 / KILLED 14 / SURVIVED 0 / PATCH-MISS 0
```

### W5-01〜W5-04 の初回は無効な patch だった（生存ではない）

初回実行では SURVIVED と出たが、patch を読み直すと
無効化した entry を**挿入**しただけで元の正規表現は別名のまま残っており、
実際には何も無効化していなかった。**no-op mutant であって生存ではない。**

パターン本体を `/(?!)/` へ置換する形に直し、
**置換後に攻撃文字列が実際に通るようになったか**を先に確認してから再実行した。
W5-03 / W5-04 では確認スクリプト側の name→key マッピングに誤りがあり
`neutered=False` と表示されたが、個別に直接測って
どちらも真に無効化される（攻撃が ACCEPTED になる）ことを確認済みである。

## §26 — Wave 5: repository privacy scan / network / storage

```text
private provider 参照（shipped source, tests除く）:
  検出されたのはすべて **denylist の正規表現そのもの**と
  README のポリシー記述であり、実際の private 参照は 0 件

opaque long token（shipped source）:
  検出はすべて識別子名（PRIVATE_PROVIDER_HOST_PATTERN 等）。実トークンは 0 件

network API（fetch / XHR / sendBeacon / WebSocket）:
  追加 0 件（検出されたのは「使わない」と書いたコメントのみ）

storage API（localStorage / sessionStorage / indexedDB / cookie）:
  追加 0 件（同上）

ブラウザ実測（Wave 4 harness 再実行）:
  非 file:// リクエスト 0 / localStorage 0 / sessionStorage 0 / cookie 0
```

## §27 — Wave 5: 保護対象と既存Phaseの regression

```text
npm test   : 616 pass / 0 fail（Wave 4の600 → +16）
browser    :  34 pass / 0 fail
injection  :   8 pass / 0 fail
fail-closed:  10 pass / 0 fail

FL6 1250×2050 : 1756.09756097561      （直接再計算して一致）
FL6 1500×2050 : 1463.4146341463415    （直接再計算して一致）
Er / qBar     : known-answer テストで緑
手入力 1400   : manual-config suite で緑

Phase 2F〜2I : 既存suiteをすべて無改変のまま緑
```

## §28 — Wave 5 終了時点の現案件の状態（不変）

```text
Primary Evidence availability : UNAVAILABLE（開発セッションの調査結果）
Actual project observations   : 0
evaluateClosure('miyoshi', []): BLOCKED / 0 of 12 / 0 of 4 / 0 of 8 / candidate null
Facts closed                  : 0 / 4
Promotion Candidate           : NONE
verifiedCases                 : []
dimensions                    : sample_default / unverified / 1250 × 2050
pressures                     : partially_verified のまま
V0                            : 34      roughness : III
```

Wave 5 が変えたのは **validator の強度**だけであり、案件のEvidenceではない。

## §29 — Wave 6 Stage A（実装セッション / exact head 1784fe3）

```text
npm test        : 616 pass / 0 fail / 0 skipped / 0 todo
protected values: FL6 1250×2050 / 1500×2050 / Er / qBar / manual 1400 → 5件すべて一致
project state   : BLOCKED / 0 of 12 / 0 of 4 / 0 of 8 / candidate null / observations 0
prose boundary  : 攻撃6クラス REJECTED、正当散文3件 ACCEPTED、現行11件すべて通過
candidate       : notApplied true / currentConfigMutated false / READY_CANDIDATE /
                  warning あり / JSON決定的 / 禁止キー 0
input-apply API : 4ファイルの実行コードに 0 件
privacy         : production source 0 hits（テスト・artifact のみ）
network/storage : 実行コードに 0 件
browser         : 34 + 8 + 10 + 10 = 62 checks / 0 fail
repository      : **無変更**（§2・§14 のとおり measurement のみ）
```

Stage A は repository を変更しなかったため、
Verifier Target Candidate = `1784fe3a72c2d038d74a8cc48ed1f3119cabd1fc` を宣言した。

## §30 — Wave 6 Stage B（独立検証 / read-only）

独立verifierは**自分の clone**（`/tmp/verify-p2j/repo`）を作り、
**自分の browser harness** を組んで実行した。実装セッションの
scratchpad 出力は再利用していない。repository は read-only のまま。

```text
verdict : PASS WITH FINDINGS
findings: Advisory 3 / Info 1 / Hard Gate 0 / Required Fix 0
npm     : 616 pass / 0 fail（独立実測）
browser : VERIFIED（独自harness）
probes  : V1〜V12 すべて KILLED、EQ-1 は EQUIVALENT
          0 SURVIVED / 0 PATCH-MISS
```

verifier は各 wave commit を checkout してテスト数も独立に検証した
（500 / 518 / 557 / 581 / 600 / 616 の6点すべて一致）。

### verifier が自分の harness error を開示している

verifier 自身、初回の V1/V2/V7/V8/V9/V11 patch が効いていなかったこと
（特に V8/V9 は Wave 5 の artifact が記録しているのと**同じ no-op mutant**）を
開示し、修正してから分類し直している。harness error を kill に数えていない。

## §31 — Wave 6 修理（指摘3件、すべて自分で再現してから対応）

| 指摘 | 種別 | 再現 | 対応 |
|---|---|---|---|
| A1 タグ判定がドメイン散文を巻き込む | Advisory | `W<H かつ P>Q である。` が REJECTED | パターンを「属性の形」に限定 |
| A2 Run Artifact に生の制御バイト | Advisory | offset 5456/5458/5460、git が Bin 扱い | 表記へ置換、UTF-8 text に復帰 |
| A3 QD-J01「3つは同一」が古い | Advisory | ガード集合を比較して差を確認 | 記述を訂正（コード変更なし） |
| I1 Evidence-first は3層 | Info | — | 記録のみ（設計意図どおり） |

### A1 の mutation（両方向から固定した）

```text
W6-01 旧の広いパターンへ戻す      ineq=REJECTED  → KILLED (P2J-S17)
W6-02 タグ判定を完全に無効化      すべてACCEPTED → KILLED (P2J-S01)
W6-03 属性を必須にする（裸タグ素通り） 裸タグACCEPTED → KILLED (P2J-S01)
```

いずれも patch が**実際に挙動を変えたこと**を先に確認してから分類した。
広すぎれば S17 が、狭すぎれば S01 / S18 が落ちる。

## §32 — Wave 6 修理後の再実測

```text
npm test        : 619 pass / 0 fail（616 → +3）
browser         : 34 + 8 + 10 + 10 = 62 checks / 0 fail
protected values: 5件すべて一致
project state   : BLOCKED / 0 of 12 / 0 of 4 / 0 of 8 / candidate null
                  verifiedCases [] / V0 34 / roughness III
RUN_STATE.md    : UTF-8 text（git が行単位で差分を取れる状態へ復帰）
```

## §33 — Wave 6 独立再検証（head `978ab6b`）

```text
verdict : PASS WITH FINDINGS
findings: Hard Gate 0 / Required Fix 0 / Advisory 1（F1）/ Info 3（F2・F3・F4）
npm     : 619 pass / 0 fail（独立実測）
browser : VERIFIED — 独自harness 78 assertions / 0 fail / page error 0 / console error 0
probes  : 14 KILLED / 0 SURVIVED / 0 EQUIVALENT / 0 PATCH-MISS / 0 HARNESS ERROR
R1/R2/R3: いずれも CONFIRMED REPAIRED
```

verifier は wave commit 7点すべてを checkout してテスト数を独立検証した
（500 / 518 / 557 / 581 / 600 / 616 / 619 すべて一致）。
また自分の probe 6 が挙動差を出していなかったことを自己開示し、
probe を直してから分類し直している（harness error を kill に数えていない）。

### F1 の再現（自分で確認してから修理した）

```text
<img src=x onerror=alert(1)>   REJECTED
<img src=x onerror=alert`1`>   ACCEPTED   ← バッククォートだけの差
<script "q"> / <script =v> / <img 1=2> / <img -x=1> / <img .x=1> /
<img x=1 2> / <img x=`v`> / <img x=a'b> / <img x=a"b> / <iframe 0x=1>
すべて ACCEPTED（旧パターンでは REJECTED だった＝後退）
```

原因は Wave 6 の修理が「属性の形をしたタグだけ拒否」という**列挙**になっていたこと。
列挙は漏れる側が緩くなる。「本体に日本語が無いタグ形は書式を問わず拒否」へ置換した。

## §34 — Wave 6 再修理後の実測

```text
npm test        : 621 pass / 0 fail（619 → +2）
browser         : 34 + 8 + 10 + 10 = 62 checks / 0 fail
protected values: 5件すべて一致
validateAllEvidence(): []（現行11件すべて通過）
project state   : BLOCKED / 0 of 12 / 0 of 4 / 0 of 8 / candidate null
                  verifiedCases [] / V0 34 / roughness III
```

### タグ判定の mutation（6件・すべて挙動変化を先に確認）

```text
W7-01 F1の「属性の形だけ」へ戻す   KILLED (P2J-S18)  ← 拡張したS18がF1を捕まえる
W7-02 元の広すぎる形へ戻す         KILLED (P2J-S17)
W7-03 タグ判定を無効化             KILLED (P2J-S01)
W7-04 CJK除外を外す                KILLED (P2J-S17)
W7-05 markup構文クラスを無効化     KILLED (P2J-S20)
W7-06 markup構文に `-->` を含める  KILLED (P2J-S20)
```

広すぎれば S17、崩れた形が漏れれば S18、無効化すれば S01、
markup構文が漏れれば S20、矢印を巻き込めば S20 が落ちる。
5方向から固定されている。

## §35 — 3回目の独立検証（head `1556fc4`）: 同じガードで3度目の欠陥

```text
verdict : PASS WITH FINDINGS
findings: Hard Gate 0 / **Required Fix 2** / Advisory 2 / Info 1
npm     : 621 pass / 0 fail（独立実測）
browser : VERIFIED（独自harness）
probes  : 14 KILLED / 0 SURVIVED
privacy : production 0 hits
```

verifier は「14/14 死ぬことはガードが正しい証拠では**ない**」と明記している。
Finding 1 / 2 は**出荷済みの挙動**であり、mutation では原理的に露出しない。
これがテスト側の盲点（Finding 5）そのものである。

### Finding 1（Required Fix / 自分で再現）— 1文字で回避できる

```text
<img src=x onerror=alert(1)>            rejected
<img src=x onerror=alert(1) あ>         ACCEPTED
<img src=x alt="図面" onerror=alert(1)> ACCEPTED   ← 自然な日本語HTML
<img src=x onerror=alert(1) Ａ>         ACCEPTED   ← 全角Latin
bypass: 29/29 タグ名（検証者計測 114/114）
```

verifier は Chromium で「これらは実際に解釈され onerror が発火する
本物のタグ」であることまで確認している（4/4 fired）。

「日本語があれば散文」という前提が誤りだった。
日本語のHTMLは属性値に日本語を持つのが普通である。

### Finding 2（Required Fix / 自分で再現）— 誤検知は移動しただけだった

```text
rejected  範囲は 5<Z<40 で、W<H R>S を満たす
rejected  W<H かつ P>Q。R<S T>U も成立      ← S17のmust-accept文に節を足しただけ
rejected  A<B C>D のとき注意する
rejected  条件 W<H and P>Q を確認した
```

規則が位置依存（日本語が `<…>` の**中**にあるか）だったため、
日本語がスパンの外にある散文は依然として落ちていた。

### Finding 5（Info / 最も重い指摘）— テストが欠陥を仕様として固定していた

旧 S17 の must-accept 一覧は `見付幅W<見付高さH となる場合>注意` を含み、
**CJKを含む角括弧スパンの受理を要求していた**。
テストが欠陥を正常動作として固定していたため、
mutation が全滅しても実際の穴は残る構造になっていた。

## §36 — 3度目の修理: 賢い規則をやめ、広い形へ戻した

`A<B C>D`（散文）と `<td nowrap>`（タグ）は文字構成が同一であり、
`<…>` の中だけを見る規則では原理的に分離できない。
どちらの誤りを選ぶかを決めるしかなく、**誤検知(fail closed)を選んだ**。

決め手は回避方法が実在すること:

```text
W<H かつ P>Q      拒否   → 空白を置けば通る
W < H かつ P > Q  通る
5<Z<40            通る
```

実測:

```text
must-reject corpus : 508形（26タグ名 × 各種本体形 + markup構文） → すべて拒否
must-accept corpus :  16形（空白付き比較・非英字始まり・矢印など） → すべて受理
既存 publicDescription 11件 : すべて通過（validateAllEvidence() === []）
```

### mutation（3つの旧規則すべてへの復帰を含む・挙動変化を先に確認）

```text
X-01 CJK本体規則へ戻す（3度目の欠陥）  cjk=ACCEPTED → KILLED(3)  S17/S18/S22
X-02 属性の形だけ規則へ戻す（F1）      tick=ACCEPTED → KILLED(3)
X-03 タグ判定を無効化                  すべてACCEPTED → KILLED(4)  S01
X-04 `/`区切りを外す                   slash=ACCEPTED → KILLED(1)  S18
X-05 本体を必須にする（裸タグ素通り）  bare=ACCEPTED → KILLED(2)  S01
```

過去3つの誤った規則のどれに戻しても落ちる状態になった。

### テストの作り直し

```text
S17 → 「空白を置けば通る」回避方法の固定 + 受け入れたコストを assert.throws で明示
S18 → 26タグ名 × 22本体形（1000形超）の網羅。CJK混入・全角・崩れた属性を含む
S22 → 1文字回避を単体で読めるよう独立させた（あ ア 図 中 「 全角空白 Ａ ｡ 𠮷 …）
S19 → 散文例を空白付きへ更新
S21 → タグ判定の線形性のみを固定（他パターンの二次性は QD-J04 へ）
```

## §37 — 3度目の修理後の実測

```text
npm test        : 622 pass / 0 fail
browser         : 34 + 8 + 10 + 10 = 62 checks / 0 fail
protected values: 5件すべて一致
validateAllEvidence(): []
project state   : BLOCKED / 0 of 12 / 0 of 4 / 0 of 8 / candidate null
                  verifiedCases [] / V0 34 / roughness III
```

### Finding 4 の自己再測定（既存問題・本変更由来ではない）

```text
email-like  N=1000 → 8ms / 2000 → 25ms / 4000 → 98ms / 8000 → 401ms  （二次）
tag pattern 280KB → 7ms                                              （線形）
```

タグ判定は線形。二次なのは本Phaseで触っていないパターンであり QD-J04 に記録した。

## §38 — 4回目の独立検証（head `e4434ae`）

```text
verdict : PASS WITH FINDINGS
findings: Hard Gate 0 / **Required Fix 2** / Advisory 3 / Info 2
npm     : 622 pass / 0 fail（独立実測）
browser : VERIFIED（独自harness）
probes  : 19 KILLED / 0 SURVIVED（自身の PATCH-MISS 2件を開示して数えていない）
wave counts: 9点すべて独立再実行して一致（500…622）
```

### Finding 1（Required Fix / 自分で再現）— 本体の `<` 1文字で素通り

```text
<img src=x onerror=alert(1)>         拒否    ← control
<img onerror=alert(1<2)>             ACCEPTED
<img src=x onerror="alert(1);a<b">   ACCEPTED
<img src=x onerror=alert(1) alt="<"> ACCEPTED
自己実測 78/78 ／ 検証者 710/710（Chromiumで実要素生成・handler発火まで確認）
```

**元の規則から在った穴**であり、3度の修理でも3度の検証でも
本体の文字クラスが見られていなかった。
Wave 6c の「素通りを無くした」という結論は**falsified**。

### Finding 2（Required Fix / 自分で再現）— 日本語ファイル名だけが素通り

```text
plan.pdf        拒否
構造計算書.pdf  ACCEPTED        図面.dwg ACCEPTED        意匠図一式.pdf ACCEPTED
自己実測: 現実的な日本語ファイル名 12/15 が素通り
end-to-end: makeEvidence(...,'社内の 構造計算書.pdf により確認',...) が通る
```

**この案件で実際に起こりうる形だけが**素通りしていた。
`publicDescription` は公開repositoryにもCandidate JSONにも出る経路である。

## §39 — 4回目の修理と、corpus の作り直し

```text
tag body      : [^<>]* → [^>]{0,300}（`<` を許し、上限で線形性を保つ）
filename stem : [A-Za-z0-9_-]+ → 区切り文字以外の連なり（上限120）
```

### corpus を commit した（Finding 3 / 4 への対応）

旧corpus（未commit・508形）は正規表現と同じ思考から作られており、
508/508「拒否」と報告しながら独立corpusの 710/710 素通りを1つも見つけていなかった。
3回目検証の指摘（「14/14死んでも正しさの証明ではない」）が corpus 層で再発した形である。

```text
commit 済み corpus:
  HTML_TAG_NAMES 142件 × TAG_BODY_FORMS 25形（`<` を含む形・`[\s/]` で始まらない形を必ず含む）
  日本語ファイル名 15幹 × 16拡張子 = 240形
```

独立実測（修理後）:

```text
tag corpus        : 3458形すべて拒否（0 素通り）
JP filename corpus:  240形すべて拒否（0 素通り）
must-accept       :   18形すべて受理
validateAllEvidence(): []
```

> **【§41による訂正】上の数字と結論は誤りだった。**
> `142件` → 実数 **133件**、`3458形` → 実数 **6650形**（133 × 25 × 2）。
> 「`[\s/]` で始まらない形を必ず含む」は未実装（非空 25 形中 **0 形**）。
> **そして `0 素通り` も誤り**——この corpus が持たない 2 軸（tag name 継続文字 /
> 本体長）に全面的な素通りが残っていた。詳細は §41 と D-038。

### mutation（6件・挙動変化を先に確認）

```text
Y-01 本体を [^<>]* へ戻す（4度目の穴）  ltBypass=ACCEPTED → KILLED (S18)
Y-02 本体を [^>]* へ（無制限・二次）    → KILLED (S21)  ← 検証者が load-bearing と評した test
Y-03 tag ルール無効化                   → KILLED (S01)
Y-04 filename 幹を ASCII 限定へ戻す     jpFile=ACCEPTED → KILLED (S24)
Y-05 filename ルール無効化              → KILLED (S01)
Y-06 拡張子判定を外す（過剰拒否）       indexHtml=REJECTED → KILLED (12件)
```

### 修理中に既存テストが自分を捕まえた

Finding 2 の修理コメントに案件名を含む例を書いたところ、
既存テスト §8（generic moduleに案件名を含まない）が落ちた。合成例へ置換した。

## §40 — 4回目の修理後の実測

```text
npm test        : 624 pass / 0 fail（622 → +2）
browser         : 34 + 8 + 10 + 10 = 62 checks / 0 fail
protected values: 5件すべて一致
validateAllEvidence(): []
project state   : BLOCKED / 0 of 12 / 0 of 4 / 0 of 8 / candidate null
                  verifiedCases [] / V0 34 / roughness III
線形性          : tag 28KB→7ms / 56KB→14ms / 112KB→31ms
                  filename 2KB→4ms / 4KB→7ms / 8KB→16ms
```

## §41 — 独立検証5 の修理実測（D-038）

### 再現（修理前・head 2659e3c）

検証者の 6 指摘を自分で再現し、全件確認した。

```text
Finding 1  本体 299 拒否 / 301以上 ACCEPTED（境界は 300/301 で完全一致）
Finding 2  <img: <a_ <img. <img! <img= <img\u200b </ img> </1img>  すべて ACCEPTED
Finding 3  .jww .xdw .sfc .p21 .ifc .dwf .csv .txt .rar .7z .heic .tif .msg  ACCEPTED
           （一方で 構造計算書.pdf は拒否される——境界として不整合）
Finding 4  構造計算書．ｐｄｆ / 構造計算書.ｐｄｆ / 構造計算書．pdf  ACCEPTED
Finding 5  QD-J04 が stale（下記の再実測を参照）
Finding 6  HTML_TAG_NAMES 実数 133（artifact は 142 と記載）
           真の網羅数 6650（artifact は 3458 と記載；どの実測値でもない）
           header の「`[\s/]` で始まらない形を必ず入れる」は 非空 25 形中 0 形
```

### 決定的な実験: corpus は 2 つの全面的な素通りを見ていなかった

```text
修理前  npm test: 624 pass / 0 fail
修理後  npm test: 624 pass / 0 fail   ← assertion が 1 つも動かない
```

全面的な素通りを 2 つ塞いて件数が変わらないのなら、検知していないのは
実装ではなく corpus である。これを受けて corpus を再構築した結果が 627/0。

### パーサ境界の自己実測（検証者の数値の転記ではなく）

Chromium で 27 形を `div` 文脈と `table` 文脈の両方でパースし、
生成要素数と guard の判定を照合した。

```text
guard == parser : 27/27
```

途中 2 度、harness 自体の欠陥を捕まえている（どちらも実装の問題ではない）:

```text
1) `<td nowrap>` が div 文脈で 0 要素だった——tree construction が table 外の
   `<td>` を落とすため。「0 要素だからタグでない」は成立しない。
2) table 文脈を足した際、包みの `</tr></tbody>` の `>` が未閉タグを閉じ、
   `<img src=x onerror=alert(1)`（`>` 無し）と `5<Z<40` を要素にしていた。
   → QD-J07 に依存条件として記載した。
```

### 規則別の線形性再実測（Finding 5）

```text
入力 ("ab.")*N            N=1000   2000    4000    8000   16000
  private-document-filename  1.9ms   3.5ms   7.0ms  14.2ms  28.1ms   線形
  email-like                 5.0ms  19.9ms  79.9ms 307.6ms 1289.8ms  二次
  url-scheme                 1.7ms   7.4ms  26.4ms 126.9ms  441.5ms  二次
  html-like-tag（新スキャナ）  0.0ms   0.0ms   0.0ms   0.0ms   0.0ms
```

旧 regex は 280KB で 7ms だったので、スキャナは正しいだけでなく速い。

### 回帰（修理後・全量）

```text
npm test          : 627 pass / 0 fail
browser（再実行） : 34 + 8 + 10 + 10 = 62 pass / 0 fail
parser boundary   : 27/27 一致
mutation          : 6/6 KILLED（欠陥復元 5 + 行き過ぎ 1）
protected facts   : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §42 — 独立検証6 の修理実測（D-039）

### F1 の再現と修正（自分で入れた回帰）

```text
                          HEAD~1  D-038後  D-039後
構造計算書（最新）.pdf      拒否     受理      拒否
図面（最新）.pdf            拒否     受理      拒否
見積書（税込）.xlsx        拒否     受理      拒否
意匠図（A棟）.xlsx        拒否     受理      拒否
見積書＂.pdf / 図面，.pdf   拒否     受理      拒否
構造計算書．ｐｄｆ          受理     拒否      拒否   ← Wave5 F4 の修復も保持
```

### パーサ境界の再測定（F4 を反映して方向別に集計）

```text
測定形                                          : 42
bypass（受理だが Chromium は要素化）          : 0   ← これが 0 であることが要件
over-rejection（拒否だが要素 0）              : 7   ← fail-closed、許容
  </Aimg> / </img src=x onerror=alert(1)> / </<img>
  <img src="x> / <img src="x>y / </img> / <! <img src=x>
```

前回の「27/27 一致」は、この 7 形を含まない形集合で測った結果だった。
主張を「**accept 集合に Chromium が要素化する形は 1 つも無い**」へ訂正する。

### corpus の識別力（F2）

```text
修正前: 「最初の `<` だけ見る」変異 → SURVIVED（627/0）
修正後: 同じ変異               → KILLED（P2J-S28）
```

### scanner の線形性（F6を受けて `<` を含む証人で再実測）

```text
                             N=1000  2000  4000  8000 16000 32000
  "<"*N                        0.08  0.16  0.29  0.10  0.26  0.74 ms
  "<1"*N（名前なし・最悪ケース）  0.02  0.05  0.09  0.18  0.37  0.72 ms
  "<a"*N（`>` 無し）            0.00  0.00  0.00  0.00  0.00  0.00 ms
  "<a "+x*N+">"                0.00  0.00  0.00  0.00  0.00  0.00 ms
```

### 回帰（修理後・全量）

```text
npm test        : 629 pass / 0 fail
browser         : 34 + 8 + 10 + 10 = 62 pass / 0 fail
parser boundary : 42形 / bypass 0
mutation        : 5/5 KILLED（すべて D-038 時点では生存していた）
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

### 方法上の反省

```text
「mutant が KILLED なら良し」として振舞い差分を読まなかったことが
F1 を見逃した直接の原因。R5-05 の差分には「mutant の方が正しい形」が
入っていた。KILLED は「両者が違う」しか意味しない。
```

## §43 — 独立検証7 の修理実測（D-040）

### F7-03: 畳みが拒否を減らしていた

```text
witness              2659e3c(畳み前)  54b15a7  HEAD
構造計算書.pdfＡ          拒否          受理     拒否
構造計算書.pdf１          拒否          受理     拒否
図面.dwgｚ               拒否          受理     拒否
見積書.xlsxＢ             拒否          受理     拒否
構造計算書．ｐｄｆ           受理          拒否     拒否  ← 畳みの目的は保持
```

### D-039 の回帰幅をグリッド定義付きで再実測（F7-06）

```text
グリッド: 畳みで幹を壊す 8 文字 ＂＇（），；＜＞
        × 展開後の具体拡張子 46 = 368 形
        幹は「構造計算書<当該文字>」、比較対象は cb7a75b

  cb7a75b で受理されていた（= 回帰） : 368 / 368
  HEAD で拒否へ戻った                 : 368 / 368
  control 構造計算書.pdf              : 両方とも拒否
```

当初書いた `224/224` はグリッドを記録していなかったので反証不能だった。

### browser 検査の再現可能性（F7-06）

```text
問題: 「62 checks / 0 fail」を 6 wave にわたり載せてきたが、harness は
      scratch にしか無く、読み手が検算する手段が無かった。
対応: tools/browser-checks/ へ 5 つの harness と README を commit。
      内訳: browser 34 / probe 8 / failopen 10 / stageA 10 = 62
      加えて parser-boundary（42形の差分 harness）。
```

### 回帰（修理後・全量）

```text
npm test        : 630 pass / 0 fail
browser         : 62 pass / 0 fail（repository 内の harness で再実行）
parser boundary : 42形 / bypass 0 / over-rejection 7
mutation        : 5/5 KILLED（すべて 54b15a7 時点では生存）
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §44 — 独立検証8 の修理実測（D-041）

### F8-01: 真の原因は lookahead（全角固有ではなかった）

```text
witness            df88109  HEAD
図面．ｄｗｇ１        受理     拒否
構造計算書．ｐｄｆＡ     受理     拒否
図面.ｐｄｆ９         受理     拒否
構造計算書.pdf2      受理     拒否   ← 純 ASCII。畳みと無関係に最初から開いていた
図面.dwg1           受理     拒否
```

### F8-05: 畳みを 1 か所へ集約した効果

```text
                                  df88109  HEAD
ａｂｃ＠ｅｘａｍｐｌｅ．ｃｏｍ             受理     拒否
ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ                受理     拒否
Ｃ：＼Ｕｓｅｒｓ＼ｘ                      受理     拒否
ｎｏｔｉｏｎ．ｓｏ/ｐａｇｅ                 受理     拒否
＜img onerror=alert(1)＞           受理     受理   ← detect 規則には畳みを適用しない
```

### 単調性の確認（F8-02 の原因が消えたこと）

```text
証人 2208（3幹 × 46拡張子 × dot 2形 × 半角/全角 × 末尾 4形）
  shipped は 2208/2208 を拒否
  fold を FF41..FF5A へ狭める mutant : stricter 0 / looser 1128
  fold 上端 FF5E→FF5D              : stricter 0 / looser 0
→ 畳みを狭める変更は**単調に緩くなるだけ**。
   「狭めると拒否が増える」という F8-02 の非単調性は原理的に消滅した。
```

### harness の反証可能性（F8-04）

```text
tag guard を `return false;` にした copy を作り、**その copy の** harness を実行:
  修正前（絶対パス） : BYPASSES 0   ← 欠陥を見ていない
  修正後（相対パス） : BYPASSES 19
  実 repository        : BYPASSES 0
```

### コスト（畳みを全規則へ広げた影響）

【§45による追記（検証9 F9-07）】入力形を記録していなかったので検算できなかった。
形を明記すると再現する（§45 参照）。全角散文の行は `１．５倍で検討` の反復であり、
`．` を多数含むため dot の少ない全角文より高く出る。

```text
入力                          N=2000  4000   8000   16000
  ASCII 散文（畳み不要）        0.2    0.3    0.5    0.8 ms
  全角散文（畳む）           4.9    9.6   20.1   39.3 ms
  最悪 ASCII ("ab."*N)        4.2   14.2   52.9  200.9 ms
  最悪 全角 ("ａｂ．"*N)       5.5   17.5   59.6  265.7 ms
```

二次の部分は既存の `email-like`（QD-J04）であり、畳みはその上に
定数倍（最悪 +32%）を乗せるだけ。新しい計算量クラスは入っていない。
ASCII のみのテキストは 2 度目の検査をする必要がないので影響を受けない。

### 回帰（修理後・全量）

```text
npm test        : 634 pass / 0 fail
browser         : 62 pass / 0 fail（harness は相対パス化済み）
parser boundary : 42形 / bypass 0
mutation        : 13/13 KILLED（検証8 の 11 生存変異 + 畳み端点 2）
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §45 — 独立検証9 の修理実測（D-042）

### F9-01: 広い畳みへの差し替えが F1 クラスを再び開けていた

```text
witness                   df88109  4573d01  HEAD
構造計算書（最新）．ｐｄｆ        拒否     受理     拒否
図面（改訂）．ｄｗｇ            拒否     受理     拒否
見積書（２０２６）．ｘｌｓｘ      拒否     受理     拒否
図面＜最新＞．ｄｗｇ            拒否     受理     拒否
構造計算書（最新）.pdf           拒否     拒否     拒否
```

### F9-03: lookahead 全削除のコスト（前回記録していなかった）

```text
witness                        4573d01  HEAD
window.document を直接触らない     拒否     受理
e.target.value を読む           拒否     受理
Workspace.csvEscape を使う      拒否     受理   ← workspace.js の実在の export
config.documentation を参照     拒否     受理
構造計算書.pdf2               拒否     拒否   ← 閉じたクラスは維持
図面．ｄｗｇ１                  拒否     拒否
構造計算書．ｐｄｆＡ               拒否     拒否   ← normalizedPattern が担当
```

### F9-02: D-041 の訂正値をグリッド定義付きで再導出

```text
グリッド: 3幹（図面 / 構造計算書 / plan）× 46具体拡張子
        × dot 2形（. ．）× 拡張子の半角/全角 = 552 base
        + 552 × 末尾全角英数字 8形 = 4968 証人
対象 tree: df88109
  df88109 の拒否  : 1656 / 4968
  R7-01 stricter = 828   looser = 0
  R7-02 stricter = 1608  looser = 12
```

D-041 の `1104 / 2412` はどのグリッドでも再現しない。上の値へ訂正した。
（検証9 が独立に出した 828 / 1608 と一致する。）

### コスト（入力形を明記する——F9-07）

```text
入力形                              N=2000  4000   8000   16000
  "検討した値である。"*(N/9)          0.64   0.54   1.22   1.80 ms
  "１．５倍で検討"*(N/7)             4.79   9.27  18.74  39.48 ms
  "ab."*(N/3)                     6.79  15.27  55.91 201.77 ms
  "ａｂ．"*(N/3)                     6.04  17.47  58.58 208.90 ms
```

検証9 は別の全角形を測って 10〜14倍低い値を得た。両方正しい——
`．` を多数含む文は畳み後に dot が増え、filename / email 系の規則をより深く踏む。
**欠陥は値ではなく、入力形を記録しなかったこと**である。

### 回帰（修理後・全量）

```text
npm test        : 637 pass / 0 fail
browser         : 62 pass / 0 fail
parser boundary : 42形 / bypass 0
mutation        : 9/9 KILLED
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §46 — 独立検証10 の修理実測（D-043）

### F10-02: 区切り文字による 100% 素通り

```text
witness                 e336428  HEAD
plan (1).pdf              受理    拒否
構造計算書 (2).pdf          受理    拒否
構造計算書(最新).pdf         受理    拒否
構造計算書「最新」.pdf        受理    拒否
構造計算書 .pdf             受理    拒否
```

### F10-01: 正規化形への境界無し適用が散文を巻き込んでいた

```text
witness                             e336428  HEAD
window.document を触らない（DOM側）      拒否    受理
Workspace.csvEscape を使う（注）        拒否    受理
```

### F10-06: dot 相当の符号

```text
構造計算書。ｐｄｆ （U+3002 = JP IME のピリオドキー）  受理 → 拒否
構造計算書｡pdf  （U+FF61）                        受理 → 拒否
構造計算書․pdf  （U+2024）                        受理 → 拒否
中黒は写さない: `PDF・doc形式で提出`                  受理 → 受理
```

### normalizer の必要性を測った（推論しない）

```text
全規則クラスを含む corpus での行動差:
  narrow fold を削除   →   0 差分   ← 幹を捨てたので寄与が無くなった
  wide fold を削除     →   8 差分   （ａｂｃ＠… 等の全角 URL/email/path）
  dot 写像を削除       →   4 差分   （構造計算書。pdf 等）
→ narrow を削除。役割の無い normalizer を「これだけが捕まえる」という
   偽の証人付きで残すのは、本Campaign が繰り返し罰してきた装飾的 guard そのもの。
```

なお旧 S34 の「wide 専用」証人 `ｗｗｗ．…` は専用ではなかった
（U+FF57 は narrow でも畳まる）——何も固定していなかった（検証10 F10-04）。

### 回帰スイープ（過去の全 head に対して）

```text
vs 2659e3c : regression 0
vs cb7a75b : regression 0
vs 54b15a7 : regression 0
vs df88109 : regression 0
vs 4573d01 : 1 —— `window.document`。その head は lookahead を全削除しており、
             その振舞い自体が F9-03 で指摘された欠陥。意図した修正。
vs e336428 : regression 0
```

### 回帰（修理後・全量）

```text
npm test        : 638 pass / 0 fail
browser         : 62 pass / 0 fail
parser boundary : 42形 / bypass 0
mutation        : 9/9 KILLED
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §47 — 独立検証11 の修理実測（D-044）

### F11-01: 削除の根拠が偽だった

```text
witness 資料＿ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ
  2659e3c 受理 / cb7a75b 受理 / 54b15a7 受理 / df88109 受理 / 4573d01 受理
  e336428 拒否（www）   ← narrow fold だけが捕まえられていた
  e51d7aa 受理          ← 削除して失った
  HEAD    拒否（www）   ← 復旧
```

### 回帰スイープ（commit された corpus、212,058 入力）

```text
vs 2659e3c : 0      vs cb7a75b : 0      vs 54b15a7 : 0
vs df88109 : 0      vs e51d7aa : 0
vs 4573d01 : 6262   すべて private-document-filename（語境界クラス / 意図）
vs e336428 : 11411  同上
再現方法: node tools/guard-diff/diff-heads.mjs <rev>
```

### F11-02: dot 写像 12 メンバの固定

```text
修正前: 12 中 2 のみ固定。残り 10 を削除する変異がすべて **638/0** で生存
（【検証12 F12-03 による訂正】当時の suite は 638。639 は HEAD の件数だった）
修正後: 12/12 KILLED（P2J-S37 が定数とは独立に全員列挙）
```

### 回帰（修理後・全量）

```text
npm test        : 639 pass / 0 fail
browser         : 62 pass / 0 fail
parser boundary : 42形 / bypass 0
mutation        : 13/14 KILLED（【検証13 F13-06 による訂正】R11-02 は
                  到達不能な分岐の変異で、原理上殺せない等価変異だった）
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §48 — 独立検証12 の修理実測（D-045）

### F12-01: 左隣接

```text
witness                                      7685e64  HEAD
資料_www.example.com                          受理     拒否
一次資料_https://internal.example.jp/docs/plan   受理     拒否
図面は/home/user/案件/最新版 に置いた            受理     拒否
原本は~/Documents/案件 にある                  受理     拒否
検討2https://x.example.jp/p                   受理     拒否
```

### F12-06: 挿入型の回避（種類の欠落）

```text
www<ZWSP>.example.com          受理 → 拒否
https<ZWSP>://…               受理 → 拒否
tanaka<ZWSP>@example.co.jp     受理 → 拒否
構造計算書.p<ZWSP>df             受理 → 拒否
www<SOFT HYPHEN>.example.com   受理 → 拒否
数学用英字 w ×3 + .example.com    受理 → 拒否（NFKC）
別字（g ×3）は受理のまま——過剰拒否していない
```

### F12-04: dot 集合の一貫性

```text
構造計算書。pdf / ｡pdf / ․pdf   拒否（full stop）
PDF・doc形式 / PDF·doc形式 / PDF‧doc形式  受理（中黒・高さ付きドット）
→ 字形が同じ U+0387 / U+00B7 を同じ扱いにした
```

### 回帰（修理後・全量）

```text
npm test        : 642 pass / 0 fail
browser         : 62 pass / 0 fail
parser boundary : 42形 / bypass 0
mutation        : 9/9 KILLED
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §49 — 独立検証13 の修理実測（D-046）

### F13-01: 不可視文字

```text
                          7c006be  HEAD
www<U+E0041>.example.com    受理     拒否
www<U+FE0F>.example.com     受理     拒否
構造計算書.p<U+E0001>df     受理     拒否
www<U+FFF9>.example.com     受理     拒否
宣言 24 → クラス導出（430）
```

### F13-03 / F13-07 / F13-12

```text
構造計算書‧pdf / 意匠図一式⸳dwg      受理 → 拒否（dot 集合を 12 へ戻した）
C:<U+00A5>Users<U+00A5>案件           受理 → 拒否
<U+FFE5><U+FFE5>fileserver<U+FFE5>案件  受理 → 拒否
検討<U+2028>結果                    受理 → 拒否
価格は<U+00A5>1,500,000とする        受理のまま
U+00B7 の除外は意図的（QD-J13）
```

### corpus を diff の軸へ

```text
【検証14 F14-04/F14-05 による訂正】親の corpus は 212,421（212,058 は再現しない）。
DOTS を 6 → 16 と書いたが実際は 12 メンバ中 11——U+0387 が無く U+00B7 が重複していた。
現在は定数から**導出**する（定数と drift し得ない）。corpus 601,088、
INVISIBLE を 5 → 10、¥ 軸を追加。
vs 7685e64 : regression 0（拡張後の corpus で）
```

### 回帰（修理後・全量）

```text
npm test        : 643 pass / 0 fail
browser         : 62 pass / 0 fail
parser boundary : 42形 / bypass 0
mutation        : 【検証14 F14-01/F14-02 による訂正】7/9 + 生存 2。
                  R13-01（手書き 24 へ戻す）は生存していた——看板変更を守る test が無かった。
                  R13-02（/g を外す）も等価ではない——不可視文字 16 以上で閉包が throw する。
                  自分の等価判定は証人を 2〜3 文字しか試さなかったためである
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

## §50 — 独立検証14 の修理実測（D-047）

### F14-01: 看板変更を守る test が無かった

```text
修正前: FORMAT_CHARS を手書き 24 へ戻す変異 → 643/643 で生存
修正後: 同じ変異 → KILLED（P2J-S39 が導出されていることを測る）
実測: BMP 80 / astral（E0000..E01EF）399 / 全体 4,206 対 手書き 24
```

### F14-03: ¥ fold の過剰拒否

```text
                         09d35e7  HEAD
Price:\u00a5500              拒否     受理
Total:\u00a51,500,000        拒否     受理
JPY:\u00a51,500              拒否     受理
C:\u00a5Users\u00a5tanaka\u00a5案件  拒否     拒否   ← path 側は維持
\uffe5\uffe5fileserver\uffe5案件   拒否     拒否
```

### F14-08: Cf だけでは不可視文字は閉じない

```text
drive<U+3164>.google.com/file/d/1AbCdEf   受理 → 拒否
構造計算書.p<U+3164>df                 受理 → 拒否
www<U+115F>.example.com / <U+17B4>          受理 → 拒否
\p{Variation_Selector} は削除（260 件全部が Default_Ignorable の部分集合、全走査確認）
```

### F14-04: instrument を定数から導出へ

```text
DOTS を手書き 16 → 実装の DOT_EQUIVALENTS + 除外側を導出（欠落 0）
RULE_CORES の UNC payload を forward slash → backslash（¥ 軸が発火するように）
corpus 601,088 入力、vs 09d35e7 regression 0
```

### 回帰（修理後・全量）

```text
npm test        : 643 pass / 0 fail
browser         : 62 pass / 0 fail
parser boundary : 42形 / bypass 0
mutation        : 7/7 KILLED + 1 等価（全コードポイント走査で確認）
protected facts : verifiedCases 0 / sample_default / 1250×2050 / V0 34 / roughness III
```

