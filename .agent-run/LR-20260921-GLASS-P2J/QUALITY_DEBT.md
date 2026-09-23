# Quality Debt — LR-20260921-GLASS-P2J

## QD-J01 — `assertOrdinaryObject` がリポジトリ内に3実装ある（Wave 1実測）

```text
project-config/evidence.js : Wave 1で追加（Evidence契約の正）
project-profile.js:120     : Phase 2H F6 で追加
review-package.js:189      : Phase 2I で追加
```

**3つは同一ではない**（Wave 6の独立検証 A1〜A3 のうち A3 の指摘で判明）。
Wave 1 の時点では同一だったが、Wave 5 で `evidence.js` 側にだけ
2つのガードを足したため、現在は次のように**差がある**:

```text
evidence.js      : null/typeof/Array.isArray ガード
                   prototype 判定
                   own "__proto__" ガード        ← Wave 5で追加
project-profile.js: prototype 判定のみ
review-package.js : prototype 判定のみ
```

判断が割れうる箇所（null prototype を通すか）については3つとも
同じ決定をしている（`proto !== Object.prototype && proto !== null`）。
これは実測で確認済みである（D-004）。

**現時点で脆弱性は生じていない**ことも実測で確認した:
`project-profile.js` は生JSONの段階で `FORBIDDEN_RAW_KEYS` により
own `"__proto__"` を拒否しており、`review-package.js` は deserializer を
そもそも公開していない（`buildReviewPackage` のみ）。
したがって不足しているガードに到達する経路が無い。

debt の内容は2つある:
1. 3実装が**すでに divergent** であり、片方だけ見て他方を推測できない
2. 将来ひとつだけ変更されて判断が割れる可能性
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
**統合する場合は `evidence.js` 側（ガードが最も多い）を正とすること。**
「同一だから、どれを残してもよい」という読み方は誤りである。
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
