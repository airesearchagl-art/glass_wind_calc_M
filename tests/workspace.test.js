'use strict';

/**
 * Phase 2G: Batch / Scenario Workspace のテスト。
 *
 * 重点は「Batch layerが独自の計算を持たないこと」と
 * 「外部データがtrusted stateへ昇格しないこと」である。
 * Batch側で期待値をhard-codeせず、single-case coreから導出した値と突き合わせる。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Workspace = require('../workspace.js');
const ProjectInput = require('../project-config/project-input.js');
const GlassCalc = require('../calc.js');

const WORKSPACE_SRC = path.join(__dirname, '..', 'workspace.js');

// §32: testsではsynthetic fixtureのみを使う。実案件のlabelを持ち込まない。
const manualCase = (widthMm, heightMm, overrides) =>
  ProjectInput.fromManual(Object.assign({
    widthMm, heightMm,
    positivePressure: 1525,
    negativePressure: -918,
    glassType: 'fl_single',
    extraFactor: 1.0
  }, overrides || {}));

/** single-case UIとまったく同じ経路で期待値を出す（Batch側で数値を固定しない）。 */
function singleCoreExpectation(pkg) {
  const area = GlassCalc.paneAreaM2(pkg.widthMm, pkg.heightMm);
  const all = GlassCalc.generateCandidates(pkg.glassType, area, pkg.designPressure, pkg.extraFactor);
  const split = GlassCalc.splitCandidates(all);
  const best = split.okCandidates.length > 0 ? split.okCandidates[0] : null;
  return { area, best, split };
}

/* ============================================================
   AC-02 Batch layerが新しい計算formulaを持たない
============================================================ */

test('AC-02: workspace.js は強度式・風圧式を持たない（ソース契約）', () => {
  const src = fs.readFileSync(WORKSPACE_SRC, 'utf8');
  // 計算コアの定数・式がここに複製されていないこと。
  // 識別子は語境界で見る（'Er' を includes() で探すと 'Error' に当たる）。
  // 注: 'V0' / 'roughnessCategory' は TSV列名 -> 既存windInput field名 の
  // 対応表に**名前として**現れる。それは計算ではなく写像なので許容し、
  // 代わりに「風圧エンジンに依存していないこと」を下で直接確認する。
  for (const ident of ['k1', 'k2', 'Er', 'qBar', 'Cpe', 'Gpe']) {
    assert.doesNotMatch(src, new RegExp('\\b' + ident + '\\b'),
      'workspace.js に計算コアの識別子が現れてはならない: ' + ident);
  }
  for (const fragment of ['t * t', 't**2', 'Math.pow', '0.6 *', '1.7 *', '* 300', '300 *']) {
    assert.equal(src.includes(fragment), false,
      'workspace.js に計算コアの式が現れてはならない: ' + fragment);
  }
  // 面積式も自前で書かない（GlassCalc.paneAreaM2 を呼ぶ）
  assert.doesNotMatch(src, /\/\s*1000000/, '面積式を複製してはならない');
  assert.match(src, /GlassCalc\.paneAreaM2\(/);
  assert.match(src, /GlassCalc\.generateCandidates\(/);
  assert.match(src, /GlassCalc\.splitCandidates\(/);
  // 案件固有値を持たない
  for (const value of ['1297', '1525', '1695', '1729', '918', '1122', '1250', '2050']) {
    assert.doesNotMatch(src, new RegExp('\\b' + value + '\\b'),
      'workspace.js に案件固有値 ' + value + ' が現れてはならない');
  }
  for (const token of ['Miyoshi', 'MIYOSHI', 'みよし']) {
    assert.equal(src.includes(token), false, 'workspace.js は案件非依存であること');
  }
  // 風圧算定は ProjectInput の内側で起きる。Batch layerは風圧エンジンを
  // 直接 require しない（呼べてしまうと、そこに独自の呼び出し順序が生まれる）。
  assert.doesNotMatch(src, /require\((['"]).*wind-pressure/,
    'workspace.js は wind-pressure.js を直接requireしない');
  assert.doesNotMatch(src, /WindPressure\./,
    'workspace.js は WindPressure を直接呼ばない');
  // notification caseは既存の fromWindCalculation を通る
  assert.match(src, /ProjectInput\.fromWindCalculation\(/);
  assert.match(src, /ProjectInput\.fromManual\(/);
  assert.match(src, /ProjectInput\.deserialize\(/);
  assert.match(src, /ProjectInput\.validateProjectInput\(/);
});

test('AC-02: index.html と Batch が同じ面積関数を呼ぶ（式を2か所に持たない）', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /GlassCalc\.paneAreaM2\(pkg\.widthMm, pkg\.heightMm\)/);
  assert.doesNotMatch(html, /pkg\.widthMm \* pkg\.heightMm\) \/ 1_000_000/,
    'index.html に面積式が残っていてはならない');
  assert.equal(GlassCalc.paneAreaM2(1250, 2050), (1250 * 2050) / 1000000);
});

/* ============================================================
   AC-03 / AC-06 / AC-07 case lifecycle
============================================================ */

test('AC-03 / AC-06: 1 case は既存 PIP v2 そのもの', () => {
  const ws = Workspace.createWorkspace();
  const id = ws.addCase(manualCase(1250, 2050), { label: 'Case A' });
  assert.equal(id, 'case-001');
  const entry = ws.getCase(id);
  assert.equal(entry.inputPackage.schemaVersion, 2);
  assert.equal(entry.inputPackage.sourceKind, 'manual');
  assert.equal(entry.label, 'Case A');
  assert.equal(ProjectInput.SCHEMA_VERSION, 2, 'Phase 2GでPIPをv3へ上げない');
});

test('AC-06: addCase は呼び出し側objectから切り離して保持する', () => {
  const ws = Workspace.createWorkspace();
  const pkg = manualCase(1250, 2050);
  const id = ws.addCase(pkg);
  pkg.widthMm = 9999;
  pkg.glassType = 'tp_single';
  assert.equal(ws.getCase(id).inputPackage.widthMm, 1250);
  assert.equal(ws.getCase(id).inputPackage.glassType, 'fl_single');
  // listCases() が返すcopyを書き換えてもworkspaceは変わらない
  const listed = ws.listCases();
  listed[0].inputPackage.widthMm = 1;
  listed[0].label = 'mutated';
  assert.equal(ws.getCase(id).inputPackage.widthMm, 1250);
  assert.equal(ws.getCase(id).label, null);
});

test('AC-07: duplicate は新しいcaseIdを払い出し、元caseをmutationしない', () => {
  const ws = Workspace.createWorkspace();
  const a = ws.addCase(manualCase(1250, 2050), { label: 'Case A' });
  const b = ws.duplicateCase(a);
  assert.notEqual(a, b);
  assert.equal(ws.size(), 2);
  assert.equal(ws.getCase(b).label, 'Case A (copy)');
  assert.deepEqual(ws.getCase(b).inputPackage, ws.getCase(a).inputPackage);
  // 複製側を消しても元は残る
  ws.removeCase(b);
  assert.equal(ws.size(), 1);
  assert.equal(ws.getCase(a).label, 'Case A');
});

test('AC-07: remove / clear はworkspace内部stateだけを変える', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050));
  ws.addCase(manualCase(1500, 2050));
  assert.equal(ws.removeCase('case-001'), true);
  assert.equal(ws.removeCase('case-001'), false, '存在しないcaseのremoveはfalse');
  assert.equal(ws.size(), 1);
  assert.equal(ws.clear(), 1);
  assert.equal(ws.size(), 0);
  // presetやEvidenceは無傷
  const MiyoshiProjectConfig = require('../project-config/miyoshi.js');
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
});

test('caseId: remove後に番号を再利用しない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050));   // case-001
  ws.removeCase('case-001');
  const next = ws.addCase(manualCase(1250, 2050));
  assert.equal(next, 'case-002', '消した番号を再利用すると別caseが同一視される');
});

/* ============================================================
   §35 known-answer（single coreから導出する）
============================================================ */

test('§35 known-answer: Case A は FL6 で OK、Case B は FL6 が NG', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050), { label: 'Case A' });
  ws.addCase(manualCase(1500, 2050), { label: 'Case B' });
  const results = Workspace.evaluateWorkspace(ws);

  const a = results[0];
  const b = results[1];

  // 期待値はsingle coreから導出する（Batch側で数値を固定しない）
  const expA = singleCoreExpectation(ws.getCase('case-001').inputPackage);
  const expB = singleCoreExpectation(ws.getCase('case-002').inputPackage);

  assert.equal(a.status, 'OK');
  assert.equal(a.areaM2, expA.area);
  assert.equal(a.recommendedLabel, expA.best.label);
  assert.equal(a.allowablePressure, expA.best.P);
  assert.equal(a.recommendedLabel, 'FL6', 'Case A の推奨は FL6');

  // Case B: FL6は耐力不足（NG側に入る）ので推奨にならない
  const bFl6 = expB.split.ngCandidates.find((c) => c.label === 'FL6');
  assert.ok(bFl6, 'Case B では FL6 が NG 候補に入るはず');
  assert.notEqual(b.recommendedLabel, 'FL6');
  assert.equal(b.recommendedLabel, expB.best.label);
  assert.equal(b.allowablePressure, expB.best.P);

  // Phase 2D/2E/2F から引き継ぐ既知値（single core側の値）
  assert.equal(expA.split.okCandidates.concat(expA.split.ngCandidates)
    .find((c) => c.label === 'FL6').P, 1756.09756097561);
  assert.equal(expB.split.okCandidates.concat(expB.split.ngCandidates)
    .find((c) => c.label === 'FL6').P, 1463.4146341463415);
});

