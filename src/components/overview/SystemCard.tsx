"use client";
// SystemCard — R43 (agizo la Mkuu): card ya "System" inayokaa KATIKATI ya Pulse (Decisions·Sources)
// na Today's tokens. CPU · RAM · Disk · Storage MOJA KWA MOJA (poll /api/system/stats kila sekunde 3).
// R43.1 (agizo la pili): vipengele VYENGEWE badala ya kuiga rings za API keys — kila kipimo kwa
// lugha ya kuona tofauti (utafiti wa kisasa 2026):
//   CPU   → segmented activity meter (ticks 24 zinawaka kama mzigo unapanda — mtindo wa smartwatch)
//   RAM   → LIQUID FILL: duara lenye MAJI yanayojaza + wimbi 2 (kasi 7s/11s — coprime, hazirudii
//           muundo huohuo; utafiti: animate transform si background-position, transition height
//           tu kwenye mabadiliko) — memory kama chombo kinachojaa
//   Disk  → SPEEDOMETER ya 270° yenye gradient + "comet head" (dot inayosogea kwenye arc)
//   Files → TANKI (battery/vessel) yenye ticks za kupima + asilimia ndani
// Hakuna data ya kubuni: null/"…" = bado inapakia. prefers-reduced-motion inasimamisha mawimbi.
import { useEffect, useState } from "react";
import { Activity, Cpu, Database, HardDrive, MemoryStick, type LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/ui/Sparkline";

type SysStats = {
  ts: number;
  uptimeS: number;
  cpu: { pct: number | null; quotaCpus: number | null };
  ram: { pct: number; usedBytes: number; maxBytes: number; source: string };
  disk: { pct: number; usedBytes: number; totalBytes: number };
  storage: { filesBytes: number; filesLimit: number; filesCount: number; dbBytes: number; dbLimit: number; buckets: number };
  history: { ram: number[]; cpu: number[] };
  watchdog?: { on: boolean; cooldowns: number; busy: boolean; thresholds: { cooldownAt: number; dietAt: number }; lastEvent: { at: number; kind: string; ramPct: number; note: string } | null };
};

const fmtB = (b: number): string => {
  if (!Number.isFinite(b) || b <= 0) return "0B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)}${u[i]}`;
};

const fmtUptime = (s: number): string => {
  if (!Number.isFinite(s) || s <= 0) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}saa ${m}dk` : m > 0 ? `${m}dk` : `${s}s`;
};

function useSysStats(): SysStats | null {
  const [s, setS] = useState<SysStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/system/stats", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: SysStats | null) => { if (alive && j?.ram) setS(j); })
        .catch(() => {});
    load();
    const t = setInterval(load, 3_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return s;
}

/* ================= vipengele 4 tofauti (R43.1) ================= */

const GS = 56; // akisi ya eneo la kila kipimo

/** CPU — segmented activity meter: ticks 24 kwenye duara; zinaowaka kadiri mzigo unavyopanda. */
function CpuMeter({ pct, color }: { pct: number | null; color: string }) {
  const SEGS = 24;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const lit = Math.round((p / 100) * SEGS);
  const c = GS / 2, r = 23;
  return (
    <svg width={GS} height={GS} viewBox={`0 0 ${GS} ${GS}`} className="block">
      {Array.from({ length: SEGS }, (_, i) => {
        const a = (i / SEGS) * Math.PI * 2 - Math.PI / 2 + Math.PI / SEGS;
        const x1 = c + Math.cos(a) * (r - 6.5), y1 = c + Math.sin(a) * (r - 6.5);
        const x2 = c + Math.cos(a) * r, y2 = c + Math.sin(a) * r;
        const on = i < lit;
        const head = on && i === lit - 1 && p > 2;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeLinecap="round" strokeWidth={3.6}
            stroke={on ? color : "rgb(255 255 255 / 0.09)"}
            opacity={on ? (head ? 1 : 0.92) : 0.8}
            style={{ transition: "stroke 0.5s ease, opacity 0.5s ease" }}
          />
        );
      })}
      <text x={c} y={c + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}
        fill={pct == null ? "var(--color-faint)" : color}>
        {pct == null ? "…" : Math.round(p)}
        {pct != null && <tspan fontSize={8} dy={-3}>%</tspan>}
      </text>
    </svg>
  );
}

/** RAM — LIQUID FILL: maji yanajaza duara; wimbi 2 (7s/11s, mwelekeo tofauti) — hazirudii muundo. */
function LiquidGauge({ pct, color }: { pct: number | null; color: string }) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="relative overflow-hidden rounded-full" style={{ width: GS, height: GS, background: "rgb(255 255 255 / 0.04)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.07)" }}>
      <div className="absolute inset-x-0 bottom-0" style={{ height: `${p}%`, background: `linear-gradient(180deg, ${color}45, ${color}70)`, transition: "height 0.9s cubic-bezier(.4,0,.2,1)" }}>
        <svg className="r43-wave absolute left-0 top-[-6px] h-[6px] w-[200%]" style={{ animation: "r43wave 7s linear infinite" }} viewBox="0 0 112 6" preserveAspectRatio="none" aria-hidden>
          <path d="M0 6 Q 14 0 28 6 T 56 6 T 84 6 T 112 6 L112 6 L0 6 Z" fill={color} opacity={0.95} />
        </svg>
        <svg className="r43-wave absolute left-0 top-[-5px] h-[6px] w-[200%]" style={{ animation: "r43wave2 11s linear infinite" }} viewBox="0 0 112 6" preserveAspectRatio="none" aria-hidden>
          <path d="M0 6 Q 14 2 28 6 T 56 6 T 84 6 T 112 6 L112 6 L0 6 Z" fill={color} opacity={0.45} />
        </svg>
      </div>
      <span className="absolute inset-0 grid place-items-center text-[12px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: pct == null ? "var(--color-faint)" : "var(--color-fg)" }}>
        {pct == null ? "…" : `${Math.round(p)}%`}
      </span>
    </div>
  );
}

/** Disk — speedometer ya 270°: arc yenye gradient + "comet head" (dot inayosogea na thamani). */
function SpeedGauge({ pct, from, to }: { pct: number | null; from: string; to: string }) {
  const R = 21, W = 6, cx = GS / 2, cy = GS / 2;
  const C = 2 * Math.PI * R;
  const dash = C * 0.75; // 270°
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const off = dash - (p / 100) * dash;
  const ang = ((135 + (270 * p) / 100) * Math.PI) / 180;
  const ex = cx + Math.cos(ang) * R, ey = cy + Math.sin(ang) * R;
  return (
    <svg width={GS} height={GS} viewBox={`0 0 ${GS} ${GS}`} className="block">
      <defs>
        <linearGradient id="r43-disk-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="none" strokeWidth={W} stroke="rgb(255 255 255 / 0.07)" strokeDasharray={`${dash} ${C}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={R} fill="none" strokeWidth={W} stroke="url(#r43-disk-grad)" strokeDasharray={`${dash} ${C}`} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      {p > 0.5 && (
        <circle cx={ex} cy={ey} r={3.4} fill={to} stroke="#07080b" strokeWidth={1.6} style={{ transition: "cx 0.8s ease, cy 0.8s ease" }} />
      )}
      <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}
        fill={pct == null ? "var(--color-faint)" : to}>
        {pct == null ? "…" : Math.round(p)}
        {pct != null && <tspan fontSize={8} dy={-3}>%</tspan>}
      </text>
    </svg>
  );
}

