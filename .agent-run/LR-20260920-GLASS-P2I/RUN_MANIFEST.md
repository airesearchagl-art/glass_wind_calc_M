# Run Manifest — LR-20260920-GLASS-P2I

## Binding

```yaml
run_id: LR-20260920-GLASS-P2I
task_packet_id: LRP-20260920-GLASS-P2I
task_packet_revision: 1
task_packet_snapshot: .agent-run/LR-20260920-GLASS-P2I/TASK_PACKET_SNAPSHOT.md
task_packet_sha256: 901afdc2317e0b38ca90dcb69ba1fb8d8b271b1e073acd40e20d0e784c8f229e
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2i-design-review-package
base_sha: 6a5232f65d02e2a8bfa8c2c87049b5865c584855
execution_mode: LONG_RUN
horizon: 8H
long_run_endurance: false
```

digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes**に対するSHA-256
（Phase 2D〜2Hと同一のcanonical定義）。Resume時は再計算し、一致しなければ `BLOCKED`。

## Repository state（Wave 0 Preflight実測）

```text
origin/main     : 6a5232f65d02e2a8bfa8c2c87049b5865c584855（expectedと一致）
working tree    : clean
tracked changes : 0
untracked files : 0
working branch  : claude/phase2i-design-review-package（origin/mainから作成）
main direct write: なし
```

## Baseline（Wave 0実測）

```text
npm test : 398 pass / 0 fail
expected : >= 398 / 0 fail  → 一致
```

## Wave / Checkpoint commit mapping

| Wave | Goal | Commit（full SHA） |
|---|---|---|
| 0 | Fresh Gate / Run Artifact初期化 / Phase 2H closeout / baseline | `RESOLVE_DYNAMICALLY` |

自己参照commit SHAは固定しない。過去commitになったwaveは確定値へ置き換える。
各ファイルがどのheadで最終化されたかを併記する（Phase 2Hの文言訂正を踏襲）。
