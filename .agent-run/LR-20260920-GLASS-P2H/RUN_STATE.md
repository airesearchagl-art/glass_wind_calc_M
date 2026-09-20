# Run State

- Run ID: LR-20260920-GLASS-P2H
- Mode: LONG_RUN
- Horizon: 8H
- LONG_RUN_ENDURANCE: false
- Current state: COMPLETE_PENDING_FULL_VERIFY
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2h-project-profile-scenario-matrix
- Base SHA: e7d396621536acd21934fc92892087be0f47d8d6
- Current artifact-sync head: Wave 7 convergence commit（本ファイルを含む commit。push後のbranch tip）
- Implementation verification head: `5838141954d73e0d5463f21810e62c24df573a82`
  （実装・test・UIの最終head。以降のcommitはRun Artifactのみ）
- Current wave: Wave 7 — convergence 完了 / Human Gate待ち
- Task Packet ID: LRP-20260920-GLASS-P2H
- Task Packet revision: 1
- Task Packet SHA-256: ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27

## Objective

大量の告示風圧caseを作るとき、案件共通の風条件（V0 / roughness / 建物高さ /
軒高 / 建物タイプ / 算定基準）を1回だけ入力し、ガラスcase側では
pane / location 固有の値（W / H / 評価高さ Z / 部位 / ガラス種別）だけを
指定できるようにする。

ただし Runtime Project Profile は **registered preset ではなく、
verified Evidence でもない**。利用者がその場で入力した便宜レイヤである。

```text
Profile + Scenario → explicit effective input → 既存 PIP v2 → 既存計算コア
```

## Fresh Gate（Wave 0実測）

```text
origin/main       : e7d396621536acd21934fc92892087be0f47d8d6
expected base     : e7d396621536acd21934fc92892087be0f47d8d6  → 一致
working tree      : clean
tracked changes   : 0
untracked files   : 0
baseline npm test : 342 pass / 0 fail（expected >= 342 / 0 fail → 一致）
main direct write : なし（feature branchで作業）
```

## Phase 2G post-merge closeout

```yaml
phase: 2G
pr: 8
pr_state: MERGED
final_feature_head: ede68ee81553f2e65be4bd6b0a13c3e7b9b70b28
implementation_verification_head: 6a4728e32178220efb7d10e2bed6ea55f02eaa34
merge_commit_main: e7d396621536acd21934fc92892087be0f47d8d6
production: READY
final_focused_review: PASS
required_fix: 0
human_merge_authorization: received
tests: 342 / 0
browser: 84 / 84
mutants: 22 / 22 killed
```

Phase 2G の snapshot / digest は変更しない
（`e8014da92ecb6ce432e6f586d0796a7c99220f0254cdfb729828cdf9465de104`）。

## Architecture inventory（Wave 1実測 / §41）

```text
ProjectInput.fromWindCalculation({widthMm, heightMm, glassType, extraFactor, windInput})
ProjectInput.WIND_INPUT_KEYS =
  ["V0","roughnessCategory","buildingHeightM","eavesHeightM","evaluationHeightM",
   "buildingType","zone","buildingShortSideM","basis","recurrenceYears"]
WorkspaceCore.createWorkspace() / addCase() / MAX_CASES = 1000
wind-pressure.js は未知fieldを fail closed で拒否する
```

Profileが持つのは上記のうち `evaluationHeightM` / `zone` を**除いた**もの。
その2つはScenario側の必須入力とする（D-001）。

## Evidence（Phase 2Hでは変更しない）

```yaml
verifiedCases: []
project_specific_promotion: NONE
explicit_unverified_items: 4
dimensions: 1250x2050 sample_default / unverified
floor_to_Z: unverified
```

詳細は EVIDENCE.md。

## Checks

```text
Fresh Gate            : PASS（base SHA一致 / tree clean）
baseline npm test     : PASS（342 pass / 0 fail）
Phase 2G merged確認    : PASS（ede68ee が origin/main の祖先。merge commit e7d3966）
architecture inventory : PASS（既存関数を実測。新しい計算経路を作らない方針を確定）
```

## Hard Checks（Quality Debt化禁止 / §42）

Wave 4Hまでの実測で置き換えた。事前にPASSと書かない。

