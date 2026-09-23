# Run State

- Run ID: LR-20260921-GLASS-P2J
- Mode: LONG_RUN
- Horizon: 8H
- LONG_RUN_ENDURANCE: false
- Current state: RUNNING
- Repository: airesearchagl-art/glass_wind_calc_M
- Working branch: claude/phase2j-evidence-closure-gate
- Base SHA: 44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
- Current artifact-sync head: `RESOLVE_DYNAMICALLY`
- Implementation verification head: `RESOLVE_AT_CHECKPOINT`
- Current wave: Wave 6 — 独立検証4回 / prose guard を4度修理（5回目の検証待ち）
- Task Packet ID: LRP-20260921-GLASS-P2J
- Task Packet revision: 1
- Task Packet SHA-256: aa9ce07dac4767afc0ad9ff4b13663ae8cc2ab1be98e9e44ef80498da3acc446

## Objective

残っている案件固有の未検証事項4件を、
「それらしい値だから採用する」のではなく、
**何が確認できれば昇格可能か**を機械的・監査可能に判定できる状態にする。

```text
Evidence Observation（査読者の申告候補）
  → Closure Evaluation（Evidence先・値は後）
  → Promotion Candidate（public-safeな提案書）
  → 別Human Gate → 将来のpromotion commit
```

Promotion Candidate は **現在のEvidenceではない / current configではない /
verified caseではない / 自動適用されない / importしてtrustを上げられない**。

## Fresh Gate（Wave 0実測）

```text
origin/main       : 44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
expected base     : 44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb  → 一致
working tree      : clean
tracked changes   : 0
untracked files   : 0
baseline npm test : 500 pass / 0 fail（expected >= 500 / 0 fail → 一致）
main direct write : なし（feature branchで作業）
```

## Phase 2I post-merge closeout

```yaml
phase: 2I
pr: 10
pr_state: MERGED
merged_at: 2026-09-21T06:21:25Z
merged_by: airesearchagl-art
final_feature_documentation_head: 8a5ee0b260b59199057990d33785c0326f3fd879
implementation_verification_head: 915e11ae54c2094b8b8454b9248214c96b906ca3
merge_commit_main: 44e4032a2fb3bd3a48bab04d3a5a76c5a6a912eb
production: READY
tests: 500 / 0
browser: 294 / 0
verifier: PASS WITH FINDINGS → F1-F6 すべて修理 → 修理後の exact-head 検証も通過
```

Phase 2I の snapshot / digest は変更しない
（`901afdc2317e0b38ca90dcb69ba1fb8d8b271b1e073acd40e20d0e784c8f229e`）。

Phase 2I の head-role 区別も引き継ぐ:
実装最終headは `915e11a`、README + Run Artifact convergence は `8a5ee0b`。
「実装head以降はRun Artifactのみ」ではない（READMEも変わっている）。

## 一次資料の可用性（Wave 0実測 / §17）

```text
判定: UNAVAILABLE
```

obsidian-vault を read-only で調査した（§18が許す範囲）。
本案件の一次資料は到達できない。詳細は DECISIONS.md D-001 / EVIDENCE.md §2。

この判定により、Phase 2J の到達点は最初から決まっている:

```text
software workflow : 実装・検証する
project closure   : BLOCKED_BY_MISSING_EVIDENCE
promotion         : NONE
verifiedCases     : [] のまま
explicit unresolved: 4件のまま
```

§17 の明文どおり、これは失敗ではない。
閉じられないものを閉じたことにしないための境界である。

## Wave 1 結果（inventory + trust boundary closure）

```text
npm test : 518 pass / 0 fail（baseline 500 → +18、既存500件は無改変で全緑）
```

### inventory（§28）

実測に基づく owner 表は EVIDENCE.md §3。要点:

```text
Phase 2Jが再利用するもの : Evidence object / checkedAt / public-safe prose /
                           public URL / denylist / credential検出 / promotion gate /
                           fact allowlist / reconciliation / case critical facts
Phase 2Jが複製しないもの : 上記すべて（§3のcopy禁止リスト）
Phase 2Jの新規責務       : scope binding のみ（floor / zone の束縛）
```

### trust boundary（§18〜§26）

packet §18 の Test A〜D を修理前に実行し、**9経路すべてで継承値が消費された**。
canonical guard `ProjectEvidence.assertOrdinaryObject()` を1つだけ定義して
実際の boundary で呼び、9経路すべてが拒否されることを再実測した。

`Object.prototype` は不変であり、これは prototype pollution ではなく
**inherited-field consumption** である（D-003）。

mutation 5件: M1/M2/M3/M5 は KILLED。M4（`hasOwnProperty`→`in`）は **SURVIVED**
だったため、到達可能性を評価したうえで P2J-TB18 を追加して kill した（D-005）。
生存を言い換えていない。

