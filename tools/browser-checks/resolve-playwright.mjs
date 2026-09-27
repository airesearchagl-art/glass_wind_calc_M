// Find Playwright without hardcoding where it lives (P2K-F06).
//
// browser-w4.mjs used to open with:
//
//   import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
//
// which runs in exactly one environment. The README said so, so it was not a
// hidden defect -- but "a fresh verifier can reconstruct this" is the standard
// (§23), and an instrument only one machine can run does not meet it.
//
// The candidates below are DISCOVERED, not listed: the global module root comes
// from `npm root -g`, and the second from the running interpreter's own
// location, so neither encodes a particular machine. The old absolute path is
// what `npm root -g` returns here, which is why it worked.
//
// If none resolve, this throws a typed error rather than a module-not-found.
// The distinction is the point: a browser that could not be launched is
// UNVERIFIED, which is not a pass and not a failure. Letting the import crash
// makes "not run" indistinguishable from "ran and failed".

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export class BrowserUnavailableError extends Error {
  constructor(message, attempts) {
    super(message);
    this.name = 'BrowserUnavailableError';
    this.attempts = attempts || [];
  }
}

/** Where a global npm install puts modules, asked rather than assumed. */
export function globalModuleRoot(exec) {
  const run = exec || ((cmd, args) => execFileSync(cmd, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }));
  try {
    const out = run('npm', ['root', '-g']);
    const trimmed = String(out || '').trim();
    return trimmed || null;
  } catch (e) {
    return null;
  }
}

/** Derived from the running interpreter, so it needs no npm at all. */
export function interpreterModuleRoot(execPath) {
  const bin = execPath || process.execPath;
  // <prefix>/bin/node -> <prefix>/lib/node_modules
  return join(dirname(dirname(bin)), 'lib', 'node_modules');
}

/**
 * Candidate specifiers, most explicit first.
 *
 * @param {{env?:object, exec?:Function, execPath?:string}} [opts]
 */
export function playwrightCandidates(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const out = [];
  // 1. An explicit override always wins, so a verifier on an unusual layout
  //    has a documented way in that does not require editing the source.
  if (env.PLAYWRIGHT_MODULE) {
    out.push({ source: 'PLAYWRIGHT_MODULE', specifier: env.PLAYWRIGHT_MODULE });
  }
  // 2. A normal dependency resolution, which is what a repo with playwright in
  //    devDependencies would use.
  out.push({ source: 'bare-specifier', specifier: 'playwright' });
  // 3. and 4. Discovered roots.
  const globalRoot = globalModuleRoot(o.exec);
  if (globalRoot) {
    out.push({ source: 'npm-root-g', specifier: join(globalRoot, 'playwright', 'index.mjs') });
  }
  const interpRoot = interpreterModuleRoot(o.execPath);
  if (!globalRoot || interpRoot !== globalRoot) {
    out.push({ source: 'interpreter-relative', specifier: join(interpRoot, 'playwright', 'index.mjs') });
  }
  return out;
}

/**
 * Resolve Playwright, or throw BrowserUnavailableError listing what was tried.
 *
 * `exists` is injectable alongside `importer` for the same reason: a resolver
 * whose dependencies cannot all be replaced can only be tested on the machine
 * it happens to be running on, which is the shape of the defect it repairs.
 *
 * @param {{env?:object, exec?:Function, execPath?:string, importer?:Function,
 *          exists?:Function}} [opts]
 * @returns {Promise<{chromium:object, source:string, specifier:string}>}
 */
export async function resolvePlaywright(opts) {
  const o = opts || {};
  const load = o.importer || ((spec) => import(spec));
  const exists = o.exists || existsSync;
  const attempts = [];
  for (const candidate of playwrightCandidates(o)) {
    // An absolute path that is not there is worth reporting distinctly from a
    // path that is there but fails to load.
    if (candidate.specifier.startsWith('/') && !exists(candidate.specifier)) {
      attempts.push({ ...candidate, error: 'not present' });
      continue;
    }
    try {
      const mod = await load(candidate.specifier);
      const chromium = mod && (mod.chromium || (mod.default && mod.default.chromium));
      if (!chromium) {
        attempts.push({ ...candidate, error: 'loaded but exports no chromium' });
        continue;
      }
      return { chromium, source: candidate.source, specifier: candidate.specifier };
    } catch (e) {
      attempts.push({ ...candidate, error: (e && e.code) || String(e && e.message).slice(0, 80) });
    }
  }
  throw new BrowserUnavailableError(
    'Playwright could not be resolved. Set PLAYWRIGHT_MODULE to its index.mjs, ' +
    'or install it (npm i -D playwright). Tried: ' +
    attempts.map((a) => a.source + ' (' + a.error + ')').join('; '),
    attempts
  );
}
