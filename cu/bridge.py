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
import shutil
import subprocess
import sys
import tarfile
import io as _io
import threading
import time
import urllib.request

BASE_TS = time.time()
SHOT_RX = _re.compile(r"\[Screenshot[^\]]*\]\(([^)]+\.(?:png|jpe?g))\)", _re.I)
GITHUB_URL_RX = _re.compile(r"(https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)")
PAUSE_RX = _re.compile(r"XMD-PAUSE:(\d{9,15})")
# R32.2: thoughts za Gemini (zinavuja kwenye jibu la mwisho) — kuwa na maudhui halisi
THOUGHT_RX = _re.compile(r"<(?:thought|thinking)>([\s\S]*?)</(?:thought|thinking)>", _re.I)

# R46-A (uchunguzi wa FishiSmart run2 — 10-10 usiku): tool call iliyoandikwa kama TEXT.
# Gemini ilipoteza function-caling akatoa <default_api:Write content={...} file_path=...>
# kama maandishi → CLI ikachukua kama ujumbe wa MWISHO → run_end "done" ya uongo
# (run nzima ikifa sekunde 113, bila faili moja ya src/). Viashiria vya aina hii:
TOOL_AS_TEXT_RX = _re.compile(
    r"<default_api[:.]|<function_calls>|</invoke>|<\|tool\||file_path\s*[:=]\s*/home/user", _re.I)

# R46-B (kosa la SafariSmart run1, 21:20): flash-LITE ilipoteza agentic-mode ikatoa maneno ya
# AZIMU tu ("Let's start by... Let's run a bash command...") bila kuita tool hata moja → CLI
# ikachukua kama ujumbe wa mwisho → run_end "done" (steps:1, exec:0, ripoti herufi 49).
INTENT_PROSE_RX = _re.compile(
    r"\b(?:let'?s|let us|i will|i'?ll|i'?m going to|we will|we'?ll|now i|first,? i|let me)\b", _re.I)
# R32.2b: tag ILIYOFUNGULIWA isiyofungwa (hakuna </thought>) — kama ThinkTagSplitter, kila kitu
# kutoka tag hapo hadi mwisho ni thought (session 6ac4a63b na 6ac4af5e zote zilikufa hivi).
UNCLOSED_THOUGHT_RX = _re.compile(r"<(?:thought|thinking)>[\s\S]*$", _re.I)
# R33: test files (zilizoandikwa) na test runners (zilizoendeshwa)
TEST_FILE_RX = _re.compile(r"(?:^|[\\/])(?:tests?|__tests__)[\\/]|\.spec\.(?:ts|tsx|js|jsx|mjs)$|\.test\.(?:ts|tsx|js|jsx|mjs)$|_test\.(?:go|py)$|(^|[\\/])test_[^\\/]*\.py$", _re.I)
TEST_RUN_RX = _re.compile(r"\b(?:npx\s+(?:--yes\s+)?playwright\s+test|playwright\s+test|vitest|jest\b|pytest\b|npm\s+(?:run\s+)?test|npm\s+test|yarn\s+test|pnpm\s+(?:run\s+)?test|node\s+--test|go\s+test\b|cargo\s+test\b)\b", _re.I)
# A plan-run needs a successful, observable verification command—not merely a promise or tool call.
VERIFY_RUN_RX = _re.compile(
    r"\b(?:npm\s+run\s+(?:build|lint|typecheck|check)|npm\s+(?:test|run\s+test)|"
    r"pnpm\s+(?:run\s+)?(?:build|lint|typecheck|test|check)|yarn\s+(?:run\s+)?(?:build|lint|typecheck|test|check)|"
    r"npx\s+(?:playwright\s+test|vitest(?:\s+run)?|tsc\s+--noEmit)|"
    r"(?:pytest|vitest|jest|playwright\s+test|go\s+test|cargo\s+test|node\s+--test)\b|"
    r"python(?:3)?\s+-m\s+(?:unittest|pytest))\b", _re.I)
VERIFY_FAILURE_RX = _re.compile(
    r"(?:exit[_ ]code\s*[:=]?\s*[1-9]\d*|exit(?:ed)?\s+with\s+(?:code|status)\s*[1-9]\d*|"
    r"process\s+exited\s+with\s+code\s+[1-9]\d*|\b[1-9]\d*\s+failed\b|"
    r"\btests?\s+failed\b|\bbuild\s+failed\b|\btype\s+check\s+failed\b|is[_ ]error\s*[:=]?\s*(?:true|1))", _re.I)
# R33: ripoti halisi ya Kiswahili ina alama za sehemu zake; code-dump haina
REPORT_MARK_RX = _re.compile(r"RIPOTI|Live Website|GitHub|Muhtasari|vercel\.app|github\.com|🌐|🐙|📱|📁|✅|🔗", _re.I)
CODE_LINE_RX = _re.compile(r"^\s*(?:import\s|from\s+\S+\s+import|const\s|let\s|var\s|function\s|def\s|class\s|test\(|describe\(|it\(|await\s|return\s|export\s|console\.|print\(|}\s*\)|\{|\}$|//|#include|<\?php|<!DOCTYPE|<html)", _re.IGNORECASE)
# R34-B: pages zinarejelea assets zisizo tayari (kosa la 6ac4c32c: js/login.js 0 bytes —
# touch-tu, ripoti ikadai "Step 9 ✓ Imekamilika")
TAG_RX = _re.compile(r"<(script|link|img)\b[^>]*>", _re.I)
REF_RX = _re.compile(r"\b(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", _re.I)
SKIP_REF_PREFIXES = ("http://", "https://", "//", "data:", "mailto:", "tel:", "#", "javascript:")
# R34.1: saraka za build — generated na npm run build, si deliverable za kuandikwa
BUILD_DIRS = frozenset(("dist", "build", "out", ".next", ".output", ".cache", "coverage"))
# R31-G4: snapshot ya workspace wakati wa pause (quota) — files zilirudike zero kesho
SNAP_SKIP = {"node_modules", ".git", ".playwright-mcp", ".cache", ".venv", "__pycache__", ".npm", "playwright-report", ".codeium", ".vscode"}

# ================================================================ R50 · Awamu 0.5 PREFLIGHT
# Msingi (utafiti — Anthropic "Effective harnesses for long-running agents", Nov 2025): scaffold
# ya mradi LAZIMA iweze kuendesha kwenye session yoyote; meta-files za harness zisiwe kizuizi.
# Kosa halisi la SafariSmart: `npm create vite .` ilighairika kwa sababu workspace ilikuwa na
# CLAUDE.md/STATUS.md — scaffold inataka directory TUPU. Suluhisho: stash kwa /tmp kabla ya
# scaffold, restore mara MOJA baada (PostToolUse / Failure / Stop backstop).
META_FILES = ("CLAUDE.md", "STATUS.md", "plan.md", "feature_list.json", "CONFLICTS.md")
META_DIRS = (".xmd",)
STASH_DIR = os.environ.get("XMD_META_STASH", "/tmp/xmd-meta")
SCAFFOLD_RX = _re.compile(
    r"\bnpm\s+(?:create|init)\b|\bnpx\s+(?:--yes\s+)?create|\bpnpm\s+create\b|\byarn\s+create\b"
    r"|\bbun\s+create\b|\bgit\s+clone\b|\bdegit\b",
    _re.I)


def our_github_urls(txt: str, org: str, user: str) -> list:
    """URL za GitHub ZETU tu (org au user) — template za Vite/npm, docs na links za wengine hazioni.

    (Kosa la G: Read ya src/App.jsx ya template ya Vite ilikuwa na https://github.com/vitejs/vite
    ndani yake → card ya GitHub ya uongo. Sasa: repos zetu pekee.)"""
    out = []
    for u in GITHUB_URL_RX.findall(txt or ""):
        low = u.lower()
        if f"github.com/{(org or '').lower()}/" in low or f"github.com/{(user or '').lower()}/" in low:
            out.append(u)
    return out


def make_snapshot(workspace: str, max_bytes: int = 20 * 1024 * 1024):
    """tar.gz ya workspace (bila node_modules/.git/…) → base64; None kama kubwa mno/tupu."""
    try:
        buf = _io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tf:
            for root, dirs, files in os.walk(workspace):
                dirs[:] = [d for d in dirs if d not in SNAP_SKIP]
                for f in files:
                    full = os.path.join(root, f)
                    try:
                        if os.path.getsize(full) < 20 * 1024 * 1024:
                            tf.add(full, arcname=os.path.relpath(full, workspace))
                    except OSError:
                        pass
        data = buf.getvalue()
        if not data or len(data) > max_bytes:
            return None
        return base64.b64encode(data).decode()
    except Exception:
        return None


def restore_snapshot(url: str, workspace: str) -> str:
    """Pakua tar.gz kutoka bucket (public read) na kurejesha workspace — kazi ya jana inarudi."""
    req = urllib.request.Request(url)
    raw = urllib.request.urlopen(req, timeout=180).read()
    with tarfile.open(fileobj=_io.BytesIO(raw), mode="r:gz") as tf:
        tf.extractall(workspace)
    return f"{len(raw)} bytes"
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


