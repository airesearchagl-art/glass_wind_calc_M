# browser-checks

`npm test` covers the modules under Node. These nine harnesses cover what Node
cannot: that `index.html` actually behaves correctly when a real browser parses
and runs it from `file://`.

They were run every wave of Phase 2J and their results were quoted in the Run
Artifact as "62 browser checks / 0 fail" — but they lived only in a scratch
directory, so **no reader could reproduce that number** (independent review 7,
F7-06). They are committed here for that reason.

| harness | checks | what it covers |
|---|---|---|
| `browser-w4.mjs` | 34 | Evidence Closure Matrix renders; protected facts read back from the page's active ProjectContext and compared with expectations taken outside the page (Node-side runtime-default built-in and `evidenceStateExpected`) |
| `probe-w4.mjs` | 8 | injection probes against the closure UI; asserts no page errors |
| `failopen-w4.mjs` | 10 | forced closure failure shows a warning that does **not** read as "verified" |
| `stageA-regression.mjs` | 10 | Stage A exact-head regression over the protected values (facts and Closure observed through the active ProjectContext, never the project module global) |
| `parser-boundary.mjs` | 42 forms | the `html-like-tag` guard vs. real Chromium element creation |
| `context-runtime.mjs` | 103 | the preset UI reads everything from the active ProjectContext of the runtime-default built-in (Phase 2L-B2 S2-B / S2-C / S3-A): the real tree (the synthetic sample only; non-default built-in modules are not loaded, the Evidence UI stays unverified, and the preset wording does not imply a real-project source behind the built-in), the module global replaced after bootstrap (decoy), a different synthetic built-in substituted in a temporary copy (its first floor is not in the real tree and it has no floor 2), ProjectContext unavailable, the runtime-default module missing (no fallback, and a late look-alike registration cannot become the default), a duplicate runtime-default declaration, an extra non-default built-in, and reordered declarations |
| `project-pack-intake.mjs` | 140 | the browser-local Project Pack intake (Phase 2L-B2 S3-B1), driven only through the page UI: the three synthetic fixtures load by paste, file and drop into a staged `pack_unreviewed` context while `activeProjectContext`, the preset UI and the calculation result stay unchanged; the preview shows counts, IDs and claimed levels but no raw JSON; invalid JSON, schema-invalid packs and unsafe prose fail transactionally (no previous Pack kept) with a validator path and reason and no echo of the input; the 8 MiB import cap rejects before parsing (UTF-8 bytes) or reading (`file.size`); a drop must carry exactly one item and it must be a JSON file (a file plus a string item, a string alone, two files and non-JSON types are rejected without reading the file); a validator reason that echoes a value after `got` (here `; got <recurrenceYears>`) shows neither the value nor the label or filename, also with the 200-character display cap lifted (so the echo rule, not the cap, is what removes the value); a slower earlier file read cannot overwrite a later load; no storage, network, URL or console output |
| `project-pack-execution.mjs` | 46 | the explicit single-case Project Pack execution (Phase 2L-B2 S3-B2), driven only through the page UI: nothing is calculated on load (paste or file) or on selection; pressing the execute button for G002 of each synthetic fixture shows the exact pane, floor / zone / evaluation-height or map rows, designPressure and glass candidate rows (expected from fixture literals and from wind-pressure.js / calc.js under Node, not from the executor), `pack_unreviewed` and calculated-not-verified wording; case_direct shows designPressure only; a selection change, new load, failed load and unload clear the result; an execution failure shows a fixed message and keeps the Pack staged; stronger claims do not change the result; the active context, preset UI and calculation result stay unchanged; no storage, network, URL or console output; on fresh pages, a ProjectContext / WindPressure / GlassCalc global replaced after the executor initialised (decoys with different outputs) is never consulted, and in a tree where ProjectContext is missing at initialisation, neither the genuine module loaded later nor a fake revives the executor |
| `project-pack-batch.mjs` | 57 | the explicit multi-case Project Pack execution (Phase 2L-B2 S3-B3A), driven only through the page UI: nothing is calculated on load (paste or file) or on selection; pressing the execute-all button lists every case of each synthetic fixture in Pack order with G002 equal to its single-case oracle (expected from fixture literals and from wind-pressure.js / calc.js under Node, not from the executor or the batch module), `pack_unreviewed` and calculated-not-verified wording; case_direct shows designPressure only; a 2000-case synthetic Pack (generated on the fly by `tests/support/synthetic-pack.js`, never written to disk) completes with intermediate progress values while the page keeps responding, is paged 50 rows at a time without recalculating, and its time and heap are recorded but not asserted; cancel, a new Pack, an invalid Pack, unload and a second start discard the running batch so that no old run writes the screen; on fresh pages, a failing middle case and a token change right before the commit (injected by wrapping a page global from an init script) leave no batch result and a fixed message, and a ProjectPackExecution global replaced after initialisation is never consulted; stronger claims do not change the result; the active context, preset UI and calculation result stay unchanged; no storage, network, URL or console output |

