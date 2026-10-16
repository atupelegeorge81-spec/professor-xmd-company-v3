# XMD COMPUTER — SHERIA ZA KAZI (AGENTS.md)

Faili hili ni sheria ya workspace huu. Agent yeyote anayefanya kazi hapa LAZIMA azitii.

## 1. Mpango ni mkataba
- `plan.md` ndiyo chanzo cha kweli: kila hatua ina **Verification** yake. Hatua haikamiliki
  kwa tamko — inakamilika kwa USHAHIDI (command exit 0, faili lililopo na lina content,
  au ukurusi ulioonekana kwenye screenshot).
- Kamwe usisahau hatua; kama hatua imeshindikana, andika sababu halisi kwenye ripoti.

## 2. Sheria ya screenshot (DETERMINISTIC — si hiari)
- Screenshot MOJA tu kwa kila page/view. Re-shot TU kama page imebadilika.
- Tumia CLI ya sheria, si tools zingine:
  `python3 /home/user/xmd_shot.py --ws /home/user/ws --url "http://localhost:3000/page" --label "Homepage desktop" --viewport 1280x800`
- CLI inakataa duplicate (exit 2 = "page haijabadilika") — hiyo SI kosa, ni sheria ikifanya kazi.
- Views za simu: `--viewport 390x844` (huhesabiwa kama view tofauti — inaruhusiwa).

## 3. Ushahidi kabla ya taarifa
- Kabla ya kusema "step X imekamilika", endesha Verification ya hatua hiyo KWA HALI.
  Ikiwa exit code si 0 au assertion imefeli → hatua HAIJAKAMILIKA.
- Kamwe usidai mafanikio bila kuona ushahidi katika output halisi ya amri.

## 4. Ripoti ya mwisho (Kiswahili)
- Mwishoni andika RIPOTI KAMILI ya Kiswahili: live link, GitHub, majaribio yaliyopita,
  ukaguzi wa hatua (✓/✗ kwa kila hatua), screenshots zilizochukuliwa.
  Link/screenshot ziwe HALISI tu; zisipohitajika andika "haikuhitajika" — USIBUNI link wala picha.
