# DECISIONS — LR-20260920-GLASS-P2F

## D-000 — Task Packet digestの定義

- **決定**: digestは `TASK_PACKET_SNAPSHOT.md` の**ファイルbytes全体**に対するSHA-256。
- **理由**: canonical `Long_Run_Development_Route.md` のImmutable Task Packet binding定義。
  Phase 2D / 2Eと同一定義でCampaign間の一貫性を保つ。
- **値**: `9c2185f13346f899771be1f1201e7db2874f12b44df918c4a71450e7f2f2db44`

## D-001 — Evidence availability: UNAVAILABLE と判定し §23 の経路を取る

- **状況**: Task Packet §6が認める4つのEvidence sourceをWave 0で順に確認した結果、
  project-specific private Evidenceは本実行環境から**利用できない**（詳細 EVIDENCE.md §1）。
  - Task Packet自体に案件factの実データは含まれていない
  - execution environmentにevidence相当のファイルは存在しない
  - Obsidian Vaultに本repositoryを参照するfileは0件（22 project folderのいずれも無関係）
  - 数値一致したvault fileはすべて別プロジェクトのgit commit SHAの部分一致であり、
    内容確認のうえ無関係と判断した
- **決定**: Campaignを終了せず、§23の経路を取る。
  generic Evidence Ledger / promotion guard / Verified Case validator / UI Evidence status /
  tests / privacy boundary までを実装し、**project-specific promotionは行わない**。
- **帰結**: `verifiedCases: []`、Explicit unverified items 4件維持、
  Final state `COMPLETE_PENDING_FULL_VERIFY`。
- **Evidence不足をコードで埋めない。** 空のverifiedCasesを「埋めるべき欠落」として扱わない（§17）。

## D-002 — 近似一致・reverse solveをEvidenceとして採用しない

- **状況**: Phase 2EのWind Pressure Trace Engineは、合理的な入力を与えると
  既存presetの負圧に近い値（差 約 -1.4%）を出す。またpresetからZを逆算することも可能である。
- **決定**: いずれも**Evidenceとして採用しない**。
- **理由**: Task Packet §6が「逆算のみ」を明示的に禁止し、§13が
  「Phase 2E calculated traceと近いことだけではverifiedにしない」と定める。
  §15は `MATCH ≠ verified` を明示する。
- **許容される範囲**: reverse calculation・近似比較は **diagnostic** として実装・表示してよい。
  Evidence Gateを通す根拠にはしない。この区別をコードとUIの両方で構造的に保つ。

## D-003 — 「空だから埋める」を目的にしない

- **決定**: `verifiedCases: []` を維持する。架空・推測・部分的なcaseを追加しない。
- **理由**: Task Packet §17が明示。verifiedCasesの存在意義は
  「full promotion gateを通ったcaseだけを保持すること」であり、
  件数が0であることはbugではなく**正しい状態**である。

## D-004 — Evidence contractを `project-config/evidence.js` へ抽出する（Wave 1 inventory結果）

### inventory結果（Task Packet §7）

repository-wide searchの結果、Evidence contractは**すべて案件固有モジュール
`project-config/miyoshi.js` の内部にあった**。

| 契約 | 元の場所 | 性質 |
|---|---|---|
| `EVIDENCE_LEVELS` | miyoshi.js | 案件非依存 |
| `VERIFICATION_STATUSES` | miyoshi.js（+ project-input.jsに**重複定義**） | 案件非依存 |
| `isValidCheckedAt` | miyoshi.js | 案件非依存 |
| `PUBLIC_UNSAFE_TEXT_PATTERNS` / `assertPublicSafeEvidenceText` | miyoshi.js | 案件非依存 |
| `makeEvidence` | miyoshi.js | 案件非依存 |
| `assertEvidenceConsistency`（promotion guard） | miyoshi.js | 案件非依存 |
| `verifiedValue` | miyoshi.js | 案件非依存 |
| `validateVerifiedCase` | miyoshi.js | **案件形状に依存**（floor/zoneの値域がMiyoshi固有） |

### 決定

契約の単一の正を `project-config/evidence.js` へ**移動**する（再実装しない）。
miyoshi.js は解決して同名のローカル別名へ束ねるため、**約85箇所の呼び出しは無変更**で、
差分は定義ブロックのみに閉じる。

あわせて project-input.js の `VERIFICATION_STATUSES` 重複定義も解消する
（一方だけ変更されたときに黙って乖離する状態だった）。

### 理由

- Task Packet AC-02「重複実装しない」を満たすには、generic Evidence Ledgerが
  契約を再実装しない必要がある。契約が案件固有モジュールに閉じている限り不可能。
- §7は「必要ならgeneric moduleへ抽出してよい」と明示的に許可している。
- 別案件のconfigが同じ契約を使えるようになる（Phase 2Fの目的そのもの）。

### やらなかったこと（§7「不用意なlarge refactorはしない」）

- `validateVerifiedCase` の全面generic化は行わない（案件形状に依存するため、
  Wave 2でgeneric case validatorを**別に**用意し、既存はそのまま残す）。
