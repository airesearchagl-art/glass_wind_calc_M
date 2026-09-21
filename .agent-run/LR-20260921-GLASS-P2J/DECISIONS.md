# Decisions — LR-20260921-GLASS-P2J

## D-000 — digest定義

`TASK_PACKET_SNAPSHOT.md` のファイルbytesに対するSHA-256。
Phase 2D〜2Iと同一。Resume時に再計算して一致を確認する。

```text
aa9ce07dac4767afc0ad9ff4b13663ae8cc2ab1be98e9e44ef80498da3acc446
```

## D-001 — 一次資料の可用性を、推測ではなく実測で決める（§17）

Phase 2J の結論は「資料があるか」で大きく変わる。
そこで Wave 0 の時点で、思い込みではなく実際に探した。

```text
この container に存在する repository:
  glass_wind_calc_M / glass_wind_calc_m / obsidian-vault

obsidian-vault（read-only で調査。§18が許す範囲のみ）:
  ファイル数 479
  01_Projects 配下に glass_wind_calc 系のフォルダ  : 無し
  "glass_wind_calc" / "耐風圧" を含むファイル       : 0件
  1297 / 1525 / 1729 / 2050 を含むファイル          : 0件
  1695 / 918 / 1122 / 1250 の一致                   : すべて git SHA の一部（偶然一致）
  「見付」「評価高さ」を含むファイル                : 0件
  ドメインに触れるファイル 2件を確認したが、
  pane寸法・圧力の出典・floor↔Z mapping はいずれも持っていない
```

**判定: 一次資料は本セッションから到達できない（UNAVAILABLE）。**

したがって §17 のとおり:

- 推測しない
- 架空の Observation を現案件の候補として作らない
- software workflow は作る
- project closure は `BLOCKED_BY_MISSING_EVIDENCE`
- promotion は `NONE`

これは失敗ではなく、正しい Evidence boundary である（§17 の明文）。
Phase 2J の成果物は「昇格」ではなく、
**何が揃えば昇格できるかを機械可読にしたもの**になる。

## D-002 — Evidence contractは再利用し、Phase 2J側に再実装しない（§3 / §11）

Wave 1 で実際の export surface を実測した。packet §3 が列挙する canonical API は
`project-config/evidence.js` の export と**完全に一致**していた（推測ではなく実測）。

したがって Phase 2J は以下を**一切書かない**:

```text
checkedAt validation / evidence-level validation / private-provider denylist /
URL validation / credential detection / promotion rules / source-reference正規化 /
fact allowlist / reconciliation順序 / case-level critical facts
```

Phase 2J が持つのは **scope**（どのfloor / どのzoneのfactか）という
orchestration責務だけである（§10）。

## D-003 — inherited-field consumption を Wave 1 で実測・修理した（§18〜§26）

### 実測（修理前 / positive control 付き）

packet §18 の Test A〜D をそのまま実行した。**9経路すべてが継承値を消費した**:

```text
CONSUMED  createEntry(Object.create(spec))                  （A1）
CONSUMED  createEntry({... evidence: Object.create(ev)})    （A2）
CONSUMED  assertPromotionGate('verified', Object.create(ev))（B1）
CONSUMED  assertPromotionGate(..., Object.create(options))  （B2）
CONSUMED  assertSourceReference(Object.create(ref))         （C1）
CONSUMED  canonicalizeSourceReference(Object.create(ref))   （C2）
CONSUMED  validateVerifiedCase(Object.create(caseObj))      （D1）
CONSUMED  validateVerifiedCase: evidence container 継承      （D2）
CONSUMED  validateVerifiedCase: 個別Evidence 継承            （D3）
```

成立機序は3つが重なっている:

1. `Object.keys()` ベースのallowlistは継承keyを見ないので**空虚に真**になる
2. `field in caseObj` は prototype chain を見るので必須field検査として弱い
3. 契約値そのものは `evidence.level` のような素のproperty readで prototype から読まれる

### 名前（§20）

`Object.prototype` は**変更されていない**（実測: own enumerable keys は `[]`、
`({}).level === undefined`）。したがってこれは **prototype pollution ではない**。
正しい名前は **inherited-field consumption /
custom-prototype contract-value injection** である。

