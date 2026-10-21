// src/lib/milestone/schemas.ts — TASK 9: validators za mkono (zod haipo kwenye package.json — FLOW-MAP §G).
// Kila validator inarudisha {ok:true,value} au {ok:false,errors} — kila kosa ni "path: sababu" (Kiingereza, kwa LLM pia).
// Inakusanya makosa YOTE (haisimami kwenye la kwanza). Pure — hakuna I/O.

import {
  CHECK_TYPES,
  CO_MODES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  DIAGNOSIS_CAUSES,
  EVIDENCE_ERROR_KINDS,
  REGRESSION_KINDS,
  MILESTONE_PHASES,
  MILESTONE_STATUSES,
  RECEIPT_STATUSES,
  REVIEW_MODES,
  STEP_STATUSES,
  type ChangeOrder,
  type Check,
  type Defect,
  type EvidencePack,
  type MilestoneMap,
  type MilestoneState,
  type Receipt,
  type ReviewMode,
} from "./types";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// ── helpers ──────────────────────────────────────────────────────────────────
type Errs = string[];
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const show = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : Array.isArray(v) ? "array" : v === null ? "null" : typeof v === "object" ? "object" : String(v));

function str(e: Errs, o: Record<string, any>, k: string, p: string, opts: { allowEmpty?: boolean } = {}): void {
  const v = o[k];
  if (typeof v !== "string") e.push(`${p}.${k}: must be a string (got ${show(v)})`);
  else if (!opts.allowEmpty && !v.trim()) e.push(`${p}.${k}: must be a non-empty string`);
}
function optStr(e: Errs, o: Record<string, any>, k: string, p: string): void {
  if (o[k] !== undefined && typeof o[k] !== "string") e.push(`${p}.${k}: must be a string when present (got ${show(o[k])})`);
}
function int(e: Errs, o: Record<string, any>, k: string, p: string, min: number): void {
  const v = o[k];
  if (!isInt(v)) e.push(`${p}.${k}: must be an integer (got ${show(v)})`);
  else if (v < min) e.push(`${p}.${k}: must be >= ${min} (got ${v})`);
}
function oneOf(e: Errs, o: Record<string, any>, k: string, p: string, allowed: readonly string[]): void {
  if (!allowed.includes(o[k])) e.push(`${p}.${k}: must be one of ${allowed.join("|")} (got ${show(o[k])})`);
}
function strArr(e: Errs, o: Record<string, any>, k: string, p: string, opts: { nonEmpty?: boolean } = {}): void {
  const v = o[k];
  if (!Array.isArray(v)) { e.push(`${p}.${k}: must be an array (got ${show(v)})`); return; }
  if (opts.nonEmpty && v.length === 0) e.push(`${p}.${k}: must be a non-empty array`);
  v.forEach((x, i) => { if (typeof x !== "string" || !x.trim()) e.push(`${p}.${k}[${i}]: must be a non-empty string (got ${show(x)})`); });
}
const done = <T>(e: Errs, v: unknown): ValidationResult<T> => (e.length ? { ok: false, errors: e } : { ok: true, value: v as T });

// ── Check ────────────────────────────────────────────────────────────────────
const ROUTE_TYPES = new Set(["dom_exists", "computed_style", "contrast_min", "touch_target_min", "screenshot_taken"]);
/** TASK-21: route AU routes[] (+ viewport AU viewports[]) */
const MULTI_ROUTE_TYPES = new Set(["no_horizontal_overflow", "console_clean"]);
const has = (o: Record<string, any>, k: string) => o[k] !== undefined && o[k] !== null && o[k] !== "";

