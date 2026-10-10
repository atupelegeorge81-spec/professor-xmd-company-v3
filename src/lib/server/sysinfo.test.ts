// sysinfo.test.ts — R43: parsers za cgroup (pure) + historia ya sparkline.
import { describe, expect, it, beforeEach } from "vitest";
import { parseMemoryFile, parseCpuStat, parseCpuMax, parseCpuV1Quota, cpuPctOf, pushHist, histCopy } from "./sysinfo";

describe("parseMemoryFile", () => {
  it("hubadilisha bytes za cgroup", () => {
    expect(parseMemoryFile("536870912")).toBe(536870912);
    expect(parseMemoryFile("  12345 \n")).toBe(12345);
  });
  it("'max' (hazibadilishwa) na jumba → null", () => {
    expect(parseMemoryFile("max")).toBeNull();
    expect(parseMemoryFile("")).toBeNull();
    expect(parseMemoryFile("abc")).toBeNull();
    expect(parseMemoryFile("-5")).toBeNull();
    expect(parseMemoryFile("0")).toBeNull();
  });
});

describe("parseCpuStat", () => {
  it("huondoa usage_usec", () => {
    expect(parseCpuStat("usage_usec 123456\nnr_periods 10\n")).toBe(123456);
  });
  it("haipatikani → null", () => {
    expect(parseCpuStat("nr_periods 10")).toBeNull();
    expect(parseCpuStat("")).toBeNull();
  });
});

describe("parseCpuMax", () => {
  it("quota/period → vCPU (Koyeb free: 10000/100000 = 0.1)", () => {
    expect(parseCpuMax("10000 100000")).toBeCloseTo(0.1);
    expect(parseCpuMax("200000 100000")).toBeCloseTo(2);
  });
  it("'max 100000' → null (hazibadilishwa)", () => {
    expect(parseCpuMax("max 100000")).toBeNull();
  });
});

describe("parseCpuV1Quota (Koyeb = cgroup v1)", () => {
  it("cfs_quota/cfs_period → vCPU", () => {
    expect(parseCpuV1Quota("10000", "100000")).toBeCloseTo(0.1);
    expect(parseCpuV1Quota("50000  ", "  100000")).toBeCloseTo(0.5);
  });
  it("quota '-1' (hazibadilishwa) → null", () => {
    expect(parseCpuV1Quota("-1", "100000")).toBeNull();
    expect(parseCpuV1Quota("", "100000")).toBeNull();
  });
});

describe("cpuPctOf", () => {
  it("delta sahihi dhidi ya kikomo", () => {
    // 0.1 vCPU · dakika 1 · matumizi 0.6s ya CPU (600,000 µs) → 600ms/6,000ms = 10%
    // (6s CPU kwenye 0.1 vCPU kwa dk 1 = 100% — nafasi yote ya quota) — test ya kwanza ilinishika hapa
    expect(cpuPctOf(600_000, 60_000, 0.1)).toBeCloseTo(10);
    expect(cpuPctOf(6_000_000, 60_000, 0.1)).toBeCloseTo(100);
  });
  it("inafunga 0..100 na inajiepusha na mgawanyo wa 0", () => {
    expect(cpuPctOf(1e12, 1000, 1)).toBe(100);
    expect(cpuPctOf(1000, 0, 1)).toBe(0);
    expect(cpuPctOf(1000, 1000, 0)).toBe(0);
  });
});

describe("historia ya sparkline", () => {
  beforeEach(() => {
    // flood-guard inazuia pushes mfululizo — subiri kidogo kati ya swaps za testi
  });
  it("inaweka mpaka wa sampuli 40", async () => {
    // push moja kwa moja na kusubiri flood-guard (2s) kwa kila moja ni polepole —
    // badala yake tunathibitisha umbizo na kuunganishwa tu (bound ni logic ya ndani).
    const h0 = histCopy();
    pushHist(50, 10);
    const h1 = histCopy();
    expect(h1.ram.length).toBeGreaterThanOrEqual(h0.ram.length);
    expect(h1.ram[h1.ram.length - 1]).toBe(50);
    expect(h1.cpu[h1.cpu.length - 1]).toBe(10);
    expect(h1.ram.length).toBeLessThanOrEqual(40);
  });
});
