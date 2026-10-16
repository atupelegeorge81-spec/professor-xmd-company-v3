"""cu/tests/test_t3b_q002.py — Q-002: maagizo ya evidence ya agent = kile harness inakubali; judge = harness."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import features_verify  # noqa: E402
from oh_util import build_objective  # noqa: E402

PLAN = "### Step 1 — hello\nx\n- **Verification:** `wc -c < hello.txt` → 5\n"


def _fl(evidence):
    return {"schema_version": 1, "run_id": "r", "plan_id": "p", "generated_at": "t", "features": [{
        "id": "step-01", "title": "hello", "required": True, "qa": False, "state": "pending", "attempts": 0,
        "checks": [{"id": "v1", "kind": "assertion", "required": True, "expect": "`wc -c < hello.txt` → 5",
                    "state": "not_run", "exit_code": None, "artifact": None}],
        "evidence": evidence, "last_failure": None}]}


class TestQ002(unittest.TestCase):
    def _run(self, evidence, make_file=True):
        with tempfile.TemporaryDirectory() as ws:
            if make_file:
                Path(ws, "hello.txt").write_text("hello")
            Path(ws, "feature_list.json").write_text(json.dumps(_fl(evidence)))
            return features_verify.verify_all(ws)

    def test_muundo_wa_maagizo_unakubaliwa_na_harness(self):
        # object ileile iliyo kwenye feature_line ya oh_bridge
        v = self._run([{"kind": "file", "ref": "hello.txt", "artifact": "hello.txt", "note": "wc -c = 5"}])
        self.assertTrue(v["ok"], v)

    def test_bila_evidence_bado_inafeli(self):  # default-FAIL haijaguswa
        self.assertFalse(self._run([])["ok"])

    def test_artifact_isiyokuwepo_inafeli(self):
        self.assertFalse(self._run([{"kind": "file", "ref": "hello.txt", "artifact": "hello.txt"}], make_file=False)["ok"])

    def test_maagizo_ya_bridge_yana_muundo_huo(self):
        src = Path(__file__).resolve().parents[1].joinpath("oh_bridge.py").read_text()
        self.assertIn('\\"kind\\": \\"file\\", \\"ref\\": \\"hello.txt\\", \\"artifact\\": \\"hello.txt\\"', src)

    def test_judge_objective_inataka_evidence_ya_feature_list(self):
        self.assertIn("feature_list.json", build_objective("t", PLAN, features=True))
        self.assertNotIn("feature_list.json", build_objective("t", PLAN))


class TestJudgeMadaiYaMaandishi(unittest.TestCase):
    def test_objective_inasema_ushahidi_ni_tool_observation_tu(self):
        # live ebb85d13 i=66: laguna aliandika ```bash``` + "Matokeo: `5`" bila kuendesha amri;
        # judge (ultra) akakubali → harness 0/5 → STUCK. Transcript ya judge = "assistant:"/"tool:".
        o = build_objective("t", "## Step 1: a\nVerification: `wc -c < hello.txt`\n", features=True)
        self.assertIn("`tool:`", o)
        self.assertIn("`assistant:`", o)
        self.assertIn("INCOMPLETE", o)
        # ebb85d13 A/B: ultra alikataa kazi ya CLI tu kwa "screenshots" — d) ni ya masharti
        self.assertIn("HAIHITAJI screenshots", o)

    def test_sheria_ya_agent_inakataza_matokeo_ya_kubuni(self):
        law = (Path(__file__).resolve().parents[1] / "xmd-law.md").read_text(encoding="utf-8")
        self.assertIn("KILA amri iendeshwe kwa TOOL", law)


class TestActionCommand(unittest.TestCase):
    def test_file_editor_inaonyesha_path(self):
        from types import SimpleNamespace as NS
        from oh_util import action_command
        self.assertEqual(action_command(NS(command="create", path="/home/user/ws/hello.txt")),
                         "create /home/user/ws/hello.txt")
        self.assertEqual(action_command(NS(command="ls -la", is_background=False)), "ls -la")

    def test_oh_tool_kind(self):
        from types import SimpleNamespace as NS
        from oh_util import oh_tool_kind
        self.assertEqual(oh_tool_kind("file_editor", NS(command="create")), ("write", "write_file"))
        self.assertEqual(oh_tool_kind("file_editor", NS(command="view")), ("read", "read_file"))
        self.assertEqual(oh_tool_kind("file_editor", NS(command="str_replace")), ("edit", "edit_file"))
        self.assertEqual(oh_tool_kind("task_tracker", NS()), ("skill", "skill"))
        self.assertIsNone(oh_tool_kind("terminal", NS(command="ls")))

    def test_obs_failed_exit_code_halisi(self):
        from types import SimpleNamespace as NS
        from oh_util import obs_failed
        self.assertTrue(obs_failed(NS(exit_code=127, is_error=False), "bash: xxd: command not found"))
        self.assertFalse(obs_failed(NS(exit_code=0, is_error=False), "error: hii ni log tu, exit 0"))
        self.assertTrue(obs_failed(NS(exit_code=None, metadata=NS(exit_code=2), is_error=False), "x"))
        self.assertTrue(obs_failed(NS(is_error=True), "ok"))
        self.assertTrue(obs_failed(NS(exit_code=-1, is_error=False), "Traceback (most recent call last)"))
        self.assertFalse(obs_failed(None, "imeandikwa"))

    def test_fallback_ya_ripoti_inalingana_na_engine(self):
        root = Path(__file__).resolve().parents[2]
        bridge = root.joinpath("cu", "oh_bridge.py").read_text()
        engine = root.joinpath("src", "lib", "cu", "engine.ts").read_text()
        self.assertIn('report = last_assistant_text or "(hakuna ripoti)"', bridge)
        self.assertIn('rtext.trim() === "(hakuna ripoti)"', engine)

    def test_classify_tool_vercel_ni_amri_si_neno(self):
        import bridge as B
        self.assertEqual(B.classify_tool("terminal", "printf 'Hakuna deploy ya Vercel' > .xmd/evidence/qa.txt")[1], "bash")
        self.assertEqual(B.classify_tool("terminal", "cd app && npx vercel --prod --yes")[1], "vercel")
        self.assertEqual(B.classify_tool("terminal", "vercel deploy")[1], "vercel")
        self.assertEqual(B.classify_tool("terminal", "git add . && git push origin main")[1], "github")
        self.assertEqual(B.classify_tool("terminal", "gh repo create x --public")[1], "github")
        self.assertNotEqual(B.classify_tool("terminal", "echo 'no git push needed'")[1], "github")
