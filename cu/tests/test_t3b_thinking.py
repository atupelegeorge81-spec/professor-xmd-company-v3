"""cu/tests/test_t3b_thinking.py — Task 3b: formats 4 za thinking + tool-call ya text.

Mifano ni ya KWELI kutoka probe za 2026-10-16 (Uno minimax-m2.7, nemotron-3-super,
Gemini 3.6 flash include_thoughts) — si ya kubuni.
"""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from oh_util import is_text_toolcall, reasoning_of, split_think  # noqa: E402


class TestT3bThinking(unittest.TestCase):
    def test_minimax_inline_think_inatenganishwa(self):
        th, vis = split_think("<think>The user wants a file. Let me run echo.</think>\n\nDONE — file imeundwa.")
        assert th == "The user wants a file. Let me run echo."
        assert vis == "DONE — file imeundwa."
        assert "<think>" not in vis


    def test_gemini_thought_tags(self):
        th, vis = split_think("<thought>**Calculating the Cost**  17 x 23</thought>The total is 391 shillings.")
        assert th.startswith("**Calculating the Cost**")
        assert vis == "The total is 391 shillings."


    def test_close_tag_pekee_mwanzoni(self):
        # chat template iliweka <think> kwenye prompt — content inaanza na mawazo kisha </think>
        th, vis = split_think("hmm, need to check the file first</think>Nimeangalia: iko sawa.")
        assert th == "hmm, need to check the file first"
        assert vis == "Nimeangalia: iko sawa."


    def test_think_isiyofungwa_ni_thinking_yote(self):
        th, vis = split_think("<think>bado ninawaza kuhusu hatua ya 5")
        assert th == "bado ninawaza kuhusu hatua ya 5"
        assert vis == ""


    def test_blocks_mbili_na_text_kati(self):
        th, vis = split_think("<think>A</think>Moja <thinking>B</thinking>Mbili")
        assert th == "A\n\nB"
        assert vis == "Moja Mbili"


    def test_text_ya_kawaida_haiguswi(self):
        assert split_think("Hatua 4 zimekamilika.") == ("", "Hatua 4 zimekamilika.")
        assert split_think("") == ("", "")
        assert split_think(None) == ("", "")


    def test_reasoning_of_reasoning_content_na_thinking_blocks(self):
        ev = NS(reasoning_content="  mawazo ya nemotron  ", thinking_blocks=[NS(thinking="block ya claude")])
        assert reasoning_of(ev) == "mawazo ya nemotron\n\nblock ya claude"
        assert reasoning_of(NS()) == ""
        assert reasoning_of(NS(reasoning_content=None, thinking_blocks=None)) == ""


    def test_text_toolcall_ya_nemotron_super_inafichwa(self):
        # jibu halisi la Uno nemotron-3-super (finish=stop, hakuna tool_calls)
        assert is_text_toolcall('{"command":"echo hello > hello.txt","is_background":false}')
        assert is_text_toolcall('{"action": "command", "args": {"cmd": "ls"}}')  # R46 ya zamani
        assert is_text_toolcall('```json\n{"name": "terminal", "arguments": {"command": "ls"}}\n```')


    def test_text_ya_kawaida_si_toolcall(self):
        assert not is_text_toolcall("Nimeunda hello.txt — DONE.")
        assert not is_text_toolcall("{haya ni maelezo} si JSON ya tool")
        assert not is_text_toolcall("")

    def test_minimax_tool_mode_think_bila_kufungwa_pengo_la_mistari_3(self):
        # thought HALISI ya ActionEvent (E2B, SDK 1.46): </think> imepotea, pengo \n\n\n limebaki
        raw = ('<think>The command completed successfully. Now I need to reply with just "DONE".\n\n\n'
               'DONE.  <think>\nThe user asked me to run a simple command and reply with "DONE".\n')
        th, vis = split_think(raw)
        self.assertEqual(vis, "DONE.")
        self.assertIn("command completed successfully", th)
        self.assertIn("The user asked me", th)

    def test_block_iliyofungwa_inavumilia_pengo_ndani(self):
        self.assertEqual(split_think("<think>a\n\n\nb</think>Jibu"), ("a\n\n\nb", "Jibu"))

    def test_gemini_native_thinking_block_si_nakala(self):
        rc = "**My Assessment of the Task**  Okay, so the user wants me to execute echo"
        ev = NS(reasoning_content=rc, thinking_blocks=[NS(thinking=rc)])
        self.assertEqual(reasoning_of(ev), rc)

    def test_xml_toolcall_ya_laguna_inafichwa(self):
        # jibu HALISI la laguna-s-2.1 lililokuwa ripoti (live c2ab16bd)
        self.assertTrue(is_text_toolcall(
            "<tool_call>read<arg_key>path</arg_key><arg_value>/home/user/ws/feature_list.json</arg_value></tool_call>"))
        self.assertTrue(is_text_toolcall("<function=terminal>\n<parameter=command>ls</parameter>\n</function>"))
        self.assertTrue(is_text_toolcall('[TOOL_CALLS][{"name": "terminal", "arguments": {"command": "ls"}}]'))
        self.assertTrue(is_text_toolcall('<invoke name="terminal"><parameter name="command">ls</parameter></invoke>'))

    def test_ripoti_inayotaja_tool_call_si_toolcall(self):
        r = ("## Ripoti ya Mwisho\\nHatua zote 3 zimekamilika: hello.txt (bytes 5). Agent alitumia "
             "<tool_call> mara moja kusoma feature_list.json, kisha akaandika evidence.")
        self.assertFalse(is_text_toolcall(r))

    def test_json_halali_tupu_si_jibu(self):
        self.assertTrue(is_text_toolcall('{\n "features": [\n  {"id": "f1", "title": "repo", "state": "passed"}\n ]\n}'))
        self.assertFalse(is_text_toolcall("{haya ni maelezo} na JSON haijakamilika"))

    def test_clean_think_marudio_na_tags(self):
        from oh_util import clean_think
        s = "Now I need to update qa-final.<think>Now I need to update qa-final.<think>Now I need to update qa-final.<t"
        self.assertEqual(clean_think(s), "Now I need to update qa-final.")
        self.assertEqual(clean_think("A\n\nB"), "A\n\nB")
        self.assertEqual(clean_think(""), "")
