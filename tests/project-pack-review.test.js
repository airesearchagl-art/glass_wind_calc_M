'use strict';

/**
 * Phase 2L-B2 / S3-B3B2-A1: Pack-native Review（project-config/project-pack-review.js）。
 *
 *   ProjectPackBatch.assertBatchOrigin(batchResult, ctx)   … 発行物で、同じ ctx から発行されたものだけ
 *     → 全ケースの行（余裕比・余裕差を加える）・summary・grouping・2 ケースの比較
 *     → 選んだケースを同じ ctx で executeCase() し直し、batch の行と完全に照合した詳細
 *     → review（deep-frozen・この module の発行物）
 *
 * 期待値の取り方（oracle）。review の出力から期待値を作らない:
 *   - G002 などの値は fixture の literal と、S3-B2 / S3-B3A の test で固定した値（PINNED）
 *   - 余裕比・余裕差は、PINNED の P と設計風圧から別に（review を使わずに）求めて literal で固定した値（MARGIN_PINNED）
 *   - 行・詳細は、同じ caseId を executor（ProjectPackExecution.executeCase）で単独に計算した結果から、
 *     この test の中で組み立てる。G002（告示）は wind-pressure.js / calc.js を直接呼んだ値とも比べる
 *   - summary・grouping は、batch の行を素朴な loop で数えた値
 *   - 告示 mode の余裕比・余裕差は、Workspace（この test の中だけで使う。review module は使わない）の評価と一致する
 *   - 比較の差は、batch の行の値の引き算
 *   - 照合の失敗は、別の genuine な context から発行された executor の結果を返す差し替えの executor で起こす
 *     （executor の gate が形だけの偽物を拒否したことを、照合の成功とは数えない）
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
const Report = require('../project-config/project-pack-report.js');
const Review = require('../project-config/project-pack-review.js');
const WorkspaceCore = require('../workspace.js');
const { stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const REVIEW_SRC_REL = 'project-config/project-pack-review.js';
const REVIEW_SRC = read(REVIEW_SRC_REL);
const REVIEW_CODE = stripComments(REVIEW_SRC);

const FIXTURES = {
  notification1458: 'tests/fixtures/project-pack/synthetic-notification1458.json',
  project_pressure_map: 'tests/fixtures/project-pack/synthetic-project-pressure-map.json',
  case_direct: 'tests/fixtures/project-pack/synthetic-case-direct.json'
};
const MODES = Object.keys(FIXTURES);
const rawPack = (mode) => JSON.parse(read(FIXTURES[mode]));
const ctxOf = (pack) => ProjectContext.fromProjectPack(Pack.validateProjectPack(pack));
const ctx = (mode) => ctxOf(rawPack(mode));
const genuine = (mode) => { const c = ctx(mode); return { c, b: Batch.executeAll(c) }; };
const fromPack = (pack) => { const c = ctxOf(pack); return { c, b: Batch.executeAll(c) }; };

// mode ごとの風圧の field と出どころ（契約の literal。review module からは取らない）
const MODE_FIELDS = {
  notification1458: ['evaluationHeightM', 'positivePressure', 'negativePressure'],
  project_pressure_map: ['positivePressure', 'negativePressureMagnitude'],
  case_direct: []
};
const SOURCES = {
  notification1458: 'pack_notification_calculation',
  project_pressure_map: 'pack_pressure_map_lookup',
  case_direct: 'pack_case_direct'
};
const ALL_PRESSURE_FIELDS = ['evaluationHeightM', 'positivePressure', 'negativePressure', 'negativePressureMagnitude'];

/** fixture の literal と、風圧・ガラスの計算を直接呼んで固定した値（S3-B3A の batch test と同じ値）。 */
const PINNED = Object.freeze({
  notification: { G002: { paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'lowe_fl', floor: '3', zone: 'corner',
    evaluationHeightM: 10.2, positivePressure: 1685.04324816824, negativePressure: -1409.5342125273235,
    designPressure: 1685.04324816824, best: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 }, counts: [43, 0, 6] } },
  map: {
    G001: { designPressure: 1565, best: { label: 'FL6', P: 1969.5378151260502 }, counts: [6, 1, 0] },
    G002: { paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'tp_single', floor: '5', zone: 'corner',
      positivePressure: 1135, negativePressureMagnitude: 1835, designPressure: 1835,
      best: { label: 'TP5', P: 8267.427211646136 }, counts: [6, 0, 0] } },
  direct: {
    G001: { paneId: 'P001', widthMm: 1020, heightMm: 2240, glassType: 'fl_single', designPressure: 1245,
      best: { label: 'FL5', P: 1477.1533613445376 }, counts: [7, 0, 0] },
    G002: { paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'lowe_fl', floor: '2', designPressure: 1365,
      best: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 }, counts: [43, 0, 6] } }
});

/**
 * 余裕比 = P / 設計風圧、余裕差 = P − 設計風圧。PINNED の P と設計風圧から review を使わずに求め
 * （IEEE 754 の倍精度の 1 回の除算・減算）、literal で固定した値。
 */
const MARGIN_PINNED = Object.freeze({
  notification: { G002: { ratio: 2.1027253125741283, pressure: 1858.1398425372467 } },
  map: { G001: { ratio: 1.2584906166939618, pressure: 404.5378151260502 },
    G002: { ratio: 4.505409924602799, pressure: 6432.427211646136 } },
  direct: { G001: { ratio: 1.1864685633289458, pressure: 232.15336134453764 },
    G002: { ratio: 2.5957385279893677, pressure: 2178.183090705487 } }
});

const MSG = Object.freeze({
  notIssued: 'ProjectPackBatch: batch: was not issued by ProjectPackBatch',
  otherContext: 'ProjectPackBatch: batch: was not issued from the given context',
  mismatch: 'ProjectPackReview: selectedDetails: the re-executed case does not match the batch result',
  reExecute: 'ProjectPackReview: selectedDetails: a selected case could not be re-executed from the given context',
  reviewNotIssued: 'ProjectPackReview: review: was not issued by ProjectPackReview',
  detailCap: 'ProjectPackReview: options.detailCaseIds: selects more than 50 cases (not truncated)'
});

const close = (a, b, msg) => assert.equal(Math.abs(a - b) < 1e-9, true, msg + ': ' + a + ' vs ' + b);
const plain = (r) => JSON.parse(JSON.stringify(r));
const byId = (rows, id) => rows.find((r) => r.caseId === id);
const ids = (b) => b.rows.map((r) => r.caseId);
function walk(node, visit, at) {
  at = at || '$';
  visit(node, at);
  if (node && typeof node === 'object') Object.keys(node).forEach((k) => walk(node[k], visit, at + '.' + k));
}

/** executor が単独で計算した 1 ケースから、review の行に出るはずの値を組み立てる（review を通さない）。 */
function expectedRow(c, caseId) {
  const r = Exec.executeCase(c, caseId);
  const p = r.pressure;
  const calc = r.calculation;
  const row = { caseId: r.case.caseId, paneId: r.pane.paneId };
  if ('floor' in r.case) row.floor = r.case.floor;
  if ('zone' in r.case) row.zone = r.case.zone;
  Object.assign(row, { glassType: r.case.glassType, widthMm: r.pane.widthMm, heightMm: r.pane.heightMm,
    designPressure: calc.designPressure, pressureSource: p.pressureSource });
  MODE_FIELDS[p.mode].forEach((k) => { row[k] = p[k]; });
  const best = calc.bestCandidate;
  row.bestCandidate = best ? { label: best.label, P: best.P } : null;
  Object.assign(row, { okCount: calc.okCount, ngCount: calc.ngCount, outOfScopeCount: calc.outOfScopeCount,
    marginRatio: best ? best.P / calc.designPressure : null, marginPressure: best ? best.P - calc.designPressure : null });
  return row;
}

/** executor が単独で計算した 1 ケースから、詳細に出るはずの値を組み立てる（review を通さない）。 */
function expectedDetail(c, caseId) {
  const r = Exec.executeCase(c, caseId);
  const p = r.pressure;
  const calc = r.calculation;
  const d = { caseId: r.case.caseId, paneId: r.pane.paneId };
  if ('floor' in r.case) d.floor = r.case.floor;
  if ('zone' in r.case) d.zone = r.case.zone;
  Object.assign(d, { glassType: r.case.glassType, extraFactor: r.case.extraFactor, widthMm: r.pane.widthMm,
    heightMm: r.pane.heightMm, areaM2: calc.areaM2, pressureMode: p.mode, designPressure: calc.designPressure,
    pressureSource: p.pressureSource });
  MODE_FIELDS[p.mode].forEach((k) => { d[k] = p[k]; });
  const best = calc.bestCandidate;
  Object.assign(d, { bestCandidate: best ? { label: best.label, P: best.P } : null,
    marginRatio: best ? best.P / calc.designPressure : null, marginPressure: best ? best.P - calc.designPressure : null,
    okCount: calc.okCount, ngCount: calc.ngCount, outOfScopeCount: calc.outOfScopeCount,
    candidateSummary: calc.candidates.map((x) => ({ label: x.label, P: x.P, status: x.status })) });
  return d;
}

