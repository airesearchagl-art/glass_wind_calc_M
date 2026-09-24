'use strict';

/**
 * Phase 2J Wave 2: Evidence Closure Observation v1 / scope contract のテスト。
 *
 * ── このWaveが答える問いと答えない問い ──────────────────────
 *
 * Wave 2 は「妥当な観測の申告か」だけを判定する。
 * 「昇格に十分か」「current configと一致するか」はWave 3の責務であり、
 * ここでそれを判定しないこと自体をテストで固定する。
 *
 * ── fixtureはすべて合成である ────────────────────────────────
 *
 * 値は 987 / 2345 / 12.345 のように**明らかに人工的**なものを使い、
 * 案件の現行値（W/H・階別圧力・区分別圧力）を primary Evidence の
 * fixture として使わない。scope key だけは実topologyを使う
 * （scope検証がtopologyを必要とするため）。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Closure = require('../project-config/evidence-closure.js');
const Evidence = require('../project-config/evidence.js');
const EvidenceLedger = require('../project-config/evidence-ledger.js');
const PresetRegistry = require('../project-config/registry.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

const CLOSURE_SRC_PATH = path.join(__dirname, '..', 'project-config', 'evidence-closure.js');
const CLOSURE_SRC = fs.readFileSync(CLOSURE_SRC_PATH, 'utf8');
const EVIDENCE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'project-config', 'evidence.js'), 'utf8');

const PROJECT = 'miyoshi';

/** 合成Evidence。実案件のEvidenceではない。 */
function synEvidence(overrides) {
  return Object.assign({
    level: 'primary',
    checkedAt: '2026-09-20',
    publicDescription: '合成テストfixture（査読済み案件Evidenceではない）',
    privateReferenceAvailable: true
  }, overrides || {});
}

/** 合成Observation。値は明らかに人工的なものを使う。 */
function synObservation(overrides) {
  return Object.assign({
    schemaVersion: 1,
    observationType: 'evidence_closure_observation',
    factKey: 'pane_width_mm',
    scope: null,
    observedValue: 987,
    unit: 'mm',
    evidence: synEvidence(),
    sourceReference: null
  }, overrides || {});
}

function positivePressureObservation(floor, overrides) {
  return synObservation(Object.assign({
    factKey: 'positive_pressure',
    scope: { floor: floor },
    observedValue: 2345,
    unit: 'N/m\u00b2'
  }, overrides || {}));
}

function negativePressureObservation(zone, overrides) {
  return synObservation(Object.assign({
    factKey: 'negative_pressure',
    scope: { zone: zone },
    observedValue: 2345,
    unit: 'N/m\u00b2'
  }, overrides || {}));
}

function evaluationHeightObservation(floor, overrides) {
  return synObservation(Object.assign({
    factKey: 'evaluation_height',
    scope: { floor: floor },
    observedValue: 12.345,
    unit: 'm'
  }, overrides || {}));
}

const norm = (o) => Closure.normalizeObservation(o, PROJECT);

// ============================================================
// §4 schema / fact allowlist
// ============================================================

test('P2J-C01: Observation schema version と type は固定されている', () => {
  assert.equal(Closure.OBSERVATION_SCHEMA_VERSION, 1);
  assert.equal(Closure.OBSERVATION_TYPE, 'evidence_closure_observation');
  assert.throws(() => norm(synObservation({ schemaVersion: 2 })), /schemaVersion must be 1/);
  assert.throws(() => norm(synObservation({ schemaVersion: '1' })), /schemaVersion must be 1/);
  assert.throws(() => norm(synObservation({ observationType: 'something_else' })),
    /observationType must be/);
});

test('P2J-C02: closure fact keys は generic allowlist の部分集合である', () => {
  // 片方だけ直して不整合に気付かない状態を作らないための固定。
  assert.deepEqual(Closure.CLOSURE_FACT_KEYS.slice(), [
    'pane_width_mm', 'pane_height_mm', 'positive_pressure', 'negative_pressure', 'evaluation_height'
  ]);
  Closure.CLOSURE_FACT_KEYS.forEach((k) => {
    assert.equal(EvidenceLedger.KNOWN_FACT_KEYS.includes(k), true,
      k + ' は generic allowlist に存在しなければならない');
  });
  // generic allowlist を置き換えてはいない（Phase 2J対象外のfactは残っている）
  ['V0', 'roughness_category', 'building_height', 'eaves_height', 'floor_height_mapping']
    .forEach((k) => {
      assert.equal(EvidenceLedger.KNOWN_FACT_KEYS.includes(k), true, k + ' は generic側に残る');
      assert.equal(Closure.CLOSURE_FACT_KEYS.includes(k), false, k + ' はPhase 2J対象外');
    });
});

test('P2J-C03: Phase 2J対象外のfactKeyは拒否される', () => {
  ['V0', 'roughness_category', 'building_height', 'eaves_height', 'floor_height_mapping']
    .forEach((k) => {
      assert.throws(() => norm(synObservation({ factKey: k })), /factKey must be one of/);
    });
  assert.throws(() => norm(synObservation({ factKey: 'drawing_123' })), /factKey must be one of/);
  assert.throws(() => norm(synObservation({ factKey: 42 })), /factKey must be one of/);
});

// ============================================================
// §5 / §6 / §10 project topology
// ============================================================

test('P2J-C04: scope contract は registered preset の topology から導出される', () => {
  const contract = Closure.createProjectScopeContract(PROJECT);
  const preset = PresetRegistry.getPreset(PROJECT);

  // 期待値をテスト側で固定せず、presetから導いた集合と一致することを見る。
  assert.deepEqual(
    contract.floors.slice(),
    Object.keys(preset.wind.positivePressureByFloor).sort());
  assert.deepEqual(
    contract.zones.slice(),
    Object.keys(preset.wind.negativePressureByZone).sort());
  assert.equal(contract.projectId, PROJECT);

  // topology のみ。案件名・identity・現在値・Evidenceは含めない。
  assert.deepEqual(Object.keys(contract).sort(), ['floors', 'projectId', 'zones']);
});

test('P2J-C05: scope contract は detach され deep freeze されている', () => {
  const contract = Closure.createProjectScopeContract(PROJECT);
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.floors), true);
  assert.throws(() => contract.floors.push('X'), TypeError);
  assert.equal(
    contract.floors.length,
    Object.keys(PresetRegistry.getPreset(PROJECT).wind.positivePressureByFloor).length);
});

test('P2J-C06: unknown projectId は fail closed', () => {
  assert.throws(() => Closure.createProjectScopeContract('no-such-project'), /unknown projectId/);
  assert.throws(() => Closure.listRequiredObservationSlots('no-such-project'), /unknown projectId/);
});

// ============================================================
// §19 / §21 / §32 required slots
// ============================================================

test('P2J-C07: required slot 数は topology から導出される（合計12）', () => {
  const preset = PresetRegistry.getPreset(PROJECT);
  const floorCount = Object.keys(preset.wind.positivePressureByFloor).length;
  const zoneCount = Object.keys(preset.wind.negativePressureByZone).length;
  const slots = Closure.listRequiredObservationSlots(PROJECT);

  const byFact = (f) => slots.filter((s) => s.factKey === f).length;
  assert.equal(byFact('pane_width_mm') + byFact('pane_height_mm'), 2, '寸法slotは2');
  assert.equal(byFact('positive_pressure'), floorCount, '正圧slotは階数ぶん');
  assert.equal(byFact('negative_pressure'), zoneCount, '負圧slotは区分数ぶん');
  assert.equal(byFact('evaluation_height'), floorCount, '評価高さslotは階数ぶん');
  assert.equal(slots.length, 2 + floorCount * 2 + zoneCount);

  // 現在の登録presetでの実測値
  assert.equal(floorCount, 4);
  assert.equal(zoneCount, 2);
  assert.equal(slots.length, 12);
});

test('P2J-C08: 12 slot は「未解決カテゴリ4件」とは別の数である', () => {
  // 混同すると「4件しか無いのに12件要求している」あるいは
  // 「12件あるので12カテゴリ未解決」という誤読が生まれる。
  const slots = Closure.listRequiredObservationSlots(PROJECT);
  const categories = new Set(slots.map((s) => {
    if (s.factKey === 'pane_width_mm' || s.factKey === 'pane_height_mm') return 'pane_dimensions';
    if (s.factKey === 'positive_pressure') return 'positive_pressure';
    if (s.factKey === 'negative_pressure') return 'negative_pressure';
    return 'evaluation_height';
  }));
  assert.equal(slots.length, 12, 'required observation slots');
  assert.equal(categories.size, 4, 'unresolved conceptual categories');
});

