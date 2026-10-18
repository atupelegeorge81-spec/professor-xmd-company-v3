"""cu/tests/test_t17_build_report.py — TASK 17: mkataba wa Build Report (bridge.py + oh_bridge.py)."""
import re
import sys
import unittest
from pathlib import Path

CU = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CU))

import bridge as B  # noqa: E402


class BuildReportContract(unittest.TestCase):
    def test_headings_in_order_and_rules(self):
        c = B.build_report_contract("M3")
        self.assertIn("`.xmd/reports/M3-build-report.md`", c)
        pos = [c.index("## " + h + "\n") for h in B.BUILD_REPORT_HEADINGS]
        self.assertEqual(pos, sorted(pos))
        self.assertEqual(len(B.BUILD_REPORT_HEADINGS), 8)
        self.assertIn("You cannot finish without this report. Do not grade yourself; the harness measures.", c)

    def test_claude_md_block_replaced_other_text_kept(self):
        base = "# XMD Computer — Nidhamu ya Kazi\nsheria"
        m1 = B.with_build_report_contract(base, "M1")
        m2 = B.with_build_report_contract(m1, "M2")
        self.assertTrue(m2.startswith(base))
        self.assertEqual(m2.count(B.BUILD_REPORT_MARK_START), 1)
        self.assertIn("milestone M2", m2)
        self.assertNotIn("milestone M1", m2)
        self.assertEqual(B.with_build_report_contract(m2, ""), base)

    def test_bridges_accept_milestone_arg_and_oh_injects_contract(self):
        oh = (CU / "oh_bridge.py").read_text(encoding="utf-8")
        br = (CU / "bridge.py").read_text(encoding="utf-8")
        self.assertIn('ap.add_argument("--milestone", default="")', oh)
        self.assertIn('ap.add_argument("--milestone", default="")', br)
        self.assertRegex(oh, re.escape("B.build_report_contract(a.milestone)") + r"\) if getattr\(a, \"milestone\", \"\"\) else \"\"\)")


if __name__ == "__main__":
    unittest.main()
