// src/lib/cu/ui.test.ts — R31 Awamu D: reducer ya adapter kwa matukio ya XMD Computer.
// Inahakikisha: divider→kadi ya run, execs (live + replay), shots, usage tokens,
// files badge, ripoti = DOCUMENT (CuReportItem), run_end, na tokens za "computer"
// kwenye SummaryCard (mstari wake, si wa Optimus).
import { describe, expect, it } from "vitest";
import { createBoardAdapter, savedToEvents } from "@/lib/board/adapter";
import type { CuReportItem, CuRunItem, StageItem } from "@/lib/stage/types";

const run = () => {
  const a = createBoardAdapter({ instant: true, now: () => 1_700_000_000_000 });
  const cu = (ev: Record<string, unknown>) => a.apply({ type: "cu", cu: ev } as any);
  const find = <T extends StageItem>(kind: string): T | undefined =>
    a.snapshot().items.find((it: StageItem) => it.kind === kind) as T | undefined;
  return { a, cu, find, snap: () => a.snapshot() };
};

describe("R31 · adapter ya XMD Computer", () => {
  it("divider + run_start → kadi moja ya cuRun (si mbili)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "run_start", task: "Duka la Majaribio", model: "xmd-computer" });
    const it = t.find<CuRunItem>("cuRun");
    expect(it).toBeTruthy();
    expect(it!.status).toBe("run");
    expect(it!.task).toBe("Duka la Majaribio");
    expect(t.snap().items.filter((x) => x.kind === "cuRun")).toHaveLength(1);
  });

  it("exec live: exec_start → exec_output → exec_end (row moja, done, exit/ms)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "exec_start", id: "x1", step: 2, tool: "bash", kind: "run", command: "npm run dev" });
    let it = t.find<CuRunItem>("cuRun")!;
    expect(it.execs).toHaveLength(1);
    expect(it.execs[0].state).toBe("run");
    t.cu({ type: "exec_output", id: "x1", chunk: "Server up" });
    t.cu({ type: "exec_end", id: "x1", exit: 0, ms: 1500, summary: "server imewaka" });
    it = t.find<CuRunItem>("cuRun")!;
    expect(it.execs[0].state).toBe("done");
    expect(it.execs[0].exit).toBe(0);
    expect(it.execs[0].ms).toBe(1500);
    expect(it.execs[0].output).toContain("Server up");
    expect(it.step).toBe(2);
  });

  it("exec fail (exit≠0) → state fail", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "exec_start", id: "x2", step: 3, tool: "bash", kind: "run", command: "gh repo create" });
    t.cu({ type: "exec_end", id: "x2", exit: 1, ms: 300 });
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.execs[0].state).toBe("fail");
  });

  it("usage ok inahesabiwa; usage ok=false HAIHESABIWI", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "usage", lane: "gemini-1:gemini-3.8-flash", total: 24139, ok: true });
    t.cu({ type: "usage", lane: "gemini-1:gemini-3.8-flash", total: 0, ok: false });
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.tokens).toBe(24139);
    expect(it.requests).toBe(1);
  });

  it("shot (live, bila fileId) → shot_ok inaunganisha fileId", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "shot", step: 5, label: "Desktop 1280×800", has_data: true });
    t.cu({ type: "shot_ok", step: 5, label: "Desktop 1280×800", fileId: "file123", bucketId: "bkt" });
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.shots).toHaveLength(1);
    expect(it.shots[0].ok).toBe(true);
    expect(it.shots[0].fileId).toBe("file123");
  });

  it("files → tree + filesCount (Files badge ya replay)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "files", files: ["ws/index.html", "ws/css/style.css"], filesCount: 2 });
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.filesCount).toBe(2);
    expect(it.files).toContain("ws/index.html");
  });

  it("finish → CuReportItem (DOCUMENT) + run_end done", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "usage", total: 100, ok: true });
    t.cu({ type: "github", url: "https://github.com/professor-xmd-company/duka" });
    t.cu({ type: "deploy", url: "https://duka.vercel.app" });
    t.cu({ type: "finish", report: "# RIPOTI\\n\\n## Meza\\n| A | B |", partial: false, status: "done" });
    t.cu({ type: "run_end", status: "done", steps: 28, ms: 240000, tokens: 100, requests: 1 });
    const doc = t.find<CuReportItem>("cuReport");
    expect(doc).toBeTruthy();
    expect(doc!.doc).toContain("# RIPOTI");
    expect(doc!.github).toContain("duka");
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.status).toBe("done");
    expect(it.finished).toBe(true);
    expect(it.tokens).toBe(100);
  });

  it("replay: savedToEvents ya SessionItem 'cu' inarudisha matukio sahihi", () => {
    const t = run();
    const events = savedToEvents(
      [
        { kind: "cu", id: "a", cu: "divider" },
        { kind: "cu", id: "b", cu: "run_start", task: "Temeke" },
        { kind: "cu", id: "c", cu: "exec", execId: "e1", step: 4, tool: "bash", kindX: "run", command: "ls", exit: 0, ms: 40 },
        { kind: "cu", id: "d", cu: "shot", fileId: "f9", bucketId: "bkt", label: "Mobile" },
        { kind: "cu", id: "e", cu: "report", text: "Ripoti kamili" },
        { kind: "cu", id: "f", cu: "run_end", status: "done", tokens: 5, requests: 1 },
      ] as any,
      "Duka la Matunda la Temeke",
    );
    for (const ev of events) t.a.apply(ev);
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.execs[0].command).toBe("ls");
    expect(it.shots[0].fileId).toBe("f9");
    expect(it.status).toBe("done");
    const doc = t.find<CuReportItem>("cuReport");
    expect(doc?.doc).toBe("Ripoti kamili");
  });

  it("summary: tokens za 'computer' zina mstari wake (si Optimus)", () => {
    const t = run();
    t.a.apply({ type: "summary", usage: { pm: { requests: 2, tokens: 500 }, computer: { requests: 23, tokens: 590607 } } } as any);
    const s = t.snap().items.find((x) => x.kind === "summary") as any;
    const comp = s.usage.find((u: any) => u.agent === "computer");
    expect(comp).toEqual({ agent: "computer", requests: 23, tokens: 590607 });
    expect(t.snap().usage.computer).toEqual({ requests: 23, tokens: 590607 });
  });

  it("usage event ya 'computer' ina key yake (haitajiwi kuwa Optimus)", () => {
    const t = run();
    t.a.apply({ type: "usage", agentId: "computer", requests: 3, tokens: 900 } as any);
    expect(t.snap().usage.computer.tokens).toBe(900);
    expect(t.snap().usage.optimus.tokens).toBe(0);
  });
});
