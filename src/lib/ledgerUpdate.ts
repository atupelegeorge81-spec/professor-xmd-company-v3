// src/lib/ledgerUpdate.ts — kusasisha entry iliyopo ya Ledger (board_ledger) bila kuunda mpya.
// Inatumika na mini-report ya MWISHO: entry inahifadhiwa kwanza na mini-report ya muda (fallback,
// resume-safe), kisha mjadala wote ukiisha (observers SILENT / objection imetatuliwa) Optimus
// anaandika mini-report kamili na hapa inachukua nafasi ya ile ya muda.
import { databases, DB } from "@/lib/server/appwrite";

const COL = "board_ledger"; // sawa na ledger.ts

export interface LedgerMiniPatch {
  decision_detail: string;
  carried_constraints: string;
  trade_off?: string;
}

export async function updateLedgerMini(entryId: string, p: LedgerMiniPatch, maxRetries = 3): Promise<boolean> {
  if (!entryId) return false;
  const payload: Record<string, string> = {
    decision_detail: String(p.decision_detail || "").slice(0, 30000),
    carried_constraints: String(p.carried_constraints || "").slice(0, 10000),
  };
  if (p.trade_off) payload.trade_off = String(p.trade_off).slice(0, 3000);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await databases.updateDocument(DB, COL, entryId, payload);
      console.log(`✅ [Ledger] Mini-report ya mwisho imehifadhiwa kwenye entry ${entryId}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [Ledger] updateLedgerMini ${attempt}/${maxRetries} (${entryId}):`, err?.message || err);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  return false;
}
