// Applies each operator in mutants.mjs to project-config/evidence.js, runs the
// full suite, and reports KILLED / SURVIVED / PATCH-MISS. Restores the file on
// every exit path, including a thrown error or Ctrl-C.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MUTANTS } from './mutants.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TARGET = ROOT + 'project-config/evidence.js';
const pristine = readFileSync(TARGET, 'utf8');
const restore = () => writeFileSync(TARGET, pristine);
process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(130); });

let killed = 0, survived = 0, miss = 0;
try {
  for (const m of MUTANTS) {
    const n = pristine.split(m.find).length - 1;
    if (n !== 1) {
      console.log(`${m.id}  ${m.describes.padEnd(48)} PATCH-MISS (anchor x${n})`);
      miss++; continue;
    }
    writeFileSync(TARGET, pristine.replace(m.find, m.replace));
    let out = '';
    try { out = execFileSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    const failing = [...new Set(out.split('\n').filter((l) => l.startsWith('not ok'))
      .map((l) => (l.split('- ')[1] || '').split(':')[0]))];
    if (failing.length) { console.log(`${m.id}  ${m.describes.padEnd(48)} KILLED by ${failing.join(', ')}`); killed++; }
    else { console.log(`${m.id}  ${m.describes.padEnd(48)} *** SURVIVED ***`); survived++; }
  }
} finally { restore(); }
console.log(`\nKILLED ${killed} / SURVIVED ${survived} / PATCH-MISS ${miss}  (of ${MUTANTS.length})`);
process.exitCode = (survived || miss) ? 1 : 0;
