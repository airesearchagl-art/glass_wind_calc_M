# TASK_QUEUE — LR-20260927-GLASS-P2K

```text
Wave 0  instrument inventory / shared-assumption graph          DONE
Wave 1  evidence-admissibility model + verification manifest    DONE
Wave 2  publication-lint discovery independence（QD-J23）        DONE
Wave 3  mutation + differential tool reproducibility            DONE
Wave 4  browser verification durability                         DONE
Wave 5  fresh independent verifier trial（committed のみ）       DONE
Wave 6  repair findings / exact-head reverify                   DONE
Wave 7  README / Artifact convergence / Draft PR                NEXT
```

## Wave 0 が生んだ項目

```text
P2K-F01 → Wave 3   diff-heads/corpus が導出元定数の縮小に盲目
P2K-F02 → Wave 3   corpus に positive control が無い
P2K-F03 → Wave 3   diff-heads が first match しか記録しない
P2K-F04 → Wave 1   project-state probe が committed されていない
P2K-F05 → Wave 1/5 §15 verifier package が存在しない
P2K-F06 → Wave 4   Playwright import が環境固定の絶対 path
P2K-F07 → Wave 1/3 入力 corpus digest を記録する仕組みが無い
```

## Wave 1 が生んだ項目

```text
P2K-F08 → Wave 5   「とにかく throw」を見る test の形が他に残っていないか未調査
```

## Wave 2 が生んだ項目

```text
P2K-F09 → Wave 3   mutate.mjs / diff-heads.mjs も NODE_TEST_CONTEXT に
                   依存していないか調べる
P2K-F03 の優先度を上げる（first-match 形が Wave 2 でも再発）
mutate.mjs の EQUIVALENT 判定は guard 以外の file に適用できない
```

## Wave 3 が生んだ項目

```text
P2K-F10 → 修理不可。Wave 7 の README で明記するだけ
corpus digest と大きさは literal で固定したので、
corpus を意図的に変える場合は同じ commit で P2K-D09 を更新する
```

## Wave 6 が生んだ項目（黙って落とさない）

```text
P2K-F08  緩い assert.throws 18 箇所の triage。file:line は検証報告にある
P2K-F14  § 参照は有界化しただけ。packet は依然 committed でない
mutate.mjs の EQUIVALENT 判定の分解能（決着実験は QUALITY_DEBT に記載）
```
