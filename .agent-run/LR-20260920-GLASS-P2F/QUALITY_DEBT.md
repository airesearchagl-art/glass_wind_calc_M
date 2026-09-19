# QUALITY DEBT — LR-20260920-GLASS-P2F

```yaml
debts: []
```

現時点で計上されているQuality Debtはない。

## 方針

`LONG_RUN`（`LONG_RUN_ENDURANCE` ではない）のため、検証不能項目をQuality Debtへ送って
継続することはしない。

Task Packet §28のHard Gate項目は**Quality Debt化を禁止**する:

```text
private Evidence leak
secret leak
trust promotion bypass
verified-state spoofing
data integrity
Evidence without source
automatic pressure replacement after mismatch
automatic pane-dimension inference
automatic Z inference
```

発生時はBLOCKEDとして state / evidence / resume情報だけ保存しSTOPする。

## 重要: Evidence不足はQuality Debtではない

private Evidenceが利用できないことは「後で返済する負債」ではなく、
**Humanが資料を提供するまで構造的に解消できない外部依存**である。

Task Packet §23が明示するとおり、Evidence不足時は
generic layerまで進めたうえでproject-specific promotionを行わず、
`verifiedCases: []` と Explicit unverified items 4件を維持する。
**Evidence不足をコードで埋めない。**
