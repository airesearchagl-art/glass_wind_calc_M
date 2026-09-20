# Run State

- Run ID: LR-20260920-GLASS-P2G
- Mode: LONG_RUN
- Horizon: 8H
- LONG_RUN_ENDURANCE: false
- Current state: COMPLETE_PENDING_FULL_VERIFY
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2g-batch-scenario-workspace
- Base SHA: ace00edfe4325570e8c31cde9cf56b2c708c458d
- Current artifact-sync head: `RESOLVE_DYNAMICALLY` — `git rev-parse HEAD` またはPRの現在headで解決する（自己参照回避contract）
- Implementation verification head: `6a4728e32178220efb7d10e2bed6ea55f02eaa34`
  （source / tests / UI の確定head。verifier findings F1-F4の修復・README・
  342 pass / 0 fail・browser 84 checks はすべてこのheadに対して成立する。
  以降のcommitはRun Artifactの同期のみ）
- Current wave: Final Run Artifact Reconciliation / Independent Verification Closure
  （**新規Implementation Waveではない**。Wave 0-7はすべて完了）
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
npm test (最終実測)             : PASS（342 pass / 0 fail）

  baseline (Wave 0)   : 270 pass / 0 fail
  Wave 1-2            : 305
  Wave 3-4            : 316
  Wave 4H             : 332
  Wave 5              : 334
  Wave 6-7（最終）     : 342

browser（最終実測 / §18 A-L）  : PASS（84 checks / 0 fail。page error 0 / console error 0）
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

## 独立検証（Wave 6）— PASS WITH FINDINGS / 4件すべて修復

```text
F1  MED-HIGH  落ちたセルの値が診断・画面・**エクスポートCSV**へそのまま出ていた   FIXED
F2  LOW-MED   必須列欠落時に、直前に触った列を原因として報告していた              FIXED
F3  LOW       header列数超過ガードが未テスト（mutation survivor）                 FIXED（test追加）
F4  LOW       errorToInvalidResult がlabel契約を呼び出し側に委ねていた            FIXED
F5  LOW       RUN_STATE が Wave 5 後に再収束されていなかった                      FIXED（本ファイル）
F6  LOW       commit message / artifact の2つの記述が実装より強かった              FIXED（下記）
```

### F6 の訂正記録

1. `8d21997` のcommit messageは TSV が「**行を出さずに**行番号・列・理由を報告する」と書いた。
   行そのものは出していないが、**落ちたセルの値**は出ていた。
2. 本ファイルの `§14 攻撃 : leak 0` も同様に言い過ぎだった（上に訂正を併記）。
3. `620310c` のcommit messageは Workspace Package が「designPressureの主張を持たない」と書いた。
   `designPressure` は PIP v2 の一部としてJSONに**含まれる**。
   ただし import時に必ず再計算されるためsecurity propertyは成立しており
   （改ざん値 99999 → 1525 を実測）、誤りは表現のほうである。

誇張を黙って書き換えず、訂正として残す。
数値や状態を良く見せる方向の誤りは、それ自体がHard Checkの対象である。

### 最終browser実測で自分のprobeが出した誤警報（4件）

最終の §18 フル実行で4件の失敗が出たが、**いずれも製品ではなくprobe側の誤り**だった。
記録しておく。「テストが落ちた＝実装が悪い」と短絡すると、正しい実装を壊しにいく。

```text
1. 行の「削除」をクリックしたつもりが「✕ すべて削除」に当たっていた
   （toolbarのClear Allも「削除」を含み、表より前にある）
   → 表へscopeし直したら 2→1、case-001が消えてcase-002が残ることを確認
2. caseIdのsortで「INVALIDは常に末尾」と assert していた
   → caseId sortは辞書順そのもの。末尾固定は**数値キー**（値がnull）の話であり、
     IDでの並びは方向どおりで正しい
3. CSVに <script> がそのまま入っていることを失敗扱いにしていた
   → CSVの中和対象は表計算ソフトが実行する**数式**であって HTML ではない。
     CSV中の <script> は単なる文字列。HTML injectionはDOM側で別に確認している
4. (3)と同じ混同による重複
```

修正後の最終実測は **84 checks / 0 fail**。

### 自分のテストが漏れを避けて書かれていた件（F1に付随）

`tests/workspace.test.js` の秘匿テストは、secretを `glass_type` 列に置きながら
行は**別の列**で落ちるように組まれていた。そのためsecretはvalidatorに到達せず、
テストは通り続けた。落ちる列そのものにsecretを置くよう直した。

Wave 3でも同種の誤りがあった（自分のコメントに書いた単語をgrepして失敗、
存在しない入力ID `inp-w` / `inp-h` を仮定）。いずれも「コードではなくテストが誤り」
だったが、**テストが通っていること**と**その分岐が検証されていること**が
別である例として残す。

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

Wave 5で実測した結果に置き換えた。事前にPASSと書かない。

