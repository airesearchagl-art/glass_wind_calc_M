'use strict';

/**
 * Phase 2L-B2 / S3-B3A: Project Pack Multi-Case Execution（project-config/project-pack-batch.js）。
 *
 *   ProjectPackExecution.listCaseIds(ctx) → ケースごとに ProjectPackExecution.executeCase(ctx, caseId)
 *     → 要約の行 → 全ケースがそろったときだけ batch result（deep-frozen・pack_unreviewed）
 *
 * 期待値の取り方（oracle）:
 *   - batch の出力から期待値を作らない
 *   - G002 の値は fixture の literal と、wind-pressure.js / calc.js を直接呼んで一度だけ求めた値を
 *     literal で固定したもの（下の PINNED。S3-B2 の executor test と同じ値）
 *   - 各行は、同じ caseId を S3-B2 の executor（ProjectPackExecution.executeCase）で単独に計算した
 *     結果と一致する（executor が唯一の計算の権威）
 *   - 多ケースの合成 Pack は tests/support/synthetic-pack.js がその場で作る（実案件の値ではない）
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Pack = require('../project-config/project-pack.js');
const ProjectContext = require('../project-config/project-context.js');
const ProjectInput = require('../project-config/project-input.js');
const Registry = require('../project-config/registry.js');
const Wind = require('../wind-pressure.js');
const Glass = require('../calc.js');
const Exec = require('../project-config/project-pack-execution.js');
const Batch = require('../project-config/project-pack-batch.js');
const { stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BATCH_SRC_REL = 'project-config/project-pack-batch.js';
const BATCH_SRC = read(BATCH_SRC_REL);
const BATCH_CODE = stripComments(BATCH_SRC);

const FIXTURES = {
  notification1458: 'tests/fixtures/project-pack/synthetic-notification1458.json',
  project_pressure_map: 'tests/fixtures/project-pack/synthetic-project-pressure-map.json',
  case_direct: 'tests/fixtures/project-pack/synthetic-case-direct.json'
};
const rawPack = (mode) => JSON.parse(read(FIXTURES[mode]));
const ctxOf = (pack) => ProjectContext.fromProjectPack(Pack.validateProjectPack(pack));
const ctx = (mode) => ctxOf(rawPack(mode));

/** fixture の literal と、風圧・ガラスの計算を直接呼んで固定した値（batch からは作らない）。 */
const PINNED = Object.freeze({
  notification: { order: ['G001', 'G002', 'G003'],
    G002: { paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'lowe_fl', floor: '3', zone: 'corner',
      evaluationHeightM: 10.2, positivePressure: 1685.04324816824, negativePressure: -1409.5342125273235,
      designPressure: 1685.04324816824, best: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 }, counts: [43, 0, 6] } },
  map: { order: ['G001', 'G002', 'G003', 'G004'],
    G001: { paneId: 'P001', designPressure: 1565, best: { label: 'FL6', P: 1969.5378151260502 }, counts: [6, 1, 0] },
    G002: { paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'tp_single', floor: '5', zone: 'corner',
      positivePressure: 1135, negativePressureMagnitude: 1835, designPressure: 1835,
      best: { label: 'TP5', P: 8267.427211646136 }, counts: [6, 0, 0] },
    G003: { paneId: 'P003', widthMm: 640, heightMm: 1720 } },
  direct: { order: ['G001', 'G002'],
    G002: { paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'lowe_fl', floor: '2', designPressure: 1365,
      best: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 }, counts: [43, 0, 6] } }
});

const close = (a, b, msg) => assert.equal(Math.abs(a - b) < 1e-9, true, msg + ': ' + a + ' vs ' + b);
const rowCounts = (r) => [r.okCount, r.ngCount, r.outOfScopeCount];
const plain = (r) => JSON.parse(JSON.stringify(r));
const byId = (result, id) => result.rows.find((r) => r.caseId === id);
function walk(node, visit, at) {
  at = at || '$';
  visit(node, at);
  if (node && typeof node === 'object') Object.keys(node).forEach((k) => walk(node[k], visit, at + '.' + k));
}

/** S3-B2 の executor が単独で計算した 1 ケースから、行に出るはずの値を手で取り出す（batch を通さない）。 */
function expectedRowFromExecutor(c, caseId) {
  const r = Exec.executeCase(c, caseId);
  const p = r.pressure;
  const pressure = { pressureSource: p.pressureSource };
  if (p.mode === 'notification1458') Object.assign(pressure, { evaluationHeightM: p.evaluationHeightM,
    positivePressure: p.positivePressure, negativePressure: p.negativePressure });
  if (p.mode === 'project_pressure_map') Object.assign(pressure, { positivePressure: p.positivePressure,
    negativePressureMagnitude: p.negativePressureMagnitude });
  const row = { caseId: r.case.caseId, paneId: r.pane.paneId, glassType: r.case.glassType, widthMm: r.pane.widthMm,
    heightMm: r.pane.heightMm, designPressure: r.calculation.designPressure, pressure,
    bestCandidate: r.calculation.bestCandidate ? { label: r.calculation.bestCandidate.label, P: r.calculation.bestCandidate.P } : null,
    okCount: r.calculation.okCount, ngCount: r.calculation.ngCount, outOfScopeCount: r.calculation.outOfScopeCount };
  if ('floor' in r.case) row.floor = r.case.floor;
  if ('zone' in r.case) row.zone = r.case.zone;
  return row;
}

/* ============================================================
   B01–B04: 3 mode の全ケース・G002 の手で固定した値・executor との一致
============================================================ */

