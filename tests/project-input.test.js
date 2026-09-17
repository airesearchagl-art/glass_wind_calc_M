'use strict';

/**
 * Phase 2D: project-config/project-input.js（Project Input Package）と
 * project-config/registry.js（generic preset registry）のテスト。
 *
 * 対応AC:
 *   AC-02 versioned package / designP再計算
 *   AC-03 common validator / factory
 *   AC-04 generic preset registry（duplicate reject / unknown fail closed / manual非登録）
 *   AC-05 imported dataをtrusted presetへ昇格させない
 *   AC-06 safe import / export / deterministic roundtrip
 *   AC-07 import security（forbidden key / size / depth / unknown field / malformed JSON / HTML payload）
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const GlassCalc = require('../calc.js');
const ProjectInput = require('../project-config/project-input.js');
const PresetRegistry = require('../project-config/registry.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');
const ManualProjectConfig = require('../project-config/manual.js');

function validPackage(overrides) {
  return Object.assign({
    schemaVersion: 1,
    sourceKind: 'manual',
    sourceId: null,
    widthMm: 1250,
    heightMm: 2050,
    positivePressure: 1400,
    negativePressure: -1000,
    designPressure: 1400,
    glassType: 'fl_single',
    extraFactor: 1.0,
    provenance: {
      publicLabel: '手入力 (Manual / Generic)',
      verificationStatus: 'unverified',
      note: 'テスト用'
    }
  }, overrides || {});
}

/* ============================================================
   AC-04: generic preset registry
============================================================ */

test('AC-04: registryからMiyoshi presetをlookupできる', () => {
  assert.equal(PresetRegistry.hasPreset('miyoshi'), true);
  const preset = PresetRegistry.getPreset('miyoshi');
  assert.equal(preset.projectId, 'miyoshi');
  assert.equal(preset.getPublicLabel(), 'みよし案件');
});

test('AC-04: listPresets()はpublicLabel境界（getPublicLabel）経由でのみラベルを返す', () => {
  const list = PresetRegistry.listPresets();
  assert.ok(Array.isArray(list));
  const miyoshi = list.find(p => p.projectId === 'miyoshi');
  assert.ok(miyoshi, 'miyoshiがlistPresetsに含まれるはず');
  assert.equal(miyoshi.publicLabel, MiyoshiProjectConfig.getPublicLabel());
  // 内部呼称（projectName）をそのまま露出しない構造であること
  for (const entry of list) {
    assert.deepEqual(Object.keys(entry).sort(), ['projectId', 'publicLabel']);
  }
});

test('AC-04: duplicate projectIdの登録は例外で拒否される', () => {
  const reg = PresetRegistry.createRegistry();
  reg.registerPreset(MiyoshiProjectConfig);
  assert.throws(() => reg.registerPreset(MiyoshiProjectConfig), /duplicate projectId/);
});

test('AC-04: unknown projectIdはfail closed（undefinedを返さず例外）', () => {
  assert.throws(() => PresetRegistry.getPreset('does-not-exist'), /unknown projectId/);
  assert.throws(() => PresetRegistry.getPreset(''), /unknown projectId/);
  assert.throws(() => PresetRegistry.getPreset(null), /unknown projectId/);
  assert.equal(PresetRegistry.hasPreset('does-not-exist'), false);
});

test('AC-04: manual inputはtrusted presetとして登録できない', () => {
  const reg = PresetRegistry.createRegistry();
  assert.throws(() => reg.registerPreset(ManualProjectConfig), /hasFixedPreset/);
  assert.equal(ManualProjectConfig.hasFixedPreset, false);
});

test('AC-04: registryは不正なconfig（非object・projectId欠落・publicLabel境界なし）を拒否する', () => {
  const reg = PresetRegistry.createRegistry();
  assert.throws(() => reg.registerPreset(null));
  assert.throws(() => reg.registerPreset({}));
  assert.throws(() => reg.registerPreset({ projectId: 'x', hasFixedPreset: true })); // getPublicLabelなし
  assert.throws(() => reg.registerPreset({ projectId: 'BAD ID', hasFixedPreset: true, getPublicLabel: () => 'x' }));
});

/* ============================================================
   AC-02 / AC-03: package schema / validator / designP再計算
============================================================ */

test('AC-02: 妥当なpackageを受理し、deterministicに正規化する', () => {
  const pkg = ProjectInput.createProjectInput(validPackage());
  assert.equal(pkg.schemaVersion, 1);
  assert.equal(pkg.sourceKind, 'manual');
  assert.equal(pkg.designPressure, 1400);
  assert.deepEqual(Object.keys(pkg), ProjectInput.ALLOWED_TOP_LEVEL_KEYS);
});

