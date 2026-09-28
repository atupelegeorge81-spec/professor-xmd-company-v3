"use client";
/**
 * AgentStage — "character select" ya board (Tekken/Valorant-inspired).
 *  - Stage: portrait kubwa inayoyeyuka kwenye mwanga wa rangi ya agent.
 *  - Picker: tiles 5 chini ya stage.
 *  - Dossier: skills, bio, starters na CTA (model halisi kutoka /api/config).
 * Agent aliyechaguliwa anakaa kwenye URL hash (#ultron).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Cpu,
  MessageSquare,
  Users,
} from "lucide-react";
import { AGENTS, type Agent } from "@/lib/team";
import { useApp } from "@/components/shell/AppState";
import { FogBorder, FogRail } from "@/components/overview/Fog";
import { useLiveModels, type LiveModel } from "@/components/shell/useLiveModels";
import { ACCOUNTS } from "@/lib/usage/accounts";

export function AgentStage() {
  const { status, modelOf } = useApp();
  const live = useLiveModels();
  const [i, setI] = useState(0);
  const a = AGENTS[i];
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    const k = AGENTS.findIndex((x) => x.id === id);
    if (k >= 0) setI(k);
  }, []);

  const pick = useCallback((k: number) => {
    const n = (k + AGENTS.length) % AGENTS.length;
    setI(n);
    history.replaceState(null, "", `#${AGENTS[n].id}`);
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowRight") pick(i + 1);
      if (e.key === "ArrowLeft") pick(i - 1);
    };

    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [i, pick]);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-6">
      <div>
        <div
          className="relative isolate -mx-4 h-[468px] touch-pan-y overflow-hidden sm:mx-0 sm:h-[540px] sm:rounded-[28px] lg:h-[600px]"
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current == null) return;
            const dx =
              e.changedTouches[0].clientX - touch.current;

            if (Math.abs(dx) > 48) {
              pick(i + (dx < 0 ? 1 : -1));
            }

            touch.current = null;
          }}
        >
          <div
            key={`glow-${a.id}`}
            className="absolute inset-0 -z-20 animate-[fade_0.5s_both]"
            style={{
              background: `radial-gradient(70% 55% at 50% 38%, rgb(${a.rgb} / 0.34), transparent 70%), radial-gradient(120% 60% at 50% 110%, rgb(${a.rgb} / 0.12), transparent 60%)`,
            }}
          />

          <div className="grid-lines absolute inset-0 -z-20 opacity-50" />

          <div
            key={`img-${a.id}`}
            className="absolute inset-0 -z-10 animate-[pop_0.45s_cubic-bezier(0.2,0.8,0.2,1)_both] [mask-image:linear-gradient(180deg,transparent,#000_16%)] [-webkit-mask-image:linear-gradient(180deg,transparent,#000_16%)]"
          >
            <div className="absolute inset-0 sm:[mask-image:linear-gradient(90deg,transparent,#000_14%,#000_86%,transparent)] sm:[-webkit-mask-image:linear-gradient(90deg,transparent,#000_14%,#000_86%,transparent)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/original/agents/${a.id}.png`}
                alt={a.name}
                className="absolute left-1/2 top-0 aspect-square h-full w-auto max-w-none object-cover"
                style={{
                  transform: "translateX(-50%) scale(1.3)",
                  maskImage:
                    "radial-gradient(closest-side at 50% 47%, #000 60%, transparent 100%)",
                  WebkitMaskImage:
                    "radial-gradient(closest-side at 50% 47%, #000 60%, transparent 100%)",
                }}
              />
            </div>
          </div>

          <p
            key={`name-${a.id}`}
            aria-hidden
            className="pointer-events-none absolute left-2 top-14 rotate-180 select-none whitespace-nowrap text-[76px] font-black uppercase leading-[0.8] tracking-[-0.04em] text-transparent animate-[fade_0.6s_both] [writing-mode:vertical-rl] sm:left-4 sm:text-[112px]"
            style={{
              WebkitTextStroke: `1.3px rgb(${a.rgb} / 0.7)`,
              maskImage:
                "linear-gradient(0deg,#000 25%,transparent 92%)",
              WebkitMaskImage:
                "linear-gradient(0deg,#000 25%,transparent 92%)",
            }}
          >
            {a.name}
          </p>

          <div className="absolute inset-x-4 top-3 flex items-center justify-between sm:inset-x-5 sm:top-5">
            <span className="flex items-center gap-2">
              <span
                className="rounded-lg px-2 py-1 font-mono text-[11px] font-bold backdrop-blur-md"
                style={{
                  color: a.accent,
                  background: `rgb(${a.rgb} / 0.16)`,
                  boxShadow: `inset 0 0 0 1px rgb(${a.rgb} / 0.35)`,
                }}
              >
                {a.chip}
              </span>

              <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-1 text-[11px] capitalize text-white/80 backdrop-blur-md">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      status[a.id] === "online"
                        ? "var(--color-ok)"
                        : a.accent,
                  }}
                />
                {status[a.id]}
              </span>
            </span>

            <span className="font-mono text-[11px] text-white/50">
              <span className="text-white/90">
                {String(i + 1).padStart(2, "0")}
              </span>{" "}
              / {String(AGENTS.length).padStart(2, "0")}
            </span>
          </div>

          {[-1, 1].map((d) => (
            <button
              key={d}
              onClick={() => pick(i + d)}
              aria-label={d < 0 ? "Previous agent" : "Next agent"}
              className={`absolute top-[42%] grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-md transition hover:bg-black/55 active:scale-95 ${
                d < 0 ? "left-3 sm:left-4" : "right-3 sm:right-4"
              }`}
            >
              {d < 0 ? (
                <ChevronLeft size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          ))}

          <div
            key={`cap-${a.id}`}
            className="absolute inset-x-0 bottom-0 animate-[rise_0.45s_both] px-4 pb-5 sm:px-6 sm:pb-6"
          >
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,#07080b_18%,rgb(7_8_11/0.7)_55%,transparent)]" />

            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: a.accent }}
            >
              {a.role}
            </p>

            <h2 className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.045em] sm:text-[48px]">
              {a.name}
            </h2>

            <p className="mt-2 text-[13.5px] text-[var(--color-fg-2)]">
              {a.tagline}
            </p>

            <ModelBadge live={live?.[a.id]} fallback={modelOf(a.id)} />
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Choose agent"
          className="relative z-10 mt-3 grid grid-cols-5 gap-2 sm:gap-2.5"
        >
          {AGENTS.map((x, k) => {
            const on = k === i;

            return (
              <button
                key={x.id}
                role="tab"
                aria-selected={on}
                onClick={() => pick(k)}
                className="group flex flex-col items-center gap-1.5 outline-none"
              >
                <span
                  className="relative block aspect-square w-full overflow-hidden rounded-[16px] border transition duration-300"
                  style={{
                    borderColor: on
                      ? x.accent
                      : "rgb(255 255 255 / 0.07)",
                    boxShadow: on
                      ? `0 0 0 3px rgb(${x.rgb} / 0.18), 0 12px 28px -10px rgb(${x.rgb} / 0.8)`
                      : undefined,
                    transform: on ? "translateY(-2px)" : undefined,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={x.avatar}
                    alt=""
                    className={`h-full w-full scale-[1.35] object-cover object-[50%_30%] transition duration-300 ${
                      on
                        ? ""
                        : "opacity-55 grayscale-[0.6] group-hover:opacity-90 group-hover:grayscale-0"
                    }`}
                  />
                </span>

                <span
                  className="font-mono text-[10px] font-semibold transition-colors"
                  style={{
                    color: on ? x.accent : "var(--color-faint)",
                  }}
                >
                  {x.chip}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Dossier a={a} />
    </div>
  );
}

function Dossier({ a }: { a: Agent }) {
  

  return (
    <div
      key={a.id}
      className="mt-6 flex flex-col gap-6 animate-[rise_0.45s_both] lg:mt-0"
    >
      

      <section>
        <h3 className="eyebrow">Skills</h3>

        <FogRail
          label="Skills"
          fog={40}
          className="-mx-4 mt-3 scroll-px-4 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none] sm:[-webkit-mask-image:none]"
        >
          {a.skills.map((s) => (
            <span
              key={s}
              className="shrink-0 snap-start rounded-full border px-3 py-1.5 text-[12px]"
              style={{
                borderColor: `rgb(${a.rgb} / 0.3)`,
                background: `rgb(${a.rgb} / 0.08)`,
                color: "var(--color-fg-2)",
              }}
            >
              {s}
            </span>
          ))}
        </FogRail>
      </section>

      <section>
        <h3 className="eyebrow">Role on the board</h3>
        <p className="mt-2.5 text-[14px] leading-[1.65] text-[var(--color-fg-2)]">
          {a.bio}
        </p>
      </section>

      <section className="relative overflow-hidden rounded-[22px] p-4 sm:p-5">
        <FogBorder fade="bottom" />

        <span
          aria-hidden
          className="pointer-events-none absolute -right-14 -top-16 -z-10 h-40 w-40 rounded-full blur-[56px]"
          style={{ background: `rgb(${a.rgb} / 0.22)` }}
        />

        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <MessageSquare size={15} style={{ color: a.accent }} />
          Ask {a.name}
        </h3>

        <div className="mt-2">
          {a.starters.map((s) => (
            <Link
              key={s}
              href={`/agents/${a.id}`}
              className="group flex items-center justify-between gap-3 border-b border-white/[0.05] py-3 text-[13px] text-[var(--color-fg-2)] last:border-0 hover:text-[var(--color-fg)]"
            >
              <span>{s}</span>
              <ArrowRight
                size={14}
                className="shrink-0 text-[var(--color-faint)] transition group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Link
          href={`/agents/${a.id}`}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
          style={{
            background: `linear-gradient(180deg, rgb(${a.rgb} / 0.95), rgb(${a.rgb} / 0.72))`,
            boxShadow: `0 12px 30px -12px rgb(${a.rgb} / 0.95), inset 0 1px 0 rgb(255 255 255 / 0.25)`,
          }}
        >
          <MessageSquare size={16} /> Chat with {a.name}
        </Link>

        <Link
          href="/board?new=1"
          aria-label="Convene all five"
          className="btn-ghost flex h-12 items-center gap-2 rounded-2xl px-4 text-[13px] font-medium"
        >
          <Users size={16} />
          <span className="hidden sm:inline">Convene all</span>
        </Link>
      </div>
    </div>
  );
}


/** R15: model HALISI ambayo agent anatumia sasa (call ya mwisho, au ya kwanza itakayofuata) + akaunti yake kwa rangi ya circle. */
function ModelBadge({ live, fallback }: { live?: LiveModel; fallback: string }) {
  const acc = live ? ACCOUNTS.find((x) => x.id === live.account) : undefined;
  const model = live?.model || fallback || "—";
  return (
    <span
      title={live ? `${live.label} · ${live.source === "last-call" ? "call ya mwisho" : "call ijayo"}` : undefined}
      className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-[10.5px] text-[var(--color-muted)] backdrop-blur-md transition-colors"
    >
      <Cpu size={11} />
      <span key={model} className="truncate animate-[rise_0.35s_both]">{model}</span>
      {acc && (
        <>
          <span className="h-3 w-px bg-white/10" />
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: acc.color, boxShadow: `0 0 6px ${acc.color}` }} />
          <span className="shrink-0" style={{ color: acc.color }}>{acc.short}</span>
        </>
      )}
    </span>
  );
}
