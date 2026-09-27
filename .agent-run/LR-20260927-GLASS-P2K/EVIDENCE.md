# EVIDENCE — LR-20260927-GLASS-P2K

すべての fixture は合成である。実在の file ID / URL / 案件名は使っていない。

## §1 — Fresh Gate 実測値

```text
main exact SHA    : 7bef30751ebaa2aa0f306f3bd584c4e025be77a1   期待値と一致
tree              : clean
PR #11            : MERGED（2026-09-27T08:37:06Z）
baseline npm test : tests 659 / pass 659 / fail 0
```

### Phase 2J 凍結 head の確認方法（ancestry ではなく内容）

`e273ef0` は main の ancestor ではない——PR #11 が squash merge されたため。
よって内容で確かめた。

```text
f5b4782 tree = 7bef307 tree = 387d59c5b8a416d9d6b97293bba00d99bfa835c2
git diff f5b4782 origin/main : 空
凍結対象 6 ファイルの blob : すべて identical
```

## §2 — 実験 A: 導出元定数を縮むと differential が盲目になる

### 再現手順

```text
git clone <repo> <scratch>
cd <scratch> && git checkout 7bef307
# project-config/evidence.js の DOT_EQUIVALENTS から \u0387 を 1 つ削る
node -e '...assertPublicSafeEvidenceText("構造計算書"+"\u0387"+"pdf")...'
npm test
node tools/guard-diff/diff-heads.mjs HEAD
```

注: heredoc に `\uXXXX` を直接書くと本環境では実文字に折り畳まれる。
anchor は `chr(92)` から組み立てること。（Phase 2J でも同じ罪にはまった）

### 測定値

```text
DOT_EQUIVALENTS        : 12 → 11
構造計算書<U+0387>pdf   : reject → **ACCEPT**
npm test               : 658 pass / 1 fail  —— not ok 68 P2J-S37
diff-heads             : corpus 607,956 / REGRESSIONS **0** / tightened 0
corpus 内の U+0387     : **0 件**
corpus の DOTS 軸      : 17 → 16 メンバ
```

## §3 — 実験 B: 拡張子定数でも同じ

```text
削ったのは |rar|7z|lzh|tar|gz
図面一式.rar  : reject → **ACCEPT**
計算書.7z    : reject → **ACCEPT**
計算書.pdf   : reject（維持）
npm test    : 656 pass / 3 fail —— P2J-S24 / P2J-S29 / P2J-TB19
diff-heads  : corpus 578,004（643,284 から 65,280 減）/ REGRESSIONS **0**
```

## §4 — 自己訂正

TB19 の `assert.equal(exts.length > 40, true)` を最初「completeness 判定なので
5 件削っても 41 > 40 で通る」と読んだ。**誤り**。
その直下に手書き 46 拡張子の forEach があり、それが真の oracle だった。
実験 B で TB19 は実際に捕らえている。threshold は sanity guard にすぎない。

この種の誤読を測定なしで書かないことが §17 の趣旨である。

## §5 — 未変更の確認

```text
Wave 0 で repo の runtime / tests / tools を 1 行も変えていない。
実験はすべて scratchpad の clone 上で行った。
追加したのは .agent-run/LR-20260927-GLASS-P2K/ の新規ファイルのみ。
```

## §6 — Wave 1 の実測値

### Resume Gate

```text
HEAD              : d22d12f4f694d63977ab982111b0b274dfa35520（期待値と一致）
remote            : 同じ SHA（git ls-remote）
tree              : clean
Task Packet digest: aa68c9c5c820419c1f4413bbb7864a2d9cf49bc7b0b18c69645174cab0c6aa96（一致）
npm test          : tests 659 / pass 659 / fail 0
```

### 新規 instrument の CLI 契約（§18 / §31 実測）

```text
                        exit  決定性           stdout    stderr
project-state-probe     0/0   byte-identical     797 B     0 B
manifest                0/0   byte-identical  20,547 B     0 B
verifier-package        0/0   byte-identical  18,031 B     0 B
```

3 つとも stdout は純粋な JSON として parse できる（banner なし、診断は stderr）。
リポジトリルートは自分の位置から導出するので、別の cwd からでも動く。

### project-state probe の出力（実測）

```text
project.closureStatus      BLOCKED
project.observations       0
project.readySlotCount     0   / requiredSlotCount     12
project.readyCategoryCount 0   / categoryCount          4
project.readyCaseScopeCount 0  / caseScopeCount         8
project.hasPromotionCandidate false
project.verifiedCaseCount  0
preset.dimensions          1250 × 2050 / sample_default / unverified
preset.wind                V0 34 / roughness III
protectedCalculations      fl6_1250x2050 1756.09756097561
                           fl6_1500x2050 1463.4146341463415
                           manualDesignPressure 1400
                           er 0.8516557589672942
                           qBar 503.08024004410464
```

すべて Human Gate §15 の供給値と bit 等価。
式は一つも転記していない——`calcP_single` / `getK1_FL` / `calcEr` /
`calcMeanVelocityPressure` / `buildManualDesignInput` を呼んでいることを P2K-P04 が検査する。
roughness パラメータと V0 は config から読むので、どちらが変わっても
保護値に現れる（隠れない）。

### test

```text
npm test : tests 688 / pass 688 / fail 0（659 から +29）
  verification-admissibility  7
  project-state-probe          7
  verification-manifest        8
  verifier-package             7
```

### 自分の欠陥 2 件を Wave 内で検出し修理

