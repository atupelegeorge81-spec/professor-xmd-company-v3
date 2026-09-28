"use client";
import { useEffect } from "react";

/**
 * Zoom lock ya simu.
 * iOS Safari hupuuza `user-scalable=no` — kwa hiyo tunazuia gesture za pinch (gesturestart/change)
 * na touchmove ya vidole ≥2. Android/Chrome inaheshimu viewport (maximumScale=1, userScalable=false).
 */
export function ZoomLock() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    document.addEventListener("touchmove", pinch, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", pinch);
    };
  }, []);
  return null;
}
