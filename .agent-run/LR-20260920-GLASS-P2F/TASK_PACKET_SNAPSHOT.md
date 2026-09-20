# glass_wind_calc_M — Phase 2F Long-Run Campaign
## Project Evidence Reconciliation & Verified Case Layer

Run ID:
LR-20260920-GLASS-P2F

Task Packet ID:
LRP-20260920-GLASS-P2F

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
main @ a185b4675cac03d501ea6805b449437c3fbbb0fd

Previous PR:
#6 MERGED

Previous Phase:
Phase 2E — Traceable Wind Pressure Trace Engine

Suggested branch:
claude/phase2f-verified-project-cases

Expected baseline:
npm test >= 197
0 fail

────────────────────────────────────────
0. Objective
────────────────────────────────────────

Phase 2Eまでで、

- glass strength core
- Wind Pressure Trace Engine
- Project Input Package v2
- registered preset
- manual
- notification calculation
- imported_unverified
- trust separation
- formula / input verification separation

が成立した。

Phase 2Fでは、新しい計算式を追加することを主目的にしない。

残っているproject-specific Evidenceを
**推測せず・private情報をpublic repoへ漏らさず**
照合できる仕組みを完成させる。

現在のExplicit unverified items:

1. ガラス1枚の実見付 W/H
2. 階別正圧 1297 / 1525 / 1695 / 1729 の元計算根拠
3. 負圧 918 / 1122 の元計算根拠
4. 各階評価高さ Z とpresetのexact mapping

これらについて、

Evidenceがある項目だけ
verified / partially_verifiedへ正しく昇格し、

Evidenceがない項目は
unverifiedのまま維持する。

同時に、任意案件でも再利用できる

Project Evidence Ledger
+
Verified Project Case

のgeneric boundaryを導入する。

────────────────────────────────────────
1. Fresh Gate
────────────────────────────────────────

開始時:

origin/main
==
a185b4675cac03d501ea6805b449437c3fbbb0fd

working tree clean
tracked changes = 0
untracked files = 0

main direct write禁止。

baseline:

npm test

expected:
197 tests以上
0 fail

実測をRun Artifactへ記録。

不一致:
STOP

────────────────────────────────────────
2. Canonical Long-Run Route
────────────────────────────────────────

開始時に可能なら:

Long_Run_Development_Route.md
Long_Run_Task_Packet.md
Implementation_Task_Prompt.md
Claude_Code_Capability_Tier_Orchestration.md
Documentation_Sync_Handoff.md

を読む。

repository instructions / README / direct dependencies / testsも読む。

Vaultへ書き込まない。
Notionへ直接書き込まない。

────────────────────────────────────────
3. Run Artifact — implementation前
────────────────────────────────────────

.agent-run/LR-20260920-GLASS-P2F/

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
working branch

へbinding。

resume時:
rehash

mismatch:
BLOCKED

────────────────────────────────────────
4. Phase 2E post-merge closeout
────────────────────────────────────────

Phase 2E:

.agent-run/LR-20260919-GLASS-P2E/

を必要最小限closeoutしてよい。

記録:

PR #6:
MERGED

final feature head:
dab2105b15f9da9a4d858cc6439ed863fae360fa

merge/main:
a185b4675cac03d501ea6805b449437c3fbbb0fd

Production:
READY

Final Focused Review:
PASS

Required Fix:
0

Human merge authorization:
received

Phase 2E Final State:

Explicit unverified items 4件が残るため
COMPLETE_PENDING_FULL_VERIFY
を維持。

TASK_PACKET_SNAPSHOT.md
Task Packet digest

は変更禁止。

もしPhase 2F終盤で4件すべてが
direct Evidenceにより本当に解消された場合のみ、
Phase 2Eのpost-closeout stateを再評価してよい。

推測closure禁止。

────────────────────────────────────────
5. Privacy / Evidence Boundary — 最重要
────────────────────────────────────────

Repositoryはpublic。

private Evidenceそのものを
repositoryへ保存してはならない。

禁止:

private Drive URL
private file ID
SharePoint URL
private Notion URL
internal file path
private filename
drawing number that identifies confidential material
staff name
client formal identity
building formal confidential identity
session ID
credential
secret
raw private document excerpt
private screenshot
private document hash that functions as an identifier

