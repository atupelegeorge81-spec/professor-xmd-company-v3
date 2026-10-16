"""cu/oh_util.py — R51 · utilities za oh_bridge (stdlib TU — testable local, bila SDK).

Yaliyomo:
  • build_objective  — objective ya run_goal (judge contract) kutoka plan.md
  • classify_fail    — exception → kind (rate_limited/server_error/timeout/…)+retry_after
  • extract_usage    — token-usage kutoka LLMResponse ya SDK (defensive — schema inabadilika)
  • shots_pending    — screenshot mpya kutoka registry ya shotlaw (bado hazijatumiwa UI)
  • read_shot_b64    — faili ya picha → base64 (≤ cap)
  • first_words      — muhtasari salama wa action/observation kwa events
"""
from __future__ import annotations

import base64
import re

import shotlaw

# --------------------------------------------------------------------- objective ya judge
STEP_RX = re.compile(r"^#{1,4}\s*(?:Step|Hatua)\s*(\d+)\s*[—\-:.]\s*(.+)$", re.I | re.M)
VERIFY_RX = re.compile(r"\*\*Verification:?\*\*\s*`?([^`\n]+)`?", re.I)


def _extract_steps(plan_md: str) -> list[str]:
    out = []
    for m in STEP_RX.finditer(plan_md or ""):
        out.append(f"Step {m.group(1)} — {m.group(2).strip()}")
    return out


def _extract_verifications(plan_md: str) -> list[str]:
    return [m.group(1).strip() for m in VERIFY_RX.finditer(plan_md or "")]


def build_objective(title: str, plan_md: str, evidence_dir: str = ".xmd/shots") -> str:
    """Objective ya run_goal: judge lazima athibitishe USHAHIDI, si madai.

    Inajumuisha steps zote + Verification commands VIVYO HIVYO (verbatim) — ndiyo
    sababu hatucheat: judge anakagua transcript kwa orodha hii halisi."""
    steps = _extract_steps(plan_md)
    vers = _extract_verifications(plan_md)
    parts = [
        f'OBJECTIVE YA MKATABA: "{title}" — mpango umehifadhiwa kwenye plan.md umetekelezwa '
        'KIKAMILIFU, kwa ushahidi halisi.',
        '',
        'HATUA ZOTE ZINAPASWA KUWA ZIMEKAMILIKA (kwa mpangilio wa plan.md):',
    ]
    if steps:
        parts += [f"  {i+1}. {s}" for i, s in enumerate(steps)]
    else:
        parts.append("  (plan.md haina vyeti vya hatua vilivyoonekana — kagua ripoti ya mwisho).")
    if vers:
        parts += ['', 'VERIFICATION COMMANDS ZA KILA HATUA (zinapaswa kuwa zimeendeshwa na KUPITA):']
        parts += [f"  • `{v}`" for v in vers]
    parts += [
        '',
        'VIPIMA VYAKO (judge — mark COMPLETE tu vipimo hivi vikithibitishwa kwenye transcript):',
        '  a) Kila hatua hapo juu ina USHAHIDI halisi kwenye transcript: command output yenye '
        '     exit 0, faili lililoandikwa na kusomwa, au assertion iliyopita — SI tamko la agent.',
        '  b) Verification commands zimeendeshwa baada ya kazi husika, na zimepita.',
        '  c) Ikiwa mpango ulitaka deliverable (website/app), kuna ushahidi kuwa INAFANYA KAZI '
        '     (server ilisimama, ukurasa umefunguliwa, content halisi imeonekana).',
        f'  d) Screenshots za deliverable zipo chini ya {evidence_dir}/ (shotlaw registry).',
        '  e) Ripoti ya mwisho ya Kiswahili imeandikwa (live link/GitHub kama zimetakiwa).',
        '',
        'Mark INCOMPLETE ikikosa hata kimoja — kwa sababu agent hana ruhusa ya kumaliza kwa madai.',
    ]
    return "\n".join(parts)


# --------------------------------------------------------------------- makosa → lane kind
RETRY_AFTER_RX = re.compile(r"retry[- ]after[=: ]+(\d+(?:\.\d+)?)", re.I)


