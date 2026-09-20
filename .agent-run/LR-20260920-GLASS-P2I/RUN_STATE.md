# Run State

- Run ID: LR-20260920-GLASS-P2I
- Mode: LONG_RUN
- Horizon: 8H
- LONG_RUN_ENDURANCE: false
- Current state: RUNNING
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2i-design-review-package
- Base SHA: 6a5232f65d02e2a8bfa8c2c87049b5865c584855
- Current artifact-sync head: `RESOLVE_DYNAMICALLY`
- Implementation verification head: `RESOLVE_AT_CHECKPOINT`
- Current wave: Wave 2H — evidenceSummary genericity fix 完了
- Task Packet ID: LRP-20260920-GLASS-P2I
- Task Packet revision: 1
- Task Packet SHA-256: 901afdc2317e0b38ca90dcb69ba1fb8d8b271b1e073acd40e20d0e784c8f229e

## Objective

Single / Batch / Runtime Profile / Scenario Matrix で確立した
計算・入力・trust boundary を一切崩さずに、現在の検討結果を
「設計レビューで読める・印刷できる・比較できる資料」へ変換する。

中心機能は **Design Review Package**。これは現在のWorkspace状態から作る
derived review snapshot であって、計算入力の正本ではない。

```text
Workspace（authoritative inputs）
  → WorkspaceCore.evaluateWorkspace()（再実行）
  → Review Package v1（derived snapshot / 一方向）
  → preview / print / Markdown / JSON
```

新しい構造計算ロジックは持たない。Report builderは式を1つも書かない。

## Fresh Gate（Wave 0実測）

```text
origin/main       : 6a5232f65d02e2a8bfa8c2c87049b5865c584855
expected base     : 6a5232f65d02e2a8bfa8c2c87049b5865c584855  → 一致
working tree      : clean
tracked changes   : 0
untracked files   : 0
baseline npm test : 398 pass / 0 fail（expected >= 398 / 0 fail → 一致）
main direct write : なし（feature branchで作業）
```

## Phase 2H post-merge closeout

```yaml
phase: 2H
pr: 9
pr_state: MERGED
merged_at: 2026-09-20T13:52:12Z
merged_by: airesearchagl-art
final_feature_head: 371be899cc1866669545698b9aeaa125e324beb1
implementation_verification_head: 5838141954d73e0d5463f21810e62c24df573a82
readme_artifact_convergence: 51762c3d4857617b1756ae5261dddc6c85308c3b
merge_commit_main: 6a5232f65d02e2a8bfa8c2c87049b5865c584855
production: READY
final_focused_review: PASS
required_fix: 0
human_merge_authorization: received
tests: 398 / 0
browser: 130 / 0
```

Phase 2H の snapshot / digest は変更しない
（`ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27`）。

Phase 2H の head-role 区別もそのまま引き継ぐ:
実装最終headは `5838141`、READMEのmeasured-result確定は `51762c3`、
head-role文言訂正は `371be89`。「実装head以降はRun Artifactのみ」ではない。

## Architecture inventory（Wave 1実測 / §5）

Report builderが**再実装してはならない**境界を、実測で先に固定した。

### 既存が既に持っているもの

```text
WorkspaceCore.summarize(results) → §10が要求する項目とそのまま一致する
  totalCases / okCount / noSolutionCount / invalidCount /
  outOfScopePresentCount / maxDesignPressure / maxAreaM2 /
  governingCaseId / governingBasis

governing定義（Phase 2Gのまま）
  OK行のうち marginRatio 最小 → governingBasis = 'min_margin_ratio'
  OK行が無ければ designPressure 最大 → governingBasis = 'max_design_pressure'

WorkspaceCore.evaluateCase() の結果は §12 のcase table列を**すべて**持っている
  caseId / label / sourceKind / verificationStatus / widthMm / heightMm /
  areaM2 / positivePressure / negativePressure / designPressure / glassType /
  extraFactor / recommendedCandidate / recommendedLabel / allowablePressure /
  marginRatio / marginPressure / outOfScopePresent / status / error

WorkspaceCore.groupByRecommended(results)
  NO_SOLUTION / INVALID は独立bucket（混ぜない）

workspace.listCases() → { caseId, label, inputPackage }
  authoritative PIPがcaseごとに取れる＝trace表示に再計算が要らない

ProjectInput.windTraceFor(pkg) → 完全なtrace（Er / qBar / Cpe / Gpe / Cf / pressure）
```

したがって summary も case table も **projection であって computation ではない**。
review-package.js に式を書く理由が1つも無い。