function checkInto(e: Errs, c: unknown, p: string): void {
  if (!isObj(c)) { e.push(`${p}: must be a Check object (got ${show(c)}) — free-text acceptance is not allowed`); return; }
  str(e, c, "id", p);
  if (!CHECK_TYPES.includes(c.type)) { e.push(`${p}.type: must be one of ${CHECK_TYPES.join("|")} (got ${show(c.type)})`); return; }
  if (ROUTE_TYPES.has(c.type)) { str(e, c, "route", p); optStr(e, c, "viewport", p); }
  if (MULTI_ROUTE_TYPES.has(c.type)) {
    if (has(c, "routes")) strArr(e, c, "routes", p, { nonEmpty: true }); else str(e, c, "route", p);
    if (has(c, "viewports")) strArr(e, c, "viewports", p, { nonEmpty: true }); else optStr(e, c, "viewport", p);
  }
  switch (c.type) {
    case "command":
      str(e, c, "cmd", p);
      if (c.expectExit !== undefined && !isInt(c.expectExit)) e.push(`${p}.expectExit: must be an integer when present (got ${show(c.expectExit)})`);
      break;
    case "grep":
      str(e, c, "pattern", p);
      if (has(c, "paths")) strArr(e, c, "paths", p, { nonEmpty: true }); else str(e, c, "path", p);
      if (has(c, "count") || has(c, "op")) {
        int(e, c, "count", p, 0); oneOf(e, c, "op", p, ["eq", "lt", "gt"]);
      } else oneOf(e, c, "expect", p, ["present", "absent"]);
      break;
    case "dom_exists":
      str(e, c, "selector", p);
      break;
    case "computed_style":
      str(e, c, "selector", p); str(e, c, "property", p);
      if (has(c, "forbidden") && !has(c, "expected")) str(e, c, "forbidden", p); else str(e, c, "expected", p);
      break;
    case "contrast_min":
      str(e, c, "selector", p);
      if (typeof c.min !== "number" || !(c.min > 0)) e.push(`${p}.min: must be a number > 0 (got ${show(c.min)})`);
      break;
    case "touch_target_min":
      str(e, c, "selector", p);
      if (has(c, "px") && !has(c, "minPx")) int(e, c, "px", p, 1); else int(e, c, "minPx", p, 1);
      break;
    case "http":
      str(e, c, "url", p); optStr(e, c, "method", p); optStr(e, c, "bodyContains", p);
      // TASK-29: body = string AU JSON (object/array → application/json) — JSON-ndani-ya-string ilivunja JSON ya Optimus (Koyeb T4 run 6)
      if (has(c, "body") && typeof c.body !== "string" && !isObj(c.body) && !Array.isArray(c.body)) e.push(`${p}.body: must be a string or a JSON object/array (got ${show(c.body)})`);
      if (has(c, "headers") && (!isObj(c.headers) || Object.values(c.headers).some((v) => typeof v !== "string"))) e.push(`${p}.headers: must be an object of string values (got ${show(c.headers)})`);
      {
        const k = has(c, "status") && !has(c, "expectStatus") ? "status" : "expectStatus";
        if (!isInt(c[k]) || c[k] < 100 || c[k] > 599) e.push(`${p}.${k}: must be an HTTP status 100-599 (got ${show(c[k])})`);
      }
      break;
    case "file_exists":
      str(e, c, "path", p);
      break;
    case "file_contains":
      str(e, c, "path", p); str(e, c, "text", p);
      break;
    case "screenshot_taken":
      optStr(e, c, "state", p);
      break;
    case "db": // TASK-29
      str(e, c, "table", p); optStr(e, c, "schema", p);
      if (!/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(String(c.table || ""))) e.push(`${p}.table: must be a plain SQL identifier (got ${show(c.table)})`);
      if (has(c, "rls") && typeof c.rls !== "boolean") e.push(`${p}.rls: must be true/false when present (got ${show(c.rls)})`);
      break;
    default: // no_horizontal_overflow, console_clean: route(s) tu
      break;
  }
}

export function validateCheck(c: unknown, path = "check"): ValidationResult<Check> {
  const e: Errs = [];
  checkInto(e, c, path);
  return done<Check>(e, c);
}

// ── MilestoneMap ─────────────────────────────────────────────────────────────
export interface MilestoneMapOptions {
  /** Mradi una UI → milestone ya kwanza lazima iwe phase "foundation". */
  hasUI?: boolean;
}

