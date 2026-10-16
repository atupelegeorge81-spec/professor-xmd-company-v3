"""cu/tests/test_r51_ohrouter.py — LaneRouterCore (pure): lanes policy + wait cap (fake time)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lanes  # noqa: E402
from oh_router import LaneRouterCore  # noqa: E402


class Clock:
    def __init__(self, t0=1_800_000_000.0):
        self.t = t0
    def __call__(self):
        return self.t
    def tick(self, s):
        self.t += s


class FakeSleeper:
    """sleep inayosogeza saa bandia — hakuna kusubiri kwa kweli."""
    def __init__(self, clock):
        self.clock = clock
        self.slept = []
    def __call__(self, s):
        self.slept.append(s)
        self.clock.tick(s)


def cfg_sample():
    return {
        "gemini": {"keys": {"gem": "K-GEM"}, "baseUrl": "https://gem.example/v1",
                   "flashModels": ["gemini-3.5-flash"], "flashRpm": 2, "flashRpd": 3},
        "emergency": [
            {"provider": "unorouter", "baseUrl": "https://uno.example/v1",
             "keys": {"uno-1": "K-UNO1"}},
            {"provider": "openrouter", "baseUrl": "https://or.example/v1",
             "keys": {"or-1": "K-OR1"}},
        ],
    }


def make(clock):
    pools = lanes.build_pools(cfg_sample(), run_id="r1", now=clock)
    sleeper = FakeSleeper(clock)
    usage = []
    events = []
    core = LaneRouterCore(pools["main"], pools["dharura"], now=clock, sleep=sleeper,
                          usage_cb=lambda lane, pt, ct: usage.append((lane.lid, pt, ct)),
                          event_cb=lambda note: events.append(note), wait_cap=60.0)
    return core, pools, sleeper, usage, events


def test_acquire_inachagua_na_kupima_start():
    c = Clock()
    core, pools, _, usage, _ = make(c)
    lane = core.acquire()
    assert lane.provider in ("gemini", "unorouter", "openrouter")
    st = pools["main"].state[lane.lid]
    assert st.req_count == 1
    assert usage == []  # start haihesabii tokens


def test_rotation_haitumii_lane_ileile_mara_kwa_mara():
    c = Clock()
    core, _, _, _, _ = make(c)
    lids = [core.acquire().lid for _ in range(4)]
    assert len(set(lids)) >= 2  # rotation inachanganya (mixing ya lanes)


def test_kosa_linaweka_cooldown_na_lane_inayofuata_inachaguliwa():
    c = Clock()
    core, pools, _, _, events = make(c)
    lane = core.acquire()
    kind, cd = core.failure(lane, RuntimeError("429 Too Many Requests"))
    assert kind == "rate_limited" and cd >= 60.0
    st = pools["main"].state[lane.lid]
    assert st.cooldown_until > c()
    lane2 = core.acquire()
    assert lane2.lid != lane.lid  # policy inahama mara moja, bila kusubiri
    assert any("cooldown" in e for e in events)


def test_lane_imekaa_zaidi_ya_cap_all_lanes_dead_mara_moja(tmp_path):
    c = Clock()
    pools = lanes.build_pools(cfg_sample(), run_id="r2", now=c)
    sleeper = FakeSleeper(c)
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=sleeper, wait_cap=60.0)
    # zifunge ZOTE kwa muda mrefu (cooldown 300s > cap 60s)
    for p in (pools["main"], pools["dharura"]):
        for lane in p.lanes:
            p.note_fail(lane, "server_error", retry_after=300.0, t=c())
    try:
        core.acquire()
        assert False, "ingetakiwa AllLanesDead"
    except lanes.AllLanesDead as e:
        assert "cap" in str(e)
    assert sleeper.slept == []  # hakuna cha kusubiri — wait moja tayari imezidi cap


def test_rpm_window_inafunguka_ndani_ya_cap_subiri_kisha_endelea():
    c = Clock()
    cfg = cfg_sample()
    cfg["ohRoster"] = {"uno_main": [("minimax-m2.7:free", 10)], "uno_tier2": [],
                       "judge": ["nemotron-3-ultra-550b-a55b:free"], "or_main": []}
    del cfg["emergency"][1]                  # bila openrouter
    cfg["gemini"]["keys"] = {}               # bila gemini — lane MOJA tu
    pools = lanes.build_pools(cfg, run_id="r2b", now=c)
    assert len(pools["main"].lanes) == 1
    sleeper = FakeSleeper(c)
    core = LaneRouterCore(pools["main"], None, now=c, sleep=sleeper, wait_cap=90.0)
    lane1 = core.acquire()                   # rpm 1 kwa model/account → inajaa
    lane2 = core.acquire()                   # dakika ikisha → inafunguka tena (≤90s cap)
    assert lane1.lid == lane2.lid
    assert sum(sleeper.slept) >= 60.0 - 1e-6
    assert all(s <= 30.0 for s in sleeper.slept)  # chunks ≤ 30s


def test_kusubiri_kufika_kwa_funguko_la_dakika():
    c = Clock()
    pools = lanes.build_pools(cfg_sample(), run_id="r3", now=c)
    # funga lanes zote za main kupitia cooldown fupi
    for lane in pools["main"].lanes:
        pools["main"].note_fail(lane, "rate_limited", retry_after=10.0, t=c())
    sleeper = FakeSleeper(c)
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=sleeper, wait_cap=300.0)
    lane = core.acquire()  # dharura ipo wazi — inachukuliwa BILA kusubiri
    assert lane.provider == "openrouter"


def test_success_inahesabu_tokens_na_kupiga_usage_cb():
    c = Clock()
    core, pools, _, usage, _ = make(c)
    lane = core.acquire()
    u = type("U", (), {"prompt_tokens": 12, "completion_tokens": 8})()
    m = type("M", (), {"accumulated_token_usage": u})()
    resp = type("Resp", (), {"metrics": m, "raw_response": None})()
    pt, ct = core.success(lane, 250.0, resp)
    assert (pt, ct) == (12, 8)
    assert core.usage_totals() == (12, 8)
    st = pools["main"].state[lane.lid]
    assert st.ok_count == 1 and st.in_tok == 12 and st.out_tok == 8
    assert usage == [(lane.lid, 12, 8)]


def test_engine_cfg_ya_leo_inazalisha_lanes_kamili():
    """Contract na engine.ts: build_pools inasoma cfg['gemini']+cfg['emergency'] — bila
    mabadiliko yoyote ya engine (isipokuwa flag ya backend)."""
    c = Clock()
    pools = lanes.build_pools(cfg_sample(), run_id="s1", now=c)
    assert pools["main"].lanes and pools["dharura"].lanes and pools["judge"].lanes
    lids = {l.lid for p in pools.values() for l in p.lanes}
    assert all(":" in lid for lid in lids)


def test_weighted_dispatch_openrouter_si_emergency_ziko_wazi():
    c = Clock()
    core, pools, _, _, _ = make(c)
    chosen = [core.acquire() for _ in range(11)]
    providers = [l.provider for l in chosen]
    assert providers.count("openrouter") >= 1
    assert providers.count("unorouter") >= 1
    assert any(l.provider == "gemini" and "lite" in l.model for l in chosen)


def test_openrouter_quota_ni_shared_kati_ya_main_na_judge():
    c = Clock()
    cfg = cfg_sample()
    day = lanes.utc_day(c())
    cfg["emergency"][1]["keys"]["or-2"] = "K-OR2"
    cfg["emergency"][1]["quota"] = {"or-1": {"day": day, "requests": 49}}
    pools = lanes.build_pools(cfg, run_id="quota-cross-pool", now=c)
    main_or = next(l for l in pools["dharura"].lanes if l.account == "or-1")
    pools["dharura"].note_start(main_or, c())  # request 50: account quota is now exhausted
    assert not any(l.account == "or-1" for l in pools["judge"].eligible_lanes())
    assert any(l.account == "or-2" for l in pools["judge"].eligible_lanes())


def test_judge_inapendelea_uno_ultra_na_openrouter_ni_fallback():
    c = Clock()
    cfg = cfg_sample()
    cfg["emergency"][0]["keys"]["uno-2"] = "K-UNO2"
    pools = lanes.build_pools(cfg, run_id="judge-priority", now=c)
    sleeper = FakeSleeper(c)
    core = LaneRouterCore(pools["judge"], now=c, sleep=sleeper, wait_cap=60.0,
                          dispatch_schedule=("unorouter",))
    n_uno = 2 * lanes.uno_rpm("nemotron-3-ultra-550b-a55b:free")  # accounts 2 × 5/dk
    got = [core.acquire() for _ in range(n_uno + 1)]
    assert all(l.provider == "unorouter" for l in got[:n_uno])
    assert got[n_uno].provider == "openrouter"  # Uno accounts zote ziko ndani ya RPM window
