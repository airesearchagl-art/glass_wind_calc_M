// The differential itself, separated from the CLI so it can be tested against
// synthetic guard modules instead of only by running two git revisions.
//
// P2K-F03. The old comparison had two buckets:
//
//   base rejects, head accepts  -> regression
//   base accepts, head rejects  -> tightened
//
// and threw away the case where BOTH reject but for DIFFERENT rules. That is
// the shape a weakened rule actually takes: an input matched by two rules is
// still rejected after one of them is gutted, so the weakening is invisible on
// that input and only visible on inputs where the rule is the sole matcher.
// With attribution dropped, even the shift was unobservable.
//
// Attribution comes from the rejecting module's own error message, so both
// sides answer with their own code. The instrument supplies the inputs and the
// comparison, never the expected answer.

/** Which rule a module attributes a rejection to, or null if it accepts. */
export function attribute(guardModule, text) {
  try {
    guardModule.assertPublicSafeEvidenceText(text, 'd');
    return null;
  } catch (e) {
    return (String(e.message).split('pattern: ')[1] || 'error').replace(')', '');
  }
}

/**
 * Compare two guard modules over one corpus.
 *
 * @returns {{
 *   corpusSize:number, baseRejects:number, headRejects:number,
 *   regressions:Array, tightened:Array, reattributed:Array,
 *   baseAttribution:Object, headAttribution:Object
 * }}
 */
export function compare(base, head, corpus) {
  let baseRejects = 0;
  let headRejects = 0;
  const regressions = [];
  const tightened = [];
  const reattributed = [];
  const baseAttribution = {};
  const headAttribution = {};

  for (const text of corpus) {
    const b = attribute(base, text);
    const h = attribute(head, text);
    if (b) { baseRejects++; baseAttribution[b] = (baseAttribution[b] || 0) + 1; }
    if (h) { headRejects++; headAttribution[h] = (headAttribution[h] || 0) + 1; }
    if (b && !h) regressions.push([text, b]);
    else if (!b && h) tightened.push([text, h]);
    else if (b && h && b !== h) reattributed.push([text, b, h]);
  }
  return {
    corpusSize: corpus.length,
    baseRejects, headRejects,
    regressions, tightened, reattributed,
    baseAttribution, headAttribution
  };
}

/**
 * Which of a module's hard rules the corpus never exercises.
 *
 * P2K-F02. A differential that reports "0 regressions" while never producing an
 * input attributed to some rule has said nothing about that rule. Weakening it
 * would be invisible, and the zero would still be printed. Each rule needs at
 * least one input where it is the attributed matcher -- that input is the
 * positive control for it.
 *
 * Attribution is first-match, so a rule can also be starved by another rule
 * always matching first. Both cases surface here as the same gap, which is the
 * right outcome: either way the corpus cannot see that rule.
 */
export function ruleCoverageGaps(guardModule, attribution) {
  const names = (guardModule.HARD_REJECT_RULES || []).map((r) => r.name);
  return names.filter((name) => !attribution[name]);
}

/**
 * Which advisory rules the corpus never triggers.
 *
 * The hard-rule check above reads attribution out of the thrown error, which
 * only exists for hard rules. Advisory rules warn instead of throwing, so they
 * had no coverage check at all -- the same gap that hid `control-character`,
 * one layer over. Three advisory rules are the entire Human Review surface for
 * the Phase 2J policy change; a corpus that never triggers one of them cannot
 * report that it stopped working.
 */
export function advisoryCoverageGaps(guardModule, corpus) {
  const names = (guardModule.ADVISORY_LINT_RULES || []).map((r) => r.name);
  const seen = new Set();
  for (const text of corpus) {
    let warnings;
    try { warnings = guardModule.lintPublicEvidenceText(text, 'd').warnings; }
    catch (e) { continue; }
    for (const w of warnings) seen.add(w.rule);
    if (seen.size >= names.length) break;
  }
  return names.filter((name) => !seen.has(name));
}

/** Group [text, rule] rows by rule, for a compact report. */
export function byRule(rows, index) {
  const m = {};
  for (const row of rows) {
    const key = row[index === undefined ? 1 : index];
    m[key] = (m[key] || 0) + 1;
  }
  return m;
}

/**
 * What the differential should exit with.
 *
 * Separated from the CLI so the policy is testable. Two things fail:
 *
 *   - a regression: the base rejected an input the target accepts
 *   - a coverage gap: the target has a hard rule no corpus input reaches, so
 *     the zero printed above it is a statement about nothing (P2K-F02)
 *
 * A re-attribution does NOT fail. Both sides still reject, so no input became
 * publishable; it is reported because it is the only trace a weakened rule
 * leaves when another rule still matches, and because the Phase 2J policy
 * change would legitimately produce many of them.
 */
export function exitCodeFor(summary) {
  const regressions = (summary && summary.regressions) || 0;
  const coverageGaps = (summary && summary.coverageGaps) || 0;
  return (regressions > 0 || coverageGaps > 0) ? 1 : 0;
}

