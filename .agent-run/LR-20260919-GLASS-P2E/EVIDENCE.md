# EVIDENCE — LR-20260919-GLASS-P2E

本ファイルはpublic-safeに保つ。private document name / private ID / internal path /
session ID / secret / credential / formal confidential identityは記載しない（AC-19）。
**official public source URLは記載可**（AC-19明記）。

---

## 1. Research Gate（Wave 1）

状態: **未実施**

Wave 1で以下を一次資料から確認し、本セクションへ記録する。

```text
source title
publisher
public URL
確認日
採用する式
採用する係数
適用範囲
未確認事項
```

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
