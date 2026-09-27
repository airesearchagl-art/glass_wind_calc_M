#!/usr/bin/env node
// Regenerate the figures the guard-diff re-admission rests on (P2K-F01).
//
//   node tools/verification/experiments/corpus-independence.mjs
//
// Why this exists. Wave 3 lifted guard-diff's quarantine on the strength of two
// numbers, and the only thing protecting them was a regex asserting that the
// spec's prose CONTAINS those digits:
//
//   assert.match(gd.reason, /26496/, ...)
//
// An independent verifier pointed out that this pins the sentence, not the
// measurement: a wrong figure passes, and a figure from a DIFFERENT experiment
// passes too. Which is exactly what had happened -- Wave 0's experiment B
// dropped five extension atoms, Wave 3 re-measured four, and the two tables
// were published as "the same two experiments". Five atoms gives 40000, not
// 32000.
//
// So the numbers now come from here, and the expectations file beside this
// script is what both the spec and the tests are checked against.
//
// This script MUTATES project-config/evidence.js and restores it. That is
// unavoidable: diff-heads compares HEAD against the working tree, so the
// working tree is the only place a "target" can be expressed. It restores on
// every exit path and refuses to report if the restore did not verify.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { childEnvironment, classifySuiteRun } from '../../guard-diff/suite-verdict.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GUARD = ROOT + 'project-config/evidence.js';
const pristine = readFileSync(GUARD, 'utf8');

/**
 * The two Wave 0 mutations, EXACTLY as Wave 0 made them. Anchors are literal
 * substrings of the guard source; each must appear exactly once, or the
 * experiment refuses to run rather than silently measuring nothing.
 */
const EXPERIMENTS = [
  {
    id: 'A',
    describes: 'drop one dot equivalent (U+0387) from DOT_EQUIVALENTS',
    // Built from char codes: a literal \uXXXX escape in this file would be
    // folded into the real character by some editors, and the anchor would
    // then miss (the same trap mutants.mjs documents).
    find: ['2e33', '0387', '06d4'].map((h) => '\\u' + h).join(''),
    replace: ['2e33', '06d4'].map((h) => '\\u' + h).join(''),
    reaches: 'a private-document filename written with U+0387 becomes publishable'
  },
  {
    id: 'B',
    describes: 'drop five extension atoms (rar|7z|lzh|tar|gz)',
    find: '|zip|rar|7z|lzh|tar|gz|msg',
    replace: '|zip|msg',
    reaches: 'a private-document filename ending .rar / .7z / .lzh / .tar / .gz becomes publishable'
  }
];

function restore() {
  writeFileSync(GUARD, pristine, 'utf8');
}

function differential() {
  try {
    const out = execFileSync(process.execPath,
      [ROOT + 'tools/guard-diff/diff-heads.mjs', 'HEAD'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, env: childEnvironment(process.env) });
    return { text: out, exitCode: 0 };
  } catch (e) {
    return { text: (e.stdout || '') + (e.stderr || ''),
      exitCode: typeof e.status === 'number' ? e.status : -1 };
  }
}

function suite() {
  let text = '';
  let exitCode = 0;
  try {
    text = execFileSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8',
      maxBuffer: 1 << 28, env: childEnvironment(process.env) });
  } catch (e) {
    text = (e.stdout || '') + (e.stderr || '');
    exitCode = typeof e.status === 'number' ? e.status : -1;
  }
  const run = classifySuiteRun({ stdout: text, exitCode, threw: exitCode !== 0 });
  if (run.kind === 'HARNESS_ERROR') {
    throw new Error('suite observation is not a measurement: ' + run.detail);
  }
  const pass = Number((text.match(/^# pass (\d+)$/m) || [])[1]);
  const fail = Number((text.match(/^# fail (\d+)$/m) || [])[1]);
  return { pass, fail };
}

function regressionsFrom(text) {
  const m = text.match(/^REGRESSIONS \(base rejects, target accepts\): (\d+)/m);
  if (!m) throw new Error('could not read a REGRESSIONS line from diff-heads output');
  return Number(m[1]);
}

let report;
try {
  // Baseline: with no mutation there must be nothing to report. If this is not
  // clean the working tree is already dirty and every figure below is suspect.
  const baseline = differential();
  const baselineRegressions = regressionsFrom(baseline.text);
  if (baselineRegressions !== 0 || baseline.exitCode !== 0) {
    throw new Error('baseline is not clean (regressions ' + baselineRegressions +
      ', exit ' + baseline.exitCode + '); refusing to measure against a dirty tree');
  }

  const results = {};
  for (const ex of EXPERIMENTS) {
    const hits = pristine.split(ex.find).length - 1;
    if (hits !== 1) {
      throw new Error('experiment ' + ex.id + ': anchor appears ' + hits +
        ' times, expected exactly 1');
    }
    writeFileSync(GUARD, pristine.replace(ex.find, ex.replace), 'utf8');
    try {
      const d = differential();
      const s = suite();
      results[ex.id] = {
        describes: ex.describes,
        reaches: ex.reaches,
        regressions: regressionsFrom(d.text),
        differentialExitCode: d.exitCode,
        npmTestPass: s.pass,
        npmTestFail: s.fail
      };
    } finally {
      restore();
    }
  }

  if (readFileSync(GUARD, 'utf8') !== pristine) {
    throw new Error('guard source was not restored; refusing to report');
  }

  // Compare against the committed expectations. A generator that only prints is
  // still not a pin: the whole point is that a drift fails something.
  const expectedPath = fileURLToPath(new URL('./corpus-independence.expected.json',
    import.meta.url));
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const mismatches = [];
  for (const [id, exp] of Object.entries(expected.experiments)) {
    const got = results[id];
    if (!got) { mismatches.push(id + ': not measured'); continue; }
    if (got.regressions !== exp.regressions) {
      mismatches.push(id + ': regressions expected ' + exp.regressions + ', measured ' + got.regressions);
    }
    if (got.npmTestFail !== exp.npmTestFail) {
      mismatches.push(id + ': npm test failures expected ' + exp.npmTestFail + ', measured ' + got.npmTestFail);
    }
  }
  if (mismatches.length) {
    throw new Error('measurement disagrees with corpus-independence.expected.json: ' +
      mismatches.join('; ') + '. If the change is intended, update that file in the ' +
      'same commit and say why in the Run Artifact.');
  }

  report = {
    schemaVersion: 1,
    experiment: 'corpus-independence',
    agreesWithExpectations: true,
    question: 'does the differential see a production constant shrinking?',
    note: 'The "derived corpus produced 0" column is HISTORICAL and cannot be ' +
      'regenerated: the derived corpus no longer exists. Reproduce it by ' +
      'checking out tools/guard-diff and project-config/evidence.js at the ' +
      'phase base revision.',
    experiments: results
  };
} catch (e) {
  restore();
  process.stderr.write('experiment failed: ' + (e && e.stack || e) + '\n');
  process.exitCode = 1;
}

if (report) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
