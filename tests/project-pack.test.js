'use strict';

/**
 * Phase 2L-B1: Generic Project Pack v1 の schema / validator。
 *
 * ── fixture はすべて合成である ────────────────────────────────
 *
 * 値・階構成・ラベルはいずれも人工的なもので、実案件のものを使わない。
 * P2L-B1-18 が、repository に現存する案件 preset と案件 Observation から実値を
 * **その場で読み出して**突き合わせ、fixture が 1 つも一致しないことを確かめる
 * （実値をこの test に書き写すと、それ自体が実値の複製になる）。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PACK_SRC_REL = 'project-config/project-pack.js';
const PACK_SRC = fs.readFileSync(path.join(ROOT, PACK_SRC_REL), 'utf8');
const Pack = require('../project-config/project-pack.js');

const P = 'N/m\u00b2';
const q = (value, unit) => ({ value, unit });
const clone = (o) => JSON.parse(JSON.stringify(o));

/** 合成の evidence 節。mode ごとに設計値が存在する対象にだけ record を置く。 */
function syntheticEvidence(mode) {
  const records = [
    { sourceScopeId: 'S01', subject: { kind: 'pane_width', paneId: 'P001' }, quantity: q(987, 'mm') },
    { sourceScopeId: 'S01', subject: { kind: 'pane_height', paneId: 'P001' }, quantity: q(2345, 'mm') }
  ];
  if (mode === 'notification1458') {
    records.push({ sourceScopeId: 'S02', subject: { kind: 'wind_v0' }, quantity: q(30, 'm/s') });
    records.push({ sourceScopeId: 'S02', subject: { kind: 'evaluation_height', floor: '3' }, quantity: q(9.9, 'm') });
  }
  if (mode === 'project_pressure_map') {
    records.push({ sourceScopeId: 'S01', subject: { kind: 'positive_pressure', floor: '2' }, quantity: q(1040, P) });
    records.push({ sourceScopeId: 'S01', subject: { kind: 'negative_pressure_magnitude', zone: 'corner' }, quantity: q(1790, P) });
  }
  if (mode === 'case_direct') {
    records.push({ sourceScopeId: 'S01', subject: { kind: 'case_design_pressure', caseId: 'G001' }, quantity: q(1234, P) });
  }
  return {
    sourceScopes: [
      { sourceScopeId: 'S01', evidence: { level: 'primary', checkedAt: '2026-01-15',
        publicDescription: '合成テスト用の出典（実案件ではない）', privateReferenceAvailable: true } },
      { sourceScopeId: 'S02', evidence: { level: 'indirect', checkedAt: '2026-01-16',
        publicDescription: '合成テスト用の参考資料（実案件ではない）', privateReferenceAvailable: false } }
    ],
    records
  };
}

const FLOORS = ['1', '2', '3', '4', '5', '6', 'R'];
const HEIGHTS = [3.3, 6.6, 9.9, 13.2, 16.5, 19.8, 22.5];
const POSITIVE = [1010, 1040, 1070, 1100, 1130, 1160, 1190];

