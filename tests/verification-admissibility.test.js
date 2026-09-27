'use strict';

/**
 * Phase 2K Wave 1 — the evidence-admissibility schema contract.
 *
 * These tests are deliberately written against HAND-WRITTEN expected
 * vocabularies, not against the module's own exports compared to themselves.
 * Asserting `EVIDENCE_CLASSES === EVIDENCE_CLASSES` would pass under any
 * mutation, which is the shape of defect this whole phase exists to close.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE = path.join(__dirname, '..', 'tools', 'verification', 'admissibility.mjs');
const load = () => import(MODULE);

test('P2K-A01: evidence classes are exactly the three declared ones', async () => {
  const m = await load();
  // Hand-written. A mutation that adds, removes or renames a class fails here.
  assert.deepEqual(m.EVIDENCE_CLASSES.slice().sort(),
    ['independent', 'observational', 'regression']);
  assert.equal(Object.isFrozen(m.EVIDENCE_CLASSES), true);
});

test('P2K-A02: admissibility statuses are separate from result states', async () => {
  const m = await load();
  assert.deepEqual(m.ADMISSIBILITY_STATUSES.slice().sort(),
    ['ADMISSIBLE', 'DIAGNOSTIC_ONLY', 'INADMISSIBLE', 'UNVERIFIED']);
  assert.deepEqual(m.OUTCOMES.slice().sort(), ['ERROR', 'FAIL', 'PASS', 'UNVERIFIED']);

  // The two vocabularies must not be collapsed (mutation K1-02). PASS, FAIL and
  // ERROR are results alone and must never be admissibility statuses.
  assert.deepEqual(m.RESULT_ONLY_STATES.slice().sort(), ['ERROR', 'FAIL', 'PASS']);
  ['PASS', 'FAIL', 'ERROR'].forEach((result) => {
    assert.equal(m.isAdmissibility(result), false,
      result + ' must not be a valid admissibility status');
  });
  // UNVERIFIED is legitimately in both vocabularies; that is intentional, and
  // is why the record validator rejects it only in the admissibility position
  // when it duplicates an outcome field.
  assert.equal(m.isOutcome('UNVERIFIED'), true);
  assert.equal(m.isAdmissibility('UNVERIFIED'), true);
});

test('P2K-A03: unknown schemaVersion is rejected, never interpreted', async () => {
  const m = await load();
  assert.equal(m.assertSchemaVersion(1, 'x'), true);
  [0, 2, 99, '1', null, undefined, {}].forEach((v) => {
    assert.throws(() => m.assertSchemaVersion(v, 'x'), /unsupported schemaVersion/,
      'schemaVersion ' + JSON.stringify(v) + ' must be rejected');
  });
});

test('P2K-A04: every provenance field is required and cannot vanish silently', async () => {
  const m = await load();
  // Hand-written list. If the module's list shrinks, this fails (K1-03).
  const EXPECTED = ['instrumentId', 'instrumentVersion', 'instrumentSourceSha',
    'targetSha', 'baseSha', 'oracleId', 'oracleVersion', 'evidenceClass',
    'admissibility', 'inputDigest', 'command', 'result', 'limitations'];
  assert.deepEqual(m.PROVENANCE_FIELDS.slice().sort(), EXPECTED.slice().sort());

  const complete = {};
  for (const f of EXPECTED) complete[f] = null;
  Object.assign(complete, {
    schemaVersion: 1, evidenceClass: 'regression', admissibility: 'ADMISSIBLE'
  });
  assert.equal(m.assertVerificationEvidenceRecord(complete, 'r'), true);

  // Positive control: dropping any one field must fail, with that field named.
  for (const f of EXPECTED) {
    const broken = Object.assign({}, complete);
    delete broken[f];
    assert.throws(() => m.assertVerificationEvidenceRecord(broken, 'r'),
      new RegExp('missing provenance field.*' + f),
      'dropping ' + f + ' must be rejected');
  }
});

test('P2K-A05: a non-ADMISSIBLE record must say why', async () => {
  const m = await load();
  const base = {};
  for (const f of ['instrumentId', 'instrumentVersion', 'instrumentSourceSha',
    'targetSha', 'baseSha', 'oracleId', 'oracleVersion', 'inputDigest',
    'command', 'result']) base[f] = null;
  base.schemaVersion = 1;
  base.evidenceClass = 'regression';

  ['INADMISSIBLE', 'DIAGNOSTIC_ONLY', 'UNVERIFIED'].forEach((status) => {
    assert.throws(() => m.assertVerificationEvidenceRecord(
      Object.assign({}, base, { admissibility: status, limitations: null }), 'r'),
      /requires a non-empty limitations/, status + ' with no limitations must fail');
    assert.equal(m.assertVerificationEvidenceRecord(
      Object.assign({}, base, { admissibility: status, limitations: 'corpus derives from production' }), 'r'),
      true, status + ' with a stated reason is valid');
  });
});

test('P2K-A06: the result envelope keeps outcome and admissibility apart', async () => {
  const m = await load();
  const env = m.makeResultEnvelope({
    instrumentId: 'npm-test', targetSha: 'abc', evidenceClass: 'regression',
    admissibility: 'ADMISSIBLE', outcome: 'PASS', measurements: { pass: 659, fail: 0 }
  });
  assert.equal(env.outcome, 'PASS');
  assert.equal(env.admissibility, 'ADMISSIBLE');
  assert.equal(env.evidenceClass, 'regression');
  // Determinism: timestamps default to null rather than wall-clock.
  assert.equal(env.startedAt, null);
  assert.equal(env.completedAt, null);
  assert.equal(Object.isFrozen(env), true);

  assert.throws(() => m.makeResultEnvelope({
    evidenceClass: 'regression', admissibility: 'ADMISSIBLE', outcome: 'ADMISSIBLE'
  }), /outcome must be one of/, 'an admissibility value must not pass as an outcome');
});

test('P2K-A07: the schema module knows nothing about git, SHAs or Phase 2J', async () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(MODULE, 'utf8');
  // It must not reach for state. A schema that reads the world encodes the
  // world, and then drifts with it.
  [/child_process/, /execFileSync/, /\bgit\b/i, /node:fs/, /readFileSync/]
    .forEach((pattern) => {
      assert.equal(pattern.test(src.replace(/^\s*\/\/.*$/gm, '')), false,
        'admissibility.mjs must not reference ' + pattern);
    });
  const m = await load();
  assert.equal(typeof m.SCHEMA_VERSION, 'number');
});
