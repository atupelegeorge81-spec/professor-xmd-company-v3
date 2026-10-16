"""cu/tests/test_adaptive_brain.py — regression za CU Adaptive Brain (judge fallback + harness loop).

Pure/local: SDK ya OpenHands haipo hapa — RandomRouter/Message zinawekwa kama stubs ndogo
(contract ileile: llms_for_routing + completion) ndani ya fixture tu.
"""
import sys
import types
from pathlib import Path

import pytest
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lanes  # noqa: E402
import oh_router  # noqa: E402
from oh_router import LaneRouterCore  # noqa: E402
from oh_util import (goal_complete, harness_feedback, judge_verdict_valid,  # noqa: E402
                     response_text, run_with_harness)


class Clock:
    def __init__(self, t0=1_800_000_000.0):
        self.t = t0

    def __call__(self):
        return self.t

    def tick(self, s):
        self.t += s


def cfg():
    return {
        "gemini": {"keys": {"gemini-1": "K1", "gemini-2": "K2"}, "baseUrl": "https://gem.example/v1",
                   "flashModels": ["gemini-3.6-flash", "gemini-2.5-flash"], "flashRpm": 5, "flashRpd": 20,
                   "liteModels": ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
                   "liteRpdByModel": {"gemini-3.1-flash-lite": 500, "gemini-flash-lite-latest": 20},
                   "modelSkip": {"gemini-2": ["gemini-2.5-flash"]}},
        "emergency": [
            {"provider": "unorouter", "baseUrl": "https://uno.example/v1",
             "keys": {"uno-1": "U1", "uno-2": "U2"}},
            {"provider": "openrouter", "baseUrl": "https://or.example/v1", "keys": {"or-1": "O1"}},
        ],
    }


# ------------------------------------------------------------------ SDK stubs (fixture tu)
class _Text:
    def __init__(self, text):
        self.text = text


class _Msg:
    def __init__(self, text):
        self.content = [_Text(text)] if text is not None else []


class _Resp:
    def __init__(self, text):
        self.message = _Msg(text)


class _FakeLLM:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def completion(self, **kw):
        self.calls += 1
        r = self.replies.pop(0) if self.replies else ""
        if isinstance(r, BaseException):
            raise r
        return _Resp(r)


@pytest.fixture
def sdk_stub(monkeypatch):
    class RandomRouter(BaseModel):
        model_config = {"arbitrary_types_allowed": True}
        llms_for_routing: dict
        active_llm: object = None

    mods = {}
    for name in ("openhands", "openhands.sdk", "openhands.sdk.llm", "openhands.sdk.llm.router"):
        mods[name] = types.ModuleType(name)
    mods["openhands.sdk.llm.router"].RandomRouter = RandomRouter
    mods["openhands.sdk.llm"].Message = object
    for k, v in mods.items():
        monkeypatch.setitem(sys.modules, k, v)
    yield


def _judge(c, replies_by_acct):
    pools = lanes.build_pools(cfg(), run_id="judge-t", now=c)
    jp = pools["judge"]
    events = []
    core = LaneRouterCore(jp, now=c, sleep=c.tick, wait_cap=600.0, dispatch_schedule=("unorouter",),
                          event_cb=events.append)
    llms = {l.lid: _FakeLLM(replies_by_acct.get(l.account, [])) for l in jp.lanes}
    router = oh_router.make_router(core, llms, validate=judge_verdict_valid)
    return router, core, llms, events, jp


# ------------------------------------------------------------------ judge verdict
def test_verdict_validator():
    assert not judge_verdict_valid(_Resp(""))
    assert not judge_verdict_valid(_Resp(None))
    assert not judge_verdict_valid(_Resp("Nimekagua, inaonekana sawa."))
    assert judge_verdict_valid(_Resp('{"score": 0.4, "complete": false, "missing": "x"}'))
    assert judge_verdict_valid(_Resp('Verdict:\n{"complete": true, "score": 1}'))
    assert response_text(None) == ""


def test_judge_tupu_ni_failure_na_fallback_inajaribiwa(sdk_stub):
    """Ultra uno-1 inarudisha jibu TUPU → failure 'empty' iliyoandikwa log → ultra uno-2."""
    c = Clock()
    good = '{"score": 0.3, "complete": false, "missing": "step 4"}'
    router, core, llms, events, jp = _judge(c, {"uno-1": [""], "uno-2": [good]})
    resp = router.completion(messages=[])
    assert response_text(resp) == good
    assert core.fail_total == 1
    assert any("empty" in e for e in events), events
    used = [lid for lid, l in llms.items() if l.calls]
    assert all("ultra" in lid for lid in used)  # Lightning haikuhitajika


def test_judge_ultra_zote_mbovu_lightning_ni_fallback(sdk_stub):
    c = Clock()
    good = '{"score": 1.0, "complete": true, "missing": ""}'
    router, core, llms, events, jp = _judge(
        c, {"uno-1": [TimeoutError("Request timed out")], "uno-2": ["sina uhakika"], "or-1": [good]})
    resp = router.completion(messages=[])
    assert judge_verdict_valid(resp)
    or_lane = next(lid for lid in llms if lid.startswith("openrouter:"))
    assert "lightning" in or_lane and llms[or_lane].calls == 1
    assert core.fail_total == 2


