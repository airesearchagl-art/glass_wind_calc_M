# Run State

- Run ID: LR-20260918-GLASS-P2D
- Mode: LONG_RUN
- Horizon: 8H
- Current state: RUNNING
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2d-project-input-package
- Base SHA: 97bc18e53c7d3a86b3f180f408e265fec3cf5117
- Current head: Wave 0 checkpoint commit自身（自己参照のため固定値を書かない。`git rev-parse HEAD` またはPRの現在headで動的に解決する）
- Current wave: Wave 0 — Fresh Gate / canonical read / Run Artifact初期化 / Phase 2C closeout / baseline
- Last successful checkpoint: none（Wave 0が最初のcheckpoint）
- Task Packet ID: LRP-20260918-GLASS-P2D
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260918-GLASS-P2D/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 6d38bb4ff293276195a36551bd1d5fb117230d889a0683912145e468f460a7df

## Objective

Phase 2Cで成立した「Miyoshi preset + Manual / Generic + Evidence contract」を基盤として、計算コアの完全な案件非依存化、reusable Project Input Package、generic preset registry、safe import / export / replay、migration / compatibility、security / privacy convergenceまでを1 Campaignとして収束させ、Draft PRで停止する。

最終的に `calc.js` にMiyoshi案件固有値・案件固有ラベル・案件固有provenanceを残さない。

## Acceptance Criteria

- [ ] AC-01 Calculation core完全案件非依存化（calc.jsから3つのdeprecated定数を定義・exportとも削除、Miyoshi固有記述を残さない、consumer全移行） — status: pending
- [ ] AC-02 Versioned Project Input Package（schemaVersion / sourceKind / dimensions / pressure / glassType / extraFactor / provenance、designPは常に再計算） — status: pending
- [ ] AC-03 Common validator / factory（schemaVersion・sourceKind・数値・W/H>0・designP>0・0<extraFactor<=1.0・known glassType・public-safe string・length limit・required field・deterministic normalization） — status: pending
- [ ] AC-04 Generic preset registry（registerPreset / getPreset / listPresets、duplicate reject、unknown fail closed、publicLabel boundary維持、manualをtrusted presetにしない） — status: pending
- [ ] AC-05 Imported dataをtrusted presetへ昇格させない（payload内のverified claimを事実として採用しない） — status: pending
- [ ] AC-06 Safe import / export / replay（file://互換維持、deterministic roundtrip、計算結果一致） — status: pending
- [ ] AC-07 Import security（__proto__ / prototype / constructor、過大payload、過深nest、unknown field、HTML/script payload拒否。eval/Function禁止。DOMはtextContent） — status: pending
- [ ] AC-08 Backward compatibility / migration（consumer全移行、案件固有複製をcalc.jsへ残さない、READMEにmigration記録） — status: pending
- [ ] AC-09 Regression（Miyoshi 1756.09756 OK / 1463.41463 NG、Manual designP=1400、既存91 testsを基準にcoverage減少なし） — status: pending
- [ ] AC-10 Phase 2D new tests（20カテゴリ） — status: pending
- [ ] AC-11 Browser verification（Miyoshi / Manual / export-import roundtrip / malicious import / provenance非混線） — status: pending
- [ ] AC-12 Vercel Preview READY at exact PR head（Productionへdeployしない） — status: pending
- [ ] AC-13 Privacy / Disclosure（新規の私的識別子・execution path・secretを追加しない） — status: pending
- [ ] AC-14 Documentation（README同期、PR本文同期、Documentation Sync Trigger: yes、Vault/Notionへ直接書き込まない） — status: pending

Evidence列はWave進行に応じて各AC行へ追記する。

## Completed

- Wave 0: Fresh Gate（origin/main == 97bc18e5…、working tree clean、tracked 0、untracked 0）
- Wave 0: canonical read（Vault 5文書 + repository README / 対象file / tests）
- Wave 0: baseline計測（91 pass / 0 fail）
- Wave 0: Task Packet snapshot作成 + SHA-256 digest binding
- Wave 0: Run Artifact 7ファイル初期化（実装開始前）

## Current implementation state

