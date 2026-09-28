// src/lib/brain/skills/tools/peer-review.ts
// Port ya K-Dense peer-review scripts:
//   lint_review.py            → lintObjection()  (tone, personal attack, decision/impersonation language, execution claims,
//                                                   placeholders, actionability fields)
//   validate_claim_evidence.py → claimEvidence()  (claim types, SUPPORT_LEVELS, alignment issues, required actions)
//   audit_citations.py        → auditCitations()  (cited vs known sources, malformed, duplicates, uncited, no locator)
// Kanuni ni zile zile; zimebadilishwa kwa muundo wa Board (OBJECTION ni fupi <80 words; owner turn ina
// PROPOSED DECISION / RATIONALE / EVIDENCE; ripoti ina URLs ndani ya maandishi). Ripoti zinatoa rule IDs + hesabu,
// si maandishi ya agent. Zinaendeshwa AUTOMATIC na runTools.ts — logs/facts tu, hazibadilishi flow.
import { canonicalizeUrl, extractCitationsFromText, type SourceLike } from "./research-lookup";

export interface Issue { rule: string; subject: string }
const issue = (rule: string, subject: string): Issue => ({ rule, subject });

// ---------- lint_review.py ----------
const PLACEHOLDER_RE = /^\s*(?:\[(?:write|state|describe|identify|add|cite|section|figure|table|line|explain|request|replace|if)\b[^\]]*\]|TBD|TODO|<[^>]+>)\s*$/i;
const UNRESOLVED_SCAFFOLD_RE = /\[(?:write|state|describe|identify|add|cite|explain|request|replace)\b|\b(?:TBD|TODO)\b|<short concrete concern>|<[a-z ]{3,40}>/i;
const ABUSIVE_RE = /\b(?:idiot(?:ic)?|incompetent|ridiculous|nonsense|garbage|lazy|sloppy|clueless|amateurish|embarrassing|worthless|stupid|dumb)\b/i;
// "authors" → mmiliki/agent yeyote wa Board
const PERSONAL_ATTACK_RE = /\b(?:the\s+)?(?:authors?|owners?|you|he|she|they|optimus|ultron|vextron|megatron|cybertron)\s+(?:do(?:es)?\s+not\s+understand|don't\s+understand|doesn't\s+understand|failed\s+to\s+understand|(?:is|are)\s+unaware|(?:is|are)\s+careless|(?:is|are)\s+dishonest|clearly\s+(?:don't|doesn't)\s+know)\b/i;
// uamuzi si wa observer: kutangaza LOCK / accept / reject kwa niaba ya Board
const EDITORIAL_DECISION_RE = /\b(?:(?:i|we)\s+(?:recommend|would\s+recommend|have\s+decided|decided)\s+(?:accept(?:ance|ing)?|reject(?:ion|ing)?)|recommendation\s*:\s*(?:accept|reject|major\s+revision|minor\s+revision)|(?:i|we)\s+(?:have\s+)?(?:locked|am\s+locking|hereby\s+lock|overrule|veto)\b|the\s+final\s+decision\s+is\b|this\s+decision\s+is\s+(?:now\s+)?(?:final|locked))/i;
const IMPERSONATION_RE = /\b(?:i\s+am\s+(?:the\s+)?(?:ceo|mkuu|chair|editor|assigned\s+reviewer)|on\s+behalf\s+of\s+(?:the\s+)?(?:ceo|mkuu|board|journal|editor)|speaking\s+for\s+(?:the\s+)?(?:ceo|mkuu|board))\b/i;
const EXECUTION_CLAIM_RE = /\bi\s+(?:ran|run|executed|performed|replicated|reproduced|verified|confirmed|tested|benchmarked|measured)\s+(?:the|this|these|it|that|your)\s*(?:analysis|analyses|experiment|experiments|results?|dataset|data|code|script|tests?|page|app|endpoint|build|benchmark)?\b/i;
// actionability (Location / Observation / Evidence or criterion / Why it matters / Requested action) — kwa OBJECTION fupi
const LOCATION_RE = /(["'`“”].{2,60}["'`“”]|#[0-9a-f]{3,8}\b|\b(?:button|link|endpoint|route|api|field|input|form|header|footer|hero|nav\w*|menu|modal|drawer|section|component|class|function|line|file|table|column|colou?r|font|contrast|token|cookie|localstorage|query|index|schema|step|item|agenda|decision|palette|layout|animation|cta|page|screen|price|payment)\b)/i;
const WHY_RE = /\b(?:because|since|so\s+that|otherwise|risk\w*|breaks?|violat\w*|fails?|will\s+cause|causes|leads?\s+to|results?\s+in|exposes?|blocks?|prevents?|cannot|can't|inaccessible|unreadable|insecure|slow|contradicts?|conflicts?)\b|→|->/i;
const ACTION_RE = /\b(?:should|must|replace|use|add|remove|change|require|instead|switch|limit|set|move|rename|split|keep|increase|decrease|reduce|validate|sanitiz\w*|escape|store|hash|encrypt|provide|include|define|clarify|document|test)\b/i;
const EVIDENCE_RE = /\b(?:wcag|owasp|rfc\s?\d+|mdn|w3c|spec\w*|standard|guideline|according\s+to|source|evidence|documented|docs?|benchmark|\d+(?:\.\d+)?\s?(?:%|ms|kb|mb|px|:1))\b|https?:\/\//i;

export interface LintReport { valid: boolean; status: "READY" | "REVISION_REQUIRED"; errors: Issue[]; warnings: Issue[]; fields: Record<string, boolean>; kind: "silent" | "objection" | "note" }

/** Lint observer / objection / review note. `speaker` = persona ya aliyeandika (Optimus anaruhusiwa kusema kama chair). */
export function lintObjection(text: string, speaker = ""): LintReport {
  const body = String(text || "").trim();
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  if (/^SILENT$/i.test(body)) return { valid: true, status: "READY", errors, warnings, fields: {}, kind: "silent" };
  const lines = body.split("\n");
  lines.forEach((line, i) => {
    const subject = `line:${i + 1}`;
    if (ABUSIVE_RE.test(line)) errors.push(issue("ABUSIVE_OR_DISMISSIVE_LANGUAGE", subject));
    if (PERSONAL_ATTACK_RE.test(line)) errors.push(issue("PERSONAL_ATTACK", subject));
    if (EDITORIAL_DECISION_RE.test(line) && speaker !== "optimus") errors.push(issue("DECISION_LANGUAGE_NOT_YOUR_ROLE", subject));
    if (IMPERSONATION_RE.test(line) && !(speaker === "optimus" && /\bchair\b/i.test(line))) errors.push(issue("ROLE_IMPERSONATION_LANGUAGE", subject));
    if (EXECUTION_CLAIM_RE.test(line)) warnings.push(issue("EXECUTION_CLAIM_REQUIRES_PROVENANCE", subject));
    if (UNRESOLVED_SCAFFOLD_RE.test(line) || PLACEHOLDER_RE.test(line)) errors.push(issue("UNRESOLVED_SCAFFOLD_PLACEHOLDER", subject));
  });
  const isObjection = /OBJECTION\s*:/i.test(body);
  const concern = isObjection ? (body.match(/OBJECTION\s*:\s*([\s\S]+?)(?:\n\s*SEVERITY\s*:|$)/i)?.[1] || "") : body;
  const fields = {
    location: LOCATION_RE.test(concern),
    observation: concern.trim().length >= 12,
    evidence_or_criterion: EVIDENCE_RE.test(concern),
    why_it_matters: WHY_RE.test(concern),
    requested_action: ACTION_RE.test(concern),
  };
  if (isObjection) {
    for (const [k, ok] of Object.entries(fields)) {
      if (ok) continue;
      // kwenye objection fupi, location/observation/requested_action ni lazima; evidence/why ni onyo
      if (k === "location" || k === "observation" || k === "requested_action") errors.push(issue("ACTIONABILITY_FIELD_MISSING", k));
      else warnings.push(issue("ACTIONABILITY_FIELD_WEAK", k));
    }
    if (!/SEVERITY\s*:\s*(high|medium|low)/i.test(body)) warnings.push(issue("SEVERITY_MISSING", "document"));
  } else if (!body) {
    warnings.push(issue("NO_STRUCTURED_COMMENTS_FOUND", "document"));
  }
  return { valid: !errors.length, status: errors.length ? "REVISION_REQUIRED" : "READY", errors, warnings, fields, kind: isObjection ? "objection" : "note" };
}

// ---------- validate_claim_evidence.py ----------
export const SUPPORT_LEVELS = ["supported", "partly_supported", "unsupported", "not_assessed"] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];
export const CLAIM_TYPES = ["primary_outcome", "causal", "mechanistic", "prediction", "safety", "generalization", "methods", "other"] as const;
export interface ClaimRow { claim_id: string; claim_type: (typeof CLAIM_TYPES)[number]; support_level: SupportLevel; alignment_issue: string; evidence_ids: string[]; requested_action: boolean }
export interface ClaimReport { valid: boolean; status: "INVALID_MATRIX" | "VALID_WITH_ALIGNMENT_GAPS" | "VALID_NO_RECORDED_GAPS" | "NO_CLAIM"; errors: Issue[]; warnings: Issue[]; claims: ClaimRow[]; support_counts: Record<string, number> }

function claimType(t: string): ClaimRow["claim_type"] {
  const s = t.toLowerCase();
  if (/\b(secur\w*|privacy|safe\w*|auth\w*|password|token|pii|payment|fraud)\b/.test(s)) return "safety";
  if (/\b(causes?|leads? to|results? in|because of|drives?|increases?|decreases?|improves?|reduces?|boosts?)\b/.test(s)) return "causal";
  if (/\b(will|would)\s+(increase|improve|grow|reduce|convert|scale|attract)\b/.test(s)) return "prediction";
  if (/\b(always|never|all users|every(one| user)|everybody|universally|industry standard|best practice)\b/.test(s)) return "generalization";
  if (/\b(how it works|mechanism|under the hood|internally)\b/.test(s)) return "mechanistic";
  if (/\d+(?:\.\d+)?\s?(%|x\b|ms\b|seconds?\b|users\b)/.test(s)) return "primary_outcome";
  if (/\b(use|using|implement|approach|method|framework|library|stack|architecture)\b/.test(s)) return "methods";
  return "other";
}

/** Owner turn → claim matrix (PROPOSED DECISION / UPDATED DECISION / RATIONALE = claims; EVIDENCE = support). */
export function claimEvidence(text: string, sources: SourceLike[] = []): ClaimReport {
  const t = String(text || "");
  const pick = (label: string) => t.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]+?)(?=\\n\\s*\\**(?:PROPOSED DECISION|UPDATED DECISION|RATIONALE|TRADE-OFF|EVIDENCE|RESEARCH_REQUEST|CLARIFY|SKILL_REQUEST|WAIT|AGREE|DISAGREE)\\b|$)`, "i"))?.[1]?.trim() || "";
  const decision = pick("PROPOSED DECISION") || pick("UPDATED DECISION");
  const rationale = pick("RATIONALE");
  const evidence = pick("EVIDENCE");
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const claims: ClaimRow[] = [];
  if (!decision && !rationale) return { valid: true, status: "NO_CLAIM", errors, warnings, claims, support_counts: {} };
  const known = new Set(sources.map((s) => canonicalizeUrl(s.url)));
  const knownTitles = sources.map((s) => (s.title || "").toLowerCase()).filter((x) => x.length > 8);
  const cited = extractCitationsFromText(evidence);
  const evidenceIds = cited.map((c) => c.url);
  const matchesKnown = cited.some((c) => known.has(c.url)) || knownTitles.some((ti) => evidence.toLowerCase().includes(ti.slice(0, 40)));
  const unknownUrls = cited.filter((c) => c.type === "url" && !known.has(c.url));
  [["C1", decision], ["C2", rationale]].forEach(([id, body]) => {
    if (!body) return;
    const type = claimType(body);
    let support: SupportLevel;
    let alignment = "none";
    if (!evidence) { support = sources.length ? "unsupported" : "not_assessed"; alignment = sources.length ? "scope" : "none"; }
    else if (matchesKnown) support = "supported";
    else { support = "partly_supported"; alignment = "uncertainty"; }
    // kauli ya namba bila namba kwenye evidence → magnitude
    if (support === "supported" && /\d+(?:\.\d+)?\s?%/.test(body) && !/\d/.test(evidence)) { support = "partly_supported"; alignment = "magnitude"; }
    const hasAction = /\b(should|must|will|use|implement|adopt|choose|set|build)\b/i.test(body);
    claims.push({ claim_id: id, claim_type: type, support_level: support, alignment_issue: alignment, evidence_ids: evidenceIds, requested_action: hasAction });
    if (support === "supported" && !evidenceIds.length && !matchesKnown) errors.push(issue("SUPPORTED_CLAIM_HAS_NO_EVIDENCE", id));
    if (support === "partly_supported" && alignment === "none") errors.push(issue("PARTIAL_CLAIM_NEEDS_ISSUE_CODE", id));
    if (support === "unsupported") warnings.push(issue("CLAIM_WITHOUT_EVIDENCE_LINE", id));
    if (support !== "supported" && !hasAction) warnings.push(issue("REQUESTED_ACTION_MISSING", id));
    if ((type === "causal" || type === "mechanistic") && support === "supported") warnings.push(issue("CAUSAL_OR_MECHANISTIC_SUPPORT_REQUIRES_EXPERT_REVIEW", id));
  });
  for (const u of unknownUrls) warnings.push(issue("EVIDENCE_URL_NOT_IN_BOARD_SOURCES", u.url.slice(0, 120)));
  const support_counts: Record<string, number> = {};
  for (const c of claims) support_counts[c.support_level] = (support_counts[c.support_level] || 0) + 1;
  const gaps = claims.some((c) => c.support_level !== "supported");
  return { valid: !errors.length, status: errors.length ? "INVALID_MATRIX" : gaps ? "VALID_WITH_ALIGNMENT_GAPS" : "VALID_NO_RECORDED_GAPS", errors, warnings, claims, support_counts };
}

// ---------- audit_citations.py ----------
export interface CitationReport { valid: boolean; errors: Issue[]; warnings: Issue[]; cited: number; known: number; unknown: number; uncited: number; malformed: number; duplicates: number }

/** Ripoti/maandishi dhidi ya vyanzo vya Board: kila URL iliyotajwa lazima iwe kati ya vyanzo vilivyopatikana. */
export function auditCitations(text: string, sources: SourceLike[] = []): CitationReport {
  const t = String(text || "");
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const known = new Map(sources.map((s) => [canonicalizeUrl(s.url), s]));
  const all = [...t.matchAll(/https?:\/\/[^\s)\]>,"'`]+/gi)].map((m) => m[0].replace(/[.,;:]+$/, ""));
  const canon = all.map(canonicalizeUrl);
  const counts = new Map<string, number>();
  canon.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
  let malformed = 0;
  t.split("\n").forEach((line, i) => {
    // [text](  ) tupu, au (http:/ …) iliyovunjika, au [@key] bila chanzo
    if (/\]\(\s*\)/.test(line) || /\bhttps?:\/(?!\/)/i.test(line) || /\bhttps?:\/\/\s/i.test(line)) { malformed++; errors.push(issue("MALFORMED_CITATION_SYNTAX", `line:${i + 1}`)); }
  });
  for (const raw of all) {
    try { const u = new URL(raw); if (!u.hostname.includes(".")) { malformed++; errors.push(issue("MALFORMED_CITATION_SYNTAX", raw.slice(0, 80))); } } catch { malformed++; errors.push(issue("MALFORMED_CITATION_SYNTAX", raw.slice(0, 80))); }
  }
  const uniqueCited = [...new Set(canon)];
  const unknown = uniqueCited.filter((c) => !known.has(c));
  for (const u of unknown) errors.push(issue("CITATION_WITHOUT_REFERENCE", u.slice(0, 120)));
  const uncited = [...known.keys()].filter((k) => !counts.has(k));
  if (uncited.length) warnings.push(issue("REFERENCE_NOT_CITED", `${uncited.length} source(s)`));
  const duplicates = [...counts.values()].filter((n) => n > 1).length;
  const noLocator = sources.filter((s) => !s.url).length;
  if (noLocator) warnings.push(issue("REFERENCE_HAS_NO_PERSISTENT_LOCATOR", `${noLocator} source(s)`));
  // [1] [2] marejeo ya namba bila orodha
  const numRefs = new Set([...t.matchAll(/\[(\d{1,2})\](?!\()/g)].map((m) => m[1]));
  if (numRefs.size && !/^\s*(?:\[\d{1,2}\]|\d{1,2}\.)\s+.*https?:\/\//m.test(t)) warnings.push(issue("NUMBERED_CITATIONS_WITHOUT_LIST", `${numRefs.size} key(s)`));
  return { valid: !errors.length, errors, warnings, cited: uniqueCited.length, known: known.size, unknown: unknown.length, uncited: uncited.length, malformed, duplicates };
}

/** Muhtasari wa rule IDs kwa log (hakuna maandishi ya agent). */
export const ruleSummary = (xs: Issue[]) => {
  const m = new Map<string, number>();
  xs.forEach((x) => m.set(x.rule, (m.get(x.rule) || 0) + 1));
  return [...m.entries()].map(([r, n]) => (n > 1 ? `${r}×${n}` : r)).join(", ");
};
