# Evidence — LR-20260920-GLASS-P2G

## §1 Phase 2GはEvidence Phaseではない

Task Packet §5 により、本CampaignはEvidence stateを一切変更しない。

```yaml
verifiedCases: []                      # 変更しない
project_specific_promotion: NONE       # 変更しない
dimensions: 1250x2050 sample_default / unverified   # 変更しない
positive_pressure_provenance: current state         # 変更しない
negative_pressure_provenance: current state         # 変更しない
floor_to_Z: unverified                 # 変更しない
V0_34_roughness_III: existing verified state        # 変更しない
```

## §2 Batch layerがEvidenceを増やさない理由

Workspaceは同じ入力を何度でも保持できるが、**同じ数値が何度現れても
Evidenceは増えない**。検証状況はfactの出所に属し、出現回数に属さない。

したがって:

- Batch rowが 1297 / 1525 / 1250 / 2050 を何度含んでも、それらは依然 unverified
- CSV / TSV / JSON import は **trusted Evidence source ではない**（§5 / §10 / §30）
- Workspace schemaは Evidence field そのものを受け付けない設計にする（§30）

## §3 Phase 2Fから引き継ぐExplicit unverified items（4件・維持）

```text
1. ガラス1枚の実見付 W / H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m^2 の元計算根拠
3. 負圧 918 / 1122 N/m^2 の元計算根拠
4. 各階評価高さ Z と preset の exact mapping
```

Phase 2Gでこれらを勝手にclosureしない（§4 / §5）。

## §4 本Campaignで参照する「根拠」の性質

Phase 2Gが扱うのは計算の**再現性**であって、案件factの検証ではない。
Batch結果の正しさは「single-case calculatorと一致すること」で示す。
Batch側で独自の期待値を固定しない（§35）。
