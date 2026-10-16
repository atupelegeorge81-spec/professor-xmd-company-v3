## Q-001: T3 (real smoke) haipiti — judge wa OpenHands anafikia kikomo kabla ya kazi kuisha
- Task: maelezo3
- I was doing: T3 — kazi halisi ndogo ya Computer (`xmdtest-final`: repo ya kutupwa yenye hello.txt) kwenye Koyeb live, ili ifike `COMPLETED_UNVERIFIED`.
- I found: run 1 na Resume zote ziliishia `run_end status:"stuck"` — `judge: objective haijakamilika (capped) — Missing verified output of git push (Step 5)…`.
  Hatua 1–4 zilifanywa na kuthibitishwa (git init, hello.txt bytes 5, commit). Chanzo: `cu/oh_bridge.py:343`
  `max_iter = int(os.environ.get("XMD_GOAL_MAX_ITER") or min(25, max(6, _steps_n)))` → mpango wa hatua 5 = iterations 6 tu.
  Code ya Task 3 ilifanya kazi sahihi (STUCK iliripotiwa kama STUCK; ushahidi `docs/tests/task-3.md`).
- Options:
  A) Weka env `XMD_GOAL_MAX_ITER=25` kwenye Koyeb (hakuna mabadiliko ya code; redeploy ya env) kisha rudia T3 + post-deploy smoke.
  B) Rudia T3 kwa brief isiyo na push (faili tu ndani ya workspace) — hatua chache, huenda ikatosha iterations 6.
  C) Kubali T3 kama ilivyo (STUCK halisi imethibitisha njia isiyo-ok; COMPLETED_UNVERIFIED imethibitishwa kwa T2 kwenye endpoint halisi) na tuendelee na Task 4.
- My recommendation: A — inalingana na msimamo wa CEO (utulivu kuliko kubana tokens/muda); kikomo cha 6 kinaweza kuua kazi halisi ndogo pia. Kisha T3 + smoke zirudiwe.


## Q-002: T3 (retest 3b) — judge anasema "complete", harness inasema 0/2 → STUCK
**Ukweli (live 0dbdc8af):** kazi ilikamilika (`hello.txt` bytes 5), judge `complete score=1.0`, lakini
`features_verify` ilikataa: `step-01, qa-final: assertion bila evidence yenye artifact halisi`.
Sababu: Verification ya plan (`wc -c < hello.txt`) si "command salama" (`features.ts:87` — `wc` haipo + `<`)
→ inakuwa `assertion`, ambayo inahitaji agent aandike evidence `{kind:"file",artifact:…}` kwenye feature_list.json.
Agent hakuandika; judge (run_goal) haangalii feature_list. T3 imeshindwa mara 3 (2× judge cap, 1× hii) → STOP.
**Chaguo:**
- A) Harness ifanye kazi yenyewe: verification yenye amri ya shell (k.m. `wc`, `test`, `cat`, `grep`) iendeshwe kama
  `command` kupitia `bash -c` ndani ya workspace (sandbox ni ya kutupwa) — assertion zibaki kwa mambo ya UI tu.
- B) Judge objective iongeze: "feature_list.json lazima iwe na evidence kwa kila assertion" ili judge asiseme complete mapema.
- C) Zote mbili (A + B). Pendekezo: **C**.
