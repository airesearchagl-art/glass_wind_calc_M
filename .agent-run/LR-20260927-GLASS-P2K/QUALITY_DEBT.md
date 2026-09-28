# QUALITY_DEBT — LR-20260927-GLASS-P2K

Phase 2J から引き継いだものは `.agent-run/LR-20260921-GLASS-P2J/QUALITY_DEBT.md` にある。
そちらは変更しない。ここには Phase 2K で新たに測ったものだけを置く。

## P2K-F01 — differential は導出元定数の縮小に原理的に盲目（Wave 3）

実験 A / B で再現済み。EVIDENCE §2 / §3。

```text
機構 : corpus.mjs が DOTS を production の DOT_EQUIVALENTS から導出し、
       diff-heads が corpus を **working tree から** 生成する。
       定数が縮むと corpus も縮み、base と target を同じ縮んだ corpus で比べる。
```

Phase 2J の独立検証9（F9-05）がこの機構を既に特定し、**test 側だけ修理された**。
corpus 側は 2 フェーズ残った。それが QD-J20 の中身である。

## P2K-F02 — corpus に positive control が無い（Wave 3）

corpus が「目的の入力を実際に含んでいるか」を調べる test が 1 つもない。
実験 A では corpus 内の U+0387 が 0 件になったが、誰も気づかない。

## P2K-F03 — diff-heads が first match しか記録しない（Wave 3）

§12。Phase 2J 最終 review の指摘。earlier rule に masked された rule に盲目。

## P2K-F04 — project-state probe が committed されていない（Wave 1）

徒: 本セッションは closure 結果の key 名を Phase を越えて 3 度違えた。

```text
存在しない key : closureStatus / factSlots / slots
正しい key     : status / blockerKinds / requiredSlotCount / readySlotCount /
                categoryCount / readyCategoryCount / caseScopeCount /
                readyCaseScopeCount / promotionCandidate /
                factResults / categoryResults / caseReadiness
```

## P2K-F05 — §15 の independent-verifier package が存在しない（Wave 1 / 5）

Phase 2J では Human Gate が毎回 scope を文章で与えた。repo には何も残っていない。

## P2K-F06 — Playwright import が環境固定の絶対 path（Wave 4）

```text
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
devDependencies : {}
```

README はこの件を明記している（「別の環境では import 行を変える」）ので
隠れた欠陥ではないが、§23 の「fresh verifier が再構成できる」には届いていない。

## P2K-F07 — 入力 corpus digest を記録する仕組みが無い（Wave 1 / 3）

§16 provenance。「607,956」と書いても、どの corpus だったか後から判別できない。
実験 A と B で corpus サイズが 3 通り（643,284 / 607,956 / 578,004）になったのが実例。

---

# Wave 1 後の状態（§40）

```text
P2K-F01  確認済み / 隔離済み / **INADMISSIBLE**。D-004。Wave 3 が修理と再認定を持つ
P2K-F02  未閉（Wave 3）。corpus に positive control がない
P2K-F03  未閉（Wave 3）。diff-heads が first match しか記録しない
P2K-F04  **閉じた**。tools/verification/project-state-probe.mjs が committed、
         test 7 件（手書き期待値 + positive control）。
         K1-04 / K1-05 / K1-06 が KILLED
P2K-F05  **閉じた**。tools/verification/verifier-package.mjs が committed、
         verdict を指示しないことを P2K-V01 が planted field で実演。K1-07 KILLED
P2K-F06  未閉（Wave 4）。manifest の knownLimitations に記録済み
P2K-F07  **部分的に閉じた**。inputDigest の schema slot と
         instrumentSourceSha（内容導出、mtime でない）ができた。
         独立な corpus digest を計算する instrument はまだ無い（Wave 3）
```

## P2K-F08 — 「とにかく throw した」を見る test は何も固定していない（新規・本 Wave で修正済み）

K1-08 が生き残った原因。緩い regex の `assert.throws` が
**別の理由の throw** で満足していた。

```text
教訓: 失敗モードが複数ある場所では、それぞれを別の message で固定する。
      `/A|B/` でまとめると、A の経路を消しても B で通る。
```

