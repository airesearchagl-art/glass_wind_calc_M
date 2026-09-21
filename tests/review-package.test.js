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
  assert.equal(rev.evidenceSummary.reportChangesVerification, false);
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
  // 探すのは「自前の計算」だけ。次の2つは再実装ではないので対象外にする。
  //   1. traceからの読み出し   t.positive.Er   → property access
  //   2. report本文のラベル    '- Er / qBar: ' → string literal
  // ここを広く取りすぎると、report文言そのものが偽陽性になる（§23）。
  const executable = code
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const withoutProjections = executable.replace(/\.[A-Za-z_$][\w$]*/g, '');

  for (const ident of ['k1', 'k2', 'Er', 'qBar', 'Cpe', 'Gpe', 'alpha', 'Zb', 'ZG']) {
    assert.equal(new RegExp('\\b' + ident + '\\b').test(withoutProjections), false,
      ident + ' を自前の変数・式として持たない');
  }
  // 風圧式・強度式で使う演算を持たない
  for (const op of ['Math.pow(', 'Math.sqrt(', 'Math.log(', 'Math.exp(']) {
    assert.equal(code.includes(op), false, op + ' を持たない');
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

// ============================================================
// Required Fix: evidenceSummary は generic core の事実だけを述べる
//
// 以前は verifiedCaseCount: 0 / projectSpecificPromotion: 'NONE' /
// explicitUnresolvedItemCount: 4 を固定値で持っていた。
// 現在の案件では正しい値だが、Review coreが知り得る事実ではない。
// 手入力だけのWorkspaceでも「未解決4件」と報告してしまっていた。
// ============================================================

const PROJECT_EVIDENCE_FIELDS = [
  'verifiedCaseCount', 'projectSpecificPromotion', 'explicitUnresolvedItemCount',
  'verifiedCases', 'unresolvedItems', 'reconciliationStatus', 'promotion'
];

function assertNoProjectEvidenceClaim(rev, where) {
  for (const field of PROJECT_EVIDENCE_FIELDS) {
    assert.equal(rev.evidenceSummary[field], undefined,
      where + ': ' + field + ' を名乗らない');
  }
  const json = JSON.stringify(rev.evidenceSummary);
  assert.equal(json.includes('NONE'), false, where + ': promotion stateを名乗らない');
  assert.equal(/"[^"]*":\s*4\b/.test(json), false, where + ': 未解決4件を名乗らない');
}

test('Fix-A: 手入力だけのWorkspaceは「未解決4件」を主張しない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualPkg(), { caseId: 'M1', label: 'manual only' });
  const rev = Review.buildReviewPackage({ workspace: ws });

  assertNoProjectEvidenceClaim(rev, 'manual-only');
  assert.deepEqual(rev.evidenceSummary.bySourceKind, { manual: 1 });
  assert.deepEqual(rev.evidenceSummary.byVerificationStatus, { unverified: 1 });
  assert.equal(rev.evidenceSummary.reportChangesVerification, false);
});

test('Fix-B: 告示算定だけのWorkspaceは案件Evidence状態を主張しない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(notificationPkg(), { caseId: 'N1' });
  const rev = Review.buildReviewPackage({ workspace: ws });

  assertNoProjectEvidenceClaim(rev, 'notification-only');
  assert.deepEqual(rev.evidenceSummary.bySourceKind, { notification_calculation: 1 });
});

test('Fix-C: 取り込みデータだけのWorkspaceも案件Evidence状態を主張しない', () => {
  const imported = ProjectInput.deserialize(
    ProjectInput.serialize(manualPkg()), { forceUntrustedProvenance: true });
  const ws = Workspace.createWorkspace();
  ws.addCase(imported, { caseId: 'I1' });
  const rev = Review.buildReviewPackage({ workspace: ws });

  assertNoProjectEvidenceClaim(rev, 'imported-only');
  assert.deepEqual(rev.evidenceSummary.bySourceKind, { imported_unverified: 1 });
  assert.deepEqual(rev.evidenceSummary.byVerificationStatus, { unverified: 1 });
});

test('Fix-D / Fix-E: bySourceKind / byVerificationStatus は実際の行と一致する', () => {
  const ws = makeWorkspace();
  const diagnostics = makeDiagnostics('no_such_glass');
  const rev = Review.buildReviewPackage({ workspace: ws, diagnostics });

  const all = Workspace.mergeEvaluationResults(Workspace.evaluateWorkspace(ws), diagnostics);
  const expectedKind = {};
  const expectedStatus = {};
  all.forEach((r) => {
    const sk = r.sourceKind === null || r.sourceKind === undefined ? 'diagnostic' : r.sourceKind;
    const vs = r.verificationStatus === null || r.verificationStatus === undefined
      ? 'diagnostic' : r.verificationStatus;
    expectedKind[sk] = (expectedKind[sk] || 0) + 1;
    expectedStatus[vs] = (expectedStatus[vs] || 0) + 1;
  });

  assert.deepEqual(JSON.parse(JSON.stringify(rev.evidenceSummary.bySourceKind)), expectedKind);
  assert.deepEqual(
    JSON.parse(JSON.stringify(rev.evidenceSummary.byVerificationStatus)), expectedStatus);
  // 4 sourceKind + 1 diagnostic
  assert.equal(expectedKind.manual, 2);
  assert.equal(expectedKind.registered_preset, 1);
  assert.equal(expectedKind.notification_calculation, 1);
  assert.equal(expectedKind.diagnostic, 1);
  // presetは partially_verified のまま（verifiedへ丸めない）
  assert.equal(expectedStatus.partially_verified, 1);
});

