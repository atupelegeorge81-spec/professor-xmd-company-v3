# R40 · quota ya kweli (TPM) + "kopa kidogo" (compaction) + beats za waiting.
# Ushahidi wa session 6ac803e2: calls ~97k tokens zilijaza TPM ya dakika bila brain kujua
# (ilipata 429 tu), na ukwema wa dakika 15 ulilipa pause ya uongo — sandbox ikauawa.
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "cu"))
sys.path.insert(0, os.path.dirname(__file__))

import brain  # noqa: E402
from test_brain import FakeClock, make_brain, make_cfg  # noqa: E402


class TestTpmLimit(unittest.TestCase):
    """R40-A: TPM (tokens/dakika) kwa lane — inapakiwa KABLA ya 429, inafunguka baada ya dakika."""

    def _gem_lane(self, b):
        return next(l for l in b.order if l.provider == "gemini")

    def test_tpm_imejaa_lane_haitayari(self):
        cfg = make_cfg()
        cfg["gemini"]["tpmLimit"] = 1000
        b, tr, clock, path = make_brain(cfg=cfg)
        lane = self._gem_lane(b)
        b.record_usage(lane, True, prompt=900, completion=100)
        ready, wake = b._ready(lane, clock.now + 1000)
        self.assertFalse(ready)
        self.assertGreater(wake, clock.now)  # countdown hadi dirisha lifunguke

    def test_tpm_inafunguka_baada_ya_dakika(self):
        cfg = make_cfg()
        cfg["gemini"]["tpmLimit"] = 1000
        b, tr, clock, path = make_brain(cfg=cfg)
        lane = self._gem_lane(b)
        b.record_usage(lane, True, prompt=900, completion=100)
        ready, _ = b._ready(lane, clock.now + 61_000)
        self.assertTrue(ready)

    def test_tpm_ya_lane_haipathani_kwa_lane_nyingine(self):
        cfg = make_cfg()
        cfg["gemini"]["tpmLimit"] = 1000
        b, tr, clock, path = make_brain(cfg=cfg)
        gem = [l for l in b.order if l.provider == "gemini"]
        b.record_usage(gem[0], True, prompt=900, completion=100)
        ready, _ = b._ready(gem[1], clock.now + 1000)
        self.assertTrue(ready)  # lane ya pili (akaunti nyingine) haina tatizo

    def test_tpm_default_kutoka_cfg_za_production(self):
        b, tr, clock, path = make_brain()
        self.assertEqual(b.tpm_limit, 200_000)  # default ya engine.ts buildCuConfig