test('P2L-S3B3A-B01: notification1458 の全 3 ケース。G002 は floor 3 / corner / 10.2 m の正圧・負圧・設計風圧', () => {
  const r = Batch.executeAll(ctx('notification1458'));
  assert.equal(r.pressureMode, 'notification1458');
  assert.deepEqual(r.rows.map((x) => x.caseId), PINNED.notification.order);
  assert.equal(r.totalCases, 3);
  assert.equal(r.executedCases, 3);
  const g = byId(r, 'G002');
  const want = PINNED.notification.G002;
  assert.equal(g.paneId, want.paneId);
  assert.equal(g.widthMm, want.widthMm);
  assert.equal(g.heightMm, want.heightMm);
  assert.equal(g.glassType, want.glassType);
  assert.equal(g.floor, want.floor);
  assert.equal(g.zone, want.zone);
  assert.equal(g.pressure.evaluationHeightM, want.evaluationHeightM);
  close(g.pressure.positivePressure, want.positivePressure, 'positive');
  close(g.pressure.negativePressure, want.negativePressure, 'negative');
  close(g.designPressure, want.designPressure, 'design');
  assert.equal(g.bestCandidate.label, want.best.label);
  close(g.bestCandidate.P, want.best.P, 'P');
  assert.deepEqual(rowCounts(g), want.counts);
  // wind-pressure.js を手で書いた入力で直接呼んだ値とも一致（先頭行・general ではない）
  const direct = Wind.calculateWindPressure({ V0: 30, roughnessCategory: 'II', buildingHeightM: 18.5, eavesHeightM: 17.5,
    evaluationHeightM: 10.2, buildingType: 'closed', zone: 'corner', basis: 'notification_baseline' });
  close(g.designPressure, direct.designPressure, 'direct wind');
  close(g.pressure.negativePressure, direct.negative.pressure, 'direct wind negative');
});

test('P2L-S3B3A-B02: project_pressure_map の全 4 ケース。G002 は floor 5 の正圧 1135・corner の負圧 1835', () => {
  const r = Batch.executeAll(ctx('project_pressure_map'));
  assert.deepEqual(r.rows.map((x) => x.caseId), PINNED.map.order);
  assert.equal(r.totalCases, 4);
  const g = byId(r, 'G002');
  const want = PINNED.map.G002;
  assert.deepEqual([g.paneId, g.widthMm, g.heightMm, g.glassType, g.floor, g.zone],
    [want.paneId, want.widthMm, want.heightMm, want.glassType, want.floor, want.zone]);
  assert.equal(g.pressure.positivePressure, want.positivePressure);
  assert.equal(g.pressure.negativePressureMagnitude, want.negativePressureMagnitude);
  assert.equal(g.designPressure, want.designPressure);
  assert.equal(g.bestCandidate.label, want.best.label);
  close(g.bestCandidate.P, want.best.P, 'P');
  assert.deepEqual(rowCounts(g), want.counts);
  // G001 は NG を含む（OK だけを数えていない）。G003 は P003 の寸法（pane を取り違えない）
  const g1 = byId(r, 'G001');
  assert.equal(g1.designPressure, PINNED.map.G001.designPressure);
  assert.equal(g1.bestCandidate.label, PINNED.map.G001.best.label);
  assert.deepEqual(rowCounts(g1), PINNED.map.G001.counts);
  const g3 = byId(r, 'G003');
  assert.deepEqual([g3.paneId, g3.widthMm, g3.heightMm], [PINNED.map.G003.paneId, PINNED.map.G003.widthMm, PINNED.map.G003.heightMm]);
});

test('P2L-S3B3A-B03: case_direct の全 2 ケース。G002 は設計風圧 1365 だけで、floor 2 は宣言どおり・zone は作らない', () => {
  const r = Batch.executeAll(ctx('case_direct'));
  assert.deepEqual(r.rows.map((x) => x.caseId), PINNED.direct.order);
  const g = byId(r, 'G002');
  const want = PINNED.direct.G002;
  assert.deepEqual([g.paneId, g.widthMm, g.heightMm, g.glassType], [want.paneId, want.widthMm, want.heightMm, want.glassType]);
  assert.equal(g.designPressure, want.designPressure);
  assert.equal(g.floor, '2');
  assert.equal('zone' in g, false, 'zone を作った');
  assert.deepEqual(Object.keys(g.pressure), ['pressureSource'], 'case_direct を正圧・負圧に分けた');
  assert.equal(g.pressure.pressureSource, 'pack_case_direct');
  assert.equal(g.bestCandidate.label, want.best.label);
  assert.deepEqual(rowCounts(g), want.counts);
  const g1 = byId(r, 'G001');
  assert.equal('floor' in g1 || 'zone' in g1, false, 'G001 に floor / zone を作った');
  assert.equal(/positive|negative|Magnitude/i.test(JSON.stringify(r)), false);
});

test('P2L-S3B3A-B04: どの行も S3-B2 の executor が同じ caseId を単独で計算した結果と一致し、並び・件数・一意性は Pack どおり', () => {
  Object.keys(FIXTURES).forEach((mode) => {
    const c = ctx(mode);
    const declared = ProjectContext.requireCapability(c, 'declaredGlazingCases').glazingCases.map((x) => x.caseId);
    const r = Batch.executeAll(c);
    assert.deepEqual(r.rows.map((x) => x.caseId), declared, mode + ' の並び');
    assert.deepEqual([...Exec.listCaseIds(c)], declared);
    assert.equal(r.rows.length, declared.length);
    assert.equal(r.totalCases, declared.length);
    assert.equal(r.executedCases, declared.length);
    assert.equal(new Set(r.rows.map((x) => x.caseId)).size, declared.length, mode + ' の caseId が重複');
    r.rows.forEach((row) => assert.deepEqual(plain(row), plain(expectedRowFromExecutor(c, row.caseId)), mode + ' ' + row.caseId));
    // 寸法は行ごとの pane のもの（先頭 pane を使い回さない）
    const panes = ProjectContext.requireCapability(c, 'declaredPanes').panes;
    r.rows.forEach((row) => {
      const pane = panes.find((p) => p.paneId === row.paneId);
      assert.deepEqual([row.widthMm, row.heightMm], [pane.widthMm.value, pane.heightMm.value], mode + ' ' + row.caseId);
    });
  });
});

