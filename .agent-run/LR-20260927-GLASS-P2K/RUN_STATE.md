# RUN_STATE — LR-20260927-GLASS-P2K

## Wave 0 — instrument inventory（実装なし）

```text
Fresh Gate        : PASS
main              : 7bef30751ebaa2aa0f306f3bd584c4e025be77a1
branch            : claude/phase2k-verification-instrument-independence
baseline npm test : tests 659 / pass 659 / fail 0（実測）
project state     : status BLOCKED / observations 0 /
                    readySlotCount 0 の requiredSlotCount 12 /
                    readyCategoryCount 0 の categoryCount 4 /
                    readyCaseScopeCount 0 の caseScopeCount 8 /
                    promotionCandidate null / verifiedCases [] /
                    1250×2050 sample_default unverified / V0 34 / roughness III
```

成果物: `INSTRUMENT_INVENTORY.md`（instrument 9 件 × 12 項目 + Verification Dependency Graph）

### Wave 0 で測ったこと

QD-J20 を抽象記述から**再現可能な実測**へ落とした。

```text
実験 A  DOT_EQUIVALENTS を 12→11
        production : 構造計算書<U+0387>pdf  reject → ACCEPT
        npm test   : 658/1 —— P2J-S37 が捕らえた
        diff-heads : corpus 607,956 / REGRESSIONS **0**

実験 B  PRIVATE_DOCUMENT_EXTENSION_SOURCE から 5 拡張子
        production : 図面一式.rar / 計算書.7z  reject → ACCEPT
        npm test   : 656/3 —— S24 / S29 / TB19 が捕らえた
        diff-heads : corpus 578,004 / REGRESSIONS **0**
```

結論: **differential だけが盲目**。guard の防御は多重に成立していた。
ただし Run Artifact は differential を「回帰 0」の証拠として引用しており、
このクラスについてはそれを示していない。

### 自分の誤りを 1 件訂正

TB19 の `exts.length > 40` を最初「これが completeness 判定なので
数件削っても通る」と読んだが、**誤り**。
その下に手書き 46 拡張子の forEach があり、そちらが真の oracle だった。
実験 B で実際に TB19 が捕らえた。threshold は sanity guard。

## Wave 1 — evidence-admissibility model + verification manifest

```text
Resume Gate       : PASS（HEAD d22d12f4 = 期待値 / tree clean /
                    packet digest aa68c9c5… 一致 / 659 pass）
§3 scope          : A–E 全部実装
npm test          : tests 688 / pass 688 / fail 0（+29）
mutation          : KILLED 42 / SURVIVED 0 / EQUIVALENT 0 /
                    PATCH-MISS 0 / HARNESS ERROR 0（of 42）
CLI 決定性       : 3 instrument とも 2 回連続で byte-identical /
                    stdout は純 JSON / stderr 0 B / exit 0
```

### 新規成果物

```text
tools/verification/admissibility.mjs        schema の所有者。git/fs/exec なし
tools/verification/verification-spec.json   instrument 11 件の宣言的 spec
tools/verification/manifest.mjs             spec 検証 + instrumentDigest + measured
tools/verification/project-state-probe.mjs  P2K-F04。保護値を本物の API から導出
tools/verification/verifier-package.mjs     P2K-F05。verdict を一切含まない
tools/verification/README.md                fresh verifier の入口
tests/verification-admissibility.test.js    P2K-A01..A07
tests/project-state-probe.test.js           P2K-P01..P07
tests/verification-manifest.test.js         P2K-M01..M08
tests/verifier-package.test.js              P2K-V01..V07
tools/guard-diff/mutants.mjs                K1-01..K1-12 追加（30 → 42）
```

### この Wave の中心にある判断

**evidence class と admissibility を 2 軸に分けた**（D-003）。

```text
class         : 何を見ているか   regression / independent / observational
admissibility : 何の根拠に使ってよいか
                ADMISSIBLE / DIAGNOSTIC_ONLY / INADMISSIBLE / UNVERIFIED
outcome       : この回の結果        PASS / FAIL / ERROR / UNVERIFIED
```

1 軸に潰すと Phase 2J の誤りを繰り返す。
differential はチェックとしては通る（outcome PASS）が、
自分の corpus を被検体から導出するので回帰の根拠にはならない（INADMISSIBLE）。
この 2 つは同时に真である。

### §40 の Quality Debt 状態

```text
P2K-F01  確認済み / 隔離済み / INADMISSIBLE（D-004）
P2K-F04  閉じた
P2K-F05  閉じた
P2K-F07  部分的に閉じた（schema はできた、独立 corpus digest は Wave 3）
P2K-F08  新規・本 Wave で修正済み。他箇所の調査は Wave 5
```

### Human Gate に上げるべき判断 1 件

`mutation → DIAGNOSTIC_ONLY` は**自分の判断**であって測定結果ではない。

```text
理由: KILLED は npm test（ADMISSIBLE）が決めるのでこれは強い。
      しかし SURVIVED / EQUIVALENT の分岐は
      隔離した corpus の probe が決めるので、そこは弱い。
      弱い方に合わせて DIAGNOSTIC_ONLY にした（過小申告側）。
      分割して KILLED を ADMISSIBLE にするのも筋が通る——Human Gate の判断。
```

## Next action

Wave 2: publication-lint discovery independence（QD-J23）。
flat 契約なのか recursive 契約なのかを**測定で**決める。
recursive とするなら、実装と test は別の walker を使い、
入れ子の合成 fixture で押さえる。

## Stop conditions status

```text
Fresh Gate            : PASS
Hard Gate failure     : なし（P2K-F01 は §24 の字面に当たるが
                        §1 の修理対象そのもの。下記 DECISIONS D-001 参照）
BLOCKED transition    : 発生していない
no_progress_waves     : 0 / 2（Wave 1 は進捗あり）
same_hypothesis_retry : 0 / 2
repair_strategies     : 0 / 3
```

## Resume instructions

```text
0. 現在位置: Wave 1 完了。次は Wave 2（QD-J23）
1. RUN_MANIFEST.md から binding を確認
2. TASK_PACKET_SNAPSHOT.md を再 hash し
   aa68c9c5c820419c1f4413bbb7864a2d9cf49bc7b0b18c69645174cab0c6aa96
   と一致することを確認（不一致なら BLOCKED）
3. INSTRUMENT_INVENTORY.md を読む（Wave 0 の全成果）
4. npm test で smoke check（**688** pass を期待）
4b. tools/verification/README.md を読む（Wave 1 の入口）
5. Next action から再開
```
