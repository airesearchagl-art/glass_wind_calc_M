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
- **国土交通省 平成12年建設省告示第1454号**（Eの数値の算出方法並びにV0及び風力係数）
- **板硝子協会「4辺支持板ガラスの耐風圧強度計算法」**
- **板硝子協会「帳壁に用いる板ガラスの風圧力計算法」**（Phase 2Eの風圧算定の主根拠）

本ツールの許容耐風圧計算式・複層ガラスの適用範囲は上記に準拠しています。
Phase 2Eで追加した風圧算定（告示風圧計算モード）の式・係数・適用条件は、
`.agent-run/LR-20260919-GLASS-P2E/EVIDENCE.md` §4 に出典・採用範囲・未確認事項を記録しています。

参考（公開一次資料）:

| 資料 | 公開URL |
|---|---|
| 告示1454号 本文（建築研究所 掲載） | `https://www.kenken.go.jp/japanese/research/lecture/h16/slide/06-1/ref/No6.htm` |
| 告示1458号 本文（建築研究所 掲載） | `https://www.kenken.go.jp/japanese/research/lecture/h16/slide/06-1/ref/No1.htm` |
| 地表面粗度区分の合理化（国土交通省） | `https://www.mlit.go.jp/jutakukentiku/build/content/H12-1454.pdf` |
| 板ガラスの耐風圧設計（板硝子協会） | `https://glass-wonderland.jp/cms/wp-content/uploads/2020/10/2024_g05_039-_2503.pdf` |

> ⚠️ **法令上の適用範囲と業界推奨の区別**
> 板硝子協会の計算法は、告示が定める最低基準より広い範囲へ推奨として適用されるものです。
> 本ツールは「すべての建物・すべての壁に法的に必須」とは主張しません。
> 表示上も「告示1458号系算定」「板硝子協会推奨による帳壁ガラス設計風圧」と区別して記載しています。

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
- **入力モード切替**（Phase 2C〜2D）：「案件プリセット（みよし案件）」「手入力 / Generic」「取り込みデータ（Imported / Unverified）」をUI上で切り替え可能。詳細は下記「入力モード」セクション参照
- **入力条件のExport / Import**（Phase 2D）：現在の入力条件をversioned JSON（Project Input Package）として書き出し／読み込み。取り込んだデータは常に未検証として扱われます

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
> ⚠️ **初期値 W=1250mm / H=2050mm は UNVERIFIED PROJECT DEFAULT（未検証な既定値）です。** リポジトリ初回リリースコミットで `index.html` の初期値として導入されましたが、コミットメッセージ・README・設計根拠資料のいずれにも算定根拠の記載がなく、特定案件のガラス確定寸法として検証された値ではありません（正は `project-config/miyoshi.js` の `dimensions.defaultW` / `dimensions.defaultH`。Phase 2Dで `calc.js` 側の複製は削除済み）。社内の見積資料にはACW（アルミカーテンウォール）全体高さとしてH=2050mmに類する記録が存在しますが、これはACW全体寸法であり、ガラス1枚の見付高さと同一であることは確認できていません。今回確認できた社内資料の範囲では、ガラス1枚の見付幅W=1250mmと直接対応付けられる根拠は確認できていません（社内資料全体に存在しないことまで確認・証明したものではありません）。この初期値のまま計算した結果は「参考計算」であり、案件適合の根拠として扱わず、必ず案件図・メーカー資料でガラス1枚の実見付寸法を確認のうえ入力し直してください。

---

## 入力モード（Phase 2C〜2E）

本ツールは「入力モード」セレクタで、以下の4つのモードを切り替えられます。**各モードは独立したモジュールであり、手入力・取り込みデータにみよし案件のプリセット値が暗黙的に適用されることはありません**（`project-config/manual.js` は `project-config/miyoshi.js` を一切 `require`/参照しません）。

| モード | sourceKind | 信頼度 | 値の出どころ |
|---|---|---|---|
| 案件プリセット（みよし案件） | `registered_preset` | プリセットの検証状況をそのまま保持（現状 `partially_verified`） | repository内のbuilt-in config（`project-config/miyoshi.js`） |
| 手入力 / Generic | `manual` | 常に `unverified` | ユーザーがその場で入力した値 |
| 告示風圧計算 | `notification_calculation` | 常に `unverified`（**式は検証済み / 入力値は未検証**） | 入力した風条件から算定した値（Phase 2E） |
| 取り込みデータ | `imported_unverified` | **常に `unverified`** | 外部から読み込んだJSON |

**取り込みデータは、payloadが「検証済み」「案件プリセット」と主張していても、本ツールはそれを検証済みとして扱いません**（詳細は下記「Project Input Package」）。

### 案件プリセット（みよし案件 / Miyoshi）

Phase 1〜2Bで確立した既存動作そのものです。`project-config/miyoshi.js`（`MiyoshiProjectConfig`）の階別正圧・部位別負圧プリセットを、設置階数・部位のセレクトから選択します。値・検証状況（`verificationStatus`）・Evidenceの扱いは本README「設計定数」「Evidence Status」セクションのとおりで、**Phase 2Cによる変更は一切ありません**。

### 手入力 / Generic（Manual）

その場でW・H・正圧・負圧を直接入力するモードです（`project-config/manual.js`、`ManualProjectConfig`）。

- 設計風圧 = `max(|正圧|, |負圧|)`（告示1458号の「正圧・負圧のうち大きい方を設計風圧とする」考え方を踏襲。符号は自動判定するため、負圧を正の数で入力しても結果は変わりません）
- 結果には常に `source: "user_input"` と `verificationStatus: "unverified"` が付与されます。**本ツールがこれらの値を「verified」と主張することはありません**。UI上も「⚠ ユーザー入力値 — 案件原典との照合は本ツールでは未実施」という注記を常に表示し、案件プリセットモードの「みよし案件プリセット」表記・階別/部位別の警告文言とは明確に区別しています。
- 固定のdimensions/windプリセットを一切保持しません（`hasFixedPreset: false`）。案件識別情報も保持しません（`identity.disclosureStatus: "public"` — そもそも非公開情報を持たないため）。
- 不正な入力（数値以外・NaN・0以下の寸法・非有限の圧力値等）は `buildManualDesignInput()` が例外を投げ、UIはアラート表示のうえ計算を中断します。

### 取り込みデータ（Imported / Unverified）

外部から読み込んだProject Input Packageで計算するモードです。Import操作の成功時に自動的にこのモードへ切り替わります。

- 取り込んだデータは**常に** `sourceKind: "imported_unverified"` / `verificationStatus: "unverified"` へ落とされます。
- payloadが `sourceKind: "registered_preset"` や `verificationStatus: "verified"`、案件ラベルを主張していても採用しません（案件ラベル・preset idは引き継がれず、中立ラベルに置き換えられます）。
- 画面には「⚠ 取り込みデータ（未検証）」を常時表示します。案件プリセットのprovenance表示は出しません。

---

## Project Input Package（Phase 2D）

入力条件（寸法・正圧・負圧・ガラス構成・追加低減係数・provenance）を、モードによらず共通のversioned schemaで表現するパッケージです。実装は `project-config/project-input.js`。

### schemaVersion

```
schemaVersion: 2   （Phase 2Eで 1 → 2。v1も引き続き読み込める）
```

サポート外の `schemaVersion` は読み込み時に拒否されます（将来の形式変更時に、古い実装が新しいpackageを誤って解釈しないための境界）。

**v1 → v2 migration（Phase 2E）**

| 項目 | 挙動 |
|---|---|
| v1 packageの読み込み | **可能**。`windInput: null` のv2として決定的に正規化される |
| v1の計算値・candidate一覧 | **変わらない** |
| v1 packageが `windInput` を持つ場合 | 矛盾として**拒否**（`windInput` はv2で導入） |
| `schemaVersion: 3` 以上 | **fail closed で拒否**。silent reinterpretationはしない |

### package構造

| フィールド | 説明 |
|---|---|
| `schemaVersion` | `2`（読み込みは `1` と `2`。`3` 以上は拒否） |
| `sourceKind` | `registered_preset` / `manual` / `notification_calculation` / `imported_unverified` |
| `sourceId` | registered presetのprojectId（それ以外は `null`） |
| `widthMm` / `heightMm` | ガラス1枚の見付寸法（> 0） |
| `positivePressure` / `negativePressure` | 設計風圧の入力値（符号は強制しない） |
| `designPressure` | **常に再計算される**（下記） |
| `glassType` | `calc.js` の `GLASS_TYPES` に存在するキーのみ |
| `windInput` | 告示風圧計算の**入力条件のみ**（v2で追加。算定済みtraceは保存しない。下記） |
| `extraFactor` | 告示外の追加低減係数（`0 < value <= 1.0`） |
| `provenance` | `publicLabel` / `verificationStatus` / `note`（公開してよい情報のみ） |

### designPressureは常に再計算する

```
designPressure = max(abs(positivePressure), abs(negativePressure))
```

シリアライズされた `designPressure` の値は**信用しません**。読み込み時・生成時のいずれでも上式から再計算するため、payloadが矛盾した設計風圧を主張しても計算には反映されません。正圧・負圧の片方が0であることは許容しますが、両方0（`designPressure = 0`）は実設計入力として意味を持たないため拒否します。

### validator（共通）

`schemaVersion` / `sourceKind` の値域、有限数であること、W/H > 0、`designPressure` > 0、`0 < extraFactor <= 1.0`、既知の `glassType` のみ、公開して安全な文字列であること、文字列長上限、必須フィールドの存在、未知フィールドの拒否、決定的な正規化（キー順固定）を行います。

### 信頼モデル（trust model）

- `registered_preset` の検証状況を持てるのは、**repository内のbuilt-in config だけ**です。registryは外部入力からpresetを登録する経路を一切持ちません。
- `manual` / `imported_unverified` は `verificationStatus: "unverified"` 以外を名乗れません（validatorが拒否します）。
- したがって、外部から取り込んだデータが案件の検証済みprovenanceを偽装することはできません。

---

## Preset registry（Phase 2D）

