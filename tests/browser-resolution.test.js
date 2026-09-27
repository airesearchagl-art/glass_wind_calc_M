'use strict';
// Phase 2K Wave 4 — browser verification durability (P2K-F06).
//
// browser-w4.mjs opened with an absolute path into one machine's global module
// root. The README said so, so it was not hidden -- but an instrument only one
// machine can run does not meet "a fresh verifier can reconstruct this" (§23).
//
// The second half matters more than the path. §18: never record "browser
// VERIFIED" without an exact-head measurement, and UNVERIFIED is acceptable.
// That only works if "never ran" is distinguishable from "ran and passed" and
// from "ran and failed". A script that dies on a failed import collapses the
// first into whatever the caller makes of a non-zero exit.
//
// Nothing here launches a browser. Every dependency is injected.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const loadResolver = () => import('../tools/browser-checks/resolve-playwright.mjs');
const loadOutcome = () => import('../tools/browser-checks/browser-outcome.mjs');

const FAILING_IMPORT = () =>
  Promise.reject(Object.assign(new Error('nope'), { code: 'ERR_MODULE_NOT_FOUND' }));

test('P2K-R01: playwright の場所は発見する。source に絶対 path を埋めない', () => {
  // Structural, like P2K-D01. The defect was a hardcoded location, and no
  // value assertion can see a hardcoded location.
  for (const rel of ['tools/browser-checks/browser-w4.mjs',
                     'tools/browser-checks/resolve-playwright.mjs']) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    // Comments are excluded deliberately: resolve-playwright.mjs quotes the old
    // hardcoded import line to record what the defect was, and that quotation
    // is documentation, not a dependency. An actual import cannot live on a
    // commented line, so nothing real hides here.
    const offenders = src.split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .filter(([, line]) => /['"`]\/[^'"`\n]*node_modules[^'"`\n]*playwright/.test(line));
    assert.deepEqual(offenders, [],
      rel + ' に playwright への絶対 path がある: ' + JSON.stringify(offenders));
  }
});

test('P2K-R02: 候補の順序——明示的な override が最優先', async () => {
  const m = await loadResolver();
  const withOverride = m.playwrightCandidates({
    env: { PLAYWRIGHT_MODULE: '/somewhere/pw.mjs' },
    exec: () => '/global/root\n',
    execPath: '/opt/n/bin/node'
  });
  assert.deepEqual(withOverride.map((c) => c.source),
    ['PLAYWRIGHT_MODULE', 'bare-specifier', 'npm-root-g', 'interpreter-relative'],
    '候補の順序が変わった: ' + JSON.stringify(withOverride.map((c) => c.source)));
  assert.equal(withOverride[0].specifier, '/somewhere/pw.mjs');

  // Without an override the list starts at the bare specifier: a repo that has
  // playwright in devDependencies must not be sent to a global root first.
  const plain = m.playwrightCandidates({
    env: {}, exec: () => '/global/root\n', execPath: '/opt/n/bin/node' });
  assert.equal(plain[0].source, 'bare-specifier');

  // When npm's root and the interpreter's root agree, the duplicate is dropped.
  const same = m.playwrightCandidates({
    env: {}, exec: () => '/opt/n/lib/node_modules\n', execPath: '/opt/n/bin/node' });
  assert.deepEqual(same.map((c) => c.source), ['bare-specifier', 'npm-root-g']);
});

test('P2K-R03: root は npm と interpreter から導出する。npm が無ければ null', async () => {
  const m = await loadResolver();
  assert.equal(m.globalModuleRoot(() => '  /a/b/node_modules \n'), '/a/b/node_modules');
  assert.equal(m.globalModuleRoot(() => ''), null, '空出力を root として採用した');
  assert.equal(m.globalModuleRoot(() => { throw new Error('npm missing'); }), null,
    'npm が無い環境で例外が漏れた');
  // <prefix>/bin/node -> <prefix>/lib/node_modules
  assert.equal(m.interpreterModuleRoot('/opt/node22/bin/node'),
    '/opt/node22/lib/node_modules');
});

test('P2K-R04: 最初に解決できた候補を、その出所つきで返す', async () => {
  const m = await loadResolver();
  const fake = { chromium: { launch() {} } };
  const tried = [];
  const r = await m.resolvePlaywright({
    env: {}, exec: () => '/g/node_modules\n', execPath: '/opt/n/bin/node',
    exists: () => true,
    importer: (spec) => {
      tried.push(spec);
      return spec === 'playwright' ? FAILING_IMPORT() : Promise.resolve(fake);
    }
  });
  assert.equal(r.source, 'npm-root-g', '出所が記録されていない: ' + r.source);
  assert.equal(r.specifier, '/g/node_modules/playwright/index.mjs');
  assert.equal(tried[0], 'playwright', '候補の順に試していない');
});

test('P2K-R05: 解決できなければ typed error。何を試したかを全部言う', async () => {
  const m = await loadResolver();
  await assert.rejects(
    () => m.resolvePlaywright({
      env: {}, exec: () => { throw new Error('no npm'); },
      execPath: '/nowhere/bin/node', importer: FAILING_IMPORT
    }),
    (e) => {
      // Typed, not a bare module-not-found: the caller has to be able to tell
      // "could not run" from "ran and failed".
      assert.equal(e.name, 'BrowserUnavailableError', '型が違う: ' + e.name);
      assert.equal(Array.isArray(e.attempts), true);
      assert.equal(e.attempts.length >= 2, true,
        '試した候補が報告されていない: ' + JSON.stringify(e.attempts));
      assert.match(e.message, /PLAYWRIGHT_MODULE/, '復旧方法が message に無い');
      return true;
    });
});

test('P2K-R06: chromium を export しない module は採用しない', async () => {
  const m = await loadResolver();
  await assert.rejects(
    () => m.resolvePlaywright({
      env: {}, exec: () => null, execPath: '/nowhere/bin/node',
      exists: () => true,
      importer: () => Promise.resolve({ somethingElse: true })
    }),
    (e) => {
      assert.equal(e.name, 'BrowserUnavailableError');
      assert.equal(e.attempts.some((a) => /exports no chromium/.test(a.error)), true,
        '理由が記録されていない: ' + JSON.stringify(e.attempts));
      return true;
    });
});

test('P2K-R07: 4 つの outcome と、それぞれ別の exit code', async () => {
  const o = await loadOutcome();

  assert.deepEqual(o.classifyBrowserRun({ browserAvailable: true, checksRun: 34, failures: 0 }),
    { outcome: 'PASS', exitCode: 0, detail: '34 checks passed' });
  assert.equal(o.classifyBrowserRun({ browserAvailable: true, checksRun: 34, failures: 2 }).outcome,
    'FAIL');
  assert.equal(o.classifyBrowserRun({ browserAvailable: false, checksRun: 0, failures: 0 }).outcome,
    'UNVERIFIED');
  assert.equal(o.classifyBrowserRun({ browserAvailable: true, checksRun: 3, failures: 0, crashed: true }).outcome,
    'ERROR');

  // Zero checks and zero failures is NOT a pass. A run that measured nothing
  // would otherwise read exactly like a clean one -- reading a blank
  // instrument as a zero, the same error as P2K-F09 (D-007).
  assert.equal(o.classifyBrowserRun({ browserAvailable: true, checksRun: 0, failures: 0 }).outcome,
    'ERROR', '0 件測って PASS と言った');

  // Distinct codes, so a caller can tell the four apart from the exit status
  // alone. UNVERIFIED must not share 1 with FAIL.
  const codes = ['PASS', 'FAIL', 'UNVERIFIED', 'ERROR'].map((k) => o.EXIT_CODES[k]);
  assert.deepEqual(codes, [0, 1, 3, 4], 'exit code の割り当てが変わった: ' + codes);
  assert.equal(new Set(codes).size, 4, 'exit code が衝突している');
  assert.throws(() => { o.EXIT_CODES.PASS = 9; }, 'EXIT_CODES が凍結されていない');

  // The outcome vocabulary must stay the admissibility model's, so a browser
  // result can be recorded without translation.
  const adm = await import('../tools/verification/admissibility.mjs');
  for (const name of ['PASS', 'FAIL', 'UNVERIFIED', 'ERROR']) {
    assert.equal(adm.OUTCOMES.includes(name), true,
      name + ' が admissibility の OUTCOMES に無い');
  }
});
