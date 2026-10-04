// scripts/cu-smoke.mjs — R31 Awamu B verification: run ya majaribio kwenye sandbox HALISI ya E2B.
// Inapima: cuBrain (Gemini halisi) + bridge (Claude Agent SDK) + Playwright MCP + events.jsonl.
// HAIJARIBU: gh/Vercel (hazipewi token) na bucket (hiyo ni ya Koyeb, Awamu F/G).
// Usage: node scripts/cu-smoke.mjs   (inahitaji E2B_API_KEY + GEMINI_API_KEY_1 kwenye .env.local)
import { readFileSync } from "node:fs";
import { Sandbox } from "@e2b/code-interpreter";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const E2B_KEY = process.env.E2B_API_KEY || env.E2B_API_KEY;
if (!E2B_KEY) { console.error("E2B_API_KEY haipo"); process.exit(1); }
if (!env.GEMINI_API_KEY_1) { console.error("GEMINI_API_KEY_1 haipo"); process.exit(1); }

const TEMPLATE = process.env.CU_E2B_TEMPLATE || "professor-xmd-browser-v3";
const PY = "/code/openhands-venv/bin/python";

const PLAN_MD = `# Mpango Kazi wa Majaribio (Smoke Test ya XMD Computer)

## 1. Ukurasa wa Welcome (Duka la Majaribio)
Instructions: Tengeneza faili index.html ndani ya workspace yenye ukurasa mmoja wa HTML: kichwa "Duka la Majaribio", slogan "Karibu Temeke!", rangi ya mandhari ya machungwa, na button "Oda Sasa" (haifanyi kitu). CSS iwe ndani ya faili moja.
Official Data:
- Jina: Duka la Majaribio
- Slogan: Karibu Temeke!
- Simu: +255 700 000 000
Verification: index.html ipo, ina jina na slogan kwa usahihi (kama vilivyo kwenye Official Data — usibadilishe).

## 2. Kujipima kwa Browser
Instructions: Anzisha server ya localhost kwenye workspace, fungua ukurasa kwa browser, chukua picha ya Desktop (1280x800) na ya Mobile (375x667).
Official Data: (hakuna — hatua ya kiufundi tu)
Verification: Picha mbili zimetoka bila makosa ya console yenye kuizuia page.

## 3. Ripoti ya Kiswahili
Instructions: Andika ripoti fupi ya Kiswahili: ulichojenga, majaribio (desktop+mobile), na iwapo kila kitu kiko sawa. Ukiongea table, andika table ya kawaida.
Verification: Ripoti ina sehemu zote tatu.`;

const CONFIG = {
  port: 4010,
  gemini: {
    keys: { "gemini-1": env.GEMINI_API_KEY_1, ...(env.GEMINI_API_KEY_2 ? { "gemini-2": env.GEMINI_API_KEY_2 } : {}) },
    flashModels: ["gemini-3.8-flash", "gemini-3.5-flash"],
    liteModels: ["gemini-3.5-flash-lite"],
    flashRpd: 20, liteRpd: 500, flashRpm: 5, liteRpm: 15,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    quota: { "gemini-1": { day: "", chat: {} }, "gemini-2": { day: "", chat: {} } },
  },
  emergency: [],
};

const q = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;

