'use strict';

/**
 * Phase 2H: Runtime Project Profile / Scenario Matrix のテスト。
 *
 * 重点は3つ。
 *   1. Profile layerが数値を変えないこと（direct pathとbit-equivalent）
 *   2. 推測が一切入らないこと（Z / zone / basis を黙って埋めない、floor→Z無し）
 *   3. Profileがtrusted stateにならないこと
 *
 * §28: fixtureは synthetic な名前のみ（実案件名を書かない）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Profile = require('../project-profile.js');
const ProjectInput = require('../project-config/project-input.js');
const Workspace = require('../workspace.js');
const GlassCalc = require('../calc.js');

const PROFILE_SRC = path.join(__dirname, '..', 'project-profile.js');

const WIND_DEFAULTS = {
  V0: 34, roughnessCategory: 'III', buildingHeightM: 14.2,
  eavesHeightM: 14.2, buildingType: 'closed', basis: 'notification_baseline'
};
const makeProfile = (overrides) =>
  Profile.createProfile({ label: 'Profile A', windDefaults: Object.assign({}, WIND_DEFAULTS, overrides || {}) });
const makeScenario = (overrides) =>
  Profile.createScenario(Object.assign({
    widthMm: 1250, heightMm: 2050, evaluationHeightM: 14.2,
    zone: 'general', glassType: 'fl_single'
  }, overrides || {}));

/* ============================================================
   AC-04 / AC-05  Profile contract
============================================================ */

test('AC-04: Runtime Profileの検証状況は user_input_unverified のみ', () => {
  const profile = makeProfile();
  assert.equal(profile.verificationStatus, 'user_input_unverified');
  assert.equal(profile.profileType, 'runtime_wind_profile');
  assert.equal(profile.schemaVersion, 1);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.windDefaults), true);

  // 入力から検証状況を持ち込めない
  for (const field of Profile.PROFILE_TRUST_FIELDS) {
    assert.throws(() => Profile.createProfile({
      windDefaults: Object.assign({}, WIND_DEFAULTS, { [field]: 'verified' })
    }), /must not carry/, field + ' は拒否されるべき');
  }
});

test('AC-05: evaluationHeightM / zone はProfileに入る場所が無い', () => {
  // 「入れてはいけない」ではなく「入れる場所が無い」構造であること
  assert.equal(Profile.PROFILE_WIND_FIELDS.includes('evaluationHeightM'), false);
  assert.equal(Profile.PROFILE_WIND_FIELDS.includes('zone'), false);

  for (const field of ['evaluationHeightM', 'zone']) {
    assert.throws(() => Profile.createProfile({
      windDefaults: Object.assign({}, WIND_DEFAULTS, { [field]: field === 'zone' ? 'general' : 14.2 })
    }), /varies per pane\/location/, field);
  }

  // ProjectInput.WIND_INPUT_KEYS との関係を固定する
  const perScenario = ProjectInput.WIND_INPUT_KEYS
    .filter((k) => !Profile.PROFILE_WIND_FIELDS.includes(k));
  assert.deepEqual(perScenario.sort(), ['evaluationHeightM', 'zone']);
});

test('AC-06 / §10: floor から Z を導く経路が存在しない', () => {
  const src = fs.readFileSync(PROFILE_SRC, 'utf8');
  // 階→高さの対応表を持たない
  for (const token of ['floorHeight', 'FLOOR_TO_Z', 'floorToZ', 'storeyHeight', '階高']) {
    assert.equal(src.includes(token), false, 'floor mapping を持たない: ' + token);
  }
  // labelに 2F と書いてもZは独立入力
  const scenario = makeScenario({ label: '2F north', evaluationHeightM: 8.4 });
  assert.equal(scenario.evaluationHeightM, 8.4);
  assert.throws(() => Profile.createScenario({
    label: '2F north', widthMm: 1250, heightMm: 2050, zone: 'general', glassType: 'fl_single'
  }), /evaluationHeightM is required/);

  // TSVでも floor 系の列を受け付けない
  for (const column of ['floor', 'storey', 'level']) {
    assert.throws(() => Profile.parseScenarioTsv(
      ['width_mm\theight_mm\tevaluation_height_m\tzone\tglass_type\t' + column,
       '1250\t2050\t4.2\tgeneral\tfl_single\t2F'].join('\n')),
      /never derived from a floor label/, column);
  }
});

/* ============================================================
   §12 no hidden default
============================================================ */

test('§12: 欠けた値を黙って埋めない（fail closed）', () => {
  for (const field of Profile.PROFILE_WIND_REQUIRED) {
    const partial = Object.assign({}, WIND_DEFAULTS);
    delete partial[field];
    assert.throws(() => Profile.createProfile({ windDefaults: partial }),
      new RegExp(field + ' is required'), field);
  }
  for (const field of Profile.SCENARIO_REQUIRED) {
    const partial = {
      widthMm: 1250, heightMm: 2050, evaluationHeightM: 14.2,
      zone: 'general', glassType: 'fl_single'
    };
    delete partial[field];
    assert.throws(() => Profile.createScenario(partial),
      new RegExp(field + ' is required'), field);
  }
  // basis は特に既定値を持たない（業界推奨値が法定最低値として通らないように）
  assert.throws(() => Profile.createProfile({
    windDefaults: { V0: 34, roughnessCategory: 'III', buildingHeightM: 14.2,
                    eavesHeightM: 14.2, buildingType: 'closed' }
  }), /basis is required \(no default is assumed\)/);

  // resolver側でも、Z/zone を建物高さや general で代用しない。
  // canonical gate が「Profileから継承しない」と明示して落とす。
  const profile = makeProfile();
  assert.throws(() => Profile.resolveEffectiveWindInput(profile,
    { scenarioId: null, label: null, widthMm: 1250, heightMm: 2050,
      zone: 'general', glassType: 'fl_single', extraFactor: 1.0 }),
    /evaluationHeightM; it is never inherited from the profile/);
  assert.throws(() => Profile.resolveEffectiveWindInput(profile,
    { scenarioId: null, label: null, widthMm: 1250, heightMm: 2050,
      evaluationHeightM: 14.2, glassType: 'fl_single', extraFactor: 1.0 }),
    /zone; it is never inherited from the profile/);
});

