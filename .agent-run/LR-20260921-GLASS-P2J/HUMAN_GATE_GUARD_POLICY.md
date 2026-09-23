# Human Gate — Phase 2J

## Public-safe Prose Guard: Enforcement Boundary Decision

```text
Repository : airesearchagl-art/glass_wind_calc_M
Branch     : claude/phase2j-evidence-closure-gate
Head       : 76aba491dd67c522ea94f5d6d247e8f69df5ba66
Run        : LR-20260921-GLASS-P2J
Task Packet digest : aa9ce07dac4767afc0ad9ff4b13663ae8cc2ab1be98e9e44ef80498da3acc446
```

**Decision required:** change the meaning of the public-safe prose guard.

**Not authorized by this Gate:** Ready / merge / Production.

> This document is the Human Gate's own text, recorded verbatim in substance by the
> implementation session. The implementation session did not author the decision and
> must not implement §8 before explicit approval.

---

## 1. Why this is a Human Gate

The issue is no longer a conventional implementation defect.

Independent reviews 13 and 14 separately concluded that three current rules —
`known-private-provider`, `www`, `opaque-long-token` — are membership/heuristic
tests over an **open set**.

Examples include alternate/confusable or human-readable representations such as:

```text
drive.gооgle.com          (Cyrillic о)
drive[.]google[.]com
drive dot google dot com
```

No finite sequence of normalizers makes *“is this prose safe to publish?”* a
mechanically complete closed-set decision. Unicode NFKC does not solve general
visual confusables.

Therefore continuing to add normalizers changes **examples**, not the fundamental
completeness property.

---

## 2. Measured cost of the current design

```text
~11.3% of this repository's own prose corpus is rejected by the current guard
```

This indicates meaningful false-positive pressure. At the same time the three
heuristic rules remain bypassable by transformations outside their enumerated
membership set.

The current contract therefore carries **both** false positives **and** an
unattainable implied completeness guarantee.

---

## 3. Evidence from the repair history

The branch history shows repeated repairs around this boundary: normalization
sets, fullwidth/dot folding, invisible characters, context anchors, token
membership. Independent reviews continued finding neighbouring representations.

This pattern is consistent with a **design-boundary problem**, not a finite list
of ordinary defects.

---

## 4. Recommended policy

### A. Enforced structural controls — THROW

```text
1. url-scheme
2. windows-absolute-path
3. unc-path
4. unix-home-or-absolute-path
5. email-like
6. private-document-filename
7. html-like-tag
8. markup-construct
9. control-character
```

These rules should have narrowly defined lexical/structural semantics.

The claim becomes:

> The validator rejects these mechanically identifiable structures.

It does **not** become:

> The validator proves the text contains no confidential information.

### B. Advisory heuristics — WARNING ONLY

```text
1. www
2. known-private-provider
3. opaque-long-token
```

These remain useful signals. They must no longer be represented as exhaustive
security boundaries. A match generates advisory lint / human-review warning, not
automatic rejection.

---

## 5. Human review becomes an explicit control

```text
1. structurally decidable hard controls pass
2. advisory lint is reviewed
3. human reviewer confirms the prose is public-safe
```

The human-review step is **not a fallback for broken code**. It owns the
semantic/open-set question that code cannot completely decide:
*“Does this prose disclose something private?”*

---

## 6. Terminology change

Stop documenting `assertPublicSafeEvidenceText()` as proof that text is safe to
publish. Recommended wording: **“mechanical public-safety guard”** or
**“structural publication guard”**, with an explicit limitation:

> Passing the guard does not establish that prose is free of confidential project
> names, disguised provider references, semantic secrets, or other open-set
> disclosures. Final publication requires Human Review.

The existing function name may remain for compatibility if changing it causes
unnecessary churn, but documentation must state its actual guarantee.

---

## 7. Review 15 scope (binding)

Review 15 is the **final classification review** before the Human Gate decision.
It must **not** continue the normalization chase for the three advisory candidates.

```text
A. Are any of the nine proposed hard rules currently bypassable relative to
   their narrowly stated structural semantics?
B. Would demoting the three heuristic rules introduce a new automatic trust or
   promotion path?
C. Does the application already have a Human Gate / publication-review point
   where advisory lint can be resolved?
D. Are reviews 13/14's measured false-positive and open-set conclusions
   reproducible?
E. Are there any unrelated Hard Gate findings in Phase 2J?
```

