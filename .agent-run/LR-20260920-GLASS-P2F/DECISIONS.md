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
