// src/lib/milestone/types.ts — TASK 9: types za pipeline ya milestones (maelezo0 §6). Pure types, hakuna wiring.
// Pipeline nzima iko nyuma ya env XMD_MILESTONES (default OFF); faili hili halitumiki na app bado.

import type { CuFinalState as BaseCuFinalState } from "@/lib/cu/finalState";

// ── MilestoneMap ─────────────────────────────────────────────────────────────
export const MILESTONE_PHASES = ["foundation", "core", "secondary", "quality_deploy"] as const;
export type MilestonePhase = (typeof MILESTONE_PHASES)[number];

export const REVIEW_MODES = ["visual", "technical", "mixed"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

export interface AgendaRange {
  from: number;
  to: number;
}

export interface Milestone {
  id: string; // "M1".."Mk"
  title: string;
  agendas: AgendaRange;
  phase: MilestonePhase;
  reviewMode: ReviewMode;
  roster: string[]; // lazima iwe na "optimus"
  rationale: string;
}

export interface MilestoneMap {
  version: number;
  sessionId: string;
  totalAgendas: number;
  generatedBy: string; // mf. "optimus@gemini-flash"
  usedFallback: boolean;
  milestones: Milestone[];
}

// ── MilestoneState ───────────────────────────────────────────────────────────
export const MILESTONE_STATUSES = [
  "DISCUSSING",
  "PLANNING",
  "BUILDING",
  "EVIDENCE",
  "REVIEW_R0",
  "FIXING",
  "VERIFYING",
  "SIGNED_OFF",
  "SIGNED_OFF_WITH_WAIVERS",
  "CAP_REACHED",
  "BLOCKED",
  "PAUSED_QUOTA",
  "PAUSED_INFRA",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MAX_ROUNDS = 10;

export interface MilestoneState {
  id: string; // "M1"
  status: MilestoneStatus;
  round: number; // 0 = review ya kwanza (haihesabiwi)
  maxRounds: number; // 10
  currentStepId: string; // mf. "M1.R3.verify" ("" kabla ya hatua ya kwanza)
  startedAt: string; // ISO
  updatedAt: string; // ISO
  lanesUsed: LaneUse[]; // TASK 10: lane log — append-only
  /** TASK 10: hali ya kurudi baada ya PAUSED_QUOTA | PAUSED_INFRA | BLOCKED. */
  resumeTo?: MilestoneStatus;
  /** TASK 10: step ledger (resume point = hatua ya kwanza isiyo DONE). */
  steps?: StepEntry[];
}

// ── TASK 10: step ledger + lane log ──────────────────────────────────────────
export const STEP_STATUSES = ["PENDING", "RUNNING", "DONE", "FAILED"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export interface StepEntry {
  stepId: string; // "M1.R3.verify"
  status: StepStatus;
  attempts: number; // mara ngapi imewekwa RUNNING (re-run baada ya crash huongeza)
  updatedAt: string; // ISO
  /** TASK-14: hatua iliyokamilishwa na stub (si kazi halisi bado) */
  stub?: boolean;
}

export interface LaneUse {
  callId: string;
  stepId: string;
  lane: string;
  model: string;
  keyId: string; // imefichwa (masked) kabla ya kuhifadhiwa
  visionCapable: boolean;
  tokens: number;
  ms: number;
  fallback: boolean;
}

// ── Defect ───────────────────────────────────────────────────────────────────
export const DEFECT_SEVERITIES = ["blocker", "major", "medium", "minor"] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DEFECT_STATUSES = ["OPEN", "IN_FIX", "VERIFIED_FIXED", "WAIVED", "INHERITED", "REOPENED"] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export interface DefectHistoryEntry {
  round: number;
  result: string;
  cause: string;
}

export interface Defect {
  id: string; // "D-004"
  milestoneId: string;
  foundInRound: number;
  reportedBy: string[];
  area: string;
  severity: DefectSeverity;
  title: string;
  evidence: string[];
  expected: string;
  actual: string;
  status: DefectStatus;
  attempts: number;
  history: DefectHistoryEntry[];
}

// ── Checks (verdict inatolewa na code, kamwe si LLM) ────────────────────────
export const CHECK_TYPES = [
  "command",
  "grep",
  "dom_exists",
  "computed_style",
  "no_horizontal_overflow",
  "console_clean",
  "contrast_min",
  "touch_target_min",
  "http",
  "file_exists",
  "file_contains",
  "screenshot_taken",
] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

interface CheckBase {
  id: string;
}
/** route = njia ya app (mf. "/login"); viewport = jina la viewport (mf. "mobile") — hiari. */
interface RouteCheck extends CheckBase {
  route: string;
  viewport?: string;
}

/** TASK-21: checks za kurasa nyingi (routes × viewports) — `route` AU `routes`. */
interface MultiRouteCheck extends CheckBase {
  route?: string;
  routes?: string[];
  viewport?: string;
  viewports?: string[];
}
export type GrepOp = "eq" | "lt" | "gt";

export interface CommandCheck extends CheckBase { type: "command"; cmd: string; expectExit?: number }
/** TASK-21: `count`+`op` (idadi ya mistari inayolingana) AU `expect` ya zamani (present = gt 0, absent = eq 0); `path` AU `paths`. */
export interface GrepCheck extends CheckBase { type: "grep"; pattern: string; path?: string; paths?: string[]; expect?: "present" | "absent"; count?: number; op?: GrepOp }
export interface DomExistsCheck extends RouteCheck { type: "dom_exists"; selector: string }
/** TASK-21: `expected` AU `forbidden`. */
export interface ComputedStyleCheck extends RouteCheck { type: "computed_style"; selector: string; property: string; expected?: string; forbidden?: string }
export interface NoHorizontalOverflowCheck extends MultiRouteCheck { type: "no_horizontal_overflow" }
export interface ConsoleCleanCheck extends MultiRouteCheck { type: "console_clean" }
export interface ContrastMinCheck extends RouteCheck { type: "contrast_min"; selector: string; min: number }
/** TASK-21: `minPx` (Task 9) au `px` (maelezo21). */
export interface TouchTargetMinCheck extends RouteCheck { type: "touch_target_min"; selector: string; minPx?: number; px?: number }
/** TASK-21: `expectStatus` (Task 9) au `status` (maelezo21); `bodyContains` hiari. */
export interface HttpCheck extends CheckBase { type: "http"; url: string; method?: string; expectStatus?: number; status?: number; bodyContains?: string }
export interface FileExistsCheck extends CheckBase { type: "file_exists"; path: string }
export interface FileContainsCheck extends CheckBase { type: "file_contains"; path: string; text: string }
export interface ScreenshotTakenCheck extends RouteCheck { type: "screenshot_taken"; state?: string }

export type Check =
  | CommandCheck
  | GrepCheck
  | DomExistsCheck
  | ComputedStyleCheck
  | NoHorizontalOverflowCheck
  | ConsoleCleanCheck
  | ContrastMinCheck
  | TouchTargetMinCheck
  | HttpCheck
  | FileExistsCheck
  | FileContainsCheck
  | ScreenshotTakenCheck;

export const CHECK_RESULTS = ["PASS", "FAIL", "ERROR"] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

// ── Change Order + Receipt ───────────────────────────────────────────────────
export const DIAGNOSIS_CAUSES = [
  "NOT_ATTEMPTED",
  "ATTEMPTED_WRONG",
  "AMBIGUOUS_ORDER",
  "CONFLICT_WITH_DECISION",
  "TECH_BLOCKER",
  "REGRESSION_CAUSED",
] as const;
export type DiagnosisCause = (typeof DIAGNOSIS_CAUSES)[number];

export const CO_MODES = ["standard", "concrete", "pair_patch", "split", "redecide"] as const;
export type ChangeOrderMode = (typeof CO_MODES)[number];

export interface ChangeOrderLocation {
  files?: string[];
  route?: string;
  selector?: string;
}

export interface ChangeOrder {
  id: string; // "CO-012"
  defectIds: string[];
  attempt: number;
  priority: number; // 1 = juu kabisa
  location: ChangeOrderLocation;
  current: string;
  desired: string;
  visionNote: string; // tupu inaruhusiwa TU kwa reviewMode "technical"
  acceptance: Check[]; // si maandishi huru
  diagnosis?: { cause: DiagnosisCause; note: string };
  mode: ChangeOrderMode;
  patch?: string; // pair_patch: diff kamili inayotumika kama ilivyo
}

export const RECEIPT_STATUSES = ["DONE", "PARTIAL", "BLOCKED", "CANNOT"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export interface FileChange {
  path: string;
  summary: string;
  before?: string;
  after?: string;
}

export interface Receipt {
  orderId: string;
  status: ReceiptStatus;
  filesChanged: FileChange[];
  commandsRun: string[];
  notes?: string;
  blockedReason?: string;
}

// ── Evidence pack (inakusanywa na harness) ───────────────────────────────────
export interface EvidenceScreenshot {
  id: string;
  route: string;
  viewport: string;
  state: string;
  path: string;
  /** TASK-19: URL ya storage (bucket ya CU files) — "" hadi harness ipakie */
  url: string;
}
/** TASK-19: kosa la runner (server haikuanza, route 404, state action, crash) — linakuwa defect baadaye. */
export const EVIDENCE_ERROR_KINDS = ["server", "http", "page", "state", "viewport", "crash", "upload", "harness", "dom"] as const;
export type EvidenceErrorKind = (typeof EVIDENCE_ERROR_KINDS)[number];
export interface EvidenceError {
  kind: EvidenceErrorKind;
  detail: string;
  route?: string;
  viewport?: string;
  state?: string;
  status?: number;
}
/** TASK-20: muhtasari wa `S-nnn.dom.json` (faili kamili liko kwenye path/url). */
export interface EvidenceDomSummary {
  elements: number;
  totalCandidates: number;
  truncated: boolean;
  hasHorizontalOverflow: boolean;
  overflowPx: number;
  tooSmall: number;
  lowContrast: number;
  imagesWithoutAlt: number;
  headingOrderProblems: number;
}
export interface EvidenceDomMetrics {
  screenshotId: string;
  path: string;
  /** TASK-20: URL ya storage ya dom.json ("" hadi harness ipakie) */
  url?: string;
  summary?: EvidenceDomSummary;
}
export interface EvidenceCheckResult {
  id: string;
  type: CheckType;
  result: CheckResult;
  detail: string;
}
export interface EvidenceCommand {
  cmd: string;
  exit: number;
  logPath: string;
}

/** TASK-22 (maelezo22): screenshot iliyobadilika > REGRESSION_THRESHOLD_PCT ukilinganisha na baseline ya milestone iliyoidhinishwa.
 *  "expected_change" = route imeguswa na Change Order ya raundi hii (si regression). */
export const REGRESSION_KINDS = ["regression", "expected_change"] as const;
export type RegressionKind = (typeof REGRESSION_KINDS)[number];
export interface RegressionEntry {
  kind: RegressionKind;
  route: string;
  viewport: string;
  state: string;
  /** % ya pixels zilizobadilika (100 = vipimo tofauti) */
  changedPct: number;
  thresholdPct: number;
  /** milestone ambayo baseline yake ilitumika (mf. "M1") */
  baselineMilestone: string;
  baselineUrl: string;
  currentUrl: string;
  /** picha ya tofauti (storage) — "" ikiwa vipimo tofauti */
  diffUrl: string;
  diffPath: string;
  note?: string;
  /** expected_change: Change Orders zilizogusa route hii */
  changeOrderIds?: string[];
}

export interface EvidencePack {
  milestoneId: string;
  round: number;
  screenshots: EvidenceScreenshot[];
  domMetrics: EvidenceDomMetrics[];
  checks: EvidenceCheckResult[];
  commands: EvidenceCommand[];
  gitDiffSummary: string;
  /** TASK-22: regressions + expected changes (reviewers wanapokea orodha hii, task 23+) */
  regression: RegressionEntry[];
  consoleErrors: string[];
  /** TASK-19: makosa ya runner (manifest inaandikwa hata yakiwepo) */
  errors: EvidenceError[];
  /** TASK-19: http://127.0.0.1:<port> (local) au URL ya deployed (--base) */
  base?: string;
  mode?: "local" | "deployed";
}

// ── RoundHeader (data; maandishi yanajengwa na code) ─────────────────────────
// "ROUND 3/10 (M1) — closed defects: 7 · open: 2 (D-004 attempt 3, D-009 attempt 1) · waivers: 0 · rounds left: 7"
export interface RoundHeaderData {
  milestoneId: string;
  round: number;
  maxRounds: number;
  closedDefects: number;
  open: { id: string; attempt: number }[];
  waivers: number;
  roundsLeft: number;
}

// ── Computer final states (maelezo0 §6) ──────────────────────────────────────
// COMPLETED_VERIFIED inaongezwa hapa tu; engine bado haiitumii hadi task 18 (evidence gate).
export type CuFinalState = BaseCuFinalState | "COMPLETED_VERIFIED";
