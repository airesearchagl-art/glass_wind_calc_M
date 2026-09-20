# Evidence — LR-20260920-GLASS-P2I

Phase 2I は Evidence Phase ではない（packet §4）。
Review Package を生成しても、印刷しても、100回exportしても、
検証状況は1つも動かない。

## §1 維持する状態（Wave 0実測）

```text
verifiedCases             : []
project_specific_promotion: NONE
explicit_unverified_items : 4
dimensions                : 1250 × 2050 / sample_default / unverified
階別正圧                   : 1297 / 1525 / 1695 / 1729
負圧                       : 918 / 1122
floor → Z                 : unverified
```

## §2 Reportは Evidence ではない

Review Package は現在の Workspace 状態から作る **derived snapshot** であり、

- 計算入力の正本ではない
- Project Input Package ではない
- Workspace Package ではない
- Evidence ではない
- 承認記録ではない

レポートに出力された回数は、factの出所について何も語らない。

## §3 Phase 2Fから引き継ぐ Explicit unverified items（4件・維持）

```text
1. ガラス1枚の実見付 W / H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m^2 の元計算根拠
3. 負圧 918 / 1122 N/m^2 の元計算根拠
4. 各階評価高さ Z と preset の exact mapping
```
