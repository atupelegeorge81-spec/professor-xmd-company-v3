---
id: peer-review/comments-finalize
title: Peer Review — actionable comments, channels, lint and finalize
phases: observer, objection, review
priority: 1
upstream: SKILL.md §Review workflow 9, 10, 11
---

### 9. Draft actionable comments

Only after the intake gate is satisfied, draft your comments.

Every major/minor comment should include:

- **Location**
- **Observation**
- **Evidence or criterion**
- **Why it matters**
- **Requested action**

Prioritize:

- Claim–evidence alignment
- Methods and statistical validity
- Reproducibility and transparency
- Ethics and participant/animal protection
- Reporting needed for appraisal
- Figures, tables, limitations, and citations

Requests for new work must be necessary to support a central claim and proportionate to scope. Offer narrowing, clarification, sensitivity analysis, correction, or limitation language when that is sufficient.

### 10. Keep channels separate

**Your OBJECTION / review note** contains the substantive review: strengths when relevant, major/minor comments, and limitations — addressed to the owner.

**Process notes** (conflicts, competence limits, a request for a specialist teammate via CLARIFY, or a concern about how the Board is proceeding) are stated separately and briefly.

Do not hide ordinary criticism in process notes.

### 11. Lint and finalize

The review linter (ported into tools/peer-review.ts) runs automatically on every observer/objection note: it checks unresolved placeholders, a narrow abusive-language lexicon, role/decision phrases (announcing a verdict that is not yours), and the required actionability fields. It logs rule IDs, not your text. Professional tone and real review remain mandatory.

Before handoff:

- Verify all locations and evidence.
- Remove unsupported or speculative criticism.
- Confirm professional, non-abusive language.
- State review limits and specialist needs.
- Remove all placeholders.
- Ensure no invented citation, experiment, test run, reanalysis, or outcome.
- Follow the documented deletion/retention rule.
