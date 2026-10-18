# MILESTONE PLAN — M1 (fixture for Task 20 — DOM metrics)
Build Command: `test -f evil.html`
Test Command: none
Start Command: `python3 -m http.server 4173 --bind 127.0.0.1`
Key Selectors: #faint, #mono, .does-not-exist

## 7. QA Checklist
- [ ] metrics written
**Screenshots:**
- route: /evil.html · states: default · viewports: 375x667, 1280x800
- route: /good.html · states: default · viewports: 375x667, 1280x800
- route: /big.html · states: default · viewports: 375x667