他の既存 test に同じ形が残っていないかは **未調査**。
Wave 5 の fresh verifier trial で見るべき項目として残す。

## 引き続き Phase 2J から

```text
QD-J19 / QD-J22 / QD-J23 / QD-J24 は
.agent-run/LR-20260921-GLASS-P2J/QUALITY_DEBT.md にある（変更しない）。
QD-J23 / QD-J24 は Wave 2、QD-J22 は Human Review 手順。
manifest の knownLimitations にすべて機械可読形で入っている。
```

---

# Wave 2 後の状態

## QD-J23 — **閉じた**（Phase 2J からの引き継ぎ）

Phase 2J の QUALITY_DEBT は変更しない（§4）ので、閉じた記録はここに置く。

```text
従来 : defaultRoots() と FP-01 test が同じ flat readdirSync を使っていた
実害 : 1 階下の config module の公開面値 3 件（うち 1 件は hard 規則）を
       discovery が 0 件と報告し、出荷 test は 7/7 緑のまま
修正 : discovery を再帰化（D-006）。
       oracle を 3 機構（literal / git ls-files / その場の木）に分離
検証 : tools/verification/experiments/lint-discovery-depth.mjsによる
       before/after 対比。P2K-L01..L07。K2-01..K2-08
```

## 新規 P2K-F09 — 計器の読みが呼ばれ方に依存していた（本 Wave で修正済み）

```text
現象 : 同じ実験 script が
       単体      → suite exit 1 / fail 1（気づいた）
       test 経由 → suite exit 0 / summary 全部 null（気づかない）
原因 : NODE_TEST_CONTEXT の漏れ。子が自分を test worker と思うと
       summary を出さず、失敗しても exit 0 になる
修正 : env を sanitize し、parse 不能または
       exit code と fail 数が矛盾したら throw（D-007）
```

他の instrument が同じ env 依存を持っていないかは **未調査**。
subprocess を起こす計器は mutate.mjs と diff-heads.mjs も該当する。
Wave 3 で見る（そこはもともと differential の修理 Wave である）。

## P2K-F08 の設問を 1 件回収した

「とにかく throw した」を見る test は何も固定していない——
本 Wave で同型のものを自分の新規 test に 1 件持ち込んでから直した。

```text
P2K-L03 初版: results.find(r => r.path.startsWith('sub/beta.'))
        → 最初に当たるのは警告の無い caseId なので、
          advisory を持つ値について何も検査していなかった
修正    : 経路を完全一致で指定し、rule 名を deepEqual で押さえた
```

first-match でしか見ないのは P2K-F03（diff-heads）と同じ形である。
**演繰返しているので Wave 3 の F03 修理は優先度を上げる**。

---

# Wave 3 後の状態

```text
P2K-F01  **閉じた**。corpus が自分の脅威リストを持つ（D-008）。
         project-config への参照が一行も無いことを P2K-D01 が source で検査。
         Wave 0 の 2 実験を再測: 0 → 26,496 / 0 → 32,000、いずれも exit 1
P2K-F02  **閉じた**。hard 9 + advisory 3 の coverage 検査を入れ、
         gap を exit 1 にした（D-009）。
         導入した瞬間に `control-character` の実害を 1 件検出
P2K-F03  **閉じた**。reattributed bucket を追加（D-010）。
         失敗にはしない——理由は D-010
P2K-F06  未閉（Wave 4）。Playwright の絶対 path
P2K-F07  **閉じた**。corpusDigest。大きさと digest を
         committed literal で固定（P2K-D09）。diff-heads が毎回印刷する
P2K-F08  未調査（Wave 5）。緩い assert.throws が他に残っていないか
P2K-F09  **閉じた**（mutate.mjs と Wave 2 実験）。
         diff-heads の子は git のみなので影響しない——確認済み
P2K-F10  **構造上開いたまま**。corpus は有限の列挙なので
         開集合の形（homoglyph / 綾り出し / 括弧 dot）には届かない。
         修理できない——明記するだけ
```

## P2K-F09 の実測（mutation harness 側）

KILLED と報告される mutant 1 件を当てた状態で `npm test` を 2 通り走らせた。