`project-config/registry.js` が、案件presetを `projectId` で登録・参照する境界を提供します。

| API | 動作 |
|---|---|
| `registerPreset(config)` | built-in presetの登録。重複 `projectId` は例外で拒否 |
| `getPreset(projectId)` | 未知の `projectId` は `undefined` を返さず**例外**（fail closed） |
| `hasPreset(projectId)` | 真偽値 |
| `listPresets()` | `[{ projectId, publicLabel }]`。ラベルは `getPublicLabel()` 境界のみを経由 |
| `createRegistry()` | 独立したregistryインスタンス（テスト用途等） |

- 登録できるのは `hasFixedPreset === true` を持つbuilt-in案件configだけです。手入力（`manual.js`、`hasFixedPreset: false`）は**trusted presetとして登録できません**。
- 公開ラベルは各configの `getPublicLabel()` のみを経由します（内部呼称 `projectName` へフォールバックしません）。

---

## 入力条件のExport / Import（Phase 2D）

現在の入力条件をJSONとして書き出し／読み込みできます。backendもlocalStorageも使わず、`file://` で直接開いた場合でも動作します。

- **Export**: 現在のモードの入力条件をdeterministicなJSONとしてtextareaへ出力します。
- **Import**: textareaのJSONを読み込み、成功時はW/H・ガラス構成・係数をUIへ反映して「取り込みデータ」モードで再計算します。
- Export → Import を往復しても、**計算に用いる値と計算結果は一致します**（信頼度だけが `imported_unverified` へ落ちます）。

### セキュリティ境界

読み込みは次を拒否または無害化します。

| 対象 | 扱い |
|---|---|
| `__proto__` / `prototype` / `constructor` キー | 拒否（生テキスト段階とparse後の再帰走査の二段で遮断） |
| payloadサイズ | 16KB超は拒否 |
| ネスト深さ | 8を超えたら拒否 |
| 未知のtop-level / provenanceフィールド | 拒否 |
| 不正なJSON | 拒否 |
| HTMLタグ・`javascript:`スキーム・URL・Windows/Unix絶対パス・制御文字を含む文字列 | 拒否 |
| 文字列長 | 上限超過は拒否 |

- `eval` / `Function` / 動的script挿入は使用しません（`JSON.parse` のみ）。
- 取り込んだ文字列をDOMへ表示する場合は `textContent` のみを使用し、`innerHTML` へ未サニタイズで流しません。

> ⚠️ これらは**既知パターンに対する境界**です。「あらゆる悪意あるpayloadを自動的に無害化できる」とは主張しません。信頼できない入力を扱う際は、内容を人が確認してください。

---

## 告示風圧計算モード（Phase 2E）

入力した風条件から帳壁ガラスの設計風圧を算定し、**入力値・式・係数・中間値・最終値まで追跡できる**
モードです。算定コアは `wind-pressure.js`（案件非依存の汎用モジュール）。

### 計算の流れ

```text
風条件を入力
  ↓  wind-pressure.js
Wind Pressure Trace（各ステップの式・値・単位）
  ↓
positivePressure / negativePressure
  ↓  project-config/project-input.js
Project Input Package（schemaVersion 2）
  ↓
calc.js（GlassCalc）
```

`calc.js` は風圧式を知らず、`wind-pressure.js` はガラス強度式を知りません。
GlassCalcへの特別なbypassはなく、他モードと同じ経路を通ります。

### 算定式

```text
H      = (建物高さ + 軒高) / 2                    [m]
H'     = max(H, Zb)                               [m]
Er     = 1.7 × (H' / ZG)^α                        [-]
qBar   = 0.6 × Er² × (V0 × y)²                    [N/m²]
Cf     = 外圧ピーク係数 − 内圧ピーク係数          [-]   ※正圧・負圧を別々に算定
W      = qBar × Cf                                [N/m²]
設計風圧 = max(|W+|, |W−|)                        [N/m²]
```

地表面粗度区分ごとの Zb / ZG / α:

| 区分 | Zb [m] | ZG [m] | α |
|---|---:|---:|---:|
| I | 5 | 250 | 0.10 |
| II | 5 | 350 | 0.15 |
| III | 5 | 450 | 0.20 |
| IV | 10 | 550 | 0.27 |

> **板ガラスでは粗度区分IVのとき区分IIIの数値を用います**（板硝子協会）。
> 本ツールは入力を書き換えず、`inputRoughnessCategory: IV` と
> `calculationRoughnessCategory: III` の**両方をトレースに表示**します。
> 読み替えが起きたことと、その理由が画面で確認できます。

### 2つの算定基準（重要）

再現期間による割増は**板硝子協会の推奨**であり、告示の最低基準ではありません。
本ツールは両者を混ぜず、基準を明示的に選択させます。

| 基準 | 再現期間係数 y | 意味 |
|---|---|---|
| `notification_baseline`（既定） | **1.00 固定** | 告示1458号系算定。割増を適用しない |
| `itakyo_recommended` | 50年 1.00 / 100年 1.07 / 200年 1.15 / 300年 1.19 / 500年 1.25 | 板硝子協会推奨。**再現期間を明示選択したときのみ**適用 |

`notification_baseline` は `recurrenceYears` を受け付けず、
`itakyo_recommended` は明示選択がなければ例外になります。
**y > 1.00 へ暗黙にdefaultする経路は存在しません。**

### 式の検証状況と入力値の検証状況は別（重要）

```text
formulaVerificationStatus : verified_primary_source   ← 式・係数は一次資料で確認済み
inputVerificationStatus   : user_input_unverified     ← 入力したV0・高さ・Z等は未検証
calculationStatus         : calculated
```

**式が検証済みであることは、あなたが入力した値が検証済みであることを意味しません。**
V0・粗度区分・建物高さ・軒高・評価高さ・建物種別・部位は、本ツールが案件原典と照合したものではありません。
UIでもこの2つを別々のチップとして表示します。

### 自動推定をしないもの

以下はいずれも**明示的な入力**であり、本ツールが推定することはありません。

| 項目 | なぜ推定しないか |
|---|---|
| 地表面粗度区分 | 所管特定行政庁の指定による。住所・都市計画区域から機械的に決まらない |
| 建物高さ / 軒高 / 評価高さ Z | **階（1F / 2F / 3F / RF）から Z を生成しません。** みよし案件の階↔Z対応は未解決のままです |
| 基準風速 V0 | 全国のV0表を部分的に実装すると「一部だけ正しい」表になるため、実装していません |
| 隅角部かどうか | 図面からのpoint-in-zone自動判定は行いません（`zone` は明示選択） |

### 案件プリセットとの参考比較（diagnostic）

告示風圧計算モードでは、既存の案件プリセット値と算定値を並べて表示します。

**これは参考比較であり、プリセットの置換でも検証状況の昇格でもありません。**
案件プリセットがどのH・Z・建物種別で算定されたかは本ツールでは確認できていません
（preset provenance unresolved）。数値が近くてもプリセットの `verificationStatus` は変わりません。

### 丸め

内部計算では丸めません。丸めは表示層のみです。

---

## Evidence アーキテクチャ（Phase 2F）

案件の事実（fact）を、**推測せず・private情報をpublic repoへ置かずに**管理するための仕組みです。

### モジュール構成

| モジュール | 役割 |
|---|---|
| `project-config/evidence.js` | 案件非依存の**Evidence契約**。level / checkedAt / public-safe境界 / Promotion Gate / public source reference検証 |
| `project-config/evidence-ledger.js` | 案件非依存の**Evidence Ledger**。field単位のfact、case-level昇格判定、read-onlyの照合 |
| `project-config/<project>.js` | 案件固有のfactと検証状況（例: `miyoshi.js`） |

Phase 2Fで、Evidence契約を案件固有モジュールから `evidence.js` へ切り出しました。
**契約の正は1か所だけ**で、Ledgerも案件configも再実装しません。

### Promotion Gate — verified を名乗れる条件

```text
verificationStatus === 'verified' のとき、すべて必要:

  evidence.level === 'primary'
  evidence.checkedAt が妥当な "YYYY-MM-DD"
  かつ
  evidence.privateReferenceAvailable === true
  または 構造検証を通った public primary source reference
```

これは**実際の構築経路**（`verifiedValue()` / 案件identity構築 / case検証）で強制されます。
gateを呼ばない経路は存在しません。

以下は**いずれも根拠になりません**。

```text
「たぶん正しい」
「数値が近い」
「告示風圧計算でだいたい再現できる」
「preset値から逆算できる」
```

### private Evidence は保存しない

public repositoryに保存してよいのは次だけです。

```yaml
verificationStatus: verified | partially_verified | unverified
evidence:
  level: primary | indirect | none
  checkedAt: "YYYY-MM-DD"
  publicDescription: 公開してよい説明（URL・パス・IDを含めない）
  privateReferenceAvailable: true   # 「社内に根拠がある」という事実だけ
sourceReference: null               # private Evidenceでは常に null
```

**private Drive URL / SharePoint URL / Notion URL / 内部パス / ファイル名 / 図面番号 /
担当者名 / 施主の正式名称 は保存しません。**

### public primary source reference

公的な公開資料に限り、参照URLを保持できます。

```yaml
sourceReference:
  kind: public_primary
  url: https://...    # 構造検証を通ったもの
```

構造検証の内容: https であること / 資格情報を埋め込まないこと / localhost・loopback・
私設ネットワーク・IPリテラルでないこと / 既知のprivate provider（Drive・Docs・Notion・
SharePoint・Dropbox・OneDrive・Box・Drive/GCSの実ダウンロードホスト）でないこと /
完全修飾ホスト名であること（**末尾のルートドットを除去してから**判定する。
`drive.google.com.` はDNS上同じホストを指すため、正規化前に判定するとdenylistを素通りする） /
私設TLD（`.local` / `.internal` / `.corp` 等）・CGNAT・wildcard DNSでないこと /
tokenを提供元にしないこと（percent-encodeされたparam名も含む）。

> ⚠️ 検証しているのは **public-safeな構造** であって、その資料が本当に一次資料か・
> 発行者が信頼できるかではありません。**それはHuman / reviewerの判断**です。
> 構造検証を通ったことを「一次資料であることの証明」と読み替えないでください。

