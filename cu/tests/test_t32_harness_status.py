"""cu/tests/test_t32_harness_status.py — TASK 32 (E2E halisi): features za harness zisizothibitishwa
hazigeuzi awamu ya milestone kuwa STUCK (→ BLOCKED bila review); legacy (flag OFF) haibadiliki."""
import sys
import unittest
from pathlib import Path

CU = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CU))

import oh_bridge as O  # noqa: E402


class HarnessStatus(unittest.TestCase):
    def test_legacy_done_becomes_stuck(self):
        self.assertEqual(O.harness_status("done", False, False), "stuck")

    def test_milestone_keeps_done(self):
        self.assertEqual(O.harness_status("done", False, True), "done")

    def test_features_ok_or_other_status_untouched(self):
        self.assertEqual(O.harness_status("done", True, False), "done")
        self.assertEqual(O.harness_status("partial", False, True), "partial")
        self.assertEqual(O.harness_status("error", False, False), "error")


if __name__ == "__main__":
    unittest.main()
