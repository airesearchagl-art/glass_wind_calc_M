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
