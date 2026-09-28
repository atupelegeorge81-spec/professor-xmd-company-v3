---
id: peer-review/ref-common-issues-1
title: Peer Review reference — Common Issues in Manuscript Review (part 1/3)
phases: observer, objection
priority: 4
upstream: references/common_issues.md part 1/3
---

# Common Issues in Manuscript Review (part 1/3)

Use this reference as a prompt for inquiry, not a defect checklist. A possible issue becomes a review comment only when it is relevant to the study and supported by a manuscript location, supplied artifact, or applicable method principle.

Do not infer misconduct, poor quality, or manuscript merit from a missing reporting item. Separate:

- **Not reported:** the manuscript does not provide enough information to assess the point.
- **Potential design or analysis problem:** the reported method may not answer the stated question.
- **Demonstrated inconsistency:** two supplied artifacts or manuscript locations conflict.
- **Integrity concern:** credible evidence should be described neutrally and routed through the journal process, normally in confidential editor notes.

## Claim–evidence alignment

Check each central claim against the design, analysis, result, and uncertainty that support it.

Common mismatches:

- Causal wording from an observational or otherwise non-identifying design
- Mechanistic conclusions supported only by association or prediction
- Conclusions based on a secondary, exploratory, or post hoc outcome without labeling
- Directionally correct claims that overstate magnitude or precision
- Population, setting, intervention, comparator, outcome, or time-horizon extrapolation
- “No effect,” “equivalent,” or “safe” conclusions from imprecise or non-significant results
- Abstract or conclusion claims that omit material harms, uncertainty, subgroup caveats, or null findings
- Novelty claims that are broader than the search or cited literature supports

Constructive response:

1. Identify the claim and its location.
2. Identify the relevant result or missing evidence.
3. Explain the alignment problem.
4. Request a bounded remedy: narrow wording, add uncertainty, clarify exploratory status, provide the prespecified analysis, or justify the inference.

Use `scripts/validate_claim_evidence.py` for a local identifier-based matrix. Its report never echoes claim text.

## Study question, design, and units

### Question–design mismatch

Check whether the population, intervention or exposure, comparator, outcomes, timing, and target quantity align from objectives through interpretation. For trials, identify the estimand when relevant. For prediction, distinguish model development from performance evaluation. For diagnostic studies, distinguish diagnostic accuracy from clinical utility.

### Experimental or observational unit

Potential issues include:

- Technical replicates treated as independent biological units
- Multiple cells, images, lesions, eyes, visits, or samples per subject analyzed as independent
- Cluster assignment analyzed at the individual level without accounting for clustering
- Paired or repeated observations analyzed as unpaired
- Site, operator, batch, family, spatial, or temporal dependence ignored

Request a clear definition of the unit, nesting, repeated measures, and analysis that reflects dependence. Do not assume a mixed model is always the correct remedy; the model must match the design and question.

### Selection, allocation, and masking

Assess, as applicable:

- Sampling frame, recruitment, eligibility, and exclusions
- Sequence generation and allocation concealment
- Prospective stopping rules
- Blinding or masking of participants, personnel, outcome assessors, and analysts
- Consequences and mitigation when masking is infeasible
- Baseline measurement timing and post-allocation exclusions

Avoid treating baseline significance tests as proof of successful randomization. Focus on chance imbalance, clinically important imbalance, prespecified adjustment, and departures from the randomized comparison.

### Confounding and causal identification

For causal claims, ask:

- What target causal contrast is intended?
- Which assumptions connect the design and analysis to that contrast?
- Were confounders selected using subject-matter reasoning rather than outcome-driven screening?
- Could adjustment introduce collider or mediator bias?
- Are time-varying treatment, censoring, immortal time, or informative observation processes relevant?
- Are negative controls, sensitivity analyses, or alternative explanations appropriate?

Do not demand a specific causal method without showing why it fits the data-generating process.

## Sample size, precision, and replication

Avoid fixed heuristics such as “n < 30 is too small” or “three replicates are sufficient.” Adequacy depends on the target effect or precision, variability, design effect, event count, model complexity, multiplicity, attrition, and decision context.

Check:

- Prospective rationale for sample size or precision
- Inputs, assumptions, software or method, and allowance for attrition or clustering
- Whether the primary outcome and analysis match the calculation
- Event and outcome information relative to model complexity
- Effective sample size after dependence, missingness, weighting, or splitting
- Independent biological replication and validation where the claim requires it
- Precision of estimates, not only nominal power

Observed or post hoc power calculated from the observed effect generally adds little beyond the estimate and its interval. Request effect estimates and uncertainty rather than “achieved power.”
