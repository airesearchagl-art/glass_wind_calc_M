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

## D-003 — evidence class と admissibility を 2 軸に分ける

1 つの field にまとめると `guard-diff` について真のことが言えなくなる——
「これは regression evidence であり、かつ現在引用できない」。

```text
class         : regression / independent / observational
admissibility : ADMISSIBLE / DIAGNOSTIC_ONLY / INADMISSIBLE / UNVERIFIED
outcome       : PASS / FAIL / ERROR / UNVERIFIED（結果。admissibility とは別）
```

`UNVERIFIED` は admissibility と outcome の両方に**意図的に**属する。
「測っていない」は証拠の質としても結果としても正当。
PASS / FAIL / ERROR だけが結果専用であり、`RESULT_ONLY_STATES` として分けている。

この区別は自分の test が見つけた——初版は OUTCOMES 全員を
admissibility 位置で拒否しており、正当な UNVERIFIED をも拒否していた。

## D-004 — `guard-diff` を INADMISSIBLE として隔離する（§2 の裁定を反映）

Human Gate §2 に従い、`diff-heads` および現行の導出 corpus は

```text
no regressions / completeness / independent verification
```

のいずれの主張にも使えない。diagnostic としての実行は可。
報告する場合は「diagnostic only / inadmissible」と明記し、
「verification PASS」と書かない。Wave 3 が修理と再認定を持つ。

## D-005 — verifier package に verdict を入れない

これは利便性の問題ではない。Phase 2J の独立検証は
実装者が clean と信じていた head に対して繰り返し FINDINGS を返してきた。
それが成立するのは handoff が「何が大事か」を言い、
「どう結論すべきか」を言わないからである。

```text
禁止 field : expectedVerdict / recommendedVerdict / verdict /
           verified / reviewPassed / allChecksPassed / pass / result
検査方法 : assertNoSelfCertification() が再帰的に拒否。
           planted した field が実際に拒否されることを test が実演（P2K-V01）
```

許可されるのは protected invariant（例: verifiedCases は [] のまま）。
これは domain 制約であって結論の指示ではない。
verifier は invariant が破られていると発見できる。

## D-006 — publication-lint の discovery 契約は **recursive** にする

QD-J23。Wave 2。これは推諡でなく測定で決めた。

### 測ったもの

```text
node tools/verification/experiments/lint-discovery-depth.mjs
（project-config の 1 階下に合成 config module を 1 つ植える。
  公開面値 3 件——うち 1 件は **hard 規則**を踏む）

                        flat（従来）      recursive（本決定）
discovery が到達      false             true
inventory               12（+0）           15（+3）
advisory を報告        0                 1
hard 違反を報告       0                 1
出荷 test               7/7 pass exit 0   6/7 pass exit 1
```

flat の列が QD-J23 の実害である。**公開してはいけない値が
存在しているのに、lint は 0 件と報告し、test は全部緑になる**。

### どちらが正しい契約か

失敗のコストが対称でない。

```text
多く見すぎる : 偽の advisory 1 件。人が却下して終わる。
少なく見る   : 公開してはいけない値が誰の目にも入らない。
```

この lint は後者を防ぐために存在するので、**過剰に収集する**側を取る。
加えて flat は `defaultRoots()` 自身の謳い文句、
「新しい config module は追加された日から対象になる」を
sub-directory が 1 つできた瞬間に黙って破っていた。

### 同時に固めた属性（各々 test で押さえた）

```text
再帰する、深さの上限なし                P2K-L01
nested root 名は POSIX 相対路               P2K-L02
symlink は辿らない（循環しない・木の外へ出ない）  P2K-L05
順序は確定（report が決定的）                P2K-L01
読めない module は throw（黙って縮むのが元凶）  P2K-L06
```

### 独立性の要件をどう満たしたか

§「implementation と test は別の walker を使う」。
**実装のアルゴリズムの写しは oracle でない**。3 つの別機構を使った。

```text
実装     : readdirSync(withFileTypes) の明示 stack 下降
oracle 1 : 手書き literal（committed fixture 木に対して）
oracle 2 : git ls-files——git の index。node:fs と無関係
oracle 3 : test がその場で作る木（中身が構成上既知）
```

FP-01 test は flat readdirSync を使っていた——**実装と同じもの**。
これを git ls-files に差し替えた。ただし git は **tracked のみ**なので、
untracked な作業中の module で赤くならないよう
「lint が見落としていないこと」を hard assertion にし、
逆向きの差分は untracked で説明できることを確かめる形にした。
（正しい lint を告発する赤は assertion を緩めさせる。それが一番悪い）

