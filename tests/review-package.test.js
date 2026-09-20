'use strict';

/**
 * Phase 2I: Design Review Package のテスト。
 *
 * 重点は3つ。
 *   1. Reportが計算しないこと（summary / grouping / governing は既存を呼ぶ）
 *   2. Reportが入力へ戻らないこと（一方向）
 *   3. 出せない情報を出さないこと（診断のprivacy / redaction / 無いtrace）
 *
 * fixtureは synthetic な名前のみ（正式案件名を書かない）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Review = require('../review-package.js');
const Workspace = require('../workspace.js');
const ProjectInput = require('../project-config/project-input.js');
const PresetRegistry = require('../project-config/registry.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

const REVIEW_SRC = path.join(__dirname, '..', 'review-package.js');

const NOTIFICATION_WIND = {
  V0: 34, roughnessCategory: 'III', buildingHeightM: 14.2, eavesHeightM: 14.2,
  evaluationHeightM: 14.2, buildingType: 'closed', zone: 'general',
  basis: 'notification_baseline'
};

const manualPkg = (over) => ProjectInput.fromManual(Object.assign({
  widthMm: 1250, heightMm: 2050, glassType: 'fl_single',
  positivePressure: 1400, negativePressure: -1400
}, over || {}));

const notificationPkg = () => ProjectInput.fromWindCalculation({
  widthMm: 1250, heightMm: 2050, glassType: 'fl_single',
  windInput: Object.assign({}, NOTIFICATION_WIND)
});

const presetPkg = () => ProjectInput.fromPreset(PresetRegistry.getPreset('miyoshi'), {
  floorKey: '2', zoneKey: 'general',
  widthMm: 1250, heightMm: 2050, glassType: 'fl_single', extraFactor: 1.0
});

/** OK / NO_SOLUTION / notification / preset を含むworkspaceを作る。 */
function makeWorkspace() {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualPkg(), { caseId: 'OK1', label: 'Sample OK' });
  ws.addCase(manualPkg({ positivePressure: 90000, negativePressure: -90000 }),
    { caseId: 'NOSOL', label: 'Sample heavy' });
  ws.addCase(notificationPkg(), { caseId: 'NOTIF', label: 'Sample notification' });
  ws.addCase(presetPkg(), { caseId: 'PRESET', label: 'Sample preset' });
  return ws;
}

/** 既存の正規経路（TSV boundary）だけを通して診断を作る。 */
function makeDiagnostics(badGlassType) {
  const ws = Workspace.createWorkspace();
  const parsed = Workspace.parseTsv([
    'case_id\tlabel\tmode\twidth_mm\theight_mm\tglass_type\tpositive_pressure\tnegative_pressure',
    'BAD1\tSample bad\tmanual\t1250\t2050\t' + badGlassType + '\t1400\t-1400'
  ].join('\n'));
  const outcome = Workspace.addTsvRows(ws, parsed);
  assert.equal(outcome.errors.length, 1, '診断が1件出ていること（テスト自体の前提）');
  return Workspace.errorsToInvalidResults(outcome.errors, 'tsv');
}

// ── A ────────────────────────────────────────────────────────
test('A: Review Package の schema / type が固定である', () => {
  const rev = Review.buildReviewPackage({ workspace: makeWorkspace() });
  assert.equal(rev.schemaVersion, 1);
  assert.equal(rev.reportType, 'glass_design_review');
  assert.equal(Review.REVIEW_SCHEMA_VERSION, 1);
  assert.equal(Review.REPORT_TYPE, 'glass_design_review');
  // WorkspaceやPIPに見えるtypeを名乗らない
  assert.notEqual(rev.reportType, Workspace.WORKSPACE_TYPE);
  assert.equal(rev.workspaceType, undefined);
  assert.equal(rev.sourceKind, undefined);
});

