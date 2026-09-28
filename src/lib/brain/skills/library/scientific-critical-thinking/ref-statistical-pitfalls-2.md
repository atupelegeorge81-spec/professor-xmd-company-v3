---
id: scientific-critical-thinking/ref-statistical-pitfalls-2
title: Critical Thinking reference — Common Statistical Pitfalls (part 2/3)
phases: objection, observer, discussion, review, report
priority: 4
when: (\bstatistic\w*|\d+\s?%|\baverage\b|\bmean\b|\bmedian\b|\bsample\b|\brate\b|\bp-?value|\bsignifican\w*|\bconversion\b|\bmetric\w*)
upstream: references/statistical_pitfalls.md part 2/3
---

# Common Statistical Pitfalls (part 2/3)

## Regression and Modeling Pitfalls

### Pitfall 18: Overfitting
**Problem:** Model fits sample data well but doesn't generalize.

**Causes:**
- Too many predictors relative to sample size
- Fitting noise rather than signal
- No cross-validation

**Solutions:**
- Use cross-validation
- Penalized regression (LASSO, ridge)
- Independent test set
- Simpler models

### Pitfall 19: Extrapolation Beyond Data Range
**Problem:** Predicting outside the range of observed data.

**Why dangerous:**
- Relationships may not hold outside observed range
- Increased uncertainty not reflected in predictions

**Solution:** Only interpolate; avoid extrapolation.

### Pitfall 20: Ignoring Model Assumptions
**Problem:** Using statistical tests without checking assumptions.

**Common violations:**
- Non-normality (for parametric tests)
- Heteroscedasticity (unequal variances)
- Non-independence
- Linearity
- No multicollinearity

**Solutions:**
- Check assumptions with diagnostics
- Use robust methods
- Transform data
- Use appropriate non-parametric alternatives

### Pitfall 21: Treating Non-Significant Covariates as Eliminating Confounding
**Problem:** "We controlled for X and it wasn't significant, so it's not a confounder."

**Reality:** Non-significant covariates can still be important confounders. Significance ≠ confounding.

**Solution:** Include theoretically important covariates regardless of significance.

### Pitfall 22: Collinearity Masking Effects
**Problem:** When predictors are highly correlated, true effects may appear non-significant.

**Manifestations:**
- Large standard errors
- Unstable coefficients
- Sign changes when adding/removing variables

**Detection:**
- Variance Inflation Factors (VIF)
- Correlation matrices

**Solutions:**
- Remove redundant predictors
- Combine correlated variables
- Use regularization methods

## Specific Test Misuses

### Pitfall 23: T-Test for Multiple Groups
**Problem:** Conducting multiple t-tests instead of ANOVA.

**Why wrong:** Inflates Type I error rate dramatically.

**Correct approach:**
- Use ANOVA first
- Follow with planned comparisons or post-hoc tests with correction

### Pitfall 24: Pearson Correlation for Non-Linear Relationships
**Problem:** Using Pearson's r for curved relationships.

**Why misleading:** r measures linear relationships only.

**Solutions:**
- Check scatterplots first
- Use Spearman's ρ for monotonic relationships
- Consider polynomial or non-linear models

### Pitfall 25: Chi-Square with Small Expected Frequencies
**Problem:** Chi-square test with expected cell counts < 5.

**Why wrong:** Violates test assumptions, p-values inaccurate.

**Solutions:**
- Fisher's exact test
- Combine categories
- Increase sample size

### Pitfall 26: Paired vs. Independent Tests
**Problem:** Using independent samples test for paired data (or vice versa).

**Why wrong:**
- Wastes power (paired data analyzed as independent)
- Violates independence assumption (independent data analyzed as paired)

**Solution:** Match test to design.

## Confidence Interval Misinterpretations

### Pitfall 27: 95% CI = 95% Probability True Value Inside
**Misconception:** "95% chance the true value is in this interval."

**Reality:** The true value either is or isn't in this specific interval. If we repeated the study many times, 95% of resulting intervals would contain the true value.

**Better interpretation:** "We're 95% confident this interval contains the true value."