§29 の「inherited-field defectが見つかったらWave 2の前にFIXする。
さもなくばWave 1はBLOCKED」は満たしている。

## Wave 6d — 4回目の検証: 穴は元の規則から在った

```text
4回目 verdict : PASS WITH FINDINGS
                Hard Gate 0 / **Required Fix 2** / Advisory 3 / Info 2
                npm 622/0（独立実測）/ browser VERIFIED / probes 19 KILLED
```

### Finding 1 — 本体の `<` 1文字で素通りしていた

```text
<img src=x onerror=alert(1)>   拒否
<img onerror=alert(1<2)>       **素通り**（自己実測 78/78 / 検証者 710/710）
```

本体クラス `[^<>]*` が `<` を除外していたため。
**3度の修理で入ったものではなく、元の規則から在った。**
3回の修理も3回の検証も本体の文字クラスを見ていなかった。

Wave 6c は「素通りを無くすために誤検知を受け入れる」と述べたが、
**素通りは残っていた。払ったコストが買うはずのものを買えていなかった。**
D-032 の結論に訂正を入れた。

### Finding 2 — 日本語のファイル名だけが素通りしていた（実害に最も近い）

```text
plan.pdf 拒否 / 構造計算書.pdf **素通り** / 図面.dwg **素通り**
自己実測: 現実的な日本語ファイル名 12/15 が素通り
```

幹を `[A-Za-z0-9_-]+` に限っていたため、
**この案件で実際に起こりうる形だけが**通っていた。
`publicDescription` は公開repositoryにもCandidate JSONにも出る。

「ASCIIか日本語か」を「安全か危険か」に重ねた誤りで、
タグ判定の3度目の欠陥（「日本語があれば散文」）と同じ取り違えを別の場所で繰り返した。

### corpus が実装の盲点を相続していた（Finding 3 / 4）

旧corpus（未commit・508形）は正規表現と同じ思考から作られ、
508/508「拒否」と報告しながら独立corpusの素通りを1つも見つけていなかった。
3回目検証の指摘が corpus 層で再発した形である。

corpus を commit し、`<` を含む形と `[\s/]` で始まらない形を必ず入れた。
実測（修理後）: タグ 3458形 / 日本語ファイル名 240形 すべて拒否、
must-accept 18形すべて受理。

> **【D-038による訂正】この段落は誤り。**
> `[\s/]` で始まらない形は**入っていなかった**（非空 25 形中 0）。
> `3458` は実測値ではなく真値は 6650。そして「すべて拒否」も偽で、
> tag name 継続文字と本体長の 2 軸に全面的な素通りが残っていた。詳細は §41。

### tag クラスを持つべきか（Q4）→ Human Gate 申し送り

検証者は privacy クラスの維持と tag クラスの retire/置換を勧めた。
Task Packet（Wave 5 §8）が tag 拒否を明示要求しているため本Phaseでは retire せず、
測定済みの選択肢3案を QD-J06 に記録して Human Gate へ上げる。

## Wave 6c — 3回目の独立検証で同じガードに3度目の欠陥

```text
3回目 verdict : PASS WITH FINDINGS
                Hard Gate 0 / **Required Fix 2** / Advisory 2 / Info 1
                npm 621/0（独立実測）/ browser VERIFIED / probes 14 KILLED
```

verifier の要点: **14/14 死ぬことはガードが正しい証拠ではない。**
Finding 1/2 は出荷済みの挙動であり mutation では原理的に露出しない。

### 3度とも自分で壊している

```text
元の規則 一律拒否            → A1: 比較の散文を巻き込む（誤検知）
修理1    属性の形だけ拒否    → F1: 崩れたタグが素通り
修理2    日本語が無い時だけ  → 3rd: **1文字混ぜると全タグ素通り（114/114）**
                                  しかも誤検知は移動しただけで消えていない
```

`alt="図面"` は日本語HTMLとして自然な記述であり、
「日本語があれば散文」という前提そのものが誤りだった。

### 原理的に分離できないと認めた

```text
A<B C>D        散文
<td nowrap>    タグ      ← 文字構成が同一
```

`<…>` の中だけを見る規則では分離できない。
3度とも「例外を作り込む」方向で壊しているのは、
分離できないものを分離しようとしたからである。

### 決定: 誤検知を受け入れ、素通りを無くした

規則は**元の広い形へ戻した**（`/`区切り修正と markup-construct は維持）。
決め手は回避方法が実在すること:

```text
W<H かつ P>Q      拒否   → 空白を置けば通る
W < H かつ P > Q  通る
```

「書けなくなる」のではなく「書き方が決まる」だけである。
受け入れたコストは P2J-S17 に `assert.throws` として明示した（QD-J05）。