test('P2J-C09: required slot は公開安全な orchestration data のみを持つ', () => {
  const slots = Closure.listRequiredObservationSlots(PROJECT);
  slots.forEach((s) => {
    assert.deepEqual(Object.keys(s).sort(), ['factKey', 'scope', 'slotKey', 'unit']);
    // 「今なにが正しいか」を持ち込まない
    assert.equal('observedValue' in s, false);
    assert.equal('value' in s, false);
    assert.equal('verificationStatus' in s, false);
    assert.equal('evidence' in s, false);
    assert.equal(Object.isFrozen(s), true);
  });
  // 現行の数値がslot一覧へ漏れていないこと
  const json = JSON.stringify(slots);
  [1297, 1525, 1695, 1729, 918, 1122, 1250, 2050].forEach((v) => {
    assert.equal(json.includes(String(v)), false, '現行値 ' + v + ' がslot一覧に現れてはならない');
  });
});

test('P2J-C10: required slot の順序は決定的である', () => {
  const a = Closure.listRequiredObservationSlots(PROJECT).map((s) => s.slotKey);
  const b = Closure.listRequiredObservationSlots(PROJECT).map((s) => s.slotKey);
  assert.deepEqual(a, b);
  assert.deepEqual(a.slice(0, 2), ['pane_width_mm', 'pane_height_mm']);
  // 各fact内は導出keyのsort順
  const pos = a.filter((k) => k.startsWith('positive_pressure|'));
  assert.deepEqual(pos.slice(), pos.slice().sort());
  const neg = a.filter((k) => k.startsWith('negative_pressure|'));
  assert.deepEqual(neg.slice(), neg.slice().sort());
  const zed = a.filter((k) => k.startsWith('evaluation_height|'));
  assert.deepEqual(zed.slice(), zed.slice().sort());
});

// ============================================================
// §9 scope rules
// ============================================================

test('P2J-C11: 寸法factは scope === null を要求する', () => {
  assert.equal(norm(synObservation({ factKey: 'pane_width_mm', scope: null })).scope, null);
  assert.equal(
    norm(synObservation({ factKey: 'pane_height_mm', scope: null, unit: 'mm' })).scope, null);
  // 空objectを「scopeなし」として受け入れない（意味が一意にならない）
  assert.throws(() => norm(synObservation({ scope: {} })), /requires scope === null/);
  assert.throws(() => norm(synObservation({ scope: { floor: '2' } })), /requires scope === null/);
});

test('P2J-C12: 圧力・評価高さは正しいscope種別を要求する', () => {
  const contract = Closure.createProjectScopeContract(PROJECT);
  const floor = contract.floors[0];
  const zone = contract.zones[0];

  assert.deepEqual(norm(positivePressureObservation(floor)).scope, { floor: floor });
  assert.deepEqual(norm(negativePressureObservation(zone)).scope, { zone: zone });
  assert.deepEqual(norm(evaluationHeightObservation(floor)).scope, { floor: floor });

  // 種別違い: 正圧にzone、負圧にfloor
  assert.throws(
    () => norm(positivePressureObservation(floor, { scope: { zone: zone } })),
    /unexpected field: "zone"/);
  assert.throws(
    () => norm(negativePressureObservation(zone, { scope: { floor: floor } })),
    /unexpected field: "floor"/);
  // null は不可
  assert.throws(() => norm(positivePressureObservation(floor, { scope: null })),
    /requires a scope object with floor/);
  assert.throws(() => norm(negativePressureObservation(zone, { scope: null })),
    /requires a scope object with zone/);
});

test('P2J-C13: topology に無い floor / zone は拒否される', () => {
  assert.throws(() => norm(positivePressureObservation('B1')), /scope\.floor must be one of/);
  assert.throws(() => norm(evaluationHeightObservation('99')), /scope\.floor must be one of/);
  assert.throws(() => norm(negativePressureObservation('edge')), /scope\.zone must be one of/);
  // 型違い
  assert.throws(() => norm(positivePressureObservation(2)), /scope\.floor must be one of/);
});

test('P2J-C14: 未知のscope fieldは拒否される（filename由来識別子を含む）', () => {
  const floor = Closure.createProjectScopeContract(PROJECT).floors[0];
  assert.throws(
    () => norm(positivePressureObservation(floor, { scope: { floor: floor, drawing: 'A102' } })),
    /unexpected field: "drawing"/);
  assert.throws(
    () => norm(positivePressureObservation(floor, { scope: { sourceFile: 'plan.pdf' } })),
    /unexpected field: "sourceFile"/);
  assert.throws(
    () => norm(positivePressureObservation(floor, { scope: {} })),
    /missing required field: floor/);
});

test('P2J-C15: slotKey は factKey と検証済みscopeから計算され、呼び出し側は供給できない', () => {
  const floor = Closure.createProjectScopeContract(PROJECT).floors[1];
  const o = norm(positivePressureObservation(floor));
  assert.equal(Closure.getObservationSlotKey(o), 'positive_pressure|floor=' + floor);
  assert.equal(Closure.getObservationSlotKey(norm(synObservation())), 'pane_width_mm');
  // slotKey は Observation の field ではない
  assert.equal('slotKey' in o, false);
  assert.throws(() => norm(synObservation({ slotKey: 'anything' })), /unexpected field: "slotKey"/);
  // 未正規化のobjectからは計算させない
  assert.throws(() => Closure.getObservationSlotKey(positivePressureObservation(floor)),
    /requires an observation created by normalizeObservation/);
  assert.throws(() => Closure.getObservationSlotKey({ factKey: 'pane_width_mm', scope: null }),
    /requires an observation created by normalizeObservation/);
});

// ============================================================
// §11 / §12 value and unit contract
// ============================================================

test('P2J-C16: observedValue は有限の正の数値のみ（数値文字列を受け入れない）', () => {
  assert.equal(norm(synObservation({ observedValue: 987 })).observedValue, 987);
  assert.equal(norm(evaluationHeightObservation('1')).observedValue, 12.345);
  ['987', '', ' 987 '].forEach((v) => {
    assert.throws(() => norm(synObservation({ observedValue: v })), /must be a finite number/);
  });
  [NaN, Infinity, -Infinity, null, undefined, true, [987], { value: 987 }].forEach((v) => {
    assert.throws(() => norm(synObservation({ observedValue: v })), /must be a finite number/);
  });
  [0, -1, -987].forEach((v) => {
    assert.throws(() => norm(synObservation({ observedValue: v })), /must be greater than 0/);
  });
});

test('P2J-C17: 単位は fact type ごとに固定で、変換しない', () => {
  assert.deepEqual(Object.keys(Closure.FACT_UNITS).sort(), [
    'evaluation_height', 'negative_pressure', 'pane_height_mm', 'pane_width_mm', 'positive_pressure'
  ]);
  assert.equal(Closure.FACT_UNITS.pane_width_mm, 'mm');
  assert.equal(Closure.FACT_UNITS.positive_pressure, 'N/m\u00b2');
  assert.equal(Closure.FACT_UNITS.evaluation_height, 'm');

  // kPa を N/m² と等価に扱わない（換算契約を持たないので受理してはいけない）
  assert.throws(
    () => norm(positivePressureObservation('1', { unit: 'kPa', observedValue: 2.345 })),
    /unit for positive_pressure must be exactly/);
  assert.throws(() => norm(synObservation({ unit: 'cm' })), /unit for pane_width_mm must be exactly/);
  assert.throws(() => norm(synObservation({ unit: 'mm ' })), /must be exactly/);
  assert.throws(() => norm(evaluationHeightObservation('1', { unit: 'mm' })), /must be exactly/);
  assert.throws(() => norm(synObservation({ unit: null })), /must be exactly/);
});

// ============================================================
// §13 / §14 Evidence reuse
// ============================================================

test('P2J-C18: Evidence検証は ProjectEvidence を再利用する（複製しない）', () => {
  // 無効な level / checkedAt / boolean は makeEvidence() の契約で落ちる
  assert.throws(() => norm(synObservation({ evidence: synEvidence({ level: 'assumed' }) })),
    /invalid evidence level/);
  assert.throws(() => norm(synObservation({ evidence: synEvidence({ checkedAt: '2026-02-30' }) })),
    /checkedAt/);
  assert.throws(() => norm(synObservation({ evidence: synEvidence({ checkedAt: '2026-13-01' }) })),
    /checkedAt/);
  assert.throws(
    () => norm(synObservation({ evidence: synEvidence({ privateReferenceAvailable: 'true' }) })),
    /privateReferenceAvailable must be a boolean/);
  assert.throws(() => norm(synObservation({ evidence: synEvidence({ publicDescription: '' }) })),
    /publicDescription/);
  // 必須fieldの欠落・未知field
  assert.throws(() => {
    const ev = synEvidence(); delete ev.checkedAt;
    return norm(synObservation({ evidence: ev }));
  }, /missing required field: checkedAt/);
  assert.throws(
    () => norm(synObservation({ evidence: synEvidence({ verified: true }) })),
    /unexpected field: "verified"/);
});

