---
id: writing-plans/decomposition
title: Writing Plans — Deliverable structure, item right-sizing, step granularity
phases: agenda, report
priority: 2
upstream: SKILL.md §File Structure, §Task Right-Sizing, §Step Granularity
---
## Deliverable Structure

Before defining agenda items, map out which deliverables (scripts, designs, decisions) will be created and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each deliverable should have one clear responsibility.
- Owners reason best about work they can hold in context at once, and their output is more reliable when items are focused. Prefer smaller, focused items over large ones that do too much.
- Things that change together should be decided together. Split by responsibility, not by technical layer.
- In an existing product, follow its established patterns. Don't unilaterally restructure — but if a part has grown unwieldy, including a split in the agenda is reasonable.

This structure informs the item decomposition. Each item should produce a self-contained decision that makes sense independently.

## Item Right-Sizing

An agenda item is the smallest unit that carries its own check cycle and is worth the observers' gate. When drawing item boundaries: fold setup, configuration, scaffolding and documentation into the item whose deliverable needs them; split only where an observer could meaningfully object to one item while accepting its neighbour. Each item ends with an independently checkable deliverable.

## Step Granularity (Action Plan)

**Each step is one action with a checkable result:**
- "Write the failing check" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the check pass" — step
- "Run the checks and make sure they pass" — step
- "Lock / ship" — step