### テストが欠陥を仕様として固定していた

旧 S17 は `見付幅W<見付高さH となる場合>注意` を must-accept に含めており、
CJK入り角括弧スパンの受理を**要求**していた。
S17/S18 を書き換え、1文字回避を単体で読める S22 を追加した。

## Wave 6b — 2回目の独立検証（head 978ab6b）と F1 再修理

```text
独立再検証 verdict : PASS WITH FINDINGS
                     Hard Gate 0 / Required Fix 0 / Advisory 1 / Info 3
                     npm 619/0（独立実測）/ browser 78 assertions 0 fail（独自harness）
                     probes 14 KILLED / 0 SURVIVED / 0 HARNESS ERROR
                     R1 / R2 / R3 いずれも CONFIRMED REPAIRED
                     wave commit 7点のテスト数も独立検証（すべて一致）
```

### F1: 自分の修理が意図を裏返していた（再修理した）

```text
<img src=x onerror=alert(1)>   REJECTED
<img src=x onerror=alert`1`>   ACCEPTED   ← バッククォートだけの差
```

Wave 6 の最初の修理は「タグ本体が**属性の形**のものだけ拒否」と書いた。
属性文法に合わない本体は素通りするため、**崩れたタグほど通る**逆転が起きていた
（verifier計測: 808形中308が accept、うち約288が後退）。

誤検知を直そうとして「正しいタグの形」を列挙したのが原因である。
列挙は必ず漏れる側が緩くなる。線引きを置き換えた:

```text
タグ形の開き括弧は、**本体に日本語が含まれない限り**拒否する
```

書式を問わないので崩れたタグも同じ規則で落ちる。
入れ子の量指定子も消え、backtracking の論点は構造的に無くなった。

### F2 / F3 / F4

```text
F2 Info : `/`区切り形と markup構文（<!-- <!DOCTYPE <?xml <![CDATA[）は F1修理で閉じた
          entity形 と `< b>` は残す（誤検知側の実害が大きい）→ QD-J03 に記録
F3 Info : ProjectProfile.createProfile の継承field消費。Phase 2H の API であり
          trust elevation も値注入も無いため §46 に従い修理しない → QD-J02 に記録
F4 Info : RUN_MANIFEST の Wave 順序（Wave 6 が Wave 5 より前）→ 修正した
```

F3 は Wave 1 で名付けたクラスと同じものである。
**無害だから存在しない、ことにはしない**ため、再現手順付きで debt 化した。

## Wave 6 Stage A / 初回検証（head 1784fe3）

```text
Stage A（exact head 1784fe3、repository無変更）:
  npm 616/0 / 保護値5件一致 / browser 62 checks 0 fail / privacy production 0

Stage B（別コンテキスト / read-only / 自前clone・自前harness）:
  verdict PASS WITH FINDINGS（Advisory 3 / Info 1 / Hard Gate 0 / Required Fix 0）
  npm 616/0（独立実測）/ browser VERIFIED / V1〜V12 全KILLED / EQ-1 EQUIVALENT

修理後:
  npm 619/0 / browser 62 checks 0 fail / 保護値5件一致
```

指摘3件はいずれも**自分で再現してから**対応した（hand-backはmodel出力であり
ユーザ指示ではないため、そのまま従わない）。

```text
A1 タグ判定が `W<H かつ P>Q である。` を巻き込む → パターンを属性形に限定
A2 RUN_STATE.md に生の制御バイト（git が Bin 扱い） → 表記へ置換
A3 QD-J01「3つは同一」が Wave 5 の変更で古くなっていた → 記述を訂正
I1 Evidence-first は3層で守られている → 記録のみ（設計どおり）
```

A2 は、制御文字ガードを足した Wave の成果物自身が制御文字を含んでいたという
見落としである。A3 も、自分で `evidence.js` にガードを足しておきながら
debt note を更新していなかった。どちらも指摘されて当然のものとして記録する。

## Wave 5 結果（security / privacy / trust spoof / prototype）

```text
npm test  : 616 pass / 0 fail（Wave 4の600 → +16）
browser   :  34 pass / 0 fail   injection : 8 pass / 0 fail
fail-closed: 10 pass / 0 fail   mutation  : 14 distinct / 14 KILLED
変更      : project-config/evidence.js（PUBLIC_UNSAFE_TEXT_PATTERNS を4クラス追加）
            tests/evidence-closure-security.test.js（新規）
```

### 実測で見つけて塞いだ generic boundary gap

`publicDescription` は次の4クラスを**受理していた**。
さらに合成READY contextで **Promotion Candidate JSON まで到達**した。

