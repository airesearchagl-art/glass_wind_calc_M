# Quality Debt — LR-20260921-GLASS-P2J

```text
none（Wave 0時点）
```

## 規則

Hard Gate（TASK_PACKET_SNAPSHOT.md §32）に該当する事象は Quality Debt 化できない。
発生した場合は `BLOCKED` へ遷移する。

```text
runtimeでのtrust promotion / Evidence-first順序の破れ /
案件事実の推測 / private referenceの流出 / Evidence gateの二重実装 /
partial closureをcase promotionへ格上げ / MISMATCHの握り潰し /
candidateによるcurrent config変更 / apply API / candidate import-to-trust /
prototype boundary / verifiedCasesの変更 / 計算regression
```

Phase 2Fから引き継ぐ Explicit unverified items 4件は Quality Debt ではない。
一次資料が提供されるまで構造的に解消できない外部依存であり、
Phase 2J はそれを**閉じる**phaseではなく、**閉じる条件を機械可読にする**phaseである。
