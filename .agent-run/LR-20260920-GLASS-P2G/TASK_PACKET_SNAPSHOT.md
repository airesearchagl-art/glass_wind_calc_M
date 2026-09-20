# Task Packet Snapshot — LRP-20260920-GLASS-P2G (revision 1)

This file is the exact body of the Task Packet as delivered.
It is digest-bound (SHA-256 over this file's bytes) and must not be edited.

Delivery note: the packet was delivered in two consecutive user messages.
Part 1 ended mid-section 29 ("TSV/Workspace labelへ:"); part 2 continued from
that point through section 45. This snapshot is the faithful concatenation of
both parts in order. See DECISIONS.md D-000.

---

glass_wind_calc_M — Phase 2G Long-Run Campaign
Batch / Scenario Workspace

Run ID:
LR-20260920-GLASS-P2G
Task Packet ID:
LRP-20260920-GLASS-P2G
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
main @ ace00edfe4325570e8c31cde9cf56b2c708c458d
Suggested branch:
claude/phase2g-batch-scenario-workspace
Previous PR:
#7 MERGED
Previous Production:
main @ ace00edfe4325570e8c31cde9cf56b2c708c458d
Expected baseline:
npm test >= 270
0 fail

────────────────────────────────────────
0. Objective
────────────────────────────────────────
Phase 2Gでは、
現在の「1枚のガラスを検討するcalculator」を維持したまま、
複数のガラス・複数条件を
同じ画面でまとめて比較・検討できる
Batch / Scenario Workspace
を追加する。
実務上の想定:

* 外壁・カーテンウォールの複数pane
* 幅・高さ違いの比較
* 階・部位違い
* Manual pressure違い
* Notification calculation違い
* ガラス種別違い
* VE前後比較
* 複数案比較
* ガラス表・検討一覧の一次チェック

を1ケースずつ再入力するのではなく、
一覧として評価できるようにする。
重要:
Batch layerは
新しい構造計算ロジックを持たない。
各rowは必ず既存:
Project Input Package v2
→ GlassCalc
→ WindPressure / ProjectInput
→ existing candidate selection
を使う。
single-case calculatorが正、
Batchはそのorchestration layer。

────────────────────────────────────────
1. Fresh Gate
────────────────────────────────────────
開始時:
origin/main
ace00edfe4325570e8c31cde9cf56b2c708c458d
working tree clean
tracked = 0
untracked = 0
mainへ直接commitしない。
baseline:
npm test
expected:
=270
0 fail
実測値をRun Artifactへ記録。
不一致:
STOP

────────────────────────────────────────
2. Canonical Long-Run
────────────────────────────────────────
可能なら開始時に:
Long_Run_Development_Route.md
Long_Run_Task_Packet.md
Implementation_Task_Prompt.md
Claude_Code_Capability_Tier_Orchestration.md
Documentation_Sync_Handoff.md
を読む。
repository instructions
README
direct dependencies
relevant tests
も確認。

────────────────────────────────────────
3. Run Artifact
────────────────────────────────────────
実装前に:
.agent-run/LR-20260920-GLASS-P2G/
RUN_MANIFEST.md
TASK_PACKET_SNAPSHOT.md
RUN_STATE.md
TASK_QUEUE.md
QUALITY_DEBT.md
DECISIONS.md
EVIDENCE.md
を作る。
Task Packet exact bodyをsnapshot。
SHA-256をbinding:
run id
packet id
revision
snapshot
digest
repo
branch
Resume時:
rehash
mismatch:
BLOCKED

────────────────────────────────────────
4. Phase 2F closeout
────────────────────────────────────────
Phase 2F:
PR #7:
MERGED
final feature head:
693226fecd7c0a5b482a5a66d6e9fd3466571861
merge/main:
ace00edfe4325570e8c31cde9cf56b2c708c458d
Production:
READY
Final Focused Review:
PASS
Required Fix:
0
Human merge authorization:
received
をpost-merge closeoutへ記録してよい。
Phase 2F:
COMPLETE_PENDING_FULL_VERIFY
は維持。
理由:
project-specific Evidence 4件が残る。
Phase 2GではこのEvidenceを
勝手にclosureしない。
Phase 2F snapshot / digestは変更禁止。

────────────────────────────────────────
5. Non-goal — Evidence promotion
────────────────────────────────────────
Phase 2GはEvidence Phaseではない。
以下を変更しない:
verifiedCases:
[]
project-specific promotion:
NONE
dimensions:
1250×2050 sample_default / unverified
positive pressure provenance:
current state
negative pressure provenance:
current state
floor → Z:
unverified
V0=34 / roughness III:
existing verified state
Batch rowが同じ数値を何度含んでも
Evidenceが増えたことにはならない。
CSV / TSV / JSON import:
trusted Evidence sourceではない。

────────────────────────────────────────
6. Architecture inventory first
────────────────────────────────────────
実装前に確認:
ProjectInput.createProjectInput
ProjectInput.fromPreset
ProjectInput.fromManual
ProjectInput.importPackage
ProjectInput.exportPackage
ProjectInput.windTraceFor
GlassCalc.generateCandidates
GlassCalc.splitCandidates
PresetRegistry
Evidence contract
現在のUI calculation path
をrepository-wide inventory。
新しいBatch calculation engineを
複製実装しない。

────────────────────────────────────────
7. Workspace architecture
────────────────────────────────────────
推奨新module:
project-config/workspace.js
または:
workspace.js
ただし案件非依存。
責務:

* multiple case management
* deterministic validation
* evaluation orchestration
* summary
* export/import
* grouping

非責務:

* glass strength formula
* wind formula
* Evidence promotion
* preset mutation

────────────────────────────────────────
8. Workspace Package v1
────────────────────────────────────────
Project Input Packageとは別のwrapperを作る。
Concept:
{
schemaVersion: 1,
workspaceType: "glass_batch_workspace",
cases: [
{
caseId,
label,
inputPackage
}
]
}
重要:
Workspace JSONには
derived calculation resultを正本として保存しない。
保存するのは入力。
import後:
inputPackage
→ validate / normalize
→ recompute
する。
Resultのstalenessを持ち込まない。

────────────────────────────────────────
9. Project Input Package
────────────────────────────────────────
各caseの入力正本は既存PIP v2。
PIP schemaVersion:
2のまま維持。
Phase 2Gのために
PIP v3へ上げない。
Workspace側が複数PIPを包む。
既存:
v1 migration
v2
future fail-closed
を壊さない。

────────────────────────────────────────
10. Trust semantics
────────────────────────────────────────
ケース追加経路を明確に分離。
A. Add Current Case
現在アプリ内部で生成済みのnormalized PIPを
Workspaceへ追加。
内部trusted stateのsourceKindをそのまま保持してよい。
B. Workspace JSON Import
外部データ。
各caseは既存ProjectInput import boundaryを通す。
import元が:
registered_preset
verified
primary
を名乗っても
外部claimを信用しない。
C. TSV / CSV Paste
外部user input。
常に:
manual / user_input
または
notification_calculation / user_input_unverified
相当として扱う。
TSVから:
registered_preset
verified
Evidence
を生成しない。

────────────────────────────────────────
11. Workspace caseId
────────────────────────────────────────
caseIdはruntime local identifier。
自動生成例:
case-001
case-002
case-003
public repoへ案件固有caseIdをhard-codeしない。
import caseId:
safe pattern
length cap
duplicate reject
を行う。
caseIdを:
filename
drawing number
private document ID
として扱う設計にしない。

────────────────────────────────────────
12. Case label
────────────────────────────────────────
optional labelを許容。
例:
北面 2F A
南面 大開口
VE案-1
これはユーザーruntime dataであり、
repository sourceに保存しない。
Security:
labelはuntrusted string。
HTML:
必ずescape / textContent
CSV:
formula injection neutralization
JSON:
size/length validation
を行う。

────────────────────────────────────────
13. Single-case UI must remain primary
────────────────────────────────────────
現在のSingle Calculatorを壊さない。
Default view:
Single
追加:
Single
Batch / Workspace
の切替。
Single UIの挙動・結果は
Phase 2G前と完全一致させる。
Batch機能のために
existing input IDsやrunCalc contractを大幅変更しない。

────────────────────────────────────────
14. Add Current Case
────────────────────────────────────────
Single calculation結果から:
「Workspaceへ追加」
を可能にする。
追加時:
現在のUI
→ existing Project Input Package
→ normalized package
→ Workspace
とする。
画面表示の丸め値から
入力を再構築しない。
内部raw valuesを使う。

────────────────────────────────────────
15. Duplicate Case
────────────────────────────────────────
Workspace rowを複製できる。
duplicate:
new caseId
same normalized input
resultはrecompute
label:
optional copy + suffix
元caseをmutationしない。

────────────────────────────────────────
16. Remove / Clear
────────────────────────────────────────
case単体remove
workspace clear
を追加。
clearはbrowser runtime stateだけ。
repository
preset
Evidence
Production data
に影響なし。

────────────────────────────────────────
17. Batch Evaluation
────────────────────────────────────────
全ケースをdeterministicに評価。
各case:
inputPackage
→ existing normalization
→ design pressure
→ area
→ GlassCalc.generateCandidates()
→ splitCandidates()
→ best candidate
Batch evaluatorは既存関数を呼ぶだけ。
Result concept:
{
caseId,
label,
normalizedInput,
designPressure,
area,
recommendedCandidate,
okCount,
ngCount,
outOfScopeCount,
status
}
status:
OK
NO_SOLUTION
INVALID
必要なら:
OUT_OF_SCOPE_PRESENT
は別flagにする。
Out-of-scope candidateを
recommendedへ昇格しない。

────────────────────────────────────────
18. Error isolation
────────────────────────────────────────
1 rowがinvalidでも
他rowの計算を止めない。
row-level:
INVALID
error message
として表示。
ただしimport package全体が:
oversized
malformed
unsafe
の場合はfail closed。
Batch execution全体で
silent skipしない。

────────────────────────────────────────
19. Summary
────────────────────────────────────────
Workspace上部へ最低限:
Total cases
OK
No solution
Invalid
Out-of-scopeあり
最大design pressure
最大pane area
を表示。
加えて:
governing case
を出してよい。
governing:
最大designPressure
または
採用候補に対する余裕率最小
のどちらかを選ぶ場合は
定義を明示。
曖昧な「最も危険」表現は使わない。

────────────────────────────────────────
20. Margin
────────────────────────────────────────
各caseで:
allowablePressure / designPressure
または:
allowablePressure - designPressure
を算定してよい。
表示:
margin ratio
margin N/m²
ただし:
設計判断上の追加安全率
とは呼ばない。
単なる計算上の余裕。
designPressure=0等の
invalid/edge caseは既存boundaryに従う。

────────────────────────────────────────
21. Grouping
────────────────────────────────────────
実務向けに結果を集約する。
最低限:
recommended glass configuration
ごとにgrouping。
例:
FL6:
8 cases
Low-E 5 + A + FL5:
14 cases
NO_SOLUTION:
2 cases
optional:
same W×H
same designPressure
same glassType
のgroupingも可。
ただしUIを過剰に複雑化しない。

────────────────────────────────────────
22. Sort / Filter
────────────────────────────────────────
Workspace result tableで:
caseId
label
W
H
area
designPressure
recommended glass
allowablePressure
margin
status
を表示。
sort:
designPressure
area
margin
caseId
filter:
ALL
OK
NO_SOLUTION
INVALID
程度で十分。

────────────────────────────────────────
23. Excel / TSV Paste
────────────────────────────────────────
建築実務でExcelから貼り付けやすい
TSV pasteを追加する。
Phase 2Gで対応するTSV sourceは限定する。
Supported:
manual
notification
Registered presetをTSVから生成しない。
最低column set concept:
case_id
label
mode
width_mm
height_mm
glass_type
extra_factor
manual:
positive_pressure
negative_pressure
notification:
V0
roughness
building_height_m
eaves_height_m
evaluation_height_m
building_type
zone
basis
recurrence_years
building_short_side_m
不要column:
空欄可
modeごとに
required columnをvalidate。

────────────────────────────────────────
24. TSV import semantics
────────────────────────────────────────
mode=manual:
existing manual contractへ変換。
mode=notification:
existing WindInput / ProjectInputへ変換。
TSVの:
designPressure
recommendedGlass
verified
Evidence
等は入力として受け付けない。
Derived result injection禁止。
unknown column:
原則reject
または明示warning + fail row。
silent ignoreしない。

────────────────────────────────────────
25. Limits
────────────────────────────────────────
DoS / accidental huge paste防止。
例:
max cases:
1000
max workspace JSON:
1MB程度
max TSV:
1MB程度
max label length:
100〜200 chars
max columns:
固定schema
max field length:
合理的な上限
実際の値は
existing project limitsと整合を取る。
超過:
fail closed

────────────────────────────────────────
26. Workspace JSON Export / Import
────────────────────────────────────────
Export:
deterministic ordering
schemaVersion
cases
を出す。
Do not export trusted Evidence objects.
Do not export calculated trace/results as authoritative state。
再import後:
recalculate。
Round-trip:
Export
→ Import
→ Evaluate
で数値結果一致。
ただしexternal importなので
trust status downgradeはexisting boundaryに従う。

────────────────────────────────────────
27. CSV Result Export
────────────────────────────────────────
計算結果をCSV出力可能にする。
最低column:
caseId
label
sourceKind
widthMm
heightMm
areaM2
designPressure
glassType
recommendedGlass
allowablePressure
margin
status
CSVはderived report。
Workspace input packageとは別物。

────────────────────────────────────────
28. CSV Formula Injection — Hard requirement
────────────────────────────────────────
ExcelでCSVを開く可能性が高いため、
formula injectionを防ぐ。
untrusted string cellが:
=
+
@
等で始まる場合、
formulaとして実行されないようneutralize。
最低限:
label
caseId
error text
等のstring column。
CSV escaping:
quote
comma
newline
double quote
も正しく処理。
テスト必須。
これはSecurity Hard Gate。

────────────────────────────────────────
29. HTML injection
────────────────────────────────────────
TSV/Workspace labelへ:
<script>
<img onerror=...>
5<Z<40
&
等を入力しても
DOM構造を壊さない。
既存escHtml / textContent boundaryを再利用。
raw innerHTML interpolation禁止。

────────────────────────────────────────
30. Workspace import trust
────────────────────────────────────────
外部Workspace JSONが:
sourceKind:
registered_preset
verificationStatus:
verified
Evidence
verifiedCases
等を含めても
trusted stateへ昇格しない。
可能ならWorkspace schemaは
Evidence fieldそのものを受け付けない。
unexpected:
reject。
ProjectInput.import boundaryを
必ず利用。

────────────────────────────────────────
31. Runtime persistence
────────────────────────────────────────
Phase 2Gでは:
server
DB
cloud storage
account
automatic upload
を追加しない。
localStorageも原則使用しない。
理由:
案件名・寸法等のruntime dataを
ブラウザへ永続化するprivacy contractを
別途設計していないため。
Workspaceはmemory-only。
保存:
explicit Exportのみ。

────────────────────────────────────────
32. Private runtime data
────────────────────────────────────────
Userがruntime labelに案件名を入力すること自体は許容。
ただし:
repository
Run Artifact
tests fixture
README
screenshot/text
へ実案件private labelをコピーしない。
testsでは:
Case A
North-01
Sample-001
等のsynthetic fixtureのみ。

────────────────────────────────────────
33. Acceptance Criteria
────────────────────────────────────────
AC-01 Single Calculator regressionなし。
AC-02 Batch layerが新しい計算formulaを持たない。
AC-03 1 case = existing PIP v2。
AC-04 Workspace Package v1成立。
AC-05 Workspaceはderived resultをauthoritativeに保存しない。
AC-06 Add Current Case成立。
AC-07 Duplicate / Remove / Clear成立。
AC-08 Batch evaluationがrow-isolated。
AC-09 Summary counts正しい。
AC-10 recommended configuration grouping成立。
AC-11 sort / filter成立。
AC-12 TSV Manual import成立。
AC-13 TSV Notification import成立。
AC-14 TSVからtrusted preset / Evidence生成不可。
AC-15 Workspace JSON importはexternal/untrusted boundaryを通る。
AC-16 Workspace round-tripでcalculation結果再現。
AC-17 CSV result export成立。
AC-18 CSV formula injection防止。
AC-19 HTML injection防止。
AC-20 size / row limit fail closed。
AC-21 no localStorage / backend persistence。
AC-22 existing Evidence / Verified Case contract非退行。
AC-23 Phase 2E Wind Trace非退行。
AC-24 PIP v1/v2非退行。
AC-25 README / Run Artifact sync。

────────────────────────────────────────
34. Required regression cases
────────────────────────────────────────
維持:
Miyoshi:
W1250 / H2050 / FL6
≈1756.09756097561
W1500 / H2050
≈1463.4146341463415
Manual:
designP = 1400
Phase 2E:
Er / qBar known answers
Phase 2F:
verifiedCases=[]
Evidence status
trust boundary
を壊さない。

────────────────────────────────────────
35. Batch known-answer test
────────────────────────────────────────
Synthetic workspace:
Case A:
Manual
W1250
H2050
positive 1525
negative -918
FL single
factor 1.0
Case B:
Manual
W1500
H2050
same pressures
を評価。
期待:
Case A
FL6:
OK
Case B
FL6:
NG
existing single-case behaviorと一致。
Batch側で独自数値を固定しない。
Single coreから導出。

────────────────────────────────────────
36. Workspace deterministic behavior
────────────────────────────────────────
同一workspaceを2回evaluate:
同じcase order
同じnormalized input
同じresults
になる。
sorting/filteringは
evaluation resultそのものをmutationしない。

────────────────────────────────────────
37. Import error reporting
────────────────────────────────────────
TSV row error:
line number
case id if safe
field
reason
を出す。
private raw row全体を
error logへ貼り付けない。
JSON import errorも:
必要最小限のreason
のみ。

────────────────────────────────────────
38. Security / Mutation tests
────────────────────────────────────────
必須攻撃:
Workspace JSON: verified claim
Workspace JSON: Evidence injection
TSV: registered_preset injection
TSV: unknown fields
label: HTML payload
label: CSV =HYPERLINK(...)
caseId: formula payload
oversized TSV
1001 rows
prototype pollution __proto__ constructor prototype
derived result spoof
designPressure spoof
recommendedGlass spoof
imported sourceKind spoof
localStorage write

mutation examples:
bypass ProjectInput import trust
imported sourceKind
store result in workspace JSON
remove CSV neutralization
allow unknown TSV columns
remove row cap
use innerHTML raw label

selected mutants must be killed.

────────────────────────────────────────
39. Browser
────────────────────────────────────────
Playwright / browser check:
Single default: unchanged
Switch Batch: works
Add current: 1 case
Duplicate: 2 cases
Remove: 1 case
TSV paste: multiple cases
Evaluate: summary correct
Filter: works
Sort: works
Workspace export/import: works
CSV export: content correct / formula neutralized
Return Single: original calculator works
4 existing modes: all work
page errors: 0
console errors: 0

────────────────────────────────────────
40. Independent Verifier
────────────────────────────────────────
Separate context if available.
Verifier focus:
no duplicated formula
PIP boundary
Workspace import trust
TSV parser
CSV injection
HTML injection
row isolation
size caps
result staleness
round-trip
summary math
Single regression
Wind Trace regression
Evidence regression
browser
privacy
Run Artifact
Findings:
repair within campaign if in scope。
Hard Gate:
STOP

────────────────────────────────────────
41. Hard Gates
────────────────────────────────────────
Quality Debt化禁止:
wrong calculation result
Single regression
trust promotion bypass
Evidence spoof
CSV formula injection
HTML injection
prototype pollution
private data committed
unbounded import
derived result accepted as authoritative
preset mutation
security/privacy failure
FAIL:
BLOCKED

────────────────────────────────────────
42. Non-goals
────────────────────────────────────────
今回はやらない:
database
cloud save
login
multi-user collaboration
server API
automatic spreadsheet sync
Google Sheets connector
BIM/Revit integration
DWG parsing
PDF drawing extraction
manufacturer product DB
automatic verified case creation
private Evidence retrieval
Production deployment

────────────────────────────────────────
43. Wave Plan
────────────────────────────────────────
Wave 0
Fresh Gate
Run Artifact
Phase 2F closeout
baseline
Checkpoint

Wave 1
existing architecture inventory
Workspace contract design
Checkpoint

Wave 2
Workspace Package v1
case lifecycle
evaluation orchestration
summary
Checkpoint

Wave 3
Batch UI
Add Current
Duplicate
Remove
Sort / Filter
Grouping
Checkpoint

Wave 4
TSV paste
Workspace JSON export/import
CSV result export
Checkpoint

Wave 5
security
privacy
CSV formula injection
HTML escaping
prototype pollution
size limits
mutation tests
Checkpoint

Wave 6
full regression
browser
independent verifier
Finding: campaign内repair

Wave 7
README
Run Artifact convergence
Draft PR
Vercel Preview exact head
Completion Report
Human Gate: STOP

────────────────────────────────────────
44. Draft PR
────────────────────────────────────────
最終成果:
OPEN
Draft=true
merged=false
Vercel Preview:
READY / success
exact head
Production:
untouched
Ready:
禁止
merge:
禁止

────────────────────────────────────────
45. Completion Report
────────────────────────────────────────
Run ID:
Task Packet:
Revision:
Digest:
Base:
Final exact head:
Branch:
Draft PR:
Baseline tests:
Final tests:
Single regression:
Miyoshi:
Manual:
Notification:
Imported:
Workspace:
schema
case count
evaluation
Add current:
Duplicate:
Remove:
Clear:
Summary:
Grouping:
Sort/filter:
TSV:
manual
notification
limits
Workspace JSON:
export
import
roundtrip
trust downgrade
CSV:
export
formula-injection mitigation
Security:
HTML:
prototype pollution:
size bounds:
trust:
PIP:
v1/v2
Evidence:
verifiedCases
project promotion
unverified items
Browser:
Vercel Preview:
Quality Debt:
Final Run State:
Documentation Sync Trigger: yes
Vault / Notion sync candidates:
Human Gate:
STOP — Ready / merge / Production authorization required

Phase 2Gでは、**計算式をさらに増やすのではなく、今まで固めた計算コアを実際のガラス表・複数開口検討で使いやすくする**ことを狙います。特にExcelからのTSV貼り付けとCSV結果出力まで入れば、単発の検証ツールから実務の一次チェックツールへかなり近づきます。
