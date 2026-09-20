# Quality Debt — LR-20260920-GLASS-P2G

```text
none（Wave 7時点）
```

独立検証の指摘4件（F1-F4）はいずれも本Campaign内で修復済みであり、
Quality Debtとして繰り越していない。

## このファイルの規則

Hard Gate（TASK_PACKET_SNAPSHOT.md §41）に該当する事象は
**Quality Debt化できない**。発生した場合は `BLOCKED` へ遷移する。

```text
wrong calculation result
Single regression
trust promotion bypass
Evidence spoof
CSV formula injection
HTML injection
prototype pollution
private data committed
unbounded import
derived result accepted as authoritative
preset mutation
security/privacy failure
```

Evidence不足（Phase 2Fから引き継ぐExplicit unverified items 4件）は
Quality Debtではない。Humanが資料を提供するまで構造的に解消できない外部依存であり、
Phase 2Gのscope外（§5）。