function syntheticPack(mode) {
  const base = {
    schemaVersion: 1,
    packType: 'glass_wind_project_pack',
    projectMetadata: { publicLabel: 'Synthetic Sample Project A' },
    pressureModel: { mode },
    windConditions: {},
    panes: [
      { paneId: 'P001', widthMm: q(987, 'mm'), heightMm: q(2345, 'mm') },
      { paneId: 'P002', widthMm: q(1111, 'mm'), heightMm: q(2468, 'mm') },
      { paneId: 'P003', widthMm: q(864, 'mm'), heightMm: q(1975, 'mm') }
    ],
    glazingCases: [],
    evidence: syntheticEvidence(mode)
  };
  if (mode === 'notification1458') {
    base.windConditions = {
      basis: 'notification_baseline', V0: q(30, 'm/s'), roughnessCategory: 'II',
      buildingHeightM: q(23.5, 'm'), eavesHeightM: q(22.0, 'm'), buildingType: 'closed',
      evaluationHeights: FLOORS.map((floor, i) => ({ floor, height: q(HEIGHTS[i], 'm') }))
    };
    base.glazingCases = [
      { caseId: 'G001', paneId: 'P001', floor: '2', zone: 'general', glassType: 'fl_single', extraFactor: 1.0 },
      { caseId: 'G002', paneId: 'P002', floor: '5', zone: 'corner', glassType: 'lowe_fl', extraFactor: 1.0 },
      { caseId: 'G003', paneId: 'P001', floor: 'R', zone: 'general', glassType: 'fl_fl', extraFactor: 0.9 }
    ];
  } else if (mode === 'project_pressure_map') {
    base.windConditions = {
      positivePressures: FLOORS.map((floor, i) => ({ floor, pressure: q(POSITIVE[i], P) })),
      negativePressures: [{ zone: 'general', magnitude: q(1480, P) }, { zone: 'corner', magnitude: q(1790, P) }],
      evaluationHeights: [{ floor: '2', height: q(6.6, 'm') }]
    };
    base.glazingCases = [
      { caseId: 'G001', paneId: 'P001', floor: '2', zone: 'general', glassType: 'fl_single', extraFactor: 1.0 },
      { caseId: 'G002', paneId: 'P003', floor: '6', zone: 'corner', glassType: 'tp_single', extraFactor: 1.0 }
    ];
  } else {
    base.glazingCases = [
      { caseId: 'G001', paneId: 'P001', glassType: 'fl_single', extraFactor: 1.0, designPressure: q(1234, P) },
      { caseId: 'G002', paneId: 'P002', floor: '3', glassType: 'lowe_fl', extraFactor: 1.0, designPressure: q(1357, P) },
      { caseId: 'G003', paneId: 'P003', floor: '4', zone: 'corner', glassType: 'fl_fl', extraFactor: 1.0, designPressure: q(1468, P) }
    ];
  }
  return base;
}

const MODES = ['notification1458', 'project_pressure_map', 'case_direct'];
const rejects = (pack, re, msg) => assert.throws(() => Pack.validateProjectPack(pack), re, msg);
function walk(node, visit, at) {
  at = at || '$';
  visit(node, at);
  if (node && typeof node === 'object') Object.keys(node).forEach((k) => walk(node[k], visit, at + '.' + k));
}

test('P2L-B1-01: 3 mode それぞれの合成 pack が通り、正規化結果は新しい不変 object', () => {
  MODES.forEach((mode) => {
    const input = syntheticPack(mode);
    const out = Pack.validateProjectPack(input);
    assert.equal(out.packType, 'glass_wind_project_pack');
    assert.equal(out.pressureModel.mode, mode);
    assert.equal(out.trust, 'pack_unreviewed', mode);
    assert.equal(out.panes.length, 3);
    assert.equal(Object.isFrozen(out) && Object.isFrozen(out.glazingCases[0]), true);
    // 入力を保持しない: 検証後に入力を書き換えても結果は変わらない
    const before = JSON.stringify(out);
    input.panes[0].widthMm.value = 1;
    input.glazingCases.push({ junk: true });
    assert.equal(JSON.stringify(out), before, mode);
  });
});

test('P2L-B1-02: 未知の top-level key は拒否（trust / private mapping を含む）', () => {
  ['trust', 'verificationStatus', 'reviewed', 'privateMapping', 'private', 'projectName', 'extra']
    .forEach((key) => {
      const pack = syntheticPack('case_direct');
      pack[key] = key === 'trust' ? 'pack_reviewed' : 'x';
      rejects(pack, /unexpected field/, key);
    });
  const missing = syntheticPack('case_direct');
  delete missing.evidence;
  rejects(missing, /missing required field "evidence"/);
});