なお `publicDescription` は逆に**URLを含めることを禁止**します（説明文へ参照先を書かせないため）。
役割が正反対なので、両者を同じ検証で扱いません。

### field verified と case verified は別

あるfactがverifiedでも、caseがverifiedになるとは限りません。

```text
pane_width_mm   : verified
pane_height_mm  : verified
positive_pressure : unverified
negative_pressure : unverified

→ dimension facts は verified
→ **case は NOT VERIFIED**
```

caseがverifiedを名乗るには、そのcase typeのcritical factが**すべて**gateを通っている必要があります。
算定由来のprovenanceを主張する場合は、評価高さの根拠も必要です。

### 照合（reconciliation）— 数値的一致は検証済みを意味しません

read-onlyの診断で、preset値とEvidenceを突き合わせます。

| status | 意味 |
|---|---|
| `MATCH` | Evidenceがverifiedで、値も一致 |
| `MISMATCH` | Evidenceがverifiedだが、値が一致しない → **presetを自動変更せずHuman Gateへ** |
| `INSUFFICIENT_EVIDENCE` | Evidenceがverifiedでない（**数値が一致していてもこれ**） |

**判定順序はEvidenceが先、数値が後です。** 逆にすると「数値が合っているから検証済み」という
最も危険な誤解をコードが追認してしまいます。照合はpresetを書き換えません。

### 現在の状態 — Evidence は未取得

```yaml
private_evidence: UNAVAILABLE
project_specific_promotion: NONE
verifiedCases: 0
explicit_unverified_items: 4
```

本実行環境からは案件の一次資料へアクセスできず、Task Packetにも案件factの実データは
含まれていませんでした。したがってPhase 2Fは**仕組みだけを構築し、案件factの昇格は行っていません**。

`verifiedCases` が空であることはbugではありません。
**「空だから何か埋める」ことを目的にしていません。**

未解決のまま維持している4項目:

```text
1. ガラス1枚の実見付 W / H（1250×2050 は sample_default / unverified）
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m² の元計算根拠
3. 負圧 918 / 1122 N/m² の元計算根拠
4. 各階評価高さ Z と preset の対応
```

### Evidence Request Matrix — 何があれば昇格できるか

以下が得られれば、上記のPromotion Gateを通して昇格できます。
**ファイル名・URL・Drive ID・図面番号・担当者名は不要です**（public repoにも記録しません）。

| 必要なfact | 必要なEvidence |
|---|---|
| ガラス見付幅 | ガラス**1枚**の見付幅を直接示す一次資料（CW全体幅や列ピッチからの逆算は不可） |
| ガラス見付高さ | ガラス**1枚**の見付高さを直接示す一次資料（ACW全体高さは不可） |
| 階別正圧 | 当該pressure値が直接記載された資料、または算定inputs一式（V0 / 粗度 / 建物高さ / 軒高 / 評価Z / 建物種別 / zone / 算定基準）が直接記載され、Phase 2E Trace Engineで再現できること |
| 部位別負圧 | 同上 |
| floor → 評価高さ Z | 階（1F / 2F / 3F / RF）と評価高さの対応が**直接**分かる資料（階高からの生成は不可） |

公開リポジトリへ残るのは、値と検証状況と公開可能な説明だけです。

---

## 一括検討 Workspace（Phase 2G）

複数のガラス・複数条件を1画面でまとめて検討するためのレイヤ。
**Single（単一ケース）が既定**で、Batchはその横に並ぶ別viewである。

### Batchは計算を持たない

これが本機能の中心的な制約である。Batch layerには
ガラス強度式も風圧式も**無い**。各ケースは単一ケース計算とまったく同じ経路を通る。

```text
Project Input Package v2
  → GlassCalc.paneAreaM2()
  → GlassCalc.generateCandidates()
  → GlassCalc.splitCandidates()
  → 推奨候補 = OKかつ適用範囲内の先頭
```

見付面積の式は `GlassCalc.paneAreaM2()` に1つだけあり、
単一ケースUIとBatchの**両方がそれを呼ぶ**。同じ式を2か所に書くと、
片方だけ直したときに静かにズレる。テストは `workspace.js` のソースを読み、
計算コアの識別子（`k1` / `k2` / `Er` / `qBar` / `Cpe` / `Gpe`）や
案件固有値が現れたら失敗する。

### Workspace Package v1

```json
{
  "schemaVersion": 1,
  "workspaceType": "glass_batch_workspace",
  "cases": [
    { "caseId": "case-001", "label": "北面 2F A", "inputPackage": { "...": "PIP v2" } }
  ]
}
```

- 1ケース = 既存の **Project Input Package v2**。PIPは v2 のままで、Phase 2Gのために v3 へ上げていない。
- **保存するのは入力だけ**である。設計風圧・推奨構成・許容耐力・余裕・traceといった
  計算結果を正本として保存しない。import後は必ず計算し直す。
  保存してしまうと「計算し直した値」と「ファイルが主張する値」の2つの正本ができ、
  古いほうを信じる経路が生まれる。
- Evidence fieldそのものを受け付けない。

### ケースの追加経路と信頼レベル

| 経路 | 扱い |
|---|---|
| 現在の入力条件を追加 | アプリ内部で生成済みのnormalized PIP。内部stateなので `sourceKind` を保持する |
| Workspace JSON Import | **外部データ**。各ケースは既存の `ProjectInput.deserialize()` を必ず通る |
| TSV貼り付け | **外部user input**。`manual` / `notification` にしかならない |

外部importは、ファイルが `registered_preset` / `verified` / `primary` を名乗っても
`imported_unverified` / `unverified` へ降格する。
改ざんされた `designPressure` は正圧・負圧から再計算されて上書きされる。
TSVから registered preset や Evidence を作る経路は**存在しない**。

### Excelからの貼り付け（TSV）

自動連携ではない。**コピー＆貼り付けと、CSVの書き出しだけ**である。
スプレッドシートとの同期・Google Sheets連携・BIM連携はいずれも行わない。

共通列: `case_id` / `label` / `mode` / `width_mm` / `height_mm` / `glass_type` / `extra_factor`

| mode | 追加で必要な列 |
|---|---|
| `manual` | `positive_pressure` / `negative_pressure` |
| `notification` | `v0` / `roughness` / `building_height_m` / `eaves_height_m` / `evaluation_height_m` / `building_type` / `zone` / **`basis`** |

`basis` は **必須**である。既定値を持たせていない理由は、
`notification_baseline`（告示系）と `itakyo_recommended`（板硝子協会推奨）の
どちらを設計の根拠にするかが判断であり、片方を黙って既定にすると
業界推奨値が法定最低値として通る（またはその逆）ため。

- 設計風圧・推奨ガラス・検証状況といった**計算結果側の列は受け付けない**。
- 未知の列は読み飛ばさず**エラーにする**（黙って無視すると、書いたつもりの条件が消える）。
- header行数より多いセルを持つ行も、切り捨てずエラーにする。

### 取り込めなかった行の扱い

取り込めなかった行は消えず、一覧に **「入力エラー」** として残る。
ただしそれは Workspace が持つ**入力**ではない。

Workspaceがauthoritativeに保持する入力は常に妥当な PIP v2 だけであり、
壊れた行は**表示専用の診断レコード**として別レイヤに隔離される。
診断レコードは計算に属する値をすべて `null` で持つため、
最大設計風圧にも支配ケースにも混ざらない。
Workspace JSONへも出力されないので、再importで復活することもない。

診断が持つ情報は**位置と理由だけ**である。

```text
TSV            : 物理行番号 / 安全なcaseId / 列名 / 理由
Workspace JSON : case index / 安全なcaseId / 理由
label          : normalizeLabel を通った値のみ
```

行番号は**貼り付けたシート上の物理行**である。空行があっても番号はずれない。

理由の文面には、落ちた値そのものを残さない。
validatorのメッセージは落ちた値を引用符で埋め込むため、
既知の語彙（列名・enum値・ガラス種別など）以外の引用部分は伏せ字にし、
全体の長さにも上限を設ける。CSVは共有されるファイルなので、ここが実際の流出経路になる。

### 結果CSV

計算結果の書き出し専用で、**入力として読み戻す経路は無い**。

表計算ソフトがセルを数式として解釈しないよう、
`=` `+` `-` `@` タブ・CR で始まる**文字列セル**は先頭に `'` を付けて中和する。
数値セルは中和しない（`-918` は `-918` のまま）。
quote / カンマ / 改行は RFC4180 に従ってescapeする。

### サマリと支配ケース

支配ケースの定義を画面に併記する。「最も危険」のような曖昧な表現は使わない。

```text
基本 : OKケースのうち「推奨構成の許容耐力 ÷ 設計風圧」が最小のもの
代替 : OKケースが無い場合は、設計風圧が最大のもの
```

余裕比・余裕(N/m²)は**単なる計算上の余裕**であり、設計判断上の追加安全率ではない。

### 保存とサイズ上限

Workspaceは**メモリ上だけ**に存在する。サーバー・DB・アカウント・
localStorage のいずれにも保存しない。案件名等のruntime dataをブラウザへ
永続化するprivacy contractを別途設計していないためである。
残す場合は明示的にExportする。

```text
最大ケース数        : 1000（空行でこの上限を回避できない）
Workspace JSON     : 1MB
TSV                : 1MB
label              : 200文字
caseId             : 64文字 / 先頭は英字
1ケースあたりのPIP  : 既存の16KB / depth 8 / string 512 がそのまま効く
```

### Evidence は変わらない

Phase 2G は Evidence Phase ではない。
`verifiedCases` は `[]` のまま、案件factの昇格は一切行っていない。
Batch rowが同じ数値を何度含んでもEvidenceは増えない
（検証状況はfactの出所に属し、出現回数に属さない）。
1250×2050 は引き続き `sample_default` / `unverified` である。

### 今回やっていないこと

