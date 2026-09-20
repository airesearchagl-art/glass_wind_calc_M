# Task Queue — LR-20260920-GLASS-P2G

## Wave Plan（packet §43）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Run Artifact / Phase 2F closeout / baseline | DONE |
| 1 | existing architecture inventory / Workspace contract design | DONE |
| 2 | Workspace Package v1 / case lifecycle / evaluation orchestration / summary | DONE |
| 3 | Batch UI / Add Current / Duplicate / Remove / Sort / Filter / Grouping | DONE |
| 4 | TSV paste / Workspace JSON export-import / CSV result export | DONE |
| 4H | Batch Error Contract Closure（Required Fix 1 / 2） | DONE |
| 5 | security / privacy / CSV injection / HTML escaping / prototype pollution / limits / mutation | DONE |
| 6 | full regression / browser / independent verifier | PENDING |
| 7 | README / Run Artifact convergence / Draft PR / Vercel exact head / Completion Report | PENDING |

## Acceptance Criteria（packet §33）

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Single Calculator regressionなし | PENDING |
| AC-02 | Batch layerが新しい計算formulaを持たない | PENDING |
| AC-03 | 1 case = existing PIP v2 | PENDING |
| AC-04 | Workspace Package v1成立 | PENDING |
| AC-05 | Workspaceはderived resultをauthoritativeに保存しない | PENDING |
| AC-06 | Add Current Case成立 | PENDING |
| AC-07 | Duplicate / Remove / Clear成立 | PENDING |
| AC-08 | Batch evaluationがrow-isolated | PENDING |
| AC-09 | Summary counts正しい | PENDING |
| AC-10 | recommended configuration grouping成立 | PENDING |
| AC-11 | sort / filter成立 | PENDING |
| AC-12 | TSV Manual import成立 | PENDING |
| AC-13 | TSV Notification import成立 | PENDING |
| AC-14 | TSVからtrusted preset / Evidence生成不可 | PENDING |
| AC-15 | Workspace JSON importはexternal/untrusted boundaryを通る | PENDING |
| AC-16 | Workspace round-tripでcalculation結果再現 | PENDING |
| AC-17 | CSV result export成立 | PENDING |
| AC-18 | CSV formula injection防止 | PENDING |
| AC-19 | HTML injection防止 | PENDING |
| AC-20 | size / row limit fail closed | PENDING |
| AC-21 | no localStorage / backend persistence | PENDING |
| AC-22 | existing Evidence / Verified Case contract非退行 | PENDING |
| AC-23 | Phase 2E Wind Trace非退行 | PENDING |
| AC-24 | PIP v1/v2非退行 | PENDING |
| AC-25 | README / Run Artifact sync | PENDING |

## Next Action

```text
Wave 6: full regression / browser / independent verifier
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §44）。
