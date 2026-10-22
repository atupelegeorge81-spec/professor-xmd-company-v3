// TASK-34 (MISSION TWO) — UI ya milestone mode kwenye adapter (mock events, mpangilio wa engine).
import { describe, expect, it } from "vitest";
import { createBoardAdapter, isLogOnlyChip, savedToEvents, type AdapterEvent } from "./adapter";
import { msUiText, parseMsUi, renderR0Findings, renderVerifyFindings, type MsUiEvent } from "../milestone/uiEvents";
import { boardMarkdown, memosFromSaved } from "../../components/board/exportMarkdown";

const sys = (text: string) => ({ type: "system", text }) as AdapterEvent;
const ui = (e: MsUiEvent) => sys(msUiText(e));
const msg = (id: string, agentId: string, text: string): AdapterEvent[] => [
  { type: "msg_start", id, agentId },
  { type: "token", id, text },
  { type: "msg_done", id },
] as any;
function feed(events: AdapterEvent[]) {
  const ad = createBoardAdapter({ instant: true, now: () => 0 });
  for (const e of events) ad.apply(e);
  return ad.snapshot();
}

const MAP: MsUiEvent = {
  t: "map",
  milestones: [
    { id: "M1", title: "App shell", from: 1, to: 1, roster: ["frontend", "designer"], reviewMode: "visual" },
    { id: "M2", title: "Checkout", from: 2, to: 2, roster: ["backend", "qa"], reviewMode: "functional" },
  ],
};
const OPEN: AdapterEvent[] = [
  { type: "mode", mode: "plan" } as any,
  { type: "agenda_meta", agenda: [
    { index: 1, item: "Shell", owners: ["vextron", "ultron"], requiresCode: true },
    { index: 2, item: "Checkout", owners: ["megatron", "cybertron"], requiresCode: true },
  ] } as any,
  sys("📋 Agenda (2 vipengele): Shell · Checkout"),
  ui(MAP),
];
const CO = { id: "CO-001", defectIds: ["D-001"], priority: 1, attempt: 1, mode: "concrete", files: ["src/app/page.tsx"], current: "Header haipo", desired: "Header yenye logo", acceptance: ["logo inaonekana"] };

// chips HALISI za engine (loop.ts / cu/engine.ts) ambazo CEO aliziona kwenye chat
const LOG_ONLY = [
  "🧾 M1 R1: CO-001 RESOLVED · checks 4P/0F/0E",
  "📸 Evidence ya M1 R0: 6 screenshots · errors 0 · console 0",
  "📸 M1 R1: harness inakusanya evidence upya (uthibitisho)",
  "🔍 M1 R1: Ultron + Cybertron wanathibitisha COs CO-001 (peke yao)",
  "🔌 M1 lanes (R0): wito 12 · gemini 8 · xkiro 4",
  "✅ M1 R1 verify: CO-001 RESOLVED → SIGN_OFF",
  "🔧 M1 R1: XMD Computer anatekeleza COs 1 (CO-001)",
  "🖥️ XMD Computer · Milestone M1 inaanza — StartPack (plan + Ledger + repo + reports), bridge mpya.",
];

describe("TASK-34 · uiEvents", () => {
  it("msUiText ↔ parseMsUi ni round-trip; maandishi mengine si msui", () => {
    expect(parseMsUi(msUiText(MAP))).toEqual(MAP);
    expect(parseMsUi("📋 Agenda (2 vipengele): a")).toBeNull();
    expect(parseMsUi("__XMD_MSUI__:{broken")).toBeNull();
  });
  it("renderR0Findings / renderVerifyFindings: maudhui KAMILI (hakuna kukatwa) + hali ya kukosa jibu", () => {
    const long = "y".repeat(2500);
    const f: any = {
      screenshots: [{ id: "S-001", description: "home" }],
      defects: [{ id: "D-001", severity: "major", title: "Header haipo", area: "header", expected: "logo", actual: long, evidence: ["S-001"] }],
      proposals: [{ id: "P-01", title: "Sticky header", detail: "sticky", rationale: "nav", evidence: [] }],
      notes: "sawa",
    };
    const r0 = renderR0Findings(f, "Ultron");
    expect(r0).toContain("**Ultron · ukaguzi huru (R0)** — defects 1 · mapendekezo 1");
    expect(r0).toContain(long);
    expect(r0).toContain("Sticky header");
    expect(renderR0Findings(null, "Ultron")).toMatch(/hakuna findings/);
    const v = renderVerifyFindings({ cos: [{ orderId: "CO-001", verdict: "FAIL", note: long, evidence: ["S-002"] }], regressions: [], newDefects: [], notes: "" } as any, "Vextron", 2);
    expect(v).toContain("**Vextron · uthibitisho R2** — CO-001 FAIL");
    expect(v).toContain(long);
  });
});