/** batch の行を素朴に数えた summary（review を通さない）。 */
function naiveSummary(b) {
  let withOk = 0;
  let oos = 0;
  let max = -Infinity;
  let min = Infinity;
  let any = false;
  for (const r of b.rows) {
    if (r.okCount > 0) withOk++;
    if (r.outOfScopeCount > 0) oos++;
    if (r.designPressure > max) max = r.designPressure;
    if (r.bestCandidate) { any = true; if (r.bestCandidate.P / r.designPressure < min) min = r.bestCandidate.P / r.designPressure; }
  }
  return { totalCases: b.rows.length, withOkCandidateCount: withOk, withoutOkCandidateCount: b.rows.length - withOk,
    outOfScopePresentCount: oos, maxDesignPressure: max,
    maxDesignPressureCaseIds: b.rows.filter((r) => r.designPressure === max).map((r) => r.caseId),
    minMarginRatio: any ? min : null,
    minMarginRatioCaseIds: any ? b.rows.filter((r) => r.bestCandidate && r.bestCandidate.P / r.designPressure === min).map((r) => r.caseId) : [] };
}

/** batch の行を素朴に分けた組（最初に現れた順。値の無いケースは最後に 1 組）。[値, caseIds] の列。 */
function naiveGroups(b, valueOf) {
  const values = [];
  for (const r of b.rows) { const v = valueOf(r); if (v !== null && !values.includes(v)) values.push(v); }
  const out = values.map((v) => [v, b.rows.filter((r) => valueOf(r) === v).map((r) => r.caseId)]);
  const none = b.rows.filter((r) => valueOf(r) === null).map((r) => r.caseId);
  if (none.length > 0) out.push([null, none]);
  return out;
}
const labelOf = (r) => (r.bestCandidate ? r.bestCandidate.label : null);
const floorOf = (r) => ('floor' in r ? r.floor : null);
const zoneOf = (r) => ('zone' in r ? r.zone : null);

/** review module を別の realm に読み込む（依存は globals で渡す。require は無い）。 */
function loadReview(globals) {
  const sandbox = Object.assign({}, globals);
  vm.createContext(sandbox);
  vm.runInContext(REVIEW_SRC, sandbox, { filename: REVIEW_SRC_REL });
  return sandbox;
}
/** executeCase だけを差し替えた executor（他の export は本物のまま）。 */
const execWith = (executeCase, extra) => Object.freeze(Object.assign({}, Exec, { executeCase }, extra || {}));
/** 別の genuine な context で計算した（本物の executor が発行した）結果を返す executor。 */
const execFrom = (otherCtx) => execWith((c, id) => Exec.executeCase(otherCtx, id));

const REVIEW_KEYS = ['reviewType', 'schemaVersion', 'sourceKind', 'trust', 'interpretation', 'publicLabel',
  'pressureMode', 'units', 'totalCases', 'rows', 'summary', 'groups', 'selectedDetails', 'comparison'];

/* ============================================================
   R01–R03: 最初の gate（発行物で、同じ ctx から発行された batch だけ）
============================================================ */

test('P2L-S3B3B2A1-R01: genuine な batch と同じ ctx から review を作れる（固定値・発行物・key の順）', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c);
    assert.deepEqual(Object.keys(r), REVIEW_KEYS, mode);
    assert.equal(r.reviewType, 'glass_wind_pack_review');
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.sourceKind, 'project_pack_unreviewed');
    assert.equal(r.trust, 'pack_unreviewed');
    assert.equal(r.interpretation, 'calculated_not_verified');
    assert.equal(r.publicLabel, rawPack(mode).projectMetadata.publicLabel);
    assert.equal(r.pressureMode, mode);
    assert.deepEqual(plain(r.units), { length: 'mm', height: 'm', pressure: 'N/m²', area: 'm²' });
    assert.equal(r.totalCases, b.totalCases);
    assert.deepEqual(r.selectedDetails, []);
    assert.equal(r.comparison, null);
    assert.equal(Review.isPackReview(r), true);
    assert.equal(Review.assertPackReview(r), r);
  }
  assert.deepEqual(Object.keys(Review), ['REVIEW_TYPE', 'SCHEMA_VERSION', 'SOURCE_KIND', 'TRUST', 'INTERPRETATION',
    'MAX_DETAIL_CASES', 'buildPackReview', 'isPackReview', 'assertPackReview']);
  assert.equal(Review.MAX_DETAIL_CASES, 50);
});

test('P2L-S3B3B2A1-R02: 内容が同じでも別の ctx instance なら拒否する（詳細を選んでも同じ）', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const twin = ctx(mode);   // 同じ fixture から作った別 instance（内容・ラベル・caseId・値がすべて同じ）
    assert.deepEqual(plain(Batch.executeAll(twin)), plain(b), '前提: twin の batch は内容が同じ');
    assert.throws(() => Review.buildPackReview(b, twin), { message: MSG.otherContext }, mode);
    // 詳細を選ぶと twin でも照合は一致してしまう。だから最初の gate が先に拒否しなければならない
    assert.throws(() => Review.buildPackReview(b, twin, { detailCaseIds: ids(b), comparisonCaseIds: ids(b).slice(0, 2) }),
      { message: MSG.otherContext }, mode);
    assert.equal(Review.buildPackReview(b, c).totalCases, b.totalCases, '前提: 元の ctx なら通る');
  }
  // 別の Pack・built-in の context・context でないもの
  const { b } = genuine('notification1458');
  const builtIn = ProjectContext.fromLegacyPreset(Registry.getRuntimeDefaultBuiltInPresetId());
  [ctx('project_pressure_map'), ctx('case_direct'), builtIn, plain(ctx('notification1458')),
    Object.assign({}, ctx('notification1458')), rawPack('notification1458'), null, undefined, 'ctx', 1]
    .forEach((other, i) => assert.throws(() => Review.buildPackReview(b, other), { message: MSG.otherContext }, 'other ' + i));
});

test('P2L-S3B3B2A1-R03: 形だけの object・JSON の複製・偽造・未完了の run は拒否する（UI の origin は使わない）', () => {
  const { c, b } = genuine('project_pressure_map');
  const run = Batch.createBatchRun(c);
  run.nextChunk(2);
  const shape = { batchType: b.batchType, schemaVersion: 1, sourceKind: b.sourceKind, trust: b.trust,
    publicLabel: b.publicLabel, pressureMode: b.pressureMode, units: plain(b.units), totalCases: b.totalCases,
    executedCases: b.executedCases, rows: plain(b.rows) };
  const fakes = [plain(b), Object.assign({}, b), Object.create(b), shape, rawPack('project_pressure_map'),
    Pack.validateProjectPack(rawPack('project_pressure_map')), c, Exec.executeCase(c, 'G001'), Report.buildReport(b), run,
    Batch.executeAll(ctx('case_direct')).rows, null, undefined, 'batch', 1, []];
  fakes.forEach((fake, i) => assert.throws(() => Review.buildPackReview(fake, c), { message: MSG.notIssued }, 'fake ' + i));
  // 別の Pack の genuine な batch（この ctx から発行されていない）
  const other = genuine('case_direct');
  assert.throws(() => Review.buildPackReview(other.b, c), { message: MSG.otherContext });
  // キャンセル・失敗の run は結果を発行しないので、review の入力になりうるものが無い
  const cancelled = Batch.createBatchRun(c);
  cancelled.nextChunk(1);
  cancelled.cancel();
  assert.throws(() => cancelled.finish(), /cancelled/);
  assert.throws(() => Review.buildPackReview(cancelled, c), { message: MSG.notIssued });
  assert.throws(() => run.finish(), /not every case/);
  // UI 側の鮮度用の object は根拠にならない（module はそれを読まない）
  assert.equal(REVIEW_CODE.includes('projectPackBatchOrigin'), false);
  // options が不正でも、最初に拒否するのは batch の gate
  assert.throws(() => Review.buildPackReview(plain(b), c, 'bad options'), { message: MSG.notIssued });
});

/* ============================================================
   R04–R06: 全ケースの行（3 mode・件数・並び）
============================================================ */

