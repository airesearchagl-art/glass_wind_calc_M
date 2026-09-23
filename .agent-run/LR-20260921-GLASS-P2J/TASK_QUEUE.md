# Task Queue — LR-20260921-GLASS-P2J

## Wave Plan（packet §31）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Phase 2I closeout / Run Artifact / baseline | DONE |
| 1 | Evidence architecture inventory / 4 unresolved fact model / privacy boundary | DONE |
| 2 | evidence-closure.js / Observation contract / strict schemas | DONE |
| 3 | reconciliation / Closure Evaluation / Promotion Candidate / one-way export | DONE |
| 4 | read-only Evidence Request Matrix（UI実装） | DONE |
| 5 | security / privacy / trust spoof / prototype / mutation | DONE |
| 6 | full regression / independent verifier / repair | 修理完了・再検証待ち |
| 7 | README / Run Artifact convergence / Draft PR / Preview / Completion Report | PENDING |

## Acceptance Criteria（packet §30）

| AC | 内容 | 状態 | 実測 |
|---|---|---|---|
| AC-J01 | Fresh Gate PASS | PASS | main 44e4032 / tree clean / baseline 500 pass 0 fail |
| AC-J02 | Evidence Closure Observation v1成立 | PASS | schemaVersion 1 / observationType固定 / 8 field厳密 / detach + deep freeze |
| AC-J03 | strict fact allowlist | PASS | closure fact 5件。generic allowlistの部分集合であることをmodule評価時にassert |
| AC-J04 | fact-specific schema | PASS | scope種別 / 単位 / scalar数値をfactごとに固定。単位変換なし |
| AC-J05 | private reference非保持 | PASS | candidate/exportともに所在なし。Wave 5でprose側の4クラス（email/私的文書名/タグ/制御文字）も塞いだ |
| AC-J06 | Phase2F Evidence contract reuse | PASS | export surfaceを実測。§3の列挙と完全一致。再実装しない前提を確定（D-002 / EVIDENCE §3） |
| AC-J07 | Evidence-first reconciliation | PASS | gateが先、数値は後。gate FAIL時は値一致でも INSUFFICIENT_EVIDENCE（P2J-C45 / W3-01,02） |
| AC-J08 | value matchだけではpromotion不可 | PASS | 値一致 + Evidence不十分 → BLOCKED を合成presetで実測（P2J-C45） |
| AC-J09 | MISMATCH fail closed | PASS | MISMATCH → BLOCKED / 自動修復なし / preset不変（P2J-C47 / W3-05） |
| AC-J10 | partial closure可能 | PASS | 部分集合で 3/4 カテゴリ READY のまま進捗が残る（P2J-C52） |
| AC-J11 | project promotion non-mutating | PASS | 評価→candidate→serialize の前後でconfig構造が等しい（P2J-C58 / W3-15） |
| AC-J12 | no apply/import promotion API | PASS | apply/import/deserialize いずれも不在。module内に JSON.parse なし（P2J-C35 / W3-18） |
| AC-J13 | Promotion Candidate public-safe | PASS | top-level/proposedFactのkey集合を固定。private marker到達なし（P2J-S04/S14） |
| AC-J14 | candidate deterministic | PASS | 入力順非依存・timestampなし・byte一致JSON（P2J-C53 / C56 / W3-19） |
| AC-J15 | custom prototype rejection | PASS | 既存9経路（Wave 1）＋ closure moduleの observation/scope/evidence/sourceReference。own "__proto__" も拒否 |
| AC-J16 | trust spoof rejection | PASS | Observation側に加えcandidate側のfield（candidateStatus/notApplied/gateSummary等）も拒否（P2J-S07 / W5-14） |
| AC-J17 | current verifiedCases unchanged | PASS | `[]` のまま。P2J-TB16で固定 |
| AC-J18 | current preset status unchanged | PASS | W/H/圧力/V0=34/粗度IIIすべて不変。P2J-TB16で固定（D-006） |
| AC-J19 | calculation regressionなし | PASS（Wave 6時点） | 619 pass / 0 fail。保護値5件を修理前後で直接再測定 |
| AC-J20 | Review/Batch/Profile regressionなし | PASS（Wave 5時点） | Phase 2F〜2Iの既存suiteを無改変のまま全緑 |
| AC-J21 | actual evidence availabilityを正直に記録 | PASS | 開発セッションの調査結果（UNAVAILABLE）はRun Artifactに残し、UIにはruntime真実（Observation 0件）だけを出す（D-021 / P2J-U19） |
| AC-J22 | private evidence unavailableならpromotion NONE | PASS | UI実測で candidate「なし」/ 0 of 12 / 0 of 4 / 0 of 8 |
| AC-J23 | README/documentation sync | PENDING | |
| AC-J24 | independent verifier | 部分PASS | Stage B は別コンテキストで read-only 実施。PASS WITH FINDINGS（Hard Gate 0）。指摘3件を修理済み。**新headでの再検証が未完** |
| AC-J25 | Draft PR / Human Gate STOP | PENDING | |

## Next Action

```text
Wave 6: full regression / independent verifier / repair

  - Phase 2J 全体（Wave 1〜5）を独立コンテキストで検証する
  - 指摘は本Campaign内で修理する（持ち越さない）
  - 修理後、exact-head で再検証する
```

Wave 5 で見つかった generic boundary gap（public-safe prose の4クラス）は
本Waveで修理済み。`PUBLIC_UNSAFE_TEXT_PATTERNS` の強化であり、
案件Evidenceは一切変更していない。

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §34）。