describe("TASK-34 · adapter milestone mode", () => {
  it("map → card ya Milestones (rows + status) + header (stage.milestones)", () => {
    const s = feed(OPEN);
    const map: any = s.items.find((x) => x.kind === "msMap");
    expect(map.milestones.map((r: any) => r.id)).toEqual(["M1", "M2"]);
    expect(map.milestones[0].roster).toEqual(["vextron", "ultron"]);
    expect(s.stage.milestones?.length).toBe(2);
    // chip ya msui yenyewe haionekani popote
    expect(JSON.stringify(s.items)).not.toContain("__XMD_MSUI__");
  });

  it("badge ya milestone inaingia KABLA ya badge ya agenda ya kwanza ya milestone (mara moja tu), header inaangazia", () => {
    const s = feed([...OPEN, sys("Agenda 1/2: Shell — owners: Vextron + Ultron"), sys("Agenda 2/2: Checkout — owners: Megatron + Cybertron")]);
    const kinds = s.items.map((x: any) => (x.kind === "msMark" ? `mark:${x.mark}:${x.ms}` : x.kind === "agendaStart" ? `A${x.agenda.index}` : null)).filter(Boolean);
    expect(kinds).toEqual(["mark:enter:M1", "A1", "mark:enter:M2", "A2"]);
    expect(s.stage.msActive).toBe("M2");
    expect((s.items.find((x) => x.kind === "msMap") as any).active).toBe("M2");
    // badge ya agenda haijabadilika
    expect(s.items.filter((x) => x.kind === "agendaStart").length).toBe(2);
  });

  it("chips za kiufundi (🧾 📸 🔍 🔌 ✅ 🔧 🖥️) HAZIONEKANI kwenye chat; 'mini report imeandikwa' + Build Report zinabaki", () => {
    for (const t of LOG_ONLY) expect(isLogOnlyChip(t)).toBe(true);
    const keep = ["📝 M1 R0: mini report imeandikwa (review)", "📑 Build Report ya M1: ok", "🏁 Milestone M1 closed — App shell (agendas 1–1)", "Agenda 1/2: Shell — owners: Vextron"];
    for (const t of keep) expect(isLogOnlyChip(t)).toBe(false);
    const s = feed([...OPEN, ...LOG_ONLY.map(sys), sys(keep[0])]);
    const txt = JSON.stringify(s.items);
    for (const t of LOG_ONLY) expect(txt).not.toContain(t.slice(0, 18));
    expect(txt).toContain("mini report imeandikwa");
  });

  it("plan ya kila milestone → card YAKE ya Mpango Kazi (maandishi ya Optimus ndani), haichanganyi na nyingine", () => {
    const s = feed([
      ...OPEN,
      sys("🗺️ Optimus anaandika plan ya Milestone M1 1/2"), ...msg("p1", "optimus", "## Plan M1 part 1"),
      sys("🗺️ Optimus anaandika plan ya Milestone M1 2/2"), ...msg("p2", "optimus", "\n## Plan M1 part 2"),
      sys("🗺️ Plan ya Milestone M1 iko tayari — hatua 8 · checks 5"),
      sys("🗺️ Optimus anaandika plan ya Milestone M2 1/2"), ...msg("p3", "optimus", "## Plan M2"),
    ]);
    const plans: any[] = s.items.filter((x) => x.kind === "plan");
    expect(plans.map((p) => p.milestone)).toEqual(["M1", "M2"]);
    expect(plans[0].title).toBe("M1 · App shell");
    expect(plans[0].doc).toContain("Plan M1 part 1");
    expect(plans[0].doc).toContain("Plan M1 part 2");
    expect(plans[0].saved).toBe("saved");
    expect(plans[1].doc).toContain("Plan M2");
    expect(plans[1].doc).not.toContain("M1");
    // maandishi ya plan hayakuwa turns za chat
    expect(s.items.some((x: any) => x.kind === "turn" && /Plan M1/.test(x.content || ""))).toBe(false);
  });

  it("Computer inaingia: build (R0) + kila raundi ya marekebisho → badge kila mara; COs za Optimus ndani ya card yake", () => {
    const s = feed([
      ...OPEN,
      ui({ t: "st", id: "M1", s: "BUILDING", r: 0 }),
      ui({ t: "cu", id: "M1", r: 0 }),
      ui({ t: "st", id: "M1", s: "FIXING", r: 1 }),
      ui({ t: "cu", id: "M1", r: 1, cos: [CO] }),
      ui({ t: "cu", id: "M1", r: 2, cos: [{ ...CO, attempt: 2 }] }),
    ]);
    const marks: any[] = s.items.filter((x: any) => x.kind === "msMark" && x.mark === "computer");
    expect(marks.map((m) => m.round)).toEqual([0, 1, 2]);
    const cos: any[] = s.items.filter((x) => x.kind === "msCos");
    expect(cos.map((c) => c.round)).toEqual([1, 2]);
    expect(cos[0].cos[0].desired).toBe("Header yenye logo");
    expect(s.items.some((x) => x.kind === "cuDivider")).toBe(false);
    expect(s.stage.milestones?.find((r) => r.id === "M1")?.status).toBe("FIXING");
  });

  it("reviewers: badge (R0 + verify) + ujumbe KAMILI kama turns", () => {
    const long = "**Ultron · R0** — D-001 P1: header haipo.\n\n" + "x".repeat(3000);
    const s = feed([
      ...OPEN,
      ui({ t: "rev", id: "M1", r: 0, who: ["designer", "qa"] }),
      ...msg("r1", "ultron", long),
      ...msg("r2", "cybertron", "**Cybertron · R0** — sawa"),
      ui({ t: "rev", id: "M1", r: 1, who: ["designer", "qa"] }),
      ...msg("r3", "ultron", "**Ultron · uthibitisho R1** — CO-001 RESOLVED"),
    ]);
    const marks: any[] = s.items.filter((x: any) => x.kind === "msMark" && x.mark === "review");
    expect(marks.map((m) => m.round)).toEqual([0, 1]);
    expect(marks[0].agents).toEqual(["ultron", "cybertron"]);
    const turns: any[] = s.items.filter((x) => x.kind === "turn");
    expect(turns.length).toBe(3);
    expect(turns[0].content.length).toBe(long.length); // haijakatwa
  });

  it("mjadala wa watatu (R-Mk-n) → badge yake + zamu kamili", () => {
    const s = feed([
      ...OPEN,
      sys(" R-M1-0: Header haipo — owners: Optimus + Ultron + Cybertron"),
      ...msg("t1", "ultron", "Nakubali, D-001 ni P1."),
      ...msg("t2", "optimus", "Sawa — CO-001."),
    ]);
    const talk: any = s.items.find((x: any) => x.kind === "msMark" && x.mark === "talk");
    expect(talk).toMatchObject({ ms: "M1", round: 0, reviewId: "R-M1-0", title: "Header haipo" });
    expect(talk.agents).toEqual(["optimus", "ultron", "cybertron"]);
    const turns: any[] = s.items.filter((x) => x.kind === "turn");
    expect(turns.map((t) => t.agent)).toEqual(["ultron", "optimus"]);
    expect(s.items.some((x) => x.kind === "plan")).toBe(false); // Optimus kwenye mjadala si plan
  });

  it("ripoti ya mwisho kwa CEO → card yake (msReport): inastream, kisha md kamili + mstari wa hali", () => {
    const md = "# Ripoti ya CEO\n\nM1 SIGNED_OFF · M2 CAP_REACHED";
    const s = feed([
      ...OPEN,
      ui({ t: "final0" }),
      ...msg("f1", "optimus", "# Ripoti ya CEO\n\nrasimu"),
      ui({ t: "final", md, line: "M1 ✅ · M2 ⚠️", complete: false }),
    ]);
    const reps: any[] = s.items.filter((x) => x.kind === "msReport");
    expect(reps.length).toBe(1);
    expect(reps[0]).toMatchObject({ doc: md, shown: md.length, live: false, line: "M1 ✅ · M2 ⚠️", complete: false });
    expect(s.items.some((x: any) => x.kind === "turn" && /rasimu/.test(x.content || ""))).toBe(false);
  });

  it("replay (savedToEvents) inatoa UI ileile kama live", () => {
    const live = feed([...OPEN, sys("Agenda 1/2: Shell — owners: Vextron + Ultron"), ui({ t: "cu", id: "M1", r: 1, cos: [CO] })]);
    const saved: any[] = [
      { kind: "chip", id: "c0", text: "📋 Agenda (2 vipengele): Shell · Checkout" },
      { kind: "chip", id: "c1", text: msUiText(MAP) },
      { kind: "chip", id: "c2", text: "Agenda 1/2: Shell — owners: Vextron + Ultron" },
      { kind: "chip", id: "c3", text: msUiText({ t: "cu", id: "M1", r: 1, cos: [CO] }) },
      { kind: "chip", id: "c4", text: LOG_ONLY[0] },
    ];
    const evs = savedToEvents(saved, "plan");
    const re = feed(evs as AdapterEvent[]);
    const shape = (s: any) => s.items.filter((x: any) => x.kind.startsWith("ms")).map((x: any) => `${x.kind}:${x.mark || ""}:${x.ms || ""}`);
    expect(shape(re)).toEqual(shape(live));
    expect(JSON.stringify(re.items)).not.toContain("🧾");
  });

  it("export .md ina milestones, badges, COs na ripoti ya CEO", () => {
    const s = feed([...OPEN, sys("Agenda 1/2: Shell — owners: Vextron + Ultron"), ui({ t: "cu", id: "M1", r: 1, cos: [CO] }), ui({ t: "final", md: "# Ripoti ya CEO", line: "x", complete: true })]);
    const md = boardMarkdown("T", "p", s.items);
    expect(md).toContain("### 🚩 Milestones");
    expect(md).toContain("## 🚩 M1 · App shell");
    expect(md).toContain("CO-001");
    expect(md).toContain("# Ripoti ya CEO");
  });
  it("export: mini-report ya review (memo:Mk) KAMILI kutoka items zilizohifadhiwa — chat haionyeshi maudhui", () => {
    const entry = (round: number, kind: string, facts: string) => ({ id: `${kind}:R${round}`, kind, milestoneId: "M1", round, at: "t", head: `M1 · R${round} · ${kind}`, facts, note: "Optimus anasema", ids: [], missing: [] });
    const rec = { version: 1, milestoneId: "M1", entries: [entry(0, "review", "D-001 header"), entry(1, "fix", "CO-001"), entry(1, "verify", "CO-001 FAIL"), entry(2, "fix", "CO-002"), entry(2, "verify", "CO-002 PASS")], confirmations: [] };
    const saved = [
      { kind: "chip", id: "x", text: "📋 Agenda (1 vipengele): a" },
      { kind: "chip", id: "__professor_xmd_ms__memo:M1", text: "__PROFESSOR_XMD_MILESTONE__:" + JSON.stringify({ key: "memo:M1", version: 3, data: rec }) },
      { kind: "chip", id: "__professor_xmd_ms__state:M1", text: "__PROFESSOR_XMD_MILESTONE__:" + JSON.stringify({ key: "state:M1", version: 1, data: { id: "M1" } }) },
      { kind: "chip", id: "bad", text: "__PROFESSOR_XMD_MILESTONE__:{oops" },
    ];
    const memos = memosFromSaved(saved);
    expect(memos.map((m) => m.milestoneId)).toEqual(["M1"]);
    const md = boardMarkdown("T", "p", [], {}, memos);
    expect(md).toContain("## 📝 Mini-report ya review · M1");
    // ingizo ZOTE 5 kamili (si 3 za mwisho tu) — hakuna "(compressed)"
    for (const f of ["D-001 header", "CO-001 FAIL", "CO-002 PASS"]) expect(md).toContain(f);
    expect(md).not.toContain("(compressed)");
    // chat (adapter) haipokei rekodi hizi kama maandishi
    const s2 = feed(savedToEvents(saved as any, "x") as AdapterEvent[]);
    expect(JSON.stringify(s2.items)).not.toContain("Optimus anasema");
  });
  it("flag OFF (non-milestone): hakuna items za ms*, cuDivider ya zamani ipo, chips za kawaida hazifichwi", () => {
    const s = feed([
      { type: "mode", mode: "plan" } as any,
      { type: "agenda_meta", agenda: [{ index: 1, item: "Shell", owners: ["vextron"], requiresCode: true }] } as any,
      sys("📋 Agenda (1 vipengele): Shell"),
      sys("Agenda 1/1: Shell — owners: Vextron"),
      sys("🧱 Build: ok"),
      { type: "cu", cu: { type: "run_start", task: "build" } } as any,
    ]);
    expect(s.items.some((x) => x.kind.startsWith("ms"))).toBe(false);
    expect(s.items.some((x) => x.kind === "cuDivider")).toBe(true);
    expect(s.items.some((x) => x.kind === "agendaStart")).toBe(true);
    expect(s.stage.milestones).toBeUndefined();
  });
});
