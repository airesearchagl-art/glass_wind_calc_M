# Evidence — LR-20260921-GLASS-P2J

## §1 Phase 2J 開始時点の正本（変更しない）

```text
verifiedCases             : []
project-specific promotion: NONE
V0                        : 34 m/s   verified / primary
roughness                 : III      verified / primary
正圧 1F/2F/3F/RF           : 1297 / 1525 / 1695 / 1729   partially_verified / indirect
負圧 general / corner      : 918 / 1122                  partially_verified / indirect
dimensions                : 1250 × 2050  sample_default / unverified
```

H=2050 は既存資料に ACW 全体高さとして類似値の記録候補があるが、
ガラス見付高さと同一であることは確認されていない。
**1250×2050 を verified pane dimensions へ昇格しない。**

法定 V0=32 と案件 config の V0=34 を混同しない。
Phase 2J で V0=34 を 32 へ変更しない。

## §2 一次資料の可用性（Wave 0 実測 / §17 / AC-J21）

```text
判定: UNAVAILABLE
```

`obsidian-vault` を read-only で調査した結果、
本案件の一次資料（pane寸法 / 圧力の原計算 / floor↔Z mapping）は
このセッションから到達できないことを実測で確認した（詳細は DECISIONS.md D-001）。

したがって Phase 2J は:

```text
software workflow : 実装・検証する
project closure   : BLOCKED_BY_MISSING_EVIDENCE
promotion         : NONE
verifiedCases     : [] のまま
explicit unresolved items : 4件のまま
```

**閉じられないものを閉じたことにしない。**
COMPLETE_VERIFIED を得るために closure を偽装しない（§33）。

## §3 Phase 2F から引き継ぐ Explicit unverified items（4件・維持）

```text
1. ガラス1枚の実見付 W / H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m^2 の元計算根拠
3. 負圧 918 / 1122 N/m^2 の元計算根拠
4. 各階評価高さ Z と preset の exact mapping
```

Phase 2J はこの4件を**閉じない**。
閉じるために何が必要かを、機械可読な契約として表現することが目的である。
