// src/lib/ui-types.ts — types za UI (zamani zilikuwa ndani ya mock.ts; data ya mfano imeondolewa).
export type { SessionMeta, ReportMeta, SessionState } from "./server/sessionIndex";

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

export interface LogEntry {
  id: string;
  time: string;
  type: "info" | "success" | "warning" | "error" | "api" | "search" | "system";
  message: string;
}

/** Sehemu 10 za ripoti ya engine (SECTION_DEFS kwenye boardRunner). */
export const REPORT_SECTIONS = [
  "Muhtasari", "Utafiti", "Mjadala", "Maamuzi", "Rangi",
  "Kurasa & Menu", "Safari ya Mteja", "Tech Stack", "Hatari", "Action Plan",
];
