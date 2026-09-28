"use client";

import { useEffect, useState } from "react";
import { AGENTS } from "@/lib/team";
import { AvatarStack } from "@/components/ui/AgentAvatar";
import { useApp } from "@/components/shell/AppState";
import { useToday } from "@/components/shell/useToday";
import { fullDate } from "@/lib/time";
import { Hero } from "@/components/overview/Hero";
import { Pulse } from "@/components/overview/Pulse";
import { Team } from "@/components/overview/Team";
import {
  ActivityCard,
  ReportCard,
  SessionsCard,
} from "@/components/overview/Feed";

export default function Overview() {
  const [scrolled, setScrolled] = useState(false);
  const { now, tz } = useToday();
  const { boardLive, status } = useApp();
  const busy = AGENTS.filter((a) => status[a.id] === "thinking" || status[a.id] === "speaking").length;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();

    window.addEventListener("scroll", on, { passive: true });

    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1320px] overflow-x-clip px-4 pb-28 pt-3 sm:px-6 sm:pt-6 lg:pb-10">
      <header className="mb-3 flex items-end justify-between gap-3 animate-[rise_0.5s_both] sm:mb-5">
        <div className="min-w-0">
          <p
            suppressHydrationWarning
            className="text-[12px] text-[var(--color-muted)]"
          >
            {fullDate(now, tz)}
          </p>

          <h1 className="mt-0.5 text-[25px] font-semibold tracking-[-0.03em] sm:text-[28px]">
            Karibu tena, Mkuu.
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] py-1 pl-1 pr-2.5 text-[11.5px] text-[var(--color-muted)]">
          <AvatarStack agents={AGENTS.slice(0, 3)} size={20} />
          <span className={`h-1.5 w-1.5 rounded-full shadow-[0_0_8px_var(--color-ok)] ${boardLive ? "animate-pulse bg-[#a78bfa]" : "bg-[var(--color-ok)]"}`} />
          {boardLive ? (
            <span>
              <span className="text-[var(--color-fg)]">Board</span> in session{busy ? <span className="hidden sm:inline"> · {busy} active</span> : null}
            </span>
          ) : (
            <span>
              <span className="text-[var(--color-fg)]">{AGENTS.length}</span>
              <span className="hidden sm:inline"> agents</span> ready
            </span>
          )}
        </div>
      </header>

      <div className="stagger grid grid-cols-1 gap-7 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Hero className="md:col-span-2 xl:col-span-3 xl:row-span-2" />
        <Pulse className="md:col-span-2 xl:col-span-1 xl:row-span-2" />
        <Team className="md:col-span-2" />
        <ReportCard />
        <ActivityCard />
        <SessionsCard className="md:col-span-2 xl:col-span-4" />
      </div>

      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 top-0 z-20 h-[104px] transition-opacity duration-300 lg:hidden ${
          scrolled ? "opacity-100" : "opacity-0"
        } bg-[linear-gradient(180deg,#07080b_52%,rgb(7_8_11/0.7)_74%,transparent)]`}
      />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-32 bg-[linear-gradient(0deg,#07080b_28%,rgb(7_8_11/0.85)_55%,transparent)] lg:hidden"
      />
    </div>
  );
}
