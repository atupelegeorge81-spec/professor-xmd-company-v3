// src/lib/board/assemble.ts — R26 (Awamu 5): SCRIPT YA MWISHO KIDETERMINISTIC.
//
// R24: Optimus (LLM) aliandika upya script kutoka vipande → A7/A9 zilipotea, A3 ilikatika katikati ya CSS, na
// "NYONGEZA" hazikuwekwa alama. Sasa code inakusanya faili KWA NJIA (path) kutoka approved_code ya Ledger:
//   • toleo kamili moja kwa kila faili (codeBlocks.bestBlocks)
//   • faili ile ile kwenye agenda mbili → agenda ya BAADAYE inashinda (imeandikwa wazi)
//   • faili za data za mfumo (DATA RASMI) zinashinda zote
//   • ukaguzi wa ukamilifu: kila agenda yenye code lazima ionekane (au itajwe kuwa faili zake zilichukuliwa na agenda nyingine)
// Hakuna LLM → hakuna kinachobuniwa, hakuna kinachopotea. PURE — hakuna I/O.

import { bestBlocks, extOf, type CodeBlock } from "./codeBlocks";
import { dataRefHits, type DataFile } from "./dataFiles";

export interface Piece { itemIndex: number; itemText: string; writerName: string; code: string; status?: string }
export interface AssembledFile { path: string; lang: string; body: string; agenda: number | null; writer: string; complete: boolean; replaced: { agenda: number; writer: string }[]; status?: string }
export interface Assembly { files: AssembledFile[]; markdown: string; missingAgendas: number[]; coveredBy: Record<number, number[]>; incomplete: string[]; problems: string[] }