```text
wrong calculation            : PASS（Profile経由のPIPがdirect pathとdeepEqual。trace含め一致）
implicit Z                   : PASS（Profile schemaに場所が無く、canonical gateも欠落を拒否）
implicit zone                : PASS（同上）
implicit basis               : PASS（既定値なし。UI実測でも windDefaults.basis is required）
floor→Z inference            : PASS（floor/storey/level 列を専用メッセージで拒否。
                                mapping表をソースに持たないことをtestで固定）
trusted Profile promotion    : PASS（結果側gate。手で組んだverifiedはどの消費経路にも入れない）
Evidence spoof               : PASS（Profile/Scenario schemaがEvidence fieldを受け付けない）
registered preset spoof      : PASS（profileTypeはruntime_wind_profileのみ。20回使っても
                                sourceKindはnotification_calculationのまま）
prototype pollution          : PASS（__proto__ / constructor.prototype いずれもObject.prototype無傷）
private data leak            : PASS（診断は位置と理由のみ。生のTSV行・生JSONを載せない）
Single regression            : PASS（実機で往復後もbyte一致。Wave 6で再測）
Batch regression             : PASS（Phase 2Gの342 testsすべて維持）
snapshot mutation            : PASS（V0 34→40で既存case不変、新規caseのみ変更後の値）
unbounded matrix generation  : PASS（MAX_SCENARIOS 1000が絶対。optionは狭めるのみ。
                                existingCaseCountは -1/NaN/Infinity/1.5/1001 を拒否）
```

### Wave 4H で閉じた3件（Required Fix）

```text
RF-A  Matrix hard cap を呼び出し側が広げられた（maxTotal / 負のexistingCaseCount）  FIXED
RF-B  TSVのrow isolationが格納段階で切れていた（重複IDで後続行が試されない）        FIXED
RF-C  gateが構築時のみで、手で組んだobjectが結果側へ到達できた                      FIXED
```

いずれもコードに触る前に再現を確認した。詳細は DECISIONS.md D-005 / D-006 / D-007。

### Wave 4H mutation

```text
選定 15件 / 実mutant 14件すべてkill
A2（絶対天井の二重チェック削除）は PATCH-MISS。
  SURVIVEDではなく、**対象コードを意図的に削除したため**である
  （A と A2 は同じ判定で、どちらを消しても他方が拾うため両方SURVIVEDになっていた）。
  発火しないguardを残さない判断に伴うもので、test gapではない。
```

## Wave 5 — 攻撃・mutation campaign（§37 / 実測）

```text
攻撃 33件 / 遮断 33件 / 漏えい 0件
  Matrix cap        : maxTotal 2000 / Infinity / 1e9 / MAX_SAFE_INTEGER / '2000' / NaN / 1.5 / -1
                      existingCaseCount -1 / NaN / Infinity / 1.5 / -0.0001 / 1001 / '-500'
                      1001 scenarios / matrix.add の1001件目
  Profile結果側spoof : forged verified / registered_preset型 / presetId / Z同伴 / zone同伴 /
                      Evidence / sourceReference / string型V0
  Scenario結果側spoof: Z欠落 / zone欠落 / floor同伴 / verificationStatus同伴 / V0同伴 /
                      evidence同伴 / string型Z
  TSV重複           : 既存matrixとの重複 / 同一paste内の重複
  Profile JSON import: prototype pollution / constructor.prototype / 巨大payload / 深いnest
  Evidence分離       : 100回使用しても notification_calculation のまま / presetは不変
```

## Wave 6 — full regression（実測）

```text
npm test                 : 398 pass / 0 fail（Wave 5時点 389 → 修理で +9）
Phase 2G subset          : 342 / 0（非退行）
browser                  : 130 checks / 0 fail / pageError 0 / consoleError 0
                           内訳 p2h 29 + p2g 84 + 修理検証 17
TSV行番号parity          : Workspace TSV と Scenario TSV が同じ物理行を指す
profile経路 vs direct    : PIPがJSON bit-equal
Er / qBar                : 0.8516557589672942 / 503.08024004410464（bit-equal / suiteで固定）
FL6 1250x2050 / 1500x2050: 1756.09756097561 / 1463.4146341463415（bit-equal / suiteで固定）
Manual designP           : 1400
PIP schema               : 2（v1→v2 migrationは imported_unverified へ）
Evidence                 : verifiedCases [] / dimensions sample_default・unverified /
                           validateAllEvidence() [] / promotion NONE
```

