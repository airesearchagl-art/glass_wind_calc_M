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

## D-004 — Research GateをHuman提供Evidenceで成立させる（BLOCKED解除）

- **状況**: Wave 1で実行環境から一次資料へ到達できずBLOCKEDとなった（D-002）。
  Humanがoption (b)を選択し、外部で独立に確認した一次資料の内容を提供した。
- **決定**: Research Gateを `ESTABLISHED_FROM_HUMAN_SUPPLIED_PRIMARY_EVIDENCE` として成立させ、
  Wave 2以降を再開する。
- **provenanceの明示**: `human_supplied_primary_evidence`。
  **本実行環境が当該文書を取得したとは主張しない。** §1.3の403記録は事実として保持する。
- **これが該当しないもの**: memory-only implementation / WebSearchスニペット実装 /
  Hard Gate waiver のいずれでもない。Task Packet §14が認める「Human提供Evidence」の経路である。
- **不採用を維持するもの**: モデルの記憶、WebSearchスニペット（D-003を維持）。
  blocked hostへの再試行およびegress policyの変更は行わない。
- **digest確認**: 再開前にTask Packet digestを再hashし
  `137e9cde…185f` と一致することを確認済み。

## D-005 — 算定基準を notification_baseline / itakyo_recommended に二分する

- **状況**: 再現期間係数 y は**板硝子協会の推奨**であり、告示の最低基準ではない。
- **決定**: 算定基準を明示的に2つ持つ。
  - `notification_baseline`: y = 1.00 固定（`recurrenceYears: null`）
  - `itakyo_recommended`: y を 50 / 100 / 200 / 300 / 500年 から**明示選択**
- **禁止**: `y > 1.00` への暗黙のdefault。基準はtraceに必ず記録する。
- **理由**: 業界推奨を法的要求へ格上げしないため（Task Packet §11）。
  基準を混ぜると「告示準拠」と「協会推奨」の区別が消え、後から追跡できなくなる。

## D-006 — 粗度区分 IV → III の読み替えを「入力」と「計算」の二層で保持する

- **状況**: 板硝子協会の指示により、板ガラスでは粗度区分IVのとき区分IIIの数値を用いる。
- **決定**: ユーザー入力を書き換えない。traceに両方を保持する。
  - `inputRoughnessCategory: 'IV'`（ユーザーが入力したまま）
  - `calculationRoughnessCategory: 'III'`（Zb=5 / ZG=450 / α=0.20）
  - 読み替えが発生したことを示すフラグと説明をtraceへ載せる
- **理由**: silent rewriteは追跡可能性を壊す。第三者が後から
  「なぜIVなのにIIIのパラメータなのか」を追えることがPhase 2Eの目的そのものである。
- **注**: 1454号表のIV行（Zb=10 / ZG=550 / α=0.27）は**表としては保持する**が、
  板ガラス計算では到達しない。表の出典を残しつつ読み替え規則を明示するため。

## D-007 — V0 の自治体別lookupを実装しない

- **決定**: Phase 2E v1では自治体別V0 lookupを実装しない。V0は明示的入力とする。
- **理由**: 全国のV0表と現行の自治体名・対応関係を**部分的に**encodeすると、
  「一部は正しい」テーブルになり、実装しないことより危険である（D-003と同じ判断基準）。
- **検証**: 有限 / 正 / 保守的hard boundsを文書化して適用する。
  式がverifiedであることを理由にV0をverified扱いしない。

## D-008 — Project Input Package を v2 へ上げ、traceではなく windInput を保存する

- **決定**: `schemaVersion` を 2 へ上げ、`windInput`（告示風圧計算の入力条件）を任意フィールドとして追加する。
  **算定済みのtrace・中間値・結果はpackageへ保存しない。**
- **理由**:
  1. traceを保存すると「payloadが主張する中間値」を信用する経路ができる。
     Phase 2Dが `designPressure` に対して確立した「常に再計算し、主張値を信用しない」契約と
     同じ思想を風圧側にも適用する（AC-18）。
  2. 入力だけを保存すれば、traceは常に検証済みの式から導出される。
     改竄された正圧・負圧・中間値は構造的に取り込まれない。
  3. payloadが小さくなり、replayが「再現」ではなく「再計算」になる（AC-08の本来の意味）。
- **実装**:
  - `windInput` がある場合、`positivePressure` / `negativePressure` は
    payload値を**読まず** wind-pressure.js の算定結果で決定する。
  - `windTraceFor(pkg)` が必要時に `windInput` からtraceを再計算する。
  - `windInput` を持てるのは `notification_calculation` と `imported_unverified` のみ。
    `registered_preset` / `manual` は持てない。
  - `notification_calculation` は `windInput` 必須。
- **migration（AC-09）**:
  - v1 package は受理し、`windInput: null` のv2として決定的に正規化する。
  - v1 package が `windInput` を持つことは矛盾なので拒否する。
  - 3以上の未知versionは silent reinterpretation せず fail closed で拒否する。
  - v1の既存export/import挙動（計算値・candidate一覧）は変わらない。

## D-009 — 取り込んだ風圧packageもtrust downgradeを受ける

- **決定**: import時に `sourceKind` は従来どおり `imported_unverified` へ強制downgradeされるが、
  `windInput` は保持し、traceは再計算できるようにする。
- **理由**: 式のverified性と入力のverified性は独立である（AC-04）。
  取り込んだ風条件はunverifiedだが、それを**検証済みの式**で評価した結果を表示することには意味がある。
  逆に、取り込んだpackageがverified provenanceや案件ラベルを主張しても採用しない。
