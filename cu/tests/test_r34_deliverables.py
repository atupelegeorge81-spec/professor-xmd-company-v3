"""R34-B: pages zinarejelea files zisizo tayari — "empty deliverables" (agizo la CEO 06-10).

Kosa la session 6ac4c32c: index.html ilirejelea js/login.js iliyoundwa kwa `touch` tu (0 bytes);
ripoti na STATUS.md zikadai "Step 9 ✓ Imekamilika". Sasa Stop hook inakataa mwisho hadi kila
rejea ya ndani (script/stylesheet/img) iwepo wenye maudhui — max 2 blocks, kisha inaishishwa.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bridge import HookState, find_empty_deliverables


def make_ws(files: dict) -> str:
    ws = tempfile.mkdtemp()
    for rel, content in files.items():
        p = os.path.join(ws, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(content)
    return ws


class TestFindEmptyDeliverables(unittest.TestCase):
    def test_login_js_ya_zero_bytes_inakamatwa(self):
        """Kosa halisi la 6ac4c32c: file iliyoundwa kwa touch (0 bytes) + rejea yake kwenye HTML."""
        ws = make_ws({
            "index.html": '<html><head><link rel="stylesheet" href="css/style.css"></head>'
                          '<body><script src="js/login.js"></script></body></html>',
            "css/style.css": "body { color: red; }",
            "js/login.js": "",   # 0 bytes — touch tu
        })
        self.assertEqual(find_empty_deliverables(ws), [("js/login.js", "0 bytes")])

    def test_file_iliyopo_kabisa_haipo(self):
        ws = make_ws({
            "index.html": '<html><body><script src="js/app.js"></script></body></html>',
        })
        self.assertEqual(find_empty_deliverables(ws), [("js/app.js", "haipo")])

    def test_kila_kitiki_chenye_maudhui_hakuna_loseni(self):
        ws = make_ws({
            "index.html": '<html><head><link rel="stylesheet" href="css/style.css?v=2"></head>'
                          '<body><script src="js/login.js"></script><img src="logo.png"></body></html>',
            "css/style.css": "body{}",
            "js/login.js": "console.log('halisi');",
            "logo.png": "PNG_DATA_HAPA",
        })
        self.assertEqual(find_empty_deliverables(ws), [])

    def test_external_na_data_urls_zinarukwa(self):
        ws = make_ws({
            "index.html": '<html><head><link rel="stylesheet" href="https://fonts.example/x.css">'
                          '</head><body><script src="https://cdn.example/x.js"></script>'
                          '<img src="data:image/png;base64,xxx"><img src="//cdn.example/y.png">'
                          '<a href="signup.html">Sign Up</a></body></html>',
            "signup.html": "<html></html>",
        })
        self.assertEqual(find_empty_deliverables(ws), [], "external/data/anchor-haipaswi kuhesabiwa")

    def test_favicon_rel_hasi_si_deliverable_lakini_stylesheet_haipo_ni(self):
        ws = make_ws({
            "index.html": '<html><head><link rel="icon" href="favicon.ico">'
                          '<link rel="stylesheet" href="css/missing.css"></head></html>',
        })
        self.assertEqual(find_empty_deliverables(ws), [("css/missing.css", "haipo")])

    def test_html_ndani_ya_node_modules_na_hidden_zinarukwa(self):
        ws = make_ws({
            "index.html": '<html><body><script src="js/ok.js"></script></body></html>',
            "js/ok.js": "ok();",
            "node_modules/pkg/demo.html": '<script src="MISSING.js"></script>',
            ".git/hooks/x.html": '<script src="MISSING2.js"></script>',
        })
        self.assertEqual(find_empty_deliverables(ws), [])

    def test_html_nyingi_zinakusanywa(self):
        ws = make_ws({
            "index.html": '<html><body><script src="js/a.js"></script></body></html>',
            "signup.html": '<html><head><link rel="stylesheet" href="css/b.css"></head></html>',
            "js/a.js": "a;",
        })
        got = find_empty_deliverables(ws)
        self.assertIn(("css/b.css", "haipo"), got)
        self.assertEqual(len(got), 1)

    # ---------------- R34.1: false positive ya 6ac6c6e5 ----------------
    # dist/index.html (vite build) ilirejelea ./assets/index-*.js — hook ya zamani ilitafuta
    # ws/assets/ (mzizi) badala ya dist/assets/ → block ya uongo mara 2. Sasa:
    # (a) saraka za build (dist/ n.k.) hazihesabiwi kabisa, (b) rejea zinatafutwa kutoka
    # directory ya HTML yenyewe.

    def test_dist_ya_build_haighairiwi_kabisa(self):
        ws = make_ws({
            "index.html": '<html><body><script type="module" src="/src/main.jsx"></script></body></html>',
            "src/main.jsx": "render();",
            "dist/index.html": '<html><head><link rel="stylesheet" href="./assets/index-BtJ1Q6qY.css"></head>'
                              '<body><script type="module" src="./assets/index-Cyvuk1eG.js"></script></body></html>',
            # KUMBUKA: dist/assets/ haipo kabisa — build output si deliverable ya kuhesabiwa
        })
        self.assertEqual(find_empty_deliverables(ws), [], "dist/ ni generated — hakuna ghairi")

    def test_rejea_inatafutwa_kutoka_directory_ya_html(self):
        """HTML ndani ya subdir inarejelea ./js/app.js → subdir/js/app.js (si ws/js/)."""
        ws = make_ws({
            "site/page.html": '<html><body><script src="./js/app.js"></script></body></html>',
            "site/js/app.js": "ok();",          # ipo NDANI ya site/ — ya zamani ingedai haipo
        })
        self.assertEqual(find_empty_deliverables(ws), [])

    def test_rejea_inayotoroka_haighairiwi(self):
        """HTML ya subdir ikitafuta ../shared.css (inatoroka) — hairuhusiwi kuhesabiwa."""
        ws = make_ws({
            "site/page.html": '<html><head><link rel="stylesheet" href="../shared.css"></head></html>',
            "shared.css": "x{}",
        })
        self.assertEqual(find_empty_deliverables(ws), [], "../ inatoroka — hairuhusiwi")


class TestNoteDeliverables(unittest.TestCase):
    def test_block_ya_kwanza_na_ya_pili(self):
        st = HookState()
        empties = [("js/login.js", "0 bytes")]
        v1 = st.note_deliverables(empties)
        self.assertIn("block_reason", v1)
        self.assertIn("js/login.js", v1["block_reason"])
        self.assertIn("USIISHIE", v1["block_reason"])
        v2 = st.note_deliverables(empties)
        self.assertIn("block_reason", v2)
        self.assertEqual(st.deliverable_blocks, 2)

    def test_block_ya_tatu_inaishishwa(self):
        st = HookState()
        for _ in range(2):
            st.note_deliverables([("js/login.js", "0 bytes")])
        self.assertEqual(st.note_deliverables([("js/login.js", "0 bytes")]), {},
                         "max 2 — ya tatu inaishishwa (si loop ya milele)")

    def test_orodha_tupu_haiblocki(self):
        st = HookState()
        self.assertEqual(st.note_deliverables([]), {})

    def test_maonyo_mawili_yanatajwa(self):
        st = HookState()
        v = st.note_deliverables([("js/login.js", "0 bytes"), ("css/x.css", "haipo")])
        self.assertIn("js/login.js", v["block_reason"])
        self.assertIn("css/x.css", v["block_reason"])


if __name__ == "__main__":
    unittest.main()