test('P2L-S3B3B2A1-R04: 3 mode の全ケースの行が executor の単独計算と一致する（G002 は固定値・直接計算とも一致）', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c);
    assert.deepEqual(plain(r.rows), ids(b).map((id) => expectedRow(c, id)), mode);
    r.rows.forEach((row) => {
      assert.equal(row.pressureSource, SOURCES[mode]);
      ALL_PRESSURE_FIELDS.forEach((k) => assert.equal(k in row, MODE_FIELDS[mode].includes(k), mode + ' ' + k));
    });
  }
  const notif = genuine('notification1458');
  const n = byId(Review.buildPackReview(notif.b, notif.c).rows, 'G002');
  const want = PINNED.notification.G002;
  ['paneId', 'widthMm', 'heightMm', 'glassType', 'floor', 'zone', 'evaluationHeightM'].forEach((k) => assert.equal(n[k], want[k], k));
  close(n.positivePressure, want.positivePressure, 'positive');
  close(n.negativePressure, want.negativePressure, 'negative');
  close(n.designPressure, want.designPressure, 'design');
  assert.equal(n.bestCandidate.label, want.best.label);
  close(n.bestCandidate.P, want.best.P, 'P');
  assert.deepEqual([n.okCount, n.ngCount, n.outOfScopeCount], want.counts);
  // 風圧・ガラスを直接呼んだ値（review・executor を通さない）
  const w = Wind.calculateWindPressure({ V0: 30, roughnessCategory: 'II', buildingHeightM: 18.5, eavesHeightM: 17.5,
    evaluationHeightM: 10.2, buildingType: 'closed', zone: 'corner', basis: 'notification_baseline' });
  assert.equal(n.positivePressure, w.positive.pressure);
  assert.equal(n.negativePressure, w.negative.pressure);
  assert.equal(n.designPressure, w.designPressure);
  const split = Glass.splitCandidates(Glass.generateCandidates('lowe_fl', Glass.paneAreaM2(760, 1880), w.designPressure, 1));
  assert.equal(n.bestCandidate.label, split.okCandidates[0].label);
  assert.equal(n.bestCandidate.P, split.okCandidates[0].P);
  assert.equal(n.marginRatio, split.okCandidates[0].P / w.designPressure);

  const map = genuine('project_pressure_map');
  const g = byId(Review.buildPackReview(map.b, map.c).rows, 'G002');
  const wm = PINNED.map.G002;
  ['paneId', 'widthMm', 'heightMm', 'glassType', 'floor', 'zone', 'positivePressure', 'negativePressureMagnitude',
    'designPressure'].forEach((k) => assert.equal(g[k], wm[k], k));
  assert.deepEqual(g.bestCandidate, wm.best);
  const direct = genuine('case_direct');
  const d = Review.buildPackReview(direct.b, direct.c).rows;
  assert.deepEqual(d.map((x) => [x.caseId, x.paneId, x.widthMm, x.heightMm, x.glassType, x.designPressure, x.bestCandidate.label]),
    [['G001', 'P001', 1020, 2240, 'fl_single', 1245, 'FL5'], ['G002', 'P002', 760, 1880, 'lowe_fl', 1365, 'Low-E5 + A + FL5']]);
});

test('P2L-S3B3B2A1-R05: 2 / 50 / 1000 / 1001 / 2000 ケースで全行がそろう（2000 で切り詰めない）', () => {
  for (const n of [2, 50, 1000, 1001, 2000]) {
    const { c, b } = fromPack(syntheticPack(n, 'case_direct'));
    const r = Review.buildPackReview(b, c);
    assert.equal(r.totalCases, n);
    assert.equal(r.rows.length, n);
    assert.equal(r.rows[n - 1].caseId, 'G' + String(n).padStart(4, '0'));
    assert.deepEqual(r.rows.map((x) => x.caseId), ids(b));
    assert.equal(r.summary.totalCases, n);
    assert.equal(r.summary.withOkCandidateCount + r.summary.withoutOkCandidateCount, n);
    ['byRecommended', 'byFloor', 'byZone'].forEach((k) =>
      assert.equal(r.groups[k].reduce((s, g) => s + g.count, 0), n, n + ' ' + k));
  }
  // 告示 mode の 2000 ケース: 50 件の詳細と、先頭と末尾の比較
  const { c, b } = fromPack(syntheticPack(2000, 'notification1458'));
  const r = Review.buildPackReview(b, c, { detailCaseIds: ids(b).slice(1950), comparisonCaseIds: ['G0001', 'G2000'] });
  assert.equal(r.rows.length, 2000);
  assert.deepEqual(r.rows.map((x) => x.caseId), ids(b));
  assert.deepEqual(plain(r.summary), naiveSummary(b));
  assert.deepEqual(r.selectedDetails.map((x) => x.caseId), ids(b).slice(1950));
  assert.deepEqual([...r.comparison.caseIds], ['G0001', 'G2000']);
  assert.equal(Review.assertPackReview(r), r);
});

test('P2L-S3B3B2A1-R06: 行の並び・件数・一意性は batch のまま（並べ替えない・省かない・0 で埋めない）', () => {
  // 設計風圧・余裕比が caseId の順と無関係に上下する Pack（値で並べ替えると順が変わる）
  const { c, b } = fromPack(syntheticPack(1001, 'case_direct', { designPressureOf: (i) => 1900 - (i * 37) % 900 }));
  const r = Review.buildPackReview(b, c);
  assert.deepEqual(r.rows.map((x) => x.caseId), ids(b));
  const sortedBy = (f) => b.rows.slice().sort((x, y) => f(x) - f(y)).map((x) => x.caseId);
  assert.notDeepEqual(sortedBy((x) => x.designPressure), ids(b), '前提: 設計風圧の順は batch の順と違う');
  assert.notDeepEqual(sortedBy((x) => -x.designPressure), ids(b));
  assert.notDeepEqual(sortedBy((x) => x.bestCandidate.P / x.designPressure), ids(b), '前提: 余裕比の順も違う');
  r.rows.forEach((row, i) => assert.equal(row.designPressure, b.rows[i].designPressure));
  assert.equal(new Set(r.rows.map((x) => x.caseId)).size, 1001);
  assert.equal(r.totalCases, b.totalCases);
  r.groups.byFloor.forEach((g) => {
    const order = g.caseIds.map((id) => ids(b).indexOf(id));
    assert.deepEqual(order, order.slice().sort((x, y) => x - y), 'group の中も batch の並び');
  });
  // 推奨候補の無いケースの余裕は null のまま（0 で埋めない）
  const noOk = fromPack(syntheticPack(8, 'case_direct', { designPressureOf: (i) => (i % 2 ? 60000 : 1200) }));
  const nr = Review.buildPackReview(noOk.b, noOk.c);
  nr.rows.forEach((row) => {
    if (row.bestCandidate === null) {
      assert.equal(row.marginRatio, null);
      assert.equal(row.marginPressure, null);
    } else {
      assert.equal(typeof row.marginRatio, 'number');
    }
  });
  assert.equal(nr.rows.length, 8);
});

/* ============================================================
   R07–R09: 余裕比・余裕差と summary
============================================================ */

