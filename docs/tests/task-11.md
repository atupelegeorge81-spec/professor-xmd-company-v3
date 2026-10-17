# TASK 11 (maelezo11) — Operation Context Block (OCB) builder · ushahidi (2026-10-17)

Branch `task/11-ocb`. Pure code, HAIJAUNGANISHWA kwenye prompts (wiring: tasks 14–26).

## Faili
| Faili | Nini |
|---|---|
| src/lib/milestone/ocb.ts (mpya) | `buildOCB(input)`, `buildOCBForComputer(input)`, `withOCB(prompt, ocb)` (idempotent: OCB ya zamani inabadilishwa, hairudiwi), `consumerOf(input)` (jedwali la code la NEXT + "YOUR OUTPUT IS READ BY" kwa stage × self), `OCB_STAGES`, `OCB_MAX_TOKENS = 1200`. |
| src/lib/milestone/__tests__/ocb.test.ts (mpya) | Tests 51, pamoja na snapshots 45 (`__snapshots__/ocb.test.ts.snap`). |

- Timu ni halisi: majina na majukumu yanatoka `src/lib/agents.ts` (FLOW-MAP A). Roster ya ramani (`optimus`, `ultron`, …) inaunganishwa na agent kwa jina.
- Template ya maelezo11 inafuatwa mstari kwa mstari, na `YOU ARE HERE` inaongeza `agenda n: title` inapohusika.
  `buildOCBForComputer` inaongeza mistari 5: kukaguliwa na Designer + Frontend Engineer + checks, Receipt kwa kila CO,
  haiwezi kumaliza bila Build Report + checks, order iliyorudiwa = jaribio la awali halikutosha, "do not grade yourself — the harness measures".
- **Length guard** (`estimateTokens` ya broker): > 1,200 → STATE inafupishwa kwanza (orodha → hesabu → fupi kabisa), kisha
  summary (300/160/80), kisha title. PIPELINE na YOU ARE HERE haziondolewi kamwe. Summary ≤600 na title ≤120 kila mara.
  Ukubwa wa kawaida: tokens ~530 (Computer ~693).

## T1 — snapshots (`CI=1 npx vitest run src/lib/milestone`)
Stages 9 (MAP … FINAL_REPORT) × roles 5 (Optimus, Designer, Frontend, Backend, Computer) = **45 snapshots**. Kila moja pia
inakagua mistari yote ya template, `Milestone Mk: … milestone k of 3`, `round x/10`, mistari 5 ya Computer, na ≤1,200 tokens.
Ziada: msomaji (PLAN·pm → XMD Computer; FINAL_REPORT·pm → the CEO; VERIFY → harness + Optimus); round 10 → INHERITED;
length guard (900 milestones done + summary ndefu + consumer ndefu → ≤1,200, STATE fupi, PIPELINE/YOU ARE HERE zipo); withOCB.
Mfano (snapshot `PLAN · pm`, mistari ya katikati):
```
YOU ARE HERE: PLAN (step 3: milestone plan) | Milestone M1: Foundation and design (agendas 1–3), milestone 1 of 3
PARTICIPANTS IN THIS MILESTONE: Optimus (Project Manager), Ultron (UI/UX Designer), Vextron (Frontend Engineer) · review mode: visual.
NEXT: XMD Computer builds M1 from this plan and writes a build report; then the harness collects evidence. YOUR OUTPUT IS READ BY: XMD Computer — it executes the plan literally and cannot ask questions — every requirement must be explicit.
STATE: locked decisions 3; milestones done none; open defects 0; waivers 0.
```
`Tests 127 passed (127)` (milestone yote; ocb 51), na snapshots zinathibitishwa chini ya `CI=1`. **PASS**.

