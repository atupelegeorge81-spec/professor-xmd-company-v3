---
id: scientific-critical-thinking
name: scientific-critical-thinking
owners: all
line: rigorous evaluation of claims and evidence — biases, fallacies, statistics, evidence quality, proportionate critique
always: objection, observer
trigger: \b(evidence|claims?|studies|study|research|data|benchmarks?|statistic\w*|percent|\d+\s?%|survey|average|sample|proven|shows that|according to|faster|slower|better than|causes?|correlat\w*|a/b|experiment\w*|hypothes\w*|assum\w*)\b
triggered: discussion, chat, review, report
upstream: https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-critical-thinking
license: MIT (K-Dense Inc.)
---
PROFESSOR-XMD edition of K-Dense "scientific-critical-thinking". Frameworks, checklists and rules are unchanged. Setting:
- "study / paper / research" = any claim or source used in the Board: search results, docs, benchmarks, surveys, A/B or usage data, adoption statistics, and a teammate's argument.
- "critique" = your observer note, your OBJECTION, or your review — structured and proportionate as below.
- "ask clarifying questions" = `CLARIFY: @Agent <question>` in the Board, or one question to Mkuu in chat.
- Reference modules (biases, fallacies, statistics, evidence hierarchy, experimental design, scientific method, core capabilities) load automatically when the topic appears; any one can be forced with `SKILL_REQUEST: scientific-critical-thinking/<module>`.
- Dropped: "Visual Aids" (needs the separate scientific-schematics skill and an image API — not available to the Board). Attribution (Kassis et al., 2026, arXiv:2609.00065) is kept in skills-upstream and in this header; Board reports do not need to cite it.
