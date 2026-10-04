// src/components/board/exportMarkdown.ts — "Export .md" ya Board Room (R10: aina ZOTE za items).
// Audit R9: export ya zamani ilikuwa na agenda/turn/script/seal/report tu — observers, pingamizi,
// supersede, review, deliverables, validator, assembly, notices na summary zilipotea.
// Memory: hali tu (idadi), maudhui HAYAONYESHWI (sheria ya Brain).
import { getAgent, type AgentId } from "@/lib/team";
import type { StageItem } from "@/lib/stage/types";

const name = (id: AgentId) => getAgent(id)?.name || id;
const fence = (lang: string, code: string) => ["```" + (lang || "text"), code.replace(/\s+$/, ""), "```"];
const sources = (list?: { title: string; url: string }[]) => (list?.length ? [list.map((x) => `- [${x.title || x.url}](${x.url})`).join("\n"), ""] : []);

export function boardMarkdown(title: string, prompt: string, items: StageItem[]): string {
  const L: string[] = [`# ${title || "Board Room"}`, ""];
  if (prompt) L.push(`> ${prompt.replace(/\n/g, "\n> ")}`, "");
  for (const it of items) {
    switch (it.kind) {
      case "user": if (it.text && it.text !== prompt) L.push(`> **Mkuu:** ${it.text}`, ""); break;
      case "convene": L.push(`_${it.mode === "resume" ? "♻️ Board Room imeendelea" : it.mode === "reattach" ? "🔗 Imeunganishwa tena" : "🏛️ Board Room imeanza"}${it.sessionId ? ` · session ${it.sessionId.slice(0, 8)}` : ""}_`, ""); break;
      case "scope": if (it.text) L.push(`🧭 **Optimus ameelewa:** ${it.text}`, ""); break;
      case "agendaBuild": if (it.items.length) L.push("### 📋 Agenda", "", ...it.items.map((a) => `${a.index}. ${a.title} — owners: ${a.owners.map(name).join(", ")}${a.requiresCode ? " · code" : ""}`), ""); break;
      case "agendaStart": L.push(`## Agenda ${it.agenda.index}/${it.total}: ${it.agenda.title}`, "", `_Owners: ${it.agenda.owners.map(name).join(", ")}_`, ""); break;
      case "evidence": L.push(`🔎 **${name(it.agent)} — evidence:** ${it.trace.query}`, "", ...sources(it.trace.sources)); break;
      case "turn":
        if (it.search?.query) L.push(`🔎 _${name(it.agent)} ametafuta:_ ${it.search.query}`, "");
        if (it.content) L.push(`**${name(it.agent)}${it.role !== "owner" ? ` (${it.role})` : ""}${it.skill ? ` · skill: ${it.skill.name}` : ""}:**`, "", it.content, "", ...sources(it.search?.sources));
        break;
      case "consensus":
        if (it.event === "reached") L.push(`🤝 **Consensus imefikiwa** (v${it.version}) — ${it.approvals.map(name).join(", ")}`, "");
        else if (it.event === "exhausted") L.push("⏳ **Zamu zimeisha bila consensus**", "");
        else if (it.event === "reset") L.push(`↺ _Proposal mpya (v${it.version}) ya ${name(it.by)} — idhini zimeanza upya_`, "");
        break;
      case "chair": L.push(`⚖️ **Optimus (Mwenyekiti) → ${name(it.target)} [${it.reason}]:** ${it.text}`, ""); break;
      case "script":
        if (it.code) L.push(`**${name(it.agent)} — ${it.file} (v${it.version})${it.replaced ? " — imebadilishwa na toleo jipya" : ""}${it.patch ? ` · patch ${it.patch.reason}: +${it.patch.add} −${it.patch.del}` : ""}**`, "", ...(it.replaced ? [`_(toleo hili limebadilishwa: +${it.replaced.add} −${it.replaced.del})_`] : fence(it.lang, it.code)), "");
        break;
      case "review": if (it.verdict !== "pending") L.push(`🧪 **Review ya ${name(it.agent)} (round ${it.round}/${it.maxRounds}): ${it.verdict === "approve" ? "APPROVE ✅" : "REJECT ❌"}**`, ...it.notes.map((n) => `- ${n}`), ""); break;
      case "deliverable": L.push(`📦 **Deliverable:** ${it.file} (${it.lines} lines) — ${name(it.agent)} · ${it.agenda}`, ""); break;
      case "task": if (it.state === "done" && it.task !== "agenda") L.push(`_⚙️ ${it.text.replace(/…$/, "")}${it.result ? ` — ${it.result}` : ""}${it.ms ? ` (${(it.ms / 1000).toFixed(1)}s)` : ""}_`, ""); break;
      case "memory": if (it.done) L.push(`_🧠 ${it.scope === "agenda" ? `Memory checkpoint · agenda ${it.agenda}` : it.scope === "reflection" ? "Final reflection" : "Optimus ameunganisha memory"}: ${it.agents.filter((a) => a.state === "saved").length}/${it.agents.length} zimehifadhiwa (binafsi)_`, ""); break;
      case "seal":
        L.push(`${it.status === "LOCKED" ? "🔒 **LOCKED**" : "🟠 **OPEN**"} v${it.version}${it.superseded ? " _(superseded)_" : ""}${it.ledgerId ? ` · Ledger ${it.ledgerId.slice(0, 8)}` : ""}`, "", it.decision.replace(/\s*\[Condition added by [^\]]+\]\s*:?\s*/gi, "\n\n- Sharti: "), "");
        if (it.rationale) L.push(`- **Sababu:** ${it.rationale}`);
        if (it.tradeoff) L.push(`- **Trade-off:** ${it.tradeoff}`);
        if (it.constraints.length) L.push(`- **Masharti:**`, ...it.constraints.map((c) => `  - ${c}`));
        L.push("");
        break;
      case "observers":
        L.push(`👁️ **Observers:** ${it.checks.map((c) => `${name(c.agent)} ${c.state === "silent" ? "SILENT" : c.state === "objection" ? "OBJECTION" : c.state}`).join(" · ")}`, "");
        if (it.objection) L.push(`🛑 **Pingamizi (${name(it.objection.agent)}, ${it.objection.severity}):** ${it.objection.concern}`, "");
        break;
      case "supersede": L.push(`🔁 **SUPERSEDED** — pingamizi la ${name(it.objector)}, jibu la ${name(it.responder)}`, "", `- ~~v${it.from.version}: ${it.from.text}~~`, `- **v${it.to.version}:** ${it.to.text}`, ""); break;
      case "overruled": L.push(`↩️ **Pingamizi limekataliwa** (${name(it.objector)} → ${name(it.responder)}): ${it.concern}`, `- Sababu: ${it.reason}`, ""); break;
      case "validator": if (it.done) L.push(`✅ **Validator (${it.scope}):** ${it.rows.map((r) => `A${r.index} ${r.state}`).join(" · ")}`, ""); break;
      case "assembly": if (it.code) L.push(`🧩 **Script ya mwisho — ${it.file}** (vipande ${it.pieces.length})`, "", ...fence(it.file.split(".").pop() || "text", it.code), ""); break;
      case "report": if (it.doc) L.push("---", "", it.doc, ""); break;
      case "plan": if (it.doc) L.push("---", "", it.doc, ""); break;
      case "notice": L.push(`> ${it.tone === "error" || it.tone === "halt" ? "❌" : it.tone === "warn" ? "⚠️" : it.tone === "retry" || it.tone === "rotate" ? "♻️" : "ℹ️"} ${it.text}${it.detail ? ` — ${it.detail}` : ""}`, ""); break;
      case "summary":
        L.push("### 📊 Muhtasari wa session", "", `- Muda: ${Math.round(it.seconds / 60)} min · LOCKED ${it.locked} · SUPERSEDED ${it.superseded} · OPEN ${it.open} · sources ${it.sources} · requests ${it.requests}`, ...it.usage.map((u) => `- ${u.agent === "computer" ? "🖥️ XMD Computer" : name(u.agent)}: ${u.requests} requests · ${u.tokens.toLocaleString()} tokens`), "");
        break;
      case "cuRun":
        L.push("---", "", `### 🖥️ XMD Computer — ${it.task}`, "",
          `- Hali: ${it.status === "run" ? "inaendelea" : it.status === "error" ? "imesimama" : "imekamilika"} · steps ${it.step} · ${it.requests} LLM calls · ${it.tokens.toLocaleString()} tokens · files ${it.filesCount}`,
          it.github ? `- GitHub: ${it.github}` : "", it.deploy ? `- Live: ${it.deploy}` : "",
          ...(it.execs.length ? ["", "**Utekelezaji:**", ...it.execs.map((r) => `- \`${(r.command || r.tool).slice(0, 120)}\`${r.exit !== undefined && r.exit !== 0 ? ` (exit ${r.exit})` : r.ms ? ` (${(r.ms / 1000).toFixed(1)}s)` : ""}`)] : []),
          ...(it.shots.length ? ["", `**Screenshots (${it.shots.length}):** ${it.shots.map((s) => s.label).join(", ")}`] : []), "");
        break;
      case "cuReport":
        L.push("---", "", "### 📑 Ripoti ya XMD Computer", "", it.doc, "");
        break;
    }
  }
  return L.join("\n").replace(/\n{3,}/g, "\n\n");
}
