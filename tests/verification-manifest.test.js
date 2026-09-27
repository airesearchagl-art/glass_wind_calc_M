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

test('P2K-M02: guard-diff の再認定は測定に基づいていること（P2K-F01）', async () => {
  const m = await load();
  const manifest = m.buildManifest();
  const gd = manifest.spec.instruments.find((i) => i.id === 'guard-diff');
  // Positive control: removing the entry must fail this test, not be silently
  // tolerated. An instrument is part of the verification surface whether it is
  // quarantined or admitted.
  assert.ok(gd, 'guard-diff must be present in the manifest');

  // Wave 1 quarantined it INADMISSIBLE for P2K-F01: the corpus derived its
  // threat list from the module under test. Wave 3 repaired that, so this
  // assertion is INVERTED rather than deleted -- something has to watch whether
  // the repair holds, and the thing to watch is that the re-admission still
  // rests on a measurement.
  assert.equal(gd.admissibility, 'ADMISSIBLE',
    'guard-diff の admissibility: ' + gd.admissibility);
  assert.equal(gd.finding, null, '修理済みなのに finding が残っている');
  // The reason must carry the numbers, not just the claim. Both are the
  // measured before/after of the Wave 0 experiments.
  assert.match(gd.reason, /P2K-F01/);
  assert.match(gd.reason, /26496/, '再認定の根拠に実測値が無い');
  assert.match(gd.reason, /32000/, '再認定の根拠に実測値が無い');
  // Re-admission is narrow: it still proves nothing about completeness.
  assert.match(gd.doesNotProve, /completeness/i);
  assert.match(gd.doesNotProve, /homoglyph/i,
    '開集合の限界が doesNotProve から消えた');
  // Class and admissibility stay separate axes.
  assert.equal(gd.evidenceClass, 'regression');

  // And the closure is recorded where a fresh verifier reads it.
  const f01 = manifest.spec.knownLimitations.find((k) => k.id === 'P2K-F01');
  assert.ok(f01, 'P2K-F01 must stay in knownLimitations, recorded as closed');
  assert.match(f01.status, /CLOSED/, 'P2K-F01 status: ' + f01.status);
});

test('P2K-M03: every instrument declares sharedDependencies explicitly', async () => {
  const m = await load();
  const manifest = m.buildManifest();
  for (const i of manifest.spec.instruments) {
    assert.equal(Array.isArray(i.sharedDependencies), true,
      i.id + ': sharedDependencies must be an array, never omitted (K1-09)');
  }
  // The ones Wave 0 measured as sharing a production constant must say so.
  // guard-diff's shared dependency on two production constants WAS P2K-F01.
  // Wave 3 removed it, so the assertion is inverted: the entry must no longer
  // claim to read either constant from the subject. Structural enforcement of
  // the same property lives in P2K-D01, which reads corpus.mjs itself.
  const gd = manifest.spec.instruments.find((i) => i.id === 'guard-diff');
  assert.equal(gd.sharedDependencies.some((d) => /DOT_EQUIVALENTS/.test(d)), false,
    'guard-diff がまだ DOT_EQUIVALENTS を共有と記録している（P2K-F01 再発?）');
  assert.equal(gd.sharedDependencies.some((d) => /PRIVATE_DOCUMENT_EXTENSION_SOURCE/.test(d)), false,
    'guard-diff がまだ extension source を共有と記録している');
  assert.equal(gd.sharedDependencies.some((d) => /none/i.test(d)), true,
    '独立になったことが sharedDependencies に書かれていない');

  // The mutation harness's remaining shared assumption must stay declared: its
  // SURVIVED/EQUIVALENT split is decided by the guard corpus, so it cannot
  // adjudicate a mutant in any other file.
  const mut = manifest.spec.instruments.find((i) => i.id === 'mutation');
  assert.equal(mut.sharedDependencies.some((d) => /corpus/i.test(d)), true,
    'mutation の corpus 依存が宣言から消えた');
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
  // A digest does not make an oracle independent -- that was the point of this
  // assertion in Wave 1, when guard-diff was quarantined with inputDigest
  // available. What re-admitted it in Wave 3 was removing the dependency and
  // measuring the result, not filling a slot. So this now checks the ordering
  // of the argument rather than the verdict: the slot exists AND the reason
  // cites a measurement.
  const gd = manifest.spec.instruments.find((i) => i.id === 'guard-diff');
  assert.equal(Object.prototype.hasOwnProperty.call(gd, 'inputDigest'), true);
  assert.match(gd.reason, /\d{4,}/,
    'admissibility の根拠が実測値を含んでいない——slot を埋めただけでは独立にならない');
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

test('P2K-M09: 12 instrument 全部の class と admissibility を literal で固定する', async () => {
  const m = await load();
  const manifest = m.buildManifest();

  // Hand-written. Found by mutation in Wave 3: mutant K1-01 was retargeted from
  // guard-diff (legitimately re-admitted) to the mutation harness, and PATCH-MISS
  // exposed that NOTHING pinned any individual admissibility -- only that each
  // value was a member of the vocabulary. Re-admitting the mutation harness as
  // ADMISSIBLE would have passed the entire suite.
  //
  // That matters most for `mutation`: DIAGNOSTIC_ONLY is a JUDGEMENT, not a
  // measurement. KILLED verdicts come from npm test (admissible), but the
  // SURVIVED/EQUIVALENT split is decided by the guard corpus probe, which cannot
  // adjudicate a mutant in any other file. The weaker half sets the label.
  // A Human Gate may split it; this table makes that a deliberate edit.
  const EXPECTED = [
    ['browser-w4', 'UNVERIFIED', 'observational'],
    ['failopen-w4', 'UNVERIFIED', 'observational'],
    ['guard-diff', 'ADMISSIBLE', 'regression'],
    ['independent-review', 'ADMISSIBLE', 'independent'],
    ['lint-discovery-depth-experiment', 'ADMISSIBLE', 'independent'],
    ['mutation', 'DIAGNOSTIC_ONLY', 'regression'],
    ['npm-test', 'ADMISSIBLE', 'regression'],
    ['parser-boundary', 'UNVERIFIED', 'independent'],
    ['probe-w4', 'UNVERIFIED', 'observational'],
    ['project-state-probe', 'ADMISSIBLE', 'observational'],
    ['publication-lint', 'ADMISSIBLE', 'regression'],
    ['stageA-regression', 'UNVERIFIED', 'observational']
  ];
  const actual = manifest.spec.instruments
    .map((i) => [i.id, i.admissibility, i.evidenceClass])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  assert.deepEqual(actual, EXPECTED,
    'instrument の分類が変わった。意図的ならこの表を同じ commit で更新する: ' +
    JSON.stringify(actual));

  // Every non-ADMISSIBLE entry must carry a reason. An unexplained downgrade is
  // as unusable as an unexplained upgrade.
  for (const i of manifest.spec.instruments) {
    if (i.admissibility !== 'ADMISSIBLE') {
      assert.ok(i.reason && i.reason.length > 20,
        i.id + ': 非 ADMISSIBLE なのに reason が空か短すぎる');
    }
  }
});

