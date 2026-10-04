import { describe, expect, it } from "vitest";
import type { FactSheet } from "./factSheet";
import { guardText } from "./dataGuard";

const facts: FactSheet = {
  version: 1,
  name: "Duka la Matunda la Temeke",
  address: "Mtaa wa Chang'ombe, Temeke, Dar es Salaam",
  hours: [{ days: "Jumatatu–Jumamosi", time: "07:00–18:00", open: "07:00", close: "18:00" }],
  services: [
    { name: "Nanasi", price: "TSh 1000", amount: 1000 },
    { name: "Embe", price: "TSh 800", amount: 800 },
  ],
  currency: "TSh",
  phone: { value: "0755 222 333", placeholder: false, file: null },
  email: { value: null, forbidden: true },
  rules: [],
  constraints: [],
  closed: ["Jumapili: IMEFUNGWA"],
  source: "parser",
};

const kinds = (md: string) => guardText(md, facts, {}).map((h) => h.kind);

describe("dataGuard · R30.1 (E4) — false positives za Temeke", () => {
  it("E4a: apostrofi NDANI ya neno (Chang'ombe) HAIVUNGI anwani rasmi", () => {
    const md = [
      "## 2. Official Data",
      "- Address: Mtaa wa Chang'ombe, Temeke, Dar es Salaam",
      '',
      'WhatsApp: `<a href="https://wa.me/255755222333">Tuma oda</a>`',
      "Anwani lazima iwe `Mtaa wa Chang'ombe, Temeke, Dar es Salaam` ndani ya `<address>`.",
      '"address": "Mtaa wa Chang\'ombe, Temeke, Dar es Salaam"',
    ].join("\n");
    expect(kinds(md)).toEqual([]);
  });

  it("E4b: wa.me ya kimataifa (255755222333 / +255 755 222 333) ni sawa na 0755 222 333", () => {
    const md = [
      "Link: https://wa.me/255755222333 — Tuma oda",
      "Alt: https://wa.me/+255755222333",
      "Tel: +255 755 222 333",
      "Namba: 0755 222 333",
    ].join("\n");
    expect(kinds(md)).toEqual([]);
  });

  it("simu mbaya kweli bado inakamatwa (R24: 255700000000)", () => {
    const md = "Link: https://wa.me/255700000000 — Tuma oda";
    expect(kinds(md)).toContain("simu");
  });

  it("anwani iliyobadilishwa kweli bado inakamatwa (sehemu isiyo rasmi)", () => {
    const md = "- Address: Mtaa wa Chang'ombe, Sinza, Dar es Salaam";
    expect(kinds(md)).toContain("anwani");
  });

  it("anwani fupi kama anwani rasmi (JSON address field) bado inaalamishwa 'haipo'", () => {
    const md = '"address": "Mtaa wa Chang\'ombe, Temeke"';
    const ks = kinds(md);
    expect(ks).toContain("anwani");
  });

  it("bei/saa za makosa bado zinakamatwa (guard haujapunguzwa)", () => {
    const md = "Nanasi ni TSh 1500 na saa ni 09:00–20:00";
    const ks = kinds(md);
    expect(ks).toContain("bei");
    expect(ks).toContain("saa");
  });
});
