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
