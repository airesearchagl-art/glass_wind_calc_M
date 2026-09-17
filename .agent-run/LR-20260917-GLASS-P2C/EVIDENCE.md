# EVIDENCE — LR-20260917-GLASS-P2C

Campaign中に扱ったEvidence状況の要約（public-safe）。詳細な根拠テキストは`project-config/miyoshi.js`および`README.md`「Evidence Status」セクションを正とする。本ファイルはRun Artifactとしての状態スナップショットである。

## Miyoshi project facts（Task Packet §5、Campaign中は変更禁止）

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

本Closure Wave（RF-01〜RF-04）でも、上記の値・verificationStatus・evidence.levelはいずれも変更していない。`node --test`の回帰テスト（`tests/project-config.test.js`）で引き続き固定されていることを確認済み。

## Explicit unresolved evidence（Task Packet §6、Campaign開始時点から未解決のまま）

```text
1. ガラス1枚の実見付W/H
2. 階別正圧（1297 / 1525 / 1695 / 1729）の元となる外装材・ガラス構造計算書
3. 負圧（918 / 1122）の元計算根拠
4. 各階評価高さZとpresetのexact mapping
```

Campaign全体（Wave 1〜5、Consolidated Closure Wave）を通じて、これらをrepository内Evidenceから新たに確認できた事実はない。推測でverifiedへ昇格させていない。

## Consolidated Closure Waveで追加されたEvidence関連の契約（値ではなく、契約・検証ロジック）

- `assertPublicSafeEvidenceText(text, label)`（RF-02、新設）: 既知の非公開パターン（URLスキーム・`www.`・既知プロバイダ名・Windows/UNCパス・Unix絶対パス・長いopaqueトークン）を検出し拒否する。**既知パターンの自動検出であり、正式案件名等の非パターン文字列までは検出できない**（過大主張の禁止）。
- `makeEvidence()`は`publicDescription`に対して上記ガードを適用し、`privateReferenceAvailable`を厳密なboolean型のみ許容する（RF-02）。
- `validateVerifiedCase()`は、top-levelの`publicEvidenceDescription`に加え、`widthEvidence`/`heightEvidence`/`pressureEvidence`それぞれの`publicDescription`にも同じガードを適用する（RF-02、nested evidence対応）。

いずれも「検証ロジックの強化」であり、Miyoshiの現在値・verificationStatusを変更するものではない。

## Manual / Genericモードのevidence的位置づけ（RF-C: actual implementationへ修正）

`project-config/manual.js`は、性質の異なる2つのオブジェクトを持つ。両者を混同しないよう明確に分離して記述する。

### Manual calculation input（`config.buildManualDesignInput()`の戻り値）

```text
source: 'user_input'
verificationStatus: 'unverified'
```

実装上、この戻り値オブジェクトに`evidence`プロパティは付与していない（`W`/`H`/`positivePressure`/`negativePressure`/`designP`/`extraFactor`/`source`/`verificationStatus`のみを持つ）。「ツールが検証していない入力値である」ことは`source`/`verificationStatus`の2フィールドで表現しており、Evidence構造体（`level`/`checkedAt`/`publicDescription`/`privateReferenceAvailable`）は計算結果には付与していない。

### Manual config identity（`config.identity`）

```text
identity.verificationStatus: 'unverified'
identity.disclosureStatus: 'public'
identity.evidence.level: 'none'
identity.evidence.checkedAt: null
identity.evidence.publicDescription: 'ユーザーがその場で入力した値。特定の案件プリセットではなく、本ツールによる案件原典との照合は行っていない。'
identity.evidence.privateReferenceAvailable: false
```

`identity`はモジュール全体としての識別情報オブジェクトであり、`miyoshi.js`の`identity`と対をなす構造として`evidence`を保持している。`buildManualDesignInput()`の戻り値とは別物であり、両者を同一視して「Manual modeの計算結果にevidence.level='none'が付与される」と主張しない。
