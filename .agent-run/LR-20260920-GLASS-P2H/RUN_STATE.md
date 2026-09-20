# Run State

- Run ID: LR-20260920-GLASS-P2H
- Mode: LONG_RUN
- Horizon: 8H
- LONG_RUN_ENDURANCE: false
- Current state: RUNNING
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2h-project-profile-scenario-matrix
- Base SHA: e7d396621536acd21934fc92892087be0f47d8d6
- Current artifact-sync head: `RESOLVE_DYNAMICALLY`
- Implementation verification head: `RESOLVE_AT_CHECKPOINT`
- Current wave: Wave 0 — Fresh Gate / Run Artifact / Phase 2G closeout / baseline
- Task Packet ID: LRP-20260920-GLASS-P2H
- Task Packet revision: 1
- Task Packet SHA-256: ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27

## Objective

大量の告示風圧caseを作るとき、案件共通の風条件（V0 / roughness / 建物高さ /
軒高 / 建物タイプ / 算定基準）を1回だけ入力し、ガラスcase側では
pane / location 固有の値（W / H / 評価高さ Z / 部位 / ガラス種別）だけを
指定できるようにする。

ただし Runtime Project Profile は **registered preset ではなく、
verified Evidence でもない**。利用者がその場で入力した便宜レイヤである。

```text
Profile + Scenario → explicit effective input → 既存 PIP v2 → 既存計算コア
```

## Fresh Gate（Wave 0実測）

```text
origin/main       : e7d396621536acd21934fc92892087be0f47d8d6
expected base     : e7d396621536acd21934fc92892087be0f47d8d6  → 一致
working tree      : clean
tracked changes   : 0
untracked files   : 0
baseline npm test : 342 pass / 0 fail（expected >= 342 / 0 fail → 一致）
main direct write : なし（feature branchで作業）
```

## Phase 2G post-merge closeout

```yaml
phase: 2G
pr: 8
pr_state: MERGED
final_feature_head: ede68ee81553f2e65be4bd6b0a13c3e7b9b70b28
implementation_verification_head: 6a4728e32178220efb7d10e2bed6ea55f02eaa34
merge_commit_main: e7d396621536acd21934fc92892087be0f47d8d6
production: READY
final_focused_review: PASS
required_fix: 0
human_merge_authorization: received
tests: 342 / 0
browser: 84 / 84
mutants: 22 / 22 killed
```

Phase 2G の snapshot / digest は変更しない
（`e8014da92ecb6ce432e6f586d0796a7c99220f0254cdfb729828cdf9465de104`）。

## Architecture inventory（Wave 1実測 / §41）

```text
ProjectInput.fromWindCalculation({widthMm, heightMm, glassType, extraFactor, windInput})
ProjectInput.WIND_INPUT_KEYS =
  ["V0","roughnessCategory","buildingHeightM","eavesHeightM","evaluationHeightM",
   "buildingType","zone","buildingShortSideM","basis","recurrenceYears"]
WorkspaceCore.createWorkspace() / addCase() / MAX_CASES = 1000
wind-pressure.js は未知fieldを fail closed で拒否する
```

Profileが持つのは上記のうち `evaluationHeightM` / `zone` を**除いた**もの。
その2つはScenario側の必須入力とする（D-001）。

## Evidence（Phase 2Hでは変更しない）

```yaml
verifiedCases: []
project_specific_promotion: NONE
explicit_unverified_items: 4
dimensions: 1250x2050 sample_default / unverified
floor_to_Z: unverified
```

詳細は EVIDENCE.md。

## Checks

```text
Fresh Gate            : PASS（base SHA一致 / tree clean）
baseline npm test     : PASS（342 pass / 0 fail）
Phase 2G merged確認    : PASS（ede68ee が origin/main の祖先。merge commit e7d3966）
architecture inventory : PASS（既存関数を実測。新しい計算経路を作らない方針を確定）
```

## Hard Checks（Quality Debt化禁止 / §42）

```text
wrong calculation                : 未評価（Wave 2以降）
implicit Z                       : 未評価
implicit zone                    : 未評価
implicit basis                   : 未評価
floor→Z inference                : 未評価
trusted Profile promotion        : 未評価
Evidence spoof                   : 未評価
registered preset spoof          : 未評価
prototype pollution              : 未評価
private data leak                : 未評価
Single regression                : 未評価（Wave 6）
Batch regression                 : 未評価（Wave 6）
snapshot mutation                : 未評価
unbounded matrix generation      : 未評価
```

## Quality Debt

現時点でなし（QUALITY_DEBT.md参照）。

## Known failures

```text
none
```

## Remaining tasks

```text
Wave 1-7（TASK_QUEUE.md参照）
```

## Next action

Wave 2: `project-profile.js`。Profile / Profile Package v1 / effective resolver を、
既存の `ProjectInput.fromWindCalculation()` へ渡す形だけで実装する
（新しい pressure calculation を書かない）。

## Stop conditions status

```text
Fresh Gate            : PASS
Hard Gate failure     : なし
BLOCKED transition    : 発生していない
no_progress_waves     : 0 / 2
same_hypothesis_retry : 0 / 2
repair_strategies     : 0 / 3
```

## Resume instructions

```text
1. RUN_MANIFEST.md から binding を確認
2. TASK_PACKET_SNAPSHOT.md を再hashし
   ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27 と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2h-project-profile-scenario-matrix で現在headを確認
4. EVIDENCE.md を読む（Phase 2HはEvidence stateを変更しない）
5. QUALITY_DEBT.md を読む
6. npm test でsmoke check
7. 上記 Next action から再開する
```
