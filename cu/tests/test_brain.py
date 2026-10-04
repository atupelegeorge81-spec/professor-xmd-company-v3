"""cu/tests/test_brain.py — unit tests za Gemini Swap Brain (Awamu A · R31).

Zinaendeswa: python3 -m unittest discover -s cu/tests -t .  (au npm run cu:test)
Hakuna mtandao — transport ni fake; clock ni fake; sleeper haipigi sleep halisi.
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import brain  # noqa: E402


# ---------------------------------------------------------------- fixtures

def make_cfg():
    return {
        "gemini": {
            "keys": {"gemini-1": "K1", "gemini-2": "K2"},
            "flashModels": ["gemini-3.8-flash", "gemini-3.5-flash"],
            "liteModels": ["gemini-3.5-flash-lite"],
            "flashRpd": 2, "liteRpd": 500, "flashRpm": 5, "liteRpm": 15,
            "baseUrl": "https://gem.example/v1beta/openai",
        },
        "emergency": [
            {"provider": "xkiro", "baseUrl": "https://xk.example/v1", "models": ["qwen/qwen3.8-max:free"],
             "keys": {"xkiro-1": "X1", "xkiro-2": "X2"}, "maxOut": 32000, "ctx": 256000, "reasoning": True},
            {"provider": "openrouter", "baseUrl": "https://or.example/api/v1",
             "models": ["nvidia/nemotron-3-ultra-550b-a55b:free"], "keys": {"or-1": "O1", "or-2": "O2"}},
            {"provider": "groq", "baseUrl": "https://groq.example/openai/v1",
             "models": ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"], "keys": {"groq-1": "G1", "groq-2": "G2"}},
            {"provider": "unorouter", "baseUrl": "https://uno.example/v1",
             "models": ["space-bunny-alpha:free", "nemotron-3-ultra-550b-a55b:free"], "keys": {"uno-1": "U1", "uno-2": "U2"}},
        ],
    }


class FakeClock:
    def __init__(self, start_ms=1_700_000_000_000):
        self.now = start_ms

    def __call__(self):
        return self.now

    def advance(self, ms):
        self.now += ms


class FakeResp:
    """Jibu la 200 lenye SSE lines (stream) au JSON (non-stream)."""

    def __init__(self, lines=None, code=200):
        self.code = code
        self._lines = lines or []

    def __iter__(self):
        return iter(self._lines)

    def read(self, n=-1):
        return b""

    def close(self):
        pass


class FakeErr:
    def __init__(self, code, body):
        self.code = code
        self._body = body.encode("utf-8") if isinstance(body, str) else body

    def read(self, n=-1):
        out, self._body = self._body, b""
        return out

    def close(self):
        pass


class FakeTransport:
    """Script ya majibu kwa kila call (kwa lane au kwa order ya call)."""

    def __init__(self, script):
        self.script = list(script)   # kila kipengele: ("err", code, body, headers) | ("ok", sse_lines) | callable
        self.calls = []              # (lane, payload, stream)

    def __call__(self, lane, payload, stream):
        self.calls.append((lane, payload, stream))
        if not self.script:
            raise AssertionError("transport imeitwa zaidi ya script: " + lane.id)
        step = self.script.pop(0)
        if callable(step):
            return step(lane, payload, stream)
        if step[0] == "err":
            return FakeErr(step[1], step[2]), step[3] if len(step) > 3 else {}, "", 0
        return FakeResp(step[1]), {}, "", 0


def sse_lines(*chunks):
    out = []
    for c in chunks:
        out.append("data: " + json.dumps(c))
    out.append("data: [DONE]")
    return out


def text_chunks(text="Habari ya dunia", usage=None):
    chunks = [{"choices": [{"index": 0, "delta": {"role": "assistant", "content": text}, "finish_reason": None}]}]
    chunks.append({"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}], "usage": usage or {"prompt_tokens": 11, "completion_tokens": 7}})
    return sse_lines(*chunks)


def make_brain(cfg=None, script=(), clock=None, sleeper=None, snapshot=None):
    cfg = cfg or make_cfg()
    if snapshot:
        cfg = json.loads(json.dumps(cfg))
        cfg["gemini"]["quota"] = snapshot.get("gemini", {})
        for prov in cfg.get("emergency", []):
            prov["quota"] = (snapshot or {}).get(prov["provider"], {})
    fh = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    fh.close()
    clock = clock or FakeClock()
    tr = FakeTransport(script)
    b = brain.Brain(cfg, usage_path=fh.name, clock=clock,
                    sleeper=sleeper if sleeper is not None else (lambda s: None), transport=tr)
    return b, tr, clock, fh.name


# ---------------------------------------------------------------- mpangilio wa lanes

class TestLaneOrder(unittest.TestCase):
    def test_gemini_kubwa_kwanza_na_accounts_zinachanganya(self):
        lanes = brain.build_order(make_cfg())
        ids = [l.id for l in lanes]
        self.assertEqual(ids[:6], [
            "gemini-1:gemini-3.8-flash", "gemini-2:gemini-3.8-flash",
            "gemini-1:gemini-3.5-flash", "gemini-2:gemini-3.5-flash",
            "gemini-1:gemini-3.5-flash-lite", "gemini-2:gemini-3.5-flash-lite",
        ])
        self.assertTrue(all(l.tier == "normal" for l in lanes[:6]))

    def test_emergency_mpangilio_xkiro_or_groq_uno(self):
        lanes = [l for l in brain.build_order(make_cfg()) if l.tier == "emergency"]
        ids = [l.id for l in lanes]
        self.assertEqual(ids, [
            "xkiro-1:qwen/qwen3.8-max:free", "xkiro-2:qwen/qwen3.8-max:free",
            "or-1:nvidia/nemotron-3-ultra-550b-a55b:free", "or-2:nvidia/nemotron-3-ultra-550b-a55b:free",
            # Groq: akili kubwa kwanza → gpt-oss-120b kabla ya 27b
            "groq-1:openai/gpt-oss-120b", "groq-2:openai/gpt-oss-120b",
            "groq-1:qwen/qwen3.8-27b", "groq-2:qwen/qwen3.8-27b",
            "uno-1:space-bunny-alpha:free", "uno-2:space-bunny-alpha:free",
            "uno-1:nemotron-3-ultra-550b-a55b:free", "uno-2:nemotron-3-ultra-550b-a55b:free",
        ])

    def test_model_size(self):
        self.assertGreater(brain._model_size("openai/gpt-oss-120b"), brain._model_size("qwen/qwen3.8-27b"))


# ---------------------------------------------------------------- makosa (errors.ts mirror)

class TestClassify(unittest.TestCase):
    def test_gemini_429_daily(self):
        body = '{"error":{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"2","retryDelay":"3600s"}}'
        le = brain.classify_error("gemini", 429, body, {})
        self.assertEqual(le.kind, "daily")
        self.assertGreater(le.until_ms, 0)

    def test_gemini_429_minute(self):
        body = '{"error":{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaValue":"5","retryDelay":"20s"}}'
        le = brain.classify_error("gemini", 429, body, {})
        self.assertEqual(le.kind, "minute")
        self.assertEqual(le.wait_ms, 20000)

    def test_gemini_503_busy(self):
        le = brain.classify_error("gemini", 503, "The model is overloaded. Please try again later.", {})
        self.assertEqual(le.kind, "busy")
        self.assertEqual(le.wait_ms, 30000)

    def test_groq_429_tpd_daily(self):
        le = brain.classify_error("groq", 429, "Rate limit reached for token usage (TPD). Please try again in 1h30m.", {})
        self.assertEqual(le.kind, "daily")
        self.assertEqual(le.wait_ms, 90 * 60_000)

    def test_xkiro_429_quota_daily(self):
        le = brain.classify_error("xkiro", 429, "You exceeded your daily free-model token quota", {})
        self.assertEqual(le.kind, "daily")

    def test_openrouter_429_reset(self):
        le = brain.classify_error("openrouter", 429, "Rate limit exceeded: free-models-per-day", {"x-ratelimit-reset": "1999999999"})
        self.assertEqual(le.kind, "daily")

    def test_openrouter_429_upstream_busy(self):
        le = brain.classify_error("openrouter", 429, "Provider temporarily rate-limited upstream", {})
        self.assertEqual(le.kind, "busy")

    def test_uno_429_minute(self):
        le = brain.classify_error("unorouter", 429, "You may only send 1 request(s) every 1 minute", {})
        self.assertEqual(le.kind, "minute")

    def test_auth_size_fatal(self):
        self.assertEqual(brain.classify_error("gemini", 401, "bad", {}).kind, "auth")
        self.assertEqual(brain.classify_error("groq", 413, "Request too large", {}).kind, "size")
        self.assertEqual(brain.classify_error("gemini", 400, "invalid", {}).kind, "fatal")
        self.assertEqual(brain.classify_error("xkiro", 500, "oops", {}).kind, "transient")
        self.assertEqual(brain.classify_error("xkiro", 402, "payment required", {}).kind, "auth")


# ---------------------------------------------------------------- tafsili ya ombi

class TestTranslateRequest(unittest.TestCase):
    def test_system_na_tool_roundtrip(self):
        body = {
            "system": [{"type": "text", "text": "Wewe ni XMD Computer"}, {"type": "text", "text": " Fuata mpango."}],
            "messages": [
                {"role": "user", "content": "Jenga duka"},
                {"role": "assistant", "content": [
                    {"type": "thinking", "thinking": "nafikiri...", "signature": ""},
                    {"type": "text", "text": "Sawa, naanza."},
                    {"type": "tool_use", "id": "toolu_1", "name": "Bash", "input": {"command": "ls"}},
                ]},
                {"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": "toolu_1",
                     "content": [{"type": "text", "text": "index.html"}, {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "QUJD"}}]},
                ]},
            ],
            "tools": [{"name": "Bash", "description": "Shell", "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}}}],
            "max_tokens": 500,
        }
        p = brain.translate_request(body)
        msgs = p["messages"]
        self.assertEqual(msgs[0], {"role": "system", "content": "Wewe ni XMD Computer Fuata mpango."})
        self.assertEqual(msgs[1], {"role": "user", "content": "Jenga duka"})
        a = msgs[2]
        self.assertEqual(a["role"], "assistant")
        self.assertEqual(a["content"], "Sawa, naanza.")  # thinking imetupuliwa
        self.assertEqual(a["tool_calls"][0]["function"]["name"], "Bash")
        self.assertEqual(json.loads(a["tool_calls"][0]["function"]["arguments"]), {"command": "ls"})
        t = msgs[3]
        self.assertEqual(t["role"], "tool")
        self.assertEqual(t["tool_call_id"], "toolu_1")
        kinds = [part["type"] for part in t["content"]]
        self.assertEqual(kinds, ["text", "image_url"])
        self.assertTrue(t["content"][1]["image_url"]["url"].startswith("data:image/png;base64,"))
        self.assertEqual(p["tools"][0]["function"]["parameters"]["type"], "object")

    def test_strip_images(self):
        body = {"messages": [{"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "t1", "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "QUJD"}}]}]}]}
        p = brain.translate_request(body, strip_images=True)
        self.assertEqual(p["messages"][0]["content"], [{"type": "text", "text": "[picha imeondolewa]"}])
        self.assertFalse(brain.payload_has_images(p))
        self.assertTrue(brain.payload_has_images(brain.translate_request(body)))


# ---------------------------------------------------------------- tafsili ya stream

class TestStreamTranslator(unittest.TestCase):
    def test_text_stream(self):
        tr = brain.AnthropicStreamTranslator()
        evs = []
        evs += tr.feed({"choices": [{"index": 0, "delta": {"role": "assistant", "content": "Hab"}, "finish_reason": None}]})
        evs += tr.feed({"choices": [{"index": 0, "delta": {"content": "ari"}, "finish_reason": None}]})
        evs += tr.feed({"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 9, "completion_tokens": 2}})
        self.assertTrue(tr.gate_passed)
        evs += tr.finish()
        types = [e["type"] for e in evs]
        self.assertEqual(types, ["content_block_start", "content_block_delta", "content_block_delta",
                                 "content_block_stop", "message_delta", "message_stop"])
        self.assertEqual(evs[0]["content_block"]["type"], "text")
        self.assertEqual(evs[1]["delta"]["text"], "Hab")
        self.assertEqual(evs[-2]["usage"]["output_tokens"], 2)
        self.assertEqual(evs[-2]["delta"]["stop_reason"], "end_turn")
        # muundo wa sse_pack
        self.assertTrue(brain.sse_pack(evs[0]).startswith("event: content_block_start\ndata: {"))

    def test_tool_calls_stream(self):
        tr = brain.AnthropicStreamTranslator()
        evs = []
        evs += tr.feed({"choices": [{"index": 0, "delta": {"tool_calls": [
            {"index": 0, "id": "call_9", "type": "function", "function": {"name": "Bash", "arguments": ""}}]}, "finish_reason": None}]})
        evs += tr.feed({"choices": [{"index": 0, "delta": {"tool_calls": [
            {"index": 0, "function": {"arguments": '{"command":"ls"}'}}]}, "finish_reason": None}]})
        evs += tr.feed({"choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}], "usage": {"prompt_tokens": 50, "completion_tokens": 6}})
        evs += tr.finish()
        self.assertEqual(evs[0]["content_block"]["type"], "tool_use")
        self.assertEqual(evs[0]["content_block"]["name"], "Bash")
        deltas = [e for e in evs if e["type"] == "content_block_delta"]
        self.assertEqual(deltas[-1]["delta"]["partial_json"], '{"command":"ls"}')
        md = [e for e in evs if e["type"] == "message_delta"][0]
        self.assertEqual(md["delta"]["stop_reason"], "tool_use")

    def test_reasoning_stream(self):
        tr = brain.AnthropicStreamTranslator()
        evs = tr.feed({"choices": [{"index": 0, "delta": {"reasoning_content": "nafikiri"}, "finish_reason": None}]})
        evs += tr.feed({"choices": [{"index": 0, "delta": {"content": "jibu"}, "finish_reason": "stop"}]})
        evs += tr.finish()
        self.assertEqual(evs[0]["content_block"]["type"], "thinking")
        self.assertEqual(evs[0]["delta"] if "delta" in evs[0] else None, None)  # start haina delta
        sig = [e for e in evs if e["type"] == "content_block_delta" and e["delta"]["type"] == "signature_delta"]
        self.assertTrue(sig, "thinking inahitaji signature_delta tupu")


# ---------------------------------------------------------------- Brain: routing + silent swaps

class TestBrainRouting(unittest.TestCase):
    def test_success_ya_kwanza(self):
        b, tr, clock, path = make_brain(script=[("ok", text_chunks("Jibu la kwanza"))])
        got = []
        self.assertTrue(b.handle({"stream": True, "max_tokens": 100,
                                  "messages": [{"role": "user", "content": "hi"}]}, got.append))
        self.assertEqual(tr.calls[0][0].id, "gemini-1:gemini-3.8-flash")
        types = [e["type"] for e in got]
        self.assertEqual(types[0], "message_start")
        self.assertEqual(types[-1], "message_stop")
        texts = "".join(e["delta"].get("text", "") for e in got if e["type"] == "content_block_delta")
        self.assertEqual(texts, "Jibu la kwanza")
        recs = [json.loads(l) for l in open(path) if l.strip()]
        self.assertEqual(len(recs), 1)
        self.assertTrue(recs[0]["ok"])
        self.assertEqual(recs[0]["total"], 18)

    def test_503_silent_swap_hakuna_event_zisizohitajika(self):
        # lane ya kwanza 503 (busy) → ya pili inafanikiwa; UI (write) inaona JIBU TU
        b, tr, clock, path = make_brain(script=[
            ("err", 503, "overloaded", {}),
            ("ok", text_chunks("Pili")),
        ])
        got = []
        self.assertTrue(b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, got.append))
        self.assertEqual(tr.calls[0][0].id, "gemini-1:gemini-3.8-flash")
        self.assertEqual(tr.calls[1][0].id, "gemini-2:gemini-3.8-flash")
        recs = [json.loads(l) for l in open(path) if l.strip()]
        self.assertEqual([r["ok"] for r in recs], [False, True])
        self.assertEqual(recs[0]["error"], "busy")
        # hakuna event ya "kosa"/"retry" iliyofika kwa write — jibu la mwisho tu
        self.assertNotIn("error", [e["type"] for e in got])
        texts = "".join(e["delta"].get("text", "") for e in got if e["type"] == "content_block_delta")
        self.assertEqual(texts, "Pili")

    def test_emergency_baada_ya_gemini_zote_daily(self):
        # Gemini zote 6 → 429 PerDay; XKiro-1 inafanikiwa
        gem_daily = ("err", 429, '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"2","retryDelay":"3600s"}', {})
        b, tr, clock, path = make_brain(script=[gem_daily] * 6 + [("ok", text_chunks("XKiro jibu", usage={"prompt_tokens": 100, "completion_tokens": 50}))])
        got = []
        self.assertTrue(b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, got.append))
        self.assertTrue(b.emergency)
        self.assertEqual(tr.calls[-1][0].id, "xkiro-1:qwen/qwen3.8-max:free")
        recs = [json.loads(l) for l in open(path) if l.strip()]
        self.assertEqual(sum(1 for r in recs if not r["ok"]), 6)
        self.assertEqual(recs[-1]["account"], "xkiro-1")

    def test_emergency_latch_hairejei_gemini(self):
        gem_daily = ("err", 429, '{"quotaId":"...PerDay...","retryDelay":"3600s"}', {})
        b, tr, clock, path = make_brain(script=[gem_daily] * 6 + [("ok", text_chunks("XKiro")), ("ok", text_chunks("XKiro 2"))])
        b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, lambda e: None)
        b.handle({"stream": True, "messages": [{"role": "user", "content": "tena"}]}, lambda e: None)
        # call ya 2 ilikwenda XKiro MOJA KWA MOJA (hakuna gemini tena)
        self.assertEqual(tr.calls[7][0].id, "xkiro-1:qwen/qwen3.8-max:free")

    def test_minute_cooldown_inasubiri_haishuki_dharura(self):
        gem_minute = ("err", 429, '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaValue":"5","retryDelay":"10s"}', {})
        clock = FakeClock()
        sleeps = []
        b, tr, clock, path = make_brain(
            script=[gem_minute] * 6 + [("ok", text_chunks("baada ya kusubiri"))],
            clock=clock, sleeper=lambda s: (sleeps.append(s), clock.advance(int(s * 1000) + 5)),
        )
        self.assertTrue(b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, lambda e: None))
        self.assertFalse(b.emergency, "cooling ya dakika si dharura")
        self.assertTrue(sleeps, "ilipaswa kusubiri kidogo (silent)")
        self.assertEqual(tr.calls[-1][0].provider, "gemini")

    def test_fatal_400_picha_zinatolewa(self):
        bad400 = ("err", 400, "Unable to submit request because image content is not supported", {})
        b, tr, clock, path = make_brain(script=[bad400, ("ok", text_chunks("bila picha"))])
        body = {"stream": True, "messages": [{"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "t", "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "QUJD"}}]}]}]}
        got = []
        self.assertTrue(b.handle(body, got.append))
        # call ya 2 ni lane ILEILE lakini BILA picha (silent strip + retry)
        self.assertEqual(tr.calls[0][0].id, tr.calls[1][0].id)
        self.assertTrue(brain.payload_has_images(tr.calls[0][1]))
        self.assertFalse(brain.payload_has_images(tr.calls[1][1]))

    def test_all_lanes_zimekufa_brain_fatal(self):
        busy = ("err", 503, "overloaded", {})
        clock = FakeClock()
        b, tr, clock, path = make_brain(script=[busy] * 40, clock=clock,
                                        sleeper=lambda s: clock.advance(int(s * 1000) + 5))
        with self.assertRaises(brain.BrainFatal):
            b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, lambda e: None)

    def test_rpd_local_cap_kutoka_snapshot(self):
        snap = {"gemini": {"gemini-1": {"day": brain.pacific_day(), "chat": {
            "gemini-3.8-flash": {"requests": 2, "rpdLimit": 2}}}}}
        b, tr, clock, path = make_brain(script=[("ok", text_chunks("namba mbili"))], snapshot=snap)
        b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, lambda e: None)
        # gemini-1:3.8 imejaa → gemini-2:3.8 ndiyo iliyopigiwa
        self.assertEqual(tr.calls[0][0].id, "gemini-2:gemini-3.8-flash")

    def test_xkiro_haina_nafasi_inarukwa(self):
        snap = {"xkiro": {"xkiro-1": {"remaining": 100}, "xkiro-2": {"remaining": 100}}}
        gem_daily = ("err", 429, '{"quotaId":"...PerDay...","retryDelay":"3600s"}', {})
        b, tr, clock, path = make_brain(script=[gem_daily] * 6 + [("ok", text_chunks("OR"))], snapshot=snap)
        b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, lambda e: None)
        picked = [c[0].id for c in tr.calls]
        self.assertNotIn("xkiro-1:qwen/qwen3.8-max:free", picked)
        self.assertNotIn("xkiro-2:qwen/qwen3.8-max:free", picked)
        self.assertEqual(picked[-1], "or-1:nvidia/nemotron-3-ultra-550b-a55b:free")

    def test_pacific_reset(self):
        # leo: lane imejaa; kesho (Pacific) inafunguka tena
        now = brain.time.time() * 1000
        before_midnight = brain.next_pacific_midnight(now / 1000) - 60_000
        after_midnight = brain.next_pacific_midnight(now / 1000) + 60_000
        clock = FakeClock(before_midnight)
        snap = {"gemini": {"gemini-1": {"day": brain.pacific_day(before_midnight / 1000), "chat": {
            "gemini-3.8-flash": {"requests": 2, "rpdLimit": 2, "exhaustedUntil": after_midnight}}}}}
        b, tr, clock, path = make_brain(script=[("ok", text_chunks("siku mpya")), ("ok", text_chunks("siku mpya 2"))],
                                        clock=clock, snapshot=snap)
        b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, lambda e: None)
        self.assertEqual(tr.calls[0][0].id, "gemini-2:gemini-3.8-flash")  # gemini-1 imejaa leo
        clock.now = after_midnight  # siku mpya ya Pacific
        b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, lambda e: None)
        self.assertEqual(tr.calls[1][0].id, "gemini-1:gemini-3.8-flash", "siku mpya = reset")

    def test_non_stream_complete(self):
        def ok_nonstream(lane, payload, stream):
            self.assertFalse(stream)
            resp = FakeResp()
            resp.read = lambda n=-1: json.dumps({
                "choices": [{"index": 0, "finish_reason": "tool_calls",
                             "message": {"role": "assistant", "content": "",
                                         "tool_calls": [{"id": "c1", "type": "function",
                                                         "function": {"name": "Write", "arguments": "{\"file_path\":\"a.txt\"}"}}]}}],
                "usage": {"prompt_tokens": 30, "completion_tokens": 10}}).encode()
            return resp, {}, "", 0
        b, tr, clock, path = make_brain(script=[ok_nonstream])
        got = []
        self.assertTrue(b.handle({"stream": False, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 999}, got.append))
        msg = got[0]
        self.assertEqual(msg["type"], "message")
        self.assertEqual(msg["stop_reason"], "tool_use")
        self.assertEqual(msg["content"][0]["type"], "tool_use")
        self.assertEqual(msg["content"][0]["input"], {"file_path": "a.txt"})
        recs = [json.loads(l) for l in open(path) if l.strip()]
        self.assertEqual(recs[0]["total"], 40)

    def test_stream_empty_inajirudia_kimya(self):
        empty = ("ok", sse_lines({"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                                  "usage": {"prompt_tokens": 5, "completion_tokens": 0}}))
        b, tr, clock, path = make_brain(script=[empty, ("ok", text_chunks("si tupu"))])
        got = []
        self.assertTrue(b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, got.append))
        self.assertEqual(len(tr.calls), 2)
        texts = "".join(e["delta"].get("text", "") for e in got if e["type"] == "content_block_delta")
        self.assertEqual(texts, "si tupu")

    def test_midstream_katika_haisumbui(self):
        # stream "inayokatika" baada ya delta moja → BrainAbort (CLI inajirudia); hakuna crash isiyoonekana
        lines = sse_lines({"choices": [{"index": 0, "delta": {"content": "nusu"}, "finish_reason": None}]})

        class HalfResp(FakeResp):
            def __iter__(self):
                yield lines[0]
                raise ConnectionResetError("kikatika")
        tr_script = [lambda l, p, s: (HalfResp(), {}, "", 0)]
        b, tr, clock, path = make_brain(script=tr_script)
        got = []
        with self.assertRaises(brain.BrainAbort):
            b.handle({"stream": True, "messages": [{"role": "user", "content": "hi"}]}, got.append)
        recs = [json.loads(l) for l in open(path) if l.strip()]
        self.assertEqual(recs[-1]["ok"], False)
        self.assertTrue(recs[-1]["error"].startswith("midstream"))


# ---------------------------------------------------------------- siku za Pacific

class TestPacific(unittest.TestCase):
    def test_next_midnight_baada_ya_sasa(self):
        now = brain.time.time() * 1000
        self.assertGreater(brain.next_pacific_midnight(now / 1000), now)

    def test_day_na_rollover(self):
        now = brain.time.time() * 1000
        before = brain.next_pacific_midnight(now / 1000) - 1
        after = brain.next_pacific_midnight(now / 1000) + 1
        self.assertNotEqual(brain.pacific_day(before / 1000), brain.pacific_day(after / 1000))

    def test_parse_duration(self):
        self.assertEqual(brain.parse_duration("20s"), 20000)
        self.assertEqual(brain.parse_duration("1m30s"), 90000)
        self.assertEqual(brain.parse_duration("1h"), 3600000)
        self.assertIsNone(brain.parse_duration("xyz"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
