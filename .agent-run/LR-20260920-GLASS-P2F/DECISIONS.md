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

### D-007 訂正（Wave 8 / 独立検証F1・F8）

上の決定は正しかったが、**実装が決定に届いていなかった**。独立検証が実証した穴:

- `new URL()` は末尾のルートドットを `hostname` に保持する。`drive.google.com.` は
  `$` アンカーのdenylistに一致せず、`intranet.` はドットを含むので完全修飾判定も通る。
  どちらもDNS上は同じホストを指すため、**実在のDrive URLと社内ホスト名が
  「検証済みpublic primary source reference」として保存できた**。
  本Phaseが防ごうとしているleakそのものである。
- 私設TLD（`.local` / `.internal` / `.corp`）、CGNAT（100.64/10）、`0/8`、
  wildcard DNS（`nip.io` 等）、Drive/OneDrive/Boxの実ダウンロードホスト、
  percent-encodeされたcredential param名も通っていた。

**修正**: host判定は**すべて末尾ドット除去後**の値に対して行う。
denylistに上記を追加し、`searchParams`（decode済み）のkey名にもcredential判定を当てる。
保存形もhost正規化後のURLにする（同じホストの別表記が別referenceとして残らない）。
mutation 4件（MF1 / MF8a / MF8b / MF8c）で固定。

**教訓**: 「denylistに載っている」ことと「denylistが効く」ことは別である。
正規化の前に判定すると、denylistは正しく書かれていても素通りする。

## D-013 — 「gateを通した」ではなく「configに載った結果」を検査する（Wave 8 / F2・F3・F5・F11）

- **指摘（正当）**: 構築時にgateを呼ぶだけでは、gateを通った値と最終的に保持される値が
  同一である保証がない。独立検証は3つの具体的な乖離を実証した。
  - `createEntry()` が呼び出し側の `evidence` を2回読むため、accessorで
    「gateにはprimary、保存にはnone」を返せた（TOCTOU）。
  - `reconcileFact()` は `verificationStatus === 'verified'` という**自己申告**しか見ず、
    gateを通らないobjectでも数値一致でMATCHを返した。
  - `identity` はliteralで組まれ、gateを通した `identityEvidence` 変数との結び付きが
    規約のみだった。`validateAllEvidence()` も弱い方の consistency check を使っていた。
- **決定**: 検査対象を「構築経路」から「**結果**」へ移す。
  - `createEntry()` は呼び出し側fieldを一度だけ読んでsnapshotを確定し、
    gateにはそのsnapshotを渡す（読み取り順ではなく値を固定する）。
  - `reconcileFact()` は数値比較に進む前にgateをその場で再実行する。
  - `validateAllEvidence()` は `assertPromotionGate` を使い、configに実際に載っている
    entryを検査する。module load時にこれを走らせ、違反があれば読み込みごと失敗させる。
  - `verifiedValue()` の戻り値と `config.identity` / `dimensions` / `wind` /
    `verifiedCases` を深くfreezeし、検証後の改変と裏口登録を構造的に封じる。
- **理由**: gateが「構築時の一瞬だけ成立する条件」に退化すると、
  実質advisoryだった Wave 2 以前の状態に戻る。
  Wave 2の指摘（"gate that exists but is never called is advisory"）の一般形として、
  **"gate that holds only during construction is advisory"** を同じ扱いにする。
- mutation 6件（MF2 / MF3a / MF3b / MF5 / MF11a / MF11b）で固定。

## D-014 — 表示・表そのものをimmutableにする（Wave 8 / F4・F12）

- **指摘（正当）**: `KNOWN_FACT_KEYS` / `CASE_TYPE_CRITICAL_FACTS` をlive mutableで
  exportしていたため、`KNOWN_FACT_KEYS.push('A_102_pdf')` でD-012のfail closedが破れ、
  `CASE_TYPE_CRITICAL_FACTS.glass_pane.length = 0` でcase promotionが空虚に真になった。
- **決定**: contract定義（allowlist / critical fact表 / EVIDENCE_LEVELS /
  VERIFICATION_STATUSES / public-safe pattern）はすべてfreezeしてexportする。
  あわせて `evaluateCasePromotion()` は `required.length > 0` を明示的に要求し、
  critical factが空のcase typeがverifiedを名乗れないようにする。
- **理由**: 「規則を定義したobject」を書き換え可能なまま公開することは、
  規則を持たないことと大差ない。

## D-015 — caseIdは公開identifierとして扱う（Wave 8 / F9）

