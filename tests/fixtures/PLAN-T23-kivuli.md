# MILESTONE PLAN — M1: KIVULI storefront — design system, header, product grid (xmdtest fixture for Task 23)
Build Command: `test -f index.html`
Test Command: none
Start Command: `python3 -m http.server 4173 --bind 127.0.0.1`
Key Selectors: header, .logo, nav a, .hero h1, .card, .card img, .price, .btn

## 1. Objective & Deliverable
Milestone M1 delivers the KIVULI storefront home page: dark design system, header with logo + navigation + SW/EN language toggle, a hero, and a product grid of 6 items, each with its own product photo, name, price in TSh and an add-to-cart button.

## 4. Tech Stack & Design Tokens
Styling + Dependencies: plain CSS in index.html ; packages: none
- Background #0B0B0C, surface #141416, text #F5F5F5.
- Typography: Inter / system sans-serif ONLY (no monospace anywhere). Sentence case for headings and body; UPPERCASE allowed only for nav labels and small labels ≤ 14px.
- Accent #E11D48 reserved for the primary call-to-action buttons only (not for text, borders, header or footer backgrounds).
- Touch targets ≥ 44×44 px. Contrast WCAG AA (4.5:1 body text).

## 6. Work Steps
### Step 1 — Header: logo left, nav (Wanaume, Wanawake, Mpya), SW/EN language toggle on the right (button#lang-toggle).
### Step 2 — Hero: h1 + one paragraph + primary CTA "Nunua sasa".
### Step 3 — Product grid: 6 product cards; EVERY card uses its own photo (distinct images, not a placeholder repeated).

## 7. QA Checklist
- [ ] header has the language toggle
- [ ] distinct product photos
**Screenshots:**
- route: / · states: default · viewports: 375x667, 768x1024, 1280x800