Run Artifactも同じ。

public repoへ保存してよいもの:

public-safe derived fact
verification status
evidence level
checkedAt
public-safe description
privateReferenceAvailable boolean
generic source category

例:

evidence: {
  level: "primary",
  checkedAt: "YYYY-MM-DD",
  publicDescription:
    "案件一次資料でガラス見付寸法を直接確認",
  privateReferenceAvailable: true
}

private documentの名前やURLは書かない。

────────────────────────────────────────
6. Allowed Evidence Sources
────────────────────────────────────────

Evidenceは以下からのみ採用。

A.
Humanが明示的に提供したprivate Evidence

B.
このexecution environmentへ明示的に渡された
local/private Evidence

C.
repositoryに既に存在するpublic-safe verified fact

D.
公式public source
（generic formula等）

禁止:

記憶
推測
逆算のみ
ファイル名からの推定
図面全体寸法からpane寸法を推定
列ピッチからpane寸法を推定
preset値からZをreverse solveしてEvidence扱い

Reverse calculationは:

diagnostic

としては可。

Evidence:
不可。

────────────────────────────────────────
7. First Step — Existing architecture inventory
────────────────────────────────────────

新moduleを作る前に必ず確認:

existing:
validateVerifiedCase()
verifiedCases
Evidence factory
promotion guard
verificationStatus
privateReferenceAvailable
getPublicLabel()
Project Input Package
preset registry

をrepository-wide search。

既存contractを重複実装しない。

特に:

project-config/miyoshi.js

に既にある
validateVerifiedCase()
verifiedCases

を確認。

必要ならgeneric moduleへ抽出してよいが、
不用意なlarge refactorはしない。

────────────────────────────────────────
8. Generic Project Evidence Ledger
────────────────────────────────────────

案件factをfield-levelで管理できる
generic Evidence Ledgerを導入する。

推奨module:

project-config/evidence-ledger.js

または同等のboundary。

最低限扱うfact type:

pane_width_mm
pane_height_mm
positive_pressure
negative_pressure
evaluation_height
floor_height_mapping
building_height
eaves_height
V0
roughness_category

ただしMiyoshi固有キーを
generic moduleへhard-codeしない。

Ledger entry概念:

{
  factKey,
  value,
  unit,
  verificationStatus,
  evidence: {
    level,
    checkedAt,
    publicDescription,
    privateReferenceAvailable
  }
}

verificationStatus:

verified
partially_verified
unverified

existing enumを再利用。

────────────────────────────────────────
9. Promotion Gate
────────────────────────────────────────

verifiedへ昇格できる条件を
コードでfail closedにする。

最低条件:

verificationStatus === "verified"

なら:

evidence.level === "primary"

AND

checkedAt valid YYYY-MM-DD

AND

privateReferenceAvailable === true
OR
public primary source referenceが安全に保持されている

こと。

existing promotion guardと矛盾させない。

Evidence descriptionだけでverifiedにできない。

"Human said probably correct"
"numerically close"
"notification calculation approximately reproduces"

だけではverified不可。

────────────────────────────────────────
10. Partial Evidence vs Verified Case
────────────────────────────────────────

field-level factがverifiedでも、
case全体をverifiedにしてよいとは限らない。

例:

W/Hだけprimary確認済み

pressure origin:
unverified

Z mapping:
unverified

の場合:

dimension facts:
verified

case:
NOT VERIFIED

とする。

verifiedCasesに入れるのは
case-level required fieldsがすべて
promotion gateを通ったものだけ。

────────────────────────────────────────
11. Generic Verified Project Case
────────────────────────────────────────

既存validateVerifiedCase()を
必要に応じてgeneric化する。

推奨concept:

{
  caseId,
  projectId,

  dimensions: {
    widthMm,
    heightMm,
    evidence
  },

  windContext: {
    floorKey,
    zoneKey,
    evaluationHeightM,
    positivePressure,
    negativePressure,
    evidence
  },

  glassType,
  extraFactor,

  verificationStatus,
  evidence
}

実際のshapeは
existing codeとの整合を優先して調整してよい。

重要:

case-level verifiedには
critical fields全てがverified必要。

