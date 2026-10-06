'use strict';

/**
 * Phase 2L-A: みよし案件 primary Evidence Observation の取り込み。
 *
 * 取り込むのは 階別正圧 / 部位別負圧 / 階→評価高さ Z の 10 件だけである。
 * pane W/H は意図的に取り込まない（Phase 2L-B）。
 *
 * ── 期待値は導出する ──────────────────────────────────────
 *
 * closure の期待件数（ready slot / category / case scope）は、Observation 集合と
 * 必要slotの構造から**この test 自身が導出**し、evaluateClosure() の結果と突き合わせる。
 * そのうえで Human Gate が明記した数（10/12, 3/4, 0/8）とも一致することを確かめる。
 * 数だけを書き写した test は、結果をそのまま期待値にしても通ってしまう。
 *
 * ── MATCH が空虚でないこと ─────────────────────────────────
 *
 * 一次資料の値と preset の値は一致している。一致しているものに MATCH が出るのは
 * 当然なので、それだけでは比較が実行されたことの証拠にならない。値を 1 だけずらした
 * copy で MISMATCH が出ること、gate を満たさない copy で INSUFFICIENT_EVIDENCE が
 * 出ることを、正の対照として併せて固定する。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const Closure = require('../project-config/evidence-closure.js');
const Evidence = require('../project-config/evidence.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');
const Intake = require('../project-config/miyoshi-observations.js');
const Wind = require('../wind-pressure.js');

const ROOT = path.join(__dirname, '..');
const MODULE_REL = 'project-config/miyoshi-observations.js';
const MODULE_SRC = fs.readFileSync(path.join(ROOT, MODULE_REL), 'utf8');
const PROJECT = Intake.projectId;

/**
 * Human が提示した一次資料の値。**手書きの oracle** であり、Intake からも preset からも
 * 導出しない。導出すると「module が module と一致する」ことしか確かめられない。
 * 負圧は一次資料の表記どおり負の値で書く。Observation 側が大きさで持つことは
 * P2L-A04 で別に確かめる。
 */
const SOURCE = Object.freeze({
  positive: Object.freeze({ '1': 1297, '2': 1525, '3': 1695, R: 1729 }),
  negativeSigned: Object.freeze({ general: -918, corner: -1122 }),
  evaluationHeightM: Object.freeze({ '1': 4.60, '2': 8.80, '3': 13.10, R: 14.20 })
});

/** Human Gate が明記した closure の期待値。導出値の**照合先**であって導出元ではない。 */
const STATED = Object.freeze({
  requiredSlotCount: 12, readySlotCount: 10,
  categoryCount: 4, readyCategoryCount: 3,
  caseScopeCount: 8, readyCaseScopeCount: 0
});

const evaluate = (observations) => Closure.evaluateClosure(PROJECT, observations || Intake.observations);
const resultFor = (r, factKey, scope) => r.factResults.find((f) =>
  f.factKey === factKey && JSON.stringify(f.scope) === JSON.stringify(scope));
const mutableCopy = () => JSON.parse(JSON.stringify(Intake.observations));
const indexOf = (obs, factKey, scope) => obs.findIndex((o) =>
  o.factKey === factKey && JSON.stringify(o.scope) === JSON.stringify(scope));

test('P2L-A01: 10 件が canonical path で正規化され、module は不変', () => {
  const normalized = Closure.normalizeObservationSet(Intake.observations, PROJECT);
  assert.equal(normalized.length, Intake.observations.length);
  assert.equal(normalized.length, 10);
  normalized.forEach((o) => {
    assert.equal(Closure.CLOSURE_FACT_KEYS.includes(o.factKey), true, o.factKey);
    // 単位は canonical の FACT_UNITS と完全一致（変換は一切しない契約）
    assert.equal(o.unit, Closure.FACT_UNITS[o.factKey], o.factKey);
  });
  // 重複 slot があれば normalizeObservationSet が集合ごと拒否する。件数一致は重複なしを含意する。
  const slotKeys = normalized.map((o) => Closure.getObservationSlotKey(o));
  assert.equal(new Set(slotKeys).size, slotKeys.length);

  // 申告そのものを後から書き換えられない
  assert.equal(Object.isFrozen(Intake), true);
  assert.equal(Object.isFrozen(Intake.observations), true);
  Intake.observations.forEach((o) => {
    assert.equal(Object.isFrozen(o), true);
    assert.equal(Object.isFrozen(o.evidence), true);
    if (o.scope !== null) assert.equal(Object.isFrozen(o.scope), true);
  });
});

