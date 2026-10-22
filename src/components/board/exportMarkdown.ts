// src/components/board/exportMarkdown.ts — "Export .md" ya Board Room (R10: aina ZOTE za items).
// Audit R9: export ya zamani ilikuwa na agenda/turn/script/seal/report tu — observers, pingamizi,
// supersede, review, deliverables, validator, assembly, notices na summary zilipotea.
// Memory: hali tu (idadi), maudhui HAYAONYESHWI (sheria ya Brain).
import { getAgent, type AgentId } from "@/lib/team";
import type { StageItem } from "@/lib/stage/types";
import { renderMemo, type MemoRecord } from "@/lib/milestone/reviewMemory";

/** TASK-34: rekodi za `memo:Mk` (mini-report ya review, TASK-33) kutoka items zilizohifadhiwa za session.
 *  Chat inaonyesha badge ya "mini report imeandikwa" tu — maudhui kamili yanasomeka kwenye export hii. */
const MS_STORE_PREFIX = "__PROFESSOR_XMD_MILESTONE__:";
export function memosFromSaved(items: { kind?: string; text?: string }[]): MemoRecord[] {
  const out: MemoRecord[] = [];
  for (const it of items || []) {
    if (it?.kind !== "chip" || typeof it.text !== "string" || !it.text.startsWith(MS_STORE_PREFIX)) continue;
    try {
      const r = JSON.parse(it.text.slice(MS_STORE_PREFIX.length));
      if (typeof r?.key === "string" && r.key.startsWith("memo:") && Array.isArray(r.data?.entries)) out.push(r.data as MemoRecord);
    } catch { /* rekodi iliyoharibika haizuii export */ }
  }
  return out.sort((a, b) => a.milestoneId.localeCompare(b.milestoneId, undefined, { numeric: true }));
}

const name = (id: AgentId) => getAgent(id)?.name || id;
const fence = (lang: string, code: string) => ["```" + (lang || "text"), code.replace(/\s+$/, ""), "```"];
const sources = (list?: { title: string; url: string }[]) => (list?.length ? [list.map((x) => `- [${x.title || x.url}](${x.url})`).join("\n"), ""] : []);

