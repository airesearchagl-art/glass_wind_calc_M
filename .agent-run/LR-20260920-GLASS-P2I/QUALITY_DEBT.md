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

## Wave 6（independent verification）終了時点

```text
security / privacy / trust の Quality Debt : なし
verifier の指摘 F1-F6 はすべて本Campaign内で修理済み
```

### 生存 mutant の扱い（書き方を訂正した）

以前ここには「生存2件」と書いていた。各 wave の battery は
**その wave の guard を対象とした範囲で** SURVIVED 0 であり、その範囲では正しい。
しかし全体の生存数として読める書き方になっており、実態より狭かった。

independent verifier が 45 件の corpus で測った結果:

```text
verifier 実測（修理前） : 34 KILLED / 11 survived
  うち 2件  documented（M10 / M15。理由は verifier が再検証して成立）
  うち 2件  equivalent / unreachable（M25 / M35。挙動が1つも変わらない）
  うち 7件  **本物の coverage hole**（F1。値を偽っても全テストが緑だった）

修理後 : F1の7件はすべて KILLED（本セッションで再実行して確認）
```

Quality Debt ではないが、記録として残す防御的事実2件:

```text
M10  detach(cases) は現在 observable な効果を持たない。
     case行が primitive のみで構成されるため（verifier が1000行を列挙して再確認）。
     REVIEW_CASE_KEYS に nested field が入れば load-bearing になる。

M15  export size cap 8 MiB は core側の上限の下では到達しない。
     多バイトラベルでの最大構成でも 1.33 MiB（余裕 約6.0倍）。
     §19 が core-side の上限を要求するため残している。
```

M25 / M35 も equivalent mutant として記録に残す:

```text
M25  projectCaseRow 内の DIAGNOSTIC_NULL_FIELDS 再wipe。
     入口の assertCanonicalDiagnostic が既に同じことを保証しているため、
     消しても挙動が変わらない（入口側を消すと 3件落ちる）。
M35  interpretation を metadata で上書きする経路。
     assertAllowedKeys が metadata の未知fieldを先に拒否するため到達しない。
```

どれも「守るべき不変条件は別の手段で守られている」ことを確認したうえで、
survivor として名前を付け替えずに残している。