- 呼び出し側の書き換えは行わない（別名束ねで吸収）。
- 案件fact・verificationStatus・evidence値は一切変更しない。

### 抽出時に見つけた実害バグ（browserでのみ再現）

`miyoshi.js` のUMD factoryは **`global` を引数に取らない**
（`registry.js` / `project-input.js` とsignatureが異なる）。
そのため最初に書いた resolver の `typeof global === 'object'` は
ブラウザで常にfalseとなり、`require` も存在しないため
**module loadが例外で失敗**した（Node testsは `global` が存在するため素通り）。

`globalThis` を直接参照する形へ修正し、実機で全モードの動作と JS error 0 を確認した。
再発防止として、resolverが bare `global` に依存しないこと・
`index.html` が evidence.js を miyoshi.js より前に読み込むことをテストで固定する。

## D-005 — promotion gateは既存guardを「置換」せず「強化」する

- **状況**: Task Packet §9は、verified昇格の条件として既存guardにない
  `privateReferenceAvailable === true` または安全なpublic source referenceを要求する。
- **決定**: 既存 `assertEvidenceConsistency()` は変更せず、
  それを**内部で必ず呼ぶ** `assertPromotionGate()` を追加して条件を上乗せする。
- **理由**: §9の「existing promotion guardと矛盾させない」を満たす最も安全な形。
  strictly stronger であって別基準ではないため、既存の挙動・既存テストを壊さない。
- **確認**: 既存configの `verified` な値（identity / wind.V0 / wind.roughnessCategory）は
  いずれも `privateReferenceAvailable: true` を持つため、強化後のgateも通過する（実測）。

## D-006 — Promotion Gateをtrusted構築経路へ接続する（Required Fix）

- **指摘（正当）**: Wave 1で `assertPromotionGate()` を追加したが、
  実際の構築経路（`verifiedValue()` / identity構築 / `validateVerifiedCase()`）は
  従来の `assertEvidenceConsistency()` のままだった。
  **gateが存在するだけで呼ばれていなければ、強化要件は実質advisoryである。**
- **決定**: 3経路すべてを `assertPromotionGate()` へ接続する。verified規則を二重に持たない。
- **確認**: 各経路を弱いguardへ戻すmutationを実施し、いずれもtestが落ちることを確認した
  （§6-10の要求そのもの）。

## D-007 — public source referenceは「非空文字列」では不十分（Required Fix）

- **指摘（正当）**: 初版は `typeof === 'string' && length > 0` を参照の十分条件にしていた。
  これでは `"x"` や private Drive URL でもverifiedを通せてしまう。
- **決定**: `assertPublicPrimarySourceReference()` を実装し、構造要件を課す。
  https / 資格情報なし / localhost・loopback・私設ネットワークでない /
  既知private provider（Drive・Docs・Notion・SharePoint・Dropbox）でない /
  単一ラベルホストでない / token等を提供元にしていない。
- **`assertPublicSafeEvidenceText()` を再利用しない理由**: あちらは publicDescription 用で
  URLを含むこと自体を拒否する。こちらは公的な公開URLを受け入れる場所であり、要件が正反対。
- **コードが判定できることの限界を明記する**: 検証しているのは**public-safeな構造**であって、
  その資料が本当に一次資料か・発行者が信頼できるかではない。
  それはHuman / reviewerの判断であり、構造が通ったことを真正性の証明と読み替えてはならない。

## D-008 — sourceReferenceは監査可能な正規形として保持する（§5）

- **決定**: `{ kind: 'public_primary', url }` を正規形とし、Ledger entryが保持する。
  validation時にだけ渡す一時optionでは「安全に保持されている」を満たさない。
- **private Evidence**: `sourceReference = null`。URL / ファイル名 / IDを保持しない。
  保持するのは `privateReferenceAvailable: true` だけ。
- **public URLを publicDescription へ入れない**（役割が逆であることをtestで固定）。

## D-009 — reconciliationは「Evidenceが先、数値が後」

- **決定**: `reconcileFact()` はEvidenceの検証状況を先に見る。
  verifiedでなければ、**数値が完全一致していても** `INSUFFICIENT_EVIDENCE` を返す。
- **理由**: AC-12「MATCHとverifiedを明確に分離」。逆順に判定すると
  「数値が合っているから検証済み」という最も危険な誤解をコードが追認してしまう。
- **現状**: Evidence UNAVAILABLEのため、4群すべてが `INSUFFICIENT_EVIDENCE` を返す。

## D-010 — mutation testが露呈したcase promotionの抜け穴

- **状況**: `evaluateCasePromotion()` の `verificationStatus !== 'verified'` チェックを
  削除するmutationが**生き残った**。当初のfixtureが `indirect` / `none` evidenceを
  使っていたため、gate側で落ちて結果的にcaseも落ちていただけだった。
- **実際の穴**: `partially_verified` でありながら primary + privateReference の
  evidenceを持つentryがあると、gateは素通りするためcaseが誤って昇格しうる。
- **対応**: 当該条件を直接突くテストを追加し、mutationがkillされることを確認した。
- **記録する理由**: 「テストが通っている」ことと「その分岐が検証されている」ことは別である、
  という具体例として残す。
