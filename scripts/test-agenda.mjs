#!/usr/bin/env node
// scripts/test-agenda.mjs — R21: jaribio la agenda + mwanzo wa majibu (".REE", ".D DECISION") dhidi ya app INAYOENDESHA.
//
//   Terminal 1:  npm run dev
//   Terminal 2:  npm run test:agenda                 → Board mpya (brief ya Saluni Nuru), zamu 6 za agents, kisha Pause
//                npm run test:agenda -- --turns 12   → zamu 12
//                npm run test:agenda -- --keep       → haisimamishi Board mwishoni (inaendelea kwenye UI)
//                npm run test:agenda -- --uno        → jaribio ghafi la UnoRouter (bila app): mwanzo wa jibu unakatika?
//
// Inakagua: muda wa jina + agenda · agenda = 10 hasa · kila jibu linaanza na neno halali (PROPOSED DECISION / AGREE …)
// · marekebisho ya 🩹 kwenye log · lane iliyotumika kwa kila zamu. Mwisho: PASS/FAIL.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : def; };
const BASE = String(opt("url", "http://localhost:3000")).replace(/\/$/, "");
const TURNS = Number(opt("turns", 6));
const KEEP = !!opt("keep", false);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BRIEF = path.resolve(ROOT, String(opt("brief", "KAZI-YA-MAJARIBIO-R21.md")));
const NAMES = { pm: "Optimus", designer: "Ultron", frontend: "Vextron", backend: "Megatron", qa: "Cybertron" };
const HEADS = /^(\*\*)?(PROPOSED DECISION|UPDATED DECISION|AGREE|DISAGREE|OBJECTION REJECTED|OBJECTION|SILENT|APPROVED|CHANGES[_ ]REQUESTED|READ_SOURCE|RESEARCH_REQUEST|SKILL_REQUEST|CLARIFY|DEFER|SEARCH|REJECT|ACCEPT|INSUFFICIENT_EVIDENCE|I_WAS_WRONG)\b/;
const C = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;

if (opt("uno", false)) await unoProbe();
else await e2e();

