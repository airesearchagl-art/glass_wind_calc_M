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

## §8 — Wave 3 の実測値

### 中心の実測：Wave 0 の盲点 2 例を同じ script で再測した

```text
                              導出 corpus（Wave 0）   独立 corpus（Wave 3）
dot equivalent 1 件削除    REGRESSIONS 0          REGRESSIONS 26,496  exit 1
extension atom 4 件削除    REGRESSIONS 0          REGRESSIONS 32,000  exit 1
```

いずれも rule は `private-document-filename`、先頭例は
`構造計算書·pdf` と `構造計算書.rar`。
加えて constant coverage 行が production が失ったものを名指す。

```text
constant coverage : working tree dots corpus-only: 1
constant coverage : working tree ext corpus-only: rar,7z,lzh,gz
```

再現方法は evidence.js にその変更を当てて
`node tools/guard-diff/diff-heads.mjs HEAD`。mutant K3-01 / K3-02 でも同じ。

Wave 0 の実験 B は 5 拡張子だった。本回は atom 4 件である。
**同じ実験ではなく同じクラス**である。

### 導入した瞬間に見つかった実害

```text
rule coverage : base 8 attributed, NEVER EXERCISED: control-character
```

9 ある hard rule のうち 1 つに、corpus は入力を一つも生成していなかった。
その rule についてはこの differential の過去のすべての「0」が無内容だった。
control 文字軸（メンバ 12 + 非メンバ tab/LF/CR）を追加して gap 0。
advisory 3 規則についても同じ検査を入れた——現在 gap 0。

### corpus の同定（P2K-F07）

```text
size   : 643,419
digest : sha256:ac68342ee1eb21aad45e2c7ed57199b0cd27fe28180a3ecfa55952789b97996e
```

アルゴリズム: corpus 順に各入力の UTF-8 バイト + 0x00 を連結して sha256。
順序に敏感（first-match 帰属を決めるので）。
大きさと digest の両方を P2K-D09 が committed literal で固定する。

### P2K-F09：mutation harness の読みが環境に依存していた

KILLED と報告される mutant 1 件を当てた状態での実測。

```text
                          threw  exit  TAP  not ok  # fail  mutate.mjs の判定
clean env                 yes    1     yes  5       5       KILLED
NODE_TEST_CONTEXT 漏れ    no     0     no   0       null    SURVIVED/EQUIVALENT
```

この変数がある環境では **全 operator が SURVIVED**になる。
旧 guard は catch 内にあったので throw しないこの経路に届かない。
diff-heads の子は git のみなので影響しない（確認済み）。

### test

```text
npm test : tests 713 / pass 713 / fail 0（695 から +18）
  suite-verdict             P2K-H01..H07
  guard-diff-differential   P2K-D01..D10
  verification-manifest     P2K-M09 追加
```

### mutation（66 operator）

```text
KILLED 65 / SURVIVED 1 / EQUIVALENT 0 / PATCH-MISS 0 / HARNESS ERROR 0

SURVIVED 1 = K2-03（Wave 2 で別途測定し EQUIVALENT と判定済み）
K3-01..K3-16 は 16/16 KILLED
```

### mutation が自分の盲点を 1 件教えた（PATCH-MISS 経由）

K1-01（非 admissible な instrument を黙って再認定する）の anchor は
guard-diff の `INADMISSIBLE` だった。Wave 3 でそれが正当に消えたので
mutation へ retarget したところ——

```text
PATCH-MISS → 調べる → **どの instrument の admissibility も
test で固定されていなかった**。語彙の所属検査だけ。
つまり mutation を ADMISSIBLE に書き換えても 713 test 全部が通る。
```

これは自分が「判断であって測定でない」と Wave 1 で明記したまさにその分類である。
→ P2K-M09 が 12 instrument 全部の class × admissibility を literal で deepEqual。

### K2-03 と K1-01 の対比を記録しておく

```text
K2-03  SURVIVED  → 別途測定したら EQUIVALENT だった（実害なし）
K1-01  PATCH-MISS → 調べたら本物の test 欠陥だった（実害あり、修正済み）
```

どちらも「緑以外の結果を調べる」だけで出てきた。
PATCH-MISS を harness の雑音として流さないことに意味がある。

