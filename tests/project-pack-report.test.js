'use strict';

/**
 * Phase 2L-B2 / S3-B3B1: Project Pack Derived Report（project-config/project-pack-report.js）。
 *
 *   ProjectPackBatch の発行物（batch result） → buildReport（field を 1 つずつ写した report・deep-frozen）
 *     → serializeJson / toCsv（ブラウザ内でコピーするためのテキスト。計算の入力ではない）
 *
 * 期待値の取り方（oracle）:
 *   - report・JSON・CSV の出力から期待値を作らない
 *   - G002 の値は fixture の literal と、風圧・ガラスの計算を直接呼んで一度だけ求めた値を literal で
 *     固定したもの（S3-B2 / S3-B3A の test と同じ値）
 *   - 各行は、S3-B2 の executor（ProjectPackExecution.executeCase）が同じ caseId を単独で計算した結果から
 *     手で取り出した値と一致する
 *   - CSV はこの test の中の小さな RFC 4180 parser で読み戻して調べる
 *   - 多ケースの Pack は tests/support/synthetic-pack.js がその場で作る合成のもの（実案件の値ではない）
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
const Exec = require('../project-config/project-pack-execution.js');
const Batch = require('../project-config/project-pack-batch.js');
const Report = require('../project-config/project-pack-report.js');
const WorkspaceCore = require('../workspace.js');
const ReviewPackage = require('../review-package.js');
const { stripComments } = require('./support/inline-script.js');
const { syntheticPack } = require('./support/synthetic-pack.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const REPORT_SRC_REL = 'project-config/project-pack-report.js';
const REPORT_SRC = read(REPORT_SRC_REL);
const REPORT_CODE = stripComments(REPORT_SRC);

const FIXTURES = {
  notification1458: 'tests/fixtures/project-pack/synthetic-notification1458.json',
  project_pressure_map: 'tests/fixtures/project-pack/synthetic-project-pressure-map.json',
  case_direct: 'tests/fixtures/project-pack/synthetic-case-direct.json'
};
const rawPack = (mode) => JSON.parse(read(FIXTURES[mode]));
const ctxOf = (pack) => ProjectContext.fromProjectPack(Pack.validateProjectPack(pack));
const ctx = (mode) => ctxOf(rawPack(mode));
const batchOf = (mode) => Batch.executeAll(ctx(mode));
const reportOf = (mode) => Report.buildReport(batchOf(mode));
const plain = (r) => JSON.parse(JSON.stringify(r));

const CSV_HEADER = ['caseId', 'paneId', 'floor', 'zone', 'sourceKind', 'trust', 'interpretation', 'pressureMode',
  'pressureSource', 'widthMm', 'heightMm', 'glassType', 'designPressure', 'evaluationHeightM', 'positivePressure',
  'negativePressure', 'negativePressureMagnitude', 'bestCandidate', 'allowablePressure', 'okCount', 'ngCount',
  'outOfScopeCount', 'publicLabel'];

/** fixture の literal と、風圧・ガラスの計算を直接呼んで固定した値（report からは作らない）。 */
const PINNED = Object.freeze({
  notificationG002: { caseId: 'G002', paneId: 'P002', floor: '3', zone: 'corner', glassType: 'lowe_fl', widthMm: 760,
    heightMm: 1880, designPressure: 1685.04324816824, pressureSource: 'pack_notification_calculation',
    evaluationHeightM: 10.2, positivePressure: 1685.04324816824, negativePressure: -1409.5342125273235,
    bestCandidate: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 }, okCount: 43, ngCount: 0, outOfScopeCount: 6 },
  mapG002: { caseId: 'G002', paneId: 'P002', floor: '5', zone: 'corner', glassType: 'tp_single', widthMm: 760,
    heightMm: 1880, designPressure: 1835, pressureSource: 'pack_pressure_map_lookup', positivePressure: 1135,
    negativePressureMagnitude: 1835, bestCandidate: { label: 'TP5', P: 8267.427211646136 }, okCount: 6, ngCount: 0,
    outOfScopeCount: 0 },
  directG002: { caseId: 'G002', paneId: 'P002', floor: '2', glassType: 'lowe_fl', widthMm: 760, heightMm: 1880,
    designPressure: 1365, pressureSource: 'pack_case_direct', bestCandidate: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 },
    okCount: 43, ngCount: 0, outOfScopeCount: 6 }
});

