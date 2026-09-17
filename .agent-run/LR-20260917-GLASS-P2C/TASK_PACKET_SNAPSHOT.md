# TASK_PACKET_SNAPSHOT — LRP-20260917-GLASS-P2C

```yaml
task_packet_id: LRP-20260917-GLASS-P2C
task_packet_revision: 1
task_packet_snapshot_path: .agent-run/LR-20260917-GLASS-P2C/TASK_PACKET_SNAPSHOT.md
task_packet_digest_sha256: 74b0855f8c0827fd8edabee4680da6ee276ff158d8771352ecf5349e13aca4b1
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2c-generic-manual-mode
recovered_at: 2026-09-17 (Consolidated Closure Wave, RF-04)
recovery_source: execution-session transcript（queue-operation/enqueueレコードと、対応するuserメッセージの2箇所で内容が完全一致することを確認した上で復元）
```

## 復元に関する注記（Recovery note）

このRun Artifactは、Phase 2C Long-Run Campaignの Wave 0 開始時点では作成されていなかった。
理由: 当時のexecution sessionがObsidian Vaultのcanonical文書（Long_Run_Development_Route.md等）へアクセスできず、Run Artifact作成を省略したまま実装作業へ進んだため。

本ファイルは、Phase 2C Consolidated Closure Wave（RF-04）の指示に基づき、後から透明性をもって復旧（recovery）したものである。
過去のWave 1〜3チェックポイントの時点で「当時Run Artifactが存在した」と偽って記録することはしていない。
下記の完全一致するTask Packet本文は、execution sessionのtranscriptから復元した。当該transcript中、Phase 2C Long-Run Campaignの起点となった`queue-operation`（`operation: enqueue`）レコードの`content`フィールドと、それに続く`type: user`メッセージの本文は、SHA-256ダイジェストが完全一致するバイト同一のテキストであることを確認済みである。したがって以下は要約・言い換えではなく、Humanから渡されたTask Packetのexact contentである。実行環境固有の絶対パス・session識別子等の内部実装の詳細は、public repositoryのため本ファイルには記載しない。

## Task Packet 本文（exact, verbatim）

````text
glass_wind_calc_M — Phase 2C Long-Run Campaign
0. Long-Run authorization
このTaskはHumanから「細かく開発を進めるのではなく、ある程度まとまった形で進め、Obsidian Vault上のLong-Run動線・構文を次回以降の指示へ反映する」と明示的に指示されている。
したがって今回は通常の単発Implementationではなく、Obsidian Vaultの以下を正本として LONG_RUN を開始すること。
読込順:

1. `02_Prompts/LLM_IDE/Long_Run_Development_Route.md`
2. `03_Templates/Long_Run_Task_Packet.md`
3. `02_Prompts/LLM_IDE/Implementation_Task_Prompt.md`
4. `02_Prompts/LLM_IDE/Claude_Code_Capability_Tier_Orchestration.md`
5. repository内の `CLAUDE.md` / `.claude/rules/` が存在する場合はそれ
6. README / 対象file / tests
7. canonical state変更Taskなので `Documentation_Sync_Handoff.md`

`LONG_RUN_ENDURANCE` はHumanから明示されていないため使用しない。
1. Campaign identity

```yaml
run_id: LR-20260917-GLASS-P2C
task_packet_id: LRP-20260917-GLASS-P2C
task_packet_revision: 1

execution_mode: LONG_RUN
horizon: 4H

human_explicit_long_run_authorization: true
human_explicit_long_run_authorization_source: >
  2026-09-17 Human instruction:
  次から細かく開発を進めるのではなく、
  ある程度まとまった形で進め、
  Obsidian Vault上のLong-Run動線・構文を
  次回以降の開発指示へ反映する。

human_explicit_endurance_authorization: false
human_explicit_endurance_authorization_source: UNSET

```

2. Repository state
Repository:
`airesearchagl-art/glass_wind_calc_M`
Current Production / expected base:

```text
main
dcb4919b0111ce9d9eea078e058331b6a4088b56

```

Previous PR:

```text
PR #3
MERGED

```

新規作業branch候補:

