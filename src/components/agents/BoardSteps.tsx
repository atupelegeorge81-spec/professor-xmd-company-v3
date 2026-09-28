"use client";

import Link from "next/link";
import { ArrowUpRight, Lock, Search, Swords } from "lucide-react";
import { getAgent, type AgentId } from "@/lib/team";
import { AvatarStack } from "@/components/ui/AgentAvatar";

const STEPS: {
  icon: typeof Search;
  title: string;
  text: string;
  rgb: string;
  who: AgentId[];
  tag: string;
}[] = [
  {
    icon: Search,
    title: "Evidence gate",
    text: "Before an owner answers, the orchestrator checks the web. Claims without sources don't pass.",
    rgb: "61 123 255",
    who: ["ultron", "vextron", "megatron", "cybertron"],
    tag: "Search first",
  },
  {
    icon: Swords,
    title: "Real debate",
    text: "Owners challenge each other. Optimus chairs for consensus — never forces a winner.",
    rgb: "168 85 247",
    who: ["optimus", "ultron", "vextron", "megatron", "cybertron"],
    tag: "Owners discuss",
  },
  {
    icon: Lock,
    title: "Lock & report",
    text: "Only explicit owner consensus locks a decision. Optimus files a structured Swahili report.",
    rgb: "52 211 153",
    who: ["optimus"],
    tag: "Consensus",
  },
];

export function BoardSteps() {
  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">How the board works</p>
          <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
            From idea to locked decision
          </h2>
        </div>

        <Link
          href="/reports"
          className="hidden items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-fg)] sm:flex"
        >
          Reports <ArrowUpRight size={13} />
        </Link>
      </div>

      <ol className="relative mt-6 grid gap-0 md:grid-cols-3 md:gap-4">
        <span
          aria-hidden
          className="absolute left-[16.6%] right-[16.6%] top-[22px] hidden h-px md:block"
          style={{
            background:
              "linear-gradient(90deg, rgb(61 123 255 / 0.6), rgb(168 85 247 / 0.6), rgb(52 211 153 / 0.6))",
          }}
        />

        {STEPS.map((s, k) => (
          <li
            key={s.title}
            className="relative flex gap-4 pb-8 last:pb-0 md:flex-col md:items-center md:gap-0 md:pb-0 md:text-center"
          >
            {k < STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute bottom-0 left-[21px] top-[46px] w-px md:hidden"
                style={{
                  background: `linear-gradient(180deg, rgb(${s.rgb} / 0.7), rgb(${STEPS[k + 1].rgb} / 0.15))`,
                }}
              />
            )}

            <span
              className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-[#0b0c11]"
              style={{
                borderColor: `rgb(${s.rgb} / 0.45)`,
                color: `rgb(${s.rgb})`,
                boxShadow: `0 0 0 4px #07080b, 0 10px 30px -8px rgb(${s.rgb} / 0.7)`,
              }}
            >
              <s.icon size={18} />
            </span>

            <div className="min-w-0 flex-1 md:mt-4">
              <div className="flex items-center gap-2 md:justify-center">
                <span className="font-mono text-[10.5px] text-[var(--color-faint)]">
                  0{k + 1}
                </span>

                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: `rgb(${s.rgb} / 0.12)`,
                    color: `rgb(${s.rgb})`,
                  }}
                >
                  {s.tag}
                </span>
              </div>

              <h3 className="mt-1.5 text-[15.5px] font-semibold tracking-[-0.01em]">
                {s.title}
              </h3>

              <p className="mt-1 text-[13px] leading-[1.6] text-[var(--color-muted)] md:mx-auto md:max-w-[290px]">
                {s.text}
              </p>

              <div className="mt-3 flex md:justify-center">
                <AvatarStack
                  agents={s.who.map((id) => getAgent(id)!)}
                  size={22}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      
    </section>
  );
}
