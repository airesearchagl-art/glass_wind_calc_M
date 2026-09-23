# browser-checks

`npm test` covers the modules under Node. These five harnesses cover what Node
cannot: that `index.html` actually behaves correctly when a real browser parses
and runs it from `file://`.

They were run every wave of Phase 2J and their results were quoted in the Run
Artifact as "62 browser checks / 0 fail" — but they lived only in a scratch
directory, so **no reader could reproduce that number** (independent review 7,
F7-06). They are committed here for that reason.

| harness | checks | what it covers |
|---|---|---|
| `browser-w4.mjs` | 34 | Evidence Closure Matrix renders; protected facts read back from the loaded page |
| `probe-w4.mjs` | 8 | injection probes against the closure UI; asserts no page errors |
| `failopen-w4.mjs` | 10 | forced closure failure shows a warning that does **not** read as "verified" |
| `stageA-regression.mjs` | 10 | Stage A exact-head regression over the protected values |
| `parser-boundary.mjs` | 42 forms | the `html-like-tag` guard vs. real Chromium element creation |

`parser-boundary.mjs` is a differential harness, not a pass/fail suite: it
reports **bypasses** (guard accepts, Chromium builds an element — must be 0)
separately from **over-rejections** (guard rejects, 0 elements — fail-closed,
allowed).

## Running

    node tools/browser-checks/browser-w4.mjs

Requires Playwright with Chromium. These import it by absolute path:

    /opt/node22/lib/node_modules/playwright/index.mjs

because the repo has no `node_modules` and no build step — a deliberate
property of this project, not an oversight. On a machine where Playwright sits
elsewhere, change that import line. The harnesses are otherwise dependency-free
and read `index.html` over `file://`.

## Reading the numbers

These are harnesses, not a framework — they exit non-zero on failure and print
a count. Two traps cost real debugging time in this phase, both recorded so the
next reader does not repeat them:

- `div.innerHTML` silently drops table-scoped tags (`<td>`), so "0 elements"
  does not mean "not a tag". `parser-boundary.mjs` parses in both a `div` and a
  `table` context.
- Wrapping a witness in markup that contains `>` will close an otherwise
  unclosed tag and manufacture an element that the witness alone never creates.
  Append nothing to a witness.
