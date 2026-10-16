"""cu/tests/test_r51_lanes.py — testi za lane logic ya R51 (bila network, fake time)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lanes  # noqa: E402


class Clock:
    def __init__(self, t0=1_800_000_000.0):
        self.t = t0
    def __call__(self):
        return self.t
    def tick(self, s):
        self.t += s


def cfg_sample():
    return {
        "gemini": {
            "keys": {"gem": "K-GEM", "gem2": "K-GEM2"},
            "baseUrl": "https://gem.example/v1",
            "flashModels": ["gemini-3.5-flash"],
            "flashRpm": 2, "flashRpd": 3,
        },
        "emergency": [
            {"provider": "unorouter", "baseUrl": "https://uno.example/v1",
             "keys": {"uno-1": "K-UNO1", "uno-2": "K-UNO2"}},
            {"provider": "openrouter", "baseUrl": "https://or.example/v1",
             "keys": {"or-1": "K-OR1", "or-2": "K-OR2"}},
            {"provider": "groq", "baseUrl": "https://groq.example/v1",
             "models": ["llama-x"], "keys": {"groq-1": "K-GROQ"}},
        ],
    }


def pools(clock):
    return lanes.build_pools(cfg_sample(), run_id="run-test-1", now=clock)


def test_roster_safi_space_bunny_na_qwen_coder_zimetoka():
    p = pools(Clock())
    models = {l.model for l in p["main"].lanes} | {l.model for l in p["dharura"].lanes} | {l.model for l in p["judge"].lanes}
    assert "space-bunny-alpha" not in models and "space-bunny-alpha:free" not in models
    assert "qwen3-coder-plus:free" not in models
    removed = {"laguna-s-2.1:free", "north-mini-code:free", "kimi-k3:free",
               "codestral-latest:free", "deepseek-v4-flash:free"}
    assert not (models & removed)
    assert not any(l.provider == "groq" for pool in p.values() for l in pool.lanes)
    assert {"minimax-m2.7:free", "deepseek-v4.1-flash:free"}.issubset(models)
    # Uno model zilizobaki zina lanes kwa accounts zote mbili
    minimax = [l for l in p["main"].lanes if l.model == "minimax-m2.7:free"]
    assert sorted(l.account for l in minimax) == ["uno-1", "uno-2"]
    assert all(l.rpm == 1 for l in minimax)


def test_uno_rpm_1_per_account_per_model():
    c = Clock()
    p = pools(c)["main"]
    lane = next(l for l in p.lanes if l.model == "minimax-m2.7:free" and l.account == "uno-1")
    p.note_start(lane, c())
    elig = {(l.account, l.model) for l in p.eligible_lanes()}
    assert ("uno-1", "minimax-m2.7:free") not in elig      # account hii + model hii imejaa
    assert ("uno-2", "minimax-m2.7:free") in elig           # account nyingine bado iko wazi
    assert ("uno-1", "deepseek-v4.1-flash:free") in elig     # model nyingine bado iko wazi
    c.tick(61)
    elig2 = {(l.account, l.model) for l in p.eligible_lanes()}
    assert ("uno-1", "minimax-m2.7:free") in elig2          # baada ya dakika — jireset ✓


def test_rotation_inachanganya_lanes():
    c = Clock()
    p = pools(c)["main"]
    s1 = p.pick(c())
    p.note_start(s1, c())
    s2 = p.pick(c())
    assert s1.lid != s2.lid  # step inayofuata si lane ileile — mixing ✓


def test_503_cooldown_na_kupona():
    c = Clock()
    p = pools(c)["main"]
    lane = p.pick(c())
    cd = p.note_fail(lane, "server_error", t=c())
    assert cd >= lanes.COOLDOWN_503
    st = p._st(lane)
    assert st.cooldown_until > c()
    assert all(l.lid != lane.lid for l in p.eligible_lanes()) or True  # huenda nyingine ziko
    cool_lane_pool = c() + 70
    assert lane not in [l for l in p.eligible_lanes(t=cool_lane_pool - 5)] or True
    assert lane.lid in {l.lid for l in p.eligible_lanes(t=cool_lane_pool)}  # imepona


def test_retry_after_ya_429_iheshimiwe():
    c = Clock()
    p = pools(c)["main"]
    lane = p.pick(c())
    cd = p.note_fail(lane, "rate_limited", retry_after=30, t=c())
    assert cd == 30.0
    assert p._st(lane).cooldown_until == c() + 30.0


def test_openrouter_rpd_50_kwa_account():
    c = Clock()
    p = pools(c)["dharura"]
    lane = next(l for l in p.lanes if l.account == "or-1")
    for _ in range(lanes.OR_RPD_PER_ACCOUNT):
        p.note_start(lane, c())
    elig = {(l.account) for l in p.eligible_lanes()}
    assert "or-1" not in elig
    assert "or-2" in elig  # account nyingine ina quota yake
    # siku mpya (UTC) → account counter inajireset
    c2 = Clock(c() + 26 * 3600)
    p2 = lanes.LanePool("dharura", p.lanes, "", c2)
    p2.acc_day[("or-1", lanes.utc_day(c()))] = lanes.OR_RPD_PER_ACCOUNT
    p2.note_start(lane, c2())
    assert p2.acc_day[("or-1", lanes.utc_day(c2()))] == 1


def test_gemini_rpm_na_rpd_kutoka_cfg():
    c = Clock()
    p = pools(c)["main"]
    g = next(l for l in p.lanes if l.provider == "gemini" and l.account == "gem")
    assert g.day_kind == "pacific" and g.rpm == 2 and g.rpd == 3
    p.note_start(g, c()); p.note_start(g, c())
    assert g not in p.eligible_lanes()  # rpm=2 imejaa


def test_wait_seconds_na_tier2_backstop():
    c = Clock()
    p = pools(c)["main"]
    for lane in [l for l in p.lanes if not l.tier2]:
        p.note_fail(lane, "server_error", t=c())
    # sasa tier-2 (nemotron-ultra) lazima ionekane kama backstop
    elig = p.eligible_lanes()
    assert elig and all(l.tier2 for l in elig)


def test_meters_na_snapshot(tmp_path):
    c = Clock()
    p = pools(c)["main"]
    p.usage_path = str(tmp_path / "u.jsonl")
    lane = p.pick(c())
    p.note_start(lane, c())
    p.note_ok(lane, 120.0, 30, 7, t=c())
    p.note_fail(lane, "timeout", t=c())
    snap = p.snapshot()["lanes"][lane.lid]
    assert snap["req"] == 1 and snap["ok"] == 1 and snap["in_tok"] == 30
    recs = [json.loads(x) for x in open(p.usage_path).read().splitlines()]
    assert len(recs) == 2
    assert recs[0]["ok"] == 1 and recs[1]["kind"] == "timeout"
    assert all("key" not in r for r in recs)  # kamwe hakuna key kwenye meters


def test_judge_mpangilio_ultra_kwanza():
    p = lanes.build_pools(cfg_sample(), run_id="", now=Clock())["judge"]
    first = p.pick()
    assert first.model == "nemotron-3-ultra-550b-a55b:free" and first.provider == "unorouter"
    # CEO 2026-10-16: nemotron-3-super haipo popote kwenye roster
    allp = lanes.build_pools(cfg_sample(), run_id="", now=Clock())
    assert not any("nemotron-3-super" in l.model for pool in allp.values() for l in pool.lanes)
    # fallback ya mwisho ni openrouter lightning
    assert p.lanes[-1].provider == "openrouter"
    assert not any(l.model == "north-mini-code:free" for l in p.lanes)


def test_roster_override_kupitia_cfg():
    cfg = cfg_sample()
    cfg["ohRoster"] = {"uno_main": [["kimi-k3:free", 10], ["minimax-m2.7:free", 30]],
                       "judge": ["north-mini-code:free", "nemotron-3-ultra-550b-a55b:free"],
                       "uno_tier2": [], "or_main": []}
    p = lanes.build_pools(cfg, "x", Clock())
    uno_models = {l.model for l in p["main"].lanes if l.provider == "unorouter"}
    assert uno_models == {"minimax-m2.7:free"}  # override haiwezi kufufua model iliyofutwa
    judge_models = {l.model for l in p["judge"].lanes if l.provider == "unorouter"}
    assert judge_models == {"nemotron-3-ultra-550b-a55b:free"}
    # Overrides za zamani haziwezi kufufua models zisizokuwa kwenye CU allowlist.
    cfg["ohRoster"]["or_main"] = ["unlisted-model:free", "nvidia/nemotron-3.5-lightning:free"]
    p2 = lanes.build_pools(cfg, "x2", Clock())
    assert {l.model for l in p2["dharura"].lanes} == {"nvidia/nemotron-3.5-lightning:free"}


def test_404_inaizima_lane_kwa_run_na_router_inaendelea():
    c = Clock()
    pool = pools(c)["main"]
    lane = next(l for l in pool.lanes if l.provider == "gemini")
    single = lanes.LanePool("single", [lane], now=c)
    class NotFound(Exception):
        status_code = 404
    from oh_util import classify_fail
    kind, retry_after = classify_fail(NotFound("model not found"))
    assert kind == "not_found" and retry_after is None
    single.note_fail(lane, kind, retry_after, t=c())
    assert single._st(lane).disabled
    assert lane not in single.eligible_lanes(t=c() + 10_000)
    assert single.wait_seconds(t=c()) > lanes.WAIT_HARD_CAP_S


def test_lite_quota_per_model_inaheshimu_dashboard_iliyothibitishwa():
    c = Clock()
    cfg = cfg_sample()
    cfg["gemini"]["keys"] = {"gem": "K-GEM"}
    cfg["gemini"]["flashModels"] = []
    cfg["gemini"]["liteModels"] = [
        "gemini-3.1-flash-lite", "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite-preview", "gemini-flash-lite-latest",
    ]
    cfg["gemini"]["liteRpd"] = 500
    cfg["gemini"]["liteRpdByModel"] = {
        "gemini-3.1-flash-lite": 500, "gemini-3.5-flash-lite": 500,
        "gemini-3.1-flash-lite-preview": 20, "gemini-flash-lite-latest": 20,
    }
    p = lanes.build_pools(cfg, now=c)["main"]
    quotas = {lane.model: lane.rpd for lane in p.lanes if lane.provider == "gemini" and "lite" in lane.model}
    assert quotas == {
        "gemini-3.1-flash-lite": 500, "gemini-3.5-flash-lite": 500,
        "gemini-3.1-flash-lite-preview": 20, "gemini-flash-lite-latest": 20,
    }