## §9 — Wave 4 の実測値

### test / mutation

```text
npm test : tests 720 / pass 720 / fail 0（713 から +7）
mutation : KILLED 73 / SURVIVED 1 / EQUIVALENT 0 /
           PATCH-MISS 0 / HARNESS ERROR 0（of 74）
           K4-01..K4-08 は 8/8 KILLED
           SURVIVED 1 = K2-03（Wave 2 で EQUIVALENT と判定済み）
```

### playwright の解決（実測）

```text
候補      : bare-specifier → npm-root-g
（PLAYWRIGHT_MODULE 未設定。npm root -g と interpreter 相対が
  一致するので重複を 1 つ落としている）
解決      : npm-root-g
            → /opt/node22/lib/node_modules/playwright/index.mjs
```

偶然だが旧版の絶対 path と同じ場所である。だから動いていた。
違うのは **名前を埋めずに聞いている**ことだけである。

### 本Campaign ではじめての exact head の browser 測定

```text
測定対象 head : e57e47a568598d3f417e3cfeeb2911b1ae3f0840
tree          : clean（git status 空。測定前に確認）
命令          : node tools/browser-checks/browser-w4.mjs
結果          : 34 pass / 0 fail  outcome PASS  exit 0
再現          : 2 回連続で同じ（outcome / checksRun / failures）
engine        : 実 Chromium（playwrightSource npm-root-g）
```

含まれる確認の主なもの：

```text
B6  closure 状態     未充足
B7  確認項目         0 / 12
B8  closure カテゴリ  0 / 4
B9  想定 case scope   0 / 8
B10 Promotion Candidate なし / B10b Observation 0
B19 Verified 語彙が画面に出ていない
B20 closure 領域に入力要素 0 / B21 昇格操作なし
B26 pageErrors 0 / B27 consoleErrors 0 / B28 file:// 外の通信 0
B29 localStorage / sessionStorage / cookie すべて 0
B-priv 私的参照の描画なし
B-facts verifiedCases 0 / sample_default / 1250×2050 / V0 34 / III
```

**この測定の範囲**を明記する。

```text
これは e57e47a という 1 つの sha についてのものであり、
それ以降の commit については何も言っていない。
spec の browser-w4 を UNVERIFIED のままにしてあるのはそのためであり、
埋め忘れではない。UNVERIFIED は **target についての記述**である。
fresh verifier は自分の head で自分で走らせる。
```

これを Evidence として project 側へ import することはできない（§21）。
software についての証拠であって project Evidence ではない。

### 自分の缺陥 1 件（P2K-F11）

```text
resolver の existsSync が注入不可だった。
つまり「そのマシン上でしか test できない resolver」であり、
修理対象の欠陥と同じ形。自分の test（P2K-R04）が先に落ちて教えた。
```

## §10 — Wave 5 の独立検証と Wave 6 の修理

### Wave 5: 別実行文脈の検証者 2 件

両方ともこの会話の結論を一切渡さず、
committed 成果物と入口だけを渡した。両方とも repo を変更せずに戻した。

```text
再構成 trial : §23 の受入基準そのもの
敵対的 audit : 共有仮定 / 再生不能な数字 / 何も固定しない test を探す
```

**両者が独立に同じ最重要欠陥を指摘した**——P2K-F06 の CLOSED が偽であること。

### 検証者が再現したもの（こちらは健全）

```text
26,496 / 40,000（再認定の数字）      committed 履歴から双方向に再現
Wave 0 の盲点（derived corpus で 0）    base revision を checkout して再現
corpus 643,419 / digest ac68342e…        一致
mutation 73/74                           逐語一致
browser 62 checks / bypass 0             5 harness 全部実行して一致
parser-boundary の sabotage control      19 bypasses を再現
taskPacketDigest / instrumentSourceSha   文書化された手順で再計算し一致
```

### 自分の欠陥 — すべて自分で再現してから修理した

**(1) P2K-F06 の CLOSED が偽だった（最重）**

```text
P2K-R01 の regex を directory 全体に当てる:
  clean     browser-w4.mjs / resolve-playwright.mjs / browser-outcome.mjs
  OFFENDER  failopen-w4.mjs        line 1
  OFFENDER  parser-boundary.mjs    line 1
  OFFENDER  probe-w4.mjs           line 1
  OFFENDER  stageA-regression.mjs  line 1
```