test('P2L-A02: 全件 evidence gate PASS、かつ gate は実際に走っている', () => {
  const r = evaluate();
  const observed = r.factResults.filter((f) => f.observationPresent);
  assert.equal(observed.length, Intake.observations.length);
  observed.forEach((f) => {
    assert.equal(f.evidenceGateStatus, 'PASS', f.slotKey + ': ' + f.evidenceGateReason);
    assert.equal(f.blockerKinds.includes('INSUFFICIENT_EVIDENCE'), false, f.slotKey);
  });

  // 正の対照: private reference を外した copy は gate で落ちる。
  // これが PASS のままなら、上の PASS は gate を通った証拠にならない。
  const weakened = mutableCopy();
  const i = indexOf(weakened, 'positive_pressure', { floor: '2' });
  weakened[i].evidence.privateReferenceAvailable = false;
  const w = evaluate(weakened);
  const slot = resultFor(w, 'positive_pressure', { floor: '2' });
  assert.equal(slot.evidenceGateStatus, 'FAIL');
  assert.equal(slot.blockerKinds.includes('INSUFFICIENT_EVIDENCE'), true);
  assert.equal(w.readySlotCount, r.readySlotCount - 1);
});

test('P2L-A03: 階別正圧 4 件が一次資料の値で、current preset と MATCH する', () => {
  const r = evaluate();
  const floors = Closure.createProjectScopeContract(PROJECT).floors;
  assert.deepEqual(floors.slice().sort(), Object.keys(SOURCE.positive).sort());

  floors.forEach((floor) => {
    const obs = Intake.observations[indexOf(Intake.observations, 'positive_pressure', { floor })];
    assert.equal(obs.observedValue, SOURCE.positive[floor], 'source value floor ' + floor);
    const slot = resultFor(r, 'positive_pressure', { floor });
    assert.equal(slot.reconciliationApplicable, true);
    assert.equal(slot.reconciliationStatus, 'MATCH', 'floor ' + floor);
    assert.equal(slot.closureStatus, 'READY_CANDIDATE');
    // closure が引いた現在値は preset の値そのもの
    assert.equal(slot.currentValue, MiyoshiProjectConfig.wind.positivePressureByFloor[floor].value);
  });

  // 正の対照: 1 だけずらすと MISMATCH になる。MATCH が比較の結果であって既定値ではないこと。
  const shifted = mutableCopy();
  shifted[indexOf(shifted, 'positive_pressure', { floor: '2' })].observedValue += 1;
  const s = evaluate(shifted);
  const slot = resultFor(s, 'positive_pressure', { floor: '2' });
  assert.equal(slot.reconciliationStatus, 'MISMATCH');
  assert.equal(slot.blockerKinds.includes('MISMATCH'), true);
  assert.equal(s.blockerKinds.includes('MISMATCH'), true);
  assert.equal(s.readySlotCount, r.readySlotCount - 1);
});

test('P2L-A04: 部位別負圧 2 件は「大きさ」で保持され、current preset と MATCH する', () => {
  const r = evaluate();
  assert.equal(Intake.negativePressureConvention.convention, 'magnitude');
  assert.equal(Intake.negativePressureConvention.sourceSign, 'negative');

  const zones = Closure.createProjectScopeContract(PROJECT).zones;
  assert.deepEqual(zones.slice().sort(), Object.keys(SOURCE.negativeSigned).sort());

  zones.forEach((zone) => {
    const signed = SOURCE.negativeSigned[zone];
    assert.equal(signed < 0, true, '一次資料の表記は負の値');
    const obs = Intake.observations[indexOf(Intake.observations, 'negative_pressure', { zone })];
    assert.equal(obs.observedValue, Math.abs(signed), 'zone ' + zone);
    assert.equal(obs.observedValue > 0, true);
    const slot = resultFor(r, 'negative_pressure', { zone });
    assert.equal(slot.reconciliationStatus, 'MATCH', 'zone ' + zone);
    assert.equal(slot.currentValue, MiyoshiProjectConfig.wind.negativePressureByZone[zone].value);
  });

  // 一次資料の符号をそのまま書き写すと canonical path が拒否する。
  // 大きさで保持するのは規約であって、符号を黙って落としたのではない。
  const signedCopy = mutableCopy();
  signedCopy[indexOf(signedCopy, 'negative_pressure', { zone: 'general' })].observedValue =
    SOURCE.negativeSigned.general;
  assert.throws(() => Closure.normalizeObservationSet(signedCopy, PROJECT),
    /observedValue must be greater than 0/);
});

