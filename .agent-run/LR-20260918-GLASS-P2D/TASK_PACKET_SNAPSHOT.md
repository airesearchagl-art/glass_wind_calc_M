# glass_wind_calc_M — Phase 2D Long-Run Campaign

## 0. Campaign authorization

これは小さな修正Taskではない。

Phase 2Cまでに成立した
「Miyoshi preset + Manual / Generic + Evidence contract」
を基盤として、

- calculation coreの完全な案件非依存化
- reusable Project Input Package
- generic preset registry
- safe import / export / replay
- migration / compatibility
- security / privacy convergence
- browser / Vercel Preview
- Documentation / Run Artifact / Draft PR

までを一つのLONG_RUN Campaignとして収束させる。

run_id:
LR-20260918-GLASS-P2D

task_packet_id:
LRP-20260918-GLASS-P2D

task_packet_revision:
1

execution_mode:
LONG_RUN

horizon:
8H

LONG_RUN_ENDURANCE:
false

HumanはLONG_RUNを明示承認している。
LONG_RUN_ENDURANCEは明示承認されていないので使用しない。

細かいFindingごとにHumanへ戻らず、
scope内の問題はCampaign内のrepair waveでまとめて閉じる。

ただしHard Gate failureは即BLOCKEDとする。

---

## 1. Canonical read order

開始時に可能なら以下を読む。

1. Obsidian Vault:
   02_Prompts/LLM_IDE/Long_Run_Development_Route.md
2. 03_Templates/Long_Run_Task_Packet.md
3. 02_Prompts/LLM_IDE/Implementation_Task_Prompt.md
4. 02_Prompts/LLM_IDE/Claude_Code_Capability_Tier_Orchestration.md
5. Documentation_Sync_Handoff.md
6. repository内のCLAUDE.md / .claude/rules/
7. README
8. target files / direct dependencies / tests

Obsidian Vaultへアクセスできない場合、
内容を推測・捏造しない。

ただし今回は本Task Packet自体がself-containedなので、
Vaultアクセス不能を理由にRun ArtifactやCheckpoint/Resumeを省略してはならない。

アクセス不能はRUN_MANIFEST / DECISIONSへconstraintとして記録し、
このTask Packetを実行正本として継続する。

---

## 2. Repository / Fresh Gate

Repository:
airesearchagl-art/glass_wind_calc_M

Expected base:
main @ 97bc18e53c7d3a86b3f180f408e265fec3cf5117

Previous PR:
#4 MERGED

Previous Production:
main @ 97bc18e53c7d3a86b3f180f408e265fec3cf5117

Suggested branch:
claude/phase2d-project-input-package

開始時に必ずFresh Preflight:

origin/main == 97bc18e53c7d3a86b3f180f408e265fec3cf5117
working tree clean
tracked changes = 0
untracked files = 0

不一致ならSTOP。

mainへ直接commitしない。

Preflight時にbaselineとして必ず:

npm test

を実行する。

現在の期待baseline:
91 tests以上
0 fail

実測値を正としてRun Artifactへ記録する。

---

## 3. Wave 0 — Run Artifactを実装前に作る

今回は事後復旧ではなく、最初に必ず作成する。

.agent-run/LR-20260918-GLASS-P2D/
  RUN_MANIFEST.md
  TASK_PACKET_SNAPSHOT.md
  RUN_STATE.md
  TASK_QUEUE.md
  QUALITY_DEBT.md
  DECISIONS.md
  EVIDENCE.md

TASK_PACKET_SNAPSHOT.mdには
このTask Packetのexact contentを保存する。

SHA-256 digestを算出し、

- task_packet_id
- revision
- snapshot path
- digest
- repository
- working branch

をRUN_MANIFEST / RUN_STATEへbindingする。

Resume時は必ずdigestを再確認する。

不一致ならBLOCKED。

Run Artifactにはpublic-safe情報だけを書く。

禁止:
- private URL
- private file ID
- internal filename
- execution環境absolute path
- session UUID
- secret
- credential
- formal internal project identity

---

## 4. Phase 2C post-merge closeout

新Campaign開始時に、前Campaign:

.agent-run/LR-20260917-GLASS-P2C/

の状態を最小限更新してよい。

記録すべきfact:

Phase 2C final feature head:
5f3db2adf3adaea98d9311c83aa2a1cfead03655

PR #4:
merged

merge/main:
97bc18e53c7d3a86b3f180f408e265fec3cf5117

Production:
READY

Production deployment:
dpl_7it4hsHhMz8gCLF9QWj7TkBySWBt

Independent Focused Review:
PASS
Required Fix:
0

Human merge authorization:
received

Phase 2C final state:
COMPLETE_VERIFIED

ただし以下は変更禁止:

TASK_PACKET_SNAPSHOT.mdのverbatim本文
Task Packet digest

Phase 2C artifact closeoutだけを行い、
Phase 2DのTask Packetと混在させない。

---

## 5. Phase 2D Objective

現在calc.jsには案件非依存の計算コアだけでなく、
後方互換用として以下のMiyoshi-specific複製が残っている。

POSITIVE_PRESSURE_MIYOSHI_PRESET
NEGATIVE_PRESSURE_MIYOSHI_PRESET
UNVERIFIED_DEFAULT_DIMENSIONS_MM

これらはproject-config/miyoshi.jsへ既に移設済みで、
calc.js側はdeprecated duplicateである。

Phase 2Dでは、

calculation core
project preset
manual/imported input

の境界を完成させる。

最終的にcalc.jsには
Miyoshi案件固有値・案件固有ラベル・案件固有provenanceを残さない。

その上で、
任意案件の入力条件を安全かつ再現可能に表現できる
versioned Project Input Packageを導入する。

---

## 6. Non-negotiable canonical facts

以下は変更禁止。

Calculation formula:

P = (300 × k1 × k2 / A) × (t + t²/4)

FL k1:
t <= 8  : 1.00
t <= 12 : 0.90
t <= 20 : 0.80
t > 20  : 0.75

single:
k2 = 1.0

IGU:
k2 = 0.75 × (1 + r³)
r cap = 2.0

IGU thick/thin > 2.5:
自動推奨しない

TP:
k1 = 3.5

reference thickness:
4,5,6,8,10,12,15mm

tool auto candidates:
5,6,8,10,12,15mm

TP19:
自動候補にしない

Low-E:
coating属性
strength typeではない

extraFactor:
default = 1.00
告示外の追加低減係数

---

## 7. Miyoshi facts — 絶対に勝手に変更しない

V0:
34 m/s
verificationStatus = verified
evidence.level = primary

roughness:
III
verificationStatus = verified
evidence.level = primary

Positive pressure:
1F = 1297
2F = 1525
3F = 1695
RF = 1729 N/m²

Negative pressure:
general = 918
corner = 1122 N/m²

pressure verification:
partially_verified
evidence.level = indirect

Dimensions:
W = 1250
H = 2050

dimensions.mode:
sample_default

dimensions.status:
unverified

defaultW:
unverified / evidence none

defaultH:
unverified / evidence indirect

1250×2050をverified pane dimensionへ昇格させない。

---

## 8. Explicit unresolved evidence

以下はPhase 2Dでも未解決として扱う。

1. ガラス1枚の実見付W/H
2. 階別正圧1297/1525/1695/1729の元計算書
3. 負圧918/1122の元計算根拠
4. 各階評価高さZとpresetのexact mapping

repository内で新Evidenceが得られない限り、
推測でverifiedへ昇格させない。

Run StateのExplicit unverified itemsへ維持する。

---

# 9. Acceptance Criteria

## AC-01 — Calculation core完全案件非依存化

calc.jsから以下を削除する。

POSITIVE_PRESSURE_MIYOSHI_PRESET
NEGATIVE_PRESSURE_MIYOSHI_PRESET
UNVERIFIED_DEFAULT_DIMENSIONS_MM

exportからも削除する。

calc.js内に:

- Miyoshi
- みよし案件
- Miyoshi-specific pressure
- project-specific default dimensions
- project-specific Evidence

を残さない。

calc.jsは以下だけを担当する。

- k1
- k2
- notification formula
- IGU calculation
- candidate generation
- sorting
- split
- generic calculation utilities

repository-wide searchで、
案件固有値のauthoritative sourceが
project-config側に一本化されたことを確認する。

既存consumerを調べ、
calc.js deprecated constantsへの依存をすべて移行する。

---

## AC-02 — Versioned Project Input Package

versionedなProject Input Packageを導入する。

推奨module例:

project-config/project-input.js

または同等の明確なboundary。

最低限packageは以下を表現できること。

schemaVersion
sourceKind
dimensions
pressure input
glassType
extraFactor
public provenance state

sourceKind最低限:

registered_preset
manual
imported_unverified

設計風圧designPは
serialized valueを盲信しない。

必ず:

max(abs(positivePressure), abs(negativePressure))

から再計算する。

package shapeは必要以上に巨大化させない。

---

## AC-03 — Common validator / factory

Project Input Packageには共通validator/factoryを設ける。

最低限:

- schemaVersion validation
- supported sourceKind
- finite numeric validation
- W/H > 0
- pressure designP > 0
- 0 < extraFactor <= 1.0
- known glassType only
- public-safe strings
- length limits
- required field validation
- deterministic normalization

を行う。

