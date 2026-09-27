# DECISIONS — LR-20260927-GLASS-P2K

## D-000 — digest の定義

```text
TASK_PACKET_SNAPSHOT.md の sha256（UTF-8 バイト列そのまま、末尾の改行を含む）:
  aa68c9c5c820419c1f4413bbb7864a2d9cf49bc7b0b18c69645174cab0c6aa96
再現: sha256sum .agent-run/LR-20260927-GLASS-P2K/TASK_PACKET_SNAPSHOT.md
```

## D-001 — P2K-F01 を Hard Gate として扱わない（理由を明記）

§24 は「verification tool silently skips inputs」を BLOCK 条件に挙げている。
P2K-F01 はその字面に当たる——corpus が U+0387 を含む入力を 1 件も生成せず、
diff-heads はそれを REGRESSIONS 0 と報告した。

それでも BLOCK しない理由:

```text
§1 が本 Phase の対象として QD-J20（計器が実装と同じ仮定を共有）を
名指している。P2K-F01 はその具体例であり、
**修理するために送られた問題を測定で確認した**ということ。
ここで止まると Phase 2K 自体が成立しない。
```

この判断は実装セッションのものである。
Human Gate が「いや BLOCK だ」と考えるならそう言ってほしい。
隠さずに書くためにここに置く。

重要な緩和事情（これも実測）:

```text
実験 A も B も npm test が捕らえた。
つまり guard の防御は多重に成立しており、
盲目なのは differential という 1 つの計器である。
```

## D-002 — Phase 2J の結論は前提として固定する

§2 / §20。hard 9 / advisory 3 / Human Review 要件 / lint の警告動作 /
CASE_ID の構造的独立性 / Evidence-first / Promotion Gate / Closure / Candidate semantics
はすべて観察対象であって再設計対象ではない。
Phase 2J の artifact と history も変更しない。
