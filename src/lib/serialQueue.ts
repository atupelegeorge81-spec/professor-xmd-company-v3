// src/lib/serialQueue.ts — TASK-6: kazi za async zinatekelezwa KWA FOLENI (mpangilio wa wito).
// Inatumika na persist ya session: write ya zamani haitui juu ya ya karibuni (status "running" juu ya "completed").
// Kusubiri kazi iliyotangulia kuna kikomo `capMs` — kazi isiyorudi kamwe haizuii zinazofuata milele.

export function serialQueue(capMs: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(fn: () => Promise<T>): Promise<T> => {
    const prev = tail;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cap = new Promise<void>((r) => { timer = setTimeout(r, capMs); });
    const run = Promise.race([prev, cap]).then(() => { clearTimeout(timer); return fn(); });
    tail = run.catch(() => {});
    return run;
  };
}
