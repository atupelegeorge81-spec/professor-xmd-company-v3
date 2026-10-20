// TASK-5 (maelezo5) — orphan sweeper: sehemu safi (pure). Tests za server halisi: docs/tests/task-5.md.
import { describe, expect, it } from "vitest";
import { pack } from "../server/packed";
import { RESUME_PREFIX } from "../usageChip";
import { cuChipItem, readCuChip } from "./engine";
import {
  ORPHAN_CHIP_TEXT, ORPHAN_STALE_MS, decideOrphan, isInProgressStatus, itemsOfDoc, markRecovered, orphanStaleMs, pauseMetaOf,
} from "./autoResume";

const NOW = 1_800_000_000_000;
const stateChip = (extra: Record<string, unknown> = {}) => ({
  kind: "chip", id: "__professor_xmd_resume_state__",
  text: RESUME_PREFIX + JSON.stringify({ version: 2, runnerId: "r1", agenda: [{ index: 1, item: "xmdtest" }], done: [], ...extra }),
});
const base = { status: "agenda_1_locked", updatedAtMs: NOW - 11 * 60_000, items: [stateChip()], liveRunner: false, now: NOW, staleMs: ORPHAN_STALE_MS };

describe("TASK-5 orphan — status (option A, allowlist)", () => {
  it("status za kazi inayoendelea = wagombea", () => {
    for (const s of ["running", "title_created", "agenda_created", "facts_locked", "report_saved", "plan_saved", "agenda_2_locked", "agenda_3_open", "agenda_1_mini", "agenda_1_mini_resume", "report_part_A", "plan_part_2", "review_R-M1-0", "review_R-M12-3"]) {
      expect(isInProgressStatus(s), s).toBe(true);
    }
  });
  it("terminal / zisizojulikana hazigusiwi", () => {
    for (const s of ["completed", "error", "paused", "finale_incomplete", "stopped", "", "in_progress", "agenda_x_locked", "running2", "review_R-Mx-1", "review_"]) {
      expect(isInProgressStatus(s), s).toBe(false);
    }
  });
});

describe("TASK-5 orphan — decideOrphan", () => {
  it("masharti yote → orphan", () => {
    const d = decideOrphan(base);
    expect(d.orphan).toBe(true);
    expect(d.staleMin).toBe(11);
  });
  it("runner hai → skipped (live runner)", () => {
    expect(decideOrphan({ ...base, liveRunner: true })).toMatchObject({ orphan: false, reason: "live runner" });
  });
  it("bado fresh → skipped (fresh) + muda uliobaki", () => {
    const d = decideOrphan({ ...base, updatedAtMs: NOW - 4 * 60_000 });
    expect(d).toMatchObject({ orphan: false, reason: "fresh", becomesStaleInMs: 6 * 60_000 });
  });
  it("bila resume state → skipped (no resume state)", () => {
    expect(decideOrphan({ ...base, items: [{ kind: "msg", id: "m" }] })).toMatchObject({ orphan: false, reason: "no resume state" });
  });
  it("CU chip yenye sandbox inatosha kama resume state", () => {
    expect(decideOrphan({ ...base, status: "running", items: [cuChipItem({ v: 1, token: "t", maxI: 3, sandboxId: "sb1" })] }).orphan).toBe(true);
  });
  it("CU chip bila sandbox/snapshot na bila resume state → skipped", () => {
    expect(decideOrphan({ ...base, status: "running", items: [cuChipItem({ v: 1, token: "t", maxI: 3 })] })).toMatchObject({ reason: "no resume state" });
  });
  it("user-paused (Detach) haiguswi", () => {
    expect(decideOrphan({ ...base, items: [stateChip({ pauseOrigin: "user" })] })).toMatchObject({ orphan: false, reason: "user paused" });
  });
  it("completed/paused haziguswi hata zikiwa za zamani", () => {
    expect(decideOrphan({ ...base, status: "completed", updatedAtMs: NOW - 86_400_000 })).toMatchObject({ orphan: false, reason: "status completed" });
    expect(decideOrphan({ ...base, status: "finale_incomplete" })).toMatchObject({ orphan: false, reason: "status finale_incomplete" });
    expect(decideOrphan({ ...base, status: "stopped" })).toMatchObject({ orphan: false, reason: "status stopped" });
  });
  it("Computer imeisha (chip done) → skipped", () => {
    expect(decideOrphan({ ...base, status: "running", items: [stateChip(), cuChipItem({ v: 1, token: "t", maxI: 3, sandboxId: "s", done: true })] })).toMatchObject({ reason: "computer done" });
  });
});