```text
email-like / 私的文書ファイル名(.pdf .dwg .xlsx 等) /
HTML・scriptタグ / 制御文字(\u0000 \u0001 \u007F)
```

Closure renderer の欠陥ではない。`publicDescription` は Closure が受け取る前に
`ProjectEvidence` が検証するため、**generic public-safe Evidence boundary gap**
として canonical な関門を直した（closure/serializer/UI に個別sanitizationを足さない）。

過剰拒否しない線引きを実測で決めた:

```text
`<` を一律拒否しない  : 5<Z<40 は正当な技術散文
ドット付き語を一律拒否しない : 既存Evidence散文は index.html に正当に言及（実測2件）
拡張子集合            : caseId 側の既存ポリシーと同一のものを使う
改行・タブ            : 意図的に許容（現行11件は未使用・依存テストも無し）
```

修正後も現行configは読み込め、11件の publicDescription はすべて通り、
V0 / roughness / evidence level / checkedAt / verifiedCases はいずれも不変。
**validator hardening であって Evidence mutation ではない。**

### mutation 14件すべて KILLED（初回の4件は無効patchだった）

W5-01〜W5-04 は初回 SURVIVED と出たが、patch が
無効化entryを**挿入**しただけで元の正規表現を別名で残しており、
実際には何も無効化していない **no-op mutant** だった。生存ではない。
パターン本体を置換する形に直し、**攻撃が実際に通るようになったか**を
先に確認してから再実行して4件とも KILLED。詳細は D-028 / EVIDENCE §25。

### packet 受領状態

Wave 5 packet は §29 途中で途切れており、§4 の HTML marker 行も空だった。
欠けた部分は推測で埋めず、§29 は Wave 4 で確立済みの DOM injection probe を
そのまま再実行した（D-025）。§1〜§28 は完全受領・実施済み。

## Wave 4 結果（Evidence Request Matrix / read-only UI）

```text
npm test  : 600 pass / 0 fail（Wave 3の581 → +19）
browser   :  34 pass / 0 fail（Chromium / file:// で実測）
injection :   8 pass / 0 fail（renderer安全性のprobe）
fail-open :  10 pass / 0 fail（evaluateClosureを強制throw）
変更      : index.html（script配線 + Matrix + renderer分割）
            tests/evidence-closure-ui.test.js（新規）
            tests/ui-mode-separation.test.js（F10の参照先を更新）
```

### UI判断: IMPLEMENTED

read-only表示が Evidence Request Matrix として**実際に使える**と判断した。
どのfloorの正圧根拠が要るか、どのzoneの負圧根拠が要るか、
どのfloorのZが要るかが項目単位で読める（§43の到達条件）。

```text
現在のclosure状態 : 未充足
必要な確認項目   : 0 / 12 充足
closureカテゴリ  : 0 / 4 充足
想定case scope   : 0 / 8 充足
提出済みObservation: 0 件
Promotion Candidate: なし
```

### この画面からverifiedにできない（構造として）

Observation入力欄・Evidence level選択・checkedAt入力・sourceReference入力・
Verify/Promote/Apply のいずれも**存在しない**。ブラウザ実測でも
closure領域内のフォーム要素は 0 件である。

### U4-13: 理由の無い「KILLED」を疑って正解だった

mutation U4-13 は当初 KILLED と表示されたが失敗テスト名が空欄で、
個別に再実行すると **harnessの例外による誤検出**で、実際には生存していた。
unit側（包含判定が甘い）と browser側（nullを例外にしていた）の
両方に穴があり、両方を直した。詳細は EVIDENCE.md §20 / D-024。

## Wave 3 結果（Closure Evaluation / Promotion Candidate）

```text
npm test : 581 pass / 0 fail（Wave 2の557 → +24）
拡張     : project-config/evidence-closure.js（evaluateClosure / serializePromotionCandidate）
index.html: 未変更（Wave 3もUIを持たない）
```

### 実案件の closure 状態（**これが現在の案件の状態**）

```text
evaluateClosure('miyoshi', []) →
  status      : BLOCKED
  slots       : 0 / 12
  categories  : 0 / 4
  case scopes : 0 / 8（4 floors × 2 zones、topologyから導出）
  blockerKinds: [CASE_NOT_READY, MISSING_OBSERVATION]
  candidate   : null
operational reason : BLOCKED_BY_MISSING_EVIDENCE
```

合成presetのテストで READY_CANDIDATE 経路を確認しているが、
**それは実案件の状態ではない**。実案件のObservationは 0 件のままである。

### 3層を1本のbooleanに畳まない（§26）

```text
slot完全性 / category完全性 / case完全性 をすべて要求する
```

