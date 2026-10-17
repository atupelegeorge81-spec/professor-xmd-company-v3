"""cu/oh_router.py — R51 · Mungano wa MECHANISM (SDK RouterLLM) na POLICY (lanes.py).

Native-first (sheria ya CEO): OpenHands SDK ina router tayari — WANAOITUMIA VILIVYO.
  • `RouterLLM.completion` inaita `select_llm(messages)` halafu inadelegate kila kitu
    (tools, streaming, security-risk) kwa LLM iliyochaguliwa — hicho KINACHOBaki SDK 100%.
  • Tunachojenga ni policy tu (quotas/cooldowns/meters zetu) + retry-loop ya lanes —
    SDK haina hizo; model_validator yao inasema wazi: "Subclasses should implement
    select_llm()".

Architecture:
  LaneRouterCore — PURE (stdlib; testable local): quota-aware weighted dispatch across
      Gemini Flash, Gemini Flash-Lite, UnoRouter na OpenRouter. Providers si kuta ngumu:
      OpenRouter inaweza kupata kazi mapema; quota/reliability/latency bado vinaamua lane.
      Kusubiri hufanyika tu ikiwa hakuna lane yoyote eligible.
  LaneRouter(RandomRouter) — glue: completion() yenye metering + retry; select_llm()
      ina delegate kwa core (inatumika pia na paths zozote za SDK zinazomuuliza router
      jina — tukio la kujitenga).
"""
from __future__ import annotations

import re
import time

import lanes
from oh_util import _status_of, classify_fail, extract_usage


class InferenceDeadline(lanes.AllLanesDead):
    """Ombi moja la inference limezidi deadline yake au idadi ya majaribio (Task 4c).
    Ni AllLanesDead — bridge huliweka kama PAUSED_QUOTA (resume inawezekana), si ERROR."""


_SECRET_RX = re.compile(
    r"(?i)(bearer\s+|api[_-]?key[=:\s\"']+|key=|authorization[\"':\s]+)[^\s\"'&,}]+"
    r"|\b(sk-[A-Za-z0-9_\-]{6,}|AIza[0-9A-Za-z_\-]{10,}|AQ\.[0-9A-Za-z_\-.]{10,})"
    r"|\b[A-Za-z0-9_\-]{32,}\b")


def redact(text: str, limit: int = 120) -> str:
    """Ondoa API keys / Authorization / tokens ndefu kabla ya kuandika log (Task 4c §5)."""
    return _SECRET_RX.sub("***", str(text or ""))[:limit]


