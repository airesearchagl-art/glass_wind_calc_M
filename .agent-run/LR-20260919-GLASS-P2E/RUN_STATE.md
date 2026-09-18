# Run State

- Run ID: LR-20260919-GLASS-P2E
- Mode: LONG_RUN
- Horizon: 8H
- Current state: RUNNING（Wave 0完了 → Wave 1 Research Gateへ）
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2e-wind-pressure-trace
- Base SHA: a26714c6dd2d8bca80e18fcf1e97d7d184c9254f
- Current artifact-sync head: `RESOLVE_DYNAMICALLY` — `git rev-parse HEAD` またはPRの現在headで解決する（自己参照回避contract）
- Current wave: Wave 0 — Fresh Gate / Phase 2D closeout / Run Artifact / baseline
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

- [ ] AC-01 Research Gate（primary public sourcesへtrace可能、memory-only implementation 0）
- [ ] AC-02 Generic Wind Core（project-independent pure module、Miyoshi literal 0）
- [ ] AC-03 Traceability（inputs → intermediates → final、丸めは表示時のみ）
- [ ] AC-04 Formula vs Input verification separation（trust promotion禁止）
- [ ] AC-05 Notification mode（既存3 mode回帰なし）
- [ ] AC-06 Project Input integration（GlassCalcへのbypass禁止）
- [ ] AC-07 Design pressure contract維持
- [ ] AC-08 Replay（export → import → recalculate）
- [ ] AC-09 Migration（PIP v1非破壊、unknown future version fail closed）
- [ ] AC-10 Miyoshi diagnostic（comparison ≠ replacement）
- [ ] AC-11 No automatic Z inference
- [ ] AC-12 Error boundary（fail closed、NaN/Infinity reject）
- [ ] AC-13 Unit discipline
- [ ] AC-14 Known-answer tests
- [ ] AC-15 Miyoshi regression（1756.09756… / 1463.41463… / Manual 1400）
- [ ] AC-16 Existing tests（baseline 133以上、0 fail）
- [ ] AC-17 Browser（4 mode、JS error 0）
- [ ] AC-18 Security（Phase 2D boundary維持）
- [ ] AC-19 Privacy（official public source URLは可）
- [ ] AC-20 Documentation

## Completed

- Wave 0: Fresh Gate実測（origin/main == a26714c6…、tree clean、tracked 0 / untracked 0）
- Wave 0: branch `claude/phase2e-wind-pressure-trace` を origin/main から作成
- Wave 0: baseline `npm test` 実測 133 pass / 0 fail（per-file内訳はRUN_MANIFEST）
- Wave 0: Run Artifact 7ファイルを実装開始**前**に作成、Task Packet digestをbinding
- Wave 0: Phase 2D Run Artifactへpost-merge closeoutを記録（snapshot / digestは不変）

## Current implementation state

実装未着手。Wave 1 Research Gateの結果が確定するまで、
風圧式・係数・適用条件に関するコードを書かない（Task Packet §5 Hard rule）。

## Checks

```text
Fresh Gate                     : PASS（base SHA一致、working tree clean）
baseline npm test              : PASS（133 pass / 0 fail）
canonical read                 : 実施予定（Wave 0-1）
Research Gate                  : 未実施（Wave 1）
```

## Hard Checks（Quality Debt化禁止）

```text
Safety-critical formula mismatch : 未評価（Wave 1-2で成立させる）
Security                         : 未評価
Privacy                          : PASS（現時点でprivate識別子の追加なし）
Permission                       : PASS（権限・branch protection・credentialの変更なし）
Data integrity                   : 未評価
Secret exposure                  : PASS
Trust-boundary bypass            : 未評価
Verified-state spoofing          : 未評価
```

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
Wave 1-7（TASK_QUEUE.md参照）
```

## Next action

Wave 1 Official-source Research Gate。一次資料を実読し、採用する式・係数・適用範囲・
未確認事項を EVIDENCE.md へpublic-safeに記録する。確認できない部分は
UNVERIFIED / NOT_IMPLEMENTED として明示し、推測実装しない。

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
   137e9cde09e91cb49a0a57ab20c2e369f892f46ce38836c6529c9823ee10185f と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2e-wind-pressure-trace で現在headを確認
4. EVIDENCE.md のResearch Gate結果を読む（未確立なら実装へ進まない）
5. QUALITY_DEBT.md を読む
6. npm test でtargeted smoke check
7. 上記 Next action から再開する
```
