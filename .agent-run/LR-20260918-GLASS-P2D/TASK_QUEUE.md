# TASK_QUEUE — LR-20260918-GLASS-P2D

Wave単位・AC単位のタスク状態。Wave完了ごとに更新する。

## Wave plan

| Wave | Goal | Dependency | Expected check | Checkpoint | Status |
|---|---|---|---|---|---|
| 0 | Fresh Gate / canonical read / Phase 2C closeout / Run Artifact初期化 / baseline | — | Fresh Gate PASS, baseline 91/0 | `4cbde645` | done |
| 1 | calc.js core purity（deprecated Miyoshi複製の削除 + consumer移行） | Wave 0 | npm test 92/0, purity grep 0件 | `d4a32883` | done |
| 2 | Project Input Package schema / validator / normalization / serialization + generic preset registry | Wave 1 | npm test 123/0 | `ab60842d` | done |
| 3 | safe import / export / replay + trust downgrade / security boundary | Wave 2 | security tests（Wave 2と同一checkpoint） | `ab60842d` | done |
| 4 | UI integration（Miyoshi / Manual / Imported state clarity） | Wave 3 | npm test 128/0, browser smoke PASS | `0b82f143` | done |
| 5 | mutation / security / privacy / full regression + independent verifier | Wave 4 | full suite / browser / privacy sweep / AC-10 audit 完了。self reviewで1件修正（`190b3c43`）。independent verification 実行中 | `190b3c43` | in_progress |
| 6 | README / Run Artifact convergence / Draft PR / Vercel Preview | Wave 5 | README同期済み（`fbcdfc9f`）。Draft PR / Preview exact-headが残 | 一部done | in_progress |

## Acceptance Criteria status

| AC | 内容 | Status |
|---|---|---|
| AC-01 | Calculation core完全案件非依存化 | PASS |
| AC-02 | Versioned Project Input Package | PASS |
| AC-03 | Common validator / factory | PASS |
| AC-04 | Generic preset registry | PASS |
| AC-05 | Imported dataをtrusted presetへ昇格させない | PASS |
| AC-06 | Safe import / export / replay | PASS |
| AC-07 | Import security | PASS |
| AC-08 | Backward compatibility / migration | PASS |
| AC-09 | Regression | PASS |
| AC-10 | Phase 2D new tests（20カテゴリ） | PASS |
| AC-11 | Browser verification | PASS |
| AC-12 | Vercel Preview exact-head | PASS（実装確定head `43f8e2ae` で READY / success） |
| AC-13 | Privacy / Disclosure | PASS — Wave 7で3箇所を是正。残1件はD-600 option (a) でAC-13対象外と確定 |
| AC-14 | Documentation | PASS（README同期済 / PR本文同期済） |

## Next Action

```text
1. Final focused independent review
2. Human Gate — Ready / merge authorization
```

Next Action: Independent Focused Review → Human Gate。

D-600（TASK_PACKET_SNAPSHOT.md内のVercel deployment identifier）は
Human decision option (a) によりCLOSED。Task Packet revisionは1のまま、digestも不変。

## Wave 7 — Independent Verification repair（完了）

```text
W7-1 privacy: deployment識別子の除去（3箇所）           DONE
W7-2 test gap: 厚板/薄板>2.5 除外のcandidate level固定  DONE（mutant M17 kill）
W7-3 test gap: K2_RATIO_CAP=2.0 の固定                  DONE（mutant M16 kill）
W7-4 hardening: registry同一性によるpreset限定           DONE
W7-5 purity test厳格化（小文字miyoshiのpath pointer限定） DONE
W7-6 全test / browser / privacy sweep 再実行             DONE（133 pass / 0 fail）
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。


## Final Artifact Reconciliation / Human Decision Closure（完了）

```text
FR-1 D-600 Human decision (option (a)) をDECISIONS.mdへ記録しclosure   DONE
FR-2 RUN_STATEのstale state除去（RUNNING/verifier待ち/Wave 5 → actual） DONE
FR-3 current_artifact_sync_head を RESOLVE_DYNAMICALLY contractへ同期   DONE
FR-4 AC-12を実装確定head 43f8e2ae へ同期（deployment ID再追加なし）     DONE
FR-5 Privacy Hard Gate表現の統一（PASS。waiver扱いにしない）            DONE
FR-6 Remaining tasks / Next action を actual へ同期                    DONE
FR-7 full test / digest / source無変更 / privacy sweep 再確認           DONE
FR-8 Preview exact-head（新head）確認 + PR本文同期                     DONE
```

本フェーズではsource code / tests / security repairを一切変更していない。

## Phase 2D closeout（post-merge）

```text
PR #5                              MERGED
final feature head                 dba12ae72c8496154d828ad8a3f0ac5e76b6657e
merge / main                       a26714c6dd2d8bca80e18fcf1e97d7d184c9254f
Production                         READY
Final Focused Independent Review   PASS（Required Fix 0）
Human merge authorization          received
Final Run State                    COMPLETE_PENDING_FULL_VERIFY（explicit unverified items 4件保持のため）
```

Next Action: none — Phase 2Dは終了。後続はPhase 2E（LR-20260919-GLASS-P2E）。
