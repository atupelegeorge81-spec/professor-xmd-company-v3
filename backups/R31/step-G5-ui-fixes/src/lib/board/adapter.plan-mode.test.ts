// R31-G5 · PLAN MODE: adapter HAI-Classify script/patch/review — kosa la session 6ac42a20:
// consensus ikifika, ujumbe unaofuata wa writer (vextron/megatron/cybertron) uliingia
// ScriptBox TUPU ("script"), wa non-writer kwenye card ya "code review", na objection +
// writer kwenye "patch" (logic ya patching ya zamani) — hali plan mode haina awamu hizo.
import { describe, expect, it } from "vitest";
import { createBoardAdapter, type AdapterEvent } from "./adapter";

function feed(events: AdapterEvent[]) {
  const ad = createBoardAdapter({ instant: true });
  for (const e of events) ad.apply(e);
  return ad.snapshot().items;
}

const AGENDA: AdapterEvent[] = [
  {
    type: "agenda_meta",
    agenda: [{ index: 1, item: "Implement login page", owners: ["vextron", "ultron"], requiresCode: true }],
  },
  // chip ya agenda-start ndiyo inayoweka `cur` (owners) kwenye adapter
  { type: "system", text: "Agenda 1/1: Implement login page — owners: Vextron + Ultron" },
] as any;

function msg(n: number, agent: string, text: string): AdapterEvent[] {
  const id = `m${n}`;
  return [
    { type: "msg_start", id, agentId: agent },
    { type: "token", id, text },
    { type: "msg_done", id },
  ] as any;
}

const CONSENSUS: AdapterEvent[] = [
  ...msg(1, "vextron", "PROPOSED DECISION: Use dark tokens.\nRATIONALE: locked palette.\nTRADE-OFF: none.\nEVIDENCE: Agenda 1."),
  ...msg(2, "ultron", "AGREE: matches wireframe."),
  ...msg(3, "vextron", "AGREE: consensus."),
];

describe("R31-G5 · plan mode — hakuna script/patch/review UI", () => {
  it("CODE mode (default ya zamani): consensus → writer anaingia ScriptBox (repro ya kosa)", () => {
    const items = feed([...AGENDA, ...CONSENSUS, ...msg(4, "vextron", "Natambua consensus imetokea.")]);
    expect(items.some((x: any) => x.kind === "script")).toBe(true);
  });

  it("PLAN mode: consensus → ujumbe wa writer ni TURN ya kawaida — HAKUNA ScriptBox", () => {
    const items = feed([
      { type: "mode", mode: "plan" } as any,
      AGENDA,
      ...CONSENSUS,
      ...msg(4, "vextron", "Natambua consensus imetokea."),
    ]);
    expect(items.some((x: any) => x.kind === "script")).toBe(false);
    expect(items.filter((x: any) => x.kind === "turn").length).toBeGreaterThanOrEqual(4);
  });

  it("PLAN mode: non-writer baada ya consensus ni TURN — HAKUNA card ya code review", () => {
    const items = feed([
      { type: "mode", mode: "plan" } as any,
      AGENDA,
      ...CONSENSUS,
      ...msg(4, "megatron", "Nakubali maamuzi yote."),
    ]);
    expect(items.some((x: any) => x.kind === "review")).toBe(false);
    expect(items.some((x: any) => x.kind === "script")).toBe(false);
  });

  it("PLAN mode: ujumbe wenye sample code (evidence) unabaki TURN — code inaonekana kama markdown", () => {
    const items = feed([
      { type: "mode", mode: "plan" } as any,
      AGENDA,
      ...msg(1, "vextron", "Implementation evidence:\n```css\n.btn { color: #00D4AA; }\n```\nTokens from agenda 1."),
    ]);
    expect(items.some((x: any) => x.kind === "script")).toBe(false);
    const turn: any = items.find((x: any) => x.kind === "turn");
    expect(turn?.content).toContain("```css");
  });

  it("savedToEvents: chip ya resume-state inatoa mode event YA KWANZA (replay ya session zilizopo)", async () => {
    const { savedToEvents } = await import("./adapter");
    const planItems = [
      { kind: "title", id: "t", text: "X" },
      { kind: "chip", id: "c1", text: "🔒 LOCKED: A → ok" },
      { kind: "chip", id: "__professor_xmd_resume_state__", text: "__PROFESSOR_XMD_RESUME_STATE__:" + JSON.stringify({ version: 2, runnerId: "r", agenda: [], done: [], mode: "plan" }) },
    ];
    const evs = savedToEvents(planItems as any, "proj");
    expect(evs[0]).toEqual({ type: "mode", mode: "plan" });

    const codeItems = [
      { kind: "chip", id: "__professor_xmd_resume_state__", text: "__PROFESSOR_XMD_RESUME_STATE__:" + JSON.stringify({ version: 2, runnerId: "r", agenda: [], done: [], mode: "code" }) },
    ];
    const evs2 = savedToEvents(codeItems as any, "proj");
    expect(evs2[0]).toEqual({ type: "mode", mode: "code" });
  });
});
