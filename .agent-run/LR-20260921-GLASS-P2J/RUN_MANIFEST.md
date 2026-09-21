# Run Manifest — LR-20260921-GLASS-P2J

## Binding

```yaml
run_id: LR-20260921-GLASS-P2J
task_packet_id: LRP-20260921-GLASS-P2J
task_packet_revision: 1
task_packet_snapshot: .agent-run/LR-20260921-GLASS-P2J/TASK_PACKET_SNAPSHOT.md
task_packet_sha256: aa9ce07dac4767afc0ad9ff4b13663ae8cc2ab1be98e9e44ef80498da3acc446
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2j-evidence-closure-gate
base_sha: 44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
execution_mode: LONG_RUN
horizon: 8H
long_run_endurance: false
```

digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes**に対するSHA-256
（Phase 2D〜2Iと同一のcanonical定義）。Resume時は再計算し、一致しなければ `BLOCKED`。

## Repository state（Wave 0 Preflight実測）

```text
origin/main     : 44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb（expectedと一致）
working tree    : clean
tracked changes : 0
untracked files : 0
working branch  : claude/phase2j-evidence-closure-gate（origin/mainから作成）
main direct write: なし
```

## Baseline（Wave 0実測）

```text
npm test : 500 pass / 0 fail
expected : >= 500 / 0 fail  → 一致
```

## Wave / Checkpoint commit mapping

| Wave | Goal | Commit（full SHA） |
|---|---|---|
| 0 | Fresh Gate / Run Artifact / Phase 2I closeout / baseline / 一次資料の可用性判定 | `RESOLVE_DYNAMICALLY` |

自己参照commit SHAは固定しない。各ファイルがどのheadで最終化されたかを併記する
（Phase 2H で「以降はRun Artifactのみ」と書いて事実と合わなくなった経緯を踏まえる）。
