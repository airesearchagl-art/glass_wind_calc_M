// Differential of assertPublicSafeEvidenceText between two revisions.
//
//   node tools/guard-diff/diff-heads.mjs <base-rev> [head-rev]
//
// Prints, for the shared corpus: how many inputs each side rejects, and every
// class where the base rejects and the target accepts (a regression) or vice
// versa. "regression 0" is only meaningful next to the corpus that produced it.
import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { buildCorpus, constantCoverage, corpusDigest } from './corpus.mjs';
import { compare, ruleCoverageGaps, advisoryCoverageGaps, byRule, exitCodeFor } from './differential.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const [, , baseRev, headRev] = process.argv;
if (!baseRev) { console.error('usage: diff-heads.mjs <base-rev> [head-rev]'); process.exit(2); }

function load(rev) {
  if (!rev) return require(join(REPO, 'project-config/evidence.js'));
  const src = execFileSync('git', ['show', `${rev}:project-config/evidence.js`], { cwd: REPO, maxBuffer: 1 << 24 });
  const dir = mkdtempSync(join(tmpdir(), 'guard-diff-'));
  const file = join(dir, 'evidence.js');
  writeFileSync(file, src);
  return require(file);
}

const base = load(baseRev);
const head = load(headRev);

// The corpus takes NO input from either side. Passing head's constant here is
// what made this differential blind to a shrinking constant (P2K-F01).
const corpus = buildCorpus();
const d = compare(base, head, corpus);

const headLabel = headRev || 'working tree';
console.log(`corpus            : ${d.corpusSize}  (independent of both revisions)`);
console.log(`corpus digest     : ${corpusDigest(corpus)}`);
console.log(`${baseRev} rejects : ${d.baseRejects}`);
console.log(`${headLabel} rejects : ${d.headRejects}`);
console.log(`REGRESSIONS (base rejects, target accepts): ${d.regressions.length} ${JSON.stringify(byRule(d.regressions))}`);
d.regressions.slice(0, 6).forEach(([t, r]) => console.log(`   ! ${r}  ${t.slice(0, 44)}`));
console.log(`tightened   (base accepts, target rejects): ${d.tightened.length} ${JSON.stringify(byRule(d.tightened))}`);
d.tightened.slice(0, 4).forEach(([t, r]) => console.log(`     ${r}  ${t.slice(0, 44)}`));

// Both reject, different rule. Not a safety regression on that input, but it is
// the only signal a weakened rule leaves when another rule still matches.
console.log(`re-attributed (both reject, rule changed) : ${d.reattributed.length}`);
console.log(`unexpected errors (neither rule nor closure) : ${d.unexpectedErrors}  <- must be 0`);
d.reattributed.slice(0, 6).forEach(([t, b, h]) =>
  console.log(`     ${b} -> ${h}  ${t.slice(0, 40)}`));

// A zero is only as good as the corpus's reach. Say what was never exercised.
const baseGaps = ruleCoverageGaps(base, d.baseAttribution);
const headGaps = ruleCoverageGaps(head, d.headAttribution);
console.log(`rule coverage     : base ${Object.keys(d.baseAttribution).length} attributed` +
  (baseGaps.length ? `, NEVER EXERCISED: ${baseGaps.join(', ')}` : ', no gaps'));
console.log(`                    ${headLabel} ${Object.keys(d.headAttribution).length} attributed` +
  (headGaps.length ? `, NEVER EXERCISED: ${headGaps.join(', ')}` : ', no gaps'));
const advGaps = advisoryCoverageGaps(head, corpus);
console.log(`advisory coverage : ${headLabel}` +
  (advGaps.length ? ` NEVER TRIGGERED: ${advGaps.join(', ')}` : ' all advisory rules triggered'));

// Where the corpus's own threat list and production's have drifted apart.
for (const [label, mod] of [[baseRev, base], [headLabel, head]]) {
  const cov = constantCoverage(mod);
  const notes = [];
  if (cov.dots.missingFromCorpus.length) notes.push(`dots production-only: ${cov.dots.missingFromCorpus.length}`);
  if (cov.dots.extraInCorpus.length) notes.push(`dots corpus-only: ${cov.dots.extraInCorpus.length}`);
  if (cov.extensionAtoms.missingFromCorpus.length) notes.push(`ext production-only: ${cov.extensionAtoms.missingFromCorpus.join(',')}`);
  if (cov.extensionAtoms.extraInCorpus.length) notes.push(`ext corpus-only: ${cov.extensionAtoms.extraInCorpus.join(',')}`);
  console.log(`constant coverage : ${label} ${notes.length ? notes.join(' / ') : 'identical to corpus threat list'}`);
}

console.log('');
console.log('A zero above is a statement about THIS corpus, not about the guard.');
console.log('Rules listed as NEVER EXERCISED have not been measured at all.');

// Regressions fail. So does a corpus that cannot see one of the rules it claims
// to police -- reporting 0 for an unexercised rule is the defect, not the zero.
process.exit(exitCodeFor({
  regressions: d.regressions.length,
  coverageGaps: headGaps.length + advGaps.length,
  unexpectedErrors: d.unexpectedErrors
}));