/* ============================================================
   AC-07 / AC-08  resolver と direct path 等価性（§32）
============================================================ */

test('AC-07: resolverは Profile + Scenario を1つのWindInputへ展開する', () => {
  const windInput = Profile.resolveEffectiveWindInput(makeProfile(), makeScenario());
  assert.deepEqual(windInput, {
    V0: 34, roughnessCategory: 'III', buildingHeightM: 14.2, eavesHeightM: 14.2,
    buildingType: 'closed', basis: 'notification_baseline',
    evaluationHeightM: 14.2, zone: 'general'
  });
  // 既存のwind input契約に無いfieldを足していない
  for (const key of Object.keys(windInput)) {
    assert.ok(ProjectInput.WIND_INPUT_KEYS.includes(key), key + ' は既存契約のfield');
  }
});

test('AC-08 / §32: Profile経由のPIPが direct path と bit-equivalent', () => {
  const viaProfile = Profile.scenarioToProjectInput(makeProfile(), makeScenario());
  const direct = ProjectInput.fromWindCalculation({
    widthMm: 1250, heightMm: 2050, glassType: 'fl_single', extraFactor: 1.0,
    windInput: {
      V0: 34, roughnessCategory: 'III', buildingHeightM: 14.2, eavesHeightM: 14.2,
      evaluationHeightM: 14.2, buildingType: 'closed', basis: 'notification_baseline',
      zone: 'general'
    }
  });
  assert.deepEqual(viaProfile, direct, 'Profile layerは数値を変えない');
  assert.equal(JSON.stringify(viaProfile), JSON.stringify(direct));
  assert.equal(viaProfile.designPressure, direct.designPressure);

  // trace も同じ
  assert.deepEqual(ProjectInput.windTraceFor(viaProfile), ProjectInput.windTraceFor(direct));
});

test('AC-15: 生成されたcaseは notification_calculation / unverified', () => {
  const pkg = Profile.scenarioToProjectInput(makeProfile(), makeScenario());
  assert.equal(pkg.sourceKind, 'notification_calculation');
  assert.equal(pkg.provenance.verificationStatus, 'unverified');
  assert.equal(pkg.schemaVersion, 2);
  assert.notEqual(pkg.sourceKind, 'registered_preset');
});

test('§33: 1 Profile / 2 Scenario — 風条件は同じ、pane寸法だけ違う', () => {
  const profile = makeProfile();
  const a = Profile.scenarioToProjectInput(profile, makeScenario({ widthMm: 1250 }));
  const b = Profile.scenarioToProjectInput(profile, makeScenario({ widthMm: 1500 }));

  assert.deepEqual(a.windInput, b.windInput, '風条件は同一');
  assert.equal(a.designPressure, b.designPressure, '同じ風条件なら設計風圧も同じ');
  assert.notEqual(a.widthMm, b.widthMm);

  // Phase 2G known behavior: 面積が違えば推奨構成が変わりうる
  const best = (pkg) => {
    const area = GlassCalc.paneAreaM2(pkg.widthMm, pkg.heightMm);
    const split = GlassCalc.splitCandidates(
      GlassCalc.generateCandidates(pkg.glassType, area, pkg.designPressure, pkg.extraFactor));
    return split.okCandidates.length ? split.okCandidates[0].label : null;
  };
  assert.ok(best(a));
  assert.ok(best(b));
});

/* ============================================================
   AC-09 / §14 / §34  snapshot semantics
============================================================ */

test('AC-09 / §34: Profileを変更しても既存Workspace caseは変わらない', () => {
  const ws = Workspace.createWorkspace();
  const profileV34 = makeProfile({ V0: 34 });
  const addedA = Profile.addScenariosToWorkspace(ws, profileV34, [makeScenario({ label: 'Case A' })]);
  assert.deepEqual(addedA.errors, []);

  const beforeA = ws.getCase(addedA.added[0]).inputPackage;
  assert.equal(beforeA.windInput.V0, 34);
  const beforeDesignP = beforeA.designPressure;

  // Profileを差し替える（Profileはfrozenなので新しいobjectになる）
  const profileV36 = makeProfile({ V0: 36 });
  const addedB = Profile.addScenariosToWorkspace(ws, profileV36, [makeScenario({ label: 'Case B' })]);

  const afterA = ws.getCase(addedA.added[0]).inputPackage;
  assert.equal(afterA.windInput.V0, 34, '既存caseは V0 34 のまま');
  assert.equal(afterA.designPressure, beforeDesignP, '設計風圧も変わらない');

  const caseB = ws.getCase(addedB.added[0]).inputPackage;
  assert.equal(caseB.windInput.V0, 36, '新しいcaseは変更後のProfileを使う');
  assert.notEqual(caseB.designPressure, beforeDesignP);

  // 評価し直しても同じ（自動同期していない）
  const results = Workspace.evaluateWorkspace(ws);
  assert.equal(results[0].designPressure, beforeDesignP);
  assert.notEqual(results[1].designPressure, beforeDesignP);
});

test('AC-16 / §27: Workspace JSON だけで再計算できる（Profileに依存しない）', () => {
  const ws = Workspace.createWorkspace();
  Profile.addScenariosToWorkspace(ws, makeProfile(), [makeScenario({ label: 'Case A' })]);
  const before = Workspace.evaluateWorkspace(ws);

  const json = Workspace.serializeWorkspace(ws);
  assert.equal(json.includes('runtime_wind_profile'), false, 'Profileへの参照を持たない');
  assert.equal(json.includes('profileType'), false);

  // Profileを一切使わずに読み込んで評価する
  const imported = Workspace.deserializeWorkspace(json);
  assert.deepEqual(imported.errors, []);
  const after = Workspace.evaluateWorkspace(imported.workspace);

  assert.equal(after[0].designPressure, before[0].designPressure);
  assert.equal(after[0].areaM2, before[0].areaM2);
  assert.equal(after[0].allowablePressure, before[0].allowablePressure);
  assert.equal(after[0].recommendedLabel, before[0].recommendedLabel);
  // 外部importなので trust は降格する（Phase 2G boundary）
  assert.equal(after[0].sourceKind, 'imported_unverified');
});

