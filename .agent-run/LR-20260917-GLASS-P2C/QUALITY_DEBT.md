# QUALITY_DEBT — LR-20260917-GLASS-P2C

```yaml
quality_debt:
  enabled: true
  allow_defer_noncritical_checks: false
  allow_defer_external_preview: false
  allow_defer_flaky_noncritical_test: false
  high_risk_debt_blocks_final_verify: true
```

本Campaignは標準LONG_RUN（`LONG_RUN_ENDURANCE`ではない）であるため、検証不能項目を安易にQuality Debtへ送って継続することはしていない。

## 記録された制約（Quality Debtではなく、既知の制約として記録）

### Obsidian Vaultへのアクセス不可

Wave 0開始時点で、Task Packetが正本として指定した以下のObsidian Vault文書を読み込むことができなかった。

```text
02_Prompts/LLM_IDE/Long_Run_Development_Route.md
03_Templates/Long_Run_Task_Packet.md
02_Prompts/LLM_IDE/Implementation_Task_Prompt.md
02_Prompts/LLM_IDE/Claude_Code_Capability_Tier_Orchestration.md
Documentation_Sync_Handoff.md
```

理由: `airesearchagl-art/obsidian-vault`リポジトリの`add_repo`呼び出しが、実行環境側の"Claude Code auto mode classifier"により「[PII Data Handling]」を理由に拒否された。ツール自身の案内に従い、回避策（別ルートでのアクセス試行等）は取らなかった。

この制約は、**Hard Checkの合否には影響していない**。Hard Check（Privacy/Disclosure、Calculation integrity、Evidence integrity、Git authority）はいずれもrepository自身の状態・`node --test`・grep・ブラウザ確認によって独立に検証可能であり、実際にすべてPASSしている（RUN_STATE.md参照）。したがってこの制約をQuality Debtとして計上する必要はないと判断した。Task Packet自体が自己完結的にAcceptance Criteria・Prohibited scope・Hard Checksを明記しており、Vault文書がなければ実装・検証ができない設計にはなっていない。

### Run Artifactの遅延作成

Wave 0の時点でRun Artifact（`.agent-run/LR-20260917-GLASS-P2C/`）を作成しなかった。これはQuality Debtとして先送りしたのではなく、単純な作業漏れである。Consolidated Closure Wave（RF-04）で、当時作成されなかった事実を隠さずに透明に復旧した（詳細はRUN_MANIFEST.md「Run Artifact recovery notice」およびDECISIONS.md参照）。

## Deferされた項目

```text
none
```

Quality Debtとして意図的に先送りされた項目はない。
