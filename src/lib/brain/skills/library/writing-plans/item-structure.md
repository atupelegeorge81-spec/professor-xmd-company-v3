---
id: writing-plans/item-structure
title: Writing Plans — Agenda header, item structure, what a step contains
phases: agenda
priority: 3
upstream: SKILL.md §Plan Document Header, §Task Structure, §What a Step Contains
---
## Agenda Header (think it through before listing items)

- **Goal:** one sentence describing what this Board builds.
- **Architecture:** 2–3 sentences about the approach.
- **Tech Stack:** key technologies/libraries (only what the CEO allowed).
- **Spec:** the CEO request + locked scope — the agenda argues from it; owners read both.

**Global Constraints** — the request's project-wide requirements (version floors, dependency limits, naming and copy rules, platform requirements), one line each, with exact values copied verbatim from the request. Every item's requirements implicitly include this section.

**Review Focus** — the five input classes or failure modes the request implies but no item's checks exercise that are most likely to bite a person using this software — one line each, naming the input or condition and the behaviour a reasonable person would expect, most likely first. The request is a vision document: it says what the software must do, not everything it will meet, and its silence on an input is not permission for that input to break the program. Write the list once, with the request in front of you. Then, for each line, make sure the item that owns that code carries the check that pins it.

## Item Structure

For every agenda item decide:
- **Deliverable:** what exactly is produced (e.g. `hero.html`, `splitBill()` in `bill.ts`, a locked colour palette).
- **Interfaces:** Consumes — what this item uses from earlier items (exact names/signatures). Produces — what later items rely on (exact names, parameters, return types). An owner sees only their own item; this is how they learn the names neighbouring items use.
- **Owners** (2–3 relevant agents) and whether code is required.
- **Checks:** the acceptance check with the request's exact values in it, and how it is verified.

## What a Step Contains

A step is done when the owner can produce exactly one reasonable thing from it. That is the whole requirement: unambiguous, not complete. Each kind of step carries what makes it unambiguous and nothing more:

- **A check step:** the check's name and its assertions, with the request's exact values in them.
- **A code step:** the exact signature (name, parameters, return type), the deliverable it lives in, and the specific values the request pins. The owner writes the body. A body appears only for an algorithm the signature and checks do not determine, or for exact copy the request fixes.
- **A verification step:** what to run/inspect and the output that means it passed.
- **A reference to another item:** that item's Interfaces say what to use; do not repeat that item's content.

An agenda is the set of decisions the owners cannot make alone. An agenda longer than the work it describes has done the work instead. Lines that decide nothing ("TBD", "handle edge cases", "add appropriate validation", "write tests for the above", a type or function no item defines) are the opposite failure, and the self-review catches both.
