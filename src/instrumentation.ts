// src/instrumentation.ts — Next.js inaita register() mara moja server ikianza (Node runtime tu).
// Inaweka kipimo cha matumizi ya API (usageTap) kabla ya route yoyote kuita LLM.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installUsageTap } = await import("./lib/server/usageTap");
    installUsageTap();
  }
}