unknown schemaVersion:
reject

invalid field type:
reject

unsupported glassType:
reject

NaN / Infinity:
reject

---

## AC-04 — Generic preset registry

Miyoshi presetを個別globalとして直接使うだけでなく、
generic preset registry経由でも扱えるようにする。

最低限:

registerPreset(config)
getPreset(projectId)
listPresets()

または同等のAPI。

duplicate projectId:
reject

unknown projectId:
fail closed

public label:
getPublicLabel()等のsafe boundaryを維持

manual input:
trusted presetとして登録しない

registered presetのverified stateは、
repository内built-in configだけが持てる。

---

## AC-05 — Imported dataは絶対にtrusted presetへ昇格させない

外部JSON / pasted packageは、
payload中に:

verificationStatus: verified
sourceKind: registered_preset
evidence.level: primary

等が書かれていても、
それをtrusted事実として採用してはならない。

安全な設計を選ぶこと。

推奨:

external import
→ imported_unverified

または
trusted-state claimを含むpayload自体をreject。

built-in registered presetのverified情報は
repository内の登録済みconfigからのみ取得する。

imported payloadから
Miyoshi verified provenanceを偽装できないこと。

---

## AC-06 — Safe import / export / replay

静的HTML / plain JS / file://互換を維持したまま、
現在の入力条件を再現可能なpackageとしてexportできるようにする。

最低限:

Export current input
Import Project Input Package

を提供する。

実装は:

- copyable JSON
- textarea
- file save/load

等から最も堅牢な方法を選んでよい。

backend不要。

localStorage必須ではない。
永続化は今回のNon-goal。

Export → Import後に
計算結果が一致すること。

deterministic roundtripをテストする。

---

## AC-07 — Import security

JSON import pathに安全境界を設ける。

少なくとも以下を拒否または無害化する。

__proto__
prototype
constructor

過大payload
過深nest
unknown top-level fields
invalid strings
HTML/script payload

禁止:

eval
Function()
new Function()
dynamic script injection

imported textをDOMへ表示する場合、
innerHTMLへ未サニタイズで流さない。

textContent等の安全な方法を使う。

推奨上限例:

payload size <= 16KB
nest depth <= 8

実装上より適切な値がある場合は
理由をDECISIONS.mdへ記録する。

---

## AC-08 — Backward compatibility / migration

calc.js deprecated constants削除により
既存tests / UI / internal consumersが壊れないよう、
repository内consumerを全検索して移行する。

ただし、
案件固有複製をcalc.jsへ残すことで互換性を維持してはならない。

必要ならcompatibility layerを
project-config側へ設けてもよい。

ただし、
新しいarchitectureの正は:

calculation core
project config / registry
project input package

とする。

READMEにmigrationを記録する。

---

## AC-09 — Regression

既存Phase 2C regressionを維持する。

Miyoshi:

FL6
W=1250
H=2050
2F
general
extraFactor=1.00

P ≈ 1756.09756
designP = 1525
=> OK

Miyoshi:

FL6
W=1500
H=2050
2F
general
extraFactor=1.00

P ≈ 1463.41463
designP = 1525
=> NG

Manual:

W=1250
H=2050
positive=1400
negative=-1000

designP=1400

既存91 testsを基準に、
削除によるtest減少を単純に許容しない。

deprecated API testを
新architecture testへ置き換える場合は、
coverageが減っていないことを説明する。

---

## AC-10 — Phase 2D new tests

最低限追加:

1. calc.jsにMiyoshi-specific identifiersが存在しない
2. calc.js exportsからdeprecated constantsが消えている
3. Miyoshi preset registry lookup
4. duplicate projectId reject
5. unknown preset fail closed
6. Project Input Package valid roundtrip
7. deterministic serialization
8. unsupported schemaVersion reject
9. unknown field reject
10. NaN / Infinity reject
11. extraFactor >1 reject
12. both pressures zero reject
13. imported verified claim cannot elevate trust
14. __proto__/constructor/prototype rejection
15. oversized payload rejection
16. malformed JSON rejection
17. imported string/HTML payloadがDOM実行されない
18. Miyoshi regression
19. Manual regression
20. public-safe/privacy boundary regression

---

## AC-11 — Browser verification

Playwright / Chromiumで実画面を確認。

Miyoshi mode:
既存挙動維持

Manual mode:
既存挙動維持

Export / Import:
current input export
→ import
→ same designP
→ same recommended result

malicious import:
reject / safe error
script executionなし

imported data表示:
Miyoshi verified表示なし
user/imported unverified表示あり

mode切替後もprovenanceが混線しないこと。

---

## AC-12 — Vercel Preview

Draft PRのfinal exact headで:

Vercel Preview
READY
githubCommitSha == exact PR head