## D-007 — 計測できなかったときは throw する。null を「陰性」と報告しない

Wave 2 の実験 script 自体に見つけた缺陥。別件なので分けて記録する。

```text
現象: 単体で走らせると  suite exit 1 / fail 1（気づいた）
      test の中から走らせると suite exit 0 / summary 全部 null
      → 同じ計器が、呼んだのが誰かで逆の読みを返していた
原因: Node の test runner が子に NODE_TEST_CONTEXT を渡す。
      これが漏れると子は自分を test worker と思い、
      summary を出さず **失敗しても exit 0** になる
修正: (1) NODE_TEST_CONTEXT / NODE_OPTIONS / NODE_V8_COVERAGE を落とす
      (2) summary が parse できない、または exit code と fail 数が
          矛盾する場合は **throw**する
```

初版は `{exitCode: 0, summary: {tests: null, pass: null, fail: null}}` を
「suite は気づかなかった」として報告していた。
**白紙の計器を 0 と読むのと同じ誤り**であり、
本Campaign が閉じようとしている類型そのもの。
Wave 1 の admissibility モデルにも同じ区別がある——
`UNVERIFIED` は PASS でも FAIL でもない。

## D-008 — corpus は自分の脅威リストを持つ。production から導出しない

P2K-F01。Wave 3。

### 従来の依存方向

```text
corpus.mjs  → evidenceModule.DOT_EQUIVALENTS を import
diff-heads  → buildCorpus(head.PRIVATE_DOCUMENT_EXTENSION_SOURCE)
```

つまり **被検体が自分を測る目盛りを提供していた**。
定数を縮むと目盛りも縮むので、縮んだことが測れない。

### 修理後の実測（Wave 0 の 2 つの実験をそのまま再実行）

```text
                                  Wave 0（導出 corpus）  Wave 3（独立 corpus）
dot equivalent 1 件削除        REGRESSIONS 0          REGRESSIONS 26,496  exit 1
extension atom 4 件削除        REGRESSIONS 0          REGRESSIONS 32,000  exit 1
```

加えて constant coverage 行が production が失ったものを名指す。

```text
constant coverage : working tree dots corpus-only: 1
constant coverage : working tree ext corpus-only: rar,7z,lzh,gz
```

Wave 0 の実験 B は 5 拡張子だった。本回は atom 4 件である。
**同じ実験ではなく同じクラス**であることを明記する。

### 構造的な錠

値の assertion では依存方向は見えないので、
P2K-D01 は **corpus.mjs の source を読んで** project-config への参照が
一行も無いことを確かめる。欠陥は「値が違う」でなく
「依存の向きが逆」だったからである。

### guard-diff の再認定（判断を明示しておく）

```text
Wave 1 : INADMISSIBLE（P2K-F01）
Wave 3 : ADMISSIBLE。ただし proves を狭く書き直した——
         「この corpus 内で base が reject する入力が target で通らないこと」
         「9 hard + 3 advisory のすべてが少なくとも 1 入力で行使されること」
doesNotProve : completeness。開集合の形（homoglyph / 綾り出し / 括弧 dot）
```

この再認定は自分の判断である。Human Gate が戻せるよう
spec の reason に実測値を入れ、P2K-M02 がその実測値を検査する。

## D-009 — 「行使されていない rule の 0」は失敗とする

P2K-F02。coverage gap を exit 1 にした。

導入した瞬間に実害が 1 件見つかった。

```text
rule coverage : base 8 attributed, NEVER EXERCISED: control-character
```

9 ある hard rule のうち `control-character` に属する入力を
corpus は一つも生成していなかった。
つまりこの differential がこれまで印刷したすべての
「REGRESSIONS: 0」は、この rule について何も言っていなかった。

advisory 3 規則についても同じ検査を追加した（throw しないので
attribution が取れない——lint の warnings から取る）。現在 gap 0。

## D-010 — re-attribution は報告するが失敗にはしない

P2K-F03。両方が reject し、rule だけが変わった場合。

```text
従来 : bucket が 2 つ（regression / tightened）だけなので
       b && h && b !== h は黙って捨てていた
現在 : reattributed として記録し、先頭 6 例を印刷する
```

失敗にしない理由: その入力は依然 reject されているので
公開可能になったものはない。かつ Phase 2J の policy 変更のような
正当な変更では大量に出る。**見えないこと**が欠陥だった。

