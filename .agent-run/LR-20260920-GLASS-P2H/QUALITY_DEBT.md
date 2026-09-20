# Quality Debt — LR-20260920-GLASS-P2H

```text
none（Wave 0時点）
```

## 規則

Hard Gate（TASK_PACKET_SNAPSHOT.md §42）に該当する事象は Quality Debt 化できない。
発生した場合は `BLOCKED` へ遷移する。

```text
wrong calculation / implicit Z / implicit zone / implicit basis /
floor→Z inference / trusted Profile promotion / Evidence spoof /
registered preset spoof / prototype pollution / private data leak /
Single regression / Batch regression / snapshot mutation /
unbounded matrix generation
```

Phase 2Fから引き継ぐ Explicit unverified items 4件は Quality Debt ではない
（Humanが資料を提供するまで構造的に解消できない外部依存。Phase 2Hのscope外）。