を確認。

Productionへdeployしない。

---

## AC-13 — Privacy / Disclosure

public repositoryなので、
次を新規追加しない。

private Drive URL
private file ID
Notion private URL
SharePoint private URL
internal path
private filename
formal internal project identity
credential
secret
session identifier
execution environment absolute path

Run Artifactも同じboundaryを守る。

---

## AC-14 — Documentation

READMEへ最低限:

- Phase 2D architecture
- calculation core purity
- preset registry
- Project Input Package schemaVersion
- Manual / Imported / Registered presetのtrust差
- import/export usage
- security boundaries
- migration from deprecated calc.js constants
- tests

を反映。

PR本文もactual final behaviorへ同期。

Documentation Sync Trigger:
yes

ただしClaude Codeから
Notion / Obsidian Vaultへ直接書き込まない。

Human / orchestration側へsync candidateを返す。

---

# 10. Non-goals

今回やらない。

- 新しい風圧自動算定engine
- 建物高さ/粗度/V0からの自動pressure生成
- 実pane W/Hの推測
- pressure original evidenceの推測
- BIM/CAD/DWG/PDF解析
- メーカーDB
- cloud DB
- account/auth
- shared cloud storage
- server API
- collaborative editing
- Production deployment
- merge

---

# 11. Wave Plan

## Wave 0
Fresh Gate
canonical read
Phase 2C run closeout
Phase 2D Run Artifact作成
Task Packet snapshot/digest
baseline tests

Checkpoint

## Wave 1
consumer / dependency inventory
calc.js deprecated Miyoshi duplicate migration
core purity

Checkpoint

## Wave 2
Project Input Package schema
validator / normalization / serialization
generic preset registry

Checkpoint

## Wave 3
safe import / export / replay
trust downgrade / security boundaries

Checkpoint

## Wave 4
UI integration
Miyoshi / Manual / Imported state clarity

Checkpoint

## Wave 5
mutation / security / privacy / full regression
independent verifier

Findingがscope内なら
一件ずつHumanへ戻らず、
同Campaign内repair waveでまとめて修正する。

Hard Gate failureのみ即BLOCKED。

## Wave 6
README
Run Artifact convergence
Draft PR
Vercel Preview exact-head
final independent self-check
Completion Report

Human GateでSTOP。

---

# 12. Independent verifier

実装agentとは別のbounded verifierを使用できる場合、
最終Waveで使用する。

verifierは最低限:

- actual diff
- core purity
- trust boundary
- import security
- tests
- browser
- privacy
- Run Artifact
- Preview exact-head

を独立確認する。

verifier Findingは
scope内ならrepairして再verifyする。

Humanへ返す前に可能な限り収束させる。

---

# 13. Hard Gates

以下はQuality Debtへ送らない。

Security
Privacy
Authentication
Permission
Data integrity
Irreversible data
Secret exposure
Trust-boundary bypass
Verified-state spoofing

FAIL時:

BLOCKED

として、
state / evidence / resume情報だけ保存しSTOP。

---

# 14. Prohibited

禁止:

main direct write
Ready for Review
merge
auto-merge
Production deployment
Release
Publish
force push
branch protection変更
permission変更
secret変更
credential表示
destructive reset
unapproved branch deletion
private dataのpublic repoコピー

---

# 15. Draft PR

完了時は新branchからDraft PRを作成。

PRは:

OPEN
Draft
merged=false

で停止。

Ready化しない。
mergeしない。

---

# 16. Completion criteria

COMPLETE_PENDING_FULL_VERIFYは、
実装側verification完了後に使用してよい。

COMPLETE_VERIFIEDは、
Task Packet上のすべてのAC、
Hard Checks、
Required Checks、
explicit unverified items、
independent verification、
drift確認

がすべて成立した場合のみ。

ただしHuman Gate前なので、
Ready / merge / Productionは行わない。

---

# 17. Completion Report

最後に以下を返す。

Run ID:
Task Packet ID:
Revision:
Digest:

Base:
Final exact head:
Branch:
Draft PR:

Wave checkpoints:

Core purity:
Removed deprecated calc.js exports:

Project Input Package:
schemaVersion:
sourceKind behavior:

Preset registry:
Manual:
Imported trust behavior:

Import/export:
Security:

Tests:
Baseline:
Final:
New tests:

Miyoshi regression:
Manual regression:
Roundtrip regression:

Browser:
Privacy:
Vercel Preview:

Quality Debt:
Explicit unverified items:
Known failures:

Run Artifact:
Final Run State:

Documentation Sync Trigger:
yes

Vault / Notion sync candidates:

Human Gate:
STOP — Ready / merge authorization required

Return only after the full Campaign has converged as far as safely possible.