データベース / クラウド保存 / ログイン / 複数人同時編集 / サーバーAPI /
スプレッドシート自動同期 / Google Sheets連携 / BIM・Revit連携 / DWG解析 /
PDF図面読み取り / メーカー製品DB / verified caseの自動生成 / private Evidenceの取得。

## 案件プロファイル / 検討ケース（Phase 2H）

同じ案件で告示風圧のケースを大量に作るとき、V0・粗度・建物高さ・軒高・建物タイプ・
算定基準を毎回打ち直すのは現実的ではありません。これを1回だけ入力するためのレイヤです。

```text
プロファイル（案件共通） : V0 / 粗度 / 建物高さ / 軒高 / 建物タイプ / 算定基準
検討ケース（開口ごと）   : W / H / 評価高さ Z / 部位 / ガラス種別 / extraFactor
```

### これは「登録済み案件プリセット」ではありません

| | Registered Preset | Runtime Project Profile |
|---|---|---|
| 位置づけ | リポジトリに組み込まれた設定 | **その場の利用者入力** |
| 検証状況 | 個別にEvidenceを持つ | `user_input_unverified` のみ |
| 変更 | ソース変更＋レビュー | 画面で自由に変更 |

保存しても、Exportしても、100ケースで使っても検証状況は変わりません。
**算定式が一次資料で検証済みであること**と、**そこへ入れた値が検証済みであること**は別です。

Profile / Scenario のschemaは `verificationStatus` / `evidence` / `sourceReference` /
`privateReferenceAvailable` / `sourceKind` / `presetId` を**受け付けません**。
手で組んだobjectがこれらを名乗っても、計算にもプレビューにも入れません。

### 評価高さ Z と部位はプロファイルに入りません

この2つは開口ごとに違い、設計風圧を直接左右します。案件共通値として暗黙継承させると、
別階・別部位へ同じ値が適用され、しかも画面上は正常に見えます。

そのためこれは「入れてはいけない」という規約ではなく、**プロファイルのschemaに
入れる場所が無い**構造にしてあります。継承しようがありません。

### 階から評価高さを作りません

ケースのラベルに `2F` と書いても、評価高さは**必ず独立入力**です。
ケースTSVの `floor` / `storey` / `level` 列は専用のメッセージで拒否します。

階と評価高さの対応は、Phase 2Fから引き継ぐ未検証項目の1つです。
ラベルの見た目から数値を作ることは、根拠を捏造することと同じです。

### 既定値を作りません

V0 / 粗度 / 建物高さ / 軒高 / 建物タイプ / 算定基準 / 評価高さ / 部位 のいずれも、
欠けていればエラーにします。

とくに算定基準は既定値を持ちません。告示1458号系と板硝子協会推奨の
どちらを設計の根拠にするかは判断であり、片方を黙って既定にすると
業界推奨値が法定最低値として通ります（またはその逆）。

部位を「一般部」に、評価高さを建物高さに落とすのも同じ性質の誤りです。
どれも「それらしい値」が入るため、間違っていても気づけません。

### 何を使って計算したのかを表示します

「プロファイルから継承」とだけ書かず、**最終的に使う値**を項目ごとに表示します。

```text
V0                 34      プロファイル（共通・未検証）
roughnessCategory  III     プロファイル（共通・未検証）
buildingHeightM    14.2    プロファイル（共通・未検証）
basis              notification_baseline   プロファイル（共通・未検証）
evaluationHeightM  14.2    このケース
zone               general このケース
widthMm            1250    このケース
```

### Workspaceへ追加した時点で値が固定されます

ケースをWorkspaceへ追加すると、その時点の値が Project Input Package v2 として
**固定**されます。あとでプロファイルを変更しても、既にあるケースは変わりません。

自動同期しません。プロファイルを変更すると
「既存のケースには反映されていません」と表示します。

過去の検討結果が、共通条件を直したというだけで知らないうちに変わるのは、
実務上いちばん危険な挙動だからです。変更後の条件で計算するには、明示的に追加し直します。

### 組み合わせ生成

明示した値のリストから直積を作ります。

```text
幅   : 1250, 1500
高さ : 2050
Z    : 4.2, 8.4, 12.6
部位 : general, corner
→ 12 ケース（生成前に件数を表示します）
```

上限は**1000ケース**で、これは絶対の上限です。呼び出し側のオプションで
広げることはできません（狭めることだけできます）。
既にWorkspaceにあるケース数も合算して判定します。

### ケースTSV（Excel貼り付け）

```text
scenario_id / label / width_mm / height_mm / evaluation_height_m / zone / glass_type / extra_factor
```

- 風条件の列（`v0` / `roughness` / `building_height_m` / `basis` 等）は**受け付けません**。
  「共通条件プロファイル」という意味が曖昧になるためです。
  個別に風条件を変える場合は、Phase 2G の Workspace TSV を使ってください。
- 行番号は貼り付けたシート上の**物理行**です。空行があってもずれません。
- 取り込めなかった行があっても、**後続の行は取り込まれます**。
  IDが重複した場合は既存の行を上書きせず、その行だけをエラーにします。
- 診断に出るのは位置と理由だけで、生の行は出しません。

### Profile Package v1

プロファイルだけをExport / Importできます。保存するのは**入力だけ**で、
計算結果・trace・検証主張・Evidence・推奨ガラスは保存しません。
読み込んだプロファイルは常に `user_input_unverified` です。

Workspaceのexportはプロファイルに依存しません。
**Workspace JSONだけで再計算できます**（プロファイルのファイルが無くても再現します）。

### メモリ上だけに存在します

プロファイルも検討ケースも、この画面を閉じると消えます。
localStorage・サーバー・DBのいずれにも保存しません。残す場合は明示的にExportします。

### Evidenceは変わりません

Phase 2H はEvidence Phaseではありません。`verifiedCases` は `[]` のままで、
案件factの昇格は行っていません。プロファイルの入力回数や、同じ値が100ケースで
使われることは、Evidenceを増やしません。

### 今回やっていないこと

データベース / クラウド保存 / ログイン / チーム共有 / スプレッドシート自動同期 /
BIM・Revit連携 / DWG・PDF解析 / メーカー製品DB / 検証済みプロファイル /
registered preset作成UI / 階→評価高さの自動変換 / Production反映。

## 設計定数

### 設計風圧（正圧・負圧）＝「みよし案件プリセット」値

以下の設計風圧は、**告示から自動算定した値ではありません**。みよし案件の設計風圧をそのまま定数化した固定プリセット値です。**Phase 2A以降、正（authoritative source）は `project-config/miyoshi.js`（`wind.positivePressureByFloor` / `wind.negativePressureByZone`、`verificationStatus`付き）です。Phase 2Dで `calc.js` 側の後方互換複製は削除され、正はこの1箇所だけになりました。**他案件に流用する場合は、その案件の構造計算書等で妥当性を個別に確認してください。

#### 監査メモ（2026-09-17時点）

値そのものは変更していません。

- **基準風速 V0 = 34 m/s・地表面粗度区分 III は、社内基本設計資料（外構の風荷重条件）で直接確認済み**（`verificationStatus: "verified"`）です。みよし市の法定値 V0=32m/s とは異なり、本案件では34m/sを案件側設計条件として採用しているため、32m/sへの変更は行いません。
- 負圧側の外圧ピーク係数（H≦45m：一般部 -1.8／隅角部 -2.2）は、**Phase 2Eで一次資料（板硝子協会）により確認済み**です（`.agent-run/LR-20260919-GLASS-P2E/EVIDENCE.md` §4.3）。Phase 2D以前は案件の負圧値からの逆算として導入されていましたが、現在は係数表そのものが出典で裏付けられています。
- この係数を用いると、918 / 1.8 = 510 N/m²、1122 / 2.2 = 510 N/m² となり、**平均速度圧 qbar ≈ 510 N/m²** 相当で揃います。
- **ただし、係数表が確認できたことと、案件プリセットが特定のH・Zで算定されたことは別です。** 上記の qbar ≈ 510 N/m² は「そう仮定すると整合する」という観察であり、案件プリセットの算定条件を確認したものではありません（preset provenance unresolved）。
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
├── index.html                    # UI（入力フォーム・結果表示・入力モード切替）。calc.js / project-config を読み込んで使用
├── calc.js                       # 汎用計算コア（k1・k2・許容耐風圧・candidate generation等。案件非依存）
├── wind-pressure.js              # 汎用風圧算定コア（Phase 2E）。Er・qBar・Cpe/Gpe・Cf・trace。案件非依存
├── workspace.js                  # 一括検討Workspace（Phase 2G）。case管理・評価orchestration・TSV/JSON/CSV。案件非依存・計算式を持たない
├── project-profile.js            # 案件プロファイル / 検討ケース（Phase 2H）。共通風条件・effective resolver・Matrix。案件非依存・計算式を持たない
├── project-config/
│   ├── evidence.js               # 案件非依存のEvidence契約（Phase 2F）。Promotion Gate・public source reference検証
│   ├── evidence-ledger.js        # 案件非依存のEvidence Ledger（Phase 2F）。field/case昇格・read-only照合
│   ├── miyoshi.js                # 「みよし案件」固有プリセット（設計風圧・初期寸法）＋検証状況・Evidenceメタデータ
│   ├── manual.js                 # 「手入力 / Generic」モードの入力契約（Phase 2C）。miyoshi.jsに非依存
│   ├── registry.js               # generic preset registry（Phase 2D）。built-in presetのみ登録可・unknownはfail closed
│   └── project-input.js          # versioned Project Input Package（Phase 2D〜2E）。v2でwindInputを保持
├── tests/
│   ├── calc.test.js              # 汎用計算コアの known-answer test + core purity（node:test）
│   ├── project-config.test.js    # project-config分離の整合性・Evidence契約・代表ケース回帰テスト
│   ├── manual-config.test.js     # 手入力モードの回帰・不正入力・Miyoshi非依存性のテスト（Phase 2C）
│   ├── project-input.test.js     # Project Input Package / registry / import security のテスト（Phase 2D）
│   ├── wind-pressure.test.js     # 風圧算定のknown-answer / 境界 / 単位 / 検証状態分離（Phase 2E）
│   ├── evidence.test.js          # Evidence契約・Promotion Gate・public source reference（Phase 2F）
│   ├── evidence-ledger.test.js   # Evidence Ledger・case昇格・照合・spoofing（Phase 2F）
│   ├── ui-mode-separation.test.js # 入力モードのUI契約テスト（Phase 2C〜2E）
│   ├── workspace.test.js         # Workspace契約・評価・TSV/JSON/CSV・診断隔離・行番号（Phase 2G）
│   ├── batch-ui.test.js          # Batch UIの契約テスト（Single既定・textContent境界・診断配線）（Phase 2G）
│   └── project-profile.test.js   # プロファイル契約・resolver等価性・snapshot・Matrix cap・canonical gate（Phase 2H）
├── package.json
└── README.md                     # このファイル
```

`index.html` は UI（入力取得・入力モード切替・Export / Import・DOM描画）のみを担当します。Phase 2D以降、入力条件はモードによらず `project-config/project-input.js` のProject Input Packageへ正規化してから `calc.js`（案件非依存の汎用計算コア）へ渡します。案件presetは `project-config/registry.js` 経由でlookupします。いずれのファイルも `<script src="...">` によるブラウザ読み込みと、Node.js の `require(...)` の両方に対応しています（ビルド不要・`file://` 互換）。

