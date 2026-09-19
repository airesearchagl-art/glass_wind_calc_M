# glass_wind_calc_M — Phase 2E Long-Run Campaign
## Traceable Notification Wind Pressure Engine

Run ID:
LR-20260919-GLASS-P2E

Task Packet ID:
LRP-20260919-GLASS-P2E

Revision:
1

Execution mode:
LONG_RUN

Horizon:
8H

LONG_RUN_ENDURANCE:
false

Repository:
airesearchagl-art/glass_wind_calc_M

Expected base:
main @ a26714c6dd2d8bca80e18fcf1e97d7d184c9254f

Suggested branch:
claude/phase2e-wind-pressure-trace

Previous PR:
#5 MERGED

Previous Production:
main @ a26714c6dd2d8bca80e18fcf1e97d7d184c9254f

---

# 0. Objective

Phase 2Dまでに、

- calculation core
- registered preset
- manual input
- imported_unverified
- Project Input Package
- preset registry
- safe import / export / replay

の分離が成立した。

Phase 2Eでは次に、

**設計風圧そのものを、入力値・式・係数・中間値・最終値まで追跡可能に算定できる generic Wind Pressure Trace Engine**

を導入する。

目標は、

preset pressureを単に固定値として使うだけのツール

から、

preset
manual
notification-based calculation

を明確に分離し、

「なぜこの設計風圧になったか」

を第三者が後から追跡できる構成へ進めること。

ただし、
既存Miyoshi presetを今回の自動算定値で置換してはならない。

---

# 1. Fresh Gate

開始時に必ず確認:

origin/main
==
a26714c6dd2d8bca80e18fcf1e97d7d184c9254f

working tree clean
tracked changes = 0
untracked files = 0

mainへ直接commitしない。

baseline:

npm test

Expected:
133 tests以上
0 fail

実測値をRun Artifactへ記録。

不一致ならSTOP。

---

# 2. Canonical Long-Run route

可能なら以下を読む。

1. Long_Run_Development_Route.md
2. Long_Run_Task_Packet.md
3. Implementation_Task_Prompt.md
4. Claude_Code_Capability_Tier_Orchestration.md
5. Documentation_Sync_Handoff.md
6. repository instructions
7. README
8. relevant source / tests

Vaultへアクセスできなくても、
Task Packetはself-containedなのでRun Artifactを省略しない。

---

# 3. Run Artifact — Wave 0で必ず作成

.agent-run/LR-20260919-GLASS-P2E/

RUN_MANIFEST.md
TASK_PACKET_SNAPSHOT.md
RUN_STATE.md
TASK_QUEUE.md
QUALITY_DEBT.md
DECISIONS.md
EVIDENCE.md

Task Packet exact bodyをsnapshot。

SHA-256を算出し、

run ID
packet ID
revision
snapshot path
digest
repository
branch

へbindingする。

resume時はdigestを再hash。

不一致:
BLOCKED

---

# 4. Phase 2D closeout

Phase 2DのRun Artifactへ必要最小限のpost-merge closeoutを行ってよい。

記録:

PR #5:
MERGED

final feature head:
dba12ae72c8496154d828ad8a3f0ac5e76b6657e

merge/main:
a26714c6dd2d8bca80e18fcf1e97d7d184c9254f

Production:
READY

Final Focused Independent Review:
PASS

Required Fix:
0

Human merge authorization:
received

ただしPhase 2Dの:

TASK_PACKET_SNAPSHOT.md
Task Packet digest

は変更禁止。

Phase 2DのFinal Run Stateについては、
explicit unverified itemsが4件残るため、
canonical contractに従い
COMPLETE_PENDING_FULL_VERIFY
を維持してよい。

---

# 5. Research Gate — 最重要

Phase 2Eでは、
風圧算定式・係数・適用条件を
モデルの記憶や既存コメントだけから実装しない。

最初にPublic primary sourcesを確認する。

優先source:

A. 国土交通省
- 平成12年建設省告示第1454号
- 平成12年建設省告示第1458号
- 現行改正を反映した関連資料

B. 板硝子協会
- 帳壁に用いる板ガラスの風圧力計算法
- 4辺支持板ガラスの耐風圧強度計算法

C. 必要な場合のみ
- official / industry primary technical guidance

Research outputを:

.agent-run/LR-20260919-GLASS-P2E/EVIDENCE.md

へpublic-safeに記録する。

最低限:

source title
publisher
public URL
確認日
採用する式
採用する係数
適用範囲
未確認事項

を残す。

## Hard rule

公式一次資料で直接確認できなかった:

式
係数
zone rule
height rule
internal pressure rule
roughness rule

を推測実装してはならない。

確認不能な部分は:

UNVERIFIED
NOT_IMPLEMENTED

として明示する。

Research Gateが成立しない場合、
その部分のimplementationはBLOCKED。

---

# 6. Architecture

推奨:

calc.js
  = glass strength core
  = Phase 2Dどおりpure

wind-pressure.js
  = generic wind pressure calculation core

project-config/
  miyoshi.js
  manual.js
  registry.js
  project-input.js

必要なら:

project-config/wind-input.js

を追加してよい。

wind-pressure.jsに:

Miyoshi固有値
案件名称
private evidence
project preset値

を入れない。

---

# 7. New wind mode

現在のpressure sourceに加え、

notification_calculation

または意味が同等のmodeを追加する。

UI上の概念:

1. 案件プリセット
2. 手入力
3. 告示風圧計算
4. 取り込みデータ

告示風圧計算modeでは、

必要な風条件を入力
↓
Wind Pressure Traceを生成
↓
positivePressure / negativePressure
↓
Project Input Package
↓
既存GlassCalc

という一方向pipelineにする。

GlassCalcは風圧式を知らない。

---

# 8. Wind Pressure Trace contract

最終pressureだけを返してはいけない。

結果には、
sourceで確認できた範囲の各中間値を保持する。

例:

{
  schemaVersion,
  sourceKind: "notification_calculation",

  inputs: {
    ...
  },

  intermediates: {
    ...
  },

  positivePressure,
  negativePressure,
  designPressure,

  trace: [
    ...
  ],

  provenance: {
    formulaSource,
    inputVerificationStatus
  }
}

名称は一次資料に合わせてよい。

重要:

式がverifiedであることと、
ユーザーが入力したV0/H/Z等がverifiedであることを
混同しない。

例:

formulaVerificationStatus:
verified

inputVerificationStatus:
user_input_unverified

を分離する。

---

# 9. Required input contract

必要な入力項目は
Research Gateで確定する。

候補として:

V0
地表面粗度区分
建物高さ
評価高さ
外装部位
正圧/負圧のzone
必要な係数選択

等が想定されるが、

**一次資料で必要性と定義を確認する前に
固定schemaとして実装しない。**

特に:

floor → Z

を自動推測してはいけない。

Miyoshiの1F/2F/3F/RFと
評価高さZのmappingは未確認事項のまま。

---

# 10. Project Input Package v2

Phase 2Eでwind calculation traceをreplay可能にする必要がある場合、
Project Input Package schemaVersionを2へ上げてよい。

ただし必須:

v1 import support維持

v1 → v2
deterministic migration

v2 → current normalization

unknown future version:
reject

silent reinterpretation:
禁止

v1の既存export/import behaviorを壊さない。

もしv2が不要なら、
Wind Traceを別artifactとして保持し
PIP v1へpressure resultだけ渡してもよい。

設計判断をDECISIONS.mdへ記録。

---

# 11. Miyoshi comparison mode

Phase 2Eでは
Miyoshi presetをnotification calculationで置換しない。

代わりに、

**comparison / diagnostic**

を可能にする。

Miyoshiで既にverified:

V0 = 34 m/s
roughness = III

これらは利用してよい。

しかし未確認:

actual pane W/H
各階評価高さZ
元pressure calculation
exact floor/Z mapping

