// One committed, stable, machine-readable way to read the project's actual
// verification-relevant state.
//
// WHY THIS EXISTS (P2K-F04). Across Phase 2F..2J every session that wanted to
// report the project state wrote a throwaway `node -e` probe, and this session
// mis-guessed the closure result's field names three separate times:
// `closureStatus`, `factSlots` and `slots` do not exist. The real fields are
// `status`, `requiredSlotCount`, `readySlotCount` and so on, and the
// 0/12 · 0/4 · 0/8 figures every Run Artifact quotes were directly available
// the whole time. Nothing in the repository said so.
//
// A verifier should read `project.readySlotCount` from this probe, not reach
// into Closure's internal result and guess. This probe may adapt internally if
// the runtime APIs evolve; its OUTPUT schema is versioned and must not.
//
// This is verification tooling, NOT a Production API. Nothing here may be
// imported as project Evidence, a Promotion Candidate, a registered preset, or
// a verifiedCases entry.
//
//   node tools/verification/project-state-probe.mjs      JSON -> stdout
//
// Diagnostics go to stderr. Exit 0 on success, non-zero on schema or runtime
// failure. Output is byte-deterministic for a given tree.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, assertSchemaVersion } from './admissibility.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Fixture inputs for the protected wind calculation.
 *
 * These are the AC-14 known-answer inputs, NOT project state: the mean height
 * H' = 14.2 m and the recurrence factor y = 1.00 are fixture values. The
 * roughness parameters and V0 are read from the project config, so a change to
 * either shows up in the protected numbers instead of hiding.
 */
const WIND_FIXTURE = Object.freeze({ meanHeightM: 14.2, recurrenceFactor: 1.00 });

/** Pane sizes whose FL6 allowable pressure is a protected value. */
const PROTECTED_PANES = Object.freeze([
  { key: 'fl6_1250x2050', widthMm: 1250, heightMm: 2050 },
  { key: 'fl6_1500x2050', widthMm: 1500, heightMm: 2050 }
]);

/** Manual-mode fixture whose designP is a protected value. */
const MANUAL_FIXTURE = Object.freeze({
  W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000
});

function fail(message) { throw new Error('project-state-probe: ' + message); }

export function readProjectState() {
  const Closure = require(ROOT + 'project-config/evidence-closure.js');
  const Miyoshi = require(ROOT + 'project-config/miyoshi.js');
  const Manual = require(ROOT + 'project-config/manual.js');
  const Glass = require(ROOT + 'calc.js');
  const Wind = require(ROOT + 'wind-pressure.js');

  const closure = Closure.evaluateClosure('miyoshi', []);

  // The field names below are the ONLY place this mapping should live.
  for (const field of ['status', 'requiredSlotCount', 'readySlotCount',
                       'categoryCount', 'readyCategoryCount',
                       'caseScopeCount', 'readyCaseScopeCount',
                       'promotionCandidate']) {
    if (!Object.prototype.hasOwnProperty.call(closure, field)) {
      fail('closure result has no field ' + JSON.stringify(field) +
        ' — the runtime shape changed; update this probe, not the callers');
    }
  }

  const dimW = Miyoshi.dimensions.defaultW;
  const dimH = Miyoshi.dimensions.defaultH;
  // A single verificationStatus field would hide a disagreement between the two
  // dimensions, so refuse to collapse one that exists.
  if (dimW.verificationStatus !== dimH.verificationStatus) {
    fail('defaultW and defaultH disagree on verificationStatus (' +
      dimW.verificationStatus + ' vs ' + dimH.verificationStatus +
      '); the single-field shape would hide that');
  }

  const roughness = Miyoshi.wind.roughnessCategory.value;
  const v0 = Miyoshi.wind.V0.value;
  const rp = Wind.ROUGHNESS_PARAMETERS[roughness];
  if (!rp) fail('no roughness parameters for category ' + JSON.stringify(roughness));

  const er = Wind.calcEr(WIND_FIXTURE.meanHeightM, rp.Zb, rp.ZG, rp.alpha);
  const qBar = Wind.calcMeanVelocityPressure(er.Er, v0, WIND_FIXTURE.recurrenceFactor);

  // Derived through the real calculation APIs. No formula is reimplemented
  // here; duplicating an equation into the probe would make the probe agree
  // with itself rather than with the product.
  const paneP = {};
  for (const pane of PROTECTED_PANES) {
    paneP[pane.key] = Glass.calcP_single(
      6, Glass.getK1_FL(6), 1.0, (pane.widthMm * pane.heightMm) / 1_000_000, 1.0);
  }
  const manualDesignPressure =
    Manual.buildManualDesignInput(Object.assign({}, MANUAL_FIXTURE)).designP;

  const state = {
    schemaVersion: SCHEMA_VERSION,
    project: {
      projectId: closure.projectId,
      closureStatus: closure.status,
      observations: 0,
      readySlotCount: closure.readySlotCount,
      requiredSlotCount: closure.requiredSlotCount,
      readyCategoryCount: closure.readyCategoryCount,
      categoryCount: closure.categoryCount,
      readyCaseScopeCount: closure.readyCaseScopeCount,
      caseScopeCount: closure.caseScopeCount,
      hasPromotionCandidate: closure.promotionCandidate !== null,
      verifiedCaseCount: Miyoshi.verifiedCases.length
    },
    preset: {
      dimensions: {
        widthMm: dimW.value,
        heightMm: dimH.value,
        mode: Miyoshi.dimensions.mode,
        verificationStatus: dimW.verificationStatus
      },
      wind: {
        V0: v0,
        roughnessCategory: roughness
      }
    },
    protectedCalculations: {
      fl6_1250x2050: paneP.fl6_1250x2050,
      fl6_1500x2050: paneP.fl6_1500x2050,
      manualDesignPressure: manualDesignPressure,
      er: er.Er,
      qBar: qBar
    }
  };
  assertProjectStateShape(state);
  return state;
}

