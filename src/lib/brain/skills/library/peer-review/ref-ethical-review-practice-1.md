---
id: peer-review/ref-ethical-review-practice-1
title: Peer Review reference — Ethical and Confidential Peer Review (part 1/2)
phases: observer, objection
priority: 4
when: \b(ethic\w*|privacy|confidential\w*|personal data|consent|conflict of interest|ai policy)\b
upstream: references/ethical_review_practice.md part 1/2
---

# Ethical and Confidential Peer Review (part 1/2)

Verified on **2026-07-23** against COPE, ICMJE, and illustrative publisher policies listed in `assets/source_ledger.csv`.

COPE identifies peer review as one of its 10 Core Practices and states that the process should be transparently described and well managed, with policies for conflicts, appeals, and disputes. The target journal’s published process controls the individual assignment.

## Role boundary

This skill supports an accountable human preparing a review draft or structured assessment. It must not:

- Claim to be the assigned reviewer, editor, journal, funder, or decision-maker
- Submit a review or contact authors, editors, institutions, or third parties without authorization
- Invent manuscript content, experiments, analyses, citations, reviewer identity, or editorial outcomes
- Present generated text as an independently completed review
- Investigate authors or search unpublished content outside the authorized process

The editor decides the editorial outcome. The reviewer provides evidence-bounded advice within the requested scope.

## Before accepting or starting

COPE’s Ethical Guidelines for Peer Reviewers and ICMJE recommendations require reviewers to consider:

### Competence

- Accept only work for which the reviewer can provide a useful assessment.
- State material subject-matter, methods, statistics, ethics, language, or domain limits.
- Ask the editor for a specialist reviewer when a central issue exceeds competence.
- Do not conceal limits by producing confident generic criticism.

### Conflicts

Disclose actual, potential, or perceived conflicts before proceeding. They can be:

- Financial or commercial
- Personal or family
- Institutional
- Recent collaboration, supervision, mentorship, or competition
- Intellectual commitments or directly competing work
- Political, religious, advocacy, or legal interests

The journal decides whether a disclosed conflict permits review. If unresolved, stop. Do not accept merely to gain access to unpublished work.

### Capacity and timeliness

Accept only if the review can be completed within the agreed time. Tell the editor promptly if scope or timing changes.

### Journal policy

Record:

- Review model and anonymity expectations
- Whether co-review is allowed and how contributors are named
- Confidentiality and retention requirements
- Required author-facing and editor-only fields
- AI and tool policy
- Citation, image-integrity, data, ethics, and reporting expectations

Journal practices differ. A policy from another publisher is an example, not authority for the target venue.

Use `scripts/validate_review_intake.py` before substantive review.

## Confidentiality and data handling

An unpublished manuscript, its supplements, review comments, and editorial correspondence are privileged confidential material.

### Default rule

Keep processing local. Do not send, paste, upload, transcribe, summarize, or expose unpublished manuscript or review text to:

- Public or external generative-AI systems
- Search engines or web research tools
- Citation, plagiarism, grammar, translation, or image services
- Unapproved collaborators
- Cloud storage or telemetry outside the authorized environment

unless the publisher or author has authorized that specific use, the target venue permits it, and applicable privacy, contract, intellectual-property, and data-governance requirements are satisfied.

Authorization to review is not automatically authorization to disclose material to a service. A tool’s promise not to train on data is not, by itself, authorization.

The bundled CLIs:

- Use only Python’s standard library
- Read bounded local JSON, CSV, or Markdown
- Make no network, model, image, subprocess, environment-variable, or dynamic-code calls
- Emit identifiers, counts, rule codes, and line numbers rather than raw manuscript or review text
- Refuse symlink inputs and implicit output overwrite

They do not make an external service safe and do not authorize its use.

### Assistance and co-review

Obtain journal permission before sharing with a trainee or colleague. Record the contributor and acknowledge the contribution to the editor as required. The invited reviewer remains responsible for confidentiality and the submitted report.

### No reuse

Do not:

- Appropriate ideas, methods, code, data, or language before publication
- Use the material for model training, benchmarking, product improvement, or unrelated research
- Build a private corpus of manuscripts or reviews
- Retain content for convenience beyond policy

### Retention and deletion

After submitting or ending the review:

1. Follow the target venue’s retention rule.
2. Delete local manuscript and review copies when required.
3. Empty derivative exports and temporary files within the authorized workspace.
4. Retain only what policy requires.
5. Record deletion or authorized retention without copying confidential content into the record.

ICMJE recommends that reviewers not retain manuscripts for personal use and delete copies after review. Local law, publisher policy, or a documented investigation may impose a different rule; follow the controlling requirement.

## AI and automated assistance

ICMJE says reviewers must follow the journal’s AI policy or request permission before using AI, maintain confidentiality, disclose use, and remain responsible for output that may be incorrect, incomplete, or biased.

For any permitted assistance:

- Identify the tool, version, purpose, and material exposed
- Use only the minimum necessary content
- Keep an accountable human in control
- Verify every statement, citation, calculation, and proposed comment
- Disclose use exactly as the journal requires
- Do not let a model create an autonomous review or editorial outcome

If permission is absent, the policy is unclear, or confidentiality cannot be assured, do not use AI on the material. Local deterministic checks may still be possible if policy and authorization permit local file processing.

Illustrative policies, not universal rules:

- [Nature Portfolio](https://www.nature.com/nature-portfolio/editorial-policies/peer-review) asks reviewers not to upload manuscripts to generative-AI tools and asks for transparent declaration when AI supported claim evaluation.
- [BMJ](https://authors.bmj.com/policies/ai-use) requires declaration of AI used for review-language assistance and prohibits placing unpublished material into publicly available tools when confidentiality cannot be guaranteed.
- [JAMA Network](https://jamanetwork.com/journals/jama/fullarticle/2807956) states that entering manuscript, abstract, or review text into a chatbot or language model violates its confidentiality agreement and requires disclosure of other AI resource use.

Always check the current target-venue policy.
