import type OpenAI from "openai";
import { AGENTS } from "./agents";
import { skillPack } from "./brain/skills/selector";

export interface AgendaItem {
  index: number;
  item: string;
  owners: string[];
  requiresCode: boolean;
}

export interface ScopeLock {
  objective: string;
  deliverable: string;
  requirements: string[];
  exclusions: string[];
  relevant_agents: string[];
}

export interface AgendaResult {
  understanding: string;
  scope: ScopeLock;
  items: AgendaItem[];
  /** R11: skills (modules) zilizopakiwa kwa hatua za scope/agenda — kwa log tu */
  skills?: { scope: string; agenda: string };
}

// R11: skills za Optimus kwa hatua mbili zisizopita brain.prompt (scope lock + agenda).
// Maandishi ya skill yanaongezwa MWISHO wa system prompt; kanuni za JSON zilizo juu zinabaki kuwa sheria.
const lastSkillTags = { scope: "", agenda: "" };
function withSkills(system: string, phase: "scope" | "agenda", text: string, stepNote: string): string {
  try {
    const pack = skillPack("optimus", phase, text, `agenda-gen:${phase}`);
    lastSkillTags[phase] = pack.tag;
    if (!pack.text) return system;
    return `${system}\n\n${stepNote}\n\n${pack.text}`;
  } catch {
    return system;
  }
}
const SCOPE_NOTE =
  "HOW TO USE THE SKILLS BELOW IN THIS STEP: this step is one JSON answer — you cannot ask Mkuu a question here. Classify the request (spike / bounded / architectural) inside \"understanding\", separate what the CEO said from your assumptions (put assumptions in requirements/exclusions explicitly), and keep the JSON shape above exactly.";
const AGENDA_NOTE =
  "HOW TO USE THE SKILLS BELOW IN THIS STEP: the agenda is still ONLY the JSON array described above — no prose, no markdown. Scale it to the path (spike → 1–2 items, bounded → a few, architectural → full decomposition), make every item one concrete, owned, verifiable piece of work, and self-review it against the locked scope before answering.";

const AGENT_IDS = new Set(AGENTS.map((a) => a.id));

function cleanText(value: unknown, max = 1200): string {
  return String(value ?? "")
    .replace(/```json|```/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeAgentIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((v) => String(v).trim())
        .filter((v) => AGENT_IDS.has(v))
    )
  );
}

/**
 * Deterministic capability safeguard.
 * Optimus still decides through the scope model, but this prevents
 * obviously wrong team selection for common task types.
 */
function inferRelevantAgents(project: string, scope?: Partial<ScopeLock>): string[] {
  const text = `${project} ${scope?.objective || ""} ${scope?.deliverable || ""} ${(
    scope?.requirements || []
  ).join(" ")}`.toLowerCase();

  const result = new Set<string>(["pm"]);

  if (
    /design|designer|ui|ux|visual|animation|animated|motion|graphic|brand|color|typography|illustration|creative|sci-fi|sci fi/.test(
      text
    )
  ) {
    result.add("designer");
  }

  if (
    /html|css|javascript|frontend|front-end|web|browser|canvas|svg|three\.js|threejs|interaction|component|responsive/.test(
      text
    )
  ) {
    result.add("frontend");
  }

  if (
    /backend|back-end|api|database|db|server|authentication|auth|storage|payment|payments|integration|queue|webhook/.test(
      text
    )
  ) {
    result.add("backend");
  }

  if (
    /qa|test|testing|security|performance|perf|bug|reliability|validation|quality|compatibility/.test(
      text
    )
  ) {
    result.add("qa");
  }

  // For implementation-heavy creative/web requests, frontend + designer
  // are the core team; QA is useful for validation.
  if (
    result.has("designer") &&
    result.has("frontend") &&
    !result.has("qa") &&
    /create|build|make|develop|implement|code|animation|website|web/.test(text)
  ) {
    result.add("qa");
  }

  return Array.from(result).filter((id) => AGENT_IDS.has(id));
}

