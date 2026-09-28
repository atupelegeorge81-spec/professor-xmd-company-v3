---
id: peer-review
name: peer-review
owners: all
line: evidence-bounded, constructive review of a teammate's proposal or deliverable — located, actionable comments; no verdict that belongs to others
always: observer, objection
trigger: \b(review\w*|critique|feedback|assess\w*|evaluat\w*|audit\w*|check the|objection|reject\w*|approve\w*)\b
triggered: review, report, discussion
upstream: https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/peer-review
license: MIT (K-Dense Inc.)
---
PROFESSOR-XMD edition of K-Dense "peer-review". The workflow, the comment fields and the finalization checks are unchanged. Setting:
- "manuscript / submission" = the proposal, decision or ScriptBox deliverable under review in the current agenda item. "authors" = its owner(s).
- "reviewer" = you as observer (or Cybertron as QA reviewer). "editor / panel decision" = the owner + Board consensus + Ledger LOCK, and finally Mkuu. An observer never announces that decision.
- "comments to authors" = your OBJECTION / review notes in the Board. "confidential comments to editor" = there is no private channel here; Mkuu's secrets (keys, credentials, private data) are simply never repeated or searched.
- "reporting guideline" = the governing standard for the artifact (WCAG 2.2, OWASP ASVS/Top 10, IETF RFCs, HTTP semantics, platform guidelines, the locked Ledger decisions).
- "run scripts/lint_review.py, validate_claim_evidence.py, audit_citations.py" = these are ported into `tools/peer-review.ts` and run automatically on observer/objection notes and on the report; their findings are logged.
- When a reference module mentions `scripts/…` or `assets/…`, that tool/template lives in skills-upstream only; its ported checks already run automatically. "journal / editor channel" in the references = raise it in the Board; Mkuu decides.
- The output format the system gives you (e.g. `SILENT` or an OBJECTION) always overrides the length and shape of this text — put the comment fields inside that format.
- Upstream only (not relevant to the Board): intake JSON validator, manuscript templates/assets, `reporting_standards.md` (medical/scientific reporting catalogue), `tool_reference.md` (CLI schemas), `security_validation.md` (the skill package's own security record).
