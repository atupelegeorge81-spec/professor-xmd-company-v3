---
id: scientific-critical-thinking/ref-common-biases-2
title: Critical Thinking reference — Common Biases in Scientific Research (part 2/2)
phases: objection, observer, discussion
priority: 4
when: \b(bias\w*|assum\w*|cherry|confirm\w*|anchor\w*|selection|hindsight)\b
upstream: references/common_biases.md part 2/2
---

# Common Biases in Scientific Research (part 2/2)

## Experimental and Methodological Biases

### 9. Selection Bias
**Description:** Systematic differences between those selected for study and those not selected.

**Types:**
- **Sampling bias:** Non-random sample
- **Attrition bias:** Systematic dropout
- **Volunteer bias:** Self-selected participants differ
- **Berkson's bias:** Hospital patients differ from general population
- **Survivorship bias:** Only examining "survivors"

**Detection:**
- Compare characteristics of participants vs. target population
- Analyze dropout patterns
- Consider who is missing from the sample

**Mitigation:**
- Random sampling
- Track and analyze non-responders
- Use strategies to minimize dropout
- Report participant flow diagrams

### 10. Observer Bias (Detection Bias)
**Description:** Researchers' expectations influence observations or measurements.

**Manifestations:**
- Measuring outcomes differently across groups
- Interpreting ambiguous results based on group assignment
- Unconsciously cueing participants

**Mitigation:**
- Blinding of observers/assessors
- Objective, automated measurements
- Standardized protocols
- Inter-rater reliability checks

### 11. Performance Bias
**Description:** Systematic differences in care provided to comparison groups.

**Manifestations:**
- Treating experimental group differently
- Providing additional attention to one group
- Differential adherence to protocols

**Mitigation:**
- Standardize all procedures
- Blind participants and providers
- Use placebo controls
- Monitor protocol adherence

### 12. Measurement Bias (Information Bias)
**Description:** Systematic errors in how variables are measured.

**Types:**
- **Recall bias:** Systematic differences in accuracy of recall
- **Social desirability bias:** Responding in socially acceptable ways
- **Interviewer bias:** Interviewer's characteristics affect responses
- **Instrument bias:** Measurement tools systematically err

**Mitigation:**
- Use validated, objective measures
- Standardize data collection
- Blind participants to hypotheses
- Verify self-reports with objective data

### 13. Confounding Bias
**Description:** Effect of extraneous variable mixed with the variable of interest.

**Examples:**
- Age confounding relationship between exercise and health
- Socioeconomic status confounding education and outcomes
- Indication bias in treatment studies

**Mitigation:**
- Randomization
- Matching
- Statistical adjustment
- Stratification
- Restriction

### 14. Reporting Bias
**Description:** Selective reporting of results.

**Types:**
- **Outcome reporting bias:** Selectively reporting outcomes
- **Time-lag bias:** Delayed publication of negative results
- **Language bias:** Publishing positive results in English
- **Citation bias:** Preferentially citing positive studies

**Mitigation:**
- Preregister all outcomes
- Report all planned analyses
- Distinguish primary from secondary outcomes
- Use study registries

### 15. Spectrum Bias
**Description:** Test performance varies depending on the spectrum of disease severity in the sample.

**Manifestations:**
- Diagnostic tests appearing more accurate in extreme cases
- Treatment effects differing by severity

**Mitigation:**
- Test in representative samples
- Report performance across disease spectrum
- Avoid case-control designs for diagnostic studies

### 16. Lead-Time Bias
**Description:** Apparent survival benefit due to earlier detection, not improved outcomes.

**Example:**
- Screening detecting disease earlier makes survival seem longer, even if death occurs at same age

**Mitigation:**
- Measure mortality, not just survival from diagnosis
- Use randomized screening trials
- Consider length-time and overdiagnosis bias

### 17. Length-Time Bias
**Description:** Screening disproportionately detects slower-growing, less aggressive cases.

**Example:**
- Slow-growing cancers detected more often than fast-growing ones, making screening appear beneficial

**Mitigation:**
- Randomized trials with mortality endpoints
- Consider disease natural history

### 18. Response Bias
**Description:** Systematic pattern in how participants respond.

**Types:**
- **Acquiescence bias:** Tendency to agree
- **Extreme responding:** Always choosing extreme options
- **Neutral responding:** Avoiding extreme responses
- **Demand characteristics:** Responding based on perceived expectations

**Mitigation:**
- Mix positive and negative items
- Use multiple response formats
- Blind participants to hypotheses
- Use behavioral measures

## Statistical and Analysis Biases

### 19. P-Hacking (Data Dredging)
**Description:** Manipulating data or analyses until significant results emerge.

**Manifestations:**
- Collecting data until significance reached
- Testing multiple outcomes, reporting only significant ones
- Trying multiple analysis methods
- Excluding "outliers" to reach significance
- Subgroup analyses until finding significance

**Detection:**
- Suspiciously perfect p-values (just below .05)
- Many researcher degrees of freedom
- Undisclosed analyses
- Fishing expeditions

**Mitigation:**
- Preregister analysis plans
- Report all analyses conducted
- Correct for multiple comparisons
- Distinguish exploratory from confirmatory

### 20. HARKing (Hypothesizing After Results are Known)
**Description:** Presenting post hoc hypotheses as if they were predicted a priori.

**Why problematic:**
- Inflates apparent evidence
- Conflates exploration with confirmation
- Misrepresents the scientific process

**Mitigation:**
- Preregister hypotheses
- Clearly label exploratory analyses
- Require replication of unexpected findings

### 21. Base Rate Neglect
**Description:** Ignoring prior probability when evaluating evidence.

**Example:**
- Test with 95% accuracy in rare disease (1% prevalence): positive result only 16% likely to indicate disease

**Mitigation:**
- Always consider base rates/prior probability
- Use Bayesian reasoning
- Report positive and negative predictive values

### 22. Regression to the Mean
**Description:** Extreme measurements tend to be followed by less extreme ones.

**Manifestations:**
- Treatment effects in extreme groups may be regression artifacts
- "Sophomore slump" in high performers

**Mitigation:**
- Use control groups
- Consider natural variation
- Don't select based on extreme baseline values without controls

### 23. Texas Sharpshooter Fallacy
**Description:** Selecting data after seeing patterns, like shooting arrows then drawing targets around clusters.

**Manifestations:**
- Finding patterns in random data
- Subgroup analyses selected post hoc
- Geographic clustering studies without correction

**Mitigation:**
- Prespecify hypotheses
- Correct for multiple comparisons
- Replicate findings in independent data

## Reducing Bias: Best Practices

### Study Design
1. Randomization
2. Blinding (single, double, triple)
3. Control groups
4. Adequate sample size
5. Preregistration

### Data Collection
1. Standardized protocols
2. Validated instruments
3. Objective measures when possible
4. Multiple observers/raters
5. Complete data collection

### Analysis
1. Intention-to-treat analysis
2. Prespecified analyses
3. Appropriate statistical tests
4. Multiple comparison corrections
5. Sensitivity analyses

### Reporting
1. Complete transparency
2. CONSORT, PRISMA, or similar guidelines
3. Report all outcomes
4. Distinguish exploratory from confirmatory
5. Share data and code

### Meta-Level
1. Adversarial collaboration
2. Replication studies
3. Open science practices
4. Peer review
5. Systematic reviews
