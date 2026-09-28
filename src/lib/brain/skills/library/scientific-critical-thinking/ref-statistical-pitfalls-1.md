---
id: scientific-critical-thinking/ref-statistical-pitfalls-1
title: Critical Thinking reference — Common Statistical Pitfalls (part 1/3)
phases: objection, observer, discussion, review, report
priority: 4
when: (\bstatistic\w*|\d+\s?%|\baverage\b|\bmean\b|\bmedian\b|\bsample\b|\brate\b|\bp-?value|\bsignifican\w*|\bconversion\b|\bmetric\w*)
upstream: references/statistical_pitfalls.md part 1/3
---

# Common Statistical Pitfalls (part 1/3)

## P-Value Misinterpretations

### Pitfall 1: P-Value = Probability Hypothesis is True
**Misconception:** p = .05 means 5% chance the null hypothesis is true.

**Reality:** P-value is the probability of observing data this extreme (or more) *if* the null hypothesis is true. It says nothing about the probability the hypothesis is true.

**Correct interpretation:** "If there were truly no effect, we would observe data this extreme only 5% of the time."

### Pitfall 2: Non-Significant = No Effect
**Misconception:** p > .05 proves there's no effect.

**Reality:** Absence of evidence ≠ evidence of absence. Non-significant results may indicate:
- Insufficient statistical power
- True effect too small to detect
- High variability
- Small sample size

**Better approach:**
- Report confidence intervals
- Conduct power analysis
- Consider equivalence testing

### Pitfall 3: Significant = Important
**Misconception:** Statistical significance means practical importance.

**Reality:** With large samples, trivial effects become "significant." A statistically significant 0.1 IQ point difference is meaningless in practice.

**Better approach:**
- Report effect sizes
- Consider practical significance
- Use confidence intervals

### Pitfall 4: P = .049 vs. P = .051
**Misconception:** These are meaningfully different because one crosses the .05 threshold.

**Reality:** These represent nearly identical evidence. The .05 threshold is arbitrary.

**Better approach:**
- Treat p-values as continuous measures of evidence
- Report exact p-values
- Consider context and prior evidence

### Pitfall 5: One-Tailed Tests Without Justification
**Misconception:** One-tailed tests are free extra power.

**Reality:** One-tailed tests assume effects can only go one direction, which is rarely true. They're often used to artificially boost significance.

**When appropriate:** Only when effects in one direction are theoretically impossible or equivalent to null.

## Multiple Comparisons Problems

### Pitfall 6: Multiple Testing Without Correction
**Problem:** Testing 20 hypotheses at p < .05 gives ~65% chance of at least one false positive.

**Examples:**
- Testing many outcomes
- Testing many subgroups
- Conducting multiple interim analyses
- Testing at multiple time points

**Solutions:**
- Bonferroni correction (divide α by number of tests)
- False Discovery Rate (FDR) control
- Prespecify primary outcome
- Treat exploratory analyses as hypothesis-generating

### Pitfall 7: Subgroup Analysis Fishing
**Problem:** Testing many subgroups until finding significance.

**Why problematic:**
- Inflates false positive rate
- Often reported without disclosure
- "Interaction was significant in women" may be random

**Solutions:**
- Prespecify subgroups
- Use interaction tests, not separate tests
- Require replication
- Correct for multiple comparisons

### Pitfall 8: Outcome Switching
**Problem:** Analyzing many outcomes, reporting only significant ones.

**Detection signs:**
- Secondary outcomes emphasized
- Incomplete outcome reporting
- Discrepancy between registration and publication

**Solutions:**
- Preregister all outcomes
- Report all planned outcomes
- Distinguish primary from secondary

## Sample Size and Power Issues

### Pitfall 9: Underpowered Studies
**Problem:** Small samples have low probability of detecting true effects.

**Consequences:**
- High false negative rate
- Significant results more likely to be false positives
- Overestimated effect sizes (when significant)

**Solutions:**
- Conduct a priori power analysis
- Aim for 80-90% power
- Consider effect size from prior research

### Pitfall 10: Post-Hoc Power Analysis
**Problem:** Calculating power after seeing results is circular and uninformative.

**Why useless:**
- Non-significant results always have low "post-hoc power"
- It recapitulates the p-value without new information

**Better approach:**
- Calculate confidence intervals
- Plan replication with adequate sample
- Conduct prospective power analysis for future studies

### Pitfall 11: Small Sample Fallacy
**Problem:** Trusting results from very small samples.

**Issues:**
- High sampling variability
- Outliers have large influence
- Assumptions of tests violated
- Confidence intervals very wide

**Guidelines:**
- Be skeptical of n < 30
- Check assumptions carefully
- Consider non-parametric tests
- Replicate findings

## Effect Size Misunderstandings

### Pitfall 12: Ignoring Effect Size
**Problem:** Focusing only on significance, not magnitude.

**Why problematic:**
- Significance ≠ importance
- Can't compare across studies
- Doesn't inform practical decisions

**Solutions:**
- Always report effect sizes
- Use standardized measures (Cohen's d, r, η²)
- Interpret using field conventions
- Consider minimum clinically important difference

### Pitfall 13: Misinterpreting Standardized Effect Sizes
**Problem:** Treating Cohen's d = 0.5 as "medium" without context.

**Reality:**
- Field-specific norms vary
- Some fields have larger typical effects
- Real-world importance depends on context

**Better approach:**
- Compare to effects in same domain
- Consider practical implications
- Look at raw effect sizes too

### Pitfall 14: Confusing Explained Variance with Importance
**Problem:** "Only explains 5% of variance" = unimportant.

**Reality:**
- Height explains ~5% of variation in NBA player salary but is crucial
- Complex phenomena have many small contributors
- Predictive accuracy ≠ causal importance

**Consideration:** Context matters more than percentage alone.

## Correlation and Causation

### Pitfall 15: Correlation Implies Causation
**Problem:** Inferring causation from correlation.

**Alternative explanations:**
- Reverse causation (B causes A, not A causes B)
- Confounding (C causes both A and B)
- Coincidence
- Selection bias

**Criteria for causation:**
- Temporal precedence
- Covariation
- No plausible alternatives
- Ideally: experimental manipulation

### Pitfall 16: Ecological Fallacy
**Problem:** Inferring individual-level relationships from group-level data.

**Example:** Countries with more chocolate consumption have more Nobel laureates doesn't mean eating chocolate makes you win Nobels.

**Why problematic:** Group-level correlations may not hold at individual level.

### Pitfall 17: Simpson's Paradox
**Problem:** Trend appears in groups but reverses when combined (or vice versa).

**Example:** Treatment appears worse overall but better in every subgroup.

**Cause:** Confounding variable distributed differently across groups.

**Solution:** Consider confounders and look at appropriate level of analysis.
