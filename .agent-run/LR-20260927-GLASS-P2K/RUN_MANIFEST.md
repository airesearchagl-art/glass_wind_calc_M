# RUN_MANIFEST — LR-20260927-GLASS-P2K

```text
Run ID       : LR-20260927-GLASS-P2K
Phase        : 2K — Verification Instrument Independence
Mode         : LONG_RUN
Horizon      : 8H（endurance は使わない——別途指示がない限り）
Repository   : airesearchagl-art/glass_wind_calc_M
Base         : main @ 7bef30751ebaa2aa0f306f3bd584c4e025be77a1
Branch       : claude/phase2k-verification-instrument-independence
```

## Immutable binding

```text
TASK_PACKET_SNAPSHOT.md sha256 :
  aa68c9c5c820419c1f4413bbb7864a2d9cf49bc7b0b18c69645174cab0c6aa96
```

resume 時に必ず再 hash し、上記と一致することを確かめる。
不一致なら BLOCKED。推測で継続しない。

## Fresh Gate 実測値（2026-09-27）

```text
main exact SHA        : 7bef30751ebaa2aa0f306f3bd584c4e025be77a1   ✓ 期待値と一致
tree                  : clean（0 dirty files）                      ✓
Phase 2J PR #11       : MERGED（2026-09-27T08:37:06Z）              ✓
baseline npm test     : tests 659 / pass 659 / fail 0               ✓
```

### Phase 2J 凍結 head の取り扱い（重要）

```text
Frozen Phase 2J implementation head : e273ef0df4762861c5ffe8224efdea9ad2c9577f
main の系譜上の ancestor か : **NO**
```

PR #11 は **squash merge** されたので、branch の各 commit は main の系譜に入っていない。
よって ancestry では確かめられない。**内容**で確かめた:

```text
f5b4782（P2J branch tip）tree : 387d59c5b8a416d9d6b97293bba00d99bfa835c2
7bef307（main）tree           : 387d59c5b8a416d9d6b97293bba00d99bfa835c2
git diff f5b4782 origin/main     : 空
```

凍結対象ファイルの blob 一致も個別に確認済み:

```text
project-config/evidence.js                identical
project-config/miyoshi.js                 identical
tools/evidence-publication-lint.mjs       identical
tools/guard-diff/mutants.mjs              identical
tools/guard-diff/mutate.mjs               identical
tests/evidence-publication-lint.test.js   identical
```

## Current project state（Phase 2K で変えない）

これを推測で書かない。`evaluateClosure('miyoshi', [])` の実測値である。

```text
status              : BLOCKED
blockerKinds        : ["CASE_NOT_READY","MISSING_OBSERVATION"]
observations        : 0
readySlotCount      : 0  / requiredSlotCount   : 12
readyCategoryCount  : 0  / categoryCount       : 4
readyCaseScopeCount : 0  / caseScopeCount      : 8
promotionCandidate  : null
verifiedCases       : []
dimensions          : sample_default / 1250×2050 / unverified
wind.V0             : 34
wind.roughnessCategory : III
validateAllEvidence(): []
```

> **Wave 0 の最初の発見**として記録する: この state を読む key 名を
> 本セッションは Phase を越えて 3 度違えた（`closureStatus` / `factSlots` /
> `slots` は存在しない）。正しいのは上記の key である。
> これは§23 の形そのもの——**fresh verifier が project state を読む方法が
> どこにも committed されていない**。確認のたびに probe を書き直している。

## Phase 2J artifact

```text
.agent-run/LR-20260921-GLASS-P2J/  は変更しない（§4）。
Phase 2J history の書き換えもしない（§2）。
```

## Human Gate

```text
branch → Draft PR → independent verifier → Human Gate
No direct main / No Ready / No merge / No Production（別途許可がない限り）
```

## Wave 1 で解消したこと（上記 Wave 0 の発見への回答）

上の引用部に書いた「**fresh verifier が project state を読む方法が
どこにも committed されていない**」は Wave 1 で閉じた。

```text
node tools/verification/project-state-probe.mjs
  → 上記の state を stdout に JSON 1 本で出す。key 名を推測しなくてよい。
  → 決定的（byte-identical）。timestamp を含まない。
  → test 7 件が形と保護値を押さえている。
```

以降、この manifest の「Current project state」は手書きの写しではなく
上のコマンドの出力と照合できる。不一致なら manifest が古いと見なす。

ただし probe の出力は **software についての証拠**であって
project Evidence ではない（§21）。verified として import できない。