test('P2L-A05: 評価高さ 4 件は突き合わせ対象を持たずに READY_CANDIDATE', () => {
  const r = evaluate();
  const floors = Closure.createProjectScopeContract(PROJECT).floors;
  floors.forEach((floor) => {
    const obs = Intake.observations[indexOf(Intake.observations, 'evaluation_height', { floor })];
    assert.equal(obs.observedValue, SOURCE.evaluationHeightM[floor], 'floor ' + floor);
    const slot = resultFor(r, 'evaluation_height', { floor });
    // current config に Z の正は無い。比較対象が無いところで MATCH を名乗らせない。
    assert.equal(slot.reconciliationApplicable, false);
    assert.equal(slot.reconciliationStatus, null);
    assert.equal(slot.currentValue, null);
    assert.equal(slot.evidenceGateStatus, 'PASS');
    assert.equal(slot.closureStatus, 'READY_CANDIDATE');
  });
});

test('P2L-A06: closure の件数を構造から導出し、結果と Human Gate の明記値の両方に一致させる', () => {
  const r = evaluate();
  const slots = Closure.listRequiredObservationSlots(PROJECT);
  const contract = Closure.createProjectScopeContract(PROJECT);
  const observed = new Set(Closure.normalizeObservationSet(Intake.observations, PROJECT)
    .map((o) => Closure.getObservationSlotKey(o)));

  const keyOf = (factKey, scope) => {
    const s = slots.find((x) => x.factKey === factKey &&
      JSON.stringify(x.scope) === JSON.stringify(scope));
    assert.ok(s, 'required slot not found: ' + factKey + ' ' + JSON.stringify(scope));
    return s.slotKey;
  };
  const keysOf = (factKey) => slots.filter((s) => s.factKey === factKey).map((s) => s.slotKey);
  const allObserved = (keys) => keys.length > 0 && keys.every((k) => observed.has(k));

  // category の定義は手書きの oracle。evaluateClosure の buildCategories から借りない。
  const CATEGORY_ORACLE = {
    pane_visible_dimensions: keysOf('pane_width_mm').concat(keysOf('pane_height_mm')),
    positive_pressure_source: keysOf('positive_pressure'),
    negative_pressure_source: keysOf('negative_pressure'),
    floor_evaluation_height_mapping: keysOf('positive_pressure').concat(keysOf('evaluation_height'))
  };
  assert.deepEqual(Object.keys(CATEGORY_ORACLE).sort(), Closure.CATEGORY_IDS.slice().sort());

  let readyCases = 0;
  contract.floors.forEach((floor) => contract.zones.forEach((zone) => {
    const need = [
      keyOf('pane_width_mm', null), keyOf('pane_height_mm', null),
      keyOf('positive_pressure', { floor }), keyOf('negative_pressure', { zone }),
      keyOf('evaluation_height', { floor })
    ];
    if (allObserved(need)) readyCases++;
  }));

  // P2L-A02..A05 が「観測された slot はすべて READY」を別に確かめているので、
  // ここでは observed ⇒ ready として期待値を組む。
  const derived = {
    requiredSlotCount: slots.length,
    readySlotCount: slots.filter((s) => observed.has(s.slotKey)).length,
    categoryCount: Object.keys(CATEGORY_ORACLE).length,
    readyCategoryCount: Object.values(CATEGORY_ORACLE).filter(allObserved).length,
    caseScopeCount: contract.floors.length * contract.zones.length,
    readyCaseScopeCount: readyCases
  };

  const actual = {
    requiredSlotCount: r.requiredSlotCount, readySlotCount: r.readySlotCount,
    categoryCount: r.categoryCount, readyCategoryCount: r.readyCategoryCount,
    caseScopeCount: r.caseScopeCount, readyCaseScopeCount: r.readyCaseScopeCount
  };
  assert.deepEqual(actual, derived, 'evaluateClosure() と構造からの導出値が一致しない');
  assert.deepEqual(derived, Object.assign({}, STATED), '導出値が Human Gate の明記値と一致しない');

  // category ごとの状態
  const byId = Object.fromEntries(r.categoryResults.map((c) => [c.categoryId, c.status]));
  Object.entries(CATEGORY_ORACLE).forEach(([id, keys]) => {
    assert.equal(byId[id], allObserved(keys) ? 'READY_CANDIDATE' : 'BLOCKED', id);
  });
  assert.equal(byId.pane_visible_dimensions, 'BLOCKED');

  // 8 case scope すべてが、ちょうど pane W/H の Observation 欠落だけで BLOCKED。
  // これは closure の機械的な結果（2L-A では W/H を意図的に投入していない）であって、
  // pane 寸法の一次資料が無いという意味ではない。
  r.caseReadiness.forEach((c) => {
    assert.equal(c.readinessStatus, 'BLOCKED', JSON.stringify(c.scope));
    assert.deepEqual(c.missingFactKeys.slice().sort(), ['pane_height_mm', 'pane_width_mm'],
      JSON.stringify(c.scope));
  });
});

