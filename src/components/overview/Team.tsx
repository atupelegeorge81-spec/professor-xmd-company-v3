"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AGENTS } from "@/lib/team";
import { useApp } from "@/components/shell/AppState";
import { FogRail } from "./Fog";

export function Team({ className = "" }: { className?: string }) {
  const { status } = useApp();

  return (
    <section
      className={`xl:rounded-[24px] xl:border xl:border-white/[0.07] xl:bg-[linear-gradient(180deg,rgb(255_255_255/0.025),rgb(255_255_255/0.008))] xl:flex xl:flex-col xl:p-5 ${className}`}
    >
      <div className="mb-2.5 flex items-end justify-between xl:mb-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
            Your board
          </h3>
          <p className="text-[11.5px] text-[var(--color-muted)]">
            Tap an agent for a private 1:1 room
          </p>
        </div>

        <Link
          href="/agents"
          className="flex items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
        >
          All <ArrowUpRight size={12} />
        </Link>
      </div>

      <FogRail
        label="Your board"
        className="-mx-4 scroll-px-4 gap-2.5 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 xl:mx-0 xl:grid xl:flex-1 xl:grid-cols-5 xl:overflow-visible xl:px-0 xl:[mask-image:none] xl:[-webkit-mask-image:none]"
      >
        {AGENTS.map((a) => {
          const st = status[a.id];

          return (
            <Link
              key={a.id}
              href={`/agents/${a.id}`}
              className="group relative isolate w-[142px] shrink-0 snap-start overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0b0c11] transition duration-300 active:scale-[0.98] sm:w-[156px] xl:h-full xl:w-auto xl:hover:-translate-y-1"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 -z-10 h-2/3"
                style={{
                  background: `radial-gradient(90% 70% at 50% 100%, rgb(${a.rgb} / 0.35), transparent 70%)`,
                }}
              />

              <div className="relative aspect-[3/4.1] xl:aspect-auto xl:h-full xl:min-h-[200px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.avatar}
                  alt={a.name}
                  className="h-full w-full scale-[1.3] object-cover xl:scale-[1.12] object-[50%_32%] transition duration-500 [mask-image:linear-gradient(180deg,#000_40%,transparent_88%)] [-webkit-mask-image:linear-gradient(180deg,#000_40%,transparent_88%)] group-hover:scale-[1.38]"
                />

                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9.5px] font-medium capitalize text-white/85 backdrop-blur-md">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background:
                        st === "online" ? "var(--color-ok)" : a.accent,
                    }}
                  />
                  {st}
                </span>

                <span
                  className="absolute right-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold backdrop-blur-md"
                  style={{ color: a.accent }}
                >
                  {a.chip}
                </span>

                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-[14px] font-semibold leading-tight tracking-[-0.01em]">
                    {a.name}
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] text-white/55">
                    {a.role}
                  </p>
                </div>
              </div>

              <span
                aria-hidden
                className="absolute inset-x-6 bottom-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${a.accent}, transparent)`,
                }}
              />
            </Link>
          );
        })}
      </FogRail>
    </section>
  );
}