```text
                          threw  exit  TAP  not ok  # fail  mutate.mjs の判定
clean env                 yes    1     yes  5       5       KILLED
NODE_TEST_CONTEXT 漏れ    no     0     no   0       null    SURVIVED/EQUIVALENT
```

つまりこの変数がある環境で battery を回すと
**全 operator が SURVIVED と報告され、表は普通に見える**。
旧 guard（`!/^# (pass|fail)/m` で crashed 判定）は catch 内にあったので
throw しないこの経路には届かない。

修正を `tools/guard-diff/suite-verdict.mjs` に分離し、
literal TAP サンプルで P2K-H01..H07 が押さえる。

## この Wave の判断 1 件（Human Gate に上げる）

**guard-diff を INADMISSIBLE から ADMISSIBLE へ戻した**。

```text
根拠 : 依存方向を切った（構造的に P2K-D01 が錠）
       Wave 0 の盲点 2 例がいずれも見えるようになった（実測）
       9 hard + 3 advisory に positive control がある（実測）
限定 : proves を狭く書き直した。completeness は証明しない。
       P2K-F10 がその理由を機械可読形で保持する
戻し方: spec の reason に実測値が入っており、P2K-M02 がそれを検査する。
       Human Gate が INADMISSIBLE へ戻すなら spec 1 行と M02 の 1 行
```

---

# Wave 4 後の状態

```text
P2K-F06  **閉じた**。playwright を発見する（D-011）。
         加えて UNVERIFIED / ERROR を PASS / FAIL から別の exit code に分した
P2K-F08  未調査（Wave 5）
P2K-F10  構造上開いたまま（修理不可）
P2K-F11  新規・下記
```

## P2K-F06 の本体は path でなく exit code だった

```text
従来 : import が失敗すると ERR_MODULE_NOT_FOUND で死ぬ。
       呼び出し側は非 0 exit を見るだけなので
       **「走っていない」と「走って落ちた」が区別できない**
現在 : PASS 0 / FAIL 1 / UNVERIFIED 3 / ERROR 4。
       0 件測って 0 失敗は ERROR（PASS ではない）
```

§18 の「UNVERIFIED でよい」は、UNVERIFIED を名乗れる形が
存在してはじめて意味を持つ。

## P2K-F11 — 計器の依存のうち 1 つだけ注入不可だった（本 Wave で修正済み）

```text
現象 : resolver の中に existsSync が直接入っていた。
       importer は差し替えられるのにこれは差し替えられない
意味 : 「そのマシン上でしか test できない resolver」——
       まさに修理対象の欠陥と同じ形
検出 : 自分の test（P2K-R04）が先に落ちた
修正 : exists も注入可能にした
```

他の instrument に同じ形が残っていないかは **未調査**。
Wave 5 の fresh verifier trial で見る。

---

# Wave 6 後の状態（独立検証 2 件の指摘を反映）

```text
P2K-F06  **本当に閉じた**。Wave 4 の CLOSED は 5 件中 1 件だけの修理であった。
         5 件全部を harness.mjs に集約し、
         各々について UNVERIFIED exit 3 を実演した
P2K-F08  一部進展。検証者が 18 箇所の候補を file:line で特定した。
         本 Wave では未着手 → Wave 7 以降もしくは次 Phase
P2K-F10  構造上開いたまま（修理不可）
P2K-F11  閉じた（Wave 4 で修正済み）
P2K-F12  新規・下記。閉じた
P2K-F13  新規・下記。閉じた
P2K-F14  新規・下記。**有界化したが閉じてはいない**
QD-J24   閉じた（D-014）
```

## P2K-F12 — 再認定の根拠が prose の文字列一致で守られていた

```text
守っていたもの : assert.match(gd.reason, /26496/)
固定していたこと: 「文がその数字を含む」だけ
実際の被害 : Wave 3 は 4 atom を測って 32,000 を得、
           Wave 0 の 5 atom（= 40,000）と「同じ実験」として公表した
修正 : corpus-independence.mjs + expected.json。
       npm test の fail 数 1 / 3 も一致し、同じ変異である裏付けになった
```

## P2K-F13 — lint の value walker と oracle が一字一句同じだった

QD-J24 の実体。Wave 2 は file oracle だけを差し替えていた。

