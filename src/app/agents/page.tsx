"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { AgentStage } from "@/components/agents/AgentStage";
import { BoardSteps } from "@/components/agents/BoardSteps";

export default function AgentsPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();

    window.addEventListener("scroll", on, { passive: true });

    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1320px] overflow-x-clip px-4 pb-28 pt-3 sm:px-6 sm:pt-7 lg:pb-12">
      <header className="mb-4 flex items-end justify-between gap-3 animate-[rise_0.5s_both] sm:mb-6">
        <div className="min-w-0">
          <p className="eyebrow">The board</p>

          <h1 className="mt-1 text-[25px] font-semibold tracking-[-0.03em] sm:text-[30px]">
            Meet your agents
          </h1>

          <p className="mt-1 hidden max-w-[520px] text-[13.5px] text-[var(--color-muted)] sm:block">
            Five specialists, each with their own role, skills and point of view.
            Talk to one privately, or convene all five in the Board Room.
          </p>
        </div>

        <Link
          href="/board?new=1"
          className="btn-white hidden h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold sm:flex"
        >
          Convene all five <ArrowUpRight size={15} />
        </Link>
      </header>

      <AgentStage />
      <BoardSteps />

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