export function validateMilestoneMap(map: unknown, totalAgendas: number, knownAgents: readonly string[], opts: MilestoneMapOptions = {}): ValidationResult<MilestoneMap> {
  const e: Errs = [];
  const P = "map";
  if (!isObj(map)) return { ok: false, errors: [`${P}: must be an object (got ${show(map)})`] };
  if (!isInt(totalAgendas) || totalAgendas < 1) return { ok: false, errors: [`totalAgendas: must be an integer >= 1 (got ${show(totalAgendas)})`] };

  int(e, map, "version", P, 1);
  str(e, map, "sessionId", P);
  str(e, map, "generatedBy", P);
  if (typeof map.usedFallback !== "boolean") e.push(`${P}.usedFallback: must be a boolean (got ${show(map.usedFallback)})`);
  if (map.totalAgendas !== totalAgendas) e.push(`${P}.totalAgendas: must equal ${totalAgendas} (got ${show(map.totalAgendas)})`);

  const ms = map.milestones;
  if (!Array.isArray(ms)) { e.push(`${P}.milestones: must be an array (got ${show(ms)})`); return done(e, map); }
  if (ms.length === 0) { e.push(`${P}.milestones: must be non-empty`); return done(e, map); }

  const known = new Set(knownAgents);
  let expectFrom = 1; // agenda inayofuata inayotarajiwa (contiguous, ascending, bila pengo/overlap)
  ms.forEach((m: unknown, i: number) => {
    const p = `${P}.milestones[${i}]`;
    if (!isObj(m)) { e.push(`${p}: must be an object (got ${show(m)})`); return; }
    if (m.id !== `M${i + 1}`) e.push(`${p}.id: must be "M${i + 1}" (ids sequential M1..M${ms.length}) (got ${show(m.id)})`);
    str(e, m, "title", p);
    oneOf(e, m, "phase", p, MILESTONE_PHASES);
    oneOf(e, m, "reviewMode", p, REVIEW_MODES);
    str(e, m, "rationale", p);

    // roster
    if (!Array.isArray(m.roster) || m.roster.length === 0) e.push(`${p}.roster: must be a non-empty array`);
    else {
      if (!m.roster.includes("optimus")) e.push(`${p}.roster: must contain "optimus"`);
      m.roster.forEach((a: unknown, j: number) => {
        if (typeof a !== "string" || !known.has(a)) e.push(`${p}.roster[${j}]: unknown agent ${show(a)} (known: ${[...known].join(", ")})`);
      });
    }

    // agendas
    const r = m.agendas;
    if (!isObj(r) || !isInt(r.from) || !isInt(r.to)) { e.push(`${p}.agendas: must be {from:int,to:int} (got ${show(r)})`); return; }
    if (r.from > r.to) e.push(`${p}.agendas: from (${r.from}) must be <= to (${r.to})`);
    if (i === 0 && r.from !== 1) e.push(`${p}.agendas.from: must start at agenda 1 (got ${r.from})`);
    else if (r.from > expectFrom) e.push(`${p}.agendas.from: gap — agendas ${expectFrom}..${r.from - 1} are not covered (expected from=${expectFrom}, got ${r.from})`);
    else if (r.from < expectFrom) e.push(`${p}.agendas.from: overlap — agenda ${r.from} already covered by milestones[${i - 1}] (expected from=${expectFrom}, got ${r.from})`);
    expectFrom = Math.max(expectFrom, r.to + 1);
  });

  const last = ms[ms.length - 1];
  if (isObj(last)) {
    const lp = `${P}.milestones[${ms.length - 1}]`;
    if (last.phase !== "quality_deploy") e.push(`${lp}.phase: last milestone must be "quality_deploy" (got ${show(last.phase)})`);
    if (isObj(last.agendas) && last.agendas.to !== totalAgendas) e.push(`${lp}.agendas.to: last milestone must end at agenda ${totalAgendas} (got ${show(last.agendas.to)})`);
  }
  if (expectFrom - 1 > totalAgendas) e.push(`${P}.milestones: agendas go beyond totalAgendas=${totalAgendas} (up to ${expectFrom - 1})`);
  const first = ms[0];
  if (opts.hasUI && isObj(first) && first.phase !== "foundation") e.push(`${P}.milestones[0].phase: first milestone must be "foundation" when hasUI is true (got ${show(first.phase)})`);

  return done<MilestoneMap>(e, map);
}

