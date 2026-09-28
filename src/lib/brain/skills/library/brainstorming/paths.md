---
id: brainstorming/paths
title: Brainstorming — Three paths, anti-pattern, red flags
phases: scope, agenda
priority: 1
upstream: SKILL.md §Three Paths, §Anti-Pattern, §Red Flags, terminal states
---
## Three Paths

Before anything else, classify the request and say the classification out loud — "this looks bounded, so the agenda stays short" — so it can be overridden:

- **Spike** — a feasibility question ("can we...", "is it possible...", "quick and dirty is fine") whose output is an answer, not code you keep. State the question and what you'll try in 2–3 sentences, then find out as cheaply as correctness allows. No full agenda. Report findings as a recommendation; anything built stays labeled throwaway.
- **Bounded** — a well-scoped change to something that already exists: a new flag, a small endpoint, a one-file fix. Understanding the kind of app is not enough — bounded means the flow you are changing already exists to read. If there is no existing flow to change, the task is not bounded. Ask the clarifying questions that matter, present a short design (a few items), and lock it before building — a bounded task's gate is as hard as an architectural one.
- **Architectural** — new projects, new subsystems, changes that restructure how components fit together or alter interfaces others depend on. Follow the full process: questions, approaches, sectioned design, locked scope, then the writing-plans skill (agenda).

When in doubt between two paths, take the heavier one. The ratchet is one-way: hidden complexity discovered mid-task upgrades the path — stop, say so, and step up. Nothing downgrades mid-task.

## Anti-Pattern: "Too Simple To Need Approval"

Every path ends with the required design being agreed before implementation. A bounded change may need only two sentences. A new todo-list project is architectural and requires the locked scope and a real agenda. Scale the artifact to the selected path; complete that path's reviews before implementation.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This is too simple to need a design" | Follow the selected path: a bounded change gets a short design; an architectural change gets the locked scope and a full agenda. |
| "I'll call it bounded and skip the scope" | Reaching for a label to skip work IS the doubt — take the heavier path. |
| "It's bounded and the design is obvious — I'll start building now" | The gate is the lock, not the design's length. Propose, then wait for consensus. |
| "I understand this kind of app, so it's bounded" | Bounded measures the existing product, not your familiarity. A new project has no existing flow — it is architectural. |
| "The spike works, so I'll keep the code" | A spike's output is an answer. Keeping the code is a new request — classify it. |
| "It grew, but I'm almost done — no need to re-classify" | Hidden complexity upgrades the path mid-task. Stop and say so. |
| "The spike was approved, so the follow-up change is approved too" | Each task gets its own classification and its own approval. |

**Terminal states are path-bound.** Architectural: after brainstorming comes writing-plans (the agenda) — never jump straight to implementation. Bounded: after agreement, implementation proceeds directly. Spike: the terminal state is a reported recommendation.
