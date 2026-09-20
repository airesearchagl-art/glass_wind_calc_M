# Decisions — LR-20260920-GLASS-P2G

## D-000 — Task Packetが2通に分割到着した件のdigest定義

- **事実**: Task Packetは2通のユーザーメッセージで到着した。1通目は §29
  「TSV/Workspace labelへ:」の途中で終わり、2通目がその続きから §45 までを含んでいた。
  1通目は同一内容で2回送られており、切れ目はbyte単位で同一だった。
- **取った行動**: 1通目の途中で `TASK_PACKET_SNAPSHOT.md` を作らなかった。
  不完全なpacketにdigestをbindすると、完全版が届いた時点でdigestが変わり、
  resume時に必ず `BLOCKED` になるためである。
  一方で Fresh Gate と architecture inventory は欠落部に依存しないため先に実施した。
- **決定**: snapshotは両メッセージの忠実な連結とし、その事実をsnapshot冒頭に明記する。
  digestはその連結ファイルのbytesに対して計算する。
- **digest**: `e8014da92ecb6ce432e6f586d0796a7c99220f0254cdfb729828cdf9465de104`

## D-001 — §6のinventory結果：packetの関数名と実装の差異

packet §6 は `ProjectInput.importPackage` / `ProjectInput.exportPackage` を挙げるが、
実装上の該当関数は `deserialize` / `serialize` である。**新設しない**。
既存名をそのまま使う（同義の別APIを増やすと境界が二重になる）。

実測したinventory:

```text
project-config/project-input.js
  SCHEMA_VERSION = 2 / SUPPORTED_SCHEMA_VERSIONS = [1, 2]
  MAX_PAYLOAD_BYTES = 16384 / MAX_NEST_DEPTH = 8 / MAX_STRING_LENGTH = 512
  computeDesignPressure(positivePressure, negativePressure)
  createProjectInput(raw) / validateProjectInput(pkg)
  fromPreset(presetConfig, input) / fromManual(input) / fromWindCalculation(input)
  windTraceFor(pkg)
  serialize(pkg)        <- packet §6 の "exportPackage" に相当
  deserialize(jsonText) <- packet §6 の "importPackage" に相当

calc.js
  generateCandidates(typeKey, area, designP, extraFactor)
  sortCandidates(candidates) / splitCandidates(candidates)
  paneLabel(pane, t)

project-config/registry.js   PresetRegistry
project-config/evidence.js   Evidence contract（Phase 2F）
```

Batch evaluatorはこれらを**呼ぶだけ**とする（§0 / §17 / AC-02）。

## D-002 — Workspaceの既存limitsとの整合（§25）

packet §25 は max workspace JSON / max TSV を「1MB程度」とするが、
既存PIPの `MAX_PAYLOAD_BYTES` は 16KB（1 package あたり）である。
両者は**対象が違う**ため矛盾しない: 16KBは1 caseのpackage、1MBはworkspace全体。

決定: workspace側の上限を別に定義し、各caseは従来どおり
ProjectInputの16KB / depth 8 / string 512 boundaryを通す。
どちらか一方でも超過したら fail closed。