```text
claude/phase2c-generic-manual-mode

```

開始時に必ずFresh Preflightを行い、

```text
origin/main == dcb4919b0111ce9d9eea078e058331b6a4088b56
working tree clean
tracked changes 0
untracked files 0

```

を確認する。
不一致なら推測で開始せずSTOP。
mainへ直接commitしない。
3. Objective
Phase 2Cでは、
「みよし案件専用プリセットを持つ計算ツール」から、「案件プリセットと汎用・手入力モードを安全に共存できる計算基盤」へ拡張する。
ただし、

* 計算コア
* みよし案件の現在値
* Evidenceの検証状況

を勝手に変更しない。
今回の主対象は、

1. Evidence contractの仕上げ
2. verified project caseの正式validator
3. Generic / Manual project input mode
4. Miyoshi presetとの安全な切替
5. UI上のprovenance / verification表示
6. mutation / boundary / full regression
7. browser / Vercel Preview
8. README / PR / Run Artifact

までを、一つのCampaignとしてDraft PRまで収束させること。
4. Current canonical facts
現在Productionで成立している事実を変更しないこと。
Calculation core
4辺支持ガラス:

```text
P = (300 × k1 × k2 / A) × (t + t²/4)

```

FL k1

```text
t <= 8   : 1.00
t <= 12  : 0.90
t <= 20  : 0.80
t > 20   : 0.75

```

Single glass

```text
k2 = 1.0

```

IGU

```text
k2 = 0.75 × (1 + r³)
r <= 2.0

```

厚板/薄板 > 2.5 は板硝子協会計算法の適用範囲外として自動推奨しない。
TP
k1=3.5の出典対象:

```text
4, 5, 6, 8, 10, 12, 15 mm

```

本ツール自動候補:

```text
5, 6, 8, 10, 12, 15 mm

```

TP19は自動候補に入れない。
Low-E
Low-Eはcoating属性。
strength typeとして扱わない。
extraFactor

```text
default = 1.00

```

告示外の追加低減係数として扱う。
5. Miyoshi current project facts
以下は変更禁止。

```text
V0 = 34 m/s
verificationStatus = verified
evidence.level = primary

roughnessCategory = III
verificationStatus = verified
evidence.level = primary

```

Positive pressure:

```text
1F = 1297 N/m²
2F = 1525 N/m²
3F = 1695 N/m²
RF = 1729 N/m²

```

Negative pressure:

```text
general = 918 N/m²
corner  = 1122 N/m²

```

pressure presets:

```text
verificationStatus = partially_verified
evidence.level = indirect

```

Dimensions:

```text
W = 1250 mm
H = 2050 mm

dimensions.mode = sample_default
dimensions.status = unverified

defaultW:
  verificationStatus = unverified
  evidence.level = none

defaultH:
  verificationStatus = unverified
  evidence.level = indirect

```

`1250 × 2050` を実案件のverified pane dimensionへ昇格させてはならない。
6. Explicit unresolved evidence
今回のCampaign開始時点で、以下は未解決である。

```text
1. ガラス1枚の実見付W/H

2. 階別正圧
   1297 / 1525 / 1695 / 1729
   の元となる外装材・ガラス構造計算書

3. 負圧
   918 / 1122
   の元計算根拠

4. 各階評価高さ Z とpresetのexact mapping

```

これらがCampaign中にrepository内Evidenceから確認できない場合でも、
推測してverifiedへ昇格してはならない。
`Explicit unverified items` としてRun Stateへ残す。
private Drive / Notion等の社内資料をpublic repositoryへコピーしない。
7. Phase 2C Acceptance Criteria
以下すべてを満たすこと。
AC-01 — Miyoshi regression preserved
現在のMiyoshi preset modeで既存挙動が完全に維持されること。
代表回帰:

```text
FL6
W=1250
H=2050
2F
general
extraFactor=1.00

P ≈ 1756.09756 N/m²
designP = 1525 N/m²
=> OK

```


```text
FL6
W=1500
H=2050
2F
general
extraFactor=1.00

P ≈ 1463.41463 N/m²
designP = 1525 N/m²
=> NG

```