test('P2L-B1-03: 純粋な data でない object は拒否（getter は呼ばない）', () => {
  class Box { constructor() { this.publicLabel = 'Synthetic'; } }
  // 各規則を個別に固定する。別の規則（未知 key 等）に偶然拾われて通る test にしない。
  const INHERITED = /must be a plain object with no inherited properties/;
  const NOT_JSON = /unsupported value type/;
  const cases = [
    ['class instance', INHERITED, (p) => { p.projectMetadata = new Box(); }],
    ['custom prototype', INHERITED, (p) => { p.projectMetadata = Object.create({ inherited: 1 }); p.projectMetadata.publicLabel = 'S'; }],
    ['own __proto__', /own "__proto__" field/, (p) => { p.projectMetadata = JSON.parse('{"publicLabel":"S","__proto__":{"x":1}}'); }],
    ['Date value', INHERITED, (p) => { p.projectMetadata.publicLabel = new Date(0); }],
    ['Map value', INHERITED, (p) => { p.panes = new Map(); }],
    ['function value', NOT_JSON, (p) => { p.projectMetadata.publicLabel = () => 'S'; }],
    ['undefined value', NOT_JSON, (p) => { p.projectMetadata.publicLabel = undefined; }],
    ['bigint value', NOT_JSON, (p) => { p.schemaVersion = BigInt(1); }],
    ['NaN', /number must be finite/, (p) => { p.panes[0].widthMm.value = NaN; }],
    ['Infinity', /number must be finite/, (p) => { p.panes[0].widthMm.value = Infinity; }],
    ['symbol key', /symbol-keyed properties/, (p) => { p.projectMetadata[Symbol('s')] = 1; }],
    // 許可された名前を非列挙で置く: JSON.stringify では消えるのに検証は通る、というずれを作らせない
    ['non-enumerable', /non-enumerable property/, (p) => {
      const label = p.projectMetadata.publicLabel;
      delete p.projectMetadata.publicLabel;
      Object.defineProperty(p.projectMetadata, 'publicLabel', { value: label, enumerable: false });
    }],
    ['sparse array', /sparse array/, (p) => { p.panes = [p.panes[0], , p.panes[2]]; }], // eslint-disable-line no-sparse-arrays
    ['array extra prop', /non-index property "extra"/, (p) => { p.panes.extra = 1; }]
  ];
  cases.forEach(([name, re, mutate]) => {
    const pack = syntheticPack('case_direct');
    mutate(pack);
    rejects(pack, re, name);
  });

  // getter は「呼ばずに」拒否する。呼べば任意コードが走り、読むたびに値が変わりうる。
  let calls = 0;
  const pack = syntheticPack('case_direct');
  Object.defineProperty(pack.projectMetadata, 'publicLabel',
    { get() { calls++; return 'Synthetic'; }, enumerable: true });
  rejects(pack, /accessor property/);
  assert.equal(calls, 0, 'getter が呼ばれた');
});

test('P2L-B1-04: 深さ・件数・文字列長・循環の上限', () => {
  const deep = syntheticPack('case_direct');
  let node = deep.projectMetadata;
  delete node.publicLabel;
  for (let i = 0; i < 10; i++) { node.n = {}; node = node.n; }
  rejects(deep, /nesting is deeper than 8/);

  const big = syntheticPack('case_direct');
  big.panes = Array.from({ length: Pack.LIMITS.maxValues }, (_, i) =>
    ({ paneId: 'P' + String(i).padStart(4, '0'), widthMm: q(900, 'mm'), heightMm: q(1900, 'mm') }));
  rejects(big, /more than 50000 values/);

  const tooMany = syntheticPack('case_direct');
  tooMany.panes = Array.from({ length: Pack.LIMITS.maxPanes + 1 }, (_, i) =>
    ({ paneId: 'P' + String(i + 1).padStart(4, '0'), widthMm: q(900, 'mm'), heightMm: q(1900, 'mm') }));
  rejects(tooMany, /at most 500 items/);

  const long = syntheticPack('case_direct');
  long.projectMetadata.publicLabel = 'x'.repeat(Pack.LIMITS.maxStringLength + 1);
  rejects(long, /longer than 512/);

  const cyclic = syntheticPack('case_direct');
  cyclic.projectMetadata.self = cyclic.projectMetadata;
  rejects(cyclic, /circular reference/);
});