```text
If A or E reveals a real defect            -> repair it.
If a new representation only bypasses
www / known-private-provider /
opaque-long-token                          -> record as further open-set evidence.
Do not start repair round 16.
```

---

## 8. Recommended post-Gate implementation — ONLY AFTER APPROVAL

Split the canonical rule table conceptually into `HARD_REJECT_RULES` and
`ADVISORY_LINT_RULES` (or an equivalent representation).

```text
assertPublicSafeEvidenceText()
  hard rule match      -> throw
  advisory match       -> do not throw

lintPublicEvidenceText(text)   (new) -> deterministic warning codes
```

Do not silently discard warnings. Do not silently sanitize text.

---

## 9. Proposed advisory output

```json
{
  "warnings": [
    {
      "rule": "known-private-provider",
      "severity": "advisory",
      "message": "Text resembles a private document-provider reference; human review required."
    }
  ]
}
```

Warnings must not contain private source data beyond the prose already being
reviewed. No trust status is raised by clearing or ignoring a warning.

---

## 10. Promotion boundary remains unchanged

This policy change must **not** alter: Evidence level, `checkedAt`, Promotion
Gate, `sourceReference` validation, Evidence-first reconciliation,
MATCH/MISMATCH, candidate readiness, `verifiedCases`, current config.

```text
Human publication review  !=  Evidence verification
```

These remain separate concerns.

---

## 11. Required tests after approval

```text
Hard-rule tests : all nine continue to reject their defined structures
Advisory tests  : www / known-private-provider / opaque-long-token
                  -> warning, no throw
Open-set examples (drive.gооgle.com, drive[.]google[.]com,
drive dot google dot com) must NOT be used to claim exhaustive machine
detection. Tests/documentation instead establish that human review remains
required even when advisory lint is empty.
```

---

## 12. False-positive regression

Re-run the same repository-prose corpus measurement used to obtain 11.3% and
report: before hard-rejection rate, after hard-rejection rate, advisory warning
rate.

Do not optimize for a target percentage. The measurement is evidence of
behavioural impact, not a pass/fail metric.

---

## 13. Why not continue the current repair loop

Not recommended. Each new normalization repairs members of an open set while
preserving the same impossible completeness assumption. Likely consequences:
continued repair/re-review cycles, increasing normalization complexity, more
regressions, more test-instrument defects, continued false positives — without a
proof of semantic publication safety.

---

## 14. Why not freeze the current implementation as-is

Also not recommended. It preserves a misleadingly strong mechanical-safety
contract, the measured false-positive burden, and the incentive to treat the next
heuristic bypass as another security defect. The limitation should be encoded in
the **architecture**, not left only as Quality Debt.

---

## 15. Human Gate decision

**Recommended decision: APPROVE POLICY CHANGE**

```text
- nine structurally decidable rules remain enforced
- three heuristic/open-set rules become advisory lint
- human publication review becomes an explicit required control
- stop mechanical repair loop for those three rules
- implementation occurs on the current Phase 2J branch
- after implementation, run focused independent re-review
- still no Ready / merge / Production
```

Alternatives:

```text
A. KEEP CURRENT ENFORCEMENT  — accept false positives and open-set limitation intentionally
B. CONTINUE MECHANICAL REPAIR — not recommended; requires explicit authorization
                                acknowledging the lack of a closure criterion
C. FREEZE AS-IS               — not recommended; preserves the semantic mismatch
```

---

## 16. Current project state remains unchanged

```text
Primary Evidence          : UNAVAILABLE
Actual project observations: 0
Closure                   : BLOCKED_BY_MISSING_EVIDENCE
Promotion Candidate       : NONE
verifiedCases             : []
Project promotion         : NONE
```

This Human Gate concerns **publication-text screening only**. It does not
authorize Evidence promotion.

---

## 17. Stop condition (in force now)

```text
STOP mechanical repairs to: www / known-private-provider / opaque-long-token
Do not Ready. Do not merge. Do not Production.
A newly found defect in one of the nine structural hard rules may still be
handled as a normal Required Fix.
```
