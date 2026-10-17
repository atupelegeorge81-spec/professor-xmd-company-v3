// src/instrumentation.ts — Next.js inaita register() mara moja server ikianza (Node runtime tu).
// Inaweka kipimo cha matumizi ya API (usageTap) kabla ya route yoyote kuita LLM.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installUsageTap } = await import("./lib/server/usageTap");
    installUsageTap();
    // R43 Tabaka 1+2: watchdog ya RAM (cooldown@78% · diet@65%, mpigo 30s) + SIGTERM handler
    // (neema ya sekunde 30 za Koyeb → runner ahifadhiwe "paused" + auto-resume). R43_WATCHDOG=off inazima.
    const { startWatchdog, installSigtermHandler } = await import("./lib/server/watchdog");
    startWatchdog();
    installSigtermHandler();
    // R31-G4: auto-resume ya sessions zilizopumzika (quota) — server ukianza/kuamka:
    // scan mara moja (baada ya sekunde 20) + kila dakika 10 (instance ikiishi).
    // TASK-5: sweepOrphans kwanza (session "inaendelea" bila runner baada ya crash → system pause) kisha checkPausedDue.
    setTimeout(() => { void import("@/lib/cu/autoResume").then(async (m) => { await m.sweepOrphans(true); return m.checkPausedDue(true); }).catch((e) => console.warn("[cu/autoResume] boot scan:", String(e).slice(0, 120))); }, 20_000);
    setInterval(() => { void import("@/lib/cu/autoResume").then(async (m) => { await m.sweepOrphans(); return m.checkPausedDue(); }).catch((e) => console.warn("[cu/autoResume] tick:", String(e).slice(0, 120))); }, 10 * 60_000);
    // TASK-8: ROLLING DEPLOY — instance hii mpya huwaka KABLA instance ya zamani haijapata SIGTERM; pause yake
    // (resumeAt +60s) inaandikwa BAADA ya boot scan → zamani ilisubiri tick ya dk 10 (T2: dk 8). Sasa: dk 15 za
    // kwanza checkPausedDue kila dakika (query 1 ndogo ya DB; resumeAt iliyopita ≥30s tu — mmiliki hai apate nafasi kwanza).
    const burst = setInterval(() => { void import("@/lib/cu/autoResume").then((m) => m.checkPausedDue(true, 30_000)).catch((e) => console.warn("[cu/autoResume] burst:", String(e).slice(0, 120))); }, 60_000);
    setTimeout(() => clearInterval(burst), 15 * 60_000).unref?.();
    // R38-RC3: KEEP-ALIVE ya instance. Ushahidi [179]→[181]: process ya Koyeb ilifa wakati wa
    // awamu ya CU (in-memory runner + timer za auto-resume zikazama pamoja). Koyeb free inalala
    // bila traffic; mdundo huu wa ndani (ping ya /api/live kupitia URL ya umma kila dakika 4)
    // unaifanya isilale MUDA run haiendelei. Instance ikifa hata hivyo (deploy/OOM), ombi la
    // kwanza la nje linaiamsha → register() inarudi → mdundo unaanza tena.
    // TASK-7: ping /api/live (bila DB) badala ya /api/health. XMD_TEST_KEEPALIVE_MS = test-only (inafanya kazi
    // TU chini ya XMD_TEST_HOOKS=1): mdundo mfupi + inaruhusu dev server — vinginevyo haina athari.
    const testKaMs = process.env.XMD_TEST_HOOKS === "1" ? Number(process.env.XMD_TEST_KEEPALIVE_MS) || 0 : 0;
    if (process.env.CU_KEEPALIVE !== "off" && (process.env.NODE_ENV === "production" || testKaMs > 0)) {
      const url = (process.env.CU_PUBLIC_URL || process.env.KOYEB_PUBLIC_URL || "https://professor-xmd-professorcj-2c4d4efe.koyeb.app").replace(/\/$/, "") + "/api/live";
      const ping = () => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => {});
      setTimeout(() => { void ping(); }, testKaMs || 60_000).unref?.();
      const t = setInterval(() => { void ping(); }, testKaMs || 4 * 60_000);
      (t as any)?.unref?.();
    }
  }
}