// ── ChangeOrder ──────────────────────────────────────────────────────────────
const TECH_ACCEPTANCE_TYPES = ["command", "grep", "http", "db", "file_exists", "file_contains"];

export function validateChangeOrder(co: unknown, reviewMode: ReviewMode): ValidationResult<ChangeOrder> {
  const e: Errs = [];
  const P = "changeOrder";
  if (!isObj(co)) return { ok: false, errors: [`${P}: must be an object (got ${show(co)})`] };
  str(e, co, "id", P);
  // TASK-24: CO ya uamuzi wa REVIEW (proposal iliyokubaliwa) haina defect — decisionIds inabeba kiungo
  const hasDecisions = Array.isArray(co.decisionIds) && co.decisionIds.length > 0;
  if (co.decisionIds !== undefined) strArr(e, co, "decisionIds", P);
  strArr(e, co, "defectIds", P, { nonEmpty: !hasDecisions });
  int(e, co, "attempt", P, 1);
  int(e, co, "priority", P, 1);
  oneOf(e, co, "mode", P, CO_MODES);

  const loc = co.location;
  if (!isObj(loc)) e.push(`${P}.location: must be an object with files[] and/or route (got ${show(loc)})`);
  else {
    const hasFiles = Array.isArray(loc.files) && loc.files.length > 0;
    const hasRoute = typeof loc.route === "string" && loc.route.trim() !== "";
    if (!hasFiles && !hasRoute) e.push(`${P}.location: needs non-empty files[] or route`);
    if (loc.files !== undefined) strArr(e, loc, "files", `${P}.location`);
    optStr(e, loc, "route", `${P}.location`);
    optStr(e, loc, "selector", `${P}.location`);
  }

  str(e, co, "current", P);
  str(e, co, "desired", P);
  if (typeof co.visionNote !== "string") e.push(`${P}.visionNote: must be a string (got ${show(co.visionNote)})`);
  else if (!co.visionNote.trim() && reviewMode !== "technical") e.push(`${P}.visionNote: may be empty only when reviewMode is "technical" (reviewMode=${reviewMode})`);

  if (!Array.isArray(co.acceptance) || co.acceptance.length === 0) e.push(`${P}.acceptance: must be a non-empty array of Checks`);
  else co.acceptance.forEach((c: unknown, i: number) => {
    checkInto(e, c, `${P}.acceptance[${i}]`);
    // TASK-29 (maelezo29 #3): technical = hakuna UI → acceptance ni command/grep/http/db/file_* tu
    const t = String((c as { type?: unknown })?.type ?? "");
    if (reviewMode === "technical" && TECH_ACCEPTANCE_TYPES.indexOf(t) < 0) e.push(`${P}.acceptance[${i}].type: "${t}" is a browser/screenshot check — technical review has no UI; use one of ${TECH_ACCEPTANCE_TYPES.join("|")}`);
  });

  if (co.diagnosis !== undefined) {
    if (!isObj(co.diagnosis)) e.push(`${P}.diagnosis: must be an object {cause,note} when present`);
    else { oneOf(e, co.diagnosis, "cause", `${P}.diagnosis`, DIAGNOSIS_CAUSES); str(e, co.diagnosis, "note", `${P}.diagnosis`, { allowEmpty: true }); }
  }
  optStr(e, co, "patch", P);
  if (co.mode === "pair_patch" && !(typeof co.patch === "string" && co.patch.trim())) e.push(`${P}.patch: required when mode is "pair_patch"`);
  return done<ChangeOrder>(e, co);
}

