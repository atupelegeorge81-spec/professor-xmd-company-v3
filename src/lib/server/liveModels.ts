// src/lib/server/liveModels.ts — MODEL HALISI ya kila agent SASA HIVI → badge ya model (Agent hero + chat room).
// Chanzo: ledger().routes (lane ya mwisho ambayo broker alimpa agent) ikiwa bado halali na akaunti haijaisha;
// vinginevyo: lane ambayo Capacity Broker ANGECHAGUA sasa hivi kwa jibu la kawaida (peekLane — bila kuhifadhi).
import { ledger } from "./usageLedger";
import { accountMeta } from "@/lib/usage/accounts";
import { accountView } from "./usageSnapshot";
import { peekLane } from "@/lib/broker";
import { peekXkiroUsage } from "./xkiroUsage";

export interface LiveModel { model: string; account: string; label: string; source: "last-call" | "next-call"; at?: number; ok?: boolean }

const ENGINE: Record<string, string> = { optimus: "pm", ultron: "designer", vextron: "frontend", megatron: "backend", cybertron: "qa" };
const FRESH_MS = 30 * 60_000;

export async function liveModels(): Promise<Record<string, LiveModel>> {
  await peekXkiroUsage().catch(() => null);
  const routes = ledger().routes;
  const out: Record<string, LiveModel> = {};
  for (const [agent, engine] of Object.entries(ENGINE)) {
    const r = routes[engine];
    const acc = r ? accountMeta(r.account) : null;
    if (r && acc && Date.now() - r.at < FRESH_MS && accountView(acc.id).status !== "exhausted") {
      out[agent] = { model: r.model, account: acc.id, label: acc.label, source: "last-call", at: r.at, ok: r.ok };
      continue;
    }
    const lane = peekLane(engine, "normal");
    if (lane) out[agent] = { model: lane.model, account: lane.account, label: accountMeta(lane.account).label, source: "next-call" };
  }
  return out;
}