つまり 5 件中 1 件を直して CLOSED と記録していた。
それを捕らえるべき自分の test は **手書きの 2 file リスト**を見ていた——
Wave 2 で自分が導出形に直した anti-pattern を Wave 4 で戻していた。

修理後の実測（全 5 harness）:

```text
                     通常          playwright 不在
browser-w4           PASS exit 0    UNVERIFIED exit 3
probe-w4             PASS exit 0    UNVERIFIED exit 3
failopen-w4          PASS exit 0    UNVERIFIED exit 3
stageA-regression    PASS exit 0    UNVERIFIED exit 3
parser-boundary      PASS exit 0    UNVERIFIED exit 3
```

**(2) 再認定の数字が別の実験のものだった**

```text
Wave 0 の実験 B : atom 5 件削除
Wave 3 の「再測」: atom 4 件削除
実測:
  5 atom → REGRESSIONS 40,000 / npm test fail 3  ← Wave 0 の fail 3 と一致
  4 atom → REGRESSIONS 32,000 / npm test fail 2
```

fail 数が一致することが、どちらが Wave 0 の変異かの裏付けである。
現在の生成器出力（expected.json と照合済み）:

```text
A  regressions 26,496  diff exit 1  npm test fail 1
B  regressions 40,000  diff exit 1  npm test fail 3
agreesWithExpectations: true
```

**(3) lint の walker と oracle が一字一句同じだった**

検証者が実演した被害を自分でも確かめた。修理後:

```text
publicDescription が配列   → [0] として収集され hard 違反になる
publicDescription が object → .ja / .en として収集される
publicDescription が数値   → unreadable shape として報告され exit 1
出荷 config             → 12 値のまま、unreadable 0
```

### test / mutation

```text
npm test : tests 729 / pass 729 / fail 0（720 から +9）
mutation : KILLED 84 / SURVIVED 1 / EQUIVALENT 0 /
           PATCH-MISS 0 / HARNESS ERROR 0（of 85）
           K5-01..K5-11 は 11/11 KILLED
           SURVIVED 1 = K2-03（Wave 2 で EQUIVALENT と判定済み）
```

M-29 と K3-07 は修理で anchor が消えたので **retarget** した（削除していない）。
どちらも意図は同じままで KILLED。

### 今回の教訓を規則化した

```text
- 「CLOSED」は測定。修理自身の検査を集団全体に当ててから書く
- 数字は生成器に押さえる。prose の文字列一致は固定ではない
（両方とも tools/verification/README.md の「Rules」節に入れた）
```

### Wave 6 の exact-head reverify

```text
測定対象 head : 27053ca69222b42b225c4a9557a5008e48f6dae3
tree          : clean（測定前に確認）

browser（全 5 harness、実 Chromium）
  browser-w4         34 checks / 0 fail  PASS  exit 0
  probe-w4            8 checks / 0 fail  PASS  exit 0
  failopen-w4        10 checks / 0 fail  PASS  exit 0
  stageA-regression  10 checks / 0 fail  PASS  exit 0
  parser-boundary    42 forms  / 0 bypass PASS exit 0
  合計 104 項目。bypass 0

npm test          : 729 / 729 / 0
publication lint  : inspected 12 / advisory 0 / hard 0 / exit 0
diff-heads        : corpus 643,419 / digest ac68342e…
                    REGRESSIONS 0 / unexpected errors 0
                    rule coverage 9 attributed, gap なし
                    advisory も全部 trigger 済み
                    constant coverage 両 head とも corpus と同一
```

この browser 測定も **27053ca という 1 つの sha について**のものである。
spec の browser 系 4 件が UNVERIFIED のままなのはこのためであり、
この repo が任意の head についての browser 証拠を持っていないという
事実の記述である。fresh verifier は自分の head で自分で走らせる。

Wave 4 時点では browser-w4 の 34 項目だけだった。
他 4 harness はこの環境に playwright があったから動いていただけで、
**別のマシンでは UNVERIFIED を名乗れず FAIL と見分けがつかなかった**。

## §11 — Human Gate 最終分類調整と P2K-F08 の有界 triage