// ── Receipt ──────────────────────────────────────────────────────────────────
export function validateReceipt(r: unknown): ValidationResult<Receipt> {
  const e: Errs = [];
  const P = "receipt";
  if (!isObj(r)) return { ok: false, errors: [`${P}: must be an object (got ${show(r)})`] };
  str(e, r, "orderId", P);
  oneOf(e, r, "status", P, RECEIPT_STATUSES);
  const blocked = r.status === "BLOCKED" || r.status === "CANNOT";

  if (blocked) {
    if (typeof r.blockedReason !== "string" || !r.blockedReason.trim()) e.push(`${P}.blockedReason: required (non-empty) when status is ${r.status}`);
  } else optStr(e, r, "blockedReason", P);

  if (r.filesChanged === undefined && blocked) { /* inaruhusiwa */ }
  else if (!Array.isArray(r.filesChanged)) e.push(`${P}.filesChanged: must be an array (got ${show(r.filesChanged)})`);
  else {
    if (!blocked && r.filesChanged.length === 0) e.push(`${P}.filesChanged: must be non-empty when status is ${show(r.status)} (empty allowed only for BLOCKED|CANNOT)`);
    r.filesChanged.forEach((f: unknown, i: number) => {
      const p = `${P}.filesChanged[${i}]`;
      if (!isObj(f)) { e.push(`${p}: must be an object {path,summary} (got ${show(f)})`); return; }
      str(e, f, "path", p); str(e, f, "summary", p); optStr(e, f, "before", p); optStr(e, f, "after", p);
    });
  }
  if (r.commandsRun !== undefined) {
    if (!Array.isArray(r.commandsRun)) e.push(`${P}.commandsRun: must be an array of strings (got ${show(r.commandsRun)})`);
    else r.commandsRun.forEach((c: unknown, i: number) => { if (typeof c !== "string") e.push(`${P}.commandsRun[${i}]: must be a string`); });
  }
  optStr(e, r, "notes", P);
  return done<Receipt>(e, r);
}

// ── Defect ───────────────────────────────────────────────────────────────────
export function validateDefect(d: unknown): ValidationResult<Defect> {
  const e: Errs = [];
  const P = "defect";
  if (!isObj(d)) return { ok: false, errors: [`${P}: must be an object (got ${show(d)})`] };
  if (typeof d.id !== "string" || !/^D-\d+$/.test(d.id)) e.push(`${P}.id: must look like "D-004" (got ${show(d.id)})`);
  if (typeof d.milestoneId !== "string" || !/^M\d+$/.test(d.milestoneId)) e.push(`${P}.milestoneId: must look like "M1" (got ${show(d.milestoneId)})`);
  int(e, d, "foundInRound", P, 0);
  strArr(e, d, "reportedBy", P, { nonEmpty: true });
  str(e, d, "area", P);
  oneOf(e, d, "severity", P, DEFECT_SEVERITIES);
  str(e, d, "title", P);
  strArr(e, d, "evidence", P);
  str(e, d, "expected", P);
  str(e, d, "actual", P);
  oneOf(e, d, "status", P, DEFECT_STATUSES);
  int(e, d, "attempts", P, 0);
  if (!Array.isArray(d.history)) e.push(`${P}.history: must be an array (got ${show(d.history)})`);
  else d.history.forEach((h: unknown, i: number) => {
    const p = `${P}.history[${i}]`;
    if (!isObj(h)) { e.push(`${p}: must be an object {round,result,cause}`); return; }
    int(e, h, "round", p, 0); str(e, h, "result", p); str(e, h, "cause", p, { allowEmpty: true });
  });
  return done<Defect>(e, d);
}

// ── MilestoneState ───────────────────────────────────────────────────────────
const HOLD_STATUSES: readonly string[] = ["PAUSED_QUOTA", "PAUSED_INFRA", "BLOCKED"];