def test_judge_batili_daima_hairudishi_complete(sdk_stub):
    """Majibu batili mfululizo → jibu la mwisho linarudishwa (SDK: complete=False), si exception."""
    c = Clock()
    router, core, llms, events, jp = _judge(c, {"uno-1": ["", "", ""], "uno-2": ["", "", ""],
                                                "or-1": ["", "", ""]})
    resp = router.completion(messages=[])
    assert not judge_verdict_valid(resp)
    assert core.fail_total >= 4


# ------------------------------------------------------------------ harness loop
class _Outcome:
    def __init__(self, status):
        self.status = status


def test_harness_ikikataa_agent_anarudishiwa_ushahidi_na_kuendelea():
    runs, sent = [], []
    verdicts = [{"ok": False, "passed": 2, "total": 5, "failures": ["f3: exit 1 (npm test)", "f5: no artifact"]},
                {"ok": True, "passed": 5, "total": 5, "failures": []}]
    out, hv, used = run_with_harness(lambda: runs.append(1) or _Outcome("complete"),
                                     lambda: verdicts.pop(0), sent.append, rounds=3)
    assert goal_complete(out) and hv["ok"] and used == 1 and len(runs) == 2
    assert len(sent) == 1 and "f3: exit 1 (npm test)" in sent[0] and "2/5" in sent[0]


def test_harness_raundi_zikiisha_matokeo_ni_kukataa():
    sent = []
    bad = {"ok": False, "passed": 1, "total": 3, "failures": ["f2: exit 2"]}
    out, hv, used = run_with_harness(lambda: _Outcome("complete"), lambda: dict(bad), sent.append, rounds=2)
    assert not hv["ok"] and used == 2 and len(sent) == 2


def test_goal_capped_haiendeshi_harness_wala_ujumbe():
    sent, verify_calls = [], []
    out, hv, used = run_with_harness(lambda: _Outcome("capped"),
                                     lambda: verify_calls.append(1), sent.append, rounds=3)
    assert not goal_complete(out) and hv is None and not sent and not verify_calls


def test_harness_feedback_inabeba_failures():
    msg = harness_feedback({"passed": 0, "total": 1, "failures": ["a: exit 1"]}, 1, 3)
    assert "a: exit 1" in msg and "1/3" in msg


# ------------------------------------------------------------------ roster + quota
def test_ultra_rpm_ni_moja_kati_ya_executor_na_judge():
    """Uno 1 req/dk kwa model×account: Ultra ya executor (tier-2) ikitumika, judge haiioni uno-1."""
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="rpm-shared", now=c)
    ex = next(l for l in pools["main"].lanes if l.tier2 and l.account == "uno-1")
    assert ex.rpm == 5  # Ultra free = 5/dk kwa account (Uno 429 message)
    for _ in range(ex.rpm):
        pools["main"].note_start(ex, c())
    judge_ok = [l.lid for l in pools["judge"].eligible_lanes(c())]
    assert ex.lid not in judge_ok
    c.tick(61)
    assert ex.lid in [l.lid for l in pools["judge"].eligible_lanes(c())]


def test_stale_config_haifufui_groq_laguna_north():
    c = Clock()
    bad = cfg()
    bad["emergency"][0]["models"] = ["laguna-s-2.1:free", "north-mini-code:free", "kimi-k3:free",
                                     "minimax-m2.7:free", "nemotron-3-ultra-550b-a55b:free"]
    bad["emergency"].append({"provider": "groq", "keys": {"groq-1": "G"}, "models": ["openai/gpt-oss-120b"]})
    bad["emergency"].append({"provider": "xkiro", "keys": {"xkiro-1": "X"}, "models": ["qwen"]})
    bad["ohRoster"] = {"judge": ["north-mini-code:free", "nemotron-3-ultra-550b-a55b:free"]}
    pools = lanes.build_pools(bad, run_id="stale", now=c)
    allm = {(l.provider, l.model) for p in pools.values() for l in p.lanes}
    assert not any(p in ("groq", "xkiro") for p, _ in allm)
    assert not any(m.startswith(("laguna", "north", "kimi")) for _, m in allm)
    assert {l.model for l in pools["judge"].lanes if l.provider == "unorouter"} == {"nemotron-3-ultra-550b-a55b:free"}


def test_25_flash_project_1_pekee_na_lite_rpd_kwa_model():
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="skip", now=c)
    g = [l for l in pools["main"].lanes if l.provider == "gemini"]
    assert {l.account for l in g if l.model == "gemini-2.5-flash"} == {"gemini-1"}
    rpd = {l.model: l.rpd for l in g}
    assert rpd["gemini-3.1-flash-lite"] == 500 and rpd["gemini-flash-lite-latest"] == 20


def test_daily_cooldown_hadi_siku_mpya_ya_pacific():
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="daily", now=c)
    lane = next(l for l in pools["main"].lanes if l.model == "gemini-3.6-flash")
    cd = pools["main"].note_fail(lane, "daily", None, c())
    assert abs((c() + cd) - lanes._next_day_start(c(), "pacific")) < 2
    assert lane.lid not in [l.lid for l in pools["main"].eligible_lanes(c())]


