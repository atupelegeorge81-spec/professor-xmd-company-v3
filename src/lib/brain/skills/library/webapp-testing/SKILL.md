---
id: webapp-testing
name: webapp-testing
owners: cybertron
line: reconnaissance-then-action testing of web UIs — selectors from the real DOM, Playwright QA scripts
always: review
trigger: \b(test\w*|qa|e2e|playwright|selenium|cypress|selector|dom|click|form|browser|ui|page|button|input|accessib\w*|a11y)s?\b
triggered: code, fix, discussion, chat
upstream: https://github.com/anthropics/skills/tree/main/skills/webapp-testing
license: Apache-2.0 (see skills-upstream/webapp-testing/LICENSE.txt)
---
PROFESSOR-XMD edition of Anthropic "webapp-testing". Logic unchanged. Setting:
- Inside the Board there is no browser and no shell. The reconnaissance step for static HTML is done FOR you: the system runs the ported `element_discovery` / static-HTML inspection on the deliverable and attaches the result to your review as "STATIC PROBE" facts (buttons, links, inputs, forms, images without alt, headings, missing test selectors). Use those facts as your inspected DOM.
- The Playwright scripts you write are QA deliverables in the ScriptBox — Mkuu runs them. Write them exactly by these rules.
- `scripts/with_server.py` is kept in skills-upstream as a reference for the server-lifecycle pattern; inside the Board you never call it.