// ============================================================ E2E dhidi ya app
async function e2e() {
  if (!fs.existsSync(BRIEF)) { console.log(C.r(`Brief haipo: ${BRIEF}`)); process.exit(2); }
  const project = fs.readFileSync(BRIEF, "utf8").trim();
  let active;
  try { active = await (await fetch(`${BASE}/api/boardroom/active`)).json(); }
  catch { console.log(C.r(`App haipatikani kwenye ${BASE} — endesha \`npm run dev\` kwanza.`)); process.exit(2); }
  if (active?.active) { console.log(C.y(`Kuna Board inayoendelea (${active.active.id}). Isimamishe kwenye UI kwanza, kisha jaribu tena.`)); process.exit(2); }
  if (active?.paused) console.log(C.y(`ℹ️  Kuna Board iliyosimamishwa (${active.paused.id}) — haiguswi; jaribio linaanzisha Board mpya.`));

  console.log(C.b(`\n🏛️  Jaribio la agenda — ${BASE} · zamu ${TURNS}${KEEP ? " · --keep" : ""}\n`));
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/boardroom`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project }) });
  if (!res.ok || !res.body) { console.log(C.r(`POST /api/boardroom → ${res.status}`)); process.exit(2); }
  const runnerId = res.headers.get("x-runner-id");
  console.log(C.d(`runner ${runnerId}`));

  const msgs = new Map(); // id → { agent, text, think }
  const laneOf = {}; // jina la agent → lane ya mwisho
  const results = [];
  const repairs = [], warnings = [];
  let tTitle = null, tAgenda = null, agendaCount = null, agendaItems = "", stopped = false, errored = null;

  const stop = async (why) => {
    if (stopped) return; stopped = true;
    if (!KEEP && runnerId) {
      try { await fetch(`${BASE}/api/boardroom/pause`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: runnerId }) }); } catch {}
      console.log(C.d(`\n⏸️  Board imesimamishwa (${why}) — unaweza kuiendeleza kwa "Endeleza" kwenye UI.`));
    } else console.log(C.d(`\n▶️  Board inaendelea kwenye UI (${why}).`));
  };

  const handle = async (e) => {
    switch (e.type) {
      case "title_done": tTitle = Date.now() - t0; console.log(`🧠 Jina: ${C.b(e.title)} ${C.d(`(${sec(tTitle)})`)}`); break;
      case "system": {
        const m = /^📋 Agenda \((\d+) vipengele\): (.*)$/s.exec(e.text || "");
        if (m) { tAgenda = Date.now() - t0; agendaCount = Number(m[1]); agendaItems = m[2]; console.log(`📋 Agenda: ${agendaCount === 10 ? C.g(`${agendaCount} vipengele`) : C.r(`${agendaCount} vipengele (lazima 10)`)} ${C.d(`(${sec(tAgenda)})`)}`); agendaItems.split(" · ").forEach((a, i) => console.log(C.d(`   ${i + 1}. ${a.slice(0, 90)}`))); }
        break;
      }
      case "log": {
        const msg = e.entry?.message || "";
        const ln = /^🔌 (\S+) → (.+?)(?: · hop| · inaendelea|$)/.exec(msg);
        if (ln) laneOf[ln[1]] = ln[2];
        if (msg.startsWith("🩹")) { repairs.push(msg); console.log(C.y(`   ${msg.slice(0, 220)}`)); }
        else if (/polepole|mawazo badala ya jibu|jibu tupu|lanes zote/.test(msg)) { warnings.push(msg); console.log(C.y(`   ${msg.slice(0, 180)}`)); }
        break;
      }
      case "msg_start": msgs.set(e.id, { agent: NAMES[e.agentId] || e.agentId, text: "", think: "" }); break;
      case "think": { const m = msgs.get(e.id); if (m) m.think += e.text; break; }
      case "msg_reset": { const m = msgs.get(e.id); if (m) m.text = ""; break; }
      case "token": { const m = msgs.get(e.id); if (m) m.text += e.text; break; }
      case "msg_done": {
        const m = msgs.get(e.id);
        if (!m) break;
        const text = m.text.trim();
        if (!text || text.startsWith("🔎") || text.startsWith("📖")) break; // evidence/search si zamu ya jibu
        const head = text.split("\n")[0].slice(0, 70);
        const good = HEADS.test(text) || /^```/.test(text);
        const cut = /^[.,;:…·]/.test(text);
        results.push({ agent: m.agent, head, good, cut, lane: laneOf[m.agent] || "?" });
        console.log(`${good ? C.g("✔") : C.r("✘")} ${C.b(m.agent.padEnd(9))} ${C.d(`[${laneOf[m.agent] || "?"}]`)} ${good ? head : C.r(head)}`);
        if (results.length >= TURNS) await stop(`zamu ${TURNS} zimekamilika`);
        break;
      }
      case "error": errored = e.message; console.log(C.r(`❌ ${e.message}`)); break;
      case "done": await stop("done"); break;
    }
  };

  // soma NDJSON mpaka zamu zitimie (au Board imalize/isimame)
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const guard = setTimeout(async () => { console.log(C.r("\n⏱️  Dakika 25 zimepita — jaribio linasimama.")); await stop("timeout"); process.exit(1); }, 25 * 60_000);
  while (!stopped) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { await handle(JSON.parse(line)); } catch {}
      if (stopped) break;
    }
  }
  clearTimeout(guard);
  try { await reader.cancel(); } catch {}

  // ---------- muhtasari ----------
  const bad = results.filter((r) => !r.good);
  const checks = [
    ["Agenda imeundwa ndani ya dakika 2", tAgenda != null && tAgenda < 120_000, tAgenda != null ? sec(tAgenda) : "haikuundwa"],
    ["Agenda ni 10 hasa", agendaCount === 10, String(agendaCount ?? "—")],
    [`Zamu ${TURNS} zimepatikana`, results.length >= Math.min(TURNS, 1), `${results.length}`],
    ["Kila jibu linaanza na neno halali (hakuna \".REE\" / \".D DECISION\")", bad.length === 0, bad.length ? bad.map((b) => `${b.agent}: "${b.head.slice(0, 30)}"`).join(" · ") : "yote sawa"],
    ["Hakuna kosa la Board", !errored, errored || "—"],
  ];
  console.log(C.b("\n──────── MATOKEO ────────"));
  for (const [name, pass, info] of checks) console.log(`${pass ? C.g("PASS") : C.r("FAIL")}  ${name} ${C.d(`— ${info}`)}`);
  console.log(C.d(`Marekebisho ya mwanzo (🩹): ${repairs.length}${repairs.length ? " — provider alikata mwanzo; mfumo umeurejesha" : ""} · maonyo: ${warnings.length}`));
  const byLane = {};
  for (const r of results) byLane[r.lane] = (byLane[r.lane] || 0) + 1;
  console.log(C.d(`Lanes: ${Object.entries(byLane).map(([k, v]) => `${k} ×${v}`).join(" · ") || "—"}`));
  process.exit(checks.every((c) => c[1]) ? 0 : 1);
}

