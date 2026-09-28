// src/lib/brain/ids.ts — engine ids (pm/designer/…) ↔ persona ids (optimus/ultron/…).
export type Persona = "optimus" | "ultron" | "vextron" | "megatron" | "cybertron";
export const PERSONAS: Persona[] = ["optimus", "ultron", "vextron", "megatron", "cybertron"];

const TO_PERSONA: Record<string, Persona> = { pm: "optimus", designer: "ultron", frontend: "vextron", backend: "megatron", qa: "cybertron" };
const TO_ENGINE: Record<Persona, string> = { optimus: "pm", ultron: "designer", vextron: "frontend", megatron: "backend", cybertron: "qa" };

export const personaOf = (id: string): Persona => TO_PERSONA[id] || ((PERSONAS as string[]).includes(id) ? (id as Persona) : "optimus");
export const engineOf = (id: string): string => TO_ENGINE[id as Persona] || id;
