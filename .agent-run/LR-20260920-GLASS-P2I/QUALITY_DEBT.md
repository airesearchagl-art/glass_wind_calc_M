# Quality Debt — LR-20260920-GLASS-P2I

```text
none（Wave 0時点）
```

## 規則

Hard Gate（TASK_PACKET_SNAPSHOT.md §44）に該当する事象は Quality Debt 化できない。
発生した場合は `BLOCKED` へ遷移する。

```text
wrong calculation / wrong governing case /
verified・unverified display inversion / Evidence promotion /
raw diagnostic leak / Redacted mode leak / XSS /
active HTML export / report→input trust path /
silent stale report / unbounded detail generation /
network・private upload / Single・Batch regression
```

Phase 2Fから引き継ぐ Explicit unverified items 4件は Quality Debt ではない
（Humanが資料を提供するまで構造的に解消できない外部依存。Phase 2Iのscope外）。
