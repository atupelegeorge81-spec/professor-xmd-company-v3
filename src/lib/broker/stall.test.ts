// TASK-23 · ombi la CEO: stallFirstMs ya kila wito haibadilishi default ya 90s kwa waitaji wengine.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { __brokerTest } from "./broker";
import { REVIEW_STALL_FIRST_MS } from "../milestone/review";

/** lease bandia: create() inasubiri bila kutuma data hadi signal ikatwe (provider kimya). */
function silentLease() {
  const create = vi.fn((_body: unknown, opts: { signal: AbortSignal }) =>
    new Promise((_res, rej) => opts.signal.addEventListener("abort", () => rej(Object.assign(new Error("Request was aborted."), { name: "AbortError" })))));
  return { lease: { client: { chat: { completions: { create } } }, model: "m", maxTokens: 10, extraBody: {} } as any, create };
}

describe("broker stall window (TASK-23)", () => {
  afterEach(() => { vi.useRealTimers(); delete process.env.BROKER_STALL_FIRST_MS; });

  it("wito bila stallFirstMs (board turns, plans, mini-reports…) → bado unakatwa baada ya 90s kamili", async () => {
    vi.useFakeTimers();
    const { lease } = silentLease();
    let err: any = null; let settled = false;
    __brokerTest.collect(lease, { messages: [] }).catch((e: any) => { err = e; }).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(89_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toBe(true);
    expect(String(err?.message)).toMatch(/^stalled:/);
  });

  it("stallFirstMs ya reviewer (300s) → hai baada ya 90s, inakatwa baada ya 300s", async () => {
    vi.useFakeTimers();
    const { lease } = silentLease();
    let err: any = null; let settled = false;
    __brokerTest.collect(lease, { messages: [] }, undefined, REVIEW_STALL_FIRST_MS).catch((e: any) => { err = e; }).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(90_001);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(REVIEW_STALL_FIRST_MS - 90_001 + 1);
    expect(settled).toBe(true);
    expect(String(err?.message)).toMatch(/^stalled:/);
  });

  it("ni review.ts (+ verify.ts = REVIEW_VERIFY, task 26) PEKEE zinazopitisha stallFirstMs kwenye src/", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) { if (!/node_modules|__tests__/.test(p)) walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(f) || /\.test\.ts$/.test(f) || /library\.generated/.test(f)) continue;
        if (/stallFirstMs:\s*[A-Z0-9_]/.test(readFileSync(p, "utf8"))) hits.push(p.replace(/\\/g, "/"));
      }
    };
    walk("src");
    expect(hits.sort()).toEqual(["src/lib/milestone/review.ts", "src/lib/milestone/verify.ts"]);
  });
});
