"""cu/lanes.py — R51 · LANE LOGIC ya OpenHands phase (Awamu 1 ya lane-mixing).

Sifa zake:
  • Stdlib TU (kama brain.py) — inaendesha ndani ya sandbox ya E2B na kwenye testi za local.
  • Haina NETWORK: huamua lanes zipi ziko eligible sasa hivi; matumizi husajiliwa (meters).
  • Design: MECHANISM ya kuchagua LLM ni native ya OpenHands SDK (openhands.sdk.llm.router —
    RouterLLM/RandomRouter, llms_for_routing). FAILI HII ni POLICY tu: quotas, cooldowns,
    mux (muhutasari wa GIA-3): nani aruhusiwe kuingia rosterni lini.
  • UKIMYA: hakuna exception za lane zinazorushwa kwa UI — proxy/caller hupata None au
    wait-seconds; kosa la kilele pekee (AllLanesDead) linaruhusiwa.

Roster (imehakikiwa kwa tool-call LIVE 2026-10-11 — angalia MPANGO-KAZI-R51 §0.5):
  GIA1 main = gemini-flash (keys zetu, fast) + Uno free verified (kimi-k3, deepseek-v4-flash,
  deepseek-v4.1-flash, laguna-s-2.1, north-mini-code, minimax-m2.7,
  codestral-latest) + nemotron-3-ultra (tier-2: text-mode tools).
  ❌ qwen3-coder-plus — IMEOFUTWA kwa agizo la CEO (429 concurrent). ❌ space-bunny — imekufa.
  Dharura = OpenRouter ×2 (rpd 50/account) → Groq kama ilivyo kwenye cfg.
  GIA3 judge = nemotron-3-ultra (Uno) → north-mini-code → OR lightning.
  ❌ nemotron-3-super — IMEONDOLEWA kwa agizo la CEO 2026-10-16 (text bila tool_calls).
  GIA2 aux (condenser/title) = gemini-flash.

Muda: rpm windows ni rolling-60s za requests zilizotumwa; rpd za OpenRouter/Groq = UTC day;
Gemini = Pacific day (kama brain.py — quota yao inajiresetPacific midnight).
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import time
from collections import deque
from dataclasses import dataclass, field

# ----------------------------------------------------------------------------- orodha (§0.5)
# (model, rank) — rank ndogo = kwanza kuchaguliwa. Pool zote zinaweza kubadilishwa kupitia
# cfg["ohRoster"] (env CU_OH_ROSTER kama JSON) — hakuna hardcode ya lazima.
OH_UNO_MAIN_DEFAULT = [
    ("kimi-k3:free", 10),
    ("deepseek-v4-flash:free", 20),
    ("deepseek-v4.1-flash:free", 30),
    # CEO 2026-10-16: laguna-s-2.1 + north-mini-code ZIMEONDOLEWA kwenye main — zilitunga matokeo
    # ya amri bila kuziendesha / ziliandika nia bila kitendo (live ebb85d13, 92a6baeb, f9ecfca9).
    ("minimax-m2.7:free", 70),
    ("codestral-latest:free", 80),
]
OH_UNO_TIER2_DEFAULT = [  # zinafanya kazi lakini kwa mapungufu (text-mode tools kwa ultra)
    ("nemotron-3-ultra-550b-a55b:free", 10),
]
OH_JUDGE_DEFAULT = [  # kwa mpangilio — GIA3. CEO 2026-10-16: ultra ndiye judge; super IMEONDOLEWA
    "nemotron-3-ultra-550b-a55b:free",  # kabisa (inaandika nia kama text bila tool_calls — live 65b76aaa)
    "north-mini-code:free",
]
OH_OR_MAIN_DEFAULT = [  # dharura — rpd 50 kwa account
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
]
OH_OR_JUDGE_FALLBACK = "nvidia/nemotron-3.5-lightning:free"

UNO_RPM_PER_MODEL = 1            # kanuni rasmi ya UnoRouter free (429 + Retry-After)
OR_RPD_PER_ACCOUNT = 50          # free tier ya OpenRouter kwa siku kwa account
UNO_BASE_DEFAULT = "https://api.unorouter.com/v1"
OR_BASE_DEFAULT = "https://openrouter.ai/api/v1"

COOLDOWN_429 = 65.0             # sekunde — mzunguko wa dakika ya Uno unaisha
COOLDOWN_503 = 65.0             # msingi; huongezeka kwa fails mfululizo (cap 300)
COOLDOWN_TIMEOUT = 30.0
COOLDOWN_DAILY = 3 * 3600.0      # quota ya siku (Gemini PerDay) — jaribu tena baada ya masaa 3
WAIT_HARD_CAP_S = 300.0         # zaidi ya hii hakuna cha kusubiri — caller huamua kilele

PACIFIC = _dt.timezone(_dt.timedelta(hours=-8))  # mpangilio wa siku za Gemini (kama brain.py)


def utc_day(now: float) -> str:
    return _dt.datetime.fromtimestamp(now, _dt.timezone.utc).strftime("%Y-%m-%d")


def pacific_day(now: float) -> str:
    return _dt.datetime.fromtimestamp(now, PACIFIC).strftime("%Y-%m-%d")


@dataclass
class Lane:
    provider: str          # gemini | unorouter | openrouter | groq
    account: str
    model: str
    base: str
    key: str               # API key halisi (haionekani kwenye meters/ripoti)
    rpm: int = 0           # 0 = bila kikomo cha dakika
    rpd: int = 0           # 0 = bila kikomo cha siku
    timeout: float = 180.0
    rank: int = 50         # ndogo = upendelevu
    reasoning: bool = False
    tier2: bool = False    # tier-2: itumike tu wengine wameshagaa
    day_kind: str = "utc"  # "utc" | "pacific"

    @property
    def lid(self) -> str:
        return f"{self.provider}:{self.account}:{self.model}"


@dataclass
class LaneState:
    calls_min: deque = field(default_factory=deque)  # timestamps (rolling 60s)
    day: str = ""
    day_count: int = 0
    cooldown_until: float = 0.0
    fails: int = 0
    ok_count: int = 0
    req_count: int = 0
    in_tok: int = 0
    out_tok: int = 0
    total_ms: float = 0.0


class AllLanesDead(RuntimeError):
    """Kosa la KILELE pekee — lanes zote zimekufa baada ya kusubiri hadi cap."""


class LanePool:
    """Pool ya tier moja (main / dharura / judge / aux) yenye rotation + quotas + cooldowns."""

    def __init__(self, tier: str, lanes: list[Lane], run_id: str = "", now=time.time):
        self.tier = tier
        self.lanes = sorted(lanes, key=lambda l: (l.tier2, l.rank, l.lid))
        self.state: dict[str, LaneState] = {l.lid: LaneState() for l in self.lanes}
        self.acc_day: dict[tuple[str, str], int] = {}  # (account, day) → count — rpd ni PER ACCOUNT
        self.now = now
        # Rotation pointer yenye mwanzo thabiti kwa run (spread bila random isiyodhibitiwa)
        seed = int(hashlib.sha256((run_id or tier).encode()).hexdigest()[:8], 16) if run_id else 0
        self._ptr = seed % max(1, len(self.lanes))
        self.usage_path = "/home/user/lane-usage.jsonl"

    # ---- hali ya muda ----
    def _day_of(self, lane: Lane, t: float) -> str:
        return pacific_day(t) if lane.day_kind == "pacific" else utc_day(t)

    def _st(self, lane: Lane) -> LaneState:
        return self.state[lane.lid]

    def eligible_lanes(self, t: float | None = None, include_tier2: bool = False) -> list[Lane]:
        t = self.now() if t is None else t
        out = []
        for lane in self.lanes:
            if lane.tier2 and not include_tier2:
                continue
            st = self._st(lane)
            if st.cooldown_until > t:
                continue
            if lane.rpm > 0:
                while st.calls_min and t - st.calls_min[0] >= 60.0:
                    st.calls_min.popleft()
                if len(st.calls_min) >= lane.rpm:
                    continue
            if lane.rpd > 0:
                d = self._day_of(lane, t)
                # Gemini: quota ni ya kila MODEL kwa akaunti (live 2026-10-16) → hesabu ya lane;
                # OpenRouter: rpd ni ya AKAUNTI nzima → acc_day.
                used = ((st.day_count if st.day == d else 0) if lane.provider == "gemini"
                        else self.acc_day.get((lane.account, d), 0))
                if used >= lane.rpd:
                    continue
            out.append(lane)
        if not out and not include_tier2:
            out = self.eligible_lanes(t, include_tier2=True)
        return out

    def pick(self, t: float | None = None) -> Lane | None:
        """Lane inayofuata eligible (round-robin juu ya eligible set — per-step mixing)."""
        t = self.now() if t is None else t
        cand = self.eligible_lanes(t)
        if not cand:
            return None
        lane = cand[self._ptr % len(cand)]
        self._ptr += 1
        return lane

    def note_start(self, lane: Lane, t: float | None = None) -> None:
        """Sajili ombi LINAPOANZA (rpm ya Uno hupima requests zilizotumwa)."""
        t = self.now() if t is None else t
        st = self._st(lane)
        st.calls_min.append(t)
        d = self._day_of(lane, t)
        if st.day != d:
            st.day, st.day_count = d, 0
        st.day_count += 1
        st.req_count += 1
        ak = (lane.account, d)
        self.acc_day[ak] = self.acc_day.get(ak, 0) + 1

    def note_ok(self, lane: Lane, ms: float, in_tok: int = 0, out_tok: int = 0,
                t: float | None = None) -> None:
        t = self.now() if t is None else t
        st = self._st(lane)
        st.fails = 0
        st.ok_count += 1
        st.in_tok += in_tok
        st.out_tok += out_tok
        st.total_ms += ms
        self._meter({"ts": round(t, 3), "tier": self.tier, "lane": lane.lid,
                     "provider": lane.provider, "account": lane.account, "model": lane.model,
                     "ms": round(ms, 1), "in": in_tok, "out": out_tok, "req": 1, "ok": 1})

    def note_fail(self, lane: Lane, kind: str, retry_after: float | None = None,
                  t: float | None = None) -> float:
        """429/503/5xx/timeout/empty — UKIMYA: haina throw, huweka cooldown tu. Rudi cooldown."""
        t = self.now() if t is None else t
        st = self._st(lane)
        st.fails += 1
        if kind == "rate_limited" and retry_after:
            cd = min(float(retry_after), 300.0)
        elif kind == "rate_limited":
            cd = COOLDOWN_429 * min(st.fails, 3)
        elif kind in ("server_error", "pool_busy"):
            cd = min(COOLDOWN_503 * st.fails, 300.0)
        elif kind == "timeout":
            cd = COOLDOWN_TIMEOUT
        elif kind == "daily":  # quota ya siku imeisha — usijaribu tena kila dk 5 (live: gemini-3.8 ×4)
            cd = COOLDOWN_DAILY
        else:  # empty/unknown
            cd = COOLDOWN_429
        st.cooldown_until = max(st.cooldown_until, t + cd)
        self._meter({"ts": round(t, 3), "tier": self.tier, "lane": lane.lid,
                     "provider": lane.provider, "account": lane.account, "model": lane.model,
                     "ms": 0, "in": 0, "out": 0, "req": 1, "ok": 0, "kind": kind})
        return cd

    def wait_seconds(self, t: float | None = None) -> float:
        """Sekunde mpaka lane ya kwanza ifungue tena (0 ikiwa kuna eligible sasa)."""
        t = self.now() if t is None else t
        if self.eligible_lanes(t):
            return 0.0
        soonest: float | None = None
        for lane in self.lanes:
            st = self._st(lane)
            cand = st.cooldown_until
            if lane.rpm > 0 and st.calls_min:
                cand = max(cand, st.calls_min[0] + 60.0)
            if cand > t and (soonest is None or cand < soonest):
                soonest = cand
        if soonest is None:  # rpd zimeime — haitarudi leo
            return WAIT_HARD_CAP_S + 1
        return max(0.0, soonest - t)

    # ---- meters ----
    def _meter(self, rec: dict) -> None:
        try:
            with open(self.usage_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, separators=(",", ":")) + "\n")
        except OSError:
            pass  # meters kamwe hazizuie kazi

    def snapshot(self) -> dict:
        out = {}
        for lane in self.lanes:
            st = self._st(lane)
            out[lane.lid] = {
                "req": st.req_count, "ok": st.ok_count, "fails": st.fails,
                "in_tok": st.in_tok, "out_tok": st.out_tok, "day_count": st.day_count,
                "cooldown_s": max(0.0, st.cooldown_until - self.now()),
            }
        return {"tier": self.tier, "lanes": out}


# ----------------------------------------------------------------------------- ujenzi kutoka cfg
def _keys_of(cfg_prov: dict) -> dict[str, str]:
    """cfg ya engine huleta keys kama {label: key}; rudi {(account, key)} zilizojaa."""
    return {str(a): k for a, k in (cfg_prov.get("keys") or {}).items() if k}


def build_pools(cfg: dict, run_id: str = "", now=time.time) -> dict[str, LanePool]:
    """Jenga pools: main (gemini flash + Uno roster), dharura (OpenRouter→Groq), judge, aux.

    `cfg` ni cu-config.json ya leo (ina providers: gemini{keys,baseUrl,flashRpm/Rpd},
    emergency[] ya uno/openrouter/groq, na quota snapshots). Override kwa roster:
    cfg["ohRoster"] = {"uno_main":[[model,rank]...],"uno_tier2":[...],"judge":[...],"or_main":[...]}.
    """
    roster = cfg.get("ohRoster") or {}
    uno_main = roster["uno_main"] if "uno_main" in roster else OH_UNO_MAIN_DEFAULT
    uno_t2 = roster["uno_tier2"] if "uno_tier2" in roster else OH_UNO_TIER2_DEFAULT
    judge_models = roster["judge"] if "judge" in roster else OH_JUDGE_DEFAULT
    or_models = roster["or_main"] if "or_main" in roster else OH_OR_MAIN_DEFAULT

    gem = cfg.get("gemini") or {}
    gkeys = _keys_of(gem)
    gbase = gem.get("baseUrl") or "https://generativelanguage.googleapis.com/v1beta/openai"
    # Task 3b: model ZOTE za flash (si [0] pekee) — live 2026-10-16: gemini-3.8-flash ilikuwa
    # "daily" kwenye akaunti zote 4 wakati 3.6/3.5/3-preview zilikuwa hai → CU ilikosa Gemini kabisa.
    flash_models = list(gem.get("flashModels") or ["gemini-3.5-flash"])
    gskip = gem.get("modelSkip") or {}  # R38: (akaunti × model) zilizo 404 — hazizalishwi
    flash_rpm = int(gem.get("flashRpm") or 5)
    flash_rpd = int(gem.get("flashRpd") or 20)

    uno_prov = next((p for p in (cfg.get("emergency") or []) if p.get("provider") == "unorouter"), {})
    or_prov = next((p for p in (cfg.get("emergency") or []) if p.get("provider") == "openrouter"), {})
    groq_prov = next((p for p in (cfg.get("emergency") or []) if p.get("provider") == "groq"), {})
    uno_keys, or_keys, groq_keys = _keys_of(uno_prov), _keys_of(or_prov), _keys_of(groq_prov)
    uno_base = uno_prov.get("baseUrl") or UNO_BASE_DEFAULT
    or_base = or_prov.get("baseUrl") or OR_BASE_DEFAULT
    groq_base = groq_prov.get("baseUrl") or "https://api.groq.com/openai/v1"

    tiers = 0
    def mk(provider, account, key, model, base, rpm, rpd, rank, day="utc", reasoning=False, tier2=False):
        return Lane(provider, account, model, base, key, rpm=rpm, rpd=rpd, rank=rank + tiers,
                    day_kind=day, reasoning=reasoning, tier2=tier2)

    def gem_lanes() -> list[Lane]:
        out = []
        for i, model in enumerate(flash_models):
            for acct, key in sorted(gkeys.items()):
                if model in (gskip.get(acct) or []):
                    continue
                out.append(mk("gemini", acct, key, model, gbase, flash_rpm, flash_rpd, 5 + i, day="pacific"))
        return out

    main: list[Lane] = gem_lanes()
    for model, rank in uno_main:
        for acct, key in sorted(uno_keys.items()):
            main.append(mk("unorouter", acct, key, model, uno_base, UNO_RPM_PER_MODEL, 0, rank))
    for model, rank in uno_t2:
        for acct, key in sorted(uno_keys.items()):
            main.append(mk("unorouter", acct, key, model, uno_base, UNO_RPM_PER_MODEL, 0, rank, tier2=True))

    dharura: list[Lane] = []
    for model in or_models:
        for acct, key in sorted(or_keys.items()):
            dharura.append(mk("openrouter", acct, key, model, or_base, 0, OR_RPD_PER_ACCOUNT, 100))
    for model in groq_prov.get("models") or []:
        for acct, key in sorted(groq_keys.items()):
            dharura.append(mk("groq", acct, key, model, groq_base, 0, 14400, 200))

    judge: list[Lane] = []
    for i, model in enumerate(judge_models):
        for acct, key in sorted(uno_keys.items()):
            judge.append(mk("unorouter", acct, key, model, uno_base, UNO_RPM_PER_MODEL, 0, 10 + i * 10, reasoning=True))
    for acct, key in sorted(or_keys.items()):
        judge.append(mk("openrouter", acct, key, OH_OR_JUDGE_FALLBACK, or_base, 0, OR_RPD_PER_ACCOUNT, 900, reasoning=True))

    aux: list[Lane] = []
    aux.extend(gem_lanes())

    return {
        "main": LanePool("main", main, run_id, now),
        "dharura": LanePool("dharura", dharura, run_id, now),
        "judge": LanePool("judge", judge, run_id, now),
        "aux": LanePool("aux", aux, run_id, now),
    }