class TestKopaKidogo(unittest.TestCase):
    """R40-F: compaction — plan (ujumbe wa kwanza) unaendelea KAMILI; ya zamani yanabanwa;
    picha za zamani zinaondolewa; tool_calls/signatures hazibadiliki."""

    @staticmethod
    def _body(n_rounds=14):
        plan = "MPANGO KAZI: HATUA 1..%d — Official Data: Bei 12,000; Simu +255 700 000 000." % n_rounds
        msgs = [{"role": "user", "content": [{"type": "text", "text": plan}]}]
        for i in range(n_rounds):
            msgs.append({"role": "assistant", "content": [
                {"type": "text", "text": "Nimefanya hatua %d — matokeo marefu ya maelezo hapa " % i + ("neno " * 120)},
                {"type": "tool_use", "id": f"call_{i}", "name": "Bash", "input": {"command": f"echo {i}"}},
            ]})
            tool_content = [{"type": "text", "text": "matokeo ya command " * 80}]
            if i == 2:  # picha ya zamani (screenshot ya base64)
                tool_content.append({"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}})
            msgs.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": f"call_{i}", "content": tool_content}]})
        return msgs

    def _translate(self, ctx=None):
        body = {"model": "claude-sonnet-4-5", "messages": self._body(), "max_tokens": 500}
        return brain.translate_request(body, ctx=ctx)

    def test_plan_haibanwi_kamwe(self):
        p = self._translate({"window": 6, "toolChars": 100, "textChars": 200})
        first = p["messages"][0]  # hakuna system → user wa kwanza (plan) ni msgs[0]
        txt = first["content"] if isinstance(first["content"], str) else first["content"][0]["text"]
        self.assertIn("MPANGO KAZI", txt)
        self.assertIn("+255 700 000 000", txt)  # Official Data KAMILI

    def test_ya_zamani_yamebanwa_na_alama_ipo(self):
        p = self._translate({"window": 6, "toolChars": 100, "textChars": 200})
        old_tool = next(m for m in p["messages"] if m.get("role") == "tool")
        txt = old_tool["content"][0]["text"]
        self.assertIn("XMD:banwa", txt)
        self.assertLess(len(txt), 200)

    def test_dirisha_la_karibu_halibanwi(self):
        p = self._translate({"window": 6, "toolChars": 100, "textChars": 200})
        last_tool = [m for m in p["messages"] if m.get("role") == "tool"][-1]
        self.assertNotIn("XMD:banwa", last_tool["content"][0]["text"])
        self.assertGreater(len(last_tool["content"][0]["text"]), 500)  # kamili

    def test_picha_ya_zamani_imeondolewa(self):
        p = self._translate({"window": 6, "toolChars": 100, "textChars": 200})
        flat = json.dumps(p["messages"])
        self.assertNotIn('"AAAA"', flat)  # base64 haipitishwi tena
        self.assertIn("picha ya zamani imeondolewa", flat)

    def test_tool_calls_na_structure_hazibadiliki(self):
        p = self._translate({"window": 6, "toolChars": 100, "textChars": 200})
        tools = [m for m in p["messages"] if m.get("role") == "assistant" and m.get("tool_calls")]
        self.assertEqual(len(tools), 14)  # zote 14 zipo — hakuna kufutwa
        # kila tool message inafuata assistant yenye tool_calls (muundo halali wa OpenAI)
        for i, m in enumerate(p["messages"]):
            if m.get("role") == "tool":
                prev = p["messages"][i - 1]
                self.assertEqual(prev.get("role"), "assistant")

    def test_hakuna_ctx_history_fupi_haiguswi(self):
        # default (window 10) — history ya short (<10) inabaki kamili (back-compat ya tests/API)
        body = {"model": "m", "messages": [
            {"role": "user", "content": "swali fupi"},
            {"role": "assistant", "content": "jibu fupi"},
        ]}
        p = brain.translate_request(body, ctx=None)
        self.assertEqual(p["messages"][0]["content"], "swali fupi")   # user (plan ya short)
        self.assertEqual(p["messages"][1]["content"], "jibu fupi")    # assistant — intacted


class TestWaitingBeats(unittest.TestCase):
    """R40-B: beats za waiting — usage_out inapata mistari yenye waiting=true (si call halisi)."""

    def test_beat_huandikwa_na_waiting_true(self):
        b, tr, clock, path = make_brain()
        lane = next(l for l in b.order if l.provider == "gemini")
        b._beat(lane, "request inaendelea (45s)")
        lines = [json.loads(l) for l in open(path) if l.strip()]
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0]["waiting"])
        self.assertEqual(lines[0]["total"], 0)
        self.assertEqual(lines[0]["lane"], lane.id)
        self.assertIn("inaendelea", lines[0]["note"])

    def test_sleep_beat_huandika_countdown_na_inaisha(self):
        clock = FakeClock()
        slept = []

        def sleeper(s):
            slept.append(s)
            clock.advance(s * 1000)

        b, tr, _, path = make_brain(clock=clock, sleeper=sleeper)
        b._sleep_beat(45.0, "⏳ cooling")
        lines = [json.loads(l) for l in open(path) if l.strip()]
        self.assertGreaterEqual(len(lines), 2)  # beats za countdown (45s → ~3 beats za 20s)
        self.assertTrue(all(l["waiting"] for l in lines))
        self.assertTrue(any("inarudi" in l["note"] for l in lines))
        self.assertGreater(sum(slept), 40.0)  # meli ilisubiri kwa kweli (clock ilipita mbele)


if __name__ == "__main__":
    unittest.main()


class TestR41KeysNne(unittest.TestCase):
    """R41: Gemini keys 4 — brain.py inazalisha lanes za gemini-3/4 na ku-restores quota yao."""

    @staticmethod
    def _cfg4():
        cfg = make_cfg()
        cfg["gemini"]["keys"] = {
            "gemini-1": "k1", "gemini-2": "k2", "gemini-3": "k3", "gemini-4": "k4",
        }
        return cfg

    def test_lanes_za_gemini3_na_4_zinazalishwa(self):
        b, tr, clock, path = make_brain(cfg=self._cfg4())
        ids = [l.id for l in b.order if l.provider == "gemini"]
        for lane_id in ("gemini-3:gemini-3.8-flash", "gemini-3:gemini-3.5-flash-lite",
                        "gemini-4:gemini-3.8-flash", "gemini-4:gemini-3.5-flash-lite"):
            self.assertIn(lane_id, ids)

    def test_snapshot_ya_gemini3_inarejesha_hali(self):
        cfg = self._cfg4()
        cfg["gemini"]["quota"] = {
            "gemini-3": {"day": "x", "chat": {"gemini-3.5-flash-lite": {"requests": 7, "rpdLimit": 500, "retryAt": 123}}}
        }
        b, tr, clock, path = make_brain(cfg=cfg)
        s = b.state["gemini-3:gemini-3.5-flash-lite"]
        self.assertEqual(s.requests_today, 7)
        self.assertEqual(s.retry_at, 123)

    def test_keys_mbili_bado_zinafanya_kazi_backcompat(self):
        b, tr, clock, path = make_brain()  # make_cfg ya default (keys 2)
        gem = [l.id for l in b.order if l.provider == "gemini"]
        self.assertTrue(gem)
        self.assertFalse(any(i.startswith("gemini-3:") for i in gem))  # hazipo bila key
