# Run Manifest — LR-20260920-GLASS-P2G

## Binding

```yaml
run_id: LR-20260920-GLASS-P2G
task_packet_id: LRP-20260920-GLASS-P2G
task_packet_revision: 1
task_packet_snapshot: .agent-run/LR-20260920-GLASS-P2G/TASK_PACKET_SNAPSHOT.md
task_packet_sha256: e8014da92ecb6ce432e6f586d0796a7c99220f0254cdfb729828cdf9465de104
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2g-batch-scenario-workspace
base_sha: ace00edfe4325570e8c31cde9cf56b2c708c458d
execution_mode: LONG_RUN
horizon: 8H
long_run_endurance: false
```

digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes**に対するSHA-256
（Phase 2D / 2E / 2F と同一のcanonical定義）。

Resume時は再計算し、一致しなければ `BLOCKED`。推測で継続しない。

## Repository state（Wave 0 Preflight実測）

```text
origin/main        : ace00edfe4325570e8c31cde9cf56b2c708c458d  （expected と一致）
working tree       : clean
tracked changes    : 0
untracked files    : 0
working branch     : claude/phase2g-batch-scenario-workspace（origin/main から作成)
```

## Baseline（Wave 0実測）

```text
npm test : 270 pass / 0 fail
expected : >= 270 / 0 fail   → 一致
node     : v22.x
```

## Environment

```text
tests   : node --test（外部test runnerを追加しない）
browser : Playwright + headless Chromium（execution environmentで利用可能）
build   : なし（static HTML / UMD modules / file:// で動作）
```

## Checkpoint policy

```yaml
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
```

## Wave / Checkpoint commit mapping

| Wave | Goal | Commit（full SHA） |
|---|---|---|
| 0 | Fresh Gate / Run Artifact初期化 / Phase 2F closeout / baseline | `RESOLVE_AT_CHECKPOINT` |

自己参照commit SHAは固定しない（commit自身を含むwaveは `RESOLVE_AT_CHECKPOINT`
のままにし、後続waveで確定値へ置き換える）。

## Notes

- 本Run ArtifactはWave 0の実装開始**前**に作成した。
- Task Packetは2通のメッセージで分割到着した。snapshotは両者の忠実な連結。
  詳細は DECISIONS.md D-000。
