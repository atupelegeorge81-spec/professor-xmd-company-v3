"use client";
// SystemCard — R43 (agizo la Mkuu): card ya "System" inayokaa KATIKATI ya Pulse (Decisions·Sources)
// na Today's tokens. Inaonyesha CPU · RAM · Disk · Storage MOJA KWA MOJA (poll /api/system/stats
// kila sekunde 3 — tab ionekane tu). Hakuna data ya kubuni: null/"…" = bado inapakia.
// Muundo: Arc ring ZILEILE za TokenAccounts (S=56 · W=5 · dasharray transition 0.8s) — mwonekano mmoja.
// Rangi ya RAM inabadilika na watchdog: <65% violet · ≥65% amber · ≥78% nyekundu (cooldown inawaka).
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

const S = 56, W = 5, R = (S - W) / 2, C = 2 * Math.PI * R;

function Arc({ rgb, color, pct }: { rgb: string; color: string; pct: number | null }) {
  const p = pct != null && pct >= 0 ? Math.min(100, pct) : null;
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="block">
      <circle cx={S / 2} cy={S / 2} r={R} fill="none" strokeWidth={W} stroke={`rgb(${rgb} / 0.14)`} />
      {p != null && p > 0 && (
        <circle
          cx={S / 2} cy={S / 2} r={R} fill="none" strokeWidth={W} strokeLinecap="round" stroke={color}
          strokeDasharray={`${(C * Math.max(p, 1.5)) / 100} ${C}`}
          transform={`rotate(-90 ${S / 2} ${S / 2})`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      )}
    </svg>
  );
}

function Gauge({ rgb, color, Icon, label, pct, sub, title }: { rgb: string; color: string; Icon: LucideIcon; label: string; pct: number | null; sub: string; title: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center" title={title}>
      <div className="relative" style={{ width: S, height: S }}>
        <Arc rgb={rgb} color={color} pct={pct} />
        <span className="absolute inset-0 grid place-items-center text-[12px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color }}>
          {pct == null ? "…" : `${Math.round(pct)}%`}
        </span>
      </div>
      <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium leading-none text-[var(--color-faint)]">
        <Icon size={10} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-1 h-[11px] max-w-full truncate text-[9.5px] tabular-nums leading-none text-[var(--color-muted)]">{sub}</span>
    </div>
  );
}

export function SystemCard() {
  const s = useSysStats();
  const ramColor = !s ? "#a78bfa" : s.ram.pct >= (s.watchdog?.thresholds.cooldownAt ?? 78) ? "#f87171" : s.ram.pct >= (s.watchdog?.thresholds.dietAt ?? 65) ? "#fbbf24" : "#a78bfa";
  const stPct = s && s.storage.filesLimit > 0 ? (s.storage.filesBytes / s.storage.filesLimit) * 100 : 0;
  const w = s?.watchdog;

  return (
    <>
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
        <Gauge
          rgb="34 211 238" color="#22d3ee" Icon={Cpu} label="CPU"
          pct={s?.cpu.pct ?? null}
          sub={s ? (s.cpu.quotaCpus ? `${s.cpu.quotaCpus} vCPU` : "vCPU") : ""}
          title={s ? `CPU ya container — ${s.cpu.quotaCpus ?? "?"} vCPU ya kikomo (Koyeb free = 0.1)` : "CPU — inapakia"}
        />
        <Gauge
          rgb="167 139 250" color={ramColor} Icon={MemoryStick} label="RAM"
          pct={s ? s.ram.pct : null}
          sub={s ? `${fmtB(s.ram.usedBytes)} / ${fmtB(s.ram.maxBytes)}` : ""}
          title={s ? `RAM ya container (${s.ram.source}) · watchdog: diet@${w?.thresholds.dietAt ?? 65}% · cooldown@${w?.thresholds.cooldownAt ?? 78}%` : "RAM — inapakia"}
        />
        <Gauge
          rgb="245 158 11" color="#f59e0b" Icon={HardDrive} label="Disk"
          pct={s ? s.disk.pct : null}
          sub={s ? `${fmtB(s.disk.usedBytes)} / ${fmtB(s.disk.totalBytes)}` : ""}
          title={s ? `Disk ya container (SSD ya Koyeb) — ${fmtB(s.disk.usedBytes)} / ${fmtB(s.disk.totalBytes)}` : "Disk — inapakia"}
        />
        <Gauge
          rgb="52 211 153" color="#34d399" Icon={Database} label="Files"
          pct={s ? stPct : null}
          sub={s ? `${fmtB(s.storage.filesBytes)} / 1GB` : ""}
          title={s ? `Supabase storage: files ${s.storage.filesCount} kwenye buckets ${s.storage.buckets} · DB ${fmtB(s.storage.dbBytes)} / 500MB` : "Storage — inapakia"}
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
