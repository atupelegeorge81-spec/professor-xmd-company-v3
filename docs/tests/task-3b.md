# Task 3b — CU thinking formats + judge turns 40 + T3 retest (2026-10-16)

Branch `task/3b-cu-thinking` (code `e96eb45` → main `95c3161`, Koyeb `2c37e274` HEALTHY).

## Mabadiliko
| faili | nini |
|---|---|
| `cu/oh_util.py` | `split_think` (`<think>`/`<thinking>`/`<thought>`, block isiyofungwa, `</think>` pekee mwanzoni, minimax "pengo la mistari 3"), `reasoning_of` (reasoning_content + thinking_blocks bila nakala), `is_text_toolcall` |
| `cu/oh_bridge.py` | `emit_think` → `think_start/delta/end` kutoka ActionEvent (thought + reasoning_content) na MessageEvent; text-mode tool-call inafichwa; Gemini lanes → `gemini/<model>` (litellm native); `max_iter = XMD_GOAL_MAX_ITER or max(40, steps*3)` |
| `cu/tests/test_t3b_thinking.py` | tests 12 (mifano halisi kutoka probes) |

Frontend HAIJAGUSWA — `cuThink` card ("Thought") ilikuwepo tayari.

## Ugunduzi muhimu (probe halisi E2B, template `professor-xmd-browser-v3`: openhands-sdk 1.46.0, litellm 1.100.1)
- **Gemini lanes zilikuwa zimekufa kwenye CU:** kupitia openai-compat KILA call → `400 Unknown name "prompt_cache_key"`
  (SDK huiongeza daima, `llm/options/common.py:76`). Provider `gemini/` → inafanya kazi + thoughts kwenye `reasoning_content`.
- Tool_calls zikiwepo SDK huweka content kwenye `ActionEvent.thought` (event ya kwanza tu, `i == 0`) — bridge ya zamani haikuisoma.
- litellm hubadilisha OpenRouter/Uno `reasoning` → `reasoning_content`.
- minimax-m2.7 tool mode: `<think>` bila `</think>` → `<think>mawazo\n\n\nJibu`.

## Formats kwa model (raw API + OpenHands)
| model | format | hali |
|---|---|---|
| Uno minimax-m2.7 | inline `<think>` (bila kufungwa kwenye tool mode) | ✅ E2B + live |
| Uno nemotron-3-super | reasoning_content; mara nyingine JSON tool-call kama text | ✅ live (think card) |
| Uno north-mini-code | `reasoning` → reasoning_content | ✅ E2B |
| Uno deepseek-v4-flash | reasoning_content | ✅ raw + live |
| OR nemotron-3.5-lightning / 3-super | `reasoning`/`reasoning_details` → reasoning_content | ✅ E2B |
| Gemini 3.6 / 3.5 flash (`gemini/`) | reasoning_content (+ thinking_block nakala) | ✅ E2B |
| Uno laguna-s-2.1 | reasoning key tupu | — hakuna cha kuonyesha |
| Uno kimi-k3, deepseek-v4.1-flash, codestral | 503 busy mara 3 | ⚠️ HAIJATHIBITISHWA |

## T1 — unit/baselines · PASS
```
tsc 0 · vitest 210/210 (19 files) · npm run cu:test → Ran 198 tests OK (186 + 12)
```

## T2 — E2B (bridge functions halisi + `_sdk_llm_for` halisi, Agent+terminal) · PASS
```
minimax  : think, exec terminal, think, exec finish            noleak
gemini   : think, exec terminal, think, exec finish  (gemini/gemini-3.6-flash)  noleak
north    : think, exec terminal, think, text "DONE"            noleak
OR super : think, exec terminal, think, exec finish            noleak
```

## T3 — live retest (Koyeb, session `xmdtest-final2` 0dbdc8af…) · ❌ STUCK (sababu MPYA — harness)
CU 06:49→06:51 (dakika 2.5). Events: think×3, exec×7, text×1 (ripoti safi), hakuna `<think>` kwenye text.
Lanes: kimi (rate_limited) → deepseek-v4-flash → nemotron-super → laguna → north → minimax.
Judge: `judge: complete score=1.0` (iteration 1 — cap ya 25 haipo tena).
Kazi halisi: `hello.txt` bytes 5 (`printf '%s' 'hello'`, `wc -c` = 5).
Lakini harness: `features 0/2 — step-01, qa-final: assertion bila evidence yenye artifact halisi` → `run_end stuck`
→ finalState **STUCK** (Task 3 imeripoti ukweli). → QUESTIONS.md **Q-002**.

UI live (Playwright, `docs/tests/task-3b-ui.png`): `thought cards: 3`, `raw <think> on page: False`, `<thought> on page: False`.

## Usafi
Session 0dbdc8af + plan + mini_report + report 3fc78034 zimefutwa; find.mjs recheck = 0.
