"""cu/tests/test_t18_gate.py — TASK 18: completion gate (cu/gate.py) + tests_run semantics (bridge.HookState).

Masharti a–d kwa runner iliyodungwa (haraka) NA repo halisi ya git kwenye tmp (amri halisi za gate.run_cmd).
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

GOOD_REPORT = """# M1 Build Report
## 1 Summary
Built the title.
## 2 Files created or changed
- `README.md` — created — title
## 3 Commands run and results
- `head -1 README.md` — exit 0 — prints the title
## 4 Tests run
- title — PASS
## 5 Decisions and deviations from the plan
- none — plan followed
## 6 Security notes
- None — no secrets
## 7 Known problems / technical debt
- None
## 8 Risks for the next milestone
- append only
"""


def sh(cmd, cwd):
    return subprocess.run(["bash", "-lc", cmd], cwd=cwd, capture_output=True, text=True, check=True).stdout


class RealRepo(unittest.TestCase):
    """Repo halisi: git init + commit; startpack.json; ripoti — kila sharti linajaribiwa kwa amri halisi."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ws = self.tmp.name
        sh("git init -q && git config user.email t@t && git config user.name t && mkdir -p .xmd/reports .git/info "
           "&& printf '.xmd/startpack.json\\n' > .git/info/exclude && echo base > base.txt && git add -A && git commit -qm base", self.ws)
        self.base = sh("git rev-parse HEAD", self.ws).strip()
        self.cfg = {"milestoneId": "M1", "buildCommand": "test -s README.md", "testCommand": "", "requiresTests": False, "baseCommit": self.base}
        Path(self.ws, G.STARTPACK_JSON).write_text(json.dumps(self.cfg))

    def tearDown(self):
        self.tmp.cleanup()

    def finish_work(self, report=GOOD_REPORT):
        Path(self.ws, "README.md").write_text("# t\n")
        Path(self.ws, G.report_path("M1")).write_text(report)
        sh("git add -A && git commit -qm work", self.ws)

    def test_all_conditions_pass(self):
        self.finish_work()
        r = G.evaluate(self.ws, G.load_config(self.ws))
        self.assertEqual(r["failed"], [])
        self.assertTrue(r["passed"])
        self.assertEqual(r["checks"]["git"], {"dirty": [], "commitsSinceStart": 1})
        self.assertEqual(r["checks"]["build"], {"command": "test -s README.md", "exit": 0})

    def test_a_missing_report_blocks(self):
        Path(self.ws, "README.md").write_text("# t\n")
        sh("git add -A && git commit -qm work", self.ws)
        r = G.evaluate(self.ws, self.cfg)
        self.assertFalse(r["passed"])
        self.assertEqual(r["failed"], ["build report: file .xmd/reports/M1-build-report.md does not exist — write it with the 8 required headings"])

    def test_a_broken_report_lists_errors(self):
        self.finish_work(GOOD_REPORT.replace("## 6 Security notes\n- None — no secrets\n", ""))
        r = G.evaluate(self.ws, self.cfg)
        self.assertEqual(len(r["failed"]), 1)
        self.assertIn('missing heading "## 6 Security notes"', r["failed"][0])

    def test_b_dirty_tree_blocks(self):
        self.finish_work()
        Path(self.ws, "scratch.txt").write_text("x")
        r = G.evaluate(self.ws, self.cfg)
        self.assertEqual(r["failed"], ["git: uncommitted changes (1): scratch.txt — commit your work (git add -A && git commit -m ...)"])

    def test_b_no_commit_since_start_blocks(self):
        Path(self.ws, "README.md").write_text("# t\n")
        Path(self.ws, G.report_path("M1")).write_text(GOOD_REPORT)
        sh("git add -A", self.ws)  # staged, si committed → dirty NA hakuna commit
        r = G.evaluate(self.ws, self.cfg)
        self.assertIn("git: no commit since this milestone started — commit the milestone work", r["failed"])
        self.assertTrue(any(f.startswith("git: uncommitted changes") for f in r["failed"]))

    def test_c_failing_build_blocks_then_fix_passes(self):
        self.cfg["buildCommand"] = "node --check app.js 2>&1 || python3 -c 'import ast,sys; ast.parse(open(\"app.py\").read())'"
        self.cfg["buildCommand"] = "python3 -c 'import ast; ast.parse(open(\"app.py\").read())'"
        Path(self.ws, "app.py").write_text("def f(:\n")
        self.finish_work()
        r = G.evaluate(self.ws, self.cfg)
        self.assertEqual(len(r["failed"]), 1)
        self.assertTrue(r["failed"][0].startswith("build: `python3 -c"))
        self.assertIn("exited 1", r["failed"][0])
        Path(self.ws, "app.py").write_text("def f():\n    return 1\n")
        sh("git add -A && git commit -qm fix", self.ws)
        self.assertTrue(G.evaluate(self.ws, self.cfg)["passed"])

    def test_d_required_tests_run_by_hook(self):
        self.finish_work()
        self.cfg.update(requiresTests=True, testCommand="exit 2")
        r = G.evaluate(self.ws, self.cfg)
        self.assertEqual(r["checks"]["tests"], {"command": "exit 2", "exit": 2})
        self.assertTrue(r["failed"][0].startswith("tests: `exit 2` exited 2"))
        self.cfg.update(testCommand="true")
        self.assertTrue(G.evaluate(self.ws, self.cfg)["passed"])
        self.cfg.update(testCommand="")
        self.assertEqual(G.evaluate(self.ws, self.cfg)["failed"], ["tests: the plan requires tests but has no Test Command"])

    def test_no_build_command_is_not_applicable(self):
        self.finish_work()
        self.cfg["buildCommand"] = ""
        r = G.evaluate(self.ws, self.cfg)
        self.assertTrue(r["passed"])
        self.assertEqual(r["checks"]["build"], "n/a")

    def test_loop_guard_three_stalled_blocks_then_partial(self):
        self.finish_work()
        self.cfg["buildCommand"] = "exit 3"  # haiwezekani
        g = G.GateGuard(self.ws, self.cfg)
        seq = [g.check()[0] for _ in range(4)]
        self.assertEqual(seq, ["block", "block", "block", "partial"])
        self.assertEqual(g.blocks, 3)
        s = g.summary()
        self.assertEqual((s["passed"], s["partial"], s["blocks"]), (False, True, 3))
        self.assertEqual(G.partial_line(g.result), "PARTIAL: gate failed: build: `exit 3` exited 3 — ")
        G.append_partial_to_report(self.ws, self.cfg, G.partial_line(g.result))
        self.assertTrue(Path(self.ws, G.report_path("M1")).read_text().rstrip().endswith("PARTIAL: gate failed: build: `exit 3` exited 3 —"))

    def test_loop_guard_progress_resets_stall(self):
        self.finish_work()
        self.cfg["buildCommand"] = "exit 3"
        g = G.GateGuard(self.ws, self.cfg)
        self.assertEqual([g.check()[0] for _ in range(3)], ["block"] * 3)
        sh("echo more >> README.md && git commit -qam progress", self.ws)  # commit mpya = maendeleo
        self.assertEqual(g.check()[0], "block")
        self.assertEqual(g.stalled, 1)

    def test_cosmetic_report_commits_are_not_progress(self):
        # real run T4: agent alihariri ripoti + kucommit kila block → kaunta haikuisha. Sasa si maendeleo.
        self.finish_work()
        self.cfg["buildCommand"] = "exit 3"
        g = G.GateGuard(self.ws, self.cfg)
        seq = []
        for n in range(4):
            seq.append(g.check()[0])
            with open(Path(self.ws, G.report_path("M1")), "a") as fh:
                fh.write(f"\nnote {n}\n")
            sh("git commit -qam report-only", self.ws)
        self.assertEqual(seq, ["block", "block", "block", "partial"])

    def test_report_change_counts_when_report_is_failing(self):
        self.finish_work()
        Path(self.ws, G.report_path("M1")).write_text("# broken\n")
        sh("git commit -qam broken-report", self.ws)
        g = G.GateGuard(self.ws, self.cfg)
        self.assertEqual([g.check()[0] for _ in range(3)], ["block"] * 3)
        Path(self.ws, G.report_path("M1")).write_text("# still broken\n")
        sh("git commit -qam edit", self.ws)
        self.assertEqual(g.check()[0], "block")
        self.assertEqual(g.stalled, 1)

    def test_changed_failure_set_counts_as_progress(self):
        self.finish_work()
        self.cfg["buildCommand"] = "exit 3"
        g = G.GateGuard(self.ws, self.cfg)
        self.assertEqual([g.check()[0] for _ in range(3)], ["block"] * 3)
        self.cfg["buildCommand"] = "true"
        Path(self.ws, "scratch.txt").write_text("x")  # failure tofauti (git) badala ya build
        self.assertEqual(g.check()[0], "block")
        self.assertEqual(g.stalled, 1)

    def test_block_message_warns_against_tampering(self):
        self.finish_work()
        self.cfg["buildCommand"] = "exit 3"
        msg = G.GateGuard(self.ws, self.cfg).check()[2]
        self.assertIn("Never tamper with the environment", msg)
        self.assertIn("ends PARTIAL", msg)

    def test_block_message_lists_exactly_what_failed(self):
        self.finish_work()
        Path(self.ws, "scratch.txt").write_text("x")
        self.cfg["buildCommand"] = "exit 4"
        v, res, msg = G.GateGuard(self.ws, self.cfg).check()
        self.assertEqual(v, "block")
        for f in res["failed"]:
            self.assertIn(f"- {f}", msg)
        self.assertEqual(len(res["failed"]), 2)


