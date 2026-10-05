// src/instrumentation.ts — Next.js inaita register() mara moja server ikianza (Node runtime tu).
// Inaweka kipimo cha matumizi ya API (usageTap) kabla ya route yoyote kuita LLM.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installUsageTap } = await import("./lib/server/usageTap");
    installUsageTap();
    // R31-G4: auto-resume ya sessions zilizopumzika (quota) — server ukianza/kuamka:
    // scan mara moja (baada ya sekunde 20) + kila dakika 10 (instance ikiishi).
    setTimeout(() => { void import("@/lib/cu/autoResume").then((m) => m.checkPausedDue(true)).catch((e) => console.warn("[cu/autoResume] boot scan:", String(e).slice(0, 120))); }, 20_000);
    setInterval(() => { void import("@/lib/cu/autoResume").then((m) => m.checkPausedDue()).catch((e) => console.warn("[cu/autoResume] tick:", String(e).slice(0, 120))); }, 10 * 60_000);
  }
}
