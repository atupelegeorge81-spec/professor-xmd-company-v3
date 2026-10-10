// src/lib/server/watchdog.ts — R43 Tabaka 1+2 (agizo la Mkuu, matabaka matano yameidhinishwa):
//   TABAKA 1 🌡️ RAM WATCHDOG: kila sekunde 30 soma cgroup memory (ukweli wa Koyeb 512MB).
//     ≥ 65% → diet (GC + log) · ≥ 78% → COOLDOWN: runner apumzishwe kwa neema + auto-resume baada ya 3dk.
//     (78% si 90% kwa sababu: OOM kill haineemekwi — SIGKILL papo hapo; tunacha nafasi ya spikes za GC.)
//   TABAKA 2 📜 SIGTERM HANDLER: Koyeb ina neema ya sekunde 30 kabla ya SIGKILL — tunatumia kuhifadhi
//     runner kwa "paused" + resumeAt, boot mpya ina-auto-resume (njia ya R31-G4/R38 iliyothibitishwa LIVE).
// Tabaka 3 (diet ya items), 4 (E2B lifecycle), 5 (keep-alive — IPO) zinafuata baada ya hizi kuthibitika.
// Zinatumia njia ZILIZOPO tu: pauseComputerFromServer (snapshot+persist+scheduleAutoResume) na pauseRun/unpauseRun.
// MUHIMU: hali yote iko kwenye globalThis — bundle ya instrumentation na za routes ni module-instances
// tofauti (ushahidi live: on=False ilipokuwa module-local; usageTap inafanya kazi kwa patch ya globalThis.fetch).
// R43_WATCHDOG=off inazima zote mbili (escape hatch).

import { readRam } from "./sysinfo";

export type WatchEvent = { at: number; kind: "cooldown" | "diet" | "sigterm" | "log" | "resume"; ramPct: number; note: string };

const COOLDOWN_AT = 78;          // % RAM → cooldown kamili
const DIET_AT = 65;              // % RAM → diet
const COOLDOWN_RESUME_MS = 3 * 60_000;   // mjadala unaendelea baada ya dakika 3
const SIGTERM_RESUME_MS = 60_000;        // restart: sekunde 60 kisha auto-resume (boot + scan)
const MIN_BETWEEN_COOLDOWNS = 5 * 60_000; // usirudia cooldown kila tick (hysteresis)

type WatchState = {
  startedAt: number;
  cooldowns: number;
  lastCooldownAt: number;
  busy: boolean;
  logTicks: number;
  events: WatchEvent[];
};

const G: WatchState = ((globalThis as any).__r43watch ??= {
  startedAt: 0,
  cooldowns: 0,
  lastCooldownAt: 0,
  busy: false,
  logTicks: 0,
  events: [] as WatchEvent[],
} as WatchState);

export function watchdogState() {
  return {
    on: G.startedAt > 0,
    startedAt: G.startedAt,
    cooldowns: G.cooldowns,
    busy: G.busy,
    thresholds: { cooldownAt: COOLDOWN_AT, dietAt: DIET_AT },
    lastEvent: G.events.length ? G.events[G.events.length - 1] : null,
    events: G.events.slice(-8),
  };
}

function ev(kind: WatchEvent["kind"], ramPct: number, note: string) {
  G.events.push({ at: Date.now(), kind, ramPct: Number(ramPct.toFixed(1)), note: String(note).slice(0, 200) });
  if (G.events.length > 40) G.events.splice(0, G.events.length - 40);
  console.log(`[watchdog] ${kind} · RAM ${ramPct.toFixed(1)}% · ${note}`);
}

/**
 * COOLDOWN: pumzisha runner hai kwa neema na irudishe yenyewe baadaye.
 * - Awamu ya CU (computer): pauseComputerFromServer(reason, resumeAt) — SNAPSHOT ya workspace + persist
 *   "paused" + scheduleAutoResume + sandbox inabaki hai (heartbeat 5dk) — njia ya quota-pause (R40) yenyewe.
 * - Awamu ya discussion: pauseRun() (in-memory pause; gate ya LLM inasimama) + timer ya ndani inarudisha.
 */
