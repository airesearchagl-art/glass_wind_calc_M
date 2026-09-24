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
import { fileURLToPath } from 'node:url';

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

export function collectInventory(roots) {
  const sources = roots || {
    MiyoshiProjectConfig: require(ROOT + 'project-config/miyoshi.js')
  };
  const found = [];
  const seen = new Set();
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path + '[' + i + ']'));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const here = path + '.' + key;
      if (typeof value === 'string' && PUBLICATION_FACING_FIELDS.includes(key)) {
        found.push({ path: here, field: key, value });
      } else if (value && typeof value === 'object') {
        walk(value, here);
      }
    }
  };
  for (const [name, root] of Object.entries(sources)) walk(root, name);
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
export function formatReport(results) {
  const lines = [];
  const withWarnings = results.filter((r) => r.warnings.length > 0);
  const withHardErrors = results.filter((r) => r.hardError);

  lines.push('Evidence publication lint');
  lines.push('='.repeat(60));
  lines.push('inspected ' + results.length + ' publication-facing value(s): ' +
    PUBLICATION_FACING_FIELDS.join(', '));
  lines.push('');

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
  const lines = formatReport(results);
  return { results, lines, hardErrorCount: results.filter((r) => r.hardError).length };
}

const invokedDirectly = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const { lines, hardErrorCount } = runLint();
  console.log(lines.join('\n'));
  process.exitCode = hardErrorCount > 0 ? 1 : 0;
}
