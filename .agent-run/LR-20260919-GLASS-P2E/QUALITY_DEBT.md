# QUALITY DEBT — LR-20260919-GLASS-P2E

```yaml
debts: []
```

現時点で計上されているQuality Debtはない。

## 方針

`LONG_RUN`（`LONG_RUN_ENDURANCE` ではない）のため、検証不能項目をQuality Debtへ送って
継続することはしない。

Task Packet §19のHard Gate項目（Safety-critical formula mismatch / Security / Privacy /
Permission / Data integrity / Secret exposure / Trust-boundary bypass / Verified-state spoofing）は
**Quality Debt化を禁止**する。FAIL時はBLOCKEDとして state / evidence / resume情報だけ保存しSTOPする。

特にPhase 2E固有:

- 公式sourceと実装が一致しない → BLOCKED（Debtにしない）
- sourceが曖昧なのに推測実装 → BLOCKED（Debtにしない）

## Constraint記録（Debtではない）

（Wave進行に応じて追記する）