読み込み順（`index.html`）: `calc.js` → `miyoshi.js` → `manual.js` → `registry.js` → `project-input.js`

### Phase 2D：calculation coreの完全な案件非依存化とmigration

Phase 2A〜2Cでは、案件固有値の正（authoritative source）を `project-config/` へ移しつつ、既存の挙動とテストを壊さないために `calc.js` 側へ**非推奨（deprecated）の複製**を残していました。Phase 2Dで全consumerの移行が完了したため、これらを削除しました。

**削除した `calc.js` のexport:**

| 削除したexport | 現在の正（authoritative source） |
|---|---|
| `POSITIVE_PRESSURE_MIYOSHI_PRESET` | `MiyoshiProjectConfig.wind.positivePressureByFloor` / `getPositivePressure(floorKey)` |
| `NEGATIVE_PRESSURE_MIYOSHI_PRESET` | `MiyoshiProjectConfig.wind.negativePressureByZone` / `getNegativePressure(zoneKey)` |
| `UNVERIFIED_DEFAULT_DIMENSIONS_MM` | `MiyoshiProjectConfig.dimensions` / `getDefaultDimensionsMM()` |

**移行方法:**

```js
// Phase 2C まで（削除済み。現在は undefined を返します）
const designP = GlassCalc.POSITIVE_PRESSURE_MIYOSHI_PRESET['2'];
const dflt = GlassCalc.UNVERIFIED_DEFAULT_DIMENSIONS_MM;

// Phase 2D 以降
const preset = PresetRegistry.getPreset('miyoshi');
const designP = preset.getPositivePressure('2');
const dflt = preset.getDefaultDimensionsMM();

// あるいは Project Input Package 経由（推奨）
const pkg = ProjectInput.fromPreset(preset, {
  floorKey: '2', zoneKey: 'general',
  widthMm: 1250, heightMm: 2050,
  glassType: 'fl_single', extraFactor: 1.0
});
// pkg.designPressure は max(|正圧|, |負圧|) から常に再計算される
```

`calc.js` には現在、案件固有の値・ラベル・provenance（`verificationStatus` / `evidence`）が一切含まれていません。これは `tests/calc.test.js` のcore purityテストがソースレベルで継続的に検査します。**案件固有値を `calc.js` へ再び複製しないでください。**

### Phase 2A：案件固有入力と汎用計算コアの分離

Phase 1（告示式是正）に続き、Phase 2Aでは「案件固有入力」（みよし案件の設計風圧・初期寸法）と「汎用計算コア」（k1・k2・許容耐風圧計算式・candidate generation等）を分離しました。

- **`calc.js`**：原則、告示・板硝子協会資料に基づく計算式・candidate generation/sorting/splitのみを担当する「汎用計算コア」。案件を問わず再利用可能。
- **`project-config/miyoshi.js`**：「みよし案件」固有のプリセット値（`dimensions`：初期寸法、`wind`：階別正圧・部位別負圧・V0・地表面粗度区分）と、値ごとの検証状況メタデータを保持するモジュール。`index.html` はこのモジュールを案件プリセットの正（authoritative source）として参照します。
- **後方互換について**：Phase 2A〜2Cの間、`calc.js` には案件固有プリセットの非推奨（deprecated）な複製が残っていましたが、全consumerの移行完了に伴い**Phase 2Dで削除済み**です。移行方法は上記「Phase 2D：calculation coreの完全な案件非依存化とmigration」を参照してください。
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
| `level` | `primary`（一次資料で直接確認）／ `indirect`（間接的な数値整合等の状況証拠のみ）／ `none`（根拠未発見）。これ以外の値は `assertEvidenceConsistency()` が reject する |
| `checkedAt` | 確認・レビューを行った日付。`null`、または実在するカレンダー日付を表す `"YYYY-MM-DD"` 形式の文字列のみ許容（単なるtruthy判定ではなく、形式・実在する日付かどうかまで検証される。例: `"2026-13-40"` や `"2026/09/17"` は reject） |
| `publicDescription` | 公開リポジトリに書いてよい、根拠の説明文（固有名詞・内部識別子を含めない） |
| `privateReferenceAvailable` | 社内に（未開示の）参照資料が存在するかどうかの真偽値のみ |

`verificationStatus` は `project-config/miyoshi.js` の `VERIFICATION_STATUSES = ['verified', 'partially_verified', 'unverified']` のいずれかでなければならず、`'verifed'`（タイプミス）や `'Verified'`（大文字小文字違い）のような値は即座に reject されます。

### Evidence promotion guard

`verificationStatus` が `"verified"` の値は、**必ず** `evidence.level === "primary"` かつ `evidence.checkedAt` が妥当な日付として設定されていなければなりません。これは `project-config/miyoshi.js` の `assertEvidenceConsistency()` によって強制されます。

- **`identity` を含む、すべての `"verified"` な値が対象です。** `verifiedValue()` を経由する値（`wind.V0` / `wind.roughnessCategory` / `dimensions.defaultW` / `defaultH` / 階別・部位別風圧プリセット）は `verifiedValue()` の内部で、`identity` は構築直後に明示的に `assertEvidenceConsistency('verified', identityEvidence, 'identity')` を呼び出すことで、それぞれモジュール読み込み時点（`require()` / `<script>` 実行時点）のチェックに含まれます。
- 条件を満たさない値を `"verified"` にしようとすると、**モジュールの読み込み自体が例外で失敗します**（後から `validateAllEvidence()` を呼んで検出する方式ではありません）。
- `config.validateAllEvidence()` を呼ぶと、config全体を走査してこの整合性を回帰確認できます（`tests/project-config.test.js` でテスト済み）。

### 現時点のEvidence状況

| 項目 | verificationStatus | evidence.level | evidence.checkedAt | 説明 |
|---|---|---|---|---|
| `identity`（案件識別情報） | `verified` | `primary` | `2026-09-17` | 社内基本設計資料で直接確認済み。ただし`disclosureStatus: "redacted"`のため固有名詞は非開示 |
| `wind.V0`（基準風速） | `verified` | `primary` | `2026-09-17` | 社内基本設計資料の外構風荷重条件で直接確認済み |
| `wind.roughnessCategory`（地表面粗度区分） | `verified` | `primary` | `2026-09-17` | 同上 |
| `wind.positivePressureByFloor` / `negativePressureByZone`（階別・部位別風圧プリセット） | `partially_verified` | `indirect` | `2026-09-17` | V0・粗度区分との数値整合は確認済みだが、元の外装材/ガラス構造計算書・各階評価高さZとの直接対応は未確認 |
| `dimensions.defaultW`（幅の既定値） | `unverified` | `none` | `null` | ガラス1枚の見付幅Wと直接対応する根拠は見つかっていない |
| `dimensions.defaultH`（高さの既定値） | `unverified` | `indirect` | `2026-09-17` | ACW全体高さとして類似値の記録候補（2026-09-17確認）はあるが、ガラス1枚の見付高さとの対応は未確認。`checkedAt`が設定されていても`verificationStatus`は`unverified`のまま（`verified`への昇格を意味しない） |

### Verified project case（将来の拡張）

`project-config/miyoshi.js` の `verifiedCases` 配列は、将来ガラス1枚の実見付W/Hと設計風圧の根拠（元計算書・評価高さZ）の両方が確認できた案件ケースを追加するための領域です。スキーマは同ファイルのコメントに記載しています。**現時点ではガラス1枚の実寸が未確認のため、架空のverified caseは追加せず、空配列のまま維持しています。**

### Evidence factory / verified-case validatorのhardening（Phase 2C）

Phase 2Cで、Evidence関連の入口関数を以下のとおり強化しました（`calc.js`・値・`verificationStatus`・`verifiedCases`（空配列のまま）はいずれも無変更）。

- **`makeEvidence()` の `checkedAt` 黙示的丸め込みを廃止。** 以前は `checkedAt: checkedAt || null` という実装で、`''`・`false`・`0` 等のfalsy値を例外なく黙って `null` に丸め込んでいました。現在は `isValidCheckedAt()` による同じhard validation（`null`、または実在するカレンダー日付を表す `"YYYY-MM-DD"` 文字列のみ許容）を `makeEvidence()` の入口でも強制し、不正な値は `makeEvidence()` 呼び出し時点で例外を投げます。
- **`makeEvidence()` は `level` もfactory入口で検証します。** `EVIDENCE_LEVELS`（`primary`/`indirect`/`none`）以外の値を渡すと即座に例外です。
- **`validateVerifiedCase(caseObj)` を新設。** 将来 `verifiedCases` へ実ケースを追加する際の入力契約です。`caseId`/`floor`/`zone`/`widthMm`/`heightMm`/`glassType`/`designPressure`/`evidence`/`publicEvidenceDescription` の必須フィールド、`floor`/`zone` の値域、寸法・圧力の正の有限数であること、`widthEvidence`/`heightEvidence`/`pressureEvidence` がいずれも `verified` 相当（`evidence.level === "primary"` かつ妥当な `checkedAt`）であることを要求する hard condition、および `publicEvidenceDescription` への内部限定識別子（Drive/Notion/SharePoint/Dropbox URL等）混入拒否を検証します。**このvalidatorはまだどのケースにも適用されていません**（`verifiedCases` は引き続き空配列）。