は推測しない。

したがってcomparisonは:

Human/userがZ等を入力
↓
notification calculation
↓
calculated pressure
vs
existing Miyoshi preset

として表示する。

結果ラベル:

参考比較
comparison only
preset provenance unresolved

等を明示。

一致しても
preset verificationStatusを
verifiedへ昇格させない。

---

# 12. Protected invariants

以下を変更しない。

Glass strength formula:

P = (300 × k1 × k2 / A) × (t + t²/4)

FL k1:
既存値維持

single:
k2 = 1.0

IGU:
既存formula維持

K2 ratio cap:
2.0

IGU applicability:
thick/thin > 2.5
自動推奨除外

TP:
既存k1 / thickness support維持

Low-E:
coating属性

extraFactor:
default 1.00

---

# 13. Miyoshi protected facts

変更禁止:

V0:
34

roughness:
III

positive:
1297 / 1525 / 1695 / 1729

negative:
918 / 1122

dimensions:
1250 / 2050 sample_default

verification states:
既存値維持

今回のcomputed pressureが似ていても、
既存presetの値を上書きしない。

---

# 14. Explicit unverified items

維持:

1. actual pane W/H
2. positive pressure original calculation
3. negative pressure original calculation
4. exact floor/evaluation-height mapping

Phase 2E中に
public repository内またはHuman提供Evidenceから
直接確認できない限りclosureしない。

---

# 15. Acceptance Criteria

## AC-01 Research Gate

採用したwind formulas / coefficients / applicabilityが
primary public sourcesへtraceできる。

memory-only implementation:
0

---

## AC-02 Generic Wind Core

wind-pressure.js等が
project-independent pure module。

Miyoshi literal:
0

---

## AC-03 Traceability

final pressureだけでなく、
inputs → intermediate terms → final pressure
を追跡できる。

roundingは表示時のみ。

internal calculationでは
不要な早期丸めをしない。

---

## AC-04 Formula vs Input verification separation

公式式がverifiedでも、
user-entered V0/H/Zをverified扱いしない。

trust promotion禁止。

---

## AC-05 Notification mode

UIからnotification calculationを選択可能。

既存3 modeは回帰なし。

---

## AC-06 Project Input integration

computed positive / negative pressureが
Project Input Packageを経由してGlassCalcへ渡る。

GlassCalcへのspecial bypass禁止。

---

## AC-07 Design pressure

既存contract維持:

designPressure
=
max(abs(positivePressure), abs(negativePressure))

---

## AC-08 Replay

Export → Import → Recalculateで
同じpressure結果・glass resultを再現できる。

必要ならschemaVersion 2。

---

## AC-09 Migration

PIP v1を破壊しない。

旧export payload:
import可能

unknown future version:
fail closed

---

## AC-10 Miyoshi diagnostic

Miyoshi presetと
notification calculation resultを
side-by-side比較できる。

ただしcomparisonは
preset replacementではない。

---

## AC-11 No automatic Z inference

floorからevaluation heightを勝手に生成しない。

mappingがEvidenceで確認されるまで
user input / explicit mappingのみ。

---

## AC-12 Error boundary

invalid:

V0
height
evaluation height
roughness
coefficient selection
unsupported combination

はfail closed。

NaN / Infinity:
reject

---

## AC-13 Unit discipline

m/s
m
N/m²
等を明示。

unit conversionを暗黙に混ぜない。

---

## AC-14 Known-answer tests

一次資料または
明示的な手計算から導いたknown-answerを追加。

少なくとも:

- simple wind calculation
- boundary height
- roughness categories supported
- invalid inputs
- positive calculation
- negative calculation
- designP selection

をcover。

source exampleが存在する場合は
そのexampleを優先。

---

## AC-15 Miyoshi regression

Phase 2D regression:

FL6
1250×2050
2F
general
factor 1.00

1756.09756...
designP 1525
OK

維持。

W1500:
1463.41463...
NG

Manual:
designP 1400

維持。

---

## AC-16 Existing tests