# ------------------------------------------------------- think-tag splitter (R31-G5)
# Gemini inatuma thoughts kama <thought>...</thought> ndani ya content. Tag ikigawanyika
# kati ya SSE chunks (mf. "abc <tho" + "ught>..."), check ya kila-chunk ilifeli → thought
# YOTE ilimwagika kwenye text ya kawaldi (haikuwa kwenye think card — kosa la 6ac3ce60).
# Splitter inabuffer sehemu ya tag iliyokwishaanza (open+close) na inatuma sehemu salama tu.
class ThinkTagSplitter:
    OPEN_TAGS = ("<thought>", "<thinking>")
    CLOSE_TAGS = ("</thought>", "</thinking>")

    def __init__(self, on_text, on_think, on_open, on_close):
        self._on_text = on_text
        self._on_think = on_think
        self._on_open = on_open
        self._on_close = on_close
        self.buf = ""
        self.think_open = False

    @staticmethod
    def _partial_suffix(s, tags):
        best = 0
        for tag in tags:
            for k in range(1, len(tag)):
                if s.endswith(tag[:k]):
                    best = max(best, k)
        return best

    def _seg(self, text):
        if not text:
            return
        if self.think_open:
            self._on_think(text)
        else:
            self._on_text(text)

    def feed(self, raw):
        self.buf += raw or ""
        while True:
            found = [(self.buf.find(t), t) for t in self.OPEN_TAGS + self.CLOSE_TAGS]
            found = [(p, t) for p, t in found if p >= 0]
            if not found:
                break
            pos, tag = min(found)
            self._seg(self.buf[:pos])
            self.buf = self.buf[pos + len(tag):]
            if tag in self.OPEN_TAGS:
                if not self.think_open:
                    self.think_open = True
                    self._on_open()
            else:
                if self.think_open:
                    self.think_open = False
                    self._on_close()
        hold = self._partial_suffix(self.buf, self.OPEN_TAGS + self.CLOSE_TAGS)
        if hold:
            safe, self.buf = self.buf[:-hold], self.buf[-hold:]
        else:
            safe, self.buf = self.buf, ""
        self._seg(safe)

    def flush(self):
        """mwisho wa block/message — kila kilichobaki kinatumwa (partial tag inakuwa text)."""
        if self.buf:
            self._seg(self.buf)
            self.buf = ""


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
    if n in ("websearch", "xmd-search", "search") or n.endswith("web_search"):
        return "search", "search"
    if n in ("task", "todowrite", "taskcreate", "taskupdate", "tasklist", "taskget", "taskstop"):
        return "skill", "skill"
    if n in ("agent", "listagents"):
        return "skill", "skill"
    # Task 3b: angalia MWANZO wa kila segment (&&, ;, |) — `printf '...Vercel...'` ilionekana deploy
    segs = [x.strip() for x in _re.split(r"&&|\|\||;|\|", c)]
    if any(x.startswith(("vercel", "npx vercel", "pnpm dlx vercel")) for x in segs):
        return "deploy", "vercel"
    if any(x.startswith(("gh ", "git push")) for x in segs):
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


# ================================================================ R32 · NIDHAMU YA AGENT
# Sheria za Claude-docs zenyewe (soma-error-kwanza, iteration caps, STATUS.md) zinaishi kwenye
# CLAUDE.md ya project; hooks za SDK ndizo enforcement (ushauri + brake — HAKUNA block, idhini
# ya CEO 06-10). Kila kitu hapa ni harness-side: model (Gemini kupitia brain) hakiwezi kuzipuuza.

R32_CLAUDE_MD = """# XMD Computer — Nidhamu ya Kazi (Agent Discipline)

Ukitenda kazi hapa, fuata sheria hizi (zinatokana na mafunzo halisi ya Anthropic kwa Claude Code):

1. **SOMA error kamili KABLA ya ku-rerun.** Command ikifeli (exit != 0): anza kwenye mstari wa
   kwanza wenye "Error"/"Failed"/"exception" na usome hadi MWISHO. Violation ya 3 kwenye
   output ya QA mara nyingi iko MWEISHO — usiicheke.
2. **Command ILEILE ikifeli mara 3 mfululizo → badilisha mkakati.** Andika hypotheses 3 za
   root-cause kwenye `STATUS.md`, kisha tijaribu MOJA tu. Ku-run command ileile tena SI jaribio.
3. **File ILEILE ikiandikwa mara 5 bila QA kupita → kosa liko SEHEMU Nyingine.** Angalia
   dependencies za file hiyo (mf. CSS var isiyokuwa defined kwenye globals.css, import
   isiyofika, config iliyosautiliwa) — si component unayoirudia.
4. **Mlango wa dharura:** QA/Verification ikifeli mara 2 BAADA ya kubadilisha mkakati → andika
   kwenye ripoti *"⚠️ Haikupita: <sababu halisi> · Nilijaribu: X, Y"*, weka alama `[~]`,
   **na ENDELEA na hatua nyingine** — mradi hausimami kwa kipengele kimoja.
5. **`#0000ee`, `#0000ff`, `Times New Roman`** n.k. = default za browser = ishara ya CSS var
   isiyokuwa defined au CSS isiyopakiwa. Kamata kwenye files za style, si kwenye component.
6. **`STATUS.md` ndiyo memory ya run:** sasisha kila hatua inapokamilika (hatua ✓/…, makosa
   yaliyofungwa, hali ya server, hypotheses zako). Compaction ikitokea, STATUS.md inakurudisha
   kwenye track.
6b. **Context yako inabanwa automatic** (mfumo wa "kopa kidogo"): matokeo ya tools ya zamani
   yanafupishwa na picha za zamani zinaondolewa kutoka context — MPANGO (ujumbe wa kwanza),
   dirisha la karibu, `STATUS.md` na workspace `/home/user/ws` ndiyo source of truth. Ukahitaji
   jambo la zamani, LI-SOME tena (Read file / glob) badala ya kutegemea kumbukumbu ya context.
7. Hakuna kukadiriwa: kosa usilolitambua → liandike wazi kama "sijalitambua" badala ya ku-probe
   bila mpango.
"""

# TASK-17: Build Report contract — kwa awamu za MILESTONE tu (--milestone Mk). Headings = BUILD_REPORT_HEADINGS
# za src/lib/milestone/buildReport.ts (test ya vitest inalinganisha). Harness inakagua; Computer hajipi alama.
BUILD_REPORT_HEADINGS = (
    "1 Summary",
    "2 Files created or changed",
    "3 Commands run and results",
    "4 Tests run",
    "5 Decisions and deviations from the plan",
    "6 Security notes",
    "7 Known problems / technical debt",
    "8 Risks for the next milestone",
)
BUILD_REPORT_MARK_START = "<!-- XMD-BUILD-REPORT-CONTRACT -->"
BUILD_REPORT_MARK_END = "<!-- /XMD-BUILD-REPORT-CONTRACT -->"


def build_report_path(milestone: str) -> str:
    return f".xmd/reports/{milestone}-build-report.md"


def build_report_contract(milestone: str) -> str:
    """Kiolezo + mkataba wa Build Report wa milestone hii (maandishi ya Kiingereza — agent anasoma neno kwa neno)."""
    path = build_report_path(milestone)
    return (
        f"## XMD BUILD REPORT CONTRACT (milestone {milestone})\n"
        f"Before you finish this milestone, write the file `{path}` inside the workspace "
        "(/home/user/ws). Use EXACTLY these headings, in this order, none empty:\n\n"
        "```markdown\n"
        f"# {milestone} Build Report\n"
        "## 1 Summary\n"
        "<what this milestone built, 2-5 sentences>\n"
        "## 2 Files created or changed\n"
        "- `path/relative/to/workspace` — created|changed — why\n"
        "## 3 Commands run and results\n"
        "- `the exact command` — exit 0 — one sentence on the result\n"
        "## 4 Tests run\n"
        "- test name — PASS|FAIL\n"
        "## 5 Decisions and deviations from the plan\n"
        "- decision or deviation — reason\n"
        "## 6 Security notes\n"
        "- secrets, auth, sensitive data (write \"None\" with a reason if nothing applies)\n"
        "## 7 Known problems / technical debt\n"
        "- ...\n"
        "## 8 Risks for the next milestone\n"
        "- ...\n"
        "```\n\n"
        "Rules: list in section 2 only real files you actually created or changed in this milestone "
        "(the harness compares section 2 with `git diff`). Every line in section 3 is a command you "
        "really ran, with its real exit code.\n"
        "You cannot finish without this report. Do not grade yourself; the harness measures.\n"
    )


def receipts_contract(milestone: str, receipts: dict) -> str:
    """TASK-25: raundi ya marekebisho — Receipts badala ya Build Report (sawa na fixRound.ts receiptsContract)."""
    path = str(receipts.get("path") or ".xmd/receipts/R1.json")
    orders = [str(x) for x in (receipts.get("orderIds") or [])]
    msg = str(receipts.get("commitMessage") or f"{milestone}: {', '.join(orders)}")
    return (
        f"## XMD RECEIPTS CONTRACT (milestone {milestone}, fix round)\n"
        "This is a FIX ROUND: apply the change orders in the task file — nothing else. No Build Report this round.\n"
        f"Before you finish, write `{path}` inside the workspace (/home/user/ws): a JSON ARRAY with exactly one "
        f"Receipt per change order ({', '.join(orders)}):\n\n"
        "```json\n"
        '[{"orderId": "CO-001", "status": "DONE|PARTIAL|BLOCKED|CANNOT",\n'
        '  "filesChanged": [{"path": "relative/path", "summary": "what changed"}],\n'
        '  "commandsRun": ["the exact commands"], "notes": "optional",\n'
        '  "blockedReason": "required when BLOCKED or CANNOT"}]\n'
        "```\n\n"
        "Rules: filesChanged lists ONLY files you really changed for that order — the harness compares it with "
        "`git diff`; an order whose target files are not in the diff is marked NOT_ATTEMPTED, a receipt that lists "
        "unchanged files is rejected, and changed files that no receipt lists are flagged UNLISTED_CHANGE. "
        "If an order contradicts a locked ledger decision (see LOCKED LEDGER in the task file) or cannot be done, "
        "do NOT apply it: status BLOCKED (or CANNOT) with blockedReason, filesChanged [].\n"
        f'Then commit everything yourself: `git add -A && git commit -m "{msg}"`.\n'
        "You cannot finish without a valid receipts file for every order. Do not grade yourself; the harness measures.\n"
    )


