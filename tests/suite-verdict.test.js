'use strict';
// Phase 2K Wave 3 — how the mutation harness reads a suite run (P2K-F09).
//
// The harness's verdict logic used to be inline in mutate.mjs, reachable only
// by running a 50-operator battery. It is now a pure function, so the failure
// mode that motivated this file can be pinned with a literal TAP sample.
//
// Measured before the repair, on a mutant the battery otherwise reports KILLED:
//
//   clean env                   threw=yes exit=1 TAP=yes not-ok=5 -> KILLED
//   NODE_TEST_CONTEXT leaked    threw=no  exit=0 TAP=no  not-ok=0 -> SURVIVED
//
// Every operator in a leaked battery reports as surviving, and the table looks
// normal. The old guard could not see it: it required the throw.

const test = require('node:test');
const assert = require('node:assert');

function load() {
  return import('../tools/guard-diff/suite-verdict.mjs');
}

/** A TAP sample written out by hand. Not generated from the runner. */
function tap(opts) {
  const lines = ['TAP version 13', '1..' + opts.total];
  (opts.notOk || []).forEach((name, i) => lines.push('not ok ' + (i + 1) + ' - ' + name));
  lines.push('# tests ' + opts.total);
  lines.push('# pass ' + opts.pass);
  lines.push('# fail ' + opts.fail);
  return lines.join('\n') + '\n';
}

test('P2K-H01: 失敗した実行は KILLED、落ちた test 名を伴う', async () => {
  const m = await load();
  const v = m.classifySuiteRun({
    stdout: tap({ total: 3, pass: 1, fail: 2, notOk: ['P2K-L01: 何か', 'FP-01: 別の何か'] }),
    exitCode: 1, threw: true
  });
  assert.equal(v.kind, 'KILLED');
  assert.deepEqual(v.failing, ['P2K-L01', 'FP-01'],
    'test 名の切り出しが変わった: ' + JSON.stringify(v.failing));
});

test('P2K-H02: 全部通った実行は NO_FAILURE', async () => {
  const m = await load();
  const v = m.classifySuiteRun({ stdout: tap({ total: 3, pass: 3, fail: 0 }), exitCode: 0, threw: false });
  assert.equal(v.kind, 'NO_FAILURE');
  assert.deepEqual(v.failing, []);
});

test('P2K-H03: TAP summary が無く exit 0 —— これを「失敗なし」と読んではならない', async () => {
  const m = await load();
  // The exact shape NODE_TEST_CONTEXT produces: a warning, no summary, exit 0.
  // This is THE regression this module exists to prevent. If it ever classifies
  // as NO_FAILURE again, a whole battery silently reports SURVIVED (P2K-F09).
  const v = m.classifySuiteRun({
    stdout: '(node:1999) Warning: node:test run() is being called recursively ' +
            'within a test file. skipping running files.\n',
    exitCode: 0, threw: false
  });
  assert.equal(v.kind, 'HARNESS_ERROR',
    'parse できない実行を陰性と読んだ——白紙の計器を 0 と読むのと同じ');
  assert.match(v.detail, /no TAP summary/);
});

test('P2K-H04: TAP summary が無く exit 非 0 も HARNESS_ERROR（kill ではない）', async () => {
  const m = await load();
  const v = m.classifySuiteRun({ stdout: 'npm ERR! missing script: test\n', exitCode: 1, threw: true });
  assert.equal(v.kind, 'HARNESS_ERROR');
  // Specifically NOT killed: a suite that never ran cannot kill a mutant.
  assert.deepEqual(v.failing, []);
});

test('P2K-H05: # fail と not ok 行が矛盾したら、どちらも引用しない', async () => {
  const m = await load();
  // fail 0 but a not-ok line present.
  const a = m.classifySuiteRun({
    stdout: tap({ total: 2, pass: 2, fail: 0, notOk: ['ghost'] }), exitCode: 0, threw: false });
  assert.equal(a.kind, 'HARNESS_ERROR');
  assert.match(a.detail, /disagrees/);

  // fail 2 but no not-ok lines.
  const b = m.classifySuiteRun({
    stdout: tap({ total: 2, pass: 0, fail: 2 }), exitCode: 1, threw: true });
  assert.equal(b.kind, 'HARNESS_ERROR');
  assert.match(b.detail, /disagrees/);
});

test('P2K-H06: exit code と # fail が矛盾したら HARNESS_ERROR', async () => {
  const m = await load();
  const v = m.classifySuiteRun({
    stdout: tap({ total: 2, pass: 0, fail: 2, notOk: ['a', 'b'] }), exitCode: 0, threw: false });
  assert.equal(v.kind, 'HARNESS_ERROR');
  assert.match(v.detail, /exit 0 disagrees/);
});

test('P2K-H07: 子 process の env から有害な key だけを落とす', async () => {
  const m = await load();
  assert.deepEqual(m.HOSTILE_ENV_KEYS.slice().sort(),
    ['NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'],
    'key の集合が変わった: ' + JSON.stringify(m.HOSTILE_ENV_KEYS));
  assert.throws(() => { m.HOSTILE_ENV_KEYS.push('x'); },
    'HOSTILE_ENV_KEYS が凍結されていない');

  const kept = m.childEnvironment({
    PATH: '/usr/bin', HOME: '/somewhere', CI: 'true',
    NODE_TEST_CONTEXT: 'child', NODE_OPTIONS: '--enable-source-maps',
    NODE_V8_COVERAGE: '/cov'
  });
  assert.deepEqual(Object.keys(kept).sort(), ['CI', 'HOME', 'PATH'],
    '落とす/残す の判断が変わった: ' + JSON.stringify(Object.keys(kept)));
  // The caller's own environment must not be mutated.
  const original = { NODE_TEST_CONTEXT: 'child' };
  m.childEnvironment(original);
  assert.equal(original.NODE_TEST_CONTEXT, 'child', '呼び出し側の env を壊した');
});
