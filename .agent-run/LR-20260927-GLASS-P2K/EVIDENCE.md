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