test('AC-02: designPressureはpayload値を信用せず常に再計算される', () => {
  // payloadが嘘のdesignPressureを主張しても、max(|pos|,|neg|)で上書きされる
  const pkg = ProjectInput.createProjectInput(validPackage({ designPressure: 999999 }));
  assert.equal(pkg.designPressure, 1400);

  const pkg2 = ProjectInput.createProjectInput(validPackage({
    positivePressure: 800, negativePressure: -1200, designPressure: 1
  }));
  assert.equal(pkg2.designPressure, 1200);
});

test('AC-03: unsupported schemaVersionはreject', () => {
  for (const bad of [0, 2, 99, '1', null, undefined, {}]) {
    assert.throws(
      () => ProjectInput.createProjectInput(validPackage({ schemaVersion: bad })),
      `schemaVersion=${JSON.stringify(bad)} はrejectされるはず`
    );
  }
});

test('AC-03 / AC-07: unknown fieldはreject', () => {
  const withExtra = validPackage();
  withExtra.attackerField = 'x';
  assert.throws(() => ProjectInput.createProjectInput(withExtra), /unknown field/);

  const withExtraProv = validPackage();
  withExtraProv.provenance = Object.assign({}, withExtraProv.provenance, { evidence: 'primary' });
  assert.throws(() => ProjectInput.createProjectInput(withExtraProv), /unknown field/);
});

test('AC-03: NaN / Infinity / 非数値はreject', () => {
  const numericFields = ['widthMm', 'heightMm', 'positivePressure', 'negativePressure', 'extraFactor'];
  for (const field of numericFields) {
    for (const bad of [NaN, Infinity, -Infinity, '100', null, undefined, {}]) {
      assert.throws(
        () => ProjectInput.createProjectInput(validPackage({ [field]: bad })),
        `${field}=${JSON.stringify(bad)} はrejectされるはず`
      );
    }
  }
});

test('AC-03: W/H <= 0 はreject、過大値もreject', () => {
  for (const bad of [0, -1, -1250]) {
    assert.throws(() => ProjectInput.createProjectInput(validPackage({ widthMm: bad })));
    assert.throws(() => ProjectInput.createProjectInput(validPackage({ heightMm: bad })));
  }
  assert.throws(() => ProjectInput.createProjectInput(validPackage({ widthMm: 10 ** 9 })), /maximum/);
});

test('AC-03: extraFactorは 0 < v <= 1.0 のみ許容（>1はreject）', () => {
  for (const bad of [0, -0.5, 1.01, 1.2, 2, 10]) {
    assert.throws(
      () => ProjectInput.createProjectInput(validPackage({ extraFactor: bad })),
      `extraFactor=${bad} はrejectされるはず`
    );
  }
  for (const ok of [1.0, 0.9, 0.7, 0.5, 0.01]) {
    assert.equal(ProjectInput.createProjectInput(validPackage({ extraFactor: ok })).extraFactor, ok);
  }
});

test('AC-03: 正圧・負圧がともに0（designP=0）はreject、片方0は許容', () => {
  assert.throws(
    () => ProjectInput.createProjectInput(validPackage({ positivePressure: 0, negativePressure: 0 })),
    /designPressure must be > 0/
  );
  const ok = ProjectInput.createProjectInput(validPackage({ positivePressure: 0, negativePressure: -500 }));
  assert.equal(ok.designPressure, 500);
});

test('AC-03: known glassTypeのみ許容（calc.jsのGLASS_TYPESに一致）', () => {
  for (const t of Object.keys(GlassCalc.GLASS_TYPES)) {
    assert.equal(ProjectInput.createProjectInput(validPackage({ glassType: t })).glassType, t);
  }
  for (const bad of ['unknown_type', '', null, 123, 'FL_SINGLE']) {
    assert.throws(
      () => ProjectInput.createProjectInput(validPackage({ glassType: bad })),
      `glassType=${JSON.stringify(bad)} はrejectされるはず`
    );
  }
});

test('AC-03: unsupported sourceKindはreject', () => {
  for (const bad of ['trusted', 'preset', '', null, 123]) {
    assert.throws(() => ProjectInput.createProjectInput(validPackage({ sourceKind: bad })));
  }
});

test('AC-03: manual / imported は verified を名乗れない', () => {
  assert.throws(
    () => ProjectInput.createProjectInput(validPackage({
      sourceKind: 'manual',
      provenance: { publicLabel: 'x', verificationStatus: 'verified', note: '' }
    })),
    /must have provenance.verificationStatus "unverified"/
  );
});

/* ============================================================
   factory: fromPreset / fromManual
============================================================ */

