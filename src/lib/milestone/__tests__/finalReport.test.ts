import { describe, expect, it } from "vitest";
import { assembleFinalReport, enforceHonesty, gatherFinalReportData, llmSections, verdictOf, type FinalReportData, type PostDeployResult } from "../finalReport";

const post = (ok: boolean): PostDeployResult => ({ liveUrl: "https://xmdtest.example", ran: true, ok, reason: ok ? "" : "GET / → 500", routes: [{ route: "/", status: ok ? 200 : 500, ok }], checks: [], screens: { count: 3, errors: 0, exit: 0, urls: ["https://cdn/x.png"] }, at: "t" });
const ms = (id: string, status: string, round = 2) => ({ id, title: `T ${id}`, phase: "core", reviewMode: "visual", status: status as never, round, maxRounds: 10, clean: status === "SIGNED_OFF", closed: 1, acceptedProposals: [], build: null, evidenceRound: round, screenshots: [], checks: { pass: 3, fail: 0, error: 0, failed: [] }, technical: null });
const base = (o: Partial<FinalReportData> = {}): FinalReportData => ({
  sessionId: "s", title: "xmdtest-final", project: "xmdtest brief", milestones: [ms("M1", "SIGNED_OFF")], defects: { open: [], inherited: [], waived: [] },
  ledger: [{ agenda_index: 1, agenda_item: "Typography", status: "LOCKED", summary: "Inter" }], minis: [], links: {}, lanes: { calls: 2, byClass: { "gemini-flash": 2 }, visionDegraded: 0, fallback: 0 }, postDeploy: post(true), ...o,
});
const LLM = "## 1. Matokeo\nTovuti imekamilika na kila kitu is complete.\n### Plan ya ziada\nhatua\n## 2. Milestones\nLLM haitakiwi hapa\n## 3. Maamuzi\nA1 Inter.\n## 7. Jinsi ya kuendesha\nnpm run build. key sk-or-v1-0123456789abcdef0123456789abcdef";