test('P2L-A07: Promotion Candidate は null、blocker は欠落と case のみ', () => {
  const r = evaluate();
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.promotionCandidate, null);
  assert.equal(r.blockerKinds.includes('MISSING_OBSERVATION'), true);
  assert.equal(r.blockerKinds.includes('CASE_NOT_READY'), true);
  // pressure は一次資料と preset が一致するので MISMATCH は出ない
  assert.equal(r.blockerKinds.includes('MISMATCH'), false);
  assert.equal(r.blockerKinds.includes('INSUFFICIENT_EVIDENCE'), false);
  assert.deepEqual(r.blockerKinds.slice().sort(), ['CASE_NOT_READY', 'MISSING_OBSERVATION']);
});

test('P2L-A08: pane W/H は意図的に取り込まない', () => {
  const PANE = ['pane_height_mm', 'pane_width_mm'];
  assert.deepEqual(Intake.deferredFactKeys.slice().sort(), PANE);
  assert.equal(Intake.deferral.phase, '2L-B');
  assert.equal(Intake.observations.some((o) => PANE.includes(o.factKey)), false);

  const r = evaluate();
  PANE.forEach((factKey) => {
    const slot = resultFor(r, factKey, null);
    assert.equal(slot.observationPresent, false);
    assert.deepEqual(slot.blockerKinds, ['MISSING_OBSERVATION']);
  });

  // 1250×2050 を一次資料確認済みとして持ち込む経路を塞ぐ（どの観測値もそれではない）
  const dims = [MiyoshiProjectConfig.dimensions.defaultW.value,
    MiyoshiProjectConfig.dimensions.defaultH.value];
  Intake.observations.forEach((o) => {
    assert.equal(dims.includes(o.observedValue), false, o.factKey + ' = ' + o.observedValue);
  });
});

test('P2L-A09: current preset は変わらず、verifiedCases は空のまま', () => {
  // intake を一度も読まない別プロセスの preset と、読んで評価した後のこの preset を比べる。
  evaluate();
  const snapshot = (cfg) => JSON.stringify(cfg);
  const pristine = execFileSync(process.execPath, ['-e',
    'process.stdout.write(JSON.stringify(require(' +
      JSON.stringify(path.join(ROOT, 'project-config', 'miyoshi.js')) + ')))'],
    { encoding: 'utf8' });
  assert.equal(snapshot(MiyoshiProjectConfig), pristine);

  // 手書きの oracle でも押さえる
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.value, 1250);
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.value, 2050);
  Object.values(MiyoshiProjectConfig.wind.positivePressureByFloor).forEach((v) => {
    assert.equal(v.verificationStatus, 'partially_verified');
  });
  Object.values(MiyoshiProjectConfig.wind.negativePressureByZone).forEach((v) => {
    assert.equal(v.verificationStatus, 'partially_verified');
  });
});

test('P2L-A10: V0 は 34・粗度 III のまま。一次資料の風条件は別 source scope として保持する', () => {
  evaluate();
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.equal(MiyoshiProjectConfig.wind.V0.verificationStatus, 'verified');
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');

  const stated = Intake.sourceScope.statedWindConditions;
  assert.equal(Intake.sourceScope.reconciledAgainstPreset, false);
  // 食い違いは解消せずに残す。ここで等しくなっていたら、どちらかを書き換えている。
  assert.equal(stated.V0.value, 32);
  assert.notEqual(stated.V0.value, MiyoshiProjectConfig.wind.V0.value);
  assert.equal(stated.V0.unit, MiyoshiProjectConfig.wind.V0.unit);
  assert.equal(stated.roughnessCategory, 'III');
  // y は wind-pressure.js 自身の表から引いて照合する（数を書き写さない）
  assert.equal(stated.recurrenceMultiplier, Wind.RECURRENCE_MULTIPLIERS[stated.recurrenceYears]);

  // V0 は closure fact ではない。Observation にも slot にも現れない。
  assert.equal(Closure.CLOSURE_FACT_KEYS.some((k) => /v0|roughness/i.test(k)), false);
});