def _status_of(exc: BaseException) -> int | None:
    for attr in ("status_code", "status", "code"):
        v = getattr(exc, attr, None)
        if isinstance(v, int) and 100 <= v < 600:
            return v
        if isinstance(v, str) and v.isdigit() and 100 <= int(v) < 600:
            return int(v)
    resp = getattr(exc, "response", None)
    if resp is not None:
        v = getattr(resp, "status_code", None)
        if isinstance(v, int):
            return v
    return None


def _retry_after_of(exc: BaseException) -> float | None:
    headers = getattr(getattr(exc, "response", None), "headers", None) or {}
    try:
        if hasattr(headers, "get"):
            v = headers.get("retry-after") or headers.get("Retry-After")
            if v:
                return float(v)
    except (TypeError, ValueError):
        pass
    m = RETRY_AFTER_RX.search(str(exc))
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def classify_fail(exc: BaseException) -> tuple[str, float | None]:
    """kind zinazoendana na lanes.note_fail: rate_limited | server_error | timeout |
    pool_busy | empty. 401/403 → server_error (lane icheze pwa muda mrefu)."""
    ra = _retry_after_of(exc)
    st = _status_of(exc)
    if st == 429:
        return "rate_limited", ra
    if st is not None and 500 <= st < 600:
        return "server_error", ra
    if st in (401, 403):
        return "server_error", ra
    txt = f"{type(exc).__name__}: {exc}".lower()
    if "timed out" in txt or "timeout" in txt or "deadline" in txt:
        return "timeout", ra
    if "connection" in txt or "dns" in txt or "unreachable" in txt:
        return "server_error", ra
    if "rate limit" in txt or "too many" in txt:
        return "rate_limited", ra
    if "empty" in txt or "no content" in txt:
        return "empty", ra
    return "server_error", ra


