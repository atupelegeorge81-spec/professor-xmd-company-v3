"use client";
import { useEffect, useState } from "react";
import { DEFAULT_TZ, dayKeyOf } from "@/lib/time";
import { useApp } from "./AppState";

/** Siku ya LEO halisi (timezone ya app). Inabadilika yenyewe saa sita usiku — hakuna tarehe iliyoandikwa kwa mkono. */
export function useToday() {
  const { config, refresh } = useApp();
  const tz = config?.timezone || DEFAULT_TZ;
  const [now, setNow] = useState(() => new Date());
  const key = dayKeyOf(now, tz);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    const onVis = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // siku ikibadilika → takwimu za "leo" zinasomwa upya
  const [seen, setSeen] = useState(key);
  useEffect(() => {
    if (key !== seen) { setSeen(key); refresh("all"); }
  }, [key, seen, refresh]);

  return { now, key, tz };
}