def milestone_contract(milestone: str, ws: str) -> str:
    """TASK-25: `.xmd/startpack.json` ina `receipts` → mkataba wa Receipts (raundi ya marekebisho); vinginevyo Build Report."""
    if not milestone:
        return ""
    try:
        with open(os.path.join(ws, ".xmd/startpack.json"), "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except Exception:  # noqa: BLE001
        cfg = {}
    rc = cfg.get("receipts") if isinstance(cfg, dict) else None
    return receipts_contract(milestone, rc) if isinstance(rc, dict) else build_report_contract(milestone)


def with_build_report_contract(existing: str, milestone: str, ws: str = "") -> str:
    """Weka (au badilisha) block ya mkataba ndani ya CLAUDE.md — maandishi mengine hayaguswi."""
    text = existing or ""
    a, b = text.find(BUILD_REPORT_MARK_START), text.find(BUILD_REPORT_MARK_END)
    if a >= 0 and b > a:
        text = (text[:a].rstrip("\n") + text[b + len(BUILD_REPORT_MARK_END):]).rstrip("\n")
    if not milestone:
        return text
    body = milestone_contract(milestone, ws) if ws else build_report_contract(milestone)
    return f"{text}\n\n{BUILD_REPORT_MARK_START}\n{body}{BUILD_REPORT_MARK_END}\n"


def fingerprint_cmd(cmd: str) -> str:
    """R32: fingerprint ya command — whitespace za ziada + temp paths zime-normalize (sawa=sawa)."""
    c = (cmd or "").strip()
    c = _re.sub(r"\s+", " ", c)
    c = _re.sub(r"/tmp/[^\s\"']+", "/tmp/X", c)
    c = _re.sub(r"/var/folders/[^\s\"']+", "/tmp/X", c)
    c = c.rstrip("; ")
    return hashlib.md5(c.encode("utf-8", "replace")).hexdigest()[:16]


def shape_fail_tail(txt: str, cap: int = 8000) -> str:
    """R32-D: kwa command iliyo-fail, UI inaona TAIL yenye maana (si head tu).

    Mistari ~60 ya mwisho + sehemu inayoanza na Error/Failed/✘ hadi mwisho (kwanza occurrence).
    """
    if not txt or len(txt) <= cap:
        return txt
    lines = txt.splitlines()
    tail = "\n".join(lines[-60:])
    err_start = None
    for i, ln in enumerate(lines):
        if _re.search(r"\b(error|failed|failure|exception|✘|assertion)\b", ln, _re.I):
            err_start = i
            break
    if err_start is not None and err_start < len(lines) - 60:
        err_part = "\n".join(lines[err_start:])
        out = err_part if len(err_part) >= len(tail) else tail
    else:
        out = tail
    if len(out) > cap:
        out = out[-cap:]
    return out


def find_empty_deliverables(workspace: str) -> list[tuple[str, str]]:
    """R34-B: pages za mradi (HTML) zinarejelea files zisizo tayari — 0 bytes au haipo.

    (Kosa la 6ac4c32c: index.html ilirejelea js/login.js iliyoundwa kwa `touch` tu —
    0 bytes — na ripoti ikadai "Step 9 ✓".) Inarudisha [(ref, "0 bytes"|"haipo"), …].
    Rejea za nje (http/https/data/mailto/#) na rel isiyo stylesheet hazihesabiwi.

    R34.1 (kosa la 6ac6c6e5 — false positive): rejea zinatafutwa KUTOKA na directory ya
    HTML yenyewe (dist/index.html → ./assets/app.js = dist/assets/app.js, si ws/assets/),
    na saraka za build (dist/ n.k.) ni generated — hazihesabiwi kabisa."""
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    ws = os.path.normpath(workspace)
    try:
        htmls: list[str] = []
        for root, dirs, files in os.walk(workspace):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"
                       and d not in BUILD_DIRS]
            for f in files:
                if f.lower().endswith(".html") or f.lower().endswith(".htm"):
                    htmls.append(os.path.join(root, f))
    except OSError:
        return out
    for hp in htmls:
        base = os.path.dirname(hp)
        try:
            with open(hp, encoding="utf-8", errors="replace") as fh:
                src = fh.read()
        except OSError:
            continue
        for tag in TAG_RX.finditer(src):
            t = tag.group(0) or ""
            name = (tag.group(1) or "").lower()
            if name == "link" and "stylesheet" not in t.lower():
                continue  # favicon/preload n.k. si deliverable ya lazima
            m = REF_RX.search(t)
            if not m:
                continue
            ref = (m.group(1) or "").strip()
            low = ref.lower()
            if not ref or low.startswith(SKIP_REF_PREFIXES):
                continue
            ref = ref.split("#", 1)[0].split("?", 1)[0]
            if not ref or ref.lower().startswith(SKIP_REF_PREFIXES):
                continue
            while ref.startswith("./"):        # R34.1: lstrip("./") ilivunja "../" — sasa sahihi
                ref = ref[2:]
            if ref.startswith("../"):
                continue                        # inatoroka kutoka kwenye page — si deliverable hapa
            if ref.startswith("/"):
                ref = ref.lstrip("/")           # root-absolute → directory ya HTML (app inaserviwa hapo)
            if not ref or ref.lower().startswith(SKIP_REF_PREFIXES):
                continue
            if ref in seen:
                continue
            seen.add(ref)
            p = os.path.normpath(os.path.join(base, ref))
            if not (p == ws or p.startswith(ws + os.sep)):
                continue                        # nje ya workspace
            if p == os.path.normpath(hp):
                continue
            if not os.path.isfile(p):
                out.append((ref, "haipo"))
            elif os.path.getsize(p) == 0:
                out.append((ref, "0 bytes"))
    return out


