// src/lib/cu/ui.test.ts — R31 UI ya XMD Computer: TIMELINE (kama xmd3 — agizo la CEO 05-10).
// Inahakikisha: divider→card ya HALI tu (si tank), think/text/exec/shot/github/deploy
// kila MOJA ni StageItem yake kwenye mkondo, draft inamiminika kwenye exec card,
// maneno ya agent ni cuText (hakuna kufungwa ndani ya card), usage tokens,
// Files badge, ripoti = DOCUMENT (CuReportItem), run_end, na tokens za "computer".
import { describe, expect, it } from "vitest";
import { createBoardAdapter, savedToEvents } from "@/lib/board/adapter";
import type {
  CuErrorItem, CuExecItem, CuLinkItem, CuReportItem, CuRunItem, CuShotItem, CuTextItem, CuThinkItem, StageItem,
} from "@/lib/stage/types";

const run = () => {
  const a = createBoardAdapter({ instant: true, now: () => 1_700_000_000_000 });
  const cu = (ev: Record<string, unknown>) => a.apply({ type: "cu", cu: ev } as any);
  const all = <T extends StageItem>(kind: string): T[] => a.snapshot().items.filter((it: StageItem) => it.kind === kind) as T[];
  const find = <T extends StageItem>(kind: string): T | undefined => all<T>(kind)[0];
  return { a, cu, find, all, snap: () => a.snapshot() };
};

