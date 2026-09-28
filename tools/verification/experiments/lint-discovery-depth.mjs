#!/usr/bin/env node
// QD-J23 experiment — how deep does publication-lint discovery actually look?
//
//   node tools/verification/experiments/lint-discovery-depth.mjs
//
// QD-J23 was reported as prose: "defaultRoots() uses a non-recursive
// readdirSync, and so does its test, so a config module in a subdirectory is
// missed by both and the suite still passes." Prose is not a measurement.
// Phase 2K §17: a load-bearing number needs a committed generator.
//
// This script plants one synthetic config module one level down, asks the
// SHIPPED lint what it can see, asks the SHIPPED test suite whether it
// notices, and restores the tree. It reports what it observed; it does not
// decide anything. Output is JSON on stdout, diagnostics on stderr.
//
// The probe values are synthetic and use RFC 2606 reserved names. Nothing
// here is a real host, path, document or identifier.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  existsSync, mkdirSync, rmSync, writeFileSync
} from 'node:fs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROBE_DIR = ROOT + 'project-config/p2k-discovery-probe';
const PROBE_FILE = PROBE_DIR + '/nested-probe.js';

// One advisory-tripping value and one hard-rule-tripping value, so the
// experiment can report both severities. `example.invalid` is reserved by
// RFC 2606 and can never resolve.
const PROBE_SOURCE = [
  '// SYNTHETIC probe planted by tools/verification/experiments/' +
    'lint-discovery-depth.mjs.',
  '// If this file is present in a commit, the experiment crashed before',
  '// restoring. Delete it. It is not part of the shipped configuration.',
  '(function (root, factory) {',
  '  if (typeof module === "object" && module.exports) module.exports = factory();',
  '  else root.P2kDiscoveryProbe = factory();',
  '}(typeof self !== "undefined" ? self : this, function () {',
  '  return {',
  '    publicDescription: "www.example.invalid の合成probe（advisory 相当）",',
  '    verifiedCases: [{',
  '      caseId: "probe_case_01",',
  '      publicEvidenceDescription:',
  '        "https://example.invalid/synthetic-probe（hard rule 相当）"',
  '    }]',
  '  };',
  '}));',
  ''
].join('\n');

function plant() {
  if (existsSync(PROBE_DIR)) {
    throw new Error('probe directory already exists; refusing to overwrite: ' + PROBE_DIR);
  }
  mkdirSync(PROBE_DIR);
  writeFileSync(PROBE_FILE, PROBE_SOURCE, 'utf8');
}

function restore() {
  rmSync(PROBE_DIR, { recursive: true, force: true });
}

/** Ask the shipped lint what it can see right now. */
async function observeLint() {
  const lint = await import('../../evidence-publication-lint.mjs?cachebust=' + Date.now());
  const inventory = lint.collectInventory();
  const results = lint.analyse(inventory);
  const probePaths = inventory
    .map((i) => i.path)
    .filter((p) => p.includes('nested-probe') || p.includes('p2k-discovery-probe'));
  const probeResults = results.filter((r) => probePaths.includes(r.path));
  return {
    rootNames: Object.keys(lint.defaultRoots()).sort(),
    inventorySize: inventory.length,
    probePathsFound: probePaths.sort(),
    probeAdvisoryWarnings: probeResults.reduce((n, r) => n + r.warnings.length, 0),
    probeHardErrors: probeResults.filter((r) => r.hardError).length
  };
}

/**
 * Ask the shipped test suite whether it notices.
 *
 * Two hazards here, both found by measurement while building this script.
 *
 * (1) `NODE_TEST_CONTEXT` is set by Node's test runner in the processes it
 *     spawns. If it leaks into this child, the child believes it is itself a
 *     test worker: it prints no `# fail` summary and EXITS 0 even with a
 *     failing test. Run standalone the experiment reported `fail 1`; run from
 *     inside a test it reported exit 0 -- the same instrument giving opposite
 *     readings depending on who invoked it. The environment is sanitised.
 *
 * (2) The first version returned `{exitCode: 0, summary: {tests: null, ...}}`
 *     and the caller treated that as "the suite did not notice". An
 *     unparseable run is not an observation of anything. It now throws.
 *     Reporting a null measurement as a negative result is the same error as
 *     reading a blank instrument as a zero.
 */
function observeSuite() {
  const env = { ...process.env };
  // Anything that makes the child think it is a test worker, or that injects
  // flags changing its reporter or exit behaviour.
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  delete env.NODE_V8_COVERAGE;

  let exitCode;
  let text;
  try {
    text = execFileSync(
      process.execPath,
      ['--test', 'tests/evidence-publication-lint.test.js'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }
    );
    exitCode = 0;
  } catch (e) {
    text = (e.stdout || '') + (e.stderr || '');
    exitCode = typeof e.status === 'number' ? e.status : 'unknown';
  }

  const summary = summarise(text);
  if (summary.tests === null || summary.pass === null || summary.fail === null) {
    throw new Error(
      'cannot parse the test summary, so the suite observation is not a ' +
      'measurement (exit ' + exitCode + '). Refusing to report it.'
    );
  }
  // A non-zero exit with zero failures, or the reverse, means the two signals
  // disagree; neither can then be quoted.
  if ((exitCode === 0) !== (summary.fail === 0)) {
    throw new Error('exit code ' + exitCode + ' disagrees with fail count ' +
      summary.fail + '; refusing to report a contradictory observation');
  }
  return { exitCode, summary };
}

function summarise(text) {
  const grab = (label) => {
    const m = text.match(new RegExp('^# ' + label + ' (\\d+)$', 'm'));
    return m ? Number(m[1]) : null;
  };
  return { tests: grab('tests'), pass: grab('pass'), fail: grab('fail') };
}

let report;
try {
  const before = await observeLint();
  plant();
  try {
    const after = await observeLint();
    const suite = observeSuite();
    report = {
      schemaVersion: 1,
      experiment: 'lint-discovery-depth',
      question:
        'Does publication-lint discovery reach a config module one directory down?',
      probe: {
        relativePath: 'project-config/p2k-discovery-probe/nested-probe.js',
        publicationFacingValuesPlanted: 3,
        synthetic: true
      },
      withoutProbe: before,
      withProbe: after,
      shippedSuiteWithProbe: suite,
      observed: {
        discoveryReachedProbe: after.probePathsFound.length > 0,
        inventoryGrewBy: after.inventorySize - before.inventorySize,
        rootNamesGrewBy: after.rootNames.length - before.rootNames.length,
        shippedSuiteNoticed: suite.exitCode !== 0
      },
      note:
        'This script reports observations only. Whether flat or recursive is ' +
        'the correct contract is a decision recorded in DECISIONS.md, not a ' +
        'conclusion this script draws.'
    };
  } finally {
    restore();
  }
} catch (e) {
  restore();
  process.stderr.write('experiment failed: ' + (e && e.stack || e) + '\n');
  process.exitCode = 1;
}

if (report) {
  if (existsSync(PROBE_DIR)) {
    process.stderr.write('probe was not restored; refusing to report\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
}