/** Files — TANKI (vessel/battery): inajaza kwenda juu + ticks za kupima + asilimia ndani. */
function TankGauge({ pct, color }: { pct: number | null; color: string }) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="relative flex items-end justify-center" style={{ width: GS, height: GS }}>
      <div className="relative overflow-hidden rounded-[7px]" style={{ width: 26, height: 46, background: "rgb(255 255 255 / 0.04)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.08)" }}>
        <div className="absolute inset-x-[2px] bottom-[2px] rounded-[5px]" style={{ height: `calc(${p}% - 3px)`, background: `linear-gradient(180deg, ${color}, ${color}77)`, transition: "height 0.8s cubic-bezier(.4,0,.2,1)" }} />
        <span className="absolute inset-x-0 top-[3px] text-center text-[9px] font-semibold tabular-nums leading-none" style={{ color: pct == null ? "var(--color-faint)" : "var(--color-fg)" }}>
          {pct == null ? "…" : p < 1 ? p.toFixed(1) : Math.round(p)}
        </span>
      </div>
      <span className="absolute right-[3px] top-[6px] flex h-[34px] flex-col justify-between" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className="h-px w-[4px] rounded bg-white/20" />)}
      </span>
    </div>
  );
}

/** seluli ya kipimo (kipimo + jina + maelezo chini) */
function Metric({ gauge, Icon, label, sub, title }: { gauge: React.ReactNode; Icon: LucideIcon; label: string; sub: string; title: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center" title={title}>
      {gauge}
      <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium leading-none text-[var(--color-faint)]">
        <Icon size={10} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-1 h-[11px] max-w-full truncate text-[9.5px] tabular-nums leading-none text-[var(--color-muted)]">{sub}</span>
    </div>
  );
}

