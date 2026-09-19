# EVIDENCE — LR-20260919-GLASS-P2E

本ファイルはpublic-safeに保つ。private document name / private ID / internal path /
session ID / secret / credential / formal confidential identityは記載しない（AC-19）。
**official public source URLは記載可**（AC-19明記）。

---

## 1. Research Gate（Wave 1）

状態: **ESTABLISHED_FROM_HUMAN_SUPPLIED_PRIMARY_EVIDENCE**

- 初回試行日: 2026-09-18（実行環境から一次資料へ到達できずBLOCKED）
- Evidence受領日: 2026-09-19（Human decision option (b)）

### 0. Provenance（最重要）

```yaml
provenance: human_supplied_primary_evidence
verified_by: Human（本実行環境の外部で、public primary / official-industry sourcesに対して独立に確認）
fetched_by_this_execution_environment: false
basis_rejected: [model_memory, websearch_snippets]
hard_gate_waiver: false
```

**本実行環境が当該文書を取得したとは主張しない。** 実行環境は依然として
対象hostへ到達できない（§1.3の403記録は事実として保持する）。
Humanが外部で独立に確認した一次資料の内容を受領し、それを実装根拠として採用した。

これはmemory-only実装でもWebSearchスニペット実装でもHard Gate waiverでもない。
Task Packet §14が認める「Human提供Evidence」の経路である。

### 1.1 結果サマリ

Task Packet §5が要求する「公式一次資料の直接確認」は、**本実行環境から達成できなかった**。
候補となる一次資料はすべて特定できたが、**すべてのhostがegress policyにより403で拒否**された。

したがってTask Packet §5の規定により、風圧式・係数・適用条件に依存する
implementationは **BLOCKED**。推測実装は行っていない。

### 1.2 特定した一次資料（public URL。AC-19により記載可）

| # | source title | publisher | public URL | 到達 |
|---|---|---|---|---|
| A-1 | 平成12年5月31日建設省告示第1454号「Eの数値を算出する方法並びにVo及び風力係数の数値を定める件」 | 建築研究所（掲載） | `https://www.kenken.go.jp/japanese/research/lecture/h16/slide/06-1/ref/No6.htm` | **403 blocked** |
| A-2 | 同上（法令本文） | e-Gov 法令検索 | `https://elaws.e-gov.go.jp/` | **403 blocked** |
| A-3 | 風圧力を算定する基準(地表面粗度区分)の合理化（平成12年建設省告示第1454号） | 国土交通省 | `https://www.mlit.go.jp/jutakukentiku/build/content/H12-1454.pdf` | **403 blocked** |
| A-4 | 日本法令索引（告示1454号） | 国立国会図書館 | `https://hourei.ndl.go.jp/simple/detail?lawId=0000087076` | **403 blocked** |
| B-1 | 平成12年5月31日建設省告示第1458号「屋根ふき材及び屋外に面する帳壁の風圧に対する構造耐力上の安全性を確かめるための構造計算の基準を定める件」 | 建築研究所（掲載） | `https://www.kenken.go.jp/japanese/research/lecture/h16/slide/06-1/ref/No1.htm` | **403 blocked** |
| C-1 | 5章 板ガラスの強度と安全 / 5-1 板ガラスの耐風圧設計 | 板硝子協会 | `https://glass-wonderland.jp/cms/wp-content/uploads/2020/10/2024_g05_039-_2503.pdf` | **403 blocked** |
| C-2 | 告示第1458号適用除外部分の風圧力基準設定について | 日本サッシ協会 | `https://www.jsma.or.jp/Portals/0/images/useful/technology/07-0023.pdf` | **403 blocked** |
| C-3 | 告示1458号の解説 | 一般財団法人 日本建築総合試験所(GBRC) | `https://www.gbrc.or.jp/assets/documents/gbrc/GBRC177_857.pdf` | **403 blocked** |

### 1.3 Block の性質（実測）

```text
egress proxy: policy-enforcing gateway
観測: 上記全hostへのCONNECTが gateway 403（policy denial）
proxy status endpoint の recentRelayFailures に
  kind: connect_rejected / detail: "gateway answered 403 to CONNECT (policy denial or upstream failure)"
として記録されている。
対照: en.wikipedia.org も同様に403。github.com 系のみ到達可能。
```

実行環境のproxy README は「403/407 はorganization egress policyによる拒否であり、
retryや迂回をせず報告すること」と明示している。したがって**迂回を試みていない**。

canonical Routeの分類では、これはHard Checkの `tool unavailable` に該当し、
**実際の安全Failureを示す `HARD_GATE_FAILURE` とは区別される**。
ただし当該CheckがPASSするまで `COMPLETE_VERIFIED` にはできない。

