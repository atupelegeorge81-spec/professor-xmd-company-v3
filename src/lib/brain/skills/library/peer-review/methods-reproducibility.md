---
id: peer-review/methods-reproducibility
title: Peer Review — methods, statistics, reproducibility and transparency
phases: observer, review, objection
priority: 3
when: (\bstatistic\w*|\bbenchmark\w*|\bperformance\b|\blatency\b|\bmetric\w*|\d+\s?%|\bsample\b|\bexperiment\w*|\ba/b\b|\breproduc\w*|\bversion\w*|\bdependenc\w*|\btest\w*|\bdata\b)
upstream: SKILL.md §Review workflow 5, 6
---

### 5. Review methods and statistics

Assess in this order:

1. Question and target quantity
2. Design and unit of inference
3. Sampling, allocation, controls, masking, and timing
4. Sample-size or precision rationale
5. Inclusion, exclusion, attrition, and missingness
6. Analysis–design alignment and assumptions
7. Multiplicity and prespecification
8. Effect estimates, uncertainty, denominators, and harms
9. Interpretation, causality, and generalizability

Use the reference modules ref-common-issues and ref-statistical-reproducibility (they load automatically).

Request specialist review when a central method exceeds competence; do not hide uncertainty behind a generic critique.

### 6. Review reproducibility and transparency

Check, as applicable:

- Protocol, registration, amendments, and analysis-plan consistency
- Data provenance, exclusions, transformations, and accession IDs
- Software, package, model, and parameter versions
- Code, environment, seeds, run instructions, and tests
- Data, code, materials, and model availability or justified restrictions
- Domain metadata standards

Do not claim reproduction unless inputs were actually run with documented commands, environment, and outputs — inside the Board nothing is executed, so say "not reproduced".
