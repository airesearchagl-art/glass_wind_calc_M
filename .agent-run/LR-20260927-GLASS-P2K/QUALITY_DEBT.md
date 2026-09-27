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
