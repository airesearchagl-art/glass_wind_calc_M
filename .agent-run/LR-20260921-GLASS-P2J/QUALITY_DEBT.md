# Quality Debt — LR-20260921-GLASS-P2J

## QD-J01 — `assertOrdinaryObject` がリポジトリ内に3実装ある（Wave 1実測）

```text
project-config/evidence.js : Wave 1で追加（Evidence契約の正）
project-profile.js:120     : Phase 2H F6 で追加
review-package.js:189      : Phase 2I で追加
```

3つはロジックが同一で、null prototype の扱いという**判断が割れうる箇所でも
同じ決定**をしていることを実測で確認した（D-004）。したがって現時点で
挙動の不整合は無い。

debt の内容は「将来ひとつだけ変更されて判断が割れる」可能性である。
統合しなかった理由:

- `project-profile.js` / `review-package.js` は現在 `evidence.js` に依存していない。
  汎用のobject形状述語のために、UI/report層から Evidence契約層への依存辺を
  足すのは層として逆であり、Wave 1 の mandate（§2 inventory と generic Evidence
  hardening）の外でもある。
- `tests/review-package.test.js` は review-package 側の定義数と呼び出し数を
  pinしている。ここを動かすのは Wave 1 の範囲を超える churn になる。

Hard Gate には該当しない。Hard Gate の "prototype boundary" は
**境界が破れていること**を指すが、境界自体は9経路すべてで閉じていることを
実測済みであり、3実装それぞれが独立にテストで守られている。

対処案（将来phase）: 汎用述語を層に依存しない小moduleへ切り出すか、
`evidence.js` の実装を正として他2つがそれを解決する。
どちらも Phase 2J の目的（Evidence closure）とは独立に行える。


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
