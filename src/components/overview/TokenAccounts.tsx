"use client";
// TokenAccounts — kadi kubwa ya "Today's tokens" (R16/R18): jumla ya leo + pete 10 za akaunti (XKiro 1/2 · Groq 1/2 ·
// OpenRouter 1/2 · Uno 1/2 · Gemini 1/2 — R19: project mbili = ndoo mbili) + pete ya Embeddings PEKE YAKE (search cache — requests, si tokens).
// Kila pete = asilimia HALISI dhidi ya kikomo cha provider huyo mwenyewe:
//   XKiro/Groq → tokens / kikomo cha tokens · OpenRouter → requests / 50 (tokens bado zinahesabiwa chini)
//   Uno → "—" mpaka kikomo cha siku kijifunzwe (hakuna meter ya bure) — hakuna % ya kubuni.
//   Gemini → requests / jumla ya vikomo vya siku vya models zake (Flash 20 × 6 + Lite 500 × 2) kwa kila project · Embeddings → requests / (2000 × projects)
// Mpangilio (R19): safu 4 → XKiro 1/2 Groq 1/2 · OR 1/2 Uno 1/2 · Gemini 1/2 Embeddings
import { Sparkles } from "lucide-react";
import { ACCOUNTS, EMBED_META, type AccountMeta, type AccountView, type EmbedView } from "@/lib/usage/accounts";
import { compact } from "@/lib/utils";
import { useApiAccounts } from "./useApiAccounts";

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dar_es_Salaam";
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit" });

function tip(a: AccountView): string {
  const parts = [a.label];
  if (a.used != null) parts.push(`${a.used.toLocaleString("en-US")}${a.limit ? ` / ${a.limit.toLocaleString("en-US")}` : ""} tokens`);
  if (a.requests != null) parts.push(`${a.requests}${a.requestLimit ? ` / ${a.requestLimit}` : ""} requests leo`);
  if (a.status === "exhausted") parts.push("imekwisha — imewekwa kando mpaka reset");
  if (a.status === "cooling") parts.push("inapumzika kwa muda");
  if ((a.resetKind === "utc-midnight" || a.resetKind === "pacific-midnight") && a.resetAt) parts.push(`reset ${when(a.resetAt)}`);
  if (a.provider === "gemini" && a.note) parts.push(a.note);
  if (a.resetKind === "refill" && a.resetAt) parts.push(`inajijaza — tupu ${when(a.resetAt)}`);
  if (a.lastResetAt) parts.push(`reset ya mwisho ${when(a.lastResetAt)}`);
  if (!a.configured) parts.push("key haijawekwa");
  parts.push(a.window);
  return parts.join(" · ");
}

/** mstari mdogo wa tatu chini ya pete: kipimo cha kikomo cha provider */
function sub(a: AccountView | null): string {
  if (!a || !a.configured) return "";
  if (a.provider === "openrouter") return `${a.requests ?? 0}/${a.requestLimit ?? 50} req`;
  if (a.provider === "gemini") return `${a.requests ?? 0}/${compact(a.requestLimit ?? 0)} req`;
  // R20: katikati ya pete ya Uno kuna idadi ya requests halisi (logs za UnoRouter); chini: "req leo" + hali ikiwa si tayari
  if (a.provider === "unorouter") return a.limit ? `${a.requests ?? 0} req · / ${compact(a.limit)}` : a.status === "cooling" ? "req leo · inapoa" : a.status === "exhausted" ? "req leo · imekwisha" : "req leo";
  return a.limit ? `/ ${compact(a.limit)}` : "";
}

const S = 56, W = 5, R = (S - W) / 2, C = 2 * Math.PI * R;

function Arc({ rgb, color, on, pct }: { rgb: string; color: string; on: boolean; pct: number | null }) {
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="block">
      <circle cx={S / 2} cy={S / 2} r={R} fill="none" strokeWidth={W} stroke={on ? `rgb(${rgb} / 0.14)` : "rgb(255 255 255 / 0.06)"} />
      {on && pct != null && pct > 0 && (
        <circle
          cx={S / 2} cy={S / 2} r={R} fill="none" strokeWidth={W} strokeLinecap="round" stroke={color}
          strokeDasharray={`${(C * Math.max(pct, 1.5)) / 100} ${C}`}
          transform={`rotate(-90 ${S / 2} ${S / 2})`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      )}
    </svg>
  );
}

