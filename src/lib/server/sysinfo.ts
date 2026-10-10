// src/lib/server/sysinfo.ts — R43: namba HALISI za mfumo kwa card ya "System" (CPU · RAM · Disk · Storage).
// Kanuni (kutoka research): cgroup ndiyo ukweli wa container (Koyeb: 512MB RAM / 0.1 vCPU) — si
// os.totalmem()/os.freemem() (zinasoma VM ya host). cgroup v2 (Render) NA v1 (Koyeb) zinasomwa.
// MUHIMU: hali yote iko kwenye globalThis — Next inaweza kuwa na module-instance mbili (bundle ya
// instrumentation vs ya route) zisizoshiriki hali (ushahidi: usageTap inafanya kazi kwa sababu
// ina-patch globalThis.fetch). Hivyo historia/cache zinaendelea popote ilipo.
import { promises as fsp } from "node:fs";
import os from "node:os";

export type SysSample = {
  ts: number;
  uptimeS: number;
  cpu: { pct: number | null; quotaCpus: number | null };
  ram: { usedBytes: number; maxBytes: number; pct: number; source: string };
  disk: { usedBytes: number; totalBytes: number; pct: number };
  storage: { filesBytes: number; filesLimit: number; filesCount: number; dbBytes: number; dbLimit: number; buckets: number };
  history: { ram: number[]; cpu: number[] };
};

/* ---------- global state (shared kwenye module zote) ---------- */

const G: any = ((globalThis as any).__r43sys ??= {
  hist: { ram: [] as number[], cpu: [] as number[] },
  lastPush: 0,
  cpuPrev: null as { usage: number; ms: number } | null,
  storageCache: null as { at: number; data: SysSample["storage"] } | null,
});

/* ---------- pure parsers (zinatestiwa) ---------- */

