// src/lib/milestone/ocb.ts — TASK 11: Operation Context Block (OCB). Imejengwa na CODE kutoka state, kamwe si LLM.
// Kila agent anajua mazingira yote: tuko wapi, kuna XMD Computer, nini kinafuata, nani anasoma jibu lake, round ipi.
// Pure (hakuna I/O). HAIJAUNGANISHWA na prompts bado (wiring: tasks 14–26) — withOCB ni helper tu.

import { AGENTS } from "@/lib/agents";
import { estimateTokens } from "@/lib/broker/estimate";
import type { MilestoneMap } from "./types";

export const OCB_STAGES = ["MAP", "DISCUSS", "PLAN", "BUILD", "REVIEW_ANALYSE", "REVIEW_DISCUSS", "REVIEW_VERIFY", "FIX", "FINAL_REPORT"] as const;
export type OcbStage = (typeof OCB_STAGES)[number];

/** Agent id ya code (agents.ts: pm/designer/frontend/backend/qa) au "computer". */
export type OcbSelf = "pm" | "designer" | "frontend" | "backend" | "qa" | "computer";

export interface OcbInput {
  project: { name: string; summary: string };
  map: MilestoneMap | null; // null wakati wa MAP (ramani bado inaundwa)
  stage: OcbStage;
  milestoneId?: string;
  agenda?: { index: number; title: string };
  round?: { current: number; max: number } | null;
  self: OcbSelf;
  /** Hiari: kubadilisha mtumiaji wa jibu; vinginevyo jedwali la code (consumerOf) linaamua. */
  consumer?: { role: string; use: string };
  counts: { lockedDecisions: number; milestonesDone: string[]; openDefects: number; waivers: number };
}

export const OCB_MAX_TOKENS = 1200;
const OPEN = "=== OPERATION CONTEXT (read this first) ===";
const END = "=== END ===";

// ── Timu halisi (agents.ts — FLOW-MAP A) ─────────────────────────────────────
const agent = (id: string) => AGENTS.find((a) => a.id === id);
const nameOf = (id: string) => agent(id)?.name || id;
const roleOf = (id: string) => agent(id)?.role || id;
/** Roster ya ramani inatumia majina kwa herufi ndogo ("optimus", "ultron", …) → agent wa agents.ts. */
const byRosterName = (n: string) => AGENTS.find((a) => a.name.toLowerCase() === String(n).toLowerCase());

function teamLine(): string {
  const others = AGENTS.filter((a) => a.id !== "pm").map((a) => `${a.name} (${a.role})`);
  return `OUR TEAM: ${nameOf("pm")} (lead: agenda, milestone map, plans, final report) · ${others.join(" · ")}.`;
}

const PIPELINE =
  "PIPELINE: 1 agendas + milestone map -> 2 per milestone: discuss agendas -> ledger + mini-reports -> 3 Optimus writes the milestone plan -> 4 Computer builds + writes a build report -> 5 harness collects evidence -> 6 two reviewers analyse, team discusses, Optimus writes change orders -> 7 Computer fixes; evidence again; two reviewers verify (up to 10 rounds) -> 8 sign-off, next milestone -> 9 final report for the CEO; last milestone ends with push + deploy.";

const COMPUTER_LINE =
  "XMD COMPUTER: autonomous engineer in a sandbox: writes code, runs commands, takes screenshots. It does NOT see our discussion. It only gets: the milestone plan, ledger decisions, change orders. It follows instructions literally and cannot ask questions.";

const RULES =
  "RULES: the ledger is authoritative; do not contradict locked decisions (raise a change request instead); back every claim with evidence (screenshot id, measurement, command output).";

const STAGE_LABEL: Record<OcbStage, string> = {
  MAP: "MAP (step 1: agendas + milestone map)",
  DISCUSS: "DISCUSS (step 2: agenda discussion)",
  PLAN: "PLAN (step 3: milestone plan)",
  BUILD: "BUILD (step 4: Computer builds)",
  REVIEW_ANALYSE: "REVIEW_ANALYSE (step 6: reviewers analyse evidence)",
  REVIEW_DISCUSS: "REVIEW_DISCUSS (step 6: team discusses findings)",
  REVIEW_VERIFY: "REVIEW_VERIFY (step 7: reviewers verify fixes)",
  FIX: "FIX (step 7: Computer fixes)",
  FINAL_REPORT: "FINAL_REPORT (step 9: report for the CEO)",
};

// ── Hali ya sasa ndani ya ramani ─────────────────────────────────────────────
function milestoneCtx(input: OcbInput) {
  const ms = input.map?.milestones || [];
  const i = input.milestoneId ? ms.findIndex((m) => m.id === input.milestoneId) : -1;
  const cur = i >= 0 ? ms[i] : undefined;
  const nextM = i >= 0 ? ms[i + 1] : undefined;
  return { ms, i, cur, nextM, isLast: i >= 0 && i === ms.length - 1 };
}