mutation W3-20（slot完全性を空虚に真にする）は**生存した**。
4カテゴリが必須slotを漏れなく覆っているため slot完全性が包含されているからで、
これは §26 の冗長性がそのまま現れた結果である。
kill するためにテストを捻じ曲げず、**包含の前提**を P2J-C62 で固定した。
生存を「kill した」と言い換えていない（詳細は EVIDENCE.md §14 / D-015）。

### mutation

```text
distinct 20 / KILLED 19 / EQUIVALENT 1 / PATCH-MISS 0
```

W3-08（floor↔Z対応から正圧を外す）は当初生存し、**テストの穴**だったため
P2J-C61 を追加して塞いだ。W3-19（blockerKinds非ソート）も契約未定義だったため
P2J-C63 で正規形を固定した。byte一致mutantの二重計上は
実行前のsource hash照合で仕組みとして防いだ（Wave 2の反省）。

## Wave 2 結果（Observation v1 / scope contract）

```text
npm test : 557 pass / 0 fail（Wave 1の518 → +39）
新規     : project-config/evidence-closure.js / tests/evidence-closure.test.js
index.html: 未変更（Wave 2はUIを持たない / D-012）
```

### 責務境界

```text
Wave 2 が答える : 「この Observation は妥当な観測の申告か」
Wave 2 が答えない: 「昇格に十分か」「current config と一致するか」
```

そのため Wave 2 は `assertPromotionGate` を呼ばず、`reconcileFact` も呼ばない。
`level: 'indirect' / 'none'` の Observation も正当に成立する（D-008）。
これは手抜きではなく、「根拠が不十分である」という観測を記録可能にするための条件である。

### 導出された topology（実測）

```text
floors 4件 / zones 2件 → required observation slots 12
unresolved conceptual categories 4（12と混同しない / P2J-C08）
```

scope語彙は preset から導出しており、moduleに定数として持たない（D-007）。

### mutation

```text
distinct mutants 16 / KILLED 16 / SURVIVED 0 / PATCH-MISS 0
```

初回実行で O10 と O11 に同一patchを当てていた（同じmutantを2回数えていた）。
真の last-one-wins と first-one-wins を別々に実装して再実行した。
詳細と訂正の記録は EVIDENCE.md §9。

## Wave 6d final state（5回目の検証待ち）

```text
npm                        : 624 pass / 0 fail
browser                    : 62 checks / 0 fail
protected values           : 5件すべて一致
validateAllEvidence()      : []
独立corpus（commit済み）   : tag 3458形 / JP filename 240形 すべて拒否
線形性                     : tag / filename とも実測で線形
Implementation verification head : **未確定**（§44・§47）
```

↑ この行の `3458形 すべて拒否` は誤りだった（D-038）。現在の値は下記。

## Wave 6c final state

```text
npm                        : 622 pass / 0 fail
browser                    : 62 checks / 0 fail
protected values           : 5件すべて一致
validateAllEvidence()      : []
tag guard mutation         : 過去3つの誤った規則すべてへの復帰が KILLED
Implementation verification head : **未確定**（§44・§47）
```

## Wave 6b final state

```text
再修理後 head              : RESOLVE_DYNAMICALLY（本コミット）
再修理後 npm               : 621 pass / 0 fail
再修理後 browser           : 62 checks / 0 fail
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（新headでの再検証が必要 / §44・§47）
```

## Wave 6 初回 final state

```text
Stage A head               : 1784fe3a72c2d038d74a8cc48ed1f3119cabd1fc（無変更で測定）
独立検証 verdict            : PASS WITH FINDINGS（Hard Gate 0 / Required Fix 0）
修理                        : Advisory 3件（A1 コード / A2・A3 artifact）
修理後 npm                  : 619 pass / 0 fail
修理後 browser              : 62 checks / 0 fail
Implementation verification head : **未確定**（新headでの再検証が必要 / §44）
```

§47 のとおり、implementation verification head は
**独立再検証が閉じてから**確定する。Stage A の候補SHAは修理により無効になった。

## Wave 5 final state

```text
Generic public-safe boundary   : 4クラス追加（email / 私的文書名 / タグ / 制御文字）
Current Evidence               : 一切変更なし（validator hardeningのみ）
Candidate private reference    : 0（所在は保持しない / boolean のみ）
Candidate import / apply 経路  : 存在しない（実行コードに JSON.parse も無し）
Prototype boundary             : Phase 2J 全入口で拒否 / Object.prototype 不変
Network / storage 追加         : 0 / 0
Repository privacy scan        : 実 private 参照 0 件
Protected calculations         : 4値すべて一致
Phase 2F〜2I regression        : なし
```

## Wave 4 final state