// ── B / C ────────────────────────────────────────────────────
test('B: summary は WorkspaceCore.summarize と一致する（自前で数えない）', () => {
  const ws = makeWorkspace();
  const diagnostics = makeDiagnostics('no_such_glass');
  const rev = Review.buildReviewPackage({ workspace: ws, diagnostics });

  const expected = Workspace.summarize(
    Workspace.mergeEvaluationResults(Workspace.evaluateWorkspace(ws), diagnostics));
  assert.deepEqual(JSON.parse(JSON.stringify(rev.summary)), expected);
  assert.equal(rev.summary.totalCases, 5);
  assert.equal(rev.summary.invalidCount, 1);
});

test('C: grouping も WorkspaceCore.groupByRecommended と一致する', () => {
  const ws = makeWorkspace();
  const diagnostics = makeDiagnostics('no_such_glass');
  const rev = Review.buildReviewPackage({ workspace: ws, diagnostics });

  const expected = Workspace.groupByRecommended(
    Workspace.mergeEvaluationResults(Workspace.evaluateWorkspace(ws), diagnostics));
  assert.deepEqual(JSON.parse(JSON.stringify(rev.groups)), expected);
});

// ── D / E ────────────────────────────────────────────────────
test('D: case table は OK / NO_SOLUTION / INVALID をすべて含む', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass') });
  const statuses = rev.cases.map((c) => c.status);
  assert.equal(statuses.includes('OK'), true);
  assert.equal(statuses.includes('NO_SOLUTION'), true);
  assert.equal(statuses.includes('INVALID'), true);
  assert.equal(rev.cases.length, 5);

  const ok = rev.cases.find((c) => c.caseId === 'OK1');
  for (const key of Review.REVIEW_CASE_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(ok, key), true, key + ' 列がある');
  }
});

test('E: INVALID行の計算値は null のまま（推定で埋めない）', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass') });
  const invalid = rev.cases.find((c) => c.status === 'INVALID');

  assert.equal(invalid.isDiagnostic, true);
  for (const field of ['widthMm', 'heightMm', 'areaM2', 'designPressure',
                       'recommendedLabel', 'allowablePressure', 'marginRatio', 'marginPressure',
                       'sourceKind', 'verificationStatus', 'glassType']) {
    assert.equal(invalid[field], null, field + ' は null');
  }
  // 位置情報は残る
  assert.equal(invalid.source, 'tsv');
  assert.equal(typeof invalid.lineNumber, 'number');
  assert.equal(invalid.caseId, 'BAD1');
});

// ── F ────────────────────────────────────────────────────────
test('F: governing は summarize の答えをそのまま使う', () => {
  const ws = makeWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws });
  const expected = Workspace.summarize(Workspace.evaluateWorkspace(ws));

  assert.equal(rev.governingCase.caseId, expected.governingCaseId);
  assert.equal(rev.governingCase.basis, expected.governingBasis);
  assert.equal(rev.summary.governingCaseId, expected.governingCaseId);
  assert.equal(rev.governingCase.row.caseId, expected.governingCaseId);

  // governingが無いworkspaceでは null
  const empty = Workspace.createWorkspace();
  const emptyRev = Review.buildReviewPackage({ workspace: empty });
  assert.equal(emptyRev.governingCase, null);
});

// ── G / H / I ────────────────────────────────────────────────
test('G: manual detail の windTrace は null（作らない）', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['OK1'] });
  const d = rev.selectedDetails[0];
  assert.equal(d.caseId, 'OK1');
  assert.equal(d.traceAvailable, false);
  assert.equal(d.windTrace, null);
  assert.equal(d.windInput, null);
  assert.match(d.traceUnavailableReason, /告示風圧計算の経路を通っていない/);
});

test('H: registered preset detail の windTrace も null', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['PRESET'] });
  const d = rev.selectedDetails[0];
  assert.equal(d.traceAvailable, false);
  assert.equal(d.windTrace, null);
  assert.equal(d.input.sourceKind, 'registered_preset');
  // presetの検証状況を verified へ丸めない
  assert.equal(d.input.verificationStatus, 'partially_verified');
});

