# Run State

- Run ID: LR-20260920-GLASS-P2F
- Mode: LONG_RUN
- Horizon: 8H
- Current state: COMPLETE_PENDING_FULL_VERIFY
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2f-verified-project-cases
- Base SHA: a185b4675cac03d501ea6805b449437c3fbbb0fd
- Current artifact-sync head: `RESOLVE_DYNAMICALLY` — `git rev-parse HEAD` またはPRの現在headで解決する（自己参照回避contract）
- Implementation verification head: `ffaac1ce52a8ebf8d94dcbc5155fa412d9a2195b`
  （Wave 8 independent verifier findings repair完了時点。source / tests / UI /
  trust / privacy implementationの確定head。以下の検証はすべてこのheadに対して成立する:
  verifier PASS WITH FINDINGS / F1-F12修復 / 270 tests 0 fail /
  Wave 8 repair mutants 19-of-19 killed / browser 4 modes・page error 0・console error 0 /
  privacy sweep / exact-head Vercel Preview READY）
- Current wave: Final Run Artifact Reconciliation / Independent Verification Closure
  （**新規Implementation Waveではない**。Run Artifactをactual final stateへ同期するのみ。
  Wave 8: DONE / Independent verification: DONE / Verdict: PASS WITH FINDINGS /
  Findings: 12 / Findings closed: 12 of 12）
- Task Packet ID: LRP-20260920-GLASS-P2F
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260920-GLASS-P2F/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 9c2185f13346f899771be1f1201e7db2874f12b44df918c4a71450e7f2f2db44

## Objective

残っているproject-specific Evidenceを、推測せず・private情報をpublic repoへ漏らさず
照合できる仕組みを完成させる。Evidenceがある項目だけ正しく昇格し、
ない項目はunverifiedのまま維持する。あわせて任意案件で再利用できる
Project Evidence Ledger + Verified Project Case のgeneric boundaryを導入する。

新しい計算式を追加することは主目的にしない。

## Acceptance Criteria

- [x] AC-01 — **PASS**（private識別子の追加なし。factKey allowlist / publicDescription境界 / sourceReference構造検証）
- [x] AC-02 — **PASS**（inventory実施。契約をevidence.jsへ移動し重複を解消）
- [x] AC-03 — **PASS**（evidence-ledger.js）
- [x] AC-04 — **PASS**（gateをtrusted経路へ接続。bypass mutationはすべてkill）
- [x] AC-05 — **PASS**（field verified ≠ case verified）
- [x] AC-06 — **PASS**（`validateVerifiedCase()`。F9修復後はcaseIdにもpublic-safe boundaryを適用）
- [x] AC-07 — **PASS**（sample_default / unverified のまま）
- [x] AC-08 — **PASS**（推定経路なし。1250×2050は sample_default のまま）
- [x] AC-09 — **PASS**（reconcileはEvidence優先。数値一致でも INSUFFICIENT_EVIDENCE）
- [x] AC-10 — **PASS**（推測経路なし。算定provenance主張時はevaluation_height根拠を要求）
- [x] AC-11 — **PASS**（reconcileFact / MATCH・MISMATCH・INSUFFICIENT_EVIDENCE）
- [x] AC-12 — **PASS**（判定順序がEvidence優先。mutationで固定）
- [x] AC-13 — **PASS**（read-only。preset不変をtestで固定）
- [x] AC-14 — **PASS**（verifiedCasesは空のまま）
- [x] AC-15 — **PASS**（package schemaにevidence/sourceReference/verifiedCase fieldが存在しない）
- [x] AC-16 — **PASS**（configのmetadataから導出。0件時はcase selectorを描画しない）
- [x] AC-17 — **PASS**（実機4モード。1756 / 1463 / Manual 1400 / trace）
- [x] AC-18 — **PASS**（Er / qBar 既知解不変）
- [x] AC-19 — **PASS**（schemaVersion 2 のまま。v3へ上げていない）
- [x] AC-20 — **PASS**

## Completed

- Wave 0: Fresh Gate実測（origin/main == a185b467…、tree clean、tracked 0 / untracked 0）
- Wave 0: branch `claude/phase2f-verified-project-cases` を origin/main から作成
- Wave 0: baseline `npm test` 実測 197 pass / 0 fail
- Wave 0: Run Artifact 7ファイルを実装開始**前**に作成、Task Packet digestをbinding
- Wave 0: **Evidence availability判定 = UNAVAILABLE**（§6の4 sourceを順に確認。D-001）
- Wave 0: Phase 2E Run Artifactへpost-merge closeoutを記録（snapshot / digestは不変）