test('Fix-G: Review coreは案件固有のEvidence値を持たない（コードのみを見る）', () => {
  const code = stripComments(fs.readFileSync(REVIEW_SRC, 'utf8'));

  // 案件状態を表す固定値をコードに持たない
  assert.equal(/explicitUnresolvedItemCount/.test(code), false);
  assert.equal(/projectSpecificPromotion/.test(code), false);
  assert.equal(/verifiedCaseCount/.test(code), false);
  assert.equal(/['"]NONE['"]/.test(code), false);
  // Phase 2F の判定語彙を持ち込まない
  for (const token of ['MATCH', 'MISMATCH', 'INSUFFICIENT_EVIDENCE', 'verifiedCases']) {
    assert.equal(code.includes(token), false, token + ' を持たない');
  }
  // 案件moduleへ依存しない
  assert.equal(/require\([^)]*miyoshi/.test(code), false);
  assert.equal(/require\([^)]*evidence/.test(code), false);
  assert.equal(code.includes('MiyoshiProjectConfig'), false);

  // 派生できる事実だけを組み立てている
  assert.match(code, /bySourceKind/);
  assert.match(code, /byVerificationStatus/);
});

// ============================================================
// Wave 3: exporters（canonical gate / JSON / Markdown）
// ============================================================

const MD_ATTACKS = [
  ['pipe', '| hacked |'],
  ['heading', '# heading'],
  ['fence', '```code'],
  ['script', '<script>alert(1)</script>'],
  ['img', '<img src=x onerror=alert(1)>'],
  ['jslink', '[link](javascript:alert(1))'],
  ['ztrace', '5<Z<40'],
  ['backslash', 'a\\b'],
  ['emph', '__bold__ *em*'],
  ['bullet', '- item'],
  ['setext', '==='],
  ['html', '<b>x</b>']
];

function attackWorkspace() {
  const ws = Workspace.createWorkspace();
  MD_ATTACKS.forEach(([id, label], i) => {
    ws.addCase(manualPkg(), { caseId: 'A' + i, label });
  });
  return ws;
}

/** 行頭のバックスラッシュを除いた「生の」出現数を数える。 */
function unescapedCount(text, char) {
  const re = new RegExp('(^|[^\\\\])\\' + char, 'g');
  return (text.match(re) || []).length;
}

// 1 / 2
test('W3-1: exporterは偽装Reviewを受け取らない', () => {
  const forged = {
    schemaVersion: 1, reportType: 'glass_design_review',
    metadata: { title: 'Forged', subtitle: null, note: null },
    privacyMode: 'full', interpretation: {}, sourceSummary: {},
    summary: { totalCases: 999, okCount: 999, governingCaseId: 'X', governingBasis: 'x' },
    groups: [], cases: [], governingCase: null, selectedDetails: [], comparison: null,
    evidenceSummary: {}
  };
  assert.throws(() => Review.serializeReviewPackage(forged),
    /requires a Review Package created by buildReviewPackage/);
  assert.throws(() => Review.toMarkdown(forged),
    /requires a Review Package created by buildReviewPackage/);
  assert.throws(() => Review.isReviewStale(forged, makeWorkspace(), []),
    /requires a Review Package created by buildReviewPackage/);
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.throws(() => Review.serializeReviewPackage(bad), /requires a Review Package/);
  }
});

test('W3-2: builderが作ったReviewは通る', () => {
  const rev = Review.buildReviewPackage({ workspace: makeWorkspace() });
  assert.equal(typeof Review.serializeReviewPackage(rev), 'string');
  assert.equal(typeof Review.toMarkdown(rev), 'string');
  assert.equal(Review.isReviewStale(rev, makeWorkspace(), []), false);
});

// 3 / 4 / 5
test('W3-3: Review JSON は決定的で、key順も固定', () => {
  const build = () => Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass'),
    metadata: { title: 'Sample', subtitle: 's', note: 'n' },
    detailCaseIds: ['OK1', 'NOTIF'], comparisonCaseIds: ['OK1', 'NOTIF'] });

  const rev = build();
  assert.equal(Review.serializeReviewPackage(rev), Review.serializeReviewPackage(rev));
  // 独立に作った同条件のreviewも一致する
  assert.equal(Review.serializeReviewPackage(build()), Review.serializeReviewPackage(build()));

  const parsed = JSON.parse(Review.serializeReviewPackage(rev));
  assert.deepEqual(Object.keys(parsed), Review.EXPORT_KEY_ORDER);
  assert.equal(Review.serializeReviewPackage(rev).includes('generatedAt'), false);
});

test('W3-4 / W3-5: exportに sourceSnapshot も inputPackage も出ない', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['NOTIF'] });
  for (const text of [Review.serializeReviewPackage(rev), Review.toMarkdown(rev)]) {
    assert.equal(text.includes('sourceSnapshot'), false);
    assert.equal(text.includes('inputPackage'), false);
    assert.equal(text.includes('glass_batch_workspace'), false);
    assert.equal(text.includes('workspaceType'), false);
  }
});

// 6 / 7
// markerは escape で姿が変わらない文字だけで作る。
// 'X-MARKER-1' のようにハイフンを入れると Markdown では 'X\-MARKER\-1' になり、
// 生の形での不在チェックが**漏れていても通ってしまう**。
test('W3-6: redacted では両方のexporterに marker が出ない', () => {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualPkg(), { caseId: 'OK1', label: 'CASELABELMARKERONE' });
  ws.addCase(notificationPkg(), { caseId: 'NOTIF', label: 'CASELABELMARKERTWO' });
  const diagnostics = Workspace.errorsToInvalidResults(
    Workspace.addTsvRows(Workspace.createWorkspace(), Workspace.parseTsv([
      'case_id\tlabel\tmode\twidth_mm\theight_mm\tglass_type\tpositive_pressure\tnegative_pressure',
      'BAD1\tDIAGLABEL-MARKER-3\tmanual\t1250\t2050\tno_such_glass\t1400\t-1400'
    ].join('\n'))).errors, 'tsv');

  const rev = Review.buildReviewPackage({
    workspace: ws, diagnostics,
    metadata: { title: 'TITLEMARKERFOUR', subtitle: 'SUBTITLEMARKERFIVE', note: 'NOTEMARKERSIX' },
    detailCaseIds: ['OK1'], comparisonCaseIds: ['OK1', 'NOTIF'],
    privacyMode: 'redacted' });

  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);
  for (const marker of ['CASELABELMARKERONE', 'CASELABELMARKERTWO', 'DIAGLABELMARKERTHREE',
                        'TITLEMARKERFOUR', 'SUBTITLEMARKERFIVE', 'NOTEMARKERSIX']) {
    assert.equal(json.includes(marker), false, 'JSON: ' + marker);
    assert.equal(md.includes(marker), false, 'Markdown: ' + marker);
  }
  // 数値・caseId・statusは残る
  assert.equal(json.includes('"caseId": "OK1"'), true);
  assert.equal(md.includes('OK1'), true);
});

