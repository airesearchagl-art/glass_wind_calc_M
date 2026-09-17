# TASK_QUEUE — LR-20260918-GLASS-P2D

Wave単位・AC単位のタスク状態。Wave完了ごとに更新する。

## Wave plan

| Wave | Goal | Dependency | Expected check | Checkpoint | Status |
|---|---|---|---|---|---|
| 0 | Fresh Gate / canonical read / Phase 2C closeout / Run Artifact初期化 / baseline | — | Fresh Gate PASS, baseline 91/0 | required | in_progress |
| 1 | calc.js core purity（deprecated Miyoshi複製の削除 + consumer移行） | Wave 0 | npm test, purity grep | required | pending |
| 2 | Project Input Package schema / validator / normalization / serialization + generic preset registry | Wave 1 | targeted unit tests | required | pending |
| 3 | safe import / export / replay + trust downgrade / security boundary | Wave 2 | security tests | required | pending |
| 4 | UI integration（Miyoshi / Manual / Imported state clarity） | Wave 3 | browser smoke | required | pending |
| 5 | mutation / security / privacy / full regression + independent verifier | Wave 4 | full suite, browser, privacy sweep | required | pending |
| 6 | README / Run Artifact convergence / Draft PR / Vercel Preview | Wave 5 | Preview exact-head READY | required | pending |

## Acceptance Criteria status

| AC | 内容 | Status |
|---|---|---|
| AC-01 | Calculation core完全案件非依存化 | pending |
| AC-02 | Versioned Project Input Package | pending |
| AC-03 | Common validator / factory | pending |
| AC-04 | Generic preset registry | pending |
| AC-05 | Imported dataをtrusted presetへ昇格させない | pending |
| AC-06 | Safe import / export / replay | pending |
| AC-07 | Import security | pending |
| AC-08 | Backward compatibility / migration | pending |
| AC-09 | Regression | pending |
| AC-10 | Phase 2D new tests（20カテゴリ） | pending |
| AC-11 | Browser verification | pending |
| AC-12 | Vercel Preview exact-head | pending |
| AC-13 | Privacy / Disclosure | pending |
| AC-14 | Documentation | pending |

## Next Action

```text
Wave 1 — calc.js core purity
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管）。
