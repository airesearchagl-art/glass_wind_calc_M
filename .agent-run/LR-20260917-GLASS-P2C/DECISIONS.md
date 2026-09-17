# DECISIONS — LR-20260917-GLASS-P2C

Campaign中の主要な設計判断・トレードオフの記録。public-safeな内容のみ。

## Wave 1〜5（既存）

- **`project-config/manual.js`をmiyoshi.jsに一切依存させない構造にする**（AC-02/AC-04）。理由: Manual modeでみよし案件の正圧・負圧プリセットが暗黙適用される経路を、テストで防ぐだけでなくアーキテクチャ上不可能にするため。
- **`makeEvidence()`のcheckedAt silent coercionを廃止**（AC-05）。理由: `checkedAt: checkedAt || null`が`''`/`false`/`0`等を無警告でnullへ丸め込み、契約違反を検知できないまま通過させる危険があったため。
- **`validateVerifiedCase()`は`verifiedCases`へ実データを追加せず、validatorのみ整備**（AC-06）。理由: 実Evidenceなしに架空のverified caseを追加してはならないという明示的禁止事項（Prohibited scope）を遵守するため。
- **UIの入力モードセレクタはCSSクラス（`mode-field-miyoshi` / `mode-field-manual`）による表示切替方式を採用**（AC-08）。理由: 静的HTML + plain JS構成を維持しつつ（フレームワーク非導入）、既存のMiyoshi mode DOM構造・IDを変更せずに追加できるため。

## Consolidated Closure Wave（RF-01〜RF-04）

- **RF-01: Miyoshi-specific文言は、通知テキストを複製せずmode-awareな`<span class="mode-field mode-field-miyoshi">`でラップする方式を採用。** 理由: 既存の警告文言（過去のWaveで確定した表現）をそのまま維持しつつ、diffを最小化し、`applyModeVisibility()`の既存トグルロジック（`.mode-field-miyoshi`/`.mode-field-manual`のクラスセレクタ）をそのまま再利用できるため。
- **RF-01: Manual modeの注意書きは「W/H/正圧/負圧はすべてその場で入力した値」という断定を避け、「現在画面に表示されている値をユーザー入力値として扱う」という表現に変更。** 理由: 初期表示のW/H（1250×2050mm）はMiyoshi modeと共有するサンプル値であり、ユーザーが必ずしも「その場で入力」したとは限らないため、事実に即した表現へ是正した。
- **RF-02: 非公開パターン検出を`assertPublicSafeEvidenceText(text, label)`という単一の共通関数へ集約し、`makeEvidence()`（構築時点）と`validateVerifiedCase()`（top-level + nested evidenceの両方）から呼び出す方式を採用。** 理由: 重複したregexを複数箇所に持つと将来の変更で一方だけ更新され不整合が生じるリスクがあるため。
- **RF-02: 検出パターンは既知のURLスキーム・`www.`・既知プロバイダ名・Windows/UNC/Unix絶対パス・長いopaqueトークン（28文字以上）に限定し、「すべての秘密文字列を自動判定できる」とは主張しない。** 理由: 正式案件名・機密名称等のパターンマッチでは検出できない秘匿情報が存在し、過大な主張はかえって偽の安全感を生むため。正式案件名等のレビューは引き続きHuman reviewが担うと明記した。
- **RF-02: `privateReferenceAvailable`を厳密なboolean型のみ許容するよう変更（`!!`によるsilent coercionを廃止）。** 理由: `"false"`・`1`・`0`・`{}`等の非boolean値が黙ってtruthy/falsyに変換される問題は、`checkedAt`の`|| null`丸め込みと同種の危険パターンであり、同じ基準で閉じるべきと判断した。
- **RF-03: `extraFactor`は`0 < value <= 1.0`のみ許容し、1.0超（増幅方向）を拒否。0.70未満は禁止しない。** 理由: `extraFactor`は「告示外の追加低減係数」であり、定義上1.0を超えると告示計算値を増幅することになり安全側ではなくなる。一方0.70未満は追加の安全側低減であり、告示の趣旨に反しないため、Task Packetの明示的指示（「0.70未満を禁止する必要はない」）どおり許容した。UI側のスライダー範囲（0.70〜1.00）はUXの都合であり、backend側のhard boundaryとは独立に維持した。
- **RF-03: 正圧・負圧の片方が0であることは許容し、両方0の場合のみ`designP > 0`のhard validationで拒否。** 理由: 「positive=0, negative=-500」は物理的に意味のある入力（片側無風圧の想定等）だが、「positive=0, negative=0」は設計風圧が定義できず実設計入力として意味を持たないため。
- **RF-04: Task Packetのexact snapshotを、要約からの再構成ではなく、execution sessionのtranscriptから復元。** 理由: 会話サマリー（compaction summary）は言い換え・要約であり、Task Packetの原文そのものではない。transcript中の`queue-operation`（`enqueue`）レコードの`content`フィールドと、それに続く`type: user`メッセージの本文がSHA-256で完全一致するバイト同一のテキストであることを確認できたため、これを「exact content」として採用した。もしtranscriptからの復元が不可能だった場合は、Task Packetの指示どおり推測で捏造せずSTOPする方針だった。実行環境固有の絶対パス・session識別子等の内部実装の詳細は、public repositoryのため記載しない。
