# RUN_MANIFEST — LR-20260918-GLASS-P2D

## Immutable Task Packet binding

```yaml
run_id: LR-20260918-GLASS-P2D
task_packet_id: LRP-20260918-GLASS-P2D
task_packet_revision: 1
task_packet_snapshot_path: .agent-run/LR-20260918-GLASS-P2D/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: 6d38bb4ff293276195a36551bd1d5fb117230d889a0683912145e468f460a7df
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2d-project-input-package
```

digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes**に対するSHA-256（canonical定義: `Long_Run_Development_Route.md` の Immutable Task Packet binding）。snapshotにはTask Packet本文のみを格納し、digest等のwrapper metadataは本Manifest側に置くことで自己参照を回避している。

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

`human_explicit_long_run_authorization: true`（Task Packet §0「HumanはLONG_RUNを明示承認している」）。
`human_explicit_endurance_authorization: false` — `LONG_RUN_ENDURANCE`は明示承認されていないため使用しない（Task Packet §0）。

## Repository state（Wave 0 Preflight実測）

```yaml
base_branch: main
base_sha: 97bc18e53c7d3a86b3f180f408e265fec3cf5117
work_branch: claude/phase2d-project-input-package
previous_pr: "#4 (MERGED)"
working_tree_state: clean
tracked_changes: 0
untracked_files: 0
pre_existing_changes: none
project_instruction: none (CLAUDE.md / .claude/rules は本リポジトリに存在しない)
```

Fresh Gate: `origin/main == 97bc18e53c7d3a86b3f180f408e265fec3cf5117` を実測で確認済み（期待値と一致）。

## Baseline（Wave 0実測）

```text
node: v22.22.2
test command: npm test （= node --test）
baseline tests: 91 pass / 0 fail
  tests/calc.test.js              23
  tests/manual-config.test.js     19
  tests/project-config.test.js    43
  tests/ui-mode-separation.test.js 6
browser: Playwright + headless Chromium（execution environmentで利用可能）
Vercel: PRごとの自動Preview Deployment（プロジェクト連携済み）
```

## Canonical read（Wave 0実施）

Task Packet §1の読込順に従い、以下をObsidian Vaultから実読した。

```text
02_Prompts/LLM_IDE/Long_Run_Development_Route.md          read
03_Templates/Long_Run_Task_Packet.md                      read
02_Prompts/LLM_IDE/Implementation_Task_Prompt.md          read
02_Prompts/LLM_IDE/Claude_Code_Capability_Tier_Orchestration.md  read
02_Prompts/LLM_IDE/Documentation_Sync_Handoff.md          read
repository CLAUDE.md / .claude/rules                      存在しない（確認済み）
README / 対象file / tests                                 read
```

### Constraint記録

Phase 2C（LR-20260917-GLASS-P2C）ではVaultへのアクセスが拒否され、canonical文書を読めないまま実行した。今回のPhase 2Dではread-onlyでのVault参照に成功し、canonical Routeを正本として適用できている。

ただし `register_repo_root`（Vault側のCLAUDE.md/skillsを自動ロードさせるtool呼び出し）は実行環境のauto-mode classifierにより拒否された（理由: Auto-Mode Bypass）。tool自身の案内に従い、回避策を取らずに該当ファイルを直接Readして代替した。Vaultは**読み取りのみ**で、書き込みは行わない（canonical Route: 開発IDEは`obsidian-vault`/Notionを直接更新しない）。

## Run Artifact policy

- 本Run ArtifactはWave 0の実装開始**前**に作成した（Phase 2Cのような事後復旧ではない）。
- public-safe情報のみを記録する。private URL / file ID / internal filename / execution環境absolute path / session UUID / secret / credential / formal internal project identityは記載しない。
- `COMPLETE_PENDING_FULL_VERIFY`到達時点・Draft PR作成時点では削除しない。

## Wave / Checkpoint commit mapping

| Wave | Goal | Commit（full SHA） |
|---|---|---|
| 0 | Fresh Gate / canonical read / Phase 2C closeout / Run Artifact初期化 / baseline | 本Waveのcheckpoint commit（自己参照のため固定値を書かない。`git log`／PRの該当commitを参照） |
| 1 | calc.js core purity | pending |
| 2 | Project Input Package / preset registry | pending |
| 3 | safe import / export / security boundary | pending |
| 4 | UI integration | pending |
| 5 | regression / security / privacy / independent verification | pending |
| 6 | README / Run Artifact convergence / Draft PR | pending |

Run Artifact自身を含むcommitのSHAは、そのcommit確定前に本文へ固定値で書けない（自己参照）。確定済みの過去Waveのcheckpoint SHAは後続Waveの更新時に追記する。
