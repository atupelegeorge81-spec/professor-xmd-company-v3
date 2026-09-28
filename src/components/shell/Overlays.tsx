"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CornerDownLeft, FileText, History, Presentation, Bot, LayoutGrid, Plus, X, Copy, Trash2,
  CheckCircle2, AlertTriangle, XCircle, Zap, Globe, Cog, Info, Check,
} from "lucide-react";
import { AGENTS, getAgent, type AgentId } from "@/lib/team";
import type { LogEntry } from "@/lib/ui-types";
import { cn, compact, fmt } from "@/lib/utils";
import { AgentAvatar } from "../ui/AgentAvatar";
import { useApp } from "./AppState";
import { SidebarContent, NAV, isActive } from "./Sidebar";

/* ============================ Activity panel ============================ */
const LOG_META: Record<LogEntry["type"], { icon: React.ReactNode; color: string }> = {
  success: { icon: <CheckCircle2 size={14} />, color: "var(--color-ok)" },
  warning: { icon: <AlertTriangle size={14} />, color: "var(--color-warn)" },
  error: { icon: <XCircle size={14} />, color: "var(--color-bad)" },
  api: { icon: <Zap size={14} />, color: "#7aa2ff" },
  search: { icon: <Globe size={14} />, color: "#c084fc" },
  system: { icon: <Cog size={14} />, color: "var(--color-muted)" },
  info: { icon: <Info size={14} />, color: "var(--color-muted)" },
};

