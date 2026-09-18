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
