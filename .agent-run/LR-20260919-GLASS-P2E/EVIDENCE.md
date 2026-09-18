# EVIDENCE — LR-20260919-GLASS-P2E

本ファイルはpublic-safeに保つ。private document name / private ID / internal path /
session ID / secret / credential / formal confidential identityは記載しない（AC-19）。
**official public source URLは記載可**（AC-19明記）。

---

## 1. Research Gate（Wave 1）

状態: **NOT_ESTABLISHED — 一次資料へ到達できず**

確認日: 2026-09-18

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