// ============================================================ Uno ghafi (bila app)
async function unoProbe() {
  const env = {};
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, "utf8").split("\n")) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  const keys = ["UNOROUTER_API_KEY_1", "UNOROUTER_API_KEY_2"].filter((k) => env[k]);
  const models = String(env.UNOROUTER_MODELS || "space-bunny-alpha:free,nemotron-3-ultra-550b-a55b:free").split(",").map((s) => s.trim()).filter(Boolean);
  if (!keys.length) { console.log(C.r("Hakuna UNOROUTER_API_KEY_1/2 kwenye .env.local")); process.exit(2); }
  const { repairHead } = await loadRepair();
  console.log(C.b(`\n🔬 UnoRouter ghafi — akaunti ${keys.length} × models ${models.length} (request 1/dakika kwa kila model)\n`));
  const jobs = [];
  for (const k of keys) for (const m of models) jobs.push({ k, m, first: jobs.length % 2 ? "AGREE" : "PROPOSED DECISION" });
  const out = await Promise.all(jobs.map(async ({ k, m, first }) => {
    const body = {
      model: m, stream: true, max_tokens: 1100, temperature: 0.5,
      messages: [
        { role: "system", content: "You are Megatron, Backend Engineer in a Board Room. English, under 120 words. Keep private chain-of-thought out of the visible answer." },
        { role: "user", content: first === "AGREE" ? "Agenda: frontend stack. Current proposal: Astro static + vanilla CSS, zero JS. If accepting the CURRENT proposal, begin with:\n   AGREE:\nthen RATIONALE:." : "Agenda: frontend stack. No proposal exists yet. Begin with PROPOSED DECISION: then RATIONALE:." },
      ],
    };
    const t = Date.now();
    try {
      const r = await fetch(`${env.UNOROUTER_BASE_URL || "https://api.unorouter.com/v1"}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${env[k]}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) return { k, m, err: `${r.status} ${(await r.text()).slice(0, 120)}` };
      const txt = await r.text();
      let content = "", reason = "";
      const firsts = [];
      for (const l of txt.split("\n")) {
        if (!l.startsWith("data: ") || l.includes("[DONE]")) continue;
        let j; try { j = JSON.parse(l.slice(6)); } catch { continue; }
        for (const c of j.choices || []) {
          const d = c.delta || {};
          const rc = d.reasoning_content ?? d.reasoning;
          if (rc) reason += rc;
          if (d.content) { content += d.content; if (firsts.length < 3) firsts.push(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([, v]) => v !== "" && v != null)))); }
        }
      }
      const fixed = repairHead(content.trimStart(), body.messages[1].content);
      return { k, m, ms: Date.now() - t, head: content.trimStart().slice(0, 40), fixed: fixed.fixed ? fixed.text.slice(0, 40) : null, firsts, reason: reason.length };
    } catch (e) { return { k, m, err: String(e?.message || e) }; }
  }));
  let cut = 0;
  for (const o of out) {
    const who = `${o.k.endsWith("1") ? "Uno 1" : "Uno 2"} · ${o.m.replace(/:free$/, "")}`;
    if (o.err) { console.log(`${C.y("…")} ${who}: ${C.y(o.err)}`); continue; }
    const isCut = /^[.,;:…·]/.test(o.head) || !!o.fixed;
    if (isCut) cut++;
    console.log(`${isCut ? C.y("🩹") : C.g("✔")} ${C.b(who)} ${C.d(`${sec(o.ms)} · reasoning ${o.reason}`)}\n   jibu: ${JSON.stringify(o.head)}${o.fixed ? C.g(`  → mfumo unarekebisha: ${JSON.stringify(o.fixed)}`) : ""}\n   ${C.d(`delta za kwanza: ${o.firsts.join(" | ")}`)}`);
  }
  console.log(C.d(`\nMwanzo uliokatika: ${cut}/${out.filter((o) => !o.err).length}. (Hitilafu inatokea mara kwa mara tu — rudia baada ya dakika 1 kuona zaidi.)`));
}

// repairHead ile ile ya app (src/lib/board/turnText.ts — haina imports) → transpile kwa typescript ya project
async function loadRepair() {
  const { createRequire } = await import("node:module");
  const ts = createRequire(path.join(ROOT, "package.json"))("typescript");
  const src = fs.readFileSync(path.join(ROOT, "src/lib/board/turnText.ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, () => ({}));
  return mod.exports;
}