function hereLine(input: OcbInput, titleMax = 120): string {
  const { ms, i, cur } = milestoneCtx(input);
  const parts = [`YOU ARE HERE: ${STAGE_LABEL[input.stage]}`];
  if (cur) {
    const t = cur.title.length > titleMax ? `${cur.title.slice(0, titleMax - 1)}…` : cur.title;
    parts.push(`Milestone ${cur.id}: ${t} (agendas ${cur.agendas.from}–${cur.agendas.to}), milestone ${i + 1} of ${ms.length}`);
  } else if (input.stage === "MAP") parts.push("milestone map is being created now (no milestone yet)");
  else if (input.stage === "FINAL_REPORT") parts.push(`all ${ms.length} milestone(s) finished`);
  if (input.agenda) { const a = input.agenda.title; parts.push(`agenda ${input.agenda.index}: ${a.length > titleMax ? `${a.slice(0, titleMax - 1)}…` : a}`); }
  if (input.round && input.round.current > 0) parts.push(`round ${input.round.current}/${input.round.max}`);
  else if (input.stage === "REVIEW_ANALYSE") parts.push("round 0 (first review, not counted)");
  return parts.join(" | ");
}

function participantsLine(input: OcbInput): string {
  const { cur } = milestoneCtx(input);
  if (!cur) return `PARTICIPANTS IN THIS MILESTONE: ${input.stage === "MAP" ? "whole team (the map decides each milestone's roster)" : "whole team"}.`;
  const who = cur.roster.map((r) => { const a = byRosterName(r); return a ? `${a.name} (${a.role})` : r; });
  return `PARTICIPANTS IN THIS MILESTONE: ${who.join(", ")}${cur.reviewMode ? ` · review mode: ${cur.reviewMode}` : ""}.`;
}

/** NEXT + mtumiaji wa jibu — jedwali la code kwa (stage × self). */
export function consumerOf(input: OcbInput): { next: string; role: string; use: string } {
  const { cur, nextM, isLast } = milestoneCtx(input);
  const M = cur ? cur.id : "the milestone";
  const designer = `${nameOf("designer")} (${roleOf("designer")})`;
  const frontend = `${nameOf("frontend")} (${roleOf("frontend")})`;
  const after = nextM ? `next milestone ${nextM.id}: ${nextM.title}` : isLast ? "the final report for the CEO (this is the last milestone: push + deploy)" : "the next milestone";
  const r = input.round?.current || 0;
  const max = input.round?.max || 10;
  const pm = input.self === "pm";
  switch (input.stage) {
    case "MAP":
      return pm
        ? { next: "the code validator checks your milestone map; then the team discusses the agendas of milestone M1", role: "the harness validator, then the whole team", use: "the map decides which agendas are discussed, built and reviewed together, and who takes part" }
        : { next: "Optimus finalises the milestone map; then the team discusses the agendas of milestone M1", role: `${nameOf("pm")} (${roleOf("pm")})`, use: "your input shapes how agendas are grouped into milestones" };
    case "DISCUSS":
      return { next: `the decision is locked into the ledger and summarised in a mini-report; after the last agenda of ${M}, Optimus writes the milestone plan`, role: "the team and Optimus", use: `locked decisions go into the ledger, which Optimus turns into the ${M} plan for XMD Computer` };
    case "PLAN":
      return pm
        ? { next: `XMD Computer builds ${M} from this plan and writes a build report; then the harness collects evidence`, role: "XMD Computer", use: "it executes the plan literally and cannot ask questions — every requirement must be explicit" }
        : { next: `Optimus finalises the ${M} plan; XMD Computer builds it`, role: `${nameOf("pm")} (${roleOf("pm")})`, use: "your input is folded into the plan XMD Computer will execute" };
    case "BUILD":
      return input.self === "computer"
        ? { next: `the harness collects evidence (screenshots, DOM metrics, checks); then ${designer} and ${frontend} review ${M}`, role: `the harness and the reviewers ${designer} + ${frontend}`, use: "your build report and the evidence decide which defects are opened" }
        : { next: `XMD Computer finishes building ${M}; the harness collects evidence; then the first review (round 0)`, role: "the team", use: "context only — no decision is taken during the build" };
    case "REVIEW_ANALYSE":
      return { next: "the team discusses the findings; Optimus writes change orders for XMD Computer", role: "Optimus and the team", use: "your findings become defects and change orders — each must cite evidence (screenshot id, measurement)" };
    case "REVIEW_DISCUSS":
      return pm
        ? { next: `XMD Computer applies your change orders (round ${r + 1}/${max}); then evidence again and two reviewers verify`, role: "XMD Computer", use: "each change order is executed literally and answered with a Receipt" }
        : { next: "Optimus writes change orders from the agreed defects; XMD Computer fixes them", role: `${nameOf("pm")} (${roleOf("pm")})`, use: "the agreed defects and fixes become change orders for XMD Computer" };
    case "REVIEW_VERIFY":
      return { next: r >= max ? `round cap reached: open defects become INHERITED and are reported to the CEO; then ${after}` : `if every defect is verified fixed: sign-off of ${M}, then ${after}; otherwise another fix round (${r + 1}/${max})`, role: "the harness and Optimus", use: "your verdict per defect decides sign-off or another round" };
    case "FIX":
      return input.self === "computer"
        ? { next: `the harness re-collects evidence; ${designer} and ${frontend} verify each defect (round ${r}/${max})`, role: `the harness and the reviewers ${designer} + ${frontend}`, use: "your Receipts are checked against fresh evidence" }
        : { next: `XMD Computer finishes the fixes for round ${r}/${max}; then you verify with fresh evidence`, role: "the team", use: "context only — verification starts when the evidence is ready" };
    case "FINAL_REPORT":
      return pm
        ? { next: "the CEO reads the final report; the last milestone ended with push + deploy", role: "the CEO", use: "the CEO decides from this report — state verified results, waivers and inherited defects plainly" }
        : { next: "Optimus writes the final report for the CEO", role: `${nameOf("pm")} (${roleOf("pm")})`, use: "your summary is quoted in the CEO's final report" };
  }
}

