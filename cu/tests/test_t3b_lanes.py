"""Task 3b — lanes: Gemini model zote, rpd kwa (akaunti × model), 'daily', roster ya CEO (2026-10-16)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lanes  # noqa: E402
from oh_util import classify_fail  # noqa: E402


class Clock:
    def __init__(self, t0=1_800_000_000.0):
        self.t = t0
    def __call__(self):
        return self.t


FLASH = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash",
         "gemini-3-flash-preview", "gemini-2.5-flash"]


def cfg():
    return {
        "gemini": {"keys": {"gemini-1": "K1", "gemini-2": "K2", "gemini-3": "K3", "gemini-4": "K4"},
                   "flashModels": FLASH, "flashRpm": 5, "flashRpd": 2,
                   "modelSkip": {a: ["gemini-2.5-flash"] for a in ("gemini-2", "gemini-3", "gemini-4")}},
        "emergency": [{"provider": "unorouter", "keys": {"uno-1": "U1", "uno-2": "U2"}},
                      {"provider": "openrouter", "keys": {"or-1": "O1"}}],
    }


class TestT3bLanes(unittest.TestCase):
    def test_gemini_model_zote_za_flash_zinatumika(self):
        # live: 3.8 "daily" ×4 wakati 3.6/3.5/3-preview hai — zamani CU ilitumia [0] pekee
        p = lanes.build_pools(cfg(), now=Clock())
        g = [(l.account, l.model) for l in p["main"].lanes if l.provider == "gemini"]
        flash = [(a, m) for a, m in g if m in FLASH]
        lite = [(a, m) for a, m in g if m not in FLASH]
        self.assertEqual(len(flash), 6 * 4 - 3)  # 2.5-flash ni 404 kwenye gemini-2..4
        self.assertEqual({m for _, m in flash}, set(FLASH))
        self.assertEqual({m for _, m in lite}, {
            "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
            "gemini-3.1-flash-lite-preview", "gemini-flash-lite-latest",
        })
        self.assertEqual(len(lite), 4 * 4)
        self.assertNotIn(("gemini-2", "gemini-2.5-flash"), flash)
        self.assertNotIn(("gemini-3", "gemini-2.5-flash"), flash)
        self.assertNotIn(("gemini-4", "gemini-2.5-flash"), flash)
        self.assertIn(("gemini-1", "gemini-2.5-flash"), flash)

    def test_rpd_ya_gemini_ni_kwa_model_si_akaunti_nzima(self):
        clk = Clock()
        pool = lanes.build_pools(cfg(), now=clk)["main"]
        a = next(l for l in pool.lanes if l.account == "gemini-1" and l.model == "gemini-3.8-flash")
        b = next(l for l in pool.lanes if l.account == "gemini-1" and l.model == "gemini-3.6-flash")
        for _ in range(2):  # rpd=2 → a imejaa leo
            pool.note_start(a, clk.t)
            clk.t += 61
        elig = pool.eligible_lanes(clk.t)
        self.assertNotIn(a, elig)
        self.assertIn(b, elig)  # akaunti ileile, model nyingine → bado hai

    def test_429_ya_siku_ni_daily_na_cooldown_ndefu(self):
        class E(Exception):
            status_code = 429
        kind, _ = classify_fail(E("Quota exceeded for metric generate_content_free_tier_requests, quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier"))
        self.assertEqual(kind, "daily")
        self.assertEqual(classify_fail(E("Too many requests. retry in 58s"))[0], "rate_limited")
        clk = Clock()
        pool = lanes.build_pools(cfg(), now=clk)["main"]
        ln = pool.lanes[0]
        cooldown = pool.note_fail(ln, "daily", None, clk.t)
        self.assertGreaterEqual(cooldown, 1.0)
        self.assertAlmostEqual(ln and pool._st(ln).cooldown_until, clk.t + cooldown)
        # cooldown inaishia kwenye reset ya lane husika, badala ya kupiga probe kila baada ya saa 3.
        self.assertNotEqual(pool._day_of(ln, clk.t + cooldown + 1), pool._day_of(ln, clk.t))

    def test_roster_ceo_laguna_na_north_hazipo_main(self):
        p = lanes.build_pools(cfg(), now=Clock())
        main = {l.model for l in p["main"].lanes}
        for removed in ("laguna-s-2.1:free", "north-mini-code:free", "kimi-k3:free",
                        "codestral-latest:free", "deepseek-v4-flash:free"):
            self.assertNotIn(removed, main)
        self.assertIn("minimax-m2.7:free", main)
        self.assertIn("deepseek-v4.1-flash:free", main)


if __name__ == "__main__":
    unittest.main()