test('P2J-C19: 根拠が不十分なObservationも正当に記述できる（promotion gateを呼ばない）', () => {
  // Wave 2 は「妥当な観測か」だけを見る。ここで primary を要求すると、
  // 「根拠が足りない」という観測そのものを記録できなくなる。
  const indirect = norm(synObservation({
    evidence: synEvidence({ level: 'indirect', privateReferenceAvailable: false })
  }));
  assert.equal(indirect.evidence.level, 'indirect');

  const none = norm(synObservation({
    evidence: synEvidence({ level: 'none', checkedAt: null, privateReferenceAvailable: false })
  }));
  assert.equal(none.evidence.level, 'none');
  assert.equal(none.evidence.checkedAt, null);

  // primary だが reference が無い場合も Observation としては成立する
  // （promotion gate は通らないが、その判定はWave 3）
  const primaryNoRef = norm(synObservation({
    evidence: synEvidence({ privateReferenceAvailable: false })
  }));
  assert.equal(primaryNoRef.evidence.level, 'primary');
  assert.equal(Evidence.canPromoteToVerified(primaryNoRef.evidence), false,
    'この Evidence は昇格条件を満たさない。それでも Observation としては妥当である');
});

// ============================================================
// §15 / §16 sourceReference reuse
// ============================================================

test('P2J-C20: sourceReference は ProjectEvidence で正規化される', () => {
  assert.equal(norm(synObservation({ sourceReference: null })).sourceReference, null);
  // 省略時も canonical null
  const noKey = synObservation(); delete noKey.sourceReference;
  assert.equal(norm(noKey).sourceReference, null);

  const ok = norm(synObservation({
    sourceReference: { kind: 'public_primary', url: 'https://www.mlit.go.jp/notice.html' }
  }));
  assert.equal(ok.sourceReference.kind, 'public_primary');
  assert.equal(ok.sourceReference.url, 'https://www.mlit.go.jp/notice.html');
  assert.equal(Object.isFrozen(ok.sourceReference), true);
});

test('P2J-C21: private/危険な sourceReference は既存contractで拒否される', () => {
  const bad = [
    'https://drive.google.com/file/d/abc/view',
    'https://www.notion.so/page',
    'https://example.sharepoint.com/doc',
    'https://localhost/doc.html',
    'https://192.168.0.10/doc.html',
    'https://10.0.0.5/doc.html',
    'https://intranet/doc.html',
    'https://www.example.jp/doc?token=abcdefghijklmnopqrstuvwxyz012345',
    'http://www.example.jp/doc.html'
  ];
  bad.forEach((url) => {
    assert.throws(
      () => norm(synObservation({ sourceReference: { kind: 'public_primary', url: url } })),
      (e) => e instanceof Error,
      'must reject: ' + url);
  });
  assert.throws(
    () => norm(synObservation({ sourceReference: { kind: 'private_primary', url: 'https://www.example.jp/a' } })),
    /kind must be "public_primary"/);
});

test('P2J-C22: private Evidence は URL/path/名称を保持しない', () => {
  const o = norm(synObservation({
    evidence: synEvidence({ privateReferenceAvailable: true }),
    sourceReference: null
  }));
  assert.equal(o.evidence.privateReferenceAvailable, true);
  assert.equal(o.sourceReference, null, 'privateReferenceAvailable=true でも所在は保持しない');
  assert.deepEqual(Object.keys(o.evidence).sort(),
    ['checkedAt', 'level', 'privateReferenceAvailable', 'publicDescription']);
});

// ============================================================
// §31 privacy
// ============================================================

test('P2J-C23: publicDescription の privacy 攻撃は既存 guard で落ちる', () => {
  // 構造規則（hard）——引き続き throw する。
  const attacks = [
    'https://drive.google.com/file/d/xyz/view の記載',
    'C:\\\\share\\\\案件\\\\計算書',
    '\\\\\\\\fileserver\\\\projects\\\\calc',
    '/Users/someone/Documents/calc',
    '/home/someone/calc'
  ];
  attacks.forEach((text) => {
    assert.throws(
      () => norm(synObservation({ evidence: synEvidence({ publicDescription: text }) })),
      /must not contain private URLs\/paths\/identifiers/,
      'must reject: ' + text);
  });
  // advisory へ降格された規則（Human Gate §3）——throw せず警告を出す。
  // 警告が実際に出ていることまで見る（§17: 空の test にしない）。
  [['notion.so のページを参照', 'known-private-provider'],
   ['www.example.jp を参照', 'www'],
   ['ref abcdefghijklmnopqrstuvwxyz0123456789', 'opaque-long-token']].forEach(([text, rule]) => {
    const o = norm(synObservation({ evidence: synEvidence({ publicDescription: text }) }));
    assert.equal(o.evidence.publicDescription, text, 'advisory 規則で throw している: ' + text);
    const warnings = Evidence.lintPublicEvidenceText(text, 'publicDescription').warnings;
    assert.equal(warnings.some((w) => w.rule === rule), true,
      'advisory 警告が出ていない: ' + text);
  });
  // positive control: 安全な記述は通る（上の判定が常時throwではないこと）
  assert.equal(
    norm(synObservation({
      evidence: synEvidence({ publicDescription: '一次資料で直接確認（合成fixture）' })
    })).evidence.publicDescription,
    '一次資料で直接確認（合成fixture）');
});

// ============================================================
// §8 / §29 prototype boundary
// ============================================================

test('P2J-C24: custom prototype の Observation / scope / evidence / sourceReference を拒否する', () => {
  // positive control: 素のobjectは通る（以下のthrowが構造由来であること）
  assert.equal(norm(synObservation()).factKey, 'pane_width_mm');

  assert.throws(() => norm(Object.create(synObservation())), /no inherited properties/);

  // object literal の `__proto__:` は **prototypeの差し替え**であって own key ではない。
  // したがって Object.assign 経由のhelperで組み立てると、この override は
  // own enumerable property を1つも持たず、素の妥当なObservationが出来てしまう。
  // それでは「拒否される」ことを何も確かめていない空虚なテストになる。
  // prototype が実際に差し替わっていることを先に確認してから判定する。
  const literalProto = { __proto__: synObservation() };
  assert.equal(Object.keys(literalProto).length, 0, '前提: own keyは無い');
  assert.equal(Object.getPrototypeOf(literalProto).factKey, 'pane_width_mm',
    '前提: 契約値はprototype側にある');
  assert.throws(() => norm(literalProto), /no inherited properties/);

  const floor = Closure.createProjectScopeContract(PROJECT).floors[0];
  assert.throws(
    () => norm(positivePressureObservation(floor, { scope: Object.create({ floor: floor }) })),
    /no inherited properties/);
  assert.throws(() => norm(synObservation({ evidence: Object.create(synEvidence()) })),
    /no inherited properties/);
  assert.throws(
    () => norm(synObservation({
      sourceReference: Object.create({ kind: 'public_primary', url: 'https://www.example.jp/a' })
    })),
    /no inherited properties/);

  // class instance / Date
  function Fake() {}
  Fake.prototype = synObservation();
  assert.throws(() => norm(new Fake()), /no inherited properties/);
  assert.throws(() => norm(Object.assign(new Date(), synObservation())), /no inherited properties/);
});

test('P2J-C25: own "__proto__" を持つ Observation を拒否する', () => {
  const parsed = JSON.parse('{"__proto__":{"factKey":"V0"}}');
  const attack = Object.assign(parsed, synObservation());
  assert.equal(Object.prototype.hasOwnProperty.call(attack, '__proto__'), true,
    '前提: own "__proto__" が存在する');
  assert.throws(() => norm(attack), /own "__proto__"/);
});

test('P2J-C26: null prototype の Observation は通る（Wave 1の明示的決定と整合）', () => {
  const ev = Object.create(null);
  Object.assign(ev, synEvidence());
  const o = Object.create(null);
  Object.assign(o, synObservation(), { evidence: ev });
  assert.equal(Object.getPrototypeOf(o), null);
  const normalized = norm(o);
  assert.equal(normalized.factKey, 'pane_width_mm');
  assert.equal(normalized.observedValue, 987);

  // scope も null prototype で通る
  const floor = Closure.createProjectScopeContract(PROJECT).floors[0];
  const scope = Object.create(null); scope.floor = floor;
  assert.deepEqual(norm(positivePressureObservation(floor, { scope: scope })).scope, { floor: floor });
});

// ============================================================
// §7 / §30 trust spoof
// ============================================================

test('P2J-C27: Observation は trust status を自己申告できない', () => {
  const spoofs = {
    verificationStatus: 'verified',
    verified: true,
    approved: true,
    promotion: true,
    verifiedCases: [],
    sourceKind: 'registered_preset',
    evidenceStatus: 'approved',
    currentVerified: true,
    proposedVerificationStatus: 'verified',
    trusted: true
  };
  Object.keys(spoofs).forEach((key) => {
    const attack = synObservation();
    attack[key] = spoofs[key];
    assert.throws(() => norm(attack),
      new RegExp('unexpected field: "' + key + '"'),
      key + ' must be rejected as an unexpected field');
  });
  // 正規化結果にも trust status は現れない
  assert.deepEqual(Object.keys(norm(synObservation())), [
    'schemaVersion', 'observationType', 'factKey', 'scope',
    'observedValue', 'unit', 'evidence', 'sourceReference'
  ]);
});

