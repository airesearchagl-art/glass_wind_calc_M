# Task Packet Snapshot — LRP-20260920-GLASS-P2H (revision 1)

This file is the exact body of the Task Packet as delivered.
It is digest-bound (SHA-256 over this file's bytes) and must not be edited.

---

glass_wind_calc_M — Phase 2H Long-Run Campaign
Runtime Project Profile / Scenario Matrix

Run ID:
LR-20260920-GLASS-P2H
Task Packet ID:
LRP-20260920-GLASS-P2H
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
main @ e7d396621536acd21934fc92892087be0f47d8d6
Previous PR:
#8 MERGED
Suggested branch:
claude/phase2h-project-profile-scenario-matrix
Expected baseline:
npm test >= 342
0 fail

────────────────────────────────────────
0. Objective
────────────────────────────────────────
Phase 2Gで、

* Single Calculator
* Batch / Scenario Workspace
* Workspace Package v1
* TSV / JSON / CSV
* row-level INVALID diagnostics
* summary / grouping / sort / filter

まで成立した。
Phase 2Hでは、大量のnotification calculation caseを作る際に、
V0
roughness
building height
eaves height
building type
calculation basis
等の案件共通条件を1回だけ入力し、
各ガラスcase側では:
W
H
evaluation height Z
zone
glass type
等のcase固有条件だけを指定できるようにする。
ただし重要なのは:
Project Profileは
registered presetではない。
Project Profileは
verified Evidenceではない。
Project Profileは
runtime user input convenience layerである。
Profile + Scenario
→ explicit effective input
→ existing PIP v2
→ existing calculation core
とする。

────────────────────────────────────────
1. Fresh Gate
────────────────────────────────────────
開始時:
origin/main
e7d396621536acd21934fc92892087be0f47d8d6
working tree clean
tracked:
0
untracked:
0
main direct write禁止。
baseline:
npm test
expected:
=342
0 fail
実測結果をRun Artifactへ記録。
不一致:
STOP。

────────────────────────────────────────
2. Run Artifact
────────────────────────────────────────
実装開始前に:
.agent-run/LR-20260920-GLASS-P2H/
RUN_MANIFEST.md
TASK_PACKET_SNAPSHOT.md
RUN_STATE.md
TASK_QUEUE.md
QUALITY_DEBT.md
DECISIONS.md
EVIDENCE.md
を作成。
Task Packet exact bodyをsnapshot。
SHA-256で:
run id
packet id
revision
snapshot
digest
repo
branch
をbinding。
resume時:
rehash。
mismatch:
BLOCKED。

────────────────────────────────────────
3. Phase 2G post-merge closeout
────────────────────────────────────────
Phase 2G:
PR #8:
MERGED
final feature head:
ede68ee81553f2e65be4bd6b0a13c3e7b9b70b28
implementation verification head:
6a4728e32178220efb7d10e2bed6ea55f02eaa34
merge/main:
e7d396621536acd21934fc92892087be0f47d8d6
Production:
READY
Final Focused Review:
PASS
Required Fix:
0
Human merge authorization:
received
tests:
342 / 0
browser:
84 / 84
mutants:
22 / 22 killed
を記録してよい。
Phase 2G snapshot / digestは変更禁止。

────────────────────────────────────────
4. Evidence / Trust — protected boundary
────────────────────────────────────────
Phase 2HもEvidence Phaseではない。
維持:
verifiedCases:
[]
project_specific_promotion:
NONE
explicit_unverified_items:
4
1250×2050:
sample_default / unverified
1297 / 1525 / 1695 / 1729:
current state
918 / 1122:
current state
floor → Z:
unverified
Project Profileの入力回数や、
同じ値が100caseで使われることは、
Evidenceを増やさない。

────────────────────────────────────────
5. Runtime Project Profile
────────────────────────────────────────
案件共通の風条件を保持する
generic runtime Profileを作る。
推奨module:
project-profile.js
案件非依存。
Profile concept:
{
schemaVersion: 1,
profileType: "runtime_wind_profile",
label: optional,
windDefaults: {
V0,
roughnessCategory,
buildingHeightM,
eavesHeightM,
buildingType,
basis,
recurrenceYears?,
buildingShortSideM?
}
}
重要:
Profileには以下を入れない:
evaluationHeightM
zone
理由:
この2つはpane/locationごとの差異が
設計風圧を直接左右する。
案件Profileから暗黙継承させると、
別階・別部位へ同じ値を誤適用しやすい。

────────────────────────────────────────
6. Profile verification semantics
────────────────────────────────────────
Runtime Profileのstatusは:
user_input_unverified
のみ。
外部Profile JSONが:
verified
primary
registered_preset
privateReferenceAvailable
Evidence
sourceReference
等を名乗っても
trustedにしない。
可能ならschema自体に
これらのfieldを存在させない。
unexpected field:
reject。

────────────────────────────────────────
7. Profile Package v1
────────────────────────────────────────
Profileだけを明示Export / Importできるようにする。
Profile Package v1。
保存するのは入力だけ。
Do not save:
calculated pressure
trace
verification claim
Evidence
registered preset identity
recommended glass
Workspace result
External Profile importは常に
runtime unverified。

────────────────────────────────────────
8. Memory-only
────────────────────────────────────────
ProfileはPhase 2G Workspaceと同様、
memory-only。
追加禁止:
localStorage
sessionStorage
IndexedDB
backend DB
automatic cloud storage
保存は明示Exportのみ。

────────────────────────────────────────
9. Scenario contract
────────────────────────────────────────
各Scenarioはprofileとの差分ではなく、
case固有入力として必須な値を保持する。
Concept:
{
scenarioId,
label?,
widthMm,
heightMm,
evaluationHeightM,
zone,
glassType,
extraFactor
}
minimum required:
widthMm
heightMm
evaluationHeightM
zone
glassType
extraFactor:
existing default contractに従い1.0可。

────────────────────────────────────────
10. No floor → Z inference
────────────────────────────────────────
絶対禁止:
1F → Z
2F → Z
3F → Z
RF → Z
の自動変換。
Scenario labelに:
2F
3F
と書かれていても、
evaluationHeightMは必ず独立入力。
将来floor mapping Evidenceが得られるまで
この境界を維持。

────────────────────────────────────────
11. Effective Input Resolver
────────────────────────────────────────
Profile + Scenarioを
一つのWindInputへ展開するpure functionを作る。
例:
resolveEffectiveWindInput(profile, scenario)
結果:
{
V0,
roughnessCategory,
buildingHeightM,
eavesHeightM,
evaluationHeightM,
buildingType,
zone,
basis,
recurrenceYears?,
buildingShortSideM?
}
そして:
ProjectInput.fromWindCalculation({
widthMm,
heightMm,
glassType,
extraFactor,
windInput: effectiveWindInput
})
へ渡す。
新しいpressure calculationを書かない。

────────────────────────────────────────
12. No hidden default
────────────────────────────────────────
以下を勝手に決めない:
V0
roughness
building height
eaves height
building type
basis
evaluation Z
zone
欠けている場合:
fail closed。
特にbasisを:
notification_baseline
へ自動設定しない。
Phase 2G TSVと同じ契約。

────────────────────────────────────────
13. Effective Input Trace
────────────────────────────────────────
利用者が
「このcaseは何を使って計算したのか」
を確認できるようにする。
Scenario previewに:
Profileから:
V0 = 34
roughness = III
building H = ...
basis = ...
Scenarioから:
W
H
Z
zone
glassType
を明示。
ただし「継承」という語だけで隠さず、
最終的なeffective valuesを表示。

────────────────────────────────────────
14. Snapshot semantics
────────────────────────────────────────
ProfileからWorkspaceへcaseを生成した時点で:
effective input
→ PIP v2
としてsnapshot。
その後Profileを変更しても、
既にWorkspaceへ追加済みのcaseは
自動変更しない。
理由:
過去の検討結果が
知らないうちに変わることを防ぐ。
再適用は明示操作のみ。

────────────────────────────────────────
15. Scenario Matrix UI
────────────────────────────────────────
Batch view内に追加:
Project Profile
Scenario Matrix
推奨フロー:

1. Profileを入力
2. Scenario rowsを入力
3. Effective Input Preview
4. Add to Workspace
5. 既存Batch評価

既存Workspace UIを置き換えない。
上流input composerとして追加する。

────────────────────────────────────────
16. Scenario Matrix columns
────────────────────────────────────────
最低限:
scenario_id
label
width_mm
height_mm
evaluation_height_m
zone
glass_type
extra_factor
scenario_id / label:
optional。
profile側field:
V0
roughness
building heights
building type
basis
をScenario rowで繰り返さない。

────────────────────────────────────────
17. Matrix TSV
────────────────────────────────────────
Excel貼付に対応。
Profileとは別のScenario Matrix TSV。
unknown field:
reject。
以下は禁止:
V0 override
roughness override
basis override
buildingHeight override
をPhase 2HのMatrix TSVへ入れること。
理由:
「共通条件Profile」という意味を曖昧にしない。
個別に風条件を変えたい場合は
既存Phase 2G TSVを使う。

────────────────────────────────────────
18. Scenario override policy
────────────────────────────────────────
Phase 2Hでは
風条件のrow overrideは実装しない。
Profile common:
fixed
Scenario:
pane/location-specific
という明確な分離を優先。
将来必要になった場合は
別Phaseでexplicit override contractを設計する。

────────────────────────────────────────
19. Matrix generator
────────────────────────────────────────
explicitな値リストから
scenarioを生成する機能を追加してよい。
例:
Widths:
1250
1500
Heights:
2050
Z:
4.2
8.4
12.6
Zones:
general
corner
でcartesian productを生成。
ただしすべて利用者が明示入力した値だけ。
floorからZ生成は禁止。

────────────────────────────────────────
20. Matrix explosion protection
────────────────────────────────────────
生成前に:
preview count
を表示。
hard cap:
既存Workspace MAX_CASES以下。
1000件を超える生成:
reject。
すでにWorkspaceにcaseがある場合は:
existing count + generated count
で上限判定。

────────────────────────────────────────
21. Duplicate Scenario
────────────────────────────────────────
Scenario rowを複製可能。
new scenarioId。
Profileは同じ。
Workspace caseIdとは別。
Scenario IDとWorkspace caseIdを
同一視しない。

────────────────────────────────────────
22. Scenario → Workspace
────────────────────────────────────────
Add selected
Add all
を提供してよい。
追加時:
Profile
+
Scenario
→ effective WindInput
→ PIP v2
→ existing Workspace.addCase()
結果:
通常のnotification_calculation case。
verifiedにならない。

────────────────────────────────────────
23. Workspace remains authoritative for calculation
────────────────────────────────────────
Scenario Matrix自体は
計算結果を正本として保持しない。
最終計算対象は
生成済みWorkspace PIP。
Scenario Matrixを編集しても
既存Workspace結果は変わらない。
再生成:
明示操作。

────────────────────────────────────────
24. Profile change warning
────────────────────────────────────────
Workspace生成後にProfileを変更した場合:
「既存Workspace caseには反映されていません」
をUIで明示。
自動同期しない。
必要なら:
Rebuild selected cases
は今回Non-goalでもよい。

────────────────────────────────────────
25. Profile JSON import security
────────────────────────────────────────
Hard boundaries:
JSON.parse only
size cap
depth cap
unknown field reject
proto
prototype
constructor
reject。
label length cap。
No URL/path/Evidence metadata。

────────────────────────────────────────
26. Scenario TSV security
────────────────────────────────────────
Phase 2Gと同じ考え方。
row isolation。
physical line number保持。
INVALID diagnostic。
raw row leak禁止。
HTML injection防止。
CSV formulaはScenario TSV自体には関係しないが、
後のWorkspace CSVへlabelが渡るため
Phase 2G neutralization非退行を確認。

────────────────────────────────────────
27. Case traceability
────────────────────────────────────────
Workspace caseがProfileから生成された場合でも、
計算に必要な値はPIP内で完全に展開されること。
Profileが無いと再計算できないpackageにしない。
つまりWorkspace Exportだけで
再計算可能。
Profile fileとの外部依存を作らない。

────────────────────────────────────────
28. Profile identity
────────────────────────────────────────
runtime label:
例:
Office-A
Study-01
を許容。
private runtime user dataなので
repoへ保存しない。
test fixtures:
Profile A
Sample Profile
等のみ。
正式案件名をfixtureへ書かない。

────────────────────────────────────────
29. Registered preset separation
────────────────────────────────────────
明確に分離:
Registered Preset:
built-in trusted repository configuration
Runtime Profile:
user_input_unverified
Profileを:
「保存」
「export」
「100回利用」
してもregistered presetにはならない。

────────────────────────────────────────
30. Evidence separation
────────────────────────────────────────
Profile JSONへ:
verificationStatus
Evidence
sourceReference
privateReferenceAvailable
を追加できない。
Scenarioにも不可。
Profile/Scenario input countや
数値一致からEvidence昇格しない。

────────────────────────────────────────
31. UI status
────────────────────────────────────────
Profile cardに明示:
Runtime Project Profile
Unverified User Input
算定式がverifiedでも、
Profile values:
unverified
であることを表示。

────────────────────────────────────────
32. Known-answer equivalence
────────────────────────────────────────
Profile:
V0 34
roughness III
buildingHeight 14.2
eavesHeight 14.2
buildingType closed
basis notification_baseline
Scenario:
W1250
H2050
Z14.2
zone general
FL single
から生成したPIPの結果が、
同じ値を直接
ProjectInput.fromWindCalculation()
へ渡した場合と
bit-equivalentであること。
Profile layerが数値を変えない。

────────────────────────────────────────
33. Profile reuse test
────────────────────────────────────────
1 Profile
Scenario A:
W1250
Scenario B:
W1500
同じZ / zone。
生成後:
Case A / Bは同じwind conditions、
違うpane dimensions。
Phase 2G known behaviorを維持。

────────────────────────────────────────
34. Snapshot regression test
────────────────────────────────────────
Profile V0=34
→ Scenario AをWorkspaceへ生成
その後Profile V0=36へ変更。
期待:
既存Workspace A:
V0 34のPIPのまま
新しく生成したB:
V0 36
自動mutationしない。

────────────────────────────────────────
35. Matrix generator tests
────────────────────────────────────────
2 widths
×
1 height
×
3 Z
×
2 zones
=
12 scenarios
を生成。
順序:
deterministic。
同じinputから
同じscenario order。
1001超:
reject。

────────────────────────────────────────
36. Acceptance Criteria
────────────────────────────────────────
AC-01
Single regressionなし。
AC-02
Phase 2G Batch regressionなし。
AC-03
Profile Package v1成立。
AC-04
Runtime Profileはunverifiedのみ。
AC-05
evaluationHeight / zoneはProfileへ入らない。
AC-06
floor→Z inferenceなし。
AC-07
effective resolver成立。
AC-08
resolved PIPが既存direct pathと同一結果。
AC-09
Profile changeが既存Workspace caseをmutationしない。
AC-10
Scenario Matrix成立。
AC-11
Matrix TSV成立。
AC-12
Matrix generator成立。
AC-13
generator cap成立。
AC-14
Scenario → Workspace成立。
AC-15
generated caseはnotification_calculation / unverified。
AC-16
Workspace JSON単独で再計算可能。
AC-17
Profile import trust spoof不可。
AC-18
Scenario import trust spoof不可。
AC-19
prototype pollution不可。
AC-20
HTML / error privacy非退行。
AC-21
CSV injection非退行。
AC-22
memory-only。
AC-23
PIP v1/v2非退行。
AC-24
Evidence/verifiedCases非退行。
AC-25
README / Run Artifact actual sync。

────────────────────────────────────────
37. Security / Mutation
────────────────────────────────────────
攻撃対象:
Profile JSON:
verified=true
Profile JSON:
sourceKind=registered_preset
Profile JSON:
Evidence
Profile JSON:
sourceReference
Profile JSON:
evaluationHeightM
Profile JSON:
zone
Profile JSON:
proto
Profile JSON:
constructor/prototype
Scenario TSV:
V0 column
roughness column
basis column
verified column
Evidence column
unknown field
Generator:
cap removal
Resolver:
missing basis default
Resolver:
missing Z silently uses building height
Resolver:
zone silently defaults general
Snapshot:
Profile mutation changes existing PIP
Trust:
generated case promoted verified
Selected mutation candidates:

* remove profile status downgrade
* allow evaluationHeight in Profile
* default Z
* default zone
* default basis
* bypass ProjectInput.fromWindCalculation
* remove matrix cap
* mutate workspace cases after profile change
* accept Evidence field
* accept registered_preset
* use raw HTML label

Survivor affecting calculation/trust/privacy:
repair。

────────────────────────────────────────
38. Browser flow
────────────────────────────────────────
Verify:
Single default unchanged。
Batch unchanged。
Create Profile。
Profile shows:
Unverified User Input。
Add scenario manually。
Preview effective input。
Generate matrix。
Add scenarios to Workspace。
Evaluate。
Change Profile。
Existing Workspace results unchanged。
Add new scenario after change。
New case uses changed Profile。
Export Workspace JSON。
Clear。
Import Workspace JSON alone。
Results reproduce without Profile。
Profile JSON export/import。
Trust remains unverified。
HTML payload inert。
storage:
0。
page errors:
0。
console errors:
0。

────────────────────────────────────────
39. Independent Verifier
────────────────────────────────────────
Separate context。
重点:
Profile/Preset separation
Profile/Evidence separation
Z/zone no inheritance
no floor mapping
effective-input correctness
snapshot semantics
Workspace independence from Profile
matrix cap
import trust
prototype pollution
Single regression
Batch regression
Wind Trace regression
Evidence regression
browser
Run Artifact honesty
findings:
同Campaign内repair。
Hard Gate:
BLOCKED。

────────────────────────────────────────
40. README
────────────────────────────────────────
Document:
Runtime Project Profileとは何か
registered presetとの差
unverified status
Profile Package v1
Profile common fields
Scenario required fields
Z/zone are per scenario
no floor→Z inference
effective input
snapshot semantics
Scenario Matrix
matrix generator
Workspaceとの関係
export/import
memory-only
Evidence非昇格

────────────────────────────────────────
41. Wave Plan
────────────────────────────────────────
Wave 0:
Fresh Gate
Run Artifact
Phase 2G closeout
baseline
Wave 1:
architecture inventory
Profile contract
Scenario contract
Wave 2:
Profile module
Profile Package v1
effective resolver
Wave 3:
Scenario Matrix model
generator
Scenario → Workspace
Wave 4:
UI
Profile editor
effective preview
Matrix UI
TSV
export/import
Wave 5:
security
privacy
mutation
limits
Wave 6:
full regression
browser
independent verifier
repair
Wave 7:
README
Run Artifact convergence
Draft PR
Vercel Preview exact-head
Completion Report
Human Gate:
STOP。

────────────────────────────────────────
42. Hard Gates
────────────────────────────────────────
以下はQuality Debt化禁止:
wrong calculation
implicit Z
implicit zone
implicit basis
floor→Z inference
trusted Profile promotion
Evidence spoof
registered preset spoof
prototype pollution
private data leak
Single regression
Batch regression
snapshot mutation
unbounded matrix generation
発生:
BLOCKED。

────────────────────────────────────────
43. Non-goals
────────────────────────────────────────
今回はやらない:
database
cloud profile storage
account/login
team sharing
automatic Sheets sync
BIM/Revit
DWG/PDF parsing
manufacturer DB
verified Project Profile
registered preset creation UI
automatic floor→Z
Production deployment

────────────────────────────────────────
44. Final deliverable
────────────────────────────────────────
Draft PR:
OPEN
Draft=true
merged=false
Vercel Preview:
READY
exact head
No Ready。
No merge。
No Production。

────────────────────────────────────────
45. Completion Report
────────────────────────────────────────
Run ID:
Task Packet:
Revision:
Digest:
Base:
Implementation head:
Final artifact head:
Draft PR:
Tests:
baseline
final
Profile:
schema
fields
status
Profile Package:
export/import
Scenario:
required fields
Z:
explicit
zone:
explicit
basis:
explicit
floor mapping:
none
Effective resolver:
PASS/FAIL
Direct-path equivalence:
PASS/FAIL
Snapshot semantics:
PASS/FAIL
Matrix:
manual rows
TSV
generator
cap
Workspace:
generated cases
roundtrip independence from Profile
Trust:
Profile
Scenario
registered preset
Evidence
Single regression:
Batch regression:
Wind regression:
PIP:
Evidence:
Security:
prototype:
HTML:
privacy:
Mutation:
selected
survivors
repairs
Browser:
Vercel Preview:
Quality Debt:
Explicit unverified items:
4
Final Run State:
Documentation Sync Trigger:
yes
Human Gate:
STOP — Ready / merge / Production authorization required
