"use client";
// useLiveModels — model HALISI ya kila agent sasa hivi (GET /api/usage/models).
// Kila sekunde 10, ukirudi kwenye tab, na mara moja baada ya kila jibu la chat (event "xmd:model-refresh").
import { useEffect, useState } from "react";

export interface LiveModel { model: string; account: string; label: string; source: "last-call" | "next-call"; at?: number; ok?: boolean }

export function useLiveModels(): Record<string, LiveModel> | null {
  const [m, setM] = useState<Record<string, LiveModel> | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage/models", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive && j?.models) setM(j.models); })
        .catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    const onRefresh = () => { setTimeout(load, 400); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("xmd:model-refresh", onRefresh);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("xmd:model-refresh", onRefresh); };
  }, []);
  return m;
}
