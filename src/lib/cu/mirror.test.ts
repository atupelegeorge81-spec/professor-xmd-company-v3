// mirror.test.ts — R44-A: kiovu cha faili (pure logic) + liveness ping.
import { describe, expect, it } from "vitest";
import { applyMirrorEvent, mirrorPathOf, sandboxAlive, mirrorMapOf } from "./mirror";

describe("mirrorPathOf", () => {
  it("inaleta path ya ws kama relative", () => {
    expect(mirrorPathOf("/home/user/ws/src/App.tsx")).toBe("src/App.tsx");
    expect(mirrorPathOf("src/App.tsx")).toBe("src/App.tsx");
  });
  it("inarukua installs/locks/jenga (si kazi ya mikono ya agent)", () => {
    expect(mirrorPathOf("/home/user/ws/node_modules/react/index.js")).toBeNull();
    expect(mirrorPathOf("/home/user/ws/package-lock.json")).toBeNull();
    expect(mirrorPathOf("/home/user/ws/dist/bundle.js")).toBeNull();
    expect(mirrorPathOf("/home/user/ws/.git/config")).toBeNull();
  });
  it("inakataa nje ya ws + traversal + faili za engine", () => {
    expect(mirrorPathOf("/home/user/cu_brain.py")).toBeNull();
    expect(mirrorPathOf("/etc/passwd")).toBeNull();
    expect(mirrorPathOf("/home/user/ws/../secrets")).toBeNull();
    expect(mirrorPathOf("")).toBeNull();
  });
});

describe("applyMirrorEvent", () => {
  it("WRITE kamili: preview inahifadhiwa", () => {
    const m = new Map<string, string>();
    const row = applyMirrorEvent(m, { type: "exec_start", tool: "write_file", path: "/home/user/ws/src/a.ts", preview: "const x = 1;\n" });
    expect(row).toEqual({ path: "src/a.ts", content: "const x = 1;\n" });
    expect(m.get("src/a.ts")).toBe("const x = 1;\n");
  });
  it("WRITE ya pili ina-BADILISHA (update ya kiovu — si kuongeza)", () => {
    const m = new Map([["src/a.ts", "const x = 1;"]]);
    const row = applyMirrorEvent(m, { type: "exec_start", tool: "write_file", path: "/home/user/ws/src/a.ts", preview: "const x = 2;" });
    expect(row?.content).toBe("const x = 2;");
    expect(m.size).toBe(1);
  });
  it("EDIT: old_str→new_str ina-aplikiwa kwenye yaliyopo", () => {
    const m = new Map([["src/a.ts", "const x = 1;\nconst y = 2;\n"]]);
    const row = applyMirrorEvent(m, { type: "exec_start", tool: "edit_file", path: "/home/user/ws/src/a.ts", old_str: "const x = 1;", new_str: "const x = 42;" });
    expect(row?.content).toBe("const x = 42;\nconst y = 2;\n");
  });
  it("EDIT isiyojulikana inarukwa kimya (tar ya dakika 10 itafunika)", () => {
    const m = new Map([["src/a.ts", "const x = 1;"]]);
    const row = applyMirrorEvent(m, { type: "exec_start", tool: "edit_file", path: "/home/user/ws/src/a.ts", old_str: "HAKUNA", new_str: "kitu" });
    expect(row).toBeNull();
    expect(m.get("src/a.ts")).toBe("const x = 1;");
  });
  it("events zisizo za exec_start / bila path-inayoruhusiwa zinarukwa", () => {
    const m = new Map();
    expect(applyMirrorEvent(m, { type: "usage" })).toBeNull();
    expect(applyMirrorEvent(m, { type: "exec_start", tool: "write_file", path: "/home/user/ws/node_modules/x.js", preview: "x" })).toBeNull();
    expect(applyMirrorEvent(m, { type: "exec_start", tool: "write_file", path: "/home/user/ws/a.ts", preview: "" })).toBeNull();
  });
});

describe("sandboxAlive (R44-C)", () => {
  it("echo inapita → true", async () => {
    const sbx = { commands: { run: async () => ({}) } };
    await expect(sandboxAlive(sbx)).resolves.toBe(true);
  });
  it("maiti (throw) → false · null → false", async () => {
    const sbx = { commands: { run: async () => { throw new Error("not found"); } } };
    await expect(sandboxAlive(sbx)).resolves.toBe(false);
    await expect(sandboxAlive(null)).resolves.toBe(false);
  });
});

describe("mirrorMapOf", () => {
  it("map moja kwa cu — inarudishwa kila mara", () => {
    const cu: any = {};
    const m1 = mirrorMapOf(cu);
    const m2 = mirrorMapOf(cu);
    expect(m1).toBe(m2);
    m1.set("a", "b");
    expect(mirrorMapOf(cu).get("a")).toBe("b");
  });
});
