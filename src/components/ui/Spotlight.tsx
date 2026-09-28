"use client";
import { useCallback, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card with a pointer-following light + border glow. */
export function Spotlight({
  children,
  className,
  color,
  style,
  as: Tag = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** rgb triplet like "139 92 246" */
  color?: string;
  style?: CSSProperties;
  as?: "div" | "button" | "article" | "section";
} & HTMLAttributes<HTMLElement>) {
  const onMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);
  const vars = color
    ? ({ ["--spot" as string]: `rgb(${color} / 0.12)`, ["--spot-border" as string]: `rgb(${color} / 0.6)` } as CSSProperties)
    : {};
  const Comp = Tag as "div";
  return (
    <Comp onPointerMove={onMove} className={cn("spotlight surface rounded-[var(--radius-card)]", className)} style={{ ...vars, ...style }} {...rest}>
      {children}
    </Comp>
  );
}