/* ============================================================
   AC-08 row isolation / AC-09 summary / AC-10 grouping
============================================================ */

test('AC-08: 1 rowがinvalidでも他rowを止めず、silent skipもしない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050), { label: 'ok-1' });
  ws.addCase(manualCase(1500, 2050), { label: 'ok-2' });
  // 壊れたcaseを直接注入する（addCaseは通らないので内部listを模す）
  const entries = ws.listCases();
  entries.splice(1, 0, { caseId: 'case-bad', label: 'broken', inputPackage: { nope: true } });

  const results = Workspace.evaluateWorkspace(entries);
  assert.equal(results.length, 3, '壊れたrowも結果に残る（skipしない）');
  assert.equal(results[0].status, 'OK');
  assert.equal(results[1].status, 'INVALID');
  assert.equal(results[2].status, 'OK', '後続rowの評価が止まっていない');
  assert.ok(results[1].error && results[1].error.length > 0, 'INVALID rowは理由を持つ');
  assert.equal(results[1].recommendedLabel, null);
  assert.equal(results[1].allowablePressure, null);
});

test('AC-09: summary counts と governing の定義', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050));                       // OK
  ws.addCase(manualCase(1500, 2050));                       // OK
  const entries = ws.listCases();
  entries.push({ caseId: 'case-bad', label: null, inputPackage: { nope: true } });

  const results = Workspace.evaluateWorkspace(entries);
  const summary = Workspace.summarize(results);

  assert.equal(summary.totalCases, 3);
  assert.equal(summary.okCount, 2);
  assert.equal(summary.invalidCount, 1);
  assert.equal(summary.okCount + summary.noSolutionCount + summary.invalidCount,
    summary.totalCases, 'counts は必ず total に一致する');
  assert.equal(summary.maxDesignPressure, 1525);
  assert.equal(summary.maxAreaM2, GlassCalc.paneAreaM2(1500, 2050));

  // governing の定義は明示されていること
  assert.ok(['min_margin_ratio', 'max_design_pressure'].includes(summary.governingBasis));
  const okResults = results.filter((r) => r.status === 'OK');
  const minRatio = Math.min(...okResults.map((r) => r.marginRatio));
  const expected = okResults.find((r) => r.marginRatio === minRatio);
  assert.equal(summary.governingBasis, 'min_margin_ratio');
  assert.equal(summary.governingCaseId, expected.caseId);
});

test('AC-09: OK caseが無い場合 governing は最大designPressureへフォールバックする', () => {
  const entries = [
    { caseId: 'case-001', label: null, inputPackage: manualCase(5000, 5000, { positivePressure: 9000, negativePressure: -9000 }) },
    { caseId: 'case-002', label: null, inputPackage: manualCase(5000, 5000, { positivePressure: 12000, negativePressure: -12000 }) }
  ];
  const results = Workspace.evaluateWorkspace(entries);
  const summary = Workspace.summarize(results);
  assert.equal(summary.okCount, 0);
  assert.equal(summary.noSolutionCount, 2);
  assert.equal(summary.governingBasis, 'max_design_pressure');
  assert.equal(summary.governingCaseId, 'case-002');
});

test('AC-10: recommended configuration ごとにgroupingし、NO_SOLUTION/INVALIDは混ぜない', () => {
  const entries = [
    { caseId: 'case-001', label: null, inputPackage: manualCase(1250, 2050) },
    { caseId: 'case-002', label: null, inputPackage: manualCase(1250, 2050) },
    { caseId: 'case-003', label: null, inputPackage: manualCase(1500, 2050) },
    { caseId: 'case-004', label: null, inputPackage: manualCase(5000, 5000, { positivePressure: 12000, negativePressure: -12000 }) },
    { caseId: 'case-005', label: null, inputPackage: { nope: true } }
  ];
  const groups = Workspace.groupByRecommended(Workspace.evaluateWorkspace(entries));
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
  assert.equal(byKey.FL6.count, 2);
  assert.deepEqual(byKey.FL6.caseIds, ['case-001', 'case-002']);
  assert.equal(byKey.NO_SOLUTION.count, 1);
  assert.equal(byKey.INVALID.count, 1);
  assert.equal(groups.reduce((n, g) => n + g.count, 0), 5);
});

/* ============================================================
   AC-11 sort / filter（結果をmutationしない）
============================================================ */

test('AC-11: sort / filter は evaluation result をmutationしない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1500, 2050));
  ws.addCase(manualCase(1250, 2050));
  const results = Workspace.evaluateWorkspace(ws);
  const before = JSON.parse(JSON.stringify(results.map((r) => r.caseId)));

  const sorted = Workspace.sortResults(results, 'areaM2');
  assert.deepEqual(results.map((r) => r.caseId), before, '元配列の順序は変わらない');
  assert.deepEqual(sorted.map((r) => r.caseId), ['case-002', 'case-001']);
  assert.deepEqual(Workspace.sortResults(results, 'areaM2', 'desc').map((r) => r.caseId),
    ['case-001', 'case-002']);

  const filtered = Workspace.filterResults(results, 'OK');
  assert.equal(filtered.length, 2);
  assert.deepEqual(results.map((r) => r.caseId), before);
  assert.equal(Workspace.filterResults(results, 'ALL').length, 2);
  assert.equal(Workspace.filterResults(results, 'INVALID').length, 0);

  assert.throws(() => Workspace.sortResults(results, 'label'), /unknown sort key/);
  assert.throws(() => Workspace.filterResults(results, 'MAYBE'), /unknown filter/);
});

test('AC-11: 値を持たない行はsort方向によらず末尾に置かれる', () => {
  const entries = [
    { caseId: 'case-001', label: null, inputPackage: { nope: true } },
    { caseId: 'case-002', label: null, inputPackage: manualCase(1250, 2050) }
  ];
  const results = Workspace.evaluateWorkspace(entries);
  for (const dir of ['asc', 'desc']) {
    const sorted = Workspace.sortResults(results, 'designPressure', dir);
    assert.equal(sorted[sorted.length - 1].caseId, 'case-001', 'INVALID行は末尾 (' + dir + ')');
  }
});

/* ============================================================
   §36 determinism
============================================================ */

test('§36: 同じworkspaceを2回evaluateしても同じ結果になる', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050), { label: 'Case A' });
  ws.addCase(manualCase(1500, 2050), { label: 'Case B' });
  const first = Workspace.evaluateWorkspace(ws);
  Workspace.sortResults(first, 'marginRatio', 'desc');
  Workspace.filterResults(first, 'OK');
  const second = Workspace.evaluateWorkspace(ws);

  assert.deepEqual(first.map((r) => r.caseId), second.map((r) => r.caseId));
  for (let i = 0; i < first.length; i++) {
    assert.equal(first[i].designPressure, second[i].designPressure);
    assert.equal(first[i].areaM2, second[i].areaM2);
    assert.equal(first[i].allowablePressure, second[i].allowablePressure);
    assert.equal(first[i].recommendedLabel, second[i].recommendedLabel);
    assert.equal(first[i].marginRatio, second[i].marginRatio);
  }
});

/* ============================================================
   AC-04 / AC-05 / AC-15 / AC-16  Workspace Package v1
============================================================ */

