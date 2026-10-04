# R31 · Awamu F — Env za Koyeb kwa XMD Computer

**Lazima ziewekwe kwenye service ya `professor-xmd` (Koyeb dashboard → Service → Settings → Environment Variables)** kabla ya Awamu G (run ya Temeke). Bila `E2B_API_KEY`, awamu ya computer-use **inasimama kimya** (cuEnabled() = false) — Board ya kawaida haiathiriwi kabisa.

## Env zinazohitajika (5)

| Jina | Thamani | Chanzo |
|---|---|---|
| `E2B_API_KEY` | key ya E2B (e2b.dev) | `computer-use-xmd3/.env` → `E2B_API_KEY` |
| `CU_PUBLIC_URL` | `https://professor-xmd-professorcj-2c4d4efe.koyeb.app` | URL ya app yenyewe (default tayari sahihi — inawekwa kwa uhakiki) |
| `CU_GITHUB_TOKEN` | token ya GitHub (repo create + push kwenye org `professor-xmd-company`) | `computer-use-xmd3/.env` → `GITHUB_TOKEN` |
| `CU_VERCEL_TOKEN` | token ya Vercel (deploy) | `computer-use-xmd3/.env` → `VERCEL_TOKEN` |
| `CU_E2B_TEMPLATE` | `professor-xmd-browser-v3` | (default tayari hii — optional) |

Zingine (hazitajwi — defaults zipo):
- `CU_ENABLED` — default ON; `off` inazima awamu.
- `CU_GITHUB_ORG` — default `professor-xmd-company`.
- `CU_GITHUB_USERNAME` — default `atupelegeorge81-spec`.
- `CU_SCREENSHOTS_BUCKET` — default `6ac2935d0038fbd47d5d` (bucket "Professor-xmd-company" — ipo, imethibitishwa).

## Kwa nini hazikuwekwa na mimi

Ninazo keys hizo kwenye workspace (hazipatiwi mtandao wowote isipokuwa sandbox). Koyeb dashboard inahitaji login yako — nimeandaa orodha hapo juu ili ucopy-paste tu. **Kabla ya kuziweka: eka services zote mbili hazipaswi kufutwa (quota 2/2).** Baada ya kuweka env, Koyeb inaredeploy yenyewe.

## Baada ya kuweka env (uthibitisho)

1. Fungua `https://professor-xmd-professorcj-2c4d4efe.koyeb.app/api/health` — app iko hai.
2. Anzisha session mpya ya Board (plan mode) — mpango ukiisha + report + memory, kadi ya **🖥️ XMD Computer** inaanza YENYEWE (hakuna kitufe).
3. Shots zinakuja kwenye kadi; ripoti ya mwisho ni DOCUMENT kamili.
4. Tokens za CU: mstari "🖥️ XMD Computer" kwenye SummaryCard + Sessions page + Gemini rings za TokenAccounts.

## Usalama

- Keys ziko `.env.local` na `computer-use-xmd3/.env` — **hazijacommit kabisa** (gitignored).
- Sandbox hupewa token ya run mwenyewe (Bearer) — POST za events zinaidhinishwa nayo tu.
- Appwrite keys za professor HAZIINGII sandbox — sandbox ina E2B/LLM/GitHub/Vercel tu.
- Sandbox inafutwa (kill) sekunde 15 baada ya run kuisha — hakuna gharama iliyobaki.