/** R18: pete ya Embeddings (search cache) — hesabu yake PEKE YAKE, kwa requests. */
function EmbedRing({ e }: { e: EmbedView | null | undefined }) {
  const on = !!e?.configured;
  const off = e?.status === "exhausted";
  const title = e
    ? [
        EMBED_META.label,
        `${e.requests} / ${e.requestLimit} requests leo`,
        ...e.models.map((m) => `${m.model.replace(/^gemini-/, "")} ${m.requests}/${m.limit}${m.status !== "ok" ? ` (${m.status === "exhausted" ? "imekwisha" : "inapumzika"})` : ""}`),
        `reset ${when(e.resetAt)}`,
        ...(e.note ? [e.note] : []),
        "search cache · kila search inakagua cache kwanza",
      ].join(" · ")
    : undefined;
  return (
    <div className="flex min-w-0 flex-col items-center" title={title}>
      <div className="relative" style={{ width: S, height: S }}>
        <Arc rgb={EMBED_META.rgb} color={EMBED_META.color} on={on} pct={e?.pct ?? null} />
        <span className="absolute inset-0 grid place-items-center text-[12px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: on ? EMBED_META.color : "var(--color-faint)" }}>
          {!e ? "…" : !on ? "—" : `${Math.round(e.pct)}%`}
        </span>
      </div>
      <span className={`mt-1.5 text-[13px] font-semibold tabular-nums leading-none ${off ? "text-[var(--color-faint)] line-through decoration-white/30" : "text-[var(--color-fg)]"}`}>
        {e && on ? compact(e.requests) : "—"}
      </span>
      <span className="mt-1 h-[11px] max-w-full truncate text-[9.5px] tabular-nums leading-none text-[var(--color-muted)]">{e && on ? `${e.requests}/${compact(e.requestLimit)} req` : ""}</span>
      <span className="mt-1 max-w-full truncate text-[10px] leading-none text-[var(--color-faint)]">{EMBED_META.short}</span>
    </div>
  );
}

function Ring({ meta, a }: { meta: AccountMeta; a: AccountView | null }) {
  const pct = a?.pct ?? null;
  const on = !!a?.configured;
  const color = meta.color;
  const off = a?.status === "exhausted";
  return (
    <div className="flex min-w-0 flex-col items-center" title={a ? tip(a) : undefined}>
      <div className="relative" style={{ width: S, height: S }}>
        <Arc rgb={meta.rgb} color={color} on={on} pct={pct} />
        <span className="absolute inset-0 grid place-items-center text-[12px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: on ? color : "var(--color-faint)" }}>
          {!a ? "…" : !on ? "—" : pct != null ? `${Math.round(pct)}%` : a.provider === "unorouter" ? (
            <span className="flex flex-col items-center leading-none">
              <span>{compact(a.requests ?? 0)}</span>
              <span className="mt-0.5 text-[8.5px] font-medium tracking-normal opacity-80">req</span>
            </span>
          ) : "—"}
        </span>
      </div>
      <span className={`mt-1.5 text-[13px] font-semibold tabular-nums leading-none ${off ? "text-[var(--color-faint)] line-through decoration-white/30" : "text-[var(--color-fg)]"}`}>
        {a && on && a.used != null ? compact(a.used) : "—"}
      </span>
      <span className="mt-1 h-[11px] max-w-full truncate text-[9.5px] tabular-nums leading-none text-[var(--color-muted)]">{sub(a)}</span>
      <span className="mt-1 max-w-full truncate text-[10px] leading-none text-[var(--color-faint)]">{meta.short}</span>
    </div>
  );
}

export function TokenAccounts() {
  const snap = useApiAccounts();
  const list = ACCOUNTS.map((m) => snap?.accounts.find((a) => a.id === m.id) ?? null);
  const live = list.filter((a) => a?.configured && a.status !== "exhausted").length;
  const conf = list.filter((a) => a?.configured).length;
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
          <Sparkles size={13} />
          Today&apos;s tokens
        </span>
        {snap && (
          <span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[10.5px] tabular-nums text-[var(--color-muted)]">
            {live}/{conf} akaunti hai
          </span>
        )}
      </div>
      <p className="mt-2 text-[38px] font-semibold leading-none tracking-[-0.045em]">{snap ? compact(snap.totalToday) : "—"}</p>
      <div className="mt-4 grid grid-cols-4 gap-x-0.5 gap-y-4">
        {list.map((a, i) => <Ring key={ACCOUNTS[i].id} meta={ACCOUNTS[i]} a={a} />)}
        <EmbedRing e={snap ? snap.embeddings ?? null : null} />
      </div>
    </>
  );
}
