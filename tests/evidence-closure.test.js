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
  const attacks = [
    'https://drive.google.com/file/d/xyz/view の記載',
    'notion.so のページを参照',
    'C:\\\\share\\\\案件\\\\計算書',
    '\\\\\\\\fileserver\\\\projects\\\\calc',
    '/Users/someone/Documents/calc',
    '/home/someone/calc',
    'www.example.jp を参照',
    'ref abcdefghijklmnopqrstuvwxyz0123456789'
  ];
  attacks.forEach((text) => {
    assert.throws(
      () => norm(synObservation({ evidence: synEvidence({ publicDescription: text }) })),
      /must not contain private URLs\/paths\/identifiers/,
      'must reject: ' + text);
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

test('P2J-C34: Wave 2 は reconciliation を行わない', () => {
  // positive control: 期待する語が実際に検出できる正規表現であることを先に確かめる
  const ledgerSrc = fs.readFileSync(
    path.join(__dirname, '..', 'project-config', 'evidence-ledger.js'), 'utf8');
  assert.match(ledgerSrc, /INSUFFICIENT_EVIDENCE/, 'positive control: 検出できる語である');

  assert.equal(/MATCH|MISMATCH|INSUFFICIENT_EVIDENCE/.test(CLOSURE_SRC), false,
    'Wave 2 は reconciliation status を公開しない');
  assert.equal(/reconcileFact/.test(CLOSURE_SRC), false, 'Wave 2 は reconcileFact を呼ばない');
  Object.keys(Closure).forEach((k) => {
    assert.equal(/reconcil|match|mismatch/i.test(k), false, 'export ' + k + ' はWave 3の語を含まない');
  });
});

test('P2J-C35: Wave 2 は Promotion Candidate / apply API を持たない', () => {
  ['applyPromotionCandidate', 'promoteConfig', 'setVerified', 'updateVerifiedCases',
    'candidateToPreset', 'buildPromotionCandidate', 'assertPromotionGate']
    .forEach((name) => {
      assert.equal(CLOSURE_SRC.includes(name), false, name + ' は Wave 2 に存在してはならない');
      assert.equal(typeof Closure[name], 'undefined', name + ' は export されない');
    });
  // export面が Wave 2 の責務に限られていること
  assert.deepEqual(Object.keys(Closure).sort(), [
    'CLOSURE_FACT_KEYS', 'FACT_SCOPE_KIND', 'FACT_UNITS', 'MAX_OBSERVATIONS',
    'OBSERVATION_SCHEMA_VERSION', 'OBSERVATION_TYPE',
    'createProjectScopeContract', 'getObservationSlotKey',
    'listRequiredObservationSlots', 'normalizeObservation', 'normalizeObservationSet'
  ]);
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
