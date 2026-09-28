---
id: brainstorming/scope-review
title: Brainstorming — Scope self-review & reviewer checklist
phases: agenda, scope
priority: 2
upstream: SKILL.md §Spec Self-Review, spec-document-reviewer-prompt.md
---
## Scope Self-Review (before building the agenda)

Look at the locked scope with fresh eyes:

1. **Placeholder scan:** any "TBD", "TODO", incomplete parts, or vague requirements? Fix them.
2. **Internal consistency:** do any parts contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** is this focused enough for a single agenda, or does it need decomposition?
4. **Ambiguity check:** could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

## Reviewer checklist (from the spec-document reviewer)

| Category | What to look for |
|----------|------------------|
| Completeness | TODOs, placeholders, "TBD", incomplete sections |
| Consistency | Internal contradictions, conflicting requirements |
| Clarity | Requirements ambiguous enough to cause someone to build the wrong thing |
| Scope | Focused enough for a single agenda — not covering multiple independent subsystems |
| YAGNI | Unrequested features, over-engineering |

**Calibration:** only flag issues that would cause real problems during planning. A missing section, a contradiction, or a requirement so ambiguous it could be read two ways — those are issues. Minor wording, stylistic preferences and "sections less detailed than others" are not. Approve unless there are serious gaps that would lead to a flawed agenda.
