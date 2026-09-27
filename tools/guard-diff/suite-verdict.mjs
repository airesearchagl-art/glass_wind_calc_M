// How the mutation harness reads a `npm test` run — extracted so it can be
// tested against literal TAP samples instead of only by running 50 batteries.
//
// P2K-F09. The harness used to decide from two things: did execFileSync throw,
// and are there `not ok` lines. Both are absent in a specific failure mode that
// looks exactly like success:
//
//   NODE_TEST_CONTEXT in the environment makes the spawned `node --test`
//   believe it is itself a test worker. It prints no TAP summary and EXITS 0
//   even when tests fail.
//
// Measured on a mutant the battery otherwise reports KILLED:
//
//   clean env    threw=yes exit=1 TAP=yes  not-ok=5  # fail 5  -> KILLED
//   leaked       threw=no  exit=0 TAP=no   not-ok=0  # fail -   -> SURVIVED
//
// So a whole battery would report every operator as surviving, with a normal
// looking table. The old "no TAP output" guard could not catch it because it
// lived inside the catch branch and this run does not throw.
//
// Two rules follow, and they are the same rule twice: a reading you cannot
// parse is not a negative result.
//
//   1. No TAP summary -> HARNESS_ERROR, whatever the exit code was.
//   2. Signals that disagree -> HARNESS_ERROR. Never pick one and proceed.

/** Keys that make a spawned `node --test` misreport. Removed from the child. */
export const HOSTILE_ENV_KEYS = Object.freeze([
  'NODE_TEST_CONTEXT',   // makes the child think it is a test worker
  'NODE_OPTIONS',        // can inject flags that change reporter or exit code
  'NODE_V8_COVERAGE'     // changes process exit handling
]);

/** The environment a suite child is allowed to see. */
export function childEnvironment(env) {
  const out = { ...(env || {}) };
  for (const key of HOSTILE_ENV_KEYS) delete out[key];
  return out;
}

/**
 * Classify one suite run.
 *
 * @param {{stdout:string, exitCode:number, threw:boolean}} run
 * @returns {{kind:'KILLED'|'NO_FAILURE'|'HARNESS_ERROR', failing:string[], detail:string}}
 */
export function classifySuiteRun(run) {
  const text = (run && run.stdout) || '';
  const passLine = text.match(/^# pass (\d+)$/m);
  const failLine = text.match(/^# fail (\d+)$/m);

  if (!passLine || !failLine) {
    return { kind: 'HARNESS_ERROR', failing: [],
      detail: 'suite produced no TAP summary (exit ' + run.exitCode + ')' };
  }

  const failCount = Number(failLine[1]);
  const failing = [...new Set(
    text.split('\n')
      .filter((l) => l.startsWith('not ok'))
      .map((l) => (l.split('- ')[1] || '').split(':')[0].trim())
      .filter(Boolean)
  )];

  // Three independent signals say the same thing when the run is sound: the
  // summary count, the individual `not ok` lines, and the exit code. Any
  // disagreement means one of them is lying and none can be quoted.
  if ((failCount > 0) !== (failing.length > 0)) {
    return { kind: 'HARNESS_ERROR', failing,
      detail: '# fail ' + failCount + ' disagrees with ' + failing.length +
              " distinct 'not ok' line(s)" };
  }
  if ((failCount > 0) !== (run.exitCode !== 0)) {
    return { kind: 'HARNESS_ERROR', failing,
      detail: 'exit ' + run.exitCode + ' disagrees with # fail ' + failCount };
  }

  if (failCount > 0) {
    return { kind: 'KILLED', failing, detail: 'by ' + failing.join(', ') };
  }
  return { kind: 'NO_FAILURE', failing: [], detail: '' };
}