critical:

widthMm
heightMm
pressure source
positive / negative pressure
floor / zone mapping
evaluationHeight if calculation provenance requires it

────────────────────────────────────────
12. Pane Dimensions Rule
────────────────────────────────────────

現在:

1250 × 2050

は

sample_default / unverified。

Evidenceなしに変更禁止。

特に禁止:

CW overall H = 2050
→ pane height = 2050

列全体幅 / 列数
→ pane width

として推定。

一次資料が
「ガラス1枚の見付寸法」
を直接示す場合のみ
pane dimensionをverifiedにできる。

さらに、

1つのpane寸法を確認したからといって
project-wide defaultに昇格させない。

確認対象を:

verified case-specific dimension

として保持するのを基本とする。

────────────────────────────────────────
13. Pressure Evidence Reconciliation
────────────────────────────────────────

existing Miyoshi preset:

positive:
1F 1297
2F 1525
3F 1695
RF 1729

negative:
general 918
corner 1122

Phase 2E calculated traceと近いことだけでは
verifiedにしない。

pressureをverifiedへ昇格する条件:

A.
一次資料にそのpressure値が直接記載

または

B.
一次資料に以下の元inputが直接記載され、
Phase 2E Wind Pressure Trace Engineで
その値を再現できる:

V0
roughness
building/eaves height
evaluation Z
building type
zone
calculation basis
必要な係数選択

かつ、
sourceとの対応関係が明示される。

単なるreverse solve:
不可。

────────────────────────────────────────
14. Z Mapping Reconciliation
────────────────────────────────────────

現在未確認:

1F
2F
3F
RF

→

evaluation height Z

mapping。

推測禁止。

floor height
階高
建物高さ

だけから自動生成しない。

Evidenceが得られた場合:

mapping ledger:

floorKey
evaluationHeightM
verificationStatus
evidence

として保持。

Phase 2E notification modeの
user inputとは分離する。

────────────────────────────────────────
15. Reconciliation Engine
────────────────────────────────────────

project Evidenceと
existing presetを比較する
read-only diagnosticを実装してよい。

例:

preset value
evidence-backed value
difference
difference %
status

status例:

MATCH
MISMATCH
INSUFFICIENT_EVIDENCE

ただし:

MATCH
≠ verified

Evidence Gateと数値一致を混同しない。

automatic preset replacement:
禁止。

────────────────────────────────────────
16. Preset Update Rule
────────────────────────────────────────

Miyoshi presetの既存値を変更する場合、
最低条件:

direct Evidence
+
promotion guard
+
regression test
+
explicit diff explanation

が必要。

Evidenceが既存値と一致:
statusだけ昇格可能。

Evidenceが既存値と不一致:
自動変更禁止。

MISMATCHとして
Human Gateへ送る。

特にpressure mismatchは
Human確認前にpresetを書き換えない。

────────────────────────────────────────
17. verifiedCases
────────────────────────────────────────

現在:

verifiedCases: []

であることを確認する。

Evidenceがfull caseを成立させる場合のみ
caseを追加。

caseIdはpublic-safe:

case-001
case-002

等。

private sheet nameや
drawing numberをcaseIdに使わない。

Evidenceが足りなければ:

verifiedCases: []

のままでよい。

「空だから何か埋める」
ことを目的にしない。

────────────────────────────────────────
18. UI
────────────────────────────────────────

Miyoshi preset modeへ
Evidence statusを明確に表示する。

最低限:

Project preset:
Partially Verified

Dimensions:
Sample default / Unverified

Wind preset:
Partially Verified

V0:
Verified

Roughness:
Verified

など。

Verified Casesが1件以上存在する場合のみ:

Verified Case selector

を表示してよい。

verified caseを選ぶと:

W/H
floor
zone

等のverified値を入力へ反映。

ただし通常sample defaultと
verified caseを混同しない。

0件の場合:
fake selectorを作らない。

────────────────────────────────────────
19. Trust Boundary
────────────────────────────────────────

external imported packageから:

verified case
Evidence Ledger verified entry
registered preset verified state

を生成できないこと。

imported JSONに:

verificationStatus: verified
evidence.level: primary
privateReferenceAvailable: true

が書かれていても
trusted Evidenceとして受理しない。