/** S3-B2 の executor が単独で計算した 1 ケースから、report の行に出るはずの値を手で取り出す。 */
function expectedRow(c, caseId) {
  const r = Exec.executeCase(c, caseId);
  const p = r.pressure;
  const row = { caseId: r.case.caseId, paneId: r.pane.paneId };
  if ('floor' in r.case) row.floor = r.case.floor;
  if ('zone' in r.case) row.zone = r.case.zone;
  Object.assign(row, { glassType: r.case.glassType, widthMm: r.pane.widthMm, heightMm: r.pane.heightMm,
    designPressure: r.calculation.designPressure, pressureSource: p.pressureSource });
  if (p.mode === 'notification1458') Object.assign(row, { evaluationHeightM: p.evaluationHeightM,
    positivePressure: p.positivePressure, negativePressure: p.negativePressure });
  if (p.mode === 'project_pressure_map') Object.assign(row, { positivePressure: p.positivePressure,
    negativePressureMagnitude: p.negativePressureMagnitude });
  const best = r.calculation.bestCandidate;
  Object.assign(row, { bestCandidate: best ? { label: best.label, P: best.P } : null, okCount: r.calculation.okCount,
    ngCount: r.calculation.ngCount, outOfScopeCount: r.calculation.outOfScopeCount });
  return row;
}

/** RFC 4180 の CSV を読む（この test 専用の小さな parser）。 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let quoted = false;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 2; continue; }
    if (ch === '\n' || ch === '\r') throw new Error('bare line break outside quotes at ' + i);
    cell += ch; i++;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}
const csvRecords = (csv) => {
  const rows = parseCsv(csv);
  const header = rows[0];
  return { header, records: rows.slice(1).map((cells) => Object.fromEntries(header.map((h, k) => [h, cells[k]]))) };
};

function walk(node, visit, at) {
  at = at || '$';
  visit(node, at);
  if (node && typeof node === 'object') Object.keys(node).forEach((k) => walk(node[k], visit, at + '.' + k));
}

/* ============================================================
   P01–P05: report の契約と 3 mode
============================================================ */

test('P2L-S3B3B1-P01: report は固定の key 順・固定の trust・deep-frozen の発行物', () => {
  const r = reportOf('notification1458');
  assert.deepEqual(Object.keys(r), ['reportType', 'schemaVersion', 'sourceKind', 'trust', 'interpretation', 'publicLabel',
    'pressureMode', 'units', 'totalCases', 'executedCases', 'rows']);
  assert.equal(r.reportType, 'glass_wind_pack_derived_report');
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.sourceKind, 'project_pack_unreviewed');
  assert.equal(r.trust, 'pack_unreviewed');
  assert.equal(r.interpretation, 'calculated_not_verified');
  assert.equal(r.publicLabel, 'Synthetic Pack N1458');
  assert.equal(r.pressureMode, 'notification1458');
  assert.deepEqual(plain(r.units), { length: 'mm', height: 'm', pressure: 'N/m²' });
  assert.deepEqual([r.totalCases, r.executedCases, r.rows.length], [3, 3, 3]);
  walk(r, (node, at) => { if (node && typeof node === 'object') assert.equal(Object.isFrozen(node), true, at); });
  assert.equal(Report.isReport(r), true);
  assert.equal(Report.assertReport(r), r);
  [Report.REPORT_TYPE, Report.SCHEMA_VERSION, Report.SOURCE_KIND, Report.TRUST, Report.INTERPRETATION]
    .forEach((v, i) => assert.equal(v, ['glass_wind_pack_derived_report', 1, 'project_pack_unreviewed', 'pack_unreviewed',
      'calculated_not_verified'][i]));
  // 呼ぶたびに新しい report（使い回さない）・内容は決定的
  const again = reportOf('notification1458');
  assert.notEqual(again, r);
  assert.equal(Report.serializeJson(again), Report.serializeJson(r));
  assert.equal(Report.toCsv(again), Report.toCsv(r));
});