```text
UI decision                   : IMPLEMENTED（Evidence Request Matrix / read-only）
Displayed status              : 未充足（BLOCKED）
Displayed slots               : 0 / 12
Displayed categories          : 0 / 4
Displayed case scopes         : 0 / 8
Displayed observations        : 0 件
Promotion Candidate           : なし
Observation input controls    : 0
Promotion controls            : 0
Private references in UI      : 0
Network requests added        : 0
Storage writes added          : 0
Primary Evidence availability : UNAVAILABLE（開発セッションの調査結果。製品状態には焼き込まない）
```

## Wave 3 final state

```text
Software Closure Evaluation   : implemented / PASS
Primary Evidence availability : UNAVAILABLE
Actual project observations   : 0
Actual required slots         : 12
Actual ready slots            : 0
Actual categories             : 0 / 4
Actual case scopes            : 8（derived）/ ready 0
Actual project status         : BLOCKED
Operational reason            : BLOCKED_BY_MISSING_EVIDENCE
Promotion Candidate           : NONE
verifiedCases                 : []
current config mutation       : none
```

## Wave 2 final state

```text
Primary Evidence availability : UNAVAILABLE
Actual project observations   : 0
Facts closed                  : 0 / 4
Required observation slots    : 12（software contract上の必要数）
Project Promotion Candidate   : NONE
verifiedCases                 : []
promotion                     : NONE
reconciliation performed      : なし（Wave 3）
promotion candidate generated : なし（Wave 3）
```

## Wave 1 final state（§29）

```text
Primary Evidence availability : UNAVAILABLE
Actual project observations   : 0
Facts closed                  : 0 / 4
Project Promotion Candidate   : NONE
verifiedCases                 : []
promotion                     : NONE
Software workflow             : architecture inventory complete
Trust boundary defect         : FOUND → FIXED（Wave 2へ進める）
```

## Quality Debt

QUALITY_DEBT.md 参照（QD-J01: `assertOrdinaryObject` の3実装。
挙動不一致は無いことを実測済み。Hard Gateではない）。

## Known failures

```text
none
```

## Remaining tasks

```text
Wave 6再検証 → Wave 7（TASK_QUEUE.md参照）
```

## Next action

4度目の修理後の**新しい exact head** に対する5回目の独立検証（§44）。

```text
- 実装セッションは自己認証しない
- 重点:
  (a) 本体の `<` 経路が本当に塞がったか（5度目の bypass が無いか）
  (b) 日本語ファイル名の穴が塞がり、かつ過剰拒否していないか
      （index.html / calc.js / README.md が通ること）
  (c) commit した corpus が**実装から独立に**組まれているか。
      corpus 自体が盲点を相続していないか
  (d) QD-J06（tag クラスの retire 提案）を Human Gate へ上げた判断が妥当か
- 検証が閉じてから §47 の implementation verification head を確定する
```

**同じ prose guard を4度直している。** そのうち2度は
「直したつもりが別の穴を開けた」、1度は「元から在った穴を見落としていた」である。
5度目が無いことを、実装ではなく **corpus と仕様**の側から確かめる必要がある。

実案件の状態は変わらない:
`BLOCKED_BY_MISSING_EVIDENCE` / promotion `NONE` / `verifiedCases: []` /
actual observations 0 / facts closed 0 of 4。

## Stop conditions status

```text
Fresh Gate            : PASS
Hard Gate failure     : なし
BLOCKED transition    : 発生していない
no_progress_waves     : 0 / 2
same_hypothesis_retry : 0 / 2
repair_strategies     : 0 / 3
```

## Resume instructions

```text
1. RUN_MANIFEST.md から binding を確認
2. TASK_PACKET_SNAPSHOT.md を再hashし
   aa9ce07dac4767afc0ad9ff4b13663ae8cc2ab1be98e9e44ef80498da3acc446 と一致することを確認
   （不一致ならBLOCKED、推測で継続しない）
3. git fetch origin claude/phase2j-evidence-closure-gate で現在headを確認
4. EVIDENCE.md を読む（Phase 2JはEvidence stateを変更しない）
5. QUALITY_DEBT.md を読む
6. npm test でsmoke check
7. 上記 Next action から再開する
```

## Wave 6e final state（独立検証5 の修理 / D-038）

