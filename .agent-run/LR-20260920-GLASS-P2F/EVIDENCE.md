# EVIDENCE — LR-20260920-GLASS-P2F

本ファイルはpublic-safeに保つ（Task Packet §5）。
private Drive URL / private file ID / SharePoint URL / private Notion URL /
internal file path / private filename / drawing number / staff name /
client formal identity / building formal confidential identity / session ID /
credential / secret / raw private document excerpt / private document hash
は**一切記載しない**。

記録してよいのは:

```text
public-safe derived fact
verification status
evidence level
checkedAt
public-safe description
privateReferenceAvailable boolean
generic source category
official public source URL
```

---

## 1. Evidence availability determination（Wave 0実測）

状態: **UNAVAILABLE — project-specific private Evidenceは本実行環境から利用できない**

確認日: 2026-09-20

Task Packet §6が認めるEvidence sourceを順に確認した。

| source | 結果 |
|---|---|
| **A. Humanが明示的に提供したprivate Evidence** | 本Task Packetに実データの提供はない。PhaseのEvidence機構を定義する指示であり、案件factの値・出典は含まれていない |
| **B. execution environmentへ渡されたlocal/private Evidence** | **なし**。`/home/user` 配下にevidence相当のファイル（PDF / XLSX / CSV / 図面等）は存在しない |
| **C. repositoryに既に存在するpublic-safe verified fact** | **あり**（下記 §2）。V0 / roughnessのみ |
| **D. 公式public source** | Phase 2Eで取得済みのgeneric formula / 係数表。案件固有factは含まない |

### Obsidian Vaultの確認（source B の一部として）

Vaultは read-only で参照した（書き込みは行っていない）。

```text
vault内 project folder: 22件
うち glass_wind_calc に対応するもの: 0件
"glass_wind_calc" を参照するvault file: 0件
```

数値検索（1297 / 1525 / 1695 / 1729 / 918 / 1122 / 1250 / 2050）でヒットした
ファイルはすべて**別プロジェクトのgit commit SHAの部分一致**であり、
本案件のpane寸法・風圧・Z mappingとは無関係であることを内容確認した。

「見付」「評価高さ」を含むvault fileは0件。

### 帰結（Task Packet §23）

Campaignを終了しない。以下は実施する:

```text
generic Evidence Ledger
promotion guard
Verified Case validator
UI Evidence status
tests
privacy boundary
```

**project-specific promotionは行わない。**

```yaml
verifiedCases: []
explicit_unverified_items: 4   # 維持
final_state: COMPLETE_PENDING_FULL_VERIFY
```

Evidence不足をコードで埋めない。

---

## 2. repository内の既存 public-safe verified fact（source C）

Wave 0で実測した現在値。**本Campaignで変更しない。**

| fact | value | verificationStatus | evidence.level | checkedAt | privateReferenceAvailable |
|---|---|---|---|---|---|
| `wind.V0` | 34 m/s | `verified` | `primary` | 2026-09-17 | true |
| `wind.roughnessCategory` | III | `verified` | `primary` | 2026-09-17 | true |
| `wind.status`（階別正圧・部位別負圧） | — | `partially_verified` | `indirect` | 2026-09-17 | — |
| `dimensions.defaultW` | 1250 mm | `unverified` | `none` | null | false |
| `dimensions.defaultH` | 2050 mm | `unverified` | `indirect` | 2026-09-17 | true |
| `dimensions.mode` | `sample_default` | — | — | — | — |
| `verifiedCases` | `[]`（0件） | — | — | — | — |

---

## 3. Explicit unverified items（4件・維持）

```text
1. ガラス1枚の実見付 W/H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m² の元計算根拠
3. 負圧 918 / 1122 N/m² の元計算根拠
4. 各階評価高さ Z とpresetのexact mapping
```

本Campaignでは **いずれもclosureしない**。Evidenceが存在しないため。

### 採用しない根拠（Task Packet §6で明示的に禁止）

| 誘惑される経路 | なぜ採用しないか |
|---|---|
| Phase 2Eの算定値がpresetに近い（約 -1.4%） | 近似一致はEvidenceではない（§13）。MATCHとverifiedは別（§15 / AC-12） |
| presetからZをreverse solveする | reverse calculationはdiagnosticとしては可、Evidenceとしては不可（§6） |
| CW全体高さ 2050 から pane高さを導く | 明示的に禁止（§12 / AC-08） |
| 列全体幅 ÷ 列数 から pane幅を導く | 明示的に禁止（§12 / AC-08） |
| 階高からZを生成する | 明示的に禁止（§14 / AC-10） |

---

## 4. Human Evidence Request Matrix

Evidenceが提供されれば、本Campaignで実装するpromotion gateを通して昇格できる。
**private filename / URL / drawing number は不要**（public-safe factと検証状況のみを記録する）。

| 必要なfact | 必要なEvidence | 現在の状態 |
|---|---|---|
| pane W（ガラス1枚の見付幅） | ガラス**1枚**の見付幅を直接示す一次資料。CW全体幅や列ピッチからの逆算は不可 | `unverified` / `none` |
| pane H（ガラス1枚の見付高さ） | ガラス**1枚**の見付高さを直接示す一次資料。ACW全体高さは不可 | `unverified` / `indirect` |
| 階別正圧（1297 / 1525 / 1695 / 1729） | (A) 一次資料に当該pressure値が直接記載、または (B) 算定inputs（V0 / roughness / 建物高さ / 軒高 / 評価Z / 建物種別 / zone / 算定基準）が直接記載され、Phase 2E Trace Engineで再現でき、sourceとの対応が明示される | `partially_verified` / `indirect` |
| 部位別負圧（918 / 1122） | 同上 | `partially_verified` / `indirect` |
| floor → 評価高さ Z mapping | 1F / 2F / 3F / RF と評価高さの対応が**直接**分かる資料。階高からの生成は不可 | 未確認 |

提供形式の例（public repoへはこの形だけが残る）:

```yaml
factKey: pane_width_mm
value: <値>
unit: mm
verificationStatus: verified
evidence:
  level: primary
  checkedAt: "YYYY-MM-DD"
  publicDescription: "案件一次資料でガラス1枚の見付幅を直接確認"
  privateReferenceAvailable: true
```

---

## 5. Protected invariants（本Campaignで変更しない）

Task Packet §25 / §26 のとおり。Wave進行中に再実測して不変であることを確認する。

```text
glass strength: P = (300 × k1 × k2 / A) × (t + t²/4)
FL k1 / single k2 = 1.0 / IGU formula / K2 cap 2.0 / IGU ratio 2.5 boundary
TP rules / Low-E semantics / extraFactor default 1.00

Wind Pressure Trace:
  Er formula / qBar formula / Cpe × Gpe product
  positive / negative separation / internal coefficients
  roughness IV→III glass rule / recurrence-factor separation

Miyoshi facts:
  V0 34 (verified/primary) / roughness III (verified/primary)
  positive 1297,1525,1695,1729 (partially_verified/indirect)
  negative 918,1122 (partially_verified/indirect)
  dimensions 1250,2050 (sample_default/unverified)
```