test('P2L-S3B3B1-P02: notification1458 の行は評価高さ・正圧・符号付きの負圧・設計風圧を持つ（G002）', () => {
  const r = reportOf('notification1458');
  assert.deepEqual(r.rows.map((x) => x.caseId), ['G001', 'G002', 'G003']);
  const g = r.rows[1];
  assert.deepEqual(Object.keys(g), ['caseId', 'paneId', 'floor', 'zone', 'glassType', 'widthMm', 'heightMm',
    'designPressure', 'pressureSource', 'evaluationHeightM', 'positivePressure', 'negativePressure', 'bestCandidate',
    'okCount', 'ngCount', 'outOfScopeCount']);
  assert.deepEqual(plain(g), PINNED.notificationG002);
  assert.equal(g.negativePressure < 0, true, '負圧の符号を落とした');
  assert.equal('negativePressureMagnitude' in g, false);
});

test('P2L-S3B3B1-P03: project_pressure_map の行は正圧と負圧の絶対値を持つ（符号付きにしない）', () => {
  const r = reportOf('project_pressure_map');
  assert.deepEqual(r.rows.map((x) => x.caseId), ['G001', 'G002', 'G003', 'G004']);
  assert.deepEqual(plain(r.rows[1]), PINNED.mapG002);
  r.rows.forEach((row) => {
    assert.equal(row.negativePressureMagnitude > 0, true);
    ['negativePressure', 'evaluationHeightM'].forEach((k) => assert.equal(k in row, false, k));
  });
  assert.deepEqual([r.rows[0].okCount, r.rows[0].ngCount, r.rows[0].outOfScopeCount], [6, 1, 0]);
  assert.deepEqual([r.rows[2].paneId, r.rows[2].widthMm, r.rows[2].heightMm], ['P003', 640, 1720]);
});

test('P2L-S3B3B1-P04: case_direct の行は設計風圧と出どころだけ（正圧・負圧を作らない。無い floor / zone を作らない）', () => {
  const r = reportOf('case_direct');
  assert.deepEqual(plain(r.rows[1]), PINNED.directG002);
  assert.deepEqual(Object.keys(r.rows[0]), ['caseId', 'paneId', 'glassType', 'widthMm', 'heightMm', 'designPressure',
    'pressureSource', 'bestCandidate', 'okCount', 'ngCount', 'outOfScopeCount']);
  assert.equal(/positive|negative|Magnitude|evaluationHeight/i.test(Report.serializeJson(r)), false);
});

test('P2L-S3B3B1-P05: どの行も executor が同じ caseId を単独で計算した結果と一致し、並び・件数は Pack どおり', () => {
  Object.keys(FIXTURES).forEach((mode) => {
    const c = ctx(mode);
    const r = Report.buildReport(Batch.executeAll(c));
    const declared = ProjectContext.requireCapability(c, 'declaredGlazingCases').glazingCases.map((x) => x.caseId);
    assert.deepEqual(r.rows.map((x) => x.caseId), declared);
    r.rows.forEach((row) => assert.deepEqual(plain(row), expectedRow(c, row.caseId), mode + ' ' + row.caseId));
  });
});

/* ============================================================
   P06–P08: 発行物の gate・trust・JSON
============================================================ */

