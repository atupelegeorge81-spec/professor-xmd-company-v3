"use client";
// useApiAccounts — hali halisi ya akaunti 10 za API + embeddings (GET /api/usage/accounts).
// Kila sekunde 15 (kila 5 Board ikiendelea) + ukirudi kwenye tab. Hakuna data ya kubuni: null = bado inapakia.
import { useEffect, useState } from "react";
import type { UsageSnapshot } from "@/lib/usage/accounts";
import { useApp } from "@/components/shell/AppState";

export function useApiAccounts(): UsageSnapshot | null {
  const { boardLive } = useApp();
  const [snap, setSnap] = useState<UsageSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage/accounts", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: UsageSnapshot | null) => { if (alive && j?.accounts) setSnap(j); })
        .catch(() => {});
    load();
    const t = setInterval(load, boardLive ? 5_000 : 15_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [boardLive]);
  return snap;
}
