# Run State

- Run ID: LR-20260918-GLASS-P2D
- Mode: LONG_RUN
- Horizon: 8H
- Current state: RUNNING（Wave 5 verification中。Independent Verifierの結果待ち）
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2d-project-input-package
- Base SHA: 97bc18e53c7d3a86b3f180f408e265fec3cf5117
- Current head: 本Run Artifact更新commit自身（自己参照のため固定値を書かない。`git rev-parse HEAD` またはPRの現在headで動的に解決する）
- Current wave: Wave 5 — mutation / security / privacy / full regression + independent verification
- Last successful checkpoint: 190b3c432387e447dea27765fbba68b5f322e0b5（control-char fix）
- Task Packet ID: LRP-20260918-GLASS-P2D
- Task Packet revision: 1
- Task Packet snapshot path: .agent-run/LR-20260918-GLASS-P2D/TASK_PACKET_SNAPSHOT.md
- Task Packet SHA-256: 6d38bb4ff293276195a36551bd1d5fb117230d889a0683912145e468f460a7df

## Objective

Phase 2Cで成立した「Miyoshi preset + Manual / Generic + Evidence contract」を基盤として、計算コアの完全な案件非依存化、reusable Project Input Package、generic preset registry、safe import / export / replay、migration / compatibility、security / privacy convergenceまでを1 Campaignとして収束させ、Draft PRで停止する。

最終的に `calc.js` にMiyoshi案件固有値・案件固有ラベル・案件固有provenanceを残さない。

## Acceptance Criteria

- [x] AC-01 Calculation core完全案件非依存化 — **PASS**。calc.jsから3定数を定義・exportとも削除。requireしたexport一覧に3定数が存在せず（undefined）、ソースにMiyoshi識別子・案件固有値・provenance語彙が0件。`tests/calc.test.js` のcore purityテスト2件が継続検査。commit d4a32883
- [x] AC-02 Versioned Project Input Package — **PASS**。`project-config/project-input.js`（schemaVersion 1 / sourceKind 3種 / 寸法 / 圧力 / designPressure / glassType / extraFactor / provenance）。designPressureは常に `max(|正圧|,|負圧|)` で再計算（嘘の値を主張しても上書きされることをテストで確認）。commit ab60842d
- [x] AC-03 Common validator / factory — **PASS**。schemaVersion・sourceKind値域、有限数、W/H>0、designP>0、0<extraFactor<=1.0、known glassTypeのみ、public-safe string、長さ上限、必須field、unknown field拒否、deterministic normalization。`tests/project-input.test.js`
- [x] AC-04 Generic preset registry — **PASS**。`project-config/registry.js`。duplicate reject / unknown fail closed（例外）/ `getPublicLabel()` 境界 / manual（hasFixedPreset: false）は登録不可。built-in以外からの登録経路を持たない
- [x] AC-05 Imported dataをtrusted presetへ昇格させない — **PASS**。payloadが `registered_preset` / `verified` / 案件ラベルを主張しても `imported_unverified` / `unverified` / 中立ラベルへdowngradeし、sourceIdもnull。node testとブラウザ実機の両方で偽装payloadを確認
- [x] AC-06 Safe import / export / replay — **PASS**。Export→Importで計算に用いる全フィールドと候補一覧（先頭構成・許容風圧）が一致。deterministic serialization。backend/localStorage不使用、file://互換
- [x] AC-07 Import security — **PASS**。`__proto__`/`prototype`/`constructor`、16KB超、深さ8超、unknown field、malformed JSON、HTML/script/URL/絶対パス/制御文字を拒否。eval/Function不使用。prototype pollutionが発生しないことを確認
- [x] AC-08 Backward compatibility / migration — **PASS**。consumer（tests 2ファイル・README・miyoshi.jsのコメント）を全移行。案件固有複製をcalc.jsへ残していない。READMEにmigrationセクション（削除したexportと現在の正の対応表・before/afterコード例）を記載
- [x] AC-09 Regression — **PASS**。Miyoshi FL6 W1250→1756 OK / W1500→1463 NG、Manual designP=1400 をnode testとブラウザ実機で確認。テスト数 baseline 91 → 128（純増37）。削除1件は同等カバレッジを既存テストが保持（下記「テスト増減の説明」）
- [x] AC-10 Phase 2D new tests — **PASS**。要求20カテゴリすべてを実テスト名にマッピングして充足を確認（MISSINGなし）
- [x] AC-11 Browser verification — **PASS**。Playwright/Chromium/file:// でMiyoshi・Manual・imported・export/import roundtrip・偽装payload・XSS payload・`__proto__` payload・モード復帰・JSエラーなしを確認
- [x] AC-12 Vercel Preview exact-head — **PASS**。Draft PR #5 のexact head `da13ca9098925d76b9d244d81ee7939f7a1ca968` で state: success「Deployment has completed」を確認。Productionへはdeployしていない
- [x] AC-13 Privacy / Disclosure — **PASS**。repository全体sweep（既知プロバイダ / URL / 実行環境パス / session UUID / credential語彙）で新規の実識別子なし。ヒットはパターン定義・Task Packet本文・架空のテストfixtureのみ
- [x] AC-14 Documentation — **PASS**。README同期済み（commit fbcdfc9f）。PR #5 本文をactual final behaviorへ同期済み（Run ID / Task Packet binding / checks / Quality Debt / explicit unverified items / Checkpoint・Resume location / Human Gate / Documentation Sync Trigger を含む）

