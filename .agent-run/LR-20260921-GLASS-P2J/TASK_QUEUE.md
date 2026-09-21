# Task Queue — LR-20260921-GLASS-P2J

## Wave Plan（packet §31）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Phase 2I closeout / Run Artifact / baseline | DONE |
| 1 | Evidence architecture inventory / 4 unresolved fact model / privacy boundary | DONE |
| 2 | evidence-closure.js / Observation contract / strict schemas | PENDING |
| 3 | reconciliation / Closure Evaluation / Promotion Candidate / one-way export | PENDING |
| 4 | 一次資料の可用性確認 / 可能ならpublic-safe candidate / read-only status UI | PENDING |
| 5 | security / privacy / trust spoof / prototype / mutation | PENDING |
| 6 | full regression / independent verifier / repair | PENDING |
| 7 | README / Run Artifact convergence / Draft PR / Preview / Completion Report | PENDING |

## Acceptance Criteria（packet §30）

| AC | 内容 | 状態 | 実測 |
|---|---|---|---|
| AC-J01 | Fresh Gate PASS | PASS | main 44e4032 / tree clean / baseline 500 pass 0 fail |
| AC-J02 | Evidence Closure Observation v1成立 | PENDING | |
| AC-J03 | strict fact allowlist | PENDING | |
| AC-J04 | fact-specific schema | PENDING | |
| AC-J05 | private reference非保持 | PENDING | |
| AC-J06 | Phase2F Evidence contract reuse | PASS | export surfaceを実測。§3の列挙と完全一致。再実装しない前提を確定（D-002 / EVIDENCE §3） |
| AC-J07 | Evidence-first reconciliation | PENDING | |
| AC-J08 | value matchだけではpromotion不可 | PENDING | |
| AC-J09 | MISMATCH fail closed | PENDING | |
| AC-J10 | partial closure可能 | PENDING | |
| AC-J11 | project promotion non-mutating | PENDING | |
| AC-J12 | no apply/import promotion API | PENDING | |
| AC-J13 | Promotion Candidate public-safe | PENDING | |
| AC-J14 | candidate deterministic | PENDING | |
| AC-J15 | custom prototype rejection | PARTIAL | 既存contract 9経路すべて修理・実測（D-003）。closure moduleは未実装のためWave 2で再評価 |
| AC-J16 | trust spoof rejection | PENDING | |
| AC-J17 | current verifiedCases unchanged | PASS | `[]` のまま。P2J-TB16で固定 |
| AC-J18 | current preset status unchanged | PASS | W/H/圧力/V0=34/粗度IIIすべて不変。P2J-TB16で固定（D-006） |
| AC-J19 | calculation regressionなし | PASS（Wave 1時点） | 518 pass / 0 fail。既存500件すべて緑のまま |
| AC-J20 | Review/Batch/Profile regressionなし | PASS（Wave 1時点） | 既存suite無改変で全緑 |
| AC-J21 | actual evidence availabilityを正直に記録 | PASS | Wave 0で実測。UNAVAILABLE（下記 EVIDENCE.md §2） |
| AC-J22 | private evidence unavailableならpromotion NONE | PENDING | |
| AC-J23 | README/documentation sync | PENDING | |
| AC-J24 | independent verifier | PENDING | |
| AC-J25 | Draft PR / Human Gate STOP | PENDING | |

## Next Action

```text
Wave 2: project-config/evidence-closure.js を新規実装する。
  - Observation v1（§9のshape。sourceReferenceはevidenceの中に入れない）
  - scope contract（§10）: pane_width_mm/pane_height_mm は scope=null、
    positive_pressure/evaluation_height は {floor}, negative_pressure は {zone}
  - unknown scope field / fact typeに対する誤ったscope / filename由来識別子を拒否
  - scalar leafのみ（§12）。map丸ごとのreconcileはしない
  - 検証は Phase 2F contract を呼ぶ（§3のcopy禁止リストを再確認すること）
  - 合成fixtureのみ。実案件Observationは 0 件のまま（§17）
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §34）。
