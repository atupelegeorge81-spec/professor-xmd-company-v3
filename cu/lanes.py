"""CU Adaptive Brain — lane policy ya OpenHands (stdlib tu, bila network).

Jukumu: kutengeneza lane roster, kupima eligibility, kuheshimu quota/cooldown na kutoa
telemetry. oh_router.py huchagua provider-family kwa uzito, kisha policy hii huchagua lane
bora iliyopo kwa health, latency, reliability na load. Tool execution na judging vimegawanywa.

CU providers: Gemini Flash + Flash-Lite, UnoRouter na OpenRouter tu. Groq haitumiki na CU;
XKiro ni ya Board pekee. Gemini RPD ni project/account × model (Pacific day); OpenRouter RPD
ni account nzima (UTC day), ikishirikiwa kati ya executor na judge pools.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import time
from collections import deque
from dataclasses import dataclass, field

# ----------------------------------------------------------------------------- orodha (§0.5)
# (model, rank) — rank ndogo = kwanza kuchaguliwa. Overrides zinakubaliwa tu kwa model
# zilizo kwenye allowlist ya CU hapa chini; stale env/config haiwezi kurudisha model zilizofutwa.
OH_UNO_MAIN_DEFAULT = [
    ("minimax-m2.7:free", 30),
    ("deepseek-v4.1-flash:free", 40),  # probation: ilijibu kwenye probe moja; monitor health yake
]
OH_UNO_TIER2_DEFAULT = [  # execution fallback ya Uno; haitashinda ordinary Uno lanes
    ("nemotron-3-ultra-550b-a55b:free", 50),
]
OH_JUDGE_DEFAULT = [
    "nemotron-3-ultra-550b-a55b:free",  # judge wa kwanza; verdict lazima ithibitishwe na harness
]
OH_OR_MAIN_DEFAULT = [  # fallback inayoweza kutumika mapema; quota 50/account hushirikiwa
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
]
# CU roster is intentionally allow-listed so stale environment/config cannot resurrect
# removed models from an older deployment.
OH_UNO_MAIN_ALLOWED = {"minimax-m2.7:free", "deepseek-v4.1-flash:free"}
OH_UNO_TIER2_ALLOWED = {"nemotron-3-ultra-550b-a55b:free"}
OH_JUDGE_ALLOWED = {"nemotron-3-ultra-550b-a55b:free"}
OH_OR_ALLOWED = {
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
}
OH_OR_JUDGE_FALLBACK = "nvidia/nemotron-3.5-lightning:free"

UNO_RPM_PER_MODEL = 1            # kanuni rasmi ya UnoRouter free (429 + Retry-After)
# Uno ilitaja limit kwenye 429 (live 2026-10-16): nemotron-3-ultra free = 5 req/dk kwa account;
# minimax = 1. Ultra ya executor + judge zinashiriki dirisha hili moja (lid ileile).
UNO_RPM_BY_MODEL = {"nemotron-3-ultra-550b-a55b:free": 5}


def uno_rpm(model: str) -> int:
    return UNO_RPM_BY_MODEL.get(model, UNO_RPM_PER_MODEL)
OR_RPD_PER_ACCOUNT = 50          # free tier ya OpenRouter kwa siku kwa account
MODEL_WIDE_KINDS = ("server_error", "timeout", "empty", "pool_busy")
MODEL_FAIL_WINDOW = 120.0       # s — kosa la model linaathiri accounts zote kwa muda huu
MODEL_FAIL_PENALTY = 10.0       # > tofauti ya rank kati ya model za family moja (5..10, 20..23)
OR_JUDGE_RESERVE = 10           # spec §2: execution isimalize quota — judge fallback ina nafasi
                                # (executor husimama 40/account; judge hufika 50; hesabu ni moja)
UNO_BASE_DEFAULT = "https://api.unorouter.com/v1"
OR_BASE_DEFAULT = "https://openrouter.ai/api/v1"

COOLDOWN_429 = 65.0             # sekunde — mzunguko wa dakika ya Uno unaisha
COOLDOWN_503 = 65.0             # msingi; huongezeka kwa fails mfululizo (cap 300)
COOLDOWN_TIMEOUT = 30.0
WAIT_HARD_CAP_S = 300.0         # zaidi ya hii hakuna cha kusubiri — caller huamua kilele

# Task 4c — timeout ya JARIBIO MOJA (sekunde) kwa family/model, kutokana na latency ya MAFANIKIO
# iliyopimwa (probe live 2026-10-17, prompt 34–47k tokens, jaribio moja la HTTP; run 13 production):
#   Gemini Flash 1.7–8.7s (production ≤17.5s) · Gemini Lite 3.1–6.4s · Uno minimax 0.8–3.5s ·
#   Uno Ultra 17.8–26.2s · OR Lightning 93–164s (55s ya zamani ilikuwa chini ya latency yake halisi).
# Model iliyokwama (run 11: gemini-3.8-flash 65s × 2) sasa inaachiwa mapema → lane nyingine.
ATTEMPT_TIMEOUT_S = {
    "gemini-flash": 35.0,
    "gemini-lite": 30.0,
    "unorouter": 45.0,
    "unorouter:nemotron-3-ultra-550b-a55b:free": 75.0,
    "openrouter": 90.0,
    "openrouter:nvidia/nemotron-3.5-lightning:free": 180.0,
}
INFERENCE_DEADLINE_S = 300.0    # inference MOJA (majaribio yote + kusubiri) — kisha AllLanesDead
MAX_ATTEMPTS_PER_CALL = 16      # majaribio mfululizo yaliyoshindwa kwa ombi moja — kisha AllLanesDead
MIN_ATTEMPT_S = 8.0             # chini ya hii ndani ya deadline: hakuna jaribio jipya


def attempt_timeout(provider: str, model: str) -> float:
    """Timeout ya jaribio moja: model maalum kwanza, kisha family (Gemini Flash/Lite, provider)."""
    exact = ATTEMPT_TIMEOUT_S.get(f"{provider}:{model}")
    if exact is not None:
        return exact
    if provider == "gemini":
        return ATTEMPT_TIMEOUT_S["gemini-lite" if "lite" in model.lower() else "gemini-flash"]
    return ATTEMPT_TIMEOUT_S.get(provider, 60.0)

try:
    from zoneinfo import ZoneInfo
    PACIFIC = ZoneInfo("America/Los_Angeles")
except Exception:  # fallback tu kwa Python builds zisizo na tzdata
    PACIFIC = _dt.timezone(_dt.timedelta(hours=-8))
UTC = _dt.timezone.utc


def _next_day_start(now: float, kind: str) -> float:
    """Epoch ya mwanzo wa siku inayofuata kwenye saa halisi ya provider."""
    tz = PACIFIC if kind == "pacific" else UTC
    current = _dt.datetime.fromtimestamp(now, tz)
    tomorrow = current.date() + _dt.timedelta(days=1)
    return _dt.datetime.combine(tomorrow, _dt.time.min, tzinfo=tz).timestamp()


def utc_day(now: float) -> str:
    return _dt.datetime.fromtimestamp(now, _dt.timezone.utc).strftime("%Y-%m-%d")


def pacific_day(now: float) -> str:
    return _dt.datetime.fromtimestamp(now, PACIFIC).strftime("%Y-%m-%d")


@dataclass
class Lane:
    provider: str          # gemini | unorouter | openrouter
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
    disabled: bool = False       # 404/model unavailable: usijaribu tena ndani ya run hii
    fails: int = 0
    ok_count: int = 0
    req_count: int = 0
    in_tok: int = 0
    out_tok: int = 0
    total_ms: float = 0.0
    fail_ms: float = 0.0         # Task 4c: muda uliopotea kwenye majaribio yaliyoshindwa
    last_fail_kind: str = ""


class AllLanesDead(RuntimeError):
    """Kosa la KILELE pekee — lanes zote zimekufa baada ya kusubiri hadi cap."""


class LanePool:
    """Pool ya tier moja (main / dharura / judge / aux) yenye rotation + quotas + cooldowns."""

    def __init__(self, tier: str, lanes: list[Lane], run_id: str = "", now=time.time,
                 shared_acc_day: dict[tuple[str, str], int] | None = None):
        self.tier = tier
        self.lanes = sorted(lanes, key=lambda l: (l.tier2, l.rank, l.lid))
        self.state: dict[str, LaneState] = {l.lid: LaneState() for l in self.lanes}
        # Shared between main/dharura/judge: OpenRouter's daily quota is account-wide.
        self.acc_day = shared_acc_day if shared_acc_day is not None else {}
        self.now = now
        # Rotation pointer yenye mwanzo thabiti kwa run (spread bila random isiyodhibitiwa)
        seed = int(hashlib.sha256((run_id or tier).encode()).hexdigest()[:8], 16) if run_id else 0
        self._ptr = seed % max(1, len(self.lanes))
        self.usage_path = "/home/user/lane-usage.jsonl"
        # Afya ya MODEL (provider×model) kwa accounts zote: 503 "high demand"/stall/jibu tupu ni
        # hali ya model nzima (live run 11: gemini-3.8-flash 503 → timeout → timeout kwa accounts
        # tofauti). 429/daily ni za account/project — hazihesabiwi hapa.
        self.model_health: dict[tuple[str, str], dict] = {}

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
            if st.disabled:
                continue
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

    def score(self, lane: Lane) -> float:
        """Alama ndogo ni bora: rank ya model + load + afya + latency iliyopimwa."""
        st = self._st(lane)
        latency_penalty = 0.0
        if st.ok_count:
            avg_ms = st.total_ms / st.ok_count
            latency_penalty = min(avg_ms / 15_000.0, 8.0)
        failure_ratio = st.fails / max(1, st.fails + st.ok_count)
        reliability_penalty = failure_ratio * 24.0
        load_penalty = min(st.req_count * 0.8, 40.0)
        tier_penalty = 30.0 if lane.tier2 else 0.0
        return (lane.rank + tier_penalty + latency_penalty + reliability_penalty + load_penalty
                + self.model_penalty(lane))

    def model_penalty(self, lane: Lane, t: float | None = None) -> float:
        """Adhabu ya model nzima: kosa la karibuni (<MODEL_FAIL_WINDOW s) + uwiano wa makosa."""
        mh = self.model_health.get((lane.provider, lane.model))
        if not mh:
            return 0.0
        t = self.now() if t is None else t
        ratio = mh["fails"] / max(1, mh["fails"] + mh["oks"])
        recent = MODEL_FAIL_PENALTY if t - mh["last_fail"] < MODEL_FAIL_WINDOW else 0.0
        return recent + ratio * 4.0  # laini: baada ya dirisha model bora inarudi kujaribiwa

    def pick(self, t: float | None = None, provider: str | None = None,
             include_tier2: bool = False) -> Lane | None:
        """Chagua lane eligible yenye score bora; tie inazunguka ili account zisitawale."""
        t = self.now() if t is None else t
        cand = self.eligible_lanes(t, include_tier2=include_tier2)
        if provider:
            cand = [lane for lane in cand if lane.provider == provider]
        if not cand:
            return None
        n = len(cand)
        indexed = [(self.score(lane), (i - self._ptr) % n, i, lane)
                   for i, lane in enumerate(cand)]
        _, _, idx, lane = min(indexed, key=lambda row: (row[0], row[1]))
        self._ptr = (idx + 1) % max(1, n)
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
        if lane.provider == "openrouter":
            ak = (lane.account, d)
            self.acc_day[ak] = self.acc_day.get(ak, 0) + 1

    def note_ok(self, lane: Lane, ms: float, in_tok: int = 0, out_tok: int = 0,
                t: float | None = None) -> None:
        t = self.now() if t is None else t
        st = self._st(lane)
        st.fails = 0
        st.ok_count += 1
        mh = self.model_health.setdefault((lane.provider, lane.model), {"fails": 0, "oks": 0, "last_fail": 0.0})
        mh["oks"] += 1
        mh["last_fail"] = 0.0  # model imejibu sasa hivi — adhabu ya "karibuni" inaondoka
        st.in_tok += in_tok
        st.out_tok += out_tok
        st.total_ms += ms
        self._meter({"ts": round(t, 3), "tier": self.tier, "lane": lane.lid,
                     "provider": lane.provider, "account": lane.account, "model": lane.model,
                     "ms": round(ms, 1), "in": in_tok, "out": out_tok, "req": 1, "ok": 1})

    def note_fail(self, lane: Lane, kind: str, retry_after: float | None = None,
                  t: float | None = None, ms: float = 0.0) -> float:
        """429/503/5xx/timeout/empty — UKIMYA: haina throw, huweka cooldown tu. Rudi cooldown.
        `ms` = muda wa jaribio lililoshindwa (Task 4c: kumbukumbu ya lane na elapsed)."""
        t = self.now() if t is None else t
        st = self._st(lane)
        st.fails += 1
        st.fail_ms += max(0.0, ms)
        st.last_fail_kind = kind
        if kind in MODEL_WIDE_KINDS:
            mh = self.model_health.setdefault((lane.provider, lane.model), {"fails": 0, "oks": 0, "last_fail": 0.0})
            mh["fails"] += 1
            mh["last_fail"] = t
        if kind == "not_found":
            # Provider 404 ina maana kuwa model/endpoint hii haipatikani. Zima lane kwa
            # run iliyopo; run mpya itajenga state mpya baada ya config/access kuangaliwa.
            st.disabled = True
            cd = 0.0
        elif kind == "rate_limited" and retry_after:
            cd = min(float(retry_after), 300.0)
        elif kind == "rate_limited":
            cd = COOLDOWN_429 * min(st.fails, 3)
        elif kind in ("server_error", "pool_busy"):
            cd = min(COOLDOWN_503 * st.fails, 300.0)
            if retry_after:  # 503 + Retry-After: heshimu ikiwa ni ndefu kuliko msingi wetu
                cd = max(cd, min(float(retry_after), 300.0))
        elif kind == "timeout":
            cd = COOLDOWN_TIMEOUT
            if retry_after:
                cd = max(cd, min(float(retry_after), 300.0))
        elif kind == "daily":  # subiri mpaka siku ya provider ijifungue tena
            cd = max(1.0, _next_day_start(t, lane.day_kind) - t)
        else:  # empty/unknown
            cd = COOLDOWN_429
        st.cooldown_until = max(st.cooldown_until, t + cd)
        self._meter({"ts": round(t, 3), "tier": self.tier, "lane": lane.lid,
                     "provider": lane.provider, "account": lane.account, "model": lane.model,
                     "ms": round(max(0.0, ms), 1), "in": 0, "out": 0, "req": 1, "ok": 0, "kind": kind,
                     "cooldown_s": round(cd, 1)})
        return cd

    def wait_seconds(self, t: float | None = None) -> float:
        """Sekunde mpaka lane ya kwanza ifungue tena (0 ikiwa kuna eligible sasa)."""
        t = self.now() if t is None else t
        if self.eligible_lanes(t):
            return 0.0
        soonest: float | None = None
        for lane in self.lanes:
            st = self._st(lane)
            if st.disabled:
                continue
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
                "disabled": st.disabled,
            }
        return {"tier": self.tier, "lanes": out}


# ----------------------------------------------------------------------------- ujenzi kutoka cfg
def _keys_of(cfg_prov: dict) -> dict[str, str]:
    """cfg ya engine huleta keys kama {label: key}; rudi {(account, key)} zilizojaa."""
    return {str(a): k for a, k in (cfg_prov.get("keys") or {}).items() if k}


def _epoch_seconds(value) -> float:
    """Ledger ya TypeScript hutumia milliseconds; lane policy hutumia seconds."""
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return n / 1000.0 if n > 100_000_000_000 else n


def _seed_or_quota(pools: dict, or_quota: dict, now: float) -> None:
    """OpenRouter: hesabu ya account nzima (shared_acc_day) = max(local, server) + retryAt."""
    day = utc_day(now)
    any_pool = next(iter(pools.values()), None)
    if any_pool is None:
        return
    acc_day = any_pool.acc_day  # dict moja kwa pools zote
    for acct, rec in (or_quota or {}).items():
        if not isinstance(rec, dict) or (rec.get("day") and rec.get("day") != day):
            continue
        used = int(rec.get("requests") or 0)
        if _epoch_seconds(rec.get("exhaustedUntil")) > now:
            used = max(used, OR_RPD_PER_ACCOUNT)
        acc_day[(acct, day)] = max(acc_day.get((acct, day), 0), used)
        retry_at = _epoch_seconds(rec.get("retryAt"))
        if retry_at > now:
            for pool in pools.values():
                for lane in pool.lanes:
                    if lane.provider == "openrouter" and lane.account == acct:
                        pool.state[lane.lid].cooldown_until = max(pool.state[lane.lid].cooldown_until, retry_at)


def apply_quota_snapshot(pools: dict, snap: dict, now: float | None = None) -> None:
    """§6: tumia snapshot ya ledger ya server (GET wakati wa run) — hesabu hazishuki kamwe (max)."""
    now = time.time() if now is None else now
    gem = {"quota": (snap or {}).get("gemini") or {}}
    for pool in pools.values():
        _seed_gemini_quota(pool, gem, now)
    _seed_or_quota(pools, (snap or {}).get("or") or {}, now)


def _seed_gemini_quota(pool: LanePool, gem: dict, now: float) -> None:
    """Pakia snapshot ya Board/CU kabla ya dispatch ili run mpya isahau quota iliyotumika."""
    quota = gem.get("quota") or {}
    for lane in pool.lanes:
        if lane.provider != "gemini":
            continue
        acct = quota.get(lane.account) or {}
        if acct.get("day") and acct.get("day") != pacific_day(now):
            continue
        rec = ((acct.get("chat") or {}).get(lane.model) or {})
        if not rec:
            continue
        st = pool.state[lane.lid]
        day = acct.get("day") or pacific_day(now)
        server = int(rec.get("requests") or 0)
        # max(local, server): ledger ya server ina matumizi ya Board + CU (events za CU hufika kwa kuchelewa)
        st.day_count = max(st.day_count if st.day == day else 0, server)
        st.day = day
        untils = [_epoch_seconds(rec.get(k)) for k in ("exhaustedUntil", "retryAt", "busyUntil")]
        st.cooldown_until = max([st.cooldown_until, *untils])


def build_pools(cfg: dict, run_id: str = "", now=time.time) -> dict[str, LanePool]:
    """Jenga CU pools: main (Gemini Flash/Lite + Uno), OpenRouter fallback na judge.

    OpenRouter huingia kwenye dispatch weighted (si baada ya providers wote kufa).
    Account quota yake ni shared kati ya main, fallback na judge. Groq/XKiro hazijengwi hapa,
    hata kama config ya zamani bado ina entries zao.
    """
    roster = cfg.get("ohRoster") or {}
    raw_uno_main = roster["uno_main"] if "uno_main" in roster else OH_UNO_MAIN_DEFAULT
    raw_uno_t2 = roster["uno_tier2"] if "uno_tier2" in roster else OH_UNO_TIER2_DEFAULT
    raw_judge = roster["judge"] if "judge" in roster else OH_JUDGE_DEFAULT
    raw_or = roster["or_main"] if "or_main" in roster else OH_OR_MAIN_DEFAULT
    uno_main = [(m, r) for m, r in raw_uno_main if m in OH_UNO_MAIN_ALLOWED]
    uno_t2 = [(m, r) for m, r in raw_uno_t2 if m in OH_UNO_TIER2_ALLOWED]
    judge_models = [m for m in raw_judge if m in OH_JUDGE_ALLOWED]
    or_models = [m for m in raw_or if m in OH_OR_ALLOWED]

    gem = cfg.get("gemini") or {}
    gkeys = _keys_of(gem)
    gbase = gem.get("baseUrl") or "https://generativelanguage.googleapis.com/v1beta/openai"
    flash_models = list(gem.get("flashModels") or ["gemini-3.6-flash", "gemini-3.5-flash"])
    lite_models = list(gem.get("liteModels") or [
        "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
        "gemini-3.1-flash-lite-preview", "gemini-flash-lite-latest",
    ])
    gskip = gem.get("modelSkip") or {}
    flash_rpm = int(gem.get("flashRpm") or 5)
    flash_rpd = int(gem.get("flashRpd") or 20)
    lite_rpm = int(gem.get("liteRpm") or 15)
    lite_rpd = int(gem.get("liteRpd") or 500)
    lite_rpd_by_model = gem.get("liteRpdByModel") or {}

    emergency = [p for p in (cfg.get("emergency") or [])
                 if p.get("provider") in ("unorouter", "openrouter")]
    uno_prov = next((p for p in emergency if p.get("provider") == "unorouter"), {})
    or_prov = next((p for p in emergency if p.get("provider") == "openrouter"), {})
    uno_keys, or_keys = _keys_of(uno_prov), _keys_of(or_prov)
    uno_base = uno_prov.get("baseUrl") or UNO_BASE_DEFAULT
    or_base = or_prov.get("baseUrl") or OR_BASE_DEFAULT
    # Match the roster emitted by engine.ts. If a fixture/old config has no model list,
    # use the safe CU defaults; an explicit list can narrow the roster but never widen it.
    uno_configured = set(uno_prov.get("models") or (
        [m for m, _ in OH_UNO_MAIN_DEFAULT] + [m for m, _ in OH_UNO_TIER2_DEFAULT]))
    or_configured = set(or_prov.get("models") or OH_OR_MAIN_DEFAULT)
    uno_main = [(m, r) for m, r in uno_main if m in uno_configured]
    uno_t2 = [(m, r) for m, r in uno_t2 if m in uno_configured]
    judge_models = [m for m in judge_models if m in uno_configured]
    or_models = [m for m in or_models if m in or_configured]
    shared_acc_day: dict[tuple[str, str], int] = {}

    tiers = 0
    def mk(provider, account, key, model, base, rpm, rpd, rank, day="utc", reasoning=False, tier2=False):
        # Task 4c: timeout ya jaribio moja kwa family/model (latency iliyopimwa) — si moja kwa wote.
        timeout = attempt_timeout(provider, model)
        return Lane(provider, account, model, base, key, rpm=rpm, rpd=rpd, rank=rank + tiers,
                    timeout=timeout, day_kind=day, reasoning=reasoning, tier2=tier2)

    main: list[Lane] = []
    for i, model in enumerate(flash_models):
        for acct, key in sorted(gkeys.items()):
            if model in (gskip.get(acct) or []):
                continue
            main.append(mk("gemini", acct, key, model, gbase, flash_rpm, flash_rpd,
                           5 + i, day="pacific"))
    for i, model in enumerate(lite_models):
        for acct, key in sorted(gkeys.items()):
            if model in (gskip.get(acct) or []):
                continue
            model_rpd = int(lite_rpd_by_model.get(model, lite_rpd))
            main.append(mk("gemini", acct, key, model, gbase, lite_rpm, model_rpd,
                           20 + i, day="pacific"))
    for model, rank in uno_main:
        for acct, key in sorted(uno_keys.items()):
            main.append(mk("unorouter", acct, key, model, uno_base, uno_rpm(model), 0, rank))
    for model, rank in uno_t2:
        for acct, key in sorted(uno_keys.items()):
            main.append(mk("unorouter", acct, key, model, uno_base, uno_rpm(model), 0,
                           rank, tier2=True))

    dharura: list[Lane] = []
    for model in or_models:
        for acct, key in sorted(or_keys.items()):
            dharura.append(mk("openrouter", acct, key, model, or_base, 0,
                              OR_RPD_PER_ACCOUNT - OR_JUDGE_RESERVE, 100 + len(dharura)))

    judge: list[Lane] = []
    for i, model in enumerate(judge_models):
        for acct, key in sorted(uno_keys.items()):
            judge.append(mk("unorouter", acct, key, model, uno_base, uno_rpm(model), 0,
                            10 + i * 10, reasoning=True))
    if OH_OR_JUDGE_FALLBACK in or_configured:
        for acct, key in sorted(or_keys.items()):
            judge.append(mk("openrouter", acct, key, OH_OR_JUDGE_FALLBACK, or_base,
                            0, OR_RPD_PER_ACCOUNT, 900, reasoning=True))

    pools = {
        "main": LanePool("main", main, run_id, now, shared_acc_day),
        "dharura": LanePool("dharura", dharura, run_id, now, shared_acc_day),
        "judge": LanePool("judge", judge, run_id, now, shared_acc_day),
        "aux": LanePool("aux", [l for l in main if l.provider == "gemini"], run_id, now, shared_acc_day),
    }
    for pool in pools.values():
        _seed_gemini_quota(pool, gem, now())

    # RPM ni ya provider (mf. Uno 1/min kwa model×account): lane ileile (lid) kwenye pools
    # tofauti — Ultra ya executor (tier-2) na Ultra ya judge — inashiriki dirisha MOJA la 60s.
    shared_min: dict[str, deque] = {}
    for pool in pools.values():
        for lane in pool.lanes:
            if lane.rpm > 0:
                st = pool.state[lane.lid]
                st.calls_min = shared_min.setdefault(lane.lid, st.calls_min)

    # OpenRouter ledger snapshot is account-wide (all models/roles share the same 50/day).
    _seed_or_quota(pools, or_prov.get("quota") or {}, now())

    return pools