---

## テスト

Node.js 標準の `node:test` を利用した known-answer test を用意しています（追加の依存パッケージは不要）。

```bash
npm test
# または
node --test
```

### テストファイル構成

| ファイル | 対象 |
|---|---|
| `tests/calc.test.js` | 汎用計算コアのknown-answer test、寸法感度、TP適用範囲、**core purity**（案件固有値がcalc.jsに存在しないこと） |
| `tests/project-config.test.js` | 案件presetの値・`verificationStatus`・Evidence契約・代表ケース回帰 |
| `tests/manual-config.test.js` | 手入力モードの入力契約・不正入力・Miyoshi非依存性 |
| `tests/project-input.test.js` | Project Input Package / preset registry / trust boundary / import security / v1→v2 migration |
| `tests/wind-pressure.test.js` | 風圧算定のknown-answer・境界（Er / Cpe / Gpe / 負圧 / 再現期間）・単位規律・検証状態分離・案件非依存性 |
| `tests/ui-mode-separation.test.js` | 入力モードのUI契約（表示分離・textContent境界・package経由の計算・自動推定の不在） |
| `tests/workspace.test.js` | Workspace契約・case lifecycle・評価orchestration・summary/grouping・sort/filter・Workspace Package v1・TSV（物理行番号・trust・上限）・CSV（数式中和・escaping）・INVALID診断の隔離・診断の秘匿 |
| `tests/batch-ui.test.js` | Batch UIの契約（Single既定・`[hidden]` vs `display:grid`・innerHTML不使用・診断配線・永続化の不在） |
| `tests/project-profile.test.js` | プロファイル契約（unverifiedのみ・Z/zone不在・floor→Z無し・既定値無し）・effective resolverとdirect pathの等価性・snapshot semantics・Matrix生成と絶対上限・TSV行単位隔離・canonical result-side gate |

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
- **Evidence Guard Required Fixのテスト**（2026-09-17時点の追加分）
  - `VERIFICATION_STATUSES` に定義された3値以外（`'verifed'`・`'Verified'`・`null`・`undefined`・`''`等）を渡すと `assertEvidenceConsistency()` が例外を投げること
  - `evidence.checkedAt` に不正な形式・実在しない日付（`'abc'`・`'2026/09/17'`・`'2026-9-17'`・`'2026-13-40'`・`'2026-02-30'`・`true`・`123`等）を渡すと例外を投げること。`null` および妥当な `'YYYY-MM-DD'` は許容されること
  - **`identity` がモジュール読み込み時点のfail-fast contractに含まれること**：`project-config/miyoshi.js` のソースを一時的に書き換えて `identity.evidence.level` を `'primary'` から `'indirect'` に、または `checkedAt` を欠落させた壊れたコピーを作り、それを `require()` すること自体が（`validateAllEvidence()` を後から呼ぶのではなく）例外で失敗することを確認する
  - `dimensions.defaultH.evidence.checkedAt === '2026-09-17'` でありながら `verificationStatus` は引き続き `'unverified'` のままであること
- 代表ケース回帰：`project-config` の値を `calc.js` の汎用計算コアへ渡した結果が、config分離前（Phase 1）と完全に同じ値になること
  - FL6, W=1250mm, H=2050mm, 2F, 一般部, extraFactor=1.00 → **P ≈ 1756.09756 N/m²**、designP=1525 N/m² → **OK**
  - FL6, W=1500mm, H=2050mm, 2F, 一般部, extraFactor=1.00 → **P ≈ 1463.41463 N/m²**、designP=1525 N/m² → **NG**
- **Evidence factory / verified-case validatorのテスト**（Phase 2C時点の追加分。上記「Evidence factory / verified-case validatorのhardening」参照）
  - `makeEvidence()` に不正な `checkedAt`（`''`・`false`・`0`・`'abc'`・`'2026/09/17'`・`'2026-9-17'`・`'2026-13-40'`・`'2026-02-30'`・`true`・`123`・`NaN`）を渡すと、黙って `null` に丸め込まれず例外を投げること。`null`/`undefined` のみが正しく `null` として成立すること
  - `makeEvidence()` に不正な `level` を渡すと例外を投げること（factory入口でのhardening）
  - `validateVerifiedCase()` が、必須フィールドをすべて満たす妥当なケースを受理し、必須フィールド欠落・`floor`/`zone`の不正値・`widthMm`/`heightMm`/`designPressure`の非数値/非正値・W/H/pressure evidenceのいずれかが`primary`でない場合・evidenceの`checkedAt`欠落・`publicEvidenceDescription`への内部限定識別子混入（private URL/ID rejection）を、それぞれ個別に例外で拒否すること

### 手入力 / Genericモードのテスト（`tests/manual-config.test.js`、Phase 2C）

- `ManualProjectConfig.projectId === "manual"`、`getPublicLabel() === "手入力 (Manual / Generic)"`
- `identity.verificationStatus` は常に `"unverified"`（本ツールが手入力値を「verified」と主張しないことの確認）
- `manual.js` のソースが `miyoshi.js` を `require` せず、`MiyoshiProjectConfig` を参照せず、みよし案件の正圧・負圧プリセット数値をハードコードしていないこと（**Miyoshi leakageの防止**、暗黙適用が発生しないことの確認）
- **必須回帰**：`buildManualDesignInput({ W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000 })` → `designP === 1400`
- 負圧側が絶対値で上回るケース、負圧を正の数で入力したケースでも `designP` が正しく絶対値の大きい方になること
- `extraFactor` 省略時は既定値1.00、明示指定も可能であること
- 不正なW/H（0・負値・NaN・非数値・null/undefined・object）、不正な圧力値（NaN・非数値・null/undefined・object・±Infinity）、不正な `extraFactor`（0以下・非数値）、および入力自体がobjectでない場合が、それぞれ例外で拒否されること

### Project Input Package / registry / import securityのテスト（`tests/project-input.test.js`、Phase 2D）

**preset registry**

- Miyoshi presetをregistry経由でlookupでき、ラベルが `getPublicLabel()` 境界を経由すること
- 重複 `projectId` の登録が例外で拒否されること
- 未知の `projectId` が `undefined` を返さず例外になること（fail closed）
- 手入力（`hasFixedPreset: false`）がtrusted presetとして登録できないこと
- 不正なconfig（非object・`projectId` 欠落・`getPublicLabel()` なし・不正な形式のID）が拒否されること

**package schema / validator**

- 妥当なpackageを受理し、キー順まで決定的に正規化すること
- `designPressure` がpayload値を信用せず常に再計算されること（嘘の値を主張しても上書きされる）
- サポート外の `schemaVersion` / `sourceKind` の拒否
- 未知のtop-level・`provenance` フィールドの拒否
- NaN・±Infinity・数値文字列・null等の拒否
- W/H ≦ 0 と過大値の拒否
- `extraFactor` が `0 < v <= 1.0` の範囲外（特に1.0超）で拒否されること
- 正圧・負圧がともに0（`designPressure = 0`）の拒否、片方0は許容
- `calc.js` の `GLASS_TYPES` に存在しない `glassType` の拒否
- `manual` / `imported_unverified` が `verified` を名乗れないこと

**trust boundary（AC-05）**

- payloadが `sourceKind: "registered_preset"` / `verificationStatus: "verified"` / 案件ラベルを主張しても、取り込み時に `imported_unverified` / `unverified` / 中立ラベルへdowngradeされ、`sourceId` も引き継がれないこと
- 取り込んだpackageをregistryへpresetとして登録できないこと

**import security（AC-07）**

- `__proto__` / `prototype` / `constructor` キーの拒否と、prototype pollutionが発生しないことの確認
- 16KB超のpayload、深さ8超のネスト、不正なJSONの拒否
- HTMLタグ・`javascript:` スキーム・URL・Windows/Unix絶対パス・制御文字を含む文字列の拒否
- `eval` / `new Function` を使用していないことのソースレベル確認

**roundtrip（AC-06）**

- Export → Import で計算に用いる値がすべて一致し、生成される候補一覧（先頭の構成・許容風圧）まで一致すること
- 同じpackageから常に同じJSONが生成されること（deterministic serialization）

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
> 階別正圧・部位別負圧は「みよし案件プリセット」の固定値であり、告示から自動算定した値ではありません（案件プリセットモード）。
>
> 手入力 / Genericモードで入力したW/H・正圧・負圧は、本ツールが案件原典（構造計算書・製品資料等）と照合したものではありません。あくまでユーザーが入力した値そのものです。
>
> 取り込みデータ（Imported）モードで読み込んだ入力条件は、取り込み元が「検証済み」と記載していても本ツールは検証していません。常に未検証（unverified）として扱われます。
>
> **最終的な設計判断にはメーカー検討書または専門技術者による確認を優先してください。**

---