### テスト増減の説明（AC-09）

baseline 91 → 128。削除は1件のみ（`calc.test.js` の「既定寸法は1250×2050mmのまま」）で、これはcalc.js側のdeprecated複製を検査するテストであり、比較対象の削除により成立しなくなったもの。同等カバレッジ（案件既定寸法が1250×2050であること）は `project-config.test.js` の既存テストが従来から独立に保持している。追加は37件（core purity 2 / project-input 31 / ui-mode-separation 5 ほか）。

## Completed

- Wave 0: Fresh Gate（origin/main == 97bc18e5…、working tree clean、tracked 0、untracked 0）、canonical read（Vault 5文書）、baseline計測（91/0）、Task Packet snapshot + digest binding、Run Artifact 7ファイル初期化（実装開始前）。commit 4cbde645
- Wave 1: calc.js core purity。deprecated案件固有定数3件を定義・export・コメントとも削除し、consumer（tests 2ファイル・miyoshi.jsのコメント）を移行。core purityテスト2件追加。commit d4a32883
- Wave 2/3: `project-config/registry.js`（generic preset registry）と `project-config/project-input.js`（versioned Project Input Package + validator + serialize/deserialize + security boundary）を新設。テスト31件追加。commit ab60842d
- Wave 4: UI integration。importedモード追加、Export / Import UI、runCalc()をProject Input Package経由へ統一、registry経由のpreset lookupへ移行。UI契約テスト5件追加。commit 0b82f143
- Wave 6(先行): READMEをPhase 2D architectureへ同期（migrationセクション含む）。commit fbcdfc9f
- Wave 5(self review): full diff reviewで `project-input.js` がgit上binary扱いになる不具合を自己検出し修正（control-char正規表現のリテラル制御文字をエスケープ表記へ）。commit 190b3c43

## Current implementation state

Wave 1〜4の実装は完了している。

- `calc.js`: 案件固有値・ラベル・provenanceを一切持たない汎用計算コア（export 18件）。計算式・k1・k2・IGU・TP・Low-E・extraFactor既定値は無変更。
- `project-config/miyoshi.js`: 値・verificationStatus・evidenceは無変更。registered presetマーカー `hasFixedPreset: true` の追加と、実態に合わせたコメント同期のみ。
- `project-config/registry.js`（新規）: built-in preset限定のregistry。duplicate reject / unknown fail closed。
- `project-config/project-input.js`（新規）: versioned package + validator + deterministic serialize + 安全なdeserialize（trust downgrade付き）。
- `index.html`: 3モード（案件プリセット / 手入力 / 取り込みデータ）とExport / Import UI。計算入力はモードによらずProject Input Package経由。
- `README.md`: Phase 2D architecture / trust model / security boundary / migrationを記載。