test('P2L-S3B3B1-P06: batch の発行物だけを通す（形・文字列が同じ object・複製・Pack・context・単一ケースの結果は拒否）', () => {
  const batch = batchOf('project_pressure_map');
  const c = ctx('project_pressure_map');
  const shaped = plain(batch);
  const partial = Object.assign(plain(batch), { rows: plain(batch).rows.slice(0, 2), totalCases: 2, executedCases: 2 });
  const verified = Object.assign(plain(batch), { trust: 'verified' });
  [shaped, Object.assign({}, batch), partial, verified, rawPack('project_pressure_map'),
    Pack.validateProjectPack(rawPack('project_pressure_map')), c, Exec.executeCase(c, 'G002'),
    ProjectContext.fromLegacyPreset(Registry.getRuntimeDefaultBuiltInPresetId()), null, undefined, {}, 'x', 42]
    .forEach((bad, i) => assert.throws(() => Report.buildReport(bad), /was not issued by ProjectPackBatch/, 'case ' + i));
  // 発行された report 以外は JSON / CSV にできない
  const report = Report.buildReport(batch);
  [plain(report), Object.assign({}, report), batch, null].forEach((bad) => {
    assert.equal(Report.isReport(bad), false);
    assert.throws(() => Report.serializeJson(bad), /was not issued by ProjectPackReport/);
    assert.throws(() => Report.toCsv(bad), /was not issued by ProjectPackReport/);
  });
});

test('P2L-S3B3B1-P07: trust は固定。申告を primary にしても出力は同じで、昇格・申告・provenance の field は無い', () => {
  const strong = rawPack('notification1458');
  strong.evidence.sourceScopes.forEach((s) => { s.sourceClaim.claimedLevel = 'primary'; s.sourceClaim.claimedPrivateReferenceAvailable = true; });
  const a = Report.buildReport(Batch.executeAll(ctxOf(strong)));
  const b = reportOf('notification1458');
  assert.equal(Report.serializeJson(a), Report.serializeJson(b));
  assert.equal(Report.toCsv(a), Report.toCsv(b));
  const forbidden = /^(verified|approved|reviewed|attested|attestation|canonicalEvidence|promotionCandidate|verifiedCases|provenance|formulaVerificationStatus|formulaSource|evidence|sourceClaim|sourceScopes|records|claimedLevel|candidates|notificationTrace|trace|batchType|executionType)$/;
  walk(a, (node, at) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) Object.keys(node).forEach((k) => assert.equal(forbidden.test(k), false, at + '.' + k));
  });
  const texts = Report.serializeJson(a) + Report.toCsv(a);
  assert.equal(/verified_primary_source|approved|attested|primary|claimed|合成テスト用|formula|provenance|"status"|t_max/i.test(texts), false);
  // CSV の各行が trust を持つ
  csvRecords(Report.toCsv(a)).records.forEach((rec) => assert.deepEqual(
    [rec.sourceKind, rec.trust, rec.interpretation], ['project_pack_unreviewed', 'pack_unreviewed', 'calculated_not_verified']));
});

test('P2L-S3B3B1-P08: JSON は report だけを固定の key 順・full precision で書く（batch result をそのまま書かない）', () => {
  const r = reportOf('notification1458');
  const json = Report.serializeJson(r);
  assert.equal(json.endsWith('}\n'), true);
  const back = JSON.parse(json);
  assert.deepEqual(back, plain(r));
  assert.deepEqual(Object.keys(back), Object.keys(r));
  back.rows.forEach((row, i) => assert.deepEqual(Object.keys(row), Object.keys(r.rows[i])));
  assert.match(json, /"positivePressure": 1685\.04324816824,/);
  assert.match(json, /"negativePressure": -1409\.5342125273235,/);
  assert.match(json, /"P": 3543\.183090705487/);
  // batch result の field（batchType・入れ子の pressure）は report に無い
  assert.equal(/batchType|glass_wind_project_pack_batch_execution|"pressure": \{/.test(json), false);
  // static: JSON にするのは発行された report だけ（JSON.stringify は 1 か所で、引数は report）
  assert.deepEqual(REPORT_CODE.match(/JSON\.stringify\([^)]*\)/g), ['JSON.stringify(report, null, 2)']);
});

/* ============================================================
   P09–P11: CSV・数式の中和・出力の上限
============================================================ */

