"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CheckCircle2, CircleDashed, ChevronRight, Plus, Radio, Play, Trash2, Loader2, Database } from "lucide-react";
import { toUiAgent, getAgent } from "@/lib/team";
import type { SessionMeta, SessionState } from "@/lib/ui-types";
import { DAY_GROUPS, groupOf, whenLabel, durationLabel } from "@/lib/time";
import { cn, compact } from "@/lib/utils";
import { AvatarStack } from "@/components/ui/AgentAvatar";
import { useApp } from "@/components/shell/AppState";
import { useToday } from "@/components/shell/useToday";

type Tab = "all" | SessionState;
const STATE: Record<SessionState, { label: string; c: string; bg: string; I: typeof CheckCircle2 }> = {
  complete: { label: "Complete", c: "var(--color-ok)", bg: "rgb(52 211 153 / 0.1)", I: CheckCircle2 },
  live: { label: "Live", c: "#a78bfa", bg: "rgb(167 139 250 / 0.12)", I: Radio },
  stopped: { label: "Stopped", c: "var(--color-warn)", bg: "rgb(251 191 36 / 0.1)", I: CircleDashed },
};

export default function SessionsPage() {
  const { sessions, refresh, config } = useApp();
  const { key: today, tz } = useToday();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const all = sessions ?? [];
  const list = useMemo(
    () => all.filter((s) => (tab === "all" || s.state === tab) && `${s.title} ${s.project}`.toLowerCase().includes(q.toLowerCase())),
    [all, q, tab],
  );
  const counts: Record<Tab, number> = {
    all: all.length,
    complete: all.filter((s) => s.state === "complete").length,
    live: all.filter((s) => s.state === "live").length,
    stopped: all.filter((s) => s.state === "stopped").length,
  };

  const remove = async (s: SessionMeta) => {
    if (!confirm(`Futa session "${s.title}"? Haiwezi kurudishwa.`)) return;
    setBusy(s.id);
    await fetch(`/api/conversations?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => {});
    setBusy(null);
    refresh("all");
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 pb-28 pt-5 sm:px-6 sm:pt-7 lg:pb-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-[rise_0.5s_both]">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">Sessions</h1>
          <p className="mt-1 text-[13.5px] text-[var(--color-muted)]">Kila kikao cha board kilichohifadhiwa Appwrite — fungua transcript, au endeleza kilichosimama.</p>
        </div>
        <Link href="/board?new=1" className="btn-prism flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold"><Plus size={15} /> New session</Link>
      </div>

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-line)] p-1">
          {(["all", "complete", "live", "stopped"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] capitalize", tab === t ? "bg-white/10 text-[var(--color-fg)]" : "text-[var(--color-muted)] hover:text-[var(--color-fg-2)]")}>
              {t} <span className="font-mono text-[10.5px] text-[var(--color-faint)]">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="surface flex h-10 w-full items-center gap-2 rounded-xl px-3 sm:ml-auto sm:max-w-[320px] sm:flex-1">
          <Search size={15} className="text-[var(--color-faint)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions…" className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--color-faint)]" />
        </div>
      </div>

      {sessions === null ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="surface h-[62px] animate-pulse rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-6">
          {DAY_GROUPS.map((g) => {
            const rows = list.filter((s) => groupOf(s.createdAt, today, tz) === g);
            if (!rows.length) return null;
            return (
              <section key={g} className="animate-[rise_0.5s_both]">
                <p className="eyebrow mb-2 px-1">{g}</p>
                <div className="surface divide-y divide-[var(--color-line)] overflow-hidden rounded-[20px]">
                  {rows.map((s) => {
                    const st = STATE[s.state];
                    return (
                      <div key={s.id} className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-white/[0.03] sm:gap-4">
                        <Link href={`/board?session=${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: st.bg, color: st.c }}>
                            <st.I size={16} className={cn(s.state === "live" && "animate-pulse")} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium">{s.title}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--color-faint)]">
                              <span className="max-w-[220px] truncate rounded-md bg-white/[0.05] px-1.5 py-px text-[var(--color-fg-2)]">{s.project}</span>
                              <span>{s.agendaTotal ? `agenda ${s.agendaReached}/${s.agendaTotal}` : `${s.messages} msgs`}</span>
                              <span className="hidden sm:inline">· {s.locked} locked{s.open ? ` · ${s.open} open` : ""}</span>
                              <span className="hidden sm:inline">· {compact(s.tokens)} tokens</span>
                              {s.elapsedMs > 0 && <span className="hidden md:inline">· {durationLabel(s.elapsedMs)}</span>}
                              {s.missing?.length > 0 && <span className="text-[var(--color-warn)]">· haijakamilika: {s.missing.join(", ")}</span>}
                            </span>
                          </span>
                          {s.agents.length > 0 && <span className="hidden md:block"><AvatarStack agents={s.agents.map((a) => getAgent(toUiAgent(a))!)} size={22} /></span>}
                          <span className="hidden rounded-full px-2 py-0.5 text-[10.5px] font-semibold sm:block" style={{ color: st.c }}>{st.label}</span>
                          <span className="w-16 text-right font-mono text-[11px] text-[var(--color-faint)]">{whenLabel(s.createdAt, today, tz)}</span>
                        </Link>
                        <span className="flex shrink-0 items-center gap-1">
                          {s.state === "stopped" && s.resumable && (
                            <button onClick={() => router.push(`/board?resume=${s.id}`)} title={s.missing?.length ? `Endeleza — itakamilisha: ${s.missing.join(" · ")}` : "Endeleza pale ilipoishia"} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]">
                              <Play size={14} />
                            </button>
                          )}
                          {s.state !== "live" && (
                            <button onClick={() => remove(s)} disabled={busy === s.id} title="Futa session" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-faint)] opacity-100 hover:bg-white/5 hover:text-[var(--color-bad)] sm:opacity-0 sm:group-hover:opacity-100">
                              {busy === s.id ? <Loader2 size={14} className="anim-spin" /> : <Trash2 size={14} />}
                            </button>
                          )}
                          <ChevronRight size={15} className="hidden text-[var(--color-faint)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)] sm:block" />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {list.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-[13px] text-[var(--color-muted)]">
              {config && !config.appwrite ? (
                <><Database size={20} className="text-[var(--color-faint)]" /><p>Appwrite haijasanidiwa — sessions hazihifadhiwi.</p><p className="text-[11.5px] text-[var(--color-faint)]">Weka APPWRITE_* kwenye .env kisha anzisha upya.</p></>
              ) : all.length === 0 ? (
                <><p>Bado hakuna session.</p><Link href="/board?new=1" className="text-[var(--color-fg-2)] underline underline-offset-4">Itisha board ya kwanza</Link></>
              ) : (
                <p>Hakuna session inayolingana.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