test('P2L-B1-05: schemaVersion と packType を閉じる', () => {
  [0, 2, '1', null].forEach((v) => {
    const pack = syntheticPack('case_direct'); pack.schemaVersion = v;
    rejects(pack, /schemaVersion/, String(v));
  });
  ['glass_wind_project_pack_v2', 'project_input_package', '', 'GLASS_WIND_PROJECT_PACK'].forEach((v) => {
    const pack = syntheticPack('case_direct'); pack.packType = v;
    rejects(pack, /packType/, v);
  });
});

test('P2L-B1-06: 中立 ID の形を閉じる', () => {
  const bad = {
    pane: ['P1', 'P01', 'P00001', 'p001', 'Q001', 'P001a', ' P001'],
    glazingCase: ['G1', 'G01', 'G00001', 'g001', 'C001'],
    sourceScope: ['S1', 'S0001', 's01', 'SRC1'],
    floor: ['0', '100', 'B0', 'B10', '1F', 'RF', 'r', '01']
  };
  bad.pane.forEach((id) => { const p = syntheticPack('case_direct'); p.panes[0].paneId = id; rejects(p, /pane id must match/, id); });
  bad.glazingCase.forEach((id) => { const p = syntheticPack('case_direct'); p.glazingCases[0].caseId = id; rejects(p, /glazingCase id must match/, id); });
  bad.sourceScope.forEach((id) => { const p = syntheticPack('case_direct'); p.evidence.sourceScopes[0].sourceScopeId = id; rejects(p, /sourceScope id must match/, id); });
  bad.floor.forEach((id) => { const p = syntheticPack('case_direct'); p.glazingCases[1].floor = id; rejects(p, /floor id must match/, id); });
  // 境界の正例
  ['P001', 'P9999'].forEach((id) => assert.equal(Pack.ID_PATTERNS.pane.test(id), true, id));
  ['B1', '1', '99', 'R', 'PH'].forEach((id) => assert.equal(Pack.ID_PATTERNS.floor.test(id), true, id));
});

test('P2L-B1-07: 建具記号・図面番号・ファイル名・path・ラベル型の ID を拒否', () => {
  const realLike = ['AW-1', 'ACW3', 'SD3', 'W-12', 'AW1-2F', 'A-101', 'S-201', 'plan.pdf',
    'C:\\pane', '/home/x', 'Tower-A', '東棟', 'North_Wing'];
  realLike.forEach((id) => {
    const a = syntheticPack('case_direct'); a.panes[0].paneId = id; rejects(a, /pane id must match/, id);
    const b = syntheticPack('case_direct'); b.glazingCases[0].caseId = id; rejects(b, /glazingCase id must match/, id);
    const c = syntheticPack('case_direct'); c.glazingCases[1].floor = id; rejects(c, /floor id must match/, id);
  });
});

test('P2L-B1-08: ID と対象の重複を拒否', () => {
  const pane = syntheticPack('case_direct'); pane.panes[1].paneId = 'P001'; rejects(pane, /duplicate paneId/);
  const kase = syntheticPack('case_direct'); kase.glazingCases[1].caseId = 'G001'; rejects(kase, /duplicate caseId/);
  const scope = syntheticPack('case_direct'); scope.evidence.sourceScopes[1].sourceScopeId = 'S01'; rejects(scope, /duplicate sourceScopeId/);
  const floor = syntheticPack('project_pressure_map');
  floor.windConditions.positivePressures[1].floor = '1'; rejects(floor, /duplicate floor/);
  const zone = syntheticPack('project_pressure_map');
  zone.windConditions.negativePressures[1].zone = 'general'; rejects(zone, /duplicate zone/);
  const rec = syntheticPack('case_direct');
  rec.evidence.records.push(clone(rec.evidence.records[0])); rejects(rec, /duplicate record subject/);
});