test('I: notification detail の trace は既存 windTraceFor と一致する', () => {
  const ws = makeWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws, detailCaseIds: ['NOTIF'] });
  const d = rev.selectedDetails[0];

  assert.equal(d.traceAvailable, true);
  const expected = ProjectInput.windTraceFor(ws.getCase('NOTIF').inputPackage);
  assert.deepEqual(JSON.parse(JSON.stringify(d.windTrace)), expected);
  // 保護値がそのまま載る
  assert.equal(d.windTrace.positive.Er, 0.8516557589672942);
  assert.equal(d.windTrace.positive.qBar, 503.08024004410464);
});

// ── §15 ──────────────────────────────────────────────────────
test('§15: 式の検証と入力の検証を1つのbadgeへ潰さない', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['NOTIF'] });
  const prov = rev.selectedDetails[0].windTrace.provenance;

  assert.equal(prov.formulaVerificationStatus, 'verified_primary_source');
  assert.equal(prov.inputVerificationStatus, 'user_input_unverified');
  // 統合されたbadgeを作っていない
  const json = JSON.stringify(rev);
  assert.equal(json.includes('"verified":true'), false);
  assert.equal(rev.selectedDetails[0].verified, undefined);
});

// ── J / K / L / M ────────────────────────────────────────────
test('J: 未知の detail caseId は拒否する', () => {
  assert.throws(() => Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['NOPE'] }), /unknown detail caseId/);
});

test('K: detail caseId の重複は拒否する', () => {
  assert.throws(() => Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['OK1', 'OK1'] }), /duplicate detail caseId/);
});

test('L: detail の上限を超えたら拒否する（UIだけの制限にしない）', () => {
  const ws = Workspace.createWorkspace();
  const ids = [];
  for (let i = 0; i < Review.MAX_DETAIL_CASES + 1; i++) {
    ids.push(ws.addCase(manualPkg(), { caseId: 'C' + i }));
  }
  assert.equal(ids.length, 51);
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, detailCaseIds: ids }),
    /exceed the limit of 50/);
  // 上限ちょうどは通る
  const okRev = Review.buildReviewPackage({ workspace: ws, detailCaseIds: ids.slice(0, 50) });
  assert.equal(okRev.selectedDetails.length, 50);
});

test('M: INVALID診断は detail case に選べない', () => {
  const diagnostics = makeDiagnostics('no_such_glass');
  assert.equal(diagnostics[0].caseId, 'BAD1');
  assert.throws(() => Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics, detailCaseIds: ['BAD1'] }),
    /INVALID diagnostic cannot be selected as a detail case/);
});

// ── N / O / P / Q ────────────────────────────────────────────
test('N: comparison はちょうど2件で成立する', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), comparisonCaseIds: ['OK1', 'NOTIF'] });
  assert.equal(rev.comparison.aCaseId, 'OK1');
  assert.equal(rev.comparison.bCaseId, 'NOTIF');
  assert.equal(rev.comparison.deltaDefinition, 'delta = B - A');

  // 0件なら null
  assert.equal(Review.buildReviewPackage({ workspace: makeWorkspace() }).comparison, null);
});

test('O: 数値の差分は B - A、文字列は A / B のみ', () => {
  const ws = makeWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws, comparisonCaseIds: ['OK1', 'NOTIF'] });
  const results = Workspace.evaluateWorkspace(ws);
  const a = results.find((r) => r.caseId === 'OK1');
  const b = results.find((r) => r.caseId === 'NOTIF');

  const dp = rev.comparison.fields.find((f) => f.field === 'designPressure');
  assert.equal(dp.a, a.designPressure);
  assert.equal(dp.b, b.designPressure);
  assert.equal(dp.delta, b.designPressure - a.designPressure);

  const label = rev.comparison.fields.find((f) => f.field === 'recommendedLabel');
  assert.equal(label.delta, null, '文字列に差分を作らない');
  assert.equal(label.a, a.recommendedLabel);
});

