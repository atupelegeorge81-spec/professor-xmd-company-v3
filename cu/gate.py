"""cu/gate.py — TASK 18 (maelezo18): COMPLETION GATE — hakuna "done" bila ushahidi.

Inatumika na bridges ZOTE mbili kwa awamu za MILESTONE tu (--milestone Mk):
  • cu/bridge.py  (claude backend) → hook ya `on_stop` inazuia kusimama;
  • cu/oh_bridge.py (OpenHands, backend ya sasa) → baada ya judge "complete", agent anarudishiwa ujumbe wa block.

Masharti (kila moja linathibitishwa na hook YENYEWE kwa amri halisi ndani ya sandbox — maneno ya agent hayaaminiwi):
  a. Build Report `.xmd/reports/<Mk>-build-report.md` ipo na sheria za parseBuildReport (task 17) zinapita;
  b. `git status --porcelain` ni tupu NA kuna commit ≥1 tangu milestone ilipoanza (baseCommit);
  c. buildCommand ya plan (`.xmd/startpack.json`) inatoka exit 0;
  d. requiresTests → testCommand inaendeshwa na hook na inatoka exit 0.

Loop guard: blocks 3 mfululizo bila maendeleo (hakuna commit mpya wala badiliko la ripoti) → kusimama kunaruhusiwa
kama PARTIAL (`PARTIAL: gate failed: <list>`) — kamwe si mafanikio ya uongo. Pure: I/O ya amri ni `run` (inaweza kudungwa).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from typing import Callable, Optional

STARTPACK_JSON = ".xmd/startpack.json"
MAX_STALLED_BLOCKS = 3      # spec: blocks 3 mfululizo bila maendeleo → PARTIAL
MAX_TOTAL_BLOCKS = 10       # kinga: maendeleo madogo yasiyoisha hayazungushi milele
CMD_TIMEOUT_S = 600

HEADINGS = (
    "1 Summary",
    "2 Files created or changed",
    "3 Commands run and results",
    "4 Tests run",
    "5 Decisions and deviations from the plan",
    "6 Security notes",
    "7 Known problems / technical debt",
    "8 Risks for the next milestone",
)

Runner = Callable[[str, str, int], "tuple[int, str]"]


def run_cmd(cmd: str, cwd: str, timeout: int = CMD_TIMEOUT_S) -> "tuple[int, str]":
    """Amri halisi (bash -lc) → (exit code, mkia wa output). Timeout = 124 (kama coreutils)."""
    try:
        p = subprocess.run(["bash", "-lc", cmd], cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, ((p.stdout or "") + (p.stderr or ""))[-1500:]
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"
    except Exception as e:  # noqa: BLE001
        return 127, f"{type(e).__name__}: {e}"


def report_path(milestone: str) -> str:
    return f".xmd/reports/{milestone}-build-report.md"


# ------------------------------------------------------------------ (a) Build Report (sawa na buildReport.ts)
_EXIT_RE = re.compile(r"\bexit(?:[ _-]?code)?\s*(?:[:=]|is)?\s*`?(-?\d{1,3})\b", re.I)
_ITEM_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.*)$")
_PATH_RE = re.compile(r"^[\w@.\-/\[\]()+]+$")
_WS_PREFIX = re.compile(r"^(?:/home/user/ws/|\./)")


def _path_of(line: str) -> Optional[str]:
    m = _ITEM_RE.match(line)
    if not m:
        return None
    tick = re.search(r"`([^`]+)`", m.group(1))
    p = (tick.group(1) if tick else (m.group(1).split() or [""])[0]).strip().rstrip(",:;")
    p = _WS_PREFIX.sub("", p)
    if not p or not _PATH_RE.match(p):
        return None
    if "/" not in p and not re.search(r"\.[A-Za-z0-9]{1,10}$", p) and not re.match(r"^[A-Z][A-Za-z]*file$", p):
        return None
    return p


def parse_build_report(md: str) -> dict:
    """Muundo wa Build Report → {ok, errors, paths, commands} (sheria zilezile za parseBuildReport ya TS)."""
    lines = (md or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    found: list[tuple[str, int]] = []
    in_fence = False
    for i, l in enumerate(lines):
        if re.match(r"^\s*```", l):
            in_fence = not in_fence
        if in_fence:
            continue
        m = re.match(r"^##\s+(?!#)(.+?)\s*#*\s*$", l)
        if m:
            found.append((re.sub(r"\s+", " ", m.group(1)).strip(), i))
    errors: list[str] = []
    sections: dict[str, str] = {}
    heads = [f[0] for f in found]
    for h in HEADINGS:
        if h not in heads:
            errors.append(f'missing heading "## {h}"')
            continue
        k = heads.index(h)
        end = found[k + 1][1] if k + 1 < len(found) else len(lines)
        sections[h] = "\n".join(lines[found[k][1] + 1:end]).strip()
    present = [h for h in HEADINGS if h in sections]
    for a, b in zip(present, present[1:]):
        if heads.index(b) < heads.index(a):
            errors.append(f'heading out of order: "## {b}" appears before "## {a}"')
    for h in present:
        if not re.sub(r"[-*_`\s]", "", sections[h]):
            errors.append(f'empty section "## {h}"')
    commands = []
    s3 = sections.get(HEADINGS[2])
    if s3:
        commands = [l for l in s3.split("\n") if _EXIT_RE.search(l)]
        if not commands:
            errors.append(f'section "## {HEADINGS[2]}" has no command line with an exit code')
    paths: list[str] = []
    s2 = sections.get(HEADINGS[1])
    if s2:
        for l in s2.split("\n"):
            p = _path_of(l)
            if p and p not in paths:
                paths.append(p)
        if not paths:
            errors.append(f'section "## {HEADINGS[1]}" lists no file paths')
    return {"ok": not errors, "errors": errors, "paths": paths, "commands": commands}


# ------------------------------------------------------------------ config + tathmini
def load_config(ws: str) -> dict:
    """`.xmd/startpack.json` (engine inaiandika kila awamu ya milestone). Haipo → {} (gate inaripoti)."""
    try:
        with open(os.path.join(ws, STARTPACK_JSON), "r", encoding="utf-8") as fh:
            d = json.load(fh)
        return d if isinstance(d, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _short(s: str, n: int = 220) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def evaluate(ws: str, cfg: dict, run: Runner = run_cmd) -> dict:
    """Tathmini masharti a–d. → {passed, failed:[...], notes:[...], checks:{...}}. Kila kosa ni sentensi moja wazi."""
    failed: list[str] = []
    notes: list[str] = []
    checks: dict[str, object] = {}
    mk = str(cfg.get("milestoneId") or "")

    # (a) Build Report
    rp = report_path(mk) if mk else ".xmd/reports/<milestone>-build-report.md"
    full = os.path.join(ws, rp)
    if not mk:
        failed.append("startpack: .xmd/startpack.json is missing or has no milestoneId")
        checks["report"] = "no-config"
    elif not os.path.isfile(full):
        failed.append(f"build report: file {rp} does not exist — write it with the 8 required headings")
        checks["report"] = "missing"
    else:
        with open(full, "r", encoding="utf-8", errors="replace") as fh:
            pr = parse_build_report(fh.read())
        checks["report"] = "ok" if pr["ok"] else pr["errors"]
        if not pr["ok"]:
            failed.append(f"build report: {rp} breaks the contract — " + "; ".join(pr["errors"][:6]))

    # (b) git: tree safi + commit ≥1 tangu mwanzo wa milestone
    code, out = run("git status --porcelain", ws, 60)
    if code != 0:
        failed.append(f"git: `git status --porcelain` failed (exit {code}): {_short(out, 160)}")
        checks["git"] = "error"
    else:
        dirty = [l[3:] for l in out.splitlines() if l.strip()]
        base = str(cfg.get("baseCommit") or "")
        rc, rout = run(f"git rev-list --count {base}..HEAD" if base else "git rev-list --count HEAD", ws, 60)
        try:
            n = int((rout or "").strip().split()[-1]) if rc == 0 else 0
        except (ValueError, IndexError):
            n = 0
        checks["git"] = {"dirty": dirty[:20], "commitsSinceStart": n}
        if dirty:
            failed.append(f"git: uncommitted changes ({len(dirty)}): {', '.join(dirty[:6])} — commit your work (git add -A && git commit -m ...)")
        if n < 1:
            failed.append("git: no commit since this milestone started — commit the milestone work")

    # (c) build command ya plan
    bc = str(cfg.get("buildCommand") or "").strip()
    if not bc:
        notes.append("build: plan has no Build Command — condition (c) not applicable")
        checks["build"] = "n/a"
    else:
        code, out = run(bc, ws, CMD_TIMEOUT_S)
        checks["build"] = {"command": bc, "exit": code}
        if code != 0:
            failed.append(f"build: `{bc}` exited {code} — {_short(out)}")

    # (d) tests (plan ikidai)
    if cfg.get("requiresTests"):
        tc = str(cfg.get("testCommand") or "").strip()
        if not tc:
            failed.append("tests: the plan requires tests but has no Test Command")
            checks["tests"] = "missing-command"
        else:
            code, out = run(tc, ws, CMD_TIMEOUT_S)
            checks["tests"] = {"command": tc, "exit": code}
            if code != 0:
                failed.append(f"tests: `{tc}` exited {code} — {_short(out)}")
    else:
        checks["tests"] = "not-required"

    return {"passed": not failed, "failed": failed, "notes": notes, "checks": checks}


def _failure_key(f: str) -> str:
    """Kiini cha failure bila output inayobadilika (sehemu kabla ya ' — ')."""
    return f.split(" — ", 1)[0].strip()


def progress_signature(ws: str, cfg: dict, run: Runner = run_cmd, failed: Optional[list] = None) -> str:
    """Maendeleo HALISI (TASK-18, uamuzi): (1) orodha ya failures imebadilika, AU (2) tree ya HEAD imebadilika
    nje ya Build Report (kazi mpya iliyocommitiwa), AU (3) Build Report imebadilika WAKATI failure ya ripoti ipo.
    Commit ya ripoti peke yake / commit tupu haihesabiwi — real run T4 ilionyesha agent anaweza kuzungusha
    kaunta kwa mabadiliko ya mapambo ya ripoti."""
    mk = str(cfg.get("milestoneId") or "")
    rp = report_path(mk)
    keys = sorted(_failure_key(f) for f in (failed or []))
    h = hashlib.sha1()
    h.update("\n".join(keys).encode())
    _, tree = run("git ls-tree -r HEAD 2>/dev/null || true", ws, 30)
    work = [ln for ln in (tree or "").splitlines() if not ln.endswith("\t" + rp)]
    h.update(b"\0tree\0" + "\n".join(work).encode())
    if any(k.startswith("build report:") for k in keys):
        try:
            with open(os.path.join(ws, rp), "rb") as fh:
                h.update(b"\0report\0" + fh.read())
        except Exception:  # noqa: BLE001
            h.update(b"<no-report>")
    return h.hexdigest()


def block_message(res: dict, block_no: int, stalled: int) -> str:
    left = MAX_STALLED_BLOCKS - stalled
    return (
        "XMD COMPLETION GATE — you cannot finish yet. The harness ran its own checks in the workspace "
        "and these conditions FAILED:\n"
        + "\n".join(f"- {f}" for f in res["failed"])
        + "\n\nFix every item above in the project itself, commit, then finish again. Do not argue or grade yourself; "
        "the harness measures. Never tamper with the environment or the harness to make a check pass (no mount, "
        "no editing /proc or system paths, no changing .xmd/startpack.json or the commands) — that is cheating. "
        "If a check truly cannot pass, say so in the Build Report and finish again: the milestone then ends "
        "PARTIAL honestly. "
        f"(gate block {block_no}; {max(left, 0)} more block(s) without real progress — a fixed check or newly "
        "committed project work — and the milestone ends PARTIAL.)"
    )


def partial_line(res: dict) -> str:
    return "PARTIAL: gate failed: " + "; ".join(res.get("failed") or ["unknown"])


class GateGuard:
    """Hali ya lango kwa run moja (blocks + loop guard). check() → ("pass" | "block" | "partial", res, message)."""

    def __init__(self, ws: str, cfg: Optional[dict] = None, run: Runner = run_cmd,
                 max_stalled: int = MAX_STALLED_BLOCKS, max_total: int = MAX_TOTAL_BLOCKS):
        self.ws, self.cfg, self.run = ws, (cfg if cfg is not None else load_config(ws)), run
        self.max_stalled, self.max_total = max_stalled, max_total
        self.blocks = 0
        self.stalled = 0
        self.last_sig: Optional[str] = None
        self.result: Optional[dict] = None
        self.verdict: str = ""

    def check(self) -> "tuple[str, dict, str]":
        res = evaluate(self.ws, self.cfg, self.run)
        self.result = res
        if res["passed"]:
            self.verdict = "pass"
            return "pass", res, ""
        sig = progress_signature(self.ws, self.cfg, self.run, res["failed"])
        if self.last_sig is None or sig != self.last_sig:
            self.stalled = 0          # maendeleo tangu block iliyopita (au block ya kwanza)
        self.last_sig = sig
        if self.stalled >= self.max_stalled or self.blocks >= self.max_total:
            self.verdict = "partial"
            return "partial", res, partial_line(res)
        self.stalled += 1
        self.blocks += 1
        self.verdict = "block"
        return "block", res, block_message(res, self.blocks, self.stalled)

    def summary(self) -> dict:
        r = self.result or {}
        return {
            "passed": self.verdict == "pass",
            "partial": self.verdict == "partial",
            "evaluated": self.result is not None,
            "blocks": self.blocks,
            "failed": list(r.get("failed") or [])[:12],
            "notes": list(r.get("notes") or [])[:6],
            "checks": r.get("checks") or {},
        }


def append_partial_to_report(ws: str, cfg: dict, line: str) -> None:
    """Mstari wa PARTIAL unaandikwa ndani ya Build Report (ikiwepo) — ukweli unasafiri na ripoti."""
    mk = str(cfg.get("milestoneId") or "")
    if not mk:
        return
    p = os.path.join(ws, report_path(mk))
    try:
        if os.path.isfile(p):
            with open(p, "a", encoding="utf-8") as fh:
                fh.write(f"\n\n{line}\n")
    except Exception:  # noqa: BLE001
        pass
