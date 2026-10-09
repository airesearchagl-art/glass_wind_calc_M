'use strict';

/**
 * Phase 2L-B2 / S3-B2: Project Pack Case Execution（project-config/project-pack-execution.js）。
 *
 *   ProjectContext（fromProjectPack が発行したものだけ） → caseId 完全一致の 1 ケース
 *     → pane / 風圧の完全一致の解決 → GlassCalc → 未レビューの計算結果（deep-frozen）
 *
 * 期待値の取り方（oracle）:
 *   - executor の出力から期待値を作らない
 *   - 風圧・寸法・lookup の期待値は fixture の literal を手で写したもの（下の PINNED）
 *   - 告示 mode は、手で書いた入力で wind-pressure.js を直接呼んだ結果とも一致させる（integration）
 *   - ガラス候補は calc.js を直接呼んで一度だけ求めた値を literal で固定する
 *
 * fixture は tests/fixtures/project-pack/ の合成 Pack（実案件ではない）。どの mode も G002 を
 * 重点にする: 先頭の case・先頭の pane・先頭の行・general 固定のどれでも同じ答えにならない。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Evidence = require('../project-config/evidence.js');
const Pack = require('../project-config/project-pack.js');
const ProjectContext = require('../project-config/project-context.js');
const ProjectInput = require('../project-config/project-input.js');
const Registry = require('../project-config/registry.js');
const Wind = require('../wind-pressure.js');
const Glass = require('../calc.js');
const Exec = require('../project-config/project-pack-execution.js');
const { stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EXEC_SRC_REL = 'project-config/project-pack-execution.js';
const EXEC_SRC = read(EXEC_SRC_REL);
const EXEC_CODE = stripComments(EXEC_SRC);

const FIXTURES = {
  notification1458: 'tests/fixtures/project-pack/synthetic-notification1458.json',
  project_pressure_map: 'tests/fixtures/project-pack/synthetic-project-pressure-map.json',
  case_direct: 'tests/fixtures/project-pack/synthetic-case-direct.json'
};
const rawPack = (mode) => JSON.parse(read(FIXTURES[mode]));
const ctxOf = (pack) => ProjectContext.fromProjectPack(Pack.validateProjectPack(pack));
const ctx = (mode) => ctxOf(rawPack(mode));
const P = 'N/m²';

/** fixture の literal を手で写した期待値（executor からは作らない）。 */
const PINNED = Object.freeze({
  notificationG002: { caseId: 'G002', paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'lowe_fl',
    floor: '3', zone: 'corner', evaluationHeightM: 10.2,
    windInput: { V0: 30, roughnessCategory: 'II', buildingHeightM: 18.5, eavesHeightM: 17.5, evaluationHeightM: 10.2,
      buildingType: 'closed', zone: 'corner', basis: 'notification_baseline' },
    positivePressure: 1685.04324816824, negativePressure: -1409.5342125273235, designPressure: 1685.04324816824,
    best: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 }, counts: [43, 0, 6] },
  mapG002: { caseId: 'G002', paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'tp_single',
    floor: '5', zone: 'corner', positivePressure: 1135, negativePressureMagnitude: 1835, designPressure: 1835,
    best: { label: 'TP5', P: 8267.427211646136 }, counts: [6, 0, 0] },
  mapG001: { designPressure: 1565, best: { label: 'FL6', P: 1969.5378151260502 }, counts: [6, 1, 0] },
  directG002: { caseId: 'G002', paneId: 'P002', widthMm: 760, heightMm: 1880, glassType: 'lowe_fl', floor: '2',
    designPressure: 1365, best: { label: 'Low-E5 + A + FL5', P: 3543.183090705487 }, counts: [43, 0, 6] }
});

const close = (a, b, msg) => assert.equal(Math.abs(a - b) < 1e-9, true, msg + ': ' + a + ' vs ' + b);
const counts = (r) => [r.calculation.okCount, r.calculation.ngCount, r.calculation.outOfScopeCount];
function walk(node, visit, at) {
  at = at || '$';
  visit(node, at);
  if (node && typeof node === 'object') Object.keys(node).forEach((k) => walk(node[k], visit, at + '.' + k));
}

/* ============================================================
   E01–E02: genuine-context gate
============================================================ */

test('P2L-S3B2-E01: built-in context は拒否する（listCaseIds も executeCase も）', () => {
  const builtIn = ProjectContext.fromLegacyPreset(Registry.getRuntimeDefaultBuiltInPresetId());
  assert.equal(ProjectContext.isProjectContext(builtIn), true, '前提: 本物の built-in context');
  assert.throws(() => Exec.executeCase(builtIn, 'G001'), /requires a project_pack_unreviewed context/);
  assert.throws(() => Exec.listCaseIds(builtIn), /requires a project_pack_unreviewed context/);
});

