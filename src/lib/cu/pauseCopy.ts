// src/lib/cu/pauseCopy.ts — R44-E: maandishi ya KWELI ya card ya pause (agizo la Mkuu):
// "mfumo haujui token per minute wala per day" — sasa anajua. Pure function (inatestiwa).
export type PauseCopy = { title: string; sub: string; t?: string };

const hhmmss = (at: number) => new Date(at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour12: false });

/**
 * resumeAt + reason (ya pause item) → title/sub ya card.
 * - reason ya sandbox → kifo/rebuild (R44-B)
 * - reason ya "tukio" → stall ya utaratibu (watchdog)
 * - residual ≤ dakika 5 → TPM/RPM (token za DAKIKA — inapoa sekunde chache)
 * - vinginevyo → quota ya siku (Pacific midnight)
 */
export function quotaPauseCopy(resumeAt: number | undefined, now: number, reason?: string): PauseCopy {
  const t = resumeAt ? hhmmss(resumeAt) : "baadaye";
  const rem = resumeAt ? resumeAt - now : 0;
  if (reason && /sandbox/i.test(reason)) {
    return {
      title: "Sandbox mpya inajengwa",
      sub: `Sandbox iliyo awali ilikufa (E2B timeout). Faili zote za agent zimerudishwa kutoka kiovu — inaendelea YENYEWE saa ${t} baada ya kusakinisha dependencies.`,
      t,
    };
  }
  if (reason && /tukio la bridge|hakuna tukio/i.test(reason)) {
    return {
      title: "Mfumo ulipumzishwa (utaratibu)",
      sub: `Hakuna shughuki iliyoonekana kwa muda — session imepumzishwa kwa usalama na workspace imehifadhiwa. Itajaribiwa tena YENYEWE saa ${t}.`,
      t,
    };
  }
  if (rem > 0 && rem <= 5 * 60_000) {
    return {
      title: "Tokens za dakika zimejaa (TPM/RPM)",
      sub: `Limits za dakika moja (si siku!) — inapoa kimya na inaendelea YENYEWE baada ya sekunde ${Math.ceil(rem / 1000)}.`,
      t,
    };
  }
  return {
    title: "Tokens za siku zimeisha (quota)",
    sub: `Session imepumzika kwa usalama — workspace imehifadhiwa. Itaendelea YENYEWE saa ${t} (limit ikirudi).`,
    t,
  };
}
