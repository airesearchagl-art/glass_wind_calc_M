'use strict';

/**
 * Phase 2K Wave 1 — the independent-verifier handoff package (P2K-F05).
 *
 * The single most important property here is NEGATIVE: the package must not
 * tell the verifier what to conclude. Phase 2J's reviews repeatedly returned
 * findings on heads the implementer believed clean, and that only works if the
 * handoff describes what matters rather than the expected answer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE = path.join(__dirname, '..', 'tools', 'verification', 'verifier-package.mjs');
const load = () => import(MODULE);

test('P2K-V01: the package carries no expected or recommended verdict', async () => {
  const m = await load();
  const pkg = m.buildVerifierPackage();
  const json = JSON.stringify(pkg);
  // Hand-written forbidden field list (K1-07). It omitted `pass` and `result`
  // for three waves while the runtime walker enforced all eight -- a weaker test
  // than the code, found by an independent verifier. Kept hand-written on
  // purpose (deriving it from the module under test would prove only that the
  // module equals itself), but now checked for completeness against the module's
  // own list, so the two cannot drift apart again.
  const FORBIDDEN = ['expectedVerdict', 'recommendedVerdict', 'verdict', 'verified',
    'reviewPassed', 'allChecksPassed', 'pass', 'result'];
  assert.deepEqual(FORBIDDEN.slice().sort(), m.FORBIDDEN_PACKAGE_KEYS.slice().sort(),
    'hand-written list and the enforced list disagree: ' +
    JSON.stringify(m.FORBIDDEN_PACKAGE_KEYS));
  FORBIDDEN.forEach((key) => {
    assert.equal(json.indexOf('"' + key + '":'), -1,
      'package must not contain field ' + key);
  });
  // Positive control: the guard actually rejects one if planted.
  assert.throws(() => m.assertNoSelfCertification(
    Object.assign({}, pkg, { expectedVerdict: 'PASS' })),
    /self-certifying field/, 'a planted expectedVerdict must be rejected');
  assert.throws(() => m.assertNoSelfCertification({ nested: { allChecksPassed: true } }),
    /self-certifying field/, 'a nested self-certifying field must be rejected');
  // And it says out loud that disagreement is valid.
  assert.match(pkg.verifierNote, /no expected or recommended verdict/i);
  assert.match(pkg.verifierNote, /[Dd]isagree/);
});

test('P2K-V02: changed files come from git and an empty list is an error', async () => {
  const m = await load();
  const pkg = m.buildVerifierPackage();
  assert.equal(Array.isArray(pkg.changedFiles), true);
  assert.equal(pkg.changedFiles.length > 0, true);
  // Sorted, so the package is diffable (K1-12).
  assert.deepEqual(pkg.changedFiles, pkg.changedFiles.slice().sort());

  // Positive control (§33): this branch is known to carry the Phase 2K Run
  // Artifact, so a resolver that silently returned [] would fail here.
  assert.equal(pkg.changedFiles.some((f) => f.indexOf('.agent-run/LR-20260927-GLASS-P2K/') === 0),
    true, 'the Phase 2K Run Artifact must appear in changedFiles');
  assert.equal(pkg.changedFiles.some((f) => f === '.agent-run/LR-20260927-GLASS-P2K/INSTRUMENT_INVENTORY.md'),
    true, 'a specific known changed file must be present (K1-08)');

  // Two distinct failure modes, each pinned by its own message. Asserting only
  // "it throws" let mutation K1-08 survive: removing the empty-list guard
  // changed nothing, because the unresolvable-ref case throws earlier for a
  // different reason and satisfied a loose regex.
  //
  //   (a) git SUCCEEDS and returns nothing -> the empty-list guard must fire.
  //       HEAD...HEAD is the case that reaches it.
  assert.throws(() => m.resolveChangedFiles('HEAD'),
    /changed-file list is empty/,
    'an empty-but-successful diff must be an error, never a silent [] (K1-08)');
  //   (b) git FAILS -> a different, explicit error.
  assert.throws(() => m.resolveChangedFiles('refs/heads/definitely-not-a-real-ref-p2k'),
    /cannot resolve changed files/,
    'an unresolvable base must be reported as unresolvable, not as empty');
});

test('P2K-V03: the package states which evidence is admissible', async () => {
  const m = await load();
  const pkg = m.buildVerifierPackage();
  const byId = {};
  for (const a of pkg.admissibilitySummary) byId[a.instrumentId] = a;

  // Hand-written expectations for the three that matter most (§27).
  assert.equal(byId['npm-test'].admissibility, 'ADMISSIBLE');
  assert.equal(byId['npm-test'].evidenceClass, 'regression');
  // guard-diff was INADMISSIBLE in Wave 1 and re-admitted in Wave 3 once its
  // corpus stopped being derived from the subject. The package must carry the
  // current verdict AND the reasoning, so a verifier reading only the package
  // knows the re-admission rests on a measurement.
  assert.equal(byId['guard-diff'].admissibility, 'ADMISSIBLE');
  assert.match(byId['guard-diff'].reason, /corpus/i);
  // Cross-checked against the committed expectations file rather than matched as
  // digits in prose. The digits-in-prose version accepted a figure from a
  // DIFFERENT experiment, which is what Wave 3 shipped: 32000 came from a
  // four-atom mutation where Wave 0's was five atoms and gives 40000.
  const expectedFigures = JSON.parse(require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'tools', 'verification', 'experiments',
      'corpus-independence.expected.json'), 'utf8'));
  for (const [id, e] of Object.entries(expectedFigures.experiments)) {
    assert.match(byId['guard-diff'].reason, new RegExp(String(e.regressions)),
      'package に実験 ' + id + ' の実測値が無い');
  }
  assert.equal(byId['parser-boundary'].evidenceClass, 'independent');

  // Every command carries its admissibility inline, so a verifier never has to
  // infer whether a result may be cited.
  for (const c of pkg.verificationCommands) {
    assert.ok(c.command, c.instrumentId + ' must have a command');
    assert.ok(['ADMISSIBLE', 'DIAGNOSTIC_ONLY', 'INADMISSIBLE', 'UNVERIFIED']
      .includes(c.admissibility), c.instrumentId);
    assert.ok(Object.prototype.hasOwnProperty.call(c, 'doesNotProve'),
      c.instrumentId + ' must state what it does not prove');
  }
  // guard-diff must still be listed with what it does not prove attached: being
  // admissible for one claim is not being admissible for every claim.
  const gdCmd = pkg.verificationCommands.find((c) => c.instrumentId === 'guard-diff');
  assert.ok(gdCmd, 'guard-diff must still be listed');
  assert.match(gdCmd.doesNotProve, /completeness/i);
});

test('P2K-V04: browser evidence is declared UNVERIFIED and execution required', async () => {
  const m = await load();
  const pkg = m.buildVerifierPackage();
  // §18 / §26: never imply the harnesses ran for this target.
  assert.equal(pkg.browserExecutionRequired, true);
  assert.equal(pkg.browserEvidenceForTarget, 'UNVERIFIED');
  assert.match(pkg.browserEvidenceNote, /not browser verification/i);
  assert.equal(pkg.browserAssertions.length > 0, true);
  for (const a of pkg.browserAssertions) {
    assert.ok(a.id && a.statement && a.instrument, 'browser assertion needs id/statement/instrument');
  }
  // A verifier must know what to measure even though nothing was measured.
  // Checked by id plus content: the id is the stable handle, the statement must
  // actually describe the guard-versus-browser differential.
  const tagGuard = pkg.browserAssertions.find((a) => a.id === 'tag-guard-no-bypass');
  assert.ok(tagGuard, 'the tag-guard/Chromium differential assertion must be present');
  assert.match(tagGuard.statement, /Chromium/);
  assert.equal(tagGuard.instrument, 'parser-boundary');
  // And the matrix/protected-fact assertions a verifier would otherwise have to
  // reconstruct from conversation.
  ['matrix-renders', 'no-verified-wording', 'no-controls',
   'protected-facts-from-page', 'no-network-no-storage', 'injection-inert',
   'fail-closed-wording'].forEach((id) => {
    assert.equal(pkg.browserAssertions.some((a) => a.id === id), true,
      'browser assertion ' + id + ' must be present');
  });
});

test('P2K-V05: expected project state is declared, not read from the tree', async () => {
  const m = await load();
  const pkg = m.buildVerifierPackage();
  const exp = pkg.evidenceStateExpected;
  assert.ok(exp, 'evidenceStateExpected must be present');
  assert.match(exp.note, /[Hh]and-written/);
  assert.match(exp.probeCommand, /project-state-probe/);

  // Hand-written expectations, duplicated here on purpose: if the spec's
  // declared expectation is quietly edited, this test fails.
  assert.equal(exp.project.closureStatus, 'BLOCKED');
  assert.equal(exp.project.readySlotCount, 0);
  assert.equal(exp.project.requiredSlotCount, 12);
  assert.equal(exp.project.categoryCount, 4);
  assert.equal(exp.project.caseScopeCount, 8);
  assert.equal(exp.project.hasPromotionCandidate, false);
  assert.equal(exp.project.verifiedCaseCount, 0);
  assert.equal(exp.preset.wind.V0, 34);
  assert.equal(exp.preset.wind.roughnessCategory, 'III');
  assert.equal(exp.preset.dimensions.mode, 'sample_default');
  assert.equal(exp.protectedCalculations.er, 0.8516557589672942);
  assert.equal(exp.protectedCalculations.qBar, 503.08024004410464);
  assert.equal(exp.protectedCalculations.fl6_1250x2050, 1756.09756097561);

  // And the declared expectation must actually agree with the probe today —
  // if it does not, one of the two is wrong and a verifier should be told.
  const probe = await import(path.join(__dirname, '..', 'tools', 'verification', 'project-state-probe.mjs'));
  const actual = probe.readProjectState();
  assert.deepEqual(actual.project, exp.project, 'declared expectation vs probe: project');
  assert.deepEqual(actual.preset, exp.preset, 'declared expectation vs probe: preset');
  assert.deepEqual(actual.protectedCalculations, exp.protectedCalculations,
    'declared expectation vs probe: protectedCalculations');
});

test('P2K-V06: protected invariants and limitations are carried, not summarised away', async () => {
  const m = await load();
  const pkg = m.buildVerifierPackage();
  const ids = pkg.protectedInvariants.map((i) => i.id);
  ['verified-cases-empty', 'no-promotion-candidate', 'closure-blocked',
   'sample-default-dimensions', 'v0-34', 'roughness-III',
   'protected-calculations', 'guard-policy-frozen'].forEach((id) => {
    assert.equal(ids.includes(id), true, 'protected invariant ' + id + ' must be present');
  });
  const lim = pkg.knownLimitations.map((l) => l.id);
  ['P2K-F01', 'P2K-F02', 'P2K-F03', 'P2K-F06', 'QD-J22', 'QD-J23'].forEach((id) => {
    assert.equal(lim.includes(id), true, 'known limitation ' + id + ' must be present');
  });
  assert.equal(pkg.nonGoals.length > 0, true);
  assert.equal(pkg.nonGoals.some((g) => /Ready|merge|Production/.test(g)), true);
});

test('P2K-V07: serialisation is deterministic and identifies the tree', async () => {
  const m = await load();
  assert.equal(m.serializeVerifierPackage(m.buildVerifierPackage()),
               m.serializeVerifierPackage(m.buildVerifierPackage()));
  const pkg = m.buildVerifierPackage();
  assert.match(pkg.targetSha, /^[0-9a-f]{40}$/);
  assert.match(pkg.baseSha, /^[0-9a-f]{40}$/);
  assert.match(pkg.taskPacketDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(pkg.schemaVersion, 1);
});

test('P2K-V08: 処方された command はすべて実際に解決する', async () => {
  const m = await load();
  const fs = require('node:fs');
  const path = require('node:path');
  const pkg = m.buildVerifierPackage();
  const repoRoot = path.join(__dirname, '..');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  // The package hands a fresh verifier a list of commands to run. Nothing used
  // to check that any of them resolves: the loop asserted only that `command`
  // was non-empty and the admissibility was in the vocabulary. A renamed or
  // deleted instrument would still be handed out as runnable, suite green.
  assert.equal(pkg.verificationCommands.length > 0, true);
  for (const c of pkg.verificationCommands) {
    const script = (c.command.match(/([\w./-]+\.mjs)/) || [])[1];
    if (script) {
      assert.equal(fs.existsSync(path.join(repoRoot, script)), true,
        c.instrumentId + ': 処方された script が存在しない: ' + script);
      continue;
    }
    const npmScript = (c.command.match(/^npm run (?:--silent )?([\w:-]+)/) || [])[1];
    if (npmScript) {
      assert.equal(Object.prototype.hasOwnProperty.call(pkgJson.scripts, npmScript), true,
        c.instrumentId + ': package.json に script がない: ' + npmScript);
      continue;
    }
    // `npm test` is the only bare form allowed, and it must be defined.
    assert.equal(c.command, 'npm test',
      c.instrumentId + ': 解決できない command: ' + c.command);
    assert.ok(pkgJson.scripts.test, 'package.json に test script がない');
  }
});

test('P2K-V09: browser が必要な instrument は package に出てくる', async () => {
  const m = await load();
  const pkg = m.buildVerifierPackage();
  // This list was computed and thrown away for two waves: the blockerKinds
  // shape the publication lint exists to prevent (QD-J17), reproduced inside
  // the verification tooling itself.
  assert.equal(Array.isArray(pkg.browserInstruments), true,
    'browserInstruments が package に無い');
  assert.equal(pkg.browserInstruments.length >= 5, true,
    'browser instrument が減っている: ' + JSON.stringify(pkg.browserInstruments));
  assert.deepEqual(pkg.browserInstruments, pkg.browserInstruments.slice().sort(),
    '順序が決定的でない');
  // Every one of them must also appear as a runnable command.
  const ids = new Set(pkg.verificationCommands.map((c) => c.instrumentId));
  for (const id of pkg.browserInstruments) {
    assert.equal(ids.has(id), true, id + ': browser instrument なのに command がない');
  }
});