/* ============================================================
   B05–B08: 結果の形・trust・発行物・gate
============================================================ */

test('P2L-S3B3A-B05: 結果は deep-frozen の発行物で、形を真似た object・複製は通らない', () => {
  const r = Batch.executeAll(ctx('project_pressure_map'));
  walk(r, (node, at) => { if (node && typeof node === 'object') assert.equal(Object.isFrozen(node), true, at + ' が frozen でない'); });
  assert.equal(Batch.isBatchResult(r), true);
  assert.equal(Batch.assertBatchResult(r), r);
  [plain(r), Object.assign({}, r), null, undefined, 'x', {}].forEach((fake) => {
    assert.equal(Batch.isBatchResult(fake), false);
    assert.throws(() => Batch.assertBatchResult(fake), /was not issued by ProjectPackBatch/);
  });
  assert.deepEqual(Object.keys(r), ['batchType', 'schemaVersion', 'sourceKind', 'trust', 'publicLabel', 'pressureMode',
    'units', 'totalCases', 'executedCases', 'rows']);
  assert.equal(r.batchType, 'glass_wind_project_pack_batch_execution');
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.sourceKind, 'project_pack_unreviewed');
  assert.equal(r.publicLabel, 'Synthetic Pack Map');
  assert.deepEqual(plain(r.units), { length: 'mm', height: 'm', pressure: 'N/m²' });
  // 呼ぶたびに新しい object（前の結果を使い回さない）
  const again = Batch.executeAll(ctx('project_pressure_map'));
  assert.notEqual(again, r);
  assert.deepEqual(plain(again), plain(r));
});

test('P2L-S3B3A-B06: trust は常に pack_unreviewed。出典の申告を primary にしても結果は同じで、昇格の field は無い', () => {
  const strong = rawPack('notification1458');
  strong.evidence.sourceScopes.forEach((s) => { s.sourceClaim.claimedLevel = 'primary'; s.sourceClaim.claimedPrivateReferenceAvailable = true; });
  const r = Batch.executeAll(ctxOf(strong));
  const base = Batch.executeAll(ctx('notification1458'));
  assert.equal(r.trust, 'pack_unreviewed');
  assert.deepEqual(plain(r), plain(base));
  const forbidden = /^(verified|approved|reviewed|attested|attestation|canonicalEvidence|verifiedCases|promotion|promotionCandidate|closure|packClosure|sourceClaim|claimedLevel|evidence|evidenceClaims|records|sourceScopes|activeProjectContext|candidates|notificationTrace|trace|provenance)$/i;
  walk(r, (node, at) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      Object.keys(node).forEach((k) => assert.equal(forbidden.test(k), false, at + '.' + k));
    }
  });
  assert.equal(/verified|approved|attested|primary|claimed|合成テスト用/i.test(JSON.stringify(r)), false);
  assert.equal(Batch.TRUST, 'pack_unreviewed');
  assert.equal(Batch.SOURCE_KIND, 'project_pack_unreviewed');
});

test('P2L-S3B3A-B07: 行は要約だけ（候補の全件・風圧の trace・provenance を写さない）', () => {
  const r = Batch.executeAll(ctx('notification1458'));
  const rowKeys = ['caseId', 'paneId', 'glassType', 'widthMm', 'heightMm', 'designPressure', 'pressure', 'bestCandidate',
    'okCount', 'ngCount', 'outOfScopeCount', 'floor', 'zone'];
  r.rows.forEach((row) => {
    assert.deepEqual(Object.keys(row), rowKeys);
    assert.deepEqual(Object.keys(row.pressure), ['pressureSource', 'evaluationHeightM', 'positivePressure', 'negativePressure']);
    assert.deepEqual(Object.keys(row.bestCandidate), ['label', 'P']);
  });
  assert.equal(/notificationTrace|formula|provenance|"detail"|"status"|t_max|t_total|candidates/.test(JSON.stringify(r)), false);
});

test('P2L-S3B3A-B08: genuine な Pack context だけを通す（gate は executor のもの）', () => {
  const builtIn = ProjectContext.fromLegacyPreset(Registry.getRuntimeDefaultBuiltInPresetId());
  const genuine = ctx('case_direct');
  [builtIn, plain(genuine), Object.assign({}, genuine), rawPack('case_direct'), Pack.validateProjectPack(rawPack('case_direct')),
    null, undefined, {}].forEach((bad, i) => {
    assert.throws(() => Batch.createBatchRun(bad), Error, 'case ' + i);
    assert.throws(() => Batch.executeAll(bad), Error, 'case ' + i);
  });
});

/* ============================================================
   B09–B13: 少しずつ進める run・失敗・中止・完全性
============================================================ */

test('P2L-S3B3A-B09: run はチャンクごとに進み、全ケースがそろうまで finish できない', () => {
  const c = ctxOf(syntheticPack(120, 'project_pressure_map'));
  const run = Batch.createBatchRun(c);
  assert.equal(run.total, 120);
  assert.equal(run.executed(), 0);
  assert.throws(() => run.finish(), /not every case has been executed/);
  const seen = [];
  while (!run.isDone()) seen.push(run.nextChunk(25));
  assert.deepEqual(seen, [25, 50, 75, 100, 120]);
  assert.throws(() => run.nextChunk(25), /has no remaining cases/);
  const r = run.finish();
  assert.equal(Batch.isBatchResult(r), true);
  assert.deepEqual(plain(r), plain(Batch.executeAll(c)));
  assert.throws(() => run.finish(), /the run was finished/);
  [0, -1, 501, NaN, 'x'].forEach((n) => assert.throws(() => Batch.createBatchRun(c).nextChunk(n), /chunk size/));
});

