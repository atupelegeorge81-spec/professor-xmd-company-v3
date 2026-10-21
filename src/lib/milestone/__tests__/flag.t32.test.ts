// TASK-32 (E2E run 6): server ya pili bila XMD_MILESTONES iliendeleza session ya milestones kwa njia ya zamani → kinga.
import { describe, expect, it } from "vitest";
import { milestoneResumeBlocked } from "../flag";

describe("TASK-32 · milestoneResumeBlocked", () => {
  it("session ya milestones + flag imezimwa → imezuiwa (haiendelezwi)", () => {
    expect(milestoneResumeBlocked(true, false)).toBe(true);
  });
  it("flag imewashwa, au session ya kawaida → inaendelea kama zamani", () => {
    expect(milestoneResumeBlocked(true, true)).toBe(false);
    expect(milestoneResumeBlocked(false, false)).toBe(false);
    expect(milestoneResumeBlocked(false, true)).toBe(false);
  });
});