test('P2L-S3B3B2A1-R07: 余裕比 = P / 設計風圧、余裕差 = P − 設計風圧（固定値・全行・Workspace と一致。丸めない）', () => {
  const pick = (mode, id) => { const { c, b } = genuine(mode); return byId(Review.buildPackReview(b, c).rows, id); };
  const pinned = [['notification1458', 'notification', 'G002'], ['project_pressure_map', 'map', 'G001'],
    ['project_pressure_map', 'map', 'G002'], ['case_direct', 'direct', 'G001'], ['case_direct', 'direct', 'G002']];
  for (const [mode, key, id] of pinned) {
    const row = pick(mode, id);
    assert.equal(row.marginRatio, MARGIN_PINNED[key][id].ratio, mode + ' ' + id + ' ratio');
    assert.equal(row.marginPressure, MARGIN_PINNED[key][id].pressure, mode + ' ' + id + ' pressure');
  }
  // 全行: batch の値から test の中で求めた値と完全に一致する
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const r = Review.buildPackReview(b, c);
    b.rows.forEach((br, i) => {
      assert.equal(r.rows[i].marginRatio, br.bestCandidate.P / br.designPressure);
      assert.equal(r.rows[i].marginPressure, br.bestCandidate.P - br.designPressure);
    });
  }
  // Workspace（test の中だけ）: 告示 mode の同じ入力から、同じ余裕比・余裕差・推奨候補になる
  for (const pack of [rawPack('notification1458'), syntheticPack(40, 'notification1458')]) {
    const { c, b } = fromPack(pack);
    const r = Review.buildPackReview(b, c);
    const wc = pack.windConditions;
    const panes = Object.fromEntries(pack.panes.map((p) => [p.paneId, p]));
    const heights = Object.fromEntries(wc.evaluationHeights.map((h) => [h.floor, h.height.value]));
    const ws = WorkspaceCore.createWorkspace();
    pack.glazingCases.forEach((gc) => ws.addCase(ProjectInput.fromWindCalculation({
      widthMm: panes[gc.paneId].widthMm.value, heightMm: panes[gc.paneId].heightMm.value, glassType: gc.glassType,
      extraFactor: gc.extraFactor, windInput: { V0: wc.V0.value, roughnessCategory: wc.roughnessCategory,
        buildingHeightM: wc.buildingHeightM.value, eavesHeightM: wc.eavesHeightM.value, evaluationHeightM: heights[gc.floor],
        buildingType: wc.buildingType, zone: gc.zone, basis: wc.basis } }), { caseId: gc.caseId }));
    const results = WorkspaceCore.evaluateWorkspace(ws);
    assert.equal(results.length, r.rows.length);
    results.forEach((w, i) => {
      const row = r.rows[i];
      assert.equal(w.caseId, row.caseId);
      assert.equal(w.status, 'OK');
      assert.equal(w.designPressure, row.designPressure, row.caseId + ' design');
      assert.equal(w.recommendedLabel, row.bestCandidate.label, row.caseId + ' label');
      assert.equal(w.allowablePressure, row.bestCandidate.P, row.caseId + ' P');
      assert.equal(w.marginRatio, row.marginRatio, row.caseId + ' ratio');
      assert.equal(w.marginPressure, row.marginPressure, row.caseId + ' margin');
    });
  }
  // 丸めない（full precision のまま）
  assert.equal(String(pick('project_pressure_map', 'G002').marginRatio), '4.505409924602799');
  assert.equal(/Math\.round|toFixed|toPrecision|Math\.floor\(ratio|Math\.floor\(pressure/.test(REVIEW_CODE), false);
});

test('P2L-S3B3B2A1-R08: 推奨候補が無いケースは余裕が null。件数・組・最小余裕比の対象から正しく外れる（out_of_scope は OK ではない）', () => {
  const { c, b } = fromPack(syntheticPack(8, 'case_direct', { designPressureOf: (i) => (i % 2 ? 60000 : 1200) }));
  const none = b.rows.filter((r) => r.bestCandidate === null).map((r) => r.caseId);
  assert.deepEqual(none, ['G0002', 'G0006'], '前提: 推奨候補の無いケースがある');
  assert.equal(b.rows.find((r) => r.caseId === 'G0002').outOfScopeCount > 0, true, '前提: 範囲外の候補はあるが OK は 0');
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G0002', 'G0001'], comparisonCaseIds: ['G0001', 'G0002'] });
  assert.deepEqual(plain(r.summary), naiveSummary(b));
  assert.equal(r.summary.withOkCandidateCount, 6);
  assert.equal(r.summary.withoutOkCandidateCount, 2);
  assert.equal(r.summary.minMarginRatioCaseIds.some((id) => none.includes(id)), false);
  const nullGroup = r.groups.byRecommended[r.groups.byRecommended.length - 1];
  assert.deepEqual(plain(nullGroup), { label: null, count: 2, caseIds: ['G0002', 'G0006'] });
  assert.equal(r.groups.byRecommended.filter((g) => g.label === null).length, 1);
  assert.equal(r.groups.byRecommended.some((g) => typeof g.label === 'string' && /なし|none|no.?candidate|^-$/i.test(g.label)), false);
  const d = r.selectedDetails[0];
  assert.equal(d.caseId, 'G0002');
  assert.equal(d.bestCandidate, null);
  assert.equal(d.marginRatio, null);
  assert.equal(d.marginPressure, null);
  assert.equal(d.okCount, 0);
  assert.equal(d.candidateSummary.some((x) => x.status === 'ok'), false);
  assert.equal(d.candidateSummary.filter((x) => x.status === 'out_of_scope').length, d.outOfScopeCount);
  assert.deepEqual(plain(r.selectedDetails), [expectedDetail(c, 'G0002'), expectedDetail(c, 'G0001')]);
  assert.equal(r.comparison.difference.allowablePressure, null);
  assert.equal(r.comparison.difference.marginRatio, null);
  assert.equal(r.comparison.difference.marginPressure, null);
  assert.equal(r.comparison.sameValue.recommendedLabel, null);
  // 全ケースに推奨候補が無い場合: 最小余裕比は null、caseId は空
  const all = fromPack(syntheticPack(3, 'case_direct', { designPressureOf: () => 60000 }));
  const ra = Review.buildPackReview(all.b, all.c);
  assert.equal(ra.summary.minMarginRatio, null);
  assert.deepEqual([...ra.summary.minMarginRatioCaseIds], []);
  assert.equal(ra.summary.withOkCandidateCount, all.b.rows.filter((x) => x.okCount > 0).length);
  assert.deepEqual(plain(ra.summary), naiveSummary(all.b));
});

test('P2L-S3B3B2A1-R09: 最大設計風圧と最小余裕比は別の指標（取り違えない・同値はすべて残す・支配ケースを作らない）', () => {
  const direct = genuine('case_direct');
  const rd = Review.buildPackReview(direct.b, direct.c);
  assert.deepEqual([...rd.summary.maxDesignPressureCaseIds], ['G002']);
  assert.deepEqual([...rd.summary.minMarginRatioCaseIds], ['G001']);
  assert.equal(rd.summary.maxDesignPressure, 1365);
  assert.equal(rd.summary.minMarginRatio, MARGIN_PINNED.direct.G001.ratio);
  // 同値のケースはすべて batch の並びで残る（設計風圧の最大は tp_single、余裕比の最小は fl_single）
  const { c, b } = fromPack(syntheticPack(8, 'case_direct', { paneCount: 1, designPressureOf: (i) => [1400, 1000, 1000, 3000][i % 4] }));
  const r = Review.buildPackReview(b, c);
  assert.deepEqual(plain(r.summary), naiveSummary(b));
  assert.deepEqual([...r.summary.maxDesignPressureCaseIds], ['G0004', 'G0008']);
  assert.deepEqual([...r.summary.minMarginRatioCaseIds], ['G0001', 'G0005']);
  for (const mode of MODES) {
    const g = genuine(mode);
    assert.deepEqual(plain(Review.buildPackReview(g.b, g.c).summary), naiveSummary(g.b), mode);
  }
  const map = genuine('project_pressure_map');
  const rm = Review.buildPackReview(map.b, map.c);
  assert.deepEqual([...rm.summary.maxDesignPressureCaseIds], ['G002', 'G004'], '同じ最大値の 2 ケース');
  // 「支配ケース」などの判定を作らない
  const text = JSON.stringify([rd, r, rm]);
  assert.equal(/支配|安全な|危険|最も|governing|dominant|critical|safest|worst/i.test(text), false);
  assert.equal(/支配|governing|dominant|safest|mostCritical/.test(REVIEW_CODE.replace(/'governing', 'governingCase', 'dominantCase'/, '')), false);
  assert.deepEqual(Object.keys(r.summary), ['totalCases', 'withOkCandidateCount', 'withoutOkCandidateCount',
    'outOfScopePresentCount', 'maxDesignPressure', 'maxDesignPressureCaseIds', 'minMarginRatio', 'minMarginRatioCaseIds']);
});

/* ============================================================
   R10–R11: grouping と case_direct の floor / zone
============================================================ */

test('P2L-S3B3B2A1-R10: 推奨候補・階・部位ごとの組（最初に現れた順。null / 未宣言は別の組。合計は全件）', () => {
  const sets = [genuine('notification1458'), genuine('project_pressure_map'), genuine('case_direct'),
    fromPack(syntheticPack(60, 'project_pressure_map')),
    fromPack(syntheticPack(12, 'case_direct', { designPressureOf: (i) => (i % 3 === 1 ? 60000 : 1100 + i) }))];
  for (const { c, b } of sets) {
    const r = Review.buildPackReview(b, c);
    assert.deepEqual(r.groups.byRecommended.map((g) => [g.label, [...g.caseIds]]), naiveGroups(b, labelOf));
    assert.deepEqual(r.groups.byFloor.map((g) => [g.floor, [...g.caseIds]]), naiveGroups(b, floorOf));
    assert.deepEqual(r.groups.byZone.map((g) => [g.zone, [...g.caseIds]]), naiveGroups(b, zoneOf));
    ['byRecommended', 'byFloor', 'byZone'].forEach((k) => {
      assert.equal(r.groups[k].reduce((s, g) => s + g.count, 0), b.totalCases, k);
      r.groups[k].forEach((g) => assert.equal(g.count, g.caseIds.length));
    });
    r.groups.byFloor.forEach((g) => assert.equal(g.declared, g.floor !== null));
    r.groups.byZone.forEach((g) => assert.equal(g.declared, g.zone !== null));
    assert.deepEqual(Object.keys(r.groups), ['byRecommended', 'byFloor', 'byZone']);
  }
});

test('P2L-S3B3B2A1-R11: case_direct の floor / zone は任意。宣言されたものだけを写し、推測せず、風圧に使わない', () => {
  const { c, b } = genuine('case_direct');
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G001', 'G002'], comparisonCaseIds: ['G001', 'G002'] });
  const [g1, g2] = r.rows;
  assert.equal('floor' in g1 || 'zone' in g1, false, 'G001 は floor も zone も無い');
  assert.equal(g2.floor, '2');
  assert.equal('zone' in g2, false, 'G002 は zone が無い');
  assert.deepEqual(plain(r.groups.byFloor), [{ floor: '2', declared: true, count: 1, caseIds: ['G002'] },
    { floor: null, declared: false, count: 1, caseIds: ['G001'] }]);
  assert.deepEqual(plain(r.groups.byZone), [{ zone: null, declared: false, count: 2, caseIds: ['G001', 'G002'] }]);
  assert.equal('floor' in r.selectedDetails[0] || 'zone' in r.selectedDetails[0], false);
  assert.equal(r.selectedDetails[1].floor, '2');
  assert.equal('zone' in r.selectedDetails[1], false);
  assert.equal(r.comparison.sameValue.floor, null, '片方が未宣言なら一致の判定をしない');
  assert.equal(r.comparison.sameValue.zone, null);
  // 正圧・負圧を作らない
  walk(plain(r), (node, at) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      ALL_PRESSURE_FIELDS.forEach((k) => assert.equal(k in node, false, at + '.' + k));
    }
  });
  // zone だけ宣言・floor を外す: 写すのは宣言されたものだけで、設計風圧と余裕は変わらない
  const moved = rawPack('case_direct');
  moved.glazingCases[0].zone = 'corner';
  delete moved.glazingCases[1].floor;
  const m = fromPack(moved);
  const rm = Review.buildPackReview(m.b, m.c, { detailCaseIds: ['G001', 'G002'] });
  assert.equal(rm.rows[0].zone, 'corner');
  assert.equal('floor' in rm.rows[0], false);
  assert.equal('floor' in rm.rows[1] || 'zone' in rm.rows[1], false);
  assert.deepEqual(plain(rm.groups.byZone), [{ zone: 'corner', declared: true, count: 1, caseIds: ['G001'] },
    { zone: null, declared: false, count: 1, caseIds: ['G002'] }]);
  const strip = (row) => { const x = plain(row); delete x.floor; delete x.zone; return x; };
  assert.deepEqual(rm.rows.map(strip), r.rows.map(strip), 'floor / zone は設計風圧・余裕に影響しない');
  assert.deepEqual(rm.selectedDetails.map(strip), r.selectedDetails.map(strip));
});

