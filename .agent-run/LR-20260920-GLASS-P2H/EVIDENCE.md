# Evidence — LR-20260920-GLASS-P2H

## §1 Phase 2HもEvidence Phaseではない

Task Packet §4 / §29 / §30 により、本CampaignはEvidence stateを一切変更しない。

```yaml
verifiedCases: []                      # 変更しない
project_specific_promotion: NONE       # 変更しない
explicit_unverified_items: 4           # 維持
dimensions: 1250x2050 sample_default / unverified
positive_pressure: 1297 / 1525 / 1695 / 1729（current state）
negative_pressure: 918 / 1122（current state）
floor_to_Z: unverified
```

## §2 Runtime Profile が Evidence を増やさない理由

Profileは**利用者がその場で入力した共通条件**であり、出所の検証ではない。

- 同じ V0 を100 caseで使っても、それは同じ未検証値を100回使ったにすぎない
- Profileを保存・exportしても registered preset にはならない（§29）
- Profile / Scenario schema は `verificationStatus` / `Evidence` /
  `sourceReference` / `privateReferenceAvailable` を**受け付けない**（§30）

検証状況はfactの出所に属し、入力回数にも一致回数にも属さない。

## §3 floor → Z を推定しない（§10 / Hard Gate）

Scenario label に `2F` / `3F` と書かれていても、`evaluationHeightM` は必ず独立入力。
階と評価高さの対応は Phase 2F から引き継ぐ Explicit unverified item の1つであり、
Evidence が得られるまでこの境界を維持する。

ラベルの見た目から数値を作ることは、Evidence を捏造することと同じである。

## §4 Phase 2Fから引き継ぐ Explicit unverified items（4件・維持）

```text
1. ガラス1枚の実見付 W / H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m^2 の元計算根拠
3. 負圧 918 / 1122 N/m^2 の元計算根拠
4. 各階評価高さ Z と preset の exact mapping
```
