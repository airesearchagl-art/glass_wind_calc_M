# Run State

- Run ID: LR-20260920-GLASS-P2G
- Mode: LONG_RUN
- Horizon: 8H
- LONG_RUN_ENDURANCE: false
- Current state: RUNNING
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2g-batch-scenario-workspace
- Base SHA: ace00edfe4325570e8c31cde9cf56b2c708c458d
- Current artifact-sync head: `RESOLVE_DYNAMICALLY` — `git rev-parse HEAD` またはPRの現在headで解決する（自己参照回避contract）
- Implementation verification head: `RESOLVE_AT_CHECKPOINT`
- Current wave: Wave 4H — Batch Error Contract Closure（Required Fix 1 / 2 完了）
- Task Packet ID: LRP-20260920-GLASS-P2G
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260920-GLASS-P2G/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: e8014da92ecb6ce432e6f586d0796a7c99220f0254cdfb729828cdf9465de104

## Objective

1枚のガラスを検討する既存calculatorを**正**として維持したまま、
複数のガラス・複数条件を同じ画面でまとめて比較・検討できる
Batch / Scenario Workspace を追加する。

Batch layerは新しい構造計算ロジックを持たない。
各rowは必ず既存 PIP v2 → GlassCalc → WindPressure / ProjectInput →
existing candidate selection を通る。Batchはそのorchestration layerである。

## Fresh Gate（Wave 0実測）

```text
origin/main        : ace00edfe4325570e8c31cde9cf56b2c708c458d
expected base      : ace00edfe4325570e8c31cde9cf56b2c708c458d   → 一致
working tree       : clean
tracked changes    : 0
untracked files    : 0
baseline npm test  : 270 pass / 0 fail   （expected >= 270 / 0 fail → 一致）
main direct commit : なし（feature branchで作業）
```

## Phase 2F post-merge closeout

```yaml
phase: 2F
pr: 7
pr_state: MERGED
final_feature_head: 693226fecd7c0a5b482a5a66d6e9fd3466571861
merge_commit_main: ace00edfe4325570e8c31cde9cf56b2c708c458d
production: READY
final_focused_review: PASS
required_fix: 0
human_merge_authorization: received
phase_2f_final_state: COMPLETE_PENDING_FULL_VERIFY   # 維持する
```

`COMPLETE_PENDING_FULL_VERIFY` を維持する理由は、project-specific Evidence 4件が
未解決のまま残っているためである。Phase 2Gでこれを勝手にclosureしない（§4 / §5）。

Phase 2F の snapshot / digest は変更しない。
（`9c2185f13346f899771be1f1201e7db2874f12b44df918c4a71450e7f2f2db44`）

## Architecture inventory（Wave 0実測 / §6）

DECISIONS.md D-001 に全量を記録。要点:

```text
packet §6 の importPackage / exportPackage に相当する実装は
deserialize / serialize である。新しい別名APIを作らない。

既存の入力境界と上限:
  PIP SCHEMA_VERSION = 2  / SUPPORTED = [1, 2]
  MAX_PAYLOAD_BYTES = 16384 / MAX_NEST_DEPTH = 8 / MAX_STRING_LENGTH = 512
```

## Evidence（Phase 2Gでは変更しない）

```yaml
verifiedCases: []
project_specific_promotion: NONE
explicit_unverified_items: 4
dimensions: 1250x2050 sample_default / unverified
```

詳細は EVIDENCE.md。

## Checks

