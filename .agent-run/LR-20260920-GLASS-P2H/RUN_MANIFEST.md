# Run Manifest — LR-20260920-GLASS-P2H

## Binding

```yaml
run_id: LR-20260920-GLASS-P2H
task_packet_id: LRP-20260920-GLASS-P2H
task_packet_revision: 1
task_packet_snapshot: .agent-run/LR-20260920-GLASS-P2H/TASK_PACKET_SNAPSHOT.md
task_packet_sha256: ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2h-project-profile-scenario-matrix
base_sha: e7d396621536acd21934fc92892087be0f47d8d6
execution_mode: LONG_RUN
horizon: 8H
long_run_endurance: false
```

digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes**に対するSHA-256
（Phase 2D〜2Gと同一のcanonical定義）。Resume時は再計算し、一致しなければ `BLOCKED`。

## Repository state（Wave 0 Preflight実測）

```text
origin/main     : e7d396621536acd21934fc92892087be0f47d8d6（expectedと一致）
working tree    : clean
tracked changes : 0
untracked files : 0
working branch  : claude/phase2h-project-profile-scenario-matrix（origin/mainから作成）
```

## Baseline（Wave 0実測）

```text
npm test : 342 pass / 0 fail
expected : >= 342 / 0 fail  → 一致
```

## Wave / Checkpoint commit mapping

| Wave | Goal | Commit（full SHA） |
|---|---|---|
| 0 | Fresh Gate / Run Artifact初期化 / Phase 2G closeout / baseline | `ca1fd9f` |
| 1-3 | Profile module / Package v1 / resolver / Scenario Matrix | `de2787e` |
| 4 | Profile editor UI / effective preview / Matrix UI / TSV | `3346494` |
| 4H | Boundary Closure（Required Fix A / B / C）+ artifact sync | `RESOLVE_AT_CHECKPOINT` |

自己参照commit SHAは固定しない。過去commitになったwaveは確定値へ置き換える。
