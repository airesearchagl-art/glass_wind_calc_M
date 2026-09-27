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

## Wave 2 — publication-lint discovery independence（QD-J23）

```text
npm test   : tests 695 / pass 695 / fail 0（+7）
mutation   : KILLED 49 / SURVIVED 1 / EQUIVALENT 0 /
             PATCH-MISS 0 / HARNESS ERROR 0（of 50，K2-01..K2-08 追加）
             SURVIVED 1 = K2-03。別途測定で EQUIVALENT と判定（§7）
QD-J23     : **閉じた**（D-006）
```

### 決め方

推諡ではなく before/after の実測で決めた。
flat だと、公開してはいけない値を 1 階下に置くだけで
lint は 0 件と報告し、出荷 test は全部緑になる。

### 独立性をどう作ったか

```text
実装     : readdirSync(withFileTypes) の明示 stack 下降
oracle 1 : 手書き literal（committed fixture 木）
oracle 2 : git ls-files（git の index。node:fs と無関係）
oracle 3 : test がその場で作る木
```

FP-01 test の flat readdirSync を git ls-files へ差し替えた。
**実装の写しは oracle ではない**というのが本 Wave の規則。

### 新しく見つかったもの

```text
P2K-F09  計器の読みが NODE_TEST_CONTEXT に依存していた。
         本 Wave の実験では修正済み。
         mutate.mjs / diff-heads.mjs は未調査 → Wave 3
K2-03    EQUIVALENT。guard は残すが comment を訂正
```

## Wave 3 — mutation + differential tool reproducibility

```text
npm test   : tests 713 / pass 713 / fail 0（+18）
mutation   : KILLED 65 / SURVIVED 1 / EQUIVALENT 0 /
             PATCH-MISS 0 / HARNESS ERROR 0（of 66，K3-01..K3-16 追加）
             SURVIVED 1 = K2-03（Wave 2 で EQUIVALENT と判定済み）
corpus     : 643,419 / sha256:ac68342e…（大きさと digest を literal で固定）
閉じた     : P2K-F01 / F02 / F03 / F07 / F09
```

### 中心の結果

```text
                              導出 corpus   独立 corpus
dot equivalent 1 件削除    0            26,496  exit 1
extension atom 4 件削除    0            32,000  exit 1
```

corpus が被検体から目盛りを受け取るのをやめた。
project-config への参照が一行も無いことを P2K-D01 が source で錠をかける——
欠陥は「値が違う」でなく「依存の向きが逆」だったから。

### 導入してすぐに見つかったもの 2 件

```text
coverage 検査 : `control-character` が NEVER EXERCISED。
               9 hard rule の 1 つに入力が無く、
               過去の「0 regressions」はその rule について無内容
K1-01 retarget: どの instrument の admissibility も test で固定されていなかった。
               mutation を ADMISSIBLE に書き換えても全 suite が通ってしまった
```

### Human Gate に上げる判断 1 件

**guard-diff を INADMISSIBLE から ADMISSIBLE へ戻した**（D-008）。
根拠は実測だが判定は自分のものである。
spec の reason に実測値が入っており P2K-M02 が検査するので、
戻すなら spec 1 行と M02 の 1 行。

## Wave 4 — browser verification durability

```text
npm test   : tests 720 / pass 720 / fail 0（+7）
mutation   : KILLED 73 / SURVIVED 1 / EQUIVALENT 0 /
             PATCH-MISS 0 / HARNESS ERROR 0（of 74，K4-01..K4-08 追加）
browser    : **e57e47a で 34 pass / 0 fail  PASS**（tree clean、2 回再現）
閉じた     : P2K-F06
```

### 本題は path ではなかった

```text
PASS 0 / FAIL 1 / UNVERIFIED 3 / ERROR 4
0 件測って 0 失敗は ERROR（PASS ではない）
```

§18 の「UNVERIFIED でよい」は、UNVERIFIED を名乗れる形が
存在してはじめて意味を持つ。

### spec の browser-w4 は UNVERIFIED のまま

測ったのに UNVERIFIED なのは、UNVERIFIED が
**target についての記述**だからである——
この repo は任意の head についての browser 測定を持たない。
e57e47a の測定は EVIDENCE §9 に sha 付きで置いてある。

## Wave 5 — fresh independent verifier trial

別実行文脈の検証者 2 件。この会話の結論は一切渡していない。
両方とも repo を変更せずに戻した。

```text
再現できた : 再認定の数字、Wave 0 の盲点、corpus digest、
           mutation 73/74、browser 62 checks、sabotage control 19
指摘された : P2K-F06 の CLOSED が偽（両者が独立に）
           再認定の数字が別実験のもの
           lint の value oracle が実装の写し
           README が自己矛盾し verifier に誤った報告を指示
           § 参照がツリーの外
           independent-review が実体無しで ADMISSIBLE
```

## Wave 6 — 指摘の修理

```text
npm test   : tests 729 / pass 729 / fail 0（+9）
mutation   : KILLED 84 / SURVIVED 1 / EQUIVALENT 0 /
             PATCH-MISS 0 / HARNESS ERROR 0（of 85，K5-01..K5-11 追加）
browser    : 5 harness 全部 PASS、不在時は全部 UNVERIFIED exit 3
閉じた     : P2K-F06（今度は本当に）/ F11 / F12 / F13 / QD-J24
有界化     : P2K-F14（§ 参照）
未着手     : P2K-F08（18 箇所の triage）/ F10（修理不可）
```

### 最も重要な 1 行

**Wave 4 で自分が書いた CLOSED が偽だった**。5 件中 1 件しか直していなかった。
それを捕らえるべき test の集団が手書きだった——
Wave 2 で自分が直した anti-pattern を Wave 4 で戻していた。

## Next action

Wave 7: README / Run Artifact convergence / Draft PR。
**そこで止まる**——Ready 化・merge・Production は含まない。

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
0. 現在位置: Wave 6 完了。次は Wave 7
1. RUN_MANIFEST.md から binding を確認
2. TASK_PACKET_SNAPSHOT.md を再 hash し
   aa68c9c5c820419c1f4413bbb7864a2d9cf49bc7b0b18c69645174cab0c6aa96
   と一致することを確認（不一致なら BLOCKED）
3. INSTRUMENT_INVENTORY.md を読む（Wave 0 の全成果）
4. npm test で smoke check（**729** pass を期待）
4b. tools/verification/README.md を読む（Wave 1 の入口）
5. Next action から再開
```