/**
 * Field names this probe promises. A verifier may rely on these; renaming one
 * is a breaking change to the probe's contract, not an internal detail.
 */
export const PROJECT_FIELDS = Object.freeze([
  'projectId', 'closureStatus', 'observations',
  'readySlotCount', 'requiredSlotCount',
  'readyCategoryCount', 'categoryCount',
  'readyCaseScopeCount', 'caseScopeCount',
  'hasPromotionCandidate', 'verifiedCaseCount'
]);
export const PROTECTED_CALCULATION_FIELDS = Object.freeze([
  'fl6_1250x2050', 'fl6_1500x2050', 'manualDesignPressure', 'er', 'qBar'
]);

/**
 * Field names that must NEVER appear anywhere in the output (§17). The probe
 * emits verification-relevant safe values only: no Evidence prose, no private
 * identifier, no candidate payload, no raw ledger, no full config dump.
 */
export const FORBIDDEN_OUTPUT_KEYS = Object.freeze([
  'publicDescription', 'publicEvidenceDescription', 'privateReferenceAvailable',
  'sourceReference', 'evidence', 'promotionCandidate', 'candidate',
  'verifiedCases', 'ledger', 'entries', 'caseId', 'projectName', 'identity'
]);

export function assertProjectStateShape(state) {
  assertSchemaVersion(state && state.schemaVersion, 'project-state.schemaVersion');
  for (const f of PROJECT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(state.project, f)) {
      fail('project.' + f + ' is missing');
    }
  }
  for (const f of PROTECTED_CALCULATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(state.protectedCalculations, f)) {
      fail('protectedCalculations.' + f + ' is missing');
    }
    if (typeof state.protectedCalculations[f] !== 'number' ||
        !Number.isFinite(state.protectedCalculations[f])) {
      fail('protectedCalculations.' + f + ' must be a finite number');
    }
  }
  const seen = new Set();
  (function walk(node, path) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const [k, v] of Object.entries(node)) {
      if (FORBIDDEN_OUTPUT_KEYS.indexOf(k) !== -1) {
        fail('output contains forbidden key ' + JSON.stringify(path + '.' + k));
      }
      if (v && typeof v === 'object') walk(v, path + '.' + k);
    }
  }(state, 'project-state'));
  return true;
}

/** Deterministic serialisation: insertion order is fixed above. */
export function serializeProjectState(state) {
  return JSON.stringify(state, null, 2) + '\n';
}

const invokedDirectly = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  try {
    process.stdout.write(serializeProjectState(readProjectState()));
  } catch (e) {
    process.stderr.write('project-state-probe failed: ' + e.message + '\n');
    process.exitCode = 1;
  }
}
