# Run State

- Run ID: LR-20260919-GLASS-P2E
- Mode: LONG_RUN
- Horizon: 8H
- Current state: RUNNING（Wave 2-5,7完了。Wave 6 independent verification実行中）
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2e-wind-pressure-trace
- Base SHA: a26714c6dd2d8bca80e18fcf1e97d7d184c9254f
- Current artifact-sync head: `RESOLVE_DYNAMICALLY` — `git rev-parse HEAD` またはPRの現在headで解決する（自己参照回避contract）
- Current wave: Wave 6 — browser verification / full regression / independent verifier
- Last successful checkpoint: （Wave 0 commitで確定）
- Task Packet ID: LRP-20260919-GLASS-P2E
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260919-GLASS-P2E/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 137e9cde09e91cb49a0a57ab20c2e369f892f46ce38836c6529c9823ee10185f

## Objective

設計風圧そのものを、入力値・式・係数・中間値・最終値まで追跡可能に算定できる
generic Wind Pressure Trace Engineを導入する。preset / manual / notification-based calculation を
明確に分離し、「なぜこの設計風圧になったか」を第三者が後から追跡できる構成へ進める。

既存Miyoshi presetを自動算定値で置換しない。

## Acceptance Criteria

- [x] AC-01 Research Gate — **PASS**（`human_supplied_primary_evidence`。memory-only / snippet実装は0件）
- [x] AC-02 Generic Wind Core — **PASS**。`wind-pressure.js` は案件非依存。Miyoshi literal 0（source grep testで固定）
- [x] AC-03 Traceability — **PASS**。17ステップのtrace（式・値・単位）。内部丸めなし、丸めは表示層のみ
- [x] AC-04 Formula vs Input separation — **PASS**。`verified_primary_source` / `user_input_unverified` / `calculated` を分離
- [x] AC-05 Notification mode — **PASS**。4モード目を追加。既定は案件プリセットのまま、既存3モードは実機で回帰なし
- [x] AC-06 Project Input integration — **PASS**。PIP v2経由。GlassCalcへのbypassなし
- [x] AC-07 Design pressure contract — **PASS**。`max(|正圧|,|負圧|)` を維持
- [x] AC-08 Replay — **PASS**。export→import→recalcで風圧・trace・ガラス候補が一致（実機確認済み）
- [x] AC-09 Migration — **PASS**。v1は`windInput: null`のv2へ決定的migrate、挙動不変。v1+windInputは拒否、v3以上はfail closed
- [x] AC-10 Miyoshi diagnostic — **PASS**。side-by-side比較を表示。置換・昇格せず、provenance未解決を明示
- [x] AC-11 No automatic Z inference — **PASS（vacuously）**。floor→Zの推測を一切実装していない
- [x] AC-12 Error boundary — **PASS**。NaN/Infinity/非正/型違い/未知フィールド/不正列挙をfail closedで拒否
- [x] AC-13 Unit discipline — **PASS**。m / m/s / N/m² をtrace各stepに明示。`wind-pressure.js` はmmを扱わない
- [x] AC-14 Known-answer tests — **PASS**。供給known-answer 4値をbit-exactで固定。境界・補間・基準を網羅
- [x] AC-15 Miyoshi regression — **PASS**。1756.09756097561 / 1463.4146341463415 / Manual 1400 を再実測
- [x] AC-16 Existing tests — **PASS**。baseline 133 → 190 pass / 0 fail。テスト削除なし
- [x] AC-17 Browser — **PASS**。4モード + trace伝播 + 改竄import + fail closed を実機確認。JS error 0
- [x] AC-18 Security — **PASS**。改竄pressureは再計算で無効化。trace到達値は数値/固定列挙のみ。Phase 2D boundary維持
- [x] AC-19 Privacy — **PASS**。新規URLは公的一次資料8件のみ（AC-19が明示的に許可）。private識別子なし
- [x] AC-20 Documentation — **PASS**。README同期。逆算記述を出典裏付けへ訂正。§18の表現規則に従う

## Completed

- Wave 0: Fresh Gate実測（origin/main == a26714c6…、tree clean、tracked 0 / untracked 0）
- Wave 0: branch `claude/phase2e-wind-pressure-trace` を origin/main から作成
- Wave 0: baseline `npm test` 実測 133 pass / 0 fail（per-file内訳はRUN_MANIFEST）
- Wave 0: Run Artifact 7ファイルを実装開始**前**に作成、Task Packet digestをbinding
- Wave 0: Phase 2D Run Artifactへpost-merge closeoutを記録（snapshot / digestは不変）

## Current implementation state

（下記はWave 1でBLOCKEDだった時点の記録。Human提供EvidenceによりD-004で解除され、Wave 2以降を実施した。）

**当時、実装コードは1行も書いていなかった。これは意図した結果である。**

Wave 1のResearch Gateが成立しなかったため、Task Packet §5「Research Gateが成立しない場合、
その部分のimplementationはBLOCKED」および §9「一次資料で必要性と定義を確認する前に
固定schemaとして実装しない」に従い、Wave 2以降へ進んでいない。

