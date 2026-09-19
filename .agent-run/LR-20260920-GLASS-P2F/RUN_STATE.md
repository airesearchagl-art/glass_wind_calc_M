# Run State

- Run ID: LR-20260920-GLASS-P2F
- Mode: LONG_RUN
- Horizon: 8H
- Current state: RUNNING（Wave 0完了 → Wave 1 architecture inventoryへ）
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2f-verified-project-cases
- Base SHA: a185b4675cac03d501ea6805b449437c3fbbb0fd
- Current artifact-sync head: `RESOLVE_DYNAMICALLY` — `git rev-parse HEAD` またはPRの現在headで解決する（自己参照回避contract）
- Current wave: Wave 0 — Fresh Gate / Run Artifact / Phase 2E closeout / baseline
- Task Packet ID: LRP-20260920-GLASS-P2F
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260920-GLASS-P2F/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 9c2185f13346f899771be1f1201e7db2874f12b44df918c4a71450e7f2f2db44

## Objective

残っているproject-specific Evidenceを、推測せず・private情報をpublic repoへ漏らさず
照合できる仕組みを完成させる。Evidenceがある項目だけ正しく昇格し、
ない項目はunverifiedのまま維持する。あわせて任意案件で再利用できる
Project Evidence Ledger + Verified Project Case のgeneric boundaryを導入する。

新しい計算式を追加することは主目的にしない。

## Acceptance Criteria

- [ ] AC-01 Private Evidenceがpublic repoへ入らない
- [ ] AC-02 Existing Evidence contractsをinventoryし重複実装しない
- [ ] AC-03 Generic Evidence Ledgerがfield-level factを表現できる
- [ ] AC-04 verified promotion guardがfail closed
- [ ] AC-05 partial verified factsがcase-level verifiedへ自動昇格しない
- [ ] AC-06 Verified Project Case validatorが成立
- [ ] AC-07 1250×2050 sample defaultをEvidenceなしにverifiedへ昇格しない
- [ ] AC-08 CW overall dimensions / pitchからpane dimensionを推定しない
- [ ] AC-09 Miyoshi pressureを近似一致だけでverifiedにしない
- [ ] AC-10 floor→Z mappingを推測しない
- [ ] AC-11 Evidence-backed reconciliation tableを作れる
- [ ] AC-12 MATCHとverifiedを明確に分離
- [ ] AC-13 Mismatch時にpreset自動更新しない
- [ ] AC-14 verifiedCasesはfull promotion gateを通ったcaseだけ
- [ ] AC-15 imported dataはverified evidence/caseを作れない
- [ ] AC-16 Miyoshi UIでEvidence statusが明確
- [ ] AC-17 existing four modes regressionなし
- [ ] AC-18 Wind Pressure Trace Engine regressionなし
- [ ] AC-19 PIP v1/v2 compatibility維持
- [ ] AC-20 README / Evidence / Run Artifact actual sync

## Completed

- Wave 0: Fresh Gate実測（origin/main == a185b467…、tree clean、tracked 0 / untracked 0）
- Wave 0: branch `claude/phase2f-verified-project-cases` を origin/main から作成
- Wave 0: baseline `npm test` 実測 197 pass / 0 fail
- Wave 0: Run Artifact 7ファイルを実装開始**前**に作成、Task Packet digestをbinding
- Wave 0: **Evidence availability判定 = UNAVAILABLE**（§6の4 sourceを順に確認。D-001）
- Wave 0: Phase 2E Run Artifactへpost-merge closeoutを記録（snapshot / digestは不変）

## Current implementation state

実装未着手。Wave 1でexisting Evidence architectureをinventoryしてから
generic moduleを設計する（Task Packet §7: 新moduleを作る前に必ず確認）。

## Evidence availability

```yaml
private_evidence: UNAVAILABLE
determined_at: 2026-09-20
sources_checked: [human_supplied, execution_environment, repository_public_safe, official_public]
vault_files_referencing_this_repository: 0
project_specific_promotion: NOT PERFORMED
verifiedCases: []
explicit_unverified_items: 4   # 維持
```

詳細は EVIDENCE.md §1、判断は DECISIONS.md D-001。

## Checks

```text
Fresh Gate                     : PASS（base SHA一致、working tree clean）
baseline npm test              : PASS（197 pass / 0 fail）
Evidence availability          : UNAVAILABLE（§23の経路を取る）
```

## Hard Checks（Quality Debt化禁止）

```text
private Evidence leak                    : PASS（現時点でprivate情報の記載なし）
secret leak                              : PASS
trust promotion bypass                   : 未評価（Wave 2-5で成立させる）
verified-state spoofing                  : 未評価
data integrity                           : 未評価
Evidence without source                  : PASS（Evidenceを主張していない）
automatic pressure replacement            : PASS（preset無変更）
automatic pane-dimension inference        : PASS（推定していない）
automatic Z inference                     : PASS（推定していない）
```

## Quality Debt

現時点でなし（QUALITY_DEBT.md参照）。Evidence不足はQuality Debtではない。

## Explicit unverified items

```text
1. ガラス1枚の実見付 W/H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m² の元計算根拠
3. 負圧 918 / 1122 N/m² の元計算根拠
4. 各階評価高さ Z とpresetのexact mapping
```

本Campaignでいずれもclosureしない（Evidenceが存在しないため）。

## Known failures

```text
none
```

## Decisions

DECISIONS.md を参照（D-000 digest定義 / D-001 Evidence UNAVAILABLE / D-002 近似一致とreverse solveの不採用 / D-003 空のverifiedCases維持）。

## Files changed

```text
.agent-run/LR-20260920-GLASS-P2F/*  (新規7ファイル)
.agent-run/LR-20260919-GLASS-P2E/*  (post-merge closeoutのみ。snapshot / digestは不変)
```

## Remaining tasks

```text
Wave 1-7（TASK_QUEUE.md参照）
```

## Next action

Wave 1 architecture inventory。`validateVerifiedCase()` / `verifiedCases` /
Evidence factory / promotion guard / `verificationStatus` / `privateReferenceAvailable` /
`getPublicLabel()` / Project Input Package / preset registry をrepository-wide searchし、
既存contractを重複実装しないよう再利用方針を決める。

## Stop conditions status

```text
Fresh Gate                 : PASS
Hard Gate failure          : なし
BLOCKED transition         : 発生していない
no_progress_waves          : 0 / 2（LONG_RUN上限）
same_hypothesis_retry      : 0 / 2
repair_strategies          : 0 / 3
```

## Resume instructions

```text
1. RUN_MANIFEST.md から run_id / repository / working branch / base / Task Packet binding を確認
2. TASK_PACKET_SNAPSHOT.md のファイルbytesのSHA-256を再計算し、
   9c2185f13346f899771be1f1201e7db2874f12b44df918c4a71450e7f2f2db44 と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2f-verified-project-cases で現在headを確認
4. EVIDENCE.md §1 のEvidence availability判定を読む
   （UNAVAILABLEのままなら project-specific promotionへ進まない）
5. QUALITY_DEBT.md を読む
6. npm test でtargeted smoke check
7. 上記 Next action から再開する
```
