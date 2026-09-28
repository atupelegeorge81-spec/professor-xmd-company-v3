"use client";
import { Code2, Compass, Landmark, ListChecks, Sparkles } from "lucide-react";
import { AGENTS } from "@/lib/team";
import type { AgendaBuildItem, AgendaStartItem, ConveneItem, ScopeItem } from "@/lib/stage/types";
import { cn } from "@/lib/utils";
import { AgentAvatar, AvatarStack } from "../../ui/AgentAvatar";
import { Card, Lane, Tag, ag } from "./kit";

/* ============================================================== convene
 * engine: chip "🏛️ Board Room — project" (resume "♻️ …imeendelea" / reattach) · "💾 Conversation imeundwa" · title_done */
export function ConveneCard({ it }: { it: ConveneItem }) {
  const typing = it.titleShown < it.title.length;
  const label = it.mode === "resume" ? "Board Room · kikao kimeendelea" : it.mode === "reattach" ? "Board Room · umerejea" : "Board Room · kikao kipya";
  return (
    <Lane>
      <Card
        tone="blue"
        icon={<Landmark size={15} />}
        eyebrow={label}
        right={it.sessionId && <Tag tone="muted" mono>#{it.sessionId}</Tag>}
        title={
          it.titleShown === 0 ? (
            <span className="shimmer-text">Optimus anakipa kikao jina…</span>
          ) : (
            <span className={cn(typing && "caret")}>{it.title.slice(0, it.titleShown)}</span>
          )
        }
        footer={
          <>
            <AvatarStack agents={AGENTS} size={20} />
            <span>Agents {AGENTS.length} wamekaa mezani</span>
            <span className="ml-auto text-[var(--color-faint)]">Conversation imeundwa</span>
          </>
        }
      >
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-[var(--color-fg-2)]">{it.project}</p>
      </Card>
    </Lane>
  );
}

/* ============================================================== scope
 * engine: chip "🧭 Optimus ameelewa: …" */
export function ScopeCard({ it }: { it: ScopeItem }) {
  const o = ag("optimus");
  const typing = it.shown < it.text.length;
  return (
    <Lane>
      <Card tone="blue" icon={<Compass size={15} />} eyebrow="Optimus ameelewa" right={<AgentAvatar agent={o} size={18} ring={false} />}>
        <p className={cn("mt-1 text-[13.5px] leading-6 text-[var(--color-fg)]", typing && "caret")}>{it.text.slice(0, it.shown)}</p>
      </Card>
    </Lane>
  );
}

/* ============================================================== agenda build
 * engine: chip "📋 Agenda (N vipengele): a · b" (owners 2–3, requiresCode) */
export function AgendaBuildCard({ it }: { it: AgendaBuildItem }) {
  return (
    <Lane>
      <Card tone="violet" icon={<ListChecks size={15} />} eyebrow={`Agenda · vipengele ${it.items.length}`} right={it.shown < it.items.length && <Tag tone="violet">inaundwa…</Tag>}>
        <ol className="mt-2 space-y-1.5">
          {it.items.map((a, i) => {
            const on = i < it.shown;
            return on ? (
              <li key={a.index} className="flex items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-white/[0.02] px-2.5 py-2 animate-[rise_0.35s_both]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[rgb(167_139_250/0.12)] font-mono text-[11px] font-semibold text-[#c4b5fd]">{a.index}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-fg)]">{a.title}</span>
                {a.requiresCode && <Tag tone="sky"><Code2 size={10} /> code</Tag>}
                <AvatarStack agents={a.owners.map((o) => ag(o))} size={18} />
              </li>
            ) : (
              <li key={a.index} className="st-skel h-[40px] rounded-xl" />
            );
          })}
        </ol>
      </Card>
    </Lane>
  );
}

/* ============================================================== agenda divider
 * engine: bcast({type:"round"}) + chip "Agenda i/N: item — owners: A + B" (mtindo wa RoundDivider ya v2) */
export function AgendaStartMark({ it }: { it: AgendaStartItem }) {
  const a = it.agenda;
  return (
    <div id={`agenda-${a.index}`} className="scroll-mt-16 animate-[rise_0.5s_both] pt-3">
      <div className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--color-line-strong)]" />
        <span className="flex max-w-[82%] items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-ink-2)] py-1 pl-1 pr-2 text-[11.5px]">
          <span className="rounded-full bg-white/[0.07] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--color-fg)]">A{a.index}/{it.total}</span>
          <span className="truncate text-[var(--color-fg-2)]">{a.title}</span>
          <AvatarStack agents={a.owners.map((o) => ag(o))} size={18} />
          {a.requiresCode && <Code2 size={12} className="text-[#7dd3fc]" />}
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--color-line-strong)]" />
      </div>
    </div>
  );
}

export function FinaleMark() {
  return (
    <div id="finale" className="scroll-mt-16 animate-[rise_0.5s_both] pt-3">
      <div className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--color-line-strong)]" />
        <span className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-ink-2)] py-1 pl-1 pr-3 text-[11.5px]">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-prism text-white"><Sparkles size={11} /></span>
          <span className="text-[var(--color-fg-2)]">Finale · validator, script, ripoti</span>
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--color-line-strong)]" />
      </div>
    </div>
  );
}