test('AC-04 / AC-05: Workspace Packageは入力だけを持ち、derived resultを保存しない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050), { label: 'Case A' });
  const pkg = Workspace.toWorkspacePackage(ws);

  assert.equal(pkg.schemaVersion, 1);
  assert.equal(pkg.workspaceType, 'glass_batch_workspace');
  assert.deepEqual(Object.keys(pkg), ['schemaVersion', 'workspaceType', 'cases']);
  assert.deepEqual(Object.keys(pkg.cases[0]), ['caseId', 'label', 'inputPackage']);

  const json = Workspace.serializeWorkspace(ws);
  for (const derived of ['recommendedCandidate', 'recommendedLabel', 'allowablePressure',
                         'marginRatio', 'marginPressure', 'okCount', 'ngCount',
                         'outOfScopeCount', 'status', 'areaM2', 'trace', 'windTrace',
                         'evidence', 'verifiedCases', 'sourceReference']) {
    assert.equal(json.includes(derived), false,
      'Workspace JSONに derived / Evidence field が含まれてはならない: ' + derived);
  }
});

test('AC-16: export -> import -> evaluate で数値結果が一致する', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050), { label: 'Case A' });
  ws.addCase(manualCase(1500, 2050), { label: 'Case B' });
  const before = Workspace.evaluateWorkspace(ws);

  const imported = Workspace.deserializeWorkspace(Workspace.serializeWorkspace(ws));
  assert.deepEqual(imported.errors, []);
  const after = Workspace.evaluateWorkspace(imported.workspace);

  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].caseId, before[i].caseId);
    assert.equal(after[i].label, before[i].label);
    assert.equal(after[i].designPressure, before[i].designPressure);
    assert.equal(after[i].areaM2, before[i].areaM2);
    assert.equal(after[i].allowablePressure, before[i].allowablePressure);
    assert.equal(after[i].recommendedLabel, before[i].recommendedLabel);
    assert.equal(after[i].marginRatio, before[i].marginRatio);
  }
  // deterministic ordering: 2回serializeしても同じ文字列
  assert.equal(Workspace.serializeWorkspace(ws), Workspace.serializeWorkspace(ws));
});

test('AC-15: Workspace importは外部境界を通り、trust claimを昇格させない', () => {
  const spoofed = JSON.parse(JSON.stringify(manualCase(1250, 2050)));
  spoofed.sourceKind = 'registered_preset';
  spoofed.provenance.verificationStatus = 'verified';
  spoofed.provenance.publicLabel = 'SPOOFED PRESET';

  const json = JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [{ caseId: 'case-001', label: null, inputPackage: spoofed }]
  });
  const imported = Workspace.deserializeWorkspace(json);
  assert.deepEqual(imported.errors, []);

  const entry = imported.workspace.getCase('case-001');
  assert.equal(entry.inputPackage.sourceKind, 'imported_unverified');
  assert.equal(entry.inputPackage.provenance.verificationStatus, 'unverified');
  assert.notEqual(entry.inputPackage.provenance.publicLabel, 'SPOOFED PRESET');
  assert.equal(Workspace.evaluateWorkspace(imported.workspace)[0].sourceKind, 'imported_unverified');
});

test('AC-15: importした designPressure は再計算で上書きされる（derived spoof不可）', () => {
  const tampered = JSON.parse(JSON.stringify(manualCase(1250, 2050)));
  tampered.designPressure = 99999;
  const json = JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [{ caseId: 'case-001', label: null, inputPackage: tampered }]
  });
  const imported = Workspace.deserializeWorkspace(json);
  const result = Workspace.evaluateWorkspace(imported.workspace)[0];
  assert.equal(result.designPressure, 1525, 'designPressureは max(|正圧|,|負圧|) から再計算される');
  assert.notEqual(result.designPressure, 99999);
});

test('AC-15 / §30: Evidence field や derived field を含むWorkspace JSONを拒否する', () => {
  const withEvidence = JSON.parse(JSON.stringify(manualCase(1250, 2050)));
  withEvidence.evidence = { level: 'primary', checkedAt: '2026-09-20', privateReferenceAvailable: true };
  const a = Workspace.deserializeWorkspace(JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [{ caseId: 'case-001', label: null, inputPackage: withEvidence }]
  }));
  assert.equal(a.workspace.size(), 0, 'Evidenceを含むcaseはworkspaceへ入らない');
  assert.equal(a.errors.length, 1, 'silent skipせず理由を残す');
  assert.match(a.errors[0].reason, /unknown field.*evidence/i);

  // case levelにderived resultを載せる
  const b = Workspace.deserializeWorkspace(JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [{ caseId: 'case-001', label: null, inputPackage: manualCase(1250, 2050), recommendedGlass: 'FL4' }]
  }));
  assert.equal(b.workspace.size(), 0);
  assert.match(b.errors[0].reason, /unexpected field.*recommendedGlass/);

  // top levelにverifiedCases
  assert.throws(() => Workspace.deserializeWorkspace(JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace', verifiedCases: [], cases: []
  })), /unexpected field.*verifiedCases/);
});

test('AC-20 / §18: whole-fileの問題は fail closed', () => {
  const ok = { schemaVersion: 1, workspaceType: 'glass_batch_workspace', cases: [] };
  assert.doesNotThrow(() => Workspace.deserializeWorkspace(JSON.stringify(ok)));

  assert.throws(() => Workspace.deserializeWorkspace('{not json'), /not valid JSON/);
  assert.throws(() => Workspace.deserializeWorkspace('[]'), /must be an object/);
  assert.throws(() => Workspace.deserializeWorkspace(JSON.stringify(
    Object.assign({}, ok, { workspaceType: 'something_else' }))), /unsupported workspaceType/);
  assert.throws(() => Workspace.deserializeWorkspace(JSON.stringify(
    Object.assign({}, ok, { schemaVersion: 2 }))), /unsupported workspace schemaVersion/);
  assert.throws(() => Workspace.deserializeWorkspace(JSON.stringify(
    Object.assign({}, ok, { cases: {} }))), /cases must be an array/);

  // 1001 cases
  const many = { schemaVersion: 1, workspaceType: 'glass_batch_workspace', cases: [] };
  for (let i = 0; i < Workspace.MAX_CASES + 1; i++) many.cases.push({ caseId: 'case-x', label: null, inputPackage: {} });
  assert.throws(() => Workspace.deserializeWorkspace(JSON.stringify(many)), /too many cases/);

  // oversized payload
  const huge = '{"schemaVersion":1,"workspaceType":"glass_batch_workspace","cases":[],"pad":"'
    + 'x'.repeat(Workspace.MAX_WORKSPACE_BYTES + 10) + '"}';
  assert.throws(() => Workspace.deserializeWorkspace(huge), /too large/);
});

test('§38: prototype pollution が Workspace import で起きない', () => {
  const payloads = [
    '{"schemaVersion":1,"workspaceType":"glass_batch_workspace","cases":[{"caseId":"case-001","label":null,"inputPackage":{"__proto__":{"polluted":true}}}]}',
    '{"schemaVersion":1,"workspaceType":"glass_batch_workspace","cases":[{"caseId":"case-001","label":null,"inputPackage":{"constructor":{"prototype":{"polluted":true}}}}]}'
  ];
  for (const payload of payloads) {
    try { Workspace.deserializeWorkspace(payload); } catch (e) { /* fail closed も可 */ }
    assert.equal({}.polluted, undefined, 'Object.prototype が汚染されてはならない');
    assert.equal(Object.prototype.polluted, undefined);
  }
});

/* ============================================================
   AC-12 / AC-13 / AC-14  TSV
============================================================ */

const TSV_MANUAL_HEADER =
  'case_id\tlabel\tmode\twidth_mm\theight_mm\tglass_type\textra_factor\tpositive_pressure\tnegative_pressure';

test('AC-12: TSV manual importが成立し、single coreと同じ結果になる', () => {
  const tsv = [
    TSV_MANUAL_HEADER,
    'North-01\tCase A\tmanual\t1250\t2050\tfl_single\t1.0\t1525\t-918',
    'North-02\tCase B\tmanual\t1500\t2050\tfl_single\t1.0\t1525\t-918'
  ].join('\n');

  const parsed = Workspace.parseTsv(tsv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 2);

  const ws = Workspace.createWorkspace();
  const outcome = Workspace.addTsvRows(ws, parsed);
  assert.deepEqual(outcome.errors, []);
  assert.deepEqual(outcome.added, ['North-01', 'North-02']);

  const results = Workspace.evaluateWorkspace(ws);
  const expected = singleCoreExpectation(ws.getCase('North-01').inputPackage);
  assert.equal(results[0].status, 'OK');
  assert.equal(results[0].label, 'Case A');
  assert.equal(results[0].allowablePressure, expected.best.P);
  assert.equal(results[0].recommendedLabel, expected.best.label);
});

