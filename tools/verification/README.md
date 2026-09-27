# tools/verification

Verification infrastructure. **Not** project runtime logic — nothing here may be
imported as project Evidence, a Promotion Candidate, a registered preset, or a
`verifiedCases` entry. These tools produce *evidence about the software*, which
is a different thing from the project's own Evidence.

## Why this directory exists

Phase 2J ran eighteen independent reviews and the recurring finding was not in
the guard rules — it was in the instruments. Corpora went blind along whichever
axis the previous review had just taught them. A differential certified a real
regression as clean. A probe reported a gutted warning message as "equivalent"
because it only recorded rule names. Every session that wanted to report the
project state wrote a throwaway probe, and some got the field names wrong.

The common shape: **the implementation and the instrument measuring it shared an
assumption, so nothing could see along that axis.** These files exist to make
the sharing visible and the evidence citable.

## If you are a fresh verifier, start here

    node tools/verification/verifier-package.mjs

That prints everything you need: the target and base SHA, the changed files, the
commands to run, what each result does and does not prove, the protected
invariants, the browser assertions still requiring measurement, and the declared
expected project state. It deliberately contains **no expected verdict** — you
are meant to be able to disagree.

Then:

    node tools/verification/project-state-probe.mjs

and compare its output against the package's `evidenceStateExpected`. That
expectation is hand-written in `verification-spec.json`, not read from the tree,
so the comparison is not the tree agreeing with itself.

## Files

| file | what it owns |
|---|---|
| `admissibility.mjs` | the controlled vocabulary and record validator. Knows nothing about git, SHAs, tests, or any Phase 2J fact — deliberately. |
| `verification-spec.json` | the declarative, committed spec: instruments, invariants, assertions, limitations. Reviewable in a diff. |
| `manifest.mjs` | resolves dynamic provenance (SHAs, digests) and merges it with the spec, keeping `spec` and `measured` apart. |
| `project-state-probe.mjs` | the one stable way to read project state and protected calculations. |
| `verifier-package.mjs` | the handoff package for an independent verifier. |

## Evidence class vs admissibility

Two separate axes. Collapsing them loses the ability to say the true thing about
`guard-diff`: it *is* regression evidence, and it is *currently not citable*.

**Class** — what kind of evidence this is:

- `regression` — pins a stated implementation contract. May intentionally share
  implementation assumptions. Prevents known regressions; does not prove
  independent correctness.
- `independent` — the expected result comes from somewhere other than the
  mechanism under test: a hand-written expected set, a declarative spec, real
  browser semantics, an independent enumeration.
- `observational` — measured from runtime, browser or manual execution. Can be
  strong; durability varies.

**Admissibility** — whether a result may be cited:

- `ADMISSIBLE` — may be cited for its class.
- `DIAGNOSTIC_ONLY` — may be run and reported, not cited as verification.
- `INADMISSIBLE` — must not be cited; a known defect undermines its oracle.
- `UNVERIFIED` — no measurement exists for the target in question.

`PASS` and `FAIL` are **results**, never admissibility values. `UNVERIFIED` is
deliberately in both vocabularies: "nothing was measured" is both a legitimate
result and a legitimate evidence-quality state.

## Currently quarantined

`guard-diff` is **INADMISSIBLE** (finding P2K-F01). Its corpus derives `DOTS`
from production `DOT_EQUIVALENTS` and its extension axis from
`PRIVATE_DOCUMENT_EXTENSION_SOURCE`, and `diff-heads` builds that corpus from
the working tree under test. Shrinking either constant shrinks the corpus with
it, so both sides are compared against the same reduced input set.

Measured twice, each time with a live consequence:

| mutation | guard behaviour | `npm test` | `diff-heads` |
|---|---|---|---|
| drop one dot from `DOT_EQUIVALENTS` | `構造計算書·pdf` reject → **accept** | 658/1, caught | corpus 607,956, **REGRESSIONS 0** |
| drop `rar\|7z\|lzh\|tar\|gz` | `図面一式.rar` reject → **accept** | 656/3, caught | corpus 578,004, **REGRESSIONS 0** |

It may still be run diagnostically. Any report must label it *diagnostic only /
inadmissible*, never "verification PASS". Wave 3 owns the repair and
requalification.

## Rules these tools enforce on us

- **A number is not evidence unless it can be regenerated.** Don't put a figure
  in the README or a Run Artifact without a committed generator, a recorded
  command, and the ability to reproduce it.
- **A count is not a completeness proof.** "12 values, therefore complete" is
  not an argument. Compare an expected set or identity.
- **Source inspection is not browser verification.** Never write "browser
  VERIFIED" without an exact-head browser measurement. `UNVERIFIED` is a fine
  thing to report.
- **Don't derive an expected value from the thing under test.** Calling the
  production helper on both sides of an assertion proves only that the helper
  equals itself. Calling a public API as the *subject* is fine.
- **Don't infer a false-positive rate from repository prose.** Define the
  population first. The guard is enforced at construction, so committed text is
  survivor-biased by definition.

## Determinism

Same tree, byte-identical output, for all three CLIs. Paths, instrument ids and
assertions are sorted where order has no meaning. Timestamps are omitted from
static structures rather than filled with wall-clock time.

JSON goes to stdout; diagnostics and errors go to stderr; exit is 0 on success
and non-zero on schema or runtime failure — so another tool can consume the
output without parsing prose.
