/* Muda halisi kwa UI — kila kitu kinapimwa kwa timezone ya app (default Africa/Dar_es_Salaam). */
export const DEFAULT_TZ = "Africa/Dar_es_Salaam";

/** "YYYY-MM-DD" ya siku ya tarehe hii kwenye timezone husika */
export function dayKeyOf(d: Date | string | number, tz = DEFAULT_TZ): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const keyToUtc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));

/** idadi ya siku kati ya siku mbili (keys) */
export function daysBetween(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey) return 0;
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / 86_400_000);
}

export type DayGroup = "Today" | "Yesterday" | "This week" | "Earlier";
export const DAY_GROUPS: DayGroup[] = ["Today", "Yesterday", "This week", "Earlier"];

export function groupOf(iso: string, todayKey: string, tz = DEFAULT_TZ): DayGroup {
  const n = daysBetween(dayKeyOf(iso, tz), todayKey);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return "This week";
  return "Earlier";
}

/** lebo fupi: leo → "14:05", wiki hii → "Tue", zaidi → "12 Sep" (mwaka ukiwa tofauti → "12 Sep 2025") */
export function whenLabel(iso: string, todayKey: string, tz = DEFAULT_TZ): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const n = daysBetween(dayKeyOf(d, tz), todayKey);
  if (n <= 0) return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  if (n === 1) return "Yesterday";
  if (n < 7) return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(d);
  const sameYear = dayKeyOf(d, tz).slice(0, 4) === todayKey.slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/** "2 min ago", "3 h ago", "Yesterday"… */
export function relTime(iso: string, nowMs = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86_400);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export function fullDate(d: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
