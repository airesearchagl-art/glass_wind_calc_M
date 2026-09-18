# RUN_MANIFEST — LR-20260919-GLASS-P2E

## Immutable Task Packet binding

```yaml
run_id: LR-20260919-GLASS-P2E
task_packet_id: LRP-20260919-GLASS-P2E
task_packet_revision: 1
task_packet_snapshot_path: .agent-run/LR-20260919-GLASS-P2E/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: 137e9cde09e91cb49a0a57ab20c2e369f892f46ce38836c6529c9823ee10185f
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2e-wind-pressure-trace
```

digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes**に対するSHA-256（Phase 2Dと同一のcanonical定義）。
snapshotにはTask Packet本文のみを格納し、wrapper metadataは本Manifest側に置くことで自己参照を回避している。

各Checkpoint成立前にsnapshotを再hashし、本digestと一致することを確認する。不一致ならBLOCKED。

## Campaign identity

```yaml
execution_mode: LONG_RUN
horizon: 8H
endurance: false
checkpoint_policy: EACH_WAVE
checkpoint_commit: true
checkpoint_push: true
resume_policy: ENABLED
final_output: DRAFT_PR
ready_for_review: PROHIBITED
merge: PROHIBITED
production: PROHIBITED
retain_run_artifact_until: COMPLETE_VERIFIED_OR_HUMAN_CLOSEOUT
```

`human_explicit_long_run_authorization: true`（Task Packet §0-1）。
`human_explicit_endurance_authorization: false` — `LONG_RUN_ENDURANCE`は明示的にfalse。

## Repository state（Wave 0 Preflight実測）

```yaml
base_branch: main
base_sha: a26714c6dd2d8bca80e18fcf1e97d7d184c9254f
work_branch: claude/phase2e-wind-pressure-trace
previous_pr: "#5 (MERGED)"
working_tree_state: clean
tracked_changes: 0
untracked_files: 0
project_instruction: none (CLAUDE.md / .claude/rules は本リポジトリに存在しない)
```

Fresh Gate: `origin/main == a26714c6dd2d8bca80e18fcf1e97d7d184c9254f` を実測で確認済み（期待値と一致）。

## Baseline（Wave 0実測）

```text
node: v22.22.2
test command: npm test （= node --test）
baseline tests: 133 pass / 0 fail
  tests/calc.test.js               27
  tests/manual-config.test.js      19
  tests/project-config.test.js     43
  tests/project-input.test.js      33
  tests/ui-mode-separation.test.js 11
browser: Playwright + headless Chromium（execution environmentで利用可能）
Vercel: PRごとの自動Preview Deployment（プロジェクト連携済み）
```

Task Packet §1の要求（133 tests以上 / 0 fail）を満たす。

## Run Artifact policy

- 本Run ArtifactはWave 0の実装開始**前**に作成した。
- public-safe情報のみを記録する。private URL / private document name / private file ID /
  internal path / session ID / secret / credential / formal confidential identityは記載しない（AC-19）。
- **official public source URLは記載可**（AC-19明記）。Research Gateの一次資料URLはEVIDENCE.mdへ記録する。
- `COMPLETE_PENDING_FULL_VERIFY`到達時点・Draft PR作成時点では削除しない。

## Wave / Checkpoint commit mapping

| Wave | Goal | Commit（full SHA） |
|---|---|---|
| 0 | Fresh Gate / Phase 2D closeout / Run Artifact初期化 / baseline | 本Wave 0 commit自身を含むため固定値を書かない（自己参照回避） |

以降のWaveは成立ごとに追記する。
