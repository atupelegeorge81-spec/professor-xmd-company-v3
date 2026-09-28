---
id: verification-before-completion
name: verification-before-completion
owners: cybertron
line: evidence before claims — no APPROVE, "done", "fixed" or "passing" without fresh verification evidence
always: review
trigger: \b(done|complete\w*|pass\w*|verif\w*|works?|working|fixed|ready|ship\w*|approve\w*|finished|success\w*|tested|acceptance)\b
triggered: observer, fix, discussion, chat, code, objection
upstream: https://github.com/obra/superpowers/tree/main/skills/verification-before-completion
license: MIT (obra/superpowers)
---
PROFESSOR-XMD edition of obra/superpowers "verification-before-completion". Every rule is unchanged. Setting:
- "run the verification command" = produce the strongest evidence available in the Board: the STATIC PROBE facts the system attaches to your review, a full line-by-line read of the CURRENT ScriptBox version (not the previous one), and tracing each acceptance check of the agenda item against that code. There is no shell here — so you must say which evidence you used, and anything you could not verify is stated as NOT VERIFIED.
- "VCS diff" = the v1→v2 patch of the deliverable.
- "commit / push / PR" = APPROVE, Ledger LOCK, or telling the Board/Mkuu that something is done.
- "agent reports success" = a teammate saying "fixed" or "done" in the discussion.
