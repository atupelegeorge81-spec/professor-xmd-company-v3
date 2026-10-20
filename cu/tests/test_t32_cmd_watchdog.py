"""TASK-32: watchdog ya amri za terminal (amri iliyokwama 685s ilikaribia kuua build kwa liveness)."""
import os
import signal
import subprocess
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import oh_util as U  # noqa: E402


class OverdueForeground(unittest.TestCase):
    def test_foreground_job_over_cap_only(self):
        seen = {}
        procs = [(10, 10, 55, "/usr/bin/bash -i"), (20, 20, 20, "/usr/bin/bash -i"), (30, 30, 77, "node server.js")]
        self.assertEqual(U.overdue_foreground(procs, 100.0, seen, 480), [])  # mara ya kwanza: inaanza kuhesabu
        self.assertEqual(U.overdue_foreground(procs, 579.0, seen, 480), [])
        self.assertEqual(U.overdue_foreground(procs, 580.0, seen, 480), [55])  # shell 20 haina job; 30 si shell
        self.assertEqual(list(seen), [(10, 55)])

    def test_nested_shell_foreground_is_never_a_target(self):
        # hali halisi ya run 5: shell 2456 (ndani ya 1644) ina tpgid=1644 → kikundi cha shell kuu; kisiuawe
        seen = {}
        procs = [(1644, 1644, 1644, "/usr/bin/bash -i"), (2456, 2456, 1644, "/usr/bin/bash -i")]
        self.assertEqual(U.overdue_foreground(procs, 0.0, seen, 1), [])
        self.assertEqual(U.overdue_foreground(procs, 100.0, seen, 1), [])

    def test_new_job_resets_clock_and_finished_jobs_are_forgotten(self):
        seen = {}
        U.overdue_foreground([(10, 10, 55, "bash --norc -i")], 0.0, seen, 480)
        self.assertEqual(U.overdue_foreground([(10, 10, 10, "bash -i")], 300.0, seen, 480), [])  # job imeisha
        self.assertEqual(seen, {})
        self.assertEqual(U.overdue_foreground([(10, 10, 66, "bash -i")], 600.0, seen, 480), [])  # job mpya
        self.assertEqual(U.overdue_foreground([(10, 10, 66, "bash -i")], 1080.0, seen, 480), [66])


@unittest.skipUnless(sys.platform.startswith("linux") and os.path.exists("/proc/self/stat"), "linux /proc")
class LiveWatchdog(unittest.TestCase):
    def test_kills_real_foreground_job_of_interactive_shell(self):
        # shell halisi ya `bash -i` yenye pty; foreground job: sleep 60 → watchdog (cap 2s) inaikata
        import pty
        pid, fd = pty.fork()
        if pid == 0:
            os.execvp("bash", ["bash", "--norc", "-i"])
        try:
            time.sleep(0.5)
            os.write(fd, b"sleep 60\n")
            t_start = time.time()
            msgs = []
            U.start_cmd_watchdog(msgs.append, cap=2, every=1, pending_since=lambda: t_start)
            import select
            buf, t0 = b"", time.time()
            while time.time() - t0 < 20 and not (b"sleep 60" in buf and buf.split(b"sleep 60", 1)[1].rstrip().endswith(b"$")):
                if select.select([fd], [], [], 0.5)[0]:
                    try:
                        buf += os.read(fd, 4096)
                    except OSError:
                        break
            self.assertTrue(buf.split(b"sleep 60", 1)[1].rstrip().endswith(b"$"), buf)  # prompt imerudi — shell hai
            self.assertTrue(msgs and "watchdog" in msgs[0])
            self.assertLess(time.time() - t0, 20)
        finally:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)


    def test_foreground_server_not_awaited_is_left_alone(self):
        # server iliyoachwa foreground (agent hasubiri — pending_since None) → watchdog haiigusi
        import pty
        import select
        pid, fd = pty.fork()
        if pid == 0:
            os.execvp("bash", ["bash", "--norc", "-i"])
        try:
            time.sleep(0.5)
            os.write(fd, b"sleep 60\n")
            msgs = []
            U.start_cmd_watchdog(msgs.append, cap=1, every=1, pending_since=lambda: None)
            time.sleep(4)
            while select.select([fd], [], [], 0.2)[0]:
                os.read(fd, 4096)
            self.assertEqual(msgs, [])
            fg = [p for p in U._read_procs() if p[0] == pid]
            self.assertTrue(fg and fg[0][2] != fg[0][1])  # sleep bado ni foreground job
        finally:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)


if __name__ == "__main__":
    unittest.main()
