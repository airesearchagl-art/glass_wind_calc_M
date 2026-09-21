# Quality Debt — LR-20260920-GLASS-P2I

```text
none（Wave 0時点）
```

## 規則

Hard Gate（TASK_PACKET_SNAPSHOT.md §44）に該当する事象は Quality Debt 化できない。
発生した場合は `BLOCKED` へ遷移する。

```text
wrong calculation / wrong governing case /
verified・unverified display inversion / Evidence promotion /
raw diagnostic leak / Redacted mode leak / XSS /
active HTML export / report→input trust path /
silent stale report / unbounded detail generation /
network・private upload / Single・Batch regression
```

Phase 2Fから引き継ぐ Explicit unverified items 4件は Quality Debt ではない
（Humanが資料を提供するまで構造的に解消できない外部依存。Phase 2Iのscope外）。

## Wave 5 終了時点

```text
security / privacy / trust の Quality Debt : なし
Wave 5 で見つけた findings はすべて修理済み（RF-P1 / RF-P2 / 継承値の消費）
```

Quality Debt ではないが、記録として残す防御的事実2件:

```text
M10  detach(cases) は現在 observable な効果を持たない。
     case行が primitive のみで構成されるため。
     REVIEW_CASE_KEYS に nested field が入れば load-bearing になる。
     外から見える不変条件（生成後にsourceを変えてもreportは変わらない）は
     test U / V / W / X と deepFreeze で守られている。

M15  export size cap 8 MiB は core側の上限の下では到達しない。
     §19 が core-side の上限を要求するため残している。
     最大構成が上限の半分未満であることを test で固定しており、
     余裕が消えたらその test が落ちる。
```

どちらも「守るべき不変条件は別の手段で守られている」ことを確認したうえで、
survivor として名前を付け替えずに残している。