test('P2J-C28: 必須fieldの欠落は拒否される', () => {
  ['schemaVersion', 'observationType', 'factKey', 'scope', 'observedValue', 'unit', 'evidence']
    .forEach((key) => {
      const o = synObservation();
      delete o[key];
      assert.throws(() => norm(o), new RegExp('missing required field: ' + key));
    });
});

// ============================================================
// §17 detachment / immutability
// ============================================================

test('P2J-C29: 正規化後のObservationは detach され deep freeze されている', () => {
  const input = synObservation();
  const o = norm(input);
  assert.equal(Object.isFrozen(o), true);
  assert.equal(Object.isFrozen(o.evidence), true);

  // 呼び出し側が後から書き換えても正規化結果は変わらない
  input.observedValue = 111111;
  input.evidence.level = 'none';
  input.evidence.publicDescription = 'mutated';
  assert.equal(o.observedValue, 987);
  assert.equal(o.evidence.level, 'primary');
  assert.notEqual(o.evidence, input.evidence, '呼び出し側のevidence参照を保持しない');

  // 正規化結果そのものも書き換えられない
  assert.throws(() => { o.observedValue = 1; }, TypeError);
  assert.throws(() => { o.evidence.level = 'none'; }, TypeError);

  // scope も detach されている
  const floor = Closure.createProjectScopeContract(PROJECT).floors[0];
  const scopeInput = { floor: floor };
  const withScope = norm(positivePressureObservation(floor, { scope: scopeInput }));
  scopeInput.floor = 'mutated';
  assert.deepEqual(withScope.scope, { floor: floor });
  assert.equal(Object.isFrozen(withScope.scope), true);
});

// ============================================================
// §22 / §23 / §24 observation set
// ============================================================

test('P2J-C30: Observation set は配列で、上限を持つ', () => {
  assert.throws(() => Closure.normalizeObservationSet(null, PROJECT), /must be an array/);
  assert.throws(() => Closure.normalizeObservationSet({ 0: synObservation() }, PROJECT),
    /must be an array/);
  assert.equal(Closure.MAX_OBSERVATIONS, 64);
  const tooMany = [];
  for (let i = 0; i < Closure.MAX_OBSERVATIONS + 1; i++) tooMany.push(synObservation());
  assert.throws(() => Closure.normalizeObservationSet(tooMany, PROJECT), /too many observations/);
});

test('P2J-C31: 部分集合と空集合は正当である（完全性はWave 3の判定）', () => {
  assert.deepEqual(Closure.normalizeObservationSet([], PROJECT).slice(), []);
  const onlyWidth = Closure.normalizeObservationSet([synObservation()], PROJECT);
  assert.equal(onlyWidth.length, 1);
  const only2F = Closure.normalizeObservationSet(
    [positivePressureObservation(Closure.createProjectScopeContract(PROJECT).floors[1])], PROJECT);
  assert.equal(only2F.length, 1);
});

test('P2J-C32: 同一slotの重複は集合ごと拒否する（上書きしない）', () => {
  const floor = Closure.createProjectScopeContract(PROJECT).floors[1];
  const a = positivePressureObservation(floor, { observedValue: 2345 });
  const b = positivePressureObservation(floor, { observedValue: 9876 });
  assert.throws(() => Closure.normalizeObservationSet([a, b], PROJECT),
    /duplicate observation slot: positive_pressure\|floor=/);
  // last-one-wins でも first-one-wins でもないこと（どちらの値も通らない）
  assert.throws(() => Closure.normalizeObservationSet([b, a], PROJECT), /duplicate observation slot/);
  // 別slotなら重複ではない
  const other = Closure.createProjectScopeContract(PROJECT).floors[2];
  assert.equal(Closure.normalizeObservationSet([a, positivePressureObservation(other)], PROJECT).length, 2);
  // 寸法factの重複も検出する（scope=nullでもslotは一意）
  assert.throws(() => Closure.normalizeObservationSet([synObservation(), synObservation()], PROJECT),
    /duplicate observation slot: pane_width_mm/);
});

test('P2J-C33: Observation set は入力順に依存しない正規形になる', () => {
  const c = Closure.createProjectScopeContract(PROJECT);
  const A = synObservation();
  const B = positivePressureObservation(c.floors[0]);
  const C = negativePressureObservation(c.zones[0]);

  const forward = Closure.normalizeObservationSet([A, B, C], PROJECT);
  const shuffled = Closure.normalizeObservationSet([C, A, B], PROJECT);
  const reversed = Closure.normalizeObservationSet([C, B, A], PROJECT);
  assert.deepEqual(forward.slice(), shuffled.slice());
  assert.deepEqual(forward.slice(), reversed.slice());

  const keys = forward.map((o) => Closure.getObservationSlotKey(o));
  assert.deepEqual(keys.slice(), keys.slice().sort(), 'slotKey昇順');
  assert.equal(Object.isFrozen(forward), true);
});

// ============================================================
// §25 / §26 Wave境界（まだ持っていないもの）
// ============================================================

