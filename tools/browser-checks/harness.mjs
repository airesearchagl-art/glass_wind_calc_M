// Shared entry and exit for every browser harness.
//
// P2K-F06 was reported CLOSED in Wave 4 after only browser-w4.mjs was
// converted. An independent verifier applied the repair's own structural test
// to the whole directory and found four harnesses still importing Playwright
// from one machine's absolute path -- so for four of five instruments a failed
// import still died with ERR_MODULE_NOT_FOUND and exit 1, which is FAIL in this
// wave's own vocabulary. "Never ran" stayed indistinguishable from "ran and
// failed" exactly where §18's UNVERIFIED discipline needs the distinction.
//
// The repair lives here rather than being copied five times, because copying it
// five times is how one copy gets missed.

import { resolvePlaywright, BrowserUnavailableError } from './resolve-playwright.mjs';
import { classifyBrowserRun, EXIT_CODES } from './browser-outcome.mjs';

function emit(instrument, verdict, extra) {
  console.log(JSON.stringify(Object.assign({
    schemaVersion: 1, instrument,
    outcome: verdict.outcome, detail: verdict.detail
  }, extra || {}), null, 2));
}

/**
 * Resolve Playwright and install a crash guard, or report UNVERIFIED and exit 3.
 *
 * `counts()` lets the crash guard report how far the run got. It is called only
 * on a crash, so a harness can pass a closure over mutable counters.
 */
export async function openBrowser(instrument, counts) {
  const readCounts = counts || (() => ({ checksRun: 0, failures: 0 }));
  const crashExit = (err) => {
    const c = readCounts();
    const verdict = classifyBrowserRun({ browserAvailable: true,
      checksRun: c.checksRun, failures: c.failures, crashed: true });
    console.error('browser run crashed: ' + (err && err.stack ? err.stack : err));
    emit(instrument, verdict);
    process.exit(verdict.exitCode);
  };
  process.on('uncaughtException', crashExit);
  process.on('unhandledRejection', crashExit);

  try {
    const resolved = await resolvePlaywright();
    return { chromium: resolved.chromium, playwrightSource: resolved.source };
  } catch (e) {
    if (!(e instanceof BrowserUnavailableError)) throw e;
    // Nothing was measured. Not a pass, not a failure.
    const verdict = classifyBrowserRun({ browserAvailable: false, checksRun: 0, failures: 0 });
    console.error(e.message);
    emit(instrument, verdict, {
      attempts: e.attempts.map((a) => ({ source: a.source, error: a.error }))
    });
    process.exit(verdict.exitCode);
  }
}

/**
 * Classify and exit. Zero checks with zero failures is ERROR, not PASS: a run
 * that measured nothing must not read like a clean one.
 */
export function finishRun(instrument, checksRun, failures, extra) {
  const verdict = classifyBrowserRun({ browserAvailable: true, checksRun, failures });
  emit(instrument, verdict, Object.assign({ checksRun, failures }, extra || {}));
  process.exit(verdict.exitCode);
}

export { EXIT_CODES };
