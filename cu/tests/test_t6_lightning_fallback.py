"""cu/tests/test_t6_lightning_fallback.py — Task 6 (CEO): OR Lightning ni FALLBACK TU (executor + judge)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lanes  # noqa: E402
from oh_router import LaneRouterCore  # noqa: E402

LIGHTNING = "nvidia/nemotron-3.5-lightning:free"
OR_ULTRA = "nvidia/nemotron-3-ultra-550b-a55b:free"


class Clock:
    def __init__(self, t0=1_800_000_000.0):
        self.t = t0
    def __call__(self):
        return self.t
    def tick(self, s):
        self.t += s


def cfg():
    return {
        "gemini": {"keys": {"g1": "K-G1", "g2": "K-G2"}, "baseUrl": "https://gem.example/v1",
                   "flashModels": ["gemini-3.6-flash"], "liteModels": ["gemini-3.5-flash-lite"]},
        "emergency": [
            {"provider": "unorouter", "baseUrl": "https://uno.example/v1", "keys": {"uno-1": "U1", "uno-2": "U2"}},
            {"provider": "openrouter", "baseUrl": "https://or.example/v1", "keys": {"or-1": "O1", "or-2": "O2"}},
        ],
    }


def block(pool, lanes_, t, secs=600.0):
    for lane in lanes_:
        pool.note_fail(lane, "rate_limited", retry_after=secs, t=t)


def test_lightning_bado_ipo_kwenye_pools_lakini_ni_fallback_only():
    assert LIGHTNING in lanes.FALLBACK_ONLY_MODELS
    assert OR_ULTRA not in lanes.FALLBACK_ONLY_MODELS
    pools = lanes.build_pools(cfg(), run_id="t6a", now=Clock())
    assert any(l.model == LIGHTNING for l in pools["dharura"].lanes)
    assert any(l.model == LIGHTNING for l in pools["judge"].lanes)


def test_executor_mzunguko_wa_kawaida_hauchagui_lightning():
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="t6b", now=c)
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=c.tick, wait_cap=600.0)
    chosen = []
    for _ in range(44):  # mizunguko 4 ya slots 11
        lane = core.acquire()
        chosen.append(lane)
        core.success(lane, 100.0)
        c.tick(20.0)
    models = [l.model for l in chosen]
    assert LIGHTNING not in models
    assert OR_ULTRA in models                      # band ya OpenRouter bado ina nafasi yake (OR Ultra)
    assert any(l.provider == "gemini" for l in chosen)


def test_executor_lightning_inachaguliwa_tu_zote_nyingine_zikikosekana():
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="t6c", now=c)
    events = []
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=c.tick, wait_cap=600.0,
                          event_cb=events.append)
    block(pools["main"], pools["main"].lanes, c())
    block(pools["dharura"], [l for l in pools["dharura"].lanes if l.model != LIGHTNING], c())
    lane = core.acquire()
    assert lane.model == LIGHTNING
    assert any("fallback" in e for e in events)


def test_executor_or_ultra_kabla_ya_lightning_main_ikifa():
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="t6d", now=c)
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=c.tick, wait_cap=600.0)
    block(pools["main"], pools["main"].lanes, c())
    lane = core.acquire()
    assert lane.model == OR_ULTRA


def test_judge_uno_ultra_kwanza_lightning_fallback_tu():
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="t6e", now=c)
    core = LaneRouterCore(pools["judge"], now=c, sleep=c.tick, wait_cap=60.0, dispatch_schedule=("unorouter",))
    assert core.acquire().provider == "unorouter"
    block(pools["judge"], [l for l in pools["judge"].lanes if l.provider == "unorouter"], c())
    assert core.acquire().model == LIGHTNING