class LaneRouterCore:
    """Policy core: inachagua lane, inapima matumizi, inasubiri kwa busara.

    `now`/`sleep` ni injectable — testi zinatumia saa bandia (fake time, bila network).
    """

    # 11-slot cycle: Flash 4, Flash-Lite 4, Uno 2, OpenRouter 1. This is a soft
    # capacity mix, not a hard provider tier. A band without eligible lanes is skipped.
    DEFAULT_DISPATCH_SCHEDULE = (
        "gemini-flash", "gemini-flash", "gemini-flash", "gemini-flash",
        "gemini-lite", "gemini-lite", "gemini-lite", "gemini-lite",
        "unorouter", "unorouter", "openrouter",
    )

    def __init__(self, main_pool: "lanes.LanePool", dharura_pool: "lanes.LanePool | None" = None,
                 now=time.time, sleep=time.sleep, usage_cb=None, event_cb=None,
                 wait_cap: float = lanes.WAIT_HARD_CAP_S, dispatch_schedule=None,
                 log_cb=None, deadline_s: float = lanes.INFERENCE_DEADLINE_S,
                 max_attempts: int = lanes.MAX_ATTEMPTS_PER_CALL, label: str = "main"):
        self.pools = [p for p in (main_pool, dharura_pool) if p is not None]
        self._owner = {l.lid: p for p in self.pools for l in p.lanes}
        self.now = now
        self.sleep = sleep
        self.usage_cb = usage_cb      # (lane, prompt_toks, completion_toks) — baada ya OK
        self.event_cb = event_cb      # (note: str) — tukio la kupendeza kwa UI (waiting/switch)
        self.wait_cap = wait_cap
        self.dispatch_schedule = tuple(dispatch_schedule or self.DEFAULT_DISPATCH_SCHEDULE)
        if not self.dispatch_schedule:
            self.dispatch_schedule = self.DEFAULT_DISPATCH_SCHEDULE
        self._dispatch_cursor = 0
        self._lane_tie_cursor: dict[str, int] = {}
        self.prompt_total = 0
        self.completion_total = 0
        self.fail_total = 0
        # Task 4c: logs zilizopangika (attempt_start/attempt_failed/fallback_selected/attempt_ok)
        self.log_cb = log_cb          # (event: str, fields: dict) — HAKUNA keys/headers ndani
        self.deadline_s = float(deadline_s)
        self.max_attempts = max(1, int(max_attempts))
        self.label = label

    # ---- uchaguzi ----
    @staticmethod
    def _band(lane: "lanes.Lane") -> str:
        if lane.provider == "gemini":
            return "gemini-lite" if "lite" in lane.model.lower() else "gemini-flash"
        return lane.provider

    def pick(self, t: float | None = None) -> "lanes.Lane | None":
        """Chagua family kwa weighted cycle, kisha lane bora kwa score ya health/load.

        OpenRouter (bila Lightning) ina 1/11 slots; Lightning ni fallback tu (Task 6).
        Model/account zilizozuiwa na quota/cooldown hazipo kwenye candidates kabisa.
        """
        t = self.now() if t is None else t
        candidates: list[tuple["lanes.LanePool", "lanes.Lane"]] = []
        for p in self.pools:
            # Tier-2 huwa score-penalized na inashindana tu ikiwa ni chaguo linalofaa;
            # haifichwi nyuma ya Gemini lanes zilizo wazi kwa sababu tu pool ni tofauti.
            for lane in p.eligible_lanes(t, include_tier2=True):
                candidates.append((p, lane))
        if not candidates:
            return None
        # Task 6 (CEO): Lightning = fallback TU (executor + judge) — inachaguliwa pale tu
        # hakuna lane nyingine yoyote eligible kwa sasa.
        primary = [(p, l) for p, l in candidates if l.model not in lanes.FALLBACK_ONLY_MODELS]
        if primary:
            candidates = primary
        elif self.event_cb:
            try:
                self.event_cb(f"↪ fallback: {candidates[0][1].model[:40]} — hakuna lane nyingine inayopatikana")
            except Exception:
                pass

        schedule = self.dispatch_schedule
        n = len(schedule)
        for offset in range(n):
            idx = (self._dispatch_cursor + offset) % n
            band = schedule[idx]
            band_candidates = [(p, l) for p, l in candidates if self._band(l) == band]
            if not band_candidates:
                continue
            # Ordinary Uno lane first; Ultra remains an execution backstop if those are
            # currently unavailable. Judge has its own pool, so Ultra remains the judge primary.
            if band == "unorouter":
                ordinary = [(p, l) for p, l in band_candidates if not l.tier2]
                if ordinary:
                    band_candidates = ordinary
            ordered = sorted(band_candidates, key=lambda pair: pair[1].lid)
            best_score = min(pool.score(lane) for pool, lane in ordered)
            best = [(pool, lane) for pool, lane in ordered
                    if abs(pool.score(lane) - best_score) < 1e-9]
            tie_idx = self._lane_tie_cursor.get(band, 0) % len(best)
            self._lane_tie_cursor[band] = (tie_idx + 1) % len(best)
            _, lane = best[tie_idx]
            self._dispatch_cursor = (idx + 1) % n
            return lane

        # Unknown provider introduced by a config override: fail open to the best eligible
        # lane, but never add providers which build_pools filters out (Groq/XKiro).
        p, lane = min(candidates, key=lambda pair: (pair[0].score(pair[1]), pair[1].lid))
        return lane

    def _wait_seconds(self, t: float) -> float:
        waits = [p.wait_seconds(t) for p in self.pools]
        waits = [w for w in waits if w is not None]
        return min(waits) if waits else self.wait_cap + 1

    def acquire(self, deadline: float | None = None) -> "lanes.Lane":
        """Lane eligible — ikikosekana: subiri (chunks ≤30s) hadi cap; kisha AllLanesDead.
        `deadline` (epoch, hiari): kusubiri hakupiti deadline ya inference — InferenceDeadline."""
        wait_so_far = 0.0
        noted_wait = False
        while True:
            t = self.now()
            qs = getattr(self, "quota_sync", None)
            if qs is not None:
                qs.maybe(t)
            lane = self.pick(t)
            if lane is not None:
                self._owner[lane.lid].note_start(lane, t)
                return lane
            w = self._wait_seconds(t)
            if w <= 0:
                # race ya eligibility — jaribu tena mara moja
                continue
            if wait_so_far + w > self.wait_cap:
                raise lanes.AllLanesDead(
                    f"lanes zote zimeime zaidi ya cap ({self.wait_cap:.0f}s) — "
                    f"pools: {[p.tier for p in self.pools]}")
            if deadline is not None and t + w + lanes.MIN_ATTEMPT_S > deadline:
                raise InferenceDeadline(
                    f"{self.label}: hakuna lane kabla ya deadline (lane ya kwanza ~{w:.0f}s, "
                    f"zimebaki {max(0.0, deadline - t):.0f}s)")
            chunk = min(w, 30.0, self.wait_cap - wait_so_far)
            if not noted_wait and self.event_cb:
                self.event_cb(f"⏳ lanes zote zimejaa — kusubiri ~{w:.0f}s (cap {self.wait_cap:.0f}s)")
                noted_wait = True
            self.sleep(chunk)
            wait_so_far += chunk

    # ---- matokeo ----
    def success(self, lane: "lanes.Lane", ms: float, resp=None) -> tuple[int, int]:
        pt, ct = extract_usage(resp) if resp is not None else (0, 0)
        self._owner[lane.lid].note_ok(lane, ms, pt, ct, self.now())
        self.prompt_total += pt
        self.completion_total += ct
        if self.usage_cb:
            try:
                self.usage_cb(lane, pt, ct)
            except Exception:
                pass
        return pt, ct

    def failure(self, lane: "lanes.Lane", exc: BaseException, ms: float = 0.0) -> tuple[str, float]:
        kind, ra = classify_fail(exc)
        cd = self._owner[lane.lid].note_fail(lane, kind, ra, self.now(), ms=ms)
        self.fail_total += 1
        if self.event_cb:
            try:
                if kind == "not_found":
                    note = f"↪ lane {lane.model[:40]} haipo (404); imezimwa kwa run hii; nabadili lane"
                else:
                    note = f"↪ lane {lane.model[:40]} ({kind}) — cooldown {cd:.0f}s; nabadili lane"
                self.event_cb(note)
            except Exception:
                pass
        return kind, cd

    def usage_totals(self) -> tuple[int, int]:
        return self.prompt_total, self.completion_total

    # ---- Task 4c: failover ya haraka (jaribio moja kwa lane; lane nyingine papo hapo) ----
    def _log(self, event: str, **fields) -> None:
        if not self.log_cb:
            return
        try:
            self.log_cb(event, {"router": self.label, **fields})
        except Exception:
            pass  # logs kamwe hazizuii kazi

    def run(self, attempt, validate=None, max_invalid: int | None = None):
        """Tekeleza ombi MOJA la inference kwa failover.

        `attempt(lane, timeout_s) -> resp` hufanya jaribio MOJA tu la HTTP (bila retries za ndani).
        Kosa (429/503/connection/timeout/...) → lane inapata cooldown (Retry-After ikiwepo) kwa
        uchaguzi ujao, na lane NYINGINE eligible inajaribiwa PAPO HAPO — hakuna kulala kwenye
        cooldown ya lane iliyoshindwa. Mipaka: deadline ya inference + max_attempts.
        Rudi (lane, resp). Validator (judge): jibu batili = failure 'empty'; baada ya
        `max_invalid` majibu batili, jibu la mwisho linarudishwa (SDK: complete=False).
        """
        start = self.now()
        deadline = start + self.deadline_s
        retry = 0
        invalid = 0
        cap = max_invalid if max_invalid is not None else max(4, 2 * len(self._owner))
        prev: "lanes.Lane | None" = None
        prev_kind = ""
        while True:
            remaining = deadline - self.now()
            if remaining < lanes.MIN_ATTEMPT_S:
                self._log("deadline", retry_count=retry, elapsed_ms=round((self.now() - start) * 1000))
                raise InferenceDeadline(
                    f"{self.label}: deadline {self.deadline_s:.0f}s imepita baada ya majaribio {retry}")
            lane = self.acquire(deadline=deadline)
            t_sel = self.now()
            if prev is not None:
                self._log("fallback_selected", lane=lane.lid, from_lane=prev.lid, after=prev_kind,
                          retry_count=retry, elapsed_ms=round((t_sel - start) * 1000))
            timeout_s = max(1.0, min(float(lane.timeout), deadline - t_sel))
            self._log("attempt_start", lane=lane.lid, retry_count=retry,
                      timeout_s=round(timeout_s, 1), elapsed_ms=round((t_sel - start) * 1000))
            t0 = self.now()
            try:
                resp = attempt(lane, timeout_s)
            except Exception as e:
                ms = (self.now() - t0) * 1000.0
                kind, cd = self.failure(lane, e, ms)
                retry += 1
                self._log("attempt_failed", lane=lane.lid, kind=kind, status=_status_of(e),
                          error=type(e).__name__, detail=redact(e), attempt_ms=round(ms),
                          cooldown_s=round(cd, 1), retry_count=retry,
                          elapsed_ms=round((self.now() - start) * 1000))
                prev, prev_kind = lane, kind
                if retry >= self.max_attempts:
                    raise InferenceDeadline(
                        f"{self.label}: majaribio {retry} yameshindwa mfululizo (mwisho: {kind})")
                continue
            ms = (self.now() - t0) * 1000.0
            if validate is not None:
                try:
                    good = bool(validate(resp))
                except Exception:
                    good = False
                if not good:
                    invalid += 1
                    retry += 1
                    kind, cd = self.failure(lane, InvalidResponse(
                        f"empty or invalid verdict from {lane.model[:40]}"), ms)
                    self._log("attempt_failed", lane=lane.lid, kind=kind, status=None,
                              error="InvalidResponse", detail="", attempt_ms=round(ms),
                              cooldown_s=round(cd, 1), retry_count=retry,
                              elapsed_ms=round((self.now() - start) * 1000))
                    prev, prev_kind = lane, kind
                    if invalid < cap and retry < self.max_attempts:
                        continue
                    return lane, resp  # SDK: haiparsiki → complete=False (haidanganyi)
            self.success(lane, ms, resp)
            self._log("attempt_ok", lane=lane.lid, attempt_ms=round(ms), retry_count=retry,
                      elapsed_ms=round((self.now() - start) * 1000))
            return lane, resp


