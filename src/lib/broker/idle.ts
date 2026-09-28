// src/lib/broker/idle.ts — kinga ya provider ALIYEKWAMA (R16.1).
// Tatizo lililoonekana live: wito wa agenda ulikaa dakika 4+ bila jibu (timeout ya SDK ni dakika 10) — provider
// alikuwa amekwama (foleni / `: PING` bila data). Sasa kila wito una saa mbili:
//   • data ya KWANZA (mawazo au jibu) lazima ifike ndani ya STALL_FIRST_MS (default 90s)
//   • baada ya hapo, pengo kati ya vipande lisizidi STALL_GAP_MS (default 60s)
// Ikizidi → wito unakatwa na kosa "stalled" (504) → errors.ts inaliona kama `busy` → lane inapumzika 60s na
// broker anazungusha kwenda lane nyingine kimya kimya. Kukatwa na MTUMIAJI (signal ya mwitaji) kunabaki `aborted`.
// Maandishi yaliyokwisha kufika (partial) yanabebwa ili mwitaji aendelee pale pale kwenye lane nyingine.

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
/** muda wa kusubiri kipande cha kwanza (ms) — env BROKER_STALL_FIRST_MS kwa majaribio */
export const stallFirstMs = () => num(process.env.BROKER_STALL_FIRST_MS, 90_000);
/** pengo la juu kati ya vipande (ms) — env BROKER_STALL_GAP_MS kwa majaribio */
export const stallGapMs = () => num(process.env.BROKER_STALL_GAP_MS, 60_000);

export const STALL_PREFIX = "stalled:";
export const isStall = (e: unknown) => String((e as { message?: string })?.message || "").startsWith(STALL_PREFIX);

export interface IdleGuard {
  /** pitisha kwenye create(..., { signal }) */
  readonly signal: AbortSignal;
  /** ita kila kipande kinapofika (mawazo, jibu au usage) */
  touch(): void;
  /** ita mwishoni (finally) — inaondoa timer na listener */
  stop(): void;
  readonly stalled: boolean;
  /** kosa la SDK → kosa la "stalled" (504, partial inabebwa) ikiwa saa ndiyo iliyokata; vinginevyo kosa lilelile */
  wrap<T>(err: T): T | Error;
}

export function idleGuard(parent?: AbortSignal | null, firstMs = stallFirstMs(), gapMs = stallGapMs()): IdleGuard {
  const ac = new AbortController();
  let stalled = false;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onParent = () => ac.abort((parent as AbortSignal & { reason?: unknown })?.reason);
  if (parent) {
    if (parent.aborted) ac.abort((parent as AbortSignal & { reason?: unknown }).reason);
    else parent.addEventListener("abort", onParent, { once: true });
  }
  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { stalled = true; ac.abort(); }, ms);
  };
  arm(firstMs);
  return {
    signal: ac.signal,
    touch() {
      started = true;
      if (!ac.signal.aborted) arm(gapMs);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      parent?.removeEventListener("abort", onParent);
    },
    get stalled() { return stalled; },
    wrap(err) {
      if (!stalled) return err;
      const s = Math.round((started ? gapMs : firstMs) / 1000);
      return Object.assign(new Error(`${STALL_PREFIX} provider hakutuma data kwa ${s}s${started ? " (katikati ya jibu)" : ""}`), {
        status: 504,
        partial: (err as { partial?: string })?.partial,
      });
    },
  };
}