/* ============================================================
   R12–R14: 2 ケースの比較と選択
============================================================ */

test('P2L-S3B3B2A1-R12: 2 ケースの比較は事実だけ（差は B − A、値の無い側があれば null、順位を付けない）', () => {
  const { c, b } = genuine('case_direct');
  const r = Review.buildPackReview(b, c, { comparisonCaseIds: ['G001', 'G002'] });
  const cmp = r.comparison;
  assert.deepEqual(Object.keys(cmp), ['caseIds', 'a', 'b', 'difference', 'sameValue']);
  assert.deepEqual([...cmp.caseIds], ['G001', 'G002']);
  assert.deepEqual(plain(cmp.a), expectedRow(c, 'G001'));
  assert.deepEqual(plain(cmp.b), expectedRow(c, 'G002'));
  const P = PINNED.direct;
  const M = MARGIN_PINNED.direct;
  assert.deepEqual(plain(cmp.difference), { widthMm: 760 - 1020, heightMm: 1880 - 2240, designPressure: 1365 - 1245,
    allowablePressure: P.G002.best.P - P.G001.best.P, marginRatio: M.G002.ratio - M.G001.ratio,
    marginPressure: M.G002.pressure - M.G001.pressure });
  assert.deepEqual(plain(cmp.sameValue), { paneId: false, glassType: false, recommendedLabel: false, floor: null, zone: null });
  // 順序を入れ替えると差の符号が変わるだけ
  const rev = Review.buildPackReview(b, c, { comparisonCaseIds: ['G002', 'G001'] }).comparison;
  Object.keys(cmp.difference).forEach((k) => assert.equal(rev.difference[k], -cmp.difference[k], k));
  // 告示: 同じ pane（G001 / G003）。負圧は符号付きの差
  const n = genuine('notification1458');
  const nc = Review.buildPackReview(n.b, n.c, { comparisonCaseIds: ['G001', 'G003'] }).comparison;
  const a = byId(n.b.rows, 'G001');
  const bb = byId(n.b.rows, 'G003');
  assert.equal(nc.difference.widthMm, 0);
  assert.equal(nc.difference.evaluationHeightM, bb.pressure.evaluationHeightM - a.pressure.evaluationHeightM);
  assert.equal(nc.difference.positivePressure, bb.pressure.positivePressure - a.pressure.positivePressure);
  assert.equal(nc.difference.negativePressure, bb.pressure.negativePressure - a.pressure.negativePressure);
  assert.equal(nc.difference.designPressure, bb.designPressure - a.designPressure);
  assert.deepEqual(plain(nc.sameValue), { paneId: true, glassType: false, recommendedLabel: false, floor: false, zone: true });
  // pressure map: 同じ設計風圧（G002 / G004）
  const m = genuine('project_pressure_map');
  const mc = Review.buildPackReview(m.b, m.c, { comparisonCaseIds: ['G002', 'G004'] }).comparison;
  assert.equal(mc.difference.designPressure, 0);
  assert.equal(mc.difference.negativePressureMagnitude, 0);
  assert.equal(mc.difference.positivePressure, 1015 - 1135);
  assert.deepEqual(Object.keys(mc.difference), ['widthMm', 'heightMm', 'designPressure', 'positivePressure',
    'negativePressureMagnitude', 'allowablePressure', 'marginRatio', 'marginPressure']);
  // 順位・優劣の語を作らない
  assert.equal(/better|worse|rank|winner|safer|recommend(?!edLabel)|優|劣|有利|不利/i.test(JSON.stringify([cmp, nc, mc])), false);
  assert.equal(Review.buildPackReview(b, c).comparison, null, '指定しなければ比較は無い');
  assert.equal(Review.buildPackReview(b, c, { comparisonCaseIds: undefined }).comparison, null);
});

test('P2L-S3B3B2A1-R13: 不正な比較・詳細の選択は固定文で拒否する（caseId を文面に出さない）', () => {
  const { c, b } = genuine('notification1458');
  const cmp = 'ProjectPackReview: options.comparisonCaseIds: ';
  const det = 'ProjectPackReview: options.detailCaseIds: ';
  const cases = [
    [{ comparisonCaseIds: ['G001'] }, cmp + 'must select exactly 2 cases'],
    [{ comparisonCaseIds: ['G001', 'G002', 'G003'] }, cmp + 'must select exactly 2 cases'],
    [{ comparisonCaseIds: [] }, cmp + 'must select exactly 2 cases'],
    [{ comparisonCaseIds: null }, cmp + 'must select exactly 2 cases'],
    [{ comparisonCaseIds: 'G001,G002' }, cmp + 'must select exactly 2 cases'],
    [{ comparisonCaseIds: ['G001', 'G001'] }, cmp + 'contains a duplicated caseId'],
    [{ comparisonCaseIds: ['G001', 'G999'] }, cmp + 'contains a caseId that is not in the batch result'],
    [{ comparisonCaseIds: ['G001', 'g001'] }, cmp + 'contains a caseId that is not in the batch result'],
    [{ comparisonCaseIds: ['G001', 1] }, cmp + 'must contain non-empty caseIds'],
    [{ comparisonCaseIds: ['G001', ''] }, cmp + 'must contain non-empty caseIds'],
    [{ detailCaseIds: 'G001' }, det + 'must be a list of caseIds'],
    [{ detailCaseIds: null }, det + 'must be a list of caseIds'],
    [{ detailCaseIds: ['G001', 'G001'] }, det + 'contains a duplicated caseId'],
    [{ detailCaseIds: ['G999'] }, det + 'contains a caseId that is not in the batch result'],
    [{ detailCaseIds: ['G002', ' G001'] }, det + 'contains a caseId that is not in the batch result'],
    [{ detailCaseIds: [null] }, det + 'must contain non-empty caseIds'],
    [{ detailCaseId: ['G001'] }, 'ProjectPackReview: options: has an unsupported field'],
    [{ detailCaseIds: [], sourceClaim: {} }, 'ProjectPackReview: options: has an unsupported field'],
    [null, 'ProjectPackReview: options: must be an object'],
    [[], 'ProjectPackReview: options: must be an object'],
    ['G001', 'ProjectPackReview: options: must be an object']
  ];
  for (const [options, message] of cases) {
    assert.throws(() => Review.buildPackReview(b, c, options), { message }, JSON.stringify(options));
    assert.equal(/G\d|Synthetic|\{|"/.test(message), false);
  }
  assert.deepEqual(Review.buildPackReview(b, c, { detailCaseIds: [] }).selectedDetails, []);
  assert.deepEqual(Review.buildPackReview(b, c, {}).selectedDetails, []);
});

test('P2L-S3B3B2A1-R14: 詳細は最大 50 件。51 件は切り詰めずに拒否し、選んだ順を保つ', () => {
  const { c, b } = fromPack(syntheticPack(60, 'case_direct'));
  const fifty = ids(b).slice(5, 55).reverse();
  const r = Review.buildPackReview(b, c, { detailCaseIds: fifty });
  assert.equal(r.selectedDetails.length, 50);
  assert.deepEqual(r.selectedDetails.map((d) => d.caseId), fifty, '選んだ順のまま');
  assert.deepEqual(plain(r.selectedDetails), fifty.map((id) => expectedDetail(c, id)));
  const fiftyOne = ids(b).slice(0, 51);
  assert.throws(() => Review.buildPackReview(b, c, { detailCaseIds: fiftyOne }), { message: MSG.detailCap });
  assert.throws(() => Review.buildPackReview(b, c, { detailCaseIds: ids(b) }), { message: MSG.detailCap });
  // 呼び出し側の配列を書き換えない
  assert.equal(fiftyOne.length, 51);
  assert.equal(Review.MAX_DETAIL_CASES, 50);
});

/* ============================================================
   R15–R17: 詳細の再計算と完全照合
============================================================ */

test('P2L-S3B3B2A1-R15: 詳細は同じ ctx で executeCase() し直した結果で、batch の行と完全に一致する', () => {
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const calls = [];
    const sb = loadReview({ ProjectPackBatch: Batch,
      ProjectPackExecution: execWith((cc, id) => { calls.push([cc, id]); return Exec.executeCase(cc, id); }) });
    const order = ids(b).slice().reverse();
    const r = sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: order });
    assert.deepEqual(calls.map((x) => x[1]), order, mode + ': 選んだケースだけを選んだ順に計算し直す');
    calls.forEach(([cc]) => assert.equal(cc, c, mode + ': 発行元と確かめた同じ ctx で計算し直す'));
    assert.deepEqual(plain(r.selectedDetails), order.map((id) => expectedDetail(c, id)), mode);
    r.selectedDetails.forEach((d) => {
      const row = byId(r.rows, d.caseId);
      ['caseId', 'paneId', 'glassType', 'widthMm', 'heightMm', 'designPressure', 'pressureSource', 'okCount', 'ngCount',
        'outOfScopeCount', 'marginRatio', 'marginPressure'].concat(MODE_FIELDS[mode])
        .forEach((k) => assert.equal(d[k], row[k], mode + ' ' + d.caseId + ' ' + k));
      assert.deepEqual(plain(d.bestCandidate), plain(row.bestCandidate));
      assert.equal(d.candidateSummary.length, d.okCount + d.ngCount + d.outOfScopeCount);
      d.candidateSummary.forEach((x) => assert.deepEqual(Object.keys(x), ['label', 'P', 'status']));
    });
    // 詳細を選ばなければ計算し直さない
    calls.length = 0;
    sb.ProjectPackReview.buildPackReview(b, c);
    assert.equal(calls.length, 0);
  }
  // 2000 ケースから 50 件
  const big = fromPack(syntheticPack(2000, 'notification1458'));
  const pickIds = ids(big.b).filter((_, i) => i % 40 === 7);
  assert.equal(pickIds.length, 50);
  const r = Review.buildPackReview(big.b, big.c, { detailCaseIds: pickIds });
  assert.deepEqual(plain(r.selectedDetails), pickIds.map((id) => expectedDetail(big.c, id)));
});