describe("TASK-31 final report (honesty rule ya code)", () => {
  it("COMPLETED TU milestones zote signed off + post-deploy PASS", () => {
    expect(verdictOf(base()).complete).toBe(true);
    expect(verdictOf(base()).line).toMatch(/^COMPLETED/);
    expect(verdictOf(base({ postDeploy: null })).line).toBe("PARTIAL — see open defects");
    expect(verdictOf(base({ postDeploy: post(false) })).complete).toBe(false);
    expect(verdictOf(base({ milestones: [ms("M1", "SIGNED_OFF_WITH_WAIVERS"), ms("M2", "SIGNED_OFF")] })).complete).toBe(true);
  });
  it("T2 (code): CAP_REACHED → verdict `CAP_REACHED in M1`, hakuna neno 'complete' kwenye ripoti", () => {
    const d = base({ milestones: [ms("M1", "CAP_REACHED", 2), ms("M2", "NOT_STARTED", 0)] });
    const doc = assembleFinalReport(d, LLM);
    expect(doc.verdict.line).toBe("CAP_REACHED in M1");
    expect(doc.markdown).toMatch(/^\*\*Verdict \(code\):\*\* CAP_REACHED in M1$/m);
    expect(doc.markdown).not.toMatch(/\b(complete[ds]?|imekamilika)\b/i);
    expect(doc.markdown).toContain("[PARTIAL]");
  });
  it("sehemu 7 kwa mpangilio; 2/4/5/6 ni za code (LLM haiwezi kuzibadilisha); vichwa vya ndani vinashushwa (hakuna sehemu ya plan); siri zinafichwa", () => {
    const doc = assembleFinalReport(base(), LLM);
    const heads = [...doc.markdown.matchAll(/^## (\d)\. /gm)].map((m) => Number(m[1]));
    expect(heads).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(doc.markdown).not.toContain("LLM haitakiwi hapa");
    expect(doc.markdown).not.toMatch(/^#+ .*\b(plan|mpango)\b/im);
    expect(doc.markdown).not.toContain("0123456789abcdef0123456789abcdef");
    expect(doc.markdown).toContain("imekamilika"); // verdict COMPLETE → maneno yanaruhusiwa
    expect(doc.missingLlm).toEqual([]);
  });
  it("enforceHonesty: maneno ya Kiingereza na Kiswahili; COMPLETED_VERIFIED (state ya Computer) haiguswi", () => {
    expect(enforceHonesty("Project completed; kazi imekamilika; zimekamilika. COMPLETED_VERIFIED", false)).toBe("Project [PARTIAL]; kazi [PARTIAL]; [PARTIAL]. COMPLETED_VERIFIED");
    expect(llmSections("## 2. x\nA\n## 3. y\n#### Sub\nB")).toEqual({ 3: "**Sub**\nB" });
  });
  it("gather: waivers na inherited zina sababu; rounds, lanes na proposals kutoka store", async () => {
    const store: Record<string, unknown> = {
      map: { milestones: [{ id: "M1", title: "Shop", phase: "core", reviewMode: "visual" }, { id: "M2", title: "Deploy", phase: "quality_deploy", reviewMode: "mixed" }] },
      "state:M1": { status: "SIGNED_OFF_WITH_WAIVERS", round: 4, maxRounds: 10, lanesUsed: [{ laneClass: "gemini-flash", visionDegraded: false }, { laneClass: "xkiro", visionDegraded: true, usedFallback: true }] },
      "state:M2": { status: "CAP_REACHED", round: 2, maxRounds: 2, lanesUsed: [] },
      "waivers:M1": { waivers: [{ defectId: "D-001", reason: "CEO brand sheet allows sentence case", approvedBy: ["designer", "frontend", "pm"] }] },
      defects: { defects: [
        { id: "D-001", milestoneId: "M1", status: "WAIVED", severity: "medium", title: "Nav uppercase", attempts: 3, history: [] },
        { id: "D-002", milestoneId: "M2", status: "INHERITED", inheritedFrom: "M2", severity: "medium", title: "Promo", attempts: 2, history: [{ round: 2, result: "FAIL", cause: "SAME_ROOT_CAUSE" }] },
      ] },
      decisions: { decisions: [{ id: "MS-M1", acceptedProposals: [{ id: "P-02", title: "Bigger CTA" }] }] },
      "evidence:M1:R4": { screenshots: [{ id: "S-001", route: "/", viewport: "375x667", url: "https://cdn/s1.png" }], checks: [] },
      "checks:M1:R4": { results: [{ id: "c1", type: "http", result: "PASS", detail: "" }] },
    };
    const d = await gatherFinalReportData({ get: async <T,>(k: string) => (store[k] as T) ?? null, sessionId: "s", title: "t", project: "p", ledger: [], minis: [], links: {}, postDeploy: null });
    expect(d.milestones.map((m) => [m.id, m.status, m.round])).toEqual([["M1", "SIGNED_OFF_WITH_WAIVERS", 4], ["M2", "CAP_REACHED", 2]]);
    expect(d.lanes).toMatchObject({ calls: 2, visionDegraded: 1, fallback: 1 });
    expect(d.milestones[0].acceptedProposals).toEqual([{ id: "P-02", title: "Bigger CTA" }]);
    const md = assembleFinalReport(d, "").markdown;
    expect(md).toMatch(/D-001 \[medium\] \(M1\) Nav uppercase — sababu: CEO brand sheet allows sentence case · approved by designer, frontend, pm/);
    expect(md).toMatch(/D-002 \[medium\] kutoka M2: Promo — sababu: SAME_ROOT_CAUSE/);
    expect(md).toContain("📸 S-001 `/` 375x667: https://cdn/s1.png");
    expect(md).toContain("**Verdict (code):** CAP_REACHED in M2");
  });
});