test('AC-13: TSV notification importが既存WindInput経路へ変換される', () => {
  const tsv = [
    'case_id\tlabel\tmode\twidth_mm\theight_mm\tglass_type\tv0\troughness\tbuilding_height_m\teaves_height_m\tevaluation_height_m\tbuilding_type\tzone\tbasis',
    'Sample-001\tCase N\tnotification\t1250\t2050\tfl_single\t34\tIII\t14.2\t14.2\t14.2\tclosed\tgeneral\tnotification_baseline'
  ].join('\n');

  const parsed = Workspace.parseTsv(tsv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows[0].mode, 'notification');
  assert.deepEqual(parsed.rows[0].input.windInput, {
    V0: 34, roughnessCategory: 'III', buildingHeightM: 14.2,
    eavesHeightM: 14.2, evaluationHeightM: 14.2,
    buildingType: 'closed', zone: 'general', basis: 'notification_baseline'
  });

  const ws = Workspace.createWorkspace();
  assert.deepEqual(Workspace.addTsvRows(ws, parsed).errors, []);
  const entry = ws.getCase('Sample-001');
  assert.equal(entry.inputPackage.sourceKind, 'notification_calculation');
  assert.equal(entry.inputPackage.provenance.verificationStatus, 'unverified');

  // 圧力はwindInputから再計算される（TSVは圧力を運んでいない）
  const result = Workspace.evaluateWorkspace(ws)[0];
  assert.equal(result.status === 'OK' || result.status === 'NO_SOLUTION', true);
  assert.ok(result.designPressure > 0);
  const trace = ProjectInput.windTraceFor(entry.inputPackage);
  assert.ok(trace, 'notification caseはtraceを再計算できる');
});

test('AC-14: TSVから trusted preset / Evidence / derived値を作れない', () => {
  const forbidden = [
    'source_kind', 'design_pressure', 'recommended_glass', 'verified',
    'verification_status', 'evidence', 'provenance', 'verified_cases',
    'allowable_pressure', 'status', 'margin'
  ];
  for (const column of forbidden) {
    const tsv = ['mode\twidth_mm\theight_mm\tglass_type\t' + column,
                 'manual\t1250\t2050\tfl_single\tx'].join('\n');
    assert.throws(() => Workspace.parseTsv(tsv),
      /must not carry a derived or trust column/,
      'TSV列 ' + column + ' は拒否されるべき');
  }
  // 未知列はsilent ignoreせず reject
  assert.throws(() => Workspace.parseTsv(
    ['mode\twidth_mm\theight_mm\tglass_type\twhatever',
     'manual\t1250\t2050\tfl_single\tx'].join('\n')), /unknown column/);

  // TSV経路で作られるsourceKindは manual / notification_calculation だけ
  const ws = Workspace.createWorkspace();
  Workspace.addTsvRows(ws, Workspace.parseTsv([
    TSV_MANUAL_HEADER,
    'A1\t\tmanual\t1250\t2050\tfl_single\t1.0\t1525\t-918'
  ].join('\n')));
  assert.equal(ws.getCase('A1').inputPackage.sourceKind, 'manual');
  assert.notEqual(ws.getCase('A1').inputPackage.sourceKind, 'registered_preset');
});

test('AC-12/13: modeごとのrequired columnを検証する', () => {
  // modeは行ごとに変わりうる（manualとnotificationを1枚のTSVに混ぜられる）ため、
  // mode固有の必須列チェックはheader levelではなくrow levelのerrorになる。
  const manualMissing = Workspace.parseTsv(
    ['mode\twidth_mm\theight_mm\tglass_type', 'manual\t1250\t2050\tfl_single'].join('\n'));
  assert.equal(manualMissing.rows.length, 0);
  assert.match(manualMissing.errors[0].reason, /mode=manual requires column/);

  const notificationMissing = Workspace.parseTsv(
    ['mode\twidth_mm\theight_mm\tglass_type', 'notification\t1250\t2050\tfl_single'].join('\n'));
  assert.equal(notificationMissing.rows.length, 0);
  assert.match(notificationMissing.errors[0].reason, /mode=notification requires column/);

  // basis は既定値を持たない（Phase 2Eの設計判断）ので必須列である
  const noBasis = Workspace.parseTsv([
    'mode\twidth_mm\theight_mm\tglass_type\tv0\troughness\tbuilding_height_m\teaves_height_m\tevaluation_height_m\tbuilding_type\tzone',
    'notification\t1250\t2050\tfl_single\t34\tIII\t14.2\t14.2\t14.2\tclosed\tgeneral'
  ].join('\n'));
  assert.equal(noBasis.rows.length, 0);
  assert.match(noBasis.errors[0].reason, /requires column: basis/);

  // 1枚のTSVにmanualとnotificationを混在させられる
  const mixed = Workspace.parseTsv([
    'mode\twidth_mm\theight_mm\tglass_type\tpositive_pressure\tnegative_pressure\tv0\troughness\tbuilding_height_m\teaves_height_m\tevaluation_height_m\tbuilding_type\tzone\tbasis',
    'manual\t1250\t2050\tfl_single\t1525\t-918\t\t\t\t\t\t\t\t',
    'notification\t1250\t2050\tfl_single\t\t\t34\tIII\t14.2\t14.2\t14.2\tclosed\tgeneral\tnotification_baseline'
  ].join('\n'));
  assert.deepEqual(mixed.errors, []);
  assert.deepEqual(mixed.rows.map((r) => r.mode), ['manual', 'notification']);
  assert.throws(() => Workspace.parseTsv(
    ['width_mm\theight_mm\tglass_type', '1250\t2050\tfl_single'].join('\n')),
    /missing a required column: "mode"/);
  assert.throws(() => Workspace.parseTsv(
    ['mode\tmode\twidth_mm\theight_mm\tglass_type', 'manual\tmanual\t1\t1\tfl_single'].join('\n')),
    /duplicate column/);
});

test('AC-20 / §37: TSV row errorは位置と理由だけを返し、生のrowを残さない', () => {
  // §8: 診断に載せてよいのは lineNumber / 安全なcaseId / field / reason と、
  // normalizeLabel を通った label だけ。生の行そのものは載せない。
  // そこで「載ってはいけない値」はlabel以外のセルに置いて確認する。
  const secretish = 'CONFIDENTIAL-CELL-CONTENT';
  const tsv = [
    TSV_MANUAL_HEADER,
    'A1\tCase A\tbadmode\t1250\t2050\t' + secretish + '\t1.0\t1525\t-918',
    'A2\tCase B\tmanual\tnot-a-number\t2050\t' + secretish + '\t1.0\t1525\t-918',
    'A3\tCase C\tmanual\t1250\t2050\tfl_single\t1.0\t1525\t-918'
  ].join('\n');
  // 注: この2行はいずれも secretish **以外**の列で落ちる。
  // 「他セルを貼り付けていない」ことしか示さないので、
  // 「落ちたセル自身が漏れない」ことは下の専用テストで別に確認する。

  const parsed = Workspace.parseTsv(tsv);
  assert.equal(parsed.rows.length, 1, '正常な行だけがrowsへ入る');
  assert.equal(parsed.errors.length, 2);
  assert.equal(parsed.errors[0].lineNumber, 2);
  assert.equal(parsed.errors[0].caseId, 'A1');
  assert.equal(parsed.errors[0].field, 'mode');
  assert.equal(parsed.errors[1].lineNumber, 3);
  assert.equal(parsed.errors[1].field, 'width_mm');
  for (const err of parsed.errors) {
    const serialized = JSON.stringify(err);
    assert.equal(serialized.includes(secretish), false,
      'error objectに他セルの内容を貼り付けてはならない');
    assert.equal(serialized.includes('\t'), false, '生のtab区切り行を貼り付けない');
    // 許可されたkeyだけを持つ
    assert.deepEqual(Object.keys(err).sort(),
      ['caseId', 'field', 'label', 'lineNumber', 'reason']);
  }
  // normalizeLabelを通ったlabelは載せてよい（§8）
  assert.equal(parsed.errors[0].label, 'Case A');
});