```text
実害（検証者が実演）:
  publicDescription: ['C:\Users\... .pdf']  → inspected 12 / 警告 0 / exit 0 / 720 全緑
  同じ文字列を裸で                       → hard 違反
  FP-01 はどちらも緑（= 見逃しを検出できることを一度も示していない）
修正 : 公開面 key の下の全文字列を収集。読めない形は報告。
       oracle は walker を捨て 12 経路の literal + 形の表（FP-01c）
```

## P2K-F14 — 計器の根拠がツリーの外にある（**有界化のみ**）

```text
tools が引く : §7 8 9 10 13 17 18 21 23 24 26 27 28 34 35 38
committed packet : 25 節、§ 文字 0
```

packet は会話で渡されているので commit できない。
REQUIREMENT-REFERENCES.md で**操作的な要件**を書き、
P2K-M11 が表に無い § 参照を落とす。
これは gap を消さない——**見えるようにして増えないようにした**だけである。

## 未着手として残すもの（黙って落とさない）

```text
1. mutate.mjs の EQUIVALENT 判定は guard の text API 経由のみ。
   evidence.js 内でも guard 以外の契約を触る mutant（M-12/13/16）は
   原理上 0 divergence となりうる。現在は 3 つとも KILLED。
   spec の doesNotProve に記載済み。決着実験は「どの test も押さえていない
   非 guard 振る舞いを変える operator を 1 つ追加し、
   EQUIVALENT かつ exitCode 0 になることを見る」
2. P2K-F08: 緩い assert.throws が 18 箇所。file:line は検証報告にある
3. project-state-probe の observations:0 は literal。
   実商品も [] を渡すので現状一致。browser B10b が別経路で読む
```

---

# Human Gate 最終分類調整後の状態

```text
P2K-F08  **閉じた（有界 triage 完了）**。
         49 件全件 disposition 済み。BENIGN 43 / AMBIGUOUS 4 / REQUIRED_FIX 2。
         REQUIRED_FIX 2 件は修理し、K7-01 / K7-02 で固定した。
         全件表: F08_TRIAGE.md
P2K-F10  維持。corpus は有限の列挙——修理不可。corpus 拡張はしない（§12）
P2K-F14  維持。bounded, not closed のまま（§13）。
         packet の provenance が完全に再現可能とは主張しない
P2K-F15  新規。汎用の非 kill 結果は SURVIVED_OR_EQUIVALENT_UNDETERMINED。
         分類しただけで修理していない（構造上の制約）
```

## P2K-F08 の候補数についての申し送り

検証者の「18」は **どの数え方でも再現できなかった**。

```text
単一引数の assert.throws : 49
それを含む test block  : 25
連続行を 1 件と数える : 31
名指しで挙げられた分   : 13
```

推測で 18 を選ばなかった。実在の欠陥を落とす危険があるためである。
代わりに同じ基準を完全適用した 49 件を triage した。
これは基準の拡大ではないので §20 には反していないが、
**依頼された件数と違うことは明記しておく**。

---

# 最終レビュー後の状態

```text
P2K-F08  閉じた。ただし **初版の triage に誤判定 1 件と誤った機序説明 1 件**があった。
         最終レビューが両方を検出し、再測定して修正済み。
         BENIGN 38 / AMBIGUOUS 8 / REQUIRED_FIX 3
P2K-F10  維持（修理不可）
P2K-F14  維持（bounded, not closed）
P2K-F15  維持（分類しただけ）
P2K-F16  新規・下記
```

## P2K-F16 — 「測定した」と書いたものの一部が推論だった

F08 triage の見出しに「判定は測定で行った」と書いたが、

```text
測ったもの   : 全 49 箇所が投げる message（108 回）
測っていない : guard を消したときに別の throw で通るか（判定 C）を
            47 件については推論で埋めていた
結果       : そのうち 1 件（project-config.test.js:246）が実際に誤り
```

教訓はこの Campaign の主題と同型である——
**測定の範囲を混じって書くと、推論が測定の信用を借りる**。
今回は表の各セルに、測ったのか推論なのかを書き分けていない。
**残してある限界として明記する**。

全 49 件に guard 削除測定をかけるのはこの Phase の有界範囲を超える。
次にここを触るときの作業として残す。

