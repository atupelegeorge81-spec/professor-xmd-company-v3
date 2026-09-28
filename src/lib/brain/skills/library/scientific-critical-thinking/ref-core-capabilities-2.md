---
id: scientific-critical-thinking/ref-core-capabilities-2
title: Critical Thinking reference — Core Capabilities (part 2/3)
phases: objection, observer
priority: 5
when: \b(methodolog\w*|critique|claim evaluation|strength of inference|research design)\b
upstream: references/core_capabilities.md part 2/3
---

# Core Capabilities (part 2/3)

### 4. Evidence Quality Assessment

Evaluate the strength and quality of evidence systematically.

**Apply when:**
- Weighing evidence for decisions
- Conducting literature reviews
- Comparing conflicting findings
- Determining confidence in conclusions

**Evidence evaluation framework:**

1. **Study Design Hierarchy**
   - Systematic reviews/meta-analyses (highest for intervention effects)
   - Randomized controlled trials
   - Cohort studies
   - Case-control studies
   - Cross-sectional studies
   - Case series/reports
   - Expert opinion (lowest)

   **Important:** Higher-level designs aren't always better quality. A well-designed observational study can be stronger than a poorly-conducted RCT.

2. **Quality Within Design Type**
   - Risk of bias assessment (use appropriate tool: Cochrane RoB 2 for RCTs, ROBINS-I for non-randomized studies, Newcastle-Ottawa, etc.)
   - Methodological rigor
   - Transparency and reporting completeness
   - Conflicts of interest

3. **GRADE Considerations (if applicable)**
   - Start with design type (RCT = high, observational = low)
   - **Downgrade for:**
     - Risk of bias
     - Inconsistency across studies
     - Indirectness (wrong population/intervention/outcome)
     - Imprecision (wide confidence intervals, small samples)
     - Publication bias
   - **Upgrade for:**
     - Large effect sizes
     - Dose-response relationships
     - Confounders would reduce (not increase) effect

4. **Convergence of Evidence**
   - **Stronger when:**
     - Multiple independent replications
     - Different research groups and settings
     - Different methodologies converge on same conclusion
     - Mechanistic and empirical evidence align
   - **Weaker when:**
     - Single study or research group
     - Contradictory findings in literature
     - Publication bias evident
     - No replication attempts

5. **Contextual Factors**
   - Biological/theoretical plausibility
   - Consistency with established knowledge
   - Temporality (cause precedes effect)
   - Specificity of relationship
   - Strength of association

**Reference:** See `references/evidence_hierarchy.md` for detailed hierarchy, GRADE system, and quality assessment tools.

### 5. Logical Fallacy Identification

Detect and name logical errors in scientific arguments and claims.

**Apply when:**
- Evaluating scientific claims
- Reviewing discussion/conclusion sections
- Assessing popular science communication
- Identifying flawed reasoning

**Common fallacies in science:**

1. **Causation Fallacies**
   - **Post hoc ergo propter hoc:** "B followed A, so A caused B"
   - **Correlation = causation:** Confusing association with causality
   - **Reverse causation:** Mistaking cause for effect
   - **Single cause fallacy:** Attributing complex outcomes to one factor

2. **Generalization Fallacies**
   - **Hasty generalization:** Broad conclusions from small samples
   - **Anecdotal fallacy:** Personal stories as proof
   - **Cherry-picking:** Selecting only supporting evidence
   - **Ecological fallacy:** Group patterns applied to individuals

3. **Authority and Source Fallacies**
   - **Appeal to authority:** "Expert said it, so it's true" (without evidence)
   - **Ad hominem:** Attacking person, not argument
   - **Genetic fallacy:** Judging by origin, not merits
   - **Appeal to nature:** "Natural = good/safe"

4. **Statistical Fallacies**
   - **Base rate neglect:** Ignoring prior probability
   - **Texas sharpshooter:** Finding patterns in random data
   - **Multiple comparisons:** Not correcting for multiple tests
   - **Prosecutor's fallacy:** Confusing P(E|H) with P(H|E)

5. **Structural Fallacies**
   - **False dichotomy:** "Either A or B" when more options exist
   - **Moving goalposts:** Changing evidence standards after they're met
   - **Begging the question:** Circular reasoning
   - **Straw man:** Misrepresenting arguments to attack them

6. **Science-Specific Fallacies**
   - **Galileo gambit:** "They laughed at Galileo, so my fringe idea is correct"
   - **Argument from ignorance:** "Not proven false, so true"
   - **Nirvana fallacy:** Rejecting imperfect solutions
   - **Unfalsifiability:** Making untestable claims

**When identifying fallacies:**
- Name the specific fallacy
- Explain why the reasoning is flawed
- Identify what evidence would be needed for valid inference
- Note that fallacious reasoning doesn't prove the conclusion false—just that this argument doesn't support it

**Reference:** See `references/logical_fallacies.md` for comprehensive fallacy catalog with examples and detection strategies.

### 6. Research Design Guidance

Provide constructive guidance for planning rigorous studies.

**Apply when:**
- Helping design new experiments
- Planning research projects
- Reviewing research proposals
- Improving study protocols

**Design process:**

1. **Research Question Refinement**
   - Ensure question is specific, answerable, and falsifiable
   - Verify it addresses a gap or contradiction in literature
   - Confirm feasibility (resources, ethics, time)
   - Define variables operationally

2. **Design Selection**
   - Match design to question (causal → experimental; associational → observational)
   - Consider feasibility and ethical constraints
   - Choose between-subjects, within-subjects, or mixed designs
   - Plan factorial designs if testing multiple factors

3. **Bias Minimization Strategy**
   - Implement randomization when possible
   - Plan blinding at all feasible levels (participants, providers, assessors)
   - Identify and plan to control confounds (randomization, matching, stratification, statistical adjustment)
   - Standardize all procedures
   - Plan to minimize attrition

4. **Sample Planning**
   - Conduct a priori power analysis (specify expected effect, desired power, alpha)
   - Account for attrition in sample size
   - Define clear inclusion/exclusion criteria
   - Consider recruitment strategy and feasibility
   - Plan for sample representativeness

5. **Measurement Strategy**
   - Select validated, reliable instruments
   - Use objective measures when possible
   - Plan multiple measures of key constructs (triangulation)
   - Ensure measures are sensitive to expected changes
   - Establish inter-rater reliability procedures

6. **Analysis Planning**
   - Prespecify all hypotheses and analyses
   - Designate primary outcome clearly
   - Plan statistical tests with assumption checks
   - Specify how missing data will be handled
   - Plan to report effect sizes and confidence intervals
   - Consider multiple comparison corrections

7. **Transparency and Rigor**
   - Preregister study and analysis plan
   - Use reporting guidelines (CONSORT, STROBE, PRISMA)
   - Plan to report all outcomes, not just significant ones
   - Distinguish confirmatory from exploratory analyses
   - Commit to data/code sharing

**Reference:** See `references/experimental_design.md` for comprehensive design checklist covering all stages from question to dissemination.