test('P: comparison は 1件 / 3件 / 未知ID / 重複 を拒否する', () => {
  const ws = makeWorkspace();
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, comparisonCaseIds: ['OK1'] }),
    /exactly 2 caseIds/);
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, comparisonCaseIds: ['OK1', 'NOTIF', 'PRESET'] }), /exactly 2 caseIds/);
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, comparisonCaseIds: ['OK1', 'NOPE'] }),
    /unknown comparison caseId/);
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, comparisonCaseIds: ['OK1', 'OK1'] }),
    /duplicate comparison caseId/);
  const diagnostics = makeDiagnostics('no_such_glass');
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, diagnostics, comparisonCaseIds: ['OK1', 'BAD1'] }),
    /INVALID diagnostic cannot be compared/);
});

test('Q: 優劣を自動判定する語を持たない', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass'),
    detailCaseIds: ['OK1', 'NOTIF'], comparisonCaseIds: ['OK1', 'NOTIF'],
    metadata: { title: 'Sample review' } });
  const json = JSON.stringify(rev).toLowerCase();
  for (const word of ['winner', 'better', 'worse', 'safer', 'recommendedchoice', 'ranking',
                      'safetyscore', 'dangerscore']) {
    assert.equal(json.includes(word), false, word + ' を出さない');
  }
  // 曖昧な日本語も持ち込まない
  for (const word of ['最も危険', '安全率']) {
    assert.equal(JSON.stringify(rev).includes(word), false, word + ' を使わない');
  }
});

// ── R / S ────────────────────────────────────────────────────
test('R: Review JSON は Workspace として取り込めない', () => {
  const rev = Review.buildReviewPackage({ workspace: makeWorkspace() });
  assert.throws(() => Workspace.deserializeWorkspace(JSON.stringify(rev)));
});

test('S: Review JSON は Project Input Package としても取り込めない', () => {
  const rev = Review.buildReviewPackage({ workspace: makeWorkspace() });
  assert.throws(() => ProjectInput.deserialize(JSON.stringify(rev)));
});

test('§17: import系のAPIを一切exportしない', () => {
  for (const name of ['deserializeReviewPackage', 'importReviewPackage', 'loadReviewPackage',
                      'reviewToWorkspace', 'reviewToProjectInput', 'deserialize', 'parseReview']) {
    assert.equal(Review[name], undefined, name + ' は存在しない');
  }
  const src = fs.readFileSync(REVIEW_SRC, 'utf8');
  const code = stripComments(src);
  for (const name of ['deserializeReviewPackage', 'importReviewPackage', 'reviewToWorkspace']) {
    assert.equal(code.includes(name), false, name + ' をコードに持たない');
  }
});

// ── §3 ───────────────────────────────────────────────────────
test('§3: 計算済みの結論を引数として受け取らない', () => {
  const ws = makeWorkspace();
  for (const key of ['results', 'summary', 'governingCase', 'cases', 'groups', 'designPressure']) {
    const opts = { workspace: ws };
    opts[key] = key === 'results' ? [] : {};
    assert.throws(() => Review.buildReviewPackage(opts),
      /does not accept precomputed/, key + ' を拒否する');
  }
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, unknownOption: 1 }),
    /unexpected field/);
});

// ── §4 ───────────────────────────────────────────────────────
test('§4: 正規化されていない診断は受け取らない', () => {
  const ws = makeWorkspace();
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, diagnostics: [{ caseId: 'X', reason: 'raw' }] }), /status INVALID/);
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, diagnostics: [{ status: 'INVALID', source: 'made_up' }] }),
    /unknown diagnostic source/);
  // 計算値を持った「診断」は診断ではない
  const diag = makeDiagnostics('no_such_glass')[0];
  const tampered = Object.assign({}, diag, { designPressure: 1400 });
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, diagnostics: [tampered] }),
    /must keep designPressure null/);
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, diagnostics: 'nope' }),
    /diagnostics must be an array/);
});

