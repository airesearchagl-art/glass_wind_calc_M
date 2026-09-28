// Independent-verifier handoff package (P2K-F05).
//
// Phase 2J ran eighteen independent reviews and every scope was delivered in
// conversation. Nothing was committed, so the next verifier could not
// reconstruct what to check without the chat history. This generator produces
// that handoff from committed files alone.
//
//   node tools/verification/verifier-package.mjs      JSON -> stdout
//
// WHAT THIS PACKAGE MUST NOT DO. It says what matters; it never says what to
// conclude. There is deliberately no expectedVerdict, no recommendedVerdict,
// no `verified: true`, no `allChecksPassed`. A verifier must be able to run
// these commands and disagree with the implementer — including concluding that
// a protected invariant is violated. A handoff that certifies its own target is
// not a handoff.
//
// The expected project state below is the HAND-WRITTEN expectation from
// verification-spec.json, not a reading of the current tree. That is the point:
// the verifier compares the probe's output against a declared expectation, so
// the comparison is not the tree agreeing with itself.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SCHEMA_VERSION, UNAVAILABLE } from './admissibility.mjs';
import { loadSpec, instrumentDigest } from './manifest.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Field names that must never appear in a handoff package (§23, §28). */
export const FORBIDDEN_PACKAGE_KEYS = Object.freeze([
  'expectedVerdict', 'recommendedVerdict', 'verdict',
  'verified', 'reviewPassed', 'allChecksPassed', 'pass', 'result'
]);

function fail(message) { throw new Error('verifier-package: ' + message); }

/**
 * The content-tree SHA of a revision, or null when it cannot be resolved.
 *
 * Content identity, not ancestry. A squash merge produces a different commit
 * history carrying the same tree, so commit SHAs and parentage say nothing
 * useful about whether the verifier is being handed different content. The
 * tree is what it is being handed.
 */