### Consumer inventory（Wave 0調査、AC-08の前提）

```text
tests/calc.test.js            : import(23,24) / 使用(118,147)
tests/project-config.test.js  : 使用(108,124,135)
README.md                     : 記述(79,106,216,411,413)
index.html                    : 直接使用なし（MiyoshiProjectConfig経由のみ）
project-config/miyoshi.js     : コメント内の言及のみ
```

## Checks

```text
Fresh Gate                     : PASS（base SHA一致、working tree clean）
baseline npm test              : PASS（91 pass / 0 fail）
canonical read                 : PASS（Vault read-onlyで5文書取得）
full npm test (current)        : PASS（133 pass / 0 fail。repair waveで+5）
AC-10 coverage audit           : PASS（要求20カテゴリすべてCOVERED、MISSINGなし）
repository-wide privacy sweep  : PASS（新規の実識別子なし）
full diff review (self)        : PASS（1件の不具合を自己検出し修正済み: control-char literal）
browser smoke (Miyoshi)        : PASS（1756 OK / 1463 NG）
browser smoke (Manual)         : PASS（designP=1400）
browser smoke (Imported)       : PASS（roundtrip / 偽装payload downgrade / XSS reject / __proto__ reject）
independent verification       : 実施（別context）。VERDICT FAIL 1件 + 非blocking 4件を受領し、repair wave W7で対応
mutation check (repair対象)     : PASS（M16 k2 cap / M17 ratio除外 / 境界>=・定数・status経路の5 mutantすべてkill）
Vercel Preview exact-head      : repair wave後のheadで再確認（下記 Wave 7 参照）
```

## Hard Checks（Quality Debt化禁止）

```text
Security          : PASS（import security境界。eval/Function不使用、prototype pollutionなし）
Privacy           : PASS（repository全体sweepで新規の実識別子なし）
Authentication    : N/A（本ツールは認証を持たない）
Permission        : PASS（権限・branch protection・credentialの変更なし）
Data integrity    : PASS（designPressureの再計算契約、deterministic serialization、roundtrip一致）
Irreversible data : PASS（不可逆操作なし。main直接write・force push・branch削除なし）
Secret exposure   : PASS（secret/credentialの追加なし）
Trust-boundary bypass    : PASS（imported → registered_preset への昇格経路が存在しない）
Verified-state spoofing  : PASS（payloadのverified主張がdowngradeされることをtest+実機で確認）
```

いずれもwaiver・accepted_by_human・Quality Debt・NOT RUN・INCONCLUSIVEを使用していない。

Independent Verifierは Privacy を FAIL と判定した（AC-13）。repair wave W7で、本Campaignが
Run Artifactへ新規記載していたVercel deployment識別子を3箇所から除去した。
残る1箇所は immutable な `TASK_PACKET_SNAPSHOT.md`（Task Packet本文のverbatim）内にあり、
digest binding（`6d38bb4f...`）を壊さずには除去できないため、**Humanの判断事項として保留**する
（詳細は DECISIONS.md D-600）。自己判断でdigestを変更していない。

## Quality Debt

現時点で計上されているQuality Debtはない（詳細は QUALITY_DEBT.md）。

## Explicit unverified items

```text
1. ガラス1枚の実見付W/H（1250×2050はdimensions.mode=sample_default / unverifiedのまま）
2. 階別正圧 1297 / 1525 / 1695 / 1729 N/m² の元となる外装材・ガラス構造計算書
3. 負圧 918 / 1122 N/m² の元計算根拠
4. 各階評価高さZとpresetのexact mapping
```

Phase 2Dでもこれらを推測でverifiedへ昇格させない。

## Known failures

```text
none
```

## Decisions

DECISIONS.md を参照。