### Fresh Gate

```text
HEAD   : 603a3767f548555d7cbb1145a1654f4d9a7dcac2（期待値と一致）
remote : 同じ SHA
tree   : clean
PR #12 : OPEN / draft=true / merged=false / mergeable_state clean
base   : 7bef30751ebaa2aa0f306f3bd584c4e025be77a1（期待値と一致）
```

### 分類の分割（§3）

```text
mutation-kill                  regression / ADMISSIBLE
mutation-equivalence-analysis  regression / DIAGNOSTIC_ONLY
```

schema churn を減らすため option A（instrument 2 件）を選んだ。
`mutate.mjs` の振る舞いは変えていない——証拠モデルの訂正である。

test は spec を **parse して** 固定している（文字列存在ではない）:

```text
P2K-M12  kill → ADMISSIBLE / equivalence → DIAGNOSTIC_ONLY を直接 assert
         加えて proves / doesNotProve の中身と K2-03 の帰属を検査
P2K-M09  12 → 13 instrument の literal 表
P2K-M03  corpus 依存は equivalence 側のみ。kill 側にあってはならない
```

変更が落とされることを mutation で実演した:

```text
K6-01  kill を DIAGNOSTIC_ONLY へ（過小申告）  KILLED（19 test）
K6-02  非 kill の読みを「equivalent」へ        KILLED  by P2K-M12
K1-01  非 admissible を黙って再認定（逆向き）  KILLED  by P2K-M09, P2K-M12
```

### P2K-F08 の triage（§7–§11）

全件表は `F08_TRIAGE.md`。

```text
候補集団 : 単一引数の assert.throws = **49 箇所** / 5 file / 25 test block
検証者の数 : 18（どの数え方でも再現できなかった。名指し分は 13）
取った方針 : 同じ基準を完全適用した 49 件全部を triage（名指し 13 の超集合）

BENIGN 43 / AMBIGUOUS 4 / REQUIRED_FIX 2 —— untriaged 0
```

判定は測定で行った。`assert.throws` を preload で wrap し、
全 49 箇所が実際に投げている message を 108 回分記録した。

**REQUIRED_FIX 1: tests/manual-config.test.js:171**

```text
入力 : [null, undefined, 'string', 123, []]
実測 : 4 件 → input must be an object
       [] のみ → W must be a positive finite number, got: undefined
理由 : typeof [] === 'object' なので object guard は配列を通す
```

**REQUIRED_FIX 2: tests/project-input.test.js:91**

```text
入力 : registerPreset({})
実測 : projectId guard を if (false) へ消しても AC-04 は ok のまま通った
理由 : {} は hasFixedPreset も getPublicLabel も欠くので後続 guard が代わりに発火
```

どちらも **test の欠陥**であり runtime の欠陥ではない——
不正入力は結局拒否されている（fail closed）。
§14 に従い `project-config/**` は変更していない。

修正が有効であることを mutation で実演（§11）:

```text
K7-01  registry.js の projectId guard を消す  KILLED  by AC-04, AC-05
K7-02  manual.js の object guard を消す     KILLED  by manual-config
```

BENIGN / AMBIGUOUS には mutation を作っていない。

### §参照の錠が自分の追加を捕らえた

mutants.mjs の comment に §11 を書いた瞬間に P2K-M11 が落ちた。
意図した通りである。§11 を表へ追加し、その経緯を表自体に記録した。

### 測定値

```text
npm test  : tests 730 / pass 730 / fail 0
            （§16 の「=729」より 1 件多い。§6 が要求する分類固定 test
              P2K-M12 を追加したためである。fail 0 は満たしている）
mutation  : 89 operator / KILLED 88 / SURVIVED 1 / EQUIVALENT 0 /
            PATCH-MISS 0 / HARNESS ERROR 0
            SURVIVED 1 = K2-03。D-016 の通り harness は非 kill と報告し、
            EQUIVALENT は別途の焦点測定に帰属する
manifest  : exit 0
package   : command 12 / browserInstruments 5 /
            guard-diff ADMISSIBLE / mutation-kill ADMISSIBLE /
            mutation-equivalence-analysis DIAGNOSTIC_ONLY
probe     : closure BLOCKED / obs 0 / 0-of-12 / 0-of-4 / 0-of-8 /
            candidate none / verifiedCases 0 /
            1250x2050 sample_default unverified / V0 34 / III
lint      : inspected 12 / advisory 0 / hard 0 / exit 0
guard-diff: REGRESSIONS 0 / rule coverage gap 0 / advisory gap 0 /
            unexpected errors 0
browser   : 未実行。§16 に従い、harness も UI も runtime も変えていないので
            証拠件数を水増ししない
```

