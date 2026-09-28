export type AgentId = "optimus" | "ultron" | "vextron" | "megatron" | "cybertron";
export type EngineAgentId = "pm" | "designer" | "frontend" | "backend" | "qa";

/* Timu ya UI (muonekano). Logic halisi (prompts, models, keys) iko kwenye src/lib/agents.ts ya engine.
 * Models halisi na takwimu zinasomwa live kutoka /api/config na /api/stats — hakuna namba za mfano hapa. */

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  chip: string;
  tagline: string;
  bio: string;
  avatar: string;
  accent: string;
  /** rgb triplet for alpha usage */
  rgb: string;
  /** id ya agent huyu kwenye engine (src/lib/agents.ts) */
  engineId: EngineAgentId;
  skills: string[];
  starters: string[];
}

export const AGENTS: Agent[] = [
  {
    id: "optimus",
    engineId: "pm",
    name: "Optimus",
    role: "Project Manager",
    chip: "PM",
    tagline: "Consensus chair · protects decision quality",
    bio: "Chairs every board session, turns fuzzy ideas into locked decisions and writes the final Swahili report.",
    avatar: "/agents/optimus.webp",
    accent: "#3b82f6",
    rgb: "59 130 246",
    skills: ["Roadmaps", "Scope", "Risk", "Reports", "Pricing"],
    starters: ["Break my idea into an MVP roadmap", "What are the biggest risks here?", "Draft a 6-week delivery plan"],
  },
  {
    id: "ultron",
    engineId: "designer",
    name: "Ultron",
    role: "UI/UX Designer",
    chip: "UX",
    tagline: "Look & feel · patterns · delightful flows",
    bio: "Owns the product's visual language, user journeys and design system. Obsessed with clarity and motion.",
    avatar: "/agents/ultron.webp",
    accent: "#a855f7",
    rgb: "168 85 247",
    skills: ["Design systems", "User flows", "Colour", "Motion", "A11y"],
    starters: ["Propose a colour system for a fintech app", "Review my onboarding flow", "Which layout fits a dashboard?"],
  },
  {
    id: "vextron",
    engineId: "frontend",
    name: "Vextron",
    role: "Frontend Engineer",
    chip: "FE",
    tagline: "React · Next.js · Tailwind · performance",
    bio: "Ships fast, accessible interfaces. Picks the right framework, keeps bundles small and Core Web Vitals green.",
    avatar: "/agents/vextron.webp",
    accent: "#f97316",
    rgb: "249 115 22",
    skills: ["Next.js", "React 19", "Tailwind", "PWA", "Web Vitals"],
    starters: ["Next.js or Remix for this project?", "How do I make my PWA work offline?", "Audit my page performance"],
  },
  {
    id: "megatron",
    engineId: "backend",
    name: "Megatron",
    role: "Backend & DB Engineer",
    chip: "BE",
    tagline: "APIs · data · architecture · scale",
    bio: "Designs APIs, schemas and integrations — M-Pesa, Airtel Money, queues — that stay boring under load.",
    avatar: "/agents/megatron.webp",
    accent: "#ef4444",
    rgb: "239 68 68",
    skills: ["Postgres", "APIs", "Payments", "Queues", "Caching"],
    starters: ["Design a schema for a wallet app", "How should I integrate M-Pesa?", "REST or tRPC here?"],
  },
  {
    id: "cybertron",
    engineId: "qa",
    name: "Cybertron",
    role: "QA & DevOps Engineer",
    chip: "QA",
    tagline: "Reliability · security · testing · deploy",
    bio: "Guards quality and uptime: test strategy, CI/CD, observability, threat modelling and compliance checks.",
    avatar: "/agents/cybertron.webp",
    accent: "#84cc16",
    rgb: "132 204 22",
    skills: ["CI/CD", "Testing", "Security", "Observability", "Docker"],
    starters: ["Set up CI/CD for a Next.js app", "Threat-model my login flow", "What should I monitor in prod?"],
  },
];

export const getAgent = (id: string) => AGENTS.find((a) => a.id === id);

export const ENGINE_TO_UI: Record<EngineAgentId, AgentId> = {
  pm: "optimus",
  designer: "ultron",
  frontend: "vextron",
  backend: "megatron",
  qa: "cybertron",
};

/** engine id (pm/designer/...) au UI id → UI id. */
export function toUiAgent(id: string | undefined | null): AgentId {
  const k = String(id || "").toLowerCase();
  if (k in ENGINE_TO_UI) return ENGINE_TO_UI[k as EngineAgentId];
  const hit = AGENTS.find((a) => a.id === k || a.name.toLowerCase() === k);
  return hit ? hit.id : "optimus";
}

/** Tafuta agent kwa jina lake ndani ya maandishi (logs/chips za engine). */
export function agentInText(text: string): AgentId | null {
  for (const a of AGENTS) if (text.includes(a.name)) return a.id;
  return null;
}