test('P2L-S3B2-E02: 形を真似た object・生の Pack・validate 済み Pack は拒否する', () => {
  const real = ctx('case_direct');
  const fakes = [
    ['JSON clone of a real context', JSON.parse(JSON.stringify(real))],
    ['frozen clone', Evidence.deepFreeze(JSON.parse(JSON.stringify(real)))],
    ['prototype-chained', Object.create(real)],
    ['raw Project Pack', rawPack('case_direct')],
    ['validated Project Pack', Pack.validateProjectPack(rawPack('case_direct'))],
    ['null', null],
    ['string', 'G002']
  ];
  fakes.forEach(([name, fake]) => {
    assert.throws(() => Exec.executeCase(fake, 'G002'), /ProjectContext|ProjectPackExecution/, name);
    assert.throws(() => Exec.listCaseIds(fake), /ProjectContext|ProjectPackExecution/, name);
  });
  // 本物は通る（陽性対照）
  assert.equal(Exec.executeCase(real, 'G002').case.caseId, 'G002');
});

/* ============================================================
   E03–E05: mode ごとの完全一致の解決（G002）
============================================================ */

test('P2L-S3B2-E03: notification1458 G002 は floor 3 / corner / 評価高さ 10.2 で算定する（先頭行・general ではない）', () => {
  const pin = PINNED.notificationG002;
  const r = Exec.executeCase(ctx('notification1458'), 'G002');
  assert.deepEqual({ ...r.case }, { caseId: pin.caseId, paneId: pin.paneId, glassType: pin.glassType, extraFactor: 1,
    floor: pin.floor, zone: pin.zone });
  assert.equal(r.pressure.mode, 'notification1458');
  assert.equal(r.pressure.floor, pin.floor);
  assert.equal(r.pressure.zone, pin.zone);
  assert.equal(r.pressure.evaluationHeightM, pin.evaluationHeightM);
  close(r.pressure.positivePressure, pin.positivePressure, 'positive');
  close(r.pressure.negativePressure, pin.negativePressure, 'negative (signed)');
  close(r.pressure.designPressure, pin.designPressure, 'design');
  assert.equal(r.pressure.negativePressure < 0, true, '負圧は signed のまま保持する');
  // integration: 手で書いた入力で wind-pressure.js を直接呼んだ結果と一致する
  const direct = Wind.calculateWindPressure(pin.windInput);
  assert.equal(r.pressure.designPressure, direct.designPressure);
  assert.equal(r.pressure.positivePressure, direct.positive.pressure);
  assert.equal(r.pressure.negativePressure, direct.negative.pressure);
  // 先頭の評価高さ（3.4 m）・general 固定では、少なくとも 1 つの値が違う
  const firstRow = Wind.calculateWindPressure({ ...pin.windInput, evaluationHeightM: 3.4 });
  const general = Wind.calculateWindPressure({ ...pin.windInput, zone: 'general' });
  assert.notEqual(firstRow.designPressure, r.pressure.designPressure, '先頭行と区別できない');
  assert.notEqual(general.negative.pressure, r.pressure.negativePressure, 'general と区別できない');
  assert.deepEqual({ ...r.pane }, { paneId: pin.paneId, widthMm: pin.widthMm, heightMm: pin.heightMm });
  assert.equal(r.calculation.bestCandidate.label, pin.best.label);
  close(r.calculation.bestCandidate.P, pin.best.P, 'best P');
  assert.deepEqual(counts(r), pin.counts);
});

test('P2L-S3B2-E04: project_pressure_map G002 は floor 5 の正圧と corner の負圧（絶対値）で決まる', () => {
  const pin = PINNED.mapG002;
  const r = Exec.executeCase(ctx('project_pressure_map'), 'G002');
  assert.deepEqual({ ...r.pressure }, { mode: 'project_pressure_map', pressureSource: 'pack_pressure_map_lookup',
    floor: pin.floor, zone: pin.zone, positivePressure: pin.positivePressure,
    negativePressureMagnitude: pin.negativePressureMagnitude, designPressure: pin.designPressure });
  assert.equal(r.pressure.negativePressureMagnitude > 0, true, '負圧は magnitude のまま（signed へ作り替えない）');
  assert.equal('negativePressure' in r.pressure, false);
  // 先頭の正圧行（1015）・general（1565）では一致しない値がある
  assert.notEqual(r.pressure.positivePressure, 1015);
  assert.notEqual(r.pressure.negativePressureMagnitude, 1565);
  assert.deepEqual({ ...r.pane }, { paneId: pin.paneId, widthMm: pin.widthMm, heightMm: pin.heightMm });
  assert.equal(r.case.glassType, pin.glassType);
  assert.equal(r.calculation.bestCandidate.label, pin.best.label);
  close(r.calculation.bestCandidate.P, pin.best.P, 'best P');
  assert.deepEqual(counts(r), pin.counts);
  // NG を含むケース（G001: FL6 が最小の OK、1 件が NG）
  const g1 = Exec.executeCase(ctx('project_pressure_map'), 'G001');
  assert.equal(g1.calculation.designPressure, PINNED.mapG001.designPressure);
  assert.equal(g1.calculation.bestCandidate.label, PINNED.mapG001.best.label);
  close(g1.calculation.bestCandidate.P, PINNED.mapG001.best.P, 'G001 best P');
  assert.deepEqual(counts(g1), PINNED.mapG001.counts);
});