built-in repository code
+
Human-reviewed Evidence promotion

だけがtrusted path。

────────────────────────────────────────
20. Project Input Package
────────────────────────────────────────

可能な限りPIP v2を維持。

Verified Case機能のためだけに
即schemaVersion 3へ上げない。

case identityをpackageへ含める必要が
明確に生じた場合のみv3を検討。

v3へ上げる場合:

v1 import
v2 import
deterministic migration
future version fail closed

を必須。

不要なら変更しない。

────────────────────────────────────────
21. Acceptance Criteria
────────────────────────────────────────

AC-01
Private Evidenceがpublic repoへ入らない。

AC-02
Existing Evidence contractsをinventoryし、
重複実装しない。

AC-03
Generic Evidence Ledgerがfield-level factを
verification status付きで表現できる。

AC-04
verified promotion guardがfail closed。

AC-05
partial verified factsが
case-level verifiedへ自動昇格しない。

AC-06
Verified Project Case validatorが成立。

AC-07
1250×2050 sample defaultを
Evidenceなしにverifiedへ昇格しない。

AC-08
CW overall dimensions / pitchから
pane dimensionを推定しない。

AC-09
Miyoshi pressureを
Phase 2E計算との近似一致だけでverifiedにしない。

AC-10
floor→Z mappingを推測しない。

AC-11
Evidence-backed reconciliation tableを作れる。

AC-12
MATCHとverifiedを明確に分離。

AC-13
Mismatch時にpreset自動更新しない。

AC-14
verifiedCasesはfull promotion gateを通ったcaseだけ。

AC-15
imported dataはverified evidence/caseを作れない。

AC-16
Miyoshi UIでEvidence statusが明確。

AC-17
existing four modes regressionなし。

AC-18
Wind Pressure Trace Engine regressionなし。

AC-19
PIP v1/v2 compatibility維持。

AC-20
README / Evidence / Run Artifact actual sync。

────────────────────────────────────────
22. Tests
────────────────────────────────────────

Baseline:
197+

最低追加:

1.
verified requires primary evidence

2.
verified requires valid checkedAt

3.
verified cannot be created from imported JSON

4.
private URL rejected from publicDescription

5.
private filename/path rejected

6.
partial facts do not create verified case

7.
case missing pane W reject

8.
case missing pane H reject

9.
case missing pressure provenance reject

10.
case missing required Z mapping reject where applicable

11.
sample default not verified

12.
overall CW height does not auto-promote pane H

13.
pitch does not auto-promote pane W

14.
pressure approximate match does not promote

15.
reverse-solved Z does not promote

16.
mismatch does not mutate preset

17.
verifiedCases remains [] if evidence insufficient

18.
verified case accepts complete primary evidence

19.
external import cannot claim verified case

20.
existing Miyoshi regression

21.
notification calculation regression

22.
manual regression

23.
PIP v1/v2 regression

24.
privacy sweep contract

final:
baseline以上
0 fail

────────────────────────────────────────
23. Evidence availability behavior
────────────────────────────────────────

もしprivate Evidenceが
execution environmentから利用できない場合:

Campaign全体を即終了しなくてよい。

以下は進めてよい:

generic Evidence Ledger
promotion guard
Verified Case validator
UI Evidence status
tests
privacy boundary

ただしproject-specific promotionは行わない。

その場合:

verifiedCases:
[]

Explicit unverified items:
4件維持

Final state:
COMPLETE_PENDING_FULL_VERIFY

とする。

Evidence不足を
コードで埋めない。

────────────────────────────────────────
24. Private Evidence Request Matrix
────────────────────────────────────────

Evidenceが不足している場合、
Completion Reportへ
Human向けrequest matrixを返す。

例:

| Needed fact | Required evidence |
| pane W | 1枚の見付幅を直接示す一次資料 |
| pane H | 1枚の見付高さを直接示す一次資料 |
| positive pressure | 元pressure値または算定inputs |
| negative pressure | 元pressure値または算定inputs |
| floor/Z mapping | floorと評価高さの対応が直接分かる資料 |

private filename / URLを
public repoへ書かない。

────────────────────────────────────────
25. Protected invariants
────────────────────────────────────────