function laneInto(e: Errs, l: unknown, p: string): void {
  if (!isObj(l)) { e.push(`${p}: must be a lane record object (got ${show(l)})`); return; }
  for (const k of ["callId", "stepId", "lane", "model", "keyId"]) str(e, l, k, p);
  for (const k of ["visionCapable", "fallback"]) if (typeof l[k] !== "boolean") e.push(`${p}.${k}: must be a boolean (got ${show(l[k])})`);
  int(e, l, "tokens", p, 0);
  int(e, l, "ms", p, 0);
  // TASK-30 (hiari): rekodi ya kila wito
  for (const k of ["usedFallback", "judge", "visionDegraded"]) if (l[k] !== undefined && typeof l[k] !== "boolean") e.push(`${p}.${k}: must be a boolean (got ${show(l[k])})`);
  for (const k of ["tokensIn", "tokensOut", "reasoningTokens"]) if (l[k] !== undefined) int(e, l, k, p, 0);
  if (typeof l.keyId === "string" && l.keyId.length > 8 && !/^\*\*\*|\*\*\*$/.test(l.keyId)) e.push(`${p}.keyId: must be masked (got ${l.keyId.length} chars)`);
}

const STEP_ID = /^M\d+\.R\d+\.[a-z][a-z0-9_]*$/;
const isIso = (v: unknown) => typeof v === "string" && v.trim() !== "" && !Number.isNaN(Date.parse(v));

export function validateMilestoneState(s: unknown): ValidationResult<MilestoneState> {
  const e: Errs = [];
  const P = "state";
  if (!isObj(s)) return { ok: false, errors: [`${P}: must be an object (got ${show(s)})`] };
  if (typeof s.id !== "string" || !/^M\d+$/.test(s.id)) e.push(`${P}.id: must look like "M1" (got ${show(s.id)})`);
  oneOf(e, s, "status", P, MILESTONE_STATUSES);
  int(e, s, "maxRounds", P, 1);
  int(e, s, "round", P, 0);
  if (isInt(s.round) && isInt(s.maxRounds) && s.round > s.maxRounds) e.push(`${P}.round: must be <= maxRounds (${s.maxRounds}) (got ${s.round})`);
  if (typeof s.currentStepId !== "string") e.push(`${P}.currentStepId: must be a string (got ${show(s.currentStepId)})`);
  else if (s.currentStepId !== "" && !STEP_ID.test(s.currentStepId)) e.push(`${P}.currentStepId: must look like "M1.R3.verify" or be "" (got ${show(s.currentStepId)})`);
  else if (s.currentStepId !== "" && typeof s.id === "string" && !s.currentStepId.startsWith(`${s.id}.`)) e.push(`${P}.currentStepId: must belong to ${s.id} (got ${show(s.currentStepId)})`);
  if (!isIso(s.startedAt)) e.push(`${P}.startedAt: must be an ISO date string (got ${show(s.startedAt)})`);
  if (!isIso(s.updatedAt)) e.push(`${P}.updatedAt: must be an ISO date string (got ${show(s.updatedAt)})`);
  if (!Array.isArray(s.lanesUsed)) e.push(`${P}.lanesUsed: must be an array (got ${show(s.lanesUsed)})`);
  else s.lanesUsed.forEach((l: unknown, i: number) => laneInto(e, l, `${P}.lanesUsed[${i}]`));
  // TASK 10: resumeTo + step ledger (hiari)
  if (s.resumeTo !== undefined) {
    oneOf(e, s, "resumeTo", P, MILESTONE_STATUSES);
    if (HOLD_STATUSES.includes(s.resumeTo)) e.push(`${P}.resumeTo: must not be a pause/blocked status (got ${show(s.resumeTo)})`);
  }
  if (HOLD_STATUSES.includes(s.status) && s.resumeTo === undefined) e.push(`${P}.resumeTo: required when status is ${s.status}`);
  // TASK-30: pause ya system (hiari)
  if (s.resumeAt !== undefined && !isIso(s.resumeAt)) e.push(`${P}.resumeAt: must be an ISO date string (got ${show(s.resumeAt)})`);
  if (s.blockedRetries !== undefined && !(Number.isInteger(s.blockedRetries) && s.blockedRetries >= 0 && s.blockedRetries <= 1)) e.push(`${P}.blockedRetries: must be 0 or 1 (TASK-32: BLOCKED is retried once) (got ${show(s.blockedRetries)})`);
  if (s.pauseOrigin !== undefined && s.pauseOrigin !== "system" && s.pauseOrigin !== "user") e.push(`${P}.pauseOrigin: must be "system" or "user" (got ${show(s.pauseOrigin)})`);
  if (s.steps !== undefined) {
    if (!Array.isArray(s.steps)) e.push(`${P}.steps: must be an array (got ${show(s.steps)})`);
    else {
      const seen = new Set<string>();
      s.steps.forEach((st: unknown, i: number) => {
        const p = `${P}.steps[${i}]`;
        if (!isObj(st)) { e.push(`${p}: must be an object {stepId,status,attempts,updatedAt}`); return; }
        if (typeof st.stepId !== "string" || !STEP_ID.test(st.stepId)) e.push(`${p}.stepId: must look like "M1.R3.verify" (got ${show(st.stepId)})`);
        else if (typeof s.id === "string" && !st.stepId.startsWith(`${s.id}.`)) e.push(`${p}.stepId: must belong to ${s.id} (got ${show(st.stepId)})`);
        else if (seen.has(st.stepId)) e.push(`${p}.stepId: duplicate ${show(st.stepId)}`);
        else seen.add(st.stepId);
        oneOf(e, st, "status", p, STEP_STATUSES);
        int(e, st, "attempts", p, 0);
        if (!isIso(st.updatedAt)) e.push(`${p}.updatedAt: must be an ISO date string (got ${show(st.updatedAt)})`);
      });
    }
  }
  return done<MilestoneState>(e, s);
}

