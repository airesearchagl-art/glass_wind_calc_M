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
| 0 | Fresh Gate / Run Artifact初期化 / Phase 2F closeout / baseline | `7b28a3084c9581cabf5d0daca3b36b1752d2560f` |
| 1 / 2 | workspace.js / Workspace Package v1 / evaluation orchestration | `620310c970b3e1f0ef6767fc1e2f562705970f0f` |
| 3 / 4 | Batch UI / TSV paste / Workspace JSON / CSV export | `8d21997bc50fc21089be3fac8689c78f33e621fb` |
| 4H | Batch Error Contract Closure（Required Fix 1 / 2） | `8f496e4c61571f21924841cc90addea37be4b4d2` |
| 5 | security / privacy / mutation | `1bc978c52ba3448e070fb4799bfd0db17e081386` |
| 6 / 7 | verifier findings repair / README / artifact convergence | `6a4728e32178220efb7d10e2bed6ea55f02eaa34` |
| — | Final Artifact Reconciliation | `current_artifact_sync_head = RESOLVE_DYNAMICALLY`（このcommit自身を含むため固定値を書かない） |

自己参照commit SHAは固定しない。過去のcommitになったwaveは確定値へ置き換える。

**Implementation verification head**: `6a4728e32178220efb7d10e2bed6ea55f02eaa34`
source / tests / UI の確定head。以降のcommitはRun Artifactの同期のみで、
implementationを変更していない。

## Notes

- 本Run ArtifactはWave 0の実装開始**前**に作成した。
- Task Packetは2通のメッセージで分割到着した。snapshotは両者の忠実な連結。
  詳細は DECISIONS.md D-000。
