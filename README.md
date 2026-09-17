# 🪟 ガラス耐風圧 簡易検討ツール

**4辺支持ガラスの風圧検討・最小構成自動選定ツール（ブラウザ単体動作）**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-公開中-blue?logo=github)](https://airesearchagl-art.github.io/glass_wind_calc_M/)
![HTML only](https://img.shields.io/badge/依存ライブラリ-なし-green)
![License](https://img.shields.io/badge/用途-社内検討補助-lightgrey)

---

## 概要

ガラスの幅・高さ・設置階数・部位を入力するだけで、設計風圧に対して成立する**最小板厚のガラス構成を自動選定**し、計算根拠を一画面で確認できる簡易ツールです。

**静的HTML/CSS/JavaScript構成・ビルド不要**（`index.html` がUI、計算ロジックは `calc.js` に分離）のため、外部サーバーやライブラリのインストール不要。GitHub Pages / Vercel にホストすることで、ブラウザさえあればどこからでも利用できます。

---

## 出典（法令・技術資料）

- **国土交通省 平成12年建設省告示第1458号**（4辺支持ガラスの構造計算に関する基準）
- **板硝子協会「4辺支持板ガラスの耐風圧強度計算法」**

本ツールの許容耐風圧計算式・複層ガラスの適用範囲は、上記2点に準拠しています。

---

## 機能

- 設計風圧の自動判定（正圧 vs 負圧の大きい方を採用）
- 対応ガラス構成：
  - 複層ガラス：Low-E + A + FL
  - 複層ガラス：FL + A + FL
  - 単板ガラス：FL
  - 単板ガラス：TP（強化ガラス）
- 最小構成の自動選定（最大板厚昇順 → 合計板厚昇順）
- 複層ガラスの外側・内側それぞれの許容風圧計算と支配側の明示
- **推奨候補（OK）と NG候補を表で明確に分離して表示**
- 複層ガラスの厚板/薄板比が板硝子協会計算法の適用範囲（≦2.5）を超える組合せは、自動推奨から除外し、警告表示
- 告示外の追加低減係数をスライダーで調整（0.70 〜 1.00、既定値 1.00 = 告示準拠のまま）
- レスポンシブ対応（PC・タブレット・スマートフォン）

---

## 使い方

### オンライン利用（推奨）

以下のURLをブラウザで開くだけで利用できます。

```
https://airesearchagl-art.github.io/glass_wind_calc_M/
```

### ローカル利用

```bash
git clone https://github.com/airesearchagl-art/glass_wind_calc_M.git
cd glass_wind_calc_M
# index.html をブラウザで開く（ダブルクリックでOK。calc.js と同じ階層に置くこと）
```

---

## 入力項目

| 項目 | 説明 | 初期値 |
|------|------|--------|
| ガラス幅 W | **ガラス1枚の見付寸法**（mm単位） | 1250 mm（※未検証な既定値） |
| ガラス高さ H | **ガラス1枚の見付寸法**（mm単位） | 2050 mm（※未検証な既定値） |
| 設置階数 | 1階 / 2階 / 3階 / R階 | 2階 |
| 部位 | 一般部 / 隅角部 | 一般部 |
| 候補ガラス構成 | 複層/単板・ガラス種別 | Low-E + A + FL |
| 告示外の追加低減係数 | 0.70 〜 1.00（スライダー） | **1.00**（告示準拠） |

> W・H はサッシ枠を含む建具全体寸法ではなく、**ガラス1枚の見付寸法**（面積算定に用いる寸法）です。
>
> ⚠️ **初期値 W=1250mm / H=2050mm は UNVERIFIED PROJECT DEFAULT（未検証な既定値）です。** リポジトリ初回リリースコミットで `index.html` の初期値として導入されましたが、コミットメッセージ・README・設計根拠資料のいずれにも算定根拠の記載がなく、特定案件のガラス確定寸法として検証された値ではありません（正は `project-config/miyoshi.js` の `dimensions.defaultW` / `dimensions.defaultH`。`calc.js` の `UNVERIFIED_DEFAULT_DIMENSIONS_MM` は非推奨の後方互換複製）。社内の見積資料にはACW（アルミカーテンウォール）全体高さとしてH=2050mmに類する記録が存在しますが、これはACW全体寸法であり、ガラス1枚の見付高さと同一であることは確認できていません。今回確認できた社内資料の範囲では、ガラス1枚の見付幅W=1250mmと直接対応付けられる根拠は確認できていません（社内資料全体に存在しないことまで確認・証明したものではありません）。この初期値のまま計算した結果は「参考計算」であり、案件適合の根拠として扱わず、必ず案件図・メーカー資料でガラス1枚の実見付寸法を確認のうえ入力し直してください。

---

## 設計定数

### 設計風圧（正圧・負圧）＝「みよし案件プリセット」値

以下の設計風圧は、**告示から自動算定した値ではありません**。みよし案件の設計風圧をそのまま定数化した固定プリセット値です。**Phase 2A以降、正（authoritative source）は `project-config/miyoshi.js`（`wind.positivePressureByFloor` / `wind.negativePressureByZone`、`verificationStatus`付き）です。** `calc.js` の `POSITIVE_PRESSURE_MIYOSHI_PRESET` / `NEGATIVE_PRESSURE_MIYOSHI_PRESET` は同じ値を保持する非推奨の後方互換複製です。他案件に流用する場合は、その案件の構造計算書等で妥当性を個別に確認してください。

#### 監査メモ（2026-09-17時点）

値そのものは変更していません。

- **基準風速 V0 = 34 m/s・地表面粗度区分 III は、社内基本設計資料（外構の風荷重条件）で直接確認済み**（`verificationStatus: "verified"`）です。みよし市の法定値 V0=32m/s とは異なり、本案件では34m/sを案件側設計条件として採用しているため、32m/sへの変更は行いません。
- 負圧値を告示1458号のCpe（H≦45m：一般部 -1.8／隅角部 -2.2）で逆算すると、918 / 1.8 = 510 N/m²、1122 / 2.2 = 510 N/m² となり、**平均速度圧 qbar ≈ 510 N/m²** 相当で揃います。
- 正圧側（1297 / 1525 / 1695 / 1729）も、qbar ≈ 510 N/m² に告示1458号のCpe・Gpe（閉鎖型建築物の内圧係数を含む）を適用することで概ね再現可能です。
- **ただし、V0・地表面粗度区分そのものの確認と、各階の正圧・負圧プリセット値の確認は別軸です。** V0=34m/s・地表面粗度区分IIIは外構・地表面の風荷重条件として確認できていますが、これらの階別プリセット値の元となった外装材/ガラス構造計算書、および各階の評価高さZとの厳密な対応付けは依然として**未確認**です。したがって階別正圧・部位別負圧プリセット値自体は `verificationStatus: "partially_verified"` のまま維持し、固定値を告示からの自動算定式へ置換していません。
- 本リポジトリは公開のため、社内資料のURL・ファイルID・ファイル名等の内部限定識別子はここには記載していません。社内での厳密な対応関係は社内の非公開ドキュメントで管理しています。

#### 正圧（階数ごと）

| 階数 | 正圧 N/m² |
|------|----------:|
| 1階  | 1,297 |
| 2階  | 1,525 |
| 3階  | 1,695 |
| R階  | 1,729 |

#### 負圧（部位ごと・絶対値）

| 部位   | 負圧 N/m²（絶対値） |
|--------|-------------------:|
| 一般部 | 918 |
| 隅角部 | 1,122 |

### k1：強度種別係数

| 強度種別 | 板厚 t | k1 |
|----------|--------|----|
| FL（フロート／Low-Eも同等） | t ≦ 8mm | 1.0 |
| FL | 8mm < t ≦ 12mm | 0.9 |
| FL | 12mm < t ≦ 20mm | 0.8 |
| FL | 20mm < t | 0.75 |
| TP（強化ガラス） | 4, 5, 6, 8, 10, 12, 15mm | 3.5 |

- Low-E は **coating（表面コーティング）属性**として扱い、強度計算（k1）には影響しません。強度種別は FL / TP（将来的に熱強化等を追加可能なデータモデル）で管理しています。
- TP は FL と**独立した候補板厚リスト**から生成されます（FLの候補と機械的に共有しません）。
- **TP（k1=3.5）は板硝子協会「4辺支持板ガラスの耐風圧強度計算法」表2.2.1に基づき、4, 5, 6, 8, 10, 12, 15mmの呼び厚にのみ適用されます。19mmはこの表に含まれないため、本ツールはTP19を自動候補として生成しません**（`calc.js` の `K1_TP_SUPPORTED_THICKNESSES_MM` に協会表の全呼び厚を明記。19mm等の範囲外の厚さで `getK1_TP()` を呼んだ場合はk1をNaNとして返し、常にNG判定になります）。
- 本ツールが**自動推奨する候補厚**（`STRENGTH_TYPES.TP.thicknessList`）はさらに **5〜15mm** に限定しています。4mmは協会表には含まれますが、外壁ガラス候補としての実用下限という**ツール側の制約**として自動候補からは除外しています（協会表そのものを否定するものではありません）。

---

## 計算式（平成12年建設省告示第1458号 準拠）

### 許容風圧（4辺支持）

```
P₀ = (300 × k1 × k2 / A) × (t + t²/4)
```

- `A`：ガラス面積 [m²] = W × H / 1,000,000
- `t`：板厚 [mm]
- 設計風圧 = max(正圧, |負圧|)

これが告示第1458号そのものの式です（`calc.js` の `calcP_notification()`）。

### 告示外の追加低減係数

```
P = P₀ × 告示外の追加低減係数
```

- **既定値は 1.00**（= 告示準拠計算のまま。追加の低減を行わない）。
- 0.90 等の値は、既存検討書の傾向に合わせた**告示に規定のない追加安全率**であり、告示式そのものとは明確に分離しています（`calc.js` の `calcP_single()`）。

> ⚠️ 是正前バージョンは `P = (300 × k1 × k2 / A) × t² × 補正係数` という誤った式（t² 項）を用いており、実際より大きい許容耐風圧を算出する**安全側ではない**計算になっていました。現在は告示式（t + t²/4 項）に是正済みです。

### 複層ガラスの k2

```
k2_outer = 0.75 × { 1 + (t_inner / t_outer)³ }
k2_inner = 0.75 × { 1 + (t_outer / t_inner)³ }
（k2式内の厚さ比の上限 = 2.0）
P_IGU = min(P_outer, P_inner)
```

### 複層ガラスの適用範囲（板硝子協会計算法）

複層ガラスの**厚板/薄板の比が 2.5 を超える組合せ**は、板硝子協会「4辺支持板ガラスの耐風圧強度計算法」の適用範囲外です。計算上の値が設計風圧を上回っていても、本ツールでは自動推奨（OK候補）に含めず、「適用範囲外」として明確に警告表示します。採用する場合はメーカー個別検討が必要です。

---

## ファイル構成

```
glass_wind_calc_M/
├── index.html                    # UI（入力フォーム・結果表示）。calc.js / project-config を読み込んで使用
├── calc.js                       # 汎用計算コア（k1・k2・許容耐風圧・candidate generation等。案件非依存）
├── project-config/
│   └── miyoshi.js                # 「みよし案件」固有プリセット（設計風圧・初期寸法）＋検証状況メタデータ
├── tests/
│   ├── calc.test.js              # 汎用計算コアの known-answer test（node:test）
│   └── project-config.test.js    # project-config分離の整合性・代表ケース回帰テスト
├── package.json
└── README.md                     # このファイル
```

`index.html` は UI（入力取得・DOM描画）のみを担当し、`calc.js`（案件非依存の汎用計算コア）と `project-config/miyoshi.js`（案件固有プリセット）の橋渡しを行います。両ファイルとも `<script src="...">` によるブラウザ読み込みと、Node.js の `require(...)` の両方に対応しています。

### Phase 2A：案件固有入力と汎用計算コアの分離

Phase 1（告示式是正）に続き、Phase 2Aでは「案件固有入力」（みよし案件の設計風圧・初期寸法）と「汎用計算コア」（k1・k2・許容耐風圧計算式・candidate generation等）を分離しました。

- **`calc.js`**：原則、告示・板硝子協会資料に基づく計算式・candidate generation/sorting/splitのみを担当する「汎用計算コア」。案件を問わず再利用可能。
- **`project-config/miyoshi.js`**：「みよし案件」固有のプリセット値（`dimensions`：初期寸法、`wind`：階別正圧・部位別負圧・V0・地表面粗度区分）と、値ごとの検証状況メタデータを保持するモジュール。`index.html` はこのモジュールを案件プリセットの正（authoritative source）として参照します。
- **後方互換について**：`calc.js` には `POSITIVE_PRESSURE_MIYOSHI_PRESET` / `NEGATIVE_PRESSURE_MIYOSHI_PRESET` / `UNVERIFIED_DEFAULT_DIMENSIONS_MM` が引き続き存在しますが、これらは非推奨（deprecated）の後方互換用の複製です。値は `project-config/miyoshi.js` と完全に一致しており（`tests/project-config.test.js` で保証）、将来のフェーズで全消費者が `project-config/` 側へ移行した後、`calc.js` 側からは削除予定です。
- **JSONではなくJSにした理由**：静的HTML/JS構成・ビルド不要という制約と、`index.html` をブラウザで直接開く（`file://`）運用を維持するため。`file://` からの `fetch()` はブラウザのセキュリティ制限で失敗することがありますが、`<script src>` によるJS読み込みは `file://` でも動作します。

#### 検証状況（verification status）モデル

案件固有の入力値は、値そのものと「その値がどの程度検証されているか」を分離して保持します。Phase 2B以降、根拠（evidence）は下記「Evidence Status」セクションのとおり、さらに独立したサブ構造として保持します。

| フィールド | 説明 |
|---|---|
| `value` | 値そのもの |
| `unit` | 単位 |
| `verificationStatus` | `verified` / `partially_verified` / `unverified` のいずれか |
| `evidence` | 根拠メタデータ（`level` / `checkedAt` / `publicDescription` / `privateReferenceAvailable`）。詳細は「Evidence Status」セクション参照 |

現時点の状況：

- `identity.verificationStatus = "verified"`：案件識別情報（施主名・建物名称等）は社内基本設計資料で直接確認済みです。ただし本リポジトリは公開のため、`identity.disclosureStatus = "redacted"` とし、具体的な固有名詞・社内資料の参照は本リポジトリには記載していません。UI・ドキュメント上は `identity.publicLabel`（「みよし案件」）のみを表示します。
- `wind.V0.verificationStatus = "verified"` / `wind.roughnessCategory.verificationStatus = "verified"`：基準風速V0=34m/s・地表面粗度区分IIIは社内基本設計資料（外構の風荷重条件）で直接確認済みです（詳細は「設計定数」セクションの監査メモ参照）。
- `wind.status = "partially_verified"`（`positivePressureByFloor` / `negativePressureByZone` の各値も同様）：V0・地表面粗度区分そのものの確認と、階別正圧・部位別負圧プリセット値の確認は別軸です。V0/roughnessは確認済みですが、これらのプリセット値の元となった外装材/ガラス構造計算書、および各階評価高さZとの厳密な対応付けは依然として未確認のため、`verified` へは昇格させていません。
- `dimensions.status = "unverified"`：W=1250mmはリポジトリ初回リリースコミットの初期値として導入されたのみで、今回確認できた社内資料の範囲ではガラス1枚の見付幅Wと直接対応付けられる根拠は確認できていません（社内資料全体に存在しないことまで確認・証明したものではありません）。H=2050mmは社内の見積資料にACW（アルミカーテンウォール）全体高さとして類似値の記録がありますが、これはACW全体寸法であり、ガラス1枚の見付高さと同一であることは確認できていません（詳細は「入力項目」セクション参照）。pane（ガラス1枚）の実見付寸法W/Hが確認できるまで `verified` へは昇格させません。
- **公開リポジトリでの開示方針**：内部で確認済みの値であっても、社内資料のURL・ファイルID・非公開のファイル名・その他内部限定の識別子は本リポジトリには記載しません。社内での厳密な対応関係は社内の非公開ドキュメントで管理します。

#### Generic preset（将来の複数案件対応）への準備

`project-config/miyoshi.js` は読み込み時に `window.PROJECT_CONFIGS['miyoshi']` へも自身を登録します。これは、将来 `miyoshi` / `manual`（手入力モード）/ 他案件のプリセットを切り替え可能にするための data model・module boundary の準備であり、Phase 2A時点ではUI上の案件切替機能は実装していません。

---

## Evidence Status

Phase 2B（案件入力値とその根拠を安全にbindingできる構造の整備）で導入した、`project-config/miyoshi.js` の根拠（evidence）モデルについて説明します。

### 基本原則

- **`verified` ≠ 公開資料リンクをリポジトリへ保存すること。** 「社内一次資料で確認済み（`verificationStatus: "verified"`）」であることと、「その確認の根拠となったURL・ファイルID・ファイル名等を本リポジトリに記載すること」は別問題です。本リポジトリは公開のため、後者は行いません。
- **private evidenceは社内の非公開プロジェクト記録（Notion等、GitHubではない場所）で管理します。** リポジトリには `evidence.privateReferenceAvailable`（社内参照資料の有無を示す真偽値のみ）と `evidence.publicDescription`（固有名詞・URL等を含まない、公開してよい説明文）だけを保持します。
- **public repositoryにはpublic-safeなprovenanceだけ保持します。** Google Drive URL、Drive file ID、Notion等の非公開URL、SharePoint URL、社内ネットワークpath、社外秘ファイル名、正式案件名などの非公開固有情報は、確認済みの値であっても記載しません。
- **sample defaultとverified project caseを区別します。** 現在のW/H既定値（1250×2050mm）は `dimensions.mode = "sample_default"` であり、検証済みの案件確定寸法ではありません。将来、ガラス1枚の実見付W/Hと設計風圧の根拠の両方が確認できた場合に追加する「verified project case」（`verifiedCases` 配列）とは明確に区別します。
- **未確認値は自動昇格しません。** `verificationStatus` を `unverified` → `partially_verified` → `verified` へ昇格させるのは、常に人が根拠を確認したうえで明示的にコードを変更した場合のみです。

### Evidence構造

各入力値の `evidence` フィールドは以下の形をとります（`project-config/miyoshi.js` の `makeEvidence()`）。

| フィールド | 説明 |
|---|---|
| `level` | `primary`（一次資料で直接確認）／ `indirect`（間接的な数値整合等の状況証拠のみ）／ `none`（根拠未発見） |
| `checkedAt` | 確認・レビューを行った日付（ISO文字列）。未実施の場合は `null` |
| `publicDescription` | 公開リポジトリに書いてよい、根拠の説明文（固有名詞・内部識別子を含めない） |
| `privateReferenceAvailable` | 社内に（未開示の）参照資料が存在するかどうかの真偽値のみ |

### Evidence promotion guard

`verificationStatus` が `"verified"` の値は、**必ず** `evidence.level === "primary"` かつ `evidence.checkedAt` が設定されていなければなりません。これは `project-config/miyoshi.js` の `assertEvidenceConsistency()` によって、値の構築時点（モジュール読み込み時）に強制されます。条件を満たさない値を `"verified"` にしようとすると、モジュール読み込み自体が例外で失敗します。`config.validateAllEvidence()` を呼ぶと、config全体を走査してこの整合性を再確認できます（`tests/project-config.test.js` で回帰テスト済み）。

### 現時点のEvidence状況

| 項目 | verificationStatus | evidence.level | 説明 |
|---|---|---|---|
| `identity`（案件識別情報） | `verified` | `primary` | 社内基本設計資料で直接確認済み。ただし`disclosureStatus: "redacted"`のため固有名詞は非開示 |
| `wind.V0`（基準風速） | `verified` | `primary` | 社内基本設計資料の外構風荷重条件で直接確認済み |
| `wind.roughnessCategory`（地表面粗度区分） | `verified` | `primary` | 同上 |
| `wind.positivePressureByFloor` / `negativePressureByZone`（階別・部位別風圧プリセット） | `partially_verified` | `indirect` | V0・粗度区分との数値整合は確認済みだが、元の外装材/ガラス構造計算書・各階評価高さZとの直接対応は未確認 |
| `dimensions.defaultW`（幅の既定値） | `unverified` | `none` | ガラス1枚の見付幅Wと直接対応する根拠は見つかっていない |
| `dimensions.defaultH`（高さの既定値） | `unverified` | `indirect` | ACW全体高さとして類似値の記録候補はあるが、ガラス1枚の見付高さとの対応は未確認 |

### Verified project case（将来の拡張）

`project-config/miyoshi.js` の `verifiedCases` 配列は、将来ガラス1枚の実見付W/Hと設計風圧の根拠（元計算書・評価高さZ）の両方が確認できた案件ケースを追加するための領域です。スキーマは同ファイルのコメントに記載しています。**現時点ではガラス1枚の実寸が未確認のため、架空のverified caseは追加せず、空配列のまま維持しています。**

---

## テスト

Node.js 標準の `node:test` を利用した known-answer test を用意しています（追加の依存パッケージは不要）。

```bash
npm test
# または
node --test
```

### 必須ケース

| ケース | A [m²] | k1 | k2 | 期待値 P [N/m²] |
|--------|-------:|----:|----:|-----------------:|
| FL6    | 1.0 | 1.0 | 1.0 | **4500** |
| FL5    | 1.0 | 1.0 | 1.0 | 3375 |
| FL8    | 1.0 | 1.0 | 1.0 | 7200 |
| FL10   | 1.0 | 0.9 | 1.0 | 9450 |
| FL12   | 1.0 | 0.9 | 1.0 | 12960 |
| TP8    | 1.0 | 3.5 | 1.0 | 25200 |

複層ガラスについても、同厚複層（FL6+A+FL6）・異厚複層（FL5+A+FL8）の固定値、および適用範囲判定（厚板/薄板比 2.5 のケース／超過ケース）を固定値テストしています。詳細は `tests/calc.test.js` を参照してください。

### 寸法感度テスト（H=2050mm固定、FL6）

W=1250mm を基準に、W=1400 / 1500 / 1550mm と面積を増やした場合に許容耐風圧が単調に低下することを固定値・回帰の両面でテストしています。

| W [mm] | H [mm] | 期待値 P [N/m²] |
|-------:|-------:|-----------------:|
| 1250 | 2050 | ≈ 1756 |
| 1500 | 2050 | ≈ 1463 |

2階プリセットの設計風圧（1525 N/m²）に対して、W=1250mmはOK、W=1500mmはNGへ判定が反転することも回帰テストしています。これは1250×2050mmが未検証な既定値であること（上記「入力項目」参照）を踏まえ、寸法差が容易にOK/NGを逆転させ得る点を明示するためのテストです。

### project-config分離のテスト（`tests/project-config.test.js`）

Phase 2Aで `project-config/miyoshi.js` を分離したことに伴うテストです。

- `MiyoshiProjectConfig` から取得した正圧・負圧・既定寸法が、`calc.js` に残る非推奨の後方互換定数と完全に一致すること
- `dimensions.status` が `unverified`、`wind.status` が `verified` ではない（`partially_verified`）ことの確認（誤って`verified`へ昇格していないことの回帰）
- V0=34m/sが32m/sへ変更されていないことの確認
- **Provenance / disclosureのテスト**（2026-09-17時点の追加分）
  - `identity`：社内確認済み状態（`verificationStatus: "verified"`）を表現できること、`publicLabel === "みよし案件"` であること、施主名・建物名称等のprivate/internalな固有名詞フィールドを要求しない構造であること、内部限定識別子（Drive URL・Notion URL等）を含まないこと
  - `wind.V0`：`value === 34`、`verificationStatus === "verified"`、`checkedAt === "2026-09-17"`
  - `wind.roughnessCategory`：`value === "III"`、`verificationStatus === "verified"`、`checkedAt === "2026-09-17"`
  - `wind.status` は引き続き `"partially_verified"`（`positivePressureByFloor` / `negativePressureByZone` の各値も同様）であること
  - `dimensions.status` は引き続き `"unverified"`（W/Hとも `"unverified"`）であること
- **Evidence modelのテスト**（2026-09-17 Phase 2B時点の追加分。詳細は上記「Evidence Status」セクション参照）
  - `verified` な値（`identity` / `wind.V0` / `wind.roughnessCategory`）はすべて `evidence.level === "primary"` かつ `evidence.checkedAt` が設定されていること
  - `assertEvidenceConsistency()`（promotion guard）が、`verified` + 非`primary`、`verified` + `checkedAt`欠落、`evidence`自体の欠落のいずれに対しても例外を投げること。一方 `unverified`/`partially_verified` は `primary` 以外の `evidence.level` でも成立すること
  - `dimensions.defaultW` / `defaultH` が `primary` evidenceなしでも `unverified` として成立すること
  - 階別正圧・部位別負圧プリセットが `partially_verified` のまま、それぞれ `evidence` を保持すること
  - `config.validateAllEvidence()` が現在のconfig全体でviolations 0件を返すこと
  - `dimensions.mode === "sample_default"`（sample defaultとverified project caseの区別）であること
  - `verifiedCases` が空配列のまま（架空のverified caseが存在しない）であること
  - config全体（関数を除く）をシリアライズしても内部限定識別子（Drive/Notion等のURL・ファイルID）が混入しないこと
- 代表ケース回帰：`project-config` の値を `calc.js` の汎用計算コアへ渡した結果が、config分離前（Phase 1）と完全に同じ値になること
  - FL6, W=1250mm, H=2050mm, 2F, 一般部, extraFactor=1.00 → **P ≈ 1756.09756 N/m²**、designP=1525 N/m² → **OK**
  - FL6, W=1500mm, H=2050mm, 2F, 一般部, extraFactor=1.00 → **P ≈ 1463.41463 N/m²**、designP=1525 N/m² → **NG**

---

## 注意事項

> ⚠️ **本ツールは4辺支持ガラスの風圧検討を簡易的に行うためのものです。**
>
> 以下の事項は本ツールの検討範囲外です。別途確認が必要です。
>
> - 自重・衝撃・熱割れに対する検討
> - 製作可否・板厚の入手性
> - サッシ納まり・支持条件の詳細
> - 法的適合性の最終判断
> - 板硝子協会計算法の適用範囲外（複層ガラス厚板/薄板比 > 2.5）の組合せの採否判断
>
> 階別正圧・部位別負圧は「みよし案件プリセット」の固定値であり、告示から自動算定した値ではありません。
>
> **最終的な設計判断にはメーカー検討書または専門技術者による確認を優先してください。**

---

## 更新履歴

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.3.0-phase2b | 2026-09-17 | **Phase 2B：Evidenceモデルの導入。**案件入力値とその根拠（evidence）を安全にbindingできるdata contractを整備。`project-config/miyoshi.js` の各値に `evidence: { level, checkedAt, publicDescription, privateReferenceAvailable }`（`level`は`primary`/`indirect`/`none`）を追加し、`verificationStatus`（値の検証状況）と`evidence`（根拠の状況）を分離。`assertEvidenceConsistency()`によるEvidence promotion guardを導入し、`verificationStatus: "verified"`の値は`evidence.level === "primary"`かつ`evidence.checkedAt`必須という制約をモジュール読み込み時に強制（違反時は例外）。`config.validateAllEvidence()`でconfig全体の整合性を検証可能に。`identity`/`wind.V0`/`wind.roughnessCategory`は`evidence.level: "primary"`を維持（値・verificationStatusは変更なし）、階別正圧・部位別負圧プリセットは`evidence.level: "indirect"`（`partially_verified`のまま）、`dimensions.defaultW`/`defaultH`は`evidence.level: "none"/"indirect"`（`unverified`のまま）。`dimensions.mode = "sample_default"`を追加し、現在のW/H既定値がサンプル値であり検証済み案件確定寸法ではないことをコード上で明示。`verifiedCases: []`（将来、実寸・風圧根拠の両方が確認できた案件ケースを追加するための空配列。架空ケースは追加せず）を新設。README「Evidence Status」セクションを追加。告示1458号式・k1・k2・IGU ratio・TP候補ルール・Low-E strength model・extraFactor・既存風圧数値・V0=34・roughness III・W=1250/H=2050・candidate generation/sorting・publicLabel境界はいずれも変更なし。既存37テストを土台に、identity/V0/roughnessのフィールド参照を新schemaへ追随させたうえでEvidence関連7件を追加し、計44テスト全pass。`calc.js`は今回変更なし。 |
| v1.2.1-phase2a | 2026-09-17 | **Provenance metadata Required Fix。**`project-config/miyoshi.js` の `identity` を `{ status, note }` から `{ publicLabel, verificationStatus, disclosureStatus, sourceDescription, checkedAt }` へ変更し、案件識別情報が社内基本設計資料で確認済みであること（`verificationStatus: "verified"`）を反映。ただし公開リポジトリのため固有名詞・社内資料参照は開示せず（`disclosureStatus: "redacted"`）、UIには引き続き `publicLabel`（「みよし案件」）のみ表示。`wind.V0` / `wind.roughnessCategory` を社内基本設計資料（外構の風荷重条件）で直接確認済みとして `verificationStatus: "verified"`、`checkedAt: "2026-09-17"` に更新（値34/IIIは変更せず、32m/sへの変更も行っていない）。一方、階別正圧・部位別負圧プリセット値（`positivePressureByFloor` / `negativePressureByZone`）および `wind.status` は、元の外装材/ガラス構造計算書・各階評価高さZとの対応付けが依然未確認のため `partially_verified` を維持（V0/roughness自体の確認と、各階ガラス風圧プリセットの確認を明確に分離）。`dimensions`（W=1250/H=2050、`status`）は `unverified` を維持しつつ、社内の見積資料にACW全体高さとしてH=2050mmに類する記録がある一方、これがガラス1枚の見付高さと同一かは未確認である旨を `sourceDescription`/`note` に追記。社内資料のURL・ファイルID・ファイル名等の内部限定識別子は一切追加していない（リポジトリ全体を再検索し不在を確認）。`calc.js` は計算コード無変更、監査メモのコメント文言のみ同期。既存34テストを土台に、identity関連1件を実態に合わせて更新し、V0/roughnessの新規検証テストなど追加して計36テスト全pass。 |
| v1.2.0-phase2a | 2026-09 | **Phase 2A：案件固有入力と汎用計算コアの分離。**「みよし案件」固有のプリセット値（階別正圧・部位別負圧・初期寸法）を新設の `project-config/miyoshi.js` へ移設し、値ごとに `verificationStatus`（`verified`/`partially_verified`/`unverified`）等の検証メタデータを付与。`index.html` はこのモジュールを案件プリセットの正として参照するよう変更。`calc.js` に残る同名定数（`POSITIVE_PRESSURE_MIYOSHI_PRESET`等）は非推奨の後方互換複製として維持し、値・計算式・テストは一切変更せず既存23テストは無変更のまま全pass。案件プリセット名をUIに表示するとともに、`wind.status !== verified` の場合に「⚠ 設計風圧プリセット — 原典照合未完了」という追加警告を表示（既存の「参考計算 — 案件実寸未確認」警告は維持・弱めていない）。1250×2050mm・風圧プリセットは引き続き`unverified`/`partially_verified`のままで、`verified`へは昇格させていない。V0=34m/sから32m/sへの変更も行っていない。`tests/project-config.test.js` を新設し、config分離前後で代表ケース（FL6, W=1250/1500mm, H=2050mm, 2F, 一般部）の計算値が不変であることを回帰確認（34テスト全pass）。将来の複数案件対応に向け `window.PROJECT_CONFIGS` レジストリへの登録のみ準備（UI上の案件切替機能は未実装）。 |
| v1.1.2 | 2026-09 | **TP19（強化ガラス19mm）を自動候補から除外**。板硝子協会「4辺支持板ガラスの耐風圧強度計算法」表2.2.1では強化ガラスk1=3.5が適用される呼び厚は4,5,6,8,10,12,15mmのみで19mmは含まれないため、`STRENGTH_TYPES.TP.thicknessList` を `[5,6,8,10,12,15,19]` から `[5,6,8,10,12,15]` に変更（4mmは外壁ガラス候補としての実用下限というツール側の制約として除外）。`getK1_TP(t)` を新設し、協会表の範囲外（`K1_TP_SUPPORTED_THICKNESSES_MM` に含まれない呼び厚）ではk1=3.5を無条件に適用せずNaNを返すようにした。README「TP（強化ガラス）｜全厚｜3.5（固定）」の誤った記載を、協会表の全呼び厚と本ツールの自動候補範囲を区別する記載に修正。FLの候補板厚・k1計算式には影響なし。 |
| v1.1.1 | 2026-09 | W=1250/H=2050の初期値をリポジトリ履歴調査の上「UNVERIFIED PROJECT DEFAULT」と明示（`calc.js` の `UNVERIFIED_DEFAULT_DIMENSIONS_MM`）。初期値のまま計算した場合、結果に「⚠ 参考計算 — 案件実寸未確認」を表示するUIを追加。W/Hはガラス1枚の見付寸法でありサッシ全体寸法ではない旨を強調。風圧プリセット定数に監査メモ（V0=34m/s・粗度III・qbar≈510N/m²との数値整合、および元の構造計算書は未検証である旨）をコメント・README双方に記録（値自体は変更せず）。寸法感度テスト（W=1250/1400/1500/1550mm、H=2050mm、FL6）と、2階プリセットに対するOK→NG境界回帰テストを追加（既存12件+新規5件=17件）。README冒頭の「1ファイル完結型（計算ロジックはcalc.jsに分離）」という矛盾した表現を「静的HTML/CSS/JavaScript構成・ビルド不要」に修正。 |
| v1.1.0 | 2026-09 | **許容風圧式を平成12年建設省告示第1458号の正しい式（P = (300×k1×k2/A)×(t+t²/4)）に是正**（是正前は t² 項を用いており、正しい値の約2〜3倍の許容耐風圧を算出しており安全側ではなかった）。補正係数を告示式から分離し「告示外の追加低減係数」として明示（既定値を0.90→1.00に変更）。計算ロジックをUIから分離（`calc.js`）し known-answer test を追加。複層ガラスの板硝子協会計算法の適用範囲（厚板/薄板≦2.5）判定と警告表示を追加。TPの候補板厚リストをFLと分離。Low-Eをcoating属性として強度種別から分離するデータモデルに移行。候補一覧をOK/NG/適用範囲外に明確に分離。階別正圧・部位別負圧を「みよし案件プリセット」と明示。入力W/Hが「ガラス見付寸法」であることをUIに明記。 |
| v1.0.0 | 2025-06 | 初版リリース。4辺支持・複層/単板対応、最小構成自動選定 |

---

## ライセンス・利用範囲

社内検討補助ツールとして作成。外部への無断転載・再配布はご遠慮ください。