test('P2J-C34: reconciliation は自前で実装せず EvidenceLedger を呼ぶ', () => {
  // Wave 2 の時点では「reconciliation に触れない」ことを固定していた。
  // Wave 3 は正当に reconciliation を行うので、境界は
  // 「触れない」から「**自前で判定しない**」へ移る。テストもそこへ移す。
  assert.match(CLOSURE_SRC, /Ledger\.reconcileFact\(/, 'canonical reconciliation を呼ぶ');

  // MATCH判定の第二実装を作らない（数値比較・差分・toleranceを持たない）
  assert.equal(/Math\.abs\(/.test(CLOSURE_SRC), false, '独自の数値比較を持たない');
  assert.equal(/differencePercent/.test(CLOSURE_SRC), false, '差分計算を複製しない');
  assert.equal(/tolerance/.test(CLOSURE_SRC), false, '隠れたtoleranceを持ち込まない');
});

test('P2J-C35: Promotion Candidate に apply / import 経路が無い', () => {
  ['applyPromotionCandidate', 'promoteConfig', 'setVerified', 'updateVerifiedCases',
    'candidateToPreset', 'candidateToConfig',
    'deserializePromotionCandidate', 'importPromotionCandidate']
    .forEach((name) => {
      assert.equal(CLOSURE_SRC.includes(name), false, name + ' は存在してはならない');
      assert.equal(typeof Closure[name], 'undefined', name + ' は export されない');
    });
  // candidate JSON が入力経路にならないこと
  assert.equal(/JSON\.parse/.test(CLOSURE_SRC), false, 'candidate JSON を読み戻さない');

  assert.deepEqual(Object.keys(Closure).sort(), [
    'BLOCKER_KINDS', 'CANDIDATE_SCHEMA_VERSION', 'CANDIDATE_TYPE', 'CATEGORY_IDS',
    'CLOSURE_FACT_KEYS', 'CLOSURE_STATUSES', 'FACT_SCOPE_KIND', 'FACT_UNITS',
    'MAX_OBSERVATIONS', 'OBSERVATION_SCHEMA_VERSION', 'OBSERVATION_TYPE',
    'createProjectScopeContract', 'evaluateClosure', 'getObservationSlotKey',
    'listRequiredObservationSlots', 'normalizeObservation', 'normalizeObservationSet',
    'serializePromotionCandidate'
  ].sort());
});

// ============================================================
// §33 / §34 source contract（重複実装しない）
// ============================================================

test('P2J-C36: floor / zone 語彙を正として持たない（presetから導出する）', () => {
  // positive control: 語彙が実際に存在する preset 側では検出できること
  const miyoshiSrc = fs.readFileSync(
    path.join(__dirname, '..', 'project-config', 'miyoshi.js'), 'utf8');
  assert.match(miyoshiSrc, /'general'/, 'positive control: preset側には語彙がある');
  assert.match(miyoshiSrc, /'corner'/, 'positive control: preset側には語彙がある');

  assert.equal(/['"]general['"]/.test(CLOSURE_SRC), false, 'zone語彙を正として持たない');
  assert.equal(/['"]corner['"]/.test(CLOSURE_SRC), false, 'zone語彙を正として持たない');
  assert.equal(/\[\s*['"]1['"]\s*,/.test(CLOSURE_SRC), false, 'floor語彙を正として持たない');

  // 導出していることを積極的に確認する（「書いていない」だけでは不十分）
  assert.match(CLOSURE_SRC, /Object\.keys\(container\)/);
  assert.match(CLOSURE_SRC, /positivePressureByFloor/);
  assert.match(CLOSURE_SRC, /negativePressureByZone/);
});

test('P2J-C37: Evidence validator を複製していない', () => {
  // positive control: これらは evidence.js 側では実際に検出できる
  assert.match(EVIDENCE_SRC, /\\d\{4\}-\\d\{2\}-\\d\{2\}/, 'positive control: checkedAt regex');
  assert.match(EVIDENCE_SRC, /drive\\\.google/, 'positive control: private provider pattern');
  assert.match(EVIDENCE_SRC, /new URL\(/, 'positive control: URL parsing');

  assert.equal(/\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(CLOSURE_SRC), false, 'checkedAt regexを複製しない');
  assert.equal(/drive\\?\.google|notion\\?\.(so|com)|sharepoint|dropbox/.test(CLOSURE_SRC), false,
    'private provider denylistを複製しない');
  assert.equal(/new URL\(/.test(CLOSURE_SRC), false, 'URL解析を複製しない');
  assert.equal(/access_token|apikey|api_key/.test(CLOSURE_SRC), false, 'credential regexを複製しない');
  assert.equal(/EVIDENCE_LEVELS\s*=/.test(CLOSURE_SRC), false, 'evidence level値域を複製しない');

  // 正を呼んでいることを積極的に確認する
  assert.match(CLOSURE_SRC, /Evidence\.makeEvidence\(/);
  assert.match(CLOSURE_SRC, /Evidence\.canonicalizeSourceReference\(/);
  assert.match(CLOSURE_SRC, /Evidence\.assertOrdinaryObject\(/);
  assert.match(CLOSURE_SRC, /Ledger\.KNOWN_FACT_KEYS/);
  assert.match(CLOSURE_SRC, /Registry\.getPreset\(/);
  assert.equal(/require\(['"]\.\/miyoshi\.js['"]\)/.test(CLOSURE_SRC), false,
    '案件moduleを直接requireしない');
});

// ============================================================
// §27 / §36 現状は一切動かさない
// ============================================================

test('P2J-C38: リポジトリに実案件Observationが存在しない', () => {
  const repoRoot = path.join(__dirname, '..');
  const suspicious = fs.readdirSync(repoRoot)
    .concat(fs.readdirSync(path.join(repoRoot, 'project-config')).map((f) => 'project-config/' + f))
    .filter((f) => /observation/i.test(f));
  assert.deepEqual(suspicious, [], '実案件Observationのデータファイルを置かない');
  // moduleが現行値をObservationとして埋め込んでいないこと
  [1297, 1525, 1695, 1729, 918, 1122].forEach((v) => {
    assert.equal(CLOSURE_SRC.includes(String(v)), false,
      '現行圧力値 ' + v + ' が closure module に現れてはならない');
  });
});

test('P2J-C39: Observation正規化は現案件のfactを一切変更しない', () => {
  const c = Closure.createProjectScopeContract(PROJECT);
  Closure.normalizeObservationSet([
    synObservation(),
    positivePressureObservation(c.floors[0]),
    negativePressureObservation(c.zones[0]),
    evaluationHeightObservation(c.floors[0])
  ], PROJECT);
  Closure.listRequiredObservationSlots(PROJECT);

  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.value, 1250);
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.value, 2050);
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');
  assert.equal(MiyoshiProjectConfig.wind.positivePressureByFloor['1'].value, 1297);
  assert.equal(MiyoshiProjectConfig.wind.positivePressureByFloor['2'].value, 1525);
  assert.equal(MiyoshiProjectConfig.wind.positivePressureByFloor['3'].value, 1695);
  assert.equal(MiyoshiProjectConfig.wind.positivePressureByFloor.R.value, 1729);
  assert.equal(MiyoshiProjectConfig.wind.negativePressureByZone.general.value, 918);
  assert.equal(MiyoshiProjectConfig.wind.negativePressureByZone.corner.value, 1122);
  Object.keys(MiyoshiProjectConfig.wind.positivePressureByFloor).forEach((k) => {
    assert.equal(MiyoshiProjectConfig.wind.positivePressureByFloor[k].verificationStatus,
      'partially_verified');
  });
});

// ============================================================
// Wave 3: Closure Evaluation / Promotion Candidate
// ============================================================

/**
 * 合成presetを使う隔離context（packet §40）。
 *
 * Node の `vm` は使わない。実測したところ、vm realm で作られた object の
 * prototype は host realm の `Object.prototype` と**別物**であり、
 * Wave 1 の構造ガード（host realm の evidence.js が持つ）がそれを拒否する。
 * closure module が内部で組み立てる ledger entry spec まで落ちるため、
 * moduleのロジックと無関係な理由でテストできなくなる。
 *
 * そこで同一realmで隔離する: `globalThis.PresetRegistry` を一時的に差し替え、
 * require cache を落として module を再評価する。
 * **本番registryには合成presetを登録しない。**
 */
function makeSyntheticPreset() {
  return {
    projectId: 'synthetic_closure_test',
    hasFixedPreset: true,
    getPublicLabel: function () { return 'synthetic closure test fixture'; },
    dimensions: {
      mode: 'synthetic_fixture',
      defaultW: { value: 777, unit: 'mm' },
      defaultH: { value: 1888, unit: 'mm' }
    },
    wind: {
      positivePressureByFloor: {
        A: { value: 3111, unit: 'N/m\u00b2' },
        B: { value: 3222, unit: 'N/m\u00b2' }
      },
      negativePressureByZone: {
        inner: { value: 4111, unit: 'N/m\u00b2' },
        outer: { value: 4222, unit: 'N/m\u00b2' }
      }
    }
  };
}

const SYN_PROJECT = 'synthetic_closure_test';

function withSyntheticRegistry(fn) {
  const preset = makeSyntheticPreset();
  const registry = {
    getPreset: function (id) {
      if (id !== preset.projectId) {
        throw new Error('getPreset(): unknown projectId: ' + JSON.stringify(id));
      }
      return preset;
    },
    hasPreset: function (id) { return id === preset.projectId; },
    listPresets: function () {
      return [{ projectId: preset.projectId, publicLabel: preset.getPublicLabel() }];
    }
  };
  const closurePath = require.resolve('../project-config/evidence-closure.js');
  const savedCache = require.cache[closurePath];
  const savedRegistry = globalThis.PresetRegistry;
  const savedClosure = globalThis.EvidenceClosure;
  delete require.cache[closurePath];
  globalThis.PresetRegistry = registry;
  let mod;
  try {
    mod = require(closurePath);
    return fn(mod, preset);
  } finally {
    delete require.cache[closurePath];
    if (savedCache) { require.cache[closurePath] = savedCache; }
    globalThis.PresetRegistry = savedRegistry;
    globalThis.EvidenceClosure = savedClosure;
  }
}

/** 合成preset向けの、全slotを満たすObservation集合を作る。 */
function fullSyntheticObservations() {
  const ev = () => synEvidence();
  const mk = (factKey, scope, observedValue, unit) => ({
    schemaVersion: 1,
    observationType: 'evidence_closure_observation',
    factKey: factKey,
    scope: scope,
    observedValue: observedValue,
    unit: unit,
    evidence: ev(),
    sourceReference: null
  });
  const P = 'N/m\u00b2';
  return [
    mk('pane_width_mm', null, 777, 'mm'),
    mk('pane_height_mm', null, 1888, 'mm'),
    mk('positive_pressure', { floor: 'A' }, 3111, P),
    mk('positive_pressure', { floor: 'B' }, 3222, P),
    mk('negative_pressure', { zone: 'inner' }, 4111, P),
    mk('negative_pressure', { zone: 'outer' }, 4222, P),
    mk('evaluation_height', { floor: 'A' }, 12.345, 'm'),
    mk('evaluation_height', { floor: 'B' }, 18.75, 'm')
  ];
}

const bySlot = (result) => {
  const m = Object.create(null);
  result.factResults.forEach((f) => { m[f.slotKey] = f; });
  return m;
};
const categoryOf = (result, id) =>
  result.categoryResults.filter((c) => c.categoryId === id)[0];

// ------------------------------------------------------------
// §41 実案件の現状（合成Observationを作らない）
// ------------------------------------------------------------

test('P2J-C40: 実案件の closure は observations 0 件で BLOCKED である', () => {
  const r = Closure.evaluateClosure(PROJECT, []);
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.requiredSlotCount, 12);
  assert.equal(r.readySlotCount, 0);
  assert.equal(r.categoryCount, 4);
  assert.equal(r.readyCategoryCount, 0);
  assert.equal(r.readyCaseScopeCount, 0);
  assert.equal(r.promotionCandidate, null);

  r.factResults.forEach((f) => {
    assert.equal(f.observationPresent, false);
    assert.equal(f.candidateValue, null);
    assert.equal(f.evidenceGateStatus, null, 'Observationが無ければgateは評価されない');
    assert.equal(f.closureStatus, 'BLOCKED');
    assert.equal(f.blockerKinds.includes('MISSING_OBSERVATION'), true);
  });
  r.caseReadiness.forEach((c) => assert.equal(c.readinessStatus, 'BLOCKED'));

  // 現状は一切動かない
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
});

test('P2J-C41: 欠測時の INSUFFICIENT_EVIDENCE は canonical reconciliation 由来である', () => {
  const r = Closure.evaluateClosure(PROJECT, []);
  const m = bySlot(r);
  // 突き合わせ対象がある fact は canonical な INSUFFICIENT_EVIDENCE になる
  ['pane_width_mm', 'pane_height_mm'].forEach((k) => {
    assert.equal(m[k].reconciliationApplicable, true);
    assert.equal(m[k].reconciliationStatus, 'INSUFFICIENT_EVIDENCE');
  });
  // 同じ値を canonical API から直接得られること（別アルゴリズムを作っていない）
  assert.equal(EvidenceLedger.reconcileFact(1250, null).status, 'INSUFFICIENT_EVIDENCE');

  // currentValue は「現在のpresetの主張」であって verified ではない
  assert.equal(m.pane_width_mm.currentValue, 1250);
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.verificationStatus, 'unverified');
  assert.equal('verified' in m.pane_width_mm, false, 'fact結果に verified: true を置かない');
});

test('P2J-C42: 実案件の evaluation_height は突き合わせ不能として扱われる', () => {
  const r = Closure.evaluateClosure(PROJECT, []);
  r.factResults.filter((f) => f.factKey === 'evaluation_height').forEach((f) => {
    assert.equal(f.reconciliationApplicable, false);
    assert.equal(f.reconciliationStatus, null);
    assert.equal(f.currentValue, null, '突き合わせるべき現在の主張が存在しない');
  });
  // 前提の裏取り: current config に評価高さ/Z のキーが無い（Wave 1 実測の再確認）
  assert.deepEqual(
    Object.keys(MiyoshiProjectConfig.wind).filter((k) => /height|evaluation|^Z$/i.test(k)), []);
});

// ------------------------------------------------------------
// §42 合成 READY パス
// ------------------------------------------------------------

test('P2J-C43: 合成presetで全slotが揃えば READY_CANDIDATE になる', () => {
  withSyntheticRegistry((C, preset) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations());

    assert.equal(r.requiredSlotCount, 8, '2 + 2 + 2 + 2（合成topologyから導出）');
    assert.equal(r.readySlotCount, 8);
    assert.equal(r.readyCategoryCount, 4);
    assert.equal(r.caseScopeCount, 4, '2 floors × 2 zones');
    assert.equal(r.readyCaseScopeCount, 4);
    assert.equal(r.status, 'READY_CANDIDATE');
    assert.deepEqual(r.blockerKinds, []);

    r.factResults.forEach((f) => {
      assert.equal(f.evidenceGateStatus, 'PASS', f.slotKey);
      assert.equal(f.closureStatus, 'READY_CANDIDATE', f.slotKey);
    });
    // 突き合わせ可能な fact は MATCH、evaluation_height は null
    const m = bySlot(r);
    assert.equal(m.pane_width_mm.reconciliationStatus, 'MATCH');
    assert.equal(m['positive_pressure|floor=A'].reconciliationStatus, 'MATCH');
    assert.equal(m['evaluation_height|floor=A'].reconciliationStatus, null);

    assert.notEqual(r.promotionCandidate, null);
    assert.equal(r.promotionCandidate.candidateStatus, 'READY_CANDIDATE');
    assert.equal(r.promotionCandidate.notApplied, true);
    assert.equal(r.promotionCandidate.currentConfigMutated, false);
    assert.equal(r.promotionCandidate.proposedFacts.length, 8);

    // 合成preset自体は変更されない
    assert.equal(preset.dimensions.defaultW.value, 777);
    assert.equal(preset.wind.positivePressureByFloor.A.value, 3111);
    assert.equal('verifiedCases' in preset, false);
  });
});

test('P2J-C44: 本番registryは合成presetに汚染されていない', () => {
  withSyntheticRegistry((C) => { C.evaluateClosure(SYN_PROJECT, []); });
  assert.equal(PresetRegistry.hasPreset(SYN_PROJECT), false);
  assert.deepEqual(PresetRegistry.BUILT_IN_PRESET_IDS.slice(), ['miyoshi']);
  // 復帰後も実案件の評価が従来どおり動く
  assert.equal(Closure.evaluateClosure(PROJECT, []).status, 'BLOCKED');
});

// ------------------------------------------------------------
// §43 Evidence 不十分
// ------------------------------------------------------------

test('P2J-C45: 値が一致していてもEvidence不十分なら BLOCKED（Wave2/3の分離）', () => {
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations();
    // 構造的には妥当なObservationのまま、昇格十分性だけを失わせる
    obs[0].evidence = synEvidence({ level: 'indirect', privateReferenceAvailable: false });
    const r = C.evaluateClosure(SYN_PROJECT, obs);
    const m = bySlot(r);

    assert.equal(m.pane_width_mm.observationPresent, true, 'Observation自体は成立している');
    assert.equal(m.pane_width_mm.candidateValue, 777, '観測値は失われない');
    assert.equal(m.pane_width_mm.currentValue, 777, '値は現在の主張と一致している');
    assert.equal(m.pane_width_mm.evidenceGateStatus, 'FAIL');
    assert.equal(m.pane_width_mm.reconciliationStatus, 'INSUFFICIENT_EVIDENCE',
      '値が一致していても、Evidenceが先で数値は後');
    assert.equal(m.pane_width_mm.closureStatus, 'BLOCKED');
    assert.equal(m.pane_width_mm.blockerKinds.includes('INSUFFICIENT_EVIDENCE'), true);

    assert.equal(categoryOf(r, 'pane_visible_dimensions').status, 'BLOCKED');
    // 寸法は全case scopeのcritical factなので、全scopeが落ちる
    r.caseReadiness.forEach((c) => assert.equal(c.readinessStatus, 'BLOCKED'));
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.promotionCandidate, null);
  });
});

test('P2J-C46: primary でも reference が無ければ gate FAIL', () => {
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations();
    obs[2].evidence = synEvidence({ privateReferenceAvailable: false });
    const r = C.evaluateClosure(SYN_PROJECT, obs);
    const m = bySlot(r);
    assert.equal(m['positive_pressure|floor=A'].evidenceGateStatus, 'FAIL');
    assert.match(m['positive_pressure|floor=A'].evidenceGateReason, /promotion gate/);
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.promotionCandidate, null);
  });
});

// ------------------------------------------------------------
// §44 MISMATCH
// ------------------------------------------------------------

test('P2J-C47: MISMATCH は BLOCKED で、自動修復しない', () => {
  withSyntheticRegistry((C, preset) => {
    const obs = fullSyntheticObservations();
    obs[3].observedValue = 9999; // positive_pressure|floor=B（現在は3222）
    const r = C.evaluateClosure(SYN_PROJECT, obs);
    const m = bySlot(r);

    assert.equal(m['positive_pressure|floor=B'].evidenceGateStatus, 'PASS');
    assert.equal(m['positive_pressure|floor=B'].reconciliationStatus, 'MISMATCH');
    assert.equal(m['positive_pressure|floor=B'].closureStatus, 'BLOCKED');
    assert.equal(m['positive_pressure|floor=B'].blockerKinds.includes('MISMATCH'), true);
    assert.equal(m['positive_pressure|floor=B'].candidateValue, 9999);
    assert.equal(m['positive_pressure|floor=B'].currentValue, 3222);

    assert.equal(categoryOf(r, 'positive_pressure_source').status, 'BLOCKED');
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.promotionCandidate, null);
    assert.equal(r.blockerKinds.includes('MISMATCH'), true);

    // 現在のpresetは変わらない（Evidence値で上書きしない）
    assert.equal(preset.wind.positivePressureByFloor.B.value, 3222);

    // floor A 側は影響を受けない（部分的進捗は残る）
    assert.equal(m['positive_pressure|floor=A'].closureStatus, 'READY_CANDIDATE');
  });
});

// ------------------------------------------------------------
// §45 evaluation_height
// ------------------------------------------------------------

test('P2J-C48: evaluation_height は MATCH を報告せずに READY_CANDIDATE になりうる', () => {
  withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations());
    const z = bySlot(r)['evaluation_height|floor=A'];
    assert.equal(z.evidenceGateStatus, 'PASS');
    assert.equal(z.reconciliationApplicable, false);
    assert.equal(z.reconciliationStatus, null, 'MATCH と書いてはならない');
    assert.equal(z.currentValue, null);
    assert.equal(z.closureStatus, 'READY_CANDIDATE');
    // 「Zが現在値と一致した」ではなく「欠けていたZに昇格十分な根拠が付いた」
    assert.notEqual(z.reconciliationStatus, 'MATCH');
    assert.notEqual(z.reconciliationStatus, 'MISMATCH');
  });
});

// ------------------------------------------------------------
// §46 / §21 exact pairing
// ------------------------------------------------------------

test('P2J-C49: floor↔Z の対応は「Z観測の件数」では閉じない', () => {
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations()
      .filter((o) => !(o.factKey === 'evaluation_height' && o.scope.floor === 'A'));
    // floor B の Z はある。件数だけ数える実装なら「1件ある」で通ってしまう。
    assert.equal(obs.filter((o) => o.factKey === 'evaluation_height').length, 1);

    const r = C.evaluateClosure(SYN_PROJECT, obs);
    const m = bySlot(r);
    assert.equal(m['evaluation_height|floor=B'].closureStatus, 'READY_CANDIDATE');
    assert.equal(m['evaluation_height|floor=A'].closureStatus, 'BLOCKED');

    const mapping = categoryOf(r, 'floor_evaluation_height_mapping');
    assert.equal(mapping.status, 'BLOCKED');
    assert.deepEqual(mapping.blockedSlotKeys, ['evaluation_height|floor=A']);

    // floor A の case scope だけが落ち、floor B は落ちない
    const caseOf = (floor, zone) => r.caseReadiness.filter(
      (c) => c.scope.floor === floor && c.scope.zone === zone)[0];
    assert.equal(caseOf('A', 'inner').readinessStatus, 'BLOCKED');
    assert.equal(caseOf('A', 'outer').readinessStatus, 'BLOCKED');
    assert.equal(caseOf('B', 'inner').readinessStatus, 'READY_CANDIDATE');
    assert.equal(caseOf('B', 'outer').readinessStatus, 'READY_CANDIDATE');
    assert.equal(r.status, 'BLOCKED');
  });
});

