---
id: peer-review/ref-statistical-reproducibility-2
title: Peer Review reference — Statistical, Methods, and Reproducibility Review (part 2/2)
phases: observer, objection, review
priority: 4
when: (\bstatistic\w*|\bbenchmark\w*|\bmetric\w*|\d+\s?%|\bsample\b|\bexperiment\w*|\ba/b\b|\breproduc\w*|\bmodel\b|\bprediction\b|\bmachine learning\b|\bml\b)
upstream: references/statistical_reproducibility.md part 2/2
---

# Statistical, Methods, and Reproducibility Review (part 2/2)

## Topic-specific checks

### Sample size and precision

Look for:

- Prospective calculation or precision rationale
- Target effect or interval width
- Variance, event rate, prevalence, or accuracy assumptions
- Type I error, power, sidedness, and multiplicity when applicable
- Design effect, clustering, attrition, noncompliance, and missingness
- Model complexity and effective sample size
- Simulation details for complex designs

Do not request observed/post hoc power as a remedy for an imprecise result. Examine the estimate and uncertainty.

### Randomized trials

Check:

- Allocation sequence and concealment
- Prespecified estimand and analysis population
- Protocol/registry/outcome consistency
- Baseline adjustment and stratification factors
- Intercurrent events, adherence, treatment switching, and missing data
- Harms and unintended effects
- Sensitivity and supplementary analyses
- Non-inferiority/equivalence margin and interpretation if relevant

Use CONSORT 2025 and SPIRIT 2025 for reporting. Use ICH E9/E9(R1) only when its scope and decision context fit.

### Observational causal analyses

Check:

- Causal question and target contrast
- Time zero, eligibility, treatment/exposure assignment, follow-up, and outcome timing
- Confounder rationale and measurement timing
- Positivity/overlap
- Exchangeability and consistency assumptions
- Missingness, censoring, selection, and measurement error
- Model specification and balance diagnostics
- Sensitivity to unmeasured confounding or alternative specifications

Avoid judging causal identification from adjusted versus unadjusted p-values.

### Diagnostic accuracy

Check:

- Intended use, setting, and participant spectrum
- Index test and reference standard
- Threshold prespecification
- Blinding and timing
- Indeterminate/missing results
- Verification and incorporation bias
- Two-by-two denominators and uncertainty
- External applicability

STARD/STARD-AI describe reporting; use an appropriate risk-of-bias framework separately.

### Prediction models

Check:

- Intended use, prediction time, outcome, and target population
- Data source and participant flow
- Predictor availability at intended use
- Missing-data and preprocessing leakage
- Sample size relative to outcome information and complexity
- Internal validation and optimism correction
- Independent evaluation and dataset shift
- Calibration, discrimination, decision utility, and uncertainty
- Hyperparameter tuning separated from evaluation
- Reproducible model specification and preprocessing
- Subgroup performance tied to plausible use and harms

TRIPOD+AI replaces TRIPOD 2015 for regression and machine-learning prediction model reporting. STARD-AI is more appropriate when diagnostic accuracy of an index test is the primary aim.

### Systematic reviews and meta-analyses

Check:

- Protocol and registration
- Eligibility criteria and information sources
- Reproducible search dates and strategies
- Duplicate screening/extraction processes or justified alternatives
- Risk-of-bias assessment
- Effect measure and synthesis model
- Heterogeneity and prediction intervals when appropriate
- Dependence among estimates
- Small-study and reporting biases
- Certainty assessment, if claimed
- Transparent deviations and unavailable data

PRISMA 2020 assesses reporting. Do not substitute PRISMA coverage for review-conduct appraisal.

### Clustered and longitudinal data

Check:

- Level of assignment, measurement, and inference
- Within-cluster/subject correlation
- Number and distribution of clusters
- Small-cluster corrections where needed
- Time structure, nonlinear change, and irregular measurement
- Informative visit, dropout, or censoring processes
- Cluster-level versus individual-level covariates

Repeated observations do not increase independent sample size one-for-one.

### Multiplicity

Identify the inferential family before recommending adjustment:

- Multiple primary outcomes
- Multiple intervention arms or contrasts
- Repeated time points
- Subgroups and interactions
- Interim analyses
- High-dimensional features
- Model selection

Possible responses include hierarchical testing, family-wise control, false-discovery control, multilevel modeling, transparent exploratory labeling, or emphasis on estimates and uncertainty. The remedy depends on the claim and decision rule.

### Missing data

Check:

- Missingness by group, variable, outcome, and time
- Reasons and relation to intercurrent events
- Information used by imputation or weighting
- Number of imputations and pooling when applicable
- Compatibility of imputation and analysis models
- Uncertainty propagation
- Sensitivity to plausible departures from assumptions

Avoid demanding one preferred technique without considering the estimand and missingness process.

## Reproducibility review

### Materials and provenance

Check:

- Stable identifiers for datasets, samples, models, protocols, and materials
- Raw-to-processed provenance
- Exclusion and transformation records
- Versioned analysis inputs and outputs
- Repository accession numbers
- Data dictionary, units, and coding
- Domain metadata standard where applicable

Legacy domain standards and their current status are summarized in `references/reporting_standards.md`.

### Code and computational environment

Check:

- Executable code for central analyses when sharing is permitted
- Dependency versions or lock/environment file
- Operating-system or hardware requirements that affect results
- Random seeds and nondeterminism
- Parameter, configuration, and model checkpoints
- Run order and instructions
- Tests or validation of custom code
- License and access restrictions

Code availability does not prove that the code generated the reported result. Provenance and a reproducible run record are separate evidence.

### Data and access

Open sharing may be limited by consent, privacy, indigenous/community governance, security, contracts, or licensing. A useful statement should identify:

- What exists
- Where it is held
- Who can request access
- Criteria and process
- Expected timeline
- Restrictions and rationale
- Whether code or synthetic/aggregate alternatives are available

Do not request disclosure that would violate ethics, law, consent, or governance.

### Independent reproduction

Claim independent reproduction only if the reviewer actually:

1. Obtained authorized inputs.
2. Recorded versions and environment.
3. Ran documented commands.
4. Preserved content hashes or equivalent provenance.
5. Compared prespecified outputs.
6. Recorded deviations and failures.

A static consistency audit is not reproduction.

## When to request specialist review

Escalate when a central conclusion depends on methods outside competence, including:

- Complex adaptive, Bayesian, causal, survival, multilevel, spatial, or longitudinal methods
- High-dimensional omics or multiple-testing procedures
- Diagnostic, prediction, or AI evaluation
- Survey weighting or complex sampling
- Economic modeling
- Meta-analysis with dependent effects or network structure
- Unfamiliar qualitative or mixed-methods methodology
- Image forensics, biosecurity, privacy, or domain-specific ethics

Say what expertise is needed and which claim depends on it. Do not mask uncertainty with an automated score.

## Using the local checklist

Copy `assets/statistical_reproducibility_template.json`, record evidence locations without pasting manuscript prose into report fields, and run:

```bash
python3 scripts/audit_statistics_reproducibility.py local-checklist.json
```

Statuses:

- `verified_present`
- `partly_documented`
- `missing`
- `not_assessed`
- `not_applicable` with rationale

The tool reports item IDs and counts. It does not calculate merit, rerun analyses, or certify reproducibility.
