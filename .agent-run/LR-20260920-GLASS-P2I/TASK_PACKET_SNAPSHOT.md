# Task Packet Snapshot — LRP-20260920-GLASS-P2I rev.1

glass_wind_calc_M — Phase 2I Long-Run Campaign
Design Review Package / Decision Report
Run ID:
LR-20260920-GLASS-P2I
Task Packet ID:
LRP-20260920-GLASS-P2I
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
main @ 6a5232f65d02e2a8bfa8c2c87049b5865c584855
Previous PR:
#9 MERGED
Suggested branch:
claude/phase2i-design-review-package
Expected baseline:
npm test >= 398
0 fail
────────────────────────────────────────
0. Objective
────────────────────────────────────────
Phase 2Iでは、
Single Calculator
Batch Workspace
Runtime Project Profile
Scenario Matrix
までに確立した計算・入力・trust boundaryを一切崩さず、
現在の検討結果を
「設計レビューで読める・印刷できる・比較できる資料」
へ変換する。
追加する中心機能:
Design Review Package
レビューPackageは:

* 計算入力の正本ではない
* Project Input Packageではない
* Workspace Packageではない
* Evidenceではない
* 承認記録ではない

現在のWorkspace状態から生成する
derived review snapshot。
新しい構造計算ロジックは一切持たない。
────────────────────────────────────────

1. Fresh Gate
────────────────────────────────────────

開始時:
origin/main
6a5232f65d02e2a8bfa8c2c87049b5865c584855
working tree:
clean
tracked:
0
untracked:
0
main direct commit:
禁止
npm test:
expected:
=398
0 fail
実測をRun Artifactへ記録。
不一致:
STOP。
────────────────────────────────────────
2. Run Artifact
────────────────────────────────────────
実装前に:
.agent-run/LR-20260920-GLASS-P2I/
RUN_MANIFEST.md
TASK_PACKET_SNAPSHOT.md
RUN_STATE.md
TASK_QUEUE.md
QUALITY_DEBT.md
DECISIONS.md
EVIDENCE.md
を作る。
Task Packet exact bodyをsnapshot。
SHA-256 digestでbinding。
Resume時:
rehash。
Mismatch:
BLOCKED。
────────────────────────────────────────
3. Phase 2H post-merge closeout
────────────────────────────────────────
Phase 2H:
PR #9:
MERGED
final feature head:
371be899cc1866669545698b9aeaa125e324beb1
implementation verification head:
5838141954d73e0d5463f21810e62c24df573a82
README + artifact convergence:
51762c3d4857617b1756ae5261dddc6c85308c3b
merge/main:
6a5232f65d02e2a8bfa8c2c87049b5865c584855
Production:
READY
Final Focused Review:
PASS
Required Fix:
0
Human merge authorization:
received
tests:
398 / 0
browser:
130 / 0
を記録。
Phase 2Hのsnapshot/digestは変更禁止。
────────────────────────────────────────
4. Evidence boundary
────────────────────────────────────────
Phase 2IもEvidence Phaseではない。
必ず維持:
verifiedCases:
[]
project_specific_promotion:
NONE
explicit_unverified_items:
4
dimensions:
1250 × 2050
sample_default / unverified
階別正圧:
1297 / 1525 / 1695 / 1729
負圧:
918 / 1122
floor → Z:
unverified
Review Package生成によって
verification statusを上げない。
レポートに100回出力しても
Evidenceは増えない。
────────────────────────────────────────
5. Architecture inventory first
────────────────────────────────────────
実装前に必ずinventory:
WorkspaceCore.evaluateWorkspace
WorkspaceCore.summarize
WorkspaceCore.groupByRecommended
WorkspaceCore.serializeWorkspace
ProjectInput.windTraceFor
ProjectInput.serialize
ProjectProfile.describeEffectiveInput
Evidence / reconciliation UI/data paths
existing CSV export
を確認。
Report builderが
GlassCalc formulaやWindPressure formulaを
再実装しないこと。
────────────────────────────────────────
6. New module
────────────────────────────────────────
推奨:
review-package.js
責務:

* review snapshot construction
* report sections
* case selection
* comparison
* safe text export
* deterministic review JSON
* print model

非責務:

* strength calculation
* wind calculation
* candidate generation
* Evidence promotion
* Workspace mutation
* Project Profile mutation