/* ============================================================
   AC-03 / AC-17  Profile Package v1
============================================================ */

test('AC-03: Profile Package v1 は入力だけを持つ', () => {
  const json = Profile.serializeProfile(makeProfile());
  const parsed = JSON.parse(json);
  assert.deepEqual(Object.keys(parsed), ['schemaVersion', 'profileType', 'label', 'windDefaults']);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.profileType, 'runtime_wind_profile');

  for (const forbidden of ['verificationStatus', 'evidence', 'sourceReference', 'designPressure',
                           'trace', 'recommendedGlass', 'presetId', 'verifiedCases']) {
    assert.equal(json.includes(forbidden), false, 'Profile Package に ' + forbidden + ' を書かない');
  }
  // round trip
  const back = Profile.deserializeProfile(json);
  assert.deepEqual(back.windDefaults, makeProfile().windDefaults);
  assert.equal(back.verificationStatus, 'user_input_unverified');
});

test('AC-17: 外部Profile JSON は trust を主張できない', () => {
  const base = {
    schemaVersion: 1, profileType: 'runtime_wind_profile', label: 'Sample Profile',
    windDefaults: Object.assign({}, WIND_DEFAULTS)
  };
  const spoofs = {
    verified: true, verificationStatus: 'verified', sourceKind: 'registered_preset',
    evidence: { level: 'primary' }, sourceReference: { kind: 'public_primary', url: 'https://x.jp' },
    privateReferenceAvailable: true, presetId: 'miyoshi'
  };
  for (const [field, value] of Object.entries(spoofs)) {
    const payload = JSON.parse(JSON.stringify(base));
    payload.windDefaults[field] = value;
    assert.throws(() => Profile.deserializeProfile(JSON.stringify(payload)),
      /must not carry|unexpected field/, field);
  }
  // 通った場合でも status は固定
  assert.equal(Profile.deserializeProfile(JSON.stringify(base)).verificationStatus,
    'user_input_unverified');

  // whole-file fail closed
  assert.throws(() => Profile.deserializeProfile('{bad'), /not valid JSON/);
  assert.throws(() => Profile.deserializeProfile(JSON.stringify(
    Object.assign({}, base, { profileType: 'registered_preset' }))), /unsupported profileType/);
  assert.throws(() => Profile.deserializeProfile(JSON.stringify(
    Object.assign({}, base, { schemaVersion: 2 }))), /unsupported profile schemaVersion/);
  assert.throws(() => Profile.deserializeProfile(
    '{"schemaVersion":1,"profileType":"runtime_wind_profile","windDefaults":{},"extra":1}'),
    /unexpected field/);
  assert.throws(() => Profile.deserializeProfile('{"schemaVersion":1,"profileType":"runtime_wind_profile","label":"'
    + 'x'.repeat(Profile.MAX_PROFILE_BYTES) + '","windDefaults":{}}'), /too large/);
});

test('AC-19: Profile import で prototype pollution が起きない', () => {
  const payloads = [
    '{"schemaVersion":1,"profileType":"runtime_wind_profile","windDefaults":{"__proto__":{"polluted2h":true}}}',
    '{"schemaVersion":1,"profileType":"runtime_wind_profile","windDefaults":{"constructor":{"prototype":{"polluted2h":true}}}}'
  ];
  for (const payload of payloads) {
    try { Profile.deserializeProfile(payload); } catch (e) { /* fail closed も可 */ }
    assert.equal({}.polluted2h, undefined);
    assert.equal(Object.prototype.polluted2h, undefined);
  }
});

/* ============================================================
   AC-10 / AC-11 / AC-12 / AC-13  Scenario Matrix
============================================================ */

test('AC-11 / AC-18: Scenario TSV は風条件・trust列を受け付けない', () => {
  const header = 'width_mm\theight_mm\tevaluation_height_m\tzone\tglass_type';
  for (const column of ['v0', 'roughness', 'basis', 'building_height_m', 'eaves_height_m',
                        'building_type', 'recurrence_years']) {
    assert.throws(() => Profile.parseScenarioTsv(
      [header + '\t' + column, '1250\t2050\t4.2\tgeneral\tfl_single\tX'].join('\n')),
      /common wind conditions belong to the profile/, column);
  }
  for (const column of ['source_kind', 'verified', 'evidence', 'design_pressure', 'recommended_glass']) {
    assert.throws(() => Profile.parseScenarioTsv(
      [header + '\t' + column, '1250\t2050\t4.2\tgeneral\tfl_single\tX'].join('\n')),
      /must not carry/, column);
  }
  assert.throws(() => Profile.parseScenarioTsv(
    [header + '\thaxx', '1250\t2050\t4.2\tgeneral\tfl_single\tX'].join('\n')), /unknown column/);
});

test('AC-11: Scenario TSV は物理行番号を保ち、行単位で隔離する', () => {
  const parsed = Profile.parseScenarioTsv([
    'scenario_id\tlabel\twidth_mm\theight_mm\tevaluation_height_m\tzone\tglass_type',
    'S1\tCase A\t1250\t2050\t4.2\tgeneral\tfl_single',
    '',
    'S2\tCase B\t1250\t2050\tNOT-A-NUMBER\tgeneral\tfl_single',
    'S3\tCase C\t1500\t2050\t8.4\tcorner\tfl_single'
  ].join('\n'));

  assert.equal(parsed.rows.length, 2, '正常な行だけ通す');
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].lineNumber, 4, '空行があっても物理行番号はずれない');
  assert.equal(parsed.errors[0].caseId, 'S2');
  assert.equal(parsed.rows[0].scenario.scenarioId, 'S1');
  assert.equal(parsed.rows[1].scenario.zone, 'corner');
  // 生の行を診断に残さない
  assert.equal(JSON.stringify(parsed.errors).includes('\t'), false);
});