/** "536870912" → 536870912 · "max"/jumba/≤0 → null */
export function parseMemoryFile(text: string): number | null {
  const n = Number(String(text).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** cgroup v2 cpu.stat: "usage_usec 123456\n..." → 123456 (µs) · haipatikani → null */
export function parseCpuStat(text: string): number | null {
  const m = /usage_usec (\d+)/.exec(String(text));
  return m ? Number(m[1]) : null;
}

/** cgroup v2 cpu.max: "10000 100000" → 0.1 (vCPU) · "max 100000" → null */
export function parseCpuMax(text: string): number | null {
  const m = /^(\d+) (\d+)$/m.exec(String(text).trim());
  return m ? Number(m[1]) / Number(m[2]) : null;
}

/** cgroup v1 quota: cfs_quota_us=10000, cfs_period_us=100000 → 0.1 · quota "-1" (max) → null */
export function parseCpuV1Quota(quotaText: string, periodText: string): number | null {
  const q = Number(String(quotaText).trim());
  const p = Number(String(periodText).trim());
  return Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0 ? q / p : null;
}

/** asilimia ya CPU kutoka delta — pure kwa ajili ya testi */
export function cpuPctOf(dUsageUsec: number, dMs: number, cpus: number): number {
  if (dMs <= 0 || cpus <= 0) return 0;
  return Math.max(0, Math.min(100, (dUsageUsec / 1000 / (dMs * cpus)) * 100));
}

/* ---------- wasomi wa cgroup ---------- */

async function readText(p: string): Promise<string | null> {
  try { return await fsp.readFile(p, "utf8"); } catch { return null; }
}

/** RAM ya container: cgroup v2 → v1 → fallback process RSS (local dev). */
export async function readRam(): Promise<SysSample["ram"]> {
  const cur = parseMemoryFile((await readText("/sys/fs/cgroup/memory.current")) ?? "");
  const max = parseMemoryFile((await readText("/sys/fs/cgroup/memory.max")) ?? "");
  if (cur != null && max != null && cur <= max) {
    return { usedBytes: cur, maxBytes: max, pct: (cur / max) * 100, source: "cgroup2" };
  }
  const v1cur = parseMemoryFile((await readText("/sys/fs/cgroup/memory/memory.usage_in_bytes")) ?? "");
  const v1max = parseMemoryFile((await readText("/sys/fs/cgroup/memory/memory.limit_in_bytes")) ?? "");
  if (v1cur != null && v1max != null && v1max < 1e12 && v1cur <= v1max) {
    return { usedBytes: v1cur, maxBytes: v1max, pct: (v1cur / v1max) * 100, source: "cgroup1" };
  }
  const mu = process.memoryUsage();
  return { usedBytes: mu.rss, maxBytes: os.totalmem(), pct: (mu.rss / os.totalmem()) * 100, source: "process-rss" };
}

/**
 * CPU ya container: delta ya matumizi dhidi ya kikomo.
 * v2 (Render): cpu.stat usage_usec + cpu.max · v1 (Koyeb): cpuacct.usage (ns) + cfs_quota/period.
 * Wito wa kwanza → pct null (bado kipimo); pili → asilimia halisi.
 */
export async function readCpu(): Promise<SysSample["cpu"]> {
  let usageUsec: number | null = null;
  let quotaCpus: number | null = null;

  const statV2 = await readText("/sys/fs/cgroup/cpu.stat");
  if (statV2 != null && parseCpuStat(statV2) != null) {
    usageUsec = parseCpuStat(statV2);
    quotaCpus = parseCpuMax((await readText("/sys/fs/cgroup/cpu.max")) ?? "");
  } else {
    // v1: cpuacct.usage ni NANOseconds → µs
    const ns = parseMemoryFile((await readText("/sys/fs/cgroup/cpu/cpuacct.usage")) ?? "");
    if (ns != null) usageUsec = ns / 1000;
    quotaCpus = parseCpuV1Quota(
      (await readText("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")) ?? "",
      (await readText("/sys/fs/cgroup/cpu/cpu.cfs_period_us")) ?? "",
    );
  }

  const now = Date.now();
  let pct: number | null = null;
  if (usageUsec != null) {
    const prev = G.cpuPrev as { usage: number; ms: number } | null;
    if (prev && now > prev.ms && usageUsec >= prev.usage) {
      pct = cpuPctOf(usageUsec - prev.usage, now - prev.ms, quotaCpus ?? os.cpus().length);
    }
    G.cpuPrev = { usage: usageUsec, ms: now };
  }
  return { pct, quotaCpus };
}

/** Disk ya container: statfs ya root fs (Koyeb inaonyesha overlay ya host — ukweli wa fs yenyewe). */
export async function readDisk(): Promise<SysSample["disk"]> {
  try {
    const st: any = await fsp.statfs("/");
    const total = Number(st.blocks) * Number(st.bsize);
    const free = Number(st.bfree) * Number(st.bsize);
    const used = Math.max(0, total - free);
    return { usedBytes: used, totalBytes: total, pct: total > 0 ? (used / total) * 100 : 0 };
  } catch {
    return { usedBytes: 0, totalBytes: 0, pct: 0 };
  }
}

/* ---------- Supabase: files + DB (cached 60s, via rpc za SECURITY DEFINER) ---------- */

const FILES_LIMIT = 1024 * 1024 * 1024; // Supabase free: 1GB storage
const DB_LIMIT = 500 * 1024 * 1024;    // Supabase free: 500MB database

export async function readStorage(): Promise<SysSample["storage"]> {
  const cached = G.storageCache as { at: number; data: SysSample["storage"] } | null;
  if (cached && Date.now() - cached.at < 60_000) return cached.data;
  const out: SysSample["storage"] = { filesBytes: 0, filesLimit: FILES_LIMIT, filesCount: 0, dbBytes: 0, dbLimit: DB_LIMIT, buckets: 0 };
  try {
    const { supabase } = await import("./supabase");
    // storage schema haielezewi kwenye REST — rpc ya SECURITY DEFINER ndiyo njia (kama db_size)
    const { data: st } = await supabase.rpc("storage_stats");
    if (st) {
      out.filesBytes = Number(st.bytes) || 0;
      out.filesCount = Number(st.count) || 0;
      out.buckets = Number(st.buckets) || 0;
    }
    const { data: db } = await supabase.rpc("db_size");
    if (db != null) out.dbBytes = Number(db) || 0;
  } catch { /* kimya — card ionyeshe kilichopo */ }
  G.storageCache = { at: Date.now(), data: out };
  return out;
}

/* ---------- historia (sparkline ya card) ---------- */

const HIST_MAX = 40;

export function pushHist(ramPct: number, cpuPct: number | null): void {
  const now = Date.now();
  if (now - G.lastPush < 2_000) return; // flood-guard (clients wengi wakipoll)
  G.lastPush = now;
  G.hist.ram.push(Number.isFinite(ramPct) ? Math.round(ramPct * 10) / 10 : 0);
  G.hist.cpu.push(cpuPct != null && Number.isFinite(cpuPct) ? Math.round(cpuPct * 10) / 10 : 0);
  if (G.hist.ram.length > HIST_MAX) G.hist.ram.splice(0, G.hist.ram.length - HIST_MAX);
  if (G.hist.cpu.length > HIST_MAX) G.hist.cpu.splice(0, G.hist.cpu.length - HIST_MAX);
}

export function histCopy(): { ram: number[]; cpu: number[] } {
  return { ram: [...G.hist.ram], cpu: [...G.hist.cpu] };
}

/* ---------- sampuli kamili (endpoint + watchdog) ---------- */

export async function sysSample(): Promise<SysSample> {
  const [ram, cpu, disk, storage] = await Promise.all([readRam(), readCpu(), readDisk(), readStorage()]);
  pushHist(ram.pct, cpu.pct);
  return { ts: Date.now(), uptimeS: Math.round(process.uptime()), cpu, ram, disk, storage, history: histCopy() };
}