class Injected(unittest.TestCase):
    def test_git_status_error_reported(self):
        def run(cmd, cwd, t):
            return (128, "fatal: not a git repository") if "status" in cmd else (0, "0")
        with tempfile.TemporaryDirectory() as ws:
            r = G.evaluate(ws, {"milestoneId": "M9"}, run)
        self.assertTrue(any(f.startswith("git: `git status --porcelain` failed (exit 128)") for f in r["failed"]))

    def test_headings_match_bridge(self):
        self.assertEqual(G.HEADINGS, B.BUILD_REPORT_HEADINGS)


class TestsRunSemantics(unittest.TestCase):
    """T5: tests_run = True TU baada ya test command kumaliza na exit 0 (milestone); legacy kanuni ya zamani."""

    def hs(self, milestone=True):
        st = B.HookState()
        if milestone:
            st.gate_guard = object()
        return st

    def test_pre_tool_never_sets_tests_run(self):
        st = self.hs()
        st.note_pre_tool("Bash", {"command": "npm test"})
        self.assertFalse(st.tests_run)

    def test_failing_exit_code_does_not_set(self):
        st = self.hs()
        st.note_post_tool("Bash", {"command": "npm test"}, {"stdout": "all good?", "exit_code": 1})
        self.assertFalse(st.tests_run)

    def test_passing_exit_code_sets(self):
        st = self.hs()
        st.note_post_tool("Bash", {"command": "pytest -q"}, {"stdout": "3 passed", "exit_code": 0})
        self.assertTrue(st.tests_run)

    def test_failure_hook_clears(self):
        st = self.hs()
        st.note_post_tool("Bash", {"command": "pytest -q"}, {"stdout": "3 passed", "exit_code": 0})
        st.note_bash_fail("pytest -q", "1 failed")
        self.assertFalse(st.tests_run)

    def test_legacy_keeps_old_rule(self):
        # legacy: kanuni ya zamani `not VERIFY_FAILURE_RX.search(output)` haibadiliki (exit code haisomwi)
        for resp in ({"stdout": "ok", "exit_code": 1}, {"stdout": "Tests: 3 passed"}, {"stdout": "1 failed"}):
            st = self.hs(milestone=False)
            st.note_post_tool("Bash", {"command": "npm test"}, resp)
            self.assertEqual(st.tests_run, not bool(B.VERIFY_FAILURE_RX.search(B.HookState._response_text(resp))))


if __name__ == "__main__":
    unittest.main()
