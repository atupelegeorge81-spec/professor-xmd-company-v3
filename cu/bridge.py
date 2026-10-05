"""cu/bridge.py — Bridge ya "XMD Computer" (Awamu B ya R31): Claude Agent SDK → matukio ya Professor-XMD.

Inaendesha NDANI ya sandbox ya E2B (template professor-xmd-browser-v3). Tofauti na XMD:
  • Task inasomwa kutoka --task-file (MPANGO KAZI kamili ulioandikwa na Koyeb) — si --task string.
  • Kila tukio lina njia 3 (belt + suspenders):
      (1) stdout  `@@XMD {json}`  — logs za Koyeb (commands.run onStdout)
      (2) FILE    events.jsonl    — source of truth ya resume (Koyeb inaisoma kureplay)
      (3) POST    CU_CALLBACK_URL — LIVE: /api/boardroom/cu-event (token ya run)
  • cuBrain (Gemini Swap Brain) inaanzishwa HAPA kama subprocess — amri MOJA tu kutoka Koyeb.
  • usage za kila call LLM zinatomolewa kutoka brain-usage.jsonl → event `usage` (meters za Koyeb).
  • `files` events: mti wa faili za /home/user/ws (kwa badge "Files").
  • `github` / `deploy` events: URL halisi kutoka output ya gh/vercel.
  • Screenshots: md5-dedup + cap 4MB + label (Desktop/Mobile kutoka browser_resize ya mwisho).

Ramani ya matukio (kama XMD): think_*, text_*, tool_draft, exec_start/output/end, shot,
usage, files, github, deploy, run_start, finish(report), error, run_end.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import glob as _glob
import hashlib
import json
import os
import re as _re
import subprocess
import sys
import threading
import time
import urllib.request

BASE_TS = time.time()
SHOT_RX = _re.compile(r"\[Screenshot[^\]]*\]\(([^)]+\.(?:png|jpe?g))\)", _re.I)
GITHUB_URL_RX = _re.compile(r"(https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)")
VERCEL_URL_RX = _re.compile(r"(https://[a-z0-9][a-z0-9-]*\.vercel\.app)", _re.I)
RESIZE_ARGS_RX = _re.compile(r'"width"\s*:\s*(\d+)')

# kuzuia kurudia screenshots zilezile (XMD)
_LAST_SHOT_HASH = None
_SEEN_SHOTS = set()

EMIT_LOCK = threading.Lock()


# ---------------------------------------------------------------- emit (njia 3)

class Emitter:
    def __init__(self, events_path: str, callback_url: str, callback_token: str, session: str, start_i: int = 0):
        self.events_path = events_path
        self.callback_url = callback_url
        self.callback_token = callback_token
        self.session = session
        self.i = start_i

    def emit(self, t: str, big_data: str | None = None, **kw):
        """big_data (base64 ya picha) inakwenda POST pekee — stdout/jsonl zina marker fupi."""
        kw["type"] = t
        kw["t"] = int((time.time() - BASE_TS) * 1000)
        with EMIT_LOCK:
            self.i += 1
            kw["i"] = self.i
            line = json.dumps(kw, ensure_ascii=False, default=str)
            # (1) stdout — logs za Koyeb (bila data kubwa)
            try:
                sys.stdout.write("@@XMD " + line + "\n")
                sys.stdout.flush()
            except Exception:
                pass
            # (2) events.jsonl — resume replay (bila data kubwa; Koyeb huwa ana fileId tayari)
            try:
                with open(self.events_path, "a", encoding="utf-8") as fh:
                    if big_data:
                        fh.write(json.dumps({**kw, "data": None, "has_data": True}, ensure_ascii=False, default=str) + "\n")
                    else:
                        fh.write(line + "\n")
            except OSError:
                pass
        # (3) POST kwa Koyeb — LIVE (pamoja na data ya picha)
        if self.callback_url:
            body = dict(kw)
            body["session"] = self.session  # orphan path (Koyeb restart) inaihitaji kupata session
            if big_data:
                body["data"] = big_data
            try:
                data = json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")
                req = urllib.request.Request(self.callback_url, data=data, method="POST",
                                             headers={"Content-Type": "application/json",
                                                      "Authorization": "Bearer " + self.callback_token})
                urllib.request.urlopen(req, timeout=20).read(64)
            except Exception as e:
                # kimya: events.jsonl + stdout vipo; Koyeb itareplay baadaye
                try:
                    sys.stderr.write(f"[bridge] POST cu-event imekufa ({e}) — events.jsonl inabaki\n")
                except Exception:
                    pass


# ---------------------------------------------------------------- mti wa faili

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "dist", ".next"}
MAX_TREE = 500


def files_tree(workspace: str):
    out = []
    try:
        for root, dirs, files in os.walk(workspace):
            rel = os.path.relpath(root, workspace)
            if rel == ".":
                rel = ""
            for d in sorted(dirs):
                if len(out) >= MAX_TREE:
                    return out
                p = (rel + "/" + d) if rel else d
                if d in SKIP_DIRS:
                    out.append({"p": p + "/", "d": True, "s": 0, "skip": True})
                else:
                    out.append({"p": p + "/", "d": True, "s": 0})
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in sorted(files):
                if len(out) >= MAX_TREE:
                    return out
                p = (rel + "/" + f) if rel else f
                try:
                    out.append({"p": p, "d": False, "s": os.path.getsize(os.path.join(root, f))})
                except OSError:
                    pass
    except OSError:
        pass
    return out


# ---------------------------------------------------------------- ramani ya zana (XMD)

def classify_tool(name: str, cmd: str = "") -> tuple[str, str]:
    n = (name or "").lower()
    c = (cmd or "").strip().lower()
    if n.startswith("mcp__pw__") or "browser" in n:
        return "browse", "browser"
    if n in ("write", "notebookedit"):
        return "write", "write_file"
    if n in ("edit", "multiedit"):
        return "edit", "edit_file"
    if n == "read":
        return "read", "read_file"
    if n == "glob":
        return "list", "list_files"
    if n == "grep":
        return "grep", "grep"
    if n in ("websearch", "xmd-search", "search"):
        return "search", "search"
    if n in ("task", "todowrite"):
        return "skill", "skill"
    if "vercel" in c:
        return "deploy", "vercel"
    if "gh repo" in c or "git push" in c or "gh " in c:
        return "git", "github"
    if c.startswith("git ") or " git " in c:
        return "git", "git"
    if "http.server" in c or "npm run preview" in c or "npm run dev" in c or "vite" in c:
        return "server", "server"
    if c.startswith("curl") or c.startswith("wget"):
        return "check", "check"
    return "bash", "bash"


def parse_partial(buf: str):
    out = {}
    for key in ("command", "content", "file_path", "path", "url", "new_string", "pattern", "description"):
        i = buf.find(f'"{key}"')
        if i < 0:
            continue
        j = buf.find(":", i)
        if j < 0:
            continue
        k = buf.find('"', j)
        if k < 0:
            continue
        val, esc, m = [], False, k + 1
        while m < len(buf):
            ch = buf[m]
            if esc:
                val.append({"n": "\n", "t": "\t", "r": "\r"}.get(ch, ch))
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                break
            else:
                val.append(ch)
            m += 1
        out[key] = "".join(val)
    return out


def shots_from_text(txt, workspace):
    """Playwright MCP ikihifadhi picha kwenye faili badala ya base64, tunaisoma (XMD)."""
    global _LAST_SHOT_HASH
    out = []
    for m in SHOT_RX.finditer(txt or ""):
        rel = m.group(1).strip()
        for cand in (rel, os.path.join(workspace, rel.lstrip("./"))):
            try:
                if os.path.isfile(cand) and os.path.getsize(cand) < 8 * 1024 * 1024:
                    with open(cand, "rb") as fh:
                        raw = fh.read()
                        h = hashlib.md5(raw).hexdigest()
                        if h == _LAST_SHOT_HASH or h in _SEEN_SHOTS:
                            continue
                        _SEEN_SHOTS.add(h)
                        _LAST_SHOT_HASH = h
                        out.append({"data": "data:image/png;base64," + base64.b64encode(raw).decode(), "path": rel})
                    break
            except OSError:
                pass
    return out


def find_chrome() -> str:
    for pat in ("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome",
                "/home/user/.cache/ms-playwright/chromium-*/chrome-linux*/chrome"):
        hits = _glob.glob(os.path.expanduser(pat))
        if hits:
            return sorted(hits)[-1]
    return ""


# ---------------------------------------------------------------- brain + usage tailer

def start_brain(python: str, brain_path: str, config_path: str, usage_out: str, port: int):
    """Brain inaendeshwa detached (stdout → brain.log) — isishike pipes za E2B command
    (bridge ikifa, command ya E2B inahesabiwa kuwa imemalizika sawasawa)."""
    env = dict(os.environ)
    env.update({"CU_CONFIG": config_path, "CU_USAGE_OUT": usage_out, "CU_PORT": str(port), "PYTHONUNBUFFERED": "1"})
    log = open("/home/user/brain.log", "a", encoding="utf-8")
    proc = subprocess.Popen([python, brain_path], env=env, stdout=log, stderr=log, start_new_session=True)
    for _ in range(60):  # subiri hadi 30s
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as r:
                if json.loads(r.read().decode()).get("ok"):
                    return proc
        except Exception:
            pass
        if proc.poll() is not None:
            raise RuntimeError("cuBrain imedondoka kabla kuwaka — angalia stderr")
        time.sleep(0.5)
    raise RuntimeError("cuBrain haijawaka ndani ya 30s")


class UsageTail(threading.Thread):
    """Inasoma brain-usage.jsonl (kila call ya LLM) → event `usage` ya Koyeb (meters)."""

    def __init__(self, path: str, emitter: Emitter):
        super().__init__(daemon=True)
        self.path = path
        self.em = emitter
        self.stop = False

    def run(self):
        fh = None
        while not self.stop:
            try:
                if fh is None:
                    if not os.path.exists(self.path):
                        time.sleep(1.5)
                        continue
                    fh = open(self.path, "r", encoding="utf-8")
                line = fh.readline()
                if line:
                    try:
                        rec = json.loads(line)
                        self.em.emit("usage", lane=rec.get("lane", ""), provider=rec.get("provider", ""),
                                     account=rec.get("account", ""), model=rec.get("model", ""),
                                     prompt=int(rec.get("prompt") or 0), completion=int(rec.get("completion") or 0),
                                     total=int(rec.get("total") or 0), ok=bool(rec.get("ok")))
                    except ValueError:
                        pass
                else:
                    time.sleep(1.2)
            except OSError:
                time.sleep(2)


# ---------------------------------------------------------------- system prompt

def build_system_prompt(gh_org: str, gh_user: str, done_steps: list[int], total_steps_hint: str) -> str:
    done_note = ""
    if done_steps:
        done_note = (
            f"\n\nRESUME NOTE: Hatua hizi zimekamilika TAYARI (usizirudie — endelea na iliyofuata): "
            f"{', '.join(str(s) for s in done_steps)}.\n"
        )
    return (
        "You are XMD Computer, an autonomous AI software engineer executing a Board-approved work plan.\n"
        "\n"
        "THE WORK PLAN (in the user message) IS LAW:\n"
        "- Follow its steps 1..N in order. Each step has Instructions, Official Data, and a Verification.\n"
        "- Copy Official Data VERBATIM (names, prices, phone numbers, hours, addresses) — never invent or 'improve' them.\n"
        "- If something is missing from the plan, mark it clearly as \"not discussed\" — never fill gaps with guesses.\n"
        "- Perform each step's Verification BEFORE moving on. If verification fails twice, note it and continue honestly.\n"
        f"{done_note}"
        "\n"
        "END-TO-END AUTONOMOUS WORKFLOW:\n"
        "1. Build & Test Locally:\n"
        "   - Create and organize all source files inside `/home/user/ws`.\n"
        "   - Start a local background server: `nohup python3 -m http.server 8080 --directory /home/user/ws > /tmp/srv.log 2>&1 &`\n"
        "     (or the project's own preview server on port 8080/4173/3000).\n"
        "   - Verify the server is healthy: `curl -sI http://127.0.0.1:8080`.\n"
        "   - Open the live page with `mcp__pw__browser_navigate` (e.g. `http://127.0.0.1:8080/index.html`).\n"
        "   - Capture verification screenshots:\n"
        "       1. Desktop View (1280x800) of Tab 1 (Main view).\n"
        "       2. Phone View (375x667 via `mcp__pw__browser_resize`) of Tab 1.\n"
        "       3. Interact / Switch to Tab 2 (via `mcp__pw__browser_click`).\n"
        "       4. Phone View (375x667) of Tab 2.\n"
        "       5. Desktop View (1280x800) of Tab 2.\n"
        "   - Close the browser when done (`mcp__pw__browser_close`).\n"
        "\n"
        "2. Git & GitHub Repository Push:\n"
        "   - Once testing is complete: in `/home/user/ws` run `git init && git add . && git commit -m \"feat: complete project\"`.\n"
        f"   - Create the GitHub repo under organization `{gh_org}` and push:\n"
        f"       `gh repo create \"{gh_org}/<project-slug>\" --public --source=. --push`\n"
        f"       (if the organization fails, fallback to personal: `gh repo create \"<project-slug>\" --public --source=. --push` under {gh_user})\n"
        "\n"
        "3. Live Vercel Deployment:\n"
        "   - `npx --yes vercel deploy --prod --yes --token=\"$VERCEL_TOKEN\" --name \"<project-slug>\"`\n"
        "   - The output contains the production live URL (e.g. `https://<project-slug>.vercel.app`).\n"
        "   - HONESTY IS LAW: if GitHub or Vercel fails (missing token, network, quota), say so plainly in the report — "
        "never claim a deploy that did not happen.\n"
        "\n"
        "4. Final Report — ANDIKA KWA KISWAHILI, kawaida tu:\n"
        "   - 🌐 **Live Website Link** (Vercel URL — au usema wazi haikufanyika)\n"
        f"   - 🐙 **GitHub Repository** (https://github.com/{gh_org}/... — au usema wazi)\n"
        "   - 📱 **Muhtasari wa Majaribio** (Desktop & Mobile — eleza kwa maelezo ya picha ulizochukua)\n"
        "   - 📁 **Muundo wa Faili na Utendaji Kazi** (orodha ya faili muhimu)\n"
        "   - ✅ **Ukaguzi wa Hatua** (kila hatua ya mpango: imekamilika / haijakamilika + kwa nini)\n"
        "   - Andika KAWAIDA: ukiongea table, andika table ya kawaida (markdown); ukiongea diagram, mermaid inaruhusiwa; "
        "usibadillishe table kuwa kitu kingine. Ripoti iwe kamili na ya wazi."
        f"\n{total_steps_hint}"
    )


# ---------------------------------------------------------------- main

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task-file", required=True)
    ap.add_argument("--title", default="Mradi")
    ap.add_argument("--session", default="")
    ap.add_argument("--workspace", default="/home/user/ws")
    ap.add_argument("--max-steps", type=int, default=60)
    ap.add_argument("--chrome", default="")
    ap.add_argument("--callback-url", default="")
    ap.add_argument("--callback-token", default="")
    ap.add_argument("--start-i", type=int, default=0)
    ap.add_argument("--done-steps", default="")
    ap.add_argument("--resume-note", default="")
    ap.add_argument("--brain", default="/home/user/cu_brain.py")
    ap.add_argument("--brain-config", default="/home/user/cu-config.json")
    ap.add_argument("--brain-port", type=int, default=4010)
    ap.add_argument("--events-out", default="/home/user/events.jsonl")
    ap.add_argument("--python", default="")
    a = ap.parse_args()

    python = a.python or os.environ.get("CU_PYTHON") or sys.executable
    gh_org = os.environ.get("GITHUB_ORG", "professor-xmd-company")
    gh_user = os.environ.get("GITHUB_USERNAME", "atupelegeorge81-spec")

    # SDK KWANZA — isipoonekana, hakuna run (tangaza ukweli mapema, bila kuanza brain)
    try:
        from claude_agent_sdk import query, ClaudeAgentOptions
    except ImportError as e:
        em_tmp = Emitter(a.events_out, a.callback_url, a.callback_token, a.session, a.start_i)
        em_tmp.emit("error", message=f"claude_agent_sdk haipo kwenye sandbox: {e}")
        em_tmp.emit("run_end", status="error", steps=0, ms=0)
        return

    os.makedirs(a.workspace, exist_ok=True)
    with open(a.task_file, "r", encoding="utf-8") as fh:
        plan_md = fh.read()

    em = Emitter(a.events_out, a.callback_url, a.callback_token, a.session, a.start_i)

    # ---- cuBrain (Gemini Swap Brain) — subprocess ya ndani (detached)
    brain_proc = None
    usage_out = os.environ.get("CU_USAGE_OUT", "/home/user/brain-usage.jsonl")
    try:
        brain_proc = start_brain(python, a.brain, a.brain_config, usage_out, a.brain_port)
        print(f"[bridge] cuBrain imewaka :{a.brain_port}", flush=True)
    except RuntimeError as e:
        em.emit("error", message=f"cuBrain: {e}")
        em.emit("run_end", status="error", steps=0, ms=int((time.time() - BASE_TS) * 1000))
        return
    tail = UsageTail(usage_out, em)
    tail.start()

    pw_args = ["-y", "@playwright/mcp@latest", "--headless", "--isolated", "--no-sandbox"]
    chrome = a.chrome or find_chrome()
    if chrome:
        pw_args += ["--executable-path", chrome]

    allowed = ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
    allowed += ["mcp__pw__" + t for t in (
        "browser_navigate", "browser_take_screenshot", "browser_snapshot", "browser_click",
        "browser_type", "browser_fill_form", "browser_press_key", "browser_resize",
        "browser_wait_for", "browser_console_messages", "browser_evaluate",
        "browser_select_option", "browser_hover", "browser_tabs", "browser_navigate_back",
        "browser_close")]

    done_steps = [int(s) for s in _re.findall(r"\d+", a.done_steps or "")]
    steps_hint = "The plan's step list below tells you the total number of steps."
    system_instructions = build_system_prompt(gh_org, gh_user, done_steps, steps_hint)
    if a.resume_note:
        system_instructions += "\n\nRESUME CONTEXT (true state of a previous interrupted run):\n" + a.resume_note

    task_prompt = (
        f"TEKELEZA MPANGO KAZI HUU (\"{a.title}\") hatua kwa hatua, kwa ukamilifu.\n\n"
        "Kumbuka: Official Data ni sheria — nakili kwa usahihi; utekeleze Verification ya kila hatua.\n"
        "Mwisho wa kila kitu, andika RIPOTI KAMILI YA KISWAHILI (live link + GitHub + majaribio + muundo + ukaguzi wa hatua).\n"
        "─────────────────────────────────────────────\n\n"
        + plan_md
    )

    # Jina la model: CLI ya Claude Code ina-validite model zake — tunatumia jina halali
    # "claude-sonnet-4-5" ILA cuBrain yetu INAIIGNORE model ya request na inaroute Gemini
    # (brain ndiyo bwana — lane/models zinatawaliwa na cu-config.json).
    opts = ClaudeAgentOptions(
        model=os.environ.get("CU_SDK_MODEL", "claude-sonnet-4-5"),
        system_prompt=system_instructions,
        include_partial_messages=True,
        permission_mode="bypassPermissions",
        cwd=a.workspace,
        max_turns=a.max_steps,
        max_buffer_size=64 * 1024 * 1024,
        mcp_servers={"pw": {"command": "npx", "args": pw_args}},
        allowed_tools=allowed,
        disallowed_tools=["TodoWrite", "Task", "TaskCreate", "TaskUpdate",
                          "TaskList", "TaskView", "WebSearch", "WebFetch"],
    )

    em.emit("run_start", task=a.title, model="xmd-computer (Gemini Swap Brain)", size="kati",
             protocol="claude", budget={"steps": a.max_steps, "tokens": 0}, files=files_tree(a.workspace)[:80])

    step = 0
    cur: dict[int, dict] = {}
    text_open = False
    think_open = False
    think_t0 = 0.0
    think_streamed_steps = set()
    last_id = None
    step_of: dict[str, int] = {}
    tools_in_step = set()
    status = "done"
    last_resize = (1280, 800)
    last_tree_emit = 0.0
    gh_url_seen: set[str] = set()
    vc_url_seen: set[str] = set()

    def maybe_files(force=False):
        nonlocal last_tree_emit
        now = time.time()
        if force or now - last_tree_emit > 4:
            last_tree_emit = now
            em.emit("files", tree=files_tree(a.workspace))

    def ensure_step():
        nonlocal step
        if step == 0:
            step = 1
            em.emit("step_start", step=1, run_step=1, max_steps=a.max_steps)
        return step

    def note_urls(txt: str, step_no: int):
        for u in GITHUB_URL_RX.findall(txt or ""):
            if u not in gh_url_seen:
                gh_url_seen.add(u)
                em.emit("github", url=u, step=step_no)
        for u in VERCEL_URL_RX.findall(txt or ""):
            u2 = u.rstrip(".,)")
            if u2 not in vc_url_seen:
                vc_url_seen.add(u2)
                em.emit("deploy", url=u2, step=step_no)

    def shot_label() -> str:
        w, h = last_resize
        if (w, h) == (1280, 800):
            return "Desktop 1280×800"
        if (w, h) == (375, 667):
            return "Mobile 375×667"
        return f"{w}×{h}"

    try:
        async for m in query(prompt=task_prompt, options=opts):
            ev = getattr(m, "event", None)

            if isinstance(ev, dict):
                et = ev.get("type")
                d = ev.get("delta") or {}
                cb = ev.get("content_block") or {}
                idx = ev.get("index", 0)

                if et == "message_start":
                    cur.clear()
                    continue

                if et == "content_block_start" and cb.get("type") == "tool_use":
                    if think_open:
                        think_open = False
                        em.emit("think_end", step=max(step, 1), ms=int((time.time() - think_t0) * 1000))
                    if text_open:
                        text_open = False
                        em.emit("text_end", step=max(step, 1))
                    if step == 0:
                        step = 1
                        em.emit("step_start", step=step, run_step=step, max_steps=a.max_steps)
                    elif step in tools_in_step:
                        step += 1
                        em.emit("step_start", step=step, run_step=step, max_steps=a.max_steps)
                    tools_in_step.add(step)
                    name = cb.get("name") or "tool"
                    tid = cb.get("id") or f"c{step}"
                    kind, ui_tool = classify_tool(name)
                    cur[idx] = {"id": tid, "name": name, "kind": kind, "ui_tool": ui_tool, "buf": "", "step": step}
                    step_of[tid] = step
                    last_id = tid
                    em.emit("tool_draft", step=step, id=tid, name=ui_tool, preview=name, content="", total=0)
                    continue

                if et == "content_block_start" and cb.get("type") == "thinking":
                    ensure_step()
                    think_open = True
                    think_t0 = time.time()
                    think_streamed_steps.add(step)
                    em.emit("think_start", step=step)
                    continue

                if et == "content_block_delta":
                    ensure_step()
                    dt = d.get("type")
                    if dt == "thinking_delta":
                        if not think_open:
                            think_open = True
                            think_t0 = time.time()
                            think_streamed_steps.add(step)
                            em.emit("think_start", step=step)
                        chunk = d.get("thinking", "") or d.get("text", "")
                        if chunk:
                            em.emit("think_delta", step=step, text=chunk)
                    elif dt == "text_delta":
                        raw_text = d.get("text", "")
                        if "<tool_use_error>" in raw_text or "</tool_use_error>" in raw_text:
                            raw_text = _re.sub(r"</?tool_use_error[^>]*>", "", raw_text)
                        if "<thought>" in raw_text or "<thinking>" in raw_text:
                            if not think_open:
                                think_open = True
                                think_t0 = time.time()
                                think_streamed_steps.add(step)
                                em.emit("think_start", step=step)
                            clean = _re.sub(r"</?(?:thought|thinking|reasoning|antThinking)>", "", raw_text)
                            if clean:
                                em.emit("think_delta", step=step, text=clean)
                        elif "</thought>" in raw_text or "</thinking>" in raw_text:
                            clean = _re.sub(r"</?(?:thought|thinking|reasoning|antThinking)>", "", raw_text)
                            if clean and think_open:
                                em.emit("think_delta", step=step, text=clean)
                            if think_open:
                                think_open = False
                                em.emit("think_end", step=step, ms=int((time.time() - think_t0) * 1000))
                        else:
                            if think_open:
                                em.emit("think_delta", step=step, text=raw_text)
                            else:
                                if raw_text.strip():
                                    if not text_open:
                                        text_open = True
                                        em.emit("text_start", step=step)
                                    em.emit("text_delta", step=step, text=raw_text)
                    elif dt == "input_json_delta":
                        c = cur.get(idx)
                        if c is not None:
                            c["buf"] += d.get("partial_json", "")
                            p = parse_partial(c["buf"])
                            body = p.get("content") or p.get("new_string") or p.get("command") or ""
                            if c["name"] == "Bash" and body:
                                kind, ui_tool = classify_tool("Bash", body)
                                c["kind"] = kind
                                c["ui_tool"] = ui_tool
                            preview_label = (p.get("file_path") or p.get("path") or p.get("pattern")
                                             or p.get("url") or p.get("command") or c["name"])
                            em.emit("tool_draft", step=c["step"], id=c["id"],
                                    name=c["ui_tool"],
                                    preview=str(preview_label)[:300],
                                    content=body[-4000:], total=body.count("\n") + 1)
                    continue

                if et == "content_block_stop":
                    target_step = max(step, 1)
                    if think_open:
                        think_open = False
                        em.emit("think_end", step=target_step, ms=int((time.time() - think_t0) * 1000))
                    if text_open:
                        text_open = False
                        em.emit("text_end", step=target_step)
                    c = cur.pop(idx, None)
                    if c:
                        try:
                            args = json.loads(c["buf"] or "{}")
                        except Exception:
                            args = parse_partial(c["buf"])
                        # track resize → label ya picha ijayo
                        if (c["name"] or "").endswith("browser_resize"):
                            try:
                                last_resize = (int(args.get("width") or 1280), int(args.get("height") or 800))
                            except Exception:
                                pass
                        cmd_val = args.get("command") or args.get("url")
                        if not cmd_val:
                            if c["kind"] == "list":
                                cmd_val = f"Glob {args.get('pattern') or args.get('path') or ''}".strip()
                            elif c["kind"] == "grep":
                                cmd_val = f"Grep {args.get('pattern') or ''} {args.get('path') or ''}".strip()
                            else:
                                cmd_val = c["name"]
                        else:
                            kind, ui_tool = classify_tool(c["name"], cmd_val)
                            c["kind"] = kind
                            c["ui_tool"] = ui_tool
                        em.emit("exec_start", step=c["step"], id=c["id"],
                                tool=c["ui_tool"], kind=c["kind"], command=str(cmd_val)[:2000],
                                path=args.get("file_path") or args.get("path"),
                                preview=(args.get("content") or args.get("new_string") or "")[:24000],
                                old_str=str(args.get("old_string") or "")[:24000],
                                new_str=str(args.get("new_string") or "")[:24000],
                                lines=len((args.get("content") or "").splitlines()) or None)
                    continue
                continue

            # ---------------- ujumbe kamili ----------------
            content = getattr(m, "content", None)
            if isinstance(content, list):
                for b in content:
                    bt = getattr(b, "type", "") or type(b).__name__
                    if bt in ("ThinkingBlock",):
                        tx = getattr(b, "thinking", "") or ""
                        if tx and max(step, 1) not in think_streamed_steps:
                            think_streamed_steps.add(max(step, 1))
                            em.emit("think_start", step=max(step, 1))
                            em.emit("think_delta", step=max(step, 1), text=tx[:12000])
                            em.emit("think_end", step=max(step, 1), ms=0)
                    elif bt in ("ToolResultBlock", "tool_result"):
                        tid = getattr(b, "tool_use_id", None) or last_id or f"r{step}"
                        stp = step_of.get(tid, step)
                        c = getattr(b, "content", None)
                        txt, shots = "", []
                        if isinstance(c, str):
                            txt = c
                        elif isinstance(c, list):
                            for it in c:
                                d2 = it if isinstance(it, dict) else getattr(it, "__dict__", {})
                                if d2.get("type") == "text":
                                    txt += d2.get("text", "")
                                elif d2.get("type") == "image":
                                    src = d2.get("source") or {}
                                    raw_data = src.get("data")
                                    if raw_data:
                                        h = hashlib.md5(raw_data.encode()).hexdigest()
                                        if h not in _SEEN_SHOTS:
                                            _SEEN_SHOTS.add(h)
                                            shots.append({"data": f"data:{src.get('media_type', 'image/png')};base64,{raw_data}",
                                                          "path": f"step-{stp}.png"})
                        err = bool(getattr(b, "is_error", False))
                        if not shots and txt:
                            shots = shots_from_text(txt, a.workspace)
                        if txt:
                            em.emit("exec_output", step=stp, id=tid, chunk=txt[:8000])
                            note_urls(txt, stp)
                        for s in shots:
                            b64 = (s["data"].split(",", 1) + [""])[1]
                            if len(b64) > 4 * 1024 * 1024:  # cap 4MB (uamuzi wa plan)
                                continue
                            em.emit("shot", step=stp, id=tid, big_data=b64,
                                    path=s.get("path", ""), label=shot_label(), size="")
                        em.emit("exec_end", step=stp, id=tid, exit=1 if err else 0, ms=0,
                                chars=len(txt), lines=len(txt.splitlines()), summary=txt[:400])
                        maybe_files()

            # ---------------- mwisho ----------------
            if type(m).__name__ == "ResultMessage":
                u = getattr(m, "usage", None) or {}
                pt = int(u.get("input_tokens", 0) or 0)
                ct = int(u.get("output_tokens", 0) or 0)
                tot = pt + ct
                em.emit("usage_total", prompt=pt, completion=ct, total=tot)
                rep = getattr(m, "result", None) or ""
                if not isinstance(rep, str):
                    rep = str(rep)
                sub = getattr(m, "subtype", "") or ""
                status = "done" if sub == "success" else ("stuck" if "max_turns" in sub else "error")
                note_urls(rep, step)
                em.emit("finish", report=rep or "(hakuna ripoti)", partial=status != "done", status=status)
    except Exception as e:
        import traceback
        em.emit("error", message=f"{type(e).__name__}: {str(e)[:300]}")
        sys.stderr.write(traceback.format_exc())
        status = "error"

    maybe_files(force=True)
    tail.stop = True
    # brain (detached) inafungwa kabisa — pipes za E2B zisibaki hai
    if brain_proc is not None:
        try:
            brain_proc.terminate()
        except Exception:
            pass
        try:
            subprocess.run(["pkill", "-f", "cu_brain.py"], timeout=10, capture_output=True)
        except Exception:
            pass
    em.emit("run_end", status=status, steps=step, ms=int((time.time() - BASE_TS) * 1000),
            github=sorted(gh_url_seen), deploy=sorted(vc_url_seen))


if __name__ == "__main__":
    asyncio.run(main())