function buildSafeFallback(project: string, relevant: string[]): AgendaItem[] {
  const owners = Array.from(new Set(relevant)).slice(0, 3);

  return [
    {
      index: 1,
      item: `Execute the CEO-requested deliverable only: ${cleanText(project, 900)}`,
      owners: owners.length >= 2 ? owners : ["pm", "qa"].filter((id) => AGENT_IDS.has(id)),
      requiresCode: relevant.includes("frontend") || relevant.includes("backend"),
    },
  ];
}

async function understandAndLockScope(
  client: OpenAI,
  model: string,
  project: string
): Promise<{ understanding: string; scope: ScopeLock }> {
  const fallbackAgents = inferRelevantAgents(project);

  try {
    const r = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: withSkills(`
You are Optimus, the Project Manager and Chair of a software Board Room.

FIRST understand the CEO request. Do NOT invent a broader project.

Return ONLY valid JSON:
{
  "understanding": "1-3 concise sentences explaining what the CEO actually wants",
  "scope": {
    "objective": "the exact outcome requested",
    "deliverable": "the exact thing that must be delivered",
    "requirements": ["only explicit or necessary requirements"],
    "exclusions": ["things that are not required and must not be introduced"],
    "relevant_agents": ["pm", "designer", "frontend", "backend", "qa"]
  }
}

Rules:
- Preserve the CEO's actual intent.
- Do not add payments, marketing, legal, auth, database, backend, or other domains unless the CEO request requires them.
- A narrow request must remain narrow.
- Choose agents by actual expertise required.
- pm is the chair, not automatically an implementation owner.
- Do not select an agent merely because it exists in the Board Room.
- If the request is design/animation/web implementation, designer/frontend/qa are relevant as appropriate.
- If backend is not needed, exclude backend.
- Keep requirements concrete and short.
- Never turn the CEO request into a generic product checklist.
          `.trim(), "scope", project, SCOPE_NOTE),
        },
        {
          role: "user",
          content: `CEO REQUEST:\n${project}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    });

    const raw = cleanText(r.choices?.[0]?.message?.content || "", 5000);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Scope model returned no JSON object");

    const parsed = JSON.parse(match[0]);
    const s = parsed.scope || {};

    const scope: ScopeLock = {
      objective: cleanText(s.objective || project),
      deliverable: cleanText(s.deliverable || project),
      requirements: Array.isArray(s.requirements)
        ? s.requirements.map((x: unknown) => cleanText(x, 500)).filter(Boolean).slice(0, 10)
        : [],
      exclusions: Array.isArray(s.exclusions)
        ? s.exclusions.map((x: unknown) => cleanText(x, 300)).filter(Boolean).slice(0, 12)
        : [],
      relevant_agents: safeAgentIds(s.relevant_agents),
    };

    // Deterministic safeguard supplements bad model selection,
    // but never replaces Optimus's scope understanding.
    const inferred = inferRelevantAgents(project, scope);
    scope.relevant_agents = Array.from(
      new Set(["pm", ...scope.relevant_agents, ...inferred])
    ).filter((id) => AGENT_IDS.has(id));

    return {
      understanding:
        cleanText(parsed.understanding || scope.objective, 1000) || scope.objective,
      scope,
    };
  } catch (err) {
    console.warn(
      `[BoardRoom] Optimus scope lock failed; using safe request-bound fallback: ${
        err instanceof Error ? err.message : String(err)
      }`
    );

    const scope: ScopeLock = {
      objective: cleanText(project, 1200),
      deliverable: cleanText(project, 1200),
      requirements: [],
      exclusions: [
        "Do not introduce unrelated product domains.",
        "Do not expand beyond the CEO request.",
      ],
      relevant_agents: fallbackAgents,
    };

    return {
      understanding: `The CEO wants exactly this deliverable: ${cleanText(project, 900)}`,
      scope,
    };
  }
}

export async function generateAgenda(
  client: OpenAI,
  model: string,
  project: string
): Promise<AgendaResult> {
  const { understanding, scope } = await understandAndLockScope(
    client,
    model,
    project
  );

  const inferred = inferRelevantAgents(project, scope);
  const relevantAgents = Array.from(
    new Set(["pm", ...scope.relevant_agents, ...inferred])
  ).filter((id) => AGENT_IDS.has(id));

  try {
    const r = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: withSkills(`
You are Optimus creating a Board Room agenda from a locked CEO scope.

Output ONLY a JSON array.
Each item:
{"item":"...", "owners":["agent1","agent2"], "requiresCode": true|false}

Allowed agents:
pm, designer, frontend, backend, qa

STRICT RULES:
- Agenda MUST stay inside the locked scope.
- Do not create generic checklist items.
- Do not invent payments, marketing, legal, auth, database, backend, or other unrelated work.
- Use only agents relevant to each item.
- owners must contain 2-3 agents whenever practical.
- One agenda item is valid for a small task.
- Several agenda items are valid for a larger task.
- The agenda must describe concrete work required to fulfill the CEO request.
- For a full website/app build, DO NOT merge multiple distinct concerns into one item. Create ONE item per concrete UI section, component, interaction, or technical decision (example: hero animation, navigation, product grid, product detail page, cart drawer, checkout flow, color system, typography system, button/interaction states, responsive behavior — each is its own item, not one combined item).
- Never split ONE activity into several items by input, case or amount (e.g. testing three amounts is ONE verification item; researching facts and storing those same facts is ONE item). Every item must need its own distinct discussion.
- Propose at most 30 agenda items total (kazi kubwa inahitaji items wengi — usiogope kufika juu ya kikomo kwa miradi mikubwa). Prioritize the most important, concrete concerns within that limit — prefer many small, precise items over few broad ones.
- Set "requiresCode": true ONLY when the item's deliverable is actual source code to implement/build (e.g. a component, an API endpoint, an animation script, a test suite). Set "requiresCode": false for pure decision/architecture items (e.g. choosing a color palette, naming a page structure) that produce no code by themselves.
          `.trim(), "agenda", `${project}\n${scope.objective}\n${scope.deliverable}\n${scope.requirements.join("\n")}`, AGENDA_NOTE),
        },
        {
          role: "user",
          content: `
LOCKED SCOPE:
${JSON.stringify(
  {
    objective: scope.objective,
    deliverable: scope.deliverable,
    requirements: scope.requirements,
    exclusions: scope.exclusions,
    relevant_agents: relevantAgents,
  },
  null,
  2
)}

ORIGINAL CEO REQUEST:
${project}
          `.trim(),
        },
      ],
      temperature: 0.2,
      max_tokens: 6000,
    });

    const raw = String(r.choices?.[0]?.message?.content || "")
      .replace(/```json|```/gi, "")
      .trim();

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Agenda model returned no JSON array");

    const parsed = JSON.parse(match[0]);

    const items: AgendaItem[] = (Array.isArray(parsed) ? parsed : [])
      .filter((x: any) => x && typeof x.item === "string")
      .slice(0, 20)
      .map((x: any, i: number) => {
        const owners = safeAgentIds(x.owners);

        // Force agenda ownership back into the locked team.
        const filteredOwners = owners.filter((id) =>
          relevantAgents.includes(id)
        );

        let finalOwners = filteredOwners.slice(0, 3);

        if (finalOwners.length < 2) {
          const candidates = relevantAgents.filter(
            (id) => !finalOwners.includes(id)
          );
          finalOwners = Array.from(
            new Set([...finalOwners, ...candidates])
          ).slice(0, 3);
        }

        if (finalOwners.length < 2) {
          finalOwners = ["pm", "qa"].filter((id) => AGENT_IDS.has(id));
        }

        return {
          index: i + 1,
          item: cleanText(x.item, 900),
          owners: finalOwners,
          requiresCode: Boolean(x.requiresCode),
        };
      })
      .filter((x: AgendaItem) => x.item.length > 0);

    if (items.length >= 1) {
      return {
        understanding,
        scope: {
          ...scope,
          relevant_agents: relevantAgents,
        },
        items,
        skills: { ...lastSkillTags },
      };
    }

    throw new Error("Agenda was empty");
  } catch (err) {
    console.warn(
      `[BoardRoom] Agenda generation failed; using SAFE CEO-BOUND fallback: ${
        err instanceof Error ? err.message : String(err)
      }`
    );

    return {
      understanding,
      scope: {
        ...scope,
        relevant_agents: relevantAgents,
      },
      items: buildSafeFallback(project, relevantAgents),
      skills: { ...lastSkillTags },
    };
  }
}
