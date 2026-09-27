# TASK PACKET SNAPSHOT — Phase 2K

> **このファイルは一切編集しない。** Run 開始時の Task Packet をそのまま固定し、
> digest を RUN_MANIFEST.md が bind する。resume 時に再 hash して一致を確かめること。
> 不一致なら BLOCKED。推測で継続しない。

Phase 2K — Verification Instrument Independence
検証器の独立性・再現性・証拠適格性を構造化する

Repository:
`airesearchagl-art/glass_wind_calc_M`
Base:
`main @ 7bef30751ebaa2aa0f306f3bd584c4e025be77a1`
Recommended branch:
`claude/phase2k-verification-instrument-independence`
Mode:
LONG_RUN
Recommended horizon:
8H
Do not use endurance unless separately requested.

## 1. Phase objective

Phase 2Jで残った主問題は、guard rule そのものでなく検証方法である。
対象: QD-J20（verification instrument が implementation と同じ仮定を共有）/
QD-J23（publication-lint discovery と test が同じ non-recursive assumption を共有）/
QD-J24（verification-instrument independence limitation）

Phase 2Kでは「テストが緑だから正しい」でなく、
「この結果は、どの独立したinstrumentから得られ、何を証明し、何を証明しないか」を
機械可読・再現可能にする。

## 2. Non-goals

Phase 2Kでは新しいguard ruleを増やさない。
禁止: open-set heuristic の normalization chase / www・provider・token 表記の追加収集 /
Phase 2J guard policy の再設計 / actual Evidence promotion / verifiedCases 変更 /
current preset 変更 / Ready・merge・Production / Phase 2J history の書き換え。
Phase 2Jの結論を前提として固定する。

## 3. Fresh Gate

main exact SHA: `7bef30751ebaa2aa0f306f3bd584c4e025be77a1` / tree clean /
Phase 2J PR #11: MERGED / Frozen Phase 2J implementation head:
`e273ef0df4762861c5ffe8224efdea9ad2c9577f` /
Baseline npm test 約 659 / 0（実測値を記録）/
Current project state: observations 0 / closure BLOCKED_BY_MISSING_EVIDENCE /
Promotion Candidate NONE / verifiedCases []

## 4. New Run Artifact

Run ID `LR-20260927-GLASS-P2K`。RUN_MANIFEST / TASK_PACKET_SNAPSHOT / RUN_STATE /
TASK_QUEUE / DECISIONS / EVIDENCE / QUALITY_DEBT。
immutable Task Packet digest を bind。Phase 2J artifact は変更しない。

## 5. Wave 0 — instrument inventory only

最初は実装しない。Inventory: npm/node tests / evidence-publication-lint /
guard-diff corpus / mutation runner・operators / browser verification harness /
DOM injection probe / fail-closed probe / source・privacy scans /
protected-value probes / Independent Review procedure。

各 instrument について: (1) target (2) oracle source (3) implementation との共有依存
(4) hand-maintained input (5) derived input (6) positive control (7) negative control
(8) reproducibility (9) committed / ephemeral (10) failure classification
(11) what it proves (12) what it does NOT prove

## 6. Shared-assumption graph

中心成果物: Verification Dependency Graph。
implementation と instrument が同じ regex / constant / file list / path walker /
normalization / token set / helper / expected count を共有していないか可視化する。
Shared assumption を UNKNOWN / SHARED_INTENTIONALLY / INDEPENDENT のいずれかに分類。

## 7. Evidence admissibility classes

Class A — Regression Evidence: implementation と同じ仕様を固定する test。
有用だが、未知の欠陥を発見する独立 oracle とはみなさない。
Class B — Independent Verification Evidence: 期待値生成が implementation と独立。
別アルゴリズム / declarative spec / externally sourced grammar /
independent filesystem inventory / real browser behavior。
Class C — Observational Evidence: browser・manual・runtime measurement。
強い実測だが、再現 script が repo 外なら durability は低い。
Run Artifact 上でこれらを混同しない。

## 8. Structural independence rule

Independent verifier/test は原則として production private helper を import して
その helper の結果を expected value に使ってはならない。
Bad: production.normalize(x) vs production.normalize(x)
Good: production behavior vs independent specification/oracle
Public API を black-box で呼ぶこと自体は可。

## 9. Publication-lint discovery

QD-J23。現在 implementation も test も non-recursive discovery、current tree は flat。
選択肢を実測比較: A. flat layout を正式 contract / B. recursive discovery を正式 contract。
推奨: 将来の silent miss を避けるため B を検討。
ただし変更する場合は implementation discovery と independent test oracle を
同じ walker で実装しない。nested synthetic fixture で future regression を pin する。

