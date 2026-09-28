---
id: writing-plans
name: writing-plans
owners: optimus
line: turn a locked CEO scope into small, owned, verifiable agenda items and a precise Action Plan
always: agenda, report
trigger: \b(plan|roadmap|milestone|timeline|phase|action|rollout|deliver\w*|schedule|sprint|decompos\w*|breakdown)s?\b
triggered: discussion, chat
upstream: https://github.com/obra/superpowers/tree/main/skills/writing-plans
license: MIT (obra/superpowers)
---
PROFESSOR-XMD edition of obra/superpowers "writing-plans". The logic is unchanged; only the tools are translated:
- "spec" = the CEO request + locked scope (and, later, the locked Ledger decisions).
- "plan" = the Board agenda you create (agenda phase) and the Action Plan section of the final report.
- "task" = one agenda item (or one Action Plan step). "engineer / implementer" = the owners of that item.
- "files" = deliverables (scripts written in the ScriptBox). "tests" = acceptance checks and Cybertron's QA scripts.
- "commit" = the item is LOCKED in the Ledger. "fresh reviewer" = the observers + Cybertron's review.
- There is no git, no docs folder and no subagents here — the Board Room is the execution method.
