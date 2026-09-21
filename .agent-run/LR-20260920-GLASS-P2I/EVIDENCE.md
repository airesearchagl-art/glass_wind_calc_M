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

## §5 Wave 5 実測（regression evidence のみ。Evidence状態は変えていない）

```text
verifiedCases             : []
project-specific promotion: NONE
dimensions                : mode sample_default / status unverified（1250 × 2050）
validateAllEvidence()     : []
階別正圧 1F/2F/3F/RF       : 1297 / 1525 / 1695 / 1729
負圧 general / corner      : 918 / 1122
explicit unresolved items : 4件のまま

Review を 50 回生成し、その都度 JSON / Markdown を出力しても
上記はすべて同一（実測で before === after を確認）。
```

Review core（review-package.js）に案件固有のEvidence値は無い（実測）:

```text
explicitUnresolvedItemCount : 無し
projectSpecificPromotion    : 無し
verifiedCaseCount           : 無し
```

これは regression evidence であり、Evidence の昇格ではない。
Phase 2I は Evidence を1件も動かしていない。