変更禁止:

glass strength formula
FL k1
single k2
IGU formula
K2 cap 2.0
IGU ratio 2.5 boundary
TP rules
Low-E semantics
extraFactor default 1.00

Wind Pressure Trace:

Er formula
qBar formula
Cpe × Gpe product
positive / negative separation
internal coefficients
roughness IV→III glass rule
recurrence-factor separation

Evidenceなしに変更しない。

────────────────────────────────────────
26. Current Miyoshi facts
────────────────────────────────────────

維持:

V0:
34
verified / primary

roughness:
III
verified / primary

positive:
1297 / 1525 / 1695 / 1729
partially_verified / indirect

negative:
918 / 1122
partially_verified / indirect

dimensions:
1250 / 2050
sample_default / unverified

identity:
public-safe labelのみ

────────────────────────────────────────
27. Wave Plan
────────────────────────────────────────

Wave 0
Fresh Gate
Run Artifact
Phase 2E closeout
baseline

Checkpoint

Wave 1
architecture inventory
existing validateVerifiedCase / verifiedCases / Evidence contract audit

Checkpoint

Wave 2
generic Evidence Ledger
promotion guard
Verified Case validator

Checkpoint

Wave 3
private Evidence reconciliation
only where Evidence is actually available

Checkpoint

Wave 4
Miyoshi evidence-status UI
Verified Case selector if and only if cases exist
reconciliation diagnostic

Checkpoint

Wave 5
security / privacy / spoofing / mutation / regression tests

Checkpoint

Wave 6
browser
full regression
independent verifier

Findings:
same Campaign内repair

Hard Gate:
BLOCKED

Wave 7
README
Run Artifact convergence
Draft PR
Vercel Preview exact head
Completion Report

Human Gate:
STOP

────────────────────────────────────────
28. Hard Gates
────────────────────────────────────────

Quality Debt化禁止:

private Evidence leak
secret leak
trust promotion bypass
verified-state spoofing
data integrity
Evidence without source
automatic pressure replacement after mismatch
automatic pane-dimension inference
automatic Z inference

発生:
BLOCKED

state/evidence/resumeのみ保存してSTOP。

────────────────────────────────────────
29. Prohibited
────────────────────────────────────────

main direct write
Ready
merge
auto-merge
Production
Release

force push
permission changes
branch protection changes
secret changes

private Evidence public commit

private URLs
private document IDs
private filenames

automatic verified promotion
automatic preset mutation on mismatch

────────────────────────────────────────
30. Independent Verifier
────────────────────────────────────────

最低確認:

Evidence promotion gate
partial vs case-level verification
import spoofing
privacy
case validation
preset mutation boundary
sample-default behavior
Wind Trace non-regression
PIP compatibility
browser
Run Artifact
Preview exact head

特にmutation候補:

primary → indirectでもverified通過
checkedAt不要化
privateReferenceAvailable無視
partial caseをverifiedへ昇格
imported verified claim受理
mismatchでpreset自動更新
sample_defaultをverified扱い

を狙う。

────────────────────────────────────────
31. Draft PR
────────────────────────────────────────

最後は:

OPEN
Draft=true
merged=false

Vercel Preview:
READY
exact head一致

Ready / merge / Productionは禁止。

────────────────────────────────────────
32. Completion Report
────────────────────────────────────────

Run ID:
Task Packet ID:
Revision:
Digest:

Base:
Final exact head:
Branch:
Draft PR:

Existing Evidence architecture:
Reused:
Changed:

Evidence Ledger:
Promotion Gate:
Verified Case schema:

Private Evidence availability:
available / partial / unavailable

Miyoshi reconciliation:

pane W:
status

pane H:
status

positive pressure:
status

negative pressure:
status

floor/Z mapping:
status

verifiedCases:
count

Preset mutation:
none / details

Tests:
baseline
final

Security:
Privacy:
Trust:
Browser:
Vercel Preview:

Quality Debt:

Explicit unverified items:
remaining count
details

Human Evidence Request Matrix:
if applicable

Phase 2E post-closeout:
state

Final Run State:

Documentation Sync Trigger:
yes

Vault / Notion sync candidates:

Human Gate:
STOP — Ready / merge / Production authorization required