test('P2L-S3B3B1-P09: CSV は固定の列順・各行に trust・数値は number のまま・mode に無い列は空欄', () => {
  const header = CSV_HEADER.join(',');
  assert.deepEqual([...Report.CSV_COLUMNS], CSV_HEADER);
  const n = Report.toCsv(reportOf('notification1458'));
  assert.equal(n.startsWith(header + '\r\n'), true);
  assert.equal(n.endsWith('\r\n'), true);
  assert.equal(/[^\r]\n/.test(n), false, 'CRLF でない改行');
  const N = csvRecords(n);
  assert.deepEqual(N.header, CSV_HEADER);
  assert.equal(N.records.length, 3);
  const g = N.records[1];
  assert.deepEqual(g, { caseId: 'G002', paneId: 'P002', floor: '3', zone: 'corner', sourceKind: 'project_pack_unreviewed',
    trust: 'pack_unreviewed', interpretation: 'calculated_not_verified', pressureMode: 'notification1458',
    pressureSource: 'pack_notification_calculation', widthMm: '760', heightMm: '1880', glassType: 'lowe_fl',
    designPressure: '1685.04324816824', evaluationHeightM: '10.2', positivePressure: '1685.04324816824',
    negativePressure: '-1409.5342125273235', negativePressureMagnitude: '', bestCandidate: 'Low-E5 + A + FL5',
    allowablePressure: '3543.183090705487', okCount: '43', ngCount: '0', outOfScopeCount: '6', publicLabel: 'Synthetic Pack N1458' });
  assert.equal(n.includes(",-1409.5342125273235,"), true, '負数を文字列として中和した');

  const M = csvRecords(Report.toCsv(reportOf('project_pressure_map')));
  const m = M.records[1];
  assert.deepEqual([m.positivePressure, m.negativePressureMagnitude, m.negativePressure, m.evaluationHeightM, m.designPressure],
    ['1135', '1835', '', '', '1835']);

  const D = csvRecords(Report.toCsv(reportOf('case_direct')));
  D.records.forEach((d) => assert.deepEqual([d.positivePressure, d.negativePressure, d.negativePressureMagnitude, d.evaluationHeightM],
    ['', '', '', ''], '架空の 0 や符号を入れた'));
  assert.deepEqual([D.records[0].floor, D.records[0].zone, D.records[1].floor, D.records[1].zone], ['', '', '2', '']);
  assert.equal(D.records[1].designPressure, '1365');
});

test('P2L-S3B3B1-P10: 数式の中和——先頭の空白・制御・不可視文字の後の trigger も中和し、普通の値と数値は変えない', () => {
  const guarded = ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', '\n=1', '\t1', ' =1', '  +1', '\u00A0=1', '\u200B=1',
    '\u200B\u200B-1', '\u3000=1', '\uFEFF@x', '\u2060=1', '\u202E=1', '\uFF1D1', '\uFF0B1', '\uFF0D1', '\uFF20x', '\u22121',
    ' \u200B\uFF1D1', '|cmd'];
  guarded.forEach((s) => assert.equal(Report.neutralizeFormula(s), "'" + s, JSON.stringify(s)));
  ['abc', 'a=b', 'G001', 'P0001', 'Low-E5 + A + FL5', 'Synthetic Pack N1458', '1-2', '', 'R', 'PH', 'B1', '合成=1']
    .forEach((s) => assert.equal(Report.neutralizeFormula(s), s, JSON.stringify(s)));

  // 統合: 公開表示名（Pack の入力）に数式・区切り文字・引用符を入れても CSV では文字列のまま
  const labels = ['=HYPERLINK("x","y")', '+1,2', '-3"4', '@cmd', '\u200B=1+1', ' =1', '\t=1', '\uFF1D1+1'];
  labels.forEach((label) => {
    const pack = rawPack('case_direct');
    pack.projectMetadata.publicLabel = label;
    const report = Report.buildReport(Batch.executeAll(ctxOf(pack)));
    const csv = Report.toCsv(report);
    const { records } = csvRecords(csv);
    records.forEach((rec) => assert.equal(rec.publicLabel, "'" + label, JSON.stringify(label)));
    // JSON は表計算ソフト向けではないので値をそのまま持つ
    assert.equal(JSON.parse(Report.serializeJson(report)).publicLabel, label);
    // どのセルも（中和後）数式の trigger で始まらない
    records.forEach((rec) => Object.entries(rec).forEach(([k, v]) => {
      if (['designPressure', 'positivePressure', 'negativePressure', 'negativePressureMagnitude', 'widthMm', 'heightMm',
        'allowablePressure', 'okCount', 'ngCount', 'outOfScopeCount', 'evaluationHeightM'].includes(k)) return;
      assert.equal(/^[\s\u200B\uFEFF\u3000]*[=+\-@\uFF1D]/.test(v), false, k + '=' + JSON.stringify(v));
    }));
  });
});