## D-011 — browser の場所は発見する。しかし本題は exit code の方

P2K-F06。Wave 4。

### 前半（易しい方）

```text
従来 : import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
現在 : PLAYWRIGHT_MODULE → bare specifier → npm root -g → interpreter 相対
       いずれも**発見**する。列挙ではない
```

偶然だがこの環境の `npm root -g` は
その絶対 path の親そのものだった。だから動いていた。

### 後半（こちらが本題）

§18 は「exact head の測定がなければ browser VERIFIED と書かない。
UNVERIFIED でよい」と言う。これが成立するには
**「走っていない」と「走って通った」と「走って落ちた」が
別物として見えなければならない**。
import で死ぬ script は 1 つ目を 2 つ目・3 つ目に混ぜる。

```text
outcome     exit  意味
PASS         0    測って全部通った
FAIL         1    測って落ちた
UNVERIFIED   3    起動できなかった——**何も測っていない**
ERROR        4    起動したが途中で壊れた
```

語彙は Wave 1 の admissibility モデルと同じ。変換せずに記録できる。

**0 件測って 0 失敗は PASS ではなく ERROR** とした。
何も測らなかった実行が清らかな実行と同じ見え方をするのは
D-007（白紙の計器を 0 と読む）と同じ誤りである。

### 自分の缺陥を 1 件検出し修正（test が先に見つけた）

resolver の中に `existsSync` が直接入っていた。
importer は差し替えられるのにこれは差し替えられない——
つまり **そのマシン上でしか test できない resolver** であり、
修理対象の欠陥と同じ形だった。`exists` も注入可能にした。

## D-012 — closure 宣言は測定である。修理した file 数ではない

Wave 6。独立検証 2 件が指摘した最重要の欠陥は、
自分が Wave 4 で **P2K-F06 を CLOSED と記録したことそのもの**であった。

```text
実態 : browser harness 5 件のうち 1 件を直して CLOSED と書いた
残り : failopen-w4 / parser-boundary / probe-w4 / stageA-regression は
       1 行目に絶対 path のまま。つまり 4 件について
       「走っていない」は exit 1 = FAIL のままだった
```

さらに悪いのは、それを捕らえるべき自分の test（P2K-R01）が
**手書きの 2 file リスト**を見ていたことである。
これはこの repo 自身が lint で非難している anti-patternであり、
Wave 2 で `defaultRoots()` を導出形に直したその後で、
Wave 4 に自分で戻してしまった。

### 規則として固定したこと

```text
「CLOSED」と書く前に、修理自身の検査を
**それが覆うと主張する集団全体**に当てる。
集団を手書きするな。導出する。
```

P2K-R01 の集団は directory 走査になった。
P2K-R08 を追加し、全 harness が `openBrowser` / `finishRun` を
経由することを別途押さえた——path が正しいことと
UNVERIFIED を名乗れることは別の属性である。

## D-013 — 数字は生成器に押さえる。prose の文字列一致ではない

Wave 3 で guard-diff を再認定した根拠は 2 つの数字だったが、
それを守っていたのはこれだけである。

```js
assert.match(gd.reason, /26496/, ...)
```

これは **文がその数字を含むこと** しか固定していない。
誤った値でも通るし、**別の実験の値**でも通る。
そして実際に後者が起きていた。

```text
Wave 0 の実験 B : extension atom を 5 件落とす → 40,000 / npm test fail 3
Wave 3 の「再測」: 4 件落としていた    → 32,000 / npm test fail 2
README の文 : 「re-measured the same two experiments」——偽である
```

自分の EVIDENCE §8 には「4 atoms。同じ実験ではなく同じクラス」と
正しく書いてあったのに、README と spec の文はそれを覇していた。

### 修理

```text
tools/verification/experiments/corpus-independence.mjs
  → Wave 0 の 2 つの変異をそのまま適用して測る（必ず復元）
  → committed な corpus-independence.expected.json と照合し、
    違えば throw する
  → npm test の fail 数（1 と 3）も測る——Wave 0 と一致したので
    同じ変祰であることの裏付けになる
```

test 側は「数字が文にあるか」から
「expected.json の各値が文にあるか」へ変えた。
連鎖は generator ↔ expected.json ↔ spec / README であり、
前半は generator 実行時、後半は P2K-M02 / M10 / V03 が守る。

## D-014 — 公開面 key の下はすべて公開面である