# ================================================================ glue ya SDK (sandbox tu)
class QuotaSync:
    """§6: soma ledger ya server (Board + CU) kila `every` sekunde wakati wa run na uiweke kwenye
    pools (max — hesabu hazishuki). `fetch()` ni callback (HTTP kwenye bridge); kosa = kimya."""

    def __init__(self, pools: dict, fetch, every: float = 60.0, now=time.time):
        self.pools, self.fetch, self.every, self.now = pools, fetch, every, now
        self.last = -1e18
        self.applied = 0
        self.fails = 0

    def maybe(self, t: float | None = None) -> bool:
        t = self.now() if t is None else t
        if t - self.last < self.every:
            return False
        self.last = t
        try:
            snap = self.fetch()
        except Exception:
            self.fails += 1
            return False
        if not snap:
            self.fails += 1
            return False
        lanes.apply_quota_snapshot(self.pools, snap, t)
        self.applied += 1
        return True


class InvalidResponse(RuntimeError):
    """Jibu la lane halikidhi validator (mf. verdict ya judge tupu/si JSON) — kind 'empty'."""


def make_router(core: LaneRouterCore, llms_by_lid: dict, event_cb=None, validate=None,
                max_invalid: int | None = None):
    """Jenga LaneRouter ya SDK iliyounganishwa na core.

    `validate(resp) -> bool` (hiari, kwa judge): jibu batili = failure ya lane ('empty'),
    linaandikwa kwenye log na lane inayofuata (fallback) inajaribiwa. Baada ya `max_invalid`
    majibu batili mfululizo, jibu la mwisho linarudishwa — SDK hulisoma kwa uhafidhina
    (complete=False), kwa hiyo jibu batili HALIWEZI kuwa "complete".

    LLM instances zinatengenezwa na caller (bridge) — faili hii haiimport SDK kwa
    module-level: DEFAULT ni ku-import hapa ndani (local tests haziihitaji).
    """
    from openhands.sdk.llm.router import RandomRouter  # SDK ya sandbox (v1.46+)
    from openhands.sdk.llm import Message  # noqa: F401 — typings za select_llm

    from pydantic import ConfigDict
    from typing import Any

    class LaneRouter(RandomRouter):
        model_config = ConfigDict(arbitrary_types_allowed=True)
        core: Any = None

        def select_llm(self, messages) -> str:  # no SDK-side randomness — policy yetu
            lane = self.core.acquire()
            return lane.lid

        def completion(self, messages, tools=None, add_security_risk_prediction=False,
                       on_token=None, call_context=None, **kwargs):
            # Task 4c: failover iko kwenye core.run (pure, testable). Kila jaribio ni MOJA:
            #  • SDK: num_retries=1 → tenacity stop_after_attempt(1) (bridge._sdk_llm_for);
            #  • litellm/openai client: max_retries=0 — bila hii client ya OpenAI hujaribu tena
            #    mara 2 KIMYAKIMYA (inaheshimu Retry-After ≤60s) kabla kosa halijatufikia;
            #  • timeout ya jaribio hili = timeout ya lane ∩ muda uliobaki wa deadline.
            def attempt(lane, timeout_s):
                llm = self.llms_for_routing[lane.lid]
                kw = dict(kwargs)
                kw["max_retries"] = 0
                kw["timeout"] = float(timeout_s)
                return llm.completion(
                    messages=messages, tools=tools,
                    add_security_risk_prediction=add_security_risk_prediction,
                    on_token=on_token, call_context=call_context, **kw)

            lane, resp = self.core.run(attempt, validate=validate, max_invalid=max_invalid)
            self.active_llm = self.llms_for_routing[lane.lid]
            return resp

    router = LaneRouter(llms_for_routing=llms_by_lid)
    router.core = core
    if event_cb:
        core.event_cb = event_cb
    return router
