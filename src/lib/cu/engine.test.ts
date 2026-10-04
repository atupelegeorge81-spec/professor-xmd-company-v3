// src/lib/cu/engine.test.ts — R31 Awamu B/C: shaping ya events, dedupe, missingParts, usage.
import { describe, expect, it } from "vitest";
import type { Runner } from "@/lib/boardRunner";
import { missingParts } from "@/lib/board/finale";
import { ensureCuState, handleCuEvent, readCuChip, cuChipItemOf, type CuHooks } from "./engine";
import type { SessionItem } from "@/lib/reports";
import type { BoardEvent } from "@/lib/types";

function fakeRunner(items: SessionItem[] = []): Runner {
  return {
    id: "r1", project: "Duka la Temeke", status: "running", items, buffer: [], subs: new Set(),
    startedAt: Date.now(), mode: "plan", computerPlanned: true, finale: { planId: "plan1", reportId: "rep1", memory: true },
  } as unknown as Runner;
}

function fakeHooks(runner: Runner) {
  const calls: { usage: number; chips: string[]; broadcasts: BoardEvent[]; persists: number } = { usage: 0, chips: [], broadcasts: [], persists: 0 };
  const hooks: CuHooks = {
    persist: async () => { calls.persists++; },
    bcast: (e) => calls.broadcasts.push(e),
    blog: () => {},
    addChip: (t) => calls.chips.push(t),
    recordUsage: (agentId, u) => {
      calls.usage++;
      const rec = (hooks.usage as any)[agentId] ||= { requests: 0, tokens: 0, prompt: 0, completion: 0 };
      rec.requests++;
      rec.tokens += u.total;
      rec.prompt += u.prompt;
      rec.completion += u.completion;
    },
    usage: {},
    byProvider: {},
    title: "Duka la Matunda la Temeke",
  };
  return { hooks, calls };
}

describe("R31 · missingParts — awamu ya XMD Computer", () => {
  it("session mpya (computerPlanned) bila computer → inaonekana kama sehemu inayokosekana", () => {
    const miss = missingParts({ status: "finale", items: [], agendaTotal: 5, done: [1, 2, 3, 4, 5], finale: { planId: "p", reportId: "r", memory: true }, mode: "plan", computerPlanned: true });
    expect(miss).toEqual(["Utekelezaji wa XMD Computer"]);
  });
  it("computer imekamilika → hakuna kinachokosekana", () => {
    const miss = missingParts({ status: "finale", items: [], agendaTotal: 5, done: [1, 2, 3, 4, 5], finale: { planId: "p", reportId: "r", memory: true, computer: true }, mode: "plan", computerPlanned: true });
    expect(miss).toEqual([]);
  });
  it("session ya ZAMANI (hakuna computerPlanned) → HAIHITAJIKWI (data za zamani haziguswi)", () => {
    const miss = missingParts({ status: "finale", items: [], agendaTotal: 5, done: [1, 2, 3, 4, 5], finale: { planId: "p", reportId: "r", memory: true }, mode: "plan" });
    expect(miss).toEqual([]);
  });
});