test('AC-02: fromPreset()はregistered presetの風圧を反映し、検証状況を昇格させない', () => {
  const preset = PresetRegistry.getPreset('miyoshi');
  const pkg = ProjectInput.fromPreset(preset, {
    floorKey: '2', zoneKey: 'general',
    widthMm: 1250, heightMm: 2050,
    glassType: 'fl_single', extraFactor: 1.0
  });
  assert.equal(pkg.sourceKind, 'registered_preset');
  assert.equal(pkg.sourceId, 'miyoshi');
  assert.equal(pkg.positivePressure, 1525);
  assert.equal(pkg.negativePressure, 918);
  assert.equal(pkg.designPressure, 1525);
  // presetのwind.statusは partially_verified。verifiedへ昇格していないこと。
  assert.equal(pkg.provenance.verificationStatus, 'partially_verified');
  assert.notEqual(pkg.provenance.verificationStatus, 'verified');
});

test('AC-02: fromPreset()はbuilt-in preset以外を拒否する', () => {
  assert.throws(() => ProjectInput.fromPreset(ManualProjectConfig, {}), /built-in registered preset/);
  assert.throws(() => ProjectInput.fromPreset({}, {}), /built-in registered preset/);
  assert.throws(() => ProjectInput.fromPreset(null, {}), /built-in registered preset/);
});

test('AC-02: fromManual()は常にmanual / unverified', () => {
  const pkg = ProjectInput.fromManual({
    widthMm: 1250, heightMm: 2050,
    positivePressure: 1400, negativePressure: -1000,
    glassType: 'fl_single'
  });
  assert.equal(pkg.sourceKind, 'manual');
  assert.equal(pkg.sourceId, null);
  assert.equal(pkg.designPressure, 1400);
  assert.equal(pkg.provenance.verificationStatus, 'unverified');
});

/* ============================================================
   AC-06: export / import roundtrip
============================================================ */

test('AC-06: Export → Import で計算に用いる値が完全に一致する（roundtrip）', () => {
  const preset = PresetRegistry.getPreset('miyoshi');
  const original = ProjectInput.fromPreset(preset, {
    floorKey: '2', zoneKey: 'general',
    widthMm: 1250, heightMm: 2050,
    glassType: 'fl_single', extraFactor: 1.0
  });
  const json = ProjectInput.serialize(original);
  const imported = ProjectInput.deserialize(json);

  for (const key of ['widthMm', 'heightMm', 'positivePressure', 'negativePressure', 'designPressure', 'glassType', 'extraFactor']) {
    assert.equal(imported[key], original[key], `${key} がroundtripで一致しない`);
  }

  // 計算結果そのものも一致すること
  const areaOf = p => (p.widthMm * p.heightMm) / 1_000_000;
  const a = GlassCalc.splitCandidates(GlassCalc.generateCandidates(original.glassType, areaOf(original), original.designPressure, original.extraFactor));
  const b = GlassCalc.splitCandidates(GlassCalc.generateCandidates(imported.glassType, areaOf(imported), imported.designPressure, imported.extraFactor));
  assert.equal(b.okCandidates.length, a.okCandidates.length);
  assert.equal(b.okCandidates[0].label, a.okCandidates[0].label);
  assert.equal(b.okCandidates[0].P, a.okCandidates[0].P);
});

test('AC-06: serializationはdeterministic（同じpackageから常に同じ文字列）', () => {
  const pkg = ProjectInput.createProjectInput(validPackage());
  const s1 = ProjectInput.serialize(pkg);
  const s2 = ProjectInput.serialize(ProjectInput.createProjectInput(validPackage()));
  assert.equal(s1, s2);
  // 二重roundtripでも安定すること
  assert.equal(ProjectInput.serialize(ProjectInput.deserialize(s1)), ProjectInput.serialize(ProjectInput.deserialize(s1)));
});

/* ============================================================
   AC-05: imported dataはtrusted presetへ昇格できない
============================================================ */

test('AC-05: payloadがregistered_preset / verifiedを主張しても信用されない（trust downgrade）', () => {
  const spoofed = JSON.stringify({
    schemaVersion: 1,
    sourceKind: 'registered_preset',
    sourceId: 'miyoshi',
    widthMm: 1250,
    heightMm: 2050,
    positivePressure: 1525,
    negativePressure: 918,
    designPressure: 1525,
    glassType: 'fl_single',
    extraFactor: 1.0,
    provenance: {
      publicLabel: 'みよし案件',
      verificationStatus: 'verified',
      note: '検証済みを主張する偽装payload'
    }
  });

  const imported = ProjectInput.deserialize(spoofed);
  assert.equal(imported.sourceKind, 'imported_unverified', 'importはregistered_presetを名乗れない');
  assert.equal(imported.sourceId, null, 'importはpreset idを引き継がない');
  assert.equal(imported.provenance.verificationStatus, 'unverified', 'importはverifiedへ昇格できない');
  assert.equal(imported.provenance.publicLabel, ProjectInput.IMPORTED_PUBLIC_LABEL);
  assert.equal(imported.provenance.publicLabel.includes('みよし'), false, '案件ラベルを引き継がない');
  assert.equal(imported.provenance.note.includes('検証済み'), false);
});