## §12 — 最終独立レビューの指摘の修理（Required Fix 3 件）

最終レビューは **PASS WITH FINDINGS / Required Fix 3** を返した。
§21 に従い Ready/merge Human Gate へは提示せず、3 件を修理した。
いずれも runtime / Evidence / 分類決定には触れない。

### RF-1（最重）: 自分の triage が 1 件を BENIGN と誤判定していた

`tests/project-config.test.js:246`
`assertEvidenceConsistency('verified', null)`

```text
初版の判定 : BENIGN、理由「妥当な fixture の 1 field のみ壊している」
実態       : 入力は null であり fixture でない。理由が 2 重に誤り
再測定     : `evidence metadata is required` guard を if (false) へ消すと
             次行の assertOrdinaryObject が
             `evidence must be a plain object` を投げる
             かつ **全 suite 730 pass / 0 fail のまま**
判定       : REQUIRED_FIX。受理済みの RF-2 より強い例である
             （向こうは AC-05 が赤くなったが、こちらは何も赤くならなかった）
修理       : 240 / 243 / 246 に個別 matcher。K7-03 を追加し KILLED を確認
```

**初版の誤りの原因を明記する**。
「判定は測定で行った」と書いたが、測ったのは **投げられた message だけ**であり、
**guard を消す測定は疑わしい 2 件にしかやっていなかった**。
残り 47 件は推論で埋めており、そのうち 1 件が実際に誤りだった。
これは本Campaign の主題そのものである——
**測定と呈したものの一部が実は推論だった**。

### RF-2: RFの機序説明が偽だった

```text
初版 : 「{} は hasFixedPreset も getPublicLabel も欠くので後続 guard が代わりに発火」
実測 : TypeError: Cannot read properties of undefined (reading 'length')
       （registry.js の config.projectId.length）
訂正 : 発火するのは guard ではなく直後の property 読みである。
       判定と処置は変わらない
```

### RF-3: committed 文書が head と矛盾していた

```text
README.md の v1.12.0-phase2k 行 : 「729 / 85 operator / KILLED 84 /
                                  緩い assert.throws 18 箇所が残る」
head の実態                    : 731 / 90 operator / KILLED 89 /
                                  F08 は QUALITY_DEBT で閉じている
```

P2K-M10 を作ったまさにその失敗形を root README で繰り返していた。
（P2K-M10 は tools/verification/README.md と spec の間しか見ていない）

### 必須でない指摘のうち、安いものも直した

```text
F-2  569-572 の「他の到達経路なし」セルが誤り（TypeError が到達する）。
     gap は生じないが記述が違うので matcher を付け、表を AMBIGUOUS に訂正
F-3  P2K-M09 の名前が「12 instrument」のままだった。stale comment も書き換え
F-4  K2-03 の knownLimitations が「is EQUIVALENT under mutation」と始まり、
     harness の verdict に見えた。「NON-KILLED + 別途測定」へ書き換え
F-1  mutate.mjs 自体の header が SURVIVED を「振る舞いが変わったことを実証済み」と
     定義していたが、非差分可能な mutant には当てはまらない。
     振る舞いは変えず（§5）comment だけ訂正し、exit 1 になることも明記
F-7  K2-03 の equivalence 主張に committed な生成器が無かった（§17 違反）。
     tools/verification/experiments/dirent-symlink.mjs を追加し P2K-L08 で固定
```

### 修正後の triage 内訳

```text
BENIGN 38 / AMBIGUOUS 8 / REQUIRED_FIX 3 —— untriaged 0
候補集団は 49 のまま（レビュアーが独立な scanner で set-identical として再現）
```

### 測定値（修正後）

```text
npm test : tests 731 / pass 731 / fail 0
mutation : 90 operator（K7-03 追加）
```

