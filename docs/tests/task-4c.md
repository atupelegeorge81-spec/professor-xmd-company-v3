# Task 4c — CU Adaptive Brain: failover ya haraka (2026-10-17)

## Chanzo cha pauses ndefu (kimethibitishwa kwenye source + vipimo)
- SDK v1.46 `LLM._make_retry_decorator` → tenacity `stop_after_attempt(num_retries)`, `reraise=True`.
  Tenacity halisi: `stop_after_attempt(0)` = call 1, `(1)` = call 1, `(2)` = calls 2.
  Kwa hiyo `num_retries=0` ya awali TAYARI ilikuwa jaribio moja upande wa SDK.
- **Chanzo halisi:** litellm 1.100.5 `openai.py`: `max_retries = inference_params.pop("max_retries", 2)`.
  SDK haipitishi `max_retries`, kwa hiyo client ya OpenAI (Uno/OpenRouter) ilijaribu tena **mara 2 kimya**
  baada ya 429/5xx/timeout/connection errors, ikiheshimu Retry-After hadi 60s.
  Gemini native (`gemini/`) haina retries za ndani (imepimwa: hit 1).
- Kipimo, SDK halisi + litellm halisi + server ya ndani (lane A inashindwa, lane B nzima):

  | Kesi | Kabla | Baada |
  |---|---|---|
  | A 429 (Retry-After 5s) | hits A=3, 10.4s | hits A=1, **0.4s** |
  | A timeout (8s) | hits A=3, 25.5s | hits A=1, **8.0s** |

  Kwa thamani za production (Retry-After ~55s, timeout 70s) "kabla" ≈ 110s / ≈ 212s kwa kosa moja.
  Run 11 ilionyesha `gemini-3.8-flash` timeout 65s × 2 mfululizo.

## Mabadiliko
1. `cu/oh_bridge.py` `_sdk_llm_for`: `SDK_RETRY_POLICY = num_retries=1` (jaribio moja), wait 0, wazi.
2. `cu/oh_router.py`:
   - `LaneRouterCore.run(attempt)`: failover ndani ya core (pure, testable).
   - Kosa → `failure(lane, exc, ms)`: cooldown/Retry-After kwa uchaguzi ujao; lane NYINGINE papo hapo.
   - Inasubiri tu ikiwa hakuna lane eligible, na ndani ya deadline.
   - Mipaka: `INFERENCE_DEADLINE_S=300` (env `XMD_INFER_DEADLINE_S`), `MAX_ATTEMPTS_PER_CALL=16`.
     Ikizidi → `InferenceDeadline` (AllLanesDead) → PAUSED_QUOTA.
   - Glue: kila call hupitisha `max_retries=0` + `timeout = min(timeout ya lane, muda uliobaki)`.
   - Logs: `attempt_start`, `attempt_failed`, `fallback_selected`, `attempt_ok`, `deadline`, zenye
     `elapsed_ms`, `attempt_ms`, `retry_count`, `kind`, `status`, `cooldown_s`.
     `redact()` huondoa keys/Bearer/tokens. Zinaenda stderr (`[xmd-llm] …` → log ya session) +
     `/home/user/llm-attempts.jsonl`.
3. `cu/lanes.py`: `ATTEMPT_TIMEOUT_S` kwa family/model kutoka latency iliyopimwa:

   | Lane | Timeout |
   |---|---|
   | Flash | 45s |
   | Lite | 30s |
   | Uno | 45s |
   | Ultra | 75s |
   | OR | 90s |
   | Lightning | 180s |

   `note_fail(ms=)` inarekodi muda wa kushindwa (`fail_ms`, meter `ms`/`cooldown_s`); 503/timeout zinaheshimu Retry-After.
4. Bridge: `_lanes_dead_of()` hufungua `ConversationRunError` ya SDK ili AllLanesDead/InferenceDeadline
   iwe PAUSED_QUOTA (awali ingeangukia ERROR).
5. Compaction: `LLMSummarizingCondenser(llm=main_router, max_size=60, keep_first=2)` (native ya SDK, env
   `XMD_CONDENSE_MAX`, 0 = off). SDK halisi: events 90 (47.8k chars) → 30 (15.5k chars); summary
   imepita kwenye router (attempt_start/attempt_ok).
6. Roster/quotas/judge/Board hazijaguswa. Hakuna Groq/XKiro/laguna/north/nemotron-super (test inathibitisha).

## Tests
- `cu/tests/test_t4c_failover.py` (18 tests):
  - Pure, saa bandia: 429, timeout, 503, connection; lane haijarudiwa ikiwa kwenye cooldown;
    deadline; timeout iliyokatwa; max_attempts; keys hazipo kwenye logs; judge validator.
  - **SDK v1.46 halisi + litellm halisi + HTTP:**
    - 429 → hit 1 na jibu < 5s;
    - timeout 2s → hit 1 na jibu < 6s;
    - condenser inakubali LaneRouter.
- `pytest cu/tests` 303 passed (285 + 18). `npm run cu:test` OK. TS haijaguswa.

## Probe ya latency (live, prompt 34–47k tokens, jaribio 1 la HTTP, 2 raundi)

| Lane | Latency |
|---|---|
| Flash | 1.7–8.7s |
| Lite | 3.1–6.4s |
| Uno minimax | 0.8–3.5s |
| Uno Ultra | 17.8–26.2s |
| OR Lightning | 93.5–164.4s |

- 3.8-flash (gemini-1): 429.
- deepseek-v4.1 (uno-2): 429 "All providers".

## Live staging run 14 — main e1811ee (deploy 8fe2e09a), `xmdtest-final14`, 05:54–06:03 UTC
- **COMPLETED_UNVERIFIED** (harness ✓), **613s**, requests 32, tokens 961k.
  Runs za awali: 914s, 1144s, 947s. Deadline haikufikiwa.
- attempt_ok (ms):

  | Router | Family | n | p50 | max |
  |---|---|---|---|---|
  | main | Flash | 14 | 5171 | 30405 |
  | main | Lite | 11 | 2906 | 15006 |
  | main | minimax | 3 | 15536 | 27813 |
  | main | Lightning | 1 | 129427 | 129427 |
  | judge | Ultra (uno-2) | 1 | 32314 | 32314 |

- Failovers live (kosa → lane nyingine):

  | Lane iliyoshindwa | Kosa | Lane mbadala |
  |---|---|---|
  | uno-1 minimax | 429, 1.06s | uno-2 minimax (inference elapsed 1.3s) |
  | uno-1 deepseek | 429 upstream | or-2 Lightning (1.4s) |
  | or-2 Lightning | timeout ya upstream, 123.8s | gemini-3 3.7-flash (gap 250ms) |
  | gemini-3 3.1-flash-lite | timeout, 30.1s | gemini-4 3.5-flash-lite (gap 1ms) |
  | uno-2 deepseek | 429 | or-1 nemotron-ultra (0.8s) |
  | or-1 nemotron-ultra | 503, 0.74s | gemini-3 3.6-flash (gap 1ms) |
  | gemini-3 3.6-flash | 503 | gemini-2 3.7-flash |
  | judge uno-1 Ultra | 429, 0.64s | uno-2 Ultra (0.9s) |

- Baada ya run: Flash timeout 35→45s (max ya mafanikio 30.4s); `detail` mwisho wa mstari wa stderr.
- Bado: Lightning (main, 1/11 ya dispatch) ilitumia ~253s kati ya 613s (129s OK + 124s timeout ya upstream).
  Ni sera ya roster — inahitaji uamuzi wa CEO.
