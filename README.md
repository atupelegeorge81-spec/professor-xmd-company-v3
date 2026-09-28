# PROFESSOR-XMD — AI Engineering Company

Agents watano (Optimus, Ultron, Vextron, Megatron, Cybertron) wanakutana kwenye **Board Room**, wanatafiti mtandaoni,
wanajadili, wanafunga maamuzi kwenye Ledger, wanaandika code na mwishoni wanaandika ripoti kamili ya Kiswahili.

## Kuanza

```bash
npm install
cp .env.example .env.local   # jaza keys za Appwrite / XKiro / Groq / TokenHarbor
npm run dev                  # http://localhost:3000
```

Production: `npm run build && npm start`.

## Muundo

| Sehemu | Faili |
| --- | --- |
| Engine ya mjadala (haijabadilishwa flow) | `src/lib/boardRunner.ts`, `agenda.ts`, `ledger.ts`, `scriptBox.ts`, `search.ts`, `groq.ts`, `modelArbiter.ts` |
| Kipimo cha tokens (live + exact) | `src/lib/tokenMeter.ts`, `src/lib/usageChip.ts` |
| API | `src/app/api/*` (boardroom, agent, conversations, reports, board/sessions, stats, config, ledger, usage/xkiro, health) |
| UI ↔ engine | `src/components/board/BoardLive.tsx` (provider) → `src/lib/board/adapter.ts` (matukio → kadi) |
| UI | `src/app/*`, `src/components/*` |

## Data halisi

- **Board Room** inasoma NDJSON ya engine moja kwa moja; mjadala unaendelea hata ukihama ukurasa, na unaonekana popote (auto-attach).
- **Sessions / Reports** zinatoka Appwrite (`boardroom_sessions`, `reports`). Session iliyosimama inaweza kuendelezwa (Resume).
- **Tokens**: `usage_live` (makadirio ya tokenizer wakati jibu linarudi) → exact usage kutoka provider mwishoni
  (XKiro hutuma usage kwenye frame yenye `choices: []`). Quota ya XKiro inasomwa kutoka `GET /v1/usage`.
- **Tarehe** ni ya siku halisi kwenye `APP_TIMEZONE` na hubadilika yenyewe saa sita usiku.

## Agent chat → Appwrite (collection `agent_conversations` · ID `6ab6d7990026978d4ba9`)

Mazungumzo ya vyumba binafsi vya agents (`/agents/<id>`) yanahifadhiwa Appwrite — row moja kwa kila ujumbe.
ID ya collection imewekwa ndani ya code (`scripts/agent-chats.schema.json`) — **hakuna env ya ziada inayohitajika**.

- Server **inajikamilisha yenyewe**: mara ya kwanza chat inapotumika, columns/indexes zinazokosekana zinaundwa
  (log: `[agent-chats] muundo umekamilishwa …`). API key iwe na scopes `collections.*`, `attributes.*`, `indexes.*`, `documents.*`.
- Setup ya mkono (hiari, salama kurudia): `npm run setup:agent-chats` · mpango tu: `npm run setup:agent-chats -- --dry`.
- Appwrite ikikataa kuhifadhi, chat inaonyesha mstari wa onyo wenye sababu halisi; log ya server: `[agent-chats] … imeshindwa`.
- Header ya chat: **Appwrite** = inahifadhi · **Browser** = Appwrite haipatikani (historia iko kwenye kivinjari tu).

| Column | Type | Size / range | Required |
|---|---|---|---|
| agent_id | varchar | 32 | ✓ |
| thread_id | varchar | 36 | ✓ |
| seq | integer | 0 … 1,000,000 | ✓ |
| role | enum | user · agent | ✓ |
| content | mediumtext | 4,194,303 | |
| thinking | mediumtext | 4,194,303 | |
| search_query | varchar | 512 | |
| sources | mediumtext (JSON) | 4,194,303 | |
| status | enum | done · stopped · error | |
| seconds | integer | 0 … 86,400 | |
| feedback | enum | up · down | |
| model | varchar | 128 | |
| prompt_tokens | integer | ≥ 0 | |
| completion_tokens | integer | ≥ 0 | |
| total_tokens | integer | ≥ 0 | |
| tokens_exact | boolean | — | |
| requests | integer | ≥ 0 | |

Indexes (key): `idx_agent_thread_seq` [agent_id, thread_id, seq] · `idx_agent_created` [agent_id, $createdAt] · `idx_role_created` [role, $createdAt].
Permissions: hakuna (server API key pekee inasoma/kuandika).

