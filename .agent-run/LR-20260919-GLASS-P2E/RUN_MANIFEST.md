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
| 0 | Fresh Gate / Phase 2D closeout / Run Artifact初期化 / baseline | `6d9ff267bcf3b82301961d652eb1ef91614e013d` |
| 1（BLOCKED） | Research Gate試行 → 一次資料へ到達不能 | `d7d6ed588c4a9c52b234d54ada319b0fb7a413f7` |
| 1（解除） | Human提供Evidenceによる Research Gate 成立 | `f5dd772e264a7f57e743f6b8081cccbda57e9196` |
| 2 | `wind-pressure.js`（汎用風圧算定コア + trace） | `c9ba59d4ae1aa39947a67cff98672a48c8a3d874` |
| 3 | Project Input Package v2統合 / migration | `80b5e62f62807db3d118afe75ed49faba9bb0a0c` |
| 4 | UI告示風圧計算モード / trace表示 / Miyoshi参考比較 | `7b479406605ad5d456ae3765252b96dca4035993` |
| 5 | security / privacy / mutation | `90bb9f40c8a41259d2a71eca1698f03a45c695ff` |
| 7（先行） | README同期 | `e6bf6e9d2a2ad664abd280abded63f94957ffd52` |
| 6 / 7（収束） | Run Artifact更新・Draft PR・Preview確認 | 本Run Artifact更新commit自身を含むため固定値を書かない |

Run Artifact自身を含むcommitのSHAは、そのcommit確定前に本文へ固定値で書けない（自己参照）。
確定済みの過去Waveのcheckpoint SHAは上表のとおり。