test('AC-20: TSVのsize / row / label / caseId上限が fail closed', () => {
  const header = 'mode\twidth_mm\theight_mm\tglass_type\tpositive_pressure\tnegative_pressure';
  const row = 'manual\t1250\t2050\tfl_single\t1525\t-918';

  assert.throws(() => Workspace.parseTsv(
    [header].concat(Array(Workspace.MAX_CASES + 1).fill(row)).join('\n')), /too many rows/);
  assert.doesNotThrow(() => Workspace.parseTsv(
    [header].concat(Array(Workspace.MAX_CASES).fill(row)).join('\n')));

  assert.throws(() => Workspace.parseTsv('x'.repeat(Workspace.MAX_TSV_BYTES + 1)), /too large/);
  assert.throws(() => Workspace.parseTsv(''), /empty|must be the header row/);

  // label上限 / caseId pattern
  const tooLongLabel = 'L'.repeat(Workspace.MAX_LABEL_LENGTH + 1);
  const parsed = Workspace.parseTsv([
    TSV_MANUAL_HEADER,
    'A1\t' + tooLongLabel + '\tmanual\t1250\t2050\tfl_single\t1.0\t1525\t-918',
    'plan A-102.pdf\tCase\tmanual\t1250\t2050\tfl_single\t1.0\t1525\t-918'
  ].join('\n'));
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.errors.length, 2);
  assert.match(parsed.errors[0].reason, /label is too long/);
  assert.match(parsed.errors[1].reason, /caseId/);
  assert.equal(parsed.errors[1].caseId, null, 'patternを通らないcaseIdはerrorに載せない');
});

/* ============================================================
   AC-17 / AC-18  CSV
============================================================ */

test('AC-18: CSV formula injectionを中和する（Security Hard Gate）', () => {
  const dangerous = [
    '=HYPERLINK("http://evil.example","click")',
    '=1+1',
    '+1+1',
    '-2+3',
    '@SUM(A1:A9)',
    '\tleading-tab',
    '\rleading-cr'
  ];
  for (const value of dangerous) {
    const out = Workspace.neutralizeCsvCell(value);
    assert.equal(out.charAt(0), "'", JSON.stringify(value) + ' は中和されるべき');
    assert.equal(out.slice(1), value, '値そのものは削らない');
  }
  for (const safe of ['normal', 'Case A', '北面 2F A', '1250', '']) {
    assert.equal(Workspace.neutralizeCsvCell(safe), safe);
  }

  // RFC4180 escaping
  assert.equal(Workspace.csvEscape('a,b'), '"a,b"');
  assert.equal(Workspace.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(Workspace.csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(Workspace.csvEscape('plain'), 'plain');
});

test('AC-17 / AC-18: 出力CSVで label / caseId が数式にならない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050), { label: '=HYPERLINK("http://evil.example","x")' });
  ws.addCase(manualCase(1500, 2050), { label: 'quote " and , comma' });
  const csv = Workspace.toCsv(Workspace.evaluateWorkspace(ws));
  const lines = csv.split('\n');

  assert.equal(lines[0], Workspace.CSV_COLUMNS.join(','));
  assert.equal(lines.length, 3);
  assert.equal(csv.includes(',=HYPERLINK'), false, 'セル先頭に生の = が出てはならない');
  assert.match(lines[1], /"'=HYPERLINK/);
  assert.match(lines[2], /"quote "" and , comma"/);

  // 負の数値は中和されない（'-918 のように壊れない）
  const wsNeg = Workspace.createWorkspace();
  wsNeg.addCase(manualCase(1250, 2050, { positivePressure: 100, negativePressure: -1525 }));
  const negCsv = Workspace.toCsv(Workspace.evaluateWorkspace(wsNeg));
  assert.equal(negCsv.includes("'-"), false, '数値セルに中和用クォートを付けない');
});

test('AC-17: CSVは derived report であって入力ではない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualCase(1250, 2050), { label: 'Case A' });
  const results = Workspace.evaluateWorkspace(ws);
  const csv = Workspace.toCsv(results);
  const cells = csv.split('\n')[1].split(',');
  const col = (name) => cells[Workspace.CSV_COLUMNS.indexOf(name)];

  assert.equal(col('caseId'), 'case-001');
  assert.equal(col('sourceKind'), 'manual');
  assert.equal(Number(col('designPressure')), 1525);
  assert.equal(Number(col('areaM2')), GlassCalc.paneAreaM2(1250, 2050));
  assert.equal(col('recommendedGlass'), results[0].recommendedLabel);
  assert.equal(Number(col('allowablePressure')), results[0].allowablePressure);
  assert.equal(col('status'), 'OK');
  // CSVを入力として読み戻す経路が存在しないこと
  assert.equal(typeof Workspace.fromCsv, 'undefined');
  assert.equal(typeof Workspace.importCsv, 'undefined');
});

/* ============================================================
   AC-19 HTML injection / AC-21 persistence / AC-22..24 非退行
============================================================ */

test('AC-19: labelは制御文字を拒否し、HTML payloadは値として保持される', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '5<Z<40',
    'a & b',
    '"><b>bold</b>'
  ];
  for (const payload of payloads) {
    // 値としては受け入れる（エスケープは描画側の責務）
    assert.equal(Workspace.normalizeLabel(payload), payload);
  }
  // 構造を壊す制御文字は入口で落とす
  for (const bad of ['a\tb', 'a\nb', 'a\rb', 'a\u0000b']) {
    assert.throws(() => Workspace.normalizeLabel(bad), /control characters/);
  }
  assert.equal(Workspace.normalizeLabel(''), null);
  assert.equal(Workspace.normalizeLabel(null), null);
  assert.throws(() => Workspace.normalizeLabel(123), /must be a string/);
});

test('AC-21: workspace.js は永続化を一切行わない', () => {
  // コメントで「localStorageを使わない」と書くこと自体は許す。
  // 見たいのは**実際の呼び出し**なので、コメントと文字列を除いてから探す。
  const raw = fs.readFileSync(WORKSPACE_SRC, 'utf8');
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

  for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'cookie',
                     'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'importScripts']) {
    assert.doesNotMatch(code, new RegExp('\\b' + api + '\\b'),
      'workspace.js は ' + api + ' を使わない（memory-only / §31）');
  }
  assert.doesNotMatch(code, /\bfetch\s*\(/, 'workspace.js はネットワークへ出ない');
  // コメント側では明示的に宣言していること（意図が読める）
  assert.match(raw, /localStorage/, 'memory-onlyである旨をコメントで宣言する');
});

test('AC-22 / AC-23 / AC-24: 既存contractを退行させない', () => {
  const MiyoshiProjectConfig = require('../project-config/miyoshi.js');
  const WindPressure = require('../wind-pressure.js');

  // Evidence / Verified Case
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');
  assert.deepEqual(MiyoshiProjectConfig.validateAllEvidence(), []);

  // PIP v1 / v2
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
  assert.deepEqual(ProjectInput.SUPPORTED_SCHEMA_VERSIONS, [1, 2]);

  // Wind Trace（Phase 2E）
  const trace = WindPressure.calculateWindPressure({
    V0: 34, roughnessCategory: 'III', buildingHeightM: 14.2,
    eavesHeightM: 14.2, evaluationHeightM: 14.2,
    buildingType: 'closed', zone: 'general', basis: 'notification_baseline'
  });
  assert.ok(trace, 'Wind Traceが計算できる');

  // Miyoshi regression（single core）
  assert.equal(GlassCalc.generateCandidates('fl_single', GlassCalc.paneAreaM2(1250, 2050), 1525, 1.0)
    .find((c) => c.label === 'FL6').P, 1756.09756097561);
  assert.equal(GlassCalc.generateCandidates('fl_single', GlassCalc.paneAreaM2(1500, 2050), 1525, 1.0)
    .find((c) => c.label === 'FL6').P, 1463.4146341463415);
});

test('§32: workspace.js / tests に実案件private labelを持ち込まない', () => {
  const src = fs.readFileSync(WORKSPACE_SRC, 'utf8');
  const testSrc = fs.readFileSync(__filename, 'utf8');
  for (const token of ['みよし', 'Miyoshi', 'MIYOSHI']) {
    assert.equal(src.includes(token), false);
  }
  // testsで使うlabelはsynthetic fixtureに限る
  for (const label of ['Case A', 'Case B', 'Case C', 'Case N', 'North-01', 'Sample-001']) {
    assert.equal(testSrc.includes(label), true, 'synthetic fixture: ' + label);
  }
});

