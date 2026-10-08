"""cu/brain.py — GEMINI SWAP BRAIN ya "XMD Computer" (Awamu A ya R31).

Proxy ndogo ya Anthropic Messages API inayoendesha NDANI ya sandbox ya E2B.
Claude Agent SDK (CLI) inaunganisha ANTHROPIC_BASE_URL=http://localhost:4010 kwake;
brain inaroute kwa providers zetu zote kwa lugha ya OpenAI chat/completions:

  KAWAIDA  : Gemini tu — flash kubwa → ndogo, keys zote mbili (gemini-1/2), kisha flash-lite.
  DHARURA  : lanes ZOTE za Gemini zikiisha (siku ya Pacific) → XKiro → OpenRouter → Groq → Uno
             (akili kubwa kwanza). Ikishalingana dharura inakaa hadi run inaisha.
  503/429/empty: kila jaribio lililoshindikana ni KIMYA — lane inayofuata inachukuliwa; UI
             haiona kitu (uamuzi #7 wa CEO). Fatal tu (lanes zote zimekufa) ndiyo kosa.

Matumizi: kila call inaandikwa /home/user/brain-usage.jsonl (lane, model, prompt/completion
tokens) — bridge inasoma na ku-POST kwa Koyeb ili meters za /api/usage/accounts zisibaki na shimo.

Stdlib TU (hakuna pip) — ThreadingHTTPServer + urllib. Python 3.9+.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_TS = time.time()
LOG_LOCK = threading.Lock()
USAGE_LOCK = threading.Lock()

DEFAULT_PORT = 4010
UPSTREAM_CONNECT_TIMEOUT = 20
UPSTREAM_READ_TIMEOUT = 240
GATE_MAX_WAIT = 90_000        # ms — kusubiri lane za Gemini zilizopo dakika-cooling kabla ya dharura
EMERGENCY_MAX_WAIT = 120_000  # ms — kusubiri lanes za dharura zilizo cooling
STICKY_MAX_WAIT_MS = 25_000   # ms — R34-A: kosa la dakika la sticky lane: subiri kimya chini ya hii, vingine shuka
MAX_ATTEMPTS = 24             # jaribio kwa ombi moja kabla ya fatal
IDLE_ABORT_MS = 180_000       # hakuna data kutoka upstream → lane inahisiwa imekufa
# R38-RC1: kikomo cha JUMLA cha stream moja (data inafika lakini stream haikomi kamwe —
# generator usio na mwisho). 15 dk = kutosha kwa jibu kubwa (65K tokens); baada yake lane
# inahisiwa busy na inarudiwa kwenye nyingine.
STREAM_MAX_MS = 900_000
XKIRO_MIN_REMAINING = 15_000  # tokens — chini ya hii, XKiro inarukwa kimya ("kama kuna nafasi")


def blog(level: str, msg: str) -> None:
    """Log ya brain (stdout ya sandbox — inasomwa na Koyeb kama logs za ziada)."""
    line = f"[cuBrain {time.strftime('%H:%M:%S')}] [{level}] {msg}"
    with LOG_LOCK:
        try:
            sys.stdout.write(line + "\n")
            sys.stdout.flush()
        except Exception:
            pass


# ================================================================ siku ya Pacific (Google)

try:
    from zoneinfo import ZoneInfo

    _PT = ZoneInfo("America/Los_Angeles")
except Exception:  # tzdata haipo → approximation ya UTC-8 (DST ya Dakika chache tu)
    _PT = None

import datetime as _dt


def _pt_now(t: float) -> _dt.datetime:
    if _PT is not None:
        return _dt.datetime.fromtimestamp(t, _PT)
    return _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=8)


def pacific_day(t: float | None = None) -> str:
    """Siku ya Pacific (Google inareset RPD saa 6 usiku LA)."""
    p = _pt_now(t if t is not None else time.time())
    return f"{p.year:04d}-{p.month:02d}-{p.day:02d}"


def next_pacific_midnight(t: float | None = None) -> int:
    """Ms uliojalo siku mpya ya Pacific inaanza (ms epoch)."""
    now = t if t is not None else time.time()
    p = _pt_now(now)
    # tukise hadi usiku wa kesho ya Pacific: tunapima tofauti ya UTC vs PT kwenye saa hii
    utc = _dt.datetime.fromtimestamp(now, _dt.timezone.utc)
    offset = utc - p.replace(tzinfo=_dt.timezone.utc) if _PT is not None else _dt.timedelta(hours=8)
    tomorrow = _dt.datetime(p.year, p.month, p.day) + _dt.timedelta(days=1)
    return int((tomorrow - _dt.datetime(1970, 1, 1)).total_seconds() * 1000 + offset.total_seconds() * 1000)


def utc_day(t: float | None = None) -> str:
    return _dt.datetime.fromtimestamp(t if t is not None else time.time(), _dt.timezone.utc).strftime("%Y-%m-%d")


def next_utc_midnight(t: float | None = None) -> int:
    now = t if t is not None else time.time()
    d = _dt.datetime.fromtimestamp(now, _dt.timezone.utc)
    nxt = _dt.datetime(d.year, d.month, d.day, tzinfo=_dt.timezone.utc) + _dt.timedelta(days=1)
    return int(nxt.timestamp() * 1000)


def parse_duration(v: str | None) -> int | None:
    """"1m26.4s" / "255ms" / "30s" / "2h" → ms (ileile ya usageLedger.ts)."""
    if not v:
        return None
    s = str(v).strip()
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return round(float(s) * 1000)
    ms, hit = 0, False
    for m in re.finditer(r"(\d+(?:\.\d+)?)(ms|h|m|s)", s):
        hit = True
        n = float(m.group(1))
        ms += n * 3_600_000 if m.group(2) == "h" else n * 60_000 if m.group(2) == "m" else n * 1000 if m.group(2) == "s" else n
    return round(ms) if hit else None


# ================================================================ lanes

class Lane:
    """Njia moja halisi: (akaunti × model). `tier`="normal" (Gemini) | "emergency"."""

    __slots__ = ("id", "provider", "account", "model", "base", "key", "max_out", "ctx",
                 "tier", "rank", "reasoning", "rpm")

    def __init__(self, provider, account, model, base, key, max_out, ctx, tier, rank=0, reasoning=False, rpm=0):
        self.id = f"{account}:{model}"
        self.provider = provider
        self.account = account
        self.model = model
        self.base = base.rstrip("/")
        self.key = key
        self.max_out = max_out
        self.ctx = ctx
        self.tier = tier
        self.rank = rank
        self.reasoning = reasoning
        self.rpm = rpm

    def label(self) -> str:
        return f"{self.account} · {self.model}"


class LaneState:
    """Hali ya lane moja ndani ya run hii (quota snapshot + matukio ya brain)."""

    __slots__ = ("exhausted_until", "retry_at", "busy_until", "requests_today", "rpd_limit",
                 "rpm_calls", "xkiro_remaining", "disabled", "empty_fails", "tokens", "day")

    def __init__(self):
        self.exhausted_until = 0
        self.retry_at = 0
        self.busy_until = 0
        self.requests_today = 0
        self.rpd_limit = 0
        self.rpm_calls: list[float] = []
        self.xkiro_remaining = None
        self.disabled = False
        self.empty_fails = 0
        self.tokens = 0
        self.day = ""


def _model_size(m: str) -> float:
    """Ukubwa wa "akili" kutoka jina la model (120b > 27b > 8b) — dharura: kubwa kwanza."""
    best = 0.0
    for mm in re.finditer(r"(\d+(?:\.\d+)?)\s*b\b", m.lower()):
        best = max(best, float(mm.group(1)))
    return best


def build_order(cfg: dict) -> list[Lane]:
    """Mpangilio wa uteuzi (uamuzi #5+#6 wa CEO):
    Gemini flash kubwa→ndogo (akaunti 1 kisha 2 kwa kila model) → flash-lite →
    dharura: XKiro → OpenRouter → Groq (kubwa→ndogo) → UnoRouter."""
    lanes: list[Lane] = []
    gem = cfg.get("gemini") or {}
    keys: dict[str, str] = gem.get("keys") or {}
    flash: list[str] = gem.get("flashModels") or []
    lite: list[str] = gem.get("liteModels") or []
    base = gem.get("baseUrl") or "https://generativelanguage.googleapis.com/v1beta/openai"
    flash_rpm = int(gem.get("flashRpm") or 5)
    lite_rpm = int(gem.get("liteRpm") or 15)
    # R38: (akaunti × model) zilizo 404 "no longer available to new users" — hazizalishwi kabisa
    # (mf. gemini-2:gemini-2.5-flash — live probe 08-10; gemini-1 inabaki nayo)
    skip = gem.get("modelSkip") or {}
    rank = 0
    for model in flash:
        for acct in ("gemini-1", "gemini-2"):
            if model in (skip.get(acct) or []):
                continue
            k = keys.get(acct)
            if k:
                lanes.append(Lane("gemini", acct, model, base, k, 65_536, 1_000_000, "normal", rank, False, flash_rpm))
        rank += 1
    rank = 100
    for model in lite:
        for acct in ("gemini-1", "gemini-2"):
            if model in (skip.get(acct) or []):
                continue
            k = keys.get(acct)
            if k:
                lanes.append(Lane("gemini", acct, model, base, k, 65_536, 1_000_000, "normal", rank, False, lite_rpm))
        rank += 1
    # dharura — kwa mpangilio wa "akili kubwa kwanza" ndani ya kila provider
    for prov in cfg.get("emergency") or []:
        p = prov.get("provider") or ""
        base = (prov.get("baseUrl") or "").rstrip("/")
        keys = prov.get("keys") or {}
        models = list(prov.get("models") or [])
        if p == "groq":
            models.sort(key=_model_size, reverse=True)  # gpt-oss-120b kabla ya 27b
        for model in models:
            for acct in sorted(keys):
                lanes.append(Lane(p, acct, model, base, keys[acct],
                                  int(prov.get("maxOut") or 32_000), int(prov.get("ctx") or 200_000),
                                  "emergency", 0, bool(prov.get("reasoning")), int(prov.get("rpm") or 0)))
    return lanes


# ================================================================ makosa ya provider (kipengele cha errors.ts)

class LaneError(Exception):
    """kind: size | minute | daily | busy | auth | model | transient | fatal | empty | aborted"""

    def __init__(self, kind: str, message: str, wait_ms: int | None = None, until_ms: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.wait_ms = wait_ms
        self.until_ms = until_ms
        self.message = message


def parse_gem_error(status: int, body: str) -> tuple[str, int | None]:
    """429 ya Google → ("daily"|"minute", waitMs) · 503 → ("busy", 30000)."""
    b = str(body or "")
    if status == 429:
        pairs = [(m.group(1), m.group(2)) for m in re.finditer(
            r'"quotaId"\s*:\s*"([^"]+)"(?:(?!"quotaId")[\s\S]){0,600}?"quotaValue"\s*:\s*"?(\d+)', b)]
        daily = (any(re.search(r"PerDay", p[0], re.I) for p in pairs)
                 if pairs else bool(re.search(r"PerDay|per day", b, re.I)))
        delay = re.search(r'"retryDelay"\s*:\s*"([0-9.]+)s"', b) or re.search(r"retry in\s+([0-9.]+)s", b, re.I)
        return ("daily" if daily else "minute", int(float(delay.group(1)) * 1000) if delay else None)
    if status == 503 or re.search(r"UNAVAILABLE|overloaded|high demand", b, re.I):
        return ("busy", 30_000)
    return ("other", None)


def classify_error(provider: str, status: int | None, body: str, headers: dict | None) -> LaneError:
    """Tafsiri ya broker/errors.ts (uamuzi ileile; hakuna ujumbe unaofika UI)."""
    now = time.time() * 1000
    headers = headers or {}
    msg = str(body or "")[:240]
    retry_after = parse_duration(headers.get("retry-after"))

    if provider == "gemini":
        if status == 400 and re.search(r"API_KEY_INVALID|API key not valid|API key expired|PERMISSION_DENIED", body, re.I):
            return LaneError("auth", msg)
        if status == 429:
            kind, wait = parse_gem_error(429, body)
            if kind == "daily":
                return LaneError("daily", msg, until_ms=next_pacific_midnight())
            return LaneError("minute", msg, wait_ms=wait or 20_000)
        if status == 503 or re.search(r"UNAVAILABLE|overloaded|high demand", body, re.I):
            return LaneError("busy", msg, wait_ms=30_000)

    if status in (401, 403):
        return LaneError("auth", msg)
    if status == 402:
        return LaneError("auth", msg, until_ms=next_utc_midnight())
    if status == 413 or re.search(r"request too large|context.?length|maximum context|too many tokens|prompt is too long", body, re.I):
        return LaneError("size", msg)
    if re.search(r"model_not_found|model not found|does not exist|no endpoints found", body, re.I) or status == 404:
        return LaneError("model", msg, until_ms=next_utc_midnight())

    if status == 429:
        if provider == "groq":
            m = re.search(r"try again in ([0-9hms.]+)", body, re.I)
            if re.search(r"\(TPD\)|\(RPD\)|per day", body, re.I):
                return LaneError("daily", msg, wait_ms=(parse_duration(m.group(1)) if m else None) or 30 * 60_000)
            return LaneError("minute", msg, wait_ms=retry_after or ((parse_duration(m.group(1)) if m else None) or 20_000))
        if provider == "xkiro":
            if re.search(r"free-model token quota|token quota|daily|per day", body, re.I):
                return LaneError("daily", msg, wait_ms=15 * 60_000)
            return LaneError("minute", msg, wait_ms=retry_after or 20_000)
        if provider == "openrouter":
            if re.search(r"temporarily rate-limited upstream|provider_code|upstream", body, re.I):
                return LaneError("busy", msg, wait_ms=retry_after or 60_000)
            rem = headers.get("x-ratelimit-remaining")
            reset_raw = headers.get("x-ratelimit-reset")
            try:
                rem_n = float(rem) if rem is not None else None
            except ValueError:
                rem_n = None
            reset = 0
            if reset_raw:
                try:
                    r = float(reset_raw)
                    reset = r if r > 1e12 else r * 1000
                except ValueError:
                    reset = 0
            if re.search(r"per.?day|free-models-per-day|daily", body, re.I) or (rem_n == 0 and reset - now > 10 * 60_000):
                return LaneError("daily", msg, until_ms=reset if reset > now else next_utc_midnight())
            return LaneError("minute", msg, wait_ms=retry_after or (int(reset - now) if reset > now else 60_000))
        # unorouter
        if re.search(r"every\s+\d+\s*min|per.?minute|request\(s\) every|retry in", body, re.I) or retry_after is not None:
            return LaneError("minute", msg, wait_ms=retry_after or 60_000)
        if re.search(r"daily|per day|quota|budget", body, re.I):
            return LaneError("daily", msg, until_ms=next_utc_midnight())
        return LaneError("minute", msg, wait_ms=60_000)
    if status == 503 and re.search(r"get_channel_failed|busy|overloaded|no available", body, re.I):
        return LaneError("busy", msg, wait_ms=retry_after or 90_000)
    if status == 400:
        # R31-G: Gemini 3.x inakataa history yenye functionCall bila thought_signature —
        # inarekebishwa (calls zisizo na signature zinaondolewa) — SI fatal.
        if re.search(r"thought_signature", body, re.I):
            return LaneError("signature", msg)
        return LaneError("fatal", msg)
    if status is not None and status >= 500:
        return LaneError("transient", msg)
    return LaneError("transient", msg or "network")


# ================================================================ tafsiri: Anthropic → OpenAI

def _content_text(blocks) -> str:
    if isinstance(blocks, str):
        return blocks
    out = []
    if isinstance(blocks, list):
        for b in blocks:
            if isinstance(b, dict) and b.get("type") == "text":
                out.append(b.get("text") or "")
    return "".join(out)


def _tool_result_parts(content) -> list[dict]:
    """content ya tool_result (string au blocks) → parts za OpenAI (text + image_url)."""
    parts: list[dict] = []
    if isinstance(content, str):
        return [{"type": "text", "text": content}] if content else []
    if isinstance(content, list):
        for b in content:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "text":
                parts.append({"type": "text", "text": b.get("text") or ""})
            elif b.get("type") == "image":
                src = b.get("source") or {}
                data = src.get("data")
                if data:
                    parts.append({"type": "image_url",
                                  "image_url": {"url": f"data:{src.get('media_type', 'image/png')};base64,{data}"}})
    return parts


def translate_request(body: dict, strip_images: bool = False, signatures: dict | None = None,
                      dropped: set[str] | None = None) -> dict:
    """Ombi la Anthropic /v1/messages → OpenAI chat/completions payload."""
    msgs: list[dict] = []
    system = body.get("system")
    if isinstance(system, list):
        system = _content_text(system)
    if isinstance(system, str) and system.strip():
        msgs.append({"role": "system", "content": system})

    for m in body.get("messages") or []:
        role = m.get("role")
        content = m.get("content")
        if role == "user":
            if isinstance(content, str):
                msgs.append({"role": "user", "content": content})
                continue
            tool_msgs: list[dict] = []
            user_parts: list[dict] = []
            for b in content or []:
                if not isinstance(b, dict):
                    continue
                bt = b.get("type")
                if bt == "text":
                    user_parts.append({"type": "text", "text": b.get("text") or ""})
                elif bt == "tool_result":
                    if dropped and (b.get("tool_use_id") or "") in dropped:
                        continue  # matokeo ya call iliyotolewa (recovery ya signature)
                    parts = _tool_result_parts(b.get("content"))
                    if strip_images:
                        parts = [p for p in parts if p.get("type") == "text"] or [{"type": "text", "text": "[picha imeondolewa]"}]
                    tool_msgs.append({"role": "tool", "tool_call_id": b.get("tool_use_id") or "",
                                      "content": parts if parts else ""})
                elif bt == "image":
                    src = b.get("source") or {}
                    if src.get("data") and not strip_images:
                        user_parts.append({"type": "image_url",
                                           "image_url": {"url": f"data:{src.get('media_type', 'image/png')};base64,{src['data']}"}})
            if tool_msgs:
                # OpenAI inatarajia tool messages zifuate assistant message yenye tool_calls —
                # Claude huweka tool_result kwenye user turn; tunatoa zote kisha user text (kama ipo).
                msgs.extend(tool_msgs)
                if user_parts:
                    msgs.append({"role": "user", "content": user_parts})
            else:
                msgs.append({"role": "user", "content": user_parts or ""})
        elif role == "assistant":
            text_parts: list[str] = []
            calls: list[dict] = []
            if isinstance(content, str):
                text_parts.append(content)
            else:
                for b in content or []:
                    if not isinstance(b, dict):
                        continue
                    bt = b.get("type")
                    if bt == "text":
                        text_parts.append(b.get("text") or "")
                    elif bt == "tool_use":
                        tid = b.get("id") or f"call_{len(calls)}"
                        if dropped and tid in dropped:
                            # recovery ya signature: call bila signature inakuwa text fupi (si functionCall)
                            text_parts.append(f"[tool {b.get('name') or '?'} — executed, details omitted]")
                            continue
                        entry = {"id": tid, "type": "function",
                                 "function": {"name": b.get("name") or "", "arguments": json.dumps(b.get("input") or {}, ensure_ascii=False)}}
                        # Gemini 3.x inahitaji thought_signature itumiwe NA functionCall replay —
                        # brain inakumbuka signature kwa tool_use id (toka jibu lililopita).
                        sig = (signatures or {}).get(tid)
                        if sig:
                            entry["extra_content"] = sig
                        calls.append(entry)
                    # thinking blocks zinatupuliwa (hatumishi upstream)
            a: dict = {"role": "assistant", "content": "".join(text_parts) if text_parts else None}
            if calls:
                a["tool_calls"] = calls
            msgs.append(a)

    payload: dict = {"messages": msgs}
    tools = body.get("tools")
    if tools:
        payload["tools"] = [{"type": "function",
                             "function": {"name": t.get("name") or "", "description": t.get("description") or "",
                                          "parameters": t.get("input_schema") or {"type": "object", "properties": {}}}}
                            for t in tools if isinstance(t, dict) and t.get("name")]
    tc = body.get("tool_choice")
    if isinstance(tc, dict):
        if tc.get("type") == "any":
            payload["tool_choice"] = "required"
        elif tc.get("type") == "tool" and tc.get("name"):
            payload["tool_choice"] = {"type": "function", "function": {"name": tc["name"]}}
        else:
            payload["tool_choice"] = "auto"
    if body.get("stop_sequences"):
        payload["stop"] = body["stop_sequences"]
    return payload


def payload_has_images(payload: dict) -> bool:
    for m in payload.get("messages") or []:
        c = m.get("content")
        if isinstance(c, list) and any(isinstance(p, dict) and p.get("type") == "image_url" for p in c):
            return True
    return False


def map_finish_reason(fr: str | None) -> str:
    return {"tool_calls": "tool_use", "stop": "end_turn", "length": "max_tokens",
            "content_filter": "refusal"}.get(fr or "", "end_turn")


# ================================================================ tafsiri: OpenAI stream → Anthropic SSE

class AnthropicStreamTranslator:
    """Hali-mashine safi: inakula chunks za OpenAI SSE, inazalisha events za Anthropic.

    `events()` ni generator yenye "gate": hakuna kitu kinatolewa hadi delta ya kwanza
    yenye maana (text/thinking/tool_call) — hivyo jibu tupu au la kwanza lililokufa
    linarudishwa kama LaneError kabla UI(CLI) kuona chochote (silent lane swap).
    """

    def __init__(self, model_name: str = "xmd-computer"):
        self.signatures: dict[str, dict] = {}
        self._extra_pool: list[dict] = []
        self.model_name = model_name
        self.msg_id = "msg_xmd_" + os.urandom(6).hex()
        self.blocks: list[dict] = []   # {index, type, id?, name?}
        self.next_index = 0
        self.started = False
        self.finished = False
        self.stop_reason = "end_turn"
        self.usage = {"prompt": 0, "completion": 0}
        self.gate_passed = False
        self.emitted = False
        self._tool_args: dict[int, dict] = {}  # upstream tool index → block info

    # ---------- visaidizi
    def _start_message(self) -> dict:
        return {"type": "message_start", "message": {"id": self.msg_id, "type": "message", "role": "assistant",
                                                     "model": self.model_name, "content": [], "stop_reason": None,
                                                     "stop_sequence": None,
                                                     "usage": {"input_tokens": 0, "output_tokens": 1}}}

    def _open_block(self, btype: str, **extra) -> int:
        idx = self.next_index
        self.next_index += 1
        blk = {"type": btype}
        blk.update(extra)
        self.blocks.append({"index": idx, "type": btype, **extra})
        return idx

    # ---------- kulisha chunk za OpenAI
    def feed(self, chunk: dict) -> list[dict]:
        """Inarudisha events mpya za Anthropic (bila kujali gate — gate iko kwenye events())."""
        out: list[dict] = []
        if not isinstance(chunk, dict):
            return out
        usage = chunk.get("usage")
        if isinstance(usage, dict):
            if usage.get("prompt_tokens") is not None:
                self.usage["prompt"] = int(usage.get("prompt_tokens") or 0)
            if usage.get("completion_tokens") is not None:
                self.usage["completion"] = int(usage.get("completion_tokens") or 0)
        ch = (chunk.get("choices") or [{}])[0] if chunk.get("choices") else {}
        delta = ch.get("delta") or {}
        fr = ch.get("finish_reason")
        if fr:
            self.stop_reason = map_finish_reason(fr)

        # reasoning (XKiro/DeepSeek/Groq gpt-oss/OpenRouter)
        reasoning = delta.get("reasoning_content") or delta.get("reasoning")
        if isinstance(reasoning, str) and reasoning:
            idx, is_new = self._reuse_or_open("thinking")
            if is_new:
                out.append({"type": "content_block_start", "index": idx, "content_block": {"type": "thinking", "thinking": ""}})
            out.append({"type": "content_block_delta", "index": idx, "delta": {"type": "thinking_delta", "thinking": reasoning}})
            self.gate_passed = True
        # text
        text = delta.get("content")
        if isinstance(text, str) and text:
            idx, is_new = self._reuse_or_open("text")
            if is_new:
                out.append({"type": "content_block_start", "index": idx, "content_block": {"type": "text", "text": ""}})
            out.append({"type": "content_block_delta", "index": idx, "delta": {"type": "text_delta", "text": text}})
            self.gate_passed = True
        # Gemini 3.x thought_signature — delta-level (stream) au ndani ya tool_call
        extra = delta.get("extra_content")
        if isinstance(extra, dict) and extra:
            self._extra_pool.append(extra)

        # tool calls
        for tc in delta.get("tool_calls") or []:
            if not isinstance(tc, dict):
                continue
            ti = tc.get("index", 0)
            fn = (tc.get("function") or {})
            info = self._tool_args.get(ti)
            if info is None:
                idx = self._reuse_or_open("tool_use")[0]
                tuid = "toolu_" + os.urandom(8).hex()
                name = fn.get("name") or ""
                info = {"index": idx, "id": tuid, "name": name, "args": "", "extra": None}
                self._tool_args[ti] = info
                out.append({"type": "content_block_start", "index": idx,
                            "content_block": {"type": "tool_use", "id": tuid, "name": name, "input": {}}})
                self.gate_passed = True
            if info.get("extra") is None:
                tce = tc.get("extra_content")
                if isinstance(tce, dict) and tce:
                    info["extra"] = tce
                elif self._extra_pool:
                    info["extra"] = self._extra_pool.pop(0)
            args = fn.get("arguments")
            if isinstance(args, str) and args:
                info["args"] += args
                out.append({"type": "content_block_delta", "index": info["index"],
                            "delta": {"type": "input_json_delta", "partial_json": args}})
                self.gate_passed = True
        if self._extra_pool:
            for info in reversed(list(self._tool_args.values())):
                if info.get("extra") is None:
                    info["extra"] = self._extra_pool.pop(0)
                    if not self._extra_pool:
                        break
        return out

    def _reuse_or_open(self, btype: str) -> tuple[int, bool]:
        """Text/thinking zinachanganya kwenye block ileile; tool_use na fungua block MPYA kila moja.
        Inarudisha (index, is_new)."""
        if btype != "tool_use" and self.blocks and self.blocks[-1]["type"] == btype:
            return self.blocks[-1]["index"], False
        return self._open_block(btype), True

    def finish(self) -> list[dict]:
        for info in self._tool_args.values():
            if info.get("extra"):
                self.signatures[info["id"]] = info["extra"]
        out: list[dict] = []
        for b in self.blocks:
            if b["type"] == "thinking":
                out.append({"type": "content_block_delta", "index": b["index"], "delta": {"type": "signature_delta", "signature": ""}})
            out.append({"type": "content_block_stop", "index": b["index"]})
        out.append({"type": "message_delta",
                    "delta": {"stop_reason": self.stop_reason, "stop_sequence": None},
                    "usage": {"output_tokens": max(1, self.usage["completion"])}})
        out.append({"type": "message_stop"})
        self.finished = True
        return out


def sse_pack(event: dict) -> str:
    return f"event: {event.get('type')}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"


# ================================================================ Brain

class _StreamGen:
    """Generator ya stream + translator wake (signatures za tool calls) — thread-safe per request."""

    def __init__(self, gen, translator):
        self._gen = gen
        self.xmd_translator = translator

    def __iter__(self):
        return iter(self._gen)


class BrainFatal(Exception):
    pass


def with_gemini_thinking(p: dict, provider: str) -> dict:
    """R31-G4: Gemini 3.x — omba thoughts. Jibu linakuwa na <thought>...</thought> ndani ya
    content (+ extra_content.google.thought_signature); bridge ina parsing ya tags hizo (xmd3).
    Mawazo yanarudi kwenye Thinking cards bila mabadiliko mengine."""
    if provider == "gemini":
        p["extra_body"] = {"google": {"thinking_config": {"include_thoughts": True}}}
    return p


class Brain:
    def __init__(self, cfg: dict, usage_path: str = "", clock=None, sleeper=None, transport=None):
        self.signatures: dict[str, dict] = {}  # tool_use id → extra_content (thought_signature)
        self.dropped: set[str] = set()          # calls zisizo na signature (recovery) — huondolewa history
        self._sig_path = os.environ.get("CU_SIG_PATH", "/home/user/brain-signatures.json")
        try:
            with open(self._sig_path, "r", encoding="utf-8") as fh:
                disk = json.load(fh)
            if isinstance(disk, dict):
                self.signatures.update({str(k): v for k, v in disk.items() if isinstance(v, dict)})
                if disk:
                    blog("info", f"🧠 cuBrain: signatures {len(self.signatures)} zimepakuliwa kutoka disk (resume).")
        except Exception:
            pass
        self.cfg = cfg or {}
        self.order: list[Lane] = build_order(self.cfg)
        self.state: dict[str, LaneState] = {}
        self.emergency = False
        self.calls = 0
        # R34-A STICKY LANE (agizo la CEO 06-10): lane iliyofanikiwa mwisho inashikiliwa —
        # requests zinazo fuata zinaenda MOJA KWA MOJA kwake, si kutembeza orodha kila mara
        # (kosa la zamani: 3.8/3.7 zilipokea requests 28 huku zikifa kila mara, kila request
        # ikianza kutafuta upya). Inabadilika TU ikifa kweli (quota ya siku/disabled) au
        # ikipumzika muda mrefu; kosa fupi la dakika = subiri kimya, bado yake.
        self.work_lane: str | None = None
        self.usage_path = usage_path or os.environ.get("CU_USAGE_OUT", "/home/user/brain-usage.jsonl")
        self._clock = clock or (lambda: time.time() * 1000)
        self._sleep = sleeper or time.sleep
        self._transport = transport or self._http_transport
        self._snap_day = pacific_day(self._clock() / 1000)
        self._load_quota_snapshot()

    # ---------- hali ya kuanzia (kutoka Koyeb — ili tusichome 429 zisizo na haja)
    def _load_quota_snapshot(self):
        gem = (self.cfg.get("gemini") or {}).get("quota") or {}
        flash_rpd = int((self.cfg.get("gemini") or {}).get("flashRpd") or 20)
        lite_rpd = int((self.cfg.get("gemini") or {}).get("liteRpd") or 500)
        for acct in ("gemini-1", "gemini-2"):
            g = gem.get(acct) or {}
            for model, st in (g.get("chat") or {}).items():
                lane_id = f"{acct}:{model}"
                s = self.state.setdefault(lane_id, LaneState())
                s.requests_today = int(st.get("requests") or 0)
                s.rpd_limit = int(st.get("rpdLimit") or (lite_rpd if "lite" in model else flash_rpd))
                s.exhausted_until = int(st.get("exhaustedUntil") or 0)
                s.retry_at = int(st.get("retryAt") or 0)
                s.busy_until = int(st.get("busyUntil") or 0)
                s.day = g.get("day") or ""
        for prov in self.cfg.get("emergency") or []:
            p = prov.get("provider") or ""
            q = prov.get("quota") or {}
            for acct, st in q.items():
                if p == "xkiro":
                    s = self.state.setdefault(f"{acct}:{prov.get('models', [''])[0] if prov.get('models') else ''}", LaneState())
                    s.xkiro_remaining = st.get("remaining")
                    s.exhausted_until = int(st.get("exhaustedAt") or 0)
                elif p == "openrouter":
                    for model in prov.get("models") or [""]:
                        s = self.state.setdefault(f"{acct}:{model}", LaneState())
                        s.exhausted_until = int(st.get("exhaustedUntil") or 0)
                        s.retry_at = int(st.get("retryAt") or 0)
                elif p == "groq":
                    for model in prov.get("models") or []:
                        s = self.state.setdefault(f"{acct}:{model}", LaneState())
                        s.retry_at = int((st.get("models") or {}).get(model, {}).get("retryAt") or 0)
                elif p == "unorouter":
                    for model in prov.get("models") or []:
                        s = self.state.setdefault(f"{acct}:{model}", LaneState())
                        s.retry_at = int((st.get("models") or {}).get(model, {}).get("slotUntil") or 0)
                        s.exhausted_until = int(st.get("exhaustedUntil") or 0)

    def st(self, lane: Lane) -> LaneState:
        return self.state.setdefault(lane.id, LaneState())

    # ---------- usomaji wa siku (Pacific reset ya Google — mirror ya gemState)
    def _rollover_check(self):
        today = pacific_day(self._clock() / 1000)
        if today != self._snap_day:
            self._snap_day = today
            for lane in self.order:
                if lane.provider == "gemini":
                    s = self.st(lane)
                    s.requests_today = 0
                    s.exhausted_until = 0
                    s.retry_at = 0
                    s.busy_until = 0
                    s.rpm_calls = []
                    s.day = today

    # ---------- lane iko tayari?
    def _ready(self, lane: Lane, now: float) -> tuple[bool, int]:
        """(tayari?, ms ya kufunguka kama inapumzika)."""
        s = self.st(lane)
        if s.disabled:
            return False, 0
        wake = 0
        if s.exhausted_until > now:
            return False, 0  # siku nzima — hatuendi mahali
        if s.retry_at > now:
            wake = s.retry_at
        if s.busy_until > now:
            wake = max(wake, s.busy_until)
        if wake:
            return False, wake
        if lane.provider == "gemini":
            if s.rpd_limit and s.requests_today >= s.rpd_limit:
                s.exhausted_until = next_pacific_midnight(now / 1000)
                return False, 0
            if lane.rpm:
                recent = [t for t in s.rpm_calls if t > now - 60_000]
                s.rpm_calls = recent
                if len(recent) >= lane.rpm:
                    return False, recent[0] + 61_000
        if lane.provider == "xkiro" and s.xkiro_remaining is not None and s.xkiro_remaining < XKIRO_MIN_REMAINING:
            return False, 0  # "kama kuna nafasi" — hakuna nafasi, kimya
        return True, 0

    def _note_failure(self, lane: Lane, err: LaneError):
        s = self.st(lane)
        now = self._clock()
        if err.kind == "daily":
            s.exhausted_until = err.until_ms if err.until_ms else (next_pacific_midnight(now / 1000) if lane.provider == "gemini" else next_utc_midnight(now / 1000))
        elif err.kind == "minute":
            s.retry_at = now + (err.wait_ms or 20_000)
        elif err.kind == "busy":
            s.busy_until = now + (err.wait_ms or 30_000)
        elif err.kind == "auth" or err.kind == "model":
            s.disabled = True
        elif err.kind == "empty":
            s.empty_fails += 1
            if s.empty_fails >= 3:
                s.busy_until = now + 120_000

    def _all_gemini_dead(self, now: float) -> bool:
        """Gemini zote zimekufa KWA SIKU (si dakika) → dharura."""
        gems = [l for l in self.order if l.tier == "normal"]
        if not gems:
            return True
        for l in gems:
            s = self.st(l)
            if s.disabled:
                continue
            if s.exhausted_until <= now and (s.rpd_limit == 0 or s.requests_today < s.rpd_limit):
                if not (l.provider == "xkiro" and s.xkiro_remaining is not None and s.xkiro_remaining < XKIRO_MIN_REMAINING):
                    return False
        return True

    def _earliest_reset(self) -> int:
        """Muda wa karibuni lane itakaporejea (quota ya siku) — 0 kama hakuna lolote linajorudi."""
        now = int(self._clock())
        times = [int(l.exhausted_until) for l in self.order if int(getattr(l, "exhausted_until", 0) or 0) > now]
        return min(times) if times else 0

    def pick_lane(self, tried: set, depth: int = 0) -> Lane | None:
        """Chagua lane iliyopo — kwa mpangilio; subiri cooling fupi (silent) kabla ya kushuka dharura.

        R34-A: kuna work lane (sticky) → inatumika MOJA KWA MOJA; orodha inatembezwa TU
        ikifa kweli (siku/disabled) au ikipopumzika zaidi ya STICKY_MAX_WAIT_MS."""
        if depth > 6:
            return None
        self._rollover_check()
        now = self._clock()
        # ---- R34-A: sticky lane — lane iliyofanikiwa mara ya mwisho inashikiliwa
        if self.work_lane:
            wl = next((l for l in self.order if l.id == self.work_lane), None)
            if wl is not None and wl.id not in tried:
                r, wake = self._ready(wl, now)
                if r:
                    return wl
                s = self.st(wl)
                if s.disabled or s.exhausted_until > now:
                    blog("info", f"📌 Sticky lane {wl.label()} imeisha kwa siku — natafuta nyingine.")
                    self.work_lane = None          # imefa kweli — tafutiwa mpya
                elif wake and 0 < wake - now <= STICKY_MAX_WAIT_MS:
                    blog("info", f"⏳ Sticky lane {wl.label()} ina dakika-cooling fupi — nisubiri "
                                 f"{int((wake - now) / 1000)}s (silent) badala ya kubadilisha.")
                    self._sleep((wake - now) / 1000 + 0.05)
                    tried.discard(wl.id)
                    return self.pick_lane(tried, depth + 1)
                else:
                    blog("info", f"📌 Sticky lane {wl.label()} inapumzika muda mrefu — nashuka kwenye orodha.")
                    self.work_lane = None          # cooling ndefu — tafutiwa nyingine sasa
            elif wl is not None and wl.id in tried:
                # imefeli KWA request hii (failover ya ndani) — orodha inaendelea; sticky inabaki
                # (ikifa kweli, pick ijayo itaiondoa)
                pass
        if not self.emergency:
            gem_all = [l for l in self.order if l.tier == "normal"]
            gem_untried = [l for l in gem_all if l.id not in tried]
            for l in gem_untried:
                r, _ = self._ready(l, now)
                if r:
                    return l
            if gem_all and not self._all_gemini_dead(now):
                # zimejaa dakika tu (si siku nzima) — subiri ndogo, KIMYA, kisha zirudie
                wakes = []
                for l in gem_all:
                    r, w = self._ready(l, now)
                    if not r and w and w > now:
                        wakes.append(w)
                if wakes and min(wakes) - now <= GATE_MAX_WAIT:
                    wait = min(wakes) - now
                    blog("warning", f"\u23f3 Gemini zote zina dakika-cooling — nisubiri {int(wait / 1000)}s (silent).")
                    self._sleep(wait / 1000 + 0.05)
                    tried.difference_update(l.id for l in gem_all)  # zinajaribiwa tena baada ya kupumzika
                    return self.pick_lane(tried, depth + 1)
                blog("warning", "\U0001F5A5\uFE0F cuBrain: Gemini hazipatikani (zote zimejaa kwa muda mrefu) — EMERGENCY inaanza (silent, UI haiona).")
            else:
                blog("warning", "\U0001F5A5\uFE0F cuBrain: Gemini zote zimeisha kwa siku — EMERGENCY (XKiro → OpenRouter → Groq → Uno) inaanza (silent, UI haiona).")
            self.emergency = True
        # ---- dharura (au tayari tuko dharura)
        emerg_all = [l for l in self.order if l.tier == "emergency"]
        emerg_untried = [l for l in emerg_all if l.id not in tried]
        now = self._clock()
        for l in emerg_untried:
            r, _ = self._ready(l, now)
            if r:
                return l
        wakes = []
        for l in emerg_all:
            r, w = self._ready(l, now)
            if not r and w and w > now:
                wakes.append(w)
        if wakes and min(wakes) - now <= EMERGENCY_MAX_WAIT:
            wait = min(wakes) - now
            blog("warning", f"\u23f3 Lanes za dharura zina cooling — nisubiri {int(wait / 1000)}s (silent).")
            self._sleep(wait / 1000 + 0.05)
            tried.difference_update(l.id for l in emerg_all)
            return self.pick_lane(tried, depth + 1)
        return None

    # ---------- matumizi
    def record_usage(self, lane: Lane | None, ok: bool, prompt: int = 0, completion: int = 0, ms: int = 0, error: str = ""):
        rec = {"t": int(self._clock()), "lane": lane.id if lane else "", "provider": lane.provider if lane else "",
               "account": lane.account if lane else "", "model": lane.model if lane else "",
               "prompt": prompt, "completion": completion, "total": prompt + completion, "ok": ok, "ms": ms}
        if error:
            rec["error"] = str(error)[:200]
        with USAGE_LOCK:
            try:
                with open(self.usage_path, "a", encoding="utf-8") as fh:
                    fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            except OSError:
                pass
        if ok and lane:
            s = self.st(lane)
            s.tokens += prompt + completion
            if lane.provider == "gemini":
                s.requests_today += 1
                s.rpm_calls.append(self._clock())
            elif lane.provider == "xkiro" and s.xkiro_remaining is not None:
                s.xkiro_remaining -= (prompt + completion)
            # R34-A: mafanikio ya kweli = hii ndiyo work lane sasa (sticky)
            if self.work_lane != lane.id:
                self.work_lane = lane.id
            self.calls += 1

    # ---------- usafiri (HTTP halisi; tests zinabadilisha)
    def _http_transport(self, lane: Lane, payload: dict, stream: bool):
        """Inarudisha (resp|None, headers, err, t0). resp ya makosa ni HTTPError (ina .code + .read())."""
        url = lane.base + "/chat/completions"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST",
                                     headers={"Content-Type": "application/json",
                                              "Authorization": "Bearer " + lane.key,
                                              "User-Agent": "xmd-cu-brain/1.0"})
        t0 = time.time()
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            return resp, {k.lower(): v for k, v in resp.headers.items()}, "", t0
        except urllib.error.HTTPError as e:
            return e, {k.lower(): v for k, v in (e.headers or {}).items()}, "", t0
        except Exception as e:  # mtandao
            return None, {}, str(e), t0

    # ---------- calls
    def open_stream(self, lane: Lane, payload: dict, with_so: bool = True):
        """Inarudisha generator ya events za Anthropic SSE (lenye gate). Inapiga LaneError kwa kila kosa."""

        translator = AnthropicStreamTranslator()

        def gen():
            resp, headers, err, t0 = self._upstream_open(lane, payload, stream=True, with_so=with_so)
            if resp is None:
                raise LaneError("transient", f"network: {err}")
            status = getattr(resp, "code", None)
            if status != 200:
                body = self._read_err_body(resp)
                raise classify_error(lane.provider, status, body, headers)
            gate_open = False
            pending: list = []
            usage_prompt, usage_completion = 0, 0
            # R38-RC1: idle-check HALISI. Zamani `last_data` ilesasishwa kabla ya check
            # (mistari ilikuwa dead code — stream iliyokwama haikukamatwa kamwe). Sasa:
            #   - last_data inasasishwa na DATA HALISI pekee (mstari unaanza "data:")
            #   - ping/keep-alive/maandishi mengine HAYAHESABIWI — yakiendelea dakika 3 bila
            #     chunk moja ya data, lane inahisiwa imekufa (busy) na inarudiwa
            #   - kikomo cha jumla (STREAM_MAX_MS) kinakata generator usiokoma
            # (socket yenyewe ina timeout=30: kimya kabisa kinajikata tayari.)
            now_s = lambda: self._clock() / 1000.0
            last_data = now_s()
            deadline = now_s() + STREAM_MAX_MS / 1000.0
            try:
                for raw in resp:
                    t_now = now_s()
                    if t_now - last_data > IDLE_ABORT_MS / 1000.0:
                        raise LaneError("busy", f"stalled — hakuna data mpya kwa {int(t_now - last_data)}s")
                    if t_now > deadline:
                        raise LaneError("busy", f"stream imevuka {int(STREAM_MAX_MS / 60000)} dk bila kuisha — imekatwa")
                    line = raw.decode("utf-8", "replace").strip() if isinstance(raw, (bytes, bytearray)) else str(raw).strip()
                    if not line or not line.startswith("data:"):
                        continue  # ping/keep-alive/maoni — si data halisi, hayasasishi last_data
                    last_data = t_now  # data HALISI pekee inasasisha
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except ValueError:
                        continue
                    evs = translator.feed(chunk)
                    if chunk.get("usage"):
                        usage_prompt = int((chunk.get("usage") or {}).get("prompt_tokens") or usage_prompt)
                        usage_completion = int((chunk.get("usage") or {}).get("completion_tokens") or usage_completion)
                    if not gate_open:
                        if translator.gate_passed:
                            gate_open = True
                            yield translator._start_message()
                            for ev in (pending + evs):
                                yield ev
                            pending = []
                        else:
                            pending.extend(evs)
                    else:
                        for ev in evs:
                            yield ev
                if not translator.gate_passed:
                    raise LaneError("empty", "jibu tupu kutoka " + lane.label())
                for ev in translator.finish():
                    yield ev
                self.record_usage(lane, True, usage_prompt or translator.usage["prompt"],
                                  usage_completion or translator.usage["completion"], int((time.time() - t0) * 1000))
            except LaneError:
                raise
            except Exception as e:
                raise LaneError("transient", f"stream ilikatika: {e}" if gate_open else str(e)[:200])
            finally:
                try:
                    resp.close()
                except Exception:
                    pass
        return _StreamGen(gen(), translator)

    def complete(self, lane: Lane, payload: dict, with_so: bool = True) -> dict:
        """Non-stream: inarudisha jibu kamili la Anthropic au LaneError."""
        resp, headers, err, t0 = self._upstream_open(lane, payload, stream=False, with_so=with_so)
        if resp is None:
            raise LaneError("transient", f"network: {err}")
        status = getattr(resp, "code", None)
        if status != 200:
            body = self._read_err_body(resp)
            raise classify_error(lane.provider, status, body, headers)
        try:
            data = json.loads(resp.read().decode("utf-8", "replace"))
        except Exception as e:
            raise LaneError("transient", f"json mbaya: {e}")
        finally:
            try:
                resp.close()
            except Exception:
                pass
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        content: list[dict] = []
        reasoning = msg.get("reasoning_content") or msg.get("reasoning")
        if isinstance(reasoning, str) and reasoning:
            content.append({"type": "thinking", "thinking": reasoning, "signature": ""})
        if msg.get("content"):
            content.append({"type": "text", "text": msg["content"]})
        for i, tc in enumerate(msg.get("tool_calls") or []):
            fn = (tc or {}).get("function") or {}
            try:
                inp = json.loads(fn.get("arguments") or "{}")
            except ValueError:
                inp = {}
            tid = tc.get("id") or f"toolu_{i}"
            tce = (tc or {}).get("extra_content")
            if isinstance(tce, dict) and tce:
                self.signatures[tid] = tce
            content.append({"type": "tool_use", "id": tid, "name": fn.get("name") or "", "input": inp})
        if not content:
            raise LaneError("empty", "jibu tupu kutoka " + lane.label())
        u = data.get("usage") or {}
        self.record_usage(lane, True, int(u.get("prompt_tokens") or 0), int(u.get("completion_tokens") or 0),
                          int((time.time() - t0) * 1000))
        return {"id": "msg_xmd_" + os.urandom(6).hex(), "type": "message", "role": "assistant",
                "model": "xmd-computer", "content": content, "stop_reason": map_finish_reason(choice.get("finish_reason")),
                "stop_sequence": None,
                "usage": {"input_tokens": int(u.get("prompt_tokens") or 0), "output_tokens": int(u.get("completion_tokens") or 0)}}

    def _upstream_open(self, lane: Lane, payload: dict, stream: bool, with_so: bool = True):
        p = dict(payload)
        p["model"] = lane.model
        if stream:
            p["stream"] = True
            if with_so and lane.provider in ("gemini", "groq", "openrouter", "xkiro"):
                p["stream_options"] = {"include_usage": True}
        else:
            p["stream"] = False
        p.setdefault("temperature", 0.3)
        return self._transport(lane, p, stream)

    def _read_err_body(self, resp) -> str:
        try:
            return resp.read(65536).decode("utf-8", "replace")
        except Exception:
            return ""

    # ---------- mkondo mkuu wa ombi (loop ya lane + silent swaps)
    def _unsigned_calls(self, body: dict) -> list[str]:
        """tool_use ids za history zisizo na signature (na hazijatolewa)."""
        out: list[str] = []
        for m in body.get("messages") or []:
            content = m.get("content")
            if not isinstance(content, list):
                continue
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    tid = b.get("id") or ""
                    if tid and tid not in self.signatures and tid not in self.dropped:
                        out.append(tid)
        return out

    def _save_signatures(self) -> None:
        """Signatures zinaishi disk — bridge/brain ikianza upya (resume) history ya zamani inaendelea kufanya kazi."""
        if not self.signatures:
            return
        try:
            disk: dict = {}
            try:
                with open(self._sig_path, "r", encoding="utf-8") as fh:
                    disk = json.load(fh)
                    if not isinstance(disk, dict):
                        disk = {}
            except Exception:
                pass
            if len(self.signatures) > len(disk):
                disk.update(self.signatures)
                tmp = self._sig_path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(disk, fh)
                os.replace(tmp, self._sig_path)
        except Exception:
            pass

    def handle(self, body: dict, write):
        """write(event_dict) inatumwa kila event (baada ya gate). Inarudisha True kama run ikaisha vizuri."""
        # TEST hook (traffic ya uongo ya quota): SDK ya Anthropic ina-RETRY 529 — kufa mara MOJA
        # kunamezwa na retry (call ya pili inaendelea kwa Gemini halisi, pause haifiki bridge —
        # kosa la run ya kwanza ya 6ac3a9c3). Kwa hiyo kila call inafunga fatal marker ILEILE
        # hadi SDK ichoke; guard ya kweli ya "mara moja" ni pausedOnce ya engine (resume
        # haandiki test_quota_pause_ms tena kwenye cu-config.json).
        tq = int((self.cfg or {}).get("test_quota_pause_ms") or 0)
        if tq:
            if not getattr(self, "_test_pause_at", 0):
                self._test_pause_at = int(self._clock()) + tq
            raise BrainFatal(f"[TEST] quota ya uongo imeisha (accounts zote) XMD-PAUSE:{self._test_pause_at}")
        tried: set[str] = set()
        strip_images = False
        no_stream_options = False
        attempts = 0

        def after_lane_error(lane: Lane, le: LaneError, p: dict, t0: float):
            """Hakuna kitu kinafika UI: note + record; fatal inapewa nafasi moja ya mbadala (picha/stream_options)."""
            self._note_failure(lane, le)
            self.record_usage(lane, False, 0, 0, int(self._clock() - t0), le.kind)
            if le.kind != "fatal":
                blog("warning", f"\U0001F501 cuBrain: {lane.label()} → {le.kind} — lane nyingine kimya (UI haiona).")
                return
            nonlocal strip_images, no_stream_options
            if payload_has_images(p) and not strip_images:
                strip_images = True
                tried.clear()  # lane ileile inajaribiwa tena — bila picha
                blog("warning", "cuBrain: 400 lenye picha — nazitoa picha na kuanza upya (silent).")
                return
            if not no_stream_options and "stream" in (le.message or ""):
                no_stream_options = True
                return
            raise BrainFatal(le.message)

        while attempts < MAX_ATTEMPTS:
            lane = self.pick_lane(tried)
            if lane is None:
                # R31-G4: quota ya siku imeisha KABISA (Gemini + dharura zote) → PAUSE, si kifo.
                # Marker XMD-PAUSE:<epoch_ms> inayofika bridge → snapshot ya ws + run_end(paused_quota)
                # → Koyeb inapumzisha session na kui-resume YENYEWE limit ikirudi.
                resume_at = self._earliest_reset()
                if resume_at:
                    raise BrainFatal(f"quota ya siku ya LLM imeisha kwenye accounts zote XMD-PAUSE:{resume_at}")
                raise BrainFatal("lanes zote za LLM zimekufa/kwisha kwa sasa (Gemini + dharura zote)")
            tried.add(lane.id)
            attempts += 1
            # payload inajengwa UPYA kila attempt (picha zinaweza kutolewa baada ya 400)
            p = translate_request(body, strip_images=strip_images, signatures=self.signatures, dropped=self.dropped)
            p["max_tokens"] = min(int(body.get("max_tokens") or 8192), lane.max_out)
            p = with_gemini_thinking(p, lane.provider)
            t0 = self._clock()
            if body.get("stream"):
                gen = self.open_stream(lane, p, with_so=not no_stream_options)
                wrote = False
                try:
                    for ev in gen:
                        write(ev)
                        wrote = True
                    tr = getattr(gen, "xmd_translator", None)
                    if tr is not None:
                        self.signatures.update(tr.signatures)
                    self._save_signatures()
                    return True
                except LaneError as le:
                    if wrote:
                        # stream ilikatika katikati — CLI itajaribu tena yenyewe; sisi hatuanzi upya
                        self.record_usage(lane, False, 0, 0, int(self._clock() - t0), f"midstream:{le.kind}")
                        raise BrainAbort()
                    if le.kind == "signature":
                        unsigned = self._unsigned_calls(body)
                        if unsigned:
                            self.dropped.update(unsigned)
                            tried.clear()
                            blog("warning", f"cuBrain: thought_signature hazipo kwa {len(unsigned)} call(s) — "
                                             f"zinatolewa kwenye history na kuendelea (silent).")
                            continue
                    after_lane_error(lane, le, p, t0)
                    continue
            try:
                result = self.complete(lane, p, with_so=not no_stream_options)
                write(result)
                self._save_signatures()
                return True
            except LaneError as le:
                if le.kind == "signature":
                    # R31-G recovery: calls zisizo na signature zinaondolewa → lanes zinarudiwi
                    unsigned = self._unsigned_calls(body)
                    if unsigned:
                        self.dropped.update(unsigned)
                        tried.clear()
                        blog("warning", f"cuBrain: thought_signature hazipo kwa {len(unsigned)} call(s) — "
                                         f"zinatolewa kwenye history na kuendelea (silent).")
                        continue
                after_lane_error(lane, le, p, t0)
                continue
        raise BrainFatal(f"jaribio {MAX_ATTEMPTS} limeishia bila jibu")

class BrainAbort(Exception):
    """Stream ilikatika baada ya kutuma — soketi inafungwa; CLI inajirudia yenyewe."""


# ================================================================ HTTP server

class BrainHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "xmd-cu-brain/1.0"
    brain: Brain = None  # inawekwa serve()

    def log_message(self, fmt, *args):  # kimya — logs zetu ni za blog()
        pass

    def _json(self, code: int, obj: dict):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/health":
            b = self.brain
            self._json(200, {"ok": True, "emergency": b.emergency, "calls": b.calls,
                             "lanes": len(b.order), "uptimeMs": int((time.time() - BASE_TS) * 1000)})
            return
        if path == "/v1/models":
            self._json(200, {"data": [{"id": "xmd-computer", "object": "model", "display_name": "XMD Computer (Gemini Swap Brain)"}]})
            return
        self._json(404, {"error": {"type": "not_found_error", "message": "path haitumiki"}})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path.endswith("/count_tokens"):
            try:
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                body = {}
            rough = len(json.dumps(body.get("messages") or [])) // 4
            self._json(200, {"input_tokens": max(32, rough)})
            return
        if not path.endswith("/messages"):
            self._json(404, {"error": {"type": "not_found_error", "message": f"path {path} haitumiki"}})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:
            self._json(400, {"error": {"type": "invalid_request_error", "message": f"JSON mbaya: {e}"}})
            return
        stream = bool(body.get("stream"))
        try:
            if stream:
                head = {"sent": False}

                def write(ev: dict):
                    if not head["sent"]:
                        self.send_response(200)
                        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                        self.send_header("Cache-Control", "no-cache")
                        self.send_header("Connection", "close")
                        self.end_headers()
                        self.close_connection = True
                        head["sent"] = True
                    self.wfile.write(sse_pack(ev).encode("utf-8"))
                    self.wfile.flush()

                try:
                    self.brain.handle(body, write)
                except BrainAbort:
                    blog("warning", "cuBrain: stream ilikatika katikati — soketi inafungwa (CLI itajirudia).")
                except (BrokenPipeError, ConnectionResetError):
                    blog("info", "cuBrain: CLI imefunga ombi (user aliisha/acha).")
                return
            self.brain.handle(body, lambda ev: self._json(200, ev) if not isinstance(ev, dict) or ev.get("type") == "message" else None)
            # handle() inaita write MARA MOJA kwa non-stream (jibu kamili)
        except BrainFatal as e:
            self._json(529, {"type": "error", "error": {"type": "overloaded_error",
                                                        "message": f"cuBrain: {e}"}})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # kosa lisilotarajiwa — fatal moja (card ya kosa + Endeleza)
            blog("error", f"cuBrain kosa la ndani: {type(e).__name__}: {e}")
            try:
                self._json(500, {"type": "error", "error": {"type": "api_error", "message": f"cuBrain: {e}"}})
            except Exception:
                pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()


def load_config() -> dict:
    path = os.environ.get("CU_CONFIG", "/home/user/cu-config.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except OSError:
        blog("warning", f"cuBrain: config {path} haipo — lanes za Gemini tu bila snapshot.")
        return {}


def serve(cfg: dict | None = None):
    cfg = cfg if cfg is not None else load_config()
    port = int(os.environ.get("CU_PORT", str(cfg.get("port") or DEFAULT_PORT)))
    brain = Brain(cfg)
    BrainHandler.brain = brain
    httpd = ThreadingHTTPServer(("127.0.0.1", port), BrainHandler)
    blog("success", f"🧠 cuBrain imewaka http://127.0.0.1:{port} — lanes {len(brain.order)} "
                    f"(Gemini {sum(1 for l in brain.order if l.tier == 'normal')} · dharura {sum(1 for l in brain.order if l.tier == 'emergency')}).")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    serve()