test('P2L-A11: private identifier を持たない（構造 sweep + publication lint）', () => {
  Intake.observations.forEach((o) => {
    assert.equal(o.sourceReference, null);
    assert.equal(o.evidence.level, 'primary');
    assert.equal(o.evidence.checkedAt, '2026-10-03');
    assert.equal(o.evidence.privateReferenceAvailable, true);
    assert.doesNotThrow(() => Evidence.assertPublicSafeEvidenceText(
      o.evidence.publicDescription, 'publicDescription'));
  });

  // 散文は publicDescription にしか置かない。publication lint が検査するのはその key
  // だけなので、他の key に書いた散文は lint を素通りする。それ以外の string は
  // 識別子・単位・日付などの token に限る。
  const TOKEN = /^[A-Za-z0-9_.\-/²]+$/;
  const prose = [];
  (function walk(node, at) {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, at + '[' + i + ']')); return; }
    if (node && typeof node === 'object') {
      Object.entries(node).forEach(([k, v]) => {
        if (typeof v === 'string') {
          if (k === 'publicDescription') prose.push(at + '.' + k);
          else assert.match(v, TOKEN, at + '.' + k + ' に token 以外の string: ' + JSON.stringify(v));
        } else walk(v, at + '.' + k);
      });
    }
  }(Intake, 'Intake'));
  assert.equal(prose.length > 0, true);

  // source text の構造 sweep。ここに具体的な private 名を書くと、それ自体が公開になる。
  // したがって既知の名前の denylist ではなく、所在を表す形そのものを拒否する。
  [
    [/https?:\/\//i, 'URL scheme'],
    [/\bwww\./i, 'www host'],
    [/\.(pdf|xlsx?|docx?|dwg|dxf|jww|zip|csv|msg|eml)\b/i, 'document filename'],
    [/\\/, 'backslash (Windows / UNC path)'],
    [/\/(Users|home|mnt|Volumes|sites)\//, 'absolute or share path'],
    [/[\w.+-]+@[\w-]+\.[\w.]+/, 'email'],
    [/sharepoint|notion\.|drive\.google|docs\.google|dropbox|onedrive|box\.com/i, 'storage provider'],
    [/(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{20,}/, 'opaque long token']
  ].forEach(([re, what]) => {
    assert.equal(re.test(MODULE_SRC), false, MODULE_REL + ' に ' + what + ' がある');
  });
});

test('P2L-A11b: publication lint がこの module を実際に検査し、警告 0', async () => {
  const lint = await import(path.join(ROOT, 'tools', 'evidence-publication-lint.mjs'));
  // 既定の discovery がこの module を拾うこと（拾わなければ以下は空虚）
  assert.equal(lint.discoverConfigModules().includes('miyoshi-observations.js'), true);

  const out = lint.runLint({ roots: { 'miyoshi-observations': Intake } });
  assert.equal(out.inspectedNothing, false);
  assert.deepEqual(out.unreadableShapes, []);
  // 対照: Observation 10 件分の publicDescription を含めて、実際に読んでいる
  assert.equal(out.results.length >= Intake.observations.length, true);
  assert.equal(out.hardErrorCount, 0);
  out.results.forEach((r) => {
    assert.deepEqual(r.warnings, [], r.path + ': ' + JSON.stringify(r.warnings));
  });
});

test('P2L-A12: runtime へは配線しない（UI と probe は引き続き空集合を評価する）', () => {
  // 配線すると Closure Matrix の表示が変わる。それは別の gate で決めることなので、
  // ここで境界を固定し、配線するときはこの test を意図して書き換えることになる。
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(html.includes('miyoshi-observations'), false, 'index.html が intake を読み込んでいる');
  assert.equal(html.includes('MiyoshiObservations'), false, 'index.html が intake を参照している');
  // S2-B: UI は active ProjectContext の registryProjectId で、空の Observation 集合を評価する
  assert.match(html, /evaluateClosure\(\s*closureProjectId\s*,\s*\[\s*\]\s*\)/);
  assert.match(html, /closureProjectId = requireActiveProjectContext\(\)\.origin\.registryProjectId/);

  // S3-A: probe は公開 runtime の現在の状態（runtime default の built-in）を、空の Observation 集合で評価する。
  // この intake は legacy validation 用で、runtime の状態ではない
  const probe = fs.readFileSync(
    path.join(ROOT, 'tools', 'verification', 'project-state-probe.mjs'), 'utf8');
  assert.equal(probe.includes('miyoshi-observations'), false, 'probe が intake を読んでいる');
  assert.match(probe, /Registry\.getRuntimeDefaultBuiltInPresetId\(\)/);
  assert.match(probe, /evaluateClosure\(\s*context\.origin\.registryProjectId\s*,\s*\[\s*\]\s*\)/);
});
