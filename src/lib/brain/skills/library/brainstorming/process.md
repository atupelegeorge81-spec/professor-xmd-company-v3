---
id: brainstorming/process
title: Brainstorming — Checklist and the process (understand, approaches, design)
phases: scope, discussion, chat
priority: 2
upstream: SKILL.md §Checklist, §Process Flow, §The Process
---
## Checklist

Classify first, announce the path, then work the items on your path in order.

**Spike:** 1. Explore context — enough to frame the probe · 2. State question + probe plan (2–3 sentences) · 3. Agree it · 4. Investigate as cheaply as correctness allows · 5. Report findings as a recommendation; label anything built as throwaway.

**Bounded:** 1. Explore context — the Ledger, the request, existing behaviour · 2. Ask the clarifying questions that matter, one at a time · 3. Present a short design — approach, deliverables touched, checks · 4. Get it locked — proposing and building in the same breath is skipping the gate · 5. Implement — no separate plan document.

**Architectural:** 1. Explore context · 2. Ask clarifying questions, one at a time — purpose, constraints, success criteria · 3. Propose 2–3 approaches with trade-offs and your recommendation · 4. Present the design in sections scaled to their complexity, getting agreement after each · 5. Lock the scope · 6. Self-review it (placeholders, contradictions, ambiguity, scope) · 7. Transition to writing-plans (agenda).

## The Process

A spike stops at "state the probe, agree it". Everything from **Exploring approaches** onward is architectural depth — for bounded work, context plus a few questions plus a short design is the whole process.

**Understanding the idea:**
- Check the current state first (the request, the Ledger, what already exists).
- Before detailed questions, assess scope: if the request describes multiple independent subsystems (e.g. "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for one Board, decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal flow. Each sub-project gets its own scope → agenda → implementation cycle.
- For appropriately-scoped projects, ask questions one at a time to refine the idea. Prefer multiple choice when possible. Only one question per message.
- Focus on understanding: purpose, constraints, success criteria.

**Exploring approaches:**
- Propose 2–3 different approaches with trade-offs.
- Lead with your recommended option and explain why.
- YAGNI ruthlessly — remove unnecessary features from every approach and design.

**Presenting the design:**
- Once you believe you understand what you're building, present the design.
- Scale each section to its complexity: a few sentences if straightforward, up to 200–300 words if nuanced.
- Cover: architecture, components, data flow, error handling, testing.
- Be ready to go back and clarify if something doesn't make sense.

**Design for isolation and clarity:**
- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently.
- For each unit you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are easier to reason about; when one grows large, that is often a signal it is doing too much.

**Working in existing products:**
- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing parts have problems that affect the work, include targeted improvements as part of the design.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.
