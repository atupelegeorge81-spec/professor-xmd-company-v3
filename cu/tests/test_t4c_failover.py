"""Task 4c — failover ya haraka (regression).

Inathibitisha: lane ya kwanza ikirudisha 429 au timeout, lane NYINGINE yenye afya inachaguliwa
PAPO HAPO — bila kusubiri retries za SDK/litellm wala cooldown ya lane iliyoshindwa.

Sehemu A (pure): LaneRouterCore.run kwa saa bandia (bila network).
Sehemu B (integration): OpenHands SDK v1.46 HALISI + litellm HALISI + HTTP halisi kwa server za
ndani (127.0.0.1) — `_sdk_llm_for` + `make_router` za production. Inarukwa ikiwa SDK haipo.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import lanes  # noqa: E402
import oh_router  # noqa: E402


# ------------------------------------------------------------------ helpers (pure)
class FakeClock:
    def __init__(self, t0: float = 1_800_000_000.0):
        self.t = t0
        self.sleeps: list[float] = []

    def now(self) -> float:
        return self.t

    def sleep(self, s: float) -> None:
        self.sleeps.append(s)
        self.t += s


class HttpErr(Exception):
    def __init__(self, status: int, msg: str = "", retry_after: float | None = None):
        super().__init__(msg or f"HTTP {status}")
        self.status_code = status
        hdrs = {"retry-after": str(retry_after)} if retry_after is not None else {}
        self.response = type("R", (), {"headers": hdrs, "status_code": status})()


class FakeTimeout(Exception):
    """Kama litellm.Timeout — classify_fail huitambua kwa jina ('timeout')."""


def _lane(name: str, provider: str = "unorouter", model: str | None = None, timeout: float = 45.0,
          rank: int = 30) -> lanes.Lane:
    return lanes.Lane(provider, "acct-" + name, model or ("model-" + name),
                      "https://example.invalid/v1", "sk-SECRET-" + name + "-0123456789abcdef",
                      rpm=0, rpd=0, timeout=timeout, rank=rank)


def _core(lane_list, clock: FakeClock, **kw):
    pool = lanes.LanePool("main", lane_list, now=clock.now)
    pool.usage_path = os.devnull
    logs: list[tuple[str, dict]] = []
    core = oh_router.LaneRouterCore(pool, now=clock.now, sleep=clock.sleep,
                                    dispatch_schedule=("unorouter",),
                                    log_cb=lambda ev, f: logs.append((ev, f)), **kw)
    order = list(lane_list)
    # Mpangilio unaotabirika: lane ya kwanza eligible kwa orodha (A kisha B kisha C).
    core.pick = lambda t=None: next((l for l in order if l in pool.eligible_lanes(t)), None)
    return core, pool, logs


class TestFastFailoverPure(unittest.TestCase):
    def test_429_switches_to_healthy_lane_immediately(self):
        clock = FakeClock()
        a, b = _lane("a"), _lane("b")
        core, pool, logs = _core([a, b], clock)
        calls = []

        def attempt(lane, timeout_s):
            calls.append((lane.lid, timeout_s))
            clock.t += 0.3
            if lane is a:
                raise HttpErr(429, "rate limit", retry_after=55)
            return "jibu"

        t0 = clock.t
        lane, resp = core.run(attempt)
        self.assertIs(lane, b)
        self.assertEqual(resp, "jibu")
        self.assertEqual([c[0] for c in calls], [a.lid, b.lid])      # A mara MOJA tu
        self.assertEqual(clock.sleeps, [])                             # hakuna kulala
        self.assertLess(clock.t - t0, 1.0)                             # si 55s ya Retry-After
        # Retry-After imewekwa kwa A kwa ajili ya uchaguzi UJAO
        self.assertAlmostEqual(pool._st(a).cooldown_until, t0 + 0.3 + 55, delta=0.01)
        self.assertNotIn(a, pool.eligible_lanes(clock.t))
        events = [e for e, _ in logs]
        self.assertEqual(events, ["attempt_start", "attempt_failed", "fallback_selected",
                                  "attempt_start", "attempt_ok"])
        failed = dict(logs[1][1])
        self.assertEqual((failed["kind"], failed["status"], failed["retry_count"]), ("rate_limited", 429, 1))
        self.assertEqual(failed["cooldown_s"], 55.0)
        self.assertEqual(failed["attempt_ms"], 300)
        fb = dict(logs[2][1])
        self.assertEqual((fb["from_lane"], fb["lane"], fb["after"]), (a.lid, b.lid, "rate_limited"))
        self.assertAlmostEqual(pool._st(a).fail_ms, 300.0, delta=0.01)

    def test_timeout_switches_after_one_bounded_attempt(self):
        clock = FakeClock()
        a, b = _lane("a", provider="gemini", model="gemini-3.8-flash", timeout=35.0), _lane("b")
        core, pool, logs = _core([a, b], clock)
        core.dispatch_schedule = ("gemini-flash", "unorouter")
        calls = []

        def attempt(lane, timeout_s):
            calls.append((lane.lid, timeout_s))
            if lane is a:
                clock.t += timeout_s           # jaribio linafika mwisho wa timeout yake
                raise FakeTimeout("Request timed out")
            clock.t += 2.0
            return "jibu"

        t0 = clock.t
        lane, _ = core.run(attempt)
        self.assertIs(lane, b)
        self.assertEqual(calls, [(a.lid, 35.0), (b.lid, 45.0)])        # timeout ya lane, jaribio 1
        self.assertAlmostEqual(clock.t - t0, 37.0, delta=0.01)         # 35 + 2 — si 3 × 35
        self.assertEqual(clock.sleeps, [])
        self.assertEqual(dict(logs[1][1])["kind"], "timeout")
        self.assertGreater(pool._st(a).cooldown_until, clock.t)

    def test_503_and_connection_errors_fail_over(self):
        for exc in (HttpErr(503, "get_channel_failed"), ConnectionError("Connection refused")):
            clock = FakeClock()
            a, b = _lane("a"), _lane("b")
            core, _pool, logs = _core([a, b], clock)
            seen = []

            def attempt(lane, timeout_s, exc=exc):
                seen.append(lane)
                if lane is a:
                    raise exc
                return "ok"

            lane, _ = core.run(attempt)
            self.assertIs(lane, b)
            self.assertEqual(seen, [a, b])
            self.assertEqual(dict(logs[1][1])["kind"], "server_error")

    def test_failed_lane_not_retried_while_cooling(self):
        clock = FakeClock()
        a, b, c = _lane("a"), _lane("b"), _lane("c")
        core, _pool, _logs = _core([a, b, c], clock)
        seen = []

        def attempt(lane, timeout_s):
            seen.append(lane)
            if lane is not c:
                raise HttpErr(429, retry_after=60)
            return "ok"

        lane, _ = core.run(attempt)
        self.assertIs(lane, c)
        self.assertEqual(seen, [a, b, c])            # kila lane mara moja — A haijarudiwa

    def test_deadline_bounds_total_time(self):
        clock = FakeClock()
        a, b = _lane("a"), _lane("b")
        core, _pool, logs = _core([a, b], clock, deadline_s=100.0)

        def attempt(lane, timeout_s):
            clock.t += timeout_s
            raise FakeTimeout("timed out")

        t0 = clock.t
        with self.assertRaises(oh_router.InferenceDeadline) as cm:
            core.run(attempt)
        self.assertIsInstance(cm.exception, lanes.AllLanesDead)    # bridge → PAUSED_QUOTA
        self.assertLessEqual(clock.t - t0, 100.0 + 1e-6)
        starts = [f["timeout_s"] for e, f in logs if e == "attempt_start"]
        self.assertEqual(starts[:2], [45.0, 45.0])
        self.assertLessEqual(sum(starts), 100.0 + 1e-6)              # timeout imekatwa kwa deadline

    def test_attempt_timeout_clipped_to_remaining_deadline(self):
        clock = FakeClock()
        a = _lane("a", timeout=180.0)
        core, _pool, _logs = _core([a], clock, deadline_s=60.0)
        got = []
        core.run(lambda lane, t: got.append(t) or "ok")
        self.assertEqual(got, [60.0])

    def test_max_attempts_stops_endless_retry(self):
        clock = FakeClock()
        ls = [_lane(f"l{i}") for i in range(10)]
        core, _pool, _logs = _core(ls, clock, max_attempts=4)
        n = [0]

        def attempt(lane, timeout_s):
            n[0] += 1
            raise HttpErr(429, retry_after=60)

        with self.assertRaises(oh_router.InferenceDeadline):
            core.run(attempt)
        self.assertEqual(n[0], 4)

    def test_waits_only_when_no_lane_eligible_and_within_deadline(self):
        clock = FakeClock()
        a = _lane("a")
        core, _pool, _logs = _core([a], clock, deadline_s=300.0)
        n = [0]

        def attempt(lane, timeout_s):
            n[0] += 1
            if n[0] == 1:
                raise HttpErr(429, retry_after=20)
            return "ok"

        lane, _ = core.run(attempt)
        self.assertIs(lane, a)
        self.assertAlmostEqual(sum(clock.sleeps), 20.0, delta=0.01)   # lane pekee — ndipo husubiri

    def test_wait_beyond_deadline_raises_instead_of_sleeping(self):
        clock = FakeClock()
        a = _lane("a")
        core, _pool, _logs = _core([a], clock, deadline_s=30.0)

        def attempt(lane, timeout_s):
            raise HttpErr(429, retry_after=120)

        with self.assertRaises(oh_router.InferenceDeadline):
            core.run(attempt)
        self.assertEqual(clock.sleeps, [])

    def test_logs_never_contain_keys(self):
        clock = FakeClock()
        a, b = _lane("a"), _lane("b")
        core, _pool, logs = _core([a, b], clock)

        def attempt(lane, timeout_s):
            if lane is a:
                raise HttpErr(401, f"Incorrect API key provided: {lane.key} Authorization: Bearer {lane.key}")
            return "ok"

        core.run(attempt)
        blob = json.dumps(logs)
        self.assertNotIn(a.key, blob)
        self.assertNotIn(b.key, blob)
        self.assertNotIn("SECRET", blob)
        for k in ("attempt_start", "attempt_failed", "fallback_selected", "attempt_ok"):
            self.assertIn(k, blob)
        self.assertIn("elapsed_ms", blob)
        self.assertIn("retry_count", blob)

    def test_judge_validator_invalid_falls_back(self):
        clock = FakeClock()
        a, b = _lane("a"), _lane("b")
        core, _pool, logs = _core([a, b], clock)
        lane, resp = core.run(lambda lane, t: "bad" if lane is a else "good",
                              validate=lambda r: r == "good")
        self.assertIs(lane, b)
        self.assertEqual(resp, "good")
        self.assertIn("fallback_selected", [e for e, _ in logs])


class TestTimeoutPolicy(unittest.TestCase):
    def test_per_provider_timeouts_from_measured_latency(self):
        at = lanes.attempt_timeout
        self.assertEqual(at("gemini", "gemini-3.8-flash"), 35.0)
        self.assertEqual(at("gemini", "gemini-3.5-flash-lite"), 30.0)
        self.assertEqual(at("unorouter", "minimax-m2.7:free"), 45.0)
        self.assertEqual(at("unorouter", "nemotron-3-ultra-550b-a55b:free"), 75.0)
        self.assertEqual(at("openrouter", "nvidia/nemotron-3.5-lightning:free"), 180.0)
        self.assertGreater(len({at("gemini", "gemini-3.8-flash"), at("gemini", "gemini-3.1-flash-lite"),
                                at("unorouter", "minimax-m2.7:free"),
                                at("openrouter", "nvidia/nemotron-3.5-lightning:free")}), 3)
        self.assertLess(max(lanes.ATTEMPT_TIMEOUT_S.values()), lanes.INFERENCE_DEADLINE_S)

    def test_build_pools_uses_policy_and_keeps_roster(self):
        cfg = {"gemini": {"keys": {"gemini-1": "g1", "gemini-2": "g2"}},
               "emergency": [
                   {"provider": "unorouter", "keys": {"uno-1": "u1", "uno-2": "u2"}},
                   {"provider": "openrouter", "keys": {"or-1": "o1"}}]}
        pools = lanes.build_pools(cfg, run_id="xmdtest-4c")
        all_l = pools["main"].lanes + pools["dharura"].lanes + pools["judge"].lanes
        self.assertTrue(all_l)
        for l in all_l:
            self.assertEqual(l.timeout, lanes.attempt_timeout(l.provider, l.model), l.lid)
            self.assertNotIn(l.provider, ("groq", "xkiro"))
            self.assertNotIn("laguna", l.model)
            self.assertNotIn("north", l.model)
            self.assertNotIn("nemotron-3-super", l.model)


class TestBridgeHelpers(unittest.TestCase):
    def _bridge(self):
        try:
            import oh_bridge
        except Exception as e:  # bridge inahitaji modules za sandbox (bridge.py) — zipo kwenye repo
            self.skipTest(f"oh_bridge import: {e}")
        return oh_bridge

    def test_sdk_retry_policy_is_single_attempt(self):
        ob = self._bridge()
        self.assertEqual(ob.SDK_RETRY_POLICY["num_retries"], 1)
        self.assertEqual(ob.SDK_RETRY_POLICY["retry_max_wait"], 0)

    def test_lanes_dead_unwrapped_from_sdk_wrapper(self):
        ob = self._bridge()

        class ConversationRunError(RuntimeError):
            def __init__(self, orig):
                super().__init__("wrapped")
                self.original_exception = orig

        dead = oh_router.InferenceDeadline("deadline")
        self.assertIs(ob._lanes_dead_of(ConversationRunError(dead)), dead)
        self.assertIsNone(ob._lanes_dead_of(ConversationRunError(ValueError("x"))))


# ------------------------------------------------------------------ Sehemu B: SDK halisi
def _sdk_available() -> bool:
    try:
        import litellm  # noqa: F401
        import openhands.sdk  # noqa: F401
        from openhands.sdk.llm.router import RandomRouter  # noqa: F401
        return True
    except Exception:
        return False


_OK = {"id": "x", "object": "chat.completion", "created": 1, "model": "m",
       "choices": [{"index": 0, "finish_reason": "stop",
                    "message": {"role": "assistant", "content": "sawa"}}],
       "usage": {"prompt_tokens": 11, "completion_tokens": 2, "total_tokens": 13}}


class _Srv:
    """Server za ndani: /r429 (429 + Retry-After 30), /slow (inachelewa 20s), /ok (jibu)."""

    def __init__(self):
        self.hits: list[str] = []
        srv = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get("content-length", 0)))
                kind = self.path.strip("/").split("/")[0]
                srv.hits.append(kind)
                try:
                    if kind == "slow":
                        time.sleep(20)
                    code = 429 if kind == "r429" else 200
                    body = json.dumps({"error": {"message": "rate limit"}} if code == 429 else _OK).encode()
                    self.send_response(code)
                    self.send_header("content-type", "application/json")
                    if code == 429:
                        self.send_header("retry-after", "30")
                    self.send_header("content-length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@unittest.skipUnless(_sdk_available(), "OpenHands SDK/litellm haipo (sandbox ya production inazo)")
class TestRealSdkFailover(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")
        import oh_bridge
        cls.ob = oh_bridge
        cls.srv = _Srv()

    @classmethod
    def tearDownClass(cls):
        cls.srv.close()

    def _router(self, first: str, timeout_a: float = 45.0):
        def mk(path, name, timeout):
            return lanes.Lane("unorouter", "acct-" + name, "model-" + name,
                              f"http://127.0.0.1:{self.srv.port}/{path}/v1", "sk-test-not-real",
                              rpm=0, rpd=0, timeout=timeout, rank=30)
        a, b = mk(first, "a", timeout_a), mk("ok", "b", 45.0)
        pool = lanes.LanePool("main", [a, b])
        pool.usage_path = os.devnull
        logs = []
        core = oh_router.LaneRouterCore(pool, dispatch_schedule=("unorouter",),
                                        log_cb=lambda e, f: logs.append((e, f)))
        core.pick = lambda t=None: next((l for l in (a, b) if l in pool.eligible_lanes(t)), None)
        llms = {l.lid: self.ob._sdk_llm_for(l, "test") for l in (a, b)}
        return oh_router.make_router(core, llms), a, b, logs

    def _ask(self, router):
        from openhands.sdk.llm import Message, TextContent
        t = time.monotonic()
        resp = router.completion(messages=[Message(role="user", content=[TextContent(text="hi")])])
        return resp, time.monotonic() - t

    def test_real_sdk_429_fails_over_without_sdk_or_litellm_retries(self):
        self.srv.hits.clear()
        router, a, b, logs = self._router("r429")
        resp, elapsed = self._ask(router)
        self.assertEqual(resp.message.content[0].text, "sawa")
        self.assertEqual(self.srv.hits.count("r429"), 1)    # default ingekuwa 3 (litellm max_retries=2)
        self.assertEqual(self.srv.hits.count("ok"), 1)
        self.assertLess(elapsed, 5.0)                       # si Retry-After 30s × 2
        self.assertEqual(router.active_llm.model, "openai/" + b.model)
        self.assertIn(("fallback_selected"), [e for e, _ in logs])

    def test_real_sdk_timeout_fails_over_after_single_attempt(self):
        self.srv.hits.clear()
        router, a, b, logs = self._router("slow", timeout_a=2.0)
        resp, elapsed = self._ask(router)
        self.assertEqual(resp.message.content[0].text, "sawa")
        self.assertEqual(self.srv.hits.count("slow"), 1)    # default ingekuwa 3 × timeout
        self.assertLess(elapsed, 6.0)                       # ≈ 2s timeout + jibu la B
        failed = [f for e, f in logs if e == "attempt_failed"][0]
        self.assertEqual(failed["kind"], "timeout")
        self.assertGreaterEqual(failed["attempt_ms"], 1900)

    def test_real_sdk_condenser_accepts_lane_router(self):
        from openhands.sdk import Agent
        from openhands.sdk.context.condenser import LLMSummarizingCondenser
        router, _a, _b, _logs = self._router("ok")
        cond = LLMSummarizingCondenser(llm=router, max_size=60, keep_first=2)
        agent = Agent(llm=router, tools=[], condenser=cond)
        self.assertIs(agent.condenser.llm, router)
        self.assertIs(agent.llm, router)


if __name__ == "__main__":
    unittest.main()
