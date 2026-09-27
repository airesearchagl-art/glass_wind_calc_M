# P2K-F08 — loose assert.throws triage（Human Gate §7–§11）

## 候補集団の定義と、検証者の「18」との差

```text
定義        : tests/ 内の assert.throws のうち引数が 1 つだけのもの
              （失敗を特定する matcher が無い）
実測        : 49 箇所 / 5 file / 25 test block / 連続行を 1 件と数えても 31
検証者の報告: 18
```

検証者は 13 箇所を名指しで挙げているが、合計 18 になる数え方は
**再現できなかった**。推測で 18 を選ぶと実在の欠陥を落としかねないので、
**同じ基準を完全に適用した 49 件全部** を triage した。
これは名指しされた 13 をすべて含む超集合であり、基準を拡げてはいない。

## 判定方法

assert.throws を preload で wrap し、全 49 箇所が実際に投げている message を
108 回分記録した。判定 C（意図した guard を消しても別の throw で通るか）は
疑わしい 2 件について **実際に guard を消して測定**した。読んだ判断ではない。

## 内訳

```text
BENIGN        43
AMBIGUOUS      4
REQUIRED_FIX   2
合計          49   —— untriaged 0
```

## 全件表

| # | file:line | 実測された message | 他に到達しうる失敗 | 判定 | 処置 |
|---|---|---|---|---|---|
| 1 | `tests/evidence.test.js:372` | `makeEvidence(): invalid evidence level: "assumed" (must be one of primary, i` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 2 | `tests/manual-config.test.js:98` | `W must be a positive finite number, got: null` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 3 | `tests/manual-config.test.js:99` | `H must be a positive finite number, got: null` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 4 | `tests/manual-config.test.js:106` | `positivePressure must be a finite number, got: null` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 5 | `tests/manual-config.test.js:107` | `negativePressure must be a finite number, got: null` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 6 | `tests/manual-config.test.js:120` | `extraFactor must be a finite number with 0 < value <= 1.0, got: 0` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 7 | `tests/manual-config.test.js:144` | `extraFactor must be a finite number with 0 < value <= 1.0, got: null` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 8 | `tests/manual-config.test.js:164` | `designP must be greater than 0 (positivePressure and negativePressure cannot` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 9 | `tests/manual-config.test.js:171` | `buildManualDesignInput(): input must be an object` | **あり（実測）** `[]` は W の validation で落ちる | **REQUIRED_FIX** | 失敗モードを分離 + matcher。K7-02 |
| 10 | `tests/project-config.test.js:240` | `verificationStatus "verified" requires evidence.level === "primary"` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 11 | `tests/project-config.test.js:243` | `verificationStatus "verified" requires evidence.checkedAt to be set` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 12 | `tests/project-config.test.js:246` | `evidence metadata is required` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 13 | `tests/project-config.test.js:421` | `makeEvidence(): invalid evidence level: "bogus" (must be one of primary, ind` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 14 | `tests/project-config.test.js:422` | `makeEvidence(): invalid evidence level: "" (must be one of primary, indirect` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 15 | `tests/project-config.test.js:423` | `makeEvidence(): invalid evidence level: undefined (must be one of primary, i` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 16 | `tests/project-config.test.js:471` | `verified case floor must be one of 1, 2, 3, R` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 17 | `tests/project-config.test.js:472` | `verified case floor must be one of 1, 2, 3, R` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 18 | `tests/project-config.test.js:473` | `verified case zone must be one of general, corner` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 19 | `tests/project-config.test.js:478` | `verified case widthMm must be a positive finite number` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 20 | `tests/project-config.test.js:479` | `verified case heightMm must be a positive finite number` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 21 | `tests/project-config.test.js:480` | `verified case designPressure must be a positive finite number` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 22 | `tests/project-config.test.js:488` | `verificationStatus "verified" requires evidence.level === "primary" (verifie` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 23 | `tests/project-config.test.js:491` | `verificationStatus "verified" requires evidence.level === "primary" (verifie` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 24 | `tests/project-config.test.js:494` | `verificationStatus "verified" requires evidence.level === "primary" (verifie` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 25 | `tests/project-config.test.js:502` | `verificationStatus "verified" requires evidence.checkedAt to be set (verifie` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 26 | `tests/project-config.test.js:508` | `verified case publicEvidenceDescription must not contain private URLs/paths/` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 27 | `tests/project-config.test.js:511` | `verified case publicEvidenceDescription must not contain private URLs/paths/` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 28 | `tests/project-config.test.js:569` | `test must be a non-empty string` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 29 | `tests/project-config.test.js:570` | `test must be a non-empty string` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 30 | `tests/project-config.test.js:571` | `test must be a non-empty string` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 31 | `tests/project-config.test.js:572` | `test must be a non-empty string` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 32 | `tests/project-config.test.js:576` | `makeEvidence(): publicDescription must not contain private URLs/paths/identi` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 33 | `tests/project-config.test.js:577` | `makeEvidence(): publicDescription must not contain private URLs/paths/identi` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 34 | `tests/project-config.test.js:578` | `makeEvidence(): publicDescription must be a non-empty string` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 35 | `tests/project-config.test.js:600` | `verifiedCase.fixture-case-1.widthEvidence.publicDescription must not contain` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 36 | `tests/project-config.test.js:611` | `verifiedCase.fixture-case-1.heightEvidence.publicDescription must not contai` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 37 | `tests/project-config.test.js:637` | `verified case publicEvidenceDescription must not contain private URLs/paths/` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 38 | `tests/project-config.test.js:640` | `verified case publicEvidenceDescription must not contain private URLs/paths/` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 39 | `tests/project-input.test.js:90` | `registerPreset(): preset config must be an object` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 40 | `tests/project-input.test.js:91` | `registerPreset(): preset config must have a non-empty string projectId` | **あり（実測）** guard を消しても test は通った | **REQUIRED_FIX** | 4 行に個別 matcher。K7-01 |
| 41 | `tests/project-input.test.js:92` | `registerPreset(): preset config must expose getPublicLabel()` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 42 | `tests/project-input.test.js:93` | `registerPreset(): projectId must match /^[a-z0-9][a-z0-9_-]*$/` | なし。妥当な fixture の 1 field のみ壊している | BENIGN | 変更なし |
| 43 | `tests/project-input.test.js:186` | `widthMm must be > 0, got: 0` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 44 | `tests/project-input.test.js:187` | `heightMm must be > 0, got: 0` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 45 | `tests/project-input.test.js:227` | `unsupported sourceKind: "trusted" (supported: registered_preset, manual, not` | なし。loop の各入力がいずれも意図した guard | BENIGN | 変更なし |
| 46 | `tests/review-package.test.js:303` | `workspace payload has an unexpected field: "reportType"` | あり。意図が選言的（他の unknown field でも落ちる） | AMBIGUOUS | matcher を付けて特定化 |
| 47 | `tests/review-package.test.js:308` | `project input package contains an unknown field: "reportType"` | あり。意図が選言的（他の unknown field でも落ちる） | AMBIGUOUS | matcher を付けて特定化 |
| 48 | `tests/review-package.test.js:847` | `workspace payload has an unexpected field: "reportType"` | あり。意図が選言的（他の unknown field でも落ちる） | AMBIGUOUS | matcher を付けて特定化 |
| 49 | `tests/review-package.test.js:848` | `project input package contains an unknown field: "reportType"` | あり。意図が選言的（他の unknown field でも落ちる） | AMBIGUOUS | matcher を付けて特定化 |

## REQUIRED_FIX 2 件の測定

### 1. tests/manual-config.test.js:171

```text
入力 : [null, undefined, 'string', 123, []]
実測 : 4 件は input must be an object
       [] だけは W must be a positive finite number, got: undefined
理由 : typeof [] === 'object' なので object guard は配列を通す
帰結 : 「object guard が [] を拒否する」という test の主張が偽
```

拒否自体は起きている（fail closed。不正入力は受理されない）ので
**runtime の欠陥ではなく test の欠陥**である。
§14 に従い project-config/** は変更していない。

### 2. tests/project-input.test.js:91

```text
入力 : registerPreset({})
意図 : projectId 欠落の guard
実測 : guard を if (false) へ消して tests/project-input.test.js を実行
       → AC-04 の test は ok のまま通った
理由 : {} は hasFixedPreset も getPublicLabel も欠くので後続 guard が代わりに発火
```

## §11 に従った mutation

```text
K7-01  registry.js の projectId guard を消す  → 修正後の test が落ちる
K7-02  manual.js の object guard を消す     → 同上
```

BENIGN / AMBIGUOUS に対しては mutation を作っていない。
