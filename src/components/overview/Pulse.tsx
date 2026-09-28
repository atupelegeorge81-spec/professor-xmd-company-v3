"use client";

import { Globe, Lock } from "lucide-react";
import { AGENTS } from "@/lib/team";
import { Sparkline } from "@/components/ui/Sparkline";
import { useApp } from "@/components/shell/AppState";
import { TokenAccounts } from "./TokenAccounts";

// R16: kadi mbili ndogo (Decisions · Sources) pembeni kwa pembeni; "Today's tokens" chini yake, upana wote.
const CARD =
  "relative isolate flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-[linear-gradient(180deg,rgb(255_255_255/0.035),rgb(255_255_255/0.01))] p-3.5";

function Glow({ rgb }: { rgb: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-10 -top-12 -z-10 h-32 w-32 rounded-full blur-[48px]"
      style={{ background: `rgb(${rgb} / 0.22)` }}
    />
  );
}

export function Pulse({ className = "" }: { className?: string }) {
  const { stats } = useApp();
  const t = stats?.totals;
  const days = stats?.days ?? [];
  const lockedToday = days.length ? days[days.length - 1].locked : 0;
  const srcOf = (engineId: string) => stats?.perAgentActivity[engineId]?.sources ?? 0;
  const srcMax = Math.max(1, ...AGENTS.map((a) => srcOf(a.engineId)));
  const n = (v: number | undefined) => (t ? (v ?? 0).toLocaleString("en-US") : "—");

  return (
    <section className={className}>
      <div className="mb-2.5 flex items-baseline justify-between xl:hidden">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Pulse</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:gap-2.5">
        <article className={CARD}>
          <Glow rgb="139 92 246" />
          <div className="flex items-center justify-between gap-1">
            <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--color-muted)]">
              <Lock size={12} className="shrink-0" />
              <span className="truncate">Decisions</span>
            </span>
            {lockedToday > 0 && (
              <span className="shrink-0 rounded-full bg-[rgb(52_211_153/0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-ok)]">+{lockedToday}</span>
            )}
          </div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.045em]">{n(t?.locked)}</p>
          <p className="mt-1 truncate text-[10.5px] text-[var(--color-faint)]">
            {t ? `${t.sessions} ${t.sessions === 1 ? "session" : "sessions"}${t.open ? ` · ${t.open} open` : ""}` : "inapakia…"}
          </p>
          <div className="mt-2 [mask-image:linear-gradient(90deg,transparent,#000_30%)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_30%)]">
            <Sparkline data={days.map((d) => d.locked)} color="#a78bfa" id="pulse-dec" height={34} />
          </div>
        </article>

        <article className={CARD}>
          <Glow rgb="61 123 255" />
          <div className="flex items-center justify-between gap-1">
            <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--color-muted)]">
              <Globe size={12} className="shrink-0" />
              <span className="truncate">Sources</span>
            </span>
            <span className="truncate text-[10px] text-[var(--color-faint)] xl:hidden">evidence</span>
          </div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.045em]">{n(t?.sources)}</p>
          <p className="mt-1 truncate text-[10.5px] text-[var(--color-faint)]">verified by the board</p>
          <div className="mt-2 flex h-[34px] items-end gap-1">
            {AGENTS.map((a) => (
              <span key={a.id} title={`${a.name}: ${srcOf(a.engineId)} sources`} className="flex flex-1 flex-col items-center">
                <span
                  className="w-full rounded-[4px]"
                  style={{
                    height: `${Math.max(3, (srcOf(a.engineId) / srcMax) * 32)}px`,
                    background: `linear-gradient(180deg, ${a.accent}, rgb(${a.rgb} / 0.15))`,
                  }}
                />
              </span>
            ))}
          </div>
        </article>

        <article className={`${CARD} col-span-2 p-4`}>
          <Glow rgb="217 70 239" />
          <TokenAccounts />
        </article>
      </div>
    </section>
  );
}