test('P2L-S3B3B2A1-R16: 別の genuine な context の結果が 1 field でも違えば review 全体を拒否する（部分的な review を返さない）', () => {
  // [名前, mode, caseId, 行で違うはずの field（executor の単独計算で確かめる。null は確かめない）, twin の変更, 両方に入れる変更]
  const variants = [
    // 設計風圧・推奨候補・件数は同じで、正圧だけが違う
    ['map positive only', 'project_pressure_map', 'G002', ['positivePressure'],
      (p) => { p.windConditions.positivePressures.find((x) => x.floor === '5').pressure.value = 1100; }],
    // 正圧が支配する組み合わせで、負圧の大きさだけが違う（設計風圧は同じ）
    ['map negative only', 'project_pressure_map', 'G002', ['negativePressureMagnitude'],
      (p) => { p.windConditions.negativePressures.find((x) => x.zone === 'corner').magnitude.value = 1800; },
      (p) => { p.windConditions.positivePressures.find((x) => x.floor === '5').pressure.value = 2000; }],
    // 告示: 部位が違う（正圧・設計風圧・推奨候補は同じで、負圧が違う）
    ['notification zone', 'notification1458', 'G002', ['zone', 'negativePressure'], (p) => { p.glazingCases[1].zone = 'general'; }],
    // P だけが違う（推奨候補の label・件数・設計風圧は同じ）
    ['map extraFactor', 'project_pressure_map', 'G002', ['bestCandidate', 'marginRatio', 'marginPressure'],
      (p) => { p.glazingCases[1].extraFactor = 0.99; }],
    ['notification extraFactor', 'notification1458', 'G002', ['bestCandidate', 'marginRatio', 'marginPressure'],
      (p) => { p.glazingCases[1].extraFactor = 0.99; }],
    ['direct extraFactor', 'case_direct', 'G001', ['bestCandidate', 'marginRatio', 'marginPressure'],
      (p) => { p.glazingCases[0].extraFactor = 0.99; }],
    // floor / zone の値・有無
    ['map floor value', 'project_pressure_map', 'G002', ['floor'], (p) => {
      p.glazingCases[1].floor = 'PH';
      p.windConditions.positivePressures.find((x) => x.floor === '5').floor = 'PH';
    }],
    ['direct floor added', 'case_direct', 'G001', ['floor'], (p) => { p.glazingCases[0].floor = '9'; }],
    ['direct floor removed', 'case_direct', 'G002', ['floor'], (p) => { delete p.glazingCases[1].floor; }],
    ['direct zone added', 'case_direct', 'G002', ['zone'], (p) => { p.glazingCases[1].zone = 'general'; }],
    // 寸法・ガラス・設計風圧・ラベル
    ['pane width', 'case_direct', 'G002', null, (p) => { p.panes[1].widthMm.value = 761; }],
    ['glass type', 'project_pressure_map', 'G001', null, (p) => { p.glazingCases[0].glassType = 'tp_single'; }],
    ['direct design pressure', 'case_direct', 'G001', null, (p) => { p.glazingCases[0].designPressure.value = 1246; }],
    ['public label', 'case_direct', 'G001', [], (p) => { p.projectMetadata.publicLabel = 'Synthetic Pack Direct Twin'; }]
  ];
  const differing = (x, y) => [...new Set(Object.keys(x).concat(Object.keys(y)))]
    .filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
  for (const [name, mode, caseId, expectDiff, twinEdit, baseEdit] of variants) {
    const basePack = rawPack(mode);
    if (baseEdit) baseEdit(basePack);
    const twinPack = rawPack(mode);
    if (baseEdit) baseEdit(twinPack);
    twinEdit(twinPack);
    const { c, b } = fromPack(basePack);
    const other = ctxOf(twinPack);
    const result = Exec.executeCase(other, caseId);
    assert.equal(Exec.isExecutionResult(result), true, name + ': 前提: 差し替えの結果は本物の executor の発行物');
    if (expectDiff) assert.deepEqual(differing(expectedRow(c, caseId), expectedRow(other, caseId)), expectDiff, name + ': 前提: 違う field');
    if (name === 'public label') assert.notEqual(result.publicLabel, b.publicLabel);
    const sb = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: execFrom(other) });
    // 照合で拒否する（executor の gate ではなく review の照合が拒否した）
    assert.throws(() => sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: [caseId] }), { message: MSG.mismatch }, name);
    // 一致するケースと一緒に選んでも、review 全体を拒否する（一致した分だけの review を返さない）
    const rest = ids(b).filter((id) => id !== caseId);
    assert.throws(() => sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: rest.concat([caseId]) }), { message: MSG.mismatch }, name);
    // 陽性対照: 違いの無いケースだけを選べば通る
    if (name !== 'public label') {
      const same = rest.filter((id) => differing(expectedRow(c, id), expectedRow(other, id)).length === 0);
      assert.equal(sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: same }).selectedDetails.length, same.length, name);
    }
  }
  // 陽性対照: 内容が同じ別 instance の結果は照合では一致する（同一性は最初の gate が見る）
  const { c, b } = genuine('project_pressure_map');
  const sb = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: execFrom(ctx('project_pressure_map')) });
  assert.equal(sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: ids(b) }).selectedDetails.length, 4);
});