baseline:
133+

削除でcoverageを減らさない。

final:
baseline以上
0 fail

---

## AC-17 Browser

Playwrightで:

preset
manual
imported
notification calculation

全mode確認。

notification modeで:

inputs変更
→ intermediate trace変更
→ pressure変更
→ glass candidate変更

まで確認。

JS error:
0

---

## AC-18 Security

imported Wind TraceやPIPが
verified stateを偽装できない。

prototype pollution等の
Phase 2D security boundary維持。

---

## AC-19 Privacy

public repoへ:

private document name
private ID
internal path
session ID
secret
credential
formal confidential identity

を追加しない。

official public source URLは可。

---

## AC-20 Documentation

READMEへ:

wind modes
公式source
formula trace concept
input verification vs formula verification
Project Input migration
Miyoshi diagnostic limitation
explicit unresolved items

を同期。

---

# 16. Non-goals

今回やらない:

actual pane寸法の推測
floor→Zの推測
Miyoshi presetの自動置換
Miyoshi pressureのverified昇格
private drawing parsing
DWG/PDF automatic pane extraction
BIM integration
manufacturer DB
cloud backend
account/auth
Production deployment
merge

---

# 17. Wave Plan

## Wave 0
Fresh Gate
Phase 2D closeout
Run Artifact
baseline

## Wave 1
Official-source Research Gate
formula / coefficient / scope matrix
known-answer planning

Checkpoint

## Wave 2
generic wind input contract
Wind Pressure Trace data model
pure calculation core

Checkpoint

## Wave 3
Project Input Package integration
version/migration if required
trust model

Checkpoint

## Wave 4
UI notification mode
trace display
Miyoshi comparison diagnostic

Checkpoint

## Wave 5
known-answer tests
boundary tests
mutation tests
security / privacy

Checkpoint

## Wave 6
browser verification
full regression
independent verifier

Findingはscope内でrepair waveへまとめる。

Hard Gate failure:
BLOCKED

## Wave 7
README
Run Artifact convergence
Draft PR
Vercel Preview exact-head
Completion Report

Human GateでSTOP。

---

# 18. Independent Verifier

別contextが使える場合、
最終verifyを独立実施。

最低確認:

official-source trace
formula correctness
coefficient table correctness
boundary behavior
unit correctness
trust separation
PIP migration
Miyoshi non-regression
browser
privacy
Run Artifact
Vercel exact-head

Findingは
可能な限りCampaign内でrepair。

---

# 19. Hard Gates

次はQuality Debtへ送らない。

Safety-critical formula mismatch
Security
Privacy
Permission
Data integrity
Secret exposure
Trust-boundary bypass
Verified-state spoofing

公式sourceと実装が一致しない:
BLOCKED

sourceが曖昧なのに推測実装:
BLOCKED

---

# 20. Prohibited

main direct write
Ready for Review
merge
auto-merge
Production
Release
force push
secret modification
permission modification
branch protection modification
private-data copy
unapproved destructive operation

---

# 21. Draft PR

最終成果はDraft PR。

OPEN
Draft=true
merged=false

Vercel Preview:
READY
exact head一致

まで。

Ready / merge / Productionは禁止。

---

# 22. Completion Report

Run ID:
Task Packet ID:
Revision:
Digest:

Base:
Final exact head:
Branch:
Draft PR:

Official Research Gate:
Sources:
Implemented formula scope:
Not implemented / unresolved:

Wind core:
Trace contract:
Project Input schema:
Migration:

Notification mode:
Miyoshi comparison:

Tests:
Baseline:
Final:
Known-answer:
Mutation:

Regression:
Miyoshi 1250:
Miyoshi 1500:
Manual:
Import/export:
Notification:

Browser:
Privacy:
Security:
Vercel Preview:

Quality Debt:
Explicit unverified items:

Run Artifact:
Final State:

Documentation Sync Trigger:
yes

Vault / Notion sync candidates:

Human Gate:
STOP — Ready / merge authorization required
