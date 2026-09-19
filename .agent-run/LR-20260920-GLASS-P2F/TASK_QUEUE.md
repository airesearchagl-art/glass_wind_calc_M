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
W1-1 validateVerifiedCase() / verifiedCases の確認                DONE
W1-2 Evidence factory / promotion guard の確認                    DONE
W1-3 verificationStatus / privateReferenceAvailable の確認        DONE
W1-4 getPublicLabel() / PIP / preset registry の確認              DONE
W1-5 再利用 vs generic抽出の方針決定（D-004）                      DONE
W1-6 Evidence contractを evidence.js へ抽出（重複解消）            DONE
```

**Task Packet §7**: 新moduleを作る前に必ず確認する。既存contractを重複実装しない。
不用意なlarge refactorはしない。

## Wave 2 — Evidence Ledger / promotion gate / Verified Case validator

```text
W2-0 Promotion Gateをtrusted構築経路へ接続（§3 A/B/C）            DONE
W2-1 public primary source referenceの構造validator（§4）          DONE
W2-2 sourceReferenceの正規形を定義（§5）                           DONE
W2-3 gate mutation / regression tests（§6の12カテゴリ）            DONE
W2-4 generic Evidence Ledger（field-level fact）                  DONE
W2-5 Verified Case validator（case-level）                        DONE
W2-6 partial facts が case-level verified へ昇格しないこと        DONE
```

## Wave 3 — private Evidence reconciliation

```text
W3-1 Evidenceが実際に利用可能な範囲でのみ実施   SKIPPED_BY_DESIGN / NO_EVIDENCE_AVAILABLE
```

**Evidence UNAVAILABLEのため、project-specific promotionは行わない（§23 / D-001）。**
これは失敗ではない。データを捏造してwaveを埋めない。

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
| AC-02 | Existing contracts inventory / 重複実装なし | PASS |
| AC-03 | Generic Evidence Ledger | PASS |
| AC-04 | promotion guard fail closed | PASS |
| AC-05 | partial → case-level 自動昇格なし | PASS |
| AC-06 | Verified Case validator | PASS |
| AC-07 | sample defaultをEvidenceなしに昇格しない | PASS |
| AC-08 | CW寸法 / pitchからpane推定しない | TODO |
| AC-09 | 近似一致だけでpressure昇格しない | PASS |
| AC-10 | floor→Z推測しない | PASS |
| AC-11 | reconciliation table | PASS |
| AC-12 | MATCH と verified の分離 | PASS |
| AC-13 | mismatch時にpreset自動更新しない | PASS |
| AC-14 | verifiedCases はgate通過caseのみ | PASS |
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