/**
 * 本物の executor を包んだ偽の executor を vm の global に置き、そこで batch module を初期化する。
 * hook(caseId, index, real) が値を返せばそれを使い、例外を投げればそのケースが失敗する。
 */
function batchWith(hooks) {
  const h = hooks || {};
  const calls = [];
  const wrapped = Object.freeze({
    TRUST: Exec.TRUST, SOURCE_KIND: Exec.SOURCE_KIND, UNITS: Exec.UNITS, PRESSURE_SOURCES: Exec.PRESSURE_SOURCES,
    FORBIDDEN_KEYS: Exec.FORBIDDEN_KEYS,
    listCaseIds: (c) => (h.listCaseIds ? h.listCaseIds(c) : Exec.listCaseIds(c)),
    executeCase: (c, id) => { calls.push(id); return h.executeCase ? h.executeCase(c, id, calls.length - 1) : Exec.executeCase(c, id); },
    isExecutionResult: Exec.isExecutionResult,
    assertExecutionResult: Exec.assertExecutionResult
  });
  const sandbox = { ProjectPackExecution: wrapped };
  vm.createContext(sandbox);
  vm.runInContext(BATCH_SRC, sandbox, { filename: BATCH_SRC_REL });
  return { B: sandbox.ProjectPackBatch, calls };
}

test('P2L-S3B3A-B10: 途中の 1 ケースが失敗すると run 全体が失敗し、途中までの行は外へ出ない', () => {
  const c = ctxOf(syntheticPack(60, 'notification1458'));
  const { B, calls } = batchWith({ executeCase: (cc, id) => {
    if (id === 'G0037') throw new Error('forced failure');
    return Exec.executeCase(cc, id);
  } });
  const run = B.createBatchRun(c);
  assert.equal(run.nextChunk(25), 25);
  assert.throws(() => run.nextChunk(25), /forced failure/);
  assert.equal(run.hasFailed(), true);
  assert.equal(run.executed(), 0, '途中までの行が残っている');
  assert.throws(() => run.nextChunk(25), /has failed/);
  assert.throws(() => run.finish(), /the run was failed/);
  assert.equal(calls.length, 37, '失敗の後も計算を続けた');
  assert.throws(() => B.executeAll(c), /forced failure/);
});

test('P2L-S3B3A-B11: executor が別のケース・発行物でない結果・重複した caseId を返したら失敗する（fallback しない）', () => {
  const c = ctx('project_pressure_map');
  // 先頭のケースを使い回す
  const first = batchWith({ executeCase: (cc) => Exec.executeCase(cc, 'G001') });
  assert.throws(() => first.B.executeAll(c), /executor returned a different case/);
  // 形を真似た結果（発行物でない）
  const shaped = batchWith({ executeCase: (cc, id) => plain(Exec.executeCase(cc, id)) });
  assert.throws(() => shaped.B.executeAll(c), /was not issued by ProjectPackExecution/);
  // 重複した caseId の並び・途中を飛ばした並び
  const dup = batchWith({ listCaseIds: () => Object.freeze(['G001', 'G002', 'G002', 'G004']) });
  assert.throws(() => dup.B.createBatchRun(c), /duplicate caseId/);
  // 別の Pack の結果を混ぜる
  const other = ctx('case_direct');
  const mixed = batchWith({ executeCase: (cc, id) => (id === 'G002' ? Exec.executeCase(other, 'G002') : Exec.executeCase(cc, id)) });
  assert.throws(() => mixed.B.executeAll(c), /does not belong to this Pack/);
});

test('P2L-S3B3A-B12: cancel した run は以後使えず、途中までの行も捨てる', () => {
  const c = ctxOf(syntheticPack(80, 'case_direct'));
  const run = Batch.createBatchRun(c);
  run.nextChunk(25);
  assert.equal(run.executed(), 25);
  assert.equal(run.cancel(), true);
  assert.equal(run.executed(), 0);
  assert.throws(() => run.nextChunk(25), /was cancelled/);
  assert.throws(() => run.finish(), /the run was cancelled/);
  // 発行済みの結果は取り消さない（cancel は false）
  const done = Batch.createBatchRun(ctx('case_direct'));
  while (!done.isDone()) done.nextChunk(25);
  const r = done.finish();
  assert.equal(done.cancel(), false);
  assert.equal(Batch.isBatchResult(r), true);
});

test('P2L-S3B3A-B13: OK の候補が無いケースは bestCandidate null。適用範囲外は OK に数えない', () => {
  // case_direct の設計風圧を index で決める（G0001 fl_single / G0002 lowe_fl に大きな値）
  const pack = syntheticPack(8, 'case_direct', { designPressureOf: (i) => (i < 2 ? 60000 : 1200) });
  const c = ctxOf(pack);
  const r = Batch.executeAll(c);
  [0, 1].forEach((i) => {
    const row = r.rows[i];
    const pane = pack.panes.find((p) => p.paneId === pack.glazingCases[i].paneId);
    const s = Glass.splitCandidates(Glass.generateCandidates(pack.glazingCases[i].glassType,
      Glass.paneAreaM2(pane.widthMm.value, pane.heightMm.value), 60000, 1));
    assert.equal(s.okCandidates.length, 0, '前提: OK の候補が無い');
    assert.equal(row.bestCandidate, null);
    assert.deepEqual(rowCounts(row), [0, s.ngCandidates.length, s.outOfScopeCandidates.length]);
  });
  assert.equal(r.rows[1].outOfScopeCount > 0 && r.rows[1].okCount === 0, true, '適用範囲外を OK に数えた');
  assert.equal(Batch.isBatchResult(r), true);
});

/* ============================================================
   B14–B16: 多ケース・依存の固定・静的な境界
============================================================ */

