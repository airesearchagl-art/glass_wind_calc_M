

## D-045 — 左文脈と「正規化の種類」（12回目検証）

独立検証12 の判定は **FAIL**。二つのクラスが生きていた。

### F12-01 — 左隣接で 3 規則が素通りする

```text
図面は/home/user/案件/最新版 に置いた        受理   ← 隣接するだけで発火しない
一次資料_https://internal.example.jp/docs/plan   受理
資料_www.example.com                        受理
/home/user/案件/最新版                        拒否   ← positive control
```

`url-scheme` と `www` は `\b`、`unix-home-or-absolute-path` は `(^|\s)` を持っていた。
**日本語の散文は URL や path の前に空白を置かない**ので、
unix path 規則は実質、test fixture の外では一度も発火していなかった。

最も痛いのは前回の看板修正自体である:

```text
資料＿ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ   拒否   ← narrow fold を戻した理由の証人
資料_www.example.com                 受理   ← それが正規化された先の形
```

難解な形を拒否し、それが畳まってなる形を通していた。
アンカーを外した（fail closed。`showwww.` 等の過剰拒否は受け入れる）。

**test も corpus もこの軸を射影していた**: URL/path の証人はすべて
先頭 / 空白の後 / 全角の後に置かれ、単語文字を直前に置いた形が 1 つも無かった。
commit した `tools/guard-diff/corpus.mjs` も同じ盲点を 1 行で再現していた。
→ P2J-S38（17 前置き × 7 payload）と corpus の LEFT_CONTEXTS を追加。

### F12-06 — 射影レンズでは見えない欠陥

検証11 の「集合の全員を押さえろ」は正しく適用した——S34 が名前で、S37 が全員を。
それでも guard は破られていた（ZWSP / SOFT HYPHEN / BOM を 1 文字挿入するだけで
www / url-scheme / email-like / private-document-filename がすべて素通り、
数学用英字の astral lookalike も素通り）。

理由はメンバシップではなく**種類**だった——
`TEXT_NORMALIZERS` の全員が**置換写像**で、文字を**挿入**する回避に届く
**削除**写像が集合に無かった。
メンバシップの test は「集合が正しい種類か」を検査できない。

対応: 種類を 3 つにした。

```text
置換写像   : foldFullwidthFilenameChars / foldFullwidthAscii / foldDotEquivalents
削除       : stripFormatChars（Cf 類 24 文字）
標準正規化 : foldCompatibility（NFKC。astral lookalike を ASCII へ）
```

P2J-S39 は種類を名前で固定し、削除対象 24 文字を全数回す。

### F12-04 — dot 集合の基準を言い直した

旧基準「拡張子区切りとして現れるか」は 12 メンバ中 9 を説明できず、
字形がほぼ同じ U+0387 を入れ U+00B7 を除くという不整合を残していた。
検証11 の指摘を「直した」と書いて、実際には移しただけだった。

新基準は形式的に適用できる: **full stop は入れる / 中黒・高さ付きドットは除く**。

```text
入れる: 。 ｡ ︒ ․ ﹒ ۔ ܁ ꓸ   （全部 full stop）
除く: ・ ･ · · ‧ ⸳ ˙      （全部中黒・高さ付きドット）
```

P2J-S37 は除外側も全部固定する。

### mutation

```text
R12-01/02/03 3 規則の左文脈アンカーを復元            KILLED (S38)
R12-04/05    削除 / 標準正規化を集合から外す           KILLED (S39)
R12-06/07    stripFormatChars / foldCompatibility を no-op へ  KILLED (S39)
R12-08/09    狭い畳みの範囲・端点                      KILLED (S40)
```

9/9。

### 守っているもの

Evidence protected state は未変更: `verifiedCases: []` / promotion NONE /
1250×2050 `sample_default` `unverified` / V0=34 / roughness III。