test('AC-05: importしたpackageはregistryへpresetとして登録できない', () => {
  const imported = ProjectInput.deserialize(ProjectInput.serialize(ProjectInput.createProjectInput(validPackage())));
  const reg = PresetRegistry.createRegistry();
  assert.throws(() => reg.registerPreset(imported), /hasFixedPreset|projectId/);
});

/* ============================================================
   AC-07: import security
============================================================ */

test('AC-07: __proto__ / prototype / constructor キーはreject', () => {
  const payloads = [
    '{"__proto__":{"polluted":true},"schemaVersion":1}',
    '{"schemaVersion":1,"prototype":{"x":1}}',
    '{"schemaVersion":1,"constructor":{"x":1}}',
    '{"schemaVersion":1,"provenance":{"__proto__":{"x":1}}}'
  ];
  for (const p of payloads) {
    assert.throws(() => ProjectInput.deserialize(p), /forbidden key/, `payload rejected: ${p}`);
  }
  // prototype pollutionが起きていないこと
  assert.equal({}.polluted, undefined);
});

test('AC-07: 過大payloadはreject', () => {
  const huge = JSON.stringify({
    schemaVersion: 1,
    sourceKind: 'manual',
    sourceId: null,
    widthMm: 1250,
    heightMm: 2050,
    positivePressure: 1400,
    negativePressure: -1000,
    designPressure: 1400,
    glassType: 'fl_single',
    extraFactor: 1,
    provenance: { publicLabel: 'x'.repeat(40000), verificationStatus: 'unverified', note: '' }
  });
  assert.ok(huge.length > ProjectInput.MAX_PAYLOAD_BYTES);
  assert.throws(() => ProjectInput.deserialize(huge), /too large/);
});

test('AC-07: 過深nestはreject', () => {
  let nested = '{"schemaVersion":1,"provenance":';
  let close = '';
  for (let i = 0; i < 12; i++) { nested += '{"a":'; close += '}'; }
  nested += '1' + close + '}';
  assert.throws(() => ProjectInput.deserialize(nested), /too deep|unknown field/);
});

test('AC-07: malformed JSONはreject', () => {
  for (const bad of ['{', 'not json', '', '{"a":}', '[1,2', 'undefined']) {
    assert.throws(() => ProjectInput.deserialize(bad), /not valid JSON|must be an object|unknown field/);
  }
  for (const bad of [null, undefined, 123, {}]) {
    assert.throws(() => ProjectInput.deserialize(bad), /must be a JSON string/);
  }
});

test('AC-07: HTML / script payloadを含む文字列はreject（DOMへ流れる前段で遮断）', () => {
  const withScript = JSON.stringify(validPackage({
    provenance: {
      publicLabel: '<img src=x onerror=alert(1)>',
      verificationStatus: 'unverified',
      note: ''
    }
  }));
  assert.throws(() => ProjectInput.deserialize(withScript), /disallowed content/);

  const withJsScheme = JSON.stringify(validPackage({
    provenance: { publicLabel: 'javascript:alert(1)', verificationStatus: 'unverified', note: '' }
  }));
  assert.throws(() => ProjectInput.deserialize(withJsScheme), /disallowed content/);
});

test('AC-07 / AC-13: public-safeでない文字列（URL・絶対パス・制御文字）はreject', () => {
  const cases = [
    'https://drive.google.com/file/d/xyz',
    'C:\\Users\\foo\\secret.pdf',
    '/Users/foo/secret.pdf',
    'line\u0000break'
  ];
  for (const bad of cases) {
    const payload = JSON.stringify(validPackage({
      provenance: { publicLabel: bad, verificationStatus: 'unverified', note: '' }
    }));
    assert.throws(() => ProjectInput.deserialize(payload), /disallowed content|length/, `rejected: ${bad}`);
  }
});

test('AC-07: deserializeはeval / Functionを使わない（ソースレベルの確認）', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'project-config', 'project-input.js'), 'utf8');
  assert.doesNotMatch(src, /\beval\s*\(/);
  assert.doesNotMatch(src, /new\s+Function\s*\(/);
  assert.doesNotMatch(src, /\bFunction\s*\(/);
  assert.match(src, /JSON\.parse/);
});