### 1.4 採用しなかった代替根拠（重要）

以下はいずれも**一次資料ではない**ため、Research Gateの根拠として採用しない。

| 代替候補 | 不採用の理由 |
|---|---|
| WebSearchの検索結果スニペット | 第三者による要約・断片であり原文ではない。係数表（Zb / ZG / α / Gf / Cpe）の**完全な表を復元できない**。部分的・推測的な係数表を安全性計算へ実装することは危険 |
| 本repositoryのREADME / `calc.js` のコメント | repository内コンテンツであり一次資料ではない（D-001） |
| Obsidian Vault | 実測の結果、風圧・告示・地表面粗度に関する資料を**1件も保持していない**（395 markdown中0件、添付PDFなし） |
| モデルの記憶 | Task Packet §5が明示的に禁止 |

### 1.5 Research Gate由来の付随finding（Humanへ報告）

本repositoryの `README.md` に、告示1458号のCpe値として
**「H≦45m：一般部 -1.8 ／ 隅角部 -2.2」** という記述が既に存在する（既存コンテンツ）。
この記述は案件の負圧値からの **逆算** として導入されたものであり、
Phase 2Eが要求する一次資料確認を経ていない。

Phase 2Eの基準を適用するなら、この値は現時点で `UNVERIFIED` に分類される。
本Campaignはscope外のため**変更していない**が、Research Gateが成立した際に
最優先で照合すべき項目として記録する。

### 1.6 Research Gateが成立した場合に確認すべき項目

```text
[告示1454号]
  E = Er^2 * Gf の定義
  Er の算定式（H <= Zb / H > Zb の場合分け）
  地表面粗度区分 I / II / III / IV ごとの Zb / ZG / α の値（完全な表）
  Gf（ガスト影響係数）の完全な表
  H（建築物の高さと軒の高さとの平均）の定義
  Vo の定義と範囲

[告示1458号]
  帳壁に対する風圧力 W の算定式
  平均速度圧 q の定義
  ピーク風力係数 Cf の定義（外圧係数 Cpe と内圧係数 Cpi の合成規則）
  帳壁（外壁）の Cpe 値と zone 規則（一般部 / 隅角部の定義と適用範囲）
  内圧係数の規則（閉鎖型 / 開放型）
  ガラスに関する規定

[板硝子協会]
  4辺支持板ガラスの耐風圧強度計算法の式
  k1（種類・厚さ別）の完全な表
  複層ガラスの k2 の式と適用範囲
  適用範囲（厚板/薄板比など）
```

これらが**完全な表として**確認できるまで、対応するimplementationは行わない。

### Hard rule（Task Packet §5）

一次資料で直接確認できなかった以下を推測実装しない:

```text
式 / 係数 / zone rule / height rule / internal pressure rule / roughness rule
```

確認不能な部分は `UNVERIFIED` または `NOT_IMPLEMENTED` として明示する。

### 既存コメントの扱い

既存 `calc.js` には告示1458号式がコメントとして書かれているが、
**repository内のコメントは一次資料ではない**。Research Gateの根拠として採用しない
（D-001）。

---

## 2. Baseline（Wave 0実測）

```text
base: a26714c6dd2d8bca80e18fcf1e97d7d184c9254f
npm test: 133 pass / 0 fail
  tests/calc.test.js               27
  tests/manual-config.test.js      19
  tests/project-config.test.js     43
  tests/project-input.test.js      33
  tests/ui-mode-separation.test.js 11
node: v22.22.2
```

---

## 3. Protected invariants（Phase 2Eで変更しない）

Task Packet §12 / §13 のとおり。Wave進行中に再実測して不変であることを確認する。

```text
P = (300 × k1 × k2 / A) × (t + t²/4)
FL k1 既存値 / single k2 = 1.0 / IGU formula既存 / K2 ratio cap 2.0
IGU applicability: thick/thin > 2.5 は自動推奨除外
TP 既存k1 / thickness support / Low-E は coating属性 / extraFactor default 1.00

Miyoshi: V0=34 / roughness III / positive 1297,1525,1695,1729 / negative 918,1122
         dimensions 1250×2050 sample_default / verification states 既存値維持
```

---

## 4. 採用する式・係数（Human-supplied primary evidence / 2026-09-19受領）

`provenance: human_supplied_primary_evidence`（§1.0）。以下がPhase 2Eの実装根拠である。

### 4.1 Source A — 国土交通省「風圧力を算定する基準（地表面粗度区分）の合理化（平成12年建設省告示第1454号）」

確認事項:

