# Run State

- Run ID: LR-20260920-GLASS-P2F
- Mode: LONG_RUN
- Horizon: 8H
- Current state: RUNNING（Wave 0-2完了 → Wave 4 UI / reconciliation表示へ）
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2f-verified-project-cases
- Base SHA: a185b4675cac03d501ea6805b449437c3fbbb0fd
- Current artifact-sync head: `RESOLVE_DYNAMICALLY` — `git rev-parse HEAD` またはPRの現在headで解決する（自己参照回避contract）
- Current wave: Wave 2 — Evidence Ledger / Promotion Gate / Verified Case validator（完了）
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
- [x] AC-02 — **PASS**（inventory実施。契約をevidence.jsへ移動し重複を解消）
- [x] AC-03 — **PASS**（evidence-ledger.js）
- [x] AC-04 — **PASS**（gateをtrusted経路へ接続。bypass mutationはすべてkill）
- [x] AC-05 — **PASS**（field verified ≠ case verified）
- [ ] AC-06 Verified Project Case validatorが成立
- [x] AC-07 — **PASS**（sample_default / unverified のまま）
- [ ] AC-08 CW overall dimensions / pitchからpane dimensionを推定しない
- [x] AC-09 — **PASS**（reconcileはEvidence優先。数値一致でも INSUFFICIENT_EVIDENCE）
- [x] AC-10 — **PASS**（推測経路なし。算定provenance主張時はevaluation_height根拠を要求）
- [x] AC-11 — **PASS**（reconcileFact / MATCH・MISMATCH・INSUFFICIENT_EVIDENCE）
- [x] AC-12 — **PASS**（判定順序がEvidence優先。mutationで固定）
- [x] AC-13 — **PASS**（read-only。preset不変をtestで固定）
- [x] AC-14 — **PASS**（verifiedCasesは空のまま）
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

Wave 0-2完了。Wave 3は Evidence UNAVAILABLE のため SKIPPED_BY_DESIGN。

```text
Wave 0  Fresh Gate / Run Artifact / Phase 2E closeout / baseline   DONE
Wave 1  architecture inventory + Evidence contract抽出              DONE
Wave 2  Promotion Gate closure / Evidence Ledger / case validator   DONE
Wave 3  private Evidence reconciliation                            SKIPPED_BY_DESIGN / NO_EVIDENCE_AVAILABLE
Wave 4  UI Evidence status / reconciliation diagnostic             次
```

**project-specific promotion: NONE。** verifiedCases: 0。Explicit unverified items: 4。

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
full npm test (current)        : PASS（233 pass / 0 fail）
Evidence availability          : UNAVAILABLE（§23の経路を取る）
Evidence contract抽出           : PASS（evidence.js が単一の正。重複実装なし）
Promotion Gate on trusted paths: PASS（verifiedValue / identity / validateVerifiedCase）
public source reference検証     : PASS（構造要件。13種の不正参照を拒否）
Evidence Ledger                : PASS（field-level fact + case-level promotion）
reconciliation                 : PASS（MATCH ≠ verified を構造的に分離）
mutation（gate bypass 5件）     : PASS（すべてkill）
mutation（ledger 3件）          : PASS（M8はtest gapを露呈→closeしてkill）
```

## Hard Checks（Quality Debt化禁止）

```text
private Evidence leak                    : PASS（現時点でprivate情報の記載なし）
secret leak                              : PASS
trust promotion bypass                   : PASS（trusted構築経路がすべてgateを通る。mutationで確認）
verified-state spoofing                  : 未評価（Wave 5 import spoofingで検証）
data integrity                           : PASS（preset無変更をtestで固定）
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