test('AC-12 / §35: generator は 2×1×3×2 = 12 を deterministic に作る', () => {
  const lists = {
    widths: [1250, 1500], heights: [2050],
    evaluationHeights: [4.2, 8.4, 12.6], zones: ['general', 'corner'],
    glassTypes: ['fl_single']
  };
  assert.equal(Profile.countScenarioMatrix(lists), 12);
  const first = Profile.generateScenarioMatrix(lists);
  assert.equal(first.length, 12);
  assert.deepEqual(
    JSON.parse(JSON.stringify(Profile.generateScenarioMatrix(lists))),
    JSON.parse(JSON.stringify(first)), '同じinputから同じ順序');

  // 展開順が width → height → Z → zone であること
  assert.equal(first[0].widthMm, 1250);
  assert.equal(first[0].evaluationHeightM, 4.2);
  assert.equal(first[0].zone, 'general');
  assert.equal(first[1].zone, 'corner');
  assert.equal(first[6].widthMm, 1500);

  // 空の軸は「値なし」なので fail closed（勝手に1つ選ばない）
  for (const axis of ['widths', 'heights', 'evaluationHeights', 'zones', 'glassTypes']) {
    const broken = Object.assign({}, lists, { [axis]: [] });
    assert.throws(() => Profile.generateScenarioMatrix(broken), /non-empty list/, axis);
  }
});

test('AC-13 / §20: generator cap は既存Workspace件数を含めて判定する', () => {
  const big = {
    widths: Array.from({ length: 1001 }, (_, i) => 1000 + i), heights: [2050],
    evaluationHeights: [4.2], zones: ['general'], glassTypes: ['fl_single']
  };
  assert.throws(() => Profile.generateScenarioMatrix(big), /exceeds the limit/);

  const small = {
    widths: [1250], heights: [2050], evaluationHeights: [4.2],
    zones: ['general'], glassTypes: ['fl_single']
  };
  assert.doesNotThrow(() => Profile.generateScenarioMatrix(small));
  assert.throws(() => Profile.generateScenarioMatrix(small,
    { existingCaseCount: Workspace.MAX_CASES }), /exceeds the limit/,
    '生成だけで上限内でも、既存件数と合計すれば超える');
  assert.equal(Profile.MAX_SCENARIOS, Workspace.MAX_CASES, 'Workspace上限と揃える');
});

test('AC-10 / §21: Scenario Matrix は Workspace とは別のIDを持つ', () => {
  const matrix = Profile.createScenarioMatrix();
  const a = matrix.add(makeScenario({ label: 'Case A' }));
  const b = matrix.duplicate(a);
  assert.notEqual(a, b);
  assert.equal(matrix.size(), 2);
  assert.equal(matrix.get(b).label, 'Case A (copy)');
  assert.match(a, /^sc-\d{3}$/, 'scenarioId は Workspace caseId と別系統');

  assert.equal(matrix.remove(a), true);
  assert.equal(matrix.remove(a), false);
  assert.equal(matrix.clear(), 1);
  assert.equal(matrix.size(), 0);

  // 明示IDの重複は拒否
  const m2 = Profile.createScenarioMatrix();
  m2.add(makeScenario({ scenarioId: 'S1' }));
  assert.throws(() => m2.add(makeScenario({ scenarioId: 'S1' })), /duplicate scenarioId/);
});

/* ============================================================
   AC-14  Scenario → Workspace
============================================================ */

test('AC-14: Scenario → Workspace は既存 addCase を通り、行単位で隔離する', () => {
  const ws = Workspace.createWorkspace();
  const profile = makeProfile();
  const scenarios = [
    makeScenario({ label: 'Case A' }),
    { widthMm: 1500, heightMm: 2050, glassType: 'fl_single', extraFactor: 1.0, zone: 'general' },
    makeScenario({ label: 'Case C', widthMm: 1500 })
  ];
  const outcome = Profile.addScenariosToWorkspace(ws, profile, scenarios);

  assert.equal(outcome.added.length, 2, '壊れた1件が他を止めない');
  assert.equal(outcome.errors.length, 1);
  assert.equal(outcome.errors[0].index, 1);
  assert.match(outcome.errors[0].reason, /never inherited from the profile|is missing/);
  assert.equal(ws.size(), 2);

  const results = Workspace.evaluateWorkspace(ws);
  assert.deepEqual([...new Set(results.map((r) => r.sourceKind))], ['notification_calculation']);
  assert.deepEqual([...new Set(results.map((r) => r.status))], ['OK']);
});

/* ============================================================
   §13 effective input trace
============================================================ */

test('§13: effective input trace が「どこから来た値か」と最終値を両方出す', () => {
  const described = Profile.describeEffectiveInput(makeProfile(), makeScenario({ scenarioId: 'S1', label: 'Case A' }));

  assert.equal(described.profileStatus, 'user_input_unverified');
  const profileFields = described.fromProfile.map((e) => e.field).sort();
  const scenarioFields = described.fromScenario.map((e) => e.field).sort();

  assert.deepEqual(profileFields,
    ['V0', 'basis', 'buildingHeightM', 'buildingType', 'eavesHeightM', 'roughnessCategory'].sort());
  assert.ok(scenarioFields.includes('evaluationHeightM'));
  assert.ok(scenarioFields.includes('zone'));
  assert.equal(profileFields.includes('evaluationHeightM'), false, 'Zは決してProfile側に出ない');
  assert.equal(profileFields.includes('zone'), false);

  // 最終的なeffective値をそのまま持つ（「継承」とだけ書いて隠さない）
  assert.deepEqual(described.effectiveWindInput,
    Profile.resolveEffectiveWindInput(makeProfile(), makeScenario()));
  assert.equal(described.fromProfile.find((e) => e.field === 'V0').value, 34);
  assert.equal(described.fromScenario.find((e) => e.field === 'evaluationHeightM').value, 14.2);
});

/* ============================================================
   AC-02 / AC-22 / AC-24  非退行と境界
============================================================ */