// ── T ────────────────────────────────────────────────────────
test('T: 同じ入力からは deepEqual な Review Package が出る', () => {
  const build = () => Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass'),
    metadata: { title: 'Sample review', subtitle: 'rev A', note: 'n' },
    detailCaseIds: ['OK1', 'NOTIF'], comparisonCaseIds: ['OK1', 'NOTIF'],
    privacyMode: 'full' });
  assert.deepEqual(JSON.parse(JSON.stringify(build())), JSON.parse(JSON.stringify(build())));
  // timestampを canonical objectへ入れない
  assert.equal(JSON.stringify(build()).includes('generatedAt'), false);
});

// ── U / V / W / X ────────────────────────────────────────────
test('§6: source snapshotはstale判定には残るが、exportには出ない', () => {
  const ws = makeWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws, privacyMode: 'full' });

  // 判定には使える
  assert.equal(typeof rev.sourceSnapshot.workspace, 'string');
  assert.equal(Review.isReviewStale(rev, ws, []), false);

  // どの出口にも出ない
  const json = JSON.stringify(rev);
  assert.equal(json.includes('sourceSnapshot'), false);
  assert.equal(json.includes('inputPackage'), false);
  assert.equal(Object.keys(rev).includes('sourceSnapshot'), false);
  // 代わりにfree textを含まない要約だけを載せる
  assert.equal(rev.sourceSummary.workspaceCaseCount, 4);
  assert.equal(rev.sourceSummary.diagnosticCount, 0);
});

test('U / V: 生成後にWorkspaceが変わってもreportは変わらず、staleになる', () => {
  const ws = makeWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws });
  const before = JSON.parse(JSON.stringify(rev));

  assert.equal(Review.isReviewStale(rev, ws, []), false);
  ws.addCase(manualPkg(), { caseId: 'LATER', label: 'added later' });

  assert.deepEqual(JSON.parse(JSON.stringify(rev)), before, 'reportは黙って変わらない');
  assert.equal(rev.cases.length, 4);
  assert.equal(Review.isReviewStale(rev, ws, []), true, 'staleであることは分かる');

  // 凍っているので書き換えもできない
  assert.throws(() => { 'use strict'; rev.summary.okCount = 999; }, TypeError);
});

test('W: diagnostics配列を後から変えてもreportは変わらない', () => {
  const ws = makeWorkspace();
  const diagnostics = makeDiagnostics('no_such_glass');
  const rev = Review.buildReviewPackage({ workspace: ws, diagnostics });
  const before = JSON.parse(JSON.stringify(rev));

  diagnostics.push(diagnostics[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(rev)), before);
  assert.equal(Review.isReviewStale(rev, ws, diagnostics), true);
});

test('X: metadata objectを後から変えてもreportは変わらない', () => {
  const metadata = { title: 'Sample review', note: 'first' };
  const rev = Review.buildReviewPackage({ workspace: makeWorkspace(), metadata });
  metadata.note = 'second';
  metadata.title = 'changed';
  assert.equal(rev.metadata.note, 'first');
  assert.equal(rev.metadata.title, 'Sample review');
});

// ── Y / Z ────────────────────────────────────────────────────
test('Y: full mode では runtime label が残る', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass'),
    metadata: { title: 'Sample review', subtitle: 'sub', note: 'note text' },
    detailCaseIds: ['OK1'], privacyMode: 'full' });

  assert.equal(rev.privacyMode, 'full');
  assert.equal(rev.metadata.title, 'Sample review');
  assert.equal(rev.metadata.subtitle, 'sub');
  assert.equal(rev.metadata.note, 'note text');
  assert.equal(rev.cases.find((c) => c.caseId === 'OK1').label, 'Sample OK');
  assert.equal(rev.selectedDetails[0].label, 'Sample OK');
});