class HookState:
    """R32-C: hesabu za hooks za nidhamu (run moja, memory ya ndani tu — hakuna kudumu).

    • fail_streak: fingerprint ya Bash command → fails mfululizo (success inareset)
    • rewrites:   path ya file → idadi ya Write/Edit mfululizo
    • answers:    majibu ya mwisho ya model (normalize) — ×3 yaleyale = brake
    • pending:    ushauri unayosubiri kufikishwa model (via PostToolUse additionalContext)
    """

    def __init__(self):
        self.fail_streak: dict[str, int] = {}
        self.fail_examples: dict[str, str] = {}
        self.rewrites: dict[str, int] = {}
        self.answers: list[str] = []
        self.pending: str = ""
        self.brake_fired = False
        self.brake_reason: str = ""
        self.cont_blocks = 0
        self.advice_given_at: dict[str, int] = {}
        # R32.2: "empty stops" — model imesimama ikiwa na <thought> pekee / bila maudhui halisi.
        # (Kosa la 6ac4a63b: call ya mwisho ilitoka lane ya dharura ikiwa thought tu — run
        #  ikaisha "done" baada ya tool 1. Sasa: thought-pekee SI mwisho halali.)
        self.empty_stops = 0
        # R46-A: tool-call kama maandishi (mf. <default_api:Write ...>) — SI mwisho halali.
        # Kikomo 4: model isijirekebishe → brake (si loop ya milele).
        self.tool_text_stops = 0
        # R46-B: exec zilizofanikiwa (zana halisi zilizotekelezwa) + intent-prose stops
        self.execs = 0
        self.intent_stops = 0
        # R33: screenshot MOJA kwa kila page/view ("picha ipo tayari" — agizo la CEO 06-10 usiku)
        self.page_url: str = ""
        self.viewport: tuple = (1280, 800)
        self.last_shot_key: tuple | None = None
        self.page_dirty: bool = True    # kitu chochote kinachobadilisha page/view tangu shot ya mwisho
        self.shot_denies: int = 0
        # R33: mabaki — tests ziliyoandikwa lazima ziendeshwe; ripoti si code-dump
        self.tests_written: bool = False
        self.tests_run: bool = False
        self.gate_guard = None          # TASK-18: GateGuard (milestone runs tu)
        self.gate_partial_line: str = ""
        # R48: verification is recorded only after a successful tool result. Calling a test/build
        # command is not evidence that it passed. Plan runs cannot report success without this gate.
        self.verification_passed: bool = False
        self.verification_command: str = ""
        self.verification_blocks: int = 0
        self.report_blocks: int = 0
        self.test_blocks: int = 0
        # R34-B: pages zinarejelea files zisizo tayari (0 bytes / haipo) — block max 2
        self.deliverable_blocks: int = 0
        # R50-Awamu 0.5: preflight — meta-files zilizostashwa kabla ya scaffold [(src, dst)]
        self.meta_stash: list[tuple[str, str]] = []

    # ---- Bash
    def note_bash_fail(self, cmd: str, err: str) -> None:
        # A failed verification attempt invalidates the latest verification result.
        if VERIFY_RUN_RX.search(cmd or ""):
            self.verification_passed = False
            self.verification_command = (cmd or "")[:300]
        if TEST_RUN_RX.search(cmd or ""):
            self.tests_run = False
        fp = fingerprint_cmd(cmd)
        self.fail_streak[fp] = self.fail_streak.get(fp, 0) + 1
        self.fail_examples[fp] = (err or "")[-2000:]
        n = self.fail_streak[fp]
        if n in (3, 6, 10, 15):
            self._advice_bash(fp, n)

    def note_bash_ok(self, cmd: str) -> None:
        fp = fingerprint_cmd(cmd)
        n = self.fail_streak.pop(fp, 0)
        self.fail_examples.pop(fp, None)
        if n >= 3:
            self.pending = (f"✅ Command iliyokuwa ikifeli (mara {n}) sasa IMEFANIKIWA — "
                            f"hypothesis yako sahihi. Endelea; kumbuka kile kilichofunga kwenye STATUS.md.")

    def _advice_bash(self, fp: str, n: int) -> None:
        if self.advice_given_at.get(fp, 0) >= n:
            return
        self.advice_given_at[fp] = n
        ex = (self.fail_examples.get(fp) or "").strip().splitlines()
        last_err = next((ln for ln in reversed(ex) if ln.strip()), "")[:160]
        if n < 6:
            self.pending = (
                f"⚠️ XMD NIDHAMU: command hii IMESHAFELI mara {n} mfululizo (mbaki: «{last_err}»). "
                "KABLA ya ku-i-run tena: (1) soma error kamili kutoka mstari wa 'Error/Failed' hadi mwisho; "
                "(2) andika hypotheses 3 za root-cause kwenye STATUS.md; (3) tijaribu MOJA tu. "
                "Ku-run command ILEILE tena si jaribio. (Ushauri — uamuzi ni wako.)"
            )
        else:
            self.pending = (
                f"⚠️⚠️ XMD NIDHAMU: command hii imeshafeli mara {n} (mbaki: «{last_err}»). "
                "Kwa kawaida kosa kama hili haliko kwenye command yenyewe bali SEHEMU Nyingine: "
                "dependencies zisizofika, config, CSS var isiyokuwa defined, au environment. "
                "Simama kidogo: badilisha mkakati kabisa au endelea na hatua nyingine na uiweke alama [~]. "
                "(Ushauri — uamuzi ni wako.)"
            )

    # ---- Write/Edit
    def note_write(self, path: str) -> None:
        p = (path or "?").strip()
        self.rewrites[p] = self.rewrites.get(p, 0) + 1
        n = self.rewrites[p]
        if n in (5, 9):
            self.pending = (
                f"⚠️ XMD NIDHAMU: file «{p}» imeandikwa mara {n} bila mabadiliko ya msingi. "
                "Kosa linaweza kuwa KWENYE FILE Nyingine (dependency, CSS var, import, config) — "
                "angalia files zinazohusiana na hii kabla ya kuandika tena. (Ushauri — uamuzi ni wako.)"
            )

    # ---- majibu ya mwisho (brake)
    @staticmethod
    def _visible_text(answer: str) -> str:
        """Maudhui halisi ya jibu — <thought>/<thinking> zimeondolewa (R32.2; R32.2b: na zisizofungwa)."""
        t = THOUGHT_RX.sub(" ", answer or "")
        # R32.2b: kwanza ondoa blocks zilizofungwa, KISHA iliyofunguliwa isiyofungwa
        # (yote kutoka hapo hadi mwisho = thought). Mfuatano huununua kama ThinkTagSplitter.
        t = UNCLOSED_THOUGHT_RX.sub(" ", t)
        return t.strip()

    def note_tool_progress(self) -> None:
        """Tool ilifanikiwa = kuna maendeleo — empty-stops mfululizo zianza upya (R32.2)."""
        self.empty_stops = 0
        self.tool_text_stops = 0   # R46-A: function-calling imeanza kufanya kazi tena
        self.execs += 1            # R46-B: zana halisi ilitekelezwa

    def note_answer(self, answer: str, plan_run: bool = False) -> dict:
        """Semantiki za query-mode: Stop hook ikirudisha {} run INAISHA — kwa hiyo "jibu lileile
        ×3" linawezekana tu kama hook yenyewe inalazimisha continuation kwanza.

        Inarudisha:
          {"brake": True}          → jibu lileile ×3 (≈90%) AU empty-stops > 6 → {"continue": false}
          {"block_reason": "..."}  → run iko stuck (ushauri haujafika / jibu linarudiwa /
                                     jibu ni thought-pekee) → {"decision": "block", "reason": …}
          {}                        → mwisho wa kawaida (jibu halisi) — run inaisha vizuri
        """
        # R46-A (kosa la FishiSmart run2): tool call iliyoandikwa kama TEXT si mwisho —
        # model ilikusudia KUITEKELEZA (Write/Bash), si kuripoti. Block: itekeleze sahihi.
        # (Kabla ya visible-check: viashiria viko ndani ya <thought> pia vina hesabu.)
        if TOOL_AS_TEXT_RX.search(answer or ""):
            self.tool_text_stops += 1
            if self.tool_text_stops > 4:
                return {"brake": True}
            return {"block_reason": (
                "XMD NIDHAMU: ujumbe wako wa mwisho una TOOL CALL iliyoandikwa kama maandishi "
                "(mf. <default_api:Write ...> au file_path:...) — huo si ujumbe wala ripoti. "
                "Itekeleze kwa FUNCTION CALLING halisi (Write/Edit/Bash), kisha endelea na "
                "hatua inayofuata ya mpango. Ripoti ya Kiswahili inakuja MWISHONI tu baada ya "
                "kazi yote.")}
        # R46-B (kosa la SafariSmart run1): mwisho wa azimu-prosa bila utekelezaji —
        # "Let's start by..." si ripoti wala jibu; na run ya mpango yenye exec 0 si mwisho.
        # plan_run: kipimo kinapitishwa na on_stop (plan.md ipo kwenye workspace).
        if plan_run:
            visible0 = self._visible_text(answer)
            if len(visible0) < 400 and INTENT_PROSE_RX.search(visible0):
                self.intent_stops += 1
                if self.intent_stops > 4:
                    return {"brake": True}
                return {"block_reason": (
                    "XMD NIDHAMU: ujumbe wako wa mwisho ni AZIMU tu — "
                    "hujatekeleza chochote bado. Mpango una hatua zisizokamilika: itekeleze "
                    "SASA kwa FUNCTION CALLING halisi (Bash/Write/Edit) moja baada ya nyingine. "
                    "Ripoti ya Kiswahili inakuja MWISHONI tu, baada ya kazi yote halisi.")}
            if self.execs == 0:
                self.intent_stops += 1
                if self.intent_stops > 4:
                    return {"brake": True}
                return {"block_reason": (
                    "XMD NIDHAMU: unajaribu kumaliza run ya MPANGO bila kutekeleza HATA TOOL "
                    "MOJA. Hakuna kazi iliyothibitishwa. Anza sasa: soma STATUS.md/plan, kisha "
                    "itekeleze hatua kwa Bash/Write/Edit. Ripoti inakuja baada ya kazi halisi.")}
            if not self.verification_passed:
                self.verification_blocks += 1
                if self.verification_blocks > 3:
                    self.brake_fired = True
                    self.brake_reason = "Verification haikupita/haikuthibitishwa baada ya nafasi 4; run imeishia BLOCKED/PARTIAL, si VERIFIED."
                    return {"brake": True}
                last = (f" Amri ya mwisho: {self.verification_command}." if self.verification_command else "")
                return {"block_reason": (
                    "XMD VERIFICATION GATE (R48): huwezi kumaliza run ya mpango bila ushahidi "
                    "wa verification iliyofanikiwa. Endesha amri halisi inayofaa mradi huu "
                    "(tests, build, typecheck au browser assertion), soma matokeo na rekebisha "
                    "kosa lolote. Kuita command pekee hakutoshi; exit isiyofanikiwa haipiti. "
                    "Usidai PASS ikiwa mazingira yamezuia verification—ripoti PARTIAL/BLOCKED wazi."
                    + last)}
        # R32.2: jibu lenye <thought> pekee / text isiyofikia herufi 40 SI mwisho halali —
        # model (hasa lane za dharura) inaishisha "kimya" wakati kazi bado. Lazimisha aendelee.
        visible = self._visible_text(answer)
        if len(visible) < 40:
            self.empty_stops += 1
            if self.empty_stops > 6:
                self.brake_fired = True
                self.brake_reason = "Majibu matupu yamejirudia zaidi ya kikomo; hakuna maendeleo yanayoweza kuthibitishwa."
                return {"brake": True}
            return {"block_reason": (
                f"XMD NIDHAMU: umeisha na thought pekee bila kutekeleza chochote "
                f"(stop tupu #{self.empty_stops}/6 mfululizo). USISIMAME bila kazi: endelea "
                "MOJA KWA MOJA na hatua inayofuata ya mpango kwa kutumia zana (Bash/Write/Edit). "
                "Ripoti ya Kiswahili inakuja MWISHONI tu, baada ya kazi yote.")}
        self.empty_stops = 0
        # R33: ripoti si code-dump (max 2 blocks — model inapata nafasi 2 za kujirekebisha, kisha inaishishwa)
        if self._is_code_dump(visible):
            self.report_blocks += 1
            if self.report_blocks <= 2:
                return {"block_reason": (
                    "XMD NIDHAMU: hii SI ripoti — umeituma maudhui ya CODE ya file (dump). "
                    "Andika RIPOTI YA MRADI kwa Kiswahili: muhtasari wa kazi, 🌐 Live Website Link "
                    "(au usema wazi haikufanyika), 🐙 GitHub Repository, 📱 Muhtasari wa Majaribio "
                    "(picha ulizopiga), 📁 Muundo wa Faili, ✅ Ukaguzi wa Hatua. USIRUDIE code ya "
                    "file — muhtasari tu.")}
        # R33: tests ziliyoandikwa lazima ziendeshwe (max 2 blocks — kisha sababu + [~] halali)
        if self.tests_written and not self.tests_run:
            self.test_blocks += 1
            if self.test_blocks <= 2:
                return {"block_reason": (
                    "XMD NIDHAMU: umeandika test files lakini HAZIJAEENDESHWA bado. Endesha zako "
                    "(mf. `npx playwright test` / `npm test` / `pytest`) na onesha matokeo "
                    "(zimepita / imefeli wapi na kwa nini), KISHA andika ripoti ya Kiswahili. "
                    "Kama haikuwezekana kwa sababu halisi (dependencies, environment), andika "
                    "sababu wazi kwenye ripoti na weka alama [~].")}
        norm = _re.sub(r"\s+", " ", visible).strip().lower()
        if len(norm) >= 40:   # majibu mafupi (mf. "sawa") hayashiriki
            self.answers.append(norm)
            self.answers = self.answers[-3:]
        if len(self.answers) == 3 and self._similar3():
            self.brake_fired = True
            return {"brake": True}
        stuck = bool(self.pending) or (
            len(self.answers) >= 2 and self._similar(self.answers[-1], self.answers[-2]))
        # max blocks 2 kwa run (bound: ushauri umeleta pili; la tatu lileile = brake)
        if stuck and self.cont_blocks < 2:
            self.cont_blocks += 1
            advice = self.take_pending() or (
                "XMD: kazi inaonekana imesimama bila maendeleo. Endelea na hatua inayofuata; "
                "kama hatua hii haipiti kwa sababu halisi, weka alama [~] kwenye ripoti na "
                "uendelee — mradi hausimami kwa kipengele kimoja.")
            return {"block_reason": advice}
        return {}

    @staticmethod
    def _similar(a: str, b: str) -> bool:
        """≈90% fanana AU moja ni prefix ya nyingine (jibu lileile + counter/suffix)."""
        if a == b:
            return True
        if len(a) >= 40 and len(b) >= 40 and (a.startswith(b) or b.startswith(a)):
            return True
        try:
            import difflib
            return difflib.SequenceMatcher(None, a, b).ratio() >= 0.9
        except Exception:
            return False

    def _similar3(self) -> bool:
        a, b, c = self.answers[-3:]
        return self._similar(a, b) and self._similar(b, c) and self._similar(a, c)

    def take_pending(self) -> str:
        out, self.pending = self.pending, ""
        return out

    # ---- R33: screenshots — MOJA kwa kila page/view ("picha ipo tayari")
    NAV_TOOLS = frozenset((
        "mcp__pw__browser_navigate", "mcp__pw__browser_navigate_back", "mcp__pw__browser_tabs",
        "mcp__pw__browser_click", "mcp__pw__browser_resize", "mcp__pw__browser_type",
        "mcp__pw__browser_fill_form", "mcp__pw__browser_select_option", "mcp__pw__browser_press_key",
    ))

    def note_pre_tool(self, name: str, ti: dict) -> dict:
        """PreToolUse (R33): kataa screenshot YA PILI ya page/view ileile — hakuna kilichobadilika
        tangu ile ya kwanza. Mabadiliko ya page (navigate/click/type) au view (resize) yanafungua.
        Pia: kila jaribio la kuendesha test-runner linafungua mlango wa "tests_run" (hata likifeli)."""
        if name in self.NAV_TOOLS:
            self.page_dirty = True
        if name == "Bash":
            # Do not mark tests/verification as run here: PreToolUse only means the model
            # attempted a command. Success is recorded in note_post_tool after the result returns.
            pass
        if name.endswith("browser_take_screenshot"):
            key = (self.page_url, self.viewport)
            if key == self.last_shot_key and not self.page_dirty:
                self.shot_denies += 1
                return {"deny": (
                    f"PICHA IPO TAYARI kwa page hii ({self.page_url or 'ya sasa'} · view "
                    f"{self.viewport[0]}x{self.viewport[1]}) — screenshot MOJA kwa kila page/view "
                    "inatosha. USIPIGE tena ileile: endelea na hatua inayofuata ya mpango. Picha "
                    "mpya inaruhusiwa TU baada ya kubadilisha page (navigate/click) au view (resize).")}
        return {}

    @staticmethod
    def _response_text(response) -> str:
        """Flatten tool response objects so explicit non-zero exits cannot count as verification."""
        if response is None:
            return ""
        if isinstance(response, str):
            return response
        if isinstance(response, dict):
            parts = []
            for key in ("text", "output", "stdout", "stderr", "message", "content",
                        "exit_code", "exitCode", "is_error", "status", "error"):
                if key in response:
                    parts.append(f"{key}: {HookState._response_text(response[key])}")
            return "\n".join(p for p in parts if p)
        if isinstance(response, (list, tuple)):
            return "\n".join(HookState._response_text(x) for x in response)
        return str(response)

    @staticmethod
    def _exit_code(response) -> "int | None":
        """TASK-18: exit code halisi ya tool result (dict exit_code/exitCode/returncode, is_error, au "Exit code: N")."""
        if isinstance(response, dict):
            for k in ("exit_code", "exitCode", "returncode", "code"):
                v = response.get(k)
                if isinstance(v, bool):
                    continue
                if isinstance(v, int):
                    return v
                if isinstance(v, str) and v.strip().lstrip("-").isdigit():
                    return int(v.strip())
            if response.get("is_error") is True or response.get("interrupted") is True:
                return 1
        txt = HookState._response_text(response)
        m = _re.search(r"(?:exit(?:\s*code)?|returned)\s*[:=]?\s*(-?\d{1,3})\b", txt, _re.I)
        return int(m.group(1)) if m else None

    def note_post_tool(self, name: str, ti: dict, response=None) -> None:
        """PostToolUse: track UI evidence and mark verification only after a successful result."""
        if name == "Bash":
            cmd = str(ti.get("command") or "")
            output = self._response_text(response)
            failed = bool(VERIFY_FAILURE_RX.search(output))
            if VERIFY_RUN_RX.search(cmd):
                self.verification_command = cmd[:300]
                self.verification_passed = not failed
            if TEST_RUN_RX.search(cmd):
                # TASK-18: tests_run = True TU baada ya test command kumaliza na exit 0 (exit code halisi
                # ikijulikana; vinginevyo dalili za kufeli kwenye output). Jaribio lililofeli halifungui mlango.
                # Non-milestone (legacy) runs: kanuni ya zamani (`not failed`) haibadiliki.
                ec = self._exit_code(response) if self.gate_guard is not None else None
                self.tests_run = (ec == 0) if ec is not None else not failed
        elif name in ("Write", "Edit", "NotebookEdit"):
            # A source/config change after a green check makes that check stale.
            path = str(ti.get("file_path") or ti.get("path") or "").lower()
            source_exts = (".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json",
                           ".css", ".scss", ".html", ".htm", ".vue", ".svelte", ".go", ".rs")
            if path.endswith(source_exts) and not path.endswith(("/status.md", "status.md", "/readme.md", "readme.md")):
                self.verification_passed = False
                self.tests_run = False
        if name == "mcp__pw__browser_navigate":
            u = str(ti.get("url") or "")
            if u:
                self.page_url = u
        elif name == "mcp__pw__browser_resize":
            try:
                w = int(ti.get("width") or 0)
                h = int(ti.get("height") or 0)
                if w > 0 and h > 0:
                    self.viewport = (w, h)
            except Exception:
                pass
        elif name.endswith("browser_take_screenshot"):
            self.last_shot_key = (self.page_url, self.viewport)
            self.page_dirty = False
        elif name in ("Write", "Edit", "NotebookEdit"):
            p = str(ti.get("file_path") or ti.get("path") or "")
            if p and TEST_FILE_RX.search(p):
                self.tests_written = True

    def note_deliverables(self, empties: list[tuple[str, str]]) -> dict:
        """R34-B: Stop hook ikiruhusu mwisho — pages zinarejelea files zisizo tayari?
        (kosa la 6ac4c32c: js/login.js 0 bytes + ripoti "Step 9 ✓"). Max 2 blocks,
        kisha inaishishwa (kikomo cha mfumo mzima)."""
        if not empties or self.deliverable_blocks >= 2:
            return {}
        self.deliverable_blocks += 1
        lst = ", ".join(f"«{p}» ({k})" for p, k in empties[:4])
        return {"block_reason": (
            f"XMD NIDHAMU: pages za mradi zinarejelea files zisizo tayari: {lst}. "
            "Andika maudhui yao KAMILI kama mpango unavyosema (au ondoa rejea hiyo kabisa) "
            "— USIISHIE hivi; ripoti ya Kiswahili inakuja baada ya kazi yote halisi.")}

    @staticmethod
    def _is_code_dump(text: str) -> bool:

        """R33: ripoti ya mwisho ni muhtasari wa Kiswahili — si maudhui ya file/code.
        (Kosa la 6ac4b789: lane ya dharura ilituma <tool_code>… dump ya file.)"""
        t = text or ""
        if REPORT_MARK_RX.search(t):
            return False    # alama za sehemu za ripoti zipo — si dump
        if "<tool_code" in t.lower() or "print(default_api." in t:
            return True
        lines = [l for l in t.splitlines() if l.strip()]
        if len(lines) < 10:
            return False
        code = sum(1 for l in lines if CODE_LINE_RX.match(l))
        return code / len(lines) > 0.7