describe("TASK-5 orphan — markRecovered + pauseMetaOf (njia ya checkPausedDue)", () => {
  it("awamu ya mjadala: resume state inapata system pause + resumeAt=+60s + chip inayoonekana", () => {
    const out = markRecovered([stateChip()], NOW);
    const meta = pauseMetaOf(out);
    expect(meta).toMatchObject({ source: "resume_state", pauseOrigin: "system", resumeAt: NOW + 60_000 });
    expect(out[out.length - 1]).toMatchObject({ kind: "chip", text: ORPHAN_CHIP_TEXT });
    const st = JSON.parse(out[0].text.slice(RESUME_PREFIX.length));
    expect(st.agenda).toHaveLength(1); // hali nyingine haiguswi
  });
  it("awamu ya Computer: CU chip inapata system pause (sandbox/snapshot zinabaki)", () => {
    const out = markRecovered([stateChip(), cuChipItem({ v: 1, token: "t", maxI: 3, sandboxId: "sb1" })], NOW);
    expect(pauseMetaOf(out)).toMatchObject({ source: "cu", pauseOrigin: "system", resumeAt: NOW + 60_000 });
    expect(readCuChip(out)?.sandboxId).toBe("sb1");
  });
  it("pauseMetaOf: CU chip done → null (haiendelezwi)", () => {
    expect(pauseMetaOf([stateChip({ resumeAt: NOW }), cuChipItem({ v: 1, token: "t", maxI: 3, done: true })])).toBeNull();
  });
});

describe("TASK-5 — itemsOfDoc (bug ya checkPausedDue: items zilizobanwa)", () => {
  const items = [stateChip(), { kind: "msg", id: "m", content: "x".repeat(20_000) }];
  it("gz1: (≥16k) inasomwa", () => {
    const packed = pack(JSON.stringify(items));
    expect(packed.startsWith("gz1:")).toBe(true);
    expect(itemsOfDoc({ items: packed })).toHaveLength(2);
  });
  it("JSON ya kawaida + array + tupu", () => {
    expect(itemsOfDoc({ items: JSON.stringify([stateChip()]) })).toHaveLength(1);
    expect(itemsOfDoc({ items: [stateChip()] })).toHaveLength(1);
    expect(itemsOfDoc({})).toEqual([]);
    expect(itemsOfDoc({ items: "si json" })).toEqual([]);
  });
});

describe("TASK-5 — test hook ya staleness ni inert bila XMD_TEST_HOOKS=1", () => {
  it("default 10 dk; env ya test inafanya kazi TU na hooks", () => {
    expect(orphanStaleMs({})).toBe(600_000);
    expect(orphanStaleMs({ XMD_TEST_ORPHAN_STALE_MS: "30000" })).toBe(600_000);
    expect(orphanStaleMs({ XMD_TEST_HOOKS: "1", XMD_TEST_ORPHAN_STALE_MS: "30000" })).toBe(30_000);
    expect(orphanStaleMs({ XMD_TEST_HOOKS: "1", XMD_TEST_ORPHAN_STALE_MS: "abc" })).toBe(600_000);
  });
});

describe("TASK-5 — paused ya SYSTEM bila resumeAt (pengo la SIGTERM, uamuzi wa CEO)", () => {
  it("paused + pauseOrigin system + bila resumeAt + stale + bila runner → orphan", () => {
    expect(decideOrphan({ ...base, status: "paused", items: [stateChip({ pauseOrigin: "system" })] }).orphan).toBe(true);
  });
  it("paused ya user (Detach) → haiguswi", () => {
    expect(decideOrphan({ ...base, status: "paused", items: [stateChip({ pauseOrigin: "user" })] })).toMatchObject({ orphan: false, reason: "user paused" });
  });
  it("paused bila origin (ya zamani/manual) → haiguswi", () => {
    expect(decideOrphan({ ...base, status: "paused", items: [stateChip()] })).toMatchObject({ orphan: false, reason: "paused (not system)" });
  });
  it("paused yenye resumeAt (quota) → checkPausedDue inaishughulikia, sweeper haiguswi", () => {
    expect(decideOrphan({ ...base, status: "paused", items: [stateChip({ pauseOrigin: "system", resumeAt: NOW + 5_000 })] })).toMatchObject({ orphan: false, reason: "paused with resumeAt (checkPausedDue)" });
    expect(decideOrphan({ ...base, status: "paused", items: [stateChip({ pauseOrigin: "system" }), cuChipItem({ v: 1, token: "t", maxI: 3, sandboxId: "s", resumeAt: NOW, pauseOrigin: "system" })] })).toMatchObject({ reason: "paused with resumeAt (checkPausedDue)" });
  });
  it("paused system lakini runner hai (cooldown ya watchdog yenye timer) → haiguswi", () => {
    expect(decideOrphan({ ...base, status: "paused", liveRunner: true, items: [stateChip({ pauseOrigin: "system" })] })).toMatchObject({ reason: "live runner" });
  });
  it("paused system lakini bado fresh → subiri", () => {
    expect(decideOrphan({ ...base, status: "paused", updatedAtMs: NOW - 60_000, items: [stateChip({ pauseOrigin: "system" })] })).toMatchObject({ reason: "fresh" });
  });
});

describe("TASK-5 — hali ya pamoja (Next.js inapakia module mara 2)", () => {
  it("nakala mbili za module zinashiriki inflight/throttle/timers (globalThis)", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    const a = await import("./autoResume");
    vi.resetModules();
    const b = await import("./autoResume");
    expect(a).not.toBe(b); // nakala mbili halisi
    const g = (globalThis as any).__xmdAutoResumeState;
    expect(g?.inflight).toBeInstanceOf(Set);
    g.lastSweep = Date.now(); // nakala A "imesweep" sasa hivi
    expect(await b.sweepOrphans()).toBe(0); // nakala B inaona throttle ileile → haisweep tena
  });
});