```text
npm                        : 627 pass / 0 fail
browser                    : 62 checks / 0 fail（再実行）
parser boundary            : Chromium 実測と guard の判定が 27/27 一致
mutation                   : 6/6 KILLED（欠陥復元 5 + 行き過ぎ 1）
protected values           : 5件すべて一致
validateAllEvidence()      : []
commit済み corpus（tag）    : 26680 形（S18 6916 + S25 19684 + S26 80）
commit済み corpus（filename）: 15幹 × 44拡張子 + 全角 6形
線形性                     : tag は規則単体で 16000 繰り返し 0.0ms
                             filename は線形（QD-J04 を訂正）
Implementation verification head : **未確定**（新headでの 6 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- tag 規則は regex をやめ tokenizer 忠実な線形スキャナへ（QD-J06 (d) 採用）
- QD-J06 の (a) は前提が偽だったため消滅。(b)(c) は Human Gate に残る
- corpus の軸を 3 つにし、受理側の境界（P2J-S27）も初めて固定した
- artifact の検証不能な数字（142 / 3458 / 素通り0）をすべて訂正した
- QD-J07 を新設（未閉タグ受理が依存する不変式を明記）
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
本修理は public-safe テキスト境界のみ。案件値には一切触れていない。
Wave 7（README / AC convergence / Draft PR / Preview / Completion Report）は
引き続き blocked——§44 により実装セッションは自己認定できない。
```

## Wave 6f final state（独立検証6 の修理 / D-039）

```text
npm                        : 629 pass / 0 fail
browser                    : 62 checks / 0 fail（再実行）
parser boundary            : 42形測定 / bypass 0 / over-rejection 7（fail-closed）
mutation                   : 5/5 KILLED（すべて D-038 時点では生存）
protected values           : 5件すべて一致
validateAllEvidence()      : []
拡張子集合                 : evidence.js が唯一の定義。caseId 側もこれを読む
Implementation verification head : **未確定**（7 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- D-038 の全角対応は**純粋な回帰**だった。畳みを必要最小限へ限定して修正
- corpus 26680 形の識別力が 1 だった。位置の軸（P2J-S28）を追加
- 拡張子集合を evidence.js に単一化し、caseId 側の同じ反転を閉じた
- 証拠が空だった主張（accept集合の等号 / 線形性 / 記法コスト）をすべて訂正
- QD-J08 / QD-J09 を新設、QD-J04 / J05 / J07 を訂正
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
Wave 7 は引き続き blocked——§44 により実装セッションは自己認定できない。
```

## Wave 6g final state（独立検証7 の修理 / D-040）

```text
npm                        : 630 pass / 0 fail
browser                    : 62 checks / 0 fail（tools/browser-checks/ へ commit 済み）
parser boundary            : 42形 / bypass 0 / over-rejection 7（fail-closed）
mutation                   : 5/5 KILLED（すべて 54b15a7 時点では生存）
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（8 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- 畳みは「拒否を増やすだけ」という形へ構造的に変えた（union / P2J-S29）
- 畳み 4 枝のうち未固定だった 2 枝を corpus へ追加
- caseId 規則の `i` / `$` を固定
- 反証不能だった `224/224` をグリッド定義付き 368/368 へ訂正
- browser harness を repository へ commit（「62 checks」が初めて検算可能に）
- QD-J10 を新設: caseId の検査があるのは空の経路だけ（Human Gate）
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
Wave 7 は引き続き blocked。
```

## Wave 6h final state（独立検証8 の修理 / D-041）

```text
npm                        : 634 pass / 0 fail
browser                    : 62 checks / 0 fail（相対パス化し、sabotage で検出能力を実証）
parser boundary            : 42形 / bypass 0
mutation                   : 13/13 KILLED
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（9 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- `(?![A-Za-z0-9])` が F8-01 の真因だった（全角固有ではなかった）。削除
- 畳みを assertPublicSafeEvidenceText の 1 か所へ集約し、全 pattern 規則へ効かせた
  → F8-05（全角 URL / email / path / provider の素通り）を Human Gate 送りにせず閉じた
- union なので畳みは単調——F1 型の回帰は原理的に起きない
- P2J-S29 が標本を押さえていたのを、実装の定義からの**生成**へ変えた
- harness の絶対パスを除去。sabotage で 19 bypass を検出できることを実証
- D-040 の差分表（stricter 0）は誤りだった——証人集合が小さすぎた。訂正済み
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
QD-J10（caseId の経路）は引き続き Human Gate 送り。Wave 7 は blocked。
```

## Wave 6i final state（独立検証9 の修理 / D-042）

```text
npm                        : 637 pass / 0 fail
browser                    : 62 checks / 0 fail
parser boundary            : 42形 / bypass 0
mutation                   : 9/9 KILLED
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（10 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- 「raw ∨ fold は単調」は raw に対してだけ。fold を差し替えれば回帰する
  → normalizer を**集合**にし、narrow と wide の両方を持つ（P2J-S34 が固定）
- lookahead 全削除は行き過ぎだった。`(?![A-Za-z])` へ戻し、
  正規化形には語境界無しの変種を当てる（P2J-S35 が両方向を固定）
- S24 の「装飾」と「全角」は交わっていなかった → P2J-S33 が直積を生成
- hasFullwidthForm を削除（範囲を 2 重に持たない）
- TB19 の corpus が検査対象の定数から生えていた → 独立な期待列を追加
- D-041 の 1104/2412 を 828/1608 へ訂正（グリッド定義付き）
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
QD-J10（caseId の経路）は引き続き Human Gate 送り。Wave 7 は blocked。
```