# ================================================================ R50 · Awamu 0.5 preflight helpers

def stash_meta_files(workspace: str) -> list[tuple[str, str]]:
    """R50-0.5: hamisha meta-files za harness → STASH_DIR (scaffold inahitaji directory tupu).

    Inarudisha [(src, dst)] kwa restore. Haiathiri files nyingine zozote (src/, package.json…).
    """
    moved: list[tuple[str, str]] = []
    try:
        os.makedirs(STASH_DIR, exist_ok=True)
    except Exception:
        return moved
    for name in META_FILES + META_DIRS:
        src = os.path.join(workspace, name)
        if not os.path.exists(src):
            continue
        dst = os.path.join(STASH_DIR, name)
        try:
            if os.path.isdir(dst) and not os.path.islink(dst):
                shutil.rmtree(dst, ignore_errors=True)
            elif os.path.exists(dst) or os.path.islink(dst):
                os.remove(dst)
            shutil.move(src, dst)
            moved.append((src, dst))
        except Exception:
            pass
    return moved


def restore_meta_files(moved: list[tuple[str, str]]) -> int:
    """R50-0.5: rudisha meta-files kwenye workspace. Ikiwa scaffold imeunda faili la jina lile —
    la scaffold linabaki (haturudishi juu yake); mengine yanarudi. Inarudisha idadi."""
    n = 0
    for src, dst in moved or []:
        try:
            if not os.path.exists(dst) or os.path.exists(src):
                continue
            shutil.move(dst, src)
            n += 1
        except Exception:
            pass
    return n


