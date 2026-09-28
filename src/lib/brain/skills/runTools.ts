// src/lib/brain/skills/runTools.ts — tools za skills zinazoendeshwa AUTOMATIC (agents hawaziombi).
// Kila tool ni port ya script ya GitHub (tazama tools/<skill>.ts). Matokeo = LOGS + FACTS tu:
// hazibadilishi flow ya mjadala, verdicts wala maamuzi. Kila wito unaandika muda wake.
import { brainLine, type BlogFn } from "../brainLog";
import { dedupeSources, rankSources, tierSummary, type SourceLike } from "./tools/research-lookup";
import { lintObjection, claimEvidence, auditCitations, ruleSummary } from "./tools/peer-review";
import { probeHtml, probeBlock } from "./tools/webapp-testing";
import { findArbitraryWaits, waitsBlock } from "./tools/systematic-debugging";
import { checkCompletionClaims } from "./tools/verification-before-completion";

const safe = <T>(fn: () => T, fallback: T): T => {
  try { return fn(); } catch { return fallback; }
};

/** research-lookup: dedupe (DOI/PMID/URL/title) + rank (tier, recency) + log ya tiers. Inarudisha orodha mpya. */
export function curateSources<T extends SourceLike>(results: T[], who: string, blog?: BlogFn, pool?: T[]): T[] {
  if (!Array.isArray(results) || !results.length) return results;
  const t0 = Date.now();
  return safe(() => {
    const { unique, duplicates } = dedupeSources(results);
    const { ranked, classes } = rankSources(unique);
    const kept = ranked.filter((_, i) => classes[i].tier !== "exclude");
    const out = kept.length ? kept : ranked;
    if (pool) pool.push(...out);
    blog?.("info", brainLine("tool.research-lookup", who, [`sources ${results.length}→${out.length}`, duplicates ? `dupes ${duplicates}` : "", tierSummary(classes)], Date.now() - t0));
    return out;
  }, results);
}

/** peer-review/validate_claim_evidence: owner turn (PROPOSED/UPDATED DECISION + EVIDENCE). */
export function onOwnerTurn(text: string, sources: SourceLike[], who: string, blog?: BlogFn) {
  const t0 = Date.now();
  const r = safe(() => claimEvidence(text, sources), null);
  if (!r || r.status === "NO_CLAIM") return r;
  const counts = Object.entries(r.support_counts).map(([k, n]) => `${k} ${n}`).join(", ");
  blog?.(r.errors.length || r.warnings.length ? "warning" : "info", brainLine("tool.claim-evidence", who, [r.status, counts, r.claims.map((c) => `${c.claim_id}:${c.claim_type}`).join(" "), ruleSummary([...r.errors, ...r.warnings])], Date.now() - t0));
  return r;
}

/** peer-review/lint_review: observer note / objection. */
export function onObserverNote(text: string, who: string, persona: string, blog?: BlogFn) {
  const t0 = Date.now();
  const r = safe(() => lintObjection(text, persona), null);
  if (!r || r.kind === "silent") return r;
  const fields = Object.entries(r.fields).filter(([, ok]) => ok).length;
  blog?.(r.valid && !r.warnings.length ? "info" : "warning", brainLine("tool.review-lint", who, [r.kind, r.status, `fields ${fields}/5`, ruleSummary([...r.errors, ...r.warnings])], Date.now() - t0));
  return r;
}

/** webapp-testing + systematic-debugging: FACTS kwa prompt ya reviewer (STATIC PROBE + condition-based waiting). */
export function reviewFacts(allCode: string, who: string, blog?: BlogFn): { text: string; openFindings: number } {
  const t0 = Date.now();
  return safe(() => {
    const probe = probeHtml(allCode);
    const waits = findArbitraryWaits(allCode);
    const text = [probeBlock(probe), waitsBlock(waits)].filter(Boolean).join("\n\n");
    const openFindings = probe.warnings.length + waits.findings.length;
    if (probe.applicable || waits.findings.length)
      blog?.("info", brainLine("tool.static-probe", who, [
        probe.applicable ? `buttons ${probe.counts.buttons} · links ${probe.counts.links} · inputs ${probe.counts.inputs} · forms ${probe.counts.forms} · images ${probe.counts.images}` : "no markup",
        `findings ${probe.warnings.length}`,
        waits.findings.length ? `arbitrary waits ${waits.findings.length}` : "",
      ], Date.now() - t0));
    return { text, openFindings };
  }, { text: "", openFindings: 0 });
}

/** verification-before-completion: verdict ya reviewer (APPROVE bila ushahidi / na findings zilizo wazi). */
export function onReviewVerdict(text: string, who: string, openFindings: number, blog?: BlogFn) {
  const t0 = Date.now();
  const r = safe(() => checkCompletionClaims(text), null);
  if (!r) return r;
  const approve = /^APPROVE/i.test(String(text).trim());
  if (!approve && !r.flags.length) return r;
  const notes = [approve ? "APPROVE" : "verdict", r.flags.length ? `red flags: ${r.flags.join(", ")}` : "", approve && openFindings ? `${openFindings} probe finding(s) still open` : "", r.evidence.length ? `evidence: ${r.evidence.join(", ")}` : "no stated evidence"];
  blog?.(r.flags.length || (approve && openFindings) ? "warning" : "info", brainLine("tool.verification", who, notes, Date.now() - t0));
  return r;
}

/** peer-review/audit_citations: ripoti ya mwisho dhidi ya vyanzo vyote vya Board. */
export function onReport(report: string, sources: SourceLike[], blog?: BlogFn) {
  const t0 = Date.now();
  // R27: URL ndani ya code (wa.me/…, ramani, *.example) si citations — ripoti ya R27 ilionyesha "NOT in board sources 10" za uongo
  const prose = String(report || "").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "")
    .replace(/https?:\/\/(?:[\w-]+\.)*(?:example(?:\.com|\.org|\.net)?|localhost|test|invalid)(?::\d+)?(?![\w.-])[^\s)\]>"']*/gi, "");
  const r = safe(() => auditCitations(prose, sources), null);
  if (!r) return r;
  blog?.(r.errors.length ? "warning" : "info", brainLine("tool.audit-citations", "Optimus", [`cited ${r.cited}`, `board sources ${r.known}`, r.unknown ? `NOT in board sources ${r.unknown}` : "", r.malformed ? `malformed ${r.malformed}` : "", r.duplicates ? `repeated ${r.duplicates}` : "", ruleSummary(r.warnings)], Date.now() - t0));
  return r;
}
