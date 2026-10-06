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
# R32.2b: tag ILIYOFUNGULIWA isiyofungwa (hakuna </thought>) — kama ThinkTagSplitter, kila kitu
# kutoka tag hapo hadi mwisho ni thought (session 6ac4a63b na 6ac4af5e zote zilikufa hivi).
UNCLOSED_THOUGHT_RX = _re.compile(r"<(?:thought|thinking)>[\s\S]*$", _re.I)
# R33: test files (zilizoandikwa) na test runners (zilizoendeshwa)
TEST_FILE_RX = _re.compile(r"(?:^|[\\/])(?:tests?|__tests__)[\\/]|\.spec\.(?:ts|tsx|js|jsx|mjs)$|\.test\.(?:ts|tsx|js|jsx|mjs)$|_test\.(?:go|py)$|(^|[\\/])test_[^\\/]*\.py$", _re.I)
TEST_RUN_RX = _re.compile(r"\b(?:npx\s+(?:--yes\s+)?playwright\s+test|playwright\s+test|vitest|jest\b|pytest\b|npm\s+(?:run\s+)?test|npm\s+test|yarn\s+test|pnpm\s+(?:run\s+)?test|node\s+--test|go\s+test\b|cargo\s+test\b)\b", _re.I)
# R33: ripoti halisi ya Kiswahili ina alama za sehemu zake; code-dump haina
REPORT_MARK_RX = _re.compile(r"RIPOTI|Live Website|GitHub|Muhtasari|vercel\.app|github\.com|🌐|🐙|📱|📁|✅|🔗", _re.I)
CODE_LINE_RX = _re.compile(r"^\s*(?:import\s|from\s+\S+\s+import|const\s|let\s|var\s|function\s|def\s|class\s|test\(|describe\(|it\(|await\s|return\s|export\s|console\.|print\(|}\s*\)|\{|\}$|//|#include|<\?php|<!DOCTYPE|<html)", _re.IGNORECASE)
# R31-G4: snapshot ya workspace wakati wa pause (quota) — files zilirudike zero kesho
SNAP_SKIP = {"node_modules", ".git", ".playwright-mcp", ".cache", ".venv", "__pycache__", ".npm", "playwright-report", ".codeium", ".vscode"}


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
7. Hakuna kukadiriwa: kosa usilolitambua → liandike wazi kama "sijalitambua" badala ya ku-probe
   bila mpango.
"""


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
        self.cont_blocks = 0
        self.advice_given_at: dict[str, int] = {}
        # R32.2: "empty stops" — model imesimama ikiwa na <thought> pekee / bila maudhui halisi.
        # (Kosa la 6ac4a63b: call ya mwisho ilitoka lane ya dharura ikiwa thought tu — run
        #  ikaisha "done" baada ya tool 1. Sasa: thought-pekee SI mwisho halali.)
        self.empty_stops = 0
        # R33: screenshot MOJA kwa kila page/view ("picha ipo tayari" — agizo la CEO 06-10 usiku)
        self.page_url: str = ""
        self.viewport: tuple = (1280, 800)
        self.last_shot_key: tuple | None = None
        self.page_dirty: bool = True    # kitu chochote kinachobadilisha page/view tangu shot ya mwisho
        self.shot_denies: int = 0
        # R33: mabaki — tests ziliyoandikwa lazima ziendeshwe; ripoti si code-dump
        self.tests_written: bool = False
        self.tests_run: bool = False
        self.report_blocks: int = 0
        self.test_blocks: int = 0

    # ---- Bash
    def note_bash_fail(self, cmd: str, err: str) -> None:
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

    def note_answer(self, answer: str) -> dict:
        """Semantiki za query-mode: Stop hook ikirudisha {} run INAISHA — kwa hiyo "jibu lileile
        ×3" linawezekana tu kama hook yenyewe inalazimisha continuation kwanza.

        Inarudisha:
          {"brake": True}          → jibu lileile ×3 (≈90%) AU empty-stops > 6 → {"continue": false}
          {"block_reason": "..."}  → run iko stuck (ushauri haujafika / jibu linarudiwa /
                                     jibu ni thought-pekee) → {"decision": "block", "reason": …}
          {}                        → mwisho wa kawaida (jibu halisi) — run inaisha vizuri
        """
        # R32.2: jibu lenye <thought> pekee / text isiyofikia herufi 40 SI mwisho halali —
        # model (hasa lane za dharura) inaishisha "kimya" wakati kazi bado. Lazimisha aendelee.
        visible = self._visible_text(answer)
        if len(visible) < 40:
            self.empty_stops += 1
            if self.empty_stops > 6:
                self.brake_fired = True
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
            if TEST_RUN_RX.search(str(ti.get("command") or "")):
                self.tests_run = True
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

    def note_post_tool(self, name: str, ti: dict) -> None:
        """PostToolUse (R33): track page/viewport, shot iliyofanikiwa, na test files zilizoandikwa."""
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
        except Exception as e:
            sys.stderr.write(f"[bridge] hook bash_failed: {e}\n")
        return {}

    async def any_tool_ok(hook_input, tool_input, ctx):
        try:
            name = hook_input.get("tool_name") or ""
            ti = hook_input.get("tool_input") or {}
            state.note_tool_progress()   # R32.2: tool ilifanikiwa — empty-stops zianza upya
            state.note_post_tool(name, ti)   # R33: page/viewport/shot-success/tests-written
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
            verdict = state.note_answer(str(hook_input.get("last_assistant_message") or ""))
            if verdict.get("brake"):
                # Ripoti ya "NIMEKWAMA" inaandikwa na hook yenyewe (model haisikii stopReason)
                try:
                    top = sorted(state.fail_streak.items(), key=lambda kv: -kv[1])[:3]
                    why = (f"Model imesimama {state.empty_stops} mara mfululizo ikiwa na thought "
                           "pekee bila kutekeleza kazi (stop tupu)." if state.empty_stops > 6 else
                           "Jibu la mwisho limerudiwa karibu kwa usawa mara 3 — hakukuwa na maendeleo ya kutosha.")
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
                        text="Jibu lilelile ×3 — run imesimamishwa (ripoti: STATUS.md). "
                             "▶ Endeleza inaanza na hali iliyohifadhiwa.")
                return {"continue": False,
                        "stopReason": "XMD-BRAKE: jibu lilelile mara 3 — hakuna maendeleo."}
            if verdict.get("block_reason"):
                # ushauri unamfika model kama reason ya kulazimisha kuendelea (si block ya kitu
                # chochote — ni "endelea kazi" + ushauri wa nidhamu; max 2 kwa run)
                em.emit("xmd_hook", kind="continue", text=str(verdict["block_reason"])[:500])
                return {"decision": "block", "reason": verdict["block_reason"]}
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
    except Exception as e:
        sys.stderr.write(f"[bridge] CLAUDE.md haikuwekwa: {e}\n")

    # R32: hali ya hooks (ushauri + brake) + MCP search server (SearXNG via Koyeb/direct)
    hook_state = HookState()
    xmd_hooks = build_xmd_hooks(hook_state, em, a.workspace)
    search_server = build_search_tool(a.callback_url, a.callback_token, a.session)

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
            **({"resume_at": pause_at_ms} if pause_at_ms else {}))


if __name__ == "__main__":
    asyncio.run(main())