**(1) 審査器の設計ミスを自分の test が見つけた**

初版の `assertVerificationEvidenceRecord` は OUTCOMES 全員を
admissibility 位置で拒否していた。`UNVERIFIED` は §6 で admissibility として、
§29 で outcome として、**両方に列挙されている**ので、正当な値を拒否していた。
→ `RESULT_ONLY_STATES = ['PASS','FAIL','ERROR']` を分けて修正。

**(2) K1-08 が生き残った——test 側の欠陥**

```text
変異   : 空リスト guard を if (false) へ
初回   : SURVIVED（どの test も落ちない）
理由   : 本 branch では git が 8 件返すので guard はそもそも発火しない。
         かつ自分の test は「解決できない ref で throw する」を
         緩い regex で見ていたので、**別の理由の throw** で満足していた
修正   : 2 つの失敗モードをそれぞれの message で分けて押さえた。
         git が**成功して空を返す**場合（HEAD...HEAD）が guard に到達する経路
再試行 : KILLED by P2K-V02
```

これは「とにかく throw したこと」を確かめる test が
何も固定していないという実例であり、本Campaign の反復主題と同型。

## §7 — Wave 2 の実測値（QD-J23）

### 実験：discovery はどこまで届くか

```text
node tools/verification/experiments/lint-discovery-depth.mjs
```

project-config の 1 階下に合成 config module を 1 つ植える。
公開面値 3 件、うち 1 件は **hard 規則**を踏む。

```text
                        flat（従来）      recursive（修正後）
discovery が到達      false             true
inventory               12（+0）           15（+3）
advisory を報告        0                 1
hard 違反を報告       0                 1
出荷 test               7/7 pass exit 0   6/7 pass exit 1
```

flat 側が QD-J23 の実害である。
両列とも同じ script の出力で、flat 列は mutant K2-01 を当てて再現できる。
実験はどの経路でも probe を必ず削除する（P2K-L07 / K2-08 が押さえる）。

### test

```text
npm test : tests 695 / pass 695 / fail 0（688 から +7）
  lint-discovery-independence  P2K-L01..L07
```

### mutation（50 operator）

```text
KILLED 49 / SURVIVED 1 / EQUIVALENT 0 / PATCH-MISS 0 / HARNESS ERROR 0

K2-01 非再帰へ戻す（QD-J23 そのもの）  KILLED  L01 L02 L03 L05 L07
K2-02 nested root 名を basename へ          KILLED  L02 L03
K2-03 symlink を辿る                       SURVIVED → 下記で EQUIVALENT と判定
K2-04 読み込み失敗を飲み込む             KILLED  L06
K2-05 順序を固定しない                   KILLED  L01 L05
K2-06 拡張子 filter を外す               KILLED  L01 L02 L03
K2-07 最初の 1 件で打ち切る               KILLED  §18 FP-01 L01..L05 L07
K2-08 実験が木を復元しなくなる           KILLED  L07
```

### K2-03 を EQUIVALENT と判定した根拠（推定ではなく測定）

```text
readdirSync(withFileTypes) の Dirent 実測:
  dirlink    isSymbolicLink true  / isDirectory false / isFile false
  linked.js  isSymbolicLink true  / isDirectory false / isFile false
  inner      isSymbolicLink false / isDirectory true  / isFile false
  real.js    isSymbolicLink false / isDirectory false / isFile true

つまり isDirectory() / isFile() の 2 つがすでに symlink を除外している。

出力比較（file symlink / directory symlink / 循環 symlink を含む木）:
  guard あり : ["inner/deep.js","real.js"]
  K2-03 適用 : ["inner/deep.js","real.js"]   —— byte-identical
```

guard は残す。振る舞いが Dirent の副作用に依存している状態より、
明示されている方がよい。ただし comment は「これが循環を防いでいる」と
誤って言っていたので書き直した。

**この判定の分解能**: このファイルシステムと Node 22 での測定である。
DT_UNKNOWN を返すファイルシステムは試していない。

### 計器の限界を 1 つ明示しておく

mutate.mjs の SURVIVED / EQUIVALENT の分岐は
**guard corpus の probe** で決めているので、
project-config/evidence.js 以外の mutant には適用できない。
K1-xx / K2-xx の SURVIVED は実際には
「SURVIVED か EQUIVALENT か未判定」である。

だから Wave 1 で mutation を DIAGNOSTIC_ONLY に置いたのは正しかった——
KILLED は npm test が決めるので強いが、分岐は弱い。
K2-03 はその弱い側を **手で別途測定して** 埋めた例である。

### 自分の欠陥 2 件を Wave 内で検出し修理

**(1) P2K-L03 が first-match で何も見ていなかった**

```text
初版 : results.find(r => r.path.startsWith('sub/beta.'))
実態 : 最初に当たるのは警告の無い caseId
修正 : 経路を完全一致で指定し、rule 名を deepEqual
```

P2K-F03（diff-heads が first match しか記録しない）と同じ形。

**(2) 実験 script 自体が呼ばれ方で逆の読みを返していた**（P2K-F09 / D-007）

```text
単体      : suite exit 1 / fail 1
test 経由 : suite exit 0 / summary 全部 null
原因      : NODE_TEST_CONTEXT の漏れ
修正      : env sanitize + parse 不能・矛盾時は throw
```

初版は null の summary を「気づかなかった」として報告していた。
**白紙の計器を 0 と読む**のと同じ誤りである。

