// src/lib/server/sysinfo.ts — R43: namba HALISI za mfumo kwa card ya "System" (CPU · RAM · Disk · Storage).
// Kanuni (kutoka research): cgroup v2 ndiyo ukweli wa container (Koyeb: 512MB RAM / 0.1 vCPU / 2GB SSD) —
// si os.totalmem()/os.freemem() (zinasoma VM nzima ya host). Fallback za usalama kwa local dev.
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

/* ---------- pure parsers (zinatestiwa) ---------- */

/** "536870912" → 536870912 · "max" / jumba → null */
export function parseMemoryFile(text: string): number | null {
  const n = Number(String(text).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "usage_usec 123456\n..." → 123456 (µs) · haipatikani → null */
export function parseCpuStat(text: string): number | null {
  const m = /usage_usec (\d+)/.exec(String(text));
  return m ? Number(m[1]) : null;
}

/** cpu.max: "10000 100000" → 0.1 (vCPU) · "max 100000" → null (hazibadilishwa) */
export function parseCpuMax(text: string): number | null {
  const m = /^(\d+) (\d+)$/m.exec(String(text).trim());
  return m ? Number(m[1]) / Number(m[2]) : null;
}

/** asilimia ya matumizi ya CPU kutoka delta — pure kwa ajili ya testi */
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

let cpuPrev: { usage: number; ms: number } | null = null;

/** CPU ya container: delta ya cgroup cpu.stat dhidi ya kikomo (cpu.max). Wito wa kwanza → null (bado kipimo). */
export async function readCpu(): Promise<SysSample["cpu"]> {
  const usage = parseCpuStat((await readText("/sys/fs/cgroup/cpu.stat")) ?? "");
  const quotaCpus = parseCpuMax((await readText("/sys/fs/cgroup/cpu.max")) ?? "");
  const now = Date.now();
  let pct: number | null = null;
  if (usage != null) {
    if (cpuPrev && now > cpuPrev.ms && usage >= cpuPrev.usage) {
      pct = cpuPctOf(usage - cpuPrev.usage, now - cpuPrev.ms, quotaCpus ?? os.cpus().length);
    }
    cpuPrev = { usage, ms: now };
  }
  return { pct, quotaCpus };
}

/** Disk ya container (Koyeb SSD 2GB): statfs ya root fs. */
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

/* ---------- Supabase: files + DB (cached 60s) ---------- */

const FILES_LIMIT = 1024 * 1024 * 1024; // Supabase free: 1GB storage
const DB_LIMIT = 500 * 1024 * 1024;    // Supabase free: 500MB database

let storageCache: { at: number; data: SysSample["storage"] } | null = null;

export async function readStorage(): Promise<SysSample["storage"]> {
  if (storageCache && Date.now() - storageCache.at < 60_000) return storageCache.data;
  const out: SysSample["storage"] = { filesBytes: 0, filesLimit: FILES_LIMIT, filesCount: 0, dbBytes: 0, dbLimit: DB_LIMIT, buckets: 0 };
  try {
    const { supabase } = await import("./supabase");
    const { data: objs } = await supabase.from("storage.objects").select("bucket_id,metadata->>size");
    if (Array.isArray(objs)) {
      const buckets = new Set<string>();
      for (const o of objs as any[]) {
        out.filesBytes += Number(o?.size) || 0;
        out.filesCount += 1;
        if (o?.bucket_id) buckets.add(String(o.bucket_id));
      }
      out.buckets = buckets.size;
    }
    const { data: db } = await supabase.rpc("db_size");
    if (db != null) out.dbBytes = Number(db) || 0;
  } catch { /* kimya — card ionyeshe kilichopo */ }
  storageCache = { at: Date.now(), data: out };
  return out;
}

/* ---------- historia (sparkline ya card) ---------- */

const HIST_MAX = 40;
const hist = { ram: [] as number[], cpu: [] as number[] };
let lastPush = 0;

export function pushHist(ramPct: number, cpuPct: number | null): void {
  const now = Date.now();
  if (now - lastPush < 2_000) return; // flood-guard (clients wengi wakipoll)
  lastPush = now;
  hist.ram.push(Number.isFinite(ramPct) ? Math.round(ramPct * 10) / 10 : 0);
  hist.cpu.push(cpuPct != null && Number.isFinite(cpuPct) ? Math.round(cpuPct * 10) / 10 : 0);
  if (hist.ram.length > HIST_MAX) hist.ram.splice(0, hist.ram.length - HIST_MAX);
  if (hist.cpu.length > HIST_MAX) hist.cpu.splice(0, hist.cpu.length - HIST_MAX);
}

export function histCopy(): { ram: number[]; cpu: number[] } {
  return { ram: [...hist.ram], cpu: [...hist.cpu] };
}

/* ---------- sampuli kamili (endpoint + watchdog) ---------- */

export async function sysSample(): Promise<SysSample> {
  const [ram, cpu, disk, storage] = await Promise.all([readRam(), readCpu(), readDisk(), readStorage()]);
  pushHist(ram.pct, cpu.pct);
  return { ts: Date.now(), uptimeS: Math.round(process.uptime()), cpu, ram, disk, storage, history: histCopy() };
}
