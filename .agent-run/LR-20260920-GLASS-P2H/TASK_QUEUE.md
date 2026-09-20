# Task Queue — LR-20260920-GLASS-P2H

## Wave Plan（packet §41）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Run Artifact / Phase 2G closeout / baseline | DONE |
| 1 | architecture inventory / Profile contract / Scenario contract | DONE |
| 2 | Profile module / Profile Package v1 / effective resolver | DONE |
| 3 | Scenario Matrix model / generator / Scenario → Workspace | DONE |
| 4 | UI（Profile editor / effective preview / Matrix / TSV / export-import） | DONE |
| 4H | Boundary Closure（Required Fix A / B / C） | DONE |
| 5 | security / privacy / mutation / limits | DONE |
| 6 | full regression / browser / independent verifier / repair | DONE |
| 7 | README / Run Artifact convergence / Draft PR / Completion Report | DONE |

## Acceptance Criteria（packet §36）

| AC | 内容 | 状態 | 実測 |
|---|---|---|---|
| AC-01 | Single regressionなし | PASS | 398 / 0。Single 4モード（preset / manual / notification / imported）はbrowserでも再確認 |
| AC-02 | Phase 2G Batch regressionなし | PASS | Phase 2G 342件そのまま緑。parseTsvTable抽出後も行番号は両TSVで一致（共に4行目） |
| AC-03 | Profile Package v1成立 | PASS | schemaVersion 1 / profileType runtime_wind_profile / round trip 100回で状態不変 |
| AC-04 | Runtime Profileはunverifiedのみ | PASS | user_input_unverified以外を名乗るprofileは結果側gateが拒否。trust field 11種を上位・windDefaults両方で拒否 |
| AC-05 | evaluationHeight / zoneはProfileへ入らない | PASS | schemaに場所が無い。継承による持ち込みもF6修正で遮断（assertOrdinaryObject） |
| AC-06 | floor→Z inferenceなし | PASS | floor / floor_key / storey / story / level を専用メッセージで拒否。floorHeight等のtokenがsourceに無いことをtestで固定 |
| AC-07 | effective resolver成立 | PASS | basis / zone / Z いずれも補完しない。欠落はfail closed |
| AC-08 | resolved PIPが既存direct pathと同一結果 | PASS | profile経路のPIPがdirect path呼び出しとJSON bit-equal（1250x2050 / 1500x2050で確認） |
| AC-09 | Profile changeが既存Workspace caseをmutationしない | PASS | V0 34→46変更後も既存caseはdeepEqual不変。UIは「反映されていません」を表示 |
| AC-10 | Scenario Matrix成立 | PASS | canonical scenarioのみ格納。raw objectはmatrix.addが拒否 |
| AC-11 | Matrix TSV成立 | PASS | 物理行番号を保持。空行・重複・余剰セルのいずれも行単位で隔離 |
| AC-12 | Matrix generator成立 | PASS | 2×1×3×2=12をdeterministicに生成。展開順 width→height→Z→zone |
| AC-13 | generator cap成立 | PASS | MAX_SCENARIOS 1000が絶対。maxTotalは狭める方向のみ。matrix.add自身も1001件目を拒否（F3a修正でtest固定） |
| AC-14 | Scenario → Workspace成立 | PASS | snapshot意味論。失敗行は隔離され、診断はsourceを scenario_matrix と名乗る（F2修正） |
| AC-15 | generated caseはnotification_calculation / unverified | PASS | generated caseは notification_calculation / unverified。100回使ってもEvidenceは動かない |
| AC-16 | Workspace JSON単独で再計算可能 | PASS | export JSONにprofile / scenarioの語が無く、profile不在で再計算しても同じdesignPressure |
| AC-17 | Profile import trust spoof不可 | PASS | forged verified / registered_preset / presetId / Evidence / sourceReference をすべて拒否 |
| AC-18 | Scenario import trust spoof不可 | PASS | Z欠落・zone欠落・floor / V0 / verificationStatus 同伴・string型のZ をすべて拒否 |
| AC-19 | prototype pollution不可 | PASS | __proto__ / constructor / prototype をraw・nested・defineProperty経由で拒否。Object.prototypeはNodeでもlive pageでも無汚染 |
| AC-20 | HTML / error privacy非退行 | PASS | textContentのみ。innerHTML / insertAdjacentHTML / document.write なし。診断は生の行を残さない |
| AC-21 | CSV injection非退行 | PASS | =+-@ と制御文字の中和は非退行（'=cmd|calc 形式で確認） |
| AC-22 | memory-only | PASS | localStorage / sessionStorage / indexedDB / cookie / fetch / XHR / sendBeacon / WebSocket いずれも新規コードに無し。full flow後のlive pageでも0 |
| AC-23 | PIP v1/v2非退行 | PASS | schema 2、v1→v2 migrationで imported_unverified へ落ちる動作は非退行 |
| AC-24 | Evidence/verifiedCases非退行 | PASS | verifiedCases [] / dimensions sample_default・unverified / presets 1297・1525・1695・1729 / 918・1122 / validateAllEvidence() [] |
| AC-25 | README / Run Artifact actual sync | PASS | Wave 7で実測値へ同期。READMEの数値は本ファイルと一致する（F1修正） |

## Next Action

```text
Human Gate待ち。Draft PRのReady化 / merge / Production は本Campaignの
Next Actionに含めない（§44）。
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §44）。
