# Task Packet Snapshot — LRP-20260921-GLASS-P2J rev.1

glass_wind_calc_M — Phase 2J Long-Run Campaign
Evidence Closure Gate / Verified Case Promotion Candidate
Run ID:
LR-20260921-GLASS-P2J
Task Packet ID:
LRP-20260921-GLASS-P2J
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
main @ 44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
Previous PR:
#10 MERGED
Suggested branch:
claude/phase2j-evidence-closure-gate
Expected baseline:
npm test >= 500
0 fail
────────────────────────────────────────
0. Objective
────────────────────────────────────────
Phase 2Jの目的は、
現在残っている案件固有の未検証事項を、
「それらしい値だから採用する」
のではなく、
Evidence contractに沿って
何が確認できれば昇格可能か
を機械的・監査可能に判定できる状態にすること。
残る explicit unresolved items:

1. 実際のガラス1枚の見付 W / H
2. 正圧 1297 / 1525 / 1695 / 1729 N/m² の原計算根拠
3. 負圧 918 / 1122 N/m² の原計算根拠
4. 各階 / preset と評価高さ Z の exact mapping

Phase 2Jでは原則として
現在のconfigをverifiedへ昇格させない。
作るのは:
Evidence Observation
→ Evidence Closure Evaluation
→ Promotion Candidate
まで。
Promotion Candidateは:

* 現在のEvidenceではない
* current configではない
* verified caseではない
* 自動適用されない
* importしてtrustを上げることもできない

別Human Gateを通して初めて
将来のpromotion commit候補になる。
────────────────────────────────────────

1. Fresh Gate
────────────────────────────────────────

開始時:
origin/main
44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
working tree:
clean
tracked:
0
untracked:
0
main direct commit:
禁止
npm test:
=500
0 fail
Phase 2I closeoutも記録:
PR #10:
MERGED
final feature/documentation head:
8a5ee0b260b59199057990d33785c0326f3fd879
implementation verification head:
915e11ae54c2094b8b8454b9248214c96b906ca3
merge/main:
44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
Production:
READY
────────────────────────────────────────
2. Run Artifact
────────────────────────────────────────
実装前に:
.agent-run/LR-20260921-GLASS-P2J/
RUN_MANIFEST.md
TASK_PACKET_SNAPSHOT.md
RUN_STATE.md
TASK_QUEUE.md
QUALITY_DEBT.md
DECISIONS.md
EVIDENCE.md
を作成。
Task Packet exact bodyをsnapshot。
SHA-256 digest binding。
Resume時:
rehash。
Mismatch:
BLOCKED。
────────────────────────────────────────
3. Protected existing truth
────────────────────────────────────────
Phase 2J開始時の正本:
verifiedCases:
[]
project-specific promotion:
NONE
V0:
34 m/s
verified / primary
roughness:
III
verified / primary
positive pressures:
1297 / 1525 / 1695 / 1729
partially_verified / indirect
negative pressures:
918 / 1122
partially_verified / indirect
dimensions:
1250 × 2050
sample_default / unverified
H=2050:
既存資料ではACW全体高さに類する記録候補があるが、
ガラス見付高さと同一とは確認されていない。
絶対に:
1250×2050をverified pane dimensionsへ
勝手に昇格しない。
また:
法的V0=32
と
案件config V0=34
を混同しない。
Phase 2JでV0=34を32へ変更しない。
────────────────────────────────────────
4. Privacy boundary
────────────────────────────────────────
Public repositoryであることを最優先する。
禁止:
private Drive URL
Notion URL
file ID
document ID
private source filename
内部path
担当者氏名
token
credential
private document title
をrepoへ保存すること。
一次資料を確認できる場合でも:
private referenceそのものは
repositoryへ保存しない。
保存可能なのはpublic-safeな事実のみ。
例:
checkedAt
evidence level
privateReferenceAvailable=true
public-safe description
candidate numeric value
public-safe validated sourceReference
Private evidenceを作業中に扱う場合:
repository root外で一時的に扱う。
repoへcopyしない。
────────────────────────────────────────
5. New generic module
────────────────────────────────────────
推奨:
project-config/evidence-closure.js
案件非依存。
責務:

* Evidence Observation validation
* public-safe boundary
* current factとのreconciliation
* closure readiness evaluation
* blocker reason generation
* Promotion Candidate generation
* deterministic export model

非責務:

* current config mutation
* verifiedCases mutation
* registry mutation
* Evidence Ledger mutation
* project preset mutation
* source file parsing
* OCR
* document storage
* network access

────────────────────────────────────────
6. Evidence Observation v1
────────────────────────────────────────
Concept:
{
schemaVersion: 1,
observationType: "evidence_closure_observation",
factKey: "...",
observedValue: ...,
evidence: {
level: "primary" | "indirect" | "none",
checkedAt: "YYYY-MM-DD" | null,
privateReferenceAvailable: boolean,
publicSourceReference: ... | null
},
publicNote: string | null
}
This is:
reviewer observation / attestation candidate
であり、
Evidence Ledger entryではない。
`verified`というstatusを持たせない。
────────────────────────────────────────
7. Allowed closure fact keys
────────────────────────────────────────
arbitrary factKey禁止。
Phase 2J対象は明示allowlist。
例:
pane_visible_dimensions
positive_pressure_preset
negative_pressure_preset
floor_evaluation_height_mapping
必要なら粒度を分割してよい。
ただし:
A_102_pdf
Drawing_03
VendorSheetX
等、
private filename由来keyを許可しない。
────────────────────────────────────────
8. Fact-specific value schema
────────────────────────────────────────
各factKeyはstrict schema。
pane_visible_dimensions:
{
widthMm,
heightMm
}
positive_pressure_preset:
{
"1F": ...,
"2F": ...,
...
}
既存configに存在するfloor allowlistだけ。
negative_pressure_preset:
{
general,
corner
}
または現在のcanonical zone keys。
floor_evaluation_height_mapping:
[
{
floor,
evaluationHeightM,
positivePressurePresetKey
}
]
等。
既存domain modelをinventoryしてからexact schemaを決定。
未知field:
reject。
────────────────────────────────────────
9. No hidden inference
────────────────────────────────────────
絶対に禁止:
階高からZを推定
建物高さからfloor Zを推定
preset圧力からZを逆算
qbar≈510だからmappingを決める
1250×2050からpane寸法を確定
図面ラベルから自動昇格
Observationは
Evidenceで確認された明示値だけ。
────────────────────────────────────────
10. Observation trust
────────────────────────────────────────
Observationを渡しただけではtrustを上げない。
ユーザーが:
level: primary
privateReferenceAvailable: true
と書いたとしても、
current configをverifiedにしない。
Phase 2Jが返してよいのは:
candidate readiness
だけ。
言葉も区別する。
禁止:
VERIFIED
PROMOTED
APPROVED
をObservation結果として使う。
推奨:
BLOCKED
INSUFFICIENT_EVIDENCE
MISMATCH
MATCH
READY_CANDIDATE
────────────────────────────────────────
11. Reuse Phase 2F contracts
────────────────────────────────────────
Evidence validationを再実装しない。
既存:
project-config/evidence.js
EvidenceLedger
reconciliation contracts
public primary source reference validator
promotion gate
をinventoryして再利用。
Phase 2J側に:
checkedAt validator
public URL validator
private-provider denylist
verified-status rules
をcopyしない。
────────────────────────────────────────
12. Reconciliation order
────────────────────────────────────────
Evidence first.
Value second。
既存Phase 2F原則を維持:
Evidence不十分
+
数値完全一致
でも:
MATCHではなく
INSUFFICIENT_EVIDENCE
または既存canonical equivalent。
「値が合った」
≠
「Evidenceが足りる」。
────────────────────────────────────────
13. Closure Evaluation
────────────────────────────────────────
API concept:
evaluateClosure({
currentConfig,
observations
})
Output concept:
{
status:
"BLOCKED" |
"READY_CANDIDATE",
facts: [
{
factKey,
reconciliationStatus,
evidenceGateStatus,
currentValue,
candidateValue,
blockers
}
],
promotionCandidate: null | {...}
}
Do not mutate `currentConfig`.
────────────────────────────────────────
14. Promotion Candidate
────────────────────────────────────────
Promotion Candidateはpublic-safeな
提案書。
Concept:
{
schemaVersion: 1,
candidateType: "project_evidence_promotion_candidate",
proposedFacts: [...],
gateSummary: {...},
allCriticalFactsSatisfied: boolean
}
Do NOT use:
verificationStatus: "verified"
as current truth.
If needed:
proposedVerificationStatus
と明示する。
────────────────────────────────────────
15. No apply API
────────────────────────────────────────
Phase 2Jで絶対に作らない:
applyPromotionCandidate()
promoteConfig()
setVerified()
updateVerifiedCases()
candidateToPreset()
importPromotionCandidate()
Candidate JSONをbrowserへ貼れば
current configが変わる経路を作らない。
Promotionは将来の
source-code commit + Human Gate
だけで行う。
────────────────────────────────────────
16. Candidate export
────────────────────────────────────────
Candidateは一方向export可。
JSON / Markdown程度。
必ずpublic-safe。
禁止:
private reference
source filename
private URL
local path
Candidate exporterも
builder-created objectだけを受ける
canonical gate方式を推奨。
Phase 2IのWeakSet patternをreuse可能。
────────────────────────────────────────
17. Actual evidence availability gate
────────────────────────────────────────
Phase 2Jの実行中に
一次資料へアクセスできる場合のみ
実案件Observationを作成してよい。
アクセスできない場合:
推測しない。
架空Observationをcurrent project候補として作らない。
結果:
software workflow:
PASS
project closure:
BLOCKED_BY_MISSING_EVIDENCE
promotion:
NONE
として終える。
これは失敗ではない。
正しいEvidence boundaryである。
────────────────────────────────────────
18. Private evidence inspection
────────────────────────────────────────
一次資料が利用可能な場合:
read-onlyで確認。
抽出対象だけ:
pane visible W/H
positive pressure source values
negative pressure source values
floor ↔ evaluation Z ↔ preset mapping
不要な個人情報・プロジェクト情報を
repoへ持ち込まない。
長文引用禁止。
作業結果として保存するのは:
public-safe numeric facts
public-safe evidence status
のみ。
────────────────────────────────────────
19. Mismatch behavior
────────────────────────────────────────
一次資料が現在configと違う場合:
自動修正禁止。
例:
positive pressureが1297ではない
Z mappingが現presetと違う
pane寸法が1250×2050ではない
その場合:
MISMATCH
を返して:
Promotion Candidate:
null
または明示的blocked candidate。
Current configをその場で書き換えない。
別repair phaseが必要。
────────────────────────────────────────
20. Partial closure
────────────────────────────────────────
4項目全部が一度に揃う必要はない。
例:
pane W/H:
MATCH / primary
positive pressure:
MATCH / primary
negative pressure:
INSUFFICIENT
floor Z:
INSUFFICIENT
なら:
fact-level progressは記録する。
しかし:
case-level / project-level promotion:
BLOCKED
のまま。
field verified
≠
case verified。
────────────────────────────────────────
21. Verified Case readiness
────────────────────────────────────────
Promotion Candidateが
verifiedCases候補を提案できる条件:
critical facts全部:
primary Evidence gate PASS
checkedAt valid
reference availability valid
W/H確定
pressure確定
floor/Z mapping確定
case identity/public-safe binding成立
初めて:
case promotion readiness:
READY_CANDIDATE
それでもcurrent:
verifiedCases:
[]
のまま。
────────────────────────────────────────
22. No runtime self-verification UI
────────────────────────────────────────
Public Production UIに:
「verifiedにする」
「一次資料あり」
「承認」
ボタンを追加しない。
ユーザー操作だけでtrustを上げるUIは禁止。
Phase 2Jはdeveloper/reviewer workflowを中心にする。
必要ならUIはread-only:
Evidence Closure Status
のみ。
────────────────────────────────────────
23. Optional read-only status UI
────────────────────────────────────────
実装価値があれば:
案件presetモードに:
Evidence Closure Status
を追加可能。
表示:
Unresolved facts
Current evidence level
What is required
Closure state
ただし:
編集不可
昇格不可
private references非表示
UI側にcurrent statusをhard-codeしない。
project-config metadataから読む。
────────────────────────────────────────
24. Privacy attacks
────────────────────────────────────────
Observation fieldsへ:
Drive URL
Notion URL
Windows path
UNC path
private filename
email
token-like string
HTML/script
control chars
を投入。
publicNote:
public-safe contractを通す。
private-source-specific field自体を
schemaへ持たせない。
JSON/Markdown Candidateに
private markerが出ないこと。
────────────────────────────────────────
25. Trust spoof attacks
────────────────────────────────────────
Observationに:
verificationStatus: "verified"
sourceKind: "registered_preset"
evidenceStatus: "approved"
verifiedCases
promotion: true
等を混入。
Unknown fieldとしてreject。
Candidate JSONに:
currentVerified: true
等をユーザーが注入できないこと。
────────────────────────────────────────
26. Prototype / object boundary
────────────────────────────────────────
Phase 2Iで修復した
inherited-field consumptionを繰り返さない。
Public input objects:
ordinary own-property objectのみ。
Object.create({factKey: ...})
reject。
`{__proto__: ...}`
custom prototype
reject。
JSON own "proto":
unsafe/unknown field
reject。
Object.create(null):
採用するなら明示契約＋test。
────────────────────────────────────────
27. Determinism
────────────────────────────────────────
同じcurrentConfig
同じObservation set
→
同じClosure Evaluation
同じPromotion Candidate
timestampはcanonical modelへ
暗黙追加しない。
checkedAtはObservationの明示値。
────────────────────────────────────────
28. Mutation targets
────────────────────────────────────────
最低限:

* Evidence gateを値一致だけにする
* indirectをprimary扱い
* checkedAt要求削除
* privateReferenceAvailable要求削除
* MISMATCHでもREADY
* unresolved factをcriticalから外す
* floor/Z mapping要求削除
* pane dimensions要求削除
* candidateをcurrent configへapplyするAPI追加
* unknown trust fieldを許可
* private URL/publicNote leak
* custom prototype受理
* verifiedCasesへ直接push
* field verifiedをcase verifiedへ格上げ

Security/trust survivor:
repair。
────────────────────────────────────────
29. Protected regressions
────────────────────────────────────────
Phase 2Jで変更禁止:
calc.js formulas
wind-pressure formulas
Workspace calculations
Review Package calculations
V0=34
roughness III
existing pressure values
existing evidence status
unless別Evidence Promotion Human Gateが発生した場合のみ
別commitへ切り出す。
Protected numbers:
FL6 1250×2050:
1756.09756097561
FL6 1500×2050:
1463.4146341463415
Manual:
1400
Er:
0.8516557589672942
qBar:
503.08024004410464
────────────────────────────────────────
30. Acceptance Criteria
────────────────────────────────────────
AC-J01
Fresh Gate PASS
AC-J02
Evidence Closure Observation v1成立
AC-J03
strict fact allowlist
AC-J04
fact-specific schema
AC-J05
private reference非保持
AC-J06
Phase2F Evidence contract reuse
AC-J07
Evidence-first reconciliation
AC-J08
value matchだけではpromotion不可
AC-J09
MISMATCH fail closed
AC-J10
partial closure可能
AC-J11
project promotion non-mutating
AC-J12
no apply/import promotion API
AC-J13
Promotion Candidate public-safe
AC-J14
candidate deterministic
AC-J15
custom prototype rejection
AC-J16
trust spoof rejection
AC-J17
current verifiedCases unchanged
AC-J18
current preset status unchanged
AC-J19
calculation regressionなし
AC-J20
Review/Batch/Profile regressionなし
AC-J21
actual evidence availabilityを正直に記録
AC-J22
private evidence unavailableならpromotion NONE
AC-J23
README/documentation sync
AC-J24
independent verifier
AC-J25
Draft PR / Human Gate STOP
────────────────────────────────────────
31. Wave Plan
────────────────────────────────────────
Wave 0:
Fresh Gate
Phase2I closeout
Run Artifact
baseline
Wave 1:
Evidence architecture inventory
4 unresolved fact model
privacy boundary
Wave 2:
evidence-closure.js
Observation contract
strict schemas
Wave 3:
reconciliation
Closure Evaluation
Promotion Candidate
one-way export
Wave 4:
actual Evidence availability attempt
public-safe candidate generation if possible
read-only status UI only if useful
Wave 5:
security
privacy
trust spoof
prototype
mutation
Wave 6:
full regression
independent verifier
repair
Wave 7:
README
Run Artifact convergence
Draft PR
Preview
Completion Report
Human Gate:
STOP.
────────────────────────────────────────
32. Independent Verifier
────────────────────────────────────────
別context / read-only。
重点:

* runtimeでtrust promotion不能
* Evidence-first ordering
* no project-specific guessing
* no private reference leakage
* no duplicated Evidence gate
* partial closure semantics
* MISMATCH handling
* critical fact completeness
* candidate non-mutating
* no apply API
* no candidate import-to-trust
* prototype boundary
* current verifiedCases unchanged
* current config unchanged
* calculation regressions
* Run Artifact honesty

Findings:
同Campaign内修復。
Hard Gate:
BLOCKED。
────────────────────────────────────────
33. Final state rules
────────────────────────────────────────
If workflow implementation succeeds
but actual primary Evidence is unavailable:
Final Run State:
COMPLETE_PENDING_FULL_VERIFY
Project promotion:
NONE
verifiedCases:
[]
Explicit unresolved:
4
or fewer only if genuinely closed by reviewed evidence.
Do not fake closure to obtain COMPLETE_VERIFIED。
────────────────────────────────────────
34. Draft PR
────────────────────────────────────────
End state:
OPEN
Draft=true
merged=false
Vercel Preview:
READY / exact head
Production:
main @
44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
unchanged.
No Ready。
No merge。
No Production。
────────────────────────────────────────
35. Completion Report
────────────────────────────────────────
Return:
Run ID
Task Packet
Digest
Base
Implementation verification head
Final artifact head
Draft PR
Tests
Browser if UI changed
Evidence Closure module:
PASS/FAIL
Observation schema:
PASS/FAIL
Fact keys:
list
Actual Evidence availability:
AVAILABLE / PARTIAL / UNAVAILABLE
For each unresolved fact:
pane dimensions:
status
positive pressure source:
status
negative pressure source:
status
floor/Z mapping:
status
Closure status:
BLOCKED / READY_CANDIDATE
Promotion Candidate:
generated / none
Current config mutated:
NO
verifiedCases:
[]
Promotion:
NONE
Private references in repo:
0
Trust spoof:
PASS
Prototype:
PASS
Mutation:
counts/scopes
Protected calculations:
MATCH
Quality Debt
Final Run State
Documentation Sync Trigger:
yes
Human Gate:
STOP — any actual Evidence promotion requires separate authorization
