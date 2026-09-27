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
| `../guard-diff/corpus.mjs` | the differential's own committed threat list. Imports nothing from `project-config`, and reports its drift from production rather than following it. |
| `../guard-diff/differential.mjs` | the comparison: three buckets, hard- and advisory-rule coverage, and the exit policy. |
| `../guard-diff/suite-verdict.mjs` | how the mutation harness reads a suite run, including the environment it refuses to inherit. |
| `experiments/lint-discovery-depth.mjs` | measures how deep publication-lint discovery reaches, by planting a synthetic config module one directory down and restoring the tree. Closes QD-J23 with numbers rather than prose. |

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

## Recently closed

**P2K-F01 — the differential's corpus was derived from the thing it measured.**
`corpus.mjs` read `DOT_EQUIVALENTS` out of the guard, and `diff-heads` passed it
the extension source from the head under test. Shrinking either constant shrank
the corpus meant to police it, so the shrink could not be seen. Wave 0 measured
that twice; Wave 3 repaired it and Wave 6 corrected the re-measurement to use
Wave 0's mutations exactly:

| change to the guard | derived corpus (historical) | independent corpus |
|---|---|---|
| drop one dot equivalent (U+0387) | REGRESSIONS 0 | REGRESSIONS 26,496, exit 1 |
| drop five extension atoms (`rar\|7z\|lzh\|tar\|gz`) | REGRESSIONS 0 | REGRESSIONS 40,000, exit 1 |

Regenerate the right-hand column, which also cross-checks itself against a
committed expectations file and fails on any difference:

```
node tools/verification/experiments/corpus-independence.mjs
```

The left-hand column is **historical and not regenerable**: the derived corpus no
longer exists, so `REGRESSIONS 0` cannot be reproduced at this head. Check out
`tools/guard-diff` and `project-config/evidence.js` at the phase base revision to
see it.

Wave 3 first published **32,000** for the second row. That figure came from
dropping *four* atoms while Wave 0 had dropped *five*, and the two were described
as the same experiment. An independent verifier measured the five-atom mutation
and got 40,000. Both rows now reproduce Wave 0's `npm test` failure counts (1 and
3), which is the corroboration that they are the same mutations.

The corpus now owns its threat list and imports nothing from `project-config`,
which `P2K-D01` enforces by reading the file rather than by checking a value —
the defect was a dependency direction, and a value assertion cannot see one.

**P2K-F02 — a rule the corpus never reached still got a zero.** The new coverage
check found one the day it was added: `control-character`, one of nine hard
rules, had no corpus input attributed to it, so every `REGRESSIONS: 0` printed
before Wave 3 was silent about it. Hard and advisory rules are both checked now,
and a gap exits non-zero: a zero for an unmeasured rule is the defect, not the
zero.

**P2K-F03 — a rejection that changed rules was discarded.** The comparison had
two buckets and dropped the case where both sides reject for different reasons,
which is the only trace a weakened rule leaves when another rule still matches.

**P2K-F06 — the browser check imported Playwright from one machine.** Wave 4
converted `browser-w4.mjs` to a discovered location and recorded the finding as
closed. It was not: an independent verifier applied the repair's own structural
test to the whole directory and found the other four harnesses still on the
absolute path, so for four of five instruments "never ran" still exited 1 and was
indistinguishable from "ran and failed". Wave 6 moved the resolve-and-classify
logic into `harness.mjs`, converted all five, and demonstrated the UNVERIFIED
exit for each. The structural test's population is now derived from the directory
rather than listed by hand — the hand-written list was what let four files go
unexamined while the finding was marked closed.

**P2K-F09 — the mutation harness read a suite run from "did it throw".** With
`NODE_TEST_CONTEXT` in the environment, `node --test` prints no summary and exits
0 even when tests fail, so every operator in a battery would report SURVIVED
behind a normal-looking table. Measured on a mutant otherwise reported KILLED:
clean env gave exit 1 with five `not ok` lines; the leaked env gave exit 0 with
no TAP at all. The child's environment is sanitised, and a run with no TAP
summary — or with an exit code and fail count that disagree — is now a harness
error rather than a result.


**QD-J23 — publication-lint discovery was non-recursive on both sides.**
`defaultRoots()` and its own test called the same flat `readdirSync`, so a
config module one directory down was invisible to both. Measured before
repair, with three publication-facing values planted one level down — one of
them tripping a HARD rule:

| | flat | recursive |
|---|---|---|
| discovery reached the probe | no | yes |
| inventory | 12 (+0) | 15 (+3) |
| advisory warnings reported | 0 | 1 |
| hard violations reported | 0 | 1 |
| shipped suite | 7/7 green | 6/7, exit 1 |

Reproduce both columns:

```
node tools/verification/experiments/lint-discovery-depth.mjs        # after
node tools/guard-diff/mutate.mjs                                    # K2-01 is the "before"
```

## How to report these two results (Human Gate, Phase 2K final)

Two instruments are easy to over-report. The approved wording is exact.

**guard-diff**

```
guard-diff: ADMISSIBLE regression evidence for its committed corpus only
```

Not "independent proof of guard correctness". Not "complete privacy
verification". The admissible claim is: *no input in the committed independent
corpus that the base revision rejects is accepted by the target revision.* It
does not establish corpus completeness, semantic publication safety, absence of
open-set bypasses, or behaviour outside the enumerated corpus. P2K-F10 remains
the explicit limitation.

**mutation** — never reported as a single verdict:

```
mutation KILLED verdict                      : ADMISSIBLE regression evidence
automatic SURVIVED/EQUIVALENT classification : DIAGNOSTIC_ONLY
```

A KILLED result means only that at least one durable test failed when the stated
mutation was applied. A generic non-killed result is
`SURVIVED_OR_EQUIVALENT_UNDETERMINED` unless a separate operator-specific
measurement resolves it — the automatic probe is guard-corpus-based and has no
resolution outside that behavioural surface (P2K-F15).

K2-03 is the worked example: the battery reports it **non-killed**, and its
EQUIVALENT status comes from a separate focused measurement of Dirent behaviour.
That result belongs to the focused measurement, not to the harness.

## Nothing is currently quarantined

`guard-diff` was INADMISSIBLE through Waves 1 and 2 and was re-admitted in Wave 3
on the measurement above. An earlier version of this section still described it
as quarantined, in the present tense, fifty lines below the section saying it had
been repaired — and an independent verifier following this file as the designated
entry point reported that it could not tell which of two committed documents was
current. The historical detail now lives with the measurement it belongs to, in
`experiments/corpus-independence.expected.json` under `historical`.

If an instrument is quarantined again, it belongs here, and
`verification-spec.json` is the authority — `tests/verification-manifest.test.js`
asserts this file and the spec cannot disagree about a finding's status.

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
- **A copy of the implementation's algorithm is not an oracle.** If the test
  walks the tree the same way the code walks it, the pair is blind along that
  axis and the suite stays green while values go unseen. That was QD-J23, and
  QD-J20 and QD-J21 before it. Use a different mechanism: a hand-written
  literal, a different tool (`git ls-files`), or a structure the test builds.
- **A closure claim is a measurement, not a conclusion.** Before writing
  "CLOSED", apply the repair's own check to the whole population it claims to
  cover. Wave 4 repaired one of five files and recorded the finding closed; the
  test that should have caught it inspected a hand-written list of two.
- **A number pinned by a string match is not pinned.** `assert.match(reason,
  /26496/)` pins the sentence. It accepted a figure from a different experiment
  for a whole wave. Pin figures against a committed generator's expectations.
- **A zero is a statement about the corpus, not the subject.** Print the corpus
  digest beside the count, and say which rules the corpus never reached. A rule
  with no input attributed to it has not been measured, however many inputs ran.
- **A reading you cannot parse is not a negative result.** An instrument that
  returns nulls has not observed "no problem"; it has failed to observe. Make
  it throw. `NODE_TEST_CONTEXT` leaking into a spawned `node --test` made one
  of these scripts report success for a failing suite (P2K-F09) — the same
  distinction the admissibility model draws when it keeps `UNVERIFIED` apart
  from `PASS`.

## Determinism

Same tree, byte-identical output, for all three CLIs. Paths, instrument ids and
assertions are sorted where order has no meaning. Timestamps are omitted from
static structures rather than filled with wall-clock time.

JSON goes to stdout; diagnostics and errors go to stderr; exit is 0 on success
and non-zero on schema or runtime failure — so another tool can consume the
output without parsing prose.
