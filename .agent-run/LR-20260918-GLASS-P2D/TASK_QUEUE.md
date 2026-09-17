# TASK_QUEUE — LR-20260918-GLASS-P2D

Wave単位・AC単位のタスク状態。Wave完了ごとに更新する。

## Wave plan

| Wave | Goal | Dependency | Expected check | Checkpoint | Status |
|---|---|---|---|---|---|
| 0 | Fresh Gate / canonical read / Phase 2C closeout / Run Artifact初期化 / baseline | — | Fresh Gate PASS, baseline 91/0 | `4cbde645` | done |
| 1 | calc.js core purity（deprecated Miyoshi複製の削除 + consumer移行） | Wave 0 | npm test 92/0, purity grep 0件 | `d4a32883` | done |
| 2 | Project Input Package schema / validator / normalization / serialization + generic preset registry | Wave 1 | npm test 123/0 | `ab60842d` | done |
| 3 | safe import / export / replay + trust downgrade / security boundary | Wave 2 | security tests（Wave 2と同一checkpoint） | `ab60842d` | done |
| 4 | UI integration（Miyoshi / Manual / Imported state clarity） | Wave 3 | npm test 128/0, browser smoke PASS | `0b82f143` | done |
| 5 | mutation / security / privacy / full regression + independent verifier | Wave 4 | full suite / browser / privacy sweep / AC-10 audit 完了。self reviewで1件修正（`190b3c43`）。independent verification 実行中 | `190b3c43` | in_progress |
| 6 | README / Run Artifact convergence / Draft PR / Vercel Preview | Wave 5 | README同期済み（`fbcdfc9f`）。Draft PR / Preview exact-headが残 | 一部done | in_progress |

## Acceptance Criteria status

| AC | 内容 | Status |
|---|---|---|
| AC-01 | Calculation core完全案件非依存化 | PASS |
| AC-02 | Versioned Project Input Package | PASS |
| AC-03 | Common validator / factory | PASS |
| AC-04 | Generic preset registry | PASS |
| AC-05 | Imported dataをtrusted presetへ昇格させない | PASS |
| AC-06 | Safe import / export / replay | PASS |
| AC-07 | Import security | PASS |
| AC-08 | Backward compatibility / migration | PASS |
| AC-09 | Regression | PASS |
| AC-10 | Phase 2D new tests（20カテゴリ） | PASS |
| AC-11 | Browser verification | PASS |
| AC-12 | Vercel Preview exact-head | pending（Draft PR作成後） |
| AC-13 | Privacy / Disclosure | PASS |
| AC-14 | Documentation | README同期済 / PR本文が残 |

## Next Action

```text
Independent Verifierの結果反映 → Draft PR → Vercel Preview exact-head → Completion Report
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
