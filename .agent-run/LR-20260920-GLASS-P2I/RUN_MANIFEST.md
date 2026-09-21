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
| 0-1 | Fresh Gate / Run Artifact / architecture inventory | `f08a3df843ac17e44f230ab29c5bd7f2a03e4936` |
| 2 | review-package.js core | `7d270743c4f9f061483d84550d380dd8be8b2f10` |
| 2H | evidenceSummary genericity fix | `71d032c` |
| 3 | canonical exporter gate / Review JSON / Markdown | `9cf9aea360633e2669d7bb692ad7eb6f4af65f6f` |
| 4 | Review UI / print preview / stale boundary | `4e08922c0762bea60886b506e660fc393068493e` |
| 4H | native print bypass / partial comparison（RF-P1 / RF-P2） | `75d320302835a7326f5e9404fbca68cff3661a75` |
| 5 | inherited-field gate / cross-surface sweep | `ada6d795ef9b76d1ba44683a0c71a2c7cab03b2e` |
| 5 cont. | print media / audits / residual mutants | `0405ac2e5467b3058c54e3bc4d6f1be212978fa3` |
| 6 | independent verifier findings F1-F6 の修理 | `915e11ae54c2094b8b8454b9248214c96b906ca3` |
| 7 | README + Run Artifact convergence | `RESOLVE_DYNAMICALLY`（自己参照のため固定しない） |

## Head roles（Phase 2H の文言誤りを繰り返さない）

**Implementation verification head**: `915e11ae54c2094b8b8454b9248214c96b906ca3`

役割: **executable source / tests / UI implementation の最終head**。
§54 の全測定（npm test 500 / browser 294 / 保護値5つ / Evidence / security sweep /
export size / privacy sweep）は、この exact head に対する実測値である。

**Documentation / Run Artifact convergence head**: Wave 7 commit（本ファイルを含む）

役割: README と Run Artifact の同期。

正確な言い方:

```text
implementation verification head 以降、
executable source / tests / UI は変更していない。
その後のcommitは README measured-result synchronization と
Run Artifact convergence のみを行った。
```

「以降はRun Artifactのみ」とは書かない。READMEも変わっているためである
（Phase 2H で同じ書き方をして事実と合わなくなり、訂正した経緯がある）。

## 変更ファイル（base 6a5232f → 現在のbranch head）

```text
executable source / tests / UI（最終化: 915e11a = implementation verification head）
  review-package.js               新規
  tests/review-package.test.js    新規
  tests/review-ui.test.js         新規
  index.html                      Review UI / print view / 印刷の関門 / 診断見出し

documentation（最終化: 915e11a より後）
  README.md                       Phase 2I節 / file structure / test表 / changelog
  .agent-run/LR-20260920-GLASS-P2I/*  Run Artifact 7ファイル
```

`calc.js` / `wind-pressure.js` / `workspace.js` / `project-profile.js` /
`project-config/**` は Phase 2I で**1バイトも変更していない**（verifier が
`git diff --name-only` で独立に確認済み）。
