"""cu/oh_bridge.py — R51 · Bridge ya OpenHands SDK → matukio ya Professor-XMD.

Mwenzake wa cu/bridge.py (Claude) kwa CONTRACT SAWA SAWA ya events:
  run_start → think_*/text_*/exec_*/shot/usage/files/github/deploy → finish → run_end
  (+ snapshot + paused_quota kwa quota). Engine haibadilishi kabisa kwa contract huu.

Tofauti za ndani (MPANGO-KAZI-R51):
  • MECHANISM: OpenHands SDK v1.46 native (Agent/Conversation/RouterLLM + run_goal).
  • POLICY:    cu/lanes.py — roster ya CEO (GIA1 main: gemini-flash + Uno verified ×9;
               dharura: OpenRouter/Groq; GIA3 judge: super-120b → north-mini → OR).
  • Judge:     run_goal(conversation, objective, judge_llm) — DESIGN YAO, tunaitumia.
  • Sheria ya screenshots: cu/xmd_shot.py (CLI deterministic) + shotlaw registry;
               bridge ina-poll registry na kutuma events `shot` — agent hajati events moja kwa moja.
  • AGENTS.md (cu/xmd-law.md) huandikwa workspace + kuingizwa kwenye ujumbe wa kwanza.

Keys: hazichapwi/popote — zinatoka /home/user/cu-config.json (engine ndiyo inaiweka).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time

# --- reuse kabisa ya miundombinu ya bridge.py (Emitter/files/snapshot/regex zilezile) ---
import bridge as B  # noqa: E402  (Emitter, files_tree, make_snapshot, restore_snapshot, …)
import features_verify  # noqa: E402  (R51-Awamu2: harness ndiye mamlaka ya feature states)
import lanes  # noqa: E402
import oh_router  # noqa: E402
import shotlaw  # noqa: E402
from oh_util import (_extract_steps, action_command, build_objective, first_words,
                     is_text_toolcall, obs_failed, oh_tool_kind, reasoning_of, split_think,
                     read_shot_b64, shots_pending)

BASE_TS = B.BASE_TS

XMD_LAW_HEADER = "XMD Computer — Nidhamu ya Kazi"
LAW_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xmd-law.md")


def _read_law() -> str:
    try:
        with open(LAW_PATH, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def _seed_agents_md(ws: str) -> None:
    """AGENTS.md (sheria) huwekwa workspace — jawapo toleo la agent halirudishwi juu."""
    law = _read_law()
    if not law:
        return
    try:
        p = os.path.join(ws, "AGENTS.md")
        existing = ""
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as fh:
                existing = fh.read()
        if "SHERIA ZA KAZI" not in existing:
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(law + (("\n\n" + existing) if existing else ""))
    except OSError as e:
        sys.stderr.write(f"[oh_bridge] AGENTS.md: {e}\n")


# ----------------------------------------------------------------- LLM ya SDK kwa lane
def _sdk_llm_for(lane: "lanes.Lane", usage_id: str):
    """LLM native kwa lane moja — providers zote kupitia openai-compatible base
    (Uno/OpenRouter/Groq/Gemini-openai-compat) — verified live kwa kimi/laguna."""
    from openhands.sdk import LLM
    # Task 3b (E2B probe 2026-10-16, SDK 1.46 + litellm 1.100): kupitia openai-compat Gemini
    # inakataa KILA call (400 "Unknown name prompt_cache_key" — SDK huiongeza daima). Provider
    # native "gemini/" ya litellm inaidondosha (drop_params) na inarudisha thoughts kwenye
    # reasoning_content → think card. Providers wengine: openai-compatible kama awali.
    gem = lane.provider == "gemini"
    return LLM(
        model=("gemini/" if gem else "openai/") + lane.model,
        base_url=None if gem else lane.base,
        api_key=lane.key,
        usage_id=usage_id + ":" + lane.lid[-48:],
        timeout=lane.timeout,
        num_retries=0,   # retries ni SHERIA YA LANES (policy yetu), si ya ndani ya litellm
        retry_min_wait=1, retry_max_wait=2,
    )


def _llms_dict(pool_list) -> dict:
    out = {}
    for lane in pool_list:
        out[lane.lid] = _sdk_llm_for(lane, "xmd")
    return out


# ----------------------------------------------------------------- main
async def main_async() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task-file", required=True)
    ap.add_argument("--title", default="Mradi")
    ap.add_argument("--session", default="")
    ap.add_argument("--workspace", default="/home/user/ws")
    ap.add_argument("--callback-url", default="")
    ap.add_argument("--callback-token", default="")
    ap.add_argument("--start-i", type=int, default=0)
    ap.add_argument("--done-steps", default="")
    ap.add_argument("--resume-note", default="")
    ap.add_argument("--restore-url", default="")
    ap.add_argument("--oh-config", default="/home/user/cu-config.json")
    ap.add_argument("--events-out", default="/home/user/events.jsonl")
    # zinakubaliwa kwa ajili ya mshyono na engine (hazitumiki hapa):
    ap.add_argument("--chrome", default="")
    ap.add_argument("--brain", default="")
    ap.add_argument("--brain-config", default="")
    ap.add_argument("--brain-port", type=int, default=4010)
    ap.add_argument("--python", default="")
    a = ap.parse_args()

    em = B.Emitter(a.events_out, a.callback_url, a.callback_token, a.session, a.start_i)

    os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")
    try:
        from openhands.sdk import Agent, Conversation, LLM, Tool  # noqa: F401
        from openhands.sdk.conversation.goal.runner import run_goal
        from openhands.sdk.event import ActionEvent, MessageEvent, ObservationEvent
        # KUMBUKA v1.46 (probe-ilothibitishwa): Agent inataka SPECS — Tool(name=...).
        # Import hizi zina side-effect: zinaregister majina ('terminal', 'file_editor',
        # 'task_tracker') kwenye registry — bila hizo resolve_tool inatoa KeyError.
        from openhands.tools.terminal import TerminalTool  # noqa: F401
        from openhands.tools.file_editor import FileEditorTool  # noqa: F401
        from openhands.tools.task_tracker import TaskTrackerTool  # noqa: F401
        # Tool specs (majina yaliyo-registered — live probe). BrowserToolSet HAITUMIKI:
        # screenshots ni sheria — xmd_shot.py (deterministic), si decisions za agent.
        tool_specs = [Tool(name="terminal"), Tool(name="file_editor"), Tool(name="task_tracker")]
    except ImportError as e:
        em.emit("error", message=f"openhands SDK haipo kwenye sandbox: {e}")
        em.emit("run_end", status="error", steps=0, ms=0)
        return

    os.makedirs(a.workspace, exist_ok=True)
    with open(a.task_file, "r", encoding="utf-8") as fh:
        plan_md = fh.read()

    if a.restore_url:
        try:
            info = B.restore_snapshot(a.restore_url, a.workspace)
            print(f"[oh_bridge] snapshot imerejesha ({info}) → {a.workspace}", flush=True)
        except Exception as e:
            sys.stderr.write(f"[oh_bridge] restore imekufa: {e}\n")

    try:
        pm = os.path.join(a.workspace, "plan.md")
        if not os.path.exists(pm):
            with open(pm, "w", encoding="utf-8") as fh:
                fh.write(plan_md)
    except OSError:
        pass
    _seed_agents_md(a.workspace)

    # ------------------------------------------------------------- lanes (policy)
    try:
        with open(a.oh_config, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except (OSError, ValueError) as e:
        em.emit("error", message=f"cu-config haikusomeka: {e}")
        em.emit("run_end", status="error", steps=0, ms=int((time.time() - BASE_TS) * 1000))
        return

    pools = lanes.build_pools(cfg, run_id=a.session or "oh")
    main_pool, dharura_pool, judge_pool = pools["main"], pools["dharura"], pools["judge"]
    if not main_pool.lanes:
        em.emit("error", message="hakuna lane ya main (cfg haina gemini/emergency keys)")
        em.emit("run_end", status="error", steps=0, ms=int((time.time() - BASE_TS) * 1000))
        return

    step = 0
    status = "done"
    gh_urls: set[str] = set()
    vc_urls: set[str] = set()
    emitted_shots: set[str] = set()
    last_assistant_text = ""

    def note_urls(txt: str):
        for u in B.our_github_urls(txt or "", os.environ.get("GITHUB_ORG", "professor-xmd-company"),
                                   os.environ.get("GITHUB_USERNAME", "atupelegeorge81-spec")):
            if u not in gh_urls:
                gh_urls.add(u)
                em.emit("github", url=u)
        for u in B.VERCEL_URL_RX.findall(txt or ""):
            if u not in vc_urls:
                vc_urls.add(u)
                em.emit("deploy", url=u)

    def maybe_throws_shots():
        for rec in shots_pending(a.workspace, emitted_shots):
            b64 = read_shot_b64(rec["abs"])
            if not b64:
                emitted_shots.add(rec["path"])
                continue
            emitted_shots.add(rec["path"])
            em.emit("shot", big_data=b64, id=step, path=rec["path"],
                    label=(rec.get("label") or rec.get("page") or "")[:120], size="")

    core = oh_router.LaneRouterCore(
        main_pool, dharura_pool,
        usage_cb=lambda lane, pt, ct: em.emit(
            "usage", lane=lane.lid[-80:], provider=lane.provider, account=lane.account,
            model=lane.model, prompt=pt, completion=ct, total=pt + ct, ok=True,
            waiting=False, note=""),
        event_cb=lambda note: em.emit("usage", lane="", provider="", account="", model="",
                                      prompt=0, completion=0, total=0, ok=False,
                                      waiting=True, note=first_words(note, 140)),
    )
    judge_core = oh_router.LaneRouterCore(judge_pool)
    judge_core.usage_cb = lambda lane, pt, ct: em.emit(
        "usage", lane="judge:" + lane.lid[-70:], provider=lane.provider, account=lane.account,
        model=lane.model, prompt=pt, completion=ct, total=pt + ct, ok=True,
        waiting=False, note="judge")

    main_router = oh_router.make_router(core, _llms_dict(main_pool.lanes + dharura_pool.lanes))
    judge_router = oh_router.make_router(judge_core, _llms_dict(judge_pool.lanes)) \
        if judge_pool.lanes else None

    roster_names = ", ".join(sorted({l.model for l in main_pool.lanes}))[:400]
    em.emit("run_start", task=a.title, model="xmd-computer (OpenHands · lanes)",
            size="kati", protocol="openhands",
            budget={"steps": 0, "tokens": 0}, files=B.files_tree(a.workspace)[:80],
            roster=roster_names)

    # ------------------------------------------------------------- event → UI
    cur_tools: dict[str, dict] = {}
    think_tids: set[str] = set()  # Task 3b: tool_call za `think` (hazina exec card)

    def _obs_text(ev) -> str:
        obs = getattr(ev, "observation", None)
        if obs is None:
            return ""
        parts = []
        for attr in ("text", "output", "content", "message"):
            v = getattr(obs, attr, None)
            if isinstance(v, str) and v.strip():
                parts.append(v.strip())
        return "\n".join(parts) if parts else str(obs)[:2000]

    def emit_think(text: str) -> None:
        # Task 3b: akili ya model → think card (si text ya kawaida). Formats 4 — oh_util.split_think
        t = (text or "").strip()
        if not t:
            return
        em.emit("think_start", step=step)
        em.emit("think_delta", step=step, text=t[:6000])
        em.emit("think_end", step=step, ms=0)

    def on_event(ev) -> None:
        nonlocal step, last_assistant_text
        try:
            if isinstance(ev, ActionEvent):
                # tool_calls zikiwepo SDK huweka content kwenye ev.thought (+ reasoning_content)
                th_txt = " ".join(getattr(t, "text", "") or "" for t in (getattr(ev, "thought", None) or []))
                inline, _vis = split_think(th_txt)
                emit_think("\n\n".join(x for x in (reasoning_of(ev), inline) if x))
                action = getattr(ev, "action", None)
                tid = str(getattr(ev, "tool_call_id", "") or getattr(action, "id", "") or f"t{len(cur_tools)}")
                name = getattr(ev, "tool_name", "") or type(action).__name__
                if (name or "").lower() == "think":
                    # Task 3b: tool ya ndani `think` (ThinkAction.thought) ni akili, si amri —
                    # ilionekana "Ran command thought=…" (live c2ab16bd). Observation yake inarukwa.
                    emit_think(str(getattr(action, "thought", "") or ""))
                    think_tids.add(tid)
                    return
                cmd = action_command(action) if action is not None else ""
                cat, icon = oh_tool_kind(name, action) or B.classify_tool(name, cmd)
                cur_tools[tid] = {"name": name, "t0": time.time()}
                extra = {}
                if (name or "").lower() == "file_editor":  # Task 3b: cards za faili zinataka path/preview
                    pth = getattr(action, "path", None)
                    body = getattr(action, "file_text", None) or getattr(action, "new_str", None)
                    if isinstance(pth, str) and pth:
                        extra["path"] = pth[:400]
                    if isinstance(body, str) and body:
                        extra["preview"] = body[:2000]
                em.emit("exec_start", step=step, id=tid, tool=icon, category=cat,
                        command=cmd[:400], **extra)
            elif isinstance(ev, ObservationEvent):
                txt = _obs_text(ev)
                tid = str(getattr(ev, "tool_call_id", "") or "")
                if tid and tid in think_tids:
                    think_tids.discard(tid)
                    return
                info = cur_tools.pop(tid, None) or {}
                ms = int((time.time() - info.get("t0", time.time())) * 1000)
                err = obs_failed(getattr(ev, "observation", None), txt)
                note_urls(txt)
                em.emit("exec_end", step=step, id=tid, exit=1 if err else 0, ms=ms,
                        chars=len(txt), lines=len(txt.splitlines()),
                        summary=first_words(txt, 400))
                maybe_throws_shots()
            elif isinstance(ev, MessageEvent):
                msg = getattr(ev, "llm_message", None)
                role = getattr(msg, "role", "") or getattr(ev, "role", "")
                if role != "assistant":
                    return
                step += 1
                content = getattr(msg, "content", None)
                txt = ""
                if isinstance(content, str):
                    txt = content
                elif content:
                    for p in content:
                        t = getattr(p, "text", None)
                        if isinstance(t, str):
                            txt += t
                inline, txt = split_think(txt)
                emit_think("\n\n".join(x for x in (reasoning_of(msg), inline) if x))
                # R46-dhambi: lane dhaifu wakati mwingine huandika tool-call kama JSON ya TEXT
                # (k.m. {"action":"command",...} / {"command":"echo…"}). Hiyo SI jibu la user —
                # usiiweke ripoti, na usiionyeshe kama "text" (Task 3b: is_text_toolcall).
                if txt and not is_text_toolcall(txt):
                    last_assistant_text = txt
                    note_urls(txt)
                    em.emit("text_start", step=step)
                    em.emit("text_delta", step=step, text=txt[:4000])
                    em.emit("text_end", step=step, ms=0)
                elif txt:
                    em.emit("usage", lane="", provider="", account="", model="", prompt=0,
                            completion=0, total=0, ok=False, waiting=False,
                            note="lane ilitoa tool-call kama text (imefichiwa)")
        except Exception as e:  # callbacks haziruhusiwi kuvunja run
            sys.stderr.write(f"[oh_bridge] on_event: {type(e).__name__}: {str(e)[:160]}\n")

    # ------------------------------------------------------------- agent + mkataba
    agent = Agent(llm=main_router, tools=tool_specs)

    convo_kwargs = dict(
        agent=agent,
        workspace=a.workspace,
        callbacks=[on_event],
        persistence_dir=os.path.join(a.workspace, ".xmd", "oh"),
    )
    conversation = Conversation(**convo_kwargs)

    law = _read_law()
    fl_path = os.path.join(a.workspace, "feature_list.json")
    feature_line = (
        f"FEATURE LIST: `{fl_path}` ipo — sasisha state/evidence pekee; feature = passed TU "
        "kwa ushahidi halisi (exit 0/assertion + artifact), si tamko. MWISHO WA KAZI, HARNESS "
        "ITA-RE-RUN checks zote yenyewe (default-FAIL) — madai ya uongo yataanguka hapo; weka "
        "evidence (browser/file yenye artifact HALISI disk) kwa kila assertion check.\n"
        # Task 3b/Q-002: muundo HALISI unaosomwa na features_verify._assertion_evidence —
        # bila hii agent hakujua aandike nini (live 0dbdc8af: kazi OK, harness 0/2).
        "  MUUNDO WA EVIDENCE (kwa kila feature yenye check `kind:\"assertion\"`): ongeza kwenye "
        "array `evidence` ya feature hiyo object kama "
        '`{\"kind\": \"file\", \"ref\": \"hello.txt\", \"artifact\": \"hello.txt\", \"note\": \"wc -c = 5\"}` '
        "— `kind` = \"file\" au \"browser\" (screenshot chini ya .xmd/shots/), `artifact` = path "
        "(relative kwa workspace) ya faili HALISI lisilo tupu linalothibitisha check: deliverable "
        "yenyewe AU output ya amri iliyohifadhiwa chini ya `.xmd/evidence/` (mf. "
        "`wc -c < hello.txt > .xmd/evidence/step-01.txt`) — USIWEKE faili za ushahidi ndani ya "
        "deliverable/repo. Hariri feature_list.json kwa FILE EDITOR; usibadilishe id/title/checks.\n"
        if os.path.exists(fl_path) else ""
    )
    resume_part = ("\n\nRESUME CONTEXT (hali halisi ya run iliyokatizwa):\n" + a.resume_note) if a.resume_note else ""
    first_message = (
        f'TEKELEZA MPANGO KAZI HUU ("{a.title}") hatua kwa hatua, kwa ukamilifu.\n\n'
        "SHERIA ZA KAZI (zina nguvu — zimeandikwa kwenye AGENTS.md za workspace):\n"
        "- Faili ziandikwe kwa FILE EDITOR TOOL (write/create/edit) — Terminal YA MFUMO HUU "
        "HAIKUBALI heredoc/multi-line ('Cannot execute multiple commands at once'). "
        "Amri za terminal: MOJA-MOJA au zilizounganishwa kwa && pekee.\n"
        + (law[:3500] if law else "")
        + "\n\nKumbuka: Official Data ni sheria — nakili kwa usahihi; tekeleza Verification ya kila "
        "hatua KWA HALI kabla ya kuendelea. " + feature_line
        + "Screenshots: tumia `python3 /home/user/xmd_shot.py --ws " + a.workspace + " --url <url> "
        "--label <maelezo> [--viewport 1280x800|390x844]` PEKEE.\n"
        "Mwisho wa kila kitu, andika RIPOTI KAMILI YA KISWAHILI (live link + GitHub + majaribio "
        "+ muundo + ukaguzi ✓/✗ wa kila hatua).\n"
        + resume_part
        + "\n─────────────────────────────────────────────\n\n"
        + plan_md
    )

    judge_objective = build_objective(a.title, plan_md, features=os.path.exists(fl_path))
    # Iterations za judge zinafuatana na UKUBWA WA MPANGO (si 10 daima): mikakati mirefu
    # inahitaji nafasi zaidi ya kujirekebisha; env inaweza kuvulalia (override).
    try:
        _steps_n = len(_extract_steps(plan_md))
    except Exception:
        _steps_n = 0
    max_iter = int(os.environ.get("XMD_GOAL_MAX_ITER") or max(40, _steps_n * 3))  # Task 3b: CEO — 40 (bila dari ya 25)

    try:
        conversation.send_message(first_message)
        if judge_router is not None and os.environ.get("XMD_GOAL_OFF") != "1":
            outcome = run_goal(conversation, judge_objective, judge_router,
                               max_iterations=max_iter)
            g_status = getattr(outcome, "status", "")
            verdict = getattr(outcome, "verdict", None)
            score = getattr(verdict, "score", None)
            status = "done" if str(g_status).endswith("complete") or g_status == "complete" else "stuck"
            if status != "done":
                missing = getattr(verdict, "missing", None)
                em.emit("error", message="judge: objective haijakamilika (capped) — " +
                        first_words(str(missing), 200))
            em.emit("usage", lane="judge", provider="", account="", model="run_goal",
                    prompt=0, completion=0, total=0, ok=status == "done", waiting=False,
                    note=first_words(f"judge: {g_status} score={score}", 140))
        else:
            # Njia ya DEV pekee (XMD_GOAL_OFF=1): uzalishaji hutumia run_goal (judge) iliyo juu.
            conversation.run()
            # Hapana 'state.status' hapa — sehemu yake ya ndani ni private; production inaamua
            # kwa JUDGE. Dev: done tu kama kulikuwa na jibu halisi bila mzengwe.
            status = "done" if last_assistant_text else "stuck"
            em.emit("usage", lane="", provider="", account="", model="", prompt=0, completion=0,
                    total=0, ok=status == "done", waiting=False,
                    note="dev-run (judge off)")
    except lanes.AllLanesDead as e:
        # quota-pause (kama XMD-PAUSE ya claude-mode): snapshot + resume_at
        status = "paused_quota"
        em.emit("error", message=f"lanes: {e}")
    except Exception as e:
        import traceback
        em.emit("error", message=f"{type(e).__name__}: {str(e)[:300]}")
        sys.stderr.write(traceback.format_exc())
        status = "error"

    # ------------------------------------------------------------- HARNESS GATE (Awamu 2)
    # Kabla ya "done" kutangazwa: harness ina-RE-RUN checks zote za feature_list yenyewe.
    # Agent aweza kudanganya kwenye transcript — haawezi kudanganya exit codes (default-FAIL).
    harness_note = ""
    try:
        if os.path.exists(features_verify.list_path(a.workspace)):
            verdict = features_verify.verify_all(a.workspace)
            s = features_verify.summary_line(verdict)
            em.emit("features", ok=bool(verdict and verdict.get("ok")),
                    passed=(verdict or {}).get("passed", 0), total=(verdict or {}).get("total", 0),
                    failures=(verdict or {}).get("failures", []), note=first_words(s, 200))
            if verdict and not verdict.get("ok") and status == "done":
                status = "stuck"
                harness_note = "\n\n⚠️ HARNESS (thibitisho ya uhakika): " + s
                em.emit("error", message="harness: features hazijathibitishwa — " + first_words(s, 160))
    except Exception as e:
        sys.stderr.write(f"[oh_bridge] harness gate: {type(e).__name__}: {str(e)[:160]}\n")

    # ------------------------------------------------------------- mwisho
    maybe_throws_shots()
    try:
        em.emit("files", tree=B.files_tree(a.workspace))  # contract: files event inaimbisha `tree`
    except Exception:
        pass

    pt = core.prompt_total + judge_core.prompt_total
    ct = core.completion_total + judge_core.completion_total
    em.emit("usage_total", prompt=pt, completion=ct, total=pt + ct)

    # Task 3b: engine (handleCuEvent "finish") inatambua "(hakuna ripoti)" KAMILI kama "hakuna
    # ripoti" → PARTIAL. String ndefu ya zamani ilihesabiwa ripoti → COMPLETED ya uongo.
    report = last_assistant_text or "(hakuna ripoti)"
    if harness_note:
        report += harness_note
    partial = status != "done"
    em.emit("finish", report=report[:24000], partial=partial, status=status)

    resume_at = None
    if status == "paused_quota":
        snap = B.make_snapshot(a.workspace)
        if snap:
            em.emit("snapshot", big_data=snap, path="ws-snapshot.tar.gz")
        resume_at = int(time.time() * 1000) + lanes.WAIT_HARD_CAP_S * 1000  # +cap ms

    em.emit("run_end", status=status, steps=step, ms=int((time.time() - BASE_TS) * 1000),
            github=sorted(gh_urls), deploy=sorted(vc_urls),
            **({"resume_at": resume_at} if resume_at else {}))


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