AC-02 — Generic / Manual mode
Miyoshi presetとは別に、

```text
Manual / Generic

```

モードを追加する。
Manual modeでは、少なくとも以下をユーザー入力できること。

```text
glass width W
glass height H
positive pressure
negative pressure
glass configuration
extraFactor

```

設計風圧:

```text
designP = max(abs(positivePressure), abs(negativePressure))

```

として扱う。
Manual modeにMiyoshiのpressure presetを暗黙適用しない。
AC-03 — Manual data is never tool-verified
Manual入力値は、

```text
user_input

```

または同等の明確な状態として扱い、
ツール自身が

```text
verified

```

と主張してはならない。
UI上でも、

```text
ユーザー入力値
案件原典との照合は本ツールでは未実施

```

という意味が明確になること。
Manual modeで「みよし案件プリセット」という表示を出さない。
AC-04 — Preset / Manual separation
データ構造上、

```text
project preset
manual input
calculation core

```

を分離する。
推奨例:

```text
project-config/
  miyoshi.js
  manual.js

```

または共通factory / validator。
ただし既存の静的HTML + plain JS + file://互換性を壊さない。
不要なframework導入は禁止。
AC-05 — Evidence factory hardening
Phase 2Bで残ったnon-blocking hardeningも今回まとめて閉じる。
現在のような:

```js
checkedAt: checkedAt || null

```

によるsilent coercionを避ける。
例えば:

```text
''
false
0
undefined

```

などの不正値が勝手に`null`へ変換されてguardを迂回しないようにする。
`checkedAt` contract:

```text
null
or
valid YYYY-MM-DD

```

をfactory入口から出口まで保持する。
mutation / boundary testを追加する。
AC-06 — Verified project case validator
`verifiedCases` を将来安全に使用できるよう、
正式なvalidatorを導入する。
ただし今回、

```text
verifiedCases = []

```

は維持する。
実Evidenceなしに架空のverified caseを追加しない。
将来caseを`verified`として登録する場合には最低限、

```text
caseId
floor
zone
widthMm
heightMm
glassType
designPressure
evidence
publicEvidenceDescription

```

等のrequired fieldをvalidatorで確認する。
さらにverified caseは、

```text
pane W evidence = primary
pane H evidence = primary
pressure evidence = primary
checkedAt = valid date

```

相当のhard conditionを満たさなければrejectすること。
private URL / IDをcaseへ入れない。
AC-07 — Disclosure boundary
public repositoryに以下を混入させない。

```text
Google Drive URL
Drive file ID
Notion private URL
SharePoint URL
internal network path
private filename
formal internal project identity
confidential identifier

```

既存の:

```text
cfg.getPublicLabel()

```

境界を維持。
Miyoshi public label:

```text
みよし案件

```

を維持。
AC-08 — UI state clarity
画面上で、最低限次を区別できること。

```text
Miyoshi preset mode
Manual / Generic mode
verified project fact
partially verified preset
sample default
manual user input

```

Miyoshi modeでは既存warning:

```text
⚠ 参考計算 — 案件実寸未確認
⚠ 設計風圧プリセット — 原典照合未完了

```

を維持する。
Manual modeでは別の適切なwarningを出す。
AC-09 — Full regression
既存48 testsをすべて維持。
必要な新規testsを追加する。
最低限:

```text
manual mode pressure selection
manual mode no Miyoshi leakage
manual invalid inputs
evidence silent coercion rejection
verified case validator
invalid verified case rejection
private URL/ID rejection
publicLabel boundary
Miyoshi regression
candidate regression

```

を含める。
AC-10 — Browser / Preview
実ブラウザで最低限:
Miyoshi

```text
Miyoshi preset表示
1250×2050 warning
wind provenance warning
1756 OK
1500幅で1463 NG

```

Manual
例:

```text
W = 1250
H = 2050
positive = 1400
negative = -1000

designP = 1400

```

になること。
Manual入力に対して、

```text
案件照合済み
verified

```

等の誤表示がないこと。
AC-11 — Draft PR
Campaign完了時:

```text
new branch
commits
push
Draft PR
Vercel Preview exact-head READY

```