console.log("▶ Sandbox create:", TEMPLATE);
const sbx = await Sandbox.create(TEMPLATE, { apiKey: E2B_KEY });
console.log("✓ sandbox:", sbx.sandboxId);
try {
  await sbx.setTimeout(15 * 60 * 1000);

  await sbx.files.write("/home/user/cu_brain.py", readFileSync("cu/brain.py", "utf8"));
  await sbx.files.write("/home/user/cu_bridge.py", readFileSync("cu/bridge.py", "utf8"));
  await sbx.files.write("/home/user/cu_setup.sh", readFileSync("cu/setup.sh", "utf8"));
  await sbx.files.write("/home/user/plan.md", PLAN_MD);
  await sbx.files.write("/home/user/cu-config.json", JSON.stringify(CONFIG));

  const cmd = [
    "cd /home/user && bash /home/user/cu_setup.sh;",
    "PATH=/home/user/.local/bin:/home/user/node_modules/.bin:/usr/local/bin:$PATH",
    "PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright",
    "ANTHROPIC_BASE_URL=http://127.0.0.1:4010",
    "ANTHROPIC_API_KEY=sk-xmd-local",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
    "PYTHONUNBUFFERED=1",
    `GITHUB_TOKEN=${q("")} GH_TOKEN=${q("")} VERCEL_TOKEN=${q("")}`,
    `${PY} /home/user/cu_bridge.py --task-file /home/user/plan.md --title ${q("Smoke Test ya XMD Computer")}`,
    "--session smoke --max-steps 28 --events-out /home/user/events.jsonl",
  ].join(" ");

  console.log("▶ bridge inaanzishwa (stdout live)…");
  let ended = false;
  const counts = {};
  const handle = await sbx.commands.run(`bash -lc ${q(cmd)}`, {
    background: true, timeoutMs: 13 * 60 * 1000,
    onStdout: (d) => {
      for (const line of String(d).split("\n")) {
        if (!line) continue;
        if (line.startsWith("@@XMD ")) {
          try {
            const ev = JSON.parse(line.slice(6));
            counts[ev.type] = (counts[ev.type] || 0) + 1;
            if (["run_start", "exec_start", "shot", "github", "deploy", "finish", "error", "run_end", "usage"].includes(ev.type)) {
              const brief = { ...ev };
              delete brief.data;
              console.log("  📨", JSON.stringify(brief).slice(0, 220));
            }
            if (ev.type === "run_end") ended = true;
          } catch { /* */ }
        } else if (line.startsWith("[cuBrain") || line.startsWith("[bridge]")) {
          console.log("  " + line.slice(0, 200));
        }
      }
    },
    onStderr: (d) => { const s = String(d).trim(); if (s && !/pip|warn/i.test(s)) console.log("  ⚠️ stderr:", s.slice(0, 200)); },
  });
  const r = await handle.wait();
  console.log("✓ bridge exit:", r?.exitCode, "| run_end imefika:", ended);

  // brain.log — logs za cuBrain (debug)
  try {
    const bl = await sbx.commands.run("tail -25 /home/user/brain.log 2>/dev/null; echo '--- ws ---'; ls -la /home/user/ws 2>/dev/null | head -10", { timeoutMs: 20_000 });
    console.log("\n🧠 brain.log (tail):\n" + String(bl.stdout || "").slice(0, 1500));
  } catch { /* */ }

  // events.jsonl — source of truth ya resume
  try {
    const raw = await sbx.files.read("/home/user/events.jsonl");
    const lines = String(raw).split("\n").filter(Boolean);
    const evs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const types = evs.map((e) => e.type);
    const has = (t) => types.includes(t);
    console.log(`\nevents.jsonl: ${evs.length} events`);
    console.log("  think:", types.filter((t) => t.startsWith("think")).length,
      "| text:", types.filter((t) => t.startsWith("text")).length,
      "| draft:", types.filter((t) => t === "tool_draft").length,
      "| exec:", types.filter((t) => t.startsWith("exec")).length,
      "| shot:", types.filter((t) => t === "shot").length,
      "| usage:", types.filter((t) => t === "usage").length,
      "| files:", types.filter((t) => t === "files").length);
    const shots = evs.filter((e) => e.type === "shot");
    const report = evs.find((e) => e.type === "finish");
    const usage = evs.filter((e) => e.type === "usage" && e.ok);
    const tokens = usage.reduce((a, u) => a + (u.total || 0), 0);
    const endStatus = evs.find((e) => e.type === "run_end")?.status;
    const ok =
      has("run_start") && has("run_end") && has("exec_start") && has("exec_end") &&
      shots.length >= 1 && !!report?.report && report.report !== "(hakuna ripoti)" &&
      usage.length >= 2 && (endStatus === "done" || endStatus === "ok");
    console.log(`\n  screenshots: ${shots.length} (labels: ${shots.map((s) => s.label).join(", ")})`);
    console.log(`  LLM calls: ${usage.length} · tokens: ${tokens} · lanes: ${[...new Set(usage.map((u) => u.lane))].join(", ")}`);
    console.log(`\n  RIPOTI (mwanzo):\n${String(report?.report || "").slice(0, 600)}`);
    console.log(`\n${ok ? "✅ SMOKE TEST IMEPITA" : "❌ SMOKE TEST HAIJAKAMILIKA"} (run_end status: ${endStatus})`);
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error("events.jsonl haikusomeka:", e?.message || e);
    process.exitCode = 1;
  }
} finally {
  await sbx.kill().catch(() => {});
  console.log("\n🗑️ sandbox imefutwa.");
}