export function ActivityPanel() {
  const { activityOpen, setActivityOpen, logs, clearLogs, usage, xkiro } = useApp();
  const [tab, setTab] = useState<"log" | "usage">("log");
  const [filter, setFilter] = useState<"all" | LogEntry["type"]>("all");
  const [copied, setCopied] = useState(false);
  if (!activityOpen) return null;
  const shown = filter === "all" ? logs : logs.filter((l) => l.type === filter);
  const total = Object.values(usage).reduce((s, u) => s + u.tokens, 0);
  const max = Math.max(1, ...Object.values(usage).map((u) => u.tokens));

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={() => setActivityOpen(false)}>
      <aside onClick={(e) => e.stopPropagation()} className="surface-solid anim-slide-right m-2 flex w-full max-w-[420px] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <div className="flex-1">
            <p className="text-[14px] font-semibold">Activity</p>
            <p className="text-[11.5px] text-[var(--color-muted)]">Live orchestration log & token usage</p>
          </div>
          <button onClick={() => setActivityOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]"><X size={16} /></button>
        </div>
        <div className="flex gap-1 border-b border-[var(--color-line)] p-2">
          {(["log", "usage"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("h-8 flex-1 rounded-lg text-[12.5px] font-medium capitalize", tab === t ? "bg-white/[0.07] text-[var(--color-fg)]" : "text-[var(--color-muted)] hover:text-[var(--color-fg-2)]")}>
              {t === "log" ? `Log · ${logs.length}` : "Usage"}
            </button>
          ))}
        </div>

        {tab === "log" ? (
          <>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-2.5">
              {(["all", "api", "search", "success", "warning", "system"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={cn("h-7 shrink-0 rounded-full border px-2.5 text-[11.5px] capitalize", filter === f ? "border-white/20 bg-white/10 text-[var(--color-fg)]" : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-fg-2)]")}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {shown.length === 0 && <p className="py-16 text-center text-[12.5px] text-[var(--color-muted)]">No activity yet</p>}
              <ol className="relative space-y-0.5">
                {[...shown].reverse().map((l) => (
                  <li key={l.id} className="flex gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.025]">
                    <span className="mt-0.5" style={{ color: LOG_META[l.type].color }}>{LOG_META[l.type].icon}</span>
                    <span className="min-w-0 flex-1 text-[12.5px] leading-5 text-[var(--color-fg-2)]">{l.message}</span>
                    <span className="shrink-0 font-mono text-[10.5px] leading-5 text-[var(--color-faint)]">{l.time}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex gap-2 border-t border-[var(--color-line)] p-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(logs.map((l) => `[${l.time}] [${l.type}] ${l.message}`).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
                className="btn-ghost flex h-9 flex-1 items-center justify-center gap-2 rounded-xl text-[12.5px]"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy log"}
              </button>
              <button onClick={clearLogs} className="btn-ghost flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-[12.5px]"><Trash2 size={14} /> Clear</button>
            </div>
          </>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="surface rounded-2xl p-3.5">
                <p className="text-[11.5px] text-[var(--color-muted)]">Tokens</p>
                <p className="mt-1 text-[22px] font-semibold tracking-tight">{compact(total)}</p>
              </div>
              <div className="surface rounded-2xl p-3.5">
                <p className="text-[11.5px] text-[var(--color-muted)]">Requests</p>
                <p className="mt-1 text-[22px] font-semibold tracking-tight">{Object.values(usage).reduce((s, u) => s + u.requests, 0)}</p>
              </div>
            </div>
            <p className="px-1 text-[11px] text-[var(--color-faint)]">
              Leo · sessions zilizohifadhiwa + session hai + chats za agents.
              {xkiro?.configured ? ` XKiro quota: ${compact(xkiro.usedToday)} / ${compact(xkiro.limitPerDay)}.` : ""}
            </p>
            <div className="surface space-y-3.5 rounded-2xl p-4">
              {(Object.keys(usage) as AgentId[]).map((id) => {
                const a = getAgent(id)!;
                const u = usage[id];
                return (
                  <div key={id} className="flex items-center gap-3">
                    <AgentAvatar agent={a} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between text-[12.5px]">
                        <span className="font-medium">{a.name}</span>
                        <span className="font-mono text-[11px] text-[var(--color-muted)]">{fmt(u.tokens)} · {u.requests} req</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(u.tokens / max) * 100}%`, background: a.accent }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ============================ Mobile navigation ============================ */
export function MobileDrawer() {
  const { mobileNavOpen, setMobileNavOpen } = useApp();
  const pathname = usePathname();

  /*
   * We create one temporary history entry while the drawer
   * is open. This makes the phone Back button close the drawer
   * instead of navigating away from the current page.
   */
  const drawerHistoryActive = useRef(false);
  const previousHistoryState = useRef<unknown>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (!mobileNavOpen) return;

    previousHistoryState.current = window.history.state;

    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        __xmd_mobile_drawer: true,
      },
      "",
      window.location.href,
    );

    drawerHistoryActive.current = true;

    const handlePopState = () => {
      /*
       * Browser Back has already removed the temporary drawer
       * history entry. Close the drawer, but DO NOT navigate again.
       */
      drawerHistoryActive.current = false;
      previousHistoryState.current = null;
      setMobileNavOpen(false);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [mobileNavOpen, setMobileNavOpen]);

  /*
   * Safety net:
   * if a navigation happens while the drawer is open, close it
   * immediately so the overlay cannot remain above the new page.
   */
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;

      if (mobileNavOpen) {
        drawerHistoryActive.current = false;
        previousHistoryState.current = null;
        setMobileNavOpen(false);
      }

      return;
    }

    previousPathname.current = pathname;
  }, [pathname, mobileNavOpen, setMobileNavOpen]);

  /*
   * Explicit close:
   * remove the temporary history entry WITHOUT navigating.
   *
   * This is the important fix for menu links.
   */
  const closeDrawer = () => {
    if (
      drawerHistoryActive.current &&
      window.history.state?.__xmd_mobile_drawer
    ) {
      window.history.replaceState(
        previousHistoryState.current ?? null,
        "",
        window.location.href,
      );
    }

    drawerHistoryActive.current = false;
    previousHistoryState.current = null;
    setMobileNavOpen(false);
  };

  /*
   * Lock page scrolling while drawer is open.
   * Drawer content remains scrollable.
   */
  useEffect(() => {
    if (!mobileNavOpen) return;

    const html = document.documentElement;
    const body = document.body;

    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    const preventBackgroundTouchScroll = (event: TouchEvent) => {
      const target = event.target as HTMLElement | null;

      /*
       * Touch scrolling inside the drawer is allowed.
       */
      if (target?.closest("[data-mobile-drawer-scroll]")) {
        return;
      }

      /*
       * Touch scrolling on the backdrop/page is blocked.
       */
      event.preventDefault();
    };

    document.addEventListener(
      "touchmove",
      preventBackgroundTouchScroll,
      { passive: false },
    );

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;

      document.removeEventListener(
        "touchmove",
        preventBackgroundTouchScroll,
      );
    };
  }, [mobileNavOpen]);

  if (!mobileNavOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] overscroll-none bg-black/60 backdrop-blur-sm lg:hidden"
      onClick={closeDrawer}
      onWheel={(event) => {
        const target = event.target as HTMLElement | null;

        if (!target?.closest("[data-mobile-drawer-scroll]")) {
          event.preventDefault();
        }
      }}
    >
      <aside
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        className="surface-solid anim-slide-in-left absolute inset-y-2 left-2 flex min-h-0 w-[82%] max-w-[300px] flex-col overflow-hidden rounded-2xl"
      >
        {/* header (logo + PROFESSOR-XMD + funga) inasimama; menu inascroll chini yake */}
        <div data-mobile-drawer-scroll className="flex min-h-0 flex-1 flex-col" style={{ WebkitOverflowScrolling: "touch" }}>
          <SidebarContent
            onNavigate={closeDrawer}
            headerAction={
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close menu"
                title="Close menu"
                className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-fg)] active:bg-white/10"
              >
                <X size={16} strokeWidth={2} />
              </button>
            }
          />
        </div>
      </aside>
    </div>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  const tabs = NAV.slice(0, 4);
  if (pathname.startsWith("/agents/") || pathname.startsWith("/board")) return null;
  return (
    <nav className="glass fixed inset-x-3 bottom-3 z-40 flex h-[62px] items-stretch justify-around rounded-2xl px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_20px_50px_-10px_rgb(0_0_0/0.8)] lg:hidden">
      {tabs.map((t) => {
        const active = isActive(pathname, t.href);
        const Icon = t.icon;
        return (
          <Link key={t.href} href={t.href} className={cn("flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] font-medium", active ? "text-[var(--color-fg)]" : "text-[var(--color-faint)]")}>
            <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-white/[0.08]")}>
              <Icon size={18} strokeWidth={active ? 2.1 : 1.8} />
            </span>
            {t.label.replace(" Room", "")}
          </Link>
        );
      })}
    </nav>
  );
}
