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
| 4H | Boundary Closure（Required Fix A / B / C）+ artifact sync | `a329c8ff84cd69956c1910edac5f12081447c314` |
| 5-6 | 攻撃・mutation campaign / full regression / README | `439c42647b2b7edb15b4afaa4bf07f3944e7b411` |
| 7 | independent verifier 指摘（F2-F7）の修理 | `5838141954d73e0d5463f21810e62c24df573a82` |
| 7 | README measured-result sync + Run Artifact convergence | `51762c3d4857617b1756ae5261dddc6c85308c3b` |
| 7 | documentation state reconciliation（本ファイルを含む） | `RESOLVE_DYNAMICALLY`（自己参照のため固定しない） |

自己参照commit SHAは固定しない。過去commitになったwaveは確定値へ置き換える。

**Implementation verification head**: `5838141954d73e0d5463f21810e62c24df573a82`

役割: **executable source / tests / UI implementation の最終head**。
検証結果（398 pass / 0 fail、browser 130 / 0、protected valuesの再実測）は
すべてこのheadに対する実測値である。

**Documentation / Run Artifact convergence head**: `51762c3d4857617b1756ae5261dddc6c85308c3b`

役割: README measured-result synchronization + Run Artifact convergence。
実測では README.md（changelog行とtest表の2か所）と Run Artifact 6ファイルを変更しており、
executable source / tests / calculation formulas / UI implementation / Evidence state は
1バイトも変更していない。

以降のcommitでも executable source / tests / UI implementation は変更していない。
README measured-result synchronization と Run Artifact convergence のみを行った。

したがって「実装headでREADMEも最終だった」という記述は成立しない。
READMEの measured-result（398 / 130 / mutation内訳）が確定したのは
`51762c3` であり、実装headではない。

## 変更ファイル（base e7d3966 → 現在のbranch head）

最終化されたheadを各ファイルに併記する。
「実装headで全部が最終だった」という読み方ができないようにするため。

```text
executable source / tests / UI（最終化: 5838141 = implementation verification head）
  project-profile.js              新規
  tests/project-profile.test.js   新規
  workspace.js                    parseTsvTable抽出 / INVALID_RESULT_SOURCES に scenario_matrix 追加
  index.html                      Profile編集 / effective preview / Scenario Matrix / Scenario TSV / 診断見出し
  project-config/project-input.js assertPaneDimensionMm / assertExtraFactor を抽出しexport（判定内容は不変）

documentation（最終化: 5838141 より後）
  README.md                       Phase 2H節 / file structure は 439c426、
                                  measured-result（398 / 130 / mutation内訳）は 51762c3
  .agent-run/LR-20260920-GLASS-P2H/*  Run Artifact 7ファイル。
                                  convergence は 51762c3、head-role の文言訂正は本commit
```

`calc.js` / `wind-pressure.js` / `project-config/miyoshi.js` /
`project-config/evidence.js` / `project-config/evidence-ledger.js` は無変更。
`project-input.js` の変更は既存の判定を関数として括り出してexportしたもので、
値域・メッセージ・呼び出し結果はいずれも変わっていない（342件の既存testが緑のまま）。
