# test_r44_quota.py — R44-E: _earliest_reset inajua wakes za DAKIKA (TPM/RPM),
# si siku pekee (kosa la KilimoSmart: fatal ya uongo badala ya kupumzika 61s).
import time
import unittest
from types import SimpleNamespace


class TestEarliestReset(unittest.TestCase):
    def _dummy(self, order, clock):
        from cu.brain import Brain
        class Dummy(Brain):
            def __init__(self):
                pass
        d = Dummy()
        d.order = order
        d._clock = clock
        return d

    def test_minute_wake_inarejea(self):
        """Lanes zote zimejaa DAKIKA (retry_at/busy) → resumeAt ya sekunde ~61, si siku."""
        now = time.time() * 1000
        d = self._dummy([
            SimpleNamespace(exhausted_until=0, retry_at=now + 61_000, busy_until=0),
            SimpleNamespace(exhausted_until=now + 3 * 3600_000, retry_at=0, busy_until=0),
        ], lambda: now)
        got = d._earliest_reset()
        self.assertTrue(abs(got - (now + 61_000)) < 2000, f"expected minute wake ~61s, got delta {got - now}ms")

    def test_busy_until_pia_inasomwa(self):
        now = time.time() * 1000
        d = self._dummy([
            SimpleNamespace(exhausted_until=0, retry_at=0, busy_until=now + 30_000),
        ], lambda: now)
        got = d._earliest_reset()
        self.assertTrue(abs(got - (now + 30_000)) < 2000)

    def test_siku_pekee_inarejea(self):
        now = time.time() * 1000
        d = self._dummy([
            SimpleNamespace(exhausted_until=now + 3600_000, retry_at=0, busy_until=0),
        ], lambda: now)
        self.assertEqual(d._earliest_reset(), int(now + 3600_000))

    def test_zote_zimekufa_hakuna_wake(self):
        now = time.time() * 1000
        d = self._dummy([
            SimpleNamespace(exhausted_until=0, retry_at=0, busy_until=0),
        ], lambda: now)
        self.assertEqual(d._earliest_reset(), 0)


if __name__ == "__main__":
    unittest.main()