describe("R31 · adapter ya XMD Computer (timeline)", () => {
  it("divider + run_start → card MOJA ya hali (cuRun) — si mbili", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "run_start", task: "Duka la Majaribio", model: "xmd-computer" });
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it).toBeTruthy();
    expect(it.status).toBe("run");
    expect(it.task).toBe("Duka la Majaribio");
    expect(t.all("cuRun")).toHaveLength(1);
  });

  it("exec live: tool_draft (code inamiminika) → exec_start → exec_output → exec_end — item MOJA ya cuExec", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "tool_draft", id: "toolu_1", step: 2, name: "bash", preview: "npm run" });
    let ex = t.find<CuExecItem>("cuExec")!;
    expect(ex.state).toBe("run");
    expect(ex.draft).toBe("npm run");
    t.cu({ type: "exec_start", id: "toolu_1", step: 2, tool: "bash", kind: "run", command: "npm run dev" });
    t.cu({ type: "exec_output", id: "toolu_1", chunk: "Server up" });
    t.cu({ type: "exec_end", id: "toolu_1", exit: 0, ms: 1500, summary: "server imewaka" });
    const items = t.all<CuExecItem>("cuExec");
    expect(items).toHaveLength(1); // haikuduplikika — draft na start ni item MOJA
    ex = items[0];
    expect(ex.command).toBe("npm run dev");
    expect(ex.state).toBe("done");
    expect(ex.exit).toBe(0);
    expect(ex.ms).toBe(1500);
    expect(ex.output).toContain("Server up");
    expect(t.find<CuRunItem>("cuRun")!.step).toBe(2);
  });

  it("exec fail (exit≠0) → state fail", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "exec_start", id: "x2", step: 3, tool: "bash", kind: "run", command: "gh repo create" });
    t.cu({ type: "exec_end", id: "x2", exit: 1, ms: 300 });
    expect(t.find<CuExecItem>("cuExec")!.state).toBe("fail");
  });

  it("think live: think_delta (streaming) → think_end inafunga card ya thinking", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "think_delta", step: 1, text: "Napanga " });
    t.cu({ type: "think_delta", step: 1, text: "mpango…" });
    let th = t.find<CuThinkItem>("cuThink")!;
    expect(th.partial).toBe(true);
    expect(th.text).toContain("Napanga");
    t.cu({ type: "think_end", step: 1, ms: 2400 });
    th = t.find<CuThinkItem>("cuThink")!;
    expect(th.partial).toBe(false);
    expect(th.ms).toBe(2400);
    expect(t.all("cuThink")).toHaveLength(1);
  });

  it("text live: text_delta → text_end — maneno ya agent kama cuText (mkondoni, si card ya run)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "text_delta", step: 3, text: "Nimeanza " });
    t.cu({ type: "text_delta", step: 3, text: "kujenga ukurasa." });
    let tx = t.find<CuTextItem>("cuText")!;
    expect(tx.partial).toBe(true);
    expect(tx.text).toBe("Nimeanza kujenga ukurasa.");
    t.cu({ type: "text_end", step: 3 });
    tx = t.find<CuTextItem>("cuText")!;
    expect(tx.partial).toBe(false);
    // hakuna kufungwa ndani ya cuRun — ni item yake yenyewe kwenye mkondo
    expect(t.all("cuText")).toHaveLength(1);
  });


  it("exec edit: old_str/new_str zinapita (DiffCard ina before/after)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "exec_start", id: "e9", step: 6, tool: "edit_file", kind: "edit", command: "index.html", path: "index.html", old_str: "<h1>Mambo</h1>", new_str: "<h1>Duka la Majaribio</h1>" });
    t.cu({ type: "exec_end", id: "e9", exit: 0, ms: 90 });
    const ex = t.find<CuExecItem>("cuExec")!;
    expect(ex.oldStr).toBe("<h1>Mambo</h1>");
    expect(ex.newStr).toBe("<h1>Duka la Majaribio</h1>");
    expect(ex.tool).toBe("edit_file");
  });

    it("usage ok inahesabiwa kwenye card ya hali; usage ok=false HAIHESABIWI", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "usage", lane: "gemini-1:gemini-3.8-flash", total: 24139, ok: true });
    t.cu({ type: "usage", lane: "gemini-1:gemini-3.8-flash", total: 0, ok: false });
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.tokens).toBe(24139);
    expect(it.requests).toBe(1);
  });

  it("shot (live, bila fileId → scan) → shot_ok inaunganisha fileId (cuShot item)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "shot", step: 5, label: "Desktop 1280×800", has_data: true });
    let sh = t.find<CuShotItem>("cuShot")!;
    expect(sh.ok).toBe(false);
    t.cu({ type: "shot_ok", step: 5, label: "Desktop 1280×800", fileId: "file123", bucketId: "bkt" });
    sh = t.find<CuShotItem>("cuShot")!;
    expect(t.all("cuShot")).toHaveLength(1);
    expect(sh.ok).toBe(true);
    expect(sh.fileId).toBe("file123");
    expect(t.find<CuRunItem>("cuRun")!.screenshots).toBe(1);
  });

  it("files → tree + filesCount (Files badge ya replay)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "files", files: ["ws/index.html", "ws/css/style.css"], filesCount: 2 });
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.filesCount).toBe(2);
    expect(it.files).toContain("ws/index.html");
  });

  it("github/deploy → cards zao za cuLink kwenye mkondo + card ya hali ina links", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "github", url: "https://github.com/professor-xmd-company/duka", step: 8 });
    t.cu({ type: "deploy", url: "https://duka.vercel.app", step: 12 });
    const links = t.all<CuLinkItem>("cuLink");
    expect(links).toHaveLength(2);
    expect(links[0].link).toBe("github");
    expect(links[1].link).toBe("deploy");
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.github).toContain("duka");
    expect(it.deploy).toContain("vercel.app");
  });

  it("error → cuError item (si notice ya run pekee)", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "error", message: "API Error: 529" });
    const err = t.find<CuErrorItem>("cuError");
    expect(err).toBeTruthy();
    expect(err!.message).toContain("529");
  });

  it("finish → CuReportItem (DOCUMENT) + run_end done", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "usage", total: 100, ok: true });
    t.cu({ type: "github", url: "https://github.com/professor-xmd-company/duka" });
    t.cu({ type: "deploy", url: "https://duka.vercel.app" });
    t.cu({ type: "finish", report: "# RIPOTI\n\n## Meza\n| A | B |", partial: false, status: "done" });
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

  it("replay: savedToEvents ya SessionItem 'cu' inarudisha timeline sahihi", () => {
    const t = run();
    const events = savedToEvents(
      [
        { kind: "cu", id: "a", cu: "divider" },
        { kind: "cu", id: "b", cu: "run_start", task: "Temeke" },
        { kind: "cu", id: "c", cu: "think", step: 1, text: "napanga", ms: 900 },
        { kind: "cu", id: "d", cu: "text", step: 1, text: "Nimeanza kazi." },
        { kind: "cu", id: "e", cu: "exec", execId: "e1", step: 4, tool: "bash", kindX: "run", command: "ls", exit: 0, ms: 40 },
        { kind: "cu", id: "f", cu: "github", url: "https://github.com/x/y" },
        { kind: "cu", id: "g", cu: "shot", fileId: "f9", bucketId: "bkt", label: "Mobile" },
        { kind: "cu", id: "h", cu: "report", text: "Ripoti kamili" },
        { kind: "cu", id: "i", cu: "run_end", status: "done", tokens: 5, requests: 1 },
      ] as any,
      "Duka la Matunda la Temeke",
    );
    for (const ev of events) t.a.apply(ev);
    const it = t.find<CuRunItem>("cuRun")!;
    expect(it.status).toBe("done");
    expect(t.find<CuExecItem>("cuExec")!.command).toBe("ls");
    expect(t.find<CuShotItem>("cuShot")!.fileId).toBe("f9");
    expect(t.find<CuTextItem>("cuText")!.text).toBe("Nimeanza kazi.");
    expect(t.find<CuThinkItem>("cuThink")!.text).toBe("napanga");
    expect(t.find<CuLinkItem>("cuLink")!.link).toBe("github");
    // mpangilio wa mkondo: text kabla ya exec, exec kabla ya shot
    const kinds = t.snap().items.map((x) => x.kind);
    expect(kinds.indexOf("cuText")).toBeLessThan(kinds.indexOf("cuExec"));
    expect(kinds.indexOf("cuExec")).toBeLessThan(kinds.indexOf("cuShot"));
    expect(t.find<CuReportItem>("cuReport")?.doc).toBe("Ripoti kamili");
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

describe("R35 · nidhamu (hooks) kwenye timeline + export kamili", () => {
  it("xmd_hook (live) na hook (replay) zinakuwa cuHook items", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "run_start", task: "Dashboards" });
    t.cu({ type: "xmd_hook", kind: "continue", text: "XMD NIDHAMU: endelea MOJA KWA MOJA", streak: 2 });
    t.cu({ type: "hook", hookKind: "brake", text: "jibu lilelile x3" });
    const hooks = t.all<any>("cuHook");
    expect(hooks).toHaveLength(2);
    expect(hooks[0].hookKind).toBe("continue");
    expect(hooks[0].streak).toBe(2);
    expect(hooks[1].hookKind).toBe("brake");
  });

  it("export ina: thought kamili, command+output, diff, hook, picha data-URI, files tree", async () => {
    const { boardMarkdown } = await import("@/components/board/exportMarkdown");
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "run_start", task: "Dashboards Kubwa" });
    t.cu({ type: "think_delta", step: 1, text: "napanga".repeat(50) });
    t.cu({ type: "think_end", step: 1, ms: 5 });
    t.cu({ type: "xmd_hook", kind: "advice", text: "ushauri wa nidhamu hapa" });
    t.cu({ type: "exec", step: 2, execId: "e1", tool: "Bash", kindX: "bash", command: "npm run build", exit: 0, output: "build succeeded in 3.2s" });
    t.cu({ type: "exec", step: 3, execId: "e2", tool: "Edit", kindX: "edit", command: "Edit", path: "src/App.jsx", oldStr: "const x = 1;", newStr: "const x = 2;", exit: 0 });
    t.cu({ type: "shot", step: 4, label: "Desktop 1280x800", fileId: "f1", bucketId: "b1" });
    t.cu({ type: "files", tree: [{ p: "src/App.jsx", d: false, s: 120 }] });
    t.cu({ type: "report", text: "RIPOTI: imekamilika", status: "done", partial: false });
    const md = boardMarkdown("Dashboards Kubwa", "jenga dashboards", t.snap().items, { f1: "data:image/png;base64,QUJD" });
    expect(md).toContain("napanga".repeat(50));            // thought KAMILI (haikatwi)
    expect(md).toContain("npm run build");                 // command kamili
    expect(md).toContain("build succeeded in 3.2s");       // output
    expect(md).toContain("- const x = 1;");                // diff before
    expect(md).toContain("+ const x = 2;");                // diff after
    expect(md).toContain("nidhamu/advice");                // hook line
    expect(md).toContain("data:image/png;base64,QUJD");    // picha embedded
    expect(md).toContain("src/App.jsx");                   // files tree
    expect(md).toContain("RIPOTI: imekamilika");           // ripoti
  });

  // ── R38-RC4: orphan think cards — think_start mpya/pause/run_end inafunga iliyotangulia ──

  it("RC4: think_start MBILI bila think_end — ya kwanza inafungwa (partial:false), si orphan", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "run_start", task: "Duka", model: "xmd" });
    t.cu({ type: "think_start", step: 1 });
    t.cu({ type: "think_delta", step: 1, text: "nafikiri kwanza" });
    t.cu({ type: "think_start", step: 1 }); // think_end haikuwahi kuja (stream ikirudiwa)
    t.cu({ type: "think_delta", step: 1, text: "nafikiri pili" });
    const cards = t.all<CuThinkItem>("cuThink");
    expect(cards).toHaveLength(2);
    expect(cards[0].partial).toBe(false); // ← orphan imefungwa (ushahidi [311]/[314])
    expect(cards[0].text).toContain("kwanza");
    expect(cards[1].partial).toBe(true);  // wazi bado (stream inaendelea)
  });

  it("RC4: run_end inafunga think iliyo wazi — hakuna partial:true mwishoni", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "run_start", task: "Duka", model: "xmd" });
    t.cu({ type: "think_start", step: 2 });
    t.cu({ type: "think_delta", step: 2, text: "nawaza" });
    t.cu({ type: "run_end", status: "done", steps: 3, ms: 9000 });
    const th = t.find<CuThinkItem>("cuThink")!;
    expect(th.partial).toBe(false);
    expect(t.find<CuRunItem>("cuRun")!.status).toBe("done");
  });

  it("RC4: pause (replay) + phase_done (live pause) zinafunga think wazi", () => {
    const t = run();
    t.cu({ type: "divider" });
    t.cu({ type: "run_start", task: "Duka", model: "xmd" });
    t.cu({ type: "think_start", step: 3 });
    t.cu({ type: "pause", resumeAt: 0, ms: 5000, steps: 2 });
    expect(t.find<CuThinkItem>("cuThink")!.partial).toBe(false);

    const t2 = run();
    t2.cu({ type: "divider" });
    t2.cu({ type: "run_start", task: "Duka", model: "xmd" });
    t2.cu({ type: "think_start", step: 1 });
    t2.cu({ type: "phase_done", ok: false, status: "paused" });
    expect(t2.find<CuThinkItem>("cuThink")!.partial).toBe(false);
    expect(t2.find<CuRunItem>("cuRun")!.status).toBe("paused");
  });
});
