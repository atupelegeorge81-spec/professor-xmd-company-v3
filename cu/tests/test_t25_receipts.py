"""cu/tests/test_t25_receipts.py — TASK 25: lango la kumaliza (e) receipts + mkataba wa Receipts kwenye bridge prompt.

Repo halisi ya git kwenye tmp (amri halisi za gate.run_cmd): raundi ya marekebisho haina Build Report; receipts lazima ziwe halali
na kila CO iwe na receipt; zote BLOCKED/CANNOT → commit haihitajiki; bila receipts → block, na loop guard → PARTIAL.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CU = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CU))

import bridge as B  # noqa: E402
import gate as G  # noqa: E402


def sh(cmd, cwd):
    return subprocess.run(["bash", "-lc", cmd], cwd=cwd, capture_output=True, text=True, check=True).stdout


class FixRoundGate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ws = self.tmp.name
        sh("git init -q && git config user.email t@t && git config user.name t && mkdir -p .xmd/receipts src .git/info "
           "&& printf '.xmd/startpack.json\\n' > .git/info/exclude && printf 'h1{color:#111}\\n' > src/styles.css && git add -A && git commit -qm seed", self.ws)
        base = sh("git rev-parse HEAD", self.ws).strip()
        self.cfg = {"milestoneId": "M1", "title": "t", "buildCommand": "true", "testCommand": "", "requiresTests": False,
                    "baseCommit": base, "reportPath": "", "report": False, "round": 1,
                    "receipts": {"path": ".xmd/receipts/R1.json", "orderIds": ["CO-001", "CO-002"], "commitMessage": "M1 R1: CO-001, CO-002"}}
        with open(os.path.join(self.ws, ".xmd/startpack.json"), "w") as fh:
            json.dump(self.cfg, fh)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, data):
        with open(os.path.join(self.ws, ".xmd/receipts/R1.json"), "w") as fh:
            fh.write(data if isinstance(data, str) else json.dumps(data))

    def test_no_receipts_blocks_and_build_report_not_required(self):
        sh("printf 'h1{color:#F2F0EB}\\n' > src/styles.css && git add -A && git commit -qm 'M1 R1: CO-001'", self.ws)
        res = G.evaluate(self.ws, self.cfg)
        self.assertFalse(res["passed"])
        self.assertEqual(res["checks"]["report"], "n/a")
        self.assertTrue(any(f.startswith("receipts: file .xmd/receipts/R1.json does not exist") for f in res["failed"]), res["failed"])
        self.assertFalse(any(f.startswith("build report") for f in res["failed"]))

    def test_valid_receipts_for_every_order_pass(self):
        sh("printf 'h1{color:#F2F0EB}\\n' > src/styles.css", self.ws)
        self.write([{"orderId": "CO-001", "status": "DONE", "filesChanged": [{"path": "src/styles.css", "summary": "h1 color"}], "commandsRun": ["true"]},
                    {"orderId": "CO-002", "status": "BLOCKED", "filesChanged": [], "blockedReason": "contradicts A1"}])
        sh("git add -A && git commit -qm 'M1 R1: CO-001, CO-002'", self.ws)
        res = G.evaluate(self.ws, self.cfg)
        self.assertTrue(res["passed"], res["failed"])
        self.assertEqual(res["checks"]["receipts"]["count"], 2)

    def test_missing_order_and_invalid_receipt_are_named(self):
        self.write([{"orderId": "CO-001", "status": "DONE", "filesChanged": []}])
        sh("git add -A && git commit -qm x", self.ws)
        res = G.evaluate(self.ws, self.cfg)
        txt = " | ".join(res["failed"])
        self.assertIn("no receipt for CO-002", txt)
        self.assertIn("filesChanged: must be non-empty", txt)

    def test_not_json_and_not_array(self):
        self.write("{oops")
        self.assertTrue(any("not valid JSON" in f for f in G.evaluate(self.ws, self.cfg)["failed"]))
        self.write({"orderId": "CO-001"})
        self.assertTrue(any("must be a JSON array" in f for f in G.evaluate(self.ws, self.cfg)["failed"]))

    def test_all_blocked_needs_no_commit(self):
        self.write([{"orderId": o, "status": "BLOCKED", "filesChanged": [], "blockedReason": "contradicts A1"} for o in ("CO-001", "CO-002")])
        # hakuna commit tangu mwanzo (receipts zimetolewa kwenye git ili tree ibaki safi) → lango linapita kwa sababu zote ni BLOCKED
        with open(os.path.join(self.ws, ".git/info/exclude"), "a") as fh:
            fh.write(".xmd/receipts/\n")
        res = G.evaluate(self.ws, self.cfg)
        self.assertTrue(res["passed"], res["failed"])
        self.assertTrue(any("every order is BLOCKED/CANNOT" in n for n in res["notes"]))

    def test_loop_guard_partial_without_receipts(self):
        sh("printf 'h1{color:#F2F0EB}\\n' > src/styles.css && git add -A && git commit -qm 'M1 R1: CO-001'", self.ws)
        g = G.GateGuard(self.ws, self.cfg)
        verdicts = [g.check()[0] for _ in range(5)]
        self.assertEqual(verdicts[:3], ["block", "block", "block"])
        self.assertEqual(verdicts[3], "partial")
        self.assertTrue(G.partial_line(g.result).startswith("PARTIAL: gate failed: receipts: file .xmd/receipts/R1.json does not exist"))

    def test_bridge_prompt_has_receipts_contract_in_fix_round(self):
        txt = B.milestone_contract("M1", self.ws)
        self.assertIn("XMD RECEIPTS CONTRACT (milestone M1, fix round)", txt)
        self.assertIn(".xmd/receipts/R1.json", txt)
        self.assertIn('git commit -m "M1 R1: CO-001, CO-002"', txt)
        self.assertIn("NOT_ATTEMPTED", txt)
        self.assertNotIn("BUILD REPORT CONTRACT", txt)
        os.remove(os.path.join(self.ws, ".xmd/startpack.json"))
        self.assertIn("XMD BUILD REPORT CONTRACT (milestone M1)", B.milestone_contract("M1", self.ws))

    def test_validate_receipt_mirrors_ts_schema(self):
        self.assertEqual(G.validate_receipt({"orderId": "CO-1", "status": "DONE", "filesChanged": [{"path": "a", "summary": "b"}]}), [])
        self.assertEqual(G.validate_receipt({"orderId": "CO-1", "status": "CANNOT", "blockedReason": "x"}), [])
        self.assertTrue(G.validate_receipt({"orderId": "CO-1", "status": "WAT", "filesChanged": [{"path": "a", "summary": "b"}]}))
        self.assertTrue(G.validate_receipt({"orderId": "CO-1", "status": "DONE", "filesChanged": [{"path": "a"}]}))


if __name__ == "__main__":
    unittest.main()
