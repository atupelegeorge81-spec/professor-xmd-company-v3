---
id: peer-review/ref-common-issues-2
title: Peer Review reference — Common Issues in Manuscript Review (part 2/3)
phases: observer, objection
priority: 4
upstream: references/common_issues.md part 2/3
---

# Common Issues in Manuscript Review (part 2/3)

## Statistical analysis

### Analysis–design alignment

Check whether the analysis respects:

- Outcome scale and distribution
- Pairing, clustering, repeated measures, censoring, and competing events
- Sampling design, weights, matching, stratification, or blocking
- Outcome hierarchy and prespecified estimand
- Non-inferiority or equivalence margins and analysis populations
- Longitudinal timing and informative dropout

Do not prescribe “parametric” or “non-parametric” methods from sample size alone.

### Assumptions and diagnostics

The relevant assumptions depend on the estimand and model. A standalone normality test is not a universal gatekeeper and can be uninformative in very small or large samples. Look for design-aware diagnostics, residual behavior, influential observations, functional form, calibration, proportional hazards where applicable, and sensitivity to reasonable alternatives.

Comments should identify the assumption at risk and why it matters. “Check normality” without specifying the modeled quantity or consequence is not actionable.

### Effect estimates and uncertainty

Flag:

- Thresholded interpretation of p-values
- P-values used as effect size, importance, or probability that a hypothesis is true
- “Significant” versus “not significant” used as evidence of a difference between effects
- Missing effect estimates, compatible intervals, denominators, or units
- Excessive precision or inconsistent rounding
- Confidence, credible, or prediction intervals described incorrectly
- Clinical or practical importance conflated with statistical compatibility

Prefer estimates, uncertainty, assumptions, and context. The ASA p-value principles and SAMPL reporting guidance are indexed in `assets/source_ledger.csv`.

### Multiplicity and analysis flexibility

Assess:

- Number and hierarchy of outcomes, time points, subgroups, contrasts, and models
- Interim looks, adaptive changes, or repeated data inspection
- Family or false-discovery control when required by the inferential aim
- Transparent labeling of confirmatory and exploratory analyses
- Consistency with protocol, registration, and statistical analysis plan
- Complete reporting rather than selective presentation of favorable analyses

Not every collection of analyses requires the same correction. Ask authors to state the inferential family and rationale instead of automatically demanding Bonferroni adjustment.

### Missing data and intercurrent events

Check:

- Amount and reasons by group and time
- Distinction between intercurrent events and missing observations when relevant
- Assumptions behind complete-case, imputation, weighting, likelihood, or other methods
- Inclusion of variables and uncertainty in multiple imputation
- Sensitivity analyses to plausible departures from assumptions
- Alignment between the target quantity, data collection, and missing-data strategy

Do not require a test that data are “missing completely at random”; missingness assumptions are not generally established by a single diagnostic test.

### Outliers, transformations, and limits

Check whether exclusions, transformations, winsorization, detection-limit handling, and influential-observation rules were prespecified or transparently justified. Request sensitivity analyses when conclusions depend materially on discretionary handling. Do not demand deletion merely because a value is extreme.

### Subgroups and heterogeneity

Look for prespecification, adequate interaction analysis, multiplicity, uncertainty, biological or clinical rationale, and consistency of direction. Within-group significance and between-group non-significance do not establish subgroup differences.

### Prediction and machine learning

Check:

- Clear target population, outcome, prediction time, and intended use
- Separation of training, tuning, and evaluation without leakage
- Representative evaluation data and transportability
- Handling of missing values and preprocessing within resampling folds
- Calibration as well as discrimination when relevant
- Uncertainty around performance and decision consequences
- Overfitting, optimism correction, and external evaluation
- Model and preprocessing availability, versioning, and human oversight
- Fairness analyses tied to intended use, not demographic metrics without context

TRIPOD+AI applies to regression and machine-learning prediction models; STARD-AI applies when diagnostic accuracy is the primary evaluation target.

## Reproducibility and transparency

Check whether another qualified researcher could understand and, where permissions allow, repeat the work:

- Protocol, registration, amendments, and analysis plan
- Data provenance, processing stages, exclusions, and versioned identifiers
- Reagents, materials, instruments, software, package versions, parameters, and seeds
- Code, environment or lock file, run order, and computational resources
- Data, code, model, and material availability statements
- Repository accession numbers and persistent identifiers
- Clear, justified restrictions for privacy, consent, security, licensing, or community governance

“Available on request” is not automatically invalid, and open release is not always ethical or lawful. Evaluate whether the access route is specific, feasible, and consistent with governance.

Do not claim to have reproduced an analysis unless it was actually run with documented inputs, environment, commands, and outputs.

## Figures, tables, and images

Assess the supplied artifact directly; do not infer manipulation from low-resolution rendering alone.

Check:

- Axes, units, denominators, scales, legends, and uncertainty definitions
- Individual data or distribution display when summary graphics conceal relevant structure
- Accessibility and redundant encoding beyond color alone
- Consistency among text, tables, figures, and supplements
- Sample sizes and exclusions for each panel or analysis
- Image acquisition, processing, normalization, scale bars, and representative-image selection
- Disclosed splicing or adjustments and availability of source images when policy requires
- Avoidance of deceptive truncation, area/volume encoding, or dual-axis implication

Possible duplication or manipulation should be documented neutrally by location and referred to the editor under the journal’s image-integrity process. Do not accuse authors of fabrication.

## Ethics, welfare, privacy, and integrity

Check what is applicable:

- Ethics committee or institutional review and identifiers
- Consent, assent, waiver, or lawful basis
- Trial registration and prospective protocol availability
- Animal welfare, humane endpoints, and relevant ARRIVE items
- Privacy, identifiability, community governance, and controlled access
- Funding, sponsor role, author conflicts, and contributor roles
- Dual-use, biosafety, environmental, or security considerations
- Prior publication, overlapping reports, and transparent secondary analyses

If a concern cannot safely be raised with authors, use the confidential editor channel. State the evidence and uncertainty; do not investigate people, contact institutions, or reveal the manuscript outside the authorized process.

## Citations and references

Check:

- Every consequential literature claim has an appropriate source
- The cited source supports the stated proposition
- Primary sources are used for methods, data, and policies when available
- Retracted or corrected work is handled appropriately
- Contradictory and relevant evidence is represented fairly
- Self-citation requests are necessary, specific, and not coercive
- Citation identifiers and reference entries are internally consistent

The local `scripts/audit_citations.py` checks Pandoc-style keys such as `[@ref-id]` against a CSV. It does not verify source existence or support and must not be described as doing so.