```text
wrong calculation result                 : PASS（Batchの推奨構成・許容耐力は single core から導出。
                                           Batch側に期待値をhard-codeしていない。§35 known-answer一致）
Single regression                        : PASS（Miyoshi 1250x2050 FL6 = 1756.09756097561、
                                           1500x2050 FL6 = 1463.4146341463415、Manual designP 1400、
                                           Er = 0.8516557589672942、qBar = 503.08024004410464。
                                           いずれもbit-equal）
trust promotion bypass                   : PASS（Workspace JSONの registered_preset / verified 主張は
                                           imported_unverified / unverified へ降格。TSVは
                                           manual / notification しか作れない。攻撃10件すべて遮断）
Evidence spoof                           : PASS（Workspace schemaが evidence / verifiedCases を
                                           unknown fieldとして拒否。verifiedCases = [] 不変）
CSV formula injection                    : PASS（= + - @ TAB CR を先頭に持つstring cellを中和。
                                           数値セルは中和しない（-918 は -918 のまま）。
                                           RFC4180 escaping）
HTML injection                           : PASS（Batch UIは textContent / createElement のみ。
                                           innerHTML / insertAdjacentHTML / document.write なし。
                                           実機で <img onerror> は文字列として描画、要素は作られない）
prototype pollution                      : PASS（__proto__ / constructor.prototype いずれも
                                           Object.prototype を汚染しない）
private data committed                   : PASS（diff privacy sweepで新規のprivate識別子なし。
                                           testsは Case A / North-01 / Sample-001 等の synthetic のみ）
unbounded import                         : PASS（MAX_CASES 1000 / workspace JSON 1MB / TSV 1MB /
                                           label 200 / caseId 64。空行でcapを回避できない）
derived result accepted as authoritative : PASS（Workspace JSONに derived resultを保存しない。
                                           designPressure spoof 99999 は 1525 へ再計算）
preset mutation                          : PASS（preset値 1297/1525/1695/1729・918/1122・1250x2050
                                           すべて不変。validateAllEvidence() = []）
```

### Wave 5 実測

```text
§14 攻撃                          : 34件すべて遮断（trust / derived / prototype /
                                    上限 / 列 / 数式 / 生データ）
  ※ この時点の「leak 0」という記載は**言い過ぎだった**。行全体・object全体は
     出していなかったが、**落ちたセルの値**はvalidatorのメッセージ経由で
     画面とCSVへ出ていた（独立検証F1）。Wave 6で修復。
mutation M1-M15（16 mutants）     : 16 / 16 killed
  - M8  はpatch文字列の不一致で当初PATCH-MISS（テストの穴ではなくmutation定義の誤り）
  - M9  は**実際に生き残った**。index.html側で取り込み診断を捨てる変更を
        殺すテストが無かった（error integrityのtest gap）。
        診断配線をソース契約として固定するテストを追加してkill。
```

## Files changed

```text
workspace.js                        (新規) case管理 / 評価orchestration / Workspace Package v1 /
                                    TSV / CSV / INVALID診断。計算式を持たない
calc.js                             paneAreaM2() を追加（単一ケースUIとBatchの共通経路）
index.html                          Single/Batch view切替 / Batch UI / TSV・JSON・CSV操作 /
                                    診断表示。workspace.js の読み込み
README.md                           Phase 2G節 + 変更履歴 + ファイル構成 + テスト表
tests/workspace.test.js             (新規)
tests/batch-ui.test.js              (新規)
.agent-run/LR-20260920-GLASS-P2G/*  (新規7ファイル)
```

## Acceptance Criteria（最終実測）

```text
AC-01 Single Calculator regressionなし          : PASS（4モード実測。#result-area がbatch往復後もbyte一致）
AC-02 Batch layerが新しい計算formulaを持たない   : PASS（ソース契約testで固定。paneAreaM2は定義1・呼出2）
AC-03 1 case = existing PIP v2                  : PASS（Workspaceのauthoritative入力は妥当なPIP v2のみ）
AC-04 Workspace Package v1成立                   : PASS
AC-05 derived resultをauthoritativeに保存しない   : PASS（export に recommended/allowable/margin/trace なし）
AC-06 Add Current Case成立                       : PASS（内部normalized PIP経由。表示丸め値を使わない）
AC-07 Duplicate / Remove / Clear成立              : PASS（実機で 1→2→1→0。番号再利用なし）
AC-08 Batch evaluationがrow-isolated             : PASS（壊れた行も結果に残る。silent skipなし）
AC-09 Summary counts正しい                       : PASS（総数=OK+解なし+入力エラー。INVALIDのnullはmaxへ混ざらない）
AC-10 recommended configuration grouping成立      : PASS（NO_SOLUTION / INVALID は独立group）
AC-11 sort / filter成立                          : PASS（4キー×2方向・4filter。結果配列をmutationしない）
AC-12 TSV Manual import成立                      : PASS
AC-13 TSV Notification import成立                : PASS（basis必須）
AC-14 TSVからtrusted preset / Evidence生成不可     : PASS（mode allowlist + 禁止列 + 未知列reject）
AC-15 Workspace JSON importはuntrusted boundary   : PASS（ProjectInput.deserialize経由で強制降格）
AC-16 round-tripでcalculation結果再現             : PASS（実機でnumerics byte一致）
AC-17 CSV result export成立                      : PASS（INVALID行も出る）
AC-18 CSV formula injection防止                   : PASS（= + - @ TAB CR を中和。数値は中和しない）
AC-19 HTML injection防止                         : PASS（textContent/createElementのみ。実機でpayload不発）
AC-20 size / row limit fail closed                : PASS（1000 / 1MB / 1MB / 200 / 64）
AC-21 no localStorage / backend persistence       : PASS（実機で ls=0 / ss=0 / cookie空 / IndexedDB 0）
AC-22 existing Evidence / Verified Case非退行      : PASS（verifiedCases [] / validateAllEvidence() []）
AC-23 Phase 2E Wind Trace非退行                   : PASS（Er / qBar bit-equal）
AC-24 PIP v1/v2非退行                            : PASS（schemaVersion 2 / v1 import は v2 へ migration）
AC-25 README / Run Artifact sync                  : PASS
```

## Quality Debt

現時点でなし（QUALITY_DEBT.md参照）。

## Known failures

```text
none
```

## Remaining tasks

```text
Claude側implementation : なし
Human Gate             : Ready-for-review / merge / Production 認可
必要なら                : 最終 focused independent delta review
```

## Next action

なし（Human Gate待ち）。Ready化・merge・Production反映はいずれも本Campaignで行わない。

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
