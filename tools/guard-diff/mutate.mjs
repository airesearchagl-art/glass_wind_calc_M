// Applies each operator in mutants.mjs, runs the full suite, and classifies the
// result. Restores every touched file on all exit paths, including a thrown
// error or Ctrl-C.
//
// Human Gate §21: results must distinguish
//   KILLED        a test failed -> the behaviour change is pinned
//   SURVIVED      no test failed AND the behaviour demonstrably changed
//   EQUIVALENT    no test failed AND no behaviour change could be found
//   PATCH-MISS    the anchor did not match exactly once -> nothing was tested
//   HARNESS ERROR the mutant could not be evaluated (module failed to load, etc)
//
// SURVIVED vs EQUIVALENT is decided by measurement, never by assumption: a
// surviving mutant is differenced against the pristine module over the
// guard-diff corpus. This campaign has twice mislabelled a live defect as
// "equivalent" by reasoning about it instead of running it.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MUTANTS } from './mutants.mjs';
import { buildCorpus } from './corpus.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_FILE = 'project-config/evidence.js';

const pristine = new Map();
const readOnce = (rel) => {
  if (!pristine.has(rel)) pristine.set(rel, readFileSync(ROOT + rel, 'utf8'));
  return pristine.get(rel);
};
const restoreAll = () => {
  for (const [rel, text] of pristine) { try { writeFileSync(ROOT + rel, text); } catch (e) { /* best effort */ } }
};
process.on('exit', restoreAll);
process.on('SIGINT', () => { restoreAll(); process.exit(130); });

// Build the differential corpus once; only survivors need it.
let CORPUS = null;
const corpus = () => {
  if (!CORPUS) {
    const ev = JSON.parse(execFileSync(process.execPath,
      ['-e', 'console.log(JSON.stringify(require("' + ROOT + 'project-config/evidence.js").PRIVATE_DOCUMENT_EXTENSION_SOURCE))'],
      { encoding: 'utf8' }));
    CORPUS = buildCorpus(ev);
  }
  return CORPUS;
};

/** Count inputs on which the mutated file changes the guard's verdict. */
function divergences(rel, mutatedText) {
  const dir = mkdtempSync(join(tmpdir(), 'mut-'));
  try {
    const probe = join(dir, 'probe.cjs');
    writeFileSync(join(dir, 'mutated.js'), mutatedText);
    writeFileSync(probe, `
      const inputs = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
      const H = require(${JSON.stringify(ROOT + rel)});
      const verdict = (m, s) => { try { m.assertPublicSafeEvidenceText(s, 'x'); } catch (e) { return 'r'; }
        // Record rule, severity AND message: a mutant that guts the advisory
        // text changes nothing observable if the probe only records rule names,
        // and would then be misreported as EQUIVALENT.
        try { return 'a' + m.lintPublicEvidenceText(s, 'x').warnings
          .map(w => w.rule + '|' + w.severity + '|' + w.message).join(','); } catch (e) { return 'e'; } };
      console.log(JSON.stringify(inputs.map((s) => verdict(H, s))));`);
    const inputsFile = join(dir, 'inputs.json');
    writeFileSync(inputsFile, JSON.stringify(corpus()));
    const before = JSON.parse(execFileSync(process.execPath, [probe, inputsFile], { encoding: 'utf8', maxBuffer: 1 << 30 }));
    writeFileSync(ROOT + rel, mutatedText);
    const after = JSON.parse(execFileSync(process.execPath, [probe, inputsFile], { encoding: 'utf8', maxBuffer: 1 << 30 }));
    writeFileSync(ROOT + rel, readOnce(rel));
    let n = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) n++;
    return n;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const tally = { KILLED: 0, SURVIVED: 0, EQUIVALENT: 0, 'PATCH-MISS': 0, 'HARNESS ERROR': 0 };
const report = (m, verdict, detail) => {
  tally[verdict]++;
  console.log(`${m.id}  ${m.describes.padEnd(56)} ${verdict}${detail ? '  ' + detail : ''}`);
};

try {
  for (const m of MUTANTS) {
    const rel = m.file || DEFAULT_FILE;
    let source;
    try { source = readOnce(rel); }
    catch (e) { report(m, 'HARNESS ERROR', 'cannot read ' + rel); continue; }

    const hits = source.split(m.find).length - 1;
    if (hits !== 1) { report(m, 'PATCH-MISS', `anchor x${hits} in ${rel}`); continue; }

    const mutated = source.replace(m.find, m.replace);
    writeFileSync(ROOT + rel, mutated);

    let out = '', crashed = false;
    try { out = execFileSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }); }
    catch (e) {
      out = (e.stdout || '') + (e.stderr || '');
      // A non-zero exit with no TAP output at all is a harness problem, not a kill.
      if (!/^# (pass|fail)/m.test(out)) crashed = true;
    }
    writeFileSync(ROOT + rel, source);

    if (crashed) { report(m, 'HARNESS ERROR', 'suite produced no TAP output'); continue; }

    const failing = [...new Set(out.split('\n').filter((l) => l.startsWith('not ok'))
      .map((l) => (l.split('- ')[1] || '').split(':')[0].trim()))];
    if (failing.length) { report(m, 'KILLED', 'by ' + failing.join(', ')); continue; }

    // No test failed. Decide SURVIVED vs EQUIVALENT by measurement.
    if (rel !== DEFAULT_FILE) {
      // The differential probe only observes the guard module; for a mutant in
      // another file it cannot prove equivalence, so say so rather than guess.
      report(m, 'SURVIVED', 'no test failed (not differentiable by the guard probe)');
      continue;
    }
    let d;
    try { d = divergences(rel, mutated); }
    catch (e) { report(m, 'HARNESS ERROR', 'differential failed: ' + e.message.slice(0, 60)); continue; }
    if (d === 0) report(m, 'EQUIVALENT', `0 divergences over ${corpus().length} inputs`);
    else report(m, 'SURVIVED', `${d} divergences over ${corpus().length} inputs`);
  }
} finally { restoreAll(); }

console.log('\n' + Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' / ') + `  (of ${MUTANTS.length})`);
// EQUIVALENT is a legitimate outcome; SURVIVED / PATCH-MISS / HARNESS ERROR are not.
process.exitCode = (tally.SURVIVED || tally['PATCH-MISS'] || tally['HARNESS ERROR']) ? 1 : 0;