────────────────────────────────────────
7. Review Package v1
────────────────────────────────────────
Concept:
{
schemaVersion: 1,
reportType: "glass_design_review",
metadata: {
title,
subtitle?,
note?
},
sourceSummary: {...},
summary: {...},
cases: [...],
diagnostics: [...],
groups: [...],
governingCase: ...,
evidenceSummary: ...,
selectedDetails: [...]
}
これはreport snapshot。
Project Inputとしてimportできない。
Workspaceとしてimportできない。
────────────────────────────────────────
8. No report import
────────────────────────────────────────
Phase 2Iでは:
deserializeReviewPackage
importReviewPackage
loadReportAsWorkspace
等を作らない。
Review JSONは一方向export。
Reportに:
designPressure
recommendedGlass
allowablePressure
等のderived resultが含まれていてよい。
ただし、それを入力へ戻す経路は作らない。
テスト:
Review Package JSON
→ Workspace import
はrejectされること。
────────────────────────────────────────
9. Source must be re-evaluated
────────────────────────────────────────
Report生成時:
Workspace authoritative inputs
→ WorkspaceCore.evaluateWorkspace()
を再実行。
既存画面の丸め表示値を
Report sourceにしない。
Report builder側で
designPressureやcandidateを再計算しない。
────────────────────────────────────────
10. Summary section
────────────────────────────────────────
最低限:
Total cases
OK
NO_SOLUTION
INVALID
out-of-scope present
max design pressure
max pane area
Recommended configuration grouping
Governing case
を表示。
governing definitionは
Phase 2Gと完全に同じ。
曖昧な:
最も危険
安全率
という語を新たに使わない。
────────────────────────────────────────
11. Important interpretation warning
────────────────────────────────────────
Reportの目立つ位置に:
「OKは、この入力条件と本ツールの算定契約上で
候補が成立したことを示すものであり、
設計承認・製品採用承認・原典照合完了を意味しない」
旨を表示。
特に:
unverified input
imported data
runtime profile
の場合は明示。
────────────────────────────────────────
12. Case table
────────────────────────────────────────
全caseの一覧:
caseId
label
sourceKind
verification status
W
H
area
design pressure
glass type
recommended configuration
allowable pressure
margin ratio
margin pressure
status
を含む。
INVALID diagnosticも
専用行として含める。
ただし計算値はnull/blank。
────────────────────────────────────────
13. Selected detail cases
────────────────────────────────────────
すべてのcaseを詳細trace化すると
1000件で巨大になる。
Reportには:
summary:
全件
detail:
選択caseのみ
と分ける。
UIで:
detail対象caseを選択。
最低限:
Select none
Select governing
Select all OK
手動check
を提供してよい。
上限:
detail case 50程度
など合理的capを設ける。
────────────────────────────────────────
14. Detailed case section
────────────────────────────────────────
detail caseでは:
Input:
W/H
source kind
extra factor
Wind:
positive/negative/design pressure
Notification caseなら:
V0
roughness
H
Z
building type
zone
basis
既存:
ProjectInput.windTraceFor()
のtraceを表示。
Glass:
recommended candidate
allowable pressure
margin
を表示。
Report builder自身が式を計算しない。
────────────────────────────────────────
15. Trace provenance
────────────────────────────────────────
Notification calculation:
formula verification:
verified_primary_source
input verification:
user_input_unverified
を別々に表示。
この2つを:
"verified"
という単一badgeへ統合しない。
────────────────────────────────────────
16. Registered preset evidence section
────────────────────────────────────────
registered preset caseが含まれる場合:
Evidence status
Reconciliation status
を表示してよい。
ただしPhase 2Fの既存contractを再利用。
以下をreport側で再定義しない:
verified
partially_verified
unverified
MATCH
MISMATCH
INSUFFICIENT_EVIDENCE
MATCH != verified
を維持。
────────────────────────────────────────
17. Runtime Profile status
────────────────────────────────────────
Profile-generated case:
notification_calculation
unverified
として表示。
Reportに:
Runtime Project Profile:
Unverified User Input
を表示してよい。
Profileの利用回数から
verifiedへ変えない。
────────────────────────────────────────
18. Comparison view
────────────────────────────────────────
2つの有効caseを選んで
差分比較できるようにしてよい。
比較項目:
W/H
area
design pressure
recommended configuration
allowable pressure
margin ratio
margin pressure
sourceKind
差分:
B - A
を表示。
ただし:
better
worse
safer
winner
等の自動評価はしない。
事実の差分のみ。
────────────────────────────────────────
19. Review metadata
────────────────────────────────────────
runtime metadataとして:
Report title
Subtitle optional
Note optional
を許容。
これらはuser data。
repositoryへ保存しない。
localStorageへ保存しない。
explicit report export内には含まれてよい。
────────────────────────────────────────
20. Privacy mode
────────────────────────────────────────
Report生成時に:
Full
Redacted
の2モードを設けることを推奨。
Full:
runtime labelを含む。
Redacted:
Profile label
case label
report subtitle/note
等のfree textを伏せる。
caseIdは
runtime generic IDなら保持可。
Redacted modeは
registered presetのpublicLabelのみ表示可。
Private原典名・URL・IDは
そもそもReport modelへ入れない。
────────────────────────────────────────
21. Print view
────────────────────────────────────────
Browser上に:
Review Report Preview
を追加。
CSS:
@media print
で:
input controls
view tabs
buttons
を非表示にし、
Reportのみ印刷できる。
目的:
ブラウザ標準
「印刷 → PDFとして保存」
でPDF化可能にする。
PDF libraryは追加しない。
────────────────────────────────────────
22. Printable structure
────────────────────────────────────────
印刷順:

1. Title / Report status
2. Interpretation warning
3. Input / trust summary
4. Overall summary
5. Configuration grouping
6. Case table
7. Selected case detail
8. Comparison if selected
9. Evidence / unverified summary
10. Footer

程度。
A4 portrait/landscapeを
CSSで無理に完全固定しなくてよい。
表の改ページ崩れを
ブラウザで確認。
────────────────────────────────────────
23. Markdown export
────────────────────────────────────────
レビュー結果を
設計資料・議事録へ貼り付けられるよう:
Markdown export
を追加してよい。
Markdownはreport output。
入力へ戻す経路なし。
escape対象:
|
`
<
backslash
line break
等。
ユーザー文字列で
Markdown table構造を壊さない。
────────────────────────────────────────
24. Review JSON export
────────────────────────────────────────
Audit用として:
Review Package v1 JSON
をexport。
deterministic key ordering。
Report source snapshot。
No import。
含める:
summary
derived result
trust/status
effective inputs
selected trace data
ただしprivate Evidence referenceは含めない。
────────────────────────────────────────
25. No downloadable active HTML
────────────────────────────────────────
Phase 2Iでは
ユーザー入力を含む standalone HTML file exportを
原則作らない。
理由:
active HTMLとして共有されることで
XSS boundaryが増える。
HTML成果物は:
現在ページのsafe DOM
+
print CSS
に限定。
共有ファイル:
JSON
Markdown
CSV
Print-to-PDF
を使用。
────────────────────────────────────────
26. Snapshot semantics
────────────────────────────────────────
Review Package生成時点でsnapshot。
その後Workspaceが変更されても、
既に生成済みReviewは自動更新しない。
ただし画面に:
「Workspaceが変更されています。Reportを再生成してください」
を表示。
古いReportをsilentに最新扱いしない。
────────────────────────────────────────
27. Stale detection
────────────────────────────────────────
Report生成時にcanonical source snapshotを保持。
例:
WorkspaceCore.serializeWorkspace(workspace)
+
sanitized diagnostic state
をsource signatureとして保持。
Workspace変更後:
現在signature != report source signature
なら:
STALE
表示。
暗黙再生成しない。
────────────────────────────────────────
28. Print stale gate
────────────────────────────────────────
STALE Reportの印刷操作では:
warningを表示。
推奨:
Regenerate Report
を促す。
自動再生成して
ユーザーが見ていたReportを黙って変更しない。
────────────────────────────────────────
29. INVALID diagnostics
────────────────────────────────────────
ReportにはINVALID行を含める。
表示可能:
caseId
safe label
source
line / index
field
sanitized reason
禁止:
raw TSV row
raw JSON object
whole PIP
private path
filename
Phase 2Gのdiagnostic contractを再利用。
────────────────────────────────────────
30. Diagnostic privacy regression
────────────────────────────────────────
Phase 2G verifier F1を必ず非退行確認。
例:
unsupported glassTypeに
案件名・図面番号らしき文字列を入力。
Report:
Preview
Markdown
Review JSON
のどこにも
raw valueが出ないこと。
────────────────────────────────────────
31. Markdown injection
────────────────────────────────────────
label:
| hacked |
heading

```code
<script>
[link](javascript:...)

