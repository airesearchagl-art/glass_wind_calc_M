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
W1-1 告示1454号（Er / 粗度区分パラメータ）                        DONE（Human提供Evidence）
W1-2 告示1458号（帳壁の風圧算定）                                 DONE（Human提供Evidence）
W1-3 板硝子協会 風圧力計算法 / 耐風圧強度計算法                   DONE（Human提供Evidence）
W1-4 採用する式・係数・適用範囲をEVIDENCE.mdへ記録               DONE（§4）
W1-5 確認不能項目をUNVERIFIED / NOT_IMPLEMENTEDとして明示        DONE
W1-6 known-answer test（供給4値をbit-exactで固定）                DONE

W1-X 一次資料の特定（title / publisher / public URL）             DONE（7件、EVIDENCE.md §1.2）
W1-Y block性質の実測とproxy denial記録                            DONE（EVIDENCE.md §1.3）
W1-Z 代替根拠の評価と不採用理由の記録                             DONE（D-003 / EVIDENCE.md §1.4）
```

**Hard rule**: 一次資料で直接確認できなかった式 / 係数 / zone rule / height rule /
internal pressure rule / roughness rule を推測実装しない。成立しない部分はBLOCKED。

**結果: Research Gate ESTABLISHED_FROM_HUMAN_SUPPLIED_PRIMARY_EVIDENCE。**
当初は候補host全てがegress policyにより403でBLOCKEDとなった（D-002）が、
Humanがoption (b)で外部確認済みの一次資料内容を提供し解除された（D-004）。
推測実装・snippet実装はいずれも0件。

## Wave 2 — Wind core

```text
W2-1 generic wind input contract（Research Gateで確定した項目のみ） DONE
W2-2 Wind Pressure Trace data model                                DONE
W2-3 pure calculation core（wind-pressure.js）                     DONE
W2-4 error boundary（fail closed / NaN / Infinity）                DONE
```

## Wave 3 — Project Input Package integration

```text
W3-1 v1据え置き vs v2昇格の設計判断（DECISIONS.mdへ記録）          DONE
W3-2 migration（v1非破壊 / unknown future version fail closed）    DONE
W3-3 trust model（formula verified ≠ input verified）              DONE
```

## Wave 4 — UI

```text
W4-1 告示風圧計算modeの追加（既存3 modeは回帰なし）                DONE
W4-2 trace表示                                                     DONE
W4-3 Miyoshi comparison diagnostic（replacementではない）          DONE
```

## Wave 5 — Tests

```text
W5-1 known-answer tests                                            DONE
W5-2 boundary tests                                                DONE
W5-3 mutation tests                                                DONE
W5-4 security / privacy                                            DONE
```

## Wave 6 — Verification

```text
W6-1 browser verification（4 mode、JS error 0）                    DONE
W6-2 full regression                                               DONE
W6-3 independent verifier（別context）                             DONE
```

## Wave 7 — Convergence

```text
W7-1 README同期                                                    DONE
W7-2 Run Artifact収束                                              DONE
W7-3 Draft PR                                                      DONE
W7-4 Vercel Preview exact-head                                     DONE
W7-5 Completion Report                                             DONE
```

## Acceptance Criteria status

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Research Gate | PASS（human_supplied_primary_evidence。推測実装0件） |
| AC-02 | Generic Wind Core | DONE |
| AC-03 | Traceability | DONE |
| AC-04 | Formula vs Input verification separation | DONE |
| AC-05 | Notification mode | DONE |
| AC-06 | Project Input integration | DONE |
| AC-07 | Design pressure contract | PASS（max(|正圧|,|負圧|) を維持。告示風圧計算経路でも同契約） |
| AC-08 | Replay | DONE |
| AC-09 | Migration | PASS（PIP v1→v2の決定的migration。v1挙動不変、v1+windInput拒否、v3以上fail closed） |
| AC-10 | Miyoshi diagnostic | DONE |
| AC-11 | No automatic Z inference | PASS（粗度区分・階→Z・自治体別V0・隅角部判定をいずれも実装せず明示入力。階由来キーは未知フィールドとして拒否） |
| AC-12 | Error boundary | DONE |
| AC-13 | Unit discipline | DONE |
| AC-14 | Known-answer tests | DONE |
| AC-15 | Miyoshi regression | PASS（1756.09756097561 / 1463.4146341463415 / Manual 1400 を再実測。preset値・statusは無変更） |
| AC-16 | Existing tests（133+） | PASS（baseline 133 → 197 pass / 0 fail、テスト削除なし） |
| AC-17 | Browser | DONE |
| AC-18 | Security | PASS（改竄pressureの再計算による無効化、trace到達値は数値/固定列挙のみ、HTMLエスケープ境界、Phase 2D boundary維持） |
| AC-19 | Privacy | PASS（新規URLは公的一次資料8件のみ。private識別子なし） |
| AC-20 | Documentation | DONE |

## Next Action

```text
Independent Verifierの結果反映 → Draft PR → Vercel Preview exact-head → Completion Report
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
Humanは option (b) を選択し、Research Gateは解除された（D-004）。

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