def preflight_pre_tool(state: HookState, workspace: str, name: str, ti: dict, em=None) -> dict:
    """R50-0.5: Bash=scaffold → stash meta-files kabla. Inarudisha {'stashed': n, 'files': …} au {}."""
    try:
        if name != "Bash" or state.meta_stash:
            return {}
        cmd = str((ti or {}).get("command") or "")
        if not cmd or not SCAFFOLD_RX.search(cmd):
            return {}
        moved = stash_meta_files(workspace)
        if not moved:
            return {}
        state.meta_stash = moved
        names = ", ".join(os.path.basename(s) for s, _ in moved)
        if em is not None:
            em.emit("xmd_hook", kind="preflight",
                    text=(f"PREFLIGHT: meta-files {len(moved)} zimehifadhiwa (/tmp) kabla ya scaffold "
                          f"— {names} — zinarudishwa mara moja baada."))
        return {"stashed": len(moved), "files": names}
    except Exception as e:
        sys.stderr.write(f"[bridge] preflight pre: {e}\n")
        return {}


def preflight_post_tool(state: HookState, em=None) -> dict:
    """R50-0.5: baada ya scaffold (hata ikifeli) — rudisha meta-files. Idempotent + backstop ya Stop."""
    try:
        if not state.meta_stash:
            return {}
        n = restore_meta_files(state.meta_stash)
        state.meta_stash = []
        if em is not None:
            em.emit("xmd_hook", kind="preflight",
                    text=f"PREFLIGHT: meta-files {n} zimerudishwa kwenye workspace.")
        return {"restored": n}
    except Exception as e:
        sys.stderr.write(f"[bridge] preflight post: {e}\n")
        return {}


def build_xmd_hooks(state: HookState, em, workspace: str):
    """R32-C: hooks za SDK (ushauri + brake; HAKUNA block — idhini ya CEO 06-10 jioni).

    Njia za ushauri (zimehakikiwa kwenye sandbox na proxy ya Gemini):
      • PostToolUseFailure (Bash)  → streak++ (hii haina channel ya kumfikia model — inarekodi tu)
      • PostToolUse (.*)           → inarekebisha streaks/rewrites NA inatoa ushauri uliokusanywa
                                    kupitia additionalContext (inafika model ✓, bila kuzuia chochote)
      • Stop                       → jibu lileile ×3 → {"continue": false} + ripoti ya NIMEKWAMA

    R33 (agizo la CEO 06-10 usiku — pekee): PreToolUse inaKATAA screenshot ya pili ya page/view
    ileile ("PICHA IPO TAYARI"). Hii ndizo tool zilizokuwa zinapoteza tokens bila mpangilio;
    commands za Bash bila HAKUNA kublock (msimamo wa CEO unabaki).
    """
    import asyncio

    async def pre_tool(hook_input, tool_input, ctx):
        try:
            name = hook_input.get("tool_name") or ""
            ti = hook_input.get("tool_input") or {}
            verdict = state.note_pre_tool(name, ti)
            preflight_pre_tool(state, workspace, name, ti, em)   # R50-0.5: scaffold isighairike
            if verdict.get("deny"):
                em.emit("xmd_hook", kind="shot_deny", text=str(verdict["deny"])[:500])
                return {"decision": "block", "reason": verdict["deny"],
                        "hookSpecificOutput": {"hookEventName": "PreToolUse",
                                               "permissionDecision": "deny",
                                               "permissionDecisionReason": verdict["deny"]}}
        except Exception as e:
            sys.stderr.write(f"[bridge] hook pre_tool: {e}\n")
        return {}

    async def bash_failed(hook_input, tool_input, ctx):
        try:
            ti = hook_input.get("tool_input") or {}
            err = hook_input.get("error") or ""
            cmd = ti.get("command") or ""
            if cmd:
                state.note_bash_fail(cmd, err)
                em.emit("xmd_hook", kind="fail", streak=state.fail_streak.get(fingerprint_cmd(cmd), 0),
                        command=str(cmd)[:300], text=str(err)[-400:])
            preflight_post_tool(state, em)   # R50-0.5 backstop: scaffold iliyofeli pia inarudisha meta
        except Exception as e:
            sys.stderr.write(f"[bridge] hook bash_failed: {e}\n")
        return {}

    async def any_tool_ok(hook_input, tool_input, ctx):
        try:
            name = hook_input.get("tool_name") or ""
            ti = hook_input.get("tool_input") or {}
            state.note_tool_progress()   # R32.2: tool ilifanikiwa — empty-stops zianza upya
            state.note_post_tool(name, ti, hook_input.get("tool_response") or hook_input.get("tool_result"))  # R33/R47: evidence after result
            if name == "Bash":
                state.note_bash_ok(str(ti.get("command") or ""))
            elif name in ("Write", "Edit", "NotebookEdit"):
                state.note_write(str(ti.get("file_path") or ti.get("path") or ""))
            advice = state.take_pending()
            if advice:
                em.emit("xmd_hook", kind="advice", text=advice[:500])
                return {"hookSpecificOutput": {"hookEventName": "PostToolUse",
                                               "additionalContext": advice}}
        except Exception as e:
            sys.stderr.write(f"[bridge] hook any_tool_ok: {e}\n")
        return {}

    async def on_stop(hook_input, tool_input, ctx):
        try:
            preflight_post_tool(state, em)   # R50-0.5 backstop: plan.md LAZIMA iwe workspace kabla ya checks
            plan_run = os.path.exists(os.path.join(workspace, "plan.md"))   # R46-B
            verdict = state.note_answer(str(hook_input.get("last_assistant_message") or ""), plan_run=plan_run)
            if verdict.get("brake"):
                # Ripoti ya "NIMEKWAMA" inaandikwa na hook yenyewe (model haisikii stopReason)
                try:
                    top = sorted(state.fail_streak.items(), key=lambda kv: -kv[1])[:3]
                    why = (state.brake_reason or
                           (f"Model imesimama {state.empty_stops} mara mfululizo ikiwa na thought "
                            "pekee bila kutekeleza kazi (stop tupu)." if state.empty_stops > 6 else
                            "Jibu la mwisho limerudiwa karibu kwa usawa mara 3 — hakukuwa na maendeleo ya kutosha."))
                    lines = ["# NIMEKWAMA — Ripoti ya Brake (R32)", "",
                             f"*Wakati: {time.strftime('%Y-%m-%d %H:%M:%S')}*", "",
                             "## Kwa nini imesimama",
                             why, "",
                             "## Commands zilizo-feli zaidi (fingerprint streak)"]
                    for fp, n in top:
                        ex = (state.fail_examples.get(fp) or "").strip().splitlines()
                        lines.append(f"- mara {n}: {ex[-1][:200] if ex else fp}")
                    if not top:
                        lines.append("- (hakuna fails za mfululizo za Bash)")
                    lines += ["", "## Files zilizoandikwa mara nyingi"]
                    for p, n in sorted(state.rewrites.items(), key=lambda kv: -kv[1])[:5]:
                        lines.append(f"- mara {n}: {p}")
                    lines += ["", "## Hatua inayofuata (kwa Endeleza)",
                              "1. Soma hypotheses za mwisho kwenye STATUS.md (au ziandike sasa kama hazipo).",
                              "2. Badilisha mkakati kwa moja ya hypotheses — si ku-rerun command ileile.",
                              "3. Au endelea na hatua nyingine na uiweke alama [~] kwenye ripoti."]
                    with open(os.path.join(workspace, "STATUS.md"), "a", encoding="utf-8") as fh:
                        fh.write("\n\n" + "\n".join(lines) + "\n")
                except Exception as e:
                    sys.stderr.write(f"[bridge] NIMEKWAMA ripoti: {e}\n")
                em.emit("xmd_hook", kind="brake",
                        text=(state.brake_reason or "Jibu lilelile ×3 — hakuna maendeleo ya kutosha.")
                             + " Run imesimamishwa; STATUS.md inaeleza hali halisi. ▶ Endeleza inaanza na hali iliyohifadhiwa.")
                return {"continue": False,
                        "stopReason": "XMD-BRAKE: " + (state.brake_reason or "jibu lilelile mara 3 — hakuna maendeleo.")}
            if verdict.get("block_reason"):
                # ushauri unamfika model kama reason ya kulazimisha kuendelea (si block ya kitu
                # chochote — ni "endelea kazi" + ushauri wa nidhamu; max 2 kwa run)
                em.emit("xmd_hook", kind="continue", text=str(verdict["block_reason"])[:500])
                return {"decision": "block", "reason": verdict["block_reason"]}
            # R34-B: jibu ni halali — lakini kazi yenyewe? pages zinarejelea files 0 bytes/haipo
            # (kosa la 6ac4c32c: js/login.js touch-tu + ripoti "Step 9 ✓") → block max 2.
            if not verdict.get("brake"):
                dv = state.note_deliverables(find_empty_deliverables(workspace))
                if dv.get("block_reason"):
                    em.emit("xmd_hook", kind="continue", text=str(dv["block_reason"])[:500])
                    return {"decision": "block", "reason": dv["block_reason"]}
            # TASK-18: COMPLETION GATE (milestone tu) — hook inathibitisha yenyewe (ripoti, git, build, tests)
            gg = getattr(state, "gate_guard", None)
            if gg is not None and not verdict.get("brake"):
                gv, gres, gmsg = gg.check()
                if gv == "block":
                    em.emit("xmd_hook", kind="gate", text=gmsg[:600])
                    return {"decision": "block", "reason": gmsg}
                if gv == "partial":
                    state.gate_partial_line = gmsg
                    em.emit("xmd_hook", kind="gate", text=gmsg[:600])
        except Exception as e:
            sys.stderr.write(f"[bridge] hook on_stop: {e}\n")
        return {}

    from claude_agent_sdk import HookMatcher
    return {
        "PreToolUse": [HookMatcher(matcher=".*", hooks=[pre_tool])],
        "PostToolUseFailure": [HookMatcher(matcher="Bash", hooks=[bash_failed])],
        "PostToolUse": [HookMatcher(matcher=".*", hooks=[any_tool_ok])],
        "Stop": [HookMatcher(matcher=".*", hooks=[on_stop])],
    }


