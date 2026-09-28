#!/usr/bin/env node
// Publication lint — the Human Review surface for advisory guard warnings.
//
// Human Gate §7 / QD-J17. Demoting www / known-private-provider /
// opaque-long-token from throw to warning is only safe if the warnings reach a
// person. This repository already had a cautionary example: `blockerKinds` is
// computed, aggregated, deep-frozen into the closure result, and rendered
// nowhere -- a channel for non-blocking diagnostics that silently drops them.
// Advisory warnings must not become the second instance of that.
//
//   npm run lint:evidence-publication
//
// This is a REVIEW AID, NOT A GATE. Advisory warnings do not fail the command;
// a human decides whether they are acceptable. The command fails only if a
// HARD structural rule matches publication-facing text (which should be
// impossible, since the module enforces those at construction) or if the
// inventory cannot be built -- both mean something is wrong with the tooling
// or the contract, not with the prose.
//
// Empty advisory output is NOT proof that the prose is safe to publish
// (Human Gate §13). These rules are open-set heuristics: confusable homoglyphs
// and spelled-out forms pass them. Human Review remains required either way.

import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { posix as posixPath } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Walk the shipped project configuration and collect the values that are
 * actually publication-facing, with the path each one came from.
 *
 * Human Gate §10: because a provider-like caseId no longer throws, the
 * inventory must include published identifiers, not only prose. It must NOT
 * grow into a scan of arbitrary user input -- only fields the existing
 * contracts already designate as publication-facing.
 */
export const PUBLICATION_FACING_FIELDS = [
  'publicDescription',          // Evidence prose on observations and facts
  'publicEvidenceDescription',  // Evidence prose nested in verified cases
  'caseId'                      // published identifier (UI, export package, PR body)
];

/** The shipped configuration tree, relative to the repository root. */
export const CONFIG_DIR_NAME = 'project-config';

/**
 * Discover every shipped config module under `dir`, RECURSIVELY.
 *
 * Two separate lessons are baked in here.
 *
 * (1) Default roots are DERIVED, not listed. The first version named
 *     `project-config/miyoshi.js` by hand and therefore missed the manual
 *     input-mode config's shipped publicDescription entirely (FP-01) -- the
 *     lint claimed to inspect publicDescription and did not inspect one of
 *     them. A hand-written list of what to inspect goes stale the same way a
 *     hand-written list of what to detect does (F3, F13-03, F15-E3, F16-03).
 *
 * (2) The scan is recursive. The previous version used a single flat
 *     readdirSync, and so did its test, so neither could see a config module
 *     one directory down (QD-J23). That is measured, not asserted:
 *     `tools/verification/experiments/lint-discovery-depth.mjs` plants three
 *     publication-facing values one level down -- one of them tripping a HARD
 *     rule -- and observes discovery finding zero of them while the suite
 *     stays green. Flat discovery also contradicted this function's own
 *     documented promise that "a new config module is covered the day it is
 *     added"; a subdirectory broke that promise silently.
 *
 * The failure modes are not symmetric, which is what decides the contract.
 * Scanning one module too many costs a false advisory that a human dismisses.
 * Scanning one too few costs a value that must never be published going
 * unseen. This lint exists to prevent the second, so it over-includes.
 *
 * Deliberate properties, each pinned by a test:
 *   - recursive, unbounded depth
 *   - symlinks are NOT followed (no cycles, no escaping the tree)
 *   - order is sorted, so the report is deterministic
 *   - a module that fails to load THROWS; inspecting fewer values quietly is
 *     the exact failure this function was rewritten to remove
 *
 * Returned names are POSIX-relative to `dir` with `.js` stripped, so a nested
 * module reports as `sub/probe.publicDescription` and a human can find it.
 */
