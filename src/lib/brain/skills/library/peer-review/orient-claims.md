---
id: peer-review/orient-claims
title: Peer Review — establish scope, orient without deciding, map claims to evidence
phases: observer, review, objection
priority: 1
upstream: SKILL.md §Review workflow 1, 2, 4
---

## Review workflow

### 1. Establish scope and available evidence

Record:

- Artifact type and stage (proposal, decision, deliverable version)
- Review question and requested focus
- The agenda item and the locked decisions it must respect
- Materials actually available: the proposal, the deliverable code, the evidence/sources, the Ledger, prior objections and the owner's responses
- Competence areas and limits
- Missing material that prevents assessment

Do not infer absent content. Use “not reported” or “not available for review.”

### 2. Orient without deciding

Create a short neutral map:

- Research question
- Population or system
- Design and unit
- Intervention, exposure, test, or model
- Comparator/reference
- Outcomes and timing
- Principal claims

Do not write an accept/reject verdict at this stage. Identify what evidence would be needed to evaluate each claim.

### 4. Map claims to evidence

Prioritize central, causal, mechanistic, safety, diagnostic, prediction, and generalization claims.

For each claim, record:

- Location and claim ID
- Supporting result, figure, table, analysis, or citation IDs
- Direction, magnitude, population, outcome, timepoint, and uncertainty alignment
- Limitation or alternative explanation
- Bounded requested action

The claim–evidence validator (ported into tools/peer-review.ts) runs automatically on owner turns and logs which claims have no EVIDENCE line.