```text
地表面粗度区分は I / II / III / IV の4区分
改正後は都市計画区域の内外を問わず統一された概念
区分 I / II / IV は所管特定行政庁が指定する場合に適用される
```

**実装上の帰結**: 粗度区分を住所・都市計画区域の状態から自動推定してはならない。
`roughnessCategory` は明示的入力とする。Phase 2Eでは位置情報に基づく自動分類を実装しない。

### 4.2 Source B — 建築研究所（告示1454号 / 1458号の本文再掲）

告示1454号から確認:

```text
E = Er^2 × Gf

Er:  H <= Zb のとき   Er = 1.7 × (Zb / ZG)^α
     H >  Zb のとき   Er = 1.7 × (H  / ZG)^α
```

1454号のパラメータ:

| 粗度区分 | Zb [m] | ZG [m] | α |
|---|---:|---:|---:|
| I | 5 | 250 | 0.10 |
| II | 5 | 350 | 0.15 |
| III | 5 | 450 | 0.20 |
| IV | 10 | 550 | 0.27 |

**重要**: 構造骨組用の関係式 `E = Er² × Gf` を、外装材・ガラスの平均速度圧算定
（§4.3）と混同してはならない。Phase 2Eのガラス／帳壁はSource Cの契約を用いる。

### 4.3 Source C — 板硝子協会「帳壁に用いる板ガラスの風圧力計算法 / 4辺支持板ガラスの耐風圧強度計算法」

Phase 2Eのガラス／帳壁 Wind Pressure Trace Engineの主たる実装根拠。

#### 設計風圧

```text
W = qBar × CfPeak            [N/m²]

designPressure = max(abs(positivePressure), abs(negativePressure))
中間値は丸めない。丸めは表示時のみ。
```

#### 平均速度圧

```text
qBar = 0.6 × Er^2 × (V0 × y)^2
```

`V0`: 基準風速 [m/s]。`y`: 再現期間係数。

協会推奨の再現期間係数:

| 再現期間 | y |
|---:|---:|
| 50年 | 1.00 |
| 100年 | 1.07 |
| 200年 | 1.15 |
| 300年 | 1.19 |
| 500年 | 1.25 |

**基準の分離（必須）**: 再現期間係数は**協会推奨**であって告示の最低基準ではない。
2つの算定基準を明示的に実装する:

```text
A. notification_baseline : y = 1.00 固定
B. itakyo_recommended    : y を 50/100/200/300/500年 から明示選択
```

`y > 1.00` へ暗黙にdefaultしてはならない。traceはどちらの基準を用いたかを明示する。

#### Er（板ガラス用）

```text
H      = (buildingHeightM + eavesHeightM) / 2     建築物の高さと軒の高さの平均 [m]
HPrime = max(H, Zb)
Er     = 1.7 × (HPrime / ZG)^α
```

階ラベルからHやZを推定してはならない（AC-11）。

#### 粗度パラメータ（板ガラス）

上記1454号表と同値。ただし協会の指示により:

```text
板ガラスでは、地表面粗度区分が IV の場合、区分 III の数値を用いる。
```

**実装上の帰結**: 入力を書き換えず、両方をtraceに保持する。

```text
inputRoughnessCategory       = IV
calculationRoughnessCategory = III   (Zb = 5, ZG = 450, α = 0.20)
```

#### 評価高さ Z

```text
Z = 地上からのガラス／壁部分の高さ [m]  — 明示的入力
```

階 → Z の推定は行わない。`Z <= 0` / NaN / Infinity は拒否。
一次資料が定めていない H との上限関係を発明しない。

#### 正圧側 外圧ピーク係数

外圧ピーク係数は **`CpePositive × GpePositive`（積）** である。

```text
externalPeakPositive = CpePositive × GpePositive

CpePositive:
  H <= 5                    -> 1.0
  H >  5 かつ Z <= 5        -> (5 / H)^(2α)
  H >  5 かつ Z >  5        -> (Z / H)^(2α)
```

`GpePositive`:

| 粗度区分 | Z <= 5 | Z >= 40 |
|---|---:|---:|
| I | 2.2 | 1.9 |
| II | 2.6 | 2.1 |
| III | 3.1 | 2.3 |

`5 < Z < 40` は両端点間を線形補間。板ガラスの区分IVはIIIの値を用いる。

#### 負圧側 外圧ピーク係数（Cpe × Gpe が一体の表値）

| H | 一般部 | 隅角部 |
|---|---:|---:|
| H <= 45 m | -1.8 | -2.2 |
| H >= 60 m | -2.4 | -3.0 |

`45 < H < 60` は両端点間を線形補間。