export function assembleScript(pieces: Piece[], dataFiles: DataFile[] = [], o: { title?: string; openAgendas?: number[] } = {}): Assembly {
  const byPath = new Map<string, AssembledFile>();
  const order: string[] = [];
  const agendasWithCode = new Set<number>();
  const sorted = [...pieces].sort((a, b) => a.itemIndex - b.itemIndex);
  const counter: Record<string, number> = {};
  for (const p of sorted) {
    const blocks: CodeBlock[] = bestBlocks(p.code);
    if (!blocks.length) continue;
    agendasWithCode.add(p.itemIndex);
    for (const b of blocks) {
      let path = b.path;
      if (!path) {
        const k = `${p.itemIndex}-${p.writerName}`;
        counter[k] = (counter[k] || 0) + 1;
        path = `agenda-${p.itemIndex}/${p.writerName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${counter[k] > 1 ? `-${counter[k]}` : ""}.${extOf(b.lang)}`;
      }
      const prev = byPath.get(path);
      const f: AssembledFile = { path, lang: b.lang || extOf(b.lang), body: b.body.replace(/\s+$/, ""), agenda: p.itemIndex, writer: p.writerName, complete: b.complete, replaced: [], status: p.status };
      if (prev) {
        // toleo la agenda ya baadaye linashinda — lakini toleo KAMILI halibadilishwi na lililokatika
        if (!b.complete && prev.complete) { prev.replaced.push({ agenda: p.itemIndex, writer: p.writerName }); continue; }
        f.replaced = [...prev.replaced, { agenda: prev.agenda ?? 0, writer: prev.writer }];
        byPath.set(path, f);
      } else {
        byPath.set(path, f);
        order.push(path);
      }
    }
  }
  // faili za mfumo (DATA RASMI) — zinashinda toleo lolote la agent
  const sysFirst: string[] = [];
  for (const d of dataFiles) {
    const hit = [...byPath.keys()].find((k) => k.split("/").pop() === d.path.split("/").pop());
    const prev = hit ? byPath.get(hit) : undefined;
    const f: AssembledFile = { path: d.path, lang: "json", body: d.content, agenda: null, writer: "Mfumo (DATA RASMI)", complete: true, replaced: prev ? [...prev.replaced, { agenda: prev.agenda ?? 0, writer: prev.writer }] : [] };
    if (hit && hit !== d.path) { byPath.delete(hit); order.splice(order.indexOf(hit), 1); }
    byPath.set(d.path, f);
    if (!order.includes(d.path)) sysFirst.push(d.path);
  }
  const finalOrder = [...sysFirst, ...order.filter((p) => byPath.has(p))];
  const files = finalOrder.map((p) => byPath.get(p)!);

  // ukamilifu: agenda zenye code ambazo hazina faili hata moja kwenye script
  const present = new Set(files.map((f) => f.agenda).filter((x): x is number => x !== null));
  const coveredBy: Record<number, number[]> = {};
  const missingAgendas: number[] = [];
  for (const a of agendasWithCode) {
    if (present.has(a)) continue;
    const by = files.filter((f) => f.replaced.some((r) => r.agenda === a)).map((f) => f.agenda ?? 0);
    if (by.length) coveredBy[a] = [...new Set(by)];
    else missingAgendas.push(a);
  }
  const incomplete = files.filter((f) => !f.complete).map((f) => f.path);
  const open = new Set(o.openAgendas || []);

  // R28: afya ya kila faili (kwa code, si LLM) — R28 A4: faq.astro yenye alama za patch na `configData.hours`
  //      (config.json haina hours) iliingia kwenye script ya mwisho bila onyo lolote kwenye kichwa chake.
  const STATUS: Record<string, string> = { rejected: "⚠️ code haikupitishwa na mkaguzi", unreviewed: "⚠️ haikukaguliwa na mkaguzi", data_errors: "⛔ ina tofauti na DATA RASMI" };
  const health = new Map<string, string[]>();
  const problems: string[] = [];
  for (const f of files) {
    if (f.agenda === null) continue;
    const h: string[] = [];
    if (f.status && STATUS[f.status]) h.push(STATUS[f.status]);
    if (/^[ \t]*(?:<{7}[ \t]*SEARCH|>{7}[ \t]*REPLACE)[ \t]*$/m.test(f.body)) h.push("⛔ ina alama za patch (<<<<<<< SEARCH / >>>>>>> REPLACE) — haitacompile");
    const refs = dataRefHits(f.body, dataFiles);
    if (refs.length) h.push(`⛔ inasoma field isiyokuwepo: ${refs.slice(0, 4).map((r) => `\`${r.ref}\` (${r.file.split("/").pop()})`).join(", ")}`);
    if (h.length) health.set(f.path, h);
    for (const x of h) if (x.startsWith("⛔")) problems.push(`\`${f.path}\` (Agenda ${f.agenda}): ${x.slice(2)}`);
  }

  const rows = files.map((f, i) => {
    const src = f.agenda === null ? "DATA RASMI (mfumo)" : `Agenda ${f.agenda}${open.has(f.agenda) ? " (OPEN)" : ""}`;
    const note = [!f.complete ? "⚠️ ilikatika" : "", f.replaced.length ? `imechukua nafasi ya ${f.replaced.map((r) => (r.agenda ? `A${r.agenda}` : "mfumo")).join(", ")}` : "", ...(health.get(f.path) || [])].filter(Boolean).join(" · ") || "✓";
    return `| ${i + 1} | \`${f.path}\` | ${src} | ${f.writer} | ${note} |`;
  });
  const md = [
    `# 📦 Script ya Mwisho${o.title ? ` — ${o.title}` : ""}`,
    "",
    "> Imeunganishwa na **mfumo** (si LLM) kutoka code iliyokubaliwa kwenye Ledger — neno kwa neno, hakuna kilichoongezwa wala kubuniwa. Faili za data zimeandikwa kutoka DATA RASMI ya brief.",
    "",
    "| # | Faili | Chanzo | Mwandishi | Hali |",
    "|---|---|---|---|---|",
    ...rows,
    ...(Object.keys(coveredBy).length ? ["", ...Object.entries(coveredBy).map(([a, by]) => `- Agenda ${a}: faili zake zimesasishwa na Agenda ${by.join(", ")} (toleo la baadaye ndilo limetumika).`)] : []),
    ...(missingAgendas.length ? ["", `- ⚠️ Agenda ${missingAgendas.join(", ")}: code yake haikusomeka (hakuna faili iliyotambulika).`] : []),
    ...(incomplete.length ? ["", `- ⚠️ Faili ${incomplete.length} hazikukamilika (zilikatika kabla ya kufungwa): ${incomplete.map((p) => `\`${p}\``).join(", ")}.`] : []),
    ...(problems.length ? ["", "> ⛔ **Matatizo ya code yaliyogunduliwa na mfumo (si LLM) — rekebisha kabla ya kutumia:**", ...problems.map((x) => `> - ${x}`)] : []),
    "",
    ...files.flatMap((f, i) => [
      `### ${i + 1}. \`${f.path}\` — ${f.agenda === null ? "DATA RASMI (mfumo)" : `Agenda ${f.agenda} (${f.writer})`}${open.has(f.agenda ?? -1) ? " · ⚠️ agenda hii ni OPEN" : ""}${health.has(f.path) ? ` · ${health.get(f.path)!.join(" · ")}` : ""}`,
      "",
      "```" + (f.lang || ""),
      f.body,
      "```",
      "",
    ]),
  ].join("\n");
  return { files, markdown: md.trim(), missingAgendas, coveredBy, incomplete, problems };
}
