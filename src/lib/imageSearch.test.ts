// T36: picha za mfano — umbo la swali + tokeo (jibu la Commons API lililorekodiwa 2026-10-22, limefupishwa).
import { describe, it, expect, vi, afterEach } from "vitest";
import { imageQueryOf, searchImages } from "./imageSearch";

const COMMONS = { query: { pages: { "1": { index: 1, title: "File:Interior Johnie's Coffee Shop 2021.jpg", imageinfo: [{ mime: "image/jpeg", width: 3409, height: 2502,
  thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Interior_Johnie%27s_Coffee_Shop_2021.jpg/1600px-x.jpg",
  descriptionurl: "https://commons.wikimedia.org/wiki/File:Interior_Johnie%27s_Coffee_Shop_2021.jpg",
  extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "<a href='x'>Someone</a>" } } }] },
  "2": { index: 2, title: "File:tiny.png", imageinfo: [{ mime: "image/png", width: 200, height: 100, url: "https://x/tiny.png" }] } } } };

afterEach(() => vi.unstubAllGlobals());

describe("T36 imageQueryOf", () => {
  it("images:/picha:/photos: tu", () => {
    expect(imageQueryOf("images: coffee shop interior")).toBe("coffee shop interior");
    expect(imageQueryOf("Picha: mlima kilimanjaro")).toBe("mlima kilimanjaro");
    expect(imageQueryOf("best coffee shop design 2026")).toBeNull();
  });
});

describe("T36 searchImages", () => {
  it("Commons → IMAGE_URL + leseni + credit; picha ndogo zinaachwa", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => ({ ok: true, json: async () => (String(u).includes("wikimedia") ? COMMONS : { results: [] }) })));
    const r = await searchImages("coffee shop interior");
    expect(r).toHaveLength(1);
    expect(r[0].url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(r[0].content).toMatch(/^IMAGE_URL: https:\/\/upload\.wikimedia\.org\/.+ · size 3409x2502 · licence CC BY-SA 4\.0 · credit Someone/);
  });
});