source / tests / README / index.html はいずれも **base `a26714c6…` から無変更**。
本branchの差分はRun Artifactのみ（`.agent-run/`）。

### なぜWave 2も止めたか

Wave 2（wind input contract / Trace data model / pure core）は一見すると
formulaなしでも着手できるように見えるが:

- §9が「一次資料で必要性と定義を確認する前に**固定schemaとして実装しない**」と明示している。
  必要な入力項目そのものがResearch Gateで確定する対象である。
- §8のTrace contractは中間値の構造を持つが、その中間値と名称は一次資料に依存する
  （「名称は一次資料に合わせてよい」）。
- Wave 3以降はWave 2に依存する。

計算しない計算エンジンの骨組みを置くことは、後から推測係数で埋められる余地を作るため、
建築安全性ツールにおいてはむしろ危険と判断した（D-003）。

## Checks

```text
Fresh Gate                     : PASS（base SHA一致、working tree clean）
baseline npm test              : PASS（133 pass / 0 fail）
full npm test (current)        : PASS（190 pass / 0 fail）
canonical read                 : PASS（Vault read-onlyでLong-Run route等を参照）
Research Gate                  : PASS（ESTABLISHED_FROM_HUMAN_SUPPLIED_PRIMARY_EVIDENCE）
memory-only implementation     : 0件
websearch-snippet implementation: 0件
known-answer（供給4値）         : PASS（bit-exactで一致。独立再計算で確認）
mutation check（wind core）     : PASS（17 mutantすべてkill）
mutation check（integration）   : PASS（6 mutantすべてkill）
browser（4 mode / file://）     : PASS（JS error 0）
privacy sweep                  : PASS（新規URLは公的一次資料8件のみ）
protected invariants           : PASS（再実測で不変）
```

## Hard Checks（Quality Debt化禁止）

```text
Safety-critical formula mismatch : PASS — EVIDENCE.md §4と実装を逐条照合。供給known-answer 4値がbit-exactで一致
Security                         : PASS（改竄pressureの再計算による無効化、eval/Function/DOM不使用）
Privacy                          : PASS（新規は公的一次資料URLのみ）
Permission                       : PASS（権限・branch protection・credentialの変更なし）
Data integrity                   : PASS（designPressure契約維持、決定的正規化、roundtrip一致）
Irreversible data                : PASS（不可逆操作なし。main直接write・force push・branch削除なし）
Secret exposure                  : PASS
Trust-boundary bypass            : PASS（imported → registered_preset への昇格経路なし。windInputもdowngrade対象）
Verified-state spoofing          : PASS（式のverifiedが入力をverifiedへ昇格させない。preset値・statusは無変更）
```

いずれもwaiver・accepted_by_human・Quality Debt・NOT RUN・INCONCLUSIVEを使用していない。

**Research Gateの不成立は `HARD_GATE_FAILURE` ではない。** canonical Routeは
「Hard Checkが NOT RUN / INCONCLUSIVE / tool unavailable で、実際の安全Failureを
示していない場合は `HARD_GATE_FAILURE` とは区別する」と定めており、本件は
`tool unavailable`（egress policy denial）に該当する。実際の安全境界違反は発生していない。
ただし当該CheckがPASSするまで `COMPLETE_VERIFIED` にはできない。

## Quality Debt

現時点でなし（詳細は QUALITY_DEBT.md）。

## Explicit unverified items

```text
1. actual pane W/H（1250×2050は sample_default / unverified のまま）
2. positive pressure original calculation（1297 / 1525 / 1695 / 1729 N/m²の元根拠）
3. negative pressure original calculation（918 / 1122 N/m²の元根拠）
4. exact floor / evaluation-height (Z) mapping
```

Phase 2Eでもpublic repository内またはHuman提供Evidenceから直接確認できない限りclosureしない。

## Known failures

```text
none
```

## Decisions

DECISIONS.md を参照。

## Files changed

```text
.agent-run/LR-20260919-GLASS-P2E/*  (新規7ファイル)
.agent-run/LR-20260918-GLASS-P2D/*  (post-merge closeoutのみ。snapshot / digestは不変)
```

## Remaining tasks

```text
1. Independent Verifierの結果を反映（findingがあればscope内でrepair→再verify）
2. Human Gate — Ready for Review / merge / Production の可否
```

## Next action

Independent Verifierの結果を受領し、findingがscope内であれば同Campaign内でrepairして再検証する。
その後Draft PRとVercel Preview exact-headを確認してCompletion Reportを出す。
Ready化・merge・Productionは行わない。

（以下はWave 1 BLOCKED時のescalation記録。D-004により解除済み。）

Research Gateをunblockするための選択肢:

