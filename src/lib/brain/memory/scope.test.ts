// T36: lango la mipaka ya kumbukumbu — mistari HALISI kutoka agent_memory (Supabase, 2026-10-22, backup xmdtest/t36).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyLine, crossProjectVerdict, techTerms, lineId } from "./scope";

const REAL = {
  ultronPref: `Mkuu prefers "editorial" sharpness over SaaS softness; zero border-radius and hairline dividers are the approved aesthetic for this portfolio.`,
  ultronEditorial: `I successfully defended the "sharp editorial" aesthetic (zero radius, hairlines) against SaaS defaults, proving that strict visual constraints (75ch caps,`,
  ultronCyan: `I successfully defended our bespoke dark-theme palette (#030712 base with #06b6d4 cyan) and Space Grotesk/IBM Plex Sans pairing, avoiding generic AI templat`,
  ultronObsidian: "Avoid generic SaaS card shadows; always opt for crisp hairline borders on deep obsidian (`--bg-base`) to preserve editorial 2026 aesthetics.",
  optimusZeroTransition: "When proposing UI components, explicitly verify they comply with the zero-transition policy (CSS transform/opacity only) to prevent later rework from animation",
  companySw: "Kwenye usanifu wa fomu za uthibitishaji na kuingia kwenye akaunti: Tumia muundo wa asimetry unaoendana na ukubwa wa skrini za vifaa vyote, pamoja na mistari safi, mae",
  companyDarkSw: "Kwenye usanifu wa mandhari ya giza na uchapaji wa maandishi: Tumia fonti za vigezo zinazoweza kubadilika zenye ukubwa unaobadilika kwa uwiano na marekebisho ya uzito wa",
  megatronStack: "Next.js 15 Server Actions paired with `useActionState` provide robust form state management while keeping Supabase anon keys strictly server-side.",
  megatronZod: "Always enforce Zod build-time validation for Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) to prevent runtime",
  optimusInferred: `Mkuu prefers strict adherence to literal constraints over general best practices; I must prioritize the specific "one line" instruction over standard README conventions.`,
  cybertronLesson: "Avoid assuming UI components exist before code delivery; always demand file paths or patches for evidence-based verification to prevent premature assumptions about UI",
  optimusLesson: "Avoid making premature assumptions about frontend routing plans; explicitly frame them as proposals for engineering to validate.",
};

describe("T36 classifyLine (mistari halisi)", () => {
  it("design ya Ultron/Optimus/company (EN + Kiswahili) → design", () => {
    for (const k of ["ultronEditorial", "ultronCyan", "ultronObsidian", "optimusZeroTransition", "companySw", "companyDarkSw", "ultronPref"] as const)
      expect(classifyLine(REAL[k]), k).toBe("design");
  });
  it("'Mkuu prefers …' iliyokisiwa kwenye Board → pref; ya Chat (maneno yake) si pref", () => {
    expect(classifyLine(REAL.optimusInferred)).toBe("pref");
    expect(classifyLine(REAL.optimusInferred, true)).toBe("lesson");
  });
  it("stack ya Megatron → tech · funzo la utaratibu → lesson", () => {
    expect(classifyLine(REAL.megatronStack)).toBe("tech");
    expect(techTerms(REAL.megatronStack).sort()).toEqual(["next.js", "supabase"]);
    expect(classifyLine(REAL.megatronZod)).toBe("tech");
    expect(classifyLine(REAL.cybertronLesson)).toBe("lesson");
    expect(classifyLine(REAL.optimusLesson)).toBe("lesson");
  });
  it("neno 'next' la Kiingereza si Next.js", () => {
    expect(techTerms("Plan the next step before the next agenda item")).toEqual([]);
  });
});

