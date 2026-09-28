---
id: writing-plans/self-review
title: Writing Plans — Self-review & handoff
phases: agenda
priority: 2
upstream: SKILL.md §Self-Review, §Execution Handoff
---
## Self-Review

After writing the complete agenda (or Action Plan), look at the CEO request with fresh eyes and check the agenda against it. This is a checklist you run yourself.

**1. Request coverage:** skim each requirement in the request. Can you point to an item that implements it? List any gaps.

**2. Step scan:** every item must let the owners produce exactly one reasonable thing, and no item may carry more than that: a line that decides nothing is a gap, content the signature and checks already determine is a transcript. Fix both.

**3. Name consistency:** do the names, signatures and property names used in later items match what earlier items define? A function called `clearLayers()` in item 3 but `clearFullLayers()` in item 7 is a bug.

**4. Review Focus:** for each input class or failure mode the request implies, is there an item whose checks exercise it? The uncovered ones most likely to bite a person must be owned by some item. An empty list means you checked and found none, not that you skipped the check.

**5. Proportion:** compare the agenda's length to the request's. An agenda several times longer than the request it implements is a transcript of the program, not a plan.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a requirement with no item, add the item.

## Handoff

In PROFESSOR-XMD the execution method is fixed: the agenda goes straight to the Board Room — owners discuss and propose, consensus locks each item in the Ledger, observers check it, and Optimus writes the mini-report. Do not ask the CEO to pick an execution method. If the request itself is ambiguous, ask ONE precise clarifying question instead of guessing.