// ------------------------------------------------------------
// §25 / §47 case scope 隔離
// ------------------------------------------------------------

test('P2J-C50: case scope は自分の floor / zone の fact だけを見る', () => {
  withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations());
    assert.equal(r.caseScopeCount, 4);
    r.caseReadiness.forEach((c) => {
      assert.deepEqual(c.consideredSlotKeys, [
        'pane_width_mm',
        'pane_height_mm',
        'positive_pressure|floor=' + c.scope.floor,
        'negative_pressure|zone=' + c.scope.zone,
        'evaluation_height|floor=' + c.scope.floor
      ]);
      // 他scopeのfactを混ぜていない
      const other = c.scope.floor === 'A' ? 'B' : 'A';
      const otherZone = c.scope.zone === 'inner' ? 'outer' : 'inner';
      assert.equal(c.consideredSlotKeys.includes('positive_pressure|floor=' + other), false);
      assert.equal(c.consideredSlotKeys.includes('evaluation_height|floor=' + other), false);
      assert.equal(c.consideredSlotKeys.includes('negative_pressure|zone=' + otherZone), false);
    });
  });
});

test('P2J-C51: case readiness は Phase 2F の case 契約に委ねられている', () => {
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations()
      .filter((o) => o.factKey !== 'evaluation_height');
    const r = C.evaluateClosure(SYN_PROJECT, obs);
    r.caseReadiness.forEach((c) => {
      // 算定由来provenanceを主張するので evaluation_height が必須になる
      assert.equal(c.requiredFactKeys.includes('evaluation_height'), true);
      assert.equal(c.missingFactKeys.includes('evaluation_height'), true);
      assert.equal(c.readinessStatus, 'BLOCKED');
    });
    // 既存APIの `verified` をそのまま外へ出していない
    r.caseReadiness.forEach((c) => assert.equal('verified' in c, false));
    assert.equal(r.blockerKinds.includes('CASE_NOT_READY'), true);
  });
});