## Current implementation state

Wave 0-2, 4-8 完了。Wave 3は Evidence UNAVAILABLE のため SKIPPED_BY_DESIGN。

```text
Wave 0   Fresh Gate / Run Artifact / Phase 2E closeout / baseline   DONE
Wave 1   architecture inventory + Evidence contract抽出             DONE
Wave 2   Promotion Gate closure / Evidence Ledger / case validator  DONE
Wave 2H  immutability / allowlist / IP boundary / reference保持     DONE
Wave 3   private Evidence reconciliation                           SKIPPED_BY_DESIGN / NO_EVIDENCE_AVAILABLE
Wave 4   UI Evidence status / case selector規則 / 照合表示           DONE
Wave 5   security / spoofing / mutation                            DONE
Wave 6   browser / full regression / independent verifier          DONE（verifier: PASS WITH FINDINGS）
Wave 7   README / Run Artifact convergence / Draft PR              DONE
Wave 8   independent verifier findings repair (F1-F12)             DONE
```

**project-specific promotion: NONE。** verifiedCases: 0。Explicit unverified items: 4。

## Evidence availability

```yaml
private_evidence: UNAVAILABLE
determined_at: 2026-09-20
sources_checked: [human_supplied, execution_environment, repository_public_safe, official_public]
vault_files_referencing_this_repository: 0
project_specific_promotion: NOT PERFORMED
verifiedCases: []
explicit_unverified_items: 4   # 維持
```

詳細は EVIDENCE.md §1、判断は DECISIONS.md D-001。

## Checks

```text
Fresh Gate                     : PASS（base SHA一致、working tree clean）
baseline npm test              : PASS（197 pass / 0 fail）
full npm test (current)        : PASS（270 pass / 0 fail。baseline 197 → 256 → Wave 8で270）
Evidence availability          : UNAVAILABLE（§23の経路を取る）
Evidence contract抽出           : PASS（evidence.js が単一の正。重複実装なし）
Promotion Gate on trusted paths: PASS（verifiedValue / identity / validateVerifiedCase）
public source reference検証     : PASS（**Wave 8で修復済み**。独立検証F1でルート末尾ドット
                                 迂回が実在した＝当時はFAILだった。現在は正規化後に判定し、
                                 私設TLD / CGNAT / wildcard DNS / 追加provider /
                                 percent-encoded credential も拒否する）
Evidence Ledger                : PASS（field-level fact + case-level promotion）
reconciliation                 : PASS（MATCH ≠ verified を構造的に分離）
mutation（gate bypass 5件）     : PASS（すべてkill）
mutation（ledger 3件）          : PASS（M8はtest gapを露呈→closeしてkill）
mutation（Wave 2H 7件）         : PASS（H4はtest gapを露呈→closeしてkill）
Ledger immutability            : PASS（deep freeze + caller objectからの切り離し）
factKey allowlist              : PASS（fail closed。A_102_pdf等を拒否）
public reference IP boundary   : PASS（fe80::/10全域・未指定・IPv6リテラルclass）
verifiedValue reference保持     : PASS（Option A。ephemeral pathなし）
independent verifier           : PASS WITH FINDINGS（F1-F12。全件Wave 8で対応。下記参照）
verifier findings closed       : 12 / 12
mutation（Wave 8 修復 19件）    : PASS（19 / 19 killed。MF9b / MF10はtest gapを露呈→closeしてkill）
browser（Wave 8 再実測）        : PASS（4モード。page error 0 / console error 0。
                                 F1・F5の攻撃がブラウザ実行時にも拒否されることを確認）
privacy sweep                  : PASS（Wave 8 diffにprivate識別子の新規追加なし。
                                 denylist pattern と合成negative fixtureのみ）
trust                          : PASS（trusted構築経路・保持中の不変性・照合の順序すべてmutationで固定）
preset mutation                : NONE
verifiedCases                  : 0
project-specific promotion     : NONE
private Evidence               : UNAVAILABLE
exact-head Vercel Preview      : READY / success
```

## Hard Checks（Quality Debt化禁止）

```text
private Evidence leak                    : PASS（private情報の記載なし。独立検証の privacy sweepでも0件）
secret leak                              : PASS
trust promotion bypass                   : PASS（trusted構築経路がすべてgateを通る。mutationで確認）
verified-state spoofing                  : PASS（Wave 8修復後）
data integrity                           : PASS（preset無変更をtestで固定。実機でも1297/1525/1695/1729・918/1122・1250×2050不変）
Evidence without source                  : PASS（Evidenceを主張していない。verifiedCases 0）
automatic pressure replacement           : PASS（照合はread-only。MISMATCHでも書き換えない）
automatic pane-dimension inference       : PASS（推定経路なし）
automatic Z inference                    : PASS（推定経路なし）
```

