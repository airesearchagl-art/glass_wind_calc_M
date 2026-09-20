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

## D-003 — TSVの行番号は物理行で数える（Required Fix 1）

- **指摘（正当）**: `parseTsv` は空行を**先に捨ててから**番号を振っていた。
  そのため `header / valid / blank / invalid` というTSVで、invalid行が
  「3行目」と報告された。ユーザーのExcel上では4行目である。
  §37は「ユーザーが自分のシート上で行を特定できること」を求めるので、これは違反。
- **決定**: CRLF/CRをLFへ正規化 → 物理行へ分割 → headerは**必ず物理1行目** →
  空行はcaseにしないが**番号は物理位置のまま**。
  `MAX_CASES` は実データ行数で数える（空行でcapを回避できないように）。
  物理1行目が空ならheaderを後ろへずらさず fail closed。
- 回帰テスト: A（blank1つ→4行目）/ B（連続blank→6,8行目）/ C（末尾blank→phantomなし）/
  D（1000行+blank→通る）/ E（1001行→reject）/ 空header→fail closed。

## D-004 — 壊れた行は「隔離した診断レイヤ」として見せる（Required Fix 2）

- **指摘（正当）**: `CASE_STATUSES` / filter / `summary.invalidCount` は INVALID を
  持っていたが、外部importで弾かれた行はWorkspaceへ入らないため
  `evaluateWorkspace()` から見えず、**INVALIDが事実上のdead enum**だった。§18違反。
- **採らなかった案**: 壊れたinputPackageをWorkspaceへ入れてINVALIDを出す。
  Workspaceがauthoritativeに持つ入力は常に妥当なPIP v2でなければならず（AC-03）、
  これをやると `serializeWorkspace()` が壊れた入力を書き出してしまう。
- **決定**: 妥当caseとは**別の層**に、表示専用の診断レコードを持つ。
  - `errorToInvalidResult(error, source)` / `errorsToInvalidResults()` /
    `mergeEvaluationResults(valid, invalid)` を workspace.js のcanonical helperとする。
    index.html側でその場しのぎのINVALID行を組み立てない（§5）。
  - 診断レコードは計算に属する値を**すべてnull**で持つ。
    nullなので summary の max値・governing case へ混ざらない。
  - `ProjectInput` / `GlassCalc` / `WindPressure` / `serializeWorkspace` のいずれにも渡らない。
  - TSV importはWorkspaceへ**追加**するので診断も追加、
    Workspace JSON importはWorkspaceを**置き換える**ので診断も置き換える
    （前回importの診断が今のファイルに無い行として居座らないように）。

## D-005 — 二段階目の失敗には安定したfieldを返す（§9）

`parseTsv` を通った後、既存ProjectInputのvalidationで落ちることがある
（glass type / 寸法範囲 / extraFactor / 圧力contract / wind contract）。

- 判定ロジックをworkspace.js側へ複製すると契約が二重になり必ずズレる。
- error textを正規表現で切り分けるのは脆い。

したがって `field: 'project_input'` という**安定した上位field**を返す（§9-A）。
`field: null` は、fieldに属しようがない構造的失敗のために残す。

## D-006 — 診断メッセージは workspace.js の出口でsanitizeする（独立検証 F1）

- **指摘（正当）**: validatorの例外メッセージは落ちた**値そのもの**を引用符で埋め込む。
  `unsupported glassType: "SECRET-PROJECT-DWG-A1023"` がそのまま画面に出て、
  さらに**エクスポートされたCSVに書かれていた**。CSVは共有されるファイルなので、
  ここが実際のegress pathである。3000文字のセルは3075文字の診断になった（上限なし）。
- **自分のテストが見逃した理由**: `tests/workspace.test.js` の該当テストは
  secretを `glass_type` 列に置きながら、行は**別の列**（`mode` / `width_mm`）で
  落ちるように組んでいた。そのためsecretセルはvalidatorに到達せず、
  「他セルを貼り付けていない」ことしか確認していなかった。
  **漏れを避けて書かれたテスト**だった。落ちる列そのものにsecretを置くよう直した。
- **決定**: sanitizeは `parseTsv` / `addTsvRows` / `deserializeWorkspace` の
  **出口1か所ずつ**で行い、生のvalidatorメッセージがworkspace.jsの外へ出ないようにする。
  引用部分は、このシステム自身が定義している語彙（列名 / enum値 / ガラス種別 /
  既知の拒否field名）に一致するときだけ残し、それ以外は伏せる。全体長にも上限を設ける。
- **最初に採った形が不十分だった点**: 当初は `errorToInvalidResult` だけでsanitizeしたが、
  実機確認でUIのstatus行が**生のreasonを表示していた**。
  表示側それぞれでsanitizeする設計は、必ずどこか1つ忘れる。
  出口へ移した（Phase 2Fで学んだ「経路ではなく結果を検査する」と同じ形）。
- **この境界が保証しないこと**: 既知語彙に一致する短い文字列は残る。
  「利用者の入力が絶対に出ない」ことの保証ではなく、
  **無制限に出ることを止め、既知語彙以外を伏せる**ための境界である。

## D-007 — 必須列の欠落はその列名を報告する（独立検証 F2）

mode固有の必須列チェックは `currentField` を更新せずにthrowしていたため、
直前に触った列（`extra_factor`）が原因として報告されていた。
`basis` が必須なのは安全上の判断（D-005と同じ理由）なので、
そこで誤った列を指すのは最も避けたい種類のズレである。throw前に `currentField` を設定する。

## D-008 — 診断helperは自分の契約を呼び出し側に委ねない（独立検証 F4）

`errorToInvalidResult()` は「INVALID行を作る唯一の正規経路」と位置づけているのに、
`label` を検証せず素通ししていた。実際の producer 2つは `normalizeLabel` 済みの値しか
渡していなかったが、それは**規約であって強制ではない**。
Phase 2F D-013の一般形（構築時だけ成立する契約は実質advisory）をここにも適用し、
helper自身が `normalizeLabel` を通す。