**README既存記述について**: READMEにあった「H≦45m：一般部 -1.8／隅角部 -2.2」は、
本Evidenceにより**一次業界資料に裏付けられた**。今後「逆算により得た」とは記述しない。
ただしこれは**係数表が検証されたこと**のみを意味し、
Miyoshi presetが特定のH/Z条件で算定されたことを検証するものではない。

#### 内圧ピーク係数（CpiGpi）

| 建物種別 | 外圧が正のとき | 外圧が負のとき |
|---|---:|---:|
| 閉鎖型 (closed) | -0.5 | 0 |
| 開放型 (open) | -1.2 | 1.5 |

#### ピーク風力係数

```text
CfPeak = externalPeakCoefficient − internalPeakCoefficient
```

正圧・負圧を**別々に**算定する。符号の意味を統合しない。

#### 隅角部の幾何

```text
b            = 建物平面の短辺 [m]
aPrime       = min(b, 2 × H)
cornerStrip  = 0.1 × aPrime
```

`zone = general | corner` はUI入力とする。corner選択時はcornerStrip幅を表示する。
図面からの自動point-in-zone判定はPhase 2Eのscope外。

### 4.4 適用範囲に関する表現規則（§11）

```text
法令上の適用範囲（告示の最低基準）
  vs
板硝子協会が推奨する設計手法
```

これらを混同しない。「すべての建物・すべての壁に法的に必須」とは記述しない。
「告示1458号系算定」「板硝子協会推奨による帳壁ガラス設計風圧」等の表現を用いる。
業界推奨を法的要求へ格上げしない。

### 4.5 V0 の扱い

```text
Phase 2E v1 では自治体別V0 lookupを実装しない。V0は明示的入力。
理由: 全国のV0表と現行の自治体名・対応関係を部分的にencodeすべきでないため。
検証: 有限 / 正 / 保守的に選んだhard boundsを文書化。
式がverifiedであることを理由にV0をverified扱いしない。
```

Miyoshi diagnosticでは、既にverified/primaryである2つの事実
（`V0 = 34 m/s`、`roughness III`）のみregistered presetから投入してよい。
それ以外のMiyoshi風条件は現時点でverifiedではないため自動投入しない。

### 4.5b ツール側の入力検証（一次資料の規則ではない）

以下は**一次資料が定める算定規則ではなく、本ツールが入力誤りを弾くために設けた境界**である。
いずれもfail closed（拒否するだけで、黙って値を調整しない）。

| 検証 | 値 | 位置づけ |
|---|---|---|
| `V0` のhard bounds | 1 〜 200 m/s | §4.5が認める「保守的に選んだhard bounds」。範囲内でもverifiedを意味しない |
| 高さ系のhard bounds | 0 < x ≤ 2000 m | 実在しない値・入力誤りを弾くためのツール側境界 |
| `eavesHeightM <= buildingHeightM` | — | 物理的整合性のチェック。**一次資料が定めた規則ではない** |

**一次資料が定めていない関係は発明していない。** 特に `Z <= H` のような上限関係は課していない
（§4.3の指示どおり）。`Z = 500, H = 10` のような入力も算定式どおりに処理される。

### 4.6 検証状態の分離（§13）

```text
formulaVerificationStatus : verified_primary_source
inputVerificationStatus   : user_input_unverified（またはpreset固有の既存status）
calculationStatus         : calculated
```

式がverifiedであることは、ユーザー入力（V0 / roughness / 建物高さ / 軒高 / Z /
建物種別 / zone / b）をverifiedへ昇格させない。

### 4.7 Known-answer（synthetic formula check）

```text
roughness III / V0 = 34 / H = 14.2 / notification_baseline (y = 1.00)

Er    = 0.8516557589672942
qBar  = 503.08024004410464   N/m²

閉鎖型・H<=45・負圧:
  一般部 Cf = -1.8  ->  -905.5444320793884  N/m²
  隅角部 Cf = -2.2  -> -1106.7765280970302  N/m²
```

本実行環境で上記4値を独立に再計算し、**すべてIEEE-754で厳密一致**することを確認した
（2026-09-19）。

注: JavaScriptの既定表示では一般部圧力は `-905.5444320793883` と印字されるが、
これは同一doubleの最短round-trip表現であり、供給値 `-905.5444320793884` と
ビット等価である（`===` で true）。

**これはsynthetic formula checkであり、`H = 14.2` をMiyoshiの検証済み平均高さとは呼ばない。**
上記の算定値（-905.54 / -1106.78）はMiyoshi preset（-918 / -1122）の置換ではない。
両者の差（約 -1.4%）はcomparison modeで可視のまま残す。