export function resolveTreeSha(rev) {
  try {
    const out = execFileSync('git', ['rev-parse', '--verify', '--quiet', rev + '^{tree}'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    return /^[0-9a-f]{40}$/.test(out) ? out : null;
  } catch (e) { return null; }
}

/**
 * Decide whether an empty changed-file list may be reported. Pure, so the
 * decision is testable without constructing a git history for every case.
 *
 * Three states, kept mechanically distinct (§24):
 *
 *   files > 0                           the changed files
 *   files = 0 and target tree = base    [] is the truth: the target's content
 *                                       IS the selected base's content
 *   files = 0 and trees differ/unknown  hard error. An empty list here would
 *                                       report a real content delta, or a
 *                                       comparison that did not happen, as
 *                                       "nothing changed"
 *
 * The original guard rejected every empty list, on the premise that the branch
 * under verification is known to carry changes. That premise holds on a live
 * feature branch and is false on a merged main, where the target IS the base
 * and [] is the correct answer — which is how a green branch turned main red
 * the moment it merged. The safety property the guard existed for is kept: a
 * failed lookup still never reaches a verifier disguised as an empty list.
 */
export function validateChangedFiles(comparison) {
  const c = comparison || {};
  const files = c.files;
  const against = c.baseRef === undefined || c.baseRef === null
    ? '(unspecified base)' : String(c.baseRef);
  if (!Array.isArray(files)) {
    fail('changed-file list is not an array against ' + against +
      '; refusing to guess what was compared');
  }
  if (files.length > 0) return files;
  if (!c.targetTreeSha || !c.baseTreeSha) {
    fail('changed-file list is empty against ' + against + ' and the content ' +
      'trees could not be resolved, so a legitimate zero delta cannot be ' +
      'told apart from a comparison that failed');
  }
  if (c.targetTreeSha !== c.baseTreeSha) {
    fail('changed-file list is empty against ' + against + ' but the content ' +
      'trees differ (target ' + c.targetTreeSha + ', base ' + c.baseTreeSha +
      '); an empty list would report a real content delta as no change');
  }
  return [];
}

/**
 * Changed files versus the base. Resolved from git; a failure to resolve is
 * reported, never returned as an empty list (§24) — "nothing changed" and
 * "git could not be read" must not look identical to a verifier. An empty list
 * survives only when the two content trees are identical.
 */
export function resolveChangedFiles(baseRef) {
  let out;
  try {
    out = execFileSync('git', ['diff', '--name-only', baseRef + '...HEAD'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    fail('cannot resolve changed files against ' + baseRef + ': ' + e.message);
  }
  const files = out.split('\n').map((s) => s.trim()).filter(Boolean).sort();
  if (files.length === 0) {
    return validateChangedFiles({
      files: files,
      baseRef: baseRef,
      targetTreeSha: resolveTreeSha('HEAD'),
      baseTreeSha: resolveTreeSha(baseRef)
    });
  }
  return files;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim() || UNAVAILABLE;
  } catch (e) { return UNAVAILABLE; }
}

export function buildVerifierPackage(options) {
  const opts = options || {};
  const spec = loadSpec();
  const baseRef = opts.baseRef || 'origin/main';

  const targetSha = git(['rev-parse', 'HEAD']);
  const baseSha = git(['rev-parse', baseRef]);
  const targetTreeSha = resolveTreeSha('HEAD');
  const baseTreeSha = resolveTreeSha(baseRef);
  if (targetSha === UNAVAILABLE || baseSha === UNAVAILABLE) {
    fail('cannot resolve target or base SHA; refusing to emit a package that ' +
      'cannot say which tree it describes');
  }

  let taskPacketDigest = UNAVAILABLE;
  try {
    taskPacketDigest = 'sha256:' + createHash('sha256').update(readFileSync(
      join(ROOT, '.agent-run/LR-20260927-GLASS-P2K/TASK_PACKET_SNAPSHOT.md'))).digest('hex');
  } catch (e) { taskPacketDigest = UNAVAILABLE; }

  // Commands a verifier should run, with the admissibility of each result
  // stated up front so nobody has to infer it (§27).
  const verificationCommands = spec.instruments
    .filter((i) => i.command)
    .map((i) => ({
      instrumentId: i.id,
      command: i.command,
      evidenceClass: i.evidenceClass,
      admissibility: i.admissibility,
      admissibilityReason: i.reason === undefined ? null : i.reason,
      instrumentSourceSha: i.instrumentFiles ? instrumentDigest(i.instrumentFiles) : null,
      proves: i.proves === undefined ? null : i.proves,
      doesNotProve: i.doesNotProve === undefined ? null : i.doesNotProve
    }))
    .sort((a, b) => (a.instrumentId < b.instrumentId ? -1 : 1));

  // Emitted, not discarded. Computing a value and rendering it nowhere is the
  // blockerKinds shape the publication lint exists to prevent (QD-J17), and it
  // had been reproduced here inside the verification tooling itself.
  const browserInstruments = spec.instruments
    .filter((i) => i.evidenceClass === 'observational' || i.id === 'parser-boundary')
    .filter((i) => (i.instrumentFiles || []).some((f) => f.indexOf('browser-checks') !== -1));

  const pkg = {
    schemaVersion: SCHEMA_VERSION,
    repository: spec.repository,
    runId: spec.runId,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    targetSha: targetSha,
    baseSha: baseSha,
    targetTreeSha: targetTreeSha === null ? UNAVAILABLE : targetTreeSha,
    baseTreeSha: baseTreeSha === null ? UNAVAILABLE : baseTreeSha,
    taskPacketDigest: taskPacketDigest,

    changedFiles: resolveChangedFiles(baseRef),
    // Emitted so that `changedFiles: []` is auditable rather than ambiguous.
    // Reading an empty list alone, a verifier cannot tell "identical content"
    // from "the comparison broke" — the same shape of unanswerable question
    // this package exists to remove.
    changedFilesNote:
      'An empty changedFiles list means the target content equals the base ' +
      'content (targetTreeSha === baseTreeSha), which is the ordinary state ' +
      'once this work has been merged. It never means the comparison failed: ' +
      'an unresolvable base, or an empty list whose content trees differ, is ' +
      'a hard error and no package is emitted at all.',

    verificationCommands: verificationCommands,

    // §27: which existing evidence may be cited, restated as a flat summary so
    // a verifier does not have to reconstruct it from the instrument list.
    admissibilitySummary: spec.instruments
      .map((i) => ({ instrumentId: i.id, evidenceClass: i.evidenceClass,
                     admissibility: i.admissibility,
                     reason: i.reason === undefined ? null : i.reason }))
      .sort((a, b) => (a.instrumentId < b.instrumentId ? -1 : 1)),

    protectedInvariants: (spec.protectedInvariants || [])
      .slice().sort((a, b) => (a.id < b.id ? -1 : 1)),

    // §26: state what to measure and that measurement is still required. Do not
    // imply these were executed for this target.
    browserAssertions: (spec.browserAssertions || [])
      .slice().sort((a, b) => (a.id < b.id ? -1 : 1)),
    browserInstruments: browserInstruments.map((i) => i.id).sort(),
    browserExecutionRequired: true,
    browserEvidenceForTarget: 'UNVERIFIED',
    browserEvidenceNote:
      'No browser measurement exists for this target SHA. Source inspection is ' +
      'not browser verification. UNVERIFIED is the correct state to report if ' +
      'the harnesses are not executed; do not write "browser VERIFIED" without ' +
      'an exact-head measurement.',

    privacyAssertions: (spec.privacyAssertions || [])
      .slice().sort((a, b) => (a.id < b.id ? -1 : 1)),

    evidenceStateExpected: spec.evidenceStateExpected,

    knownLimitations: (spec.knownLimitations || [])
      .slice().sort((a, b) => (a.id < b.id ? -1 : 1)),
    nonGoals: (spec.knownNonGoals || []).slice().sort(),

    verifierNote:
      'This package states what matters and what each result does and does not ' +
      'prove. It deliberately contains no expected or recommended verdict. ' +
      'Disagreeing with the implementer — including finding a protected ' +
      'invariant violated — is a valid outcome.'
  };
  assertNoSelfCertification(pkg);
  return pkg;
}

/** Reject any field that would tell the verifier what to conclude (§28). */
export function assertNoSelfCertification(pkg) {
  const seen = new Set();
  (function walk(node, path) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, path + '[' + i + ']')); return; }
    for (const [k, v] of Object.entries(node)) {
      if (FORBIDDEN_PACKAGE_KEYS.indexOf(k) !== -1) {
        fail('package contains self-certifying field ' + JSON.stringify(path + '.' + k));
      }
      if (v && typeof v === 'object') walk(v, path + '.' + k);
    }
  }(pkg, 'package'));
  return true;
}

export function serializeVerifierPackage(p) { return JSON.stringify(p, null, 2) + '\n'; }

const invokedDirectly = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  try {
    process.stdout.write(serializeVerifierPackage(buildVerifierPackage()));
  } catch (e) {
    process.stderr.write('verifier-package failed: ' + e.message + '\n');
    process.exitCode = 1;
  }
}
