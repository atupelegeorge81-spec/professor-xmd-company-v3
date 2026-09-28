// src/lib/server/packed.ts — R18: maandishi makubwa (items za session, maudhui ya ripoti) yanabanwa kabla ya Appwrite.
// Session ya Mama Lishe ilikuwa herufi 404,021 → 156K baada ya kubanwa (38%). Kikomo cha Appwrite kimepandishwa pia
// (items 2M · content 1M), lakini kubana kunaweka nafasi kubwa zaidi. Documents za zamani (JSON ya kawaida) zinasomeka kama zilivyo.
import { gunzipSync, gzipSync } from "node:zlib";

const PFX = "gz1:";

/** Bana kama ni kubwa (≥ minLen); ndogo zinabaki JSON/maandishi ya kawaida (rahisi kusoma kwenye console ya Appwrite). */
export function pack(text: string, minLen = 16_000): string {
  if (text.length < minLen) return text;
  return PFX + gzipSync(Buffer.from(text, "utf8"), { level: 9 }).toString("base64");
}

/** Fungua (inakubali pia maandishi ya zamani yasiyobanwa). */
export function unpack(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (!s.startsWith(PFX)) return s;
  try {
    return gunzipSync(Buffer.from(s.slice(PFX.length), "base64")).toString("utf8");
  } catch {
    return "";
  }
}

export const isPacked = (v: unknown) => typeof v === "string" && v.startsWith(PFX);
