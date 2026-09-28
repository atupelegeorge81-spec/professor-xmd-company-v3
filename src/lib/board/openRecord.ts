// src/lib/board/openRecord.ts — R21: rekodi ya UKWELI ya agenda iliyobaki OPEN (inaingia Ledger decision_detail).
// Chanzo: Mama Lishe A6 — owners wote 3 walisema AGREE lakini Ledger iliandika "hakuna consensus ya kutosha" tu;
// ripoti na agents wa A10 wakabuni sababu ("namba ya simu / muundo wa ujumbe") na maswali mapya.
// Hii haibadilishi status (inabaki OBJECTED_OPEN) — inaeleza tu kilichotokea kweli.

export interface OpenFacts {
  reason: string; // delib.closedReason au "hakuna consensus ya kutosha"
  proposal: string; // pendekezo la mwisho lililokuwa mezani ("" kama halikukamatwa)
  proposedBy?: string; // jina
  owners: string[]; // majina ya owners
  agreed: string[]; // majina ya owners waliosema AGREE kwa pendekezo hilo
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
