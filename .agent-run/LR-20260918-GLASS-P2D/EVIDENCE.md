# EVIDENCE — LR-20260918-GLASS-P2D

Campaignが依拠する事実と、その確認方法。詳細な根拠テキストは `project-config/miyoshi.js` および `README.md`「Evidence Status」を正とする。

## Miyoshi project facts（Task Packet §7、変更禁止）

| 項目 | 値 | verificationStatus | evidence.level |
|---|---|---|---|
| V0 | 34 m/s | verified | primary |
| roughnessCategory | III | verified | primary |
| positivePressureByFloor.1 | 1297 N/m² | partially_verified | indirect |
| positivePressureByFloor.2 | 1525 N/m² | partially_verified | indirect |
| positivePressureByFloor.3 | 1695 N/m² | partially_verified | indirect |
| positivePressureByFloor.R | 1729 N/m² | partially_verified | indirect |
| negativePressureByZone.general | 918 N/m² | partially_verified | indirect |
| negativePressureByZone.corner | 1122 N/m² | partially_verified | indirect |
| dimensions.defaultW | 1250 mm | unverified | none |
| dimensions.defaultH | 2050 mm | unverified | indirect |

`dimensions.mode = sample_default` / `dimensions.status = unverified` を維持し、1250×2050をverified pane dimensionへ昇格させない。

## Explicit unresolved evidence（Task Packet §8）

```text
1. ガラス1枚の実見付W/H
2. 階別正圧 1297 / 1525 / 1695 / 1729 の元計算書
3. 負圧 918 / 1122 の元計算根拠
4. 各階評価高さZとpresetのexact mapping
```

Phase 2D開始時点で、repository内にこれらを解決する新Evidenceは存在しない。推測でverifiedへ昇格させない。

## Trust model（Phase 2Dで導入する区別）

Phase 2Dでは入力の出自（sourceKind）ごとに信頼度を分離する。

```text
registered_preset   : repository内のbuilt-in configのみが持てる。verified stateを保持できる。
manual              : ユーザーがその場で入力した値。常にunverified。
imported_unverified : 外部から取り込んだpackage。payloadが何を主張していてもverifiedとして扱わない。
```

imported payloadからMiyoshiのverified provenanceを偽装できないことを、Wave 3以降のtestで確認する。

## Wave 0 baseline evidence

```text
Fresh Gate : origin/main == 97bc18e53c7d3a86b3f180f408e265fec3cf5117（実測、期待値と一致）
             working tree clean / tracked 0 / untracked 0
baseline   : npm test → 91 pass / 0 fail
             calc 23 / manual-config 19 / project-config 43 / ui-mode-separation 6
node       : v22.22.2
```
