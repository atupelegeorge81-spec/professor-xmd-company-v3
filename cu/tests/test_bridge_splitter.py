"""R31-G5: ThinkTagSplitter — tags za <thought> zilizogawanyika kati ya SSE chunks.

Kosa la asili (session 6ac3ce60): check ya kila-chunk ("<thought>" in raw_text) ilifeli
tag ikigawanyika (mf. "abc <tho" + "ught>...") → thought YOTE ilimwagika kwenye text ya
kawaida badala ya think card. Splitter inabuffer suffix ya tag iliyokwishaanza.
"""
import unittest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bridge import ThinkTagSplitter


class FakeEm:
    def __init__(self):
        self.text = []
        self.think = []
        self.opens = 0
        self.closes = 0

    def on_text(self, t): self.text.append(t)
    def on_think(self, t): self.think.append(t)
    def on_open(self): self.opens += 1
    def on_close(self): self.closes += 1


class TestThinkTagSplitter(unittest.TestCase):
    def test_tag_imegawanyika_ufunguzi(self):
        """"<tho" + "ught>" — thought yote inaingia think card, si text."""
        em = FakeEm()
        s = ThinkTagSplitter(em.on_text, em.on_think, em.on_open, em.on_close)
        s.feed("Karibu. <tho")
        s.feed("ught>niseme kitu</thought>")
        s.flush()
        self.assertEqual("".join(em.text), "Karibu. ")
        self.assertEqual("".join(em.think), "niseme kitu")
        self.assertEqual(em.opens, 1)
        self.assertEqual(em.closes, 1)

    def test_tag_imegawanyika_kufunga(self):
        em = FakeEm()
        s = ThinkTagSplitter(em.on_text, em.on_think, em.on_open, em.on_close)
        s.feed("<thought>fikiria</tho")
        s.feed("ught>halisi")
        s.flush()
        # "fikiria" iliingia think; "halisi" inakuja BAADA ya kufunga → text ya kawaida
        self.assertEqual("".join(em.think), "fikiria")
        self.assertEqual("".join(em.text), "halisi")
        self.assertEqual(em.closes, 1)

    def test_hakuna_tags_text_yote(self):
        em = FakeEm()
        s = ThinkTagSplitter(em.on_text, em.on_think, em.on_open, em.on_close)
        s.feed("salamu dunia < si tag")
        s.flush()
        self.assertEqual("".join(em.text), "salamu dunia < si tag")
        self.assertEqual(em.think, [])

    def test_mawazo_mawili_mfululizo(self):
        em = FakeEm()
        s = ThinkTagSplitter(em.on_text, em.on_think, em.on_open, em.on_close)
        s.feed("<thought>moja</thought>kati<thought>mbili</thought>")
        s.flush()
        self.assertEqual("".join(em.think), "mojambili")
        self.assertEqual("".join(em.text), "kati")
        self.assertEqual(em.opens, 2)
        self.assertEqual(em.closes, 2)

    def test_thinking_tag_na_flush(self):
        em = FakeEm()
        s = ThinkTagSplitter(em.on_text, em.on_think, em.on_open, em.on_close)
        s.feed("<thinking>bado inaendele")
        s.flush()  # mwisho wa block — partial tag inakuwa text ya thought
        self.assertEqual("".join(em.think), "bado inaendele")
        self.assertEqual(em.opens, 1)
        self.assertEqual(em.closes, 0)

    def test_alfabeti_ya_kawaida_haishikwi(self):
        """suffix kama "<t" isishikwe milele — inaflush mara tag isipokamilika"""
        em = FakeEm()
        s = ThinkTagSplitter(em.on_text, em.on_think, em.on_open, em.on_close)
        s.feed("a < t")
        s.feed(" b")
        s.flush()
        self.assertEqual("".join(em.text), "a < t b")


if __name__ == "__main__":
    unittest.main()