/** 上限だけを小さくした module（同じ source の定数だけを差し替える）を vm で初期化する。 */
function reportWithCap(bytes) {
  const src = REPORT_SRC.replace('var MAX_OUTPUT_BYTES = 8 * 1024 * 1024;', 'var MAX_OUTPUT_BYTES = ' + bytes + ';');
  assert.notEqual(src, REPORT_SRC, '前提: 上限の行がある');
  const sb = { ProjectPackBatch: Batch, TextEncoder };
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: REPORT_SRC_REL + ' (cap ' + bytes + ')' });
  return sb.ProjectPackReport;
}

test('P2L-S3B3B1-P11: 出力の上限は各 8 MiB。超えたら切り詰めずに失敗し、2000 ケースは上限の内側', () => {
  assert.equal(Report.MAX_OUTPUT_BYTES, 8 * 1024 * 1024);
  const batch = batchOf('project_pressure_map');
  const full = Report.buildReport(batch);
  const jsonBytes = Buffer.byteLength(Report.serializeJson(full));
  const csvBytes = Buffer.byteLength(Report.toCsv(full));
  // 上限をちょうどの大きさにすれば通り、1 byte 小さくすれば失敗する（切り詰めた出力は返さない）
  const exactJson = reportWithCap(jsonBytes);
  assert.equal(exactJson.serializeJson(exactJson.buildReport(batch)), Report.serializeJson(full));
  const tightJson = reportWithCap(jsonBytes - 1);
  assert.throws(() => tightJson.serializeJson(tightJson.buildReport(batch)), /json: output exceeds \d+ bytes \(not truncated\)/);
  const exactCsv = reportWithCap(csvBytes);
  assert.equal(exactCsv.toCsv(exactCsv.buildReport(batch)), Report.toCsv(full));
  const tightCsv = reportWithCap(csvBytes - 1);
  assert.throws(() => tightCsv.toCsv(tightCsv.buildReport(batch)), /csv: output exceeds \d+ bytes \(not truncated\)/);
  assert.match(REPORT_CODE, /if \(byteLength\(text\) > MAX_OUTPUT_BYTES\) \{\n\s+fail\(what, 'output exceeds ' \+ MAX_OUTPUT_BYTES \+ ' bytes \(not truncated\)'\);/);
  assert.equal(/\.slice\(0,|\.substring\(|\.substr\(/.test(REPORT_CODE), false, '出力を切り詰める処理がある');
});

/* ============================================================
   P12: 2000 ケース
============================================================ */

test('P2L-S3B3B1-P12: 合成 2000 ケース（3 mode）——全行・Pack の順・重複/欠落なし・trust・JSON/CSV の行数一致・決定性', () => {
  const sizes = {};
  ['notification1458', 'project_pressure_map', 'case_direct'].forEach((mode) => {
    const c = ctxOf(syntheticPack(2000, mode));
    const batch = Batch.executeAll(c);
    const report = Report.buildReport(batch);
    const json = Report.serializeJson(report);
    const csv = Report.toCsv(report);
    sizes[mode] = [Buffer.byteLength(json), Buffer.byteLength(csv)];
    assert.equal(sizes[mode][0] <= Report.MAX_OUTPUT_BYTES && sizes[mode][1] <= Report.MAX_OUTPUT_BYTES, true);
    const ids = Array.from({ length: 2000 }, (_, i) => 'G' + String(i + 1).padStart(4, '0'));
    const back = JSON.parse(json);
    assert.equal(back.rows.length, 2000);
    assert.deepEqual(back.rows.map((r) => r.caseId), ids);
    const { header, records } = csvRecords(csv);
    assert.deepEqual(header, CSV_HEADER);
    assert.equal(records.length, 2000);
    assert.deepEqual(records.map((r) => r.caseId), ids);
    assert.equal(new Set(records.map((r) => r.caseId)).size, 2000);
    records.forEach((rec) => {
      assert.deepEqual([rec.sourceKind, rec.trust, rec.interpretation, rec.pressureMode],
        ['project_pack_unreviewed', 'pack_unreviewed', 'calculated_not_verified', mode]);
    });
    // mode ごとの field の組
    const shape = { notification1458: ['evaluationHeightM', 'positivePressure', 'negativePressure'],
      project_pressure_map: ['positivePressure', 'negativePressureMagnitude'], case_direct: [] }[mode];
    const others = ['evaluationHeightM', 'positivePressure', 'negativePressure', 'negativePressureMagnitude'].filter((k) => !shape.includes(k));
    records.forEach((rec) => {
      shape.forEach((k) => assert.notEqual(rec[k], '', mode + ' ' + rec.caseId + ' ' + k));
      others.forEach((k) => assert.equal(rec[k], '', mode + ' ' + rec.caseId + ' ' + k));
    });
    // 先頭・途中・末尾は executor の単独計算と一致（full precision の文字列としても）
    [0, 999, 1999].forEach((i) => {
      const want = expectedRow(c, ids[i]);
      assert.deepEqual(back.rows[i], want, mode + ' ' + ids[i]);
      assert.equal(records[i].designPressure, String(want.designPressure));
    });
    // 決定性
    assert.equal(Report.serializeJson(Report.buildReport(batch)), json);
    assert.equal(Report.toCsv(Report.buildReport(batch)), csv);
  });
  // 参考: 出力の大きさ（上限 8 MiB に対して十分小さい）
  Object.values(sizes).forEach(([j, c]) => assert.equal(j < 2 * 1024 * 1024 && c < 1024 * 1024, true, JSON.stringify(sizes)));
});

/* ============================================================
   P13–P16: 依存の固定・一方向・静的な境界・不変条件
============================================================ */

test('P2L-S3B3B1-P13: ProjectPackBatch は初期化時に 1 度だけ掴む。後から差し替えた・現れた global を使わない', () => {
  assert.equal((REPORT_CODE.match(/captureDependency\(/g) || []).length, 2);
  assert.match(REPORT_CODE, /var CAPTURED_BATCH = captureDependency\('ProjectPackBatch', '\.\/project-pack-batch\.js'\);/);
  const outside = REPORT_CODE.replace(/function captureDependency\([\s\S]*?\n  \}\n/, '');
  assert.equal(/global\s*\[|global\.ProjectPackBatch|require\(/.test(outside), false);

  const batch = batchOf('case_direct');
  const sb = { ProjectPackBatch: Batch, TextEncoder };
  vm.createContext(sb);
  vm.runInContext(REPORT_SRC, sb, { filename: REPORT_SRC_REL });
  let decoyHits = 0;
  const decoy = new Proxy({}, { get: (t, k) => {
    decoyHits++;
    if (k === 'TRUST') return 'pack_unreviewed';
    if (k === 'SOURCE_KIND') return 'project_pack_unreviewed';
    return () => true;   // 何でも通す偽の gate
  } });
  sb.ProjectPackBatch = decoy;
  assert.equal(vm.runInContext('ProjectPackBatch', sb), decoy, '前提: 差し替えが vm の中から見える');
  const R = sb.ProjectPackReport;
  assert.equal(R.serializeJson(R.buildReport(batch)), Report.serializeJson(Report.buildReport(batch)));
  assert.throws(() => R.buildReport(plain(batch)), /was not issued by ProjectPackBatch/, '偽の gate で通った');
  assert.equal(decoyHits, 0, '差し替えた ProjectPackBatch が参照された');

  // 初期化時に無ければ、後から現れた本物も使わない（読み込み自体は失敗しない）
  const empty = {};
  vm.createContext(empty);
  assert.doesNotThrow(() => vm.runInContext(REPORT_SRC, empty, { filename: REPORT_SRC_REL }));
  empty.ProjectPackBatch = Batch;
  assert.throws(() => empty.ProjectPackReport.buildReport(batch), /project-pack-batch\.js is required but not available/);

  // trust の違う batch module は使わない
  const wrong = { ProjectPackBatch: Object.assign({}, Batch, { TRUST: 'verified' }) };
  vm.createContext(wrong);
  vm.runInContext(REPORT_SRC, wrong, { filename: REPORT_SRC_REL });
  assert.throws(() => wrong.ProjectPackReport.buildReport(batch), /trust is not pack_unreviewed/);
});

test('P2L-S3B3B1-P14: report は計算の入力にならない（3 ケースの JSON / CSV を既存の取り込み経路は受け付けない）', () => {
  const report = reportOf('project_pressure_map');
  const json = Report.serializeJson(report);
  const csv = Report.toCsv(report);
  assert.equal(json.length < 4096 && csv.length < 4096, true, '前提: 小さな report（上限で拒否される大きさではない）');
  // 入力 package
  assert.throws(() => ProjectInput.deserialize(json), /unknown field/);
  assert.throws(() => ProjectInput.deserialize(csv), /not valid JSON/);
  assert.throws(() => ProjectInput.deserialize(JSON.stringify(plain(report).rows[0])), Error);
  // Project Pack
  assert.throws(() => Pack.validateProjectPack(JSON.parse(json)), /unexpected field/);
  // Workspace（JSON の取り込みと TSV の貼り付け）
  assert.throws(() => WorkspaceCore.deserializeWorkspace(json), /unexpected field/);
  assert.throws(() => WorkspaceCore.deserializeWorkspace(csv), /not valid JSON/);
  assert.throws(() => WorkspaceCore.parseTsv(csv), /unknown column/);
  assert.throws(() => WorkspaceCore.parseTsv(csv.replace(/,/g, '\t')), Error);
  // Review Package には取り込み口が無い
  assert.equal(Object.keys(ReviewPackage).some((k) => /import|deserial|load|parse/i.test(k)), false);
  // この module には逆向きの関数が無い
  assert.equal(Object.keys(Report).some((k) => /import|deserial|load|parse|fromReport|toProjectInput|toWorkspace|toPack/i.test(k)), false);
});

test('P2L-S3B3B1-P15: 計算・入力 package・Workspace・Review・保存・通信・DOM に触れない（静的）', () => {
  ['GlassCalc', 'WindPressure', 'calculateWindPressure', 'generateCandidates', 'paneAreaM2', 'ProjectPackExecution',
    'executeCase', 'createBatchRun', 'executeAll', 'ProjectContext', 'ProjectPack.', 'validateProjectPack',
    'ProjectInput', 'WorkspaceCore', 'ReviewPackage', 'Scenario', 'ProjectProfile', 'EvidenceClosure', 'EvidenceLedger',
    'Promotion', 'activeProjectContext', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest',
    'sendBeacon', 'console.', 'document', 'window', 'Blob', 'createObjectURL', 'clipboard', 'download']
    .forEach((token) => assert.equal(REPORT_CODE.includes(token), false, 'report module が ' + token + ' を使っている'));
  // gate は batch module の assertBatchResult だけ
  assert.equal((REPORT_CODE.match(/B\.assertBatchResult\(batchResult\)/g) || []).length, 1);
});

test('P2L-S3B3B1-P16: 既存の契約は変わらない', () => {
  assert.deepEqual([...ProjectInput.SOURCE_KINDS], ['registered_preset', 'manual', 'notification_calculation', 'imported_unverified']);
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
  assert.equal(WorkspaceCore.MAX_CASES, 1000);
  assert.equal(WorkspaceCore.SCHEMA_VERSION, 1);
  assert.equal(Pack.SCHEMA_VERSION, 1);
  assert.equal(Pack.LIMITS.maxGlazingCases, 2000);
  assert.equal(ProjectContext.TRUST_BY_SOURCE_KIND.project_pack_unreviewed, 'pack_unreviewed');
  assert.equal(Batch.TRUST, 'pack_unreviewed');
  assert.equal(Exec.TRUST, 'pack_unreviewed');
});