test('P2L-B1-09: 宣言されていない対象への参照を拒否', () => {
  const p = syntheticPack('case_direct'); p.glazingCases[0].paneId = 'P999';
  rejects(p, /references pane "P999", which is not declared/);
  const s = syntheticPack('case_direct'); s.evidence.records[0].sourceScopeId = 'S99';
  rejects(s, /references source scope "S99", which is not declared/);
  const rp = syntheticPack('case_direct'); rp.evidence.records[0].subject.paneId = 'P888';
  rejects(rp, /declares no design value/);
  const rc = syntheticPack('case_direct'); rc.evidence.records[2].subject.caseId = 'G999';
  rejects(rc, /declares no design value/);
  const rf = syntheticPack('project_pressure_map'); rf.evidence.records[2].subject.floor = 'B1';
  rejects(rf, /declares no design value/);
});

test('P2L-B1-10: 単位は量ごとに 1 つだけ（変換しない）', () => {
  const cases = [
    ['pane cm', (p) => { p.panes[0].widthMm.unit = 'cm'; }],
    ['pane m', (p) => { p.panes[0].heightMm.unit = 'm'; }],
    ['pressure N/m2', (p) => { p.glazingCases[0].designPressure.unit = 'N/m2'; }],
    ['pressure kN', (p) => { p.glazingCases[0].designPressure.unit = 'kN/m\u00b2'; }],
    ['pressure Pa', (p) => { p.glazingCases[0].designPressure.unit = 'Pa'; }],
    ['record unit mismatch', (p) => { p.evidence.records[0].quantity.unit = 'm'; }],
    ['missing unit', (p) => { delete p.panes[0].widthMm.unit; }],
    ['bare number', (p) => { p.panes[0].widthMm = 987; }]
  ];
  cases.forEach(([name, mutate]) => { const p = syntheticPack('case_direct'); mutate(p); rejects(p, /Project Pack/, name); });
  const v0 = syntheticPack('notification1458'); v0.windConditions.V0.unit = 'km/h'; rejects(v0, /exactly "m\/s"/);
  const h = syntheticPack('notification1458'); h.windConditions.evaluationHeights[0].height.unit = 'mm'; rejects(h, /exactly "m"/);
  const neg = syntheticPack('case_direct'); neg.glazingCases[0].designPressure.value = -1234;
  rejects(neg, /greater than 0/);
});

test('P2L-B1-11: notification1458 は風の規則を wind-pressure.js 自身に委ねる', () => {
  const ok = Pack.validateProjectPack(syntheticPack('notification1458'));
  assert.equal(ok.glazingCases.length, 3);
  // 規則をここへ写していないことの確認: wind module が拒否するものは pack も拒否する
  const v0 = syntheticPack('notification1458'); v0.windConditions.V0.value = 500;
  rejects(v0, /not a valid notification-1458 input/);
  const itakyo = syntheticPack('notification1458'); itakyo.windConditions.basis = 'itakyo_recommended';
  rejects(itakyo, /not a valid notification-1458 input/, 'itakyo requires recurrenceYears');
  const rec = syntheticPack('notification1458'); rec.windConditions.recurrenceYears = 100;
  rejects(rec, /not a valid notification-1458 input/, 'baseline forbids recurrenceYears');
  const okItakyo = syntheticPack('notification1458');
  okItakyo.windConditions.basis = 'itakyo_recommended'; okItakyo.windConditions.recurrenceYears = 50;
  assert.doesNotThrow(() => Pack.validateProjectPack(okItakyo));
  // floor / zone は必須で、推測しない
  const nf = syntheticPack('notification1458'); delete nf.glazingCases[0].floor; rejects(nf, /missing required field "floor"/);
  const nz = syntheticPack('notification1458'); delete nz.glazingCases[0].zone; rejects(nz, /missing required field "zone"/);
  const uf = syntheticPack('notification1458'); uf.glazingCases[0].floor = 'B1'; rejects(uf, /has no entry in windConditions.evaluationHeights/);
  const bz = syntheticPack('notification1458'); bz.glazingCases[0].zone = 'side'; rejects(bz, /must be one of general, corner/);
});