describe("R31 · handleCuEvent — shaping + dedupe + usage", () => {
  it("run_start → think → exec → items sahihi", () => {
    const runner = fakeRunner();
    const { hooks } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "Duka", model: "xmd" });
    handleCuEvent(runner, hooks, { i: 2, type: "think_start", step: 1 });
    handleCuEvent(runner, hooks, { i: 3, type: "think_delta", step: 1, text: "nafikiri " });
    handleCuEvent(runner, hooks, { i: 4, type: "think_delta", step: 1, text: "kwanza" });
    handleCuEvent(runner, hooks, { i: 5, type: "think_end", step: 1, ms: 120 });
    handleCuEvent(runner, hooks, { i: 6, type: "exec_start", step: 1, id: "t1", tool: "write_file", kind: "write", command: "Write index.html", preview: "<html>" });
    handleCuEvent(runner, hooks, { i: 7, type: "exec_output", step: 1, id: "t1", chunk: "File written (2 KB)" });
    handleCuEvent(runner, hooks, { i: 8, type: "exec_end", step: 1, id: "t1", exit: 0, ms: 40, chars: 20, summary: "ok" });

    const kinds = (runner.items as any[]).map((it) => it.cu);
    expect(kinds).toEqual(["run_start", "think", "exec"]);
    const think = runner.items.find((it: any) => it.cu === "think") as any;
    expect(think.text).toBe("nafikiri kwanza");
    const exec = runner.items.find((it: any) => it.cu === "exec") as any;
    expect(exec.output).toBe("File written (2 KB)");
    expect(exec.tool).toBe("write_file");
  });

  it("dedupe: tukio lilelile (type:i) halirudiwi — replay haijipandi", () => {
    const runner = fakeRunner();
    const { hooks } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x" });
    handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x" });
    expect(runner.items.filter((it: any) => it.cu === "run_start")).toHaveLength(1);
  });

  it("seen inaanza na items zilizohifadhiwa (i zipo) — resume replay haizirudii", () => {
    const runner = fakeRunner([{ kind: "cu", id: "a", i: 1, cu: "run_start" } as any]);
    const cu = ensureCuState(runner);
    expect(cu.seen.has("run_start:1")).toBe(true);
    const { hooks } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x" });
    expect(runner.items.filter((it: any) => it.cu === "run_start")).toHaveLength(1);
  });

  it("usage → recordUsage('computer') + item + meters-ready", () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 2, type: "usage", provider: "gemini", account: "gemini-1", model: "gemini-3.8-flash", lane: "gemini-1:gemini-3.8-flash", prompt: 100, completion: 50, total: 150, ok: true });
    expect(calls.usage).toBe(1);
    expect((hooks.usage as any).computer.tokens).toBe(150);
    expect(runner.items.some((it: any) => it.cu === "usage")).toBe(true);
  });

  it("finish (ripoti) + run_end ok → finale.computer + chip ya CU state", () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 2, type: "github", url: "https://github.com/professor-xmd-company/duka-temeke-6ac26d65" });
    handleCuEvent(runner, hooks, { i: 3, type: "deploy", url: "https://duka-temeke-6ac26d65.vercel.app" });
    handleCuEvent(runner, hooks, { i: 4, type: "finish", report: "# Ripoti\n\n🌐 https://x.vercel.app", partial: false, status: "done" });
    handleCuEvent(runner, hooks, { i: 5, type: "run_end", status: "done", steps: 12, ms: 900_000 });
    expect(runner.finale?.computer).toBe(true);
    expect(runner.cu?.done).toBe(true);
    expect(runner.cu?.links.repo).toContain("github.com");
    expect(runner.cu?.links.live).toContain("vercel.app");
    const chip = readCuChip(runner.items);
    expect(chip?.done).toBe(true);
    expect(chip?.live).toContain("vercel.app");
    expect(calls.chips.length).toBeGreaterThan(0);
  });

  it("run_end bila ripoti → HAIKAMILIKA (Endeleza inabaki) — si completed ya uongo", () => {
    const runner = fakeRunner();
    const { hooks } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 2, type: "run_end", status: "error", steps: 3, ms: 1000, fatal: "bridge exit 1" });
    expect(runner.finale?.computer).toBeUndefined();
    expect(runner.cu?.done).toBe(false);
    const miss = missingParts({ status: "finale", items: [], agendaTotal: 5, done: [1, 2, 3, 4, 5], finale: runner.finale, mode: "plan", computerPlanned: true });
    expect(miss).toContain("Utekelezaji wa XMD Computer");
  });

  it("shot broadcast haina base64 (bandwidth) — data inakwenda bucket pekee", () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 2, type: "shot", step: 1, data: "QUJD".repeat(1000), label: "Desktop 1280×800" });
    const shotBcast = calls.broadcasts.find((e: any) => e.type === "cu" && e.cu?.type === "shot") as any;
    expect(shotBcast.cu.data).toBeUndefined();
  });
});
