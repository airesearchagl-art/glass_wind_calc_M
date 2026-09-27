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