test('P2L-B1-12: mode に属さない field は拒否（別 mode の風圧を持ち込ませない）', () => {
  const a = syntheticPack('notification1458');
  a.windConditions.positivePressures = clone(syntheticPack('project_pressure_map').windConditions.positivePressures);
  rejects(a, /unexpected field "positivePressures" for pressureModel.mode "notification1458"/);
  const b = syntheticPack('project_pressure_map'); b.windConditions.V0 = q(30, 'm/s');
  rejects(b, /unexpected field "V0" for pressureModel.mode "project_pressure_map"/);
  const c = syntheticPack('case_direct'); c.windConditions.evaluationHeights = [{ floor: '1', height: q(3.3, 'm') }];
  rejects(c, /unexpected field "evaluationHeights" for pressureModel.mode "case_direct"/);
  const d = syntheticPack('project_pressure_map'); d.glazingCases[0].designPressure = q(1234, P);
  rejects(d, /double truth/);
  // mode に意味の無い record も拒否（設計値の無い対象を evidence が指さない）
  const e = syntheticPack('case_direct');
  e.evidence.records.push({ sourceScopeId: 'S01', subject: { kind: 'positive_pressure', floor: '2' }, quantity: q(1040, P) });
  rejects(e, /has no design value to refer to when pressureModel.mode is "case_direct"/);
  const f = syntheticPack('project_pressure_map');
  f.evidence.records.push({ sourceScopeId: 'S02', subject: { kind: 'wind_v0' }, quantity: q(30, 'm/s') });
  rejects(f, /has no design value to refer to/);
});

test('P2L-B1-13: case_direct は designPressure を要求し、zone を推測しない', () => {
  const missing = syntheticPack('case_direct'); delete missing.glazingCases[0].designPressure;
  rejects(missing, /missing required field "designPressure"/);
  const out = Pack.validateProjectPack(syntheticPack('case_direct'));
  const g001 = out.glazingCases.find((c) => c.caseId === 'G001');
  // 入力に無かった floor / zone は、出力にも無い（既定値で埋めない）
  assert.equal(Object.prototype.hasOwnProperty.call(g001, 'zone'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(g001, 'floor'), false);
  const g003 = out.glazingCases.find((c) => c.caseId === 'G003');
  assert.equal(g003.zone, 'corner');
  const bz = syntheticPack('case_direct'); bz.glazingCases[2].zone = 'edge'; rejects(bz, /must be one of general, corner/);
});

test('P2L-B1-14: notification1458 は case の直接風圧を黙って受け入れない（二重の真実）', () => {
  const pack = syntheticPack('notification1458');
  pack.glazingCases[1].designPressure = q(1234, P);
  rejects(pack, /double truth: designPressure is only allowed when pressureModel.mode is "case_direct"/);
});

test('P2L-B1-15: project_pressure_map は自分の map を要求する', () => {
  const np = syntheticPack('project_pressure_map'); delete np.windConditions.positivePressures;
  rejects(np, /missing required field "positivePressures"/);
  const nn = syntheticPack('project_pressure_map'); delete nn.windConditions.negativePressures;
  rejects(nn, /missing required field "negativePressures"/);
  const ep = syntheticPack('project_pressure_map'); ep.windConditions.positivePressures = [];
  rejects(ep, /at least 1 item/);
  const en = syntheticPack('project_pressure_map'); en.windConditions.negativePressures = [];
  rejects(en, /at least 1 item/);
  const cf = syntheticPack('project_pressure_map'); cf.glazingCases[0].floor = 'B2';
  rejects(cf, /has no entry in windConditions.positivePressures/);
  const cz = syntheticPack('project_pressure_map');
  cz.windConditions.negativePressures = [cz.windConditions.negativePressures[0]];
  cz.glazingCases[1].zone = 'corner';
  rejects(cz, /has no entry in windConditions.negativePressures/);
  const hz = syntheticPack('project_pressure_map'); hz.windConditions.evaluationHeights[0].floor = 'PH';
  rejects(hz, /has no entry in positivePressures/);
});

test('P2L-B1-16: pack は自分を verified へ昇格できない', () => {
  // 全出典を primary + private reference ありにしても trust は変わらない
  const strong = syntheticPack('case_direct');
  strong.evidence.sourceScopes.forEach((s) => { s.evidence.level = 'primary'; s.evidence.privateReferenceAvailable = true; });
  const out = Pack.validateProjectPack(strong);
  assert.equal(out.trust, 'pack_unreviewed');
  assert.deepEqual(Pack.TRUST_LEVELS, ['pack_unreviewed']);
  // 出力のどこにも verificationStatus / verified field が無い
  walk(out, (node, at) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      ['verificationStatus', 'verified', 'reviewed', 'promoted'].forEach((k) => {
        assert.equal(Object.prototype.hasOwnProperty.call(node, k), false, at + '.' + k);
      });
    }
  });
  // 名乗る経路はすべて閉じている
  const claims = [
    (p) => { p.projectMetadata.verificationStatus = 'verified'; },
    (p) => { p.panes[0].verified = true; },
    (p) => { p.glazingCases[0].verificationStatus = 'verified'; },
    (p) => { p.evidence.sourceScopes[0].evidence.verificationStatus = 'verified'; },
    (p) => { p.evidence.reviewed = true; },
    (p) => { p.evidence.sourceScopes[0].evidence.level = 'verified'; },
    (p) => { p.pressureModel.trust = 'pack_reviewed'; }
  ];
  claims.forEach((mutate, i) => { const p = syntheticPack('case_direct'); mutate(p); rejects(p, /Project Pack|makeEvidence/, 'claim #' + i); });
  // 正規化結果を入力へ戻して trust を持ち込むこともできない
  rejects(clone(out), /unexpected field "trust"/);
});

