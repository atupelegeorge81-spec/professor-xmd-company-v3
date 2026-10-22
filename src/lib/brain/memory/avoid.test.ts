// T36: orodha ya "usirudie" + kipimo cha utofauti — rangi/fonts HALISI za project_plans (Supabase, 2026-10-22).
import { describe, it, expect, vi } from "vitest";

const plans = vi.hoisted(() => ({ list: [] as any[] }));
vi.mock("@/lib/server/plans", () => ({ listRecentPlans: async () => plans.list }));

import { lookOf, renderAvoid, similarTo, recentLooks, diversityWarning } from "./avoid";

// project_plans 2026-10-20 (Bilingual Portfolio): #27272A,#09090B,#18181B,#FAFAFA,#A1A1AA + Inter + hairline/editorial
const DARK_EDITORIAL = "Base #09090B surface #18181B border #27272A text #FAFAFA muted #A1A1AA accent #06B6D4. Fonts: Inter for body, Space Grotesk headings. Sharp editorial dark design, zero border-radius, hairline dividers. Next.js 15 + Supabase + Vercel, Playwright tests.";
// project_plans 2026-10-10 (KilimoSmart): #F7F5F0,#2C241B,#1A4331,#6B4226,#8E2424
const KILIMO = "Palette #F7F5F0 background, #2C241B text, #1A4331 primary, #6B4226 earth, #8E2424 alert. Offline-first PWA.";

describe("T36 lookOf", () => {
  it("giza + cyan + fonts + mitindo + stack (bila hex kwenye muhtasari)", () => {
    const l = lookOf("Bilingual Portfolio", DARK_EDITORIAL);
    expect(l.base).toBe("near-black/dark base");
    expect(l.accents).toContain("cyan");
    expect(l.fonts).toEqual(["Inter", "Space Grotesk"]);
    expect(l.style).toEqual(expect.arrayContaining(["editorial", "hairlines", "zero-radius"]));
    expect(l.stack).toEqual(expect.arrayContaining(["next.js", "supabase", "vercel", "playwright"]));
  });
  it("cream ya KilimoSmart", () => {
    expect(lookOf("KilimoSmart", KILIMO).base).toBe("cream/warm off-white base");
  });
});

describe("T36 renderAvoid", () => {
  const looks = [lookOf("Bilingual Portfolio", DARK_EDITORIAL), lookOf("KilimoSmart", KILIMO)];
  it("Ultron anaona mwonekano (si hex), si stack", () => {
    const b = renderAvoid("ultron", looks);
    expect(b).toMatch(/FRESH START — DO NOT REPEAT/);
    expect(b).toMatch(/near-black\/dark base · cyan accent · fonts Inter \+ Space Grotesk · style: editorial/);
    expect(b).not.toMatch(/#[0-9A-F]{6}/i);
    expect(b).not.toMatch(/STACK HABITS/);
  });
  it("Megatron anaona tabia za stack na anaombwa mbadala", () => {
    const b = renderAvoid("megatron", looks);
    expect(b).toMatch(/STACK HABITS OF RECENT PROJECTS: .*supabase \(1\/2\)/);
    expect(b).toMatch(/name one real alternative/);
    expect(b).not.toMatch(/LOOKS THE COMPANY ALREADY SHIPPED/);
  });
  it("hakuna cha kuonyesha → tupu", () => {
    expect(renderAvoid("cybertron", [lookOf("x", "")])).toBe("");
  });
});

describe("T36 similarTo / diversityWarning", () => {
  it("giza + Inter tena → onyo; cream → hakuna onyo", async () => {
    plans.list = [
      { session_id: "s-old", title: "Bilingual Portfolio", objective: DARK_EDITORIAL, constraints: "", plan_content: "" },
      { session_id: "s-now", title: "Current", objective: "x", constraints: "", plan_content: "" },
    ];
    const again = "Background #0A0A0A, panel #111111, text #F5F5F5; Inter everywhere; accent #FF4D00.";
    expect(similarTo(lookOf("now", again), await recentLooks("s-now"))?.shared).toEqual(expect.arrayContaining(["near-black/dark base", "Inter"]));
    expect(await diversityWarning("s-now", "now", again)).toMatch(/Utofauti \(T36\).*Bilingual Portfolio/);
    expect(await diversityWarning("s-now", "now", KILIMO)).toBe("");
  });
});