/* ============================================================
   Required Fix 1 — 物理TSV行番号（§3 / §37）
============================================================ */

const TSV_MIN_HEADER = 'case_id\tmode\twidth_mm\theight_mm\tglass_type\tpositive_pressure\tnegative_pressure';
const TSV_OK_ROW = 'manual\t1250\t2050\tfl_single\t1525\t-918';
const TSV_BAD_ROW = 'manual\tNOT-A-NUMBER\t2050\tfl_single\t1525\t-918';

test('RF1-A: header / valid / blank / invalid で invalid は 4行目として報告される', () => {
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER,
    'A1\t' + TSV_OK_ROW,
    '',
    'A2\t' + TSV_BAD_ROW
  ].join('\n'));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].lineNumber, 4,
    '空行を捨ててから番号を振ると3になる。ユーザーのシート上の行は4である');
  assert.equal(parsed.errors[0].caseId, 'A2');
});

test('RF1-B: 連続した空行があっても後続行の番号がずれない', () => {
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER,
    'A1\t' + TSV_OK_ROW,
    '', '', '',
    'A2\t' + TSV_BAD_ROW,
    '',
    'A3\t' + TSV_BAD_ROW
  ].join('\n'));
  assert.deepEqual(parsed.errors.map((e) => e.lineNumber), [6, 8]);
});

test('RF1-C: 末尾の空行は phantom case を作らない', () => {
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER, 'A1\t' + TSV_OK_ROW, '', '', '   ', ''
  ].join('\n'));
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.errors, []);
});

test('RF1-D/E: MAX_CASESは空行ではなく実データ行で数える', () => {
  // case_id列を持たないheaderを使う（caseIdは自動採番されるため一意性を気にしない）
  const header = 'mode\twidth_mm\theight_mm\tglass_type\tpositive_pressure\tnegative_pressure';
  const row = 'manual\t1250\t2050\tfl_single\t1525\t-918';

  const withBlanks = [header];
  for (let i = 0; i < Workspace.MAX_CASES; i++) {
    withBlanks.push(row);
    withBlanks.push('');
  }
  const parsed = Workspace.parseTsv(withBlanks.join('\n'));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, Workspace.MAX_CASES, '空行を挟んでも1000行は通る');
  // 物理行番号は空行の分だけ飛ぶ
  assert.equal(parsed.rows[0].lineNumber, 2);
  assert.equal(parsed.rows[1].lineNumber, 4);

  const tooMany = [header];
  for (let i = 0; i < Workspace.MAX_CASES + 1; i++) tooMany.push(row);
  assert.throws(() => Workspace.parseTsv(tooMany.join('\n')), /too many rows/);
});

test('RF1: 物理1行目が空ならheaderを後ろへずらさず fail closed', () => {
  assert.throws(() => Workspace.parseTsv('\n' + TSV_MIN_HEADER + '\nA1\t' + TSV_OK_ROW),
    /line 1 must be the header row/);
  assert.throws(() => Workspace.parseTsv('   \n' + TSV_MIN_HEADER), /line 1 must be the header row/);
});

test('§9: parseTsv通過後のProjectInput失敗は field: "project_input" を返す', () => {
  // glass_type は parseTsv では「非空」しか見ない。実際の妥当性は
  // 既存ProjectInputが判定する。その判定ロジックをここへ複製しない。
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER,
    'A1\tmanual\t1250\t2050\tnot_a_real_glass_type\t1525\t-918'
  ].join('\n'));
  assert.deepEqual(parsed.errors, [], 'parseTsv段階では通る');

  const ws = Workspace.createWorkspace();
  const outcome = Workspace.addTsvRows(ws, parsed);
  assert.equal(ws.size(), 0);
  assert.equal(outcome.errors.length, 1);
  assert.equal(outcome.errors[0].field, 'project_input',
    'fieldはnullにせず、ProjectInput由来であることを示す安定した値を返す');
  assert.equal(outcome.errors[0].lineNumber, 2);
  assert.match(outcome.errors[0].reason, /glassType/);
});

/* ============================================================
   Required Fix 2 — INVALID が到達可能であること（§12）
============================================================ */

/** TSVから valid / invalid / valid を取り込み、表示用resultへまとめる。 */
function importMixedTsv() {
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER,
    'A1\t' + TSV_OK_ROW,
    'A2\t' + TSV_BAD_ROW,
    'A3\tmanual\t1500\t2050\tfl_single\t1525\t-918'
  ].join('\n'));
  const ws = Workspace.createWorkspace();
  const outcome = Workspace.addTsvRows(ws, parsed);
  const results = Workspace.mergeEvaluationResults(
    Workspace.evaluateWorkspace(ws),
    Workspace.errorsToInvalidResults(outcome.errors, 'tsv')
  );
  return { ws, results };
}

test('§12-1: TSV valid+invalid+valid → 2 valid case + 1 INVALID診断', () => {
  const { ws, results } = importMixedTsv();
  assert.equal(ws.size(), 2, 'Workspaceが持つ入力は妥当なものだけ');
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.status), ['OK', 'OK', 'INVALID']);
  const invalid = results.find((r) => r.status === 'INVALID');
  assert.equal(invalid.caseId, 'A2');
  assert.equal(invalid.source, 'tsv');
  assert.equal(invalid.lineNumber, 3);
});

test('§12-2: Workspace JSON valid+invalid+valid → 2 valid case + 1 INVALID診断', () => {
  const good = manualCase(1250, 2050);
  const json = JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [
      { caseId: 'case-001', label: 'Case A', inputPackage: good },
      { caseId: 'case-002', label: 'Case B', inputPackage: { broken: true } },
      { caseId: 'case-003', label: 'Case C', inputPackage: manualCase(1500, 2050) }
    ]
  });
  const imported = Workspace.deserializeWorkspace(json);
  assert.equal(imported.workspace.size(), 2);
  assert.equal(imported.errors.length, 1);

  const results = Workspace.mergeEvaluationResults(
    Workspace.evaluateWorkspace(imported.workspace),
    Workspace.errorsToInvalidResults(imported.errors, 'workspace_json')
  );
  const invalid = results.find((r) => r.status === 'INVALID');
  assert.equal(invalid.caseId, 'case-002');
  assert.equal(invalid.source, 'workspace_json');
  assert.equal(invalid.index, 1);
  assert.equal(invalid.lineNumber, null);
});

test('§12-3: summary が imported invalid rows を数える', () => {
  const { results } = importMixedTsv();
  const summary = Workspace.summarize(results);
  assert.equal(summary.totalCases, 3);
  assert.equal(summary.okCount, 2);
  assert.equal(summary.invalidCount, 1);
  assert.equal(summary.noSolutionCount, 0);
});

test('§12-4 / §12-5: filter INVALID / OK が正しく分離する', () => {
  const { results } = importMixedTsv();
  const invalidOnly = Workspace.filterResults(results, 'INVALID');
  assert.equal(invalidOnly.length, 1);
  assert.equal(invalidOnly[0].caseId, 'A2');

  const okOnly = Workspace.filterResults(results, 'OK');
  assert.equal(okOnly.length, 2);
  assert.equal(okOnly.some((r) => r.status === 'INVALID'), false);
  assert.equal(Workspace.filterResults(results, 'ALL').length, 3);
});

test('§12-6 / §12-7: CSVにINVALID行が出て、推奨構成は空のまま', () => {
  const { results } = importMixedTsv();
  const csv = Workspace.toCsv(results);
  const line = csv.split('\n').find((l) => l.startsWith('A2'));
  assert.ok(line, 'INVALID行がCSVに出る');

  const cells = line.split(',');
  const col = (name) => cells[Workspace.CSV_COLUMNS.indexOf(name)];
  assert.equal(col('status'), 'INVALID');
  assert.equal(col('recommendedGlass'), '', 'INVALID行に推奨構成を書かない');
  assert.equal(col('allowablePressure'), '');
  assert.equal(col('designPressure'), '');
  assert.equal(col('areaM2'), '');
  assert.ok(col('error').length > 0, '理由は出す');

  const invalid = results.find((r) => r.status === 'INVALID');
  assert.equal(invalid.recommendedLabel, null);
  assert.equal(invalid.recommendedCandidate, null);
  assert.equal(invalid.allowablePressure, null);
});

