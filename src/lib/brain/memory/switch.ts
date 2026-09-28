// src/lib/brain/memory/switch.ts — BRAIN_MEMORY=off (MPANGO §8: swichi ya kuzima memory kuokoa tokens).
// off → hakuna recall, checkpoints, reflection, consolidation, chat memory wala muhtasari wa rolling kwa LLM.
// (Rolling ya chat bado inabeba mazungumzo ya zamani kwa kubana bila LLM — hiyo si memory ya muda mrefu.)
import type { BlogFn } from "../brainLog";

let announced = false;

export function memoryOn(): boolean {
  return !/^(off|0|false|no|disabled?)$/i.test(String(process.env.BRAIN_MEMORY || "").trim());
}

/** Mstari mmoja wa log (mara moja kwa process) memory ikiwa imezimwa. */
export function memoryOffNote(blog?: BlogFn): void {
  if (announced || memoryOn()) return;
  announced = true;
  const msg = "🧠 [memory] OFF · BRAIN_MEMORY=off — recall, checkpoints, reflection, consolidation na chat memory zimezimwa";
  console.log(msg);
  if (blog) blog("info", msg);
}
