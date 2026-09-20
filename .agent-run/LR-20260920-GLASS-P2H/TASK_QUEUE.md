# Task Queue — LR-20260920-GLASS-P2H

## Wave Plan（packet §41）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Run Artifact / Phase 2G closeout / baseline | DONE |
| 1 | architecture inventory / Profile contract / Scenario contract | DONE |
| 2 | Profile module / Profile Package v1 / effective resolver | DONE |
| 3 | Scenario Matrix model / generator / Scenario → Workspace | DONE |
| 4 | UI（Profile editor / effective preview / Matrix / TSV / export-import） | DONE |
| 4H | Boundary Closure（Required Fix A / B / C） | DONE |
| 5 | security / privacy / mutation / limits | PENDING |
| 6 | full regression / browser / independent verifier / repair | PENDING |
| 7 | README / Run Artifact convergence / Draft PR / Completion Report | PENDING |

## Acceptance Criteria（packet §36）

| AC | 内容 | 状態 |
|---|---|---|
| AC-01 | Single regressionなし | PENDING |
| AC-02 | Phase 2G Batch regressionなし | PENDING |
| AC-03 | Profile Package v1成立 | PENDING |
| AC-04 | Runtime Profileはunverifiedのみ | PENDING |
| AC-05 | evaluationHeight / zoneはProfileへ入らない | PENDING |
| AC-06 | floor→Z inferenceなし | PENDING |
| AC-07 | effective resolver成立 | PENDING |
| AC-08 | resolved PIPが既存direct pathと同一結果 | PENDING |
| AC-09 | Profile changeが既存Workspace caseをmutationしない | PENDING |
| AC-10 | Scenario Matrix成立 | PENDING |
| AC-11 | Matrix TSV成立 | PENDING |
| AC-12 | Matrix generator成立 | PENDING |
| AC-13 | generator cap成立 | PENDING |
| AC-14 | Scenario → Workspace成立 | PENDING |
| AC-15 | generated caseはnotification_calculation / unverified | PENDING |
| AC-16 | Workspace JSON単独で再計算可能 | PENDING |
| AC-17 | Profile import trust spoof不可 | PENDING |
| AC-18 | Scenario import trust spoof不可 | PENDING |
| AC-19 | prototype pollution不可 | PENDING |
| AC-20 | HTML / error privacy非退行 | PENDING |
| AC-21 | CSV injection非退行 | PENDING |
| AC-22 | memory-only | PENDING |
| AC-23 | PIP v1/v2非退行 | PENDING |
| AC-24 | Evidence/verifiedCases非退行 | PENDING |
| AC-25 | README / Run Artifact actual sync | PENDING |

## Next Action

```text
Wave 5: §37 attack / mutation campaign → Wave 6 → Wave 7
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §44）。