# --------------------------------------------------------------------- usage ya SDK
def _num(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def extract_usage(resp) -> tuple[int, int]:
    """(prompt, completion) kutoka LLMResponse — schema za SDK hubadilika; defensive.

    Njia zinazojaribiwa kwa mpangilio:
      resp.metrics.accumulated_token_usage / .token_usage → prompt_tokens/completion_tokens
      resp.raw_response (OpenAI-shaped) → usage.prompt_tokens/completion_tokens
    """
    metrics = getattr(resp, "metrics", None)
    for holder in (metrics, getattr(metrics, "accumulated_token_usage", None),
                   getattr(metrics, "token_usage", None)):
        if holder is None:
            continue
        p = getattr(holder, "prompt_tokens", None)
        c = getattr(holder, "completion_tokens", None)
        if p is None and isinstance(holder, dict):
            p, c = holder.get("prompt_tokens"), holder.get("completion_tokens")
        if p is None:
            p = getattr(holder, "input_tokens", None) or (holder.get("input_tokens") if isinstance(holder, dict) else None)
        if c is None:
            c = getattr(holder, "output_tokens", None) or (holder.get("output_tokens") if isinstance(holder, dict) else None)
        if p is not None or c is not None:
            return _num(p), _num(c)
    raw = getattr(resp, "raw_response", None)
    usage = getattr(raw, "usage", None)
    if usage is None and isinstance(raw, dict):
        usage = raw.get("usage")
    if usage is not None:
        if isinstance(usage, dict):
            return _num(usage.get("prompt_tokens")), _num(usage.get("completion_tokens"))
        return _num(getattr(usage, "prompt_tokens", None)), _num(getattr(usage, "completion_tokens", None))
    return 0, 0


# --------------------------------------------------------------------- screenshots (shotlaw)
def shots_pending(ws: str, emitted: set[str]) -> list[dict]:
    """Registry → records zilizo bado hazijatumwa (zina faili halisi disk)."""
    import os
    reg = shotlaw.load(ws)
    out = []
    for rec in shotlaw.pending(reg, emitted):
        p = rec.get("path") or ""
        full = os.path.join(ws, p)
        if p and os.path.isfile(full):
            rec2 = dict(rec)
            rec2["abs"] = full
            out.append(rec2)
    return out


def read_shot_b64(path: str, cap: int = 4 * 1024 * 1024) -> str | None:
    import os
    try:
        if os.path.getsize(path) > cap:
            return None
        with open(path, "rb") as fh:
            return base64.b64encode(fh.read()).decode()
    except OSError:
        return None


# --------------------------------------------------------------------- muhtasari salama
def first_words(text: str, limit: int = 180) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    return t[:limit]


def action_command(action) -> str:
    """Amri/path ya action kwa exec chip — kutoka fields za kawaida za OpenHands."""
    for attr in ("command", "path", "file_path", "url", "query"):
        v = getattr(action, attr, None)
        if isinstance(v, str) and v.strip():
            return v.strip()[:400]
    s = str(action)
    return first_words(s, 400)


# --------------------------------------------------------------------- thinking (Task 3b)
# Probe-iliyothibitishwa (2026-10-16): models za roster hurudisha "akili" kwa namna 4:
#   1) message.reasoning_content            (Uno nemotron-3-super, laguna)
#   2) reasoning / reasoning_details        (OpenRouter-style — litellm → reasoning_content)
#   3) <think>…</think> INLINE kwenye content (Uno minimax-m2.7 — hii ndiyo ilivuja kwenye card)
#      + <thought>…</thought> (Gemini include_thoughts), <thinking>…</thinking>
#   4) tool-call iliyoandikwa kama JSON ya TEXT (nemotron-3-super) — si jibu, ifichwe
_THINK_OPEN = ("<think>", "<thinking>", "<thought>")
_THINK_CLOSE = ("</think>", "</thinking>", "</thought>")
_GAP_RX = re.compile(r"\n[ \t]*\n[ \t]*\n")  # minimax: </think> hupotea, hubaki pengo la mistari 3


def split_think(text: str) -> tuple[str, str]:
    """content → (thinking, visible). Inashughulikia: block kamili; `</think>` pekee mwanzoni
    (template iliweka <think> kwenye prompt); na `<think>` ISIYOFUNGWA — minimax kwenye tool
    mode (E2B probe 2026-10-16): `<think>mawazo\n\n\nJibu` → mawazo yanaishia kwenye pengo
    la mistari 3; bila pengo → yote ni thinking."""
    s = text or ""
    if not s:
        return "", ""
    thinking: list[str] = []
    visible: list[str] = []
    low = s.lower()
    first_open = min([p for p in (low.find(t) for t in _THINK_OPEN) if p >= 0] or [len(s)])
    closes = [(p, t) for t in _THINK_CLOSE if (p := low.find(t)) >= 0]
    if closes and min(closes)[0] < first_open:
        p, t = min(closes)
        thinking.append(s[:p])
        s = s[p + len(t):]
    while s:
        low = s.lower()
        opens = [(p, t) for t in _THINK_OPEN if (p := low.find(t)) >= 0]
        if not opens:
            visible.append(s)
            break
        p, t = min(opens)
        visible.append(s[:p])
        rest = s[p + len(t):]
        close = "</" + t[1:]
        q = rest.lower().find(close)
        if q >= 0:
            thinking.append(rest[:q])
            s = rest[q + len(close):]
            continue
        g = _GAP_RX.search(rest)
        if g:
            thinking.append(rest[:g.start()])
            s = rest[g.end():]
            continue
        thinking.append(rest)
        break
    vis = re.sub(r"</?(think|thinking|thought)>", "", "".join(visible), flags=re.I)
    th = "\n\n".join(t.strip() for t in thinking if t and t.strip())
    return th, re.sub(r"[ \t]{2,}", " ", vis).strip()


def reasoning_of(obj) -> str:
    """reasoning_content + thinking_blocks (Anthropic-style) ya ActionEvent/Message — defensive."""
    parts: list[str] = []
    rc = getattr(obj, "reasoning_content", None)
    if isinstance(rc, str) and rc.strip():
        parts.append(rc.strip())
    for b in getattr(obj, "thinking_blocks", None) or []:
        t = getattr(b, "thinking", None)
        # Gemini native: thinking_block ni nakala ya reasoning_content — usirudie
        if isinstance(t, str) and t.strip() and not any(t.strip() in x for x in parts):
            parts.append(t.strip())
    return "\n\n".join(parts)


_TOOLISH_KEYS = ('"action"', '"command"', '"tool"', '"name"', '"arguments"', '"path"', '"is_background"')


def is_text_toolcall(text: str) -> bool:
    """Lane dhaifu huandika tool-call kama JSON ya TEXT (finish=stop, hakuna tool_calls).
    Kweli ikiwa jibu lote ni object ya JSON (au ```json block) yenye keys za tool."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t).strip()
    if not (t.startswith("{") or t.startswith("[{")):
        return False
    head = t[:300]
    return any(k in head for k in _TOOLISH_KEYS)