test('P2L-S3B3B2A1-R17: 風圧の符号・出どころ・P の 1 ulp の違いも照合で拒否する（executor の gate を越えて届いた場合）', () => {
  // executor の gate が働かない状況（偽の executor）を作り、review 自身の照合が拒否することを見る。
  // ここで返す object は本物の executor の gate では通らない（下で確かめる）。
  const forged = (edit) => execWith((c, id) => { const r = plain(Exec.executeCase(c, id)); edit(r); return r; },
    { assertExecutionResult: (r) => r });
  const cases = [
    ['notification1458', 'G002', 'negative sign', (r) => { r.pressure.negativePressure = -r.pressure.negativePressure; }],
    ['notification1458', 'G002', 'positive', (r) => { r.pressure.positivePressure += 1; }],
    ['notification1458', 'G002', 'evaluation height', (r) => { r.pressure.evaluationHeightM = 6.8; }],
    ['notification1458', 'G002', 'pressure source', (r) => { r.pressure.pressureSource = 'pack_pressure_map_lookup'; }],
    ['notification1458', 'G002', 'pressure zone', (r) => { r.pressure.zone = 'general'; }],
    ['project_pressure_map', 'G002', 'signed negative', (r) => { r.pressure.negativePressureMagnitude = -r.pressure.negativePressureMagnitude; }],
    ['project_pressure_map', 'G002', 'pressure source', (r) => { r.pressure.pressureSource = 'pack_case_direct'; }],
    ['project_pressure_map', 'G002', 'mode', (r) => { r.pressure.mode = 'case_direct'; }],
    ['case_direct', 'G001', 'fake positive/negative', (r) => { r.pressure.positivePressure = r.pressure.designPressure; r.pressure.negativePressure = -r.pressure.designPressure; }],
    ['case_direct', 'G002', 'fake floor in pressure', (r) => { r.pressure.floor = '2'; }],
    ['case_direct', 'G001', 'pressure source', (r) => { r.pressure.pressureSource = 'pack_notification_calculation'; }],
    ['case_direct', 'G001', 'P one ulp', (r) => { r.calculation.bestCandidate.P *= 1 + Number.EPSILON; }],
    ['project_pressure_map', 'G001', 'best label', (r) => { r.calculation.bestCandidate.label = 'FL8'; }],
    ['project_pressure_map', 'G001', 'best removed', (r) => { r.calculation.bestCandidate = null; }],
    ['project_pressure_map', 'G001', 'ok count', (r) => { r.calculation.okCount += 1; }],
    ['project_pressure_map', 'G001', 'ng count', (r) => { r.calculation.ngCount -= 1; }],
    ['notification1458', 'G002', 'out-of-scope count', (r) => { r.calculation.outOfScopeCount = 0; }],
    ['notification1458', 'G002', 'design pressure', (r) => { r.calculation.designPressure += 1e-9; r.pressure.designPressure = r.calculation.designPressure; }],
    ['notification1458', 'G002', 'case floor removed', (r) => { delete r.case.floor; }],
    ['notification1458', 'G002', 'pane height', (r) => { r.pane.heightMm += 1; }],
    ['notification1458', 'G002', 'pane id', (r) => { r.pane.paneId = 'P001'; }],
    ['notification1458', 'G002', 'case id', (r) => { r.case.caseId = 'G001'; }],
    ['case_direct', 'G001', 'units', (r) => { r.units.pressure = 'kN/m²'; }],
    ['case_direct', 'G001', 'label', (r) => { r.publicLabel = 'Synthetic Pack Other'; }]
  ];
  for (const [mode, caseId, name, edit] of cases) {
    const { c, b } = genuine(mode);
    const exec = forged(edit);
    assert.throws(() => Exec.assertExecutionResult(exec.executeCase(c, caseId)), /was not issued by ProjectPackExecution/,
      '前提: 本物の gate はこの object を通さない');
    const sb = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: exec });
    assert.throws(() => sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: [caseId] }), { message: MSG.mismatch },
      mode + ' ' + name);
  }
  // 陽性対照: 何も変えない偽の executor なら照合は一致する（照合が値を見ていることの確認）
  const { c, b } = genuine('notification1458');
  const sb = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: forged(() => {}) });
  assert.equal(sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: ids(b) }).selectedDetails.length, 3);
  // 再計算そのものが失敗したときは固定文（例外の中身・caseId を出さない）
  const throwing = loadReview({ ProjectPackBatch: Batch,
    ProjectPackExecution: execWith(() => { throw new Error('secret G002 Synthetic Pack N1458 {"x":1}'); }) });
  assert.throws(() => throwing.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: ['G002'] }), { message: MSG.reExecute });
});

/* ============================================================
   R18–R22: trust・発行物・依存・非干渉・privacy
============================================================ */

test('P2L-S3B3B2A1-R18: trust は pack_unreviewed で固定。出典の申告を primary にしても review は同じで、昇格の field は無い', () => {
  const strong = rawPack('notification1458');
  strong.evidence.sourceScopes.forEach((s) => { s.sourceClaim.claimedLevel = 'primary'; s.sourceClaim.claimedPrivateReferenceAvailable = true; });
  const weak = rawPack('notification1458');
  weak.evidence.sourceScopes.forEach((s) => { s.sourceClaim.claimedLevel = 'none'; });
  const s = fromPack(strong);
  const w = fromPack(weak);
  const opts = { detailCaseIds: ['G002', 'G001'], comparisonCaseIds: ['G001', 'G003'] };
  const rs = Review.buildPackReview(s.b, s.c, opts);
  const rw = Review.buildPackReview(w.b, w.c, opts);
  assert.deepEqual(plain(rs), plain(rw));
  assert.equal(rs.trust, 'pack_unreviewed');
  assert.equal(rs.sourceKind, 'project_pack_unreviewed');
  assert.equal(rs.interpretation, 'calculated_not_verified');
  const text = JSON.stringify(rs).replace('calculated_not_verified', '');
  assert.equal(/verified|approved|attested|primary|claimed|promotion|合成テスト用/i.test(text), false);
  assert.equal(Review.TRUST, 'pack_unreviewed');
  assert.equal(Review.SOURCE_KIND, 'project_pack_unreviewed');
  assert.equal(Review.INTERPRETATION, 'calculated_not_verified');
  // Evidence・Closure・Promotion・verifiedCases に触れない
  ['EvidenceLedger', 'EvidenceClosure', 'ProjectEvidence', 'Closure', 'Promotion', 'promote', 'sourceClaim.', 'claimedLevel ===',
    '.evidence', 'Registry', 'PresetRegistry'].forEach((token) => assert.equal(REVIEW_CODE.includes(token), false, token));
});

test('P2L-S3B3B2A1-R19: review は deep-frozen で、この module の発行物だけが通る（複製・偽造・入力の書き換えなし）', () => {
  const { c, b } = genuine('project_pressure_map');
  const before = JSON.stringify(b);
  const ctxBefore = JSON.stringify(c);
  const r = Review.buildPackReview(b, c, { detailCaseIds: ['G004', 'G001'], comparisonCaseIds: ['G002', 'G004'] });
  walk(r, (node, at) => { if (node && typeof node === 'object') assert.equal(Object.isFrozen(node), true, at); });
  assert.throws(() => { r.trust = 'verified'; }, TypeError);
  assert.throws(() => { r.rows[0].marginRatio = 99; }, TypeError);
  assert.throws(() => { r.summary.minMarginRatioCaseIds.push('G999'); }, TypeError);
  assert.throws(() => { r.selectedDetails[0].candidateSummary[0].status = 'ok'; }, TypeError);
  assert.equal(Object.isFrozen(Review), true);
  // 発行物だけ
  [plain(r), Object.assign({}, r), Object.create(r), Report.buildReport(b), b, null, undefined, 'review', 1].forEach((fake, i) => {
    assert.equal(Review.isPackReview(fake), false, 'fake ' + i);
    assert.throws(() => Review.assertPackReview(fake), { message: MSG.reviewNotIssued }, 'fake ' + i);
  });
  assert.equal(Review.assertPackReview(r), r);
  // 呼ぶたびに新しい review（前の review を使い回さない）
  const again = Review.buildPackReview(b, c, { detailCaseIds: ['G004', 'G001'], comparisonCaseIds: ['G002', 'G004'] });
  assert.notEqual(again, r);
  assert.deepEqual(plain(again), plain(r));
  // 入力（batch・ctx）を書き換えない。batch は引き続き同じ ctx の発行物として通る
  assert.equal(JSON.stringify(b), before);
  assert.equal(JSON.stringify(c), ctxBefore);
  assert.equal(Batch.assertBatchOrigin(b, c), b);
  // review の object は batch の object を共有しない（行・推奨候補は写し）
  r.rows.forEach((row, i) => {
    assert.notEqual(row, b.rows[i]);
    if (row.bestCandidate) assert.notEqual(row.bestCandidate, b.rows[i].bestCandidate);
  });
  assert.notEqual(r.comparison.a, byId(r.rows, 'G002'));
  // 失敗した呼び出しは review を返さない（例外だけ）
  let returned = 'none';
  try { returned = Review.buildPackReview(b, c, { detailCaseIds: ['G001', 'G999'] }); } catch (e) { /* expected */ }
  assert.equal(returned, 'none');
});