```text
(a) 実行環境のegress policyへ一次資料hostを追加する
    対象host: www.kenken.go.jp / elaws.e-gov.go.jp / www.mlit.go.jp /
              glass-wonderland.jp / www.jsma.or.jp / www.gbrc.or.jp / hourei.ndl.go.jp
    → 同じbranchでWave 1から再開できる

(b) Humanが一次資料の該当部分（係数表を含む完全な形）をTask Packetまたは
    repository内のEvidenceとして提供する
    → §14「Human提供Evidence」の経路。提供された内容をEVIDENCE.mdへ記録して再開

(c) Phase 2Eのscopeを、一次資料を要しない範囲へHumanが再定義する
    → Task Packet revision 2 が必要

(d) Phase 2Eを保留し、別のPhaseを先行させる
```

いずれの場合もReady化・merge・Productionは行わない。

## Stop conditions status

```text
Fresh Gate                 : PASS
Hard Gate failure          : なし（Research Gate不成立は tool unavailable であり
                             HARD_GATE_FAILUREとは区別される）
BLOCKED reason             : Wave 1 Research Gate NOT_ESTABLISHED（egress policy 403）
BLOCKED transition         : 発生（Wave 1）→ **解除済み**（D-004、Human提供Evidence）
no_progress_waves          : 0 / 2（LONG_RUN上限）
same_hypothesis_retry      : 0 / 2
repair_strategies          : 0 / 3
```

## Resume instructions

```text
1. RUN_MANIFEST.md から run_id / repository / working branch / base / Task Packet binding を確認
2. TASK_PACKET_SNAPSHOT.md のファイルbytesのSHA-256を再計算し、
   137e9cde09e91cb49a0a57ab20c2e369f892f46ce38836c6529c9823ee10185f と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2e-wind-pressure-trace で現在headを確認
4. EVIDENCE.md のResearch Gate結果を読む（未確立なら実装へ進まない）
5. QUALITY_DEBT.md を読む
6. npm test でtargeted smoke check
7. 上記 Next action から再開する
```


## BLOCKED — escalation summary

```yaml
blocked_at: Wave 1 (Official-source Research Gate)
blocked_reason: primary sources unreachable (egress policy 403 on all candidate hosts)
classification: tool_unavailable  # NOT hard_gate_failure — no actual safety violation occurred
implementation_written: none
source_tests_readme_drift_vs_base: 0
tests: 133 pass / 0 fail (unchanged from baseline)
guessed_formulas_or_coefficients: 0
human_action_required: true
resumable: true  # same branch, same task packet, same digest
```

**何が起きたか**: 一次資料は7件すべて特定できた（title / publisher / public URLをEVIDENCE.mdへ記録）。
しかし本実行環境のegress policyが対象hostすべてを403で拒否しており、原文を読めなかった。

**なぜ実装しなかったか**: Task Packet §5が推測実装を明示的に禁止し、
§5/§9/§19がこの状況を明確にBLOCKEDと規定しているため。
検索スニペットからは係数表（Zb / ZG / α / Gf / Cpe）の**完全な表を復元できず**、
部分的に正しい係数表を建築安全性計算へ実装することは、
実装しないことよりも危険である（D-003）。

**壊していないもの**: source / tests / README / index.html はbaseから無変更。
テストは133 pass / 0 fail のまま。Miyoshi preset・protected invariant・
Phase 2D security boundaryはいずれも無変更。

**再開可能性**: 同一branch・同一Task Packet・同一digestでWave 1から再開できる。


## Wave 2-7 実施サマリ

| Wave | 内容 | 結果 |
|---|---|---|
| 2 | `wind-pressure.js`（汎用風圧算定コア + trace） | 33 tests / 17 mutantすべてkill |
| 3 | PIP v2統合（windInput保存、trace非保存、v1 migration） | 11 tests / 6 mutantすべてkill |
| 4 | UI告示風圧計算モード / trace表示 / Miyoshi参考比較 | 9 tests / 実機4モード確認 |
| 5 | security / privacy / mutation | 4 tests / privacy sweep PASS |
| 7 | README同期（先行実施） | §18の表現規則に準拠 |
| 6 | browser / full regression / independent verifier | 実機PASS。verifier実行中 |

### 設計上の要点

1. **traceをpackageへ保存しない**。保存するのは `windInput` のみで、traceは常に再計算する。
   payloadが主張する中間値・圧力を信用する経路を構造的に作らない（D-008）。
2. **算定基準を二分する**。`notification_baseline`（y=1.00固定）と `itakyo_recommended`（明示選択）。
   業界推奨を告示の最低基準へ暗黙に混ぜない（D-005）。
3. **粗度区分IV→IIIを二層で保持**。入力を書き換えず、読み替えと理由を表示する（D-006）。
4. **式のverifiedが入力をverifiedへ昇格させない**（AC-04）。
5. **自動推定を実装しない**。粗度区分・階→Z・自治体別V0・隅角部判定はすべて明示入力（AC-11 / D-007）。

### Wave 4で自己検出した不具合

取り込みデータのサマリ表示が圧力を未整形で出力していた。preset/manualの値は整数のため
従来は顕在化しなかったが、風圧算定値は非整数になるため
export前 `1967` / import後 `1967.2571022503244` と表示が食い違った。
**値は同一で、表示のみの不具合**。表示層で丸めるよう修正し、roundtripの表示が一致することを確認した。