export function boardMarkdown(title: string, prompt: string, items: StageItem[], shotData: Record<string, string> = {}, memos: MemoRecord[] = []): string {
  const L: string[] = [`# ${title || "Board Room"}`, "",
    `_Imeandaliwa: ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC · Export kamili (R35): discussion → maamuzi → mpango → XMD Computer (mawazo, commands+output, diff, picha, nidhamu, ripoti)_`, ""];
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
      /* TASK-34: milestone mode */
      case "msMap": L.push("### 🚩 Milestones", "", ...it.milestones.map((m) => `- **${m.id}** ${m.title} — A${m.from}–A${m.to} · ${m.status}${m.round ? ` · R${m.round}` : ""}`), ""); break;
      case "msMark": {
        const r = it.round ?? 0;
        if (it.mark === "enter") L.push(`## 🚩 ${it.ms} · ${it.title || ""}`, "");
        else if (it.mark === "computer") L.push(`#### 🖥️ ${it.ms} · XMD Computer ${r ? `— marekebisho R${r}` : "— build"}`, "");
        else if (it.mark === "review") L.push(`#### 🔎 ${it.ms} · Reviewers ${r ? `— uthibitisho R${r}` : "— ukaguzi huru R0"}`, "");
        else L.push(`#### 💬 ${it.reviewId || it.ms} · Mjadala${it.title ? ` — ${it.title}` : ""}`, "");
        break;
      }
      case "msCos":
        L.push(`**🔧 Marekebisho ya Optimus · ${it.ms} R${it.round}**`, "", ...it.cos.flatMap((c) => [
          `- **${c.id}** (P${c.priority}, jaribio ${c.attempt}, ${c.mode}) ${c.defectIds.join(", ")} — ${c.desired}`,
          ...(c.current ? [`  - Sasa: ${c.current}`] : []),
          ...(c.files.length || c.route || c.selector ? [`  - Mahali: ${[...c.files, c.route, c.selector].filter(Boolean).join(" · ")}`] : []),
          ...c.acceptance.map((a) => `  - ✓ ${a}`),
        ]), "");
        break;
      case "msReport": if (it.doc) L.push("---", "", it.doc, ""); break;
      case "cuDivider":
        break;
      case "cuRun":
        L.push("---", "", `### 🖥️ XMD Computer — ${it.task}`, "",
          `- Hali: ${it.status === "run" ? "inaendelea" : it.status === "error" ? `imesimama${it.finalState ? ` (${it.finalState}${it.finalReason ? ` — ${it.finalReason}` : ""})` : ""}` : it.status === "paused" ? "imepumzika (quota)" : "imekamilika, HAIJATHIBITISHWA bado (completed, NOT yet verified)"} · hatua ${it.step} · ${it.requests} LLM calls · ${it.tokens.toLocaleString()} tokens · files ${it.filesCount} · screenshots ${it.screenshots}`,
          it.github ? `- GitHub: ${it.github}` : "", it.deploy ? `- Live: ${it.deploy}` : "", "",
          ...(it.files.length ? ["**Files za mwisho za workspace:**", "", ...it.files.slice(0, 60).map((f) => `- \`${typeof f === "string" ? f : f.path}\`${typeof f === "object" && f.isDir ? "/" : typeof f === "object" ? ` (${f.size}B)` : ""}`), ""] : []));
        break;
      case "cuThink":
        // R35: thought KAMILI (haikatwi 300) — kila detail
        if (it.text) L.push("> 💭 **[thought]** " + it.text.replace(/\n/g, "\n> "), "");
        break;
      case "cuText":
        if (it.text) L.push(it.text, "");
        break;
      case "cuHook":
        L.push(`- 🛡️ **nidhamu/${it.hookKind}${it.streak ? ` ×${it.streak}` : ""}**: ${it.text}${it.command ? ` (cmd: \`${it.command.slice(0, 120)}\`)` : ""}`);
        break;
      case "cuExec": {
        // R35: command KAMILI + output + diff — kila detail ya utekelezaji
        const head = `**⚙️ Hatua ${it.step} · ${it.tool}${it.path ? ` · \`${it.path}\`` : ""}${it.exit !== undefined && it.exit !== 0 ? ` · ❌ exit ${it.exit}` : it.ms ? ` · ${(it.ms / 1000).toFixed(1)}s` : ""}**`;
        L.push(head, "", ...fence("bash", it.command || it.tool));
        if (it.oldStr || it.newStr) {
          L.push("", "**Diff:**", "", ...fence("diff", `--- before\n+++ after\n${it.oldStr ? it.oldStr.split("\n").map((l) => `- ${l}`).join("\n") : ""}\n${it.newStr ? it.newStr.split("\n").map((l) => `+ ${l}`).join("\n") : ""}`));
        } else if (it.preview) {
          L.push("", "**Maudhui:**", "", ...fence("text", it.preview.slice(0, 4000)));
        }
        if (it.output) L.push("", "**Output:**", "", ...fence("text", it.output.slice(0, 4000)));
        L.push("");
        break;
      }
      case "cuShot":
        // R35: PICHA YENYEWE inaingizwa kama data-URI (shotData: fileId → base64)
        if (shotData[it.fileId]) L.push(`**📸 ${it.label}** (step ${it.step})`, "", `![${it.label}](${shotData[it.fileId]})`, "");
        else L.push(`- 📸 ${it.label}${it.fileId ? ` (picha: /api/boardroom/cu-file?bucket=${it.bucketId}&file=${it.fileId})` : " (haipakuliwi)"}`);
        break;
      case "cuLink":
        L.push(it.link === "github" ? `- GitHub: ${it.url}` : `- Live: ${it.url}`);
        break;
      case "cuError":
        L.push(`- ⚠️ ${it.message}`);
        break;
      case "cuReport":
        L.push("---", "", "### 📑 Ripoti ya XMD Computer", "", it.doc, "");
        break;
    }
  }
  // TASK-34: mini-report za review — KAMILI (ingizo zote, si 3 za mwisho tu kama kwenye prompts)
  for (const rec of memos) {
    if (!rec.entries?.length) continue;
    L.push("---", "", `## 📝 Mini-report ya review · ${rec.milestoneId}`, "", renderMemo(rec, Infinity), "");
  }
  return L.join("\n").replace(/\n{3,}/g, "\n\n");
}
