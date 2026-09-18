# DECISIONS — LR-20260919-GLASS-P2E

## D-000 — Task Packet digestの定義

- **決定**: digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes全体**に対するSHA-256とする。
- **理由**: canonical `Long_Run_Development_Route.md` のImmutable Task Packet binding定義に従う。
  Phase 2Dと同一定義であり、Campaign間で一貫する。
- **実装**: snapshotにはTask Packet本文のみを格納し、digest等のwrapper metadataは
  `RUN_MANIFEST.md` 側に置くことで自己参照を回避する。
- **値**: `137e9cde09e91cb49a0a57ab20c2e369f892f46ce38836c6529c9823ee10185f`

## D-001 — Research Gateを実装より先に置く

- **決定**: 風圧式・係数・適用条件に関するコードは、Wave 1のResearch Gateが成立するまで書かない。
- **理由**: Task Packet §5が「モデルの記憶や既存コメントだけから実装しない」を明示的なHard ruleとし、
  §19が「sourceが曖昧なのに推測実装 → BLOCKED」と定める。
  既存 `calc.js` のコメントに告示1458号式が書かれているが、**それ自体は一次資料ではない**ため
  Research Gateの根拠として使わない。
- **帰結**: 一次資料で確認できた範囲のみを実装し、確認できない部分は
  `UNVERIFIED` / `NOT_IMPLEMENTED` として明示する。実装しないことは失敗ではない。

## D-002 — Research Gate不成立によりimplementationをBLOCKEDとする

- **状況**: Wave 1で一次資料を特定できたが、候補hostすべて（e-Gov / 国土交通省 / 建築研究所 /
  板硝子協会 / 日本サッシ協会 / 国立国会図書館）が実行環境のegress policyにより
  **403 policy denial** で拒否された。対照として `en.wikipedia.org` も403であり、
  GitHub系host以外への外部アクセスが許可されていない環境である。
- **決定**: 風圧式・係数・適用条件に依存するimplementationを **BLOCKED** とし、
  Wave 2以降へ進まない。推測実装を行わない。
- **根拠**:
  - Task Packet §5 Hard rule: 「公式一次資料で直接確認できなかった 式 / 係数 / zone rule /
    height rule / internal pressure rule / roughness rule を推測実装してはならない」
  - Task Packet §5: 「Research Gateが成立しない場合、その部分のimplementationはBLOCKED」
  - Task Packet §9: 「**一次資料で必要性と定義を確認する前に固定schemaとして実装しない**」
  - Task Packet §19: 「sourceが曖昧なのに推測実装: BLOCKED」
- **Wave 2も含めてBLOCKEDとする理由**: §9がinput contract / schemaの先行実装を明示的に禁止している。
  Trace data model（§8）も「名称は一次資料に合わせてよい」とされ中間値の構造が一次資料に依存する。
  Wave 3以降はWave 2に依存する。よってWave 2〜7すべてが同一の前提で停止する。
- **迂回を試みなかった理由**: 実行環境のproxy READMEが
  「403/407 はorganization egress policyによる拒否。retryや迂回をせず報告すること」と明示している。
  egress policyの迂回は Task Packet §20 のprohibited操作の精神にも反する。
- **canonical分類**: これはHard Checkの `tool unavailable` であり、
  実際の安全境界違反を示す `HARD_GATE_FAILURE` とは区別される（canonical Route）。
  ただし当該CheckがPASSするまで `COMPLETE_VERIFIED` にはできない。

## D-003 — 検索スニペット・repository内コメントを根拠に採用しない

- **状況**: WebSearch自体は利用可能で、`E = Er^2 * Gf`、`Er = 1.7 * (H/ZG)^α`、`Vo 30〜46 m/s`
  といった断片は検索結果の要約として得られた。また本repositoryのREADMEには
  告示1458号のCpe値（一般部 -1.8 / 隅角部 -2.2）が既に記述されている。
- **決定**: これらを実装の根拠として**採用しない**。
- **理由**:
  1. 検索スニペットは第三者による要約であり原文ではない。特に
     **係数表（Zb / ZG / α / Gf / Cpe）の完全な表を復元できない**。
     部分的・推測を含む係数表を建築安全性の計算へ実装することは危険であり、
     「一部は正しい」実装は「明らかに動かない」実装より危険度が高い。
  2. repository内コメント・READMEは一次資料ではない（D-001）。
     特にREADMEのCpe値は案件負圧値からの**逆算**として導入されたものであり、
     一次資料確認を経ていない（EVIDENCE.md §1.5に記録）。
- **帰結**: 「実装しない」ことを失敗ではなく正しい結果として扱う。
