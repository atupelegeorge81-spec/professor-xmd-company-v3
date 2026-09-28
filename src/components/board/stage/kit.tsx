"use client";
import type { CSSProperties, ReactNode } from "react";
import { getAgent, type AgentId } from "@/lib/team";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "../../ui/AgentAvatar";

/** Rangi za maana (semantic) za Stage */
export const TONE = {
  ok: { c: "#34d399", rgb: "52 211 153" },
  warn: { c: "#fbbf24", rgb: "251 191 36" },
  bad: { c: "#f87171", rgb: "248 113 113" },
  sky: { c: "#7dd3fc", rgb: "125 211 252" },
  blue: { c: "#60a5fa", rgb: "96 165 250" },
  violet: { c: "#a78bfa", rgb: "167 139 250" },
  pink: { c: "#f0abfc", rgb: "240 171 252" },
  muted: { c: "#9aa0ae", rgb: "154 160 174" },
} as const;
export type Tone = keyof typeof TONE;

export const ag = (id: AgentId) => getAgent(id)!;

/** Kontena ya matukio ya mfumo — sambamba na maudhui ya ujumbe (baada ya avatar gutter). */
export function Lane({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("animate-[rise_0.45s_both] sm:ml-[52px]", className)} style={style}>
      {children}
    </div>
  );
}

/** Spinner ndogo (in-progress) */
export function Spinner({ size = 12, color = "currentColor", className }: { size?: number; color?: string; className?: string }) {
  return (
    <span
      className={cn("anim-spin inline-block shrink-0 rounded-full border-[1.5px]", className)}
      style={{ width: size, height: size, borderColor: `color-mix(in srgb, ${color} 25%, transparent)`, borderTopColor: color }}
    />
  );
}

/** Lebo ndogo (pill) yenye rangi laini */
export function Tag({ children, tone = "muted", className, mono, title }: { children: ReactNode; tone?: Tone; className?: string; mono?: boolean; title?: string }) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className={cn("inline-flex h-[20px] shrink-0 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold tracking-wide", mono && "font-mono", className)}
      style={{ color: t.c, background: `rgb(${t.rgb} / 0.1)`, boxShadow: `inset 0 0 0 1px rgb(${t.rgb} / 0.2)` }}
    >
      {children}
    </span>
  );
}

/** Kadi ya kawaida yenye rangi (lugha ya DecisionCard ya v2):
 *  gradient laini ya tone, border ya tone, ikoni kwenye chip, eyebrow, title, body, footer. */
export function Card({
  tone, icon, eyebrow, title, right, children, footer, className, dim,
}: {
  tone: Tone; icon: ReactNode; eyebrow: ReactNode; title?: ReactNode; right?: ReactNode;
  children?: ReactNode; footer?: ReactNode; className?: string; dim?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl border p-4 transition-opacity duration-500", dim && "opacity-60", className)}
      style={{ borderColor: `rgb(${t.rgb} / 0.22)`, background: `linear-gradient(135deg, rgb(${t.rgb} / 0.08), rgb(${t.rgb} / 0.012) 60%)` }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ color: t.c, background: `rgb(${t.rgb} / 0.14)` }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: t.c }}>{eyebrow}</p>
            {right && <span className="ml-auto flex items-center gap-1.5">{right}</span>}
          </div>
          {title && <div className="mt-0.5 text-[14px] font-semibold leading-6 text-[var(--color-fg)]">{title}</div>}
          {children}
        </div>
      </div>
      {footer && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-[11.5px] text-[var(--color-muted)]" style={{ borderColor: `rgb(${t.rgb} / 0.15)` }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Mstari wa tukio tulivu (Linear-style): ikoni ndogo + maandishi + kulia */
export function Quiet({ icon, children, right, className }: { icon: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <Lane>
      <div className={cn("flex min-h-[28px] items-center gap-2.5 text-[12.5px] text-[var(--color-muted)]", className)}>
        <span className="grid h-5 w-5 shrink-0 place-items-center">{icon}</span>
        <span className="min-w-0 flex-1 [&_b]:font-semibold [&_b]:text-[var(--color-fg-2)]">{children}</span>
        {right && <span className="flex shrink-0 items-center gap-1.5">{right}</span>}
      </div>
    </Lane>
  );
}

/** Avatar ndogo yenye jina */
export function Who({ id, size = 18, name = true, className }: { id: AgentId; size?: number; name?: boolean; className?: string }) {
  const a = ag(id);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <AgentAvatar agent={a} size={size} ring={false} />
      {name && <span className="font-medium text-[var(--color-fg)]">{a.name}</span>}
    </span>
  );
}

/** Inline markdown ndogo: **bold**, `code`, [n], *italic* */
export function Inline({ text, accent }: { text: string; accent?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\]|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-[var(--color-fg)]">{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`")) return <HexOrCode key={i} v={p.slice(1, -1)} />;
        if (/^\[\d+\]$/.test(p)) return <sup key={i} className="ml-0.5 inline-grid h-4 min-w-4 place-items-center rounded-[5px] bg-white/[0.07] px-1 align-[0.35em] font-mono text-[10px] text-[var(--color-fg-2)]" style={accent ? { color: accent } : undefined}>{p.slice(1, -1)}</sup>;
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/** `#0F9D6B` → swatch ya rangi; vinginevyo inline code */
function HexOrCode({ v }: { v: string }) {
  if (/^#[0-9a-f]{6}$/i.test(v))
    return (
      <span className="mx-0.5 inline-flex translate-y-[2px] items-center gap-1 rounded-md border border-[var(--color-line)] bg-white/[0.04] py-[1px] pl-[3px] pr-1.5 font-mono text-[11.5px] text-[var(--color-fg)]">
        <span className="h-3 w-3 rounded-[4px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]" style={{ background: v }} />
        {v.toUpperCase()}
      </span>
    );
  return <code className="rounded-md border border-[var(--color-line)] bg-white/[0.06] px-1 py-[1px] font-mono text-[12px] text-[#e4e1ff]">{v}</code>;
}
