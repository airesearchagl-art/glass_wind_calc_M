# Task Queue — LR-20260921-GLASS-P2J

## Wave Plan（packet §31）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Phase 2I closeout / Run Artifact / baseline | DONE |
| 1 | Evidence architecture inventory / 4 unresolved fact model / privacy boundary | DONE |
| 2 | evidence-closure.js / Observation contract / strict schemas | DONE |
| 3 | reconciliation / Closure Evaluation / Promotion Candidate / one-way export | PENDING |
| 4 | 一次資料の可用性確認 / 可能ならpublic-safe candidate / read-only status UI | PENDING |
| 5 | security / privacy / trust spoof / prototype / mutation | PENDING |
| 6 | full regression / independent verifier / repair | PENDING |
| 7 | README / Run Artifact convergence / Draft PR / Preview / Completion Report | PENDING |

## Acceptance Criteria（packet §30）

| AC | 内容 | 状態 | 実測 |
|---|---|---|---|
| AC-J01 | Fresh Gate PASS | PASS | main 44e4032 / tree clean / baseline 500 pass 0 fail |
| AC-J02 | Evidence Closure Observation v1成立 | PASS | schemaVersion 1 / observationType固定 / 8 field厳密 / detach + deep freeze |
| AC-J03 | strict fact allowlist | PASS | closure fact 5件。generic allowlistの部分集合であることをmodule評価時にassert |
| AC-J04 | fact-specific schema | PASS | scope種別 / 単位 / scalar数値をfactごとに固定。単位変換なし |
| AC-J05 | private reference非保持 | PASS | privateReferenceAvailable=trueでも sourceReference は null（P2J-C22） |
| AC-J06 | Phase2F Evidence contract reuse | PASS | export surfaceを実測。§3の列挙と完全一致。再実装しない前提を確定（D-002 / EVIDENCE §3） |
| AC-J07 | Evidence-first reconciliation | PENDING | |
| AC-J08 | value matchだけではpromotion不可 | PENDING | |
| AC-J09 | MISMATCH fail closed | PENDING | |
| AC-J10 | partial closure可能 | PENDING | |
| AC-J11 | project promotion non-mutating | PENDING | |
| AC-J12 | no apply/import promotion API | PENDING | |
| AC-J13 | Promotion Candidate public-safe | PENDING | |
| AC-J14 | candidate deterministic | PENDING | |
| AC-J15 | custom prototype rejection | PASS | 既存9経路（Wave 1）＋ closure moduleの observation/scope/evidence/sourceReference。own "__proto__" も拒否 |
| AC-J16 | trust spoof rejection | PASS | verificationStatus等10種すべて「予期しないfield」として拒否（P2J-C27 / mutation O15） |
| AC-J17 | current verifiedCases unchanged | PASS | `[]` のまま。P2J-TB16で固定 |
| AC-J18 | current preset status unchanged | PASS | W/H/圧力/V0=34/粗度IIIすべて不変。P2J-TB16で固定（D-006） |
| AC-J19 | calculation regressionなし | PASS（Wave 2時点） | 557 pass / 0 fail。既存500件は無改変のまま緑 |
| AC-J20 | Review/Batch/Profile regressionなし | PASS（Wave 2時点） | 既存suite無改変で全緑。index.htmlは未変更 |
| AC-J21 | actual evidence availabilityを正直に記録 | PASS | Wave 0で実測。UNAVAILABLE（下記 EVIDENCE.md §2） |
| AC-J22 | private evidence unavailableならpromotion NONE | PASS（継続） | actual observations 0 / promotion NONE のまま |
| AC-J23 | README/documentation sync | PENDING | |
| AC-J24 | independent verifier | PENDING | |
| AC-J25 | Draft PR / Human Gate STOP | PENDING | |

## Next Action

```text
Wave 3: Evidence gate / scalar reconciliation / Closure Evaluation /
        temporary per-case ledger / project completeness / Promotion Candidate

  - Evidence gate は ProjectEvidence.assertPromotionGate() を呼ぶ（再実装しない）
  - reconciliation は EvidenceLedger.reconcileFact() を scalar leaf 単位で呼ぶ。
    map丸ごとを渡さない（Wave 1 packet §12）
  - evaluation_height は current config に正が存在しないため（Wave 1 実測）、
    MATCH を報告しない。reconciliationApplicable: false / reconciliationStatus: null
  - case readiness は EvidenceLedger.evaluateCasePromotion() を呼ぶ。
    W && H && positive && negative && Z の並行条件を書かない
  - project completeness は 12 slot がすべて揃って初めて成立。欠ければ BLOCKED
  - Promotion Candidate は non-mutating。apply/import API を作らない
  - 実案件Observationは 0 件のままなので、実際の closure は
    BLOCKED_BY_MISSING_EVIDENCE / promotion NONE で確定する
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §34）。