test('W3-7: full では label が両方のexporterに出る', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), metadata: { title: 'TITLEMARKERSEVEN' },
    detailCaseIds: ['OK1'], privacyMode: 'full' });
  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);
  assert.equal(json.includes('Sample OK'), true);
  assert.equal(md.includes('Sample OK'), true);
  assert.equal(json.includes('TITLEMARKERSEVEN'), true);
  assert.equal(md.includes('TITLEMARKERSEVEN'), true);
});

// 8 / 9 / 10
test('W3-8 / W3-9 / W3-10: Review JSON は入力へ戻れない', () => {
  const rev = Review.buildReviewPackage({ workspace: makeWorkspace() });
  const json = Review.serializeReviewPackage(rev);

  assert.throws(() => Workspace.deserializeWorkspace(json));
  assert.throws(() => ProjectInput.deserialize(json));
  // parseして戻しても、canonical exporterは受け取らない
  assert.throws(() => Review.serializeReviewPackage(JSON.parse(json)),
    /requires a Review Package created by buildReviewPackage/);
  assert.throws(() => Review.toMarkdown(JSON.parse(json)),
    /requires a Review Package created by buildReviewPackage/);
});

// 11-17
test('W3-11〜17: Markdown injection はすべて不活性になる', () => {
  const rev = Review.buildReviewPackage({
    workspace: attackWorkspace(),
    metadata: { title: '| T # x', subtitle: '```fence', note: '- item\n=== \n# h' } });
  const md = Review.toMarkdown(rev);
  const lines = md.split('\n');

  // 構造はexporterが決めた分だけ
  assert.equal(lines.filter((l) => /^```/.test(l)).length, 0, 'code fenceを作らせない');
  assert.equal(lines.filter((l) => /^=/.test(l)).length, 0, 'setext見出しを作らせない');
  for (const l of lines.filter((l) => /^#/.test(l))) {
    assert.match(l, /^#{1,3} (ガラス設計レビュー|\\\||集計|推奨構成ごとの件数|ケース一覧|支配ケース|選択ケースの詳細|2ケース比較|出所と検証状況|備考|A\d)/,
      'runtime文字列が見出しを作っていない: ' + l);
  }
  // 生のHTML・生のリンク構文が無い
  assert.equal(unescapedCount(md, '<'), 0, '生の < が無い');
  assert.equal(/(^|[^\\])\[[^\]]*\]\(/.test(md), false, '生のlink構文が無い');
  assert.equal(md.includes('javascript:alert'), true, '文字列としては残る');
  assert.equal(/\]\(javascript:/.test(md), false, 'linkにはならない');

  // 表の列数が攻撃行でも崩れない
  const tableRows = lines.filter((l) => /^\| A\d+ /.test(l));
  assert.equal(tableRows.length, MD_ATTACKS.length);
  const expectedCols = 15; // F3で備考列を追加した
  tableRows.forEach((row) => {
    const cells = row.split(/(?<!\\)\|/).slice(1, -1);
    assert.equal(cells.length, expectedCols, '列数が崩れない: ' + row.slice(0, 60));
  });

  // 内部由来の 5<Z<40 も同じ扱いで安全に残る
  const notifRev = Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['NOTIF'] });
  const notifMd = Review.toMarkdown(notifRev);
  assert.equal(notifMd.includes('5\\<Z\\<40'), true, '内部traceもescapeされる');
  assert.equal(unescapedCount(notifMd, '<'), 0);

  // 改行が構造を作らない
  assert.equal(md.includes(' ⏎ '), true, '改行は可視の区切りへ正規化する');
});

// 18 / 19
test('W3-18 / W3-19: 式と入力の検証は分かれたまま、traceは捏造されない', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['NOTIF', 'OK1', 'PRESET'] });
  const md = Review.toMarkdown(rev);
  const json = Review.serializeReviewPackage(rev);

  assert.equal(md.includes('式の検証: verified\\_primary\\_source'), true);
  assert.equal(md.includes('入力の検証: user\\_input\\_unverified'), true);
  assert.equal(json.includes('"formulaVerificationStatus": "verified_primary_source"'), true);
  assert.equal(json.includes('"inputVerificationStatus": "user_input_unverified"'), true);
  assert.equal(json.includes('"verified": true'), false);

  // manual / preset は trace不在のまま
  const manual = rev.selectedDetails.find((d) => d.caseId === 'OK1');
  const preset = rev.selectedDetails.find((d) => d.caseId === 'PRESET');
  assert.equal(manual.traceAvailable, false);
  assert.equal(preset.traceAvailable, false);
  assert.equal(manual.windTrace, null);
  assert.equal(preset.windTrace, null);
  assert.equal(md.includes('告示風圧計算の経路を通っていない'), true);
});

// 20
test('W3-20: 比較に優劣の語が出ない（model / JSON / Markdown）', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), comparisonCaseIds: ['OK1', 'NOTIF'] });
  const texts = [JSON.stringify(rev), Review.serializeReviewPackage(rev), Review.toMarkdown(rev)];
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const w of ['winner', 'better', 'worse', 'safer', 'approved', 'certified']) {
      assert.equal(lower.includes(w), false, w + ' を出さない');
    }
    for (const w of ['優れ', '推奨すべき', '最も危険', '安全率']) {
      assert.equal(text.includes(w), false, w + ' を出さない');
    }
  }
  assert.equal(Review.toMarkdown(rev).includes('優劣の判定ではない'), true);
});

// 21 / 22
test('W3-21 / W3-22: 秘密らしき診断値も private Evidence 参照も出ない', () => {
  const secret = 'ProjectAlpha-DWG-0007-CONFIDENTIAL';
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics(secret),
    detailCaseIds: ['PRESET'], privacyMode: 'full' });

  for (const text of [Review.serializeReviewPackage(rev), Review.toMarkdown(rev)]) {
    assert.equal(text.includes(secret), false);
    assert.equal(text.includes('ProjectAlpha'), false);
    // private Evidence参照を勝手に集めない
    assert.equal(text.includes('privateReferenceAvailable'), false);
    assert.equal(text.includes('sourceReference'), false);
    assert.equal(text.includes('publicDescription'), false);
    assert.equal(text.includes('drive.google'), false);
    assert.equal(text.includes('notion.so'), false);
  }
});

// 23
test('W3-23: exportを繰り返しても Evidence state は動かない', () => {
  const before = JSON.parse(JSON.stringify(MiyoshiProjectConfig.verifiedCases));
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), detailCaseIds: ['PRESET'] });
  for (let i = 0; i < 50; i++) {
    Review.serializeReviewPackage(rev);
    Review.toMarkdown(rev);
  }
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, before);
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.deepEqual(MiyoshiProjectConfig.validateAllEvidence(), []);
});

// 24
test('W3-24: network / storage APIを持たない', () => {
  const code = stripComments(fs.readFileSync(REVIEW_SRC, 'utf8'));
  for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket',
                     'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie',
                     'eval(', 'new Function']) {
    assert.equal(code.includes(api), false, api + ' を持たない');
  }
});

// §21 export immutability
test('W3: Workspaceを変えても exporter は黙って作り直さない', () => {
  const ws = makeWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws, metadata: { title: 'Sample' } });
  const jsonBefore = Review.serializeReviewPackage(rev);
  const mdBefore = Review.toMarkdown(rev);

  ws.addCase(manualPkg(), { caseId: 'LATER', label: 'added later' });

  assert.equal(Review.serializeReviewPackage(rev), jsonBefore, 'JSONは同じ');
  assert.equal(Review.toMarkdown(rev), mdBefore, 'Markdownは同じ');
  assert.equal(jsonBefore.includes('LATER'), false);
  assert.equal(mdBefore.includes('added later'), false);
  assert.equal(Review.isReviewStale(rev, ws, []), true, 'staleであることは分かる');
});

// §19 size caps
test('W3: 1000ケースのreportは通り、上限はcore側にある', () => {
  const ws = Workspace.createWorkspace();
  for (let i = 0; i < Workspace.MAX_CASES; i++) {
    ws.addCase(notificationPkg(), { caseId: 'C' + i, label: 'Case ' + i });
  }
  const ids = [];
  for (let i = 0; i < Review.MAX_DETAIL_CASES; i++) ids.push('C' + i);

  const rev = Review.buildReviewPackage({ workspace: ws, detailCaseIds: ids });
  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);

  assert.equal(rev.cases.length, 1000);
  assert.equal(Buffer.byteLength(json, 'utf8') < Review.MAX_EXPORT_JSON_BYTES, true,
    '正当な最大reportは通る');
  assert.equal(Buffer.byteLength(md, 'utf8') < Review.MAX_EXPORT_MARKDOWN_BYTES, true);
  // 上限そのものはUIではなくcoreが持つ
  assert.equal(typeof Review.MAX_EXPORT_JSON_BYTES, 'number');
  assert.equal(typeof Review.MAX_EXPORT_MARKDOWN_BYTES, 'number');
});

// ── mutation survivor の手当て ──────────────────────────────
//
// Wave 3 の mutation で 3件が生き残った。原因は3つとも違う。
//   M4  toExportModel を通さず JSON.stringify(review) にしても同じ出力になる
//       （今は enumerable key が EXPORT_KEY_ORDER と一致しているため）
//   M14 診断の error 型検査に test が無かった → ここで塞ぐ
//   M15 output size cap は core の件数上限（1000 case / detail 50）の下では
//       そもそも到達しない
// ────────────────────────────────────────────────────────────

test('§4: 生の例外オブジェクトを reason として受け取らない（M14）', () => {
  const ws = makeWorkspace();
  const base = makeDiagnostics('no_such_glass')[0];

  for (const badError of [{ message: 'raw' }, new Error('raw'), ['raw'], 42]) {
    const tampered = Object.assign({}, base, { error: badError });
    assert.throws(() => Review.buildReviewPackage({ workspace: ws, diagnostics: [tampered] }),
      /error must be a sanitized string or null/,
      JSON.stringify(String(badError)) + ' を受け取らない');
  }
  // null と string は通る（Phase 2G境界が作る正規の形）
  assert.doesNotThrow(() => Review.buildReviewPackage({
    workspace: ws, diagnostics: [Object.assign({}, base, { error: null })] }));
  assert.doesNotThrow(() => Review.buildReviewPackage({ workspace: ws, diagnostics: [base] }));
});

test('§8 / §19: exporterは export model と size 検査を自分で通す（M4 / M15）', () => {
  const code = stripComments(fs.readFileSync(REVIEW_SRC, 'utf8'));

  function bodyOf(name) {
    const start = code.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, name + ' が見つかるはず');
    return code.slice(start, code.indexOf('\n  }', start));
  }

  // JSONは review をそのまま stringify しない。
  // 今は enumerable key が一致するので出力は同じだが、
  // 内部fieldが1つenumerableになった日に export契約へ黙って混ざる。
  const jsonBody = bodyOf('serializeReviewPackage');
  assert.match(jsonBody, /toExportModel\(review\)/);
  assert.equal(/JSON\.stringify\(review[,)]/.test(jsonBody), false,
    'review を直接 stringify しない');
  assert.match(jsonBody, /assertExportSize\(/);
  assert.match(bodyOf('toMarkdown'), /assertExportSize\(/);

  // 上限はcore側の定数として存在する（UIだけの制限にしない）
  assert.equal(Number.isFinite(Review.MAX_EXPORT_JSON_BYTES), true);
  assert.equal(Number.isFinite(Review.MAX_EXPORT_MARKDOWN_BYTES), true);
});

test('§19: 最大構成のreportと上限の距離を実測で固定する（M15）', () => {
  const ws = Workspace.createWorkspace();
  for (let i = 0; i < Workspace.MAX_CASES; i++) {
    ws.addCase(notificationPkg(), { caseId: 'C' + i, label: 'x'.repeat(Workspace.MAX_LABEL_LENGTH) });
  }
  const ids = [];
  for (let i = 0; i < Review.MAX_DETAIL_CASES; i++) ids.push('C' + i);

  const rev = Review.buildReviewPackage({
    workspace: ws, detailCaseIds: ids,
    metadata: { title: 'x'.repeat(200), note: 'y'.repeat(2000) } });
  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);

  // core自身の上限（1000 case / detail 50 / label 200）の下では、
  // output size cap には届かない。capは将来の肥大に対する外枠であって、
  // 現在到達するguardではない——という関係をここで固定する。
  assert.equal(json.length < Review.MAX_EXPORT_JSON_BYTES, true);
  assert.equal(md.length < Review.MAX_EXPORT_MARKDOWN_BYTES, true);
  assert.equal(json.length * 2 < Review.MAX_EXPORT_JSON_BYTES, true,
    '最大構成でも上限の半分未満であること（余裕が消えたら見直す）');
});

// ============================================================
// Wave 5: 継承した値を契約の値として消費しない
//
// これは prototype pollution ではない。Object.prototype は汚れていない。
// own-key検査（Object.keys / hasOwnProperty）が継承を見ないため、
// 「未知のfieldは無い」と判断したあとで、値だけが prototype から読まれていた。
// ============================================================

test('W5-proto-A: 継承した metadata を採用しない', () => {
  const ws = makeWorkspace();
  assert.throws(
    () => Review.buildReviewPackage({
      workspace: ws, metadata: Object.create({ title: 'INHERITEDTITLEMARKER991' }) }),
    /plain object with no inherited properties/);

  // object literal の __proto__: は prototype を差し替えるので同じ形
  assert.throws(
    () => Review.buildReviewPackage({
      workspace: ws, metadata: { __proto__: { title: 'LITERALMARKER992' } } }),
    /plain object with no inherited properties/);
});

test('W5-proto-B: 継承した build options を採用しない', () => {
  const ws = makeWorkspace();
  assert.throws(
    () => Review.buildReviewPackage(Object.create({ workspace: ws, privacyMode: 'redacted' })),
    /options must be a plain object with no inherited properties/);

  // 一部だけ継承させる形も同じく拒否する
  const half = Object.create({ privacyMode: 'redacted' });
  half.workspace = ws;
  assert.throws(() => Review.buildReviewPackage(half),
    /plain object with no inherited properties/);
});

test('W5-proto-C: 継承した診断を canonical として扱わない', () => {
  const ws = makeWorkspace();
  const forged = Object.create({
    status: 'INVALID', source: 'tsv', error: 'safe reason', caseId: 'BAD1', label: 'diag' });
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, diagnostics: [forged] }),
    /diagnostics\[0\] must be a plain object with no inherited properties/);

  // 本物（Phase 2G境界を通ったもの）は通る
  assert.doesNotThrow(() => Review.buildReviewPackage({
    workspace: ws, diagnostics: makeDiagnostics('no_such_glass') }));
});

test('W5-proto: 形の違う3つを別々に記録する（§6）', () => {
  const ws = makeWorkspace();

  // A: custom prototype → 構造ゲートが拒否
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, metadata: Object.create({ title: 'A' }) }),
    /no inherited properties/);

  // C: JSON.parse は **own** の "__proto__" を作る → 未知fieldとして拒否
  assert.throws(() => Review.buildReviewPackage({
    workspace: ws, metadata: JSON.parse('{"__proto__":{"title":"C"}}') }),
    /unexpected field/);

  // どちらの経路でも Object.prototype は汚れない
  assert.equal({}.title, undefined);
  assert.equal({}.workspace, undefined);
  assert.equal({}.privacyMode, undefined);
});

test('W5-proto: 普通のobjectと null-prototype は通す（選択を明示的に固定する）', () => {
  const ws = makeWorkspace();
  assert.equal(
    Review.buildReviewPackage({ workspace: ws, metadata: { title: 'Ordinary' } }).metadata.title,
    'Ordinary');

  // null prototype は「継承元が無い」ので通す、と決めた（D-019）
  const clean = Object.create(null);
  clean.title = 'NullProtoTitle';
  assert.equal(
    Review.buildReviewPackage({ workspace: ws, metadata: clean }).metadata.title,
    'NullProtoTitle');

  // class instance / Date のような非ordinary objectは通さない
  class Meta { constructor() { this.title = 'FromClass'; } }
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, metadata: new Meta() }),
    /no inherited properties/);
  assert.throws(() => Review.buildReviewPackage({ workspace: ws, metadata: new Date() }),
    /no inherited properties/);
});

test('W5-proto: 継承の判定は1か所だけ（重複guardを作らない）', () => {
  const code = stripComments(fs.readFileSync(REVIEW_SRC, 'utf8'));
  // 構造ゲートの定義は1つ
  assert.equal((code.match(/function assertOrdinaryObject\(/g) || []).length, 1);
  // 公開入口3つがそれを呼ぶ
  assert.equal((code.match(/assertOrdinaryObject\(/g) || []).length, 4,
    '定義1 + 呼び出し3');
  // field単位の継承チェックを増やしていない
  assert.equal(/\bin\s+meta\b/.test(code), false);
  assert.equal(/\bin\s+entry\b/.test(code), false);
  assert.equal(/\bin\s+options\b/.test(code), false);
});

// ============================================================
// Wave 5: 面をまたいだ一貫性（model / Markdown / JSON）
// ============================================================

/** 4つの出所をすべて含むWorkspace。 */
function allSourceKindsWorkspace() {
  const ws = Workspace.createWorkspace();
  ws.addCase(manualPkg(), { caseId: 'MAN', label: 'ManualCase' });
  ws.addCase(notificationPkg(), { caseId: 'NOT', label: 'NotifCase' });
  ws.addCase(presetPkg(), { caseId: 'PRE', label: 'PresetCase' });
  ws.addCase(ProjectInput.deserialize(ProjectInput.serialize(manualPkg()),
    { forceUntrustedProvenance: true }), { caseId: 'IMP', label: 'ImportedCase' });
  ws.addCase(manualPkg({ positivePressure: 90000, negativePressure: -90000 }),
    { caseId: 'NOSOL', label: 'HeavyCase' });
  return ws;
}

test('W5-13: 4つの出所の trust 表示が、どの面でも実態のまま', () => {
  const ws = allSourceKindsWorkspace();
  const rev = Review.buildReviewPackage({
    workspace: ws, detailCaseIds: ['MAN', 'NOT', 'PRE', 'IMP'] });
  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);

  const expected = {
    MAN: ['manual', 'unverified'],
    NOT: ['notification_calculation', 'unverified'],
    PRE: ['registered_preset', 'partially_verified'],
    IMP: ['imported_unverified', 'unverified']
  };
  for (const [caseId, [kind, status]] of Object.entries(expected)) {
    const row = rev.cases.find((c) => c.caseId === caseId);
    assert.equal(row.sourceKind, kind, caseId + ' sourceKind');
    assert.equal(row.verificationStatus, status, caseId + ' verificationStatus');

    const detail = rev.selectedDetails.find((d) => d.caseId === caseId);
    assert.equal(detail.input.sourceKind, kind);
    assert.equal(detail.input.verificationStatus, status);

    assert.equal(json.includes('"sourceKind": "' + kind + '"'), true, 'JSON: ' + kind);
    assert.equal(md.includes(Review.MAX_DETAIL_CASES ? kind.replace(/_/g, '\\_') : kind), true,
      'Markdown: ' + kind);
  }
  // 格上げしていない
  assert.equal(json.includes('"verificationStatus": "verified"'), false);
  assert.equal(rev.cases.some((c) => c.verificationStatus === 'verified'), false);
});

test('W5-14: 式の検証と入力の検証は3面すべてで別項目', () => {
  const ws = allSourceKindsWorkspace();
  const rev = Review.buildReviewPackage({
    workspace: ws, detailCaseIds: ['NOT', 'MAN', 'PRE'] });
  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);

  const notif = rev.selectedDetails.find((d) => d.caseId === 'NOT');
  assert.equal(notif.windTrace.provenance.formulaVerificationStatus, 'verified_primary_source');
  assert.equal(notif.windTrace.provenance.inputVerificationStatus, 'user_input_unverified');
  assert.equal(json.includes('"formulaVerificationStatus": "verified_primary_source"'), true);
  assert.equal(json.includes('"inputVerificationStatus": "user_input_unverified"'), true);
  assert.equal(md.includes('式の検証: verified\\_primary\\_source'), true);
  assert.equal(md.includes('入力の検証: user\\_input\\_unverified'), true);
  // ひとつの "verified" へ潰していない
  assert.equal(json.includes('"verified": true'), false);
  assert.equal(md.includes('検証: verified\n'), false);

  // manual / preset は trace不在のまま（Er / qBar を作らない）
  for (const id of ['MAN', 'PRE']) {
    const d = rev.selectedDetails.find((x) => x.caseId === id);
    assert.equal(d.traceAvailable, false);
    assert.equal(d.windTrace, null);
  }
  const traceCount = (json.match(/"qBar":/g) || []).length;
  assert.equal(traceCount, 1, 'traceは告示caseの1件だけ');
});

test('W5-15: governing は3面で同一で、独自に選び直していない', () => {
  const ws = allSourceKindsWorkspace();
  const diagnostics = makeDiagnostics('no_such_glass');
  const rev = Review.buildReviewPackage({ workspace: ws, diagnostics });

  const allResults = Workspace.mergeEvaluationResults(
    Workspace.evaluateWorkspace(ws), diagnostics);
  const expected = Workspace.summarize(allResults);

  assert.deepEqual(JSON.parse(JSON.stringify(rev.summary)), expected);
  assert.equal(rev.governingCase.caseId, expected.governingCaseId);
  assert.equal(rev.governingCase.basis, expected.governingBasis);

  // OK / NO_SOLUTION / INVALID が揃った状態での確認であること
  assert.equal(expected.okCount > 1, true);
  assert.equal(expected.noSolutionCount, 1);
  assert.equal(expected.invalidCount, 1);

  const json = JSON.parse(Review.serializeReviewPackage(rev));
  assert.equal(json.governingCase.caseId, expected.governingCaseId);
  assert.equal(json.summary.governingCaseId, expected.governingCaseId);
  const md = Review.toMarkdown(rev);
  assert.equal(md.includes('ケースID: ' + expected.governingCaseId), true);
  assert.equal(md.includes('選定根拠: ' + expected.governingBasis.replace(/_/g, '\\_')), true);
});

test('W5-16: 比較は3面で A / B / B−A のみ、評価語を持たない', () => {
  const ws = allSourceKindsWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws, comparisonCaseIds: ['MAN', 'NOT'] });
  const results = Workspace.evaluateWorkspace(ws);
  const a = results.find((r) => r.caseId === 'MAN');
  const b = results.find((r) => r.caseId === 'NOT');

  const dp = rev.comparison.fields.find((f) => f.field === 'designPressure');
  assert.equal(dp.delta, b.designPressure - a.designPressure);

  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);
  assert.equal(JSON.parse(json).comparison.deltaDefinition, 'delta = B - A');
  assert.equal(md.includes('差分 (B − A)'), true);

  // 出力だけを見る（この test 自身の文言に当てない）
  for (const text of [json, md, JSON.stringify(rev)]) {
    for (const w of ['winner', 'better', 'worse', 'safer', 'best']) {
      assert.equal(text.toLowerCase().includes(w), false, w + ' が出力に無い');
    }
  }
});

// ============================================================
// Wave 5 continuation: 記録として固定しておく事実（§26 / §27 / §34）
// ============================================================

test('W5-34: sourceSnapshotは内部に残り、外向きのどの面にも出ない', () => {
  const ws = makeWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws, detailCaseIds: ['NOTIF'] });

  // 内部には在る（stale判定に要る）
  assert.equal(typeof rev.sourceSnapshot.workspace, 'string');
  assert.equal(typeof rev.sourceSnapshot.diagnostics, 'string');
  assert.equal(Review.isReviewStale(rev, ws, []), false);

  // 外には出ない
  assert.equal(Object.keys(rev).includes('sourceSnapshot'), false);
  for (const text of [Review.serializeReviewPackage(rev), Review.toMarkdown(rev),
                      JSON.stringify(rev)]) {
    assert.equal(text.includes('sourceSnapshot'), false);
    assert.equal(text.includes('inputPackage'), false);
    assert.equal(text.includes('workspaceType'), false);
  }
  // labelを含むからといって内部snapshotを消さない（消すと厳密比較ができなくなる）
  assert.equal(rev.sourceSnapshot.workspace.includes('Sample OK'), true,
    '内部snapshotは canonical な元データのままで良い');
});

test('W5-27: case行は今も primitive のみ（M10の理由が変わっていないことの確認）', () => {
  const rev = Review.buildReviewPackage({
    workspace: makeWorkspace(), diagnostics: makeDiagnostics('no_such_glass') });

  // REVIEW_CASE_KEYS に nested field が入ったら detach(cases) が load-bearing になる。
  // その日まで M10 は SURVIVED のままで良い、という根拠をここで固定する。
  for (const row of rev.cases) {
    for (const [k, v] of Object.entries(row)) {
      assert.equal(v === null || typeof v !== 'object', true,
        'case row の ' + k + ' は primitive か null');
    }
  }
  assert.equal(Review.REVIEW_CASE_KEYS.includes('recommendedCandidate'), false,
    'nested な候補objectを行へ持ち込んでいない');
});

test('W5-26: 最大構成の実測値と上限の関係（M15の根拠を最新の実測で保つ）', () => {
  const ws = Workspace.createWorkspace();
  for (let i = 0; i < Workspace.MAX_CASES; i++) {
    ws.addCase(notificationPkg(), {
      caseId: 'C' + i, label: 'x'.repeat(Workspace.MAX_LABEL_LENGTH) });
  }
  const ids = [];
  for (let i = 0; i < Review.MAX_DETAIL_CASES; i++) ids.push('C' + i);
  const rev = Review.buildReviewPackage({
    workspace: ws, detailCaseIds: ids,
    metadata: { title: 'x'.repeat(200), note: 'y'.repeat(2000) } });

  const json = Review.serializeReviewPackage(rev);
  const md = Review.toMarkdown(rev);
  // capは UTF-8 bytes で測っている。test が .length（UTF-16 code units）で測ると
  // 多バイト文字のぶんだけ実際より小さく見える。同じ単位で比べる。
  const bytes = (t) => Buffer.byteLength(t, 'utf8');
  assert.equal(bytes(json) * 2 < Review.MAX_EXPORT_JSON_BYTES, true,
    'JSON ' + bytes(json) + ' bytes vs cap ' + Review.MAX_EXPORT_JSON_BYTES);
  assert.equal(bytes(md) * 2 < Review.MAX_EXPORT_MARKDOWN_BYTES, true,
    'MD ' + bytes(md) + ' bytes vs cap ' + Review.MAX_EXPORT_MARKDOWN_BYTES);
});

// ============================================================
// 値そのものが一致していることを確かめる（独立検証 F1）
//
// これまで summary / groups / governing の**集計**は固定していたが、
// 行と詳細の**値**を確かめる test が1つも無かった。
// そのため widthMm や allowablePressure を書き換えても、
// status を OK に固定しても、全テストが緑のまま通った（実測）。
//
// このmoduleの主張は「資料は画面と食い違わない」である。
// 食い違わないことを、集計だけでなく値で示す。
// ============================================================

test('F1: case行の全項目が、評価結果の値と一致する', () => {
  const ws = allSourceKindsWorkspace();
  const diagnostics = makeDiagnostics('no_such_glass');
  const rev = Review.buildReviewPackage({ workspace: ws, diagnostics });

  const expected = Workspace.mergeEvaluationResults(
    Workspace.evaluateWorkspace(ws), diagnostics);
  assert.equal(rev.cases.length, expected.length);

  expected.forEach((src, i) => {
    const row = rev.cases[i];
    assert.equal(row.caseId, src.caseId, 'row ' + i + ' の並び順');
    for (const key of Review.REVIEW_CASE_KEYS) {
      if (key === 'label') continue; // labelはprivacy modeで変わる（別testで固定）
      assert.deepEqual(row[key], src[key] === undefined ? null : src[key],
        row.caseId + ' の ' + key + ' が評価結果と一致する');
    }
  });

  // 実在する値であることも確かめる（すべてnullでも上のループは通るため）
  const ok = rev.cases.find((c) => c.caseId === 'MAN');
  assert.equal(ok.widthMm, 1250);
  assert.equal(ok.heightMm, 2050);
  assert.equal(ok.designPressure, 1400);
  assert.equal(typeof ok.allowablePressure, 'number');
  assert.equal(typeof ok.marginRatio, 'number');
});

test('F1: detail の input が authoritative な inputPackage と一致する', () => {
  const ws = allSourceKindsWorkspace();
  const ids = ['MAN', 'NOT', 'PRE', 'IMP'];
  const rev = Review.buildReviewPackage({ workspace: ws, detailCaseIds: ids });

  ids.forEach((id) => {
    const d = rev.selectedDetails.find((x) => x.caseId === id);
    const pkg = ws.getCase(id).inputPackage;

    assert.equal(d.input.widthMm, pkg.widthMm, id + ' widthMm');
    assert.equal(d.input.heightMm, pkg.heightMm, id + ' heightMm');
    assert.equal(d.input.glassType, pkg.glassType, id + ' glassType');
    assert.equal(d.input.extraFactor, pkg.extraFactor, id + ' extraFactor');
    assert.equal(d.input.positivePressure, pkg.positivePressure, id + ' positivePressure');
    assert.equal(d.input.negativePressure, pkg.negativePressure, id + ' negativePressure');
    assert.equal(d.input.designPressure, pkg.designPressure, id + ' designPressure');
    assert.equal(d.input.sourceKind, pkg.sourceKind, id + ' sourceKind');
    assert.equal(d.input.verificationStatus, pkg.provenance.verificationStatus, id + ' status');
    assert.equal(d.input.publicLabel, pkg.provenance.publicLabel, id + ' publicLabel');
    assert.deepEqual(d.windInput, pkg.windInput === undefined ? null : pkg.windInput,
      id + ' windInput');
  });

  // 値が実在すること（全部nullなら上は通ってしまう）
  const man = rev.selectedDetails.find((x) => x.caseId === 'MAN');
  assert.equal(man.input.widthMm, 1250);
  assert.equal(man.input.designPressure, 1400);
});

test('F1: detail の result が evaluateWorkspace の結果と一致する', () => {
  const ws = allSourceKindsWorkspace();
  const ids = ['MAN', 'NOT', 'NOSOL'];
  const rev = Review.buildReviewPackage({ workspace: ws, detailCaseIds: ids });
  const results = Workspace.evaluateWorkspace(ws);

  ids.forEach((id) => {
    const d = rev.selectedDetails.find((x) => x.caseId === id);
    const src = results.find((r) => r.caseId === id);
    assert.equal(d.result.status, src.status, id + ' status');
    assert.equal(d.result.recommendedLabel,
      src.recommendedLabel === undefined ? null : src.recommendedLabel, id + ' recommendedLabel');
    assert.equal(d.result.allowablePressure,
      src.allowablePressure === undefined ? null : src.allowablePressure, id + ' allowable');
    assert.equal(d.result.marginRatio,
      src.marginRatio === undefined ? null : src.marginRatio, id + ' marginRatio');
    assert.equal(d.result.marginPressure,
      src.marginPressure === undefined ? null : src.marginPressure, id + ' marginPressure');
    assert.equal(d.result.outOfScopePresent, !!src.outOfScopePresent, id + ' outOfScope');
  });

  // 判定が実際に分かれていること（OKで塗り潰されていないこと）
  const statuses = ids.map((id) =>
    rev.selectedDetails.find((x) => x.caseId === id).result.status);
  assert.deepEqual(statuses, ['OK', 'OK', 'NO_SOLUTION']);
});

test('F1: 同じ値が Markdown と JSON にも一致して出る', () => {
  const ws = allSourceKindsWorkspace();
  const rev = Review.buildReviewPackage({ workspace: ws, detailCaseIds: ['MAN'] });
  const json = JSON.parse(Review.serializeReviewPackage(rev));
  const md = Review.toMarkdown(rev);
  const src = Workspace.evaluateWorkspace(ws).find((r) => r.caseId === 'MAN');

  const jsonRow = json.cases.find((c) => c.caseId === 'MAN');
  assert.equal(jsonRow.widthMm, src.widthMm);
  assert.equal(jsonRow.designPressure, src.designPressure);
  assert.equal(jsonRow.allowablePressure, src.allowablePressure);
  assert.equal(json.selectedDetails[0].input.widthMm, src.widthMm);
  assert.equal(json.selectedDetails[0].result.allowablePressure, src.allowablePressure);

  // Markdown は丸めた表示だが、桁を合わせれば同じ値であること
  assert.equal(md.includes('W × H: ' + src.widthMm.toFixed(0) + ' × ' + src.heightMm.toFixed(0)),
    true, 'Markdown detail の寸法');
  assert.equal(md.includes('許容耐力: ' + src.allowablePressure.toFixed(2)), true,
    'Markdown detail の許容耐力');
});

test('F2/F3: preview / Markdown / JSON の項目立てがそろっている', () => {
  const ws = allSourceKindsWorkspace();
  const diagnostics = makeDiagnostics('no_such_glass');
  const rev = Review.buildReviewPackage({
    workspace: ws, diagnostics, detailCaseIds: ['PRE', 'MAN'] });
  const md = Review.toMarkdown(rev);
  const json = JSON.parse(Review.serializeReviewPackage(rev));
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // F3: 診断の理由は JSON にも Markdown にも出る
  const diagRow = json.cases.find((c) => c.status === 'INVALID');
  assert.equal(typeof diagRow.error, 'string');
  assert.equal(md.includes('備考'), true, 'Markdownに備考列がある');
  const headerCols = md.split('\n').find((l) => l.startsWith('| ケースID')).split('|').length;
  assert.equal(headerCols, 17, '14列 + 備考 = 15列（前後の空セルを含めて17分割）');

  // F2: publicLabel は Markdown / JSON に出るなら preview にも出す
  const presetDetail = rev.selectedDetails.find((d) => d.caseId === 'PRE');
  assert.equal(typeof presetDetail.input.publicLabel, 'string');
  assert.equal(md.includes('表示名:'), true, 'Markdownに表示名がある');
  assert.match(html, /'表示名: ' \+ revText\(d\.input\.publicLabel\)/,
    'previewにも表示名を出す');
});

test('F4: 印刷の関門は既定で不許可にしてから与え直す', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const idx = html.indexOf("addEventListener('beforeprint'");
  assert.notEqual(idx, -1);
  const handler = html.slice(idx, idx + 420);

  // 先に落とす → 確かめられたときだけ与える、の順序
  const denyAt = handler.indexOf('applyPrintEligibility(false)');
  const grantAt = handler.indexOf('applyPrintEligibility(true)');
  assert.notEqual(denyAt, -1, '既定で不許可にする');
  assert.notEqual(grantAt, -1, '確認後に許可する');
  assert.equal(denyAt < grantAt, true, '不許可が先');
  // 例外時も許可のまま残さない
  assert.match(handler, /catch\s*\(/);
});