test('P2L-S3B2-E05: case_direct G002 は case の designPressure だけを使う', () => {
  const pin = PINNED.directG002;
  const r = Exec.executeCase(ctx('case_direct'), 'G002');
  assert.deepEqual({ ...r.pressure }, { mode: 'case_direct', pressureSource: 'pack_case_direct', designPressure: pin.designPressure });
  assert.equal(r.calculation.designPressure, pin.designPressure);
  assert.notEqual(r.calculation.designPressure, 1245, '1 件目の designPressure を使っている');
  assert.deepEqual({ ...r.pane }, { paneId: pin.paneId, widthMm: pin.widthMm, heightMm: pin.heightMm });
  assert.equal(r.calculation.bestCandidate.label, pin.best.label);
  close(r.calculation.bestCandidate.P, pin.best.P, 'best P');
  assert.deepEqual(counts(r), pin.counts);
});

/* ============================================================
   E06–E07: case / pane の解決
============================================================ */

test('P2L-S3B2-E06: 存在しない caseId は拒否する（index・大小文字違い・空白付きで別 case へ fallback しない）', () => {
  const c = ctx('notification1458');
  ['G009', 'g002', ' G002', 'G002 ', 'G02', '1', '0', ''].forEach((id) =>
    assert.throws(() => Exec.executeCase(c, id), /ProjectPackExecution/, JSON.stringify(id)));
  [null, undefined, 2, {}, ['G002']].forEach((id) =>
    assert.throws(() => Exec.executeCase(c, id), /caseId must be a non-empty string/, String(id)));
  assert.deepEqual([...Exec.listCaseIds(c)], ['G001', 'G002', 'G003']);
});

test('P2L-S3B2-E07: pane は case.paneId の完全一致で決まる（先頭の pane ではない）', () => {
  const map = ctx('project_pressure_map');
  const want = { G001: ['P001', 1020, 2240], G002: ['P002', 760, 1880], G003: ['P003', 640, 1720], G004: ['P001', 1020, 2240] };
  Object.keys(want).forEach((id) => {
    const r = Exec.executeCase(map, id);
    assert.deepEqual([r.pane.paneId, r.pane.widthMm, r.pane.heightMm], want[id], id);
    assert.equal(r.calculation.areaM2, Glass.paneAreaM2(want[id][1], want[id][2]), id + ' area');
  });
});

/* ============================================================
   E08–E10: 結果の不変性・trust・Evidence 無し
============================================================ */

test('P2L-S3B2-E08: 結果は deep-frozen で、呼ぶたびに新しい object（依存 module の object を共有しない）', () => {
  const c = ctx('notification1458');
  const a = Exec.executeCase(c, 'G002');
  const b = Exec.executeCase(c, 'G002');
  assert.notEqual(a, b);
  assert.deepEqual(a, b, '決定的でない');
  walk(a, (node, at) => { if (node && typeof node === 'object') assert.equal(Object.isFrozen(node), true, at); });
  assert.throws(() => { 'use strict'; a.trust = 'verified'; });
  assert.throws(() => { 'use strict'; a.calculation.candidates[0].P = 1; });
  // GlassCalc が新しく返す候補と同じ値だが、同じ object ではない
  const fresh = Glass.sortCandidates(Glass.generateCandidates('lowe_fl', a.calculation.areaM2, a.calculation.designPressure, 1));
  assert.deepEqual(JSON.parse(JSON.stringify(a.calculation.candidates)), JSON.parse(JSON.stringify(fresh)));
  assert.notEqual(a.calculation.candidates[0], fresh[0]);
});

test('P2L-S3B2-E09: trust は常に pack_unreviewed。出典の申告（primary・private reference あり）でも変わらない', () => {
  ['notification1458', 'project_pressure_map', 'case_direct'].forEach((mode) => {
    const base = ctx(mode);
    Exec.listCaseIds(base).forEach((id) => {
      const r = Exec.executeCase(base, id);
      assert.equal(r.trust, 'pack_unreviewed', mode + ' ' + id);
      assert.equal(r.sourceKind, 'project_pack_unreviewed');
      assert.equal(r.executionType, 'glass_wind_project_pack_case_execution');
      assert.equal(r.schemaVersion, 1);
    });
    // 申告を最も強くしても結果は同一
    const strong = rawPack(mode);
    strong.evidence.sourceScopes.forEach((s) => {
      s.sourceClaim.claimedLevel = 'primary';
      s.sourceClaim.claimedPrivateReferenceAvailable = true;
    });
    const id = Exec.listCaseIds(base)[1];
    assert.deepEqual(Exec.executeCase(ctxOf(strong), id), Exec.executeCase(base, id), mode + ': 申告で結果が変わった');
  });
});

test('P2L-S3B2-E10: 結果に sourceClaim・Evidence・Promotion・検証/承認の field が無い', () => {
  const forbidden = /^(verified|approved|reviewed|attested|attestation|canonicalEvidence|promotionCandidate|provenance|verificationStatus|formulaVerificationStatus|formulaSource|evidence|evidenceKind|sourceClaim|sourceScopes|records|claimedLevel|privateReferenceAvailable|claimedPrivateReferenceAvailable|publicationAdvisories|verifiedCases)$/;
  ['notification1458', 'project_pressure_map', 'case_direct'].forEach((mode) => {
    const c = ctx(mode);
    Exec.listCaseIds(c).forEach((id) => {
      const r = Exec.executeCase(c, id);
      walk(r, (node, at) => {
        if (node && typeof node === 'object') {
          Object.keys(node).forEach((k) => assert.equal(forbidden.test(k), false, mode + ' ' + id + ' ' + at + '.' + k));
          assert.equal(Evidence.canPromoteToVerified(node), false, at + ' が昇格可能');
        }
        if (typeof node === 'string') {
          assert.equal(/verified|approved|承認|検証済|確認済|合成テスト用/.test(node), false, at + ' = ' + node);
        }
      });
    });
  });
});

