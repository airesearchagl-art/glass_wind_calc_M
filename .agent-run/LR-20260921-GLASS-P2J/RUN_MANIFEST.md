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

| Wave | Goal | Commit（full SHA） | tests |
|---|---|---|---|
| 0 | Fresh Gate / Run Artifact / Phase 2I closeout / baseline / 一次資料の可用性判定 | `5bb8b2baa280d710c79ba825366118905775b0de` | 500 / 0 |
| 1 | Evidence architecture inventory / trust boundary 修理 | `c8dea2a7087c37bec0637574079ed7e5ea77654e` | 518 / 0 |
| 2 | Observation v1 / scope contract | `42c8f7096b20450997bfe2739728cc45b433b3b3` | 557 / 0 |
| 3 | Closure Evaluation / Promotion Candidate | `707b0aac8eb173641e04d59080676ec381cb0686` | 581 / 0 |
| 4 | Evidence Request Matrix（read-only UI） | `4dfafae93628d0bf3674a05467bafd860ac3bef4` | 600 / 0 + browser 34 / 0 |
| 5 | security / privacy / trust / prototype | `RESOLVE_DYNAMICALLY` | 616 / 0 + browser 34 / 0 |

## Wave別の変更ファイル

```text
Wave 1: project-config/evidence.js        （canonical assertOrdinaryObject 追加 + 3境界）
        project-config/evidence-ledger.js （createEntry / evaluateCasePromotion / reconcileFact）
        project-config/miyoshi.js         （validateVerifiedCase / in → hasOwnProperty）
        tests/evidence-trust-boundary.test.js（新規）

Wave 2: project-config/evidence-closure.js（新規）
        tests/evidence-closure.test.js    （新規）
        index.html                        （**変更なし** / Wave 2はUIを持たない）

Wave 3: project-config/evidence-closure.js（evaluateClosure / candidate / export を追加）
        tests/evidence-closure.test.js    （Wave 2の境界testをWave 3の境界へ更新 + 追加）
        index.html                        （**変更なし** / Wave 3もUIを持たない）

Wave 4: index.html                        （evidence-closure.js配線 / Matrix / renderer分割）
        tests/evidence-closure-ui.test.js （新規）
        tests/ui-mode-separation.test.js  （F10の参照先を renderPhase2FEvidencePanels へ更新）

Wave 5: project-config/evidence.js              （PUBLIC_UNSAFE_TEXT_PATTERNS に4クラス追加）
        tests/evidence-closure-security.test.js（新規）
        index.html                             （**変更なし**）

ブラウザ検証（Chromium / file://）はrepositoryに常設していない。
Wave 4 の実測値は EVIDENCE.md §17〜§19 に記録し、
repositoryで常時守られる部分は tests/evidence-closure-ui.test.js に落としてある。
```

自己参照commit SHAは固定しない。各ファイルがどのheadで最終化されたかを併記する
（Phase 2H で「以降はRun Artifactのみ」と書いて事実と合わなくなった経緯を踏まえる）。
