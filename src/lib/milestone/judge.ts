// src/lib/milestone/judge.ts — TASK-30: wito wa JUDGE (reviewer analysis, verification, mjadala wa review) + vision rule.
//
// - Mnyororo: policy.JUDGE_CHAIN (Gemini Flash keys 4 → XKiro → Flash-Lite), thinking ON kwa Gemini (broker `judge: true`).
// - Kila wito → rekodi ya `lanesUsed` (task 10): callId, stepId, lane, model, keyId (herufi 4 za mwisho), visionCapable,
//   usedFallback, tokensIn/Out, ms (+ reasoningTokens, flags za ombi — si siri).
// - Vision rule: wito wenye picha ukipata lane isiyo na vision → picha HAZIONDOLEWI kimya kimya: kila picha inakuwa digest
//   ya maandishi iliyotengenezwa MAPEMA na wito wa Flash wenye vision (`digest:Mk:Rn`) + DOM metrics zilizomo kwenye prompt,
//   na matokeo yanawekwa `visionDegraded: true` (sign-off ya visual/mixed inakataa verdicts hizo — loop.ts).
import { brokerComplete, type CompleteResult, type CompleteSpec, type LaneCall } from "@/lib/broker";
import { laneClassOf, visionCapable } from "@/lib/broker/policy";
import type { EvidencePack, LaneUse } from "./types";

type Msg = { role: string; content?: unknown };
type Part = { type?: string; text?: string; image_url?: unknown };

export const digestKey = (milestoneId: string, round: number) => `digest:${milestoneId}:R${round}`;
export interface ImageDigest { version: 1; milestoneId: string; round: number; byId: Record<string, string>; lane: string; model: string; at: string }

export const hasImages = (messages: Msg[]): boolean =>
  messages.some((m) => Array.isArray(m.content) && (m.content as Part[]).some((p) => p?.type === "image_url"));

export const VISION_DEGRADED_NOTE =
  "VISION DEGRADED: the lane that answers this call cannot see pictures. Every screenshot below was replaced by a TEXT DIGEST written earlier by a Gemini Flash vision call. Judge from the digest + DOM metrics only; do not claim anything only a picture could show. Your verdict will be marked visionDegraded.";

/** Picha → maandishi (kwa id ya lebo "Image <id> — …" iliyotangulia). Hakuna picha inayopotea bila maelezo. */
export function degradeMessages(messages: Msg[], digest: Record<string, string> | null | undefined): Msg[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content) || !(m.content as Part[]).some((p) => p?.type === "image_url")) return m;
    const out: Part[] = [{ type: "text", text: VISION_DEGRADED_NOTE }];
    let lastId = "";
    for (const p of m.content as Part[]) {
      if (p?.type === "text") {
        const mm = /^Image (\S+) — /.exec(String(p.text || ""));
        if (mm) lastId = mm[1];
        out.push(p);
      } else if (p?.type === "image_url") {
        const d = (lastId && digest?.[lastId]) || "";
        out.push({
          type: "text",
          text: d
            ? `[picture ${lastId} NOT attached — TEXT DIGEST (Gemini Flash vision, made earlier):] ${d}`
            : `[picture ${lastId || "?"} NOT attached and no digest exists for it — use the DOM metrics only.]`,
        });
      } else out.push(p);
    }
    return { ...m, content: out };
  });
}

/** rekodi ya lanesUsed kutoka wito wa broker (stepId tupu → appendLaneUse inaweka hatua inayoendeshwa) */
export function laneUseOf(call: LaneCall, purpose: string, visionDegraded = false): LaneUse {
  return {
    callId: call.callId, stepId: "", lane: call.lane, model: call.model, keyId: call.keyId, visionCapable: call.visionCapable,
    tokens: call.tokensIn + call.tokensOut, ms: call.ms, fallback: call.usedFallback,
    usedFallback: call.usedFallback, tokensIn: call.tokensIn, tokensOut: call.tokensOut, reasoningTokens: call.reasoningTokens,
    purpose, laneClass: call.laneClass, judge: call.judge, visionDegraded, flags: call.flags,
  };
}

