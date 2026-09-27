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

## Wave 7 — README / Run Artifact convergence / Draft PR

```text
README        : v1.12.0-phase2k 行を追加。残した限界も同じ行に書いてある
root README   : tools/verification への入口節を追加（検証者の指摘 D-6）
Draft PR      : ここで止まる
```

## 最終状態

```text
branch : claude/phase2k-verification-instrument-independence
base   : main @ 7bef30751ebaa2aa0f306f3bd584c4e025be77a1
npm test         : 729 / 729 / 0（baseline 659 から +70）
mutation         : 85 operator / KILLED 84 / SURVIVED 1（K2-03 = EQUIVALENT 判定済み）
browser          : 5 harness 合計 104 項目、bypass 0、exact head で実測済み
publication lint : inspected 12 / advisory 0 / hard 0
differential     : corpus 643,419 / digest ac68342e… / REGRESSIONS 0 /
                   rule coverage gap 0 / advisory gap 0 / unexpected errors 0
```

## Evidence は一切動かしていない

```text
closureStatus BLOCKED / observations 0 / readySlot 0 of 12 /
category 0 of 4 / caseScope 0 of 8 / promotionCandidate なし /
verifiedCases [] / 1250×2050 sample_default unverified /
V0 34 / roughness III
```

Wave 0 の実測値と同一。probe の出力と browser の読み戻しの両方で確認。

## 残してあるもの（閉じたと言わない）

```text
P2K-F08  緩い assert.throws 18 箇所。file:line は検証報告にあるが未 triage
P2K-F10  corpus は有限の列挙。開集合の形には届かない——修理不可
P2K-F14  § 参照の packet は未 commit。有界化しただけ
mutation の EQUIVALENT 判定は guard corpus の分解能に縛られる
mutation → DIAGNOSTIC_ONLY は自分の判断（P2K-M09 が literal で固定）
guard-diff の ADMISSIBLE への再認定も自分の判断（戻すのは 2 行）
```

## Human Gate に上げる判断 2 件

```text
1. mutation を DIAGNOSTIC_ONLY に置いていること。
   KILLED は npm test が決めるので分割して強くする道もある
2. guard-diff を INADMISSIBLE から ADMISSIBLE へ戻したこと。
   根拠は実測だが分類は判断である
```

## Human Gate 最終分類調整 / P2K-F08 有界 triage

```text
Fresh Gate : PASS（HEAD 603a376 / remote 同じ / tree clean /
             PR #12 OPEN draft merged=false / base 7bef307）
npm test   : 730 / 730 / 0
mutation   : 89 operator / KILLED 88 / SURVIVED 1 / PATCH-MISS 0 / HARNESS ERROR 0
browser    : 未実行（§16。harness / UI / runtime を変えていない）
```

### 分類

```text
guard-diff                     regression / ADMISSIBLE（committed corpus に限る）
mutation-kill                  regression / ADMISSIBLE
mutation-equivalence-analysis  regression / DIAGNOSTIC_ONLY
```

### P2K-F08

```text
49 件全件 disposition。BENIGN 43 / AMBIGUOUS 4 / REQUIRED_FIX 2。untriaged 0
REQUIRED_FIX 2 件は修理し K7-01 / K7-02 で固定。いずれも test の欠陥
全件表: F08_TRIAGE.md
```

依頼は「18 件」だったが、どの数え方でも 18 にならなかった。
推測せず同じ基準を完全適用した 49 件を triage した（D-017）。

### runtime は一切変えていない（§14）

```text
project-config/**  変更 0
計算・ClosureヾEvidence 規則・Promotion GateヾUI  変更 0
project Evidence state  変更 0（§15 の値と完全一致）
```

## Next action

**Draft PR で止まる。**
Ready 化・merge・Production はこの Campaign の Next Action に含まない——Human Gate 専管。
