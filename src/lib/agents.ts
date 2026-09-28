// src/lib/agents.ts — DATA TU (R10 Agent Brain).
// Prompt ya kila wito inajengwa live na Agent Runtime: src/lib/brain/runtime.ts (buildAgentPrompt)
//   identity.ts (ROLE za agents, zimehamishwa bila kubadilishwa) · governance.ts (basePrompt, maneno yale yale)
//   skills/library/report-writing.md (report skill ya Optimus — inapakiwa kwenye awamu ya ripoti TU).
export interface Agent {
  id: string;
  name: string;
  role: string;
  tagline: string;
  emoji: string;
  avatar: string;
  gradient: string;
  accent: string;
  chip: string;
  model: string;
}

export const AGENTS: Agent[] = [
  {
    id: "pm", name: "Optimus", role: "Project Manager",
    tagline: "Leader · consensus chair · protects decision quality",
    emoji: "🧭", avatar: "/agents/optimus.png", gradient: "from-[#3B82F6] to-[#0EA5E9]", accent: "#3B82F6", chip: "PM",
    model: "qwen/qwen3.8-max:free",
  },
  {
    id: "designer", name: "Ultron", role: "UI/UX Designer",
    tagline: "Look & feel · patterns · delightful flows",
    emoji: "🎨", avatar: "/agents/ultron.png", gradient: "from-[#A855F7] to-[#EC4899]", accent: "#A855F7", chip: "UX",
    model: "qwen/qwen3.8-max:free",
  },
  {
    id: "frontend", name: "Vextron", role: "Frontend Engineer",
    tagline: "React · Next.js · Tailwind · UX performance",
    emoji: "⚛️", avatar: "/agents/vextron.png", gradient: "from-[#F97316] to-[#FB923C]", accent: "#F97316", chip: "FE",
    model: "qwen/qwen3.8-max:free",
  },
  {
    id: "backend", name: "Megatron", role: "Backend & DB Engineer",
    tagline: "APIs · data · architecture · full-stack",
    emoji: "🗄️", avatar: "/agents/megatron.png", gradient: "from-[#EF4444] to-[#B91C1C]", accent: "#EF4444", chip: "BE",
    model: "qwen/qwen3.8-max:free",
  },
  {
    id: "qa", name: "Cybertron", role: "QA & DevOps Engineer",
    tagline: "Reliability · security · testing · deploy",
    emoji: "🛡️", avatar: "/agents/cybertron.png", gradient: "from-[#84CC16] to-[#22C55E]", accent: "#84CC16", chip: "QA",
    model: "qwen/qwen3.8-max:free",
  },
];

export function getAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}