describe("T36 crossProjectVerdict", () => {
  const coffee = "Ukurasa wa landing wa duka la kahawa Mwanza — hero, menu, mawasiliano";
  it("design haivuki hata kwa uhusiano mkubwa", () => {
    expect(crossProjectVerdict({ project: "Bilingual Portfolio #cfe8c6", text: REAL.ultronCyan }, coffee, 9).ok).toBe(false);
  });
  it("pref iliyokisiwa haivuki", () => {
    const v = crossProjectVerdict({ project: "xmdtest-cu16 README Setup #8a3a80", text: REAL.optimusInferred }, coffee, 5);
    expect(v).toMatchObject({ ok: false, kind: "pref" });
  });
  it("tech inavuka TU kama teknolojia zote zimo kwenye kazi hii", () => {
    const line = { project: "Bilingual Portfolio #cfe8c6", text: REAL.megatronStack };
    expect(crossProjectVerdict(line, coffee, 4).ok).toBe(false);
    expect(crossProjectVerdict(line, `${coffee} kwa Next.js na Supabase`, 4).ok).toBe(true);
  });
  it("funzo linahitaji maneno 2+ ya uhusiano", () => {
    const line = { project: "Modern Auth Pages #69b4b5", text: REAL.cybertronLesson };
    expect(crossProjectVerdict(line, coffee, 1)).toMatchObject({ ok: false, why: "uhusiano mdogo" });
    expect(crossProjectVerdict(line, coffee, 2).ok).toBe(true);
  });
  it("lineId ni thabiti na fupi", () => {
    expect(lineId(REAL.optimusLesson)).toBe(lineId(REAL.optimusLesson));
    expect(lineId(REAL.optimusLesson)).toMatch(/^M[0-9a-z]{1,5}$/);
  });
});

// recall: memory halisi ya Ultron + company (sehemu) — kikao KIPYA hakipati design ya miradi mingine
const store = vi.hoisted(() => ({ docs: {} as Record<string, unknown> }));
vi.mock("./store", () => ({ COMPANY_DOC: "company", readMemory: async (p: string) => store.docs[p] ?? null }));
vi.mock("../../board/memoryAuthority", () => ({ maskPastValues: (t: string) => t, rememberPastProject: () => {} }));

describe("T36 recallMemory (Board, mradi mpya)", () => {
  beforeEach(() => {
    const L = (d: string, p: string, t: string) => `- [${d}][imp:4][${p}] ${t}`;
    store.docs.ultron = {
      agent_id: "ultron",
      board_memory: "",
      self_memory: [
        L("2026-10-22", "Bilingual Portfolio with Supabase & Vercel #cfe8c6", REAL.ultronCyan),
        L("2026-10-20", "Bilingual Developer Portfolio with Supabase #5ada2a", REAL.ultronPref),
        L("2026-10-20", "Bilingual Developer Portfolio with Supabase #5ada2a", REAL.ultronObsidian),
        L("2026-10-22", "Modern Auth Pages Implementation #69b4b5", REAL.cybertronLesson),
        L("2026-10-22", "Coffee Landing Page #aaaaaa", "Hero headline for this coffee landing page uses the roastery story first."),
      ].join("\n"),
    };
    store.docs.company = { agent_id: "company", self_memory: "", board_memory: [L("2026-10-22", "Modern Auth Pages Implementation #69b4b5", REAL.companySw)].join("\n") };
  });
  it("design + pref za miradi mingine zinazuiwa; funzo linaingia; mstari wa mradi huu unabaki", async () => {
    const { recallMemory, memoryBlock } = await import("./recall");
    const r = await recallMemory("ultron", { query: "Design the landing page UI components and verify evidence before code delivery", project: "Coffee Landing Page #aaaaaa", surface: "board", context: "Coffee landing page" });
    const block = memoryBlock(r);
    expect(block).not.toMatch(/editorial|hairline|cyan|Space Grotesk|obsidian|asimetry|mistari safi/i);
    expect(block).toMatch(/demand file paths or patches/);
    expect(block).toMatch(/roastery story/); // mradi huu — muktadha unabaki
    expect(r.trace?.past.map((x) => x.kind)).toEqual(["lesson"]);
    expect(r.trace?.blocked.design).toBe(4);
    expect(block).toMatch(/NEVER carry a look, palette, font, layout style or tech stack/);
  });
});
