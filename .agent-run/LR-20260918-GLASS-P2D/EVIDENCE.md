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

## Phase 2D実装後のevidence（Wave 1〜5）

### Miyoshi facts（無変更であることの確認）

`tests/project-config.test.js`（43件）が、V0=34 / roughness III / 階別正圧 1297・1525・1695・1729 / 部位別負圧 918・1122 / 既定寸法1250×2050 / `dimensions.mode='sample_default'` / `dimensions.status='unverified'` / defaultW `unverified`+`none` / defaultH `unverified`+`indirect` をすべて固定している。Phase 2Dでこれらの値・`verificationStatus`・`evidence` を変更していない。1250×2050をverified pane dimensionへ昇格させていない。

Phase 2Dで `miyoshi.js` に加えた変更は、registered presetマーカー `hasFixedPreset: true` の追加と、実態に合わせたコメント同期のみ。

### calculation core purity

`calc.js` のexportは18件で、案件固有定数は含まれない（requireして `undefined` であることを確認）。ソースに `MIYOSHI` / `Miyoshi` / `みよし` / 階別・部位別風圧値 / 案件既定寸法 / `verificationStatus` / `evidence` のいずれも存在しない（grep 0件）。`tests/calc.test.js` のcore purityテスト2件が継続的に検査する。

### trust boundaryのevidence

| 攻撃 | 結果 |
|---|---|
| payloadが `sourceKind: registered_preset` を主張 | `imported_unverified` へdowngrade（node test + ブラウザ実機） |
| payloadが `verificationStatus: verified` を主張 | `unverified` へdowngrade |
| payloadが案件ラベルを主張 | 中立ラベルへ置換、`sourceId` もnull |
| 取り込んだpackageをregistryへ登録 | 例外で拒否 |
| `__proto__` / `prototype` / `constructor` | 拒否。prototype pollutionなし |
| HTMLタグ / `javascript:` スキーム | 拒否。ブラウザ実機でscript未実行 |
| 16KB超payload / 深さ8超 / 不正JSON | 拒否 |

### 計算回帰のevidence

```text
Miyoshi FL6 W=1250 H=2050 2F general factor=1.00 → 1756.09756 N/m² / designP 1525 → OK
Miyoshi FL6 W=1500 H=2050 2F general factor=1.00 → 1463.41463 N/m² / designP 1525 → NG
Manual  W=1250 H=2050 positive=1400 negative=-1000 → designP 1400
Export → Import roundtrip: 計算に用いる全フィールドと候補一覧（先頭構成・許容風圧）が一致
```

いずれもnode test（128 pass / 0 fail）とブラウザ実機（Playwright / Chromium / file://）の双方で確認済み。

### Explicit unresolved evidenceの状態

Phase 2D開始時と変わらず未解決のまま。実見付W/H・階別正圧の元計算書・負圧の元計算根拠・評価高さZとのmappingについて、repository内で新たなEvidenceは得られておらず、推測でverifiedへ昇格させていない。
