"""R33: Screenshot moja kwa kila page/view ("picha ipo tayari") + mabaki (agizo la CEO 06-10 usiku).

• note_pre_tool/note_post_tool: screenshot YA PILI ya page/view ileile (hakuna kilichobadilika)
  → {"deny": "PICHA IPO TAYARI …"}; navigate/click/resize zinafungua picha mpya
• Bash ya test-runner (hata ikifeli baadaye) → tests_run=True; Write ya test file → tests_written
• note_answer: ripoti ya mwisho SI code-dump (<tool_code> / majority-code bila alama za ripoti)
  → block (max 2); tests ziliyoandikwa bila kuendeshwa → block (max 2)
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bridge import HookState, TEST_FILE_RX, TEST_RUN_RX


def shot_ok(st: HookState) -> bool:
    """PreToolUse ya screenshot inaruhusu? (hakuna 'deny')"""
    return not st.note_pre_tool("mcp__pw__browser_take_screenshot", {})


class TestScreenshotDedup(unittest.TestCase):
    """R33: kila page/view moja — picha ya pili ileile inakataliwa."""

    def setUp(self):
        self.st = HookState()
        # anza kwenye page maalum (navigate imefanikiwa)
        self.st.note_pre_tool("mcp__pw__browser_navigate", {"url": "http://127.0.0.1:8080/#login"})
        self.st.note_post_tool("mcp__pw__browser_navigate", {"url": "http://127.0.0.1:8080/#login"})

    def test_shot_ya_kwanza_inaruhusiwa(self):
        self.assertTrue(shot_ok(self.st))
        self.st.note_post_tool("mcp__pw__browser_take_screenshot", {})
        self.assertFalse(self.st.page_dirty)

    def test_shot_ya_pili_ileile_inakataliwa(self):
        shot_ok(self.st)
        self.st.note_post_tool("mcp__pw__browser_take_screenshot", {})
        v = self.st.note_pre_tool("mcp__pw__browser_take_screenshot", {})
        self.assertIn("deny", v)
        self.assertIn("PICHA IPO TAYARI", v["deny"])
        self.assertEqual(self.st.shot_denies, 1)

    def test_baada_ya_navigate_inaruhusiwa_tena(self):
        shot_ok(self.st)
        self.st.note_post_tool("mcp__pw__browser_take_screenshot", {})
        self.st.note_pre_tool("mcp__pw__browser_navigate", {"url": "http://127.0.0.1:8080/#signup"})
        self.st.note_post_tool("mcp__pw__browser_navigate", {"url": "http://127.0.0.1:8080/#signup"})
        self.assertTrue(shot_ok(self.st), "page mpya — picha mpya inaruhusiwa")

    def test_baada_ya_resize_view_nyingine_inaruhusiwa(self):
        shot_ok(self.st)
        self.st.note_post_tool("mcp__pw__browser_take_screenshot", {})
        self.st.note_pre_tool("mcp__pw__browser_resize", {"width": 375, "height": 667})
        self.st.note_post_tool("mcp__pw__browser_resize", {"width": 375, "height": 667})
        self.assertTrue(shot_ok(self.st), "view mpya (mobile) — picha mpya inaruhusiwa")
        # …lakini mobile MOJA tu: ya pili ya mobile ileile inakataliwa
        self.st.note_post_tool("mcp__pw__browser_take_screenshot", {})
        self.assertIn("deny", self.st.note_pre_tool("mcp__pw__browser_take_screenshot", {}))

    def test_baada_ya_click_interaction_inaruhusiwa(self):
        shot_ok(self.st)
        self.st.note_post_tool("mcp__pw__browser_take_screenshot", {})
        self.st.note_pre_tool("mcp__pw__browser_click", {"element": "tab-2", "ref": "e3"})
        self.assertTrue(shot_ok(self.st), "click = mabadiliko ya page — picha mpya inaruhusiwa")

    def test_deny_haitaji_tool_nyingine_kati(self):
        """Katalio mbili mfululizo hazipaswi ku-crash; counter inaongezeka."""
        shot_ok(self.st)
        self.st.note_post_tool("mcp__pw__browser_take_screenshot", {})
        self.assertIn("deny", self.st.note_pre_tool("mcp__pw__browser_take_screenshot", {}))
        self.assertIn("deny", self.st.note_pre_tool("mcp__pw__browser_take_screenshot", {}))
        self.assertEqual(self.st.shot_denies, 2)


class TestTestsRunTracking(unittest.TestCase):
    """R33: test files ziliyoandikwa lazima ziendeshwe kabla ya kuisha."""

    def test_write_ya_test_file_inaweka_tests_written(self):
        st = HookState()
        st.note_post_tool("Write", {"file_path": "/home/user/ws/tests/auth.spec.ts"})
        self.assertTrue(st.tests_written)
        st2 = HookState()
        st2.note_post_tool("Write", {"file_path": "/home/user/ws/src/LoginForm.tsx"})
        self.assertFalse(st2.tests_written)

    def test_bash_ya_test_runner_inaweka_tests_run(self):
        st = HookState()
        st.note_pre_tool("Bash", {"command": "npx playwright test"})
        self.assertTrue(st.tests_run)
        st2 = HookState()
        st2.note_pre_tool("Bash", {"command": "npm test -- --run"})
        self.assertTrue(st2.tests_run)
        st3 = HookState()
        st3.note_pre_tool("Bash", {"command": "npm install"})
        self.assertFalse(st3.tests_run)

    def test_ripoti_halali_bila_tests_kumaliza_inablockiwa(self):
        st = HookState()
        st.note_post_tool("Write", {"file_path": "/home/user/ws/tests/auth.spec.ts"})
        rep = ("RIPOTI YA MRADI: Kazi imekamilika. 🌐 Live: https://x.vercel.app · 🐙 GitHub: "
               "https://github.com/org/repo · 📱 Majaribio yamefanyika · 📁 Files zipo.")
        v = st.note_answer(rep)
        self.assertIn("block_reason", v)
        self.assertIn("HAZIJAEENDESHWA", v["block_reason"])

    def test_baada_ya_kuendesha_tests_inaisha_vizuri(self):
        st = HookState()
        st.note_post_tool("Write", {"file_path": "/home/user/ws/tests/auth.spec.ts"})
        st.note_pre_tool("Bash", {"command": "npx playwright test"})
        rep = ("RIPOTI YA MRADI: Kazi imekamilika. 🌐 Live: https://x.vercel.app · 📙 GitHub: "
               "https://github.com/org/repo · 📱 Majaribio: 12/12 zimepita · 📁 Files zipo.")
        self.assertEqual(st.note_answer(rep), {})

    def test_blocki_ya_tests_max_2_kisha_inaishishwa(self):
        st = HookState()
        st.note_post_tool("Write", {"file_path": "/home/user/ws/tests/auth.spec.ts"})
        rep = ("RIPOTI YA MRADI: Kazi imekamilika. 🌐 Live: https://x.vercel.app · 🐙 GitHub: "
               "https://github.com/org/repo · 📱 Majaribio yamefanyika · 📁 Files zipo. [~] "
               "tests hazikuwezekana kuendeshwa kwa sababu ya dependencies.")
        self.assertIn("block_reason", st.note_answer(rep))
        self.assertIn("block_reason", st.note_answer(rep))
        self.assertEqual(st.note_answer(rep), {}, "block ya 3 — model imeshapata nafasi 2, inaishishwa")


class TestReportLanguage(unittest.TestCase):
    """R33: ripoti ya mwisho = muhtasari wa Kiswahili — si code dump (kosa la 6ac4b789)."""

    def test_tool_code_dump_inablockiwa(self):
        st = HookState()
        dump = ('<tool_code>\nprint(default_api.Write(content = "import { test, expect } from '
                '@playwright/test\', file_path = "/home/user/ws/tests/auth.spec.ts"))\n')
        v = st.note_answer(dump)
        self.assertIn("block_reason", v)
        self.assertIn("SI ripoti", v["block_reason"])

    def test_code_ya_file_bila_alama_za_ripoti_inablockiwa(self):
        st = HookState()
        lines = ["import { test, expect } from '@playwright/test';"] + \
                [f"test('test {i}', async ({{ page }}) => {{}}" + " await page.goto('http://x');" + "});" for i in range(12)]
        v = st.note_answer("\n".join(lines))
        self.assertIn("block_reason", v)

    def test_ripoti_halisi_ya_kiswahili_inaisha_vizuri(self):
        st = HookState()
        rep = ("RIPOTI YA MRADI: Hongera — kazi imekamilika kikamilifu.\n\n"
               "🌐 **Live Website Link**: https://modern-auth.vercel.app\n"
               "🐙 **GitHub Repository**: https://github.com/professor-xmd-company/modern-auth\n"
               "📱 **Muhtasari wa Majaribio**: desktop na mobile zimehakikiwa kwa picha.\n"
               "📁 **Muundo wa Faili**: LoginForm, SignupForm, tokens.css.\n"
               "✅ **Ukaguzi wa Hatua**: hatua zote 5 zimekamilika.")
        self.assertEqual(st.note_answer(rep), {})

    def test_ripoti_yenye_code_ndani_yake_si_dump(self):
        """Ripoti halisi yenye snippet fupi ya code bado ni ripoti (alama zipo)."""
        st = HookState()
        rep = ("RIPOTI YA MRADI: imekamilika. 🌐 Live: https://x.vercel.app\n"
               "```ts\nimport { test } from '@playwright/test';\nconst x = 1;\nconst y = 2;\n```\n"
               "📱 Majaribio: 12/12 · 📁 Files zipo · ✅ Hatua zote.")
        self.assertEqual(st.note_answer(rep), {})

    def test_blocki_ya_dump_max_2(self):
        st = HookState()
        dump = '<tool_code>\nprint(default_api.Write(content = "xyz"))\n' + "code line here\n" * 15
        self.assertIn("block_reason", st.note_answer(dump))
        self.assertIn("block_reason", st.note_answer(dump))
        self.assertEqual(st.note_answer(dump), {}, "ya 3 — inaishishwa (si loop ya milele)")


class TestRegexSanity(unittest.TestCase):
    def test_test_file_rx(self):
        for p in ("/home/user/ws/tests/auth.spec.ts", "src/app.test.tsx", "ws/__tests__/x.test.js",
                  "backend/test_users.py", "api/user_test.go"):
            self.assertTrue(TEST_FILE_RX.search(p), p)
        for p in ("/home/user/ws/src/LoginForm.tsx", "tests.txt", "package.json", "spec.md"):
            self.assertFalse(TEST_FILE_RX.search(p), p)

    def test_test_run_rx(self):
        for c in ("npx playwright test", "npx --yes playwright test tests/",
                  "npm test", "npm run test", "yarn test", "npx vitest run",
                  "pytest -q", "go test ./...", "node --test"):
            self.assertTrue(TEST_RUN_RX.search(c), c)
        for c in ("npm install", "npm run build", "node server.js", "playwright install"):
            self.assertFalse(TEST_RUN_RX.search(c), c)


if __name__ == "__main__":
    unittest.main()