async function cooldown(reason: string, resumeMs: number, force = false): Promise<void> {
  if (G.busy) return;
  if (!force && Date.now() - G.lastCooldownAt < MIN_BETWEEN_COOLDOWNS) return;
  G.busy = true;
  try {
    const br = await import("@/lib/boardRunner");
    const r = br.activeRunner();
    if (r && r.status === "running") {
      const cu = r.cu;
      if (r.cuHooks && cu && !cu.done && !cu.pausedNow && !cu.pausing) {
        const { pauseComputerFromServer } = await import("@/lib/cu/engine");
        // kudumu: snapshot (workspace zetu ~110KB = sekunde chache) + persist + auto-resume timer
        await pauseComputerFromServer(r, r.cuHooks, reason, Date.now() + resumeMs).catch(() => {});
      } else {
        br.pauseRun(r.id); // discussion: pause ya neema (in-flight inakatwa kwenye gate)
        const t = setTimeout(async () => {
          try {
            const rr = br.findRunner(r.id);
            if (rr && rr.status === "paused") {
              if (br.unpauseRun(rr)) ev("resume", (await readRam()).pct, "mjadala umeendelea pale pale (cooldown ilikamilika)");
            }
          } catch { /* kimya */ }
        }, resumeMs);
        t.unref?.();
      }
      G.cooldowns += 1;
      G.lastCooldownAt = Date.now();
      ev("cooldown", (await readRam()).pct, `${reason} — runner amepumzishwa; auto-resume baada ya ${Math.round(resumeMs / 60_000)}dk`);
    } else {
      ev("cooldown", (await readRam()).pct, `${reason} — hakuna runner hai; ilikuwa diet tu`);
    }
  } catch (e) {
    ev("cooldown", -1, `cooldown ilikufa: ${String(e).slice(0, 120)}`);
  } finally {
    G.busy = false;
  }
}

/** TABAKA 1: anzisha mpigo wa RAM (inaitwa mara moja kutoka instrumentation.ts). */
export function startWatchdog(): void {
  if (G.startedAt || process.env.R43_WATCHDOG === "off") return;
  G.startedAt = Date.now();
  const t = setInterval(async () => {
    try {
      const ram = await readRam();
      if (ram.pct >= COOLDOWN_AT) {
        await cooldown(`🌡️ RAM imefika ${ram.pct.toFixed(0)}%`, COOLDOWN_RESUME_MS);
      } else if (ram.pct >= DIET_AT) {
        (globalThis as any).gc?.(); // inafanya kazi tu ikiwa --expose-gc; la: kimya
        ev("diet", ram.pct, "RAM juu — diet (GC)");
      } else if (++G.logTicks % 10 === 0) {
        ev("log", ram.pct, `mpigo wa kawaida (${ram.source})`);
      }
    } catch { /* kimya */ }
  }, 30_000);
  t.unref?.();
  console.log(`[watchdog] 🛡️ R43 imewaka · cooldown@${COOLDOWN_AT}% · diet@${DIET_AT}% · mpigo: sekunde 30`);
}

/** TABAKA 2: SIGTERM ya Koyeb (neema 30s) → hifadhi kwa "paused" + resumeAt, kisha exit safi. */
export function installSigtermHandler(): void {
  if (process.env.R43_WATCHDOG === "off") return;
  let done = false;
  const onTerm = (sig: string) => {
    if (done) return;
    done = true;
    console.log(`[watchdog] 📜 ${sig} — neema ya sekunde 30 za Koyeb: kuhifadhi runner...`);
    ev("sigterm", -1, `server imepata ${sig} — runner anahifadhiwa kama paused (auto-resume +60s)`);
    // ukomo wa usalama: kila kitu kiishie ndani ya neema (kazi isiyokamilika → sandbox ya E2B inabaki hai)
    const hard = setTimeout(() => process.exit(0), 22_000);
    hard.unref?.();
    void cooldown("📜 Server inarestart — mjadala utaendelea yenyewe", SIGTERM_RESUME_MS, true)
      .catch(() => {})
      .finally(() => {
        const soft = setTimeout(() => process.exit(0), 1_500);
        soft.unref?.();
      });
  };
  process.on("SIGTERM", () => onTerm("SIGTERM"));
  process.on("SIGINT", () => onTerm("SIGINT"));
}
