# QUALITY_DEBT — LR-20260918-GLASS-P2D

```yaml
quality_debt:
  enabled: true
  allow_defer_noncritical_checks: false
  allow_defer_external_preview: false
  allow_defer_flaky_noncritical_test: false
  high_risk_debt_blocks_final_verify: true
```

本CampaignはLONG_RUN（ENDURANCEではない）。検証不能項目を安易にDebtへ送って継続しない。

## Hard Gate — Debt化禁止

以下の実Failureは Quality Debt / `accepted_by_human` / waiver / retry で継続可能状態へ変換しない。
発生時は `HARD_GATE_FAILURE` として即 `BLOCKED` へ遷移し、implementation writeとindependent-task continuationを停止してHumanへEscalationする。

```text
Security
Privacy
Authentication
Permission
Data integrity
Irreversible data
Secret exposure
Trust-boundary bypass
Verified-state spoofing
```

## Open items

```text
none
```

## Resolved items

```text
none
```

## 記録された制約（Debtではない）

### register_repo_root の拒否

Vault側のCLAUDE.md / skillsを自動ロードさせる `register_repo_root` tool呼び出しが、実行環境のauto-mode classifierにより拒否された（理由: Auto-Mode Bypass）。

tool自身の案内どおり、回避策を取らずに該当canonical文書を直接Readして代替済み。canonical Routeの適用に支障はないため、Quality Debtとしては計上しない。Vaultは読み取りのみで、書き込みは行っていない。