## Wave 6j final state（独立検証10 の修理 / D-043）

```text
npm                        : 638 pass / 0 fail
browser                    : 62 checks / 0 fail
parser boundary            : 42形 / bypass 0
mutation                   : 9/9 KILLED（この 9 件について。網羅の主張ではない）
回帰スイープ                 : 過去全 head に対し regression 0
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（11 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- 幹を要求する形は要求が矛盾している。corpus を増やしても終わらない
  → 幹を捨てた（tag 規則で既に下したのと同じ判断）
- F10-01 / F10-02 / F10-03 が同時に閉じた
- dot 相当符号（U+3002 等）を追加。中黒は意図的に除外
- 正規化形は閉包を取る（合成が必要な形がある）
- 寄与 0 になった narrow fold を削除（測定してから）
- P2J-S33 を corpus から**不変式**へ書き直した
- D-042 の「この repository に実在する識別子」は誤りだった。訂正済み
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
Human Gate 送り: QD-J06 / QD-J10 / QD-J11。Wave 7 は blocked。
```

## Wave 6k final state（独立検証11 の修理 / D-044）

```text
npm                        : 639 pass / 0 fail
browser                    : 62 checks / 0 fail
parser boundary            : 42形 / bypass 0
mutation                   : 14/14 KILLED（うち 11 件は前 1 回では生存）
回帰スイープ                 : tools/guard-diff/ で再現可能。他規則の regression 0
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（12 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- 「この規則にとって寄与 0」は「全体にとって 0」ではない。
  畳みは他規則の境界アンカー（`\b`）を壊せる → narrow fold を復旧
- 個数は集合の射影。remove+add は個数では見えない → S34 を名前と証人へ
- DOT_EQUIVALENTS を TB19 型（定数と独立に全員列挙）へ → P2J-S37
- closure guard を throw へ（黙って不完全にならない）
- 数値を反証可能にした → tools/guard-diff/ を commit
- `。` の偽陽性コストと採用基準を QD-J11 へ記録
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
Human Gate 送り: QD-J06 / QD-J10 / QD-J11 / QD-J12。Wave 7 は blocked。
```

## Wave 6l final state（独立検証12 の修理 / D-045）

```text
npm                        : 642 pass / 0 fail
browser                    : 62 checks / 0 fail
parser boundary            : 42形 / bypass 0
mutation                   : 9/9 KILLED（この 9 件について。網羅の主張ではない）
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（13 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- 3 規則の左文脈アンカーを外した。日本語の散文では実質発火していなかった
- normalizer に**種類**を追加（削除 / 標準正規化）。
  メンバシップの test は種類の欠落を検査できない
- dot 集合の基準を full stop / 中黒の軸へ言い直し、除外側も固定した
- guard-diff corpus に左文脈軸と不可視文字軸を追加
- D-044 の「14/14 KILLED」は 13/14 だった。R11-02 は死んだコードの変異で、
  原理上殺せない。訂正済み
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
Human Gate 送り: QD-J06 / QD-J10 / QD-J11 / QD-J12。Wave 7 は blocked。
```

## Wave 6m final state（独立検証13 の修理 / D-046）

```text
npm                        : 643 pass / 0 fail
browser                    : 62 checks / 0 fail
parser boundary            : 42形 / bypass 0
mutation                   : 8/9 KILLED + 1 等価
guard-diff corpus          : 565,758 入力。vs 7685e64 regression 0
protected values           : 5件すべて一致
validateAllEvidence()      : []
Implementation verification head : **未確定**（14 回目の独立検証が必要 / §44・§47）
```

### この Wave で確定したこと

```text
- DECISIONS.md を自分で 45 決定分削除していた。復旧済み。
  原因は Python の 'w' open + エンコード例外。以後 encode → temp → rename
- 手書き列挙を Unicode クラスへ（不可視文字 24 → 430）
- dot 集合を 12 へ戻した（縮めたのは回帰だった）
- ¥ path 区切りと U+2028/2029 を閉じた
- corpus を**diff が変えた軸**へ拡張（前回の検証の軸だけでは不十分）
- dot 集合に導出原理は無いと認め、QD-J13 として Human Gate へ
```

### 変わっていないこと

```text
Evidence protected state : verifiedCases [] / promotion NONE /
                           1250×2050 sample_default unverified / V0 34 / roughness III
Human Gate 送り: QD-J06 / QD-J10 / QD-J11 / QD-J12 / QD-J13
Wave 7 は blocked。
```

