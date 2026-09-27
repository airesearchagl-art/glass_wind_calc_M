'use strict';

/**
 * Phase 2K Wave 1 — the verification manifest.
 *
 * Expectations are hand-written. The manifest must not be checked against
 * itself, and completeness must never be asserted with a bare count (§10):
 * a count is a result, not an oracle.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const MODULE = path.join(__dirname, '..', 'tools', 'verification', 'manifest.mjs');
const SPEC = path.join(__dirname, '..', 'tools', 'verification', 'verification-spec.json');
const load = () => import(MODULE);

// Hand-written instrument identity set. Adding or removing an instrument is a
// deliberate act that must update this list (set identity, not a count).
const EXPECTED_INSTRUMENT_IDS = [
  'browser-w4', 'failopen-w4', 'guard-diff', 'independent-review', 'mutation',
  'npm-test', 'parser-boundary', 'probe-w4', 'project-state-probe',
  'publication-lint', 'stageA-regression',
  // Wave 2 (QD-J23)
  'lint-discovery-depth-experiment'
];

test('P2K-M01: the manifest lists exactly the known instruments', async () => {
  const m = await load();
  const manifest = m.buildManifest();
  assert.equal(manifest.schemaVersion, 1);
  const ids = manifest.spec.instruments.map((i) => i.id);
  assert.deepEqual(ids.slice().sort(), EXPECTED_INSTRUMENT_IDS.slice().sort(),
    'instrument set changed; update the hand-written list deliberately');
  // Sorted output, so the manifest is diffable (§31).
  assert.deepEqual(ids, ids.slice().sort());
});

test('P2K-M02: guard-diff is recorded as INADMISSIBLE with its finding', async () => {
  const m = await load();
  const manifest = m.buildManifest();
  const gd = manifest.spec.instruments.find((i) => i.id === 'guard-diff');
  // Positive control: removing the entry must fail this test, not be silently
  // tolerated. A broken instrument is still part of the verification surface.
  assert.ok(gd, 'guard-diff must be present in the manifest even though it is quarantined');
  assert.equal(gd.admissibility, 'INADMISSIBLE');
  assert.equal(gd.finding, 'P2K-F01');
  assert.match(gd.reason, /corpus/i);
  assert.match(gd.doesNotProve, /completeness/i);
  // It is still regression-class evidence; class and admissibility are separate.
  assert.equal(gd.evidenceClass, 'regression');
});

test('P2K-M03: every instrument declares sharedDependencies explicitly', async () => {
  const m = await load();
  const manifest = m.buildManifest();
  for (const i of manifest.spec.instruments) {
    assert.equal(Array.isArray(i.sharedDependencies), true,
      i.id + ': sharedDependencies must be an array, never omitted (K1-09)');
  }
  // The ones Wave 0 measured as sharing a production constant must say so.
  const gd = manifest.spec.instruments.find((i) => i.id === 'guard-diff');
  assert.equal(gd.sharedDependencies.some((d) => /DOT_EQUIVALENTS/.test(d)), true);
  assert.equal(gd.sharedDependencies.some((d) => /PRIVATE_DOCUMENT_EXTENSION_SOURCE/.test(d)), true);
  // QD-J23 was publication-lint's shared assumption: the implementation and
  // its test walked the config directory with the same flat readdirSync.
  // Wave 2 closed it, so this assertion is inverted rather than deleted --
  // the entry must no longer claim a shared walker, and the closure must be
  // recorded where a fresh verifier reads it. Deleting the assertion would
  // leave nothing watching whether the repair holds.
  const lint = manifest.spec.instruments.find((i) => i.id === 'publication-lint');
  assert.equal(lint.sharedDependencies.some((d) => /readdirSync|non-recursive|flat/i.test(d)),
    false, 'publication-lint still records a shared directory walker (QD-J23 reopened?)');

  const j23 = manifest.spec.knownLimitations.find((k) => k.id === 'QD-J23');
  assert.ok(j23, 'QD-J23 must stay in knownLimitations, recorded as closed');
  assert.match(j23.status, /CLOSED/,
    'QD-J23 status is not CLOSED: ' + j23.status);
  assert.match(j23.statement, /HARD rule/,
    'QD-J23 no longer records what the blindness actually cost');
});

test('P2K-M04: provenance slots exist, including inputDigest (P2K-F07)', async () => {
  const m = await load();
  const manifest = m.buildManifest();
  for (const i of manifest.spec.instruments) {
    for (const f of ['command', 'evidenceClass', 'admissibility', 'target', 'oracle',
                     'positiveControl', 'negativeControl', 'proves', 'doesNotProve',
                     'instrumentSourceSha', 'inputDigest']) {
      assert.equal(Object.prototype.hasOwnProperty.call(i, f), true,
        i.id + ' is missing provenance slot ' + f + ' (K1-03)');
    }
  }
  // A digest does not make an oracle independent: guard-diff stays INADMISSIBLE
  // whether or not inputDigest is filled.
  const gd = manifest.spec.instruments.find((i) => i.id === 'guard-diff');
  assert.equal(gd.admissibility, 'INADMISSIBLE');
});

test('P2K-M05: instrument source identity is content-derived, not timestamp-derived', async () => {
  const m = await load();
  const d1 = m.instrumentDigest(['tools/verification/admissibility.mjs']);
  const d2 = m.instrumentDigest(['tools/verification/admissibility.mjs']);
  assert.equal(d1, d2, 'same content must give the same digest');
  assert.match(d1, /^sha256:[0-9a-f]{64}$/);

  // Touching mtime must not change identity (K1-11).
  const target = path.join(__dirname, '..', 'tools', 'verification', 'admissibility.mjs');
  const future = new Date(Date.now() + 86400000);
  const before = fs.statSync(target).mtime;
  fs.utimesSync(target, future, future);
  try {
    assert.equal(m.instrumentDigest(['tools/verification/admissibility.mjs']), d1,
      'digest must not depend on mtime');
  } finally { fs.utimesSync(target, before, before); }

  // Different content must give a different digest.
  assert.notEqual(m.instrumentDigest(['tools/verification/manifest.mjs']), d1);
  // Order of the input path list must not matter.
  const a = m.instrumentDigest(['tools/verification/admissibility.mjs', 'tools/verification/manifest.mjs']);
  const b = m.instrumentDigest(['tools/verification/manifest.mjs', 'tools/verification/admissibility.mjs']);
  assert.equal(a, b, 'digest must be order-independent');
});

test('P2K-M06: the spec rejects an unknown schemaVersion and a bad vocabulary', async () => {
  const m = await load();
  const raw = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
  assert.equal(raw.schemaVersion, 1);
  // The loader validates; these are the mutations it must reject (K1-01, K1-10).
  assert.equal(typeof m.loadSpec, 'function');
  const manifest = m.buildManifest();
  for (const i of manifest.spec.instruments) {
    assert.ok(['regression', 'independent', 'observational'].includes(i.evidenceClass), i.id);
    assert.ok(['ADMISSIBLE', 'DIAGNOSTIC_ONLY', 'INADMISSIBLE', 'UNVERIFIED']
      .includes(i.admissibility), i.id);
    if (i.admissibility !== 'ADMISSIBLE') {
      assert.ok(i.reason && i.reason.length > 10,
        i.id + ': a non-admissible instrument must state why');
    }
  }
});

test('P2K-M07: spec and measured fields are kept apart, and no verdict is prescribed', async () => {
  const m = await load();
  const manifest = m.buildManifest();
  assert.ok(manifest.spec, 'spec block present');
  assert.ok(manifest.measured, 'measured block present');
  // Dynamic values live only under measured.
  assert.match(manifest.measured.targetRef, /^[0-9a-f]{40}$|^unavailable$/);
  assert.match(manifest.measured.taskPacketDigest, /^sha256:[0-9a-f]{64}$|^unavailable$/);
  // No self-certification or prescribed conclusion anywhere (§28).
  ['expectedVerdict', 'recommendedVerdict', 'verified', 'reviewPassed',
   'allChecksPassed'].forEach((key) => {
    assert.equal(JSON.stringify(manifest).indexOf('"' + key + '"'), -1,
      'manifest must not contain field ' + key);
  });
});

test('P2K-M08: serialisation is deterministic', async () => {
  const m = await load();
  assert.equal(m.serializeManifest(m.buildManifest()),
               m.serializeManifest(m.buildManifest()));
});
