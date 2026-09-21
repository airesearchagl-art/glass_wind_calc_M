# Task Queue — LR-20260921-GLASS-P2J

## Wave Plan（packet §31）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Phase 2I closeout / Run Artifact / baseline | DONE |
| 1 | Evidence architecture inventory / 4 unresolved fact model / privacy boundary | DONE |
| 2 | evidence-closure.js / Observation contract / strict schemas | DONE |
| 3 | reconciliation / Closure Evaluation / Promotion Candidate / one-way export | DONE |
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
| AC-J07 | Evidence-first reconciliation | PASS | gateが先、数値は後。gate FAIL時は値一致でも INSUFFICIENT_EVIDENCE（P2J-C45 / W3-01,02） |
| AC-J08 | value matchだけではpromotion不可 | PASS | 値一致 + Evidence不十分 → BLOCKED を合成presetで実測（P2J-C45） |
| AC-J09 | MISMATCH fail closed | PASS | MISMATCH → BLOCKED / 自動修復なし / preset不変（P2J-C47 / W3-05） |
| AC-J10 | partial closure可能 | PASS | 部分集合で 3/4 カテゴリ READY のまま進捗が残る（P2J-C52） |
| AC-J11 | project promotion non-mutating | PASS | 評価→candidate→serialize の前後でconfig構造が等しい（P2J-C58 / W3-15） |
| AC-J12 | no apply/import promotion API | PASS | apply/import/deserialize いずれも不在。module内に JSON.parse なし（P2J-C35 / W3-18） |
| AC-J13 | Promotion Candidate public-safe | PASS | private marker が評価・candidate・exportに現れない（P2J-C57 / W3-17） |
| AC-J14 | candidate deterministic | PASS | 入力順非依存・timestampなし・byte一致JSON（P2J-C53 / C56 / W3-19） |
| AC-J15 | custom prototype rejection | PASS | 既存9経路（Wave 1）＋ closure moduleの observation/scope/evidence/sourceReference。own "__proto__" も拒否 |
| AC-J16 | trust spoof rejection | PASS | verificationStatus等10種すべて「予期しないfield」として拒否（P2J-C27 / mutation O15） |
| AC-J17 | current verifiedCases unchanged | PASS | `[]` のまま。P2J-TB16で固定 |
| AC-J18 | current preset status unchanged | PASS | W/H/圧力/V0=34/粗度IIIすべて不変。P2J-TB16で固定（D-006） |
| AC-J19 | calculation regressionなし | PASS（Wave 3時点） | 581 pass / 0 fail。保護対象の計算値を直接再実測して一致 |
| AC-J20 | Review/Batch/Profile regressionなし | PASS（Wave 3時点） | 既存suite無改変で全緑。index.htmlは未変更 |
| AC-J21 | actual evidence availabilityを正直に記録 | PASS | Wave 0で実測。UNAVAILABLE（下記 EVIDENCE.md §2） |
| AC-J22 | private evidence unavailableならpromotion NONE | PASS（継続） | actual observations 0 / promotion NONE のまま |
| AC-J23 | README/documentation sync | PENDING | |
| AC-J24 | independent verifier | PENDING | |
| AC-J25 | Draft PR / Human Gate STOP | PENDING | |

## Next Action

```text
Wave 4: 一次資料の可用性は UNAVAILABLE のままである（§58）。
        Evidence取得を発明しない。選択肢は2つ:

  (a) read-only の Evidence Closure Status 表示を index.html に足す
      - 表示するのは「何が足りないか」であって「現在の真実」ではない
      - evidence-closure.js は registry.js の後に読み込む（D-012）
      - 実案件の表示は常に BLOCKED / 0 of 12 / candidate なし になる
  (b) UIが価値を足さないと判断するならUIを省き、
      security / privacy / trust campaign（Wave 5）へ直接進む

  どちらを採るかは、read-only表示が
  「Evidence Request Matrix として実際に使えるか」で決める。
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §34）。
