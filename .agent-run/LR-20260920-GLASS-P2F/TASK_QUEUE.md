# TASK QUEUE — LR-20260920-GLASS-P2F

## Wave 0 — Fresh Gate / Run Artifact / Phase 2E closeout / baseline

```text
W0-1 Fresh Gate（origin/main == a185b467…、tree clean）          DONE
W0-2 branch作成（claude/phase2f-verified-project-cases）          DONE
W0-3 baseline npm test 実測（197 pass / 0 fail）                  DONE
W0-4 Run Artifact 7ファイル作成 + digest binding                  DONE
W0-5 Evidence availability判定（§6の4 source）                     DONE → UNAVAILABLE
W0-6 Phase 2E post-merge closeout（snapshot/digestは不変）         DONE
```

## Wave 1 — Existing architecture inventory

```text
W1-1 validateVerifiedCase() / verifiedCases の確認                TODO
W1-2 Evidence factory / promotion guard の確認                    TODO
W1-3 verificationStatus / privateReferenceAvailable の確認        TODO
W1-4 getPublicLabel() / PIP / preset registry の確認              TODO
W1-5 再利用 vs generic抽出の方針決定（DECISIONSへ記録）            TODO
```

**Task Packet §7**: 新moduleを作る前に必ず確認する。既存contractを重複実装しない。
不用意なlarge refactorはしない。

## Wave 2 — Evidence Ledger / promotion gate / Verified Case validator

```text
W2-1 generic Evidence Ledger（field-level fact）                  TODO
W2-2 promotion gate（fail closed）                                TODO
W2-3 Verified Case validator（case-level）                        TODO
W2-4 partial facts が case-level verified へ昇格しないこと        TODO
```

## Wave 3 — private Evidence reconciliation

```text
W3-1 Evidenceが実際に利用可能な範囲でのみ実施                      N/A（Evidence UNAVAILABLE）
```

**Evidence UNAVAILABLEのため、project-specific promotionは行わない（§23 / D-001）。**

## Wave 4 — UI

```text
W4-1 Miyoshi evidence-status表示                                  TODO
W4-2 Verified Case selector（casesが存在する場合のみ）             N/A（verifiedCases: []）
W4-3 reconciliation diagnostic（read-only / preset不変）           TODO
```

## Wave 5 — Tests

```text
W5-1 promotion gate / spoofing / privacy（§22の24カテゴリ）        TODO
W5-2 mutation                                                     TODO
W5-3 regression（4 modes / Wind Trace / PIP v1・v2）               TODO
```

## Wave 6 — Verification

```text
W6-1 browser                                                      TODO
W6-2 full regression                                              TODO
W6-3 independent verifier（別context）                             TODO
```

## Wave 7 — Convergence

```text
W7-1 README同期                                                    TODO
W7-2 Run Artifact収束                                              TODO
W7-3 Draft PR                                                      TODO
W7-4 Vercel Preview exact-head                                     TODO
W7-5 Completion Report + Human Evidence Request Matrix             TODO
```

## Acceptance Criteria status

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Private Evidenceがpublic repoへ入らない | TODO |
| AC-02 | Existing contracts inventory / 重複実装なし | TODO |
| AC-03 | Generic Evidence Ledger | TODO |
| AC-04 | promotion guard fail closed | TODO |
| AC-05 | partial → case-level 自動昇格なし | TODO |
| AC-06 | Verified Case validator | TODO |
| AC-07 | sample defaultをEvidenceなしに昇格しない | TODO |
| AC-08 | CW寸法 / pitchからpane推定しない | TODO |
| AC-09 | 近似一致だけでpressure昇格しない | TODO |
| AC-10 | floor→Z推測しない | TODO |
| AC-11 | reconciliation table | TODO |
| AC-12 | MATCH と verified の分離 | TODO |
| AC-13 | mismatch時にpreset自動更新しない | TODO |
| AC-14 | verifiedCases はgate通過caseのみ | TODO |
| AC-15 | imported dataはverifiedを作れない | TODO |
| AC-16 | UIでEvidence status明確 | TODO |
| AC-17 | 4 modes regressionなし | TODO |
| AC-18 | Wind Trace regressionなし | TODO |
| AC-19 | PIP v1/v2 compatibility | TODO |
| AC-20 | Documentation sync | TODO |

## Next Action

```text
Wave 1 Existing Evidence architecture inventory
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