# ================================================================ R32 · MCP search (SearXNG)

async def xmd_web_search(inp: dict, search_url: str, callback_token: str, searxng: str) -> dict:
    """R32-F4: handler ya web_search (inayepimwa moja kwa moja — SDK wrapper iko juu).

    Sheria za Claude (idhini ya CEO 06-10): agent anajulishwa kuwepo kwake TU (description ya
    tool) — hatumwiwi wapi aitumie. Kwanza inapiga route ya Koyeb (cache ya Appwrite inclusive,
    Bearer pattern ya cu-event); ikifa → SearXNG moja kwa moja.
    """
    import urllib.parse
    q = str((inp or {}).get("query") or "").strip()
    try:
        max_results = max(1, min(int((inp or {}).get("max_results") or 5), 10))
    except Exception:
        max_results = 5
    if not q:
        return {"content": [{"type": "text", "text": '{"results": [], "error": "query ni tupu"}'}]}
    # (1) route ya Koyeb — cache ya semantic + hygiene ya query
    if search_url:
        try:
            data = json.dumps({"query": q, "max_results": max_results}).encode()
            req = urllib.request.Request(search_url, data=data, method="POST",
                                         headers={"Content-Type": "application/json",
                                                  "Authorization": "Bearer " + callback_token})
            with urllib.request.urlopen(req, timeout=30) as r:
                payload = json.loads(r.read().decode("utf-8", "replace"))
            hits = payload.get("results") or []
            if hits:
                return {"content": [{"type": "text", "text": json.dumps({"query": q, "results": hits[:max_results]},
                                                                        ensure_ascii=False)}]}
        except Exception:
            pass  # (2) fallback chini — SearXNG moja kwa moja
    try:
        u = f"{searxng.rstrip('/')}/search?q={urllib.parse.quote(q)}&format=json"
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                                                 "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.loads(r.read().decode("utf-8", "replace"))
        hits = [{"title": str(it.get("title") or "")[:300],
                 "url": it.get("url") or "",
                 "snippet": str(it.get("content") or "")[:600]}
                for it in (payload.get("results") or [])[:max_results] if it.get("url")]
        return {"content": [{"type": "text", "text": json.dumps({"query": q, "results": hits},
                                                                ensure_ascii=False)}]}
    except Exception as e:
        return {"content": [{"type": "text", "text": json.dumps({"query": q, "results": [],
                                                                "error": f"search imekufa: {str(e)[:200]}"})}]}