def test_openrouter_executor_inaacha_akiba_ya_judge():
    """Spec §2: execution haimalizi quota yote ya OR — judge fallback (Lightning) ina nafasi."""
    c = Clock()
    base = cfg()
    day = lanes.utc_day(c())
    base["emergency"][1]["quota"] = {"or-1": {"day": day, "requests": 50 - lanes.OR_JUDGE_RESERVE}}
    pools = lanes.build_pools(base, run_id="or-reserve", now=c)
    assert not [l for l in pools["dharura"].eligible_lanes(c()) if l.account == "or-1"]
    assert [l for l in pools["judge"].eligible_lanes(c()) if l.provider == "openrouter"]
    j = next(l for l in pools["judge"].lanes if l.provider == "openrouter")
    for _ in range(lanes.OR_JUDGE_RESERVE):
        pools["judge"].note_start(j, c())
    assert not [l for l in pools["judge"].eligible_lanes(c()) if l.provider == "openrouter"]


def test_model_nzima_ikifeli_router_inahamia_model_nyingine_ya_family():
    """Live run 11: gemini-3.8-flash 503/timeout kwa accounts 3 mfululizo. Kosa la model (5xx/
    timeout) linaathiri accounts zote → slot inayofuata ya Flash inachagua model nyingine."""
    c = Clock()
    base = cfg()
    base["gemini"]["flashModels"] = ["gemini-3.8-flash", "gemini-3.6-flash"]
    pools = lanes.build_pools(base, run_id="model-health", now=c)
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=c.tick, wait_cap=60.0,
                          dispatch_schedule=("gemini-flash",))
    first = core.acquire()
    assert first.model == "gemini-3.8-flash"
    core.failure(first, RuntimeError("503 Service Unavailable: high demand"))
    second = core.acquire()
    assert second.model == "gemini-3.6-flash", second.lid  # si 3.8 kwenye account nyingine
    # 429 ni ya project/account tu — haiadhibu model kwa accounts nyingine
    pools2 = lanes.build_pools(base, run_id="model-health-429", now=c)
    core2 = LaneRouterCore(pools2["main"], pools2["dharura"], now=c, sleep=c.tick, wait_cap=60.0,
                           dispatch_schedule=("gemini-flash",))
    a = core2.acquire()
    e429 = RuntimeError("rate limit")
    e429.status_code = 429
    core2.failure(a, e429)
    b = core2.acquire()
    assert b.model == "gemini-3.8-flash" and b.account != a.account
    # baada ya dirisha, model inarudi kushindana (rank yake bora)
    c.tick(lanes.MODEL_FAIL_WINDOW + 1)
    assert pools["main"].model_penalty(first) < lanes.MODEL_FAIL_PENALTY


def test_quota_sync_inaona_matumizi_ya_board_wakati_wa_run():
    """§6: Board ikitumia Gemini/OR wakati CU inaendesha, sync (60s) inaingiza hesabu hizo (max)."""
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="qsync", now=c)
    lane = next(l for l in pools["main"].lanes if l.model == "gemini-3.6-flash" and l.account == "gemini-1")
    pools["main"].note_start(lane, c())  # CU yenyewe: 1
    day_p, day_u = lanes.pacific_day(c()), lanes.utc_day(c())
    snaps = [{"ok": True, "gemini": {"gemini-1": {"day": day_p, "chat": {"gemini-3.6-flash": {"requests": 20}}}},
              "or": {"or-1": {"day": day_u, "requests": 50}}},
             {"ok": True, "gemini": {"gemini-1": {"day": day_p, "chat": {"gemini-3.6-flash": {"requests": 3}}}}}]
    calls = []
    qs = oh_router.QuotaSync(pools, lambda: calls.append(1) or snaps.pop(0), every=60.0, now=c)
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=c.tick, wait_cap=60.0)
    core.quota_sync = qs
    core.acquire()
    assert qs.applied == 1
    elig = {l.lid for l in pools["main"].eligible_lanes(c())}
    assert lane.lid not in elig  # Board ilimaliza 20/20 → CU inaiona papo hapo
    assert not [l for l in pools["dharura"].eligible_lanes(c()) if l.account == "or-1"]
    core.acquire()
    assert len(calls) == 1  # throttle: si kila acquire
    c.tick(61)
    qs.maybe()
    assert pools["main"].state[lane.lid].day_count == 20  # max — snapshot ndogo haishushi hesabu


def test_quota_sync_kosa_la_mtandao_ni_kimya():
    c = Clock()
    pools = lanes.build_pools(cfg(), run_id="qsync-err", now=c)

    def boom():
        raise OSError("connection refused")
    qs = oh_router.QuotaSync(pools, boom, every=60.0, now=c)
    core = LaneRouterCore(pools["main"], pools["dharura"], now=c, sleep=c.tick, wait_cap=60.0)
    core.quota_sync = qs
    assert core.acquire() is not None and qs.fails == 1