// ------------------------------------------------------------
// §22 部分closure
// ------------------------------------------------------------

test('P2J-C52: 部分的な進捗は失われない', () => {
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations()
      .filter((o) => o.factKey !== 'negative_pressure');
    const r = C.evaluateClosure(SYN_PROJECT, obs);
    assert.equal(r.status, 'BLOCKED');
    assert.equal(categoryOf(r, 'pane_visible_dimensions').status, 'READY_CANDIDATE');
    assert.equal(categoryOf(r, 'positive_pressure_source').status, 'READY_CANDIDATE');
    assert.equal(categoryOf(r, 'negative_pressure_source').status, 'BLOCKED');
    assert.equal(categoryOf(r, 'floor_evaluation_height_mapping').status, 'READY_CANDIDATE');
    assert.equal(r.readyCategoryCount, 3);
    assert.equal(r.categoryCount, 4);
    assert.equal(r.readySlotCount, 6);
    assert.equal(r.promotionCandidate, null);
  });
});

// ------------------------------------------------------------
// §37 / §38 determinism / immutability
// ------------------------------------------------------------

test('P2J-C53: 同じ観測集合なら入力順に依存せず同じ評価になる', () => {
  withSyntheticRegistry((C) => {
    const base = fullSyntheticObservations();
    const shuffled = [base[5], base[0], base[7], base[2], base[4], base[1], base[6], base[3]];
    const a = C.evaluateClosure(SYN_PROJECT, base);
    const b = C.evaluateClosure(SYN_PROJECT, shuffled);
    assert.deepEqual(JSON.parse(JSON.stringify(a.factResults)),
      JSON.parse(JSON.stringify(b.factResults)));
    assert.deepEqual(JSON.parse(JSON.stringify(a.categoryResults)),
      JSON.parse(JSON.stringify(b.categoryResults)));
    assert.deepEqual(JSON.parse(JSON.stringify(a.caseReadiness)),
      JSON.parse(JSON.stringify(b.caseReadiness)));
    assert.equal(a.status, b.status);
    assert.equal(C.serializePromotionCandidate(a.promotionCandidate),
      C.serializePromotionCandidate(b.promotionCandidate));
  });
});

test('P2J-C54: 評価結果は deep freeze され、呼び出し側の後変更に影響されない', () => {
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations();
    const r = C.evaluateClosure(SYN_PROJECT, obs);
    assert.equal(Object.isFrozen(r), true);
    assert.equal(Object.isFrozen(r.factResults), true);
    assert.equal(Object.isFrozen(r.factResults[0]), true);
    assert.equal(Object.isFrozen(r.promotionCandidate), true);

    const before = C.serializePromotionCandidate(r.promotionCandidate);
    obs[0].observedValue = 999999;
    obs[0].evidence.level = 'none';
    assert.equal(bySlot(r).pane_width_mm.candidateValue, 777);
    assert.equal(C.serializePromotionCandidate(r.promotionCandidate), before);
    assert.throws(() => { r.factResults[0].closureStatus = 'READY_CANDIDATE'; }, TypeError);
  });
});

// ------------------------------------------------------------
// §33 / §34 / §50 candidate gate と一方向export
// ------------------------------------------------------------

test('P2J-C55: exporter は builder が作った candidate しか受け付けない', () => {
  withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations());
    const json = C.serializePromotionCandidate(r.promotionCandidate);
    assert.equal(typeof json, 'string');

    // 形だけ真似た偽candidate
    const forged = {
      schemaVersion: 1,
      candidateType: 'project_evidence_promotion_candidate',
      projectId: SYN_PROJECT,
      candidateStatus: 'READY_CANDIDATE',
      proposedFacts: [],
      gateSummary: {},
      notApplied: true,
      currentConfigMutated: false,
      warning: 'x'
    };
    assert.throws(() => C.serializePromotionCandidate(forged),
      /requires a candidate created by evaluateClosure/);
    // 構造をまるごと複製しても通らない
    const cloned = JSON.parse(JSON.stringify(r.promotionCandidate));
    assert.throws(() => C.serializePromotionCandidate(cloned),
      /requires a candidate created by evaluateClosure/);
    // 読み戻したJSONも入力にならない
    assert.throws(() => C.serializePromotionCandidate(JSON.parse(json)),
      /requires a candidate created by evaluateClosure/);
    [null, undefined, 'x', 42, []].forEach((v) => {
      assert.throws(() => C.serializePromotionCandidate(v),
        /requires a candidate created by evaluateClosure/);
    });
  });
});

test('P2J-C56: candidate JSON は決定的で、出してはいけないものを含まない', () => {
  withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations());
    const a = C.serializePromotionCandidate(r.promotionCandidate);
    const b = C.serializePromotionCandidate(r.promotionCandidate);
    assert.equal(a, b, '同じcandidateはbyte一致するJSONになる');

    const parsed = JSON.parse(a);
    assert.deepEqual(Object.keys(parsed), [
      'schemaVersion', 'candidateType', 'projectId', 'candidateStatus',
      'notApplied', 'currentConfigMutated', 'warning', 'gateSummary', 'proposedFacts'
    ], '明示的なkey順');
    assert.equal(parsed.notApplied, true);
    assert.equal(parsed.currentConfigMutated, false);
    assert.match(parsed.warning, /not current project truth/);

    // 含めてはいけないもの
    ['generatedAt', 'timestamp', 'currentConfig', 'verifiedCases', 'dimensions', 'wind']
      .forEach((k) => assert.equal(a.includes('"' + k + '"'), false, k + ' を出力しない'));
    // 現在の真実と誤読される名前を使わない
    ['"approved"', '"verifiedCurrent"', '"promotionApplied"', '"verificationStatus"']
      .forEach((k) => assert.equal(a.includes(k), false, k + ' を使わない'));
    assert.equal(a.includes('"proposedVerificationStatus"'), true,
      '生成された提案であることが名前で分かる');

    assert.deepEqual(Object.keys(parsed.proposedFacts[0]), [
      'slotKey', 'factKey', 'scope', 'observedValue', 'unit',
      'proposedVerificationStatus', 'reconciliationApplicable', 'reconciliationStatus',
      'evidence', 'sourceReference'
    ]);
  });
});