等を投入。

Markdown exportの
意図した構造を壊さないようescape。

Markdownはレンダラ依存があるため、
active link生成を避ける。

Phase 2Iでは
ユーザー文字列をMarkdown linkとして出さない。

────────────────────────────────────────
32. Print / DOM injection
────────────────────────────────────────

Report previewは:

createElement
textContent

を原則使用。

user/runtime stringsを
innerHTMLへ挿入しない。

必要な静的markupだけ
HTML sourceとして固定。

────────────────────────────────────────
33. Report JSON privacy
────────────────────────────────────────

Review JSONは
ユーザーが明示exportするものなので、
Full modeではruntime labelsを含めてよい。

ただし:

Evidence private reference
Drive URL
Notion URL
internal path
file name
staff identity

をproject-config等から自動収集しない。

Redacted mode:
free-text labelを伏せる。

────────────────────────────────────────
34. No network / persistence
────────────────────────────────────────

Report生成で禁止:

fetch
XHR
sendBeacon
WebSocket
remote template
analytics
server upload

localStorage
sessionStorage
IndexedDB

明示export/printのみ。

────────────────────────────────────────
35. Report size limits
────────────────────────────────────────

1000case Workspaceに対しても
ブラウザを固めない。

Report summary/table:
最大1000case

detail:
cap

trace:
selected detailのみ

Markdown/JSON:
合理的なsize cap

Report note/title:
length cap

を設定。

────────────────────────────────────────
36. Determinism
────────────────────────────────────────

同じWorkspace
同じdiagnostics
同じselection
同じprivacy mode

から生成したReview Packageは
timestamp等を除けばdeterministic。

可能なら:

generatedAt

はReview JSONのcanonical comparisonから除外する、
または明示オプション。

テストで
core review objectのdeterminismを確認。

────────────────────────────────────────
37. Decision wording
────────────────────────────────────────

このReportは:

Review
Comparison
Calculation summary

であって、

Approved
Final
Certified
Design Accepted

を自動で付けない。

人がnoteへそのような文字を書くことはできるが、
tool statusとして発行しない。

────────────────────────────────────────
38. Acceptance Criteria
────────────────────────────────────────

AC-01
Single regressionなし。

AC-02
Batch regressionなし。

AC-03
Profile/Scenario regressionなし。

AC-04
Review Package v1成立。

AC-05
Reviewはderived-only。

AC-06
Review import pathなし。

AC-07
SummaryはWorkspaceCoreと一致。

AC-08
governing definition一致。

AC-09
全case table成立。

AC-10
selected detail成立。

AC-11
Notification trace再利用。

AC-12
formula/input verification分離。

AC-13
Evidence status非退行。

AC-14
two-case factual comparison成立。

AC-15
print preview成立。

AC-16
print CSS成立。

AC-17
Markdown export成立。

AC-18
Review JSON export成立。

AC-19
Redacted mode成立。

AC-20
stale detection成立。

AC-21
diagnostic privacy成立。

AC-22
HTML/Markdown injection防止。

AC-23
no storage/network。

AC-24
Evidence/verifiedCases不変。

AC-25
README / Run Artifact actual sync。

────────────────────────────────────────
39. Protected calculations
────────────────────────────────────────

再確認:

Miyoshi FL6
1250×2050:
1756.09756097561

1500×2050:
1463.4146341463415

Manual:
designP 1400

Notification:

Er:
0.8516557589672942

qBar:
503.08024004410464

Report phaseで
これらを変えない。

────────────────────────────────────────
40. Security attack set
────────────────────────────────────────

Title/note/label:

<script>
<img onerror>
5<Z<40
|
`
# heading
javascript:
file path-looking text
URL-looking text

Diagnostic:

secret-looking invalid value

JSON:

prototype keys

Report selection:

unknown caseId
duplicate caseId
INVALID case selected as detail

Stale:

Workspace mutate after report generation

Redaction:

label remains somewhere unexpectedly

Import:

attempt report JSON through
ProjectInput / Workspace import

must reject or downgrade according to existing boundary。

────────────────────────────────────────
41. Mutation candidates
────────────────────────────────────────

Selected mutants:

- report builder hard-codes summary instead of WorkspaceCore
- report import function added/enabled
- governing definition differs
- user text enters innerHTML
- Markdown escape removed
- diagnostic raw reason leak
- Redacted mode leaves label
- stale comparison removed
- stale report silently auto-refreshes
- detail cap removed
- formula/input verification merged
- imported_unverified displayed as verified
- Review JSON includes private Evidence reference
- network/persistence call added

Security/trust/privacy survivor:
repair。

PATCH-MISSとSURVIVEDは分けて報告。

────────────────────────────────────────
42. Browser
────────────────────────────────────────

Full flow:

Single:
unchanged

Batch:
unchanged

Profile/Scenario:
unchanged

Create Workspace with:
OK
NO_SOLUTION
INVALID
notification case
manual case
imported case

Generate Review.

Verify:

summary
grouping
governing
table

Select governing detail.

Trace appears.

Select 2 cases:
comparison appears.

Full mode:
labels visible.

Redacted:
free labels removed.

Generate Report.

Change Workspace.

Report:
STALE warning.

Regenerate:
fresh.

Print preview:
controls hidden.

Markdown:
escaped.

Review JSON:
valid / derived-only / no import.

storage:
0

network:
0

page errors:
0

console errors:
0

────────────────────────────────────────
43. Independent Verifier
────────────────────────────────────────

別context。

重点:

no duplicated calculation
Review derived-only
report no-import boundary
summary correctness
governing correctness
trace reuse
trust display
Evidence separation
redaction completeness
stale semantics
diagnostic privacy
Markdown injection
DOM injection
size caps
no network/storage
Single/Batch/Profile regressions
Run Artifact honesty

finding:
同Campaign内修復。

Hard Gate:
BLOCKED。

────────────────────────────────────────
44. Hard Gates
────────────────────────────────────────

Quality Debt化禁止:

wrong calculation
wrong governing case
verified/unverified display inversion
Evidence promotion
raw diagnostic leak
Redacted mode leak
XSS
active HTML export
report→input trust path
silent stale report
unbounded detail generation
network/private upload
Single/Batch regression

発生:
BLOCKED。

────────────────────────────────────────
45. Non-goals
────────────────────────────────────────

今回はやらない:

server-side PDF generation
PDF library導入
digital signature
approval workflow
電子署名
DB
cloud report storage
account/login
team comments
automatic Notion upload
automatic Google Drive upload
automatic email
BIM/Revit
manufacturer catalog
verified Evidence取得

────────────────────────────────────────
46. Wave Plan
────────────────────────────────────────

Wave 0:
Fresh Gate
Run Artifact
Phase 2H closeout
baseline

Wave 1:
architecture inventory
Review Package contract
privacy contract

Wave 2:
review-package.js
snapshot
summary
case table
detail selection

Wave 3:
comparison
Evidence/trust display
Markdown
JSON

Wave 4:
Review UI
print view
print CSS
redacted mode
stale warning

Wave 5:
security
privacy
injection
mutation
size limits

Wave 6:
full regression
browser
independent verifier
repair

Wave 7:
README
Run Artifact convergence
Draft PR
Vercel Preview exact head
Completion Report

Human Gate:
STOP。

────────────────────────────────────────
47. Draft PR
────────────────────────────────────────

成果:

OPEN
Draft=true
merged=false

Vercel Preview:
READY / exact head

Production:
main @
6a5232f65d02e2a8bfa8c2c87049b5865c584855

のまま。

No Ready。
No merge。
No Production。

────────────────────────────────────────
48. Completion Report
────────────────────────────────────────

Run ID:
Task Packet:
Revision:
Digest:

Base:
Implementation verification head:
Final artifact head:
Draft PR:

Tests:
baseline 398
final

Review Package:
schema
derived-only
no-import

Summary:
PASS/FAIL

Case table:
PASS/FAIL

Governing:
PASS/FAIL

Detail:
selected count
trace

Comparison:
PASS/FAIL

Trust:
sourceKind
verification status
formula/input split

Evidence:
verifiedCases
promotion
explicit unverified

Privacy:
Full
Redacted

Diagnostics:
privacy

Markdown:
export
injection

Review JSON:
export
no import

Print:
preview
print CSS

Stale:
detection
warning
regeneration

Security:
HTML
prototype
network
storage

Mutation:
selected
survivors
repairs
PATCH-MISS separately

Single regression:
Batch regression:
Profile regression:
Wind regression:
PIP:

Browser:
Vercel Preview:

Quality Debt:

Final Run State:

Documentation Sync Trigger:
yes

Human Gate:
STOP — Ready / merge / Production authorization required
