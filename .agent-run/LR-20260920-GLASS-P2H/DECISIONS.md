# Decisions — LR-20260920-GLASS-P2H

## D-000 — digest定義

`TASK_PACKET_SNAPSHOT.md` のファイルbytesに対するSHA-256。
`ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27`
Resume時に再計算し、不一致なら `BLOCKED`。

## D-001 — Profile に evaluationHeightM / zone を入れない（§5 / Hard Gate）

Profileは「案件共通の風条件」であり、`evaluationHeightM` と `zone` は
**pane / location ごとに違う**値である。

この2つは設計風圧を直接左右する。共通Profileから暗黙継承させると、
別階・別部位へ同じ値が黙って適用され、しかも画面上は正常に見える。
Profile schema がこの2つを**持たない**ことで、継承しようがない形にする。

「入れてはいけない」という規約ではなく、「入れる場所が無い」構造にする。

## D-002 — 既定値を作らない（§12 / Hard Gate）

`V0` / `roughness` / `buildingHeight` / `eavesHeight` / `buildingType` /
`basis` / `evaluationHeightM` / `zone` のいずれも、欠けていたら fail closed。

特に `basis` は Phase 2E / 2G と同じ理由で既定値を持たせない。
`notification_baseline`（告示系）と `itakyo_recommended`（板硝子協会推奨）の
どちらを設計の根拠にするかは判断であり、片方を黙って既定にすると
業界推奨値が法定最低値として通る（またはその逆）。

`zone` を `general` に、`Z` を建物高さに黙って落とすのも同じ性質の誤り。
どちらも「それらしい値」が入るため、間違っていても気づけない。

## D-003 — Scenario 生成時点で snapshot する（§14 / §23）

Profile → Workspace へ case を作った時点で、effective input を PIP v2 として
**固定**する。その後 Profile を変更しても、既に Workspace にある case は変わらない。

理由: 過去の検討結果が、知らないうちに書き換わることを防ぐ。
「Profileを直したら、先週出した検討結果の数字も変わっていた」は
実務上いちばん危険な挙動である。再適用は明示操作のみ。

## D-004 — Workspace export は Profile に依存しない（§27）

生成された case の PIP は、計算に必要な値を**すべて展開して**持つ。
Profile file が無くても Workspace JSON だけで再計算できる。

Profile への外部依存を作ると、export した検討結果が
「別ファイルが無いと再現できない」状態になる。