// ── EvidencePack (TASK 19) ───────────────────────────────────────────────────
const VIEWPORT_RE = /^\d{3,4}x\d{3,4}$/;
const SHOT_ID_RE = /^S-\d{3,}$/;

/** Manifest ya cu/xmd-evidence.mjs (+ urls za harness). opts.requireUrls → kila screenshot iwe na URL ya http(s). */
export function validateEvidencePack(p: unknown, opts: { requireUrls?: boolean } = {}): ValidationResult<EvidencePack> {
  const e: Errs = [];
  const P = "evidence";
  if (!isObj(p)) return { ok: false, errors: [`${P}: must be an object (got ${show(p)})`] };
  if (typeof p.milestoneId !== "string" || !/^M\d+$/.test(p.milestoneId)) e.push(`${P}.milestoneId: must look like "M1" (got ${show(p.milestoneId)})`);
  int(e, p, "round", P, 0);
  if (!Array.isArray(p.screenshots)) e.push(`${P}.screenshots: must be an array (got ${show(p.screenshots)})`);
  else {
    const seen = new Set<string>();
    p.screenshots.forEach((s: unknown, i: number) => {
      const q = `${P}.screenshots[${i}]`;
      if (!isObj(s)) { e.push(`${q}: must be an object {id,route,viewport,state,path,url}`); return; }
      if (typeof s.id !== "string" || !SHOT_ID_RE.test(s.id)) e.push(`${q}.id: must look like "S-001" (got ${show(s.id)})`);
      else if (seen.has(s.id)) e.push(`${q}.id: duplicate ${s.id}`);
      else seen.add(s.id);
      if (typeof s.route !== "string" || !s.route.startsWith("/")) e.push(`${q}.route: must start with "/" (got ${show(s.route)})`);
      if (typeof s.viewport !== "string" || !VIEWPORT_RE.test(s.viewport)) e.push(`${q}.viewport: must look like "375x667" (got ${show(s.viewport)})`);
      str(e, s, "state", q);
      str(e, s, "path", q);
      if (typeof s.path === "string" && !/\.png$/i.test(s.path)) e.push(`${q}.path: must be a .png file (got ${show(s.path)})`);
      if (typeof s.url !== "string") e.push(`${q}.url: must be a string (got ${show(s.url)})`);
      else if (/^data:/i.test(s.url)) e.push(`${q}.url: base64 data URLs are not allowed — upload to storage`);
      else if (opts.requireUrls && !/^https?:\/\//.test(s.url)) e.push(`${q}.url: must be an uploaded http(s) URL (got ${show(s.url)})`);
    });
  }
  for (const k of ["domMetrics", "checks", "commands"]) if (!Array.isArray(p[k])) e.push(`${P}.${k}: must be an array (got ${show(p[k])})`);
  // TASK-20: kila dom.json ni ya screenshot iliyopo; path .dom.json; url (ikiwepo) http(s), si data:
  if (Array.isArray(p.domMetrics)) {
    const shotIds = new Set(Array.isArray(p.screenshots) ? p.screenshots.map((s: any) => s?.id) : []);
    p.domMetrics.forEach((d: unknown, i: number) => {
      const q = `${P}.domMetrics[${i}]`;
      if (!isObj(d)) { e.push(`${q}: must be an object {screenshotId,path,url?,summary?}`); return; }
      if (typeof d.screenshotId !== "string" || !shotIds.has(d.screenshotId)) e.push(`${q}.screenshotId: must be the id of a screenshot in this pack (got ${show(d.screenshotId)})`);
      if (typeof d.path !== "string" || !/\.dom\.json$/i.test(d.path)) e.push(`${q}.path: must be a .dom.json file (got ${show(d.path)})`);
      if (d.url !== undefined && typeof d.url !== "string") e.push(`${q}.url: must be a string (got ${show(d.url)})`);
      else if (typeof d.url === "string" && /^data:/i.test(d.url)) e.push(`${q}.url: base64 data URLs are not allowed — upload to storage`);
      else if (opts.requireUrls && typeof d.url === "string" && !/^https?:\/\//.test(d.url)) e.push(`${q}.url: must be an uploaded http(s) URL (got ${show(d.url)})`);
      if (d.summary !== undefined && (!isObj(d.summary) || typeof d.summary.elements !== "number")) e.push(`${q}.summary: must be an object with numeric elements (got ${show(d.summary)})`);
    });
  }
  if (typeof p.gitDiffSummary !== "string") e.push(`${P}.gitDiffSummary: must be a string (got ${show(p.gitDiffSummary)})`);
  // TASK-22: regression[] = RegressionEntry
  if (!Array.isArray(p.regression)) e.push(`${P}.regression: must be an array (got ${show(p.regression)})`);
  else p.regression.forEach((x: unknown, i: number) => {
    const q = `${P}.regression[${i}]`;
    if (!isObj(x)) { e.push(`${q}: must be an object {kind,route,viewport,state,changedPct,...}`); return; }
    oneOf(e, x, "kind", q, REGRESSION_KINDS);
    if (typeof x.route !== "string" || !x.route.startsWith("/")) e.push(`${q}.route: must start with "/" (got ${show(x.route)})`);
    if (typeof x.viewport !== "string" || !VIEWPORT_RE.test(x.viewport)) e.push(`${q}.viewport: must look like "375x667" (got ${show(x.viewport)})`);
    str(e, x, "state", q);
    for (const k of ["changedPct", "thresholdPct"]) if (typeof x[k] !== "number" || !(x[k] >= 0 && x[k] <= 100)) e.push(`${q}.${k}: must be a number 0..100 (got ${show(x[k])})`);
    for (const k of ["baselineMilestone", "baselineUrl", "currentUrl", "diffUrl", "diffPath"]) if (typeof x[k] !== "string") e.push(`${q}.${k}: must be a string (got ${show(x[k])})`);
    if (typeof x.diffUrl === "string" && /^data:/i.test(x.diffUrl)) e.push(`${q}.diffUrl: base64 data URLs are not allowed — upload to storage`);
  });
  strArr(e, p, "consoleErrors", P);
  if (!Array.isArray(p.errors)) e.push(`${P}.errors: must be an array (got ${show(p.errors)})`);
  else p.errors.forEach((x: unknown, i: number) => {
    const q = `${P}.errors[${i}]`;
    if (!isObj(x)) { e.push(`${q}: must be an object {kind,detail}`); return; }
    oneOf(e, x, "kind", q, EVIDENCE_ERROR_KINDS);
    str(e, x, "detail", q);
  });
  optStr(e, p, "base", P);
  return done<EvidencePack>(e, p);
}
