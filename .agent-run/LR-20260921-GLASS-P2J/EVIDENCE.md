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
