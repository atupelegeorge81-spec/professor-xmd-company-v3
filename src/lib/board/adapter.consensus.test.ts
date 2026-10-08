// R39 · FIX 1 — card ya consensus: "mpaka agent wamekubaliana KABISA".
// Kosa la session 6ac7d777 (OmniSight BI): pendekezo la Optimus + AGREE ya mtoa pendekezo
// mwenyewe ilifunga "Consensus 2/2 v1" — kisha DISAGREE ya Ultron haikubadilisha kitu.
// Sasa: mtoa pendekezo HAHESABIWI automatic; owners WOTE wana-AGREE wazi; DISAGREE/
// pendekezo jipya inarejesha card nyuma ("retract"/"reset"). Owner MMOJA: pendekezo = kura.
import { describe, expect, it } from "vitest";
import { createBoardAdapter, type AdapterEvent } from "./adapter";

function feed(events: AdapterEvent[]) {
  const ad = createBoardAdapter({ instant: true });
  for (const e of events) ad.apply(e);
  return ad.snapshot();
}

const agenda = (owners: string[]): AdapterEvent[] => [
  { type: "agenda_meta", agenda: [{ index: 1, item: "Implement login page", owners, requiresCode: true }] } as any,
  { type: "system", text: `Agenda 1/1: Implement login page — owners: ${owners.join(" + ")}` } as any,
];

function msg(n: number, agent: string, text: string): AdapterEvent[] {
  const id = `m${n}`;
  return [
    { type: "msg_start", id, agentId: agent },
    { type: "token", id, text },
    { type: "msg_done", id },
  ] as any;
}

const PROPOSE = "PROPOSED DECISION: Use dark tokens #00D4AA.\nRATIONALE: locked palette.\nTRADE-OFF: none.\nEVIDENCE: Agenda 1.";

function consensusItems(snap: ReturnType<typeof feed>) {
  return snap.items.filter((x: any) => x.kind === "consensus");
}

describe("R39 · FIX 1 — consensus card (multi-owner)", () => {
  it("pendekezo PEKEE halifungi consensus — mtoa pendekezo hahesabiwi automatic (0/2)", () => {
    const snap = feed([...agenda(["vextron", "ultron"]), ...msg(1, "vextron", PROPOSE)]);
    const cards = consensusItems(snap);
    expect(cards.some((c: any) => c.event === "proposed")).toBe(true);
    expect(cards.some((c: any) => c.event === "reached")).toBe(false);
    const last = cards[cards.length - 1] as any;
    expect(last.approvals).toEqual([]); // R39: si ["vextron"] tena
    expect(snap.stage.approvals).toEqual([]);
  });

  it("AGREE ya mtoa pendekezo MWENYEWI haitoshi — inabaki 1/2, hakuna 'reached'", () => {
    const snap = feed([
      ...agenda(["vextron", "ultron"]),
      ...msg(1, "vextron", PROPOSE),
      ...msg(2, "vextron", "AGREE: my proposal stands."),
    ]);
    const cards = consensusItems(snap);
    expect(cards.some((c: any) => c.event === "reached")).toBe(false);
    expect((cards[cards.length - 1] as any).approvals).toEqual(["vextron"]);
  });

  it("AGREE za owners WOTE → 'reached' (2/2)", () => {
    const snap = feed([
      ...agenda(["vextron", "ultron"]),
      ...msg(1, "vextron", PROPOSE),
      ...msg(2, "ultron", "AGREE: matches wireframe."),
      ...msg(3, "vextron", "AGREE: consensus."),
    ]);
    const reached = consensusItems(snap).find((c: any) => c.event === "reached") as any;
    expect(reached).toBeTruthy();
    expect(reached.approvals.sort()).toEqual(["ultron", "vextron"]);
  });

  it("DISAGREE baada ya 'reached' → card 'retract', consensus imefunguka (1/2)", () => {
    const snap = feed([
      ...agenda(["vextron", "ultron"]),
      ...msg(1, "vextron", PROPOSE),
      ...msg(2, "ultron", "AGREE: matches wireframe."),
      ...msg(3, "vextron", "AGREE: consensus."),
      ...msg(4, "ultron", "DISAGREE: hairline haitoshi kwenye chart zoom."),
    ]);
    const cards = consensusItems(snap) as any[];
    const retract = cards.find((c) => c.event === "retract");
    expect(retract).toBeTruthy();
    expect(retract.by).toBe("ultron");
    expect(retract.approvals).toEqual(["vextron"]); // kura ya Ultron imerudishwa
    expect(snap.stage.approvals).toEqual(["vextron"]);
  });

  it("pendekezo jipya (v2) baada ya reached → 'reset', kura zote zimefutwa", () => {
    const snap = feed([
      ...agenda(["vextron", "ultron"]),
      ...msg(1, "vextron", PROPOSE),
      ...msg(2, "ultron", "AGREE: matches wireframe."),
      ...msg(3, "vextron", "AGREE: consensus."),
      ...msg(4, "ultron", "PROPOSED DECISION: Use light tokens instead.\nRATIONALE: dark hairline.\nEVIDENCE: Agenda 1."),
    ]);
    const cards = consensusItems(snap) as any[];
    const reset = cards.find((c) => c.event === "reset");
    expect(reset).toBeTruthy();
    expect(reset.version).toBe(2);
    expect(reset.approvals).toEqual([]); // R39: mtoa pendekezo (ultron) hajiweki automatic
    expect(cards.some((c) => c.event === "reached" && c.version === 2)).toBe(false);
  });
});

describe("R39 · FIX 1 — consensus card (owner MMOJA)", () => {
  it("agenda ya owner mmoja: pendekezo lake = kura yake — inafikia 1/1 mara moja", () => {
    const snap = feed([...agenda(["vextron"]), ...msg(1, "vextron", PROPOSE)]);
    const cards = consensusItems(snap) as any[];
    const reached = cards.find((c) => c.event === "reached");
    expect(reached).toBeTruthy();
    expect(reached.approvals).toEqual(["vextron"]);
  });
});
