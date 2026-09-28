---
id: systematic-debugging
name: systematic-debugging
owners: megatron, cybertron
line: find the root cause before proposing any fix — four phases, iron law, 3-fix architecture stop
always: fix
trigger: \b(bug|error|fail\w*|crash\w*|debug\w*|broken|regression|exception|incorrect|wrong result|edge case|rounding|flaky|timeout|race|null|undefined|NaN|leak|slow|performance)s?\b
triggered: discussion, chat, review, observer, objection, code
upstream: https://github.com/obra/superpowers/tree/main/skills/systematic-debugging
license: MIT (obra/superpowers)
---
PROFESSOR-XMD edition of obra/superpowers "systematic-debugging". The four phases, the iron law and every rule are unchanged. Setting:
- "recent commits / git diff" = the previous ScriptBox version (the v1→v2 patch shown to you) and recent Ledger changes.
- "run the test" = Cybertron's QA script and the review verdict (APPROVE/REJECT + notes). There is no shell here: reason from the code, the reviewer's notes and the STATIC PROBE facts.
- "discuss with your human partner" = raise it in the Board (objection / CLARIFY) — Mkuu is the CEO.
- "3+ fixes failed" maps directly to the review → fix loop: after the 3rd rejected fix, question the architecture instead of patching again.
