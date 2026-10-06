"""R32: Nidhamu ya agent — HookState (ushauri + brake), fingerprint, tail-shaper.

Idhini ya CEO (06-10 jioni): USHAURI + BRAKE ya majibu pekee — HAKUNA block ya command.
• fingerprint_cmd: command ILEILE (whitespace/temp paths tofauti) = fingerprint moja
• HookState: fail 3/6 → ushauri unakusanywa (pending); success baada ya fails → note ya kufunga
• rewrites 5 → ushauri wa dependencies
• jibu lileile (≈90%) ×3 → {"continue": false} (brake) — ripoti inaandikwa na on_stop
• shape_fail_tail: UI inaona tail ya error (si head tu)
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bridge import HookState, fingerprint_cmd, shape_fail_tail, R32_CLAUDE_MD


class TestFingerprint(unittest.TestCase):
    def test_whitespace_na_tmp_paths_ni_sawa(self):
        a = "npm run build  && npx playwright test"
        b = "npm   run build && npx playwright test ; "
        self.assertEqual(fingerprint_cmd(a), fingerprint_cmd(b))

    def test_tmp_path_tofauti_haitsumbue(self):
        a = "cat /tmp/abc123/axe.json | head"
        b = "cat /tmp/zzz999/axe.json | head"
        self.assertEqual(fingerprint_cmd(a), fingerprint_cmd(b))

    def test_command_tofauti_ni_fp_tofauti(self):
        self.assertNotEqual(fingerprint_cmd("npm test"), fingerprint_cmd("npm run build"))


class TestBashStreaks(unittest.TestCase):
    def test_fail_3_ushauri_pending(self):
        st = HookState()
        for _ in range(2):
            st.note_bash_fail("npm test", "Exit code 1")
            self.assertEqual(st.pending, "")
        st.note_bash_fail("npm test", "Exit code 1")
        self.assertIn("mara 3", st.pending)
        self.assertIn("hypotheses", st.pending)

    def test_fail_6_ushauri_mkali(self):
        st = HookState()
        for _ in range(6):
            st.note_bash_fail("npm test", "Exit code 1\nerror: contrast")
        self.assertIn("mara 6", st.pending)
        self.assertIn("SEHEMU Nyingine", st.pending)

    def test_ushauri_haurudiwi_kwa_streak_ileile(self):
        st = HookState()
        for _ in range(4):
            st.note_bash_fail("npm test", "x")
        # fail ya 4 haizalishi ushauri mpya (threshold ni 3, 6, 10, 15)
        st.take_pending()
        st.note_bash_fail("npm test", "x")
        self.assertEqual(st.pending, "")

    def test_success_inareset_na_inatoa_note(self):
        st = HookState()
        for _ in range(3):
            st.note_bash_fail("npm test", "Exit code 1")
        st.take_pending()
        st.note_bash_ok("npm test")
        self.assertEqual(st.fail_streak, {})
        self.assertIn("IMEFANIKIWA", st.pending)

    def test_mbalimbali_ni_streaks_zitofauti(self):
        st = HookState()
        st.note_bash_fail("npm test", "x")
        st.note_bash_fail("npm run build", "y")
        st.note_bash_fail("npm test", "x")
        self.assertEqual(st.pending, "")  # hakuna iliyofika 3 bado


class TestRewrites(unittest.TestCase):
    def test_rewrite_5_ushauri(self):
        st = HookState()
        for _ in range(4):
            st.note_write("src/AuthPage.tsx")
            st.take_pending()
        st.note_write("src/AuthPage.tsx")
        self.assertIn("mara 5", st.pending)
        self.assertIn("dependency", st.pending)

    def test_files_tofauti_hazichanganyiki(self):
        st = HookState()
        for _ in range(4):
            st.note_write("a.tsx")
            st.note_write("b.tsx")
        self.assertEqual(st.pending, "")


class TestBrake(unittest.TestCase):
    """Semantiki za query-mode: ×3 lileile linahitaji hook kujifORCE continuation kwanza
    (block na ushauri mara 2, ya tatu lileile = brake). Mwisho wa kawaida = {} moja kwa moja."""

    def test_jibu_lileile_x3_brake(self):
        st = HookState()
        a = "Nimejaribu kila kitu lakini QA ya contrast haipiti. Ripoti: imeshindikana."
        out1 = st.note_answer(a)
        self.assertEqual(out1, {})                      # jibu la kwanza: mwisho wa kawaida
        out2 = st.note_answer(a)
        self.assertIn("block_reason", out2)             # la pili: block na ushauri
        out3 = st.note_answer(a)
        self.assertEqual(out3.get("brake"), True)       # la tatu: BRAKE
        self.assertTrue(st.brake_fired)

    def test_pending_ushauri_unaleta_block_si_mwisho(self):
        st = HookState()
        for _ in range(3):
            st.note_bash_fail("npm test", "Exit code 1")
        out = st.note_answer("Nimejaribu kila kitu lakini QA ya contrast haipiti kabisa sasa.")
        self.assertIn("block_reason", out)
        self.assertIn("hypotheses", out["block_reason"])
        self.assertEqual(st.pending, "", "ushauri umetumika kama block_reason")

    def test_jibu_lichenyu_hakuna_brake(self):
        st = HookState()
        st.note_answer("Hatua ya kwanza imekamilika: page imeundwa na server imewaka vizuri.")
        out = st.note_answer("Hatua ya pili imekamilika: tests 12 zinapita, GitHub imepushiwa.")
        self.assertEqual(out, {})

    def test_jibu_fupi_hauhesabiwi_kwenye_answers(self):
        st = HookState()
        out = {}
        for _ in range(4):
            out = st.note_answer("sawa")
        # R32.2: jibu fupi si mwisho halali → block (lakini HAISHIRIKI kwenye answers za
        # similarity — hapa ni empty-stops tu, si brake ya majibu)
        self.assertIn("block_reason", out)
        self.assertEqual(st.answers, [], "jibu fupi haingii kwenye orodha ya majibu")
        self.assertFalse(st.brake_fired)

    def test_karibu_sawa_x3_brake(self):
        st = HookState()
        base = "QA ya color contrast imefeli kwa sababu link ya signup ina rangi isiyo sahihi."
        st.note_answer(base)
        st.note_answer(base + " (jaribio la pili)")
        out = st.note_answer(base + " (jaribio la tatu)")
        self.assertEqual(out.get("brake"), True)

    def test_ushauri_umesha_delivery_hablocking_final(self):
        st = HookState()
        for _ in range(3):
            st.note_bash_fail("npm test", "Exit code 1")
        st.take_pending()   # ume-deliver via PostToolUse (tool nyingine ilifanikiwa)
        out = st.note_answer("Ripoti kamili: hatua zote zimekamilika, QA moja haikupita kwa sababu halisi.")
        self.assertEqual(out, {}, "final report ya kawaida inaisha bila block")


class TestTail(unittest.TestCase):
    def test_tail_ya_mwisho_na_error_section(self):
        head = "\n".join(f"mstari {i}" for i in range(200))
        txt = head + "\nError: contrast 3 violations\n" + "\n".join(f"violation {i}" for i in range(30))
        out = shape_fail_tail(txt, cap=4000)
        self.assertIn("Error: contrast", out)
        self.assertIn("violation 29", out)          # mwisho upo
        self.assertNotIn("mstari 0\n", out[-200:])  # head haiko (imekatwa)
        self.assertLessEqual(len(out), 4000)

    def test_fupi_inarudi_kama_iliyo(self):
        self.assertEqual(shape_fail_tail("Error: kosa", cap=8000), "Error: kosa")


class TestClaudeMd(unittest.TestCase):
    def test_sheria_muhimu_zipo(self):
        self.assertIn("hypotheses", R32_CLAUDE_MD)
        self.assertIn("STATUS.md", R32_CLAUDE_MD)
        self.assertIn("#0000ee", R32_CLAUDE_MD)
        self.assertIn("Haikupita", R32_CLAUDE_MD)
        self.assertIn("Error", R32_CLAUDE_MD)


if __name__ == "__main__":
    unittest.main()


class TestSearchTool(unittest.TestCase):
    """R32-F4: handler ya web_search — Koyeb kwanza, fallback SearXNG direct (mocked HTTP)."""

    def _run(self, coro):
        import asyncio
        return asyncio.get_event_loop().run_until_complete(coro) if hasattr(asyncio, "get_event_loop") \
            else asyncio.run(coro)

    def test_koyeb_kwanza(self):
        import asyncio
        import bridge as br
        import urllib.request as urlreq

        class FakeResp:
            def __init__(self, payload): self.payload = payload
            def read(self): return json.dumps(self.payload).encode()
            def __enter__(self): return self
            def __exit__(self, *a): return False

        calls = []
        real_request = urlreq.Request

        def fake_request(url, data=None, method=None, headers=None):
            calls.append(url)
            self.assertIn("Bearer", headers.get("Authorization", ""))
            return real_request(url, data=data, method=method, headers=headers)

        def fake_open(req, timeout=None):
            return FakeResp({"results": [{"title": "Koyeb hit", "url": "https://x.md/1", "snippet": "kutoka cache"}]})

        urlreq.Request, urlreq.urlopen = fake_request, fake_open
        try:
            out = asyncio.run(br.xmd_web_search({"query": "xmd", "max_results": 3},
                                                "https://koyeb/api/boardroom/cu-search", "tok", "https://s.example"))
        finally:
            urlreq.Request, urlreq.urlopen = real_request, urlreq.urlopen
        body = json.loads(out["content"][0]["text"])
        self.assertEqual(body["results"][0]["title"], "Koyeb hit")
        self.assertEqual(len(calls), 1)

    def test_fallback_direct_searxng(self):
        import asyncio
        import bridge as br
        import urllib.request as urlreq

        class FakeResp:
            def __init__(self, payload): self.payload = payload
            def read(self): return json.dumps(self.payload).encode()
            def __enter__(self): return self
            def __exit__(self, *a): return False

        real_open = urlreq.urlopen

        def fake_open(req, timeout=None):
            url = getattr(req, "full_url", str(req))
            if "cu-search" in url:
                raise OSError("koyeb imekufa")
            return FakeResp({"results": [{"title": "Direct", "url": "https://d.example", "content": "moja kwa moja"},
                                         {"title": "no-url", "url": ""}]})

        urlreq.urlopen = fake_open
        try:
            out = asyncio.run(br.xmd_web_search({"query": "xmd"}, "https://koyeb/api/boardroom/cu-search", "tok",
                                                "https://searxng.example"))
        finally:
            urlreq.urlopen = real_open
        body = json.loads(out["content"][0]["text"])
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["title"], "Direct")
        self.assertIn("snippet", body["results"][0])

    def test_zote_zimekufa_error_wazi(self):
        import asyncio
        import bridge as br
        import urllib.request as urlreq
        real_open = urlreq.urlopen
        urlreq.urlopen = lambda req, timeout=None: (_ for _ in ()).throw(OSError("network"))
        try:
            out = asyncio.run(br.xmd_web_search({"query": "xmd"}, "https://koyeb/x", "tok", "https://s.example"))
        finally:
            urlreq.urlopen = real_open
        body = json.loads(out["content"][0]["text"])
        self.assertEqual(body["results"], [])
        self.assertIn("imekufa", body["error"])

    def test_query_tupu(self):
        import asyncio
        import bridge as br
        out = asyncio.run(br.xmd_web_search({"query": "  "}, "", "", ""))
        body = json.loads(out["content"][0]["text"])
        self.assertEqual(body["results"], [])


class TestEmptyStops(unittest.TestCase):
    """R32.2: kosa la session 6ac4a63b — jibu la mwisho lilikuwa <thought> pekee (bila tool wala
    text) kutoka lane ya dharura; run iliisha "done" baada ya tool 1. Sasa: SI mwisho halali."""

    def test_thought_pekee_inarudishwa_kama_block(self):
        st = HookState()
        thought = ("<thought>**Initiating Next.js Project**\n\nI've determined the workspace is "
                   "empty except for CLAUDE.md, so Next.js is the next logical step.\n</thought>")
        out = st.note_answer(thought)
        self.assertIn("block_reason", out)
        self.assertIn("thought pekee", out["block_reason"])
        self.assertEqual(st.empty_stops, 1)

    def test_empty_stops_x7_brake(self):
        st = HookState()
        outs = [st.note_answer(f"<thought>tafakari ndefu sana nambari {i} kuhusu project hii</thought>")
                for i in range(7)]
        self.assertEqual(["block_reason" in o for o in outs[:6]], [True] * 6)
        self.assertEqual(outs[6].get("brake"), True)
        self.assertTrue(st.brake_fired)

    def test_tool_progress_inareset_empty_stops(self):
        st = HookState()
        for _ in range(5):
            st.note_answer("<thought>tafakari ndefu sana kuhusu project hii ya login system</thought>")
        st.note_tool_progress()
        out = st.note_answer("<thought>tafakari nyingine tena ndefu sana kuhusu hatua inayofuata</thought>")
        self.assertIn("block_reason", out)
        self.assertEqual(st.empty_stops, 1, "counter imerudi 1 baada ya tool — si brake")

    def test_thought_na_text_halisi_ni_mwisho_wa_kawaida(self):
        st = HookState()
        ans = ("<thought>napanga muhtasari</thought>\n\nRIPOTI: Kazi yote imekamilika; live link "
               "https://x.vercel.app na GitHub repo zipo tayari.")
        out = st.note_answer(ans)
        self.assertEqual(out, {}, "text halisi ipo nje ya thought — mwisho halali")

    def test_text_tupu_au_fupi_ni_empty_stop(self):
        st = HookState()
        self.assertIn("block_reason", st.note_answer("   \nSawa.  "))
        self.assertIn("block_reason", st.note_answer(""))

    def test_jibu_halisi_baada_ya_empty_stop_inaisha_vizuri(self):
        st = HookState()
        st.note_answer("<thought>tafakari kwanza kabisa kuhusu jinsi ya kuanza project hii</thought>")
        out = st.note_answer("RIPOTI YA MRADI: Hongera — kazi imekamilika, live link na GitHub repo zipo.")
        self.assertEqual(out, {})
        self.assertEqual(st.empty_stops, 0)
