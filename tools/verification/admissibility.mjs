// Controlled vocabulary and validator for verification evidence records.
//
// This module owns the SCHEMA ONLY. It deliberately does not:
//   - run any instrument
//   - inspect Git
//   - know the current SHA
//   - know any Phase 2J fact
//
// Keeping it ignorant is the point. A schema module that reaches for the
// current state ends up encoding the state, and then the schema and the thing
// it describes drift together — the failure family this phase exists to close
// (QD-J20 / QD-J23 / QD-J24).

export const SCHEMA_VERSION = 1;

/**
 * What KIND of evidence an instrument produces. This says nothing about
 * whether the evidence may be relied upon — see ADMISSIBILITY_STATUSES.
 *
 *   regression     The instrument pins a stated implementation contract. It
 *                  may intentionally share implementation assumptions.
 *                  Prevents known regressions. Does NOT prove independent
 *                  correctness.
 *   independent    The expected result is derived independently of the
 *                  mechanism under test: a hand-written expected set, an
 *                  external or declarative specification, real browser
 *                  semantics, an independent filesystem enumeration.
 *   observational  Measured behaviour from runtime, browser or manual
 *                  execution. Can be strong, but durability and
 *                  reproducibility vary.
 */
export const EVIDENCE_CLASSES = Object.freeze(['regression', 'independent', 'observational']);

/**
 * Whether a result may be USED as evidence. This is an evidence-quality
 * state, never a result state: PASS and FAIL do not belong here.
 *
 *   ADMISSIBLE      May be cited for its class.
 *   DIAGNOSTIC_ONLY May be run and reported, but not cited as verification.
 *   INADMISSIBLE    Must not be cited. A known defect undermines its oracle.
 *   UNVERIFIED      No measurement exists for the target in question.
 */
export const ADMISSIBILITY_STATUSES = Object.freeze([
  'ADMISSIBLE', 'DIAGNOSTIC_ONLY', 'INADMISSIBLE', 'UNVERIFIED'
]);

/** Result states, kept strictly separate from admissibility. */
export const OUTCOMES = Object.freeze(['PASS', 'FAIL', 'ERROR', 'UNVERIFIED']);

/**
 * Outcomes that are results and ONLY results.
 *
 * UNVERIFIED is deliberately shared by the two vocabularies: "no measurement
 * exists" is both a legitimate evidence-quality state and a legitimate result.
 * PASS, FAIL and ERROR are results alone, and must never appear in an
 * admissibility position. An earlier draft rejected every OUTCOMES member in
 * that position and so rejected the legitimate UNVERIFIED admissibility — the
 * validator's own test caught it.
 */
export const RESULT_ONLY_STATES = Object.freeze(['PASS', 'FAIL', 'ERROR']);

/**
 * Provenance a substantial verification record must be able to answer.
 *
 * Every field must be PRESENT. Where a field is semantically inapplicable it
 * carries null; where it is applicable but could not be determined it carries
 * the string 'unavailable'. Silent omission is rejected, because "the number
 * is there but nobody can say where it came from" is exactly the Phase 2J
 * failure this replaces.
 */
export const PROVENANCE_FIELDS = Object.freeze([
  'instrumentId',
  'instrumentVersion',
  'instrumentSourceSha',
  'targetSha',
  'baseSha',
  'oracleId',
  'oracleVersion',
  'evidenceClass',
  'admissibility',
  'inputDigest',
  'command',
  'result',
  'limitations'
]);

export const UNAVAILABLE = 'unavailable';

function fail(message) { throw new Error('verification schema: ' + message); }

/** Reject anything but the exact known version. Never interpret the future. */
export function assertSchemaVersion(value, label) {
  const where = label ? label + ': ' : '';
  if (value !== SCHEMA_VERSION) {
    fail(where + 'unsupported schemaVersion ' + JSON.stringify(value) +
      ' (this build understands only ' + SCHEMA_VERSION + ')');
  }
  return true;
}

export function isEvidenceClass(v) { return EVIDENCE_CLASSES.indexOf(v) !== -1; }
export function isAdmissibility(v) { return ADMISSIBILITY_STATUSES.indexOf(v) !== -1; }
export function isOutcome(v) { return OUTCOMES.indexOf(v) !== -1; }

/**
 * Validate a verification evidence record.
 *
 * Enforced deliberately:
 *   - evidenceClass and admissibility are two separate fields. Collapsing them
 *     loses the ability to say "this is regression evidence AND it is
 *     currently inadmissible", which is the exact state guard-diff is in.
 *   - no PASS/FAIL in admissibility.
 *   - every provenance field present.
 */
export function assertVerificationEvidenceRecord(record, label) {
  const where = label ? label + ': ' : 'evidence record: ';
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    fail(where + 'must be a plain object');
  }
  assertSchemaVersion(record.schemaVersion, (label || 'evidence record') + '.schemaVersion');

  for (const field of PROVENANCE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      fail(where + 'missing provenance field ' + JSON.stringify(field) +
        ' (use null if inapplicable, or ' + JSON.stringify(UNAVAILABLE) +
        ' if applicable but undetermined)');
    }
  }
  if (!isEvidenceClass(record.evidenceClass)) {
    fail(where + 'evidenceClass must be one of ' + EVIDENCE_CLASSES.join(' / ') +
      ', got ' + JSON.stringify(record.evidenceClass));
  }
  if (!isAdmissibility(record.admissibility)) {
    fail(where + 'admissibility must be one of ' + ADMISSIBILITY_STATUSES.join(' / ') +
      ', got ' + JSON.stringify(record.admissibility));
  }
  if (RESULT_ONLY_STATES.indexOf(record.admissibility) !== -1) {
    fail(where + 'admissibility carries a result state (' +
      JSON.stringify(record.admissibility) + '); results belong in outcome');
  }
  if (record.admissibility !== 'ADMISSIBLE' &&
      (typeof record.limitations !== 'string' || !record.limitations.trim())) {
    fail(where + 'admissibility ' + record.admissibility +
      ' requires a non-empty limitations string saying why');
  }
  return true;
}

/**
 * A static result envelope. No runner is built here — this only fixes the
 * shape so a later wave cannot invent a different one.
 *
 * Timestamps default to null: a static fixture that carries wall-clock time is
 * not byte-deterministic, and determinism is worth more here than precision.
 */
export function makeResultEnvelope(fields) {
  const f = fields || {};
  if (!isOutcome(f.outcome)) {
    fail('result envelope: outcome must be one of ' + OUTCOMES.join(' / ') +
      ', got ' + JSON.stringify(f.outcome));
  }
  if (!isEvidenceClass(f.evidenceClass)) {
    fail('result envelope: evidenceClass invalid: ' + JSON.stringify(f.evidenceClass));
  }
  if (!isAdmissibility(f.admissibility)) {
    fail('result envelope: admissibility invalid: ' + JSON.stringify(f.admissibility));
  }
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    instrumentId: f.instrumentId === undefined ? null : f.instrumentId,
    targetSha: f.targetSha === undefined ? null : f.targetSha,
    evidenceClass: f.evidenceClass,
    admissibility: f.admissibility,
    startedAt: f.startedAt === undefined ? null : f.startedAt,
    completedAt: f.completedAt === undefined ? null : f.completedAt,
    outcome: f.outcome,
    measurements: f.measurements === undefined ? null : f.measurements,
    limitations: f.limitations === undefined ? null : f.limitations
  });
}
