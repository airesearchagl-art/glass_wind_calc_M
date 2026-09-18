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
W1-1 国土交通省 平成12年建設省告示第1454号 の一次資料確認         TODO
W1-2 国土交通省 平成12年建設省告示第1458号 の一次資料確認         TODO
W1-3 板硝子協会 風圧力計算法 / 耐風圧強度計算法 の確認            TODO
W1-4 採用する式・係数・適用範囲をEVIDENCE.mdへ記録               TODO
W1-5 確認不能項目をUNVERIFIED / NOT_IMPLEMENTEDとして明示        TODO
W1-6 known-answer test計画（source exampleがあれば優先）          TODO
```

**Hard rule**: 一次資料で直接確認できなかった式 / 係数 / zone rule / height rule /
internal pressure rule / roughness rule を推測実装しない。成立しない部分はBLOCKED。

## Wave 2 — Wind core

```text
W2-1 generic wind input contract（Research Gateで確定した項目のみ） TODO
W2-2 Wind Pressure Trace data model                                TODO
W2-3 pure calculation core（wind-pressure.js）                     TODO
W2-4 error boundary（fail closed / NaN / Infinity）                TODO
```

## Wave 3 — Project Input Package integration

```text
W3-1 v1据え置き vs v2昇格の設計判断（DECISIONS.mdへ記録）          TODO
W3-2 migration（v1非破壊 / unknown future version fail closed）    TODO
W3-3 trust model（formula verified ≠ input verified）              TODO
```

## Wave 4 — UI

```text
W4-1 告示風圧計算modeの追加（既存3 modeは回帰なし）                TODO
W4-2 trace表示                                                     TODO
W4-3 Miyoshi comparison diagnostic（replacementではない）          TODO
```

## Wave 5 — Tests

```text
W5-1 known-answer tests                                            TODO
W5-2 boundary tests                                                TODO
W5-3 mutation tests                                                TODO
W5-4 security / privacy                                            TODO
```

## Wave 6 — Verification

```text
W6-1 browser verification（4 mode、JS error 0）                    TODO
W6-2 full regression                                               TODO
W6-3 independent verifier（別context）                             TODO
```

## Wave 7 — Convergence

```text
W7-1 README同期                                                    TODO
W7-2 Run Artifact収束                                              TODO
W7-3 Draft PR                                                      TODO
W7-4 Vercel Preview exact-head                                     TODO
W7-5 Completion Report                                             TODO
```

## Acceptance Criteria status

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Research Gate | TODO |
| AC-02 | Generic Wind Core | TODO |
| AC-03 | Traceability | TODO |
| AC-04 | Formula vs Input verification separation | TODO |
| AC-05 | Notification mode | TODO |
| AC-06 | Project Input integration | TODO |
| AC-07 | Design pressure contract | TODO |
| AC-08 | Replay | TODO |
| AC-09 | Migration | TODO |
| AC-10 | Miyoshi diagnostic | TODO |
| AC-11 | No automatic Z inference | TODO |
| AC-12 | Error boundary | TODO |
| AC-13 | Unit discipline | TODO |
| AC-14 | Known-answer tests | TODO |
| AC-15 | Miyoshi regression | TODO |
| AC-16 | Existing tests（133+） | TODO |
| AC-17 | Browser | TODO |
| AC-18 | Security | TODO |
| AC-19 | Privacy | TODO |
| AC-20 | Documentation | TODO |

## Next Action

```text
Wave 1 Official-source Research Gate
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