test('Z: redacted mode では free text が model の時点で消える', () => {
  // fixtureは key名と衝突しない印にする。'sub' のような短い語を使うと
  // JSONのkey "subtitle" に当たり、値が消えているのに失敗する（逆も起こりうる）。
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass'),
    metadata: { title: 'TITLE-MARKER-Q1', subtitle: 'SUBTITLE-MARKER-Q2', note: 'NOTE-MARKER-Q3' },
    detailCaseIds: ['OK1'], comparisonCaseIds: ['OK1', 'NOTIF'], privacyMode: 'redacted' });

  const json = JSON.stringify(rev);
  for (const text of ['TITLE-MARKER-Q1', 'SUBTITLE-MARKER-Q2', 'NOTE-MARKER-Q3', 'Sample OK',
                      'Sample notification', 'Sample bad']) {
    assert.equal(json.includes(text), false, text + ' が残らない');
  }
  // stale判定用のsnapshotは出口に出ない（出すとlabelが素通りする）
  assert.equal(json.includes('sourceSnapshot'), false);
  assert.equal(json.includes('glass_batch_workspace'), false);
  assert.equal(json.includes('inputPackage'), false);

  assert.equal(rev.metadata.title, Review.DEFAULT_TITLE);
  assert.equal(rev.metadata.subtitle, null);
  assert.equal(rev.metadata.note, null);
  assert.equal(rev.cases.find((c) => c.caseId === 'OK1').label, Review.REDACTED_PLACEHOLDER);
  assert.equal(rev.selectedDetails[0].label, Review.REDACTED_PLACEHOLDER);
  assert.equal(rev.comparison.aLabel, Review.REDACTED_PLACEHOLDER);

  // 数値・caseId・status・preset publicLabel は伏せない
  assert.equal(rev.cases.find((c) => c.caseId === 'OK1').designPressure, 1400);
  assert.equal(rev.summary.totalCases, 5);
  assert.equal(rev.cases.find((c) => c.caseId === 'OK1').status, 'OK');
});

// ── AA ───────────────────────────────────────────────────────
test('AA: Review生成で Evidence state は1つも動かない', () => {
  const before = {
    verifiedCases: JSON.parse(JSON.stringify(MiyoshiProjectConfig.verifiedCases)),
    dimensions: JSON.parse(JSON.stringify(MiyoshiProjectConfig.dimensions)),
    validate: MiyoshiProjectConfig.validateAllEvidence()
  };
  for (let i = 0; i < 100; i++) {
    Review.buildReviewPackage({ workspace: makeWorkspace(), detailCaseIds: ['PRESET'] });
  }
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, before.verifiedCases);
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.deepEqual(JSON.parse(JSON.stringify(MiyoshiProjectConfig.dimensions)), before.dimensions);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.deepEqual(MiyoshiProjectConfig.validateAllEvidence(), before.validate);
  assert.equal(MiyoshiProjectConfig.isFullyVerified(), false);

  const rev = Review.buildReviewPackage({ workspace: makeWorkspace() });
  assert.equal(rev.evidenceSummary.verifiedCaseCount, 0);
  assert.equal(rev.evidenceSummary.projectSpecificPromotion, 'NONE');
  assert.equal(rev.evidenceSummary.explicitUnresolvedItemCount, 4);
});

// ── §22 ──────────────────────────────────────────────────────
test('§22: 解釈注意書きは製品固定で、metadataから消せない', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(),
    metadata: { title: 'Approved', note: 'Final / Certified' } });

  assert.match(rev.interpretation.okMeaning, /候補が成立したこと/);
  assert.match(rev.interpretation.notApproval, /設計承認/);
  assert.match(rev.interpretation.notVerified, /原典と照合済み/);
  assert.throws(() => { 'use strict'; rev.interpretation.notApproval = ''; }, TypeError);

  // toolとしての承認statusは発行しない
  assert.equal(rev.approved, undefined);
  assert.equal(rev.certified, undefined);
  assert.equal(rev.decision, undefined);
  assert.equal(rev.status, undefined);
});

// ── §25 source contract ──────────────────────────────────────
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ''))
    .join('\n');
}

