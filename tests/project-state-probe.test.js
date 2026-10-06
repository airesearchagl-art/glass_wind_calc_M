'use strict';

/**
 * Phase 2K Wave 1 — the committed project-state probe (P2K-F04).
 *
 * INDEPENDENCE NOTE. These tests must not compare the probe's output to the
 * runtime object the probe copied — that would pass under any mis-mapping and
 * is exactly the self-comparison the phase is about. Expected field names and
 * expected values below are HAND-WRITTEN.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PROBE = path.join(__dirname, '..', 'tools', 'verification', 'project-state-probe.mjs');
const load = () => import(PROBE);

// Hand-written. The probe promises these names; renaming one is a breaking
// change to its contract, not an internal detail.
const EXPECTED_PROJECT_FIELDS = [
  'projectId', 'closureStatus', 'observations',
  'readySlotCount', 'requiredSlotCount',
  'readyCategoryCount', 'categoryCount',
  'readyCaseScopeCount', 'caseScopeCount',
  'hasPromotionCandidate', 'verifiedCaseCount'
];

// Hand-written expected values. Independent of whatever the probe reports.
// Phase 2L-B2 / S3-A: 'project' and 'preset' are the CURRENT PUBLIC RUNTIME state, which is the
// synthetic sample built-in. The legacy project preset is legacy validation data, not reported here.
const EXPECTED_PROJECT = {
  projectId: 'synthetic-sample',
  closureStatus: 'BLOCKED',
  observations: 0,
  readySlotCount: 0, requiredSlotCount: 12,
  readyCategoryCount: 0, categoryCount: 4,
  readyCaseScopeCount: 0, caseScopeCount: 8,
  hasPromotionCandidate: false,
  verifiedCaseCount: 0
};
// Algorithm regression fixtures with fixed inputs, independent of the runtime preset.
const EXPECTED_PROTECTED = {
  fl6_1250x2050: 1756.09756097561,
  fl6_1500x2050: 1463.4146341463415,
  manualDesignPressure: 1400,
  er: 0.8516557589672942,
  qBar: 503.08024004410464
};

test('P2K-P01: the probe exposes exactly the promised field names', async () => {
  const m = await load();
  assert.deepEqual(m.PROJECT_FIELDS.slice().sort(), EXPECTED_PROJECT_FIELDS.slice().sort());
  assert.deepEqual(m.PROTECTED_CALCULATION_FIELDS.slice().sort(),
    ['er', 'fl6_1250x2050', 'fl6_1500x2050', 'manualDesignPressure', 'qBar']);

  const state = m.readProjectState();
  // Field-by-field presence, so a dropped field is named rather than inferred.
  for (const f of EXPECTED_PROJECT_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(state.project, f), true,
      'project.' + f + ' is missing from the probe output');
  }
  // And no extra fields sneaking in unannounced.
  assert.deepEqual(Object.keys(state.project).slice().sort(),
    EXPECTED_PROJECT_FIELDS.slice().sort());
});

test('P2K-P02: the probe reports the current project state (hand-written expectations)', async () => {
  const m = await load();
  const state = m.readProjectState();
  assert.equal(state.schemaVersion, 1);
  for (const [k, v] of Object.entries(EXPECTED_PROJECT)) {
    assert.equal(state.project[k], v, 'project.' + k);
  }
  // Counts must not be cross-wired. 0 and 12 differ, so mapping readySlotCount
  // from requiredSlotCount (mutation K1-04) shows up here.
  assert.notEqual(state.project.readySlotCount, state.project.requiredSlotCount);
  assert.notEqual(state.project.readyCategoryCount, state.project.categoryCount);
  assert.notEqual(state.project.readyCaseScopeCount, state.project.caseScopeCount);

  assert.deepEqual(state.preset.dimensions,
    { widthMm: 900, heightMm: 1800, mode: 'sample_default', verificationStatus: 'unverified' });
  assert.deepEqual(state.preset.wind, { V0: 30, roughnessCategory: 'II' });
});

test('P2K-P03: protected calculations are bit-exact', async () => {
  const m = await load();
  const pc = m.readProjectState().protectedCalculations;
  for (const [k, v] of Object.entries(EXPECTED_PROTECTED)) {
    assert.equal(pc[k], v, 'protectedCalculations.' + k + ' must be bit-equal to ' + v);
  }
  assert.deepEqual(Object.keys(pc).slice().sort(), Object.keys(EXPECTED_PROTECTED).slice().sort());
});

test('P2K-P04: the probe does not reimplement any formula', async () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(PROBE, 'utf8');
  const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // It must reach the numbers through the real APIs. A probe that carries its
  // own equation agrees with itself rather than with the product.
  ['calcP_single', 'getK1_FL', 'calcEr', 'calcMeanVelocityPressure',
   'buildManualDesignInput'].forEach((api) => {
    assert.match(code, new RegExp(api), 'probe must call ' + api);
  });
  // No exponent or wind-formula constants hand-copied into the probe.
  assert.equal(/Math\.pow|\*\*\s*\d|0\.6\s*\*|ER_COEFFICIENT\s*=/.test(code), false,
    'probe appears to compute a pressure itself');
});

test('P2K-P05: output carries no private or Evidence-prose field (positive control included)', async () => {
  const m = await load();
  const state = m.readProjectState();
  const json = JSON.stringify(state);
  // Hand-written forbidden list.
  ['publicDescription', 'publicEvidenceDescription', 'privateReferenceAvailable',
   'sourceReference', 'promotionCandidate', 'verifiedCases', 'ledger', 'caseId',
   'projectName', 'identity', 'checkedAt'].forEach((key) => {
    assert.equal(json.indexOf('"' + key + '"'), -1,
      'probe output must not contain key ' + key);
  });
  // Positive control: the guard actually fires. Assert-absence alone proves
  // nothing about the guard.
  assert.throws(() => m.assertProjectStateShape({
    schemaVersion: 1,
    project: Object.assign({}, state.project),
    preset: { dimensions: { publicDescription: 'leak' } },
    protectedCalculations: state.protectedCalculations
  }), /forbidden key/, 'a planted publicDescription must be rejected');
});

test('P2K-P06: shape assertion names a dropped field (positive control)', async () => {
  const m = await load();
  const state = m.readProjectState();
  for (const f of EXPECTED_PROJECT_FIELDS) {
    const broken = JSON.parse(JSON.stringify(state));
    delete broken.project[f];
    assert.throws(() => m.assertProjectStateShape(broken),
      new RegExp('project\\.' + f + ' is missing'),
      'dropping project.' + f + ' must be rejected by name');
  }
  for (const f of Object.keys(EXPECTED_PROTECTED)) {
    const broken = JSON.parse(JSON.stringify(state));
    delete broken.protectedCalculations[f];
    assert.throws(() => m.assertProjectStateShape(broken),
      new RegExp('protectedCalculations\\.' + f + ' is missing'));
  }
});

test('P2K-P07: serialisation is deterministic and version-guarded', async () => {
  const m = await load();
  const a = m.serializeProjectState(m.readProjectState());
  const b = m.serializeProjectState(m.readProjectState());
  assert.equal(a, b, 'two reads of the same tree must serialise byte-identically');
  assert.equal(a.endsWith('\n'), true);
  assert.throws(() => m.assertProjectStateShape({ schemaVersion: 2, project: {}, protectedCalculations: {} }),
    /unsupported schemaVersion/);
});
