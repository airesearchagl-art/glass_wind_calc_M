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

## Wave 2H — Hardening（完了）

```text
W2H-A Ledger entryのimmutability（deep freeze / 切り離し）        DONE
W2H-B factKey allowlist（fail closed）                            DONE
W2H-C 非公開IPリテラル範囲の是正（fe80::/10全域・IPv6 class）      DONE
W2H-7 sourceReferenceのcanonical copy                             DONE
W2H-8 verifiedValueのpublic reference保持（Option A）             DONE
W2H-M 選定mutation 7件（H4はtest gapを露呈→close後kill）          DONE
```
```

## Wave 3 — private Evidence reconciliation

```text
W3-1 Evidenceが実際に利用可能な範囲でのみ実施   SKIPPED_BY_DESIGN / NO_EVIDENCE_AVAILABLE
```

**Evidence UNAVAILABLEのため、project-specific promotionは行わない（§23 / D-001）。**
これは失敗ではない。データを捏造してwaveを埋めない。

## Wave 4 — UI

```text
W4-1 Miyoshi evidence-status表示                                  DONE
W4-2 Verified Case selector（0件のため描画しない）                 DONE（空UIを作らない）
W4-3 reconciliation diagnostic（read-only / preset不変）           DONE
```

## Wave 5 — Tests

```text
W5-1 promotion gate / spoofing / privacy                          DONE
W5-2 mutation（gate 5 / ledger 3 / Wave 2H 7）                     DONE
W5-3 regression（4 modes / Wind Trace / PIP v1・v2）               DONE
```

## Wave 6 — Verification

```text
W6-1 browser                                                      DONE（JS error 0）
W6-2 full regression                                              DONE（256 pass / 0 fail）
W6-3 independent verifier（別context）                             実行中
```

## Wave 7 — Convergence

```text
W7-1 README同期                                                    DONE
W7-2 Run Artifact収束                                              DONE
W7-3 Draft PR                                                      次
W7-4 Vercel Preview exact-head                                     次
W7-5 Completion Report + Human Evidence Request Matrix             次
```

## Acceptance Criteria status

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Private Evidenceがpublic repoへ入らない | PASS |
| AC-02 | Existing contracts inventory / 重複実装なし | PASS |
| AC-03 | Generic Evidence Ledger | PASS |
| AC-04 | promotion guard fail closed | PASS |
| AC-05 | partial → case-level 自動昇格なし | PASS |
| AC-06 | Verified Case validator | PASS |
| AC-07 | sample defaultをEvidenceなしに昇格しない | PASS |
| AC-08 | CW寸法 / pitchからpane推定しない | PASS |
| AC-09 | 近似一致だけでpressure昇格しない | PASS |
| AC-10 | floor→Z推測しない | PASS |
| AC-11 | reconciliation table | PASS |
| AC-12 | MATCH と verified の分離 | PASS |
| AC-13 | mismatch時にpreset自動更新しない | PASS |
| AC-14 | verifiedCases はgate通過caseのみ | PASS |
| AC-15 | imported dataはverifiedを作れない | PASS |
| AC-16 | UIでEvidence status明確 | PASS |
| AC-17 | 4 modes regressionなし | PASS |
| AC-18 | Wind Trace regressionなし | PASS |
| AC-19 | PIP v1/v2 compatibility | PASS |
| AC-20 | Documentation sync | PASS |

## Wave 8 — Independent Verifier findings repair

| ID | 指摘 | 対応 |
|---|---|---|
| F1 | 末尾ルートドットでprivate provider denylist / 完全修飾判定を迂回（HIGH） | FIXED（正規化後に判定） |
| F2 | createEntryのTOCTOU（gateと保存で別の値） | FIXED（snapshotを確定してからgate） |
| F3 | trusted configが未freezeで検証後改変が可能 | FIXED（deepFreeze） |
| F4 | contract定義表をlive mutableで公開 | FIXED（freeze） |
| F5 | reconcileFactが自己申告statusを信用 | FIXED（gate再実行） |
| F6 | case-level gate再実行が未テスト（mutation survivor） | FIXED（test追加。MF6でkill確認） |
| F7 | Run Artifactの誇張・陳腐化・変更ファイル過小記載 | FIXED（RUN_STATE.md） |
| F8 | 私設TLD / CGNAT / wildcard DNS / 追加provider / cred param | FIXED |
| F9 | caseIdにpublic-safe checkなし | FIXED |
| F10 | Evidence panelが例外を黙殺 | FIXED |
| F11 | identity literalとgateの結び付きが規約のみ | FIXED（結果を検査） |
| F12 | critical fact空時に空虚な真 | FIXED |

修復mutation 19件すべてkill。テスト 256 → 270 pass / 0 fail。

## Next Action

```text
Claude側: なし（Wave 8で完了）
Human Gate: PR #7 の Ready-for-review / merge / Production 認可
           private Evidence供給（EVIDENCE.md のEvidence Request Matrix）
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