## Files changed

```text
calc.js                                （案件固有定数3件の削除。計算ロジックは無変更）
project-config/miyoshi.js              （hasFixedPresetマーカー追加 + コメント同期。値は無変更）
project-config/registry.js             （新規）
project-config/project-input.js        （新規）
index.html                             （3モード / Export・Import / package経由の計算）
README.md                              （Phase 2D architecture / migration / tests）
tests/calc.test.js                     （core purity 2件追加、deprecated依存の除去）
tests/project-config.test.js           （calc.js複製との比較を canonical値の直接pinへ置換）
tests/project-input.test.js            （新規 31件）
tests/ui-mode-separation.test.js       （Phase 2D UI契約 5件追加）
.agent-run/LR-20260918-GLASS-P2D/*     （新規、Wave 0で初期化し各Waveで更新）
.agent-run/LR-20260917-GLASS-P2C/*     （Phase 2C closeout。snapshot本文・digestは無変更）
```

## Remaining tasks

```text
1. （完了）Independent Verifierの結果を反映。Wave 7 repairを実施
2. Human判断待ち: TASK_PACKET_SNAPSHOT.md内に残るVercel deployment識別子の扱い
   （immutable digest bindingと privacy boundary が競合。詳細 DECISIONS.md D-600）
3. Human Gate: Ready for Review / merge / Production の可否
```

Draft PR #5 は作成済み（OPEN / Draft / merged=false）。Vercel Preview は exact head で READY 確認済み。PR本文も同期済み。

## Next action

なし（agent側で自律的に進める作業は残っていない）。Human判断を待つ。
Ready化・merge・Productionは行わない。

## Stop conditions status

```text
Fresh Gate                 : PASS
Hard Gate failure          : Privacy FAIL（verifier指摘）→ Wave 7で是正。残1件はHuman判断へ回付
BLOCKED transition         : 発生していない
no_progress_waves          : 0 / 2（LONG_RUN上限）
same_hypothesis_retry      : 0 / 2
repair_strategies          : 1 / 3（Wave 7 repair）
```

## Resume instructions

```text
1. RUN_MANIFEST.md から run_id / repository / working branch / base / Task Packet binding を確認
2. TASK_PACKET_SNAPSHOT.md のファイルbytesのSHA-256を再計算し、
   6d38bb4ff293276195a36551bd1d5fb117230d889a0683912145e468f460a7df と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2d-project-input-package で現在headを確認
4. 本RUN_STATEの Repository / Working branch / Acceptance Criteria / Explicit unverified items が
   non-emptyであることを確認
5. QUALITY_DEBT.md を読む
6. npm test でtargeted smoke check
7. 上記 Next action から再開する
```


## Wave 7 — Independent Verification repair（追補）

Independent Verifier（別context）の指摘に対する対応。

| # | 指摘 | 重大度 | 対応 |
|---|---|---|---|
| 1 | Vercel deployment識別子がpublic repoへ新規混入（AC-13） | BLOCKING | 本Campaignが記載した3箇所を除去。snapshot内1箇所はHuman判断へ回付（D-600） |
| 2 | 複層 厚板/薄板 > 2.5 の除外がcandidate levelで未固定（mutant M17 survive） | MEDIUM | テスト3件追加。M17含む5 mutantをkill |
| 3 | `K2_RATIO_CAP = 2.0` が未固定（mutant M16 survive） | LOW-MEDIUM | 同上。cap値と「cap超は寄与しない」性質を固定 |
| 4 | `fromPreset()` が `hasFixedPreset` 自称objectを受理（defense-in-depth） | LOW | registryとの**同一性**検証を追加。`registered_preset` の sourceId もregistry登録済みに限定（D-601） |
| 5 | `calc.js` に小文字 `miyoshi` がpath pointerとして残存 | INFO | purity testを厳格化（コメント内のpath pointerのみ許容）し、意図を明示 |

いずれも既存のprotected invariant・計算値・preset値を変更していない（AC-09値は再実測で不変）。
