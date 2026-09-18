# TASK QUEUE — LR-20260919-GLASS-P2E

## Wave 0 — Fresh Gate / Phase 2D closeout / Run Artifact / baseline

```text
W0-1 Fresh Gate（origin/main == a26714c6…、tree clean）          DONE
W0-2 branch作成（claude/phase2e-wind-pressure-trace）             DONE
W0-3 baseline npm test 実測（133 pass / 0 fail）                  DONE
W0-4 Run Artifact 7ファイル作成 + digest binding                  DONE
W0-5 Phase 2D post-merge closeout（snapshot/digestは不変）        DONE
```

## Wave 1 — Official-source Research Gate（最重要）

```text
W1-1 国土交通省 平成12年建設省告示第1454号 の一次資料確認         BLOCKED（403）
W1-2 国土交通省 平成12年建設省告示第1458号 の一次資料確認         BLOCKED（403）
W1-3 板硝子協会 風圧力計算法 / 耐風圧強度計算法 の確認            BLOCKED（403）
W1-4 採用する式・係数・適用範囲をEVIDENCE.mdへ記録               N/A（採用可能な式なし）
W1-5 確認不能項目をUNVERIFIED / NOT_IMPLEMENTEDとして明示        DONE
W1-6 known-answer test計画（source exampleがあれば優先）          BLOCKED（W1-1..3依存）

W1-X 一次資料の特定（title / publisher / public URL）             DONE（7件、EVIDENCE.md §1.2）
W1-Y block性質の実測とproxy denial記録                            DONE（EVIDENCE.md §1.3）
W1-Z 代替根拠の評価と不採用理由の記録                             DONE（D-003 / EVIDENCE.md §1.4）
```

**Hard rule**: 一次資料で直接確認できなかった式 / 係数 / zone rule / height rule /
internal pressure rule / roughness rule を推測実装しない。成立しない部分はBLOCKED。

**結果: Research Gate NOT_ESTABLISHED。** 候補host全てがegress policyにより403。
Task Packet §5 / §9 / §19により Wave 2以降を停止した（D-002）。推測実装は0件。

## Wave 2 — Wind core

```text
W2-1 generic wind input contract（Research Gateで確定した項目のみ） BLOCKED（AC-01依存）
W2-2 Wind Pressure Trace data model                                BLOCKED（AC-01依存）
W2-3 pure calculation core（wind-pressure.js）                     BLOCKED（AC-01依存）
W2-4 error boundary（fail closed / NaN / Infinity）                BLOCKED（AC-01依存）
```

## Wave 3 — Project Input Package integration

```text
W3-1 v1据え置き vs v2昇格の設計判断（DECISIONS.mdへ記録）          BLOCKED（AC-01依存）
W3-2 migration（v1非破壊 / unknown future version fail closed）    BLOCKED（AC-01依存）
W3-3 trust model（formula verified ≠ input verified）              BLOCKED（AC-01依存）
```

## Wave 4 — UI

```text
W4-1 告示風圧計算modeの追加（既存3 modeは回帰なし）                BLOCKED（AC-01依存）
W4-2 trace表示                                                     BLOCKED（AC-01依存）
W4-3 Miyoshi comparison diagnostic（replacementではない）          BLOCKED（AC-01依存）
```

## Wave 5 — Tests

```text
W5-1 known-answer tests                                            BLOCKED（AC-01依存）
W5-2 boundary tests                                                BLOCKED（AC-01依存）
W5-3 mutation tests                                                BLOCKED（AC-01依存）
W5-4 security / privacy                                            BLOCKED（AC-01依存）
```

## Wave 6 — Verification

```text
W6-1 browser verification（4 mode、JS error 0）                    BLOCKED（AC-01依存）
W6-2 full regression                                               BLOCKED（AC-01依存）
W6-3 independent verifier（別context）                             BLOCKED（AC-01依存）
```

## Wave 7 — Convergence

```text
W7-1 README同期                                                    BLOCKED（AC-01依存）
W7-2 Run Artifact収束                                              BLOCKED（AC-01依存）
W7-3 Draft PR                                                      BLOCKED（AC-01依存）
W7-4 Vercel Preview exact-head                                     BLOCKED（AC-01依存）
W7-5 Completion Report                                             BLOCKED（AC-01依存）
```

## Acceptance Criteria status

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Research Gate | **BLOCKED**（一次資料へ到達不能。推測実装0件） |
| AC-02 | Generic Wind Core | BLOCKED（AC-01依存） |
| AC-03 | Traceability | BLOCKED（AC-01依存） |
| AC-04 | Formula vs Input verification separation | BLOCKED（AC-01依存） |
| AC-05 | Notification mode | BLOCKED（AC-01依存） |
| AC-06 | Project Input integration | BLOCKED（AC-01依存） |
| AC-07 | Design pressure contract | PASS（無変更） |
| AC-08 | Replay | BLOCKED（AC-01依存） |
| AC-09 | Migration | PASS（vacuously。PIP v1無変更） |
| AC-10 | Miyoshi diagnostic | BLOCKED（AC-01依存） |
| AC-11 | No automatic Z inference | PASS（vacuously。推測を実装していない） |
| AC-12 | Error boundary | BLOCKED（AC-01依存） |
| AC-13 | Unit discipline | BLOCKED（AC-01依存） |
| AC-14 | Known-answer tests | BLOCKED（AC-01依存） |
| AC-15 | Miyoshi regression | PASS（無変更） |
| AC-16 | Existing tests（133+） | PASS（133 pass / 0 fail、削除なし） |
| AC-17 | Browser | BLOCKED（AC-01依存） |
| AC-18 | Security | PASS（source無変更） |
| AC-19 | Privacy | PASS（official public source URLのみ） |
| AC-20 | Documentation | BLOCKED（AC-01依存） |

## Next Action

```text
Human escalation — Research Gateのunblock方法の決定

(a) egress policyへ一次資料hostを追加
(b) Humanが一次資料の該当部分（完全な係数表を含む）をEvidenceとして提供
(c) Phase 2Eのscopeを一次資料不要の範囲へ再定義（Task Packet revision 2）
(d) Phase 2Eを保留し別Phaseを先行

詳細は RUN_STATE.md の Next action / BLOCKED escalation summary を参照。
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
