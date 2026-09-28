"use client";
import type { EvidenceItem } from "@/lib/stage/types";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { ag } from "./kit";
import { ThinkTrace } from "./ThinkTrace";

/* Fallback — kwa kawaida evidence inaonyeshwa ndani ya ThinkingBlock ya zamu inayofuata
 * ya agent (angalia lib/board/adapter.ts). Hii ni kwa evidence isiyo na zamu inayofuata. */
export function EvidenceCard({ it }: { it: EvidenceItem }) {
  const a = ag(it.agent);
  const live = !it.trace.done;
  return (
    <article className="relative flex animate-[rise_0.45s_both] gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <AgentAvatar agent={a} size={36} status={live ? "speaking" : undefined} />
      </div>
      <div className="min-w-0 flex-1">
        <header className="mb-1 flex items-center gap-2">
          <span className="text-[14px] font-semibold">{a.name}</span>
          <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color: a.accent, background: `rgb(${a.rgb} / 0.1)` }}>{a.role}</span>
        </header>
        <ThinkTrace
          standalone
          accent={a.accent}
          turn={{ thinking: [], thinkShown: 0, phase: live ? "searching" : "done", seconds: 0, search: it.trace }}
        />
      </div>
    </article>
  );
}
