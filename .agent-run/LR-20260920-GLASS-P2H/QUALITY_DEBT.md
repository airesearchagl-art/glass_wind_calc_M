# Quality Debt — LR-20260920-GLASS-P2H

```text
none（Wave 7終了時点 / 実測）
```

Wave 7のindependent verification指摘7件は、すべて本Campaign内で修理済み。
Quality Debtとして持ち越した項目は無い。

残る既知の制約（Phase 2H起因ではない / debtではない）:

```text
Profile Package は memory-only。ページを閉じると消える（§24の設計どおり）。
診断の reason は数値セル値を含みうる（Phase 2Gからの契約。
  quoted stringは redact される。workspace.js sanitizeReason 参照）。
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
