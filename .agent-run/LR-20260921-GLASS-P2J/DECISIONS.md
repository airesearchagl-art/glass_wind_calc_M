# Decisions — LR-20260921-GLASS-P2J

## D-000 — digest定義

`TASK_PACKET_SNAPSHOT.md` のファイルbytesに対するSHA-256。
Phase 2D〜2Iと同一。Resume時に再計算して一致を確認する。

```text
aa9ce07dac4767afc0ad9ff4b13663ae8cc2ab1be98e9e44ef80498da3acc446
```

## D-001 — 一次資料の可用性を、推測ではなく実測で決める（§17）

Phase 2J の結論は「資料があるか」で大きく変わる。
そこで Wave 0 の時点で、思い込みではなく実際に探した。

```text
この container に存在する repository:
  glass_wind_calc_M / glass_wind_calc_m / obsidian-vault

obsidian-vault（read-only で調査。§18が許す範囲のみ）:
  ファイル数 479
  01_Projects 配下に glass_wind_calc 系のフォルダ  : 無し
  "glass_wind_calc" / "耐風圧" を含むファイル       : 0件
  1297 / 1525 / 1729 / 2050 を含むファイル          : 0件
  1695 / 918 / 1122 / 1250 の一致                   : すべて git SHA の一部（偶然一致）
  「見付」「評価高さ」を含むファイル                : 0件
  ドメインに触れるファイル 2件を確認したが、
  pane寸法・圧力の出典・floor↔Z mapping はいずれも持っていない
```

**判定: 一次資料は本セッションから到達できない（UNAVAILABLE）。**

したがって §17 のとおり:

- 推測しない
- 架空の Observation を現案件の候補として作らない
- software workflow は作る
- project closure は `BLOCKED_BY_MISSING_EVIDENCE`
- promotion は `NONE`

これは失敗ではなく、正しい Evidence boundary である（§17 の明文）。
Phase 2J の成果物は「昇格」ではなく、
**何が揃えば昇格できるかを機械可読にしたもの**になる。