- **決定**: `caseId` に `^[A-Za-z][A-Za-z0-9_-]{0,47}$` を課し、
  ファイル名様のsuffix（`.pdf` / `.dwg` 等）を拒否し、`assertPublicSafeEvidenceText()` も適用する。
- **理由**: caseIdはUI・export package・PR本文にそのまま出る。
  D-012がfactKeyにallowlistを課した理由（keyそのものが公開情報になる）が等しく当てはまる。
  図面番号をcaseIdにする経路を規約ではなくコードで塞ぐ。

## D-016 — Evidence panelは失敗しても黙って消えない（Wave 8 / F10）

- **決定**: `renderProjectEvidencePanels()` のcatchは、計算機能は止めないまま
  「検証状況を表示できなかった」ことをpanel上に `textContent` で明示する。
- **理由**: 検証状況の表示が**無い**状態は、利用者から見て「問題なし」と読める。
  Evidence boundaryにおいて、沈黙は安全側ではない。

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

## D-011 — Ledger entryは検証後にimmutable（Wave 2H Required Fix A）

- **指摘（正当）**: `add()` / `get()` / `find()` が保存中のobjectそのものを返していたため、
  Promotion Gateを通った**後**に `verificationStatus` / `evidence.level` /
  `privateReferenceAvailable` / `sourceReference.url` を書き換えられた。
  これではgateが「構築時のみのチェック」に退化する。
- **決定**: canonical snapshotを**深く**freezeして返す（`deepFreeze`）。
  top-levelのみのfreezeでは nested evidence / sourceReference を書き換えられるため不十分。
- **あわせて§7**: 呼び出し側のobjectを保持せず、正規化した新しいobjectを構築する。
  `add()` 後に呼び出し側が元の evidence / sourceReference を書き換えても保存値は変わらない。

## D-012 — factKeyはallowlist（Wave 2H Required Fix B）

- **指摘（正当）**: 識別子regexだけでは `A_102_pdf` / `drawing_123` / `client_code_001` が通る。
  これらはprivate filenameやdrawing numberに由来しうる。
  **factKey自体が公開情報になる**ため「形式が安全」では不十分。
- **決定**: `KNOWN_FACT_KEYS` をallowlistとし、外のkeyは拒否する（fail closed）。
  runtime/custom登録は本Phaseでは行わない。
  新しいgeneric fact typeはsourceへ意図的に追加し、レビューとテストを通してから使う。

## D-013 — 非公開IPリテラルの扱い（Wave 2H Required Fix C）

- **指摘（正当）**: コメントは `fe80::/10` を主張していたが、regexは `fe80:` にしか一致せず
  fe90 / fea0 / febf を取りこぼしていた（実装が説明より弱い）。
- **調査で分かったこと**: 当時もこれらは**拒否されていた**。ただし理由は
  「ホスト名にドットが無い（単一ラベル）」という別の判定に救われていただけで、
  意図した私設レンジ判定が効いていたわけではない。
- **決定**: レンジ判定を fe80–febf（fe80::/10）と `::` / `::1` まで正しく広げる。
  あわせてIPv6リテラルを**クラスとして**拒否し、IPv4-mapped IPv6（`::ffff:192.168.0.1` 等）
  による迂回も塞ぐ。
- **テスト設計上の教訓**: 「どちらかのチェックで落ちる」ことだけを確認すると、
  片方を弱めるmutationが生き残る（実際に生き残った）。
  私設レンジとして落ちることを**エラーメッセージで**固定し、mutationがkillされることを確認した。

## D-014 — verifiedValueはpublic referenceを保持する（Wave 2H §8 / Option A）

- **指摘（正当）**: `verifiedValue()` はgate optionとして渡された public reference を
  検証だけして**捨てていた**。public referenceでverifiedにした場合、
  構築後に「何を根拠にverifiedとしたか」が失われる（ephemeral-public-reference path）。
- **決定**: **Option A** を採用。`verifiedValue()` の返り値に
  canonicalな `sourceReference` を保持する。private Evidence由来の値は `null`。
- **Option Bを選ばなかった理由**: 「Ledger経由でしか public reference を使えない」制約は、
  configが直接verified値を持つ既存構造と噛み合わず、
  呼び出し側が回避策としてLedgerを経由しない別経路を作る誘因になる。
  保持する方が監査可能性が高い。
- **確認**: 既存の private backed な verified 値（V0 / roughness）は `sourceReference: null` を持ち、
  値・検証状況は不変。