まで行う。
Ready化禁止。
merge禁止。
Production禁止。
8. Non-goals
今回実装しない。

```text
V0から設計風圧を自動算定する一般風荷重エンジン
建物高さ・地表面粗度からの完全な風圧自動生成
メーカー製品データベース
BIM/CAD連携
pane geometry自動抽出
PDF/DWG解析
正式メーカー検討書の代替

```

Phase 2Cでは、

```text
既知のpressureを安全に入力し、
汎用計算コアへ渡すところ

```

まで。
9. Prohibited scope
禁止:

```text
main direct commit
Ready for Review
merge
auto-merge
Production
Release
branch delete
force push

credential change
permission change
organization setting change

private evidence publication
private URL / ID publication

Miyoshi pressure値変更
V0=34変更
roughness III変更
W=1250変更
H=2050変更

告示1458号式変更
k1変更
k2変更
IGU ratio変更
TP rule変更
Low-E strength model変更
extraFactor既定値変更

verifiedCasesへの架空データ追加

```

10. Hard checks
以下はQuality Debt化禁止。
Privacy / Disclosure

```text
public repoにprivate URL / ID / filename / formal internal identityがない

```

FAILなら即BLOCKED。
Calculation integrity

```text
Phase 1計算式・k1・k2・candidate rulesに意図しない変更がない

```

FAILなら即BLOCKED。
Evidence integrity

```text
unverified/partially_verified/manual inputが
誤ってverifiedへ昇格していない

```

FAILなら即BLOCKED。
Git authority

```text
main direct writeなし
Readyなし
mergeなし
Productionなし

```

FAILなら即BLOCKED。
11. Quality Debt

```yaml
quality_debt:
  enabled: true
  allow_defer_noncritical_checks: false
  allow_defer_external_preview: false
  allow_defer_flaky_noncritical_test: false
  high_risk_debt_blocks_final_verify: true

```

今回は標準LONG_RUN。
ENDURANCEではないため、
検証不能項目を安易にDebtへ送って継続しない。
12. Run Artifact
Repository policyが許す場合:

```text
.agent-run/LR-20260917-GLASS-P2C/
  RUN_MANIFEST.md
  TASK_PACKET_SNAPSHOT.md
  RUN_STATE.md
  TASK_QUEUE.md
  QUALITY_DEBT.md
  DECISIONS.md
  EVIDENCE.md

```

を作成する。
public repositoryなのでRun Artifactにもprivate情報を入れない。
`TASK_PACKET_SNAPSHOT.md` はこのTask Packetのexact completed instanceとする。
SHA-256を算出し、

```yaml
task_packet_id: LRP-20260917-GLASS-P2C
task_packet_revision: 1
task_packet_snapshot_path:
task_packet_digest_sha256:
repository: airesearchagl-art/glass_wind_calc_M
working_branch: claude/phase2c-generic-manual-mode

```

を`RUN_MANIFEST.md`と`RUN_STATE.md`へbindingする。
各Wave checkpointでdigest一致を確認する。
13. Wave plan
Wave 0 — Preflight / Campaign initialization
実施:

```text
fresh main fetch
exact base SHA
working tree
branch
remote
Node version
test command
browser capability
Vercel linkage
repository instructions

```

Long-Run Task Packet / Run Artifactを初期化。
Checkpoint 0。
Wave 1 — Evidence contract hardening
対象:

```text
makeEvidence()
assertEvidenceConsistency()
verified case schema/validator
public-safe evidence validator

```

実施:

* silent coercion除去
* input contract hardening
* verified case hard validation
* mutation tests
* boundary tests

計算core変更禁止。
Targeted testsを実行。
Checkpoint 1 → commit → push。
Wave 2 — Generic / Manual config architecture
Miyoshi configを壊さず、

```text
Manual / Generic input contract

```

を実装。
設計:

```text
preset source
manual source
calculation input

```

を明確に分離。
Manual pressure validation:

```text
finite number
positive/negative sign handlingを明示
designP = max(abs(pos), abs(neg))

```

invalid / NaN / empty / zero等の扱いを定義する。
Checkpoint 2 → commit → push。
Wave 3 — UI mode integration
UIへ:

