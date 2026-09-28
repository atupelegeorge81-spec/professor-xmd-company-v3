---
id: scientific-critical-thinking/ref-experimental-design-2
title: Critical Thinking reference — Experimental Design Checklist (part 2/3)
phases: discussion, objection, observer
priority: 4
when: \b(experiment\w*|a/b|ab test|control group|randomi\w*|pilot|trial|measure\w*)\b
upstream: references/experimental_design.md part 2/3
---

# Experimental Design Checklist (part 2/3)

## Measurement

### Validity
- [ ] **Face validity:** Appears to measure construct
- [ ] **Content validity:** Covers all aspects of construct
- [ ] **Criterion validity:** Correlates with gold standard
  - Concurrent validity
  - Predictive validity
- [ ] **Construct validity:** Measures theoretical construct
  - Convergent validity (correlates with related measures)
  - Discriminant validity (doesn't correlate with unrelated measures)

### Reliability
- [ ] **Test-retest:** Consistent over time
- [ ] **Internal consistency:** Items measure same construct (Cronbach's α)
- [ ] **Inter-rater reliability:** Agreement between raters (Cohen's κ, ICC)
- [ ] **Parallel forms:** Alternative versions consistent

### Measurement Considerations
- [ ] Objective measures preferred when possible
- [ ] Validated instruments used when available
- [ ] Multiple measures of key constructs
- [ ] Sensitivity to change considered
- [ ] Floor/ceiling effects avoided
- [ ] Response formats appropriate
- [ ] Recall periods appropriate
- [ ] Cultural appropriateness considered

## Bias Minimization

### Selection Bias
- [ ] Random sampling when possible
- [ ] Clearly defined eligibility criteria
- [ ] Document who declines and why
- [ ] Minimize self-selection

### Performance Bias
- [ ] Standardized protocols
- [ ] Blinding of providers
- [ ] Monitor protocol adherence
- [ ] Document deviations

### Detection Bias
- [ ] Blinding of outcome assessors
- [ ] Objective measures when possible
- [ ] Standardized assessment procedures
- [ ] Multiple raters with reliability checks

### Attrition Bias
- [ ] Strategies to minimize dropout
- [ ] Track reasons for dropout
- [ ] Compare dropouts to completers
- [ ] Intention-to-treat analysis planned

### Reporting Bias
- [ ] Preregister study and analysis plan
- [ ] Designate primary vs. secondary outcomes
- [ ] Commit to reporting all outcomes
- [ ] Distinguish planned from exploratory analyses

## Data Management

### Data Collection
- [ ] Data collection forms designed and tested
- [ ] REDCap, Qualtrics, or similar platforms
- [ ] Range checks and validation rules
- [ ] Regular backups
- [ ] Secure storage (HIPAA/GDPR compliant if needed)

### Data Quality
- [ ] Real-time data validation
- [ ] Regular quality checks
- [ ] Missing data patterns monitored
- [ ] Outliers identified and investigated
- [ ] Protocol deviations documented

### Data Security
- [ ] De-identification procedures
- [ ] Access controls
- [ ] Audit trails
- [ ] Compliance with regulations (IRB, HIPAA, GDPR)

## Statistical Analysis Planning

### Analysis Plan (Prespecify Before Data Collection)
- [ ] **Primary analysis:**
  - Statistical test(s) specified
  - Hypothesis clearly stated
  - Significance level set (usually α = .05)
  - One-tailed or two-tailed
- [ ] **Secondary analyses:**
  - Clearly designated as secondary
  - Exploratory analyses labeled as such
- [ ] **Multiple comparisons:**
  - Adjustment method specified (if needed)
  - Primary outcome protects from inflation

### Assumptions
- [ ] Assumptions of statistical tests identified
- [ ] Plan to check assumptions
- [ ] Backup non-parametric alternatives
- [ ] Transformation options considered

### Missing Data
- [ ] Anticipated amount of missingness
- [ ] Missing data mechanism (MCAR, MAR, MNAR)
- [ ] Handling strategy:
  - Complete case analysis
  - Multiple imputation
  - Maximum likelihood
- [ ] Sensitivity analyses planned

### Effect Sizes
- [ ] Appropriate effect size measures identified
- [ ] Will be reported alongside p-values
- [ ] Confidence intervals planned

### Statistical Software
- [ ] Software selected (R, SPSS, Stata, Python, etc.)
- [ ] Version documented
- [ ] Analysis scripts prepared in advance
- [ ] Will be made available (Open Science)

## Ethical Considerations

### Ethical Approval
- [ ] IRB/Ethics committee approval obtained
- [ ] Study registered (ClinicalTrials.gov, etc.) if applicable
- [ ] Protocol follows Declaration of Helsinki or equivalent

### Informed Consent
- [ ] Voluntary participation
- [ ] Comprehensible explanation
- [ ] Risks and benefits disclosed
- [ ] Right to withdraw without penalty
- [ ] Privacy protections explained
- [ ] Compensation disclosed

### Risk-Benefit Analysis
- [ ] Potential benefits outweigh risks
- [ ] Risks minimized
- [ ] Vulnerable populations protected
- [ ] Data safety monitoring (if high risk)

### Confidentiality
- [ ] Data de-identified
- [ ] Secure storage
- [ ] Limited access
- [ ] Reporting doesn't allow re-identification

## Validity Threats

### Internal Validity (Causation)
- [ ] **History:** External events between measurements
- [ ] **Maturation:** Changes in participants over time
- [ ] **Testing:** Effects of repeated measurement
- [ ] **Instrumentation:** Changes in measurement over time
- [ ] **Regression to mean:** Extreme scores becoming less extreme
- [ ] **Selection:** Groups differ at baseline
- [ ] **Attrition:** Differential dropout
- [ ] **Diffusion:** Control group receives treatment elements

### External Validity (Generalizability)
- [ ] Sample representative of population
- [ ] Setting realistic/natural
- [ ] Treatment typical of real-world implementation
- [ ] Outcome measures ecologically valid
- [ ] Time frame appropriate

### Construct Validity (Measurement)
- [ ] Measures actually tap intended constructs
- [ ] Operations match theoretical definitions
- [ ] No confounding of constructs
- [ ] Adequate coverage of construct

### Statistical Conclusion Validity
- [ ] Adequate statistical power
- [ ] Assumptions met
- [ ] Appropriate tests used
- [ ] Alpha level appropriate
- [ ] Multiple comparisons addressed

## Reporting and Transparency

### Preregistration
- [ ] Study preregistered (OSF, ClinicalTrials.gov, AsPredicted)
- [ ] Hypotheses stated a priori
- [ ] Analysis plan documented
- [ ] Distinguishes confirmatory from exploratory

### Reporting Guidelines
- [ ] **RCTs:** CONSORT 2010 checklist (with applicable extensions)
- [ ] **Observational studies:** STROBE checklist
- [ ] **Systematic reviews:** PRISMA 2020 checklist
- [ ] **Diagnostic studies:** STARD checklist
- [ ] **Qualitative research:** COREQ checklist
- [ ] **Case reports:** CARE guidelines

### Transparency
- [ ] All measures reported
- [ ] All manipulations disclosed
- [ ] Sample size determination explained
- [ ] Exclusion criteria and numbers reported
- [ ] Attrition documented
- [ ] Deviations from protocol noted
- [ ] Conflicts of interest disclosed

### Open Science
- [ ] Data sharing planned (when ethical)
- [ ] Analysis code shared
- [ ] Materials available
- [ ] Preprint posted
- [ ] Open access publication when possible

## Post-Study Considerations

### Data Analysis
- [ ] Follow preregistered plan
- [ ] Clearly label deviations and exploratory analyses
- [ ] Check assumptions
- [ ] Report all outcomes
- [ ] Report effect sizes and CIs, not just p-values

### Interpretation
- [ ] Conclusions supported by data
- [ ] Limitations acknowledged
- [ ] Alternative explanations considered
- [ ] Generalizability discussed
- [ ] Clinical/practical significance addressed

### Dissemination
- [ ] Publish regardless of results (reduce publication bias)
- [ ] Present at conferences
- [ ] Share findings with participants (when appropriate)
- [ ] Communicate to relevant stakeholders
- [ ] Plain language summaries

### Next Steps
- [ ] Replication needed?
- [ ] Follow-up studies identified
- [ ] Mechanism studies planned
- [ ] Clinical applications considered
