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
    // R38-RC3: KEEP-ALIVE ya instance. Ushahidi [179]→[181]: process ya Koyeb ilifa wakati wa
    // awamu ya CU (in-memory runner + timer za auto-resume zikazama pamoja). Koyeb free inalala
    // bila traffic; mdundo huu wa ndani (ping ya /api/health kupitia URL ya umma kila dakika 4)
    // unaifanya isilale MUDA run haiendelei. Instance ikifa hata hivyo (deploy/OOM), ombi la
    // kwanza la nje linaiamsha → register() inarudi → mdundo unaanza tena.
    if (process.env.CU_KEEPALIVE !== "off" && process.env.NODE_ENV === "production") {
      const url = (process.env.CU_PUBLIC_URL || process.env.KOYEB_PUBLIC_URL || "https://professor-xmd-professorcj-2c4d4efe.koyeb.app").replace(/\/$/, "") + "/api/health";
      const ping = () => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => {});
      setTimeout(() => { void ping(); }, 60_000).unref?.();
      const t = setInterval(() => { void ping(); }, 4 * 60_000);
      (t as any)?.unref?.();
    }
  }
}