function stateLine(input: OcbInput, level: 0 | 1 | 2): string {
  const c = input.counts;
  const done = c.milestonesDone;
  if (level === 0) return `STATE: locked decisions ${c.lockedDecisions}; milestones done ${done.length ? done.join(", ") : "none"}; open defects ${c.openDefects}; waivers ${c.waivers}.`;
  if (level === 1) return `STATE: locked decisions ${c.lockedDecisions}; milestones done ${done.length}${done.length ? ` (${done[0]}…${done[done.length - 1]})` : ""}; open defects ${c.openDefects}; waivers ${c.waivers}.`;
  return `STATE: decisions ${c.lockedDecisions} · done ${done.length} · defects ${c.openDefects} · waivers ${c.waivers}.`;
}

function render(input: OcbInput, extra: string[], o: { state: 0 | 1 | 2; summaryMax: number; titleMax: number }): string {
  const nc = consumerOf(input);
  const consumer = input.consumer ? { ...nc, role: input.consumer.role, use: input.consumer.use } : nc;
  const s = input.project.summary.replace(/\s+/g, " ").trim();
  const summary = s.length > o.summaryMax ? `${s.slice(0, o.summaryMax - 1)}…` : s;
  return [
    OPEN,
    `PROJECT: ${input.project.name}. CEO request in brief: ${summary}`,
    teamLine(),
    COMPUTER_LINE,
    PIPELINE,
    hereLine(input, o.titleMax),
    participantsLine(input),
    `NEXT: ${consumer.next}. YOUR OUTPUT IS READ BY: ${consumer.role} — ${consumer.use}.`,
    stateLine(input, o.state),
    RULES,
    ...extra,
    END,
  ].join("\n");
}

/** Length guard: > OCB_MAX_TOKENS → fupisha STATE kwanza; kisha summary ya mradi; kisha title ya milestone.
 *  PIPELINE na YOU ARE HERE haziondolewi kamwe. */
function fit(input: OcbInput, extra: string[]): string {
  const tok = (t: string) => estimateTokens(t);
  let out = render(input, extra, { state: 0, summaryMax: 600, titleMax: 120 });
  if (tok(out) <= OCB_MAX_TOKENS) return out;
  for (const state of [1, 2] as const) {
    out = render(input, extra, { state, summaryMax: 600, titleMax: 120 });
    if (tok(out) <= OCB_MAX_TOKENS) return out;
  }
  for (const summaryMax of [300, 160, 80]) {
    out = render(input, extra, { state: 2, summaryMax, titleMax: 120 });
    if (tok(out) <= OCB_MAX_TOKENS) return out;
  }
  return render(input, extra, { state: 2, summaryMax: 80, titleMax: 40 });
}

export function buildOCB(input: OcbInput): string {
  return fit(input, []);
}

export function buildOCBForComputer(input: OcbInput): string {
  const designer = `${nameOf("designer")} (${roleOf("designer")})`;
  const frontend = `${nameOf("frontend")} (${roleOf("frontend")})`;
  return fit({ ...input, self: "computer" }, [
    `YOU ARE XMD COMPUTER: your work WILL be reviewed by a Designer — ${designer} — and a Frontend Engineer — ${frontend} — plus automatic checks run by the harness.`,
    "RECEIPTS: return one Receipt per change order (orderId, status DONE|PARTIAL|BLOCKED|CANNOT, filesChanged, commandsRun; blockedReason when BLOCKED|CANNOT).",
    "FINISH: you cannot finish without the Build Report and passing checks.",
    "REPEATS: a repeated order means the previous attempt was not enough — change your approach, do not resubmit the same change.",
    "SELF-GRADING: do not grade yourself — the harness measures.",
  ]);
}

/** Weka OCB juu ya prompt. Idempotent: OCB ya zamani ndani ya prompt inabadilishwa, si kurudiwa. */
export function withOCB(prompt: string, ocb: string): string {
  if (!ocb) return prompt;
  const start = prompt.indexOf(OPEN);
  if (start >= 0) {
    const end = prompt.indexOf(END, start);
    if (end >= 0) {
      const rest = (prompt.slice(0, start) + prompt.slice(end + END.length)).replace(/^\s+/, "");
      return rest ? `${ocb}\n\n${rest}` : ocb;
    }
  }
  return prompt ? `${ocb}\n\n${prompt}` : ocb;
}
