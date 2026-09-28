// Verification manifest: what a verifier should run, what each instrument
// proves, and whether its result may be cited as evidence.
//
// Source of truth is split on purpose:
//   verification-spec.json   declarative, committed, reviewable
//   this file                resolves dynamic provenance at run time
//
// One giant hand-written JSON embedded in a generator is unreviewable and goes
// stale silently, which is the shape of defect this phase is about.
//
//   node tools/verification/manifest.mjs     JSON -> stdout
//
// Diagnostics to stderr. Exit 0 on success, non-zero on failure.
//
// SPEC vs MEASURED. Every dynamic value sits under `measured`, and every value
// copied from the committed spec sits under `spec`. A reader can therefore tell
// which parts describe intent and which parts describe this tree. A field that
// could not be determined carries the string 'unavailable' — never a silent
// omission and never a guess.

import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  SCHEMA_VERSION, assertSchemaVersion, UNAVAILABLE,
  isEvidenceClass, isAdmissibility
} from './admissibility.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SPEC_PATH = join(ROOT, 'tools/verification/verification-spec.json');

function fail(message) { throw new Error('verification manifest: ' + message); }

/**
 * Content identity of an instrument's source.
 *
 * ALGORITHM (documented because §21 forbids using mtime as identity, and
 * because a digest whose algorithm is unwritten is not reproducible):
 *
 *   1. Expand each given path: a file contributes itself; a directory
 *      contributes every regular file beneath it, recursively.
 *   2. Make each path repo-relative and POSIX-separated.
 *   3. Sort the paths as byte strings.
 *   4. For each: h = sha256(file bytes), emit "<relpath>\0<hex h>\n".
 *   5. Digest identity = sha256 of that concatenation, hex.
 *
 * Recursion here is deliberate and is NOT the QD-J23 shape: this walk is an
 * identity function over a stated path list, not a discovery mechanism that
 * decides what exists.
 */
export function instrumentDigest(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  const files = [];
  const expand = (p) => {
    const abs = join(ROOT, p);
    let st;
    try { st = statSync(abs); }
    catch (e) { fail('instrument path does not exist: ' + p); }
    if (st.isDirectory()) {
      for (const entry of readdirSync(abs).sort()) expand(join(p, entry));
    } else if (st.isFile()) {
      files.push(p);
    }
  };
  for (const p of paths) expand(p);
  const lines = files
    .map((p) => relative(ROOT, join(ROOT, p)).split('\\').join('/'))
    .sort()
    .map((rel) => rel + '\0' + createHash('sha256')
      .update(readFileSync(join(ROOT, rel))).digest('hex') + '\n');
  return 'sha256:' + createHash('sha256').update(lines.join('')).digest('hex');
}

/** Resolve a git value, or return 'unavailable' rather than inventing one. */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim() || UNAVAILABLE;
  } catch (e) { return UNAVAILABLE; }
}

export function loadSpec() {
  let raw;
  try { raw = readFileSync(SPEC_PATH, 'utf8'); }
  catch (e) { fail('cannot read verification-spec.json: ' + e.message); }
  let spec;
  try { spec = JSON.parse(raw); }
  catch (e) { fail('verification-spec.json is not valid JSON: ' + e.message); }
  assertSchemaVersion(spec.schemaVersion, 'verification-spec.schemaVersion');
  if (!Array.isArray(spec.instruments) || spec.instruments.length === 0) {
    fail('verification-spec.json has no instruments');
  }
  for (const i of spec.instruments) {
    if (!i.id) fail('an instrument has no id');
    if (!isEvidenceClass(i.evidenceClass)) {
      fail(i.id + ': evidenceClass invalid: ' + JSON.stringify(i.evidenceClass));
    }
    if (!isAdmissibility(i.admissibility)) {
      fail(i.id + ': admissibility invalid: ' + JSON.stringify(i.admissibility));
    }
    if (i.admissibility !== 'ADMISSIBLE' && !i.reason) {
      fail(i.id + ': admissibility ' + i.admissibility + ' requires a reason');
    }
    if (!Object.prototype.hasOwnProperty.call(i, 'sharedDependencies')) {
      fail(i.id + ': sharedDependencies must be present (use [] for none, never omit)');
    }
  }
  const ids = spec.instruments.map((i) => i.id);
  if (new Set(ids).size !== ids.length) fail('duplicate instrument id');
  return spec;
}

export function buildManifest() {
  const spec = loadSpec();
  const packetPath = '.agent-run/LR-20260927-GLASS-P2K/TASK_PACKET_SNAPSHOT.md';
  let packetDigest = UNAVAILABLE;
  try {
    packetDigest = 'sha256:' + createHash('sha256')
      .update(readFileSync(join(ROOT, packetPath))).digest('hex');
  } catch (e) { packetDigest = UNAVAILABLE; }

  const instruments = spec.instruments
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((i) => ({
      id: i.id,
      command: i.command === undefined ? null : i.command,
      evidenceClass: i.evidenceClass,
      admissibility: i.admissibility,
      reason: i.reason === undefined ? null : i.reason,
      finding: i.finding === undefined ? null : i.finding,
      target: i.target === undefined ? null : i.target,
      oracle: i.oracle === undefined ? null : i.oracle,
      sharedDependencies: i.sharedDependencies || [],
      positiveControl: i.positiveControl === undefined ? null : i.positiveControl,
      negativeControl: i.negativeControl === undefined ? null : i.negativeControl,
      proves: i.proves === undefined ? null : i.proves,
      doesNotProve: i.doesNotProve === undefined ? null : i.doesNotProve,
      // measured provenance
      instrumentSourceSha: i.instrumentFiles ? instrumentDigest(i.instrumentFiles) : null,
      // P2K-F07: the slot exists even where no instrument can yet fill it.
      // A digest does not make an oracle independent; guard-diff stays
      // INADMISSIBLE with or without one.
      inputDigest: null
    }));

  return {
    schemaVersion: SCHEMA_VERSION,
    spec: {
      repository: spec.repository,
      runId: spec.runId,
      instruments: instruments,
      protectedInvariants: (spec.protectedInvariants || [])
        .slice().sort((a, b) => (a.id < b.id ? -1 : 1)),
      browserAssertions: (spec.browserAssertions || [])
        .slice().sort((a, b) => (a.id < b.id ? -1 : 1)),
      privacyAssertions: (spec.privacyAssertions || [])
        .slice().sort((a, b) => (a.id < b.id ? -1 : 1)),
      knownNonGoals: (spec.knownNonGoals || []).slice().sort(),
      knownLimitations: (spec.knownLimitations || [])
        .slice().sort((a, b) => (a.id < b.id ? -1 : 1))
    },
    measured: {
      targetRef: git(['rev-parse', 'HEAD']),
      baseRef: git(['rev-parse', 'origin/main']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      taskPacketDigest: packetDigest,
      specDigest: instrumentDigest(['tools/verification/verification-spec.json']),
      // Deliberately absent: any expected verdict. A manifest that tells the
      // verifier what to conclude is not a manifest (§9).
      note: 'spec fields describe intent; measured fields describe this tree'
    }
  };
}

export function serializeManifest(m) { return JSON.stringify(m, null, 2) + '\n'; }

const invokedDirectly = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  try {
    process.stdout.write(serializeManifest(buildManifest()));
  } catch (e) {
    process.stderr.write('manifest failed: ' + e.message + '\n');
    process.exitCode = 1;
  }
}