test('P2L-B1-17: network / storage / filesystem に依存しない', () => {
  [
    /\bfetch\s*\(/, /XMLHttpRequest/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/,
    /\bdocument\./, /\bwindow\./, /\bnavigator\./, /\bWebSocket\b/, /\bimport\s*\(/,
    /require\(\s*['"](?:node:)?(?:fs|path|http|https|net|child_process|os)['"]\s*\)/, /\bprocess\./
  ].forEach((re) => assert.equal(re.test(PACK_SRC), false, PACK_SRC_REL + ' に ' + re));

  // 実行時にも触れないことを、触れたら投げる罠で確かめる
  const names = ['fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'document', 'window', 'WebSocket'];
  const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
  const touched = [];
  try {
    names.forEach((n) => Object.defineProperty(globalThis, n, {
      configurable: true, get() { touched.push(n); throw new Error('touched ' + n); }
    }));
    MODES.forEach((mode) => Pack.validateProjectPack(syntheticPack(mode)));
  } finally {
    saved.forEach(([n, d]) => { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n]; });
  }
  assert.deepEqual(touched, []);
});

test('P2L-B1-18: fixture は実案件の値・階構成・名称を 1 つも使わない', () => {
  // 実値はこの test に書き写さず、repository に現存する module から読む
  const Miyoshi = require('../project-config/miyoshi.js');
  const Intake = require('../project-config/miyoshi-observations.js');
  const real = new Set();
  Object.values(Miyoshi.wind.positivePressureByFloor).forEach((v) => real.add(v.value));
  Object.values(Miyoshi.wind.negativePressureByZone).forEach((v) => real.add(v.value));
  real.add(Miyoshi.wind.V0.value);
  real.add(Miyoshi.dimensions.defaultW.value);
  real.add(Miyoshi.dimensions.defaultH.value);
  Intake.observations.forEach((o) => real.add(o.observedValue));
  const stated = Intake.sourceScope.statedWindConditions;
  [stated.V0.value, stated.recurrenceYears, stated.recurrenceMultiplier].forEach((v) => real.add(v));
  assert.equal(real.size >= 15, true, '実値の集合が小さすぎる——読み出しが壊れている');

  const realFloors = Object.keys(Miyoshi.wind.positivePressureByFloor).sort();
  MODES.forEach((mode) => {
    const pack = syntheticPack(mode);
    walk(pack, (node, at) => {
      if (typeof node === 'number' && at !== '$.schemaVersion') {
        assert.equal(real.has(node), false, mode + ' ' + at + ' = ' + node + ' は実値と一致する');
      }
      if (typeof node === 'string') {
        assert.equal(/miyoshi|みよし|三好/i.test(node), false, mode + ' ' + at);
      }
    });
    const floors = new Set();
    walk(pack, (node, at) => { if (/\.floor$/.test(at)) floors.add(node); });
    if (floors.size) {
      assert.notDeepEqual([...floors].sort(), realFloors, mode + ': 階構成が実案件と同じ');
    }
  });
});

test('P2L-B1-19: design value と evidence を混ぜない（validator は突き合わせない）', () => {
  // record の値が設計値と食い違っていても validator は受け入れる。突き合わせは
  // 後続 stage の Evidence engine の責務で、ここで黙って片方を選ばない。
  const pack = syntheticPack('case_direct');
  pack.evidence.records[0].quantity.value = 990;   // 設計値 987 と違う
  const out = Pack.validateProjectPack(pack);
  assert.equal(out.panes.find((p) => p.paneId === 'P001').widthMm.value, 987, '設計値が record に書き換えられた');
  assert.equal(out.evidence.records[0].quantity.value, 990);
  assert.equal(out.trust, 'pack_unreviewed');
  // 逆に、設計値と record が一致していても何も昇格しない（自己複写の限界は Human Review）
  const copy = Pack.validateProjectPack(syntheticPack('case_direct'));
  assert.equal(copy.trust, 'pack_unreviewed');
  assert.match(PACK_SRC, /Human Review の限界/);
});

test('P2L-B1-20: 公開面の advisory は捨てずに返し、hard rule は拒否する', () => {
  const adv = syntheticPack('case_direct');
  adv.projectMetadata.publicLabel = 'Sample www.example.com';
  const out = Pack.validateProjectPack(adv);
  assert.equal(out.publicationAdvisories.some((a) => a.path === 'pack.projectMetadata.publicLabel'), true,
    JSON.stringify(out.publicationAdvisories));
  const hard = syntheticPack('case_direct');
  hard.projectMetadata.publicLabel = 'see https://example.invalid/x';
  rejects(hard, /publicLabel/);
  const desc = syntheticPack('case_direct');
  desc.evidence.sourceScopes[0].evidence.publicDescription = 'C:\\private\\source.pdf';
  rejects(desc, /makeEvidence/);
});

test('P2L-B1-21: runtime へは配線しない（既存 format も置き換えない）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(html.includes('project-pack.js'), false, 'index.html が Project Pack を読み込んでいる');
  assert.equal(html.includes('ProjectPack'), false);
  ['project-config/registry.js', 'project-config/evidence-closure.js', 'project-config/project-input.js',
    'workspace.js', 'project-profile.js', 'review-package.js', 'tools/verification/project-state-probe.mjs']
    .forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.equal(/project-pack|ProjectPack/.test(src), false, f + ' が Project Pack に依存している');
    });
  // Project Input Package の契約は別のまま（版を動かさず、互いの形を受け入れない）
  const ProjectInput = require('../project-config/project-input.js');
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
  assert.deepEqual(Array.from(ProjectInput.SUPPORTED_SCHEMA_VERSIONS), [1, 2]);
  assert.throws(() => ProjectInput.deserialize(JSON.stringify(syntheticPack('case_direct'))));
  rejects({ schemaVersion: 1, projectId: 'synthetic', label: 'Synthetic' }, /Project Pack/);
});