// ------------------------------------------------------------
// §48 privacy
// ------------------------------------------------------------

test('P2J-C57: private marker は評価・candidate・export のどこにも現れない', () => {
  withSyntheticRegistry((C) => {
    const MARKER = 'PRIVATEMARKERZZZ9';
    // positive control: この marker は実際に検出可能である
    assert.equal(JSON.stringify({ x: 'a' + MARKER + 'b' }).includes(MARKER), true);

    // private参照を publicDescription に忍ばせた観測は、そもそも通らない
    const withPrivate = fullSyntheticObservations();
    withPrivate[0].evidence = synEvidence({
      publicDescription: 'https://drive.google.com/file/d/' + MARKER + '/view'
    });
    assert.throws(() => C.evaluateClosure(SYN_PROJECT, withPrivate),
      /must not contain private URLs\/paths\/identifiers/);

    // 正常系の出力にも marker は現れない
    const r = C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations());
    const json = C.serializePromotionCandidate(r.promotionCandidate);
    assert.equal(JSON.stringify(r).includes(MARKER), false);
    assert.equal(json.includes(MARKER), false);

    // private Evidence でも sourceReference は null のまま
    r.promotionCandidate.proposedFacts.forEach((f) => {
      assert.equal(f.evidence.privateReferenceAvailable, true);
      assert.equal(f.sourceReference, null);
    });
    ['drive.google', 'notion.', 'sharepoint', 'C:\\', '/home/', '/Users/']
      .forEach((p) => assert.equal(json.includes(p), false, p + ' を含まない'));
  });
});

// ------------------------------------------------------------
// §32 non-mutating / §51 source reuse / §52 literal guard
// ------------------------------------------------------------

test('P2J-C58: closure 評価は current config を一切変更しない', () => {
  const snapshot = JSON.stringify({
    verifiedCases: MiyoshiProjectConfig.verifiedCases,
    dimensions: MiyoshiProjectConfig.dimensions,
    wind: MiyoshiProjectConfig.wind
  });
  const r = Closure.evaluateClosure(PROJECT, []);
  assert.equal(r.status, 'BLOCKED');
  withSyntheticRegistry((C) => {
    const rr = C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations());
    C.serializePromotionCandidate(rr.promotionCandidate);
  });
  assert.equal(JSON.stringify({
    verifiedCases: MiyoshiProjectConfig.verifiedCases,
    dimensions: MiyoshiProjectConfig.dimensions,
    wind: MiyoshiProjectConfig.wind
  }), snapshot, '評価・candidate生成・serialize の前後で構造的に等しい');
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
});

test('P2J-C59: Wave 3 も既存contractを呼び、判定を複製しない', () => {
  assert.match(CLOSURE_SRC, /Evidence\.assertPromotionGate\(/);
  assert.match(CLOSURE_SRC, /Ledger\.createEntry\(/);
  assert.match(CLOSURE_SRC, /Ledger\.reconcileFact\(/);
  assert.match(CLOSURE_SRC, /Ledger\.evaluateCasePromotion\(/);
  assert.match(CLOSURE_SRC, /Ledger\.createLedger\(/);
  assert.match(CLOSURE_SRC, /Registry\.getPreset\(/);

  // case critical fact の一覧を自前で持たない
  assert.equal(/CASE_TYPE_CRITICAL_FACTS\s*=/.test(CLOSURE_SRC), false);
  assert.equal(/claimsCalculationProvenance\s*:\s*false/.test(CLOSURE_SRC), false);
  // Evidence level から verificationStatus への自前mappingを持たない
  assert.equal(/primary[\s\S]{0,40}=>[\s\S]{0,20}verified/.test(CLOSURE_SRC), false);
});

test('P2J-C60: generic module に現案件の数値が入っていない（C38の原則を継続）', () => {
  [1297, 1525, 1695, 1729, 918, 1122, 1250, 2050, 34].forEach((v) => {
    assert.equal(new RegExp('\\b' + v + '\\b').test(CLOSURE_SRC), false,
      '現案件の値 ' + v + ' が generic module に現れてはならない');
  });
  // 合成preset値もmoduleには無い（テスト側だけにある）
  [777, 1888, 3111, 3222, 4111, 4222].forEach((v) => {
    assert.equal(new RegExp('\\b' + v + '\\b').test(CLOSURE_SRC), false);
  });
});

test('P2J-C61: floor↔Z カテゴリは正圧側の対応も要求する', () => {
  // Wave 3 の mutation で、このカテゴリから正圧slotを落とす mutant が**生存**した。
  // §21 が言う対応関係は「階 ↔ 現在の正圧の主張 ↔ 根拠のある評価高さ」であって、
  // Zが揃っただけでは対応が言えない。Z側しか見ない実装を許すと、
  // 正圧が MISMATCH のままでも対応カテゴリが READY と読めてしまう。
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations();
    obs[3].observedValue = 9999; // positive_pressure|floor=B を現在の主張とずらす
    const r = C.evaluateClosure(SYN_PROJECT, obs);
    const m = bySlot(r);

    // Z側は全て揃っている（それでも対応は閉じない、が要点）
    assert.equal(m['evaluation_height|floor=A'].closureStatus, 'READY_CANDIDATE');
    assert.equal(m['evaluation_height|floor=B'].closureStatus, 'READY_CANDIDATE');
    assert.equal(m['positive_pressure|floor=B'].closureStatus, 'BLOCKED');

    const mapping = categoryOf(r, 'floor_evaluation_height_mapping');
    assert.equal(mapping.status, 'BLOCKED',
      '正圧が閉じていない階は floor↔Z の対応も閉じない');
    assert.equal(mapping.requiredSlotKeys.includes('positive_pressure|floor=B'), true,
      'カテゴリの要求に正圧slotが含まれている');
    assert.deepEqual(mapping.blockedSlotKeys, ['positive_pressure|floor=B']);
  });
});

test('P2J-C62: 概念カテゴリは必須slotを漏れなく覆う', () => {
  // §26 は slot完全性 / category完全性 / case完全性 の3条件を**わざと重複**させている。
  // その重複が意味を持つのは「categoryがslotを覆っている」間だけである。
  // 新しい closure fact を足してカテゴリに入れ忘れると、
  // slot側の判定だけが効く状態になり、重複の前提が静かに崩れる。
  // ここではその前提そのものを固定する。
  const check = (result) => {
    const covered = new Set();
    result.categoryResults.forEach((c) => c.requiredSlotKeys.forEach((k) => covered.add(k)));
    const required = result.factResults.map((f) => f.slotKey);
    required.forEach((k) => assert.equal(covered.has(k), true,
      k + ' はどのカテゴリにも要求されていない'));
    assert.equal(covered.size, required.length, 'カテゴリは存在しないslotを要求しない');
  };
  check(Closure.evaluateClosure(PROJECT, []));
  withSyntheticRegistry((C) => check(C.evaluateClosure(SYN_PROJECT, fullSyntheticObservations())));
});

test('P2J-C63: blockerKinds は正規化された順序で返る', () => {
  // 出力順を約束しないままにすると、呼び出し側の比較が
  // slotの評価順という実装詳細に依存してしまう。正規形を明示して固定する。
  withSyntheticRegistry((C) => {
    const obs = fullSyntheticObservations();
    obs[3].observedValue = 9999;                                   // MISMATCH
    obs[0].evidence = synEvidence({ level: 'indirect', privateReferenceAvailable: false });
    const r = C.evaluateClosure(SYN_PROJECT, obs.filter((o, i) => i !== 6)); // MISSING も混ぜる

    assert.equal(r.blockerKinds.length > 1, true, '前提: 複数種のblockerが出ている');
    assert.deepEqual(r.blockerKinds.slice(), r.blockerKinds.slice().sort(),
      'blockerKinds は昇順の正規形で返る');
    assert.deepEqual(r.blockerKinds.slice(),
      ['CASE_NOT_READY', 'INSUFFICIENT_EVIDENCE', 'MISMATCH', 'MISSING_OBSERVATION']);
    // 重複しない
    assert.equal(new Set(r.blockerKinds).size, r.blockerKinds.length);
  });
});