export function discoverConfigModules(dir) {
  const base = dir || ROOT + CONFIG_DIR_NAME;
  const found = [];
  // Explicit stack descent rather than readdirSync's own `recursive` option:
  // the independent oracle in the test uses `git ls-files`, a different
  // mechanism entirely, so the two cannot share a walker bug.
  const stack = [''];
  while (stack.length > 0) {
    const relDir = stack.pop();
    const absDir = relDir === '' ? base : base + '/' + relDir;
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir === '' ? entry.name : relDir + '/' + entry.name;
      // A symlink is not descended and not loaded: following one can loop
      // forever or leave the configuration tree. Measured caveat -- this line
      // is defence in depth, not the mechanism. `withFileTypes` reports a
      // symlink with isDirectory() AND isFile() both false, so the two checks
      // below already exclude it; removing this line produced byte-identical
      // output on a tree holding a file symlink, a directory symlink and a
      // cyclic one (mutant K2-03, classified EQUIVALENT by that measurement,
      // not by inspection). Kept because the exclusion is then stated rather
      // than relied upon as a side effect of Dirent semantics.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { stack.push(rel); continue; }
      if (entry.isFile() && rel.endsWith('.js')) found.push(rel);
    }
  }
  return found.sort();
}

export function defaultRoots(dir) {
  const base = dir || ROOT + CONFIG_DIR_NAME;
  const sources = {};
  for (const rel of discoverConfigModules(base)) {
    // A module that fails to load is a tooling problem, not a clean inventory:
    // surface it rather than silently inspecting fewer values.
    sources[rel.replace(/\.js$/, '')] = require(posixPath.join(base, rel));
  }
  return sources;
}

/**
 * Collect publication-facing values.
 *
 * A publication-facing KEY makes everything beneath it publication-facing. The
 * first version required the value to be a string at the key itself, so
 *
 *     publicDescription: ['C:\\Users\\...\\plan.pdf を参照']
 *     publicDescription: { ja: '...', en: '...' }
 *
 * were both walked and then collected from nowhere: the array's members have no
 * key, and `ja` / `en` are not publication-facing names. An independent verifier
 * demonstrated the consequence with a tracked config module — a Windows
 * absolute path inside an array-wrapped publicDescription gave
 * `inspected 12 / No advisory warnings`, exit 0, and 720 green tests, while the
 * identical string unwrapped was rejected.
 *
 * A value under such a key that is neither a string nor a container is reported
 * as an unreadable shape rather than skipped. This lint is a publication guard;
 * a field it cannot read is a thing it cannot vouch for.
 */
export function collectInventory(roots) {
  const sources = roots || defaultRoots();
  const found = [];
  const unreadable = [];
  // Keyed by node AND by the field context, because the same object reached
  // from inside a publication-facing subtree must still be collected from even
  // if it was already walked from outside one.
  const seen = new Map();
  const visited = (node, field) => {
    const fields = seen.get(node);
    if (fields) {
      if (fields.has(field || '')) return true;
      fields.add(field || '');
      return false;
    }
    seen.set(node, new Set([field || '']));
    return false;
  };
  const note = (here, field, value) => {
    if (typeof value === 'string') { found.push({ path: here, field, value }); return; }
    unreadable.push({ path: here, field,
      valueType: value === null ? 'null' : typeof value });
  };
  const walk = (node, path, field) => {
    if (!node || typeof node !== 'object' || visited(node, field)) return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => {
        const here = path + '[' + i + ']';
        if (v && typeof v === 'object') walk(v, here, field);
        else if (field) note(here, field, v);
      });
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const here = path + '.' + key;
      const isField = PUBLICATION_FACING_FIELDS.includes(key);
      const inner = isField ? key : field;
      if (value && typeof value === 'object') walk(value, here, inner);
      else if (inner) note(here, inner, value);
    }
  };
  for (const [name, root] of Object.entries(sources)) walk(root, name, null);
  found.unreadableShapes = unreadable;
  return found;
}