test('§25: review-package.js に計算の再実装が無い', () => {
  const code = stripComments(fs.readFileSync(REVIEW_SRC, 'utf8'));

  // 計算コアの識別子をコード中に持たない（コメントでの言及は別）
  for (const ident of ['k1', 'k2', 'Er', 'qBar', 'Cpe', 'Gpe', 'alpha', 'Zb', 'ZG']) {
    assert.equal(new RegExp('\\b' + ident + '\\b').test(code), false,
      ident + ' をコードに持たない');
  }
  // 計算moduleへ直接依存しない
  assert.equal(/require\(['"][^'"]*wind-pressure/.test(code), false);
  assert.equal(/require\(['"][^'"]*calc\.js/.test(code), false);
  assert.equal(code.includes('GlassCalc'), false);

  // 依存は WorkspaceCore と ProjectInput.windTraceFor 経由だけ
  assert.match(code, /WorkspaceCore\.summarize\(/);
  assert.match(code, /WorkspaceCore\.groupByRecommended\(/);
  assert.match(code, /WorkspaceCore\.evaluateWorkspace\(/);
  assert.match(code, /ProjectInput\.windTraceFor\(/);
});

// ── §26 diagnostics privacy ──────────────────────────────────
test('§26: 診断に入った秘密らしき値はReportのどこにも出ない', () => {
  // 落ちる列（glass_type）そのものへ入れる。別の列に置くと、
  // 値がvalidatorへ届かないまま通ってしまい、テストが何も確かめない。
  const secret = 'ProjectAlpha-DWG-0007-CONFIDENTIAL';
  const diagnostics = makeDiagnostics(secret);

  // 既存境界がsanitizeしていることが前提（ここで作り直さない）
  assert.equal(diagnostics[0].error.includes(secret), false,
    '前提: Phase 2G境界が既に伏せている');

  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics, privacyMode: 'full' });
  const json = JSON.stringify(rev);
  assert.equal(json.includes(secret), false, 'Review JSONに生値が出ない');
  assert.equal(json.includes('ProjectAlpha'), false);
  assert.equal(json.includes('DWG-0007'), false);

  // 診断行自体は残る（消すのではなく、位置と理由だけにする）
  const invalid = rev.cases.find((c) => c.status === 'INVALID');
  assert.equal(invalid.caseId, 'BAD1');
  assert.equal(typeof invalid.error, 'string');
});

// ── §23 bounds ───────────────────────────────────────────────
test('§23: metadata長さと diagnostics 件数は core で止める', () => {
  const ws = makeWorkspace();
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, metadata: { title: 'x'.repeat(201) } }), /metadata.title exceeds/);
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, metadata: { subtitle: 'x'.repeat(301) } }), /metadata.subtitle exceeds/);
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, metadata: { note: 'x'.repeat(2001) } }), /metadata.note exceeds/);
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, metadata: { unknown: 'x' } }), /unexpected field/);

  // 普通の人間の文章は拒まない（escapeは出力側の仕事）
  const ok = Review.buildReviewPackage({
    workspace: ws, metadata: { title: 'W < 1500 の検討 | 第2版', note: '`code` and <b>' } });
  assert.equal(ok.metadata.title, 'W < 1500 の検討 | 第2版');

  const many = [];
  const one = makeDiagnostics('no_such_glass')[0];
  for (let i = 0; i < Review.MAX_DIAGNOSTICS + 1; i++) many.push(one);
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, diagnostics: many }),
    /diagnostics exceed the limit of 1000/);
});

test('§9: privacyMode は full / redacted のみ', () => {
  assert.deepEqual(Review.PRIVACY_MODES, ['full', 'redacted']);
  assert.throws(() => Review.buildReviewPackage({
    workspace: makeWorkspace(), privacyMode: 'partial' }), /unknown privacyMode/);
  assert.equal(Review.buildReviewPackage({ workspace: makeWorkspace() }).privacyMode, 'full');
});