実装変更はまだ行っていない。ブランチ `claude/phase2d-project-input-package` はbase `97bc18e5…` と同一内容で、差分はRun Artifact（`.agent-run/LR-20260918-GLASS-P2D/`）とPhase 2C closeoutのみ。

`calc.js` にはまだdeprecated Miyoshi複製3件（`POSITIVE_PRESSURE_MIYOSHI_PRESET` / `NEGATIVE_PRESSURE_MIYOSHI_PRESET` / `UNVERIFIED_DEFAULT_DIMENSIONS_MM`）が存在する（Wave 1で削除予定）。

### Consumer inventory（Wave 0調査、AC-08の前提）

```text
tests/calc.test.js            : import(23,24) / 使用(118,147)
tests/project-config.test.js  : 使用(108,124,135)
README.md                     : 記述(79,106,216,411,413)
index.html                    : 直接使用なし（MiyoshiProjectConfig経由のみ）
project-config/miyoshi.js     : コメント内の言及のみ
```

## Checks

```text
Fresh Gate            : PASS（base SHA一致、working tree clean）
baseline npm test     : PASS（91 pass / 0 fail）
canonical read        : PASS（Vault read-onlyで5文書取得）
```

## Quality Debt

現時点で計上されているQuality Debtはない（詳細は QUALITY_DEBT.md）。

## Explicit unverified items

```text
1. ガラス1枚の実見付W/H（1250×2050はdimensions.mode=sample_default / unverifiedのまま）
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m² の元となる外装材・ガラス構造計算書
3. 負圧 918 / 1122 N/m² の元計算根拠
4. 各階評価高さZとpresetのexact mapping
```

Phase 2Dでもこれらを推測でverifiedへ昇格させない。

## Known failures

```text
none
```

## Decisions

DECISIONS.md を参照。

## Files changed

```text
.agent-run/LR-20260918-GLASS-P2D/*                （新規、Wave 0）
.agent-run/LR-20260917-GLASS-P2C/RUN_STATE.md     （Phase 2C closeout: merged/Production factの記録）
.agent-run/LR-20260917-GLASS-P2C/TASK_QUEUE.md    （Phase 2C closeout: 最終状態）
.agent-run/LR-20260917-GLASS-P2C/RUN_MANIFEST.md  （Phase 2C closeout: final head / merge commit）
```

Phase 2CのTASK_PACKET_SNAPSHOT.md本文とdigestは変更しない。

## Remaining tasks

```text
Wave 1: calc.js core purity（deprecated定数削除 + consumer移行）
Wave 2: Project Input Package + generic preset registry
Wave 3: safe import / export / replay + security boundary
Wave 4: UI integration（Miyoshi / Manual / Imported state clarity）
Wave 5: mutation / security / privacy / full regression + independent verifier
Wave 6: README / Run Artifact convergence / Draft PR / Vercel Preview / Completion Report
```

## Next action

Wave 1を開始する。`calc.js` から `POSITIVE_PRESSURE_MIYOSHI_PRESET` / `NEGATIVE_PRESSURE_MIYOSHI_PRESET` / `UNVERIFIED_DEFAULT_DIMENSIONS_MM` の定義・export・Miyoshi固有コメントを削除し、上記consumer inventoryに従ってtests/READMEを移行する。coverage減少を伴わないことを明示する。

## Stop conditions status

```text
Fresh Gate                 : PASS
Hard Gate failure          : なし
BLOCKED transition         : 発生していない
no_progress_waves          : 0 / 2（LONG_RUN上限）
same_hypothesis_retry      : 0 / 2
repair_strategies          : 0 / 3
```

## Resume instructions

```text
1. RUN_MANIFEST.md から run_id / repository / working branch / base / Task Packet binding を確認
2. TASK_PACKET_SNAPSHOT.md のファイルbytesのSHA-256を再計算し、
   6d38bb4ff293276195a36551bd1d5fb117230d889a0683912145e468f460a7df と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2d-project-input-package で現在headを確認
4. 本RUN_STATEの Repository / Working branch / Acceptance Criteria / Explicit unverified items が
   non-emptyであることを確認
5. QUALITY_DEBT.md を読む
6. npm test でtargeted smoke check
7. 上記 Next action から再開する
```