test('P2L-S3B3A-B14: 合成の多ケース Pack（3 mode・最大 2000 ケース）を全件・Pack の順で計算する', () => {
  [['notification1458', 2000], ['project_pressure_map', 700], ['case_direct', 700]].forEach(([mode, n]) => {
    const c = ctxOf(syntheticPack(n, mode));
    const run = Batch.createBatchRun(c);
    let steps = 0;
    while (!run.isDone()) { run.nextChunk(25); steps++; }
    assert.equal(steps, Math.ceil(n / 25));
    const r = run.finish();
    assert.equal(r.totalCases, n);
    assert.equal(r.rows.length, n);
    assert.equal(r.rows[0].caseId, 'G0001');
    assert.equal(r.rows[n - 1].caseId, 'G' + String(n).padStart(4, '0'));
    r.rows.forEach((row, i) => assert.equal(row.caseId, 'G' + String(i + 1).padStart(4, '0')));
    // 先頭・途中・末尾のケースは executor 単独の結果と一致
    [0, Math.floor(n / 2), n - 1].forEach((i) =>
      assert.deepEqual(plain(r.rows[i]), plain(expectedRowFromExecutor(c, r.rows[i].caseId)), mode + ' ' + i));
  });
});

test('P2L-S3B3A-B15: 依存は初期化時に 1 度だけ掴む。後から差し替えた executor・後から現れた executor を使わない', () => {
  // 静的: captureDependency は定義 + 初期化時の 1 回。呼び出し時に global・require を読まない
  assert.equal((BATCH_CODE.match(/captureDependency\(/g) || []).length, 2);
  assert.match(BATCH_CODE, /var CAPTURED_EXECUTION = captureDependency\('ProjectPackExecution', '\.\/project-pack-execution\.js'\);/);
  const outside = BATCH_CODE.replace(/function captureDependency\([\s\S]*?\n  \}\n/, '');
  assert.equal(/global\s*\[|global\.ProjectPackExecution|require\(/.test(outside), false);

  // 初期化後に global を偽物へ差し替えても、掴んだ本物を使う（偽物はわざと違う値を返す）
  const sandbox = { ProjectPackExecution: Exec };
  vm.createContext(sandbox);
  vm.runInContext(BATCH_SRC, sandbox, { filename: BATCH_SRC_REL });
  let decoyCalls = 0;
  const decoy = new Proxy({}, { get: (t, k) => {
    decoyCalls++;
    if (k === 'TRUST') return 'pack_unreviewed';
    if (k === 'SOURCE_KIND') return 'project_pack_unreviewed';
    return () => { throw new Error('DECOY executor'); };
  } });
  vm.runInContext('globalThis.ProjectPackExecution = null;', sandbox);
  sandbox.ProjectPackExecution = decoy;
  assert.equal(vm.runInContext('ProjectPackExecution', sandbox), decoy, '前提: 差し替えが vm の中から見える');
  const r = sandbox.ProjectPackBatch.executeAll(ctx('project_pressure_map'));
  assert.deepEqual(plain(r), plain(Batch.executeAll(ctx('project_pressure_map'))));
  assert.equal(decoyCalls, 0, '差し替えた executor が参照された');

  // 初期化時に無ければ、後から現れた global（本物でも）を使わない。読み込み自体は失敗しない
  const empty = {};
  vm.createContext(empty);
  assert.doesNotThrow(() => vm.runInContext(BATCH_SRC, empty, { filename: BATCH_SRC_REL }));
  empty.ProjectPackExecution = Exec;
  assert.throws(() => empty.ProjectPackBatch.executeAll(ctx('case_direct')), /project-pack-execution\.js is required but not available/);
  assert.throws(() => empty.ProjectPackBatch.createBatchRun(ctx('case_direct')), /is required but not available/);

  // trust の違う executor は使わない
  const wrongTrust = { ProjectPackExecution: Object.assign({}, Exec, { TRUST: 'verified' }) };
  vm.createContext(wrongTrust);
  vm.runInContext(BATCH_SRC, wrongTrust, { filename: BATCH_SRC_REL });
  assert.throws(() => wrongTrust.ProjectPackBatch.executeAll(ctx('case_direct')), /trust is not pack_unreviewed/);
});

test('P2L-S3B3A-B16: 計算を持たない（風圧・ガラス・map・申告・入力 package・Evidence・保存に触れない）', () => {
  ['GlassCalc', 'WindPressure', 'calculateWindPressure', 'generateCandidates', 'splitCandidates', 'paneAreaM2',
    'positivePressures', 'negativePressures', 'designPressures', 'evaluationHeights', 'requireCapability', 'capabilities',
    'ProjectContext', 'ProjectPack.', 'validateProjectPack', 'fromProjectPack', 'ProjectInput', 'sourceClaim', 'claimedLevel',
    'Evidence', 'Closure', 'Promotion', 'verifiedCases', 'activeProjectContext', 'localStorage', 'sessionStorage',
    'indexedDB', 'fetch(', 'XMLHttpRequest', 'console.', 'setTimeout', 'Math.abs', 'designPressure *', '* 1.']
    .forEach((token) => assert.equal(BATCH_CODE.includes(token), false, 'batch module が ' + token + ' を使っている'));
  // 計算は executor の executeCase だけ。ケースの並びは listCaseIds だけ
  assert.equal((BATCH_CODE.match(/E\.executeCase\(/g) || []).length, 1);
  assert.equal((BATCH_CODE.match(/E\.listCaseIds\(/g) || []).length, 1);
  // 入力 package の契約は変わらない
  assert.deepEqual([...ProjectInput.SOURCE_KINDS], ['registered_preset', 'manual', 'notification_calculation', 'imported_unverified']);
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
  assert.equal(Pack.SCHEMA_VERSION, 1);
  assert.equal(ProjectContext.TRUST_BY_SOURCE_KIND.project_pack_unreviewed, 'pack_unreviewed');
});

/* ============================================================
   S3-B3B2-A0: 発行元の context の記録（origin binding）
   assertBatchOrigin(batchResult, ctx) は、発行物であることと、記録された context と ctx が
   同じ instance であることを確かめる。比較は object の同一性だけで、内容の一致では通さない。
============================================================ */

const crypto = require('node:crypto');
const Report = require('../project-config/project-pack-report.js');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const NOT_ISSUED = /was not issued by ProjectPackBatch/;
const WRONG_ORIGIN = /was not issued from the given context/;

/**
 * 発行元の記録（WeakMap.prototype.set）を数えられる batch module を vm で初期化する。
 * executeCase に hook を入れると、そのケースを失敗させられる。
 */
function countingBatch(hooks) {
  const h = hooks || {};
  const bindings = [];
  class CountingWeakMap extends WeakMap {
    set(key, value) { bindings.push([key, value]); return super.set(key, value); }
  }
  const wrapped = Object.freeze(Object.assign({}, Exec, {
    executeCase: (c, id) => (h.executeCase ? h.executeCase(c, id) : Exec.executeCase(c, id))
  }));
  const sandbox = { ProjectPackExecution: wrapped, WeakMap: CountingWeakMap };
  vm.createContext(sandbox);
  vm.runInContext(BATCH_SRC, sandbox, { filename: BATCH_SRC_REL });
  return { B: sandbox.ProjectPackBatch, bindings };
}

test('P2L-S3B3B2-O01: 同じ context から発行した結果は、その context で通る', () => {
  const c = ctx('notification1458');
  const r = Batch.executeAll(c);
  assert.equal(Batch.assertBatchOrigin(r, c), r);
  const run = Batch.createBatchRun(c);
  while (!run.isDone()) run.nextChunk(1);
  const r2 = run.finish();
  assert.equal(Batch.assertBatchOrigin(r2, c), r2);
  assert.notEqual(r2, r);
});

test('P2L-S3B3B2-O02: 内容がすべて同じでも、別の context instance なら拒否する', () => {
  const pack = syntheticPack(40, 'project_pressure_map', { label: 'Synthetic Origin Twin' });
  const a1 = ctxOf(JSON.parse(JSON.stringify(pack)));
  const a2 = ctxOf(JSON.parse(JSON.stringify(pack)));
  assert.notEqual(a1, a2);
  assert.equal(ProjectContext.isProjectContext(a1) && ProjectContext.isProjectContext(a2), true);
  assert.equal(JSON.stringify(a1), JSON.stringify(a2), '前提: 2 つの context は内容が同じ');
  assert.deepEqual([a1.publicLabel, a1.pressureModel.mode, a1.sourceKind, a1.trust],
    [a2.publicLabel, a2.pressureModel.mode, a2.sourceKind, a2.trust]);
  assert.deepEqual([...Exec.listCaseIds(a1)], [...Exec.listCaseIds(a2)]);
  const b1 = Batch.executeAll(a1);
  const b2 = Batch.executeAll(a2);
  assert.equal(JSON.stringify(b1), JSON.stringify(b2), '前提: 2 つの結果は値まで同じ');
  assert.equal(Batch.assertBatchOrigin(b1, a1), b1);
  assert.equal(Batch.assertBatchOrigin(b2, a2), b2);
  assert.throws(() => Batch.assertBatchOrigin(b1, a2), WRONG_ORIGIN);
  assert.throws(() => Batch.assertBatchOrigin(b2, a1), WRONG_ORIGIN);
});

test('P2L-S3B3B2-O03: 別の Pack の context は拒否する（結果が発行物でも）', () => {
  const cMap = ctx('project_pressure_map');
  const cDirect = ctx('case_direct');
  const r = Batch.executeAll(cMap);
  assert.equal(Batch.isBatchResult(r), true);
  assert.throws(() => Batch.assertBatchOrigin(r, cDirect), WRONG_ORIGIN);
  assert.throws(() => Batch.assertBatchOrigin(r, ctx('notification1458')), WRONG_ORIGIN);
});

test('P2L-S3B3B2-O04: 偽の結果・偽の context を拒否する（形・文字列・JSON の一致では通らない）', () => {
  const c = ctx('notification1458');
  const r = Batch.executeAll(c);
  const shapeOnly = { batchType: r.batchType, schemaVersion: 1, sourceKind: 'project_pack_unreviewed',
    trust: 'pack_unreviewed', publicLabel: r.publicLabel, pressureMode: r.pressureMode, units: plain(r.units),
    totalCases: r.totalCases, executedCases: r.executedCases, rows: plain(r.rows) };
  [plain(r), Object.assign({}, r), shapeOnly, Object.create(r), rawPack('notification1458'),
    Pack.validateProjectPack(rawPack('notification1458')), Exec.executeCase(c, 'G002'), c, null, undefined, 'batch', 0]
    .forEach((fake, i) => assert.throws(() => Batch.assertBatchOrigin(fake, c), NOT_ISSUED, 'result ' + i));
  // 本物の結果に偽の context: 複製・継承・sourceKind / trust を書いただけの object・別種の context
  const builtIn = ProjectContext.fromLegacyPreset(Registry.getRuntimeDefaultBuiltInPresetId());
  [plain(c), Object.assign({}, c), Object.create(c), { sourceKind: c.sourceKind, trust: c.trust, publicLabel: c.publicLabel },
    builtIn, rawPack('notification1458'), r, null, undefined, 'ctx', 1]
    .forEach((fake, i) => assert.throws(() => Batch.assertBatchOrigin(r, fake), WRONG_ORIGIN, 'context ' + i));
  // 例外の文面は固定（ラベル・caseId・入力値を含まない）
  assert.throws(() => Batch.assertBatchOrigin(r, ctx('notification1458')),
    { message: 'ProjectPackBatch: batch: was not issued from the given context' });
});

test('P2L-S3B3B2-O05: 2 つの正しい結果は、それぞれ自分の context でだけ通る', () => {
  const a = ctx('project_pressure_map');
  const b = ctx('case_direct');
  const ra = Batch.executeAll(a);
  const rb = Batch.executeAll(b);
  assert.equal(Batch.assertBatchOrigin(ra, a), ra);
  assert.equal(Batch.assertBatchOrigin(rb, b), rb);
  assert.throws(() => Batch.assertBatchOrigin(ra, b), WRONG_ORIGIN);
  assert.throws(() => Batch.assertBatchOrigin(rb, a), WRONG_ORIGIN);
  // run を交互に進めても、発行元はそれぞれの run を作ったときの context（後から作った run の context ではない）
  const runA = Batch.createBatchRun(a);
  const runB = Batch.createBatchRun(b);
  runA.nextChunk(1);
  runB.nextChunk(1);
  while (!runB.isDone()) runB.nextChunk(1);
  while (!runA.isDone()) runA.nextChunk(1);
  const lateB = runB.finish();
  const lateA = runA.finish();
  assert.equal(Batch.assertBatchOrigin(lateA, a), lateA);
  assert.equal(Batch.assertBatchOrigin(lateB, b), lateB);
  assert.throws(() => Batch.assertBatchOrigin(lateA, b), WRONG_ORIGIN);
  assert.throws(() => Batch.assertBatchOrigin(lateB, a), WRONG_ORIGIN);
});

test('P2L-S3B3B2-O06: 全件を終える前の finish では、発行も記録もしない', () => {
  const { B, bindings } = countingBatch();
  const c = ctxOf(syntheticPack(60, 'case_direct'));
  const run = B.createBatchRun(c);
  run.nextChunk(25);
  assert.throws(() => run.finish(), /not every case has been executed/);
  assert.equal(bindings.length, 0, '未完了の run で発行元を記録した');
  run.nextChunk(25);
  assert.throws(() => run.finish(), /not every case has been executed/);
  assert.equal(bindings.length, 0);
  // 残りを終えれば 1 件だけ記録して発行する
  run.nextChunk(25);
  const r = run.finish();
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0][0], r);
  assert.equal(bindings[0][1], c);
  assert.equal(B.assertBatchOrigin(r, c), r);
});

test('P2L-S3B3B2-O07: cancel した run は以後 finish できず、記録もしない', () => {
  const { B, bindings } = countingBatch();
  const c = ctxOf(syntheticPack(60, 'notification1458'));
  const run = B.createBatchRun(c);
  run.nextChunk(25);
  assert.equal(run.cancel(), true);
  assert.throws(() => run.finish(), /the run was cancelled/);
  assert.throws(() => run.nextChunk(25), /was cancelled/);
  assert.equal(bindings.length, 0, 'cancel した run で発行元を記録した');
  // 全件を終えてから cancel しても同じ
  const run2 = B.createBatchRun(c);
  while (!run2.isDone()) run2.nextChunk(25);
  run2.cancel();
  assert.throws(() => run2.finish(), /the run was cancelled/);
  assert.equal(bindings.length, 0);
});

test('P2L-S3B3B2-O08: 途中の 1 ケースが失敗した run は部分的な結果を発行せず、記録もしない', () => {
  const { B, bindings } = countingBatch({ executeCase: (c, id) => {
    if (id === 'G0031') throw new Error('forced failure');
    return Exec.executeCase(c, id);
  } });
  const c = ctxOf(syntheticPack(50, 'project_pressure_map'));
  const run = B.createBatchRun(c);
  run.nextChunk(25);
  assert.throws(() => run.nextChunk(25), /forced failure/);
  assert.equal(run.hasFailed(), true);
  assert.throws(() => run.finish(), /the run was failed/);
  assert.throws(() => B.executeAll(c), /forced failure/);
  assert.equal(bindings.length, 0, '失敗した run で発行元を記録した');
});

test('P2L-S3B3B2-O09: executeAll() の結果も同じ契約を満たす（記録は発行ごとに 1 件）', () => {
  const { B, bindings } = countingBatch();
  const c = ctx('case_direct');
  const r = B.executeAll(c);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0][0], r);
  assert.equal(bindings[0][1], c);
  assert.equal(B.assertBatchOrigin(r, c), r);
  assert.throws(() => B.assertBatchOrigin(r, ctx('case_direct')), WRONG_ORIGIN);
  // 本物の module でも同じ
  const genuine = Batch.executeAll(c);
  assert.equal(Batch.assertBatchOrigin(genuine, c), genuine);
});

/** main（ae156d2）の module で求めた出力の SHA-256（この PR の前の値。記録を足しても変わらない）。 */
const MAIN_OUTPUT_SHA256 = {
  notification1458: { batch: '34b6313135a56e4e2016267d2e3d1ad7e80bcfd7271d6967b90c4119d51ba195',
    json: '0c4870592915aef173d845f32cfba57afb744ef24b7c7032d8083c4faab4766d',
    csv: 'cff022f9b3c10fc1d4dd1fb3e4a7df5f66975164f3c687a87a1e07c6543d83b5' },
  project_pressure_map: { batch: 'fd34c0942dd2336b25b438d70a14b48737cc3af9442fed9a9b52a4c5a4bb8b62',
    json: '5dd5e3ab00e7834d36e89174e9993966b72e324e7e8b17a6a61d967d2e1dcace',
    csv: 'a75aef748a0f7e3b719fd40389d5a408e02a0cc120e0e4d47459330a7c86dedd' },
  case_direct: { batch: 'fe952baedc800327cd7f22055e756df7f3a396f525eea0aad8b64833edb50af1',
    json: 'a653f322e09c618be174de2aa5847da7f7250bde0edbf88738a8985893ff5d26',
    csv: '757b9672cb5af8a88b3569e60d44299e530000c5fc6179a3b5ceda820a29b390' },
  synthetic2000: { batch: '18159692844b8bec2181a461907dc61366e05190bb0463de7e8a11ecc7f1068a',
    csv: 'b59156567b0d48ca499580f585dc7944ebaa28878048be5abc8dabf609722d50' }
};

test('P2L-S3B3B2-O10: 記録を足しても結果は deep-frozen のまま・key も JSON / CSV も変わらず、context は結果に現れない', () => {
  Object.keys(FIXTURES).forEach((mode) => {
    const c = ctx(mode);
    const r = Batch.executeAll(c);
    walk(r, (node, at) => { if (node && typeof node === 'object') assert.equal(Object.isFrozen(node), true, at); });
    assert.deepEqual(Object.keys(r), ['batchType', 'schemaVersion', 'sourceKind', 'trust', 'publicLabel', 'pressureMode',
      'units', 'totalCases', 'executedCases', 'rows']);
    // 非 enumerable の property・symbol も足していない
    assert.deepEqual(Object.getOwnPropertyNames(r), Object.keys(r));
    assert.deepEqual(Object.getOwnPropertySymbols(r), []);
    assert.equal(r.schemaVersion, 1);
    const json = JSON.stringify(r);
    assert.equal(/capabilities|declaredPanes|declaredGlazingCases|evidenceClaims|sourceScopes|origin|context/i.test(json), false);
    walk(r, (node, at) => assert.notEqual(node, c, at + ' が context を参照している'));
    assert.equal(sha256(json), MAIN_OUTPUT_SHA256[mode].batch, mode + ' の batch JSON が main と違う');
    const report = Report.buildReport(r);
    assert.equal(sha256(Report.serializeJson(report)), MAIN_OUTPUT_SHA256[mode].json, mode + ' の report JSON が main と違う');
    assert.equal(sha256(Report.toCsv(report)), MAIN_OUTPUT_SHA256[mode].csv, mode + ' の report CSV が main と違う');
  });
  // 公開 API は追加だけ（既存の export はそのまま）
  assert.deepEqual(Object.keys(Batch), ['BATCH_TYPE', 'SCHEMA_VERSION', 'SOURCE_KIND', 'TRUST', 'MAX_CHUNK', 'createBatchRun',
    'executeAll', 'isBatchResult', 'assertBatchResult', 'assertBatchOrigin']);
});

test('P2L-S3B3B2-O11: 合成 2000 ケースでも記録が成立し、件数・順序・値・trust は変わらない', () => {
  const pack = syntheticPack(2000, 'notification1458');
  const c = ctxOf(JSON.parse(JSON.stringify(pack)));
  const twin = ctxOf(JSON.parse(JSON.stringify(pack)));
  const run = Batch.createBatchRun(c);
  while (!run.isDone()) run.nextChunk(25);
  const r = run.finish();
  assert.equal(Batch.assertBatchOrigin(r, c), r);
  assert.throws(() => Batch.assertBatchOrigin(r, twin), WRONG_ORIGIN);
  assert.equal(r.totalCases, 2000);
  assert.equal(r.rows.length, 2000);
  r.rows.forEach((row, i) => assert.equal(row.caseId, 'G' + String(i + 1).padStart(4, '0')));
  assert.equal(r.trust, 'pack_unreviewed');
  assert.equal(sha256(JSON.stringify(r)), MAIN_OUTPUT_SHA256.synthetic2000.batch);
  assert.equal(sha256(Report.toCsv(Report.buildReport(r))), MAIN_OUTPUT_SHA256.synthetic2000.csv);
});

test('P2L-S3B3B2-O12: 既存の利用側（ProjectPackReport.buildReport）は従来どおり動く', () => {
  const c = ctx('project_pressure_map');
  const r = Batch.executeAll(c);
  const report = Report.buildReport(r);
  assert.equal(Report.isReport(report), true);
  assert.equal(report.totalCases, 4);
  // report は発行物の gate だけを使い、origin の照合を要求しない（既存の契約のまま）
  assert.throws(() => Report.buildReport(plain(r)), NOT_ISSUED);
  // 静的: 照合は object の同一性だけ。内容・ラベル・JSON・hash で代用しない
  const start = BATCH_CODE.indexOf('function assertBatchOrigin(');
  const body = BATCH_CODE.slice(start, BATCH_CODE.indexOf('\n  }\n', start));
  assert.match(body, /originByBatch\.get\(r\) !== ctx/);
  assert.equal(/JSON|stringify|publicLabel|pressureMode|caseId|sourceKind|trust|hash|sha/i.test(body), false);
  // 記録は finish() の中で、形の検査の後・発行の直前だけ
  assert.equal((BATCH_CODE.match(/originByBatch\.set\(/g) || []).length, 1);
  const finishBody = BATCH_CODE.slice(BATCH_CODE.indexOf('function finish()'), BATCH_CODE.indexOf('return Object.freeze({'));
  const iShape = finishBody.indexOf('assertBatchResultShape(result, caseIds);');
  const iSet = finishBody.indexOf('originByBatch.set(result, originContext);');
  const iIssue = finishBody.indexOf('issued.add(result);');
  assert.equal(iShape !== -1 && iShape < iSet && iSet < iIssue, true, '記録の位置が契約と違う');
  assert.match(BATCH_CODE, /var originContext = ctx;/);
  assert.equal(/originContext\s*=(?!=)/.test(BATCH_CODE.replace('var originContext = ctx;', '')), false, '発行元を付け替えている');
  // context を外へ出す名前を持たない
  assert.equal(/originContext\s*:|projectContext\s*:|rawPack\s*:|sourceSnapshot|originHash/.test(BATCH_CODE), false);
});
