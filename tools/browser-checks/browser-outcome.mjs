// What a browser run's exit code means, kept apart from the run itself.
//
// Phase 2K §18: never record "browser VERIFIED" without an exact-head browser
// measurement, and UNVERIFIED is an acceptable thing to report. That only works
// if "the browser never ran" is distinguishable from "the browser ran and
// everything passed" AND from "the browser ran and something failed". A script
// that dies on a failed import collapses the first into whatever the caller
// makes of a non-zero exit.
//
// Outcomes are the same vocabulary the admissibility model uses, so a result
// can be recorded without translation.

export const EXIT_CODES = Object.freeze({
  PASS: 0,
  FAIL: 1,
  USAGE: 2,
  UNVERIFIED: 3,   // could not run: no browser, no Playwright
  ERROR: 4         // started and then broke: neither a pass nor a clean failure
});

/**
 * @param {{browserAvailable:boolean, checksRun:number, failures:number,
 *          crashed?:boolean}} run
 * @returns {{outcome:'PASS'|'FAIL'|'UNVERIFIED'|'ERROR', exitCode:number, detail:string}}
 */
export function classifyBrowserRun(run) {
  const r = run || {};
  if (!r.browserAvailable) {
    return { outcome: 'UNVERIFIED', exitCode: EXIT_CODES.UNVERIFIED,
      detail: 'browser not available; nothing was measured' };
  }
  if (r.crashed) {
    return { outcome: 'ERROR', exitCode: EXIT_CODES.ERROR,
      detail: 'browser started but the run did not complete' };
  }
  // Zero checks is not a pass. A run that measured nothing and reported no
  // failures would otherwise read identically to a clean run -- the same shape
  // as reading a blank instrument as a zero (P2K-F09, D-007).
  if (!(r.checksRun > 0)) {
    return { outcome: 'ERROR', exitCode: EXIT_CODES.ERROR,
      detail: 'browser available but zero checks ran' };
  }
  if (r.failures > 0) {
    return { outcome: 'FAIL', exitCode: EXIT_CODES.FAIL,
      detail: r.failures + ' of ' + r.checksRun + ' checks failed' };
  }
  return { outcome: 'PASS', exitCode: EXIT_CODES.PASS,
    detail: r.checksRun + ' checks passed' };
}