def build_search_tool(callback_url: str, callback_token: str, session: str):
    """R32-F4: search engine ya XMD (SearXNG) kama MCP tool ya kiharness — in-process."""
    search_url = (os.environ.get("CU_SEARCH_URL") or "").strip()
    if not search_url and callback_url:
        search_url = callback_url.rsplit("/cu-event", 1)[0] + "/cu-search"
    searxng = (os.environ.get("SEARXNG_URL") or "https://searxng-northflank.onrender.com")

    async def web_search(inp: dict) -> dict:
        return await xmd_web_search(inp, search_url, callback_token, searxng)

    try:
        from claude_agent_sdk import SdkMcpTool, create_sdk_mcp_server
        server = create_sdk_mcp_server(
            name="xmd-search", version="1.0.0",
            tools=[SdkMcpTool(
                name="web_search",
                description=("Tafuta mtandaoni kwa mada/hoja yoyote (search engine ya XMD — SearXNG). "
                             "Inarudisha orodha ya matokeo yenye title, url na snippet. "
                             "Inatumika kwa habari, mifano, docs na uthibitisho wa facts."),
                input_schema={"type": "object",
                              "properties": {"query": {"type": "string", "description": "Neno au swali la kutafuta"},
                                             "max_results": {"type": "integer", "description": "Idadi ya matokeo (1-10, default 5)"}},
                              "required": ["query"]},
                handler=web_search,
            )],
        )
        return server
    except Exception as e:
        sys.stderr.write(f"[bridge] MCP search server haiwezekani: {e}\n")
        return None



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
                                     total=int(rec.get("total") or 0), ok=bool(rec.get("ok")),
                                     waiting=bool(rec.get("waiting")), note=str(rec.get("note") or "")[:140])
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
        "   - SCREENSHOT SHERIA: piga screenshot MOJA kwa KILA page/view muhimu ya mradi:\n"
        "       1. Desktop View (1280x800) of Tab 1 (Main view).\n"
        "       2. Phone View (375x667 via `mcp__pw__browser_resize`) of Tab 1.\n"
        "       3. Interact / Switch to Tab 2 (via `mcp__pw__browser_click`).\n"
        "       4. Phone View (375x667) of Tab 2.\n"
        "       5. Desktop View (1280x800) of Tab 2.\n"
        "   - KILA page ya mradi (login, signup, dashboard, n.k.) inahitaji screenshot yake MOJA — usiruke page.\n"
        "   - UKIJARIBU kupiga picha YA PILI ya page/view ILEILE bila kubadilisha chochote, mfumo unakataa\n"
        "     (\"PICHA IPO TAYARI\") — hamna hasara; endelea na hatua inayofuata. Picha mpya\n"
        "     inaruhusiwa baada ya kubadilisha page (navigate/click) au view (resize) tu.\n"
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
    ap.add_argument("--chrome", default="")
    ap.add_argument("--callback-url", default="")
    ap.add_argument("--callback-token", default="")
    ap.add_argument("--start-i", type=int, default=0)
    ap.add_argument("--done-steps", default="")
    ap.add_argument("--resume-note", default="")
    ap.add_argument("--restore-url", default="")
    ap.add_argument("--milestone", default="")  # TASK-17: awamu ya milestone (Mk) → mkataba wa Build Report
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

    # R31-G4: resume kutoka pause (quota) — snapshot ya workspace ya jana inarejesha kwanza
    if a.restore_url:
        try:
            info = restore_snapshot(a.restore_url, a.workspace)
            print(f"[bridge] snapshot imerejesha ({info}) → {a.workspace}", flush=True)
        except Exception as e:
            sys.stderr.write(f"[bridge] restore ya snapshot imekufa: {e}\n")

    # R50-0.5 (bug-fix ya live): hooks za mpango (R46-B/R48) zinapima `workspace/plan.md` —
    # lakini plan ilikuwa /home/user/plan.md PEKEE, kwa hiyo `plan_run` ilikuwa False KILA run
    # (gate za mpango hazikuwaka kwenye production). Sasa plan.md inaingia workspace; resume ya
    # mirror/snapshot ikirudisha toleo la agent, haturudishi juu yake.
    try:
        pm = os.path.join(a.workspace, "plan.md")
        if not os.path.exists(pm):
            with open(pm, "w", encoding="utf-8") as fh:
                fh.write(plan_md)
    except Exception as e:
        sys.stderr.write(f"[bridge] plan.md workspace: {e}\n")

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
    # R32-F1: Task* tools (mrithi wa TodoWrite kwenye CLI 2.x) + subagents (idhini 06-10)
    allowed += ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskStop", "Agent", "ListAgents"]
    allowed += ["mcp__xmd-search__web_search"]
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

    # R32-B: CLAUDE.md ya project (sheria za nidhamu — inapakiwa na CLI kwenye KILA request
    # kama system-reminder, inabaki baada ya compaction). Muhakiki: ina-load bila git pia.
    try:
        cm_path = os.path.join(a.workspace, "CLAUDE.md")
        existing = ""
        if os.path.exists(cm_path):
            with open(cm_path, "r", encoding="utf-8") as fh:
                existing = fh.read()
        if "XMD Computer — Nidhamu ya Kazi" not in existing:
            with open(cm_path, "w", encoding="utf-8") as fh:
                fh.write(R32_CLAUDE_MD + (("\n\n" + existing) if existing else ""))
        # TASK-17: awamu ya milestone → mkataba wa Build Report ndani ya CLAUDE.md (block yake tu ndiyo inabadilishwa)
        if getattr(a, "milestone", ""):
            with open(cm_path, "r", encoding="utf-8") as fh:
                cur = fh.read()
            with open(cm_path, "w", encoding="utf-8") as fh:
                fh.write(with_build_report_contract(cur, a.milestone, a.workspace))  # TASK-25: receipts kwa raundi ya marekebisho
    except Exception as e:
        sys.stderr.write(f"[bridge] CLAUDE.md haikuwekwa: {e}\n")

    # R32: hali ya hooks (ushauri + brake) + MCP search server (SearXNG via Koyeb/direct)
    hook_state = HookState()
    if getattr(a, "milestone", ""):  # TASK-18: lango la on_stop kwa awamu za milestone tu
        import gate as G
        hook_state.gate_guard = G.GateGuard(a.workspace)
    xmd_hooks = build_xmd_hooks(hook_state, em, a.workspace)
    search_server = build_search_tool(a.callback_url, a.callback_token, a.session)

    # R50-Awamu 1: feature_list.json (harness inaitengeneza engine-side) — feature MOJA kwa wakati.
    fl_path = os.path.join(a.workspace, "feature_list.json")
    feature_line = (
        f"FEATURE LIST (sheria ya kazi): `{fl_path}` ipo kwenye workspace — andika/kusoma hali yake. "
        "Fanya feature MOJA kwa wakati; unaruhusiwa kubadilisha `state`/`attempts`/`evidence` PEKEE "
        "(USIBADILISHE id/title/checks/command za feature — harness inathibitisha). Feature inakuwa "
        "`passed` TU baada ya checks zake kupita kwa ushahidi halisi (command exit 0 au browser "
        "assertion iliyoonekana), si kwa tamko.\n"
        if os.path.exists(fl_path) else ""
    )
    task_prompt = (
        f"TEKELEZA MPANGO KAZI HUU (\"{a.title}\") hatua kwa hatua, kwa ukamilifu.\n\n"
        "Kumbuka: Official Data ni sheria — nakili kwa usahihi; utekeleze Verification ya kila hatua.\n"
        + feature_line
        + "Mwisho wa kila kitu, andika RIPOTI KAMILI YA KISWAHILI (live link + GitHub + majaribio + muundo + ukaguzi wa hatua).\n"
        "─────────────────────────────────────────────\n\n"
        + plan_md
    )

    # Jina la model: CLI ya Claude Code ina-validite model zake — tunatumia jina halali
    # "claude-sonnet-4-5" ILA cuBrain yetu INAIIGNORE model ya request na inaroute Gemini
    # (brain ndiyo bwana — lane/models zinatawaliwa na cu-config.json).
    #
    # R32: system_prompt ina-REPLACE system nzima (CLAUDE.md + defaults za CLI hazijumuishwi) —
    # kwa hiyo workflow inaenda kupitia extra_args append-system-prompt (bila "--"; SDK inaiongeza)
    # na CLAUDE.md ya project inapakiwa na setting_sources=["project"].
    mcp_servers = {"pw": {"command": "npx", "args": pw_args}}
    if search_server is not None:
        mcp_servers["xmd-search"] = search_server
    opts = ClaudeAgentOptions(
        model=os.environ.get("CU_SDK_MODEL", "claude-sonnet-4-5"),
        setting_sources=["project"],
        extra_args={"append-system-prompt": system_instructions},
        include_partial_messages=True,
        permission_mode="bypassPermissions",
        cwd=a.workspace,
        max_buffer_size=64 * 1024 * 1024,
        mcp_servers=mcp_servers,
        allowed_tools=allowed,
        hooks=xmd_hooks,
        # R32-F1: Task* + Agent zinaruhusiwa hapo juu. WebSearch/WebFetch za server-side za
        # Anthropic hazitekelezeki kupitia brain — search inakuja kama mcp__xmd-search__web_search.
        disallowed_tools=["WebSearch", "WebFetch"],
    )

    # R31-G4: hakuna kikomo cha steps/turns (agizo la CEO 05-10) — budget steps=0 = unlimited.
    # (R32: HAKUNA token budget — agizo la CEO 06-10 usiku: quota-pause ya LLM ipo tayari;
    #  models nyingi zinahesabiwa kwa request, si token.)
    em.emit("run_start", task=a.title, model="xmd-computer (Gemini Swap Brain)", size="kati",
             protocol="claude", budget={"steps": 0, "tokens": 0}, files=files_tree(a.workspace)[:80])

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
    pause_at_ms = 0   # R31-G4: XMD-PAUSE marker (quota ya siku imeisha) → paused_quota
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

    # R31-G5: splitter ya <thought> — tags zilizogawanyika kati ya chunks hazimwagiki tena
    def _t_text(t):
        nonlocal text_open
        if not text_open:
            text_open = True
            em.emit("text_start", step=max(step, 1))
        em.emit("text_delta", step=max(step, 1), text=t)

    def _th_open():
        nonlocal think_open, think_t0
        if not think_open:
            think_open = True
            think_t0 = time.time()
            think_streamed_steps.add(max(step, 1))
            em.emit("think_start", step=max(step, 1))

    def _th_close():
        nonlocal think_open
        if think_open:
            think_open = False
            em.emit("think_end", step=max(step, 1), ms=int((time.time() - think_t0) * 1000))

    tag_split = ThinkTagSplitter(
        on_text=_t_text,
        on_think=lambda t: em.emit("think_delta", step=max(step, 1), text=t),
        on_open=_th_open,
        on_close=_th_close,
    )

    def ensure_step():
        nonlocal step
        if step == 0:
            step = 1
            em.emit("step_start", step=1, run_step=1)
        return step

    def note_urls(txt: str, step_no: int):
        for u in our_github_urls(txt, gh_org, gh_user):
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
                    tag_split.flush()
                    if think_open:
                        think_open = False
                        em.emit("think_end", step=max(step, 1), ms=int((time.time() - think_t0) * 1000))
                    if text_open:
                        text_open = False
                        em.emit("text_end", step=max(step, 1))
                    if step == 0:
                        step = 1
                        em.emit("step_start", step=step, run_step=step)
                    elif step in tools_in_step:
                        step += 1
                        em.emit("step_start", step=step, run_step=step)
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
                        # R31-G5: splitter inashughulikia <thought>/<thinking> (zilizogawanyika pia)
                        tag_split.feed(raw_text)
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
                    tag_split.flush()
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
                            # R32-D: kwa command iliyo-fail UI inaona TAIL yenye maana
                            # (CLI yenyewe inampa model head+tail tayari — hii ni upande wa UI/ripoti)
                            chunk = shape_fail_tail(txt) if err else txt[:8000]
                            em.emit("exec_output", step=stp, id=tid, chunk=chunk)
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
                # R32-C: brake ya hooks iliwaka → status "stuck" (si "done" ya uongo)
                if hook_state.brake_fired and status == "done":
                    status = "stuck"
                pm = PAUSE_RX.search(rep or "")
                if pm:
                    pause_at_ms = int(pm.group(1))
                note_urls(rep, step)
                em.emit("finish", report=rep or "(hakuna ripoti)", partial=status != "done", status=status)
    except Exception as e:
        import traceback
        pm = PAUSE_RX.search(f"{type(e).__name__}: {e}")
        if pm:
            pause_at_ms = int(pm.group(1))
        em.emit("error", message=f"{type(e).__name__}: {str(e)[:300]}")
        sys.stderr.write(traceback.format_exc())
        status = "error"

    maybe_files(force=True)
    # R32-C: brake ya hooks iliwaka → status "stuck" (si "done" ya uongo) — UI + Endeleza
    if hook_state.brake_fired and status == "done":
        status = "stuck"
    # TASK-18: lango lilishindwa (loop guard) → PARTIAL (si "done" ya uongo); mstari unaingia kwenye Build Report
    gate_guard = getattr(hook_state, "gate_guard", None)
    if gate_guard is not None and getattr(hook_state, "gate_partial_line", "") and status == "done":
        status = "partial"
        try:
            import gate as G
            G.append_partial_to_report(a.workspace, gate_guard.cfg, hook_state.gate_partial_line)
        except Exception as e:
            sys.stderr.write(f"[bridge] gate partial line: {e}\n")
    if pause_at_ms:
        # R31-G4: quota imeisha — snapshot ya workspace ifuate Koyeb (bucket) kabla ya pause;
        # resume ya kesho inairejesha (sandbox mpya, kazi ya jana ipo).
        status = "paused_quota"
        snap = make_snapshot(a.workspace)
        if snap:
            em.emit("snapshot", big_data=snap, path="ws-snapshot.tar.gz")
        else:
            sys.stderr.write("[bridge] snapshot imeachwa (kubwa mno au tupu) — resume bila restore\n")
    tail.stop = True
    # brain (detached) inafungwa kabisa — pipes za E2B zisibaki hai.
    # (R32-fix: pattern i-ANCHOR — "python <brain_path>" — usimatchie bridge yenyewe ambayo
    #  ina "--brain <path>" kwenye cmdline yake ikiwa imepewa flag hiyo explicit.)
    if brain_proc is not None:
        try:
            brain_proc.terminate()
        except Exception:
            pass
        try:
            subprocess.run(["pkill", "-f", f"python {a.brain}"], timeout=10, capture_output=True)
        except Exception:
            pass
    em.emit("run_end", status=status, steps=step, ms=int((time.time() - BASE_TS) * 1000),
            github=sorted(gh_url_seen), deploy=sorted(vc_url_seen),
            **({"resume_at": pause_at_ms} if pause_at_ms else {}),
            **({"gate": gate_guard.summary()} if gate_guard is not None else {}))


if __name__ == "__main__":
    asyncio.run(main())