```text
Fresh Gate                     : PASS（base SHA一致、working tree clean）
baseline npm test              : PASS（270 pass / 0 fail）
Phase 2F merged確認             : PASS（693226f が origin/main の祖先。merge commit ace00ed）
architecture inventory          : PASS（§6の全symbolを実測。複製実装しない方針を確定）
workspace.js（Wave 1-2）        : PASS（case lifecycle / evaluation / summary / grouping /
                                 sort-filter / Workspace Package v1 / TSV / CSV）
npm test (Wave 4H)             : PASS（332 pass / 0 fail。baseline 270 → 305 → 316 → 332）
Required Fix 1 物理行番号        : PASS（A-E の5ケース。空header は fail closed）
Required Fix 2 INVALID到達性     : PASS（§12の10項目すべて。診断は隔離層）
§9 field contract               : PASS（二段階目の失敗は field: "project_input"）
§11 duplicate caseId            : PASS（診断化。他caseのimportを止めず、上書きもしない）
browser（Wave 4H実測）          : PASS（物理4行目を表示 / INVALID filter / invalidCount 1 /
                                 CSVにINVALID行 / Workspace JSONには出ない /
                                 JSON再importで診断が置き換わる / storage 0 / error 0）
§35 known-answer                : PASS（Case A FL6 OK / Case B FL6 NG。single coreから導出）
§36 determinism                 : PASS（2回evaluateで同一。sort/filterは結果をmutationしない）
AC-02 no duplicated formula     : PASS（面積式をGlassCalc.paneAreaM2へ一本化。
                                 index.htmlとBatchが同じ関数を呼ぶ）
Batch UI（Wave 3-4）            : PASS（Single既定 / 切替 / Add Current / Duplicate /
                                 Remove / Clear / sort・filter / grouping / TSV /
                                 Workspace JSON / CSV）
browser（Wave 3-4実測）         : PASS（page error 0 / console error 0。
                                 XSS payloadはtextとして描画。CSV数式は中和。
                                 round-trip後は imported_unverified へ降格。
                                 localStorage / sessionStorage entries = 0）
```

### Wave 4H で閉じた2件（Required Fix）

1. **物理TSV行番号の欠落**: 空行を捨ててから番号を振っていたため、
   ユーザーのシート上の行番号とズレていた（D-003）。
2. **INVALIDがdead enumだった**: enum・filter・summaryにINVALIDはあったが、
   外部importで弾かれた行がどこにも現れず、§18の「silent skipしない」を
   実質満たしていなかった（D-004）。

### Wave 3 で見つけて直した実バグ

`.main-wrap` / `.batch-wrap` は `display: grid` を持つため、`[hidden]` の既定
`display: none` に勝ってしまい、**初期表示でSingleとBatchが同時に描画されていた**
（Single既定というAC-01の前提が崩れていた）。`.main-wrap[hidden]` /
`.batch-wrap[hidden]` を明示して修正し、回帰テストで固定した。

## Hard Checks（Quality Debt化禁止 / §41）

```text
wrong calculation result                 : 未評価（Wave 2以降）
Single regression                        : 未評価（Wave 6）
trust promotion bypass                   : 未評価（Wave 5）
Evidence spoof                           : 未評価（Wave 5）
CSV formula injection                    : 未評価（Wave 5）
HTML injection                           : 未評価（Wave 5）
prototype pollution                      : 未評価（Wave 5）
private data committed                   : PASS（Wave 0時点。synthetic fixtureのみ使用する方針）
unbounded import                         : 未評価（Wave 4-5）
derived result accepted as authoritative : 未評価（Wave 2 / 4）
preset mutation                          : 未評価（Wave 6）
security/privacy failure                 : 未評価
```

## Quality Debt

現時点でなし（QUALITY_DEBT.md参照）。

## Known failures

```text
none
```

## Remaining tasks

```text
Wave 1-7（TASK_QUEUE.md参照）
```

## Next action

Wave 3: Batch UI（Single/Batch切替 / Add Current / Duplicate / Remove / Clear /
sort・filter / grouping表示）。Single viewをdefaultのまま壊さないこと。

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
   e8014da92ecb6ce432e6f586d0796a7c99220f0254cdfb729828cdf9465de104 と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2g-batch-scenario-workspace で現在headを確認
4. EVIDENCE.md を読む（Phase 2GはEvidence stateを変更しない）
5. QUALITY_DEBT.md を読む
6. npm test でtargeted smoke check
7. 上記 Next action から再開する
```