### 実測で分かった、設計に効く2点

```text
1. windTraceFor() は notification_calculation 以外では null を返す
   manual         : null（実測）
   registered_preset: null（実測）
   → detail sectionは「traceが無い」ことを正直に出す。
     無い場合に別経路で作り直さない（作り直したらそれは再実装である）。

2. trace文字列自体に < が含まれる
   GpeBranch: "5<Z<40 (linear interpolation)"
   → escapeが必要なのはユーザー入力だけではない。
     内部由来の文字列も Markdown / DOM で同じ扱いにする。
```

### 既存の信頼表示（再定義しない）

```text
registered_preset の provenance
  { publicLabel, verificationStatus: 'partially_verified', note }
  → reportは partially_verified をそのまま出す。verifiedへ丸めない。

EvidenceLedger.reconcileFact() / RECONCILIATION_STATUSES
  MATCH / MISMATCH / INSUFFICIENT_EVIDENCE
  → Phase 2Fの契約を呼ぶ。report側で再定義しない。MATCH != verified を維持。

ProjectProfile.describeEffectiveInput(profile, scenario)
  profileLabel / profileStatus / fromProfile / fromScenario / effectiveWindInput
```

## Wave 2 — Review Package core（実測）

```text
npm test : 434 pass / 0 fail（baseline 398 → +36）
新規     : review-package.js / tests/review-package.test.js
```

### mutation（12件 / Wave 2のguardを対象）

```text
KILLED 11 / SURVIVED 1 / PATCH-MISS 0

  M1  summaryを自前計算に差し替え            KILLED（test B）
  M2  governing basisを固定値に              KILLED（test F）
  M3  detail cap削除                          KILLED（test L）
  M4  redactionがlabelを素通し                KILLED（test Z）
  M5  診断のnull検査削除                      KILLED（test §4）
  M6  precomputed option guard削除            KILLED（test §3）
  M7  comparison件数検査削除                  KILLED（test P）
  M8  source snapshotをenumerableに           KILLED（test §6 / test Z）
  M9  deepFreeze削除                          KILLED（test U/V）
  M10 detach(cases)削除                       SURVIVED
  M11 INVALID診断をdetailに許可               KILLED（test M）
  M12 trace不在時に0埋めのtraceを捏造         KILLED（test G）
```

M10 は D-006 に記録した。別のguardが拾ったのではなく、
case rowが既に新品のprimitiveだけで構成されているため、
copyの効果が現時点では観測できない、という種類の生存である。
coverageを主張せず、survivorのまま残した。

### Wave 2で見つけて直した実害1件

```text
redacted modeで伏せたはずのlabelが Review JSON から素通りしていた。
原因: sourceSnapshot に serializeWorkspace() の出力を入れ、
      それを export object へ載せていたため。
発見: 自分のtest Z が落ちた。
対処: snapshotを非enumerableにし、exportには free text を含まない
      sourceSummary だけを載せる（D-005）。
§44 の Redacted mode leak に当たるため、Quality Debt化せず即修理した。
```

## Wave 2H — Required Fix: evidenceSummary の genericity

```text
指摘: Review core が案件固有のEvidence状態を固定値で持っていた
実測: 手入力1件だけのWorkspaceでも「未解決4件 / promotion NONE」と報告した
対処: 自分の結果集合から導出できる事実だけにした（D-007）
tests: 434 → 439 pass / 0 fail

mutation（4件 / すべてKILLED / SURVIVED 0 / PATCH-MISS 0）
  H1 explicitUnresolvedItemCount: 4 を再導入   KILLED
  H2 projectSpecificPromotion を再導入          KILLED
  H3 byVerificationStatus 計算を削除            KILLED
  H4 bySourceKind 計算を削除                    KILLED
```

## Quality Debt

QUALITY_DEBT.md 参照（Wave 0時点で none）。

## Known failures

```text
none
```

## Remaining tasks

```text
Wave 1-7（TASK_QUEUE.md参照）
```

## Next action

Wave 3: comparison の仕上げ、Markdown export、Review JSON export、
trust / Evidence presentation model。

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
   901afdc2317e0b38ca90dcb69ba1fb8d8b271b1e073acd40e20d0e784c8f229e と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2i-design-review-package で現在headを確認
4. EVIDENCE.md を読む（Phase 2IはEvidence stateを変更しない）
5. QUALITY_DEBT.md を読む
6. npm test でsmoke check
7. 上記 Next action から再開する
```
