// src/lib/brain/skills/tools/webapp-testing.ts
// Port ya anthropics/skills webapp-testing: examples/element_discovery.py (buttons, links, inputs) +
// examples/static_html_automation.py (static HTML → soma selectors moja kwa moja) + "Reconnaissance-Then-Action".
// Hakuna browser ndani ya Board: probe hii inasoma HTML/JSX ya deliverable (static) na kutoa FACTS
// ("STATIC PROBE") kwa review ya Cybertron. Inaendeshwa AUTOMATIC na runTools.ts.

export interface ProbeResult {
  applicable: boolean;
  counts: Record<string, number>;
  facts: string[];
  warnings: string[];
}

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
};
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}(\\s*=|[\\s/>])`, "i").test(tag);

/** code = deliverable (HTML / JSX / TSX / Vue / Svelte, au markdown yenye fences) */
export function probeHtml(code: string): ProbeResult {
  const src = String(code || "");
  const counts: Record<string, number> = {};
  const facts: string[] = [];
  const warnings: string[] = [];
  const markup = /<(button|a|input|form|img|div|section|main|h[1-6]|label|select|textarea|nav|header|footer)\b/i.test(src);
  if (!markup) return { applicable: false, counts, facts, warnings };

  // buttons (element_discovery: "Discover all buttons on the page")
  const buttons = [...src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  const roleButtons = [...src.matchAll(/<(?:div|span|a)\b[^>]*\brole\s*=\s*["']button["'][^>]*>/gi)];
  counts.buttons = buttons.length + roleButtons.length;
  const btnNames = buttons.map((b) => strip(b[2]) || attr(`<b ${b[1]}>`, "aria-label") || "").filter(Boolean);
  const unnamed = buttons.filter((b) => !strip(b[2]) && !/aria-label(ledby)?\s*=/.test(b[1]) && !/\btitle\s*=/.test(b[1])).length;
  facts.push(`Found ${counts.buttons} buttons${btnNames.length ? `: ${btnNames.slice(0, 8).map((n) => `"${n.slice(0, 40)}"`).join(", ")}` : ""}`);
  if (unnamed) warnings.push(`${unnamed} button(s) have no accessible name (no text, aria-label or title)`);
  const noType = buttons.filter((b) => !/\btype\s*=/.test(b[1])).length;

  // links
  const links = [...src.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  counts.links = links.length;
  const hrefs = links.map((l) => ({ text: strip(l[2]), href: attr(`<a ${l[1]}>`, "href") }));
  facts.push(`Found ${links.length} links${hrefs.length ? `: ${hrefs.slice(0, 5).map((h) => `${(h.text || "[no text]").slice(0, 30)} -> ${(h.href ?? "[no href]").slice(0, 60)}`).join("; ")}` : ""}`);
  const deadLinks = hrefs.filter((h) => h.href === null || h.href === "" || h.href === "#").length;
  if (deadLinks) warnings.push(`${deadLinks} link(s) have no real href ("#", empty or missing) — use a <button> for actions`);
  const blank = links.filter((l) => /target\s*=\s*["']_blank["']/.test(l[1]) && !/rel\s*=\s*["'][^"']*noopener/.test(l[1])).length;
  if (blank) warnings.push(`${blank} target="_blank" link(s) without rel="noopener"`);
  const emptyLinks = hrefs.filter((h) => !h.text).length;
  if (emptyLinks) warnings.push(`${emptyLinks} link(s) have no visible text`);

  // inputs
  const inputs = [...src.matchAll(/<(input|textarea|select)\b([^>]*)\/?>/gi)].filter((m) => !/type\s*=\s*["'](hidden|submit|button|reset)["']/i.test(m[2]));
  counts.inputs = inputs.length;
  const labelsFor = new Set([...src.matchAll(/<label\b[^>]*\b(?:for|htmlFor)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  const wrapped = [...src.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)].map((m) => m[0]);
  const inputList = inputs.map((m) => {
    const tag = `<${m[1]} ${m[2]}>`;
    const id = attr(tag, "id");
    const name = attr(tag, "name") || id || "[unnamed]";
    const type = m[1].toLowerCase() === "input" ? attr(tag, "type") || "text" : m[1].toLowerCase();
    const labelled = (id && labelsFor.has(id)) || /aria-label(ledby)?\s*=/.test(m[2]) || wrapped.some((w) => w.includes(m[0]));
    return { name, type, labelled, placeholderOnly: !labelled && hasAttr(tag, "placeholder") };
  });
  facts.push(`Found ${inputs.length} input fields${inputList.length ? `: ${inputList.slice(0, 8).map((i) => `${i.name} (${i.type})`).join(", ")}` : ""}`);
  const unlabelled = inputList.filter((i) => !i.labelled);
  if (unlabelled.length) warnings.push(`${unlabelled.length} input(s) without a label${unlabelled.some((i) => i.placeholderOnly) ? " (placeholder is not a label)" : ""}: ${unlabelled.slice(0, 5).map((i) => i.name).join(", ")}`);

  // forms
  const forms = [...src.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  counts.forms = forms.length;
  if (forms.length) {
    facts.push(`Found ${forms.length} form(s)`);
    const noSubmit = forms.filter((f) => !/type\s*=\s*["']submit["']/.test(f[2]) && !/<button\b(?![^>]*type\s*=\s*["'](button|reset)["'])/i.test(f[2])).length;
    if (noSubmit) warnings.push(`${noSubmit} form(s) without a submit control`);
    if (noType) facts.push(`${noType} <button> without explicit type (defaults to submit inside a form)`);
  }

  // images
  const imgs = [...src.matchAll(/<img\b([^>]*)\/?>/gi)];
  counts.images = imgs.length;
  const noAlt = imgs.filter((m) => !/\balt\s*=/.test(m[1])).length;
  if (imgs.length) facts.push(`Found ${imgs.length} image(s)`);
  if (noAlt) warnings.push(`${noAlt} <img> without alt`);
  const svgs = [...src.matchAll(/<svg\b([^>]*)>/gi)];
  const svgUnnamed = svgs.filter((m) => !/aria-(label|hidden)|role\s*=/.test(m[1])).length;
  if (svgUnnamed) facts.push(`${svgUnnamed} inline <svg> without aria-label/aria-hidden/role`);

  // headings
  const hs = [...src.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  counts.headings = hs.length;
  if (hs.length) facts.push(`Headings: ${hs.map((h) => `h${h}`).join(" ")}`);
  const h1 = hs.filter((h) => h === 1).length;
  const fullPage = /<(html|body|main)\b/i.test(src);
  if (fullPage && h1 === 0) warnings.push("no <h1> on a full page");
  if (h1 > 1) warnings.push(`${h1} <h1> elements`);
  for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) { warnings.push(`heading level skipped (h${hs[i - 1]} → h${hs[i]})`); break; }

  // click handlers on non-interactive elements (not keyboard accessible)
  const divClicks = [...src.matchAll(/<(div|span|li|img|section)\b([^>]*\bon(?:Click|click)\s*=[^>]*)>/g)].filter((m) => !/role\s*=|tabIndex|tabindex/.test(m[2])).length;
  if (divClicks) warnings.push(`${divClicks} click handler(s) on non-interactive elements without role/tabIndex (not keyboard accessible)`);

  // test selectors (Best Practices: descriptive selectors)
  const testIds = (src.match(/data-test(id)?\s*=/gi) || []).length;
  counts.testIds = testIds;
  const interactive = counts.buttons + counts.links + counts.inputs;
  if (interactive >= 3 && !testIds) facts.push("no data-testid selectors — QA scripts will need role=/text= selectors");

  // document-level
  if (/<html\b/i.test(src) && !/<html\b[^>]*\blang\s*=/i.test(src)) warnings.push("<html> without lang");
  if (/<head\b/i.test(src) && !/name\s*=\s*["']viewport["']/i.test(src)) warnings.push("no viewport meta (mobile layout)");
  // focus + motion (frontend-design quality floor)
  if (/outline\s*:\s*(none|0)\b/i.test(src) && !/:focus-visible/i.test(src)) warnings.push("outline removed without a :focus-visible replacement");
  if (/(@keyframes|animation\s*:|transition\s*:)/i.test(src) && !/prefers-reduced-motion/i.test(src)) facts.push("motion present without a prefers-reduced-motion rule");

  return { applicable: true, counts, facts, warnings };
}

/** Block ya maandishi kwa prompt ya reviewer. */
export function probeBlock(p: ProbeResult): string {
  if (!p.applicable) return "";
  return [
    "=== STATIC PROBE (automatic reconnaissance of the deliverable markup — facts, not a verdict) ===",
    ...p.facts.map((f) => `- ${f}`),
    ...(p.warnings.length ? ["Findings to check:", ...p.warnings.map((w) => `- ⚠ ${w}`)] : ["Findings to check: none detected by the static probe"]),
    "Use these facts as your inspected DOM; anything the probe cannot see (runtime behaviour, real rendering) is NOT VERIFIED.",
  ].join("\n");
}