名前を取り違えると対策が key sanitization の方向へ逸れる。
正しい名前は修理を「1か所の構造ガード」へ導く。Phase 2I と同じ教訓。

### 最も見落としやすかった経路: A2（snapshot による漂白）

`createEntry` は TOCTOU対策として `spec.evidence.*` を一度だけ読んで
素のliteralへ写す。その結果 **gateが見るのは漂白済みのliteral**になり、
gate側に構造ガードを置いても A2 は塞がらない。
呼び出し側objectを**読む地点**で閉じる必要がある。

### 逆向きの漂白: own `__proto__`（§24）

`JSON.parse('{"__proto__":{...}}')` は prototype を差し替えず **own key** を作る。
よって prototype 判定だけでは通過する。実測すると、このkeyを保持したまま
下流で `Object.assign({}, value)` が起きると `Object.prototype.__proto__` の
setter が発火し、**copyのprototypeが差し替わる**（実測で確認）。

つまり A2 が「prototype → literal」の漂白だったのに対し、
これは「literal own key → prototype」の**再生**である。
値自体は無害でも運搬体として危険なので、予期しないown fieldとして塞いだ。

### 修理（§21 / §22）

canonical guard `assertOrdinaryObject(value, label)` を
`project-config/evidence.js` に**1つだけ**定義し、実際の trust boundary で呼ぶ。
field ごとの継承チェックは増やさない（増やすと前段が生きている限り後段が
発火せず、どちらが効いているのか分からなくなる）。

| module | 閉じた地点 |
|---|---|
| evidence.js | `assertEvidenceConsistency` の evidence / `assertPromotionGate` の options / `assertSourceReference` |
| evidence-ledger.js | `createEntry` の spec と **spec.evidence（漂白前）** / `evaluateCasePromotion` options / `reconcileFact` options と ledgerEntry |
| miyoshi.js | `validateVerifiedCase` の caseObj / evidence container / sourceReferences container、および `in` → `hasOwnProperty` |

修理後、9経路すべてが構造を理由に拒否されることを再実測した。

## D-004 — null prototype は通す（§23 の明示的決定）

`Object.create(null)` は通す。継承元が無い＝継承値が入り得ないため、
required field は必ず own property になる。`Object.prototype` 付きより素直なデータである。

これは「たまたま通っている」のではない。テスト P2J-TB13 で固定し、
mutation（`proto !== null` を削って null prototype を拒否させる）で
テストが落ちることも確認した。

既存の `project-profile.js` / `review-package.js` の同名guardも同じ決定をしており、
リポジトリ内で判断が割れていないことを実測で確認した。

## D-005 — `in` → `hasOwnProperty` は到達可能なので削除せず testで固定した

Wave 1 の mutation test で、`hasOwnProperty` を `field in caseObj` へ戻す mutant が
**生存**した。構造ガードが先に custom prototype を弾くため、通常経路では差が出ない。

ここで「差が出ない＝不要」と判断して削除しない。差が消えるのは
「`Object.prototype` が汚れていない」という前提の下だけであり、
それは本moduleが保証している事実ではない。
つまり**到達不能ではなく、到達可能だがテストが無かった**。

Phase 2H D-011（到達不能なら削除、到達可能なら testで固定する）に従い、
`Object.prototype` を一時的に汚染して必須field検査が成立することを確認する
テスト P2J-TB18 を追加した（`finally` で汚染を必ず戻し、戻ったことも assert する）。
これにより当該 mutant は kill された。

## D-006 — 現案件のfactは一切動かしていない（§27）

Wave 1 は構造ガードとテストのみを追加した。実測で確認:

```text
verifiedCases            : []            （変更なし）
dimensions.mode          : sample_default（変更なし）
dimensions.defaultW      : 1250 / unverified
dimensions.defaultH      : 2050 / unverified
positivePressureByFloor  : 1:1297 2:1525 3:1695 R:1729（全て partially_verified / indirect）
negativePressureByZone   : general:918 corner:1122   （全て partially_verified / indirect）
wind.V0                  : 34            （32へ変更していない）
wind.roughnessCategory   : III           （変更なし）
```

テスト P2J-TB16 でこの状態を固定した。