`parser-boundary.mjs` is a differential harness, not a pass/fail suite: it
reports **bypasses** (guard accepts, Chromium builds an element — must be 0)
separately from **over-rejections** (guard rejects, 0 elements — fail-closed,
allowed).

## Running

    node tools/browser-checks/browser-w4.mjs

The repository root is derived from each harness's own location
(`new URL('../../', import.meta.url)`), so they measure the tree they ship in.

This was not true when they were first committed: they hardcoded one absolute
checkout path, which meant a harness copied into a candidate worktree silently
measured the *original* tree. Independent review 8 (F8-04) proved the
consequence — a copy whose `containsHtmlLikeTag` had been replaced with
`return false;` still reported "BYPASSES: 0". After the fix the same sabotage
reports 19 bypasses, and the real tree still reports 0.

Requires Playwright with Chromium. **Do not edit an import line to point at it.**
Every harness resolves Playwright through `resolve-playwright.mjs`, which tries,
in order:

1. `PLAYWRIGHT_MODULE` — set it to an `index.mjs` if your layout is unusual
2. a bare `playwright` specifier, for a checkout that has it installed
3. `npm root -g`
4. a root derived from the running interpreter, needing no npm at all

The repo has no `node_modules` and no build step, which is a deliberate property
of this project. Through Wave 4 these files imported one machine's absolute path
instead, and `browser-w4.mjs` was the only one converted — the other four were
found still hardcoded by an independent verifier while the finding was recorded
as closed. All five now share `harness.mjs`.

The harnesses are otherwise dependency-free and read `index.html` over `file://`.

## Exit codes

They do **not** simply "exit non-zero on failure". Four outcomes are distinct,
because §18 requires that "nothing was measured" never be reported as a result:

| exit | outcome | meaning |
|---|---|---|
| 0 | `PASS` | measured, everything passed |
| 1 | `FAIL` | measured, something failed |
| 3 | `UNVERIFIED` | could not start — no Playwright, no browser. **Nothing was measured.** |
| 4 | `ERROR` | started and then broke, or ran zero checks |

Zero checks with zero failures is `ERROR`, not `PASS`. Each harness also prints a
JSON object naming its `outcome`, `checksRun` and `failures`, so a caller does
not have to infer any of this from the exit status alone.

## Reading the numbers

These are harnesses, not a framework. See **Exit codes** above for what a
non-zero status actually means. Two traps cost real debugging time in this phase,
both recorded so the next reader does not repeat them:

- `div.innerHTML` silently drops table-scoped tags (`<td>`), so "0 elements"
  does not mean "not a tag". `parser-boundary.mjs` parses in both a `div` and a
  `table` context.
- Wrapping a witness in markup that contains `>` will close an otherwise
  unclosed tag and manufacture an element that the witness alone never creates.
  Append nothing to a witness.