test('§12-8: INVALID行は governing case にならない', () => {
  const { results } = importMixedTsv();
  const summary = Workspace.summarize(results);
  assert.notEqual(summary.governingCaseId, 'A2');
  assert.equal(results.find((r) => r.caseId === summary.governingCaseId).status, 'OK');

  // OKが1件も無く、INVALIDだけの場合もgoverningにしない
  const onlyInvalid = Workspace.errorsToInvalidResults(
    [{ lineNumber: 2, caseId: 'A9', field: 'mode', reason: 'bad' }], 'tsv');
  const s2 = Workspace.summarize(onlyInvalid);
  assert.equal(s2.invalidCount, 1);
  assert.equal(s2.governingCaseId, null);
  assert.equal(s2.governingBasis, null);
  assert.equal(s2.maxDesignPressure, null, 'null fieldをmaxへ混ぜない');
  assert.equal(s2.maxAreaM2, null);
});

test('§12-9 / §12-10: INVALID行はWorkspace JSONへ出ず、再importでも復活しない', () => {
  const { ws } = importMixedTsv();
  const json = Workspace.serializeWorkspace(ws);
  assert.equal(json.includes('A2'), false, 'INVALID行はexportされない');
  assert.equal(json.includes('INVALID'), false);
  assert.equal(json.includes('NOT-A-NUMBER'), false);

  const reimported = Workspace.deserializeWorkspace(json);
  assert.deepEqual(reimported.errors, [], '正常なworkspaceの再importはエラーを生まない');
  assert.equal(reimported.workspace.size(), 2);
  const results = Workspace.mergeEvaluationResults(
    Workspace.evaluateWorkspace(reimported.workspace),
    Workspace.errorsToInvalidResults(reimported.errors, 'workspace_json')
  );
  assert.equal(results.filter((r) => r.status === 'INVALID').length, 0,
    '再importでINVALID行が復活してはならない');
});

test('§4 / §5: INVALID診断はProject Input Packageではない', () => {
  const invalid = Workspace.errorToInvalidResult(
    { lineNumber: 4, caseId: 'A2', label: 'Case B', field: 'width_mm', reason: 'bad' }, 'tsv');

  // 計算に属する値はすべてnull
  for (const key of ['widthMm', 'heightMm', 'areaM2', 'designPressure', 'positivePressure',
                     'negativePressure', 'glassType', 'extraFactor', 'recommendedLabel',
                     'recommendedCandidate', 'allowablePressure', 'marginRatio',
                     'marginPressure', 'sourceKind', 'verificationStatus']) {
    assert.equal(invalid[key], null, key + ' は null であること');
  }
  assert.equal(invalid.status, 'INVALID');
  assert.equal(invalid.source, 'tsv');
  // PIPのfieldを持たない
  assert.equal(invalid.schemaVersion, undefined);
  assert.equal(invalid.provenance, undefined);
  assert.equal(invalid.windInput, undefined);

  // 診断行はWorkspaceのcaseとして追加できない
  const ws = Workspace.createWorkspace();
  assert.throws(() => ws.addCase(invalid), /unknown field|unexpected field|must be an object/);

  // mergeは引数の向きを守らせる
  assert.throws(() => Workspace.mergeEvaluationResults([invalid], []),
    /diagnostic rows must be passed as invalidResults/);
  assert.throws(() => Workspace.mergeEvaluationResults([], [{ status: 'OK' }]),
    /invalidResults must all be INVALID/);
  assert.throws(() => Workspace.errorToInvalidResult({ reason: 'x' }, 'csv'), /unknown source/);
});

test('§8: INVALID診断に生データを載せない', () => {
  const invalid = Workspace.errorToInvalidResult(
    { lineNumber: 4, caseId: 'A2', label: 'Case B', field: 'width_mm', reason: 'bad value' }, 'tsv');
  const allowed = [
    'caseId', 'label', 'source', 'lineNumber', 'index', 'field', 'error', 'status',
    'sourceKind', 'verificationStatus', 'widthMm', 'heightMm', 'areaM2',
    'positivePressure', 'negativePressure', 'designPressure', 'glassType', 'extraFactor',
    'recommendedCandidate', 'recommendedLabel', 'allowablePressure',
    'marginRatio', 'marginPressure', 'okCount', 'ngCount', 'outOfScopeCount', 'outOfScopePresent'
  ];
  assert.deepEqual(Object.keys(invalid).sort(), allowed.slice().sort());
  // 呼び出し側が余分なものを詰めても運ばない
  const withExtra = Workspace.errorToInvalidResult({
    lineNumber: 4, caseId: 'A2', reason: 'bad',
    rawRow: 'A2\tmanual\tSECRET\t2050', rawCase: { secret: true }, filePath: '/home/user/x.tsv'
  }, 'tsv');
  const serialized = JSON.stringify(withExtra);
  assert.equal(serialized.includes('SECRET'), false);
  assert.equal(serialized.includes('/home/user/'), false);
  assert.equal(withExtra.rawRow, undefined);
  assert.equal(withExtra.rawCase, undefined);
  assert.equal(withExtra.filePath, undefined);
});

/* ============================================================
   §11 duplicate caseId import
============================================================ */

test('§11: 重複caseIdは診断になり、他のcaseのimportを止めない', () => {
  const json = JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [
      { caseId: 'case-001', label: 'first', inputPackage: manualCase(1250, 2050) },
      { caseId: 'case-001', label: 'duplicate', inputPackage: manualCase(1500, 2050) },
      { caseId: 'case-002', label: 'third', inputPackage: manualCase(1250, 2050) }
    ]
  });
  const imported = Workspace.deserializeWorkspace(json);

  assert.equal(imported.workspace.size(), 2, '重複以外は取り込まれる');
  assert.equal(imported.errors.length, 1);
  assert.equal(imported.errors[0].index, 1);
  assert.equal(imported.errors[0].caseId, 'case-001');
  assert.match(imported.errors[0].reason, /duplicate caseId/);

  // 最初のcaseが上書きされていないこと
  assert.equal(imported.workspace.getCase('case-001').label, 'first');
  assert.equal(imported.workspace.getCase('case-001').inputPackage.widthMm, 1250);
  assert.ok(imported.workspace.has('case-002'));
});


/* ============================================================
   独立検証(Phase 2G)の指摘に対する回帰テスト
   F1 / F2 / F3 / F4
============================================================ */

test('F1: 落ちたセルの値そのものが診断とCSVへ出ない', () => {
  // 以前のテストは secret を「落ちない列」に置いていたため、
  // 実際の漏れ（落ちたセルが reason に引用される）を素通りさせていた。
  // ここでは secret を**落ちる列そのもの**に置く。
  const secret = 'SECRET-PROJECT-DWG-A1023-CONFIDENTIAL';
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER,
    'A1\tmanual\t1250\t2050\t' + secret + '\t1525\t-918'
  ].join('\n'));
  assert.deepEqual(parsed.errors, [], 'parseTsv段階では通る（glass_typeは非空としか見ない）');

  const ws = Workspace.createWorkspace();
  const outcome = Workspace.addTsvRows(ws, parsed);
  assert.equal(outcome.errors.length, 1);
  // sanitizeはworkspace.jsの**出口**で行う。error recordの時点で既に伏せる。
  // 表示側それぞれでsanitizeする設計にすると必ずどこか1つ忘れる
  // （実際、実機確認でstatus行だけ生のまま出ていた）。
  assert.equal(outcome.errors[0].reason.includes(secret), false,
    'error recordの時点で落ちたセルの値を持たない');
  const invalid = Workspace.errorsToInvalidResults(outcome.errors, 'tsv')[0];
  assert.equal(invalid.error.includes(secret), false, '診断に落ちたセルの値を残さない');
  assert.match(invalid.error, /unsupported glassType/, 'どの項目が問題かは残す');
  assert.match(invalid.error, /lowe_fl/, '許容値の案内は残す');

  const csv = Workspace.toCsv([invalid]);
  assert.equal(csv.includes(secret), false, 'CSVは共有されるファイルなので特に漏らさない');

  // 他の入口も同じ境界を通る
  const jsonSecret = 'ANOTHER-SECRET-VALUE-9999';
  const imported = Workspace.deserializeWorkspace(JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [{ caseId: 'c1', label: null,
      inputPackage: Object.assign({}, manualCase(1250, 2050), { glassType: jsonSecret }) }]
  }));
  assert.equal(imported.errors[0].reason.includes(jsonSecret), false);
  const jsonInvalid = Workspace.errorsToInvalidResults(imported.errors, 'workspace_json')[0];
  assert.equal(jsonInvalid.error.includes(jsonSecret), false);
  assert.equal(Workspace.toCsv([jsonInvalid]).includes(jsonSecret), false);
});

