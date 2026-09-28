---
id: peer-review/ref-statistical-reproducibility-1
title: Peer Review reference — Statistical, Methods, and Reproducibility Review (part 1/2)
phases: observer, objection, review
priority: 4
when: (\bstatistic\w*|\bbenchmark\w*|\bmetric\w*|\d+\s?%|\bsample\b|\bexperiment\w*|\ba/b\b|\breproduc\w*|\bmodel\b|\bprediction\b|\bmachine learning\b|\bml\b)
upstream: references/statistical_reproducibility.md part 1/2
---

# Statistical, Methods, and Reproducibility Review (part 1/2)

This guide supports structured questions; it does not replace a statistician, methodologist, domain expert, or independent reanalysis. Sources verified on **2026-07-23** are recorded in `assets/source_ledger.csv`.

## Evidence hierarchy for the review

Use, in order:

1. The stated research question and target population
2. Protocol, registration, analysis plan, and amendments
3. Reported design and data-generating process
4. Methods, code, tables, figures, supplements, and repository records
5. Applicable primary method or regulatory guidance
6. Current reporting guidance
7. Target venue policy

Do not reject a method merely because another method is more familiar. Explain the estimand, assumption, error, or interpretation at stake.

## Core review sequence

### 1. Define what is being estimated

Write down:

- Unit of inference
- Population
- Intervention, exposure, test, or predictors
- Comparator or reference condition
- Outcome and time horizon
- Target effect, association, accuracy, or predictive performance
- Intercurrent events, censoring, and missing observations where relevant

Then trace whether design, data collection, analysis, result, and claim target the same quantity.

For applicable clinical trials, ICH E9(R1) provides a framework for estimands and sensitivity analyses. It is not a universal rule for every study.

### 2. Reconstruct the design

Identify:

- Prospective, retrospective, cross-sectional, longitudinal, experimental, or observational structure
- Recruitment or sampling frame
- Experimental/observational unit
- Pairing, nesting, clustering, repeated measures, sites, batches, and time
- Allocation, concealment, blinding, matching, or weighting
- Primary and secondary outcomes
- Prespecified versus exploratory analyses

If the design cannot be reconstructed, first request missing reporting. Do not label the design invalid solely because details are absent.

### 3. Trace every denominator

Reconcile:

- Eligible, enrolled, assigned, treated/exposed, followed, measured, and analyzed units
- Outcome-specific denominators
- Exclusions before and after allocation or measurement
- Missing values and reasons
- Complete-case, imputed, weighted, or model-based analysis populations
- Figure, table, abstract, text, and supplement totals

Report the exact mismatch and locations; do not infer why counts differ.

### 4. Assess analysis–design alignment

Ask whether the method accounts for:

- Outcome scale and distribution
- Pairing and repeated measures
- Clustering and multilevel structure
- Unequal follow-up, censoring, or competing events
- Sampling weights or matched designs
- Baseline adjustment and prespecified covariates
- Multiplicity and outcome hierarchy
- Model tuning and validation
- Missingness assumptions

The name of a statistical test is not enough. The report should state inputs, model form, uncertainty method, software/version, and relevant diagnostics.

### 5. Assess estimates and interpretation

Prefer:

- Effect or performance estimates with units
- Compatible uncertainty intervals
- Absolute as well as relative quantities when decision-relevant
- Exact denominators and analysis sets
- Assumption and sensitivity context
- Clinical, biological, policy, or practical relevance distinct from statistical compatibility

The ASA’s six p-value principles include:

- A p-value is about incompatibility with a specified model, not the probability a hypothesis is true.
- Threshold crossing alone should not determine scientific conclusions.
- Transparent reporting of all relevant analyses is required.
- Statistical significance does not measure effect size or importance.
- A p-value alone is not a good measure of evidence.

SAMPL provides concise biomedical statistical reporting guidance. Apply it as reporting guidance, not a universal analysis recipe.