/** Evaluate one inventory against both rule sets. Pure; no printing. */
export function analyse(inventory, evidenceModule) {
  const Evidence = evidenceModule || require(ROOT + 'project-config/evidence.js');
  return inventory.map((item) => {
    let hardError = null;
    try { Evidence.assertPublicSafeEvidenceText(item.value, item.field); }
    catch (e) { hardError = e.message; }
    // A value that fails a hard rule cannot be linted meaningfully, but the
    // advisory pass is independent, so run it regardless and report both.
    let warnings = [];
    try { warnings = Evidence.lintPublicEvidenceText(item.value, item.field).warnings; }
    catch (e) { hardError = hardError || e.message; }
    return { ...item, hardError, warnings };
  });
}

/**
 * Render the report. Returns lines; the caller prints them.
 *
 * Every warning produced by analyse() must appear here. A test mutates this
 * function to drop warnings and asserts the suite fails (Human Gate §18) --
 * that is what stops advisory lint from becoming three silent accepts.
 */
export function formatReport(results, unreadableShapes) {
  const lines = [];
  const unreadable = unreadableShapes || [];
  const withWarnings = results.filter((r) => r.warnings.length > 0);
  const withHardErrors = results.filter((r) => r.hardError);

  lines.push('Evidence publication lint');
  lines.push('='.repeat(60));
  lines.push('inspected ' + results.length + ' publication-facing value(s): ' +
    PUBLICATION_FACING_FIELDS.join(', '));
  lines.push('');

  if (unreadable.length) {
    lines.push('UNREADABLE SHAPES (a publication-facing field this lint cannot check):');
    for (const u of unreadable) {
      lines.push('  ' + u.path + '  (' + u.field + ' held a ' + u.valueType + ')');
    }
    lines.push('');
  }

  if (withHardErrors.length) {
    lines.push('HARD RULE VIOLATIONS (these must not reach publication):');
    for (const r of withHardErrors) {
      lines.push('  ' + r.path);
      lines.push('    ' + r.hardError);
    }
    lines.push('');
  }

  if (withWarnings.length === 0) {
    lines.push('No advisory warnings.');
  } else {
    lines.push('ADVISORY WARNINGS (' + withWarnings.length + ' value(s)) — for human review, not blocking:');
    for (const r of withWarnings) {
      lines.push('');
      lines.push('  ' + r.path);
      lines.push('    value: ' + JSON.stringify(r.value));
      for (const w of r.warnings) {
        lines.push('    [' + w.severity + '] ' + w.rule + ': ' + w.message);
      }
    }
  }

  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('Advisory warnings do not fail this command. A human decides whether');
  lines.push('they are acceptable for publication.');
  lines.push('');
  lines.push('An empty advisory list is NOT proof that the prose is safe to publish.');
  lines.push('www / known-private-provider / opaque-long-token are open-set heuristics:');
  lines.push('confusable homoglyphs and spelled-out forms pass them undetected.');
  lines.push('Human Review is required regardless of what this command prints.');
  return lines;
}

export function runLint(options) {
  const inventory = (options && options.inventory) || collectInventory(options && options.roots);
  const results = analyse(inventory, options && options.evidenceModule);
  const unreadableShapes = inventory.unreadableShapes || [];
  const lines = formatReport(results, unreadableShapes);
  // Inspecting nothing is not a clean result. Without this, `inspected 0 /
  // No advisory warnings` exits 0 and a CI job reading only the exit code
  // cannot tell "nothing unsafe" from "nothing inspected" -- the same shape
  // browser-outcome.mjs classifies as ERROR rather than PASS, and the shape
  // this file's own header warns about.
  const inspectedNothing = results.length === 0;
  if (inspectedNothing) {
    lines.push('');
    lines.push('ERROR: 0 publication-facing values were inspected. That is not a');
    lines.push('clean result, it is a failure to measure. Check that the config');
    lines.push('directory is present and that the modules load.');
  }
  return {
    results, lines, inspectedNothing, unreadableShapes,
    hardErrorCount: results.filter((r) => r.hardError).length
  };
}

const invokedDirectly = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const { lines, hardErrorCount, inspectedNothing, unreadableShapes } = runLint();
  console.log(lines.join('\n'));
  process.exitCode =
    (hardErrorCount > 0 || inspectedNothing || unreadableShapes.length > 0) ? 1 : 0;
}