## 更新履歴

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.9.0-phase2h | 2026-09-20 | **Phase 2H：案件プロファイル / 検討ケース（Runtime Project Profile / Scenario Matrix）。**（1）`project-profile.js` を新設。案件共通の風条件（V0 / 粗度 / 建物高さ / 軒高 / 建物タイプ / 算定基準）を1回だけ入力し、開口ごとには W / H / 評価高さ Z / 部位 / ガラス種別だけを指定する。**Profileは registered preset ではなく verified Evidence でもない**——検証状況は `user_input_unverified` のみで、保存・export・100回の利用いずれによっても変わらない。schemaが `verificationStatus` / `evidence` / `sourceReference` / `sourceKind` / `presetId` を受け付けない。（2）**評価高さ Z と部位は Profile に入る場所が無い**。この2つは開口ごとに違い設計風圧を直接左右するため、規約ではなくschemaの構造として継承を不可能にした。（3）**階→評価高さの自動変換を持たない**。ラベルに `2F` と書いても Z は独立入力で、TSVの `floor` / `storey` / `level` 列は専用メッセージで拒否する。（4）**既定値を作らない**。V0 / 粗度 / 各高さ / 建物タイプ / 算定基準 / Z / 部位のいずれも欠ければ fail closed。とくに `basis` は Phase 2E と同じ理由で既定値を持たない。（5）`resolveEffectiveWindInput()` は Profile + Scenario を1つの WindInput へ展開するだけで、そこから先は既存の `ProjectInput.fromWindCalculation()` を通る。**Profile経由のPIPは direct path と deepEqual**（traceを含む）で、Profile layerは数値を変えない。（6）**snapshot semantics**: Workspaceへ追加した時点で effective input を PIP v2 として固定する。以後 Profile を変更しても既存caseは変わらず、UIが「反映されていません」と明示する（自動同期しない）。（7）Workspace export は Profile に依存せず、**Workspace JSON だけで再計算できる**。（8）組み合わせ生成（直積）と Profile Package v1 の export/import。すべて memory-only。（9）Phase 2G の TSV表パーサを `workspace.js` から共有化し、Workspace TSV と Scenario TSV の**物理行番号規約が一致する**ことを実測で確認。（10）**継続パケットの Required Fix 3件を修復**。RF-A: `options.maxTotal` が上限をそのまま置き換えていたため `maxTotal: 2000` で1400件生成でき、負の `existingCaseCount` でも同じことができた——`MAX_SCENARIOS` を絶対の天井にし、optionは狭める方向にしか効かないようにした。RF-B: TSVのrow isolationが**格納段階で切れて**おり、重複IDで後続行が試されないままMatrixが部分変更されていた——canonical helper `addParsedScenarios()` を置き1行ずつ隔離した。RF-C: gateが構築時のみで、手で組んだ `{profileType:'runtime_wind_profile', verificationStatus:'verified'}` がpreviewへ到達しPIPまで生成できた——**結果objectそのもの**を検査する `assertRuntimeProfile()` / `assertCanonicalScenario()` を置き、各消費関数が推移的な呼び出しに頼らず自分で通すようにした（Phase 2F D-013 の一般形）。（11）攻撃 33件すべて遮断、mutation 14/14 kill、browser 43 checks、テストは baseline 342 → 389。Evidenceは一切変更していない（`verifiedCases: []`、昇格なし、1250×2050 は `sample_default` / `unverified`）。 |
| v1.8.0-phase2g | 2026-09-20 | **Phase 2G：一括検討 Workspace（Batch / Scenario Workspace）。**（1）複数ケースを1画面で比較する `workspace.js` を新設。**Batch layerは計算式を持たない**——各ケースは単一ケース計算とまったく同じ経路（PIP v2 → `GlassCalc.paneAreaM2` → `generateCandidates` → `splitCandidates`）を通る。見付面積の式は `GlassCalc.paneAreaM2()` に一本化し、単一ケースUIとBatchの両方が同じ関数を呼ぶ。テストは `workspace.js` のソースを読み、計算コアの識別子や案件固有値が現れたら失敗する。（2）**Workspace Package v1**（`schemaVersion: 1` / `workspaceType: "glass_batch_workspace"`）を新設。1ケース = 既存PIP v2で、PIPは v2 のまま（v3へ上げていない）。**保存するのは入力だけ**で、設計風圧・推奨構成・許容耐力・traceといった計算結果を正本として保存しない。import後は必ず再計算する。（3）外部importは既存 `ProjectInput.deserialize()` を必ず通す。ファイルが `registered_preset` / `verified` を名乗っても `imported_unverified` / `unverified` へ降格し、改ざんされた `designPressure` は再計算で上書きされる。TSVから registered preset / Evidence を作る経路は存在しない。（4）ExcelからのTSV貼り付け（`manual` / `notification` のみ。`basis` は必須で既定値を持たない——業界推奨値が法定最低値として通らないようにするため）。未知の列・計算結果側の列・header列数超過はいずれも読み飛ばさずエラーにする。（5）結果CSV出力。`=` `+` `-` `@` タブ・CRで始まる**文字列セル**を中和し、数値セルは中和しない（`-918` はそのまま）。RFC4180 escaping。（6）取り込めなかった行は消えず「入力エラー」として一覧に残る。ただしWorkspaceがauthoritativeに持つ入力は常に妥当なPIP v2だけで、壊れた行は**表示専用の診断レコード**として別レイヤに隔離される。診断は計算値をすべて `null` で持つため、最大設計風圧にも支配ケースにも混ざらず、Workspace JSONにも出力されない。（7）診断が持つのは位置と理由だけ（物理行番号 / case index / 安全なcaseId / 列名 / 理由）。行番号は貼り付けたシート上の**物理行**で、空行があってもずれない。理由の文面は、既知語彙以外の引用部分を伏せ字にし長さ上限を設ける（CSVは共有されるファイルであり、実際の流出経路になるため）。（8）Workspaceは**メモリ上だけ**に存在する（localStorage / サーバー / DB のいずれにも保存しない）。上限は 1000ケース / JSON 1MB / TSV 1MB / label 200文字 / caseId 64文字。（9）**Single（単一ケース）が既定**で、その挙動・結果は Phase 2G 前と完全一致。実装中に `display: grid` が `[hidden]` を上書きして初期表示で両viewが同時に描画される実バグを発見し修正、回帰テストで固定した。（10）**独立検証（別コンテキスト）の指摘4件をすべて修復**。最も重いものは、validatorの例外メッセージが落ちた値をそのまま引用するため、案件名や図面番号を含むセルが画面と**エクスポートされたCSV**へ出ていた点（F1。3000文字のセルが3075文字の診断になった）。あわせて必須列欠落時に直前の列を原因として報告していた点（F2）、header列数超過ガードの未テスト（F3）、`errorToInvalidResult` がlabel契約を呼び出し側に委ねていた点（F4）を修復。Evidenceは一切変更していない（`verifiedCases: []`、昇格なし、1250×2050 は `sample_default` / `unverified`）。テストは baseline 270 → 342。 |
| v1.7.0-phase2f | 2026-09-20 | **Phase 2F：Evidence アーキテクチャと Verified Case レイヤ。**（1）Evidence契約（level / checkedAt / public-safe境界 / promotion guard）が案件固有の `miyoshi.js` に閉じ込められていたため、案件非依存の `project-config/evidence.js` へ**移動**（再実装ではない）。`project-input.js` にあった `VERIFICATION_STATUSES` の重複定義も解消し、契約の正を1か所にした。（2）**Promotion Gate を強化し、実際の構築経路へ接続**。`verified` は `level === 'primary'` かつ妥当な `checkedAt` に加えて、`privateReferenceAvailable === true` または構造検証済みの public primary source reference を要求する。`verifiedValue()` / 案件identity構築 / `validateVerifiedCase()` のすべてがこのgateを通る（gateを呼ばない経路は存在しない）。（3）`assertPublicPrimarySourceReference()` を新設。https / 資格情報なし / localhost・loopback・私設ネットワーク・IPリテラルでない / 既知private provider（Drive・Docs・Notion・SharePoint・Dropbox）でない / 完全修飾ホスト / tokenを提供元にしない、を構造検証する。**検証するのはpublic-safeな構造であって資料の真正性ではない**旨を明記。`publicDescription`（URLを禁止）とは役割が逆であるため別関数とした。（4）`project-config/evidence-ledger.js` を新設。field単位のfactを検証状況付きで保持し、case-level昇格は critical fact が**すべて** gate を通ることを要求する（field verified ≠ case verified）。factKeyはレビュー済み allowlist のみ（`A_102_pdf` 等のprivate filename由来キーを拒否）。entryは検証後に改変できないよう深くfreezeし、呼び出し側objectから切り離して保持する。（5）read-onlyの照合診断を追加。**判定順序はEvidenceが先、数値が後**で、Evidenceがverifiedでなければ数値が完全一致していても `INSUFFICIENT_EVIDENCE` を返す（`MATCH` ≠ verified）。照合はpresetを一切変更しない。（6）案件プリセットモードへEvidence status表示を追加（configのmetadataから導出。UI側に検証状況を持たない）。`verifiedCases` が0件のため **case selectorは描画しない**（空のUIを作らない）。（7）**案件の一次資料が本実行環境から利用できなかったため、案件factの昇格は一切行っていない。** `verifiedCases: []`、Explicit unverified items 4件を維持。1250×2050 は `sample_default` / `unverified` のまま。告示1458号式・k1・k2・IGU・TP・Low-E・`extraFactor`・Phase 2E Wind Trace（Er / qBar / Cpe×Gpe / 内圧係数 / IV→III / 再現期間の分離）・みよし案件の風圧値・V0=34・roughness III はいずれも無変更。テストは baseline 197 → 256。（8）**独立検証（別コンテキスト）の指摘12件をすべて修復**。最も重いものは、`new URL()` が末尾のルートドットを保持するため `https://drive.google.com./file/d/...` が private provider denylist と完全修飾ホスト判定の**両方**を迂回し、実在のDrive URLを「検証済みpublic primary source reference」として保存できた点（F1）。あわせて、`createEntry()` がgateと保存で呼び出し側 `evidence` を2回読むTOCTOU（F2）、UIが読む `config.identity` / `dimensions` / `wind` / `verifiedCases` が未freezeで検証後に改変できた点（F3）、contract定義表のlive mutable公開（F4）、`reconcileFact()` が自己申告の `verificationStatus` を信用していた点（F5）、case-level gate再実行の未テスト（F6・mutation survivor）、Run Artifactの誇張と変更ファイルの過小記載（F7）、私設TLD/CGNAT/wildcard DNS/追加provider/percent-encoded credential（F8）、`caseId` のpublic-safe未検査（F9）、Evidence panelの例外黙殺（F10）、identity literalとgateの結び付きが規約のみ（F11）、critical fact空時の空虚な真（F12）を修復。修復は19件のmutationで固定し、テストは 256 → 270。 |
| v1.6.0-phase2e | 2026-09-19 | **Phase 2E：追跡可能な帳壁ガラス風圧算定エンジン。**（1）`wind-pressure.js` を新設し、案件非依存の汎用風圧算定コアを導入。`H=(建物高さ+軒高)/2`、`H'=max(H,Zb)`、`Er=1.7×(H'/ZG)^α`、`qBar=0.6×Er²×(V0×y)²`、`Cf=外圧ピーク係数−内圧ピーク係数`（正圧・負圧を別算定）、`W=qBar×Cf`、`設計風圧=max(|W+|,|W−|)` を実装し、**各ステップの式・値・単位をtraceとして保持**する。採用した式・係数・適用条件は一次資料に基づき `.agent-run/LR-20260919-GLASS-P2E/EVIDENCE.md` §4 へ出典付きで記録（provenance: `human_supplied_primary_evidence`）。（2）**式の検証状況と入力値の検証状況を分離**（`formulaVerificationStatus: verified_primary_source` / `inputVerificationStatus: user_input_unverified`）。式が検証済みでも、ユーザーが入力したV0・粗度区分・高さ・評価高さ・建物種別・部位をverifiedへ昇格させない。（3）**自動推定を実装しない**：粗度区分の住所・都市計画区域からの判定、階→評価高さZ／建物高さの導出、自治体別V0 lookup、図面からの隅角部判定はいずれも行わず、すべて明示入力。階由来のキーは未知フィールドとして拒否する。（4）板ガラスの粗度区分IV→III読み替えを**入力と計算の二層**で保持（`inputRoughnessCategory` / `calculationRoughnessCategory`）し、読み替えとその理由を画面に表示。silent rewriteしない。（5）算定基準を `notification_baseline`（y=1.00固定・`recurrenceYears`を受け付けない）と `itakyo_recommended`（50/100/200/300/500年を明示選択）に二分。**y>1.00へ暗黙にdefaultする経路を持たない**（業界推奨を法的要求へ格上げしない）。（6）Project Input Packageを `schemaVersion: 2` へ。`windInput`（入力条件のみ。算定済みtraceは保存しない）を追加し、`windInput` がある場合は正圧・負圧をpayloadから読まず**必ず再計算**する。改竄されたpressureは取り込まれない。v1は `windInput: null` のv2へ決定的にmigrateされ挙動は不変、`schemaVersion: 3` 以上はfail closed。（7）UIへ「告示風圧計算」モードを追加（既定は案件プリセットのまま）。算定トレース表・IV→III読み替え通知・隅角部帯幅・**案件プリセットとの参考比較（comparison only）**を表示。比較はプリセットの置換でも検証状況の昇格でもなく、算定根拠が未解決であることを明示する。（8）告示1458号式・k1・k2・IGU ratio cap 2.0・厚板/薄板>2.5の自動推奨除外・TP rules・Low-Eモデル・`extraFactor` 既定値・みよし案件の風圧値/V0=34/roughness III/W=1250・H=2050・`verificationStatus`・`evidence` はいずれも**無変更**。テストは baseline 133 → 190。 |
| v1.5.0-phase2d | 2026-09-18 | **Phase 2D：calculation coreの完全な案件非依存化 + Project Input Package。**（1）`calc.js` からPhase 2A〜2Cの後方互換用に残していた案件固有プリセットの複製3件（階別正圧 / 部位別負圧 / 案件既定寸法）を、定義・export・案件固有コメントとも削除。`calc.js` は k1・k2・告示式・複層計算・candidate generation/sorting/split のみを担当する汎用計算コアになり、案件固有値・ラベル・provenance（`verificationStatus` / `evidence`）を一切持たない。全consumer（tests / README）を移行し、移行方法をREADMEへ記録。（2）`project-config/project-input.js` を新設し、versioned Project Input Package（`schemaVersion: 1`、`sourceKind`: `registered_preset` / `manual` / `imported_unverified`）を導入。共通validator（値域・有限数・W/H>0・designP>0・`0<extraFactor<=1.0`・known glassTypeのみ・public-safe string・長さ上限・未知フィールド拒否・決定的正規化）と、`designPressure` を常に `max(|正圧|, |負圧|)` から再計算する契約を実装。（3）`project-config/registry.js` を新設し、generic preset registry（`registerPreset` / `getPreset` / `listPresets`、重複reject、unknownはfail closed、`getPublicLabel()` 境界維持）を導入。登録できるのは `hasFixedPreset: true` を持つrepository内built-in configだけで、手入力はtrusted presetにできない。（4）入力条件のExport / Importを追加（backend不要・localStorage不使用・`file://` 互換）。取り込んだデータは payload が `registered_preset` / `verified` / 案件ラベルを主張していても常に `imported_unverified` / `unverified` / 中立ラベルへdowngradeされ、案件のverified provenanceを偽装できない。（5）import security: `__proto__`/`prototype`/`constructor` キー・16KB超payload・深さ8超ネスト・未知フィールド・不正JSON・HTML/script/URL/絶対パス/制御文字を含む文字列を拒否。`eval`/`Function` 不使用、取り込み文字列は `textContent` のみでDOMへ渡す。（6）UIへ「取り込みデータ（Imported / Unverified）」モードを追加し、`runCalc()` をモードによらずProject Input Package経由へ統一。案件presetはregistry経由でlookupする。告示1458号式・k1・k2・IGU ratio・TP rules・Low-Eモデル・`extraFactor` 既定値・みよし案件の風圧値/V0=34/roughness III/W=1250・H=2050・`verificationStatus`・`evidence` はいずれも無変更（1250×2050をverified pane dimensionへ昇格させていない）。テストは baseline 91 →  128（新規37件、削除1件は同等カバレッジを既存テストが保持）。 |
| v1.4.0-phase2c | 2026-09-17 | **Phase 2C：案件プリセットと手入力 / Genericモードの安全な共存。**（1）Evidence契約のhardening：`makeEvidence()` の `checkedAt` 黙示的丸め込み（`checkedAt \|\| null`）を廃止し、不正な `checkedAt`/`level` はfactory入口で例外を投げるように変更。将来 `verifiedCases` へ実ケースを追加する際の入力契約 `validateVerifiedCase()` を新設（必須フィールド・floor/zone値域・寸法/圧力の正数・W/H/pressure evidenceのprimary要求・private URL/ID混入拒否）。**まだどのケースにも適用しておらず、`verifiedCases` は引き続き空配列。**（2）新規 `project-config/manual.js`（`ManualProjectConfig`）を追加：「手入力 / Generic」モードの入力契約。`project-config/miyoshi.js` に一切依存せず、みよし案件の正圧・負圧プリセットを暗黙適用しない。`buildManualDesignInput()` はW/H/正圧/負圧/extraFactorを検証し `designP = max(|正圧|, |負圧|)` を算出、結果には常に `source: "user_input"` と `verificationStatus: "unverified"` を付与（本ツールが手入力値を「verified」と主張することはない）。固定dimensions/windプリセットは一切保持しない。（3）`index.html` に入力モードセレクタ（既定値: 案件プリセット）を追加し、案件プリセットモードの既存挙動を完全維持したまま、手入力モードでは階数/部位セレクトを隠し、正圧/負圧の直接入力欄を表示。結果表示は手入力モードで「みよし案件プリセット」等の文言を一切表示せず、代わりに「⚠ ユーザー入力値 — 案件原典との照合は本ツールでは未実施」を常時表示。汎用計算コア（`calc.js`）はモード非依存のまま両モードで共用。（4）告示1458号式・k1・k2・IGU ratio・TP候補ルール・Low-Eモデル・extraFactor既定値・みよし案件の風圧数値/V0=34/roughness III/W=1250・H=2050・`calc.js`はいずれも無変更。新規テスト（`tests/manual-config.test.js` 14件、`tests/project-config.test.js` へのEvidence hardening関連10件）を追加し、既存72テスト構成（calc 23 + project-config 35 + manual-config 14）全pass。ブラウザ実機（Playwright, headless Chromium）で両モードの表示・計算・警告文言・Miyoshi非漏洩を確認済み。Draft PRを作成し、Human Gateでの Ready/merge判断待ち（本バージョンではマージ・Production反映は行っていない）。 |
| v1.3.1-phase2b | 2026-09-17 | **Evidence Guard Required Fix。**Evidence promotion guardのhard contractを強化。RF-01: `identity`（`verifiedValue()`を経由しないため唯一module-load時点のguardを素通りしていた）の構築直後に`assertEvidenceConsistency('verified', identityEvidence, 'identity')`を明示的に呼び出すよう変更し、`identity`の`evidence`が契約違反の場合、`require()`/`<script>`実行そのものが例外で失敗するようにした（`validateAllEvidence()`頼みの事後検出ではない）。RF-02: `VERIFICATION_STATUSES = ['verified','partially_verified','unverified']`を定数化し、`assertEvidenceConsistency()`冒頭でこれ以外の値（タイプミス・大文字小文字違い・null・undefined・空文字列等）を即rejectするようにした。RF-03: `evidence.checkedAt`を単なるtruthy判定ではなく、`null`または実在するカレンダー日付を表す`"YYYY-MM-DD"`形式の文字列であることを検証するhard validationに変更（`isValidCheckedAt()`。不正な形式・存在しない日付は例外）。RF-04: `dimensions.defaultH.evidence.checkedAt`を、ACW全体高さの記録候補を確認した実際の日付である`'2026-09-17'`に修正（`null`のままだったのは実態と不整合。`verificationStatus`は引き続き`"unverified"`、`evidence.level`は引き続き`"indirect"`を維持し、H=2050をverifiedへ昇格したわけではない）。告示1458号式・k1・k2・IGU ratio・TP rules・Low-E model・extraFactor・風圧数値・V0=34・roughness III・W=1250/H=2050・candidate generation/sorting・publicLabel boundary・`verifiedCases`への実ケース追加はいずれも変更なし。`calc.js`は今回変更なし。既存44テストを維持し、RF-01〜RF-04を直接検証する新規テスト4件（`identity`のmodule-load時fail-fastは、ソースを一時的に書き換えたコピーを実際に`require()`して確認）を追加、計48テスト全pass。 |
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