/* ============================================================
   E11–E13: 依存の境界
============================================================ */

test('P2L-S3B2-E11: 入力 package（ProjectInput）に依存せず、その契約も変えない', () => {
  assert.equal(/ProjectInput|project-input/.test(EXEC_SRC), false, 'executor が ProjectInput を参照している');
  assert.deepEqual([...ProjectInput.SOURCE_KINDS], ['registered_preset', 'manual', 'notification_calculation', 'imported_unverified']);
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
  // 結果は入力 package として読めない
  const r = Exec.executeCase(ctx('case_direct'), 'G002');
  assert.throws(() => ProjectInput.deserialize(JSON.stringify(r)));
});

test('P2L-S3B2-E12: Closure・Ledger・Promotion・registry・出典の申告に依存しない（静的）', () => {
  [/EvidenceClosure|evidence-closure/, /EvidenceLedger|evidence-ledger/, /evaluateClosure/, /assertPromotionGate/,
    /canPromoteToVerified/, /makeEvidence/, /verifiedCases/, /PresetRegistry|registry\.js/, /evidenceClaims/,
    /activeProjectContext/, /stagedProjectPack/, /validateProjectPack|project-pack\.js/, /fromLegacyPreset/]
    .forEach((re) => assert.equal(re.test(EXEC_SRC), false, EXEC_SRC_REL + ' に ' + re));
  // DOM・保存・通信・時刻・乱数を使わない（実行コード）
  [/\bdocument\b/, /\bwindow\b/, /\bnavigator\b/, /localStorage|sessionStorage|indexedDB/, /\bfetch\s*\(/,
    /XMLHttpRequest|sendBeacon|WebSocket/, /\bconsole\./, /Math\.random/, /\bDate\b/, /\bprocess\./, /\bimport\s*\(/]
    .forEach((re) => assert.equal(re.test(EXEC_CODE), false, EXEC_SRC_REL + ' の実行コードに ' + re));
});

test('P2L-S3B2-E13: wind-pressure.js の provenance を結果へ写さない（計算 trace の数値だけを持つ）', () => {
  const r = Exec.executeCase(ctx('notification1458'), 'G002');
  const direct = Wind.calculateWindPressure(PINNED.notificationG002.windInput);
  assert.ok(direct.provenance && direct.provenance.formulaVerificationStatus, '前提: 風圧側には provenance がある');
  const json = JSON.stringify(r);
  [direct.provenance.formulaVerificationStatus, direct.provenance.formulaSource, 'formulaVerificationStatus',
    'inputVerificationStatus', 'provenance', JSON.stringify(direct.sourceKind)].forEach((s) =>
    assert.equal(json.includes(s), false, '結果に ' + s + ' がある'));
  assert.deepEqual(Object.keys(r.pressure.notificationTrace).sort(),
    ['geometry', 'inputs', 'negative', 'normalized', 'positive', 'trace']);
  assert.deepEqual(JSON.parse(JSON.stringify(r.pressure.notificationTrace.trace)), JSON.parse(JSON.stringify(direct.trace)));
  assert.equal(EXEC_CODE.includes('.provenance'), false, 'executor が provenance を読んでいる');
});

/* ============================================================
   E14–E15: case_direct を分けない・入力に無いものを作らない
============================================================ */

test('P2L-S3B2-E14: case_direct は正圧・負圧・負圧の絶対値を作らない', () => {
  const c = ctx('case_direct');
  Exec.listCaseIds(c).forEach((id) => {
    const r = Exec.executeCase(c, id);
    assert.deepEqual(Object.keys(r.pressure).sort(), ['designPressure', 'mode', 'pressureSource'], id);
    walk(r.pressure, (node, at) => {
      if (node && typeof node === 'object') {
        Object.keys(node).forEach((k) => assert.equal(/positive|negative|zone|floor/i.test(k), false, id + ' ' + at + '.' + k));
      }
    });
    // ±designPressure・半分の値を作っていない
    const half = r.pressure.designPressure / 2;
    walk(r.pressure, (node) => { if (typeof node === 'number') assert.equal(node === -r.pressure.designPressure || node === half, false); });
  });
});

test('P2L-S3B2-E15: 入力に無い floor / zone を作らない（case context として持つだけ）', () => {
  const direct = ctx('case_direct');
  const g1 = Exec.executeCase(direct, 'G001');
  assert.equal('floor' in g1.case || 'zone' in g1.case, false, 'G001 に floor / zone を作った');
  const g2 = Exec.executeCase(direct, 'G002');
  assert.equal(g2.case.floor, PINNED.directG002.floor);
  assert.equal('zone' in g2.case, false, 'G002 に zone を推測した');
  assert.equal('floor' in g2.pressure, false, 'floor を風圧の正に使った');
  // 告示・map の case は fixture にある floor / zone をそのまま持つ
  ['notification1458', 'project_pressure_map'].forEach((mode) => {
    const raw = rawPack(mode);
    const c = ctx(mode);
    raw.glazingCases.forEach((src) => {
      const r = Exec.executeCase(c, src.caseId);
      assert.equal(r.case.floor, src.floor);
      assert.equal(r.case.zone, src.zone);
    });
  });
});

/* ============================================================
   追加: 発行物だけが結果、単位、全ケース、fail closed の経路
============================================================ */

test('P2L-S3B2-E16: assertExecutionResult は executeCase の発行物だけを通す', () => {
  const r = Exec.executeCase(ctx('project_pressure_map'), 'G002');
  assert.equal(Exec.isExecutionResult(r), true);
  assert.equal(Exec.assertExecutionResult(r), r);
  const forged = JSON.parse(JSON.stringify(r));
  assert.equal(Exec.isExecutionResult(forged), false);
  assert.throws(() => Exec.assertExecutionResult(forged), /was not issued/);
  assert.throws(() => Exec.assertExecutionResult(Evidence.deepFreeze(forged)), /was not issued/);
  assert.equal(Exec.isExecutionResult(null), false);
});

test('P2L-S3B2-E17: 単位は Project Pack の単位と同じ（変換しない）', () => {
  ['length', 'height', 'speed', 'pressure'].forEach((k) => assert.equal(Exec.UNITS[k], Pack.UNITS[k], k));
  const r = Exec.executeCase(ctx('case_direct'), 'G002');
  assert.deepEqual({ ...r.units }, { length: 'mm', height: 'm', pressure: P, area: 'm²' });
});

test('P2L-S3B2-E18: 3 fixture の全ケースが実行でき、結果は決定的', () => {
  ['notification1458', 'project_pressure_map', 'case_direct'].forEach((mode) => {
    const c = ctx(mode);
    const ids = Exec.listCaseIds(c);
    assert.equal(ids.length, rawPack(mode).glazingCases.length);
    ids.forEach((id) => {
      const r = Exec.executeCase(c, id);
      assert.equal(r.case.caseId, id);
      assert.equal(r.calculation.designPressure > 0, true);
      assert.deepEqual(Exec.executeCase(c, id), r);
    });
  });
});

/**
 * 本物の context では validator が重複・欠落を防ぐので、この境界の fail closed の経路は
 * 届かない。module を vm で読み、gate だけを通す偽の ProjectContext と、わざと不整合にした
 * capability で、それでも先頭行・先頭 pane・別 case へ fallback しないことを確かめる。
 */
function executorWith(capabilities, mode, extra) {
  // 依存 module も同じ vm の中で読む（realm が違うと素の object の判定が食い違う）
  const sandbox = {};
  vm.createContext(sandbox);
  ['project-config/evidence.js', 'wind-pressure.js', 'calc.js'].forEach((rel) =>
    vm.runInContext(read(rel), sandbox, { filename: rel }));
  vm.runInContext('var ProjectContext = { TRUST_BY_SOURCE_KIND: { project_pack_unreviewed: "pack_unreviewed" },' +
    ' PRESSURE_CAPABILITY_BY_MODE: ' + JSON.stringify(ProjectContext.PRESSURE_CAPABILITY_BY_MODE) + ',' +
    ' assertProjectContext: function (c) { return c; },' +
    ' requireCapability: function (c, name) { if (!(name in c.capabilities)) throw new Error("missing capability " + name);' +
    ' return c.capabilities[name]; } };', sandbox);
  vm.runInContext(EXEC_SRC, sandbox, { filename: EXEC_SRC_REL });
  const fakeCtx = Object.assign({ sourceKind: 'project_pack_unreviewed', trust: 'pack_unreviewed',
    publicLabel: 'Synthetic', pressureModel: { mode }, capabilities }, extra || {});
  return { Exec: sandbox.ProjectPackExecution, ctx: vm.runInContext('(' + JSON.stringify(fakeCtx) + ')', sandbox) };
}

test('P2L-S3B2-E19: 0 件・複数件・単位違いは fail closed（先頭行・先頭 pane・別 case へ fallback しない）', () => {
  const q = (value, unit) => ({ value, unit });
  const panes = [{ paneId: 'P001', widthMm: q(1020, 'mm'), heightMm: q(2240, 'mm') }, { paneId: 'P002', widthMm: q(760, 'mm'), heightMm: q(1880, 'mm') }];
  const directCaps = (over) => Object.assign({
    declaredPanes: { panes },
    declaredGlazingCases: { glazingCases: [{ caseId: 'G001', paneId: 'P001', glassType: 'fl_single', extraFactor: 1 },
      { caseId: 'G002', paneId: 'P002', glassType: 'lowe_fl', extraFactor: 1 }] },
    caseDirectPressure: { designPressures: [{ caseId: 'G001', designPressure: q(1245, P) }, { caseId: 'G002', designPressure: q(1365, P) }] }
  }, over || {});
  // 陽性対照: 不整合が無ければ通る
  const ok = executorWith(directCaps(), 'case_direct');
  assert.equal(ok.Exec.executeCase(ok.ctx, 'G002').calculation.designPressure, 1365);

  const cases = [
    ['duplicate case', directCaps({ declaredGlazingCases: { glazingCases: [
      { caseId: 'G002', paneId: 'P001', glassType: 'fl_single', extraFactor: 1 },
      { caseId: 'G002', paneId: 'P002', glassType: 'lowe_fl', extraFactor: 1 }] } }), /ambiguous/],
    ['missing pane', directCaps({ declaredPanes: { panes: [panes[0]] } }), /no entry with paneId/],
    ['duplicate pane', directCaps({ declaredPanes: { panes: [panes[1], panes[1]] } }), /ambiguous/],
    ['missing direct pressure', directCaps({ caseDirectPressure: { designPressures: [{ caseId: 'G001', designPressure: q(1245, P) }] } }), /no entry with caseId/],
    ['duplicate direct pressure', directCaps({ caseDirectPressure: { designPressures: [
      { caseId: 'G002', designPressure: q(1365, P) }, { caseId: 'G002', designPressure: q(999, P) }] } }), /ambiguous/],
    ['pressure in another unit', directCaps({ caseDirectPressure: { designPressures: [{ caseId: 'G002', designPressure: q(1.365, 'kN/m2') }] } }), /quantity in/],
    ['pane in another unit', directCaps({ declaredPanes: { panes: [panes[0], { paneId: 'P002', widthMm: q(0.76, 'm'), heightMm: q(1880, 'mm') }] } }), /quantity in mm/],
    ['unknown glass type', directCaps({ declaredGlazingCases: { glazingCases: [{ caseId: 'G002', paneId: 'P002', glassType: 'mystery', extraFactor: 1 }] } }), /known glass type/]
  ];
  cases.forEach(([name, caps, re]) => {
    const t = executorWith(caps, 'case_direct');
    assert.throws(() => t.Exec.executeCase(t.ctx, 'G002'), re, name);
  });

  // map: 正圧の階・負圧の部位が無ければ先頭行を使わずに失敗する
  const mapCaps = (pos, neg, c) => ({
    declaredPanes: { panes },
    declaredGlazingCases: { glazingCases: [c || { caseId: 'G002', paneId: 'P002', glassType: 'tp_single', extraFactor: 1, floor: '5', zone: 'corner' }] },
    projectPressureMap: { positivePressures: pos, negativePressures: neg }
  });
  const pos = [{ floor: '1', pressure: q(1015, P) }];
  const neg = [{ zone: 'general', magnitude: q(1565, P) }];
  [['positive floor missing', mapCaps(pos, [{ zone: 'corner', magnitude: q(1835, P) }]), /positivePressures: no entry with floor/],
    ['negative zone missing', mapCaps([{ floor: '5', pressure: q(1135, P) }], neg), /negativePressures: no entry with zone/],
    ['case without zone', mapCaps([{ floor: '5', pressure: q(1135, P) }], neg,
      { caseId: 'G002', paneId: 'P002', glassType: 'tp_single', extraFactor: 1, floor: '5' }), /has no zone/]
  ].forEach(([name, caps, re]) => {
    const t = executorWith(caps, 'project_pressure_map');
    assert.throws(() => t.Exec.executeCase(t.ctx, 'G002'), re, name);
  });

  // 告示: 評価高さが case の階に無ければ先頭行を使わずに失敗する
  const wc = rawPack('notification1458').windConditions;
  const notif = (heights) => ({
    declaredPanes: { panes },
    declaredGlazingCases: { glazingCases: [{ caseId: 'G002', paneId: 'P002', glassType: 'lowe_fl', extraFactor: 1, floor: '3', zone: 'corner' }] },
    notificationCalculation: { windConditions: Object.assign({}, wc, { evaluationHeights: heights }) }
  });
  const t1 = executorWith(notif([{ floor: '1', height: q(3.4, 'm') }]), 'notification1458');
  assert.throws(() => t1.Exec.executeCase(t1.ctx, 'G002'), /evaluationHeights: no entry with floor "3"/);
  const t2 = executorWith(notif([{ floor: '3', height: q(10.2, 'm') }, { floor: '3', height: q(6.8, 'm') }]), 'notification1458');
  assert.throws(() => t2.Exec.executeCase(t2.ctx, 'G002'), /ambiguous/);
  // 陽性対照: 正しい 1 行なら算定される
  const t3 = executorWith(notif([{ floor: '1', height: q(3.4, 'm') }, { floor: '3', height: q(10.2, 'm') }]), 'notification1458');
  close(t3.Exec.executeCase(t3.ctx, 'G002').pressure.designPressure, PINNED.notificationG002.designPressure, 'vm notification');

  // gate: sourceKind / trust が Pack のものでなければ拒否
  const g = executorWith(directCaps(), 'case_direct', { sourceKind: 'legacy_builtin', trust: 'built_in_current' });
  assert.throws(() => g.Exec.executeCase(g.ctx, 'G002'), /requires a project_pack_unreviewed context/);
});

test('P2L-S3B2-E20: ProjectContext が無い page でも読み込みは止まらず、呼び出しは fail closed', () => {
  // index.html は project-context.js を読めないときも他の mode を動かす（context-runtime の failure scenario）。
  // executor の読み込みがそれを壊さないこと、呼べば失敗すること（別の経路へ fallback しないこと）を確かめる。
  const sandbox = {};
  vm.createContext(sandbox);
  ['project-config/evidence.js', 'wind-pressure.js', 'calc.js'].forEach((rel) =>
    vm.runInContext(read(rel), sandbox, { filename: rel }));
  assert.doesNotThrow(() => vm.runInContext(EXEC_SRC, sandbox, { filename: EXEC_SRC_REL }), '読み込みで例外を投げた');
  const E = sandbox.ProjectPackExecution;
  assert.equal(typeof E.executeCase, 'function');
  assert.equal(E.TRUST, 'pack_unreviewed');
  assert.throws(() => E.executeCase({ sourceKind: 'project_pack_unreviewed', trust: 'pack_unreviewed' }, 'G001'),
    /project-context\.js is required but not available/);
  assert.throws(() => E.listCaseIds({}), /project-context\.js is required but not available/);
  // 公開している定数は凍結されている
  assert.equal(Object.isFrozen(E) && Object.isFrozen(E.UNITS) && Object.isFrozen(E.FORBIDDEN_KEYS), true);
  // trust の規則が食い違う ProjectContext を初期化時に掴んだ場合も使わない
  const mismatch = {};
  vm.createContext(mismatch);
  ['project-config/evidence.js', 'wind-pressure.js', 'calc.js'].forEach((rel) =>
    vm.runInContext(read(rel), mismatch, { filename: rel }));
  vm.runInContext('var ProjectContext = { TRUST_BY_SOURCE_KIND: { project_pack_unreviewed: "verified" } };', mismatch);
  vm.runInContext(EXEC_SRC, mismatch, { filename: EXEC_SRC_REL });
  assert.throws(() => mismatch.ProjectPackExecution.executeCase({}, 'G001'), /trust for project_pack_unreviewed is not pack_unreviewed/);
});

/* ============================================================
   RF-22-01: 依存は初期化時に 1 度だけ掴み、後から global を読み直さない
============================================================ */

/** index.html と同じ順で本物の module を vm に読み込む（skip した module は読まない）。 */
const PAGE_ORDER = ['calc.js', 'wind-pressure.js', 'project-config/evidence.js', 'project-config/evidence-ledger.js',
  'project-config/sample.js', 'project-config/manual.js', 'project-config/registry.js',
  'project-config/evidence-closure.js', 'project-config/project-input.js', 'project-config/project-pack.js',
  'project-config/project-context.js', EXEC_SRC_REL];
function pageSandbox(options) {
  const opts = options || {};
  const sandbox = {};
  vm.createContext(sandbox);
  PAGE_ORDER.forEach((rel) => {
    if ((opts.skip || []).includes(rel)) return;
    if (rel === EXEC_SRC_REL && opts.beforeExecutor) opts.beforeExecutor(sandbox);
    vm.runInContext(read(rel), sandbox, { filename: rel });
  });
  sandbox.__ctx = (mode) => vm.runInContext('ProjectContext.fromProjectPack(ProjectPack.validateProjectPack(' +
    JSON.stringify(rawPack(mode)) + '))', sandbox);
  return sandbox;
}
const plain = (r) => JSON.parse(JSON.stringify(r));
const GENUINE = {
  notification1458: plain(Exec.executeCase(ctx('notification1458'), 'G002')),
  project_pressure_map: plain(Exec.executeCase(ctx('project_pressure_map'), 'G002')),
  case_direct: plain(Exec.executeCase(ctx('case_direct'), 'G002'))
};

test('P2L-S3B2-D0: 依存の解決は初期化時の 3 回だけで、呼び出し時に global・require を読まない（静的）', () => {
  assert.equal((EXEC_CODE.match(/captureDependency\(/g) || []).length, 4, 'captureDependency の定義 + 初期化時の 3 回');
  ['ProjectContext', 'WindPressure', 'GlassCalc'].forEach((name) =>
    assert.match(EXEC_CODE, new RegExp("var CAPTURED_\\w+ = captureDependency\\('" + name + "'")));
  const start = EXEC_CODE.indexOf('function requireDependencies(');
  const body = EXEC_CODE.slice(start, EXEC_CODE.indexOf('\n  }\n', start));
  assert.equal(/global|captureDependency|require\(|resolveDependency/.test(body), false,
    'requireDependencies が global・require を読み直している');
  // global を読むのは captureDependency の中だけ
  const outside = EXEC_CODE.replace(/function captureDependency\([\s\S]*?\n  \}\n/, '');
  assert.equal(/global\s*\[|global\.(ProjectContext|WindPressure|GlassCalc)/.test(outside), false);
});

test('P2L-S3B2-D1: 初期化後に ProjectContext の global を差し替えても、掴んだ本物を使い偽物は呼ばれない', () => {
  const sb = pageSandbox();
  const genuineCtx = sb.__ctx('notification1458');
  let consulted = 0;
  const decoy = new Proxy({}, { get: (t, k) => { consulted++; return k === 'TRUST_BY_SOURCE_KIND'
    ? { project_pack_unreviewed: 'pack_unreviewed' } : () => { throw new Error('DECOY ProjectContext'); }; } });
  sb.ProjectContext = decoy;
  assert.equal(vm.runInContext('ProjectContext', sb), decoy, '前提: 差し替えが vm の中から見える');
  const r = sb.ProjectPackExecution.executeCase(genuineCtx, 'G002');
  assert.deepEqual(plain(r), GENUINE.notification1458);
  assert.equal(consulted, 0, '差し替えた ProjectContext が参照された');
  // 偽の context は、掴んだ本物の gate で拒否される
  assert.throws(() => sb.ProjectPackExecution.executeCase(JSON.parse(JSON.stringify(genuineCtx)), 'G002'), /ProjectContext/);
});

test('P2L-S3B2-D2: 初期化後に WindPressure を差し替えても、告示の結果は本物の風圧と同一で偽の値は出ない', () => {
  const sb = pageSandbox();
  const genuineCtx = sb.__ctx('notification1458');
  let calls = 0;
  const decoy = { calculateWindPressure: () => { calls++;
    return { positive: { pressure: 31415926.5 }, negative: { pressure: -27182818.5 }, designPressure: 31415926.5,
      inputs: { decoy: 'DECOY-WIND' }, normalized: {}, geometry: null, trace: [] }; } };
  sb.WindPressure = decoy;
  assert.equal(vm.runInContext('WindPressure', sb), decoy, '前提: 差し替えが vm の中から見える');
  const r = sb.ProjectPackExecution.executeCase(genuineCtx, 'G002');
  assert.deepEqual(plain(r), GENUINE.notification1458);
  assert.equal(calls, 0, '差し替えた WindPressure が呼ばれた');
  assert.equal(/31415926|27182818|DECOY-WIND/.test(JSON.stringify(r)), false);
});

test('P2L-S3B2-D3: 初期化後に GlassCalc を差し替えても、候補と件数は掴んだ本物のまま', () => {
  const sb = pageSandbox();
  const genuineCtx = sb.__ctx('project_pressure_map');
  let calls = 0;
  const decoyCandidate = { label: 'DECOY-GLASS', t_max: 1, t_total: 1, P: 123456, status: 'ok', outOfScope: false, detail: {} };
  const decoyGlass = { GLASS_TYPES: { tp_single: {} },
    paneAreaM2: () => { calls++; return 42; },
    generateCandidates: () => { calls++; return [decoyCandidate]; },
    splitCandidates: () => { calls++; return { okCandidates: [decoyCandidate], ngCandidates: [], outOfScopeCandidates: [] }; },
    sortCandidates: () => { calls++; return [decoyCandidate]; } };
  sb.GlassCalc = decoyGlass;
  assert.equal(vm.runInContext('GlassCalc', sb), decoyGlass, '前提: 差し替えが vm の中から見える');
  const r = sb.ProjectPackExecution.executeCase(genuineCtx, 'G002');
  assert.deepEqual(plain(r), GENUINE.project_pressure_map);
  assert.equal(calls, 0, '差し替えた GlassCalc が呼ばれた');
  assert.equal(r.calculation.bestCandidate.label, PINNED.mapG002.best.label);
  assert.equal(JSON.stringify(r).includes('DECOY-GLASS'), false);
});

test('P2L-S3B2-D4: 初期化時に ProjectContext が無ければ、後から現れた global（本物でも偽物でも）を使わない', () => {
  // 本物の project-context.js を executor の後で読み込む: staged context は作れるが、executor は使えないまま
  const sb = pageSandbox({ skip: ['project-config/project-context.js'] });
  assert.equal(sb.ProjectContext, undefined, '前提: 初期化時に ProjectContext は無い');
  vm.runInContext(read('project-config/project-context.js'), sb, { filename: 'project-context.js (late)' });
  const lateCtx = sb.__ctx('case_direct');
  assert.equal(sb.ProjectContext.isProjectContext(lateCtx), true, '前提: 後から読んだ本物の context');
  assert.throws(() => sb.ProjectPackExecution.executeCase(lateCtx, 'G002'), /project-context\.js is required but not available/);
  assert.throws(() => sb.ProjectPackExecution.listCaseIds(lateCtx), /project-context\.js is required but not available/);
  // 本物らしく振る舞う偽物を置いても同じ
  sb.ProjectContext = { TRUST_BY_SOURCE_KIND: { project_pack_unreviewed: 'pack_unreviewed' },
    PRESSURE_CAPABILITY_BY_MODE: { case_direct: 'caseDirectPressure' },
    assertProjectContext: (c) => c, requireCapability: (c, n) => c.capabilities[n] };
  assert.throws(() => sb.ProjectPackExecution.executeCase(lateCtx, 'G002'), /project-context\.js is required but not available/);
});

test('P2L-S3B2-D5: 初期化時に WindPressure / GlassCalc が無ければ、この module instance では使えないまま', () => {
  [['WindPressure', 'wind-pressure.js'], ['GlassCalc', 'calc.js']].forEach(([name, file]) => {
    // vm の global からの削除は vm の中で行う（sandbox object 経由の delete は vm の global に届かない）
    const sb = pageSandbox({ beforeExecutor: (s) => vm.runInContext('globalThis.__saved = ' + name + '; delete globalThis.' + name + ';', s) });
    vm.runInContext('globalThis.' + name + ' = globalThis.__saved;', sb);   // 初期化の後で本物を戻しても
    assert.equal(typeof vm.runInContext(name, sb), 'object', '前提: 戻した ' + name + ' が見える');
    const c = sb.__ctx('case_direct');
    assert.throws(() => sb.ProjectPackExecution.executeCase(c, 'G002'), new RegExp(file.replace('.', '\\.') + ' is required but not available'), name);
  });
});
