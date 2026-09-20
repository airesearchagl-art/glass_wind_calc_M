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
| 6 | full regression / browser / independent verifier | DONE（PASS WITH FINDINGS / F1-F4修復済み） |
| 7 | README / Run Artifact convergence / Draft PR / Vercel exact head / Completion Report | DONE |

## Acceptance Criteria（packet §33）

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Single Calculator regressionなし | PASS |
| AC-02 | Batch layerが新しい計算formulaを持たない | PASS |
| AC-03 | 1 case = existing PIP v2 | PASS |
| AC-04 | Workspace Package v1成立 | PASS |
| AC-05 | Workspaceはderived resultをauthoritativeに保存しない | PASS |
| AC-06 | Add Current Case成立 | PASS |
| AC-07 | Duplicate / Remove / Clear成立 | PASS |
| AC-08 | Batch evaluationがrow-isolated | PASS |
| AC-09 | Summary counts正しい | PASS |
| AC-10 | recommended configuration grouping成立 | PASS |
| AC-11 | sort / filter成立 | PASS |
| AC-12 | TSV Manual import成立 | PASS |
| AC-13 | TSV Notification import成立 | PASS |
| AC-14 | TSVからtrusted preset / Evidence生成不可 | PASS |
| AC-15 | Workspace JSON importはexternal/untrusted boundaryを通る | PASS |
| AC-16 | Workspace round-tripでcalculation結果再現 | PASS |
| AC-17 | CSV result export成立 | PASS |
| AC-18 | CSV formula injection防止 | PASS |
| AC-19 | HTML injection防止 | PASS |
| AC-20 | size / row limit fail closed | PASS |
| AC-21 | no localStorage / backend persistence | PASS |
| AC-22 | existing Evidence / Verified Case contract非退行 | PASS |
| AC-23 | Phase 2E Wind Trace非退行 | PASS |
| AC-24 | PIP v1/v2非退行 | PASS |
| AC-25 | README / Run Artifact sync | PASS |

## Next Action

```text
Claude側implementation: なし（Wave 7で完了）

1. Human Gate — PR の Ready-for-review / merge / Production 認可
2. 必要なら最終 focused independent delta review
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §44）。
