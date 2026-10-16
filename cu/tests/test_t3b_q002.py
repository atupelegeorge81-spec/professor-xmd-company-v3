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