test('P2L-S3B3B2A1-R20: 別の module instance の review は通らず、依存は初期化時に掴んだものだけを使う（後から置いた global を使わない）', () => {
  const { c, b } = genuine('case_direct');
  // 別 instance の review は、この instance の発行物ではない（逆も同じ）
  const other = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: Exec });
  const foreign = other.ProjectPackReview.buildPackReview(b, c);
  assert.equal(Review.isPackReview(foreign), false);
  assert.throws(() => Review.assertPackReview(foreign), { message: MSG.reviewNotIssued });
  const local = Review.buildPackReview(b, c);
  assert.equal(other.ProjectPackReview.isPackReview(local), false);
  // 初期化の後に global を差し替えても、掴んだ依存を使い続ける
  const sb = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: Exec });
  let decoyCalls = 0;
  sb.ProjectPackBatch = { TRUST: 'pack_unreviewed', SOURCE_KIND: 'project_pack_unreviewed',
    assertBatchOrigin: () => { decoyCalls++; return true; }, assertBatchResult: () => { decoyCalls++; return true; } };
  sb.ProjectPackExecution = Object.assign({}, Exec, { executeCase: () => { decoyCalls++; return null; },
    assertExecutionResult: () => { decoyCalls++; return true; } });
  assert.throws(() => sb.ProjectPackReview.buildPackReview(plain(b), c), { message: MSG.notIssued });
  assert.throws(() => sb.ProjectPackReview.buildPackReview(b, ctx('case_direct')), { message: MSG.otherContext });
  assert.equal(sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: ['G001'] }).selectedDetails.length, 1);
  assert.equal(decoyCalls, 0);
  // 初期化時に依存が無ければ、読み込みは成功し、呼び出しが fail closed（後から現れた global も使わない）
  const empty = loadReview({});
  assert.equal(typeof empty.ProjectPackReview.buildPackReview, 'function');
  assert.throws(() => empty.ProjectPackReview.buildPackReview(b, c), /project-pack-batch\.js is required but not available/);
  empty.ProjectPackBatch = Batch;
  empty.ProjectPackExecution = Exec;
  assert.throws(() => empty.ProjectPackReview.buildPackReview(b, c), /is required but not available/);
  const noExec = loadReview({ ProjectPackBatch: Batch });
  assert.throws(() => noExec.ProjectPackReview.buildPackReview(b, c), /project-pack-execution\.js is required but not available/);
  // trust の違う依存は使わない
  const wrongBatch = loadReview({ ProjectPackBatch: Object.assign({}, Batch, { TRUST: 'verified' }), ProjectPackExecution: Exec });
  assert.throws(() => wrongBatch.ProjectPackReview.buildPackReview(b, c), /ProjectPackBatch trust is not pack_unreviewed/);
  const wrongExec = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: Object.assign({}, Exec, { SOURCE_KIND: 'manual' }) });
  assert.throws(() => wrongExec.ProjectPackReview.buildPackReview(b, c), /ProjectPackExecution trust is not pack_unreviewed/);
  // 依存の参照は初期化時の 1 か所だけ
  assert.equal((REVIEW_CODE.match(/captureDependency\('/g) || []).length, 2);
  assert.equal((REVIEW_CODE.match(/global\[/g) || []).length, 2, 'captureDependency の 1 行だけ');
  assert.equal(/global\.ProjectPack(Batch|Execution)/.test(REVIEW_CODE), false);
});

test('P2L-S3B3B2A1-R21: Workspace・Review Package・計算 module・DOM に触れない（index.html にもまだ載せない）', () => {
  const touched = [];
  const spy = (name) => new Proxy(function () {}, {
    get(_t, k) { touched.push(name + '.' + String(k)); return spy(name + '.' + String(k)); },
    apply() { touched.push(name + '()'); return undefined; },
    has(_t, k) { touched.push(name + ' has ' + String(k)); return false; },
    set(_t, k) { touched.push(name + ' set ' + String(k)); return true; }
  });
  const sb = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: Exec,
    WorkspaceCore: spy('WorkspaceCore'), ReviewPackage: spy('ReviewPackage'), WindPressure: spy('WindPressure'),
    GlassCalc: spy('GlassCalc'), ProjectInput: spy('ProjectInput'), ProjectContext: spy('ProjectContext'),
    ProjectPackReport: spy('ProjectPackReport'), document: spy('document'), window: spy('window'),
    localStorage: spy('localStorage'), sessionStorage: spy('sessionStorage'), fetch: spy('fetch') });
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: ids(b), comparisonCaseIds: ids(b).slice(0, 2) });
  }
  assert.deepEqual(touched, []);
  ['WorkspaceCore', 'ReviewPackage', 'WindPressure', 'GlassCalc', 'calculateWindPressure', 'generateCandidates',
    'splitCandidates', 'sortCandidates', 'paneAreaM2', 'ProjectInput', 'ProjectContext', 'requireCapability',
    'ProjectPackReport', 'document', 'window', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest',
    'activeProjectContext', 'setTimeout', 'console.']
    .forEach((token) => assert.equal(REVIEW_CODE.includes(token), false, 'review module が ' + token + ' を使っている'));
  // 計算は executor の executeCase だけ、gate は assertBatchOrigin（最初に 1 回）
  assert.equal((REVIEW_CODE.match(/E\.executeCase\(/g) || []).length, 1);
  assert.equal((REVIEW_CODE.match(/B\.assertBatchOrigin\(/g) || []).length, 1);
  assert.equal(/\.assertBatchResult\(/.test(REVIEW_CODE), false);
  const body = REVIEW_CODE.slice(REVIEW_CODE.indexOf('function buildPackReview('), REVIEW_CODE.indexOf('function walkForbidden('));
  const at = (s) => { const i = body.indexOf(s); assert.notEqual(i, -1, s); return i; };
  const order = ['B.assertBatchOrigin(', 'readOptions(', 'projectRow(', 'summarize(', 'groupByRecommended(', 'compareRows(',
    'reExecute(', 'assertOverlap(', 'projectDetail(', 'assertPackReviewShape(', 'deepFreeze(review)', 'issued.add(review)'];
  order.reduce((prev, s) => { const i = at(s); assert.equal(i > prev, true, s + ' の順'); return i; }, -1);
  // A1 は pure contract だけ。index.html・Workspace・Review Package の契約は変わらない
  assert.equal(read('index.html').includes('project-pack-review'), false);
  assert.equal(WorkspaceCore.MAX_CASES, 1000);
  assert.deepEqual([...ProjectInput.SOURCE_KINDS], ['registered_preset', 'manual', 'notification_calculation', 'imported_unverified']);
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
  assert.equal(Pack.SCHEMA_VERSION, 1);
  assert.equal(Batch.SCHEMA_VERSION, 1);
  assert.equal(Report.SCHEMA_VERSION, 1);
});

test('P2L-S3B3B2A1-R22: privacy（禁止 key・出典の文言・context の参照なし。例外の文面は固定）', () => {
  const forbidden = /^(verified|approved|reviewed|attested|attestation|canonicalEvidence|verifiedCases|promotion|promotionCandidate|closure|packClosure|sourceClaim|claimedLevel|evidence|evidenceClaims|records|sourceScopes|activeProjectContext|candidates|detail|notificationTrace|trace|provenance|formulaSource|windConditions|glazingCases|panes|pressureModel|context|projectContext|packType|packageType|workspaceType|governing|dominantCase)$/i;
  for (const mode of MODES) {
    const { c, b } = genuine(mode);
    const pack = rawPack(mode);
    const r = Review.buildPackReview(b, c, { detailCaseIds: ids(b), comparisonCaseIds: ids(b).slice(0, 2) });
    walk(r, (node, at) => {
      if (node && typeof node === 'object') {
        assert.notEqual(node, c, at + ' が context を参照している');
        assert.notEqual(node, b, at + ' が batch を参照している');
        if (!Array.isArray(node)) Object.keys(node).forEach((k) => assert.equal(forbidden.test(k), false, at + '.' + k));
      }
      if (typeof node === 'string') {
        assert.equal(/https?:|:\/\/|[\\]|\/home|\/Users|C:|sharepoint|notion|\.pdf|@/i.test(node), false, at + ' ' + node);
      }
    });
    const text = JSON.stringify(r);
    pack.evidence.sourceScopes.forEach((s) => assert.equal(text.includes(s.sourceClaim.publicDescription), false));
    assert.equal(text.includes('sourceScopeId'), false);
    // 候補の detail（計算の途中値）を写さない
    assert.equal(/k1_outer|k2_inner|rawRatio|adopted_side|wouldPass|t_total|t_max/.test(text), false);
  }
  // 例外の文面に publicLabel・caseId・入力値・JSON を含めない
  const { c, b } = genuine('notification1458');
  const messages = [];
  const capture = (fn) => { try { fn(); } catch (e) { messages.push(e.message); } };
  capture(() => Review.buildPackReview(plain(b), c));
  capture(() => Review.buildPackReview(b, ctx('notification1458')));
  capture(() => Review.buildPackReview(b, c, { detailCaseIds: ['G999 Synthetic {"x":1}'] }));
  capture(() => Review.buildPackReview(b, c, { comparisonCaseIds: ['G001', 'G001'] }));
  capture(() => Review.buildPackReview(b, c, { secretKey: 'Synthetic' }));
  capture(() => Review.assertPackReview(plain(Review.buildPackReview(b, c))));
  const sb = loadReview({ ProjectPackBatch: Batch, ProjectPackExecution: execFrom(ctxOf((() => {
    const p = rawPack('notification1458'); p.glazingCases[1].extraFactor = 0.95; return p; })())) });
  capture(() => sb.ProjectPackReview.buildPackReview(b, c, { detailCaseIds: ['G002'] }));
  assert.equal(messages.length, 7);
  messages.forEach((m) => assert.equal(/G\d|Synthetic|N1458|\{|"|secretKey|0\.95|1685/.test(m), false, m));
});
