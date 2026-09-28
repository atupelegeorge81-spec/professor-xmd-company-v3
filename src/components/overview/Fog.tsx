"use client";
/**
 * Fog — "ukungu": maudhui yanayeyuka kuingia kwenye background badala ya kukatwa na mstari.
 *  - FogRail   : horizontal scroll (swipe) ambayo pembe zake zinayeyuka.
 *  - FogBorder : hairline border inayoonekana upande mmoja na kuyeyuka upande mwingine.
 *  - fogMask   : helper ya mask-image kwa kitu chochote.
 */
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Side = "left" | "right" | "top" | "bottom";

const DIR: Record<Side, string> = {
  left: "90deg",
  right: "270deg",
  top: "180deg",
  bottom: "0deg",
};

export function fogMask(side: Side, from = 55): CSSProperties {
  const m = `linear-gradient(${DIR[side]}, transparent 0%, #000 ${100 - from}%)`;
  return { maskImage: m, WebkitMaskImage: m };
}

export function FogRail({
  children,
  className = "",
  fog = 56,
  label,
}: {
  children: ReactNode;
  className?: string;
  fog?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;
    const l = Math.min(fog, Math.max(0, el.scrollLeft));
    const r = Math.min(fog, Math.max(0, max - el.scrollLeft));

    el.style.setProperty("--fog-l", `${l}px`);
    el.style.setProperty("--fog-r", `${r}px`);
  }, [fog]);

  useEffect(() => {
    update();

    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => ro.disconnect();
  }, [update]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      onScroll={update}
      className={`no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(90deg,transparent_0,#000_var(--fog-l,0px),#000_calc(100%-var(--fog-r,0px)),transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0,#000_var(--fog-l,0px),#000_calc(100%-var(--fog-r,0px)),transparent_100%)] ${className}`}
    >
      {children}
    </div>
  );
}

export function FogBorder({
  fade = "left",
  className = "",
}: {
  fade?: Side;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-[inherit] border border-white/[0.11] ${className}`}
      style={fogMask(fade, 70)}
    />
  );
}