### Pitfall 28: Overlapping CIs = No Difference
**Problem:** Assuming overlapping confidence intervals mean no significant difference.

**Reality:** Overlapping CIs are less stringent than difference tests. Two CIs can overlap while the difference between groups is significant.

**Guideline:** Overlap of point estimate with other CI is more relevant than overlap of intervals.

### Pitfall 29: Ignoring CI Width
**Problem:** Focusing only on whether CI includes zero, not precision.

**Why important:** Wide CIs indicate high uncertainty. "Significant" effects with huge CIs are less convincing.

**Consider:** Both significance and precision.

## Bayesian vs. Frequentist Confusions

### Pitfall 30: Mixing Bayesian and Frequentist Interpretations
**Problem:** Making Bayesian statements from frequentist analyses.

**Examples:**
- "Probability hypothesis is true" (Bayesian) from p-value (frequentist)
- "Evidence for null" from non-significant result (frequentist can't support null)

**Solution:**
- Be clear about framework
- Use Bayesian methods for Bayesian questions
- Use Bayes factors to compare hypotheses

### Pitfall 31: Ignoring Prior Probability
**Problem:** Treating all hypotheses as equally likely initially.

**Reality:** Extraordinary claims need extraordinary evidence. Prior plausibility matters.

**Consider:**
- Plausibility given existing knowledge
- Mechanism plausibility
- Base rates

## Data Transformation Issues

### Pitfall 32: Dichotomizing Continuous Variables
**Problem:** Splitting continuous variables at arbitrary cutoffs.

**Consequences:**
- Loss of information and power
- Arbitrary distinctions
- Discarding individual differences

**Exceptions:** Clinically meaningful cutoffs with strong justification.

**Better:** Keep continuous or use multiple categories.

### Pitfall 33: Trying Multiple Transformations
**Problem:** Testing many transformations until finding significance.

**Why problematic:** Inflates Type I error, is a form of p-hacking.

**Better approach:**
- Prespecify transformations
- Use theory-driven transformations
- Correct for multiple testing if exploring

## Missing Data Problems

### Pitfall 34: Listwise Deletion by Default
**Problem:** Automatically deleting all cases with any missing data.

**Consequences:**
- Reduced power
- Potential bias if data not missing completely at random (MCAR)

**Better approaches:**
- Multiple imputation
- Maximum likelihood methods
- Analyze missingness patterns

### Pitfall 35: Ignoring Missing Data Mechanisms
**Problem:** Not considering why data are missing.

**Types:**
- MCAR (Missing Completely at Random): Safe to delete
- MAR (Missing at Random): Can impute
- MNAR (Missing Not at Random): May bias results

**Solution:** Analyze patterns, use appropriate methods, consider sensitivity analyses.

## Publication and Reporting Issues

### Pitfall 36: Selective Reporting
**Problem:** Only reporting significant results or favorable analyses.

**Consequences:**
- Literature appears more consistent than reality
- Meta-analyses biased
- Wasted research effort

**Solutions:**
- Preregistration
- Report all analyses
- Use reporting guidelines (CONSORT, PRISMA, etc.)

### Pitfall 37: Rounding to p < .05
**Problem:** Reporting exact p-values selectively (e.g., p = .049 but p < .05 for .051).

**Why problematic:** Obscures values near threshold, enables p-hacking detection evasion.

**Better:** Always report exact p-values.

### Pitfall 38: No Data Sharing
**Problem:** Not making data available for verification or reanalysis.

**Consequences:**
- Can't verify results
- Can't include in meta-analyses
- Hinders scientific progress

**Best practice:** Share data unless privacy concerns prohibit.

## Cross-Validation and Generalization

### Pitfall 39: No Cross-Validation
**Problem:** Testing model on same data used to build it.

**Consequence:** Overly optimistic performance estimates.

**Solutions:**
- Split data (train/test)
- K-fold cross-validation
- Independent validation sample

### Pitfall 40: Data Leakage
**Problem:** Information from test set leaking into training.

**Examples:**
- Normalizing before splitting
- Feature selection on full dataset
- Including temporal information

**Consequence:** Inflated performance metrics.

**Prevention:** All preprocessing decisions made using only training data.
