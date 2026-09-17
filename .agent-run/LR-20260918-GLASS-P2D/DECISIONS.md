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

## Wave 1

### D-100: deprecated定数の削除に伴うテスト置換でcoverageを落とさない

`calc.test.js` の「既定寸法は1250×2050mmのまま」は、calc.js側のdeprecated複製を検査するテストだったため、複製の削除により成立しなくなった。単に削除するとcoverageが落ちるため、次の方針を取った。

- 案件既定寸法1250×2050の固定は、`project-config.test.js` の既存テストが従来から独立に行っているため、canonicalな値のpinは失われない。
- 代わりにcore purityテスト2件（exportから消えていること / ソースに案件固有識別子・値・provenance語彙が無いこと）を新設し、従来カバーされていなかった性質を固定した。

結果としてテスト数は 91 → 92（純増）。

### D-101: `calc.test.js` は案件presetを参照しない

汎用計算コアのテストが案件configへ依存すると、coreの案件非依存性を検証する意味が薄れる。境界回帰テストの設計風圧は、案件preset由来の値ではなく検証用の固定値（1525）として定義し、その値自体の正しさは `project-config.test.js` 側が独立に固定する形にした。

## Wave 2 / 3

### D-200: registryは「built-in限定」を構造で保証する

AC-04の「registered presetのverified stateはrepository内built-in configだけが持てる」を、規約ではなく構造で担保するため、registryにimport pathを一切設けず、登録可能条件を `hasFixedPreset === true` に限定した。手入力モジュール（`manual.js`）は `hasFixedPreset: false` のため、実装上registryへ入れられない。

### D-201: importは「reject」ではなく「downgrade」を採用する

AC-05は「external import → imported_unverified」または「trusted-state claimを含むpayload自体をreject」のいずれでもよいとしている。後者を単純採用すると、自分でExportしたregistered_preset packageをImportできなくなり、AC-06のroundtrip要件と衝突する。

そこで**常にdowngradeする**方式を採った。payloadが `sourceKind` / `verificationStatus` / `publicLabel` で何を主張しても破棄し、`imported_unverified` / `unverified` / 中立ラベルへ落とす（`sourceId` もnull）。これによりroundtripは計算値について成立しつつ、verified provenanceの偽装は構造的に不可能になる。ラベルを引き継がないため、案件名が未検証データに付いて表示される事故も防げる。

### D-202: designPressureは保存値を信用しない

serializeされた `designPressure` を信用すると、payloadが実際の正圧・負圧と矛盾する設計風圧を主張できてしまう。読み込み・生成のいずれでも `max(|正圧|, |負圧|)` から再計算し、payload値は捨てる。

## Wave 5

### D-500: self reviewで検出したcontrol-char literalを修正

full diff reviewで `project-config/project-input.js` がgit上binary扱いになっていることを発見した。原因は、control-char検出用の正規表現がエスケープ表記ではなくリテラルの制御文字（NUL等6バイト）としてソースへ書き込まれていたこと。

正規表現としては機能していたためテストでは検出できなかったが、(1) ソース差分がレビュー不能になる、(2) JSソース中のNULバイトは配信・編集環境で不安定、という実害があるため修正した。挙動は同一であることを、5種の制御文字が従来どおり拒否されることで確認している。

この事例は「テストが通っている＝ソースが健全」ではないことの記録として残す。

## D-600 — Vercel deployment識別子のRun Artifactからの除去と、snapshot内残存の回付

- **状況**: Independent VerifierがAC-13違反として、Vercel deployment識別子
  （`dpl_` で始まる opaque token）がpublic repositoryへ新規に持ち込まれていると指摘した。
  4箇所のうち3箇所は本Campaignが書いたPhase 2C Run Artifact、1箇所は
  `TASK_PACKET_SNAPSHOT.md`（Task Packet本文のverbatim）である。
- **独立確認**: base `97bc18e5...` には存在せず、本branchが新規に追加したものであることを確認した。
  また本repository自身の `assertPublicSafeEvidenceText()` がこの文字列を
  `opaque-long-token` として**拒否**する。すなわち自repoの公開安全基準に反する。
- **重大度の評価（過大評価しない）**: これはsecretやcredentialではない。Vercelの
  GitHub Appは同種の識別子（projectId / teamId / deployment inspector ID）を
  本repositoryのPRコメントへ自動的に公開投稿しており、同クラスの識別子は既にpublicである。
  したがって実害は「秘密の漏洩」ではなく、**AC-13および自repoの公開安全基準との不整合**である。
- **決定**:
  1. 本Campaignが記載した3箇所（Phase 2C の RUN_STATE / RUN_MANIFEST / TASK_QUEUE）からは
     識別子を除去し、事実（Production READY）のみを残す。可逆で、失うものがない。
  2. `TASK_PACKET_SNAPSHOT.md` 内の1箇所は**変更しない**。当該fileはimmutableなTask Packet本文であり、
     Humanから「本文（exact verbatim portion）を変更しないこと」「digestが変わった場合はSTOP」と
     明示指示されている。digest `6d38bb4f...` を維持する。
- **理由**: privacy boundary（AC-13）とimmutable digest binding（§Task Packet）が
  同一のTask Packet内で競合しており、どちらを優先するかはagentが自己判断でよい種類の
  trade-offではない。Hard Gate（Privacy）のFAILを自己waiveもしない。
  よって除去可能な範囲は直ちに除去し、残りはHumanの決定事項として明示的に回付する。
- **Humanの選択肢**: (a) 現状維持（実質public情報であり許容）、
  (b) Task Packet revision 2 を発行し、識別子を除いた本文で snapshot と digest を再発行する。
  (b) を選ぶ場合は新digestをHumanが承認する必要がある。agent側では実施しない。

## D-601 — `registered_preset` を名乗れる対象をregistry同一性で限定する

- **状況**: `fromPreset()` は `hasFixedPreset === true` という自称マーカーのみを検査しており、
  偽装objectから `registered_preset` packageを生成できた（Verifier指摘、LOW）。
  外部データからは到達しない（JS実行権限が前提）が、trust boundaryが
  「構造」ではなく「慣習」で成立している状態だった。
- **決定**: `fromPreset()` で、渡されたconfigがregistryの保持する
  built-in preset object **そのもの**であること（`===` 同一性）を検証する。
  あわせて `registered_preset` の `sourceId` はregistry登録済みprojectIdに限定する。
- **理由**: AC-04/AC-05が主張する「registered presetはrepository内built-inのみ」を、
  実装上の事実にする。importパスは従来どおりdowngradeで処理され、挙動は変わらない
  （browser実機・全testで確認済み）。