export interface JudgeOpts {
  /** digest ya picha (id → maelezo) — inatumika TU lane ikiwa haina vision */
  digest?: Record<string, string> | null;
  onLane?: (rec: LaneUse) => void;
  /** sindano ya tests */
  complete?: typeof brokerComplete;
}
export type JudgeResult = CompleteResult & { visionDegraded: boolean };

/** Wito MMOJA wa judge kupitia broker (mnyororo wa judge, thinking ON) + vision rule + rekodi ya lane. */
export async function judgeComplete(spec: Omit<CompleteSpec, "judge" | "vision" | "messagesFor" | "allow">, opts: JudgeOpts = {}): Promise<JudgeResult> {
  const imgs = hasImages(spec.messages);
  const run = opts.complete || brokerComplete;
  const r = await run({
    ...spec, judge: true, vision: imgs,
    ...(imgs ? { messagesFor: (lane) => (visionCapable(lane) ? spec.messages : degradeMessages(spec.messages, opts.digest)) } : {}),
  });
  const visionDegraded = imgs && !visionCapable(r.lane);
  try { opts.onLane?.(laneUseOf(r.call, spec.purpose, visionDegraded)); } catch { /* rekodi haiangushi hukumu */ }
  return { ...r, visionDegraded };
}

/* ============================ digest ya picha (Flash vision, mapema) ============================ */

async function fetchImage(s: EvidencePack["screenshots"][number]): Promise<{ mime: string; base64: string } | null> {
  if (!/^https?:\/\//.test(s.url || "")) return null;
  const r = await fetch(s.url);
  if (!r.ok) return null;
  return { mime: r.headers.get("content-type")?.split(";")[0] || "image/png", base64: Buffer.from(await r.arrayBuffer()).toString("base64") };
}

export interface DigestDeps {
  loadImage?: (s: EvidencePack["screenshots"][number]) => Promise<{ mime: string; base64: string } | null>;
  complete?: typeof brokerComplete;
  maxImages?: number;
  onLane?: (rec: LaneUse) => void;
  now?: () => string;
}

/** Wito MMOJA wa Gemini (Flash kwanza — darasa heavy) wenye picha zote za raundi → maelezo ya maandishi kwa kila id.
 *  null = hakuna picha / lane haikuwa na vision / JSON mbovu (sign-off ya visual itasubiri vision halisi hata hivyo). */
export async function makeImageDigest(pack: EvidencePack, deps: DigestDeps = {}): Promise<ImageDigest | null> {
  const load = deps.loadImage || fetchImage;
  const shots = (pack.screenshots || []).slice(0, deps.maxImages ?? 8);
  const content: Part[] = [{
    type: "text",
    text: `You describe screenshots for reviewers who cannot see them. For EVERY image write a precise, factual description (max 120 words): layout and sections, all visible text, colours, overlaps, cut-off or overflowing content, empty or broken areas. No opinions, no advice. Reply with ONE JSON object only: {"<image id>": "<description>", ...} using exactly these ids: ${shots.map((s) => s.id).join(", ")}.`,
  }];
  let n = 0;
  for (const s of shots) {
    const img = await load(s).catch(() => null);
    if (!img) continue;
    content.push({ type: "text", text: `Image ${s.id} — route ${s.route} · viewport ${s.viewport} · state ${s.state}:` });
    content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } });
    n++;
  }
  if (!n) return null;
  const purpose = `image-digest:${pack.milestoneId}:R${pack.round}`;
  const r = await (deps.complete || brokerComplete)({
    agentId: "designer", purpose, cls: "heavy", allow: ["gemini"], maxOut: 8_000, temperature: 0.1, priority: "background", waitMs: 120_000,
    messages: [{ role: "user", content: content as never }],
  });
  try { deps.onLane?.(laneUseOf(r.call, purpose)); } catch { /* */ }
  if (!visionCapable(r.lane)) return null;
  let byId: Record<string, string> = {};
  try {
    const t = String(r.text || "");
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    for (const s of shots) if (typeof j?.[s.id] === "string" && j[s.id].trim()) byId[s.id] = String(j[s.id]).trim().slice(0, 1200);
  } catch { byId = {}; }
  if (!Object.keys(byId).length) return null;
  return { version: 1, milestoneId: pack.milestoneId, round: pack.round, byId, lane: `${r.lane.id} (${laneClassOf(r.lane)})`, model: r.lane.model, at: (deps.now || (() => new Date().toISOString()))() };
}
