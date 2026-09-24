import { Client, Databases, Query } from "node-appwrite";

export interface LedgerObjection {
  agent: string;
  concern: string;
  severity: string;
  resolution: "open" | "accepted" | "rejected";
}

export interface LedgerEntry {
  id?: string;
  project_id: string;
  agenda_index: number;
  agenda_item: string;
  status: "LOCKED" | "SUPERSEDED" | "OBJECTED_OPEN";
  decision_summary: string;
  decision_detail?: string;
  rationale?: string;
  trade_off?: string;
  evidence?: string;
  sources?: string;
  owners?: string;
  objections?: string;
  supersedes?: string;
  locked_at?: string;
  created_at?: string;
}

const client = new Client();
if (process.env.APPWRITE_ENDPOINT && process.env.APPWRITE_PROJECT_ID && process.env.APPWRITE_API_KEY) {
  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}
const databases = new Databases(client);
const DB = process.env.APPWRITE_DATABASE_ID || "";
const COL = "board_ledger";

export async function saveLedgerEntry(e: LedgerEntry): Promise<string | null> {
  try {
    const safeProjectId = typeof e.project_id === 'string' 
      ? e.project_id.slice(0, 100).trim() 
      : String(e.project_id || '').slice(0, 100).trim();
    if (!safeProjectId) return null;
    const doc = await databases.createDocument(DB, COL, "unique()", {
      ...e,
      project_id: safeProjectId,
      created_at: new Date().toISOString(),
      locked_at: e.locked_at || new Date().toISOString(),
    });
    return doc.$id;
  } catch (err) {
    console.error("❌ Ledger save error:", err);
    return null;
  }
}

export async function listLedger(projectId: string): Promise<LedgerEntry[]> {
  try {
    const res = await databases.listDocuments(DB, COL, [
      Query.equal("project_id", projectId),
      Query.limit(100),
    ]);
    return res.documents.map((d: any) => ({ ...d, id: d.$id })) as LedgerEntry[];
  } catch {
    return [];
  }
}

// Final Board Resolution = Ledger iliyochujwa (LOCKED tu, imepangwa kwa agenda_index)
export async function finalBoardResolution(projectId: string): Promise<LedgerEntry[]> {
  const all = await listLedger(projectId);

  // Current canonical state per agenda item.
  // LOCKED and OBJECTED_OPEN are both valid current states.
  // SUPERSEDED entries stay in history but are excluded here.
  const canonical = new Map<number, LedgerEntry>();

  for (const entry of all) {
    if (
      entry.status !== "LOCKED" &&
      entry.status !== "OBJECTED_OPEN"
    ) {
      continue;
    }

    const previous = canonical.get(entry.agenda_index);

    const currentTime = new Date(
      entry.created_at || entry.locked_at || 0
    ).getTime();

    const previousTime = previous
      ? new Date(
          previous.created_at || previous.locked_at || 0
        ).getTime()
      : -1;

    if (!previous || currentTime >= previousTime) {
      canonical.set(entry.agenda_index, entry);
    }
  }

  return Array.from(canonical.values()).sort(
    (a, b) => a.agenda_index - b.agenda_index
  );
}

export async function markSuperseded(oldId: string): Promise<void> {
  try {
    await databases.updateDocument(DB, COL, oldId, { status: "SUPERSEDED" });
  } catch {}
}
