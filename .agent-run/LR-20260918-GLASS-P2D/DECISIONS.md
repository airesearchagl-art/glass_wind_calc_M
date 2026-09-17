# DECISIONS — LR-20260918-GLASS-P2D

Campaign中の主要な設計判断。public-safeな内容のみ。

## Wave 0

### D-000: Task Packet digestを「snapshotファイルbytes」に対して算出する

canonical Route（`Long_Run_Development_Route.md`「Immutable Task Packet binding」）は
`task_packet_digest_sha256` を `TASK_PACKET_SNAPSHOT.md` の**bytes**に対するSHA-256と定義している。

したがって `TASK_PACKET_SNAPSHOT.md` にはTask Packet本文のみを格納し、digest・recovery note等のwrapper metadataは `RUN_MANIFEST.md` 側へ置いた。これによりsnapshotファイル自身がdigestを含む自己参照を避け、再hashによる検証が単純な `sha256(file)` で成立する。

（Phase 2Cではsnapshotファイル内にwrapper metadataを含め、digestを「本文抽出部分」に対して算出していた。Phase 2Dではcanonical定義へ合わせる。過去Campaignのdigest定義を遡って変更することはしない。）

### D-001: Task Packet本文はexecution sessionのtranscriptから取得する

会話上の要約・再入力ではなく、実際に受領したメッセージ本文をそのまま使用する。transcript中の2レコード（queue-operation と対応するuser message）の内容が完全一致することを確認したうえで、外側のコードフェンスのみを除去して本文を保存した。実行環境固有のpath・session識別子はRun Artifactへ記載しない。

### D-002: Vaultはread-onlyで参照する

canonical Route / Implementation Task Prompt / Documentation Sync Handoff のいずれも「開発IDEは `obsidian-vault` / Notionを直接更新しない」と定めている。したがってVaultは読み取りのみで使用し、記録すべき事項は完了報告の「Obsidian Vaultに記録候補」としてReview / Orchestration側へ返す。

### D-003: Run Artifactを実装開始前に作成する

Task Packet §3が「今回は事後復旧ではなく、最初に必ず作成する」と明示しているため、Wave 0でcalc.js等の実装へ入る前にRun Artifact 7ファイルを作成し、digest bindingを成立させた。
