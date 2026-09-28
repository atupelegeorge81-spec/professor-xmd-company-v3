"use client";
import { XmdBot } from "../icons/XmdBot";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGrid, Presentation, FileText, History, Plus, Settings2, Sparkles, X } from "lucide-react";
import { AGENTS } from "@/lib/team";
import { cn, compact } from "@/lib/utils";
import { AgentAvatar } from "../ui/AgentAvatar";
import { LogoMark } from "../ui/Logo";
import { useApp } from "./AppState";
import { useApiAccounts } from "../overview/useApiAccounts";
import { ACCOUNTS } from "@/lib/usage/accounts";

export const NAV: { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; count?: "reports" | "sessions" }[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/board", label: "Board Room", icon: Presentation },
  { href: "/agents", label: "Agents", icon: XmdBot },
  { href: "/reports", label: "Reports", icon: FileText, count: "reports" },
  { href: "/sessions", label: "Sessions", icon: History, count: "sessions" },
];

/** Hali halisi ya mfumo (kutoka /api/config + /api/usage/xkiro) */
function SystemPanel({ onClose }: { onClose: () => void }) {
  const { config, xkiro } = useApp();
  const row = (k: string, v: string, ok?: boolean) => (
    <div className="flex items-center justify-between gap-3 py-1 text-[11.5px]">
      <span className="text-[var(--color-faint)]">{k}</span>
      <span className={cn("truncate font-mono text-[10.5px]", ok === false ? "text-[var(--color-warn)]" : "text-[var(--color-fg-2)]")}>{v}</span>
    </div>
  );
  return (
    <div className="surface-solid absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 rounded-2xl p-3 shadow-2xl animate-[rise_0.25s_both]">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[12.5px] font-semibold">System</p>
        <button onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-[var(--color-muted)] hover:bg-white/5" aria-label="Close"><X size={13} /></button>
      </div>
      {!config ? <p className="text-[11.5px] text-[var(--color-faint)]">Inapakia…</p> : (
        <>
          {row("Appwrite", config.appwrite ? "connected" : "haijasanidiwa", config.appwrite)}
          {row("Model", config.primaryModel || "—")}
          {row("Lanes (broker)", String(config.lanes?.length ?? 0))}
          {row("Timezone", config.timezone)}
          {row("XKiro keys", xkiro ? (xkiro.configured ? `${xkiro.accounts.filter((a) => a.ok).length}/${xkiro.accounts.length} ok` : "hakuna") : "…", xkiro ? xkiro.configured : undefined)}
          {xkiro?.configured && row("Quota leo", `${compact(xkiro.usedToday)} / ${compact(xkiro.limitPerDay)}`)}
        </>
      )}
    </div>
  );
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Header ya menu (inasimama juu) + mwili unaoscroll chini yake. Hakuna border line: maudhui yanayeyuka (fog)
 *  yanapopita chini ya header. `headerAction` = kitufe cha kufunga drawer (simu). */
export function SidebarContent({ onNavigate, headerAction }: { onNavigate?: () => void; headerAction?: React.ReactNode }) {
  const pathname = usePathname();
  const { status, boardLive, sessions, reports } = useApp();
  const [sys, setSys] = useState(false);
  // R16: bar = uwezo wa kila siku wa akaunti ZOTE 8 (XKiro 1/2 · Groq 1/2 · OpenRouter 1/2 · Uno 1/2). Kipande 1 kwa kila
  // akaunti (rangi ya pete yake), kinajaa kwa asilimia yake halisi dhidi ya kikomo cha provider wake → bar inajaa
  // mwisho pale TU akaunti zote zimeisha. Namba kubwa = tokens halisi za leo za providers wote.
  const snap = useApiAccounts();
  const accs = snap?.accounts ?? [];
  const confAccs = accs.filter((a) => a.configured);
  const used = snap?.totalToday ?? 0;
  const segPct = (a: { configured: boolean; status: string; pct: number | null }) => (!a.configured ? 0 : a.status === "exhausted" ? 100 : Math.max(0, Math.min(100, a.pct ?? 0)));
  const overall = confAccs.length ? Math.round(confAccs.reduce((n, a) => n + segPct(a), 0) / confAccs.length) : 0;
  const liveAccs = confAccs.filter((a) => a.status !== "exhausted").length;
  const counts = { reports: reports?.length, sessions: sessions?.length };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header ya menu — haiscroll */}
      <header className="relative z-10 flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-4">
        <LogoMark size={34} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13.5px] font-semibold tracking-tight text-[var(--color-fg)]">PROFESSOR-XMD</p>
          <p className="truncate text-[11px] text-[var(--color-muted)]">AI engineering company</p>
        </div>
        {headerAction}
      </header>

      {/* mwili unaoscroll — fog juu (na chini) badala ya border line */}
      <div data-sidebar-scroll className="side-fog no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
      <nav className="mt-3 space-y-0.5 px-3">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex h-9 items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium transition-colors",
                active ? "bg-white/[0.06] text-[var(--color-fg)]" : "text-[var(--color-muted)] hover:bg-white/[0.035] hover:text-[var(--color-fg-2)]",
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-prism" />}
              <Icon size={16} strokeWidth={1.8} className={active ? "text-[var(--color-fg)]" : ""} />
              <span className="flex-1">{n.label}</span>
              {n.href === "/board" && boardLive && (
                <span className="flex items-center gap-1 rounded-full bg-[rgb(52_211_153/0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-ok)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-ok)]" /> LIVE
                </span>
              )}
              {n.count && counts[n.count] ? <span className="font-mono text-[11px] text-[var(--color-faint)]">{counts[n.count]}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex items-center justify-between px-6">
        <span className="eyebrow">Team</span>
        <span className="text-[10.5px] text-[var(--color-faint)]">{boardLive ? "in session" : `${AGENTS.length} ready`}</span>
      </div>
      <div className="mt-2 space-y-0.5 px-3">
        {AGENTS.map((a) => {
          const active = pathname === `/agents/${a.id}`;
          const s = status[a.id];
          return (
            <Link
              key={a.id}
              href={`/agents/${a.id}`}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors",
                active ? "bg-white/[0.06]" : "hover:bg-white/[0.035]",
              )}
            >
              <AgentAvatar agent={a} size={26} status={s} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12.5px] font-medium text-[var(--color-fg-2)]">{a.name}</span>
                <span className="block truncate text-[10.5px] text-[var(--color-faint)]">
                  {s === "thinking" ? <span style={{ color: a.accent }}>thinking…</span> : s === "speaking" ? <span style={{ color: a.accent }}>speaking</span> : a.role}
                </span>
              </span>
              <span className="rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-semibold" style={{ color: a.accent, background: `rgb(${a.rgb} / 0.1)` }}>
                {a.chip}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto space-y-3 p-3">
        <div className="surface rounded-2xl p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--color-fg-2)]">
            <Sparkles size={13} className="text-[#a78bfa]" /> Today&apos;s usage
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-[18px] font-semibold tracking-tight">{snap ? compact(used) : "…"}</span>
            <span className="truncate text-[11px] text-[var(--color-faint)]">tokens · akaunti {confAccs.length || ACCOUNTS.length}</span>
          </div>
          <div className="mt-2 flex h-1.5 gap-[3px]" role="img" aria-label="Matumizi ya akaunti zote za API leo">
            {(accs.length ? accs : ACCOUNTS.map((a) => ({ ...a, configured: false, pct: 0, status: "idle" as const }))).map((a) => (
              <span key={a.id} title={`${a.label}: ${a.configured ? `${Math.round(segPct(a))}%` : "haijasanidiwa"}`} className="relative h-full flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${segPct(a)}%`, background: a.color }} />
              </span>
            ))}
          </div>
          <p className="mt-1.5 truncate text-[10.5px] text-[var(--color-faint)]">
            {!snap ? "Inapakia…" : `${overall}% ya uwezo wa leo · ${liveAccs}/${confAccs.length} hai`}
          </p>
        </div>
        <div className="relative flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          {sys && <SystemPanel onClose={() => setSys(false)} />}
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#2a2f3d] to-[#151821] text-[12px] font-semibold text-[var(--color-fg)] ring-1 ring-white/10">M</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[12.5px] font-medium">Mkuu</span>
            <span className="block truncate text-[10.5px] text-[var(--color-faint)]">CEO · Owner</span>
          </span>
          <button aria-label="System" onClick={() => setSys((v) => !v)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]">
            <Settings2 size={15} />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 border-r border-[var(--color-line)] bg-[var(--color-ink-1)]/60 lg:block">
      <SidebarContent />
    </aside>
  );
}

export function NewSessionButton({ compact: c }: { compact?: boolean }) {
  return (
    <Link href="/board?new=1" className={cn("btn-prism inline-flex h-9 items-center gap-1.5 rounded-xl text-[12.5px] font-semibold", c ? "w-9 justify-center" : "px-3.5")}>
      <Plus size={15} strokeWidth={2.4} />
      {!c && <span>New session</span>}
    </Link>
  );
}