F-2。lint の walker と FP-01 の oracle が**一字一句同じ**だった。
Wave 2 で file oracle を git ls-files に差し替えたが、
**value oracle は写しのまま**であった。
D-006 で「実装のアルゴリズムの写しは oracle でない」と書きながらである。

実害は検証者が実演した。

```text
publicDescription: ['C:\Users\... .pdf を参照']   ← 配列に入れると
  → inspected 12 / No advisory warnings / exit 0 / 720 test 全緑
同じ文字列を裸で置く → hard 違反として reject
```

さらに FP-01 は**どちらの場合も緑**だった。
「出荷済みの公開面値をすべて覛く」と名乗る test が、
見逃しを検出できることを一度も示していなかった。

### 契約

```text
publicDescription / publicEvidenceDescription / caseId の下にある
**すべての文字列**が公開面値である。
配列でも nested object でも深さを問わない。
文字列でも container でもない値は
**unreadable shape として報告する**（黙って飛ばさない）。
```

oracle 側は walker を消し、**12 経路の literal**と
**形の表（FP-01c）**にした。

## D-015 — 未 commit の根拠を引くなら、引いていることを commit する

D-4。tools は §7..§38 を根拠として引くが、
committed な packet は 25 節しかなく § 文字を 1 つも含まない。
つまり計器の設計根拠がツリーの外にある。
これは P2K-F05（review scope が会話で渡されている）と同型。

packet を commit できない（会話で渡された）ので、
`tools/verification/REQUIREMENT-REFERENCES.md` を追加し、

```text
- committed な packet はどれか（digest 付き）
- 未 commit の packet があることを明記
- 各 § について、引用でなく**操作的な要件**を記述
```

P2K-M11 が tools 全体を走査し、表にない § 参照を落とす。
これは packet を committed にはしない——**gap を可視で有界にする**。
この repo が正直に主張できるのはそこまでである。

## D-016 — Human Gate: mutation の主張を 2 つに分けた

単一の `mutation = DIAGNOSTIC_ONLY` は **両方向に同時に誤っていた**。

```text
mutation-kill                  regression / ADMISSIBLE
mutation-equivalence-analysis  regression / DIAGNOSTIC_ONLY
```

理由:

```text
KILLED は npm test が決める。npm test は ADMISSIBLE な regression 証拠なので、
  その上に立つ KILLED を DIAGNOSTIC_ONLY に落とすのは過小申告である。
SURVIVED / EQUIVALENT の分岐は guard corpus の probe が決める。
  その行動面の外にある mutant には分解能が無いので、
  汎用の非 kill 結果は SURVIVED_OR_EQUIVALENT_UNDETERMINED である。
```

KILLED が意味するのはこれだけである——
**この記述された変異を当てたとき、少なくとも 1 つの持続的な test が落ちた**。
変異集合の網羅性も、実装の意味論的正しさも、
EQUIVALENT 判定の正しさも証明しない。

### K2-03 の帰属

```text
mutation harness   : 非 kill
別途の焦点測定   : この operator / この環境について EQUIVALENT
```

harness の成果としては書かない。spec の reason がその分離を保持し、
P2K-M12 が検査する。

## D-017 — P2K-F08: 候補集団を推測せず、基準を完全適用した

検証者は「18 箇所」と報告したが、**どの数え方でも 18 にならない**。

```text
単一引数の assert.throws : 49
それを含む test block  : 25
連続行を 1 件と数える : 31
検証者が名指しした分   : 13
```

推測で 18 を選ぶと実在の欠陥を落としかねないので、
**同じ基準を完全に適用した 49 件**を triage した（名指し 13 をすべて含む超集合）。
基準を拡げたわけではないので §20 の「19 件目を探さない」には反していない。

### 判定は測定で行った

`assert.throws` を preload で wrap し、全 49 箇所が実際に投げている
message を 108 回分記録した。疑わしい 2 件は guard を実際に消して測った。

```text
BENIGN 43 / AMBIGUOUS 4 / REQUIRED_FIX 2 —— untriaged 0
```

REQUIRED_FIX 2 件はどちらも **test の欠陥**であり runtime の欠陥ではない。
どちらも不正入力は結局拒否されている（fail closed）。
§14 に従い project-config/** は変更していない。

## D-018 — §参照の錠が自分の追加を捕らえた

本 step で mutants.mjs の comment に §11 を書いた瞬間、P2K-M11 が落ちた。
意図した通りである——新しい dangling 参照は黙って増えるのではなく test を落とす。
§11 を表へ追加し、その経緯を REQUIREMENT-REFERENCES.md に記録した。

