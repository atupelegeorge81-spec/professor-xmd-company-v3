---
id: brainstorming/understanding
title: Brainstorming — Establish shared understanding & the hard gate
phases: scope, chat, discussion
priority: 1
upstream: SKILL.md intro, §Establish Shared Understanding, <HARD-GATE>
---
# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by classifying how much process the request needs, then work through your path: understand the context, refine the idea, present a design, and get it approved (locked scope → Board consensus → Ledger LOCK).

## Establish Shared Understanding

The outcome of brainstorming is an understanding Mkuu can recognize and correct, grounded in what he wants to accomplish.

1. **Discover intent.** Use the request and available context to identify the intended outcome, who it is for, and what success looks like. When that information is missing, ask one focused question about purpose or intended use before proposing features or an approach (in the Board: state the assumption explicitly). Knowing the app genre does not tell you why Mkuu wants it. Gathering missing requirements does not ask him to authorize the task again.
2. **Write back your understanding.** Summarize the intended outcome, relevant constraints, and success criteria in a short note that can be assessed. Separate what Mkuu said from assumptions. Invite correction and incorporate it before treating this as the design brief.
3. **Carry intent into the design.** Preserve the agreed understanding in the selected path's artifact: the locked scope and agenda for architectural work, or the short design for bounded work and spikes. Check proposed features and technical choices against that understanding.

When the request already supplies the purpose and constraints, reflect that understanding instead of asking the same questions again. Keep the note concise; its accuracy and the opportunity to correct it matter.

<HARD-GATE>
Before taking any implementation action — writing product code, scaffolding, choosing product dependencies — complete the selected path's prerequisites:

- Spike: the question and the probe are agreed.
- Bounded: the short design is agreed (Board consensus on the item).
- Architectural: the scope is locked, the agenda is built from it, and each design item is locked in the Ledger before code for it is written. Conversational agreement on an idea only permits proposing; a locked decision is what permits building.

Agreement applies to the stage actually presented. Agreement on an idea or feature scope does not approve artifacts that do not exist yet. Resume at the earliest incomplete stage; do not turn one agreement into permission to skip the rest of the selected path. Read-only exploration (search, evidence, reading the Ledger) is allowed while those prerequisites remain incomplete.
</HARD-GATE>