/* ================= card ================= */

export function SystemCard() {
  const s = useSysStats();
  const ramColor = !s ? "#a78bfa" : s.ram.pct >= (s.watchdog?.thresholds.cooldownAt ?? 78) ? "#f87171" : s.ram.pct >= (s.watchdog?.thresholds.dietAt ?? 65) ? "#fbbf24" : "#a78bfa";
  const stPct = s && s.storage.filesLimit > 0 ? (s.storage.filesBytes / s.storage.filesLimit) * 100 : 0;
  const w = s?.watchdog;

  return (
    <>
      {/* keyframes za mawimbi (self-contained; reduced-motion inasimamisha) */}
      <style>{`
        @keyframes r43wave { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes r43wave2 { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @media (prefers-reduced-motion: reduce) { .r43-wave { animation: none !important; } }
      `}</style>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
          <Activity size={13} />
          System
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-white/[0.07] px-2 py-0.5 text-[10.5px] text-[var(--color-muted)]" title={s ? `CPU ${s.cpu.quotaCpus ?? "?"} vCPU · RAM ${s.ram.source} · updated ${new Date(s.ts).toLocaleTimeString("en-GB", { hour12: false })}` : "bado inapakia"}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ok)] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
          </span>
          LIVE
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-x-0.5 gap-y-3">
        <Metric
          Icon={Cpu} label="CPU"
          gauge={<CpuMeter pct={s?.cpu.pct ?? null} color="#22d3ee" />}
          sub={s ? (s.cpu.quotaCpus ? `${s.cpu.quotaCpus} vCPU` : "vCPU") : ""}
          title={s ? `CPU ya container — kikomo ${s.cpu.quotaCpus ?? "?"} vCPU (Koyeb free = 0.1) · ticks 24 zinawaka na mzigo` : "CPU — inapakia"}
        />
        <Metric
          Icon={MemoryStick} label="RAM"
          gauge={<LiquidGauge pct={s ? s.ram.pct : null} color={ramColor} />}
          sub={s ? `${fmtB(s.ram.usedBytes)} / ${fmtB(s.ram.maxBytes)}` : ""}
          title={s ? `RAM ya container (${s.ram.source}) — maji yanajaza chombo · watchdog: diet@${w?.thresholds.dietAt ?? 65}% · cooldown@${w?.thresholds.cooldownAt ?? 78}%` : "RAM — inapakia"}
        />
        <Metric
          Icon={HardDrive} label="Disk"
          gauge={<SpeedGauge pct={s ? s.disk.pct : null} from="#f59e0b" to="#f97316" />}
          sub={s ? `${fmtB(s.disk.usedBytes)} / ${fmtB(s.disk.totalBytes)}` : ""}
          title={s ? `Disk (fs ya server) — ${fmtB(s.disk.usedBytes)} / ${fmtB(s.disk.totalBytes)} · kiwango cha spidi` : "Disk — inapakia"}
        />
        <Metric
          Icon={Database} label="Files"
          gauge={<TankGauge pct={s ? stPct : null} color="#34d399" />}
          sub={s ? `${fmtB(s.storage.filesBytes)} / 1GB` : ""}
          title={s ? `Supabase storage: files ${s.storage.filesCount} kwenye buckets ${s.storage.buckets} · DB ${fmtB(s.storage.dbBytes)} / 500MB (yaonekana chini)` : "Storage — inapakia"}
        />
      </div>

      <div className="mt-3 [mask-image:linear-gradient(90deg,transparent,#000_25%)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_25%)]">
        <Sparkline data={s?.history.ram ?? []} color={ramColor} id="sys-ram" height={30} />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9.5px] leading-none text-[var(--color-faint)]">
        <span className="truncate tabular-nums">
          {s ? `RAM ${s.history.ram.length > 1 ? `${Math.min(...s.history.ram).toFixed(0)}–${Math.max(...s.history.ram).toFixed(0)}%` : "…"} · DB ${fmtB(s.storage.dbBytes)}/500MB` : "…"}
        </span>
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          {w?.busy && <span className="text-[#fbbf24]">🌡️ inapoa…</span>}
          {w && w.cooldowns > 0 && <span title={`cooldowns ${w.cooldowns} tangu server ilipowaka`}>🛡️ {w.cooldowns}</span>}
          <span>{s ? `⏱ ${fmtUptime(s.uptimeS)}` : ""}</span>
        </span>
      </div>
    </>
  );
}