### `verified-state spoofing` の訂正記録

Wave 7時点でこの行は `PASS（検証後改変・import spoofing・forged evidence いずれも封鎖）`
と記載していたが、**当時この主張は半分しか正しくなかった**。独立検証が次の2件を実証した。

- **F2**: `createEntry()` がgateと保存用snapshotで呼び出し側の `evidence` を2回読むため、
  accessorを仕込んだobjectで「gateにはprimary、保存にはnone」を返せた。
  その結果、gateを通らないevidenceを持つ **実在の** verified entry が生成できた。
- **F3**: Ledger entryは深くfreezeされていた一方、UIが実際に読む一次のtrusted object
  （`config.identity` / `dimensions` / `wind` / `verifiedCases`）はmutableのままだった。
  `config.wind.V0.value = 99`、`config.dimensions.mode = 'verified_project_case'`、
  `config.verifiedCases.push(...)`（`validateVerifiedCase()` を一切通らない裏口登録）が通った。

いずれもWave 8で閉じ、mutationで固定した（MF2 / MF3a / MF3b）。
上のPASSはその修復後の状態を指す。

## 独立検証 findings と対応（Wave 8）

```text
F1  HIGH    ルート末尾ドットでprivate provider denylistと完全修飾判定を迂回  FIXED
F2  MED-HI  createEntryのTOCTOU（gateと保存で別の値を読める）              FIXED
F3  MED     trusted configがfreezeされておらず検証後改変が可能             FIXED
F4  MED     allowlist / critical fact表をlive mutableで公開                FIXED
F5  MED     reconcileFactが自己申告のverificationStatusを信用             FIXED
F6  MED     case-levelのgate再実行が未テスト（mutation survivor M26）      FIXED（test追加）
F7  MED     Run Artifactの誇張と陳腐化した記述                            FIXED（本ファイル）
F8  LOW     私設TLD / CGNAT / wildcard DNS / 追加provider / cred param    FIXED
F9  LOW     caseIdにpublic-safe checkが無い                               FIXED
F10 LOW     Evidence panelが例外を黙殺して消える                          FIXED
F11 INFO    identityがliteralで、gateとの結び付きが規約のみ                FIXED
F12 INFO    critical factが空のときcase promotionが空虚に真                FIXED
```

F7は「artifactが実装より良く見えていた」という指摘であり、Evidence boundaryと同じ性質の
問題として扱う。数値や状態を良く見せる方向の誤りは、それ自体がHard Checkの対象である。

## Quality Debt

現時点でなし（QUALITY_DEBT.md参照）。Evidence不足はQuality Debtではない。

## Explicit unverified items

```text
1. ガラス1枚の実見付 W/H
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m² の元計算根拠
3. 負圧 918 / 1122 N/m² の元計算根拠
4. 各階評価高さ Z とpresetのexact mapping
```

本Campaignでいずれもclosureしない（Evidenceが存在しないため）。

## Known failures

```text
none
```

## Decisions

DECISIONS.md を参照（D-000 digest定義 / D-001 Evidence UNAVAILABLE / D-002 近似一致とreverse solveの不採用 / D-003 空のverifiedCases維持）。

## Files changed

```text
project-config/evidence.js          (新規) Evidence contract / promotion gate / public reference検証
project-config/evidence-ledger.js   (新規) field-level Evidence Ledger / case promotion / reconciliation
project-config/miyoshi.js           契約をevidence.jsへ移譲。gate接続。config subtreeのfreeze。caseId境界
project-config/project-input.js     VERIFICATION_STATUSES を evidence.js から解決
index.html                          evidence.js読み込み / Evidence status UI / 照合表示 / panel失敗の明示
README.md                           Phase 2F節（Evidence architecture）
tests/evidence.test.js              (新規)
tests/evidence-ledger.test.js       (新規)
tests/calc.test.js                  追加
tests/project-config.test.js        追加
tests/project-input.test.js         追加
tests/ui-mode-separation.test.js    追加
.agent-run/LR-20260920-GLASS-P2F/*  (新規7ファイル)
.agent-run/LR-20260919-GLASS-P2E/*  (post-merge closeoutのみ。snapshot / digestは不変)
```

