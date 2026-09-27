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
import { buildCorpus } from './corpus.mjs';

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
const corpus = buildCorpus(head.PRIVATE_DOCUMENT_EXTENSION_SOURCE);
const verdict = (M, t) => { try { M.assertPublicSafeEvidenceText(t, 'd'); return null; }
  catch (e) { return (e.message.split('pattern: ')[1] || 'error').replace(')', ''); } };

let baseRej = 0, headRej = 0;
const regressions = [], tightened = [];
corpus.forEach((t) => {
  const b = verdict(base, t), h = verdict(head, t);
  if (b) baseRej++;
  if (h) headRej++;
  if (b && !h) regressions.push([t, b]);
  else if (!b && h) tightened.push([t, h]);
});
const byRule = (rows) => { const m = {}; rows.forEach(([, r]) => { m[r] = (m[r] || 0) + 1; }); return m; };

console.log(`corpus            : ${corpus.length}`);
console.log(`${baseRev} rejects : ${baseRej}`);
console.log(`${headRev || 'working tree'} rejects : ${headRej}`);
console.log(`REGRESSIONS (base rejects, target accepts): ${regressions.length} ${JSON.stringify(byRule(regressions))}`);
regressions.slice(0, 6).forEach(([t, r]) => console.log(`   ! ${r}  ${t.slice(0, 44)}`));
console.log(`tightened   (base accepts, target rejects): ${tightened.length} ${JSON.stringify(byRule(tightened))}`);
tightened.slice(0, 4).forEach(([t, r]) => console.log(`     ${r}  ${t.slice(0, 44)}`));
process.exit(regressions.length ? 1 : 0);
