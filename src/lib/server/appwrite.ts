// src/lib/server/appwrite.ts — Appwrite client moja kwa reports/sessions/stats.
import { Client, Databases, Storage } from "node-appwrite";

export const appwriteConfigured = !!(
  process.env.APPWRITE_ENDPOINT &&
  process.env.APPWRITE_PROJECT_ID &&
  process.env.APPWRITE_API_KEY &&
  process.env.APPWRITE_DATABASE_ID
);

const client = new Client();
if (process.env.APPWRITE_ENDPOINT && process.env.APPWRITE_PROJECT_ID && process.env.APPWRITE_API_KEY) {
  client.setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT_ID).setKey(process.env.APPWRITE_API_KEY);
}

export const databases = new Databases(client);
// R31 · XMD Computer: bucket ya screenshots ("Professor-xmd-company" 6ac2935d0038fbd47d5d)
export const storage = new Storage(client);
export const SCREENSHOTS_BUCKET = process.env.CU_SCREENSHOTS_BUCKET || "6ac2935d0038fbd47d5d";
export const DB = process.env.APPWRITE_DATABASE_ID!;
export const REPORTS_COL = process.env.REPORTS_COLLECTION_ID || "reports";
export const SESSIONS_COL = "boardroom_sessions";