test('AC-02: project-profile.js は計算式を持たず、既存経路だけを呼ぶ', () => {
  const src = fs.readFileSync(PROFILE_SRC, 'utf8');
  for (const ident of ['k1', 'k2', 'Er', 'qBar', 'Cpe', 'Gpe']) {
    assert.doesNotMatch(src, new RegExp('\\b' + ident + '\\b'), ident);
  }
  for (const fragment of ['Math.pow', '0.6 *', '1.7 *', '/ 1000000']) {
    assert.equal(src.includes(fragment), false, fragment);
  }
  assert.match(src, /ProjectInput\.fromWindCalculation\(/);
  assert.doesNotMatch(src, /require\((['"]).*wind-pressure/);
  assert.doesNotMatch(src, /WindPressure\./);
  // 案件固有値を持たない
  for (const value of ['1297', '1525', '1695', '1729', '918', '1122', '1250', '2050']) {
    assert.doesNotMatch(src, new RegExp('\\b' + value + '\\b'), value);
  }
  for (const token of ['Miyoshi', 'MIYOSHI', 'みよし']) {
    assert.equal(src.includes(token), false);
  }
});

test('AC-22: project-profile.js は永続化しない', () => {
  const raw = fs.readFileSync(PROFILE_SRC, 'utf8');
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'cookie',
                     'XMLHttpRequest', 'sendBeacon', 'WebSocket']) {
    assert.doesNotMatch(code, new RegExp('\\b' + api + '\\b'), api);
  }
  assert.doesNotMatch(code, /\bfetch\s*\(/);
});

test('AC-24: Evidence / verifiedCases / preset は変わらない', () => {
  const MiyoshiProjectConfig = require('../project-config/miyoshi.js');
  // Profileを何度作っても、exportしても、Evidenceは増えない
  const profile = makeProfile();
  Profile.serializeProfile(profile);
  for (let i = 0; i < 50; i++) Profile.scenarioToProjectInput(profile, makeScenario());

  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.deepEqual(MiyoshiProjectConfig.validateAllEvidence(), []);
  assert.deepEqual(['1', '2', '3', 'R'].map((f) => MiyoshiProjectConfig.getPositivePressure(f)),
    [1297, 1525, 1695, 1729]);
});

test('§29: Profile を何度使っても registered preset にならない', () => {
  const profile = makeProfile();
  const json = Profile.serializeProfile(profile);
  const back = Profile.deserializeProfile(json);
  assert.equal(back.verificationStatus, 'user_input_unverified');
  assert.equal(back.profileType, 'runtime_wind_profile');
  assert.notEqual(back.profileType, 'registered_preset');

  const ws = Workspace.createWorkspace();
  for (let i = 0; i < 20; i++) {
    Profile.addScenariosToWorkspace(ws, back, [makeScenario({ widthMm: 1250 + i })]);
  }
  const kinds = [...new Set(Workspace.evaluateWorkspace(ws).map((r) => r.sourceKind))];
  assert.deepEqual(kinds, ['notification_calculation']);
  assert.equal(kinds.includes('registered_preset'), false);
});

test('§28: fixtureで実際に使うlabelはsyntheticなものだけ', () => {
  // ソーステキストを grep すると、禁止語を書いたassert自身に当たる
  // （Phase 2Gで同じ罠を踏んだ）。ここでは**実際に生成される値**を見る。
  const SYNTHETIC = ['Profile A', 'Sample Profile', 'Case A', 'Case B', 'Case C',
                     'Case A (copy)', '2F north', null];

  assert.ok(SYNTHETIC.includes(makeProfile().label));
  assert.ok(SYNTHETIC.includes(makeScenario({ label: 'Case A' }).label));

  const matrix = Profile.createScenarioMatrix();
  const id = matrix.add(makeScenario({ label: 'Case A' }));
  assert.ok(SYNTHETIC.includes(matrix.get(matrix.duplicate(id)).label));

  // generatorが作るscenarioはlabelを持たない（案件名が紛れ込む場所が無い）
  const generated = Profile.generateScenarioMatrix({
    widths: [1250], heights: [2050], evaluationHeights: [4.2],
    zones: ['general'], glassTypes: ['fl_single']
  });
  assert.equal(generated[0].label, null);
  assert.equal(generated[0].scenarioId, null);
});

/* ============================================================
   UI契約（index.html をソースとして固定する）
   実挙動はPlaywrightで別途確認する。
============================================================ */

const INDEX_HTML = path.join(__dirname, '..', 'index.html');
const html = () => fs.readFileSync(INDEX_HTML, 'utf8');

function profileScript() {
  const src = html();
  const marker = src.indexOf('Phase 2H: Runtime Project Profile / Scenario Matrix');
  assert.notEqual(marker, -1, 'Phase 2H UIブロックが見つかるはず');
  const start = src.lastIndexOf('/*', marker);
  return src.slice(start, src.indexOf('</script>', start));
}
function profileCodeOnly() {
  return profileScript()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

test('AC-31: Profile cardが runtime / unverified であることを画面に出す', () => {
  const src = html();
  assert.match(src, /Runtime Project Profile/);
  assert.match(src, /Unverified User Input/);
  // 「式が検証済み」と「値が検証済み」の区別を明示する
  assert.match(src, /登録済み案件プリセット.*ではありません|これは「登録済み案件プリセット」ではありません/);
  assert.match(src, /算定<strong>式<\/strong>[\s\S]{0,120}<strong>値<\/strong>/);
});

test('AC-05: Profile編集UIに Z / zone の入力欄が無い', () => {
  const src = html();
  const card = src.slice(src.indexOf('案件プロファイル（風条件の共通値）'),
                         src.indexOf('検討ケース（Scenario Matrix）'));
  // profileフォームのidだけを見る
  for (const id of ['prof-z', 'prof-evaluation', 'prof-zone']) {
    assert.equal(card.includes('id="' + id + '"'), false, 'Profileに ' + id + ' を置かない');
  }
  // Scenario側にはある
  assert.match(src, /id="sc-z"/);
  assert.match(src, /id="sc-zone"/);
  // なぜ置かないかを画面でも説明している
  assert.match(card, /ここには入りません/);
});

test('AC-02: Phase 2H UIは計算を持たず、既存モジュール経由でのみ動く', () => {
  const script = profileScript();
  for (const api of ['createProfile', 'serializeProfile', 'deserializeProfile',
                     'createScenario', 'describeEffectiveInput', 'generateScenarioMatrix',
                     'countScenarioMatrix', 'createScenarioMatrix', 'parseScenarioTsv',
                     'addScenariosToWorkspace']) {
    assert.ok(script.includes('ProjectProfile.' + api), 'ProjectProfile.' + api);
  }
  assert.doesNotMatch(script, /GlassCalc\.generateCandidates/);
  assert.doesNotMatch(script, /WindPressure\./);
  assert.doesNotMatch(script, /ProjectInput\.fromWindCalculation/,
    'UIから直接PIPを組み立てない（resolver経由）');
  // ガラス種別一覧をUI側に持たない
  assert.match(script, /GlassCalc\.GLASS_TYPES/);
  assert.equal(script.includes("'fl_single'"), false, 'ガラス種別をUIへhard-codeしない');
});

test('AC-20: Phase 2H UIは innerHTML を使わない', () => {
  const script = profileScript();
  assert.doesNotMatch(script, /\.innerHTML/);
  assert.doesNotMatch(script, /insertAdjacentHTML/);
  assert.doesNotMatch(script, /document\.write/);
  assert.match(script, /td\.textContent/);
  assert.doesNotMatch(script, /onclick\s*=\s*['"`][^'"`]*\+/);
  assert.match(script, /addEventListener\('click'/);
});

test('AC-22: Phase 2H UIは永続化しない', () => {
  const code = profileCodeOnly();
  for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'cookie',
                     'XMLHttpRequest', 'sendBeacon', 'WebSocket']) {
    assert.doesNotMatch(code, new RegExp('\\b' + api + '\\b'), api);
  }
  assert.doesNotMatch(code, /\bfetch\s*\(/);
  assert.match(profileScript(), /memory-only/);
});

test('AC-09 / §24: Profile変更が既存Workspaceへ自動同期しないことをUIが明示する', () => {
  const script = profileScript();
  // 自動で作り直さない
  assert.doesNotMatch(script, /batchWorkspace\.clear\(\)[\s\S]{0,200}addScenariosToWorkspace/);
  assert.match(script, /profileChangedSinceLastAdd/);
  assert.match(script, /反映されていません/);
  // 追加時点でsnapshotされる旨を出す
  assert.match(script, /固定されます/);
});

test('§20: 生成前に件数を表示し、既存件数を含めて判定する', () => {
  const script = profileScript();
  assert.match(script, /countScenarioMatrix/);
  assert.match(script, /existingCaseCount:\s*existing/);
  assert.match(script, /scenarioMatrix\.size\(\)\s*\+\s*\(batchWorkspace \? batchWorkspace\.size\(\) : 0\)/);
});

test('UI: Phase 2H のボタンは一意なidを持つ（ラベル文字列に依存しない）', () => {
  // 「⬆ Import」はPhase 2Dのボタンとラベルが同じで、text selectorでは区別できない。
  // 実機確認でこれに当たったので、idで特定できる形にしてある。
  const src = html();
  for (const id of ['btn-profile-apply', 'btn-profile-export', 'btn-profile-import',
                    'btn-scenario-add', 'btn-scenario-preview', 'btn-matrix-generate',
                    'btn-scenario-tsv-import', 'btn-scenario-tsv-template',
                    'btn-scenario-to-workspace', 'btn-scenario-clear']) {
    assert.equal(src.split('id="' + id + '"').length - 1, 1, id + ' は一意');
  }
});

test('project-profile.js は project-input.js / workspace.js の後に読み込む', () => {
  const src = html();
  const order = ['project-config/project-input.js', 'workspace.js', 'project-profile.js']
    .map((f) => src.indexOf('<script src="' + f + '"></script>'));
  assert.ok(order.every((i) => i !== -1));
  assert.ok(order[0] < order[2] && order[1] < order[2]);
});

/* ============================================================
   Required Fix A — Matrix hard cap は絶対（§2）
============================================================ */

const CAP_LISTS = (n) => ({
  widths: Array.from({ length: n }, (_, i) => 1000 + i),
  heights: [2050], evaluationHeights: [4.2], zones: ['general'], glassTypes: ['fl_single']
});

test('RF-A: 呼び出し側は上限を広げられない', () => {
  // 以前は options.maxTotal が cap をそのまま置き換えていたため、
  // maxTotal: 2000 を渡すだけで Phase 2H の上限を超えられた。
  assert.throws(() => Profile.generateScenarioMatrix(CAP_LISTS(1400), { maxTotal: 2000 }),
    /exceeds the limit|capped at/);
  assert.throws(() => Profile.generateScenarioMatrix(CAP_LISTS(1001), { maxTotal: 99999 }),
    /exceeds the limit|capped at/);

  // 狭める方向には効く
  assert.throws(() => Profile.generateScenarioMatrix(CAP_LISTS(3), { maxTotal: 2 }),
    /exceeds the limit/);
  assert.equal(Profile.generateScenarioMatrix(CAP_LISTS(2), { maxTotal: 2 }).length, 2);
});

test('RF-A: 1000は通り、1001は拒否する', () => {
  assert.equal(Profile.generateScenarioMatrix(CAP_LISTS(1000)).length, 1000);
  assert.throws(() => Profile.generateScenarioMatrix(CAP_LISTS(1001)), /exceeds the limit|capped at/);
  // 既存件数と合計で超える場合も拒否
  assert.throws(() => Profile.generateScenarioMatrix(CAP_LISTS(1000), { existingCaseCount: 1 }),
    /exceeds the limit|capped at/);
  assert.equal(Profile.generateScenarioMatrix(CAP_LISTS(999), { existingCaseCount: 1 }).length, 999);
});

test('RF-A: existingCaseCount を黙って丸めない', () => {
  const small = CAP_LISTS(1);
  for (const [value, pattern] of [
    [-1, /must not be negative/],
    [-500, /must not be negative/],
    [NaN, /must be a finite number/],
    [Infinity, /must be a finite number/],
    [-Infinity, /must be a finite number/],
    [1.5, /must be an integer/],
    [Profile.MAX_SCENARIOS + 1, /must not exceed/],
    ['10', /must be a finite number/]
  ]) {
    assert.throws(() => Profile.generateScenarioMatrix(small, { existingCaseCount: value }),
      pattern, String(value));
  }
  // 負値で上限を水増しできない（-500 + 1400 <= 1000 という算術を通さない）
  assert.throws(() => Profile.generateScenarioMatrix(CAP_LISTS(1400), { existingCaseCount: -500 }),
    /must not be negative/);

  assert.equal(Profile.generateScenarioMatrix(small, { existingCaseCount: 0 }).length, 1);
  assert.equal(Profile.generateScenarioMatrix(small, {}).length, 1);
});

/* ============================================================
   Required Fix B — TSV row isolation は格納段階まで続く（§3）
============================================================ */

const SCENARIO_TSV_HEADER =
  'scenario_id\tlabel\twidth_mm\theight_mm\tevaluation_height_m\tzone\tglass_type';

test('RF-B: 既存IDと重複しても、後続の正常な行は取り込まれる', () => {
  const matrix = Profile.createScenarioMatrix();
  matrix.add(Profile.createScenario({
    scenarioId: 'S1', label: 'pre-existing', widthMm: 1250, heightMm: 2050,
    evaluationHeightM: 4.2, zone: 'general', glassType: 'fl_single'
  }));

  const parsed = Profile.parseScenarioTsv([
    SCENARIO_TSV_HEADER,
    'S2\tCase B\t1250\t2050\t4.2\tgeneral\tfl_single',
    'S1\tCase dup\t1500\t2050\t8.4\tcorner\tfl_single',
    'S3\tCase C\t1500\t2050\t8.4\tcorner\tfl_single'
  ].join('\n'));
  const outcome = Profile.addParsedScenarios(matrix, parsed);

  assert.deepEqual(outcome.added.map((a) => a.scenarioId), ['S2', 'S3'],
    '重複の後の行も試される');
  assert.deepEqual(outcome.added.map((a) => a.lineNumber), [2, 4]);
  assert.equal(outcome.errors.length, 1);
  assert.equal(outcome.errors[0].lineNumber, 3, '重複行の物理行番号');
  assert.equal(outcome.errors[0].caseId, 'S1');
  assert.match(outcome.errors[0].reason, /duplicate scenarioId/);

  // 既存S1は上書きされない
  assert.deepEqual(matrix.list().map((s) => s.scenarioId), ['S1', 'S2', 'S3']);
  assert.equal(matrix.get('S1').label, 'pre-existing');
  assert.equal(matrix.get('S1').widthMm, 1250);
  // 正常行のrollbackも無い
  assert.equal(matrix.size(), 3);
});

test('RF-B: 同じ貼り付け内の重複も行単位で隔離する', () => {
  const matrix = Profile.createScenarioMatrix();
  const parsed = Profile.parseScenarioTsv([
    SCENARIO_TSV_HEADER,
    'S1\tA\t1250\t2050\t4.2\tgeneral\tfl_single',
    'S1\tB\t1500\t2050\t8.4\tcorner\tfl_single',
    'S2\tC\t1500\t2050\t8.4\tcorner\tfl_single'
  ].join('\n'));
  const outcome = Profile.addParsedScenarios(matrix, parsed);

  assert.deepEqual(outcome.added.map((a) => a.scenarioId), ['S1', 'S2']);
  assert.equal(outcome.errors.length, 1);
  assert.equal(outcome.errors[0].lineNumber, 3);
  assert.equal(matrix.get('S1').label, 'A', '最初のS1が残る（後勝ちにしない）');
  assert.equal(matrix.size(), 2);
});

test('RF-B: parse段階の診断も引き継ぎ、生の行を残さない', () => {
  const matrix = Profile.createScenarioMatrix();
  const parsed = Profile.parseScenarioTsv([
    SCENARIO_TSV_HEADER,
    'S1\tA\t1250\t2050\t4.2\tgeneral\tfl_single',
    'S2\tB\t1250\t2050\tNOT-A-NUMBER\tgeneral\tfl_single'
  ].join('\n'));
  const outcome = Profile.addParsedScenarios(matrix, parsed);

  assert.equal(outcome.added.length, 1);
  assert.equal(outcome.errors.length, 1, 'parse段階のエラーも結果に含む');
  assert.equal(outcome.errors[0].lineNumber, 3);
  assert.equal(JSON.stringify(outcome.errors).includes('\t'), false);
  assert.equal(JSON.stringify(outcome.errors).includes('NOT-A-NUMBER'), false);
});

test('RF-B: UIは canonical helper を使う（forEachを自前で囲まない）', () => {
  const script = profileScript();
  assert.match(script, /ProjectProfile\.addParsedScenarios\(scenarioMatrix, parsed\)/);
  assert.doesNotMatch(script, /parsed\.rows\.forEach\([\s\S]{0,120}scenarioMatrix\.add/,
    'UI側でforEach + 単一try/catchの形に戻さない');
});

/* ============================================================
   Required Fix C — 結果側のcanonical gate（§4-§8）
============================================================ */

const FORGED_PROFILE = {
  schemaVersion: 1, profileType: 'runtime_wind_profile',
  verificationStatus: 'verified', label: 'Sample Profile',
  windDefaults: Object.assign({}, WIND_DEFAULTS)
};

test('RF-C / §7: 手で組んだ verified Profile はどの消費経路にも入れない', () => {
  const scenario = makeScenario();
  for (const [name, call] of [
    ['describeEffectiveInput', () => Profile.describeEffectiveInput(FORGED_PROFILE, scenario)],
    ['resolveEffectiveWindInput', () => Profile.resolveEffectiveWindInput(FORGED_PROFILE, scenario)],
    ['scenarioToProjectInput', () => Profile.scenarioToProjectInput(FORGED_PROFILE, scenario)],
    ['serializeProfile', () => Profile.serializeProfile(FORGED_PROFILE)]
  ]) {
    assert.throws(call, /must be user_input_unverified/, name);
  }
  // 正規のProfileは通る
  assert.equal(Profile.describeEffectiveInput(makeProfile(), scenario).profileStatus,
    'user_input_unverified');
});

test('RF-C: assertRuntimeProfile は結果objectそのものを検査する', () => {
  assert.doesNotThrow(() => Profile.assertRuntimeProfile(makeProfile()));

  const valid = makeProfile();
  const mutate = (patch) => Object.assign({}, valid, patch);
  assert.throws(() => Profile.assertRuntimeProfile(mutate({ verificationStatus: 'verified' })),
    /must be user_input_unverified/);
  assert.throws(() => Profile.assertRuntimeProfile(mutate({ profileType: 'registered_preset' })),
    /unsupported profileType/);
  assert.throws(() => Profile.assertRuntimeProfile(mutate({ schemaVersion: 2 })),
    /unsupported schemaVersion/);
  assert.throws(() => Profile.assertRuntimeProfile(mutate({ presetId: 'x' })), /unexpected field/);
  assert.throws(() => Profile.assertRuntimeProfile({ schemaVersion: 1, profileType: 'runtime_wind_profile',
    verificationStatus: 'user_input_unverified', label: null }), /missing windDefaults/);

  for (const field of ['evaluationHeightM', 'zone']) {
    assert.throws(() => Profile.assertRuntimeProfile(mutate({
      windDefaults: Object.assign({}, WIND_DEFAULTS, { [field]: field === 'zone' ? 'general' : 14.2 })
    })), /must not carry/, field);
  }
  for (const field of ['evidence', 'sourceReference', 'sourceKind', 'privateReferenceAvailable']) {
    assert.throws(() => Profile.assertRuntimeProfile(mutate({
      windDefaults: Object.assign({}, WIND_DEFAULTS, { [field]: 'x' })
    })), /must not carry/, field);
  }
  // 値の型も見る（文字列の V0 を通さない）
  assert.throws(() => Profile.assertRuntimeProfile(mutate({
    windDefaults: Object.assign({}, WIND_DEFAULTS, { V0: '34' })
  })), /must be a finite number/);
});

test('RF-C / §8: 生のScenarioはMatrix stateへ入れない', () => {
  const matrix = Profile.createScenarioMatrix();

  assert.throws(() => matrix.add({
    scenarioId: 'S1', widthMm: 1250, heightMm: 2050, zone: 'general', glassType: 'fl_single'
  }), /missing evaluationHeightM; it is never inherited from the profile/);

  assert.throws(() => matrix.add({
    scenarioId: 'S2', label: null, widthMm: 1250, heightMm: 2050, evaluationHeightM: 14.2,
    zone: 'general', glassType: 'fl_single', extraFactor: 1.0, verificationStatus: 'verified'
  }), /unexpected field/);

  for (const field of ['floor', 'storey', 'level', 'V0', 'basis', 'evidence', 'sourceKind']) {
    assert.throws(() => matrix.add(Object.assign({}, makeScenario(), { [field]: 'x' })),
      /unexpected field/, field);
  }

  assert.equal(matrix.size(), 0, '拒否された行はstateに残らない');
  assert.match(matrix.add(makeScenario()), /^sc-\d{3}$/);
  assert.equal(matrix.size(), 1);
});

test('RF-C: assertCanonicalScenario は明示値だけを受け取る', () => {
  assert.doesNotThrow(() => Profile.assertCanonicalScenario(makeScenario()));
  const valid = makeScenario();

  for (const field of Profile.SCENARIO_REQUIRED) {
    const broken = Object.assign({}, valid);
    delete broken[field];
    assert.throws(() => Profile.assertCanonicalScenario(broken), /is missing/, field);
  }
  assert.throws(() => Profile.assertCanonicalScenario(
    Object.assign({}, valid, { widthMm: '1250' })), /must be an explicit finite number/);
  assert.throws(() => Profile.assertCanonicalScenario(
    Object.assign({}, valid, { zone: '' })), /must be an explicit non-empty string/);
  assert.throws(() => Profile.assertCanonicalScenario(
    Object.assign({}, valid, { scenarioId: '1bad' })), /safe runtime id/);
  assert.throws(() => Profile.assertCanonicalScenario(
    Object.assign({}, valid, { label: 'a\u0000b' })), /control characters/);
  // scenarioId は null を許す（Matrixが採番する前の形）
  assert.doesNotThrow(() => Profile.assertCanonicalScenario(
    Object.assign({}, valid, { scenarioId: null })));
});


/* ============================================================
   §9: 「別のguardがたまたま拾った」で済ませないための固定
============================================================ */

test('§9: 各消費関数が自分でcanonical gateを呼ぶ（推移的な呼び出しに頼らない）', () => {
  // describeEffectiveInput / scenarioToProjectInput は内部で
  // resolveEffectiveWindInput を呼ぶので、自分のgateを外しても
  // 振る舞いは変わらない（mutationが生き残る）。
  // だが「resolveがgateしているから」に依存すると、resolveの実装を変えた瞬間に
  // 黙って無防備になる。各関数が自分で通すことをソース契約として固定する。
  const src = fs.readFileSync(PROFILE_SRC, 'utf8');

  function bodyOf(name) {
    const start = src.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, name + ' が見つかるはず');
    return src.slice(start, src.indexOf('\n  }', start));
  }

  for (const fn of ['describeEffectiveInput', 'scenarioToProjectInput', 'resolveEffectiveWindInput']) {
    const body = bodyOf(fn);
    assert.match(body, /assertRuntimeProfile\(profile,/, fn + ' は profile gate を自分で呼ぶ');
    assert.match(body, /assertCanonicalScenario\(scenario,/, fn + ' は scenario gate を自分で呼ぶ');
  }
  assert.match(bodyOf('serializeProfile'), /assertRuntimeProfile\(profile,/);
  assert.match(bodyOf('add'), /assertCanonicalScenario\(scenario,/);
});

test('§9: 上限判定は1か所だけ（発火しないguardを残さない）', () => {
  const src = fs.readFileSync(PROFILE_SRC, 'utf8');
  const start = src.indexOf('function generateScenarioMatrix(');
  const body = src.slice(start, src.indexOf('\n  }', start));

  // effectiveCap は必ず MAX_SCENARIOS 以下。同じ判定を二重に書くと片方が死ぬ。
  assert.match(body, /Math\.min\(MAX_SCENARIOS, requestedCap\)/);
  assert.equal((body.match(/existing \+ count >/g) || []).length, 1,
    '合計件数の判定は1か所だけにする');
});
