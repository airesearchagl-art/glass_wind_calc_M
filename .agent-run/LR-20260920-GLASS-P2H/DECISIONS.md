# Decisions — LR-20260920-GLASS-P2H

## D-000 — digest定義

`TASK_PACKET_SNAPSHOT.md` のファイルbytesに対するSHA-256。
`ec2638808e8ff1d67bde9c9619a8bd803bcd3e27083b55f85259281434031c27`
Resume時に再計算し、不一致なら `BLOCKED`。

## D-001 — Profile に evaluationHeightM / zone を入れない（§5 / Hard Gate）

Profileは「案件共通の風条件」であり、`evaluationHeightM` と `zone` は
**pane / location ごとに違う**値である。

この2つは設計風圧を直接左右する。共通Profileから暗黙継承させると、
別階・別部位へ同じ値が黙って適用され、しかも画面上は正常に見える。
Profile schema がこの2つを**持たない**ことで、継承しようがない形にする。

「入れてはいけない」という規約ではなく、「入れる場所が無い」構造にする。

## D-002 — 既定値を作らない（§12 / Hard Gate）

`V0` / `roughness` / `buildingHeight` / `eavesHeight` / `buildingType` /
`basis` / `evaluationHeightM` / `zone` のいずれも、欠けていたら fail closed。

特に `basis` は Phase 2E / 2G と同じ理由で既定値を持たせない。
`notification_baseline`（告示系）と `itakyo_recommended`（板硝子協会推奨）の
どちらを設計の根拠にするかは判断であり、片方を黙って既定にすると
業界推奨値が法定最低値として通る（またはその逆）。

`zone` を `general` に、`Z` を建物高さに黙って落とすのも同じ性質の誤り。
どちらも「それらしい値」が入るため、間違っていても気づけない。

## D-003 — Scenario 生成時点で snapshot する（§14 / §23）

Profile → Workspace へ case を作った時点で、effective input を PIP v2 として
**固定**する。その後 Profile を変更しても、既に Workspace にある case は変わらない。

理由: 過去の検討結果が、知らないうちに書き換わることを防ぐ。
「Profileを直したら、先週出した検討結果の数字も変わっていた」は
実務上いちばん危険な挙動である。再適用は明示操作のみ。

## D-004 — Workspace export は Profile に依存しない（§27）

生成された case の PIP は、計算に必要な値を**すべて展開して**持つ。
Profile file が無くても Workspace JSON だけで再計算できる。

Profile への外部依存を作ると、export した検討結果が
「別ファイルが無いと再現できない」状態になる。

## D-005 — Matrix上限は呼び出し側が広げられない（Required Fix A）

- **指摘（正当）**: `generateScenarioMatrix` は `cap` を `options.maxTotal` で
  **そのまま置き換えて**いた。`maxTotal: 2000` を渡せば1400件生成できた（実測）。
  `existingCaseCount: -500` でも同じことができた（-500 + 1400 <= 1000 が成立してしまう）。
  `NaN` / `1.5` / `-1` はいずれも黙って通っていた。
- **決定**: `MAX_SCENARIOS` は**絶対の天井**。optionは狭める方向にしか効かない
  （`effectiveCap = min(MAX_SCENARIOS, requestedCap)`）。
  `existingCaseCount` は finite / integer / 0以上 / MAX_SCENARIOS以下 を要求し、
  黙って丸めない。
- **二重チェックを置かなかった理由**: 当初「念のため」絶対天井の判定をもう1つ書いたが、
  `effectiveCap` が必ず `MAX_SCENARIOS` 以下である以上、**片方は決して発火しない**。
  Wave 4Hのmutationで、どちらを消しても他方が拾うため両方がSURVIVEDになった。
  発火しないguardは「守られている」ように見えるだけなので、1つに統合した。

## D-006 — TSVのrow isolationは格納段階まで続く（Required Fix B）

- **指摘（正当）**: parse段階は行単位で隔離していたが、UI側が
  `parsed.rows.forEach(...matrix.add...)` を**1つのtry/catchで囲んでいた**。
  途中の重複IDで例外が出ると残りの行は試されず、Matrixは部分的に変更されたまま
  「取り込み全体が失敗」と表示されていた。parse段階の隔離が格納段階で消えていた。
- **決定**: canonical helper `addParsedScenarios(matrix, parsed)` を module 側に置き、
  1行ずつ try/catch する。UIはこれを呼ぶだけにする（その場しのぎの組み立てを禁止）。
  parse段階の診断もそのまま引き継ぎ、生の行は載せない。
- 実測: 既存 `S1` に対し `S2 / S1重複 / S3` を取り込むと、S2とS3が入り、
  重複は3行目の診断になり、既存S1は上書きされない。

## D-007 — gateは構築時だけでなく結果側でも通す（Required Fix C）

- **指摘（正当）**: `createProfile()` / `createScenario()` は厳格だったが、
  消費側（resolve / describe / PIP生成 / serialize / matrix.add）は
  「その関数を通った object か」を確かめていなかった。
  手で組んだ `{profileType:'runtime_wind_profile', verificationStatus:'verified'}` が
  preview へ到達し `profileStatus = verified` を表示し、PIPまで生成できた（実測）。
  `matrix.add()` は評価高さの無い生objectをそのまま保存していた。
- **これはPhase 2F D-013と同じ構図である**:
  「構築時にだけ成立するgateは、実質advisoryである」。
- **決定**: `assertRuntimeProfile()` / `assertCanonicalScenario()` を置き、
  **結果objectそのもの**を検査する。各消費関数が**自分で**呼ぶ。
- **推移的な呼び出しに頼らない理由**: `describeEffectiveInput` /
  `scenarioToProjectInput` は内部で `resolveEffectiveWindInput` を呼ぶため、
  自分のgateを外してもmutationが生き残った。resolveの実装を変えた瞬間に
  黙って無防備になるので、各関数が自分で通すことをソース契約として固定した。
- **副作用**: resolver内にあった「Zはprofileから継承しない」判定は、
  canonical gateが先に落とすため到達不能になった。到達しないコードを
  guardの形で残すと守られているように見えるので、その意図を
  canonical gate側のメッセージへ移し、重複判定は削除した。
