// src/lib/board/openRecord.ts — R21: rekodi ya UKWELI ya agenda iliyobaki OPEN (inaingia Ledger decision_detail).
// Chanzo: Mama Lishe A6 — owners wote 3 walisema AGREE lakini Ledger iliandika "hakuna consensus ya kutosha" tu;
// ripoti na agents wa A10 wakabuni sababu ("namba ya simu / muundo wa ujumbe") na maswali mapya.
// Hii haibadilishi status (inabaki OBJECTED_OPEN) — inaeleza tu kilichotokea kweli.
//
// R37 (Sehemu D): closeRecord — rekodi ya ukweli ya kila kufunga kwa Itifaki ya Kufunga (rough consensus /
// fallback / defer ya ndani). Kila kufunga kisicho consensus rahiti kina: jinsi ilivyofunga, pendekezo,
// nani alikubali, DISSENT (imeerekodiwa, haizuii), guards zilizoondoa mapendekezo (na QUOTE za sentensi
// zilizotrigga — uwasi wa A2), na assumptions za owners. Hakuna agent anayebuni sababu tena.

export interface OpenFacts {
  reason: string; // delib.closedReason au "hakuna consensus ya kutosha"
  proposal: string; // pendekezo la mwisho lililokuwa mezani ("" kama halikukamatwa)
  proposedBy?: string; // jina
  owners: string[]; // majina ya owners
  agreed: string[]; // majina ya owners waliosema AGREE kwa pendekezo hilo
}

export interface CloseFacts {
  kind: "rough" | "fallback" | "defer";
  reason: string; // closeReason (kura/kikomo/defer)
  proposal: string; // pendekezo lililofungwa ("" kwa defer)
  proposedBy?: string;
  owners: string[];
  agreed: string[]; // owners walio rekodi AGREE
  dissent: { name: string; text: string }[]; // kura/owners walio pinga — IMEREKODIWA, haizuii ujenzi
  kills: { by: string; guard: string; hits: string[]; quote: string; turn: number }[]; // R37 (A2): guard kill-log
  assumptions: string[]; // ASSUMPTION za owners (zimekusanywa kwenye mjadala)
}

const KIND_LABEL: Record<CloseFacts["kind"], string> = {
  rough: "ROUGH CONSENSUS — kura ya mwisho: wingi (dissent imerekodiwa, haizuii)",
  fallback: "FALLBACK — toleo la chini salama kutoka yaliyojadiliwa + ASSUMPTION wazi",
  defer: "DEFER YA NDANI — kilitokosekana kimeandikwa wazi; kazi inaendelea kwenye computer",
};

export function closeRecord(f: CloseFacts): string {
  const others = f.owners.filter((o) => !f.agreed.includes(o));
  const lines = [
    `**Hali:** LOCKED · ${KIND_LABEL[f.kind]} — Itifaki ya Kufunga (R37); hakuna hali ya OPEN.`,
    `**Jinsi ilivyofunga:** ${f.reason.trim() || "kura ya mwisho"}.`,
  ];
  if (f.proposal.trim()) {
    lines.push(`**Pendekezo lililofungwa${f.proposedBy ? ` (la ${f.proposedBy})` : ""}:**\n> ${f.proposal.trim().slice(0, 2500).replace(/\n/g, "\n> ")}`);
  }
  lines.push(`**Owners waliokubali (AGREE):** ${f.agreed.length ? f.agreed.join(", ") : "hakuna aliyerekodiwa"}${others.length ? ` · **Hawakurekodi kukubali:** ${others.join(", ")}` : ""}.`);
  if (f.dissent.length) {
    lines.push(`**DISSENT (imeerekodiwa, haizuii ujenzi):**\n${f.dissent.map((d) => `- ${d.name}: ${String(d.text).replace(/\s+/g, " ").slice(0, 220)}`).join("\n")}`);
  }
  if (f.kills.length) {
    lines.push(`**Guards zilizoondoa mapendekezo (uwasi wa mfumo — R37/A2):**\n${f.kills.map((k) => `- ${k.by} (zamu ${k.turn}): ${k.guard}${k.hits.length ? ` [${k.hits.join(", ")}]` : ""} — "${k.quote.replace(/\s+/g, " ").slice(0, 200)}"`).join("\n")}`);
  }
  if (f.assumptions.length) {
    lines.push(`**ASSUMPTIONS za owners (zinafuatwa na build):**\n${f.assumptions.slice(0, 6).map((a) => `- ${a.replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}`);
  }
  return lines.join("\n");
}

export function openRecord(f: OpenFacts): string {
  const others = f.owners.filter((o) => !f.agreed.includes(o));
  const lines = [
    `**Hali:** OPEN — haikufungwa kwenye Ledger; hakuna uamuzi wa mwisho.`,
    `**Sababu halisi ya kubaki OPEN:** ${f.reason.trim() || "hakuna consensus ya kutosha"}.`,
  ];
  if (f.proposal.trim()) {
    lines.push(`**Pendekezo la mwisho lililokuwa mezani${f.proposedBy ? ` (la ${f.proposedBy})` : ""} — SI uamuzi:**\n> ${f.proposal.trim().slice(0, 2500).replace(/\n/g, "\n> ")}`);
  } else {
    lines.push(`**Pendekezo la mwisho lililokuwa mezani:** engine haikukamata pendekezo lolote (angalia mjadala wa agenda hii).`);
  }
  lines.push(`**Owners waliokubali (AGREE):** ${f.agreed.length ? f.agreed.join(", ") : "hakuna aliyerekodiwa"}${others.length ? ` · **Hawakurekodiwa kukubali:** ${others.join(", ")}` : ""}.`);
  return lines.join("\n");
}
