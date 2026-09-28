---
id: research-lookup
name: research-lookup
owners: all
line: plan, run and cite external evidence — multi-pass queries, verified unique sources, contradictory evidence kept
always:
trigger: \b(research\w*|sources?|evidence|references?|citations?|search\w*|look ?up|latest|current|2025|2026|statistic\w*|studies|study|docs?|documentation|standard|best practice|RESEARCH_REQUEST)\b
triggered: discussion, chat, report, objection
upstream: https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/research-lookup
license: MIT (K-Dense Inc.)
---
PROFESSOR-XMD edition of K-Dense "research-lookup". The workflow and the ten reference-quality rules are unchanged; the tooling is ours:
- "Parallel Search" = our search engine: the MANDATORY EVIDENCE GATE runs automatically before an owner's first answer (Appwrite semantic cache first, then the live engine). "Run another search pass" = end your turn with `RESEARCH_REQUEST: <query>`.
- "Parallel Extract / verify" = read the returned snippets/pages yourself and only count a source as verified if its text actually supports the claim.
- "manuscript" = the Board decision, the Ledger rationale and the final Swahili report. "research packet" = the EVIDENCE lines you write + the sources the system attached.
- "target 60 references" = the search budget of the Board (~10 results per pass); the principle is the same: verified and unique beats many.
- The system automatically deduplicates, canonicalizes and tiers sources (ported from research_lookup.py / manuscript_packet.py into `tools/research-lookup.ts`) and logs the tiers.
- Dropped (tooling only): Parallel CLI setup, Parallel Chat/Research/Perplexity backends, batch mode, output-file formats, related-skill hand-offs.