## Wave 7 — independent verification と修理

verdict: **PASS WITH FINDINGS**。correctness break / security break /
hidden default / Z・zoneの継承経路 / cap突破 / forged profile の到達 /
重複によるabortや上書き / 演算のずれ、いずれも無し。

指摘7件はすべて本Campaign内で修理した（in scope / Hard Gate該当なし）。

```text
F1  MEDIUM  READMEがRun Artifact上PENDINGの検証結果を断定していた        FIXED（本convergence）
F2  MEDIUM  Scenario Matrixの追加失敗が「JSON取り込みエラー」と表示       FIXED
F3a LOW-MED matrix.add自身の絶対上限にtestが無い（mutant SURVIVED）       FIXED（test追加）
F3b LOW-MED Scenario TSVの余剰セル検査にtestが無い（mutant SURVIVED）     FIXED（test追加）
F4a LOW     nest深さcapにtestが無い（mutant SURVIVED）                    FIXED（test追加）
F4b LOW     危険キー事前走査が値まで拒否する偽陽性                        FIXED
F5  LOW     寸法・extraFactorの契約違反がMatrixに並び、遅れて落ちる       FIXED
F6  LOW     Z / zone拒否がown propertyのみで、継承で通過できた            FIXED
F7  INFO    「既定値を置かない」メッセージにtestが無い                    FIXED（test追加）
```

### verifierの前提を1点訂正

F4a を「発火しないguard」としていたが、実測では**発火する**。
深いnestは field の型検査より前に
`profile payload is nested too deeply (max 6)` で落ちる
（再帰そのものを浅く保つためのguardであり、到達不能ではない）。
正しい性質は「到達可能だがtestが無い」であり、F3と同じ分類。
したがって削除ではなくtestで固定した。

### Wave 7 mutation（修理後 / 9件）

```text
KILLED 8 / SURVIVED 1
  V1 matrix.add の絶対上限削除          KILLED（F3a test）
  V2 Scenario TSV 余剰セル検査削除      KILLED（F3b test）
  V3 nest深さcap削除                    KILLED（F4a test）
  V4 危険キー事前走査削除               KILLED（F4b test / parse前に動くことを固定）
  V5 SCENARIO_REQUIRED ループ削除       KILLED（F7 test）
  V6 寸法契約の呼び出し削除             KILLED（F5 test）
  V7 extraFactor契約の呼び出し削除      KILLED（F5 test）
  V8 継承判定（assertOrdinaryObject）削除 KILLED（F6 test）
  V9 `in` → hasOwnProperty へ戻す       SURVIVED
```

V9 は「別のguardが拾ったための生存」である。
継承keyの判定を `in` と `assertOrdinaryObject` の2か所に書いた結果、
前段が生きている限り後段は発火しない — D-006 で退けたのと同じ形になっていた。
coverageを主張せず、**判定を1か所へ戻した**（`assertOrdinaryObject` のみ）。
以後 V9 は「同じコード」であり、mutantとして成立しない。

## Quality Debt

QUALITY_DEBT.md 参照。

## Known failures

```text
none
```

## Remaining tasks

```text
Human Gate のみ（Ready化 / merge / Production authorization）。
本Campaignのscope内に残作業なし。
```

## Next action

```text
Human Gate待ち。Draft PRのReady化・merge・Production昇格は
本CampaignのNext Actionに含めない（§44）。
```

## Stop conditions status

```text
Fresh Gate            : PASS
Hard Gate failure     : なし
BLOCKED transition    : 発生していない
no_progress_waves     : 0 / 2
same_hypothesis_retry : 0 / 2
repair_strategies     : 0 / 3
```

## Resume instructions

```text
1. RUN_MANIFEST.md から binding を確認
2. TASK_PACKET_SNAPSHOT.md を再hashし
   ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27 と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2h-project-profile-scenario-matrix で現在headを確認
4. EVIDENCE.md を読む（Phase 2HはEvidence stateを変更しない）
5. QUALITY_DEBT.md を読む
6. npm test でsmoke check（398 / 0）
7. 状態は COMPLETE_PENDING_FULL_VERIFY。次の判断は Human Gate に属する。
```
