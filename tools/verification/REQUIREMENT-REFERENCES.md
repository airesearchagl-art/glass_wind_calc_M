# What the `§NN` references in `tools/` point at

An independent verifier following `tools/verification/README.md` found that the
tools cite a numbered authority no committed document matches:

```
sections cited under tools/ :  7 8 9 10 13 17 18 21 23 24 26 27 28 34 35 38
.agent-run/LR-20260927-GLASS-P2K/TASK_PACKET_SNAPSHOT.md :
    25 numbered sections, and zero "§" characters
```

So §26, §27, §28, §34, §35 and §38 are out of range for the one packet this
repository commits, and the rest cannot be located by number either. The design
rationale for several instruments was anchored to documents that are not in the
tree — which is the same shape as P2K-F05 ("the review scope was delivered in
conversation and is not committed"), one layer up.

## The limitation, stated rather than hidden

**Only the Phase 2K Task Packet is committed**, as
`.agent-run/LR-20260927-GLASS-P2K/TASK_PACKET_SNAPSHOT.md`, bound by digest
`aa68c9c5c820419c1f4413bbb7864a2d9cf49bc7b0b18c69645174cab0c6aa96`. The Phase 2K
Wave 1 packet, the Phase 2J packets and the Phase 2J Human Gate documents were
delivered in conversation and are **not** in this repository. Their section
numbering is therefore not resolvable from the tree, and no amount of
cross-referencing here changes that.

What follows is not a quotation of any packet. It states, in operational terms,
the requirement each citation is standing in for — enough that a fresh verifier
can judge whether the code meets it without needing the original document.

| cited | cited in | the requirement, operationally |
|---|---|---|
| §7 | `evidence-publication-lint.mjs` | Advisory guard warnings must reach a human. Demoting a rule from throw to warning is only acceptable if the warning is rendered somewhere a person reads. |
| §8 | `guard-diff/mutants.mjs` | An independent verifier or test must not import a private production helper and use its result as the expected value. Calling a public API as the *subject* is fine. |
| §9 | `verification/manifest.mjs` | A `CASE_ID` contract must not depend on a rule that was demoted to advisory. |
| §10 | `guard-diff/mutants.mjs`, `evidence-publication-lint.mjs` | Publication-facing identifiers, not only prose, are in scope for the lint — because a provider-like `caseId` no longer throws. |
| §13 | `evidence-publication-lint.mjs` | An empty advisory list is not proof the prose is publishable. The rules are open-set heuristics; Human Review is required regardless. |
| §17 | `project-state-probe.mjs`, `experiments/lint-discovery-depth.mjs` | No load-bearing number in a README or Run Artifact unless a generator is committed, the command is recorded, and the number can be regenerated. |
| §18 | `verification-spec.json`, `browser-outcome.mjs`, `harness.mjs`, `browser-checks/README.md`, `evidence-publication-lint.mjs` | Never record "browser VERIFIED" without an exact-head browser measurement. `UNVERIFIED` is an acceptable thing to report. |
| §21 | `manifest.mjs`, `guard-diff/mutate.mjs` | Instrument tooling must not create a new trust path. No tool output may be imported as verified Evidence, a Promotion Candidate, a registered preset, or a `verifiedCase`. A verification artifact is evidence about software, not project Evidence. |
| §23 | `verifier-package.mjs`, `resolve-playwright.mjs` | A fresh verifier must be able to reconstruct the verification state from committed artifacts alone. |
| §24 | `verifier-package.mjs` | A Hard Gate failure is a stop condition, not something to work around. |
| §26 | `verifier-package.mjs` | Stop at a Draft PR. No Ready, no merge, no Production. |
| §27 | `verifier-package.mjs` | Each instrument's admissibility travels with it, so a verifier never has to infer whether a result may be cited. |
| §28 | `verifier-package.mjs` | Disagreeing with the implementer, including finding a protected invariant violated, is a valid outcome. |
| §34 | `browser-checks/stageA-regression.mjs` | Protected calculation values must be observable as the browser renders them, not only through Node. |
| §35 | `browser-checks/probe-w4.mjs` | Injected content must not become live DOM. |
| §38 | `browser-checks/failopen-w4.mjs` | When evidence is insufficient the UI must fail closed, with wording that says so. |

## Keeping this honest

`tests/verification-manifest.test.js` (P2K-M11) asserts that **every** `§NN` cited
anywhere under `tools/` appears in the table above. A new dangling reference fails
the suite. That does not make the packets committed — it makes the gap visible and
bounded, which is the most this repository can truthfully claim.
