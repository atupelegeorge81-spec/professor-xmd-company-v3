"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  FileText,
  Radio,
  Zap,
} from "lucide-react";
import { AGENTS } from "@/lib/team";
import { AvatarStack } from "@/components/ui/AgentAvatar";
import { useApp } from "@/components/shell/AppState";
import { useToday } from "@/components/shell/useToday";
import { whenLabel } from "@/lib/time";
import { compact } from "@/lib/utils";
import { FogBorder, fogMask } from "./Fog";

/** vichwa vya sehemu za ripoti (## 1. Muhtasari …) */
function sectionsOf(md: string): { n: string; t: string }[] {
  return md
    .split("\n")
    .map((l) => l.match(/^##\s+(\d+)[.)]?\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ n: m[1], t: m[2].replace(/[*_`]/g, "").trim() }));
}
function firstLine(md: string): string {
  const l = md.split("\n").map((x) => x.trim()).find((x) => x && !/^(#|>|\||-{3,}|```)/.test(x)) || "";
  return l.replace(/[*_`#>]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^[-•\d.)\s]+/, "").trim();
}

const SHELL =
  "relative isolate overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgb(255_255_255/0.035),rgb(255_255_255/0)_85%)]";

export function ReportCard({ className = "" }: { className?: string }) {
  const { reports } = useApp();
  const { key: today, tz } = useToday();
  const r = reports?.[0];

  if (!r)
    return (
      <section className={`${SHELL} flex flex-col p-4 sm:p-5 ${className}`}>
        <FogBorder fade="bottom" />
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
          <FileText size={13} /> Latest report
        </span>
        {reports === null ? (
          <div className="mt-3 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
            <div className="h-[104px] animate-pulse rounded-2xl bg-white/[0.03]" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <FileText size={20} className="text-[var(--color-faint)]" />
            <p className="mt-2 text-[12.5px] text-[var(--color-muted)]">Bado hakuna ripoti.</p>
            <p className="text-[11px] text-[var(--color-faint)]">Ripoti huandikwa mwisho wa kila session.</p>
          </div>
        )}
      </section>
    );

  const secs = sectionsOf(r.content);
  const words = r.content.trim() ? r.content.trim().split(/\s+/).length : 0;

  return (
    <section className={`${SHELL} p-4 sm:p-5 ${className}`}>
      <FogBorder fade="bottom" />

      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 -z-10 h-48 w-48 rounded-full bg-[rgb(217_70_239/0.18)] blur-[60px]"
      />

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
          <FileText size={13} /> Latest report
        </span>

        <span className="max-w-[55%] truncate rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-[var(--color-fg-2)]">
          {r.project}
        </span>
      </div>

      <h3 className="mt-3 text-[17px] font-semibold leading-snug tracking-[-0.015em]">
        Ripoti: {r.title}
      </h3>

      <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-[var(--color-muted)]">
        {firstLine(r.content)}
      </p>

      <div
        className="relative mt-4 h-[104px] overflow-hidden rounded-2xl border border-white/[0.06] bg-black/25 p-3"
        style={fogMask("bottom", 45)}
      >
        {secs.slice(0, 6).map((h, i) => (
          <div
            key={`${h.n}-${i}`}
            className="flex items-center gap-2 py-[3px] text-[11.5px] text-[var(--color-fg-2)]"
          >
            <span className="w-4 font-mono text-[10px] text-[var(--color-faint)]">
              {h.n}.
            </span>

            <span className="min-w-0 flex-1 truncate">{h.t}</span>

            <span
              className="h-1 shrink-0 rounded-full bg-white/10"
              style={{ width: 18 + ((h.t.length * 7) % 28) }}
            />
          </div>
        ))}
        {secs.length === 0 && <p className="text-[11.5px] text-[var(--color-faint)]">{compact(r.content.length)} herufi</p>}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <AvatarStack agents={AGENTS} size={22} />
          <span className="text-[11px] text-[var(--color-faint)]">
            {Math.max(1, Math.round(words / 200))} min · {whenLabel(r.createdAt, today, tz)}
          </span>
        </span>

        <Link
          href={`/reports?open=${r.id}`}
          className="btn-white flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-semibold"
        >
          Read <ArrowRight size={13} />
        </Link>
      </div>
    </section>
  );
}

const DOT: Record<string, string> = {
  success: "var(--color-ok)",
  warning: "var(--color-warn)",
  search: "#c084fc",
  api: "#7aa2ff",
  system: "#7aa2ff",
};

export function ActivityCard({ className = "" }: { className?: string }) {
  const { setActivityOpen, logs, boardLive } = useApp();
  const recent = logs.slice(-5).reverse();

  return (
    <section className={`${SHELL} p-4 sm:p-5 ${className}`}>
      <FogBorder fade="bottom" />

      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-20 -z-10 h-44 w-44 rounded-full bg-[rgb(52_211_153/0.12)] blur-[60px]"
      />

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
          <Zap size={13} /> Live activity
        </span>

        <button
          onClick={() => setActivityOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${boardLive ? "animate-pulse bg-[var(--color-ok)]" : "bg-[var(--color-faint)]"}`} />
          Open
        </button>
      </div>

      <ol
        className="relative mt-3 max-h-[236px] space-y-3 overflow-hidden before:absolute before:bottom-0 before:left-[5px] before:top-1 before:w-px before:bg-[linear-gradient(180deg,var(--color-line-strong),transparent)]"
        style={fogMask("bottom", 32)}
      >
        {recent.length === 0 && (
          <li className="relative flex gap-3">
            <span className="relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-line-strong)]" />
            <span className="text-[12.5px] leading-[18px] text-[var(--color-faint)]">
              Hakuna shughuli bado. Logs za engine zinaonekana hapa board ikianza.
            </span>
          </li>
        )}
        {recent.map((l) => (
            <li key={l.id} className="relative flex gap-3">
              <span
                className="relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--color-bg)]"
                style={{
                  background: DOT[l.type] ?? "#7aa2ff",
                  boxShadow: `0 0 8px ${DOT[l.type] ?? "#7aa2ff"}`,
                }}
              />

              <span className="min-w-0">
                <span className="line-clamp-2 text-[12.5px] leading-[18px] text-[var(--color-fg-2)]">
                  {l.message}
                </span>
                <span className="font-mono text-[10px] text-[var(--color-faint)]">
                  {l.time}
                </span>
              </span>
            </li>
          ))}
      </ol>
    </section>
  );
}

export function SessionsCard({ className = "" }: { className?: string }) {
  const { sessions } = useApp();
  const { key: today, tz } = useToday();
  const list = sessions ?? [];
  return (
    <section className={`${SHELL} px-2 pb-3 pt-2 sm:px-3 ${className}`}>
      <FogBorder fade="bottom" />

      <div className="flex items-center justify-between px-2 pb-1.5 pt-2.5">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
          Recent sessions
        </h3>

        <span className="text-[11.5px] text-[var(--color-faint)]">
          {sessions === null ? "…" : `${list.length} total`}
        </span>
      </div>

      <div className="relative">
        <div
          className="grid grid-cols-1 xl:grid-cols-2 xl:gap-x-2"
          style={fogMask("bottom", 30)}
        >
          {sessions !== null && list.length === 0 && (
            <p className="px-2 py-8 text-center text-[12.5px] text-[var(--color-muted)] xl:col-span-2">
              Bado hakuna session. Eleza project yako hapo juu kuitisha board.
            </p>
          )}
          {list.slice(0, 6).map((s, i) => (
            <Link
              key={s.id}
              href={`/board?session=${s.id}`}
              className={`group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-white/[0.035] ${
                i === 5 ? "hidden xl:flex" : ""
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/[0.07] bg-white/[0.025]">
                {s.state === "complete" ? (
                  <CheckCircle2 size={17} className="text-[var(--color-ok)]" />
                ) : s.state === "live" ? (
                  <Radio size={17} className="text-[#a78bfa]" />
                ) : (
                  <CircleDashed size={17} className="text-[var(--color-warn)]" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-[var(--color-fg)]">
                  {s.title}
                </span>

                <span className="block truncate text-[11.5px] text-[var(--color-faint)]">
                  {s.agendaTotal ? `agenda ${s.agendaReached}/${s.agendaTotal}` : `${s.messages} msgs`} · {s.locked} locked · {compact(s.tokens)} tok
                </span>
              </span>

              <span className="font-mono text-[10.5px] text-[var(--color-faint)]">
                {whenLabel(s.createdAt, today, tz)}
              </span>
            </Link>
          ))}
        </div>

        <Link
          href="/sessions"
          className="absolute bottom-1 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-[rgb(12_14_19/0.8)] px-4 text-[12px] font-medium text-[var(--color-fg)] shadow-[0_10px_30px_-10px_rgb(0_0_0/0.9)] backdrop-blur-md"
        >
          All sessions <ArrowUpRight size={13} />
        </Link>
      </div>
    </section>
  );
}
