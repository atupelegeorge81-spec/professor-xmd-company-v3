// src/lib/runnerBuffer.ts — kubana buffer ya matukio ya board BILA kupoteza historia.
// Zamani: buffer > 6000 → matukio 2000 ya MWANZO yalifutwa. Kila neno = tukio moja, hivyo session ndefu
// (agenda nyingi + ripoti) ilizidi haraka; refresh/Attach katikati ilipoteza mwanzo wa mjadala na adapter
// ilipokea "token" za ujumbe usio na msg_start.
// Sasa: "token"/"think" zinazofuatana za ujumbe mmoja zinaunganishwa kuwa tukio moja, na "usage_live"
// (hali ya muda tu) zinaondolewa — maana ya stream inabaki ileile, idadi inashuka sana.
import type { BoardEvent } from "./types";

export const BUFFER_SOFT_LIMIT = 6000;
const BUFFER_HARD_LIMIT = 20000;

type Loose = { type: string; id?: string; text?: string };

export function compactBuffer(buf: BoardEvent[]): BoardEvent[] {
  const out: BoardEvent[] = [];
  for (const e of buf) {
    const x = e as unknown as Loose;
    if (x.type === "usage_live") continue;
    const prev = out[out.length - 1] as unknown as Loose | undefined;
    if ((x.type === "token" || x.type === "think") && prev && prev.type === x.type && prev.id === x.id && typeof prev.text === "string") {
      out[out.length - 1] = { ...(prev as object), text: prev.text + (x.text || "") } as unknown as BoardEvent;
      continue;
    }
    out.push(e);
  }
  // kinga ya mwisho tu (haitarajiwi): kumbukumbu isizidi
  return out.length > BUFFER_HARD_LIMIT ? out.slice(out.length - BUFFER_HARD_LIMIT) : out;
}