## T2 — kutoka hali halisi ya DB (session `xmdtest-ocb SafariBook` 81fdc1d4)
`xmdtest/ocb.mjs setup` iliunda doc yenye chips 4 `🔒 LOCKED:` + 1 `🟠 OPEN:`, ramani ya milestones 3 (store ya Task 10),
M1 iliyopitia transitions hadi SIGNED_OFF, na M2 hadi VERIFYING round 3. `ocb.mjs show` (process mpya) ilisoma DB na kujenga:
```
=== OPERATION CONTEXT (read this first) ===
PROJECT: xmdtest-ocb SafariBook. CEO request in brief: Booking site for Tanzanian safari operators: search tours, book, pay with M-Pesa (xmdtest).
OUR TEAM: Optimus (lead: agenda, milestone map, plans, final report) · Ultron (UI/UX Designer) · Vextron (Frontend Engineer) · Megatron (Backend & DB Engineer) · Cybertron (QA & DevOps Engineer).
XMD COMPUTER: autonomous engineer in a sandbox: … It follows instructions literally and cannot ask questions.
PIPELINE: 1 agendas + milestone map -> 2 per milestone: … -> 9 final report for the CEO; last milestone ends with push + deploy.
YOU ARE HERE: REVIEW_VERIFY (step 7: reviewers verify fixes) | Milestone M2: Booking flow (agendas 4–7), milestone 2 of 3 | round 3/10
PARTICIPANTS IN THIS MILESTONE: Optimus (Project Manager), Ultron (UI/UX Designer), Vextron (Frontend Engineer), Megatron (Backend & DB Engineer) · review mode: mixed.
NEXT: if every defect is verified fixed: sign-off of M2, then next milestone M3: Quality and deploy; otherwise another fix round (4/10). YOUR OUTPUT IS READ BY: the harness and Optimus — your verdict per defect decides sign-off or another round.
STATE: locked decisions 4; milestones done M1; open defects 2; waivers 0.
RULES: the ledger is authoritative; …
=== END ===
```
Locked 4 inatoka kwenye chips; `M1` done na `round 3/10` zinatoka kwenye states za DB. Open defects = 2 ni thamani ya
majaribio, kwa sababu bado hakuna defect store (task 23+). **PASS**.

## T3 — LLM halisi (Gemini Flash kupitia broker: `brokerComplete({cls:"heavy", allow:["gemini"]})`)
Swali: "Where are we now, what happens after your answer, and who reads it? Answer in 3 short sentences."
```
--- DISCUSS · designer · lane Gemini 1 · gemini-3.8-flash (tier flash) · 5031ms · PASS {"milestone":true,"next":true,"consumer":true}
We are currently in step 2 (agenda discussion) of Milestone M1, addressing agenda 2 regarding colour palette and typography.  After my answer, the agreed decision will be locked into the ledger and summarized in a mini-report so Optimus can prepare the M1 milestone plan.  My output is read by Optimus, Vextron, and the rest of the board to establish the authoritative design specifications for XMD Computer.
--- PLAN · pm · lane Gemini 2 · gemini-3.8-flash (tier flash) · 3689ms · PASS {"milestone":true,"next":true,"consumer":true}
We are at Step 3 (Milestone Plan) of Milestone M1: Foundation and design. Next, XMD Computer builds M1 according to this plan, writes a build report, and the harness collects evidence. My output is read directly by XMD Computer, which executes the instructions literally.
--- REVIEW_VERIFY · frontend · lane Gemini 3 · gemini-3.8-flash (tier flash) · 16084ms · PASS {"milestone":true,"next":true,"consumer":true}
We are in the REVIEW_VERIFY phase of Milestone 2 (Booking flow), verifying fixes during round 3 of 10.  If all defects are verified as fixed, we sign off on M2 and advance to Milestone 3; otherwise, another fix round will be triggered.  My response is read by the harness and Optimus to determine whether we can proceed to sign-off.
RESULT 3/3
```
Keyword assertions: milestone (`M1|Foundation` / `M2|Booking`), hatua inayofuata (`ledger|mini-report` / `build` /
`sign-off|fix round|M3`), msomaji (`Optimus|team` / `Computer` / `harness|Optimus`). **PASS 3/3**.

## Flag off / baselines
- Hakuna faili la app linalo-import `ocb.ts` / `withOCB` / `buildOCB` (grep = 0), kwa hiyo hakuna prompt iliyobadilika.
- tsc 0 → 0 · vitest 369 + 2 skipped → **420** + 2 skipped (+51) · pytest 308 · unittest 238 OK · eslint 0.
- Usafi: doc 81fdc1d4 imefutwa.