```text
案件プリセット
Manual / Generic

```

の切替を追加。
Miyoshiを選んだ場合は現在のUI挙動を維持。
Manualの場合:

```text
W
H
positive pressure
negative pressure

```

を編集可能にする。
表示上、

```text
ユーザー入力
ツールによる案件原典照合なし

```

を明示。
MiyoshiのラベルやprovenanceがManualへ漏れないこと。
Checkpoint 3 → commit → push。
Wave 4 — Verification convergence
実施:

```text
node --test
all regression
mutation tests
repository-wide consistency search
private identifier search
browser smoke
manual mode smoke
Miyoshi mode smoke
full diff review

```

Independent Verifierが利用可能なら、
実装担当と別Contextで確認する。
FindingがAcceptance Criteria内で修正可能なら、
同Campaign内でRepair Waveを実施してよい。
小さなFindingごとにHumanへ戻さず、
Scope内なら収束まで進める。
ただしHard Gate failureは即BLOCKED。
Checkpoint 4。
Wave 5 — Documentation / Draft PR convergence
README:

```text
Miyoshi preset
Manual mode
Evidence status
manual input status
verified project case contract
limitations

```

をactual behaviorへ同期。
PR本文:

```text
Objective
Architecture
Evidence contract
Manual mode
Regression
Privacy boundary
Tests
Preview
Unresolved evidence

```

を記録。
Vercel Previewが
exact final head / READY
であることを確認。
Draft PRを作成。
Ready化せずSTOP。
14. Checkpoint contract
各Checkpointで最低限:

```text
Run ID
Mode
Horizon
Repository
Working branch
Base SHA
Current head
Current wave
Last successful checkpoint
Task Packet ID
revision
snapshot path
SHA-256 digest

Acceptance Criteria status + evidence
Completed
Current implementation state
Checks
Quality Debt
Explicit unverified items
Known failures
Decisions
Files changed
Remaining tasks
Next action
Stop conditions status
Resume instructions

```

を更新する。
`Explicit unverified items` は空欄禁止。
0件なら:

```text
none

```

とする。
15. Resume policy
Context / quota / runtime終了時は、
可能ならCheckpointを成立させて:

```text
SUSPENDED

```

にする。
次SessionではConversation memoryより、

```text
RUN_MANIFEST
TASK_PACKET_SNAPSHOT
digest
RUN_STATE
Git branch/head
QUALITY_DEBT
last checkpoint

```

を優先してResumeする。
digest mismatch / branch mismatch / required state欠落ならBLOCKED。
16. Required regression values
必須:

```text
FL6 / W1250 / H2050 / 2F / general / factor1
≈ 1756.09756 N/m²
=> OK

```


```text
FL6 / W1500 / H2050 / 2F / general / factor1
≈ 1463.41463 N/m²
=> NG

```

Manual:

```text
W1250
H2050
positive 1400
negative -1000

designP = 1400

```

を最低1ケース固定する。
17. Final convergence
新機能追加を止めてから最終確認する。
必須:

```text
full diff review
all tests PASS
hard checks PASS
browser smoke PASS
Miyoshi regression PASS
Manual regression PASS
privacy search PASS
Vercel exact-head Preview READY

```

Hard Checkに:

```text
waiver
accepted_by_human
Quality Debt
NOT RUN
INCONCLUSIVE

```

を使わない。
18. Completion report
最終報告は以下。

```text
Run ID:
Execution Mode:
Horizon:

Task Packet ID:
Revision:
SHA-256 digest:

Base:
Final head:

Branch:
Draft PR:

Completed:
- Evidence hardening
- verified case validator
- Generic / Manual mode
- UI integration
- tests
- browser
- docs

Checks:
Hard Checks:
Quality Debt:
Explicit unverified items:
Known failures:

Miyoshi regression:
Manual regression:

Tests:
Vercel Preview:

Checkpoint / Resume state:

Documentation Sync Trigger:
yes

Obsidian Vaultに記録候補:

Human Gate:
STOP — Ready / merge authorization required

```

Draft PR作成後にSTOP。
Ready化、merge、Productionは行わない。
````