## 10. Do not use fixed counts as completeness proof

禁止例: "12 values なので complete" / "30 mutations なので complete"。
数は結果であって oracle ではない。
Completeness は expected identity/set または spec-derived membership で比較する。

## 11. Mutation evidence

Phase 2Jで改善した operator committed / anchor exact-once / PATCH-MISS separation /
HARNESS ERROR separation を正式 contract 化する。
Mutation result classes: KILLED / SURVIVED / EQUIVALENT / PATCH-MISS / HARNESS_ERROR。
Non-zero exit だけで KILLED にしない。
Each operator records: id / purpose / target contract / expected affected test /
source anchor / mutant digest if practical。

## 12. Differential tool fix

Phase 2Jで判明: `diff-heads.mjs` が first matching rule だけ記録し、
earlier rule に masked された rule を見逃す。
Phase 2Kでは全 rule を independently evaluate できる instrument へする。
Output should distinguish: first match / all matches / behavioral verdict。
Do not change production guard semantics. This is verification tooling only.

## 13. Corpus independence

Hand-maintained corpus を independent oracle とは呼ばない。
可能なら corpus sources を分ける: A. spec-derived structural corpus /
B. real-world prose sample / C. mutation-specific regression cases /
D. fuzz・property generated cases。
同じ generator が production constant を import しない。

## 14. Browser verification durability

Phase 2J browser checks were often scratchpad-only。
Phase 2Kで何を repo へ durable に残すべきか決める。
Do NOT necessarily add Playwright dependency。
Alternative acceptable forms: committed browser probe spec / dependency-free harness if feasible /
browser action manifest / reproducible external command / exact assertions and expected DOM state。
Goal: fresh verifier が previous session scratchpad なしで再構成できること。

## 15. Independent-verifier package

Generate a small machine-readable review package。
Recommended content: target SHA / base SHA / Task Packet digest / changed-file list /
protected invariants / tests to run / browser assertions / privacy assertions /
known non-goals / known QD / expected project Evidence state。
This package must not include: expected final verdict。
Verifier should be able to disagree。

## 16. Instrument provenance

Every substantial verification output should be able to answer:
target SHA / instrument version・SHA / oracle・spec version / input corpus digest / result。
これは「later nobody can reproduce where the number came from」へ直接対応する。

## 17. Numeric evidence rule

Do not put a number into README/Run Artifact as load-bearing evidence unless:
generator is committed / command is recorded / number can be regenerated。
Phase 2J's non-reproducible percentage history must not repeat。

## 18. Browser evidence rule

Never write "browser VERIFIED" unless the exact browser measurement for that exact head exists。
Source inspection != browser verification。If unavailable, UNVERIFIED is acceptable。

## 19. False-positive / false-negative measurement

Do not infer false-positive rate from repository prose。Define population first。
Examples: authoring corpus / synthetic structural corpus / publicDescription candidate corpus。
Report sample・population definition rather than one headline percentage。

## 20. Phase 2J policy frozen

These remain unchanged: 9 hard rules / 3 advisory rules / Human Review requirement /
lint warning behavior / CASE_ID structural independence / Evidence-first rules /
Promotion Gate / Closure Evaluation / Candidate semantics。
Phase 2K instrumentation must observe them, not redesign them。

## 21. Security boundary

Instrument tooling must not create a new trust path。
No tool output may be importable as verified Evidence / Promotion Candidate /
registered preset / verifiedCases。
Verification artifact: evidence about software, not project Evidence。

## 22. Recommended Wave structure

Wave 0: instrument inventory・shared-assumption graph
Wave 1: evidence-admissibility model + machine-readable verification manifest
Wave 2: publication-lint discovery independence・QD-J23 decision
Wave 3: mutation + differential tool reproducibility
Wave 4: browser verification durability
Wave 5: fresh independent verifier trial using only committed artifacts
Wave 6: repair findings・exact-head reverify
Wave 7: README・Artifact convergence・Draft PR

## 23. Primary acceptance criterion

Phase 2K succeeds if a completely fresh verifier can answer
「What should I run, what is the independent oracle, and why is this result admissible evidence?」
without prior conversation / scratchpad scripts / undocumented corpus /
implementation author's verbal explanation, and can reproduce all load-bearing claims。

## 24. Hard Gate

BLOCK if Phase 2K discovers: verification tool silently skips inputs /
PATCH-MISS counted as kill / harness exception counted as success /
runtime source changes accidentally included / project Evidence・trust mutation /
Production action / private data in verification artifact。

## 25. Human Gate

Phase 2K uses: branch → Draft PR → independent verifier → Human Gate。
No direct main. No Ready. No merge. No Production. unless separately authorized。
