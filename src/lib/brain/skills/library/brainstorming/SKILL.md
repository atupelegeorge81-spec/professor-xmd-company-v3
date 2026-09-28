---
id: brainstorming
name: brainstorming
owners: optimus
line: understand the CEO's real intent, classify the request and shape scope before anything is built
always: scope, agenda
trigger: \b(scope|idea|concept|feature|mvp|vision|requirement|brainstorm|product|user flow|persona|goal|approach|architecture)s?\b
triggered: discussion, chat
upstream: https://github.com/obra/superpowers/tree/main/skills/brainstorming
license: MIT (obra/superpowers)
---
PROFESSOR-XMD edition of obra/superpowers "brainstorming". The logic is unchanged; only the setting is translated:
- "your human partner" = Mkuu, the CEO. His request is the brief; he is not inside the Board while it runs.
- "approval gate" = the locked CEO scope (scope phase) + Board consensus and Ledger LOCK for every design decision. Nothing is built before its item is locked.
- "ask one question" = in chat, ask Mkuu one focused question; in the Board, state assumptions explicitly and use `CLARIFY: @Agent <question>` for a teammate.
- "written spec / design doc" = the locked scope + agenda + Ledger decisions. There is no git and no docs folder.
- "invoke writing-plans" = the agenda phase (writing-plans skill).
- The Visual Companion (a local browser server for Claude Code) is not used here — visual work is shown through the ScriptBox and the Board.
