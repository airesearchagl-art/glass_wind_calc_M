# RUN_MANIFEST — LR-20260920-GLASS-P2F

## Immutable Task Packet binding

```yaml
run_id: LR-20260920-GLASS-P2F
task_packet_id: LRP-20260920-GLASS-P2F
task_packet_revision: 1
task_packet_snapshot_path: .agent-run/LR-20260920-GLASS-P2F/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: 9c2185f13346f899771be1f1201e7db2874f12b44df918c4a71450e7f2f2db44
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2f-verified-project-cases
```

digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes**に対するSHA-256（Phase 2D/2Eと同一のcanonical定義）。
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

## Repository state（Wave 0 Preflight実測）

```yaml
base_branch: main
base_sha: a185b4675cac03d501ea6805b449437c3fbbb0fd
work_branch: claude/phase2f-verified-project-cases
previous_pr: "#6 (MERGED)"
working_tree_state: clean
tracked_changes: 0
untracked_files: 0
project_instruction: none (CLAUDE.md / .claude/rules は本リポジトリに存在しない)
```

Fresh Gate: `origin/main == a185b4675cac03d501ea6805b449437c3fbbb0fd` を実測で確認済み。

## Baseline（Wave 0実測）

```text
node: v22.22.2
test command: npm test （= node --test）
baseline tests: 197 pass / 0 fail
  tests/calc.test.js               27
  tests/manual-config.test.js      19
  tests/project-config.test.js     43
  tests/project-input.test.js      45
  tests/ui-mode-separation.test.js 24
  tests/wind-pressure.test.js      39
browser: Playwright + headless Chromium（execution environmentで利用可能）
Vercel: PRごとの自動Preview Deployment
```

Task Packet §1の要求（197 tests以上 / 0 fail）を満たす。

## Run Artifact policy

- 本Run ArtifactはWave 0の実装開始**前**に作成した。
- **private Evidenceそのものを記録しない**（Task Packet §5）。
  private URL / file ID / internal path / private filename / drawing number /
  staff name / client formal identity / session ID / credential / secret /
  raw private document excerpt / private document hashは記載しない。
- 記録してよいのは public-safe derived fact / verification status / evidence level /
  checkedAt / public-safe description / privateReferenceAvailable boolean /
  generic source category のみ。
- official public source URLは記載可（Phase 2Eと同じ扱い）。

## Wave / Checkpoint commit mapping

| Wave | Goal | Commit（full SHA） |
|---|---|---|
| 0 | Fresh Gate / Run Artifact初期化 / Phase 2E closeout / baseline | `6b69a7b320f7756f46ad60e6b0fb7225a8406e11` |
| 1 | architecture inventory / Evidence contract抽出 | `0c76b4e4acc4e748967f9af9027f4b5c90499805` |
| 2 | Promotion Gate closure / Evidence Ledger / case validator | `cc98ebc13a64e808a30658f15f0b85c6106e2b89` |
| 2H | immutability / factKey allowlist / IP boundary / reference保持 | `f289249c4e96cafdbd53c8d12a394b7c122bccf5` |
| 4 / 5 | Evidence status UI / 照合表示 / spoofing tests | `31dac755836a7a1f702b307d05c2a406b9a3d82a` |
| 6 / 7 | Browser / README / Run Artifact convergence / Draft PR | `0f15f9f5f78e5cac0e947a165b3682273d887b28` |
| 8 | Independent verifier findings repair (F1-F12) | `ffaac1ce52a8ebf8d94dcbc5155fa412d9a2195b` |
| — | Final Artifact Reconciliation | `current_artifact_sync_head = RESOLVE_DYNAMICALLY`（このcommit自身を含むため固定値を書かない） |

Wave 3 は Evidence UNAVAILABLE のため `SKIPPED_BY_DESIGN / NO_EVIDENCE_AVAILABLE`。
データを捏造してwaveを埋めていない。