Wave 7時点でこの節は `.agent-run/` の2行しか挙げておらず、実際に変更した11の
code / testファイルが欠落していた（独立検証F7）。変更内容を記録することが
このartifactの役割であり、過小記載は誇張と同じく誤りである。

## Remaining tasks

```text
1. Final focused independent delta review（本artifact commit後に外部Reviewerが実施）
2. Human Gate — Ready / merge / Production authorization
3. private Evidence供給（将来・任意。EVIDENCE.md のEvidence Request Matrix参照）

Claude側implementation : none
Ready                  : not authorized
merge                  : not authorized
Production             : not authorized
```

## Next action

なし（Human Gate待ち）。private Evidenceが供給された場合のみ、
EVIDENCE.md のEvidence Request Matrixに従ってfield単位で照合し、
gateを通った項目だけを昇格する。Evidenceが無い項目はunverifiedのまま維持する。

## Stop conditions status

```text
Fresh Gate                 : PASS
Hard Gate failure          : なし
BLOCKED transition         : 発生していない
no_progress_waves          : 0 / 2（LONG_RUN上限）
same_hypothesis_retry      : 0 / 2
repair_strategies          : 0 / 3
```

## Resume instructions

```text
1. RUN_MANIFEST.md から run_id / repository / working branch / base / Task Packet binding を確認
2. TASK_PACKET_SNAPSHOT.md のファイルbytesのSHA-256を再計算し、
   9c2185f13346f899771be1f1201e7db2874f12b44df918c4a71450e7f2f2db44 と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2f-verified-project-cases で現在headを確認
4. EVIDENCE.md §1 のEvidence availability判定を読む
   （UNAVAILABLEのままなら project-specific promotionへ進まない）
5. QUALITY_DEBT.md を読む
6. npm test でtargeted smoke check
7. 上記 Next action から再開する
```


## Wave 4-7 実施サマリ

| Wave | 内容 | 結果 |
|---|---|---|
| 2H | immutability / allowlist / IP boundary / reference保持 | 選定mutation 7件すべてkill（H4はtest gapを露呈→close） |
| 4 | Evidence status UI / case selector規則 / read-only照合 | 実機確認。4群すべて INSUFFICIENT_EVIDENCE |
| 5 | import spoofing / preset mutation / privacy | package schemaにEvidence fieldが無く到達不能 |
| 6 | browser 4モード / full regression | JS error 0。1756 / 1463 / 1400 / trace不変 |
| 7 | README / Run Artifact / Draft PR | Evidence未取得であることを明記 |
| 8 | independent verifier findings repair | F1-F12すべて対応。修復mutation 19件すべてkill。197→256→270 |

### 最終状態

```yaml
private_evidence: UNAVAILABLE
project_specific_promotion: NONE
verifiedCases: 0
explicit_unverified_items: 4
preset_mutation: NONE
quality_debt: none
independent_verifier: PASS_WITH_FINDINGS (F1-F12, all repaired in Wave 8)
verifier_findings: 12
verifier_findings_closed: 12
wave8_repair_mutants: 19 / 19 killed
tests_baseline: 197 pass / 0 fail
tests_final: 270 pass / 0 fail
browser: PASS
privacy: PASS
trust: PASS
```

`verifiedCases` が空であることはbugではない。Evidenceが存在しないため、
仕組みだけを構築して昇格を行わなかった結果である（§23 / D-001 / D-003）。

## Final state — COMPLETE_PENDING_FULL_VERIFY を維持する理由

canonical `COMPLETE_VERIFIED` は「Explicit unverified itemsなし」を**すべて**要求する
要件の一つとして課している。本Campaignは4件を意図的に保持しているため到達しない。

```yaml
independent_verification: completed
verifier_verdict: PASS_WITH_FINDINGS
verifier_findings: 12
verifier_findings_closed: 12
claude_side_implementation_work: none
final_state: COMPLETE_PENDING_FULL_VERIFY   # 維持する
```

Independent Verifierの結果反映は**完了している**（Wave 8。F1-F12すべてclose）。
`COMPLETE_PENDING_FULL_VERIFY` を維持する理由は、verifierの未反映ではなく、
下記4件のExplicit unverified itemsがEvidence不在のため意図的に未検証であることに尽きる。

```text
1. ガラス1枚の実見付 W/H
2. 階別正圧 1297 / 1525 / 1695 / 1729 の元計算根拠
3. 負圧 918 / 1122 の元計算根拠
4. 各階評価高さ Z とpresetのexact mapping
```

Evidenceが供給されない限りこの4件は閉じない。`COMPLETE_VERIFIED` へは変更しない。