test('F1: workspace.jsを出る error record はすべてsanitize済み', () => {
  // 入口が3つある（parseTsv / addTsvRows / deserializeWorkspace）。
  // どれか1つでも生のまま返すと、UIのstatus行から漏れる。
  const secret = 'LEAK-CANARY-9999-CONFIDENTIAL';

  const a = Workspace.parseTsv([TSV_MIN_HEADER,
    'A1\t' + secret + '\t1250\t2050\tfl_single\t1525\t-918'].join('\n'));
  assert.equal(JSON.stringify(a.errors).includes(secret), false, 'parseTsv');

  const wsB = Workspace.createWorkspace();
  const b = Workspace.addTsvRows(wsB, Workspace.parseTsv([TSV_MIN_HEADER,
    'A1\tmanual\t1250\t2050\t' + secret + '\t1525\t-918'].join('\n')));
  assert.equal(JSON.stringify(b.errors).includes(secret), false, 'addTsvRows');

  const c = Workspace.deserializeWorkspace(JSON.stringify({
    schemaVersion: 1, workspaceType: 'glass_batch_workspace',
    cases: [{ caseId: 'c1', label: null,
      inputPackage: Object.assign({}, manualCase(1250, 2050), { glassType: secret }) }]
  }));
  assert.equal(JSON.stringify(c.errors).includes(secret), false, 'deserializeWorkspace');
});

test('F1: reasonは無制限に伸びない', () => {
  const huge = 'X'.repeat(3000);
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER, 'A1\tmanual\t1250\t2050\t' + huge + '\t1525\t-918'
  ].join('\n'));
  const ws = Workspace.createWorkspace();
  const outcome = Workspace.addTsvRows(ws, parsed);
  assert.ok(outcome.errors[0].reason.length <= Workspace.MAX_REASON_LENGTH,
    'error recordの時点で既に上限内');

  const invalid = Workspace.errorToInvalidResult(outcome.errors[0], 'tsv');
  assert.ok(invalid.error.length <= Workspace.MAX_REASON_LENGTH,
    '診断は上限で切る（実測 ' + invalid.error.length + ' 文字）');
  assert.equal(invalid.error.includes(huge), false);

  // 上のケースは引用部分の伏せ字で短くなるため、長さ上限そのものは検証できていない。
  // 引用符に囲まれていない長い内容（伏せ字が効かない形）で上限を直接確認する。
  const unquoted = Workspace.sanitizeReason('validation failed: ' + 'Y'.repeat(3000));
  assert.ok(unquoted.length <= Workspace.MAX_REASON_LENGTH,
    '引用符が無くても上限で切る（実測 ' + unquoted.length + ' 文字）');
  assert.ok(unquoted.endsWith('…'), '切り詰めたことが分かる形にする');
  assert.equal(Workspace.sanitizeReason('short message').endsWith('…'), false);
});

test('F1: errorToInvalidResult 自身もsanitizeする（二層目）', () => {
  // 通常経路はworkspace.jsの出口で既にsanitize済みなので、
  // ここを外しても普段の動きは変わらない。だからこそ、
  // 手で組んだerror recordを直接渡す経路で二層目を固定しておく。
  const raw = 'unsupported glassType: "HAND-BUILT-SECRET-A1023"';
  const invalid = Workspace.errorToInvalidResult(
    { lineNumber: 2, caseId: 'A1', reason: raw }, 'tsv');
  assert.equal(invalid.error.includes('HAND-BUILT-SECRET-A1023'), false,
    'helperへ直接渡された生のreasonも伏せる');
  assert.match(invalid.error, /"…"/);

  const long = Workspace.errorToInvalidResult(
    { lineNumber: 2, caseId: 'A1', reason: 'failure: ' + 'Z'.repeat(3000) }, 'tsv');
  assert.ok(long.error.length <= Workspace.MAX_REASON_LENGTH);
});

test('F1: sanitizeは既知語彙を残し、それ以外の引用値を伏せる', () => {
  // システム自身が定義している語彙はそのまま残す（診断の有用性を保つ）
  assert.equal(Workspace.sanitizeReason('mode must be "manual" or "notification"'),
    'mode must be "manual" or "notification"');
  assert.equal(Workspace.sanitizeReason('roughnessCategory must be one of ["I","II","III","IV"]'),
    'roughnessCategory must be one of ["I","II","III","IV"]');
  assert.match(Workspace.sanitizeReason('unknown factKey: "fl_single"'), /"fl_single"/);
  assert.match(Workspace.sanitizeReason('unexpected field: "designPressure"'), /"designPressure"/);

  // 語彙に無いものは利用者由来として伏せる
  for (const userValue of ['SECRET-DWG-001', '新宿タワー2期', 'note_SECRET',
                           '/home/user/plan.tsv', 'A1023']) {
    const out = Workspace.sanitizeReason('unexpected field: "' + userValue + '"');
    assert.equal(out.includes(userValue), false, userValue + ' は伏せる');
    assert.match(out, /"…"/);
  }
  assert.equal(Workspace.sanitizeReason(null), null);

  // 語彙は表示用であって契約ではない（計算に影響しない）
  assert.equal(Object.isFrozen(Workspace.SAFE_REASON_VOCABULARY), true);
  assert.ok(Workspace.SAFE_REASON_VOCABULARY.includes('manual'));
  assert.ok(Workspace.SAFE_REASON_VOCABULARY.includes('fl_single'));
});

test('F2: 必須列の欠落は、その列名を field として報告する', () => {
  const noBasis = Workspace.parseTsv([
    'mode\twidth_mm\theight_mm\tglass_type\tv0\troughness\tbuilding_height_m\teaves_height_m\tevaluation_height_m\tbuilding_type\tzone',
    'notification\t1250\t2050\tfl_single\t34\tIII\t14.2\t14.2\t14.2\tclosed\tgeneral'
  ].join('\n'));
  assert.equal(noBasis.errors[0].field, 'basis',
    '直前に触った列（extra_factor）ではなく、欠けている列を指すこと');
  assert.match(noBasis.errors[0].reason, /requires column: basis/);

  const noPressure = Workspace.parseTsv([
    'mode\twidth_mm\theight_mm\tglass_type', 'manual\t1250\t2050\tfl_single'
  ].join('\n'));
  assert.equal(noPressure.errors[0].field, 'positive_pressure');
});

test('F3: header列数を超えるセルを持つ行は黙って切り捨てない', () => {
  // 例: 行側にだけ列を足したシート。切り捨てると、足した列が
  // 「無かったこと」になって取り込まれてしまう。
  const parsed = Workspace.parseTsv([
    TSV_MIN_HEADER,
    'A1\tmanual\t1250\t2050\tfl_single\t1525\t-918',
    'A2\tmanual\t1250\t2050\tfl_single\t1525\t-918\tEXTRA',
    'A3\tmanual\t1250\t2050\tfl_single\t1525\t-918\tEXTRA\tMORE'
  ].join('\n'));
  assert.equal(parsed.rows.length, 1, '正常な行だけ通す');
  assert.equal(parsed.errors.length, 2);
  for (const err of parsed.errors) {
    assert.match(err.reason, /more cells than the header declares/);
  }
  assert.deepEqual(parsed.errors.map((e) => e.lineNumber), [3, 4]);
});

test('F4: errorToInvalidResult は label契約を呼び出し側に委ねない', () => {
  assert.throws(() => Workspace.errorToInvalidResult(
    { lineNumber: 2, caseId: 'A1', label: 'x'.repeat(Workspace.MAX_LABEL_LENGTH + 1), reason: 'r' }, 'tsv'),
    /label is too long/);
  assert.throws(() => Workspace.errorToInvalidResult(
    { lineNumber: 2, caseId: 'A1', label: 'a\u0000b', reason: 'r' }, 'tsv'),
    /control characters/);
  assert.throws(() => Workspace.errorToInvalidResult(
    { lineNumber: 2, caseId: 'A1', label: 123, reason: 'r' }, 'tsv'), /must be a string/);
  // 正常なlabelはそのまま通る
  assert.equal(Workspace.errorToInvalidResult(
    { lineNumber: 2, caseId: 'A1', label: 'Case A', reason: 'r' }, 'tsv').label, 'Case A');
  assert.equal(Workspace.errorToInvalidResult({ reason: 'r' }, 'tsv').label, null);
});
