# browser-checks

`npm test` covers the modules under Node. These twelve harnesses cover what Node
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
| `project-pack-intake.mjs` | 141 | the browser-local Project Pack intake (Phase 2L-B2 S3-B1), driven only through the page UI (Pack operations on the Project Pack view, single-case reads on the single-case view, S3-B3B2-B2): the three synthetic fixtures load by paste, file and drop into a staged `pack_unreviewed` context while `activeProjectContext`, the preset UI and the calculation result stay unchanged; the preview shows counts, IDs and claimed levels but no raw JSON; invalid JSON, schema-invalid packs and unsafe prose fail transactionally (no previous Pack kept) with a validator path and reason and no echo of the input; the 8 MiB import cap rejects before parsing (UTF-8 bytes) or reading (`file.size`); a drop must carry exactly one item and it must be a JSON file (a file plus a string item, a string alone, two files and non-JSON types are rejected without reading the file); a validator reason that echoes a value after `got` (here `; got <recurrenceYears>`) shows neither the value nor the label or filename, also with the 200-character display cap lifted (so the echo rule, not the cap, is what removes the value); a slower earlier file read cannot overwrite a later load; no storage, network, URL or console output |
| `project-pack-execution.mjs` | 46 | the explicit single-case Project Pack execution (Phase 2L-B2 S3-B2), driven only through the page UI: nothing is calculated on load (paste or file) or on selection; pressing the execute button for G002 of each synthetic fixture shows the exact pane, floor / zone / evaluation-height or map rows, designPressure and glass candidate rows (expected from fixture literals and from wind-pressure.js / calc.js under Node, not from the executor), `pack_unreviewed` and calculated-not-verified wording; case_direct shows designPressure only; a selection change, new load, failed load and unload clear the result; an execution failure shows a fixed message and keeps the Pack staged; stronger claims do not change the result; the active context, preset UI and calculation result stay unchanged; no storage, network, URL or console output; on fresh pages, a ProjectContext / WindPressure / GlassCalc global replaced after the executor initialised (decoys with different outputs) is never consulted, and in a tree where ProjectContext is missing at initialisation, neither the genuine module loaded later nor a fake revives the executor |
| `project-pack-batch.mjs` | 57 | the explicit multi-case Project Pack execution (Phase 2L-B2 S3-B3A), driven only through the page UI: nothing is calculated on load (paste or file) or on selection; pressing the execute-all button lists every case of each synthetic fixture in Pack order with G002 equal to its single-case oracle (expected from fixture literals and from wind-pressure.js / calc.js under Node, not from the executor or the batch module), `pack_unreviewed` and calculated-not-verified wording; case_direct shows designPressure only; a 2000-case synthetic Pack (generated on the fly by `tests/support/synthetic-pack.js`, never written to disk) completes with intermediate progress values while the page keeps responding, is paged 50 rows at a time without recalculating, and its time and heap are recorded but not asserted; cancel, a new Pack, an invalid Pack, unload and a second start discard the running batch so that no old run writes the screen; on fresh pages, a failing middle case and a token change right before the commit (injected by wrapping a page global from an init script) leave no batch result and a fixed message, and a ProjectPackExecution global replaced after initialisation is never consulted; stronger claims do not change the result; the active context, preset UI and calculation result stay unchanged; no storage, network, URL or console output |
| `project-pack-report.mjs` | 61 | the Project Pack derived JSON / CSV report (Phase 2L-B2 S3-B3B1), driven only through the page UI: nothing is generated on startup, on load, while a batch is running, on batch completion or on paging (the buttons are enabled only once a batch result is committed); JSON and CSV of each synthetic fixture carry `pack_unreviewed` / `calculated_not_verified` (in every CSV row too), list every case in Pack order and match G002 against values taken from the fixture literals and from wind-pressure.js / calc.js under Node (computed values compared with a 1e-12 relative tolerance, because Node's and Chromium's V8 can differ in the last ulp); case_direct leaves the positive / negative columns empty; a 2000-case synthetic Pack yields 2000 JSON rows and 2000 CSV records (sizes and timings recorded, not asserted); CSV replaces JSON; a Pack reload, an invalid Pack, unload, a new batch, cancel, a batch failure and the clear button remove the output; formula-like Pack labels are prefixed with a single quote in CSV and kept verbatim in JSON; a failing report shows a fixed message and keeps the Pack and the batch; a ProjectPackBatch global replaced after initialisation is never consulted; stronger claims do not change the output; the active context, preset UI and calculation result stay unchanged; no download, clipboard, storage, network, URL or console output |
| `result-freshness.mjs` | 77 | single-case and Workspace result freshness and the notification source label (Phase 2L-B2 S3-B3B2-B1), driven through the page UI (plus page-internal fault injection and changes without events): the single-case result stays current after the initial and every successful calculation; changing W, H, glass type, extra factor, the preset floor / zone, the manual pressures, each notification wind condition (and the recurrence only under the association basis), the preset-comparison toggle or the imported package's editable values marks it as earlier (変更前) with fixed text, a dimmed result and a labelled judge badge, without recalculating; inputs of an unselected mode do not mark it; an input that cannot be normalised or a calculation that did not complete marks it as from earlier input (以前の入力), also after restoring the values; mode switches and Import keep their automatic calculation; a change without events is detected the next time freshness is judged; the Project Pack panel is unaffected; the Workspace goes from none to fresh, an added case, a same-count content change or a diagnostics change marks both the summary and the result list as earlier while keeping the old results, row duplicate / delete, TSV and Workspace JSON import evaluate again, a failed evaluation is not shown as current, the result CSV is refused (leaving the output field untouched) unless current, a current CSV equals WorkspaceCore.toCsv() of a fresh evaluation, an old CSV left in the field is noted in its own warning (not the operation status line) that an Import error, an export status, a re-evaluation or a view switch does not remove and that a new current CSV or a Workspace JSON / pasted text in the field clears (RF-27-01), clearing returns to none and a first CSV export still evaluates first; the Review Package freshness text and print gate behave as before; notification results name their pressures as calculated from the entered wind conditions (never user input) with verificationStatus unverified, and preset / manual / imported labels and design pressures are unchanged; no storage, network, URL or console output |
| `three-view-navigation.mjs` | 33 | the purpose-based three views (Phase 2L-B2 S3-B3B2-B2), driven through tab clicks and the keyboard: only one of single case / Workspace / Project Pack is shown at a time (Playwright visibility, `checkVisibility()` and the hidden ancestor agree), an unknown view value changes nothing, `[hidden]` is not overridden by CSS; inputs, results, the Workspace and the staged Pack (with its single-case and all-case results) survive switching; the tabs follow the WAI-ARIA tab pattern (aria-controls / aria-labelledby resolve, one tabpanel in the accessibility tree, roving tabindex, ArrowLeft / ArrowRight / Home / End, Enter / Space, focus leaves a panel that is hidden); opening the Pack view changes neither the single-case result and freshness nor the Workspace freshness, the stale-CSV refusal or the old-CSV warning; the active context is unchanged, the Pack is not converted into the Workspace and stays `pack_unreviewed`; a Pack all-case run completes and a cancel still cancels while the user switches views; the Review print gate is unchanged and the Pack view never prints; the Workspace profile card sits directly under the tabs; at 1280 px and 390 px the tabs are readable (contrast ≥ 4.5, selection also shown by a line), operable, and the tab row does not widen the page; the B1 freshness notices stay visible and do not overlap; no storage, network, URL or console output |

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
