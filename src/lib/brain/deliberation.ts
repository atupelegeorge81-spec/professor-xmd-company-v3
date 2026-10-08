// src/lib/brain/deliberation.ts — ULINZI WA MJADALA (anti-loop) kwa owners wa agenda moja.
// Tatizo lililoonekana (R12): owners wawili walirudia "AGREE… blocked… waiting for Mkuu" zamu 40 bila kitu kipya.
// Hapa: kila zamu inapimwa — ina jambo JIPYA? (pendekezo, ushahidi mpya, hati iliyosomwa, namba/URL mpya, maneno mapya)
//   • stall 2  → STALL NOTICE kwenye prompt ya zamu inayofuata (chaguo 4 tu: pendekeza / tafuta tofauti / soma chanzo / DEFER)
//   • stall 3 au kikomo cha zamu → CHAIR RESOLUTION: mwenyekiti (Optimus akiwa owner) analazimika kutoa PROPOSED DECISION
//     (yenye ASSUMPTION: zilizo wazi) au DEFER; kisha kila owner mwingine anapiga KURA MOJA ya mwisho (AGREE/DISAGREE)
//   • DEFER ya owner haifungi agenda — inaleta FALLBACK (toleo la chini + ASSUMPTION wazi)
// R37 · ITIFAKI YA KUFUNGA: hakuna hali ya OPEN/UNRESOLVED tena. Mnyororo: consensus (njia ya kawaida) →
//   kura ya mwisho BINDING (wote = consensus; wingi + kosa la wachache = mzunguko MMOJA wa marekebisho → kura ya pili →
//   rough consensus na DISSENT irekodiwa) → hakuna wingi → FALLBACK (mwenyekiti anachagua toleo la chini salama kutoka
//   yaliyojadiliwa tu + ASSUMPTION) → kama haipatikani kabisa: DEFER YA NDANI (rekodi ya ukweli; hakuna swali kwenda kwa Mkuu).
// Vizingiti vimepimwa kwenye log halisi: zamu zenye maendeleo ≤0.53, marudio ≥0.60 (overlap ya maneno ya maana).

export const MAX_OWNER_TURNS = Math.max(4, Number(process.env.BRAIN_MAX_OWNER_TURNS) || 15);
export const RESEARCH_CAP = Math.max(1, Number(process.env.BRAIN_RESEARCH_PER_ITEM) || 12);
export const REPEAT_OVERLAP = 0.58;
const STALL_NOTICE_AT = 2;
const STALL_CHAIR_AT = 3;

const STOP = new Set(
  "the and for with that this from have been will must into your our are not any only then than they them their what when were which while would could should about after before being there these those also more most such very just once until agree agreed aligned fully remains item agenda".split(" "),
);

export function contentWords(s: string): Set<string> {
  const t = String(s || "").toLowerCase().replace(/https?:\/\/\S+/g, " ");
  return new Set((t.match(/[a-z0-9][a-z0-9'-]{3,}/g) || []).filter((w) => !STOP.has(w)));
}

/** overlap coefficient ya maneno ya maana: |A∩B| / min(|A|,|B|) */
export function overlap(a: string | Set<string>, b: string | Set<string>): number {
  const A = typeof a === "string" ? contentWords(a) : a;
  const B = typeof b === "string" ? contentWords(b) : b;
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

const urlsOf = (s: string) => new Set((String(s).match(/https?:\/\/[^\s)\]>"']+/g) || []).map((u) => u.replace(/[.,;]+$/, "")));
const numsOf = (s: string) => new Set((String(s).replace(/https?:\/\/\S+/g, " ").match(/\b\d[\d,.]{1,}\b/g) || []).map((n) => n.replace(/[,.]$/, "")));

export type Signal = "proposal" | "agree" | "disagree" | "research" | "read" | "wait" | "insufficient" | "defer" | "clarify" | "none";

export function signalsOf(text: string): Signal[] {
  const s: Signal[] = [];
  const t = String(text || "");
  if (/PROPOSED DECISION:|UPDATED DECISION:/i.test(t)) s.push("proposal");
  if (/(^|\n)\s*\*{0,2}\s*AGREE:/i.test(t)) s.push("agree");
  if (/(^|\n)\s*\*{0,2}\s*DISAGREE:/i.test(t)) s.push("disagree");
  if (/RESEARCH_REQUEST:/i.test(t)) s.push("research");
  if (/READ_SOURCE:/i.test(t)) s.push("read");
  if (/(^|\n)\s*\*{0,2}\s*WAIT:/i.test(t)) s.push("wait");
  if (/INSUFFICIENT_EVIDENCE:/i.test(t)) s.push("insufficient");
  if (/(^|\n)\s*\*{0,2}\s*DEFER:/i.test(t)) s.push("defer");
  if (/CLARIFY:\s*@/i.test(t)) s.push("clarify");
  return s.length ? s : ["none"];
}

export interface TurnVerdict {
  progress: boolean;
  repeat: boolean;
  maxOverlap: number;
  reasons: string[];
  signals: Signal[];
  stall: number;
  action: "continue" | "notice" | "chair" | "vote" | "close";
}

type Mode = "open" | "chair" | "vote" | "amend" | "fallback" | "closed";

export interface VoteRecord { id: string; name: string; vote: "agree" | "disagree"; text: string }

export interface DelibOpts { owners: { id: string; name: string }[]; chairId?: string; maxTurns?: number; researchCap?: number }

export function createDeliberation(o: DelibOpts) {
  const maxTurns = o.maxTurns ?? MAX_OWNER_TURNS;
  const researchCap = o.researchCap ?? RESEARCH_CAP;
  const chairId = o.chairId && o.owners.some((x) => x.id === o.chairId) ? o.chairId : o.owners[0]?.id;
  const history: { id: string; words: Set<string>; urls: Set<string>; nums: Set<string> }[] = [];
  const seenUrls = new Set<string>();
  const seenNums = new Set<string>();
  const queries: { id: string; q: string; words: Set<string> }[] = [];
  const research: Record<string, number> = {};
  let stall = 0;
  let turns = 0;
  let mode: Mode = "open";
  let voters: string[] = [];
  let lastProposal = "";
  const agreedBy = new Set<string>(); // nani tayari amekubali pendekezo la sasa (AGREE ya pili si maendeleo)
  let newEvidence = 0; // vyanzo/hati mpya tangu zamu iliyopita
  let chairReason = "";
  let closedReason = "";
  // R37 · Itifaki ya Kufunga
  let voteRound = 0;
  let roundVotes: VoteRecord[] = [];
  const voteLog: { round: number; votes: VoteRecord[] }[] = [];
  let amendRound = 0;
  let amendDefects: VoteRecord[] = [];
  let fallbackReason = "";
  let fallbackAttempted = false;
  let fallbackTaken = false;
  let deferText = "";

  const nameOf = (id: string) => o.owners.find((x) => x.id === id)?.name || id;

  return {
    get mode() { return mode; },
    get stall() { return stall; },
    get turns() { return turns; },
    get maxTurns() { return maxTurns; },
    get researchCap() { return researchCap; },
    get closedReason() { return closedReason; },
    get fallbackTaken() { return fallbackTaken; },
    get deferredText() { return deferText; },
    researchUsed: (id: string) => research[id] || 0,
    queriesSoFar: () => queries.map((x) => x.q),
    closed: () => mode === "closed",

    /** R37: kura ya RAIDI ya mwisho (round ya mwisho tu) — majority = wingi wa walio pigora kura. */
    finalVotes(): { votes: VoteRecord[]; majority: boolean; unanimous: boolean } {
      const last = voteLog[voteLog.length - 1];
      if (!last) return { votes: [], majority: false, unanimous: false };
      const yes = last.votes.filter((v) => v.vote === "agree").length;
      return { votes: last.votes, majority: yes * 2 > last.votes.length, unanimous: last.votes.length > 0 && yes === last.votes.length };
    },

    /** Vyanzo vipya (URL ambazo hazijaonekana) — vinahesabika kama maendeleo ya zamu inayofuata. */
    noteEvidence(urls: string[]) {
      let n = 0;
      for (const u of urls) if (u && !seenUrls.has(u)) { seenUrls.add(u); n++; }
      newEvidence += n;
      return n;
    },

    /** RESEARCH_REQUEST: ruhusa? (kikomo kwa owner + query isiyorudiwa) */
    queryAllowed(id: string, q: string): { ok: boolean; why?: string; similarTo?: string } {
      if ((research[id] || 0) >= researchCap) return { ok: false, why: `research cap ${researchCap}/${researchCap} for this item reached` };
      const w = contentWords(q);
      const dup = queries.find((x) => overlap(w, x.words) >= 0.75);
      if (dup) return { ok: false, why: "near-duplicate of an earlier query", similarTo: dup.q };
      return { ok: true };
    },
    noteQuery(id: string, q: string) {
      research[id] = (research[id] || 0) + 1;
      queries.push({ id, q, words: contentWords(q) });
    },

    /** Nani azungumze sasa (chair/vote/amend/fallback wanalazimishwa). null = mzunguko wa kawaida. */
    forcedSpeaker(): string | null {
      if (mode === "chair" || mode === "amend" || mode === "fallback") return chairId || null;
      if (mode === "vote") return voters[0] || null;
      return null;
    },

    /** Maelekezo ya ziada ya zamu hii kwa agent huyu (yanaongezwa kwenye prompt). */
    instructionFor(id: string): string {
      if (mode === "chair" && id === chairId) {
        return `\n=== CHAIR RESOLUTION (you are the chair of this item — this turn must END the deadlock) ===
Reason: ${chairReason}.
The open discussion is over. Do NOT restate the blocker, do NOT agree with yourself, do NOT ask Mkuu (he is not in the Board; he reads the final report).
Output EXACTLY ONE of these two:
A) The best decision the team can defend with the evidence already gathered (primary sources first; a document that was READ counts; a secondary source is allowed only when labelled). Format:
   PROPOSED DECISION: <decision — concrete, buildable>
   RATIONALE: <why this is the best available>
   TRADE-OFF: <what is weaker because evidence is incomplete>
   EVIDENCE: <sources used, each with its URL and tier>
   ASSUMPTION: <each unverified value/claim, one per line, marked so the build can flag it (e.g. a "verify" note or config table)>
B) If NOTHING defensible can be built yet:
   DEFER: <exactly what is missing and who/what can supply it — the item still closes (DEFER record) and the build proceeds on the safest interpretation with explicit ASSUMPTIONs>
Under 200 words.\n`;
      }
      if (mode === "vote" && voters[0] === id) {
        return `\n=== FINAL VOTE (one turn, no further rounds) ===
The chair has put the proposal above to a final vote. Evaluate it once.
- Accept: begin with "AGREE:" (you may add ONE condition in the same line).
- Reject: begin with "DISAGREE:" and give the single concrete defect that makes it unshippable.
No research, no restating the blocker, no new proposal. Under 90 words.\n`;
      }
      if (mode === "amend" && id === chairId) {
        const defects = amendDefects.map((d) => `   · ${d.name}: ${d.text.replace(/\s+/g, " ").slice(0, 220)}`).join("\n");
        return `\n=== AMENDMENT ROUND (one round only — the final vote raised concrete defects) ===
Defects raised by owners:
${defects || "   (none recorded)"}
Fix EVERY defect. Output the COMPLETE amended decision (it REPLACES the previous proposal entirely — restate every part that still applies):
UPDATED DECISION: <the complete new decision>
RATIONALE: <why>
TRADE-OFF: <what is weaker>
EVIDENCE: <sources used, each with its URL and tier>
ASSUMPTION: <each unverified value/claim, one per line>
Under 200 words.\n`;
      }
      if (mode === "fallback" && id === chairId) {
        return `\n=== FALLBACK DECISION (the owners could not agree — you must still close this item with a decision) ===
Reason: ${fallbackReason}.${deferText ? `\nWhat the team said is missing: ${deferText.replace(/\s+/g, " ").slice(0, 300)}` : ""}
Produce the LOWEST-RISK defensible version, using ONLY what was already discussed and the evidence already gathered — do not invent new scope. Every unknown becomes an explicit ASSUMPTION line so the build can flag it.
PROPOSED DECISION: <the safest buildable version>
RATIONALE: <why this is defensible>
TRADE-OFF: <what is weaker because evidence is incomplete>
EVIDENCE: <sources used, each with its URL and tier>
ASSUMPTION: <each unverified value/claim, one per line>
Under 200 words. This item MUST close with a decision — "we could not decide" is not an option.\n`;
      }
      if (stall >= STALL_NOTICE_AT && mode === "open") {
        const qs = queries.slice(-6).map((x) => `   · ${x.q}`).join("\n");
        return `\n=== STALL NOTICE (the system measured that the last ${stall} turn(s) added nothing new) ===
Repeating a position, re-agreeing without a proposal, or re-stating a blocker wastes the free token quota and will not be counted.
This turn you MUST do exactly one NEW thing:
1) PROPOSED DECISION using the best evidence already gathered (label unverified values with ASSUMPTION:), or
2) READ_SOURCE: <url> — read the full text of a promising source already listed (e.g. an official PDF) instead of searching again, or
3) RESEARCH_REQUEST: <a query that is clearly DIFFERENT from these earlier ones>
${qs || "   (none yet)"}
4) DEFER: <what is missing> — the item is NOT dropped: the chair locks the lowest-risk version and your missing items become explicit ASSUMPTION lines.
If you cannot do one of these, the chair will close the item on the next stall.\n`;
      }
      return "";
    },

    /** Pima zamu iliyokamilika. */
    observe(id: string, text: string, opts: { proposal?: string } = {}): TurnVerdict {
      turns++;
      const words = contentWords(text);
      const urls = urlsOf(text);
      const nums = numsOf(text);
      const signals = signalsOf(text);
      let maxOv = 0;
      for (const h of history) maxOv = Math.max(maxOv, overlap(words, h.words));
      const newUrls = [...urls].filter((u) => !seenUrls.has(u));
      const newNums = [...nums].filter((n) => !seenNums.has(n));
      newUrls.forEach((u) => seenUrls.add(u));
      newNums.forEach((n) => seenNums.add(n));
      const reasons: string[] = [];
      const newProposal = !!opts.proposal && opts.proposal !== lastProposal;
      if (newProposal) { reasons.push("new proposal"); lastProposal = opts.proposal!; agreedBy.clear(); agreedBy.add(id); }
      if (signals.includes("agree") && lastProposal && !agreedBy.has(id)) { reasons.push("agreed to a proposal"); agreedBy.add(id); }
      if (signals.includes("disagree") && lastProposal) reasons.push("concrete disagreement");
      if (newEvidence > 0) reasons.push(`${newEvidence} new source(s)`);
      if (signals.includes("read")) reasons.push("reading a source");
      if (signals.includes("defer")) reasons.push("defer");
      if (signals.includes("clarify")) reasons.push("clarifying question");
      if (maxOv < REPEAT_OVERLAP && (newUrls.length || newNums.length >= 2)) reasons.push("new facts");
      else if (maxOv < REPEAT_OVERLAP && !signals.some((s) => s === "wait" || s === "insufficient")) reasons.push("new content");
      newEvidence = 0;
      const repeat = maxOv >= REPEAT_OVERLAP;
      const progress = reasons.length > 0 && !(repeat && reasons.every((r) => r === "new content"));
      stall = progress ? 0 : stall + 1;
      history.push({ id, words, urls, nums });

      // mashine ya hali
      let action: TurnVerdict["action"] = "continue";
      if (mode === "chair") {
        if (signals.includes("proposal") && !signals.includes("defer")) {
          voteRound = 1; roundVotes = [];
          voters = o.owners.map((x) => x.id).filter((x) => x !== chairId);
          mode = voters.length ? "vote" : "closed";
          if (mode === "closed") closedReason = "chair decided (single owner)";
          action = mode === "vote" ? "vote" : "close";
        } else if (signals.includes("defer")) {
          mode = "closed"; closedReason = "chair deferred the item"; action = "close";
        } else {
          // R37: mwenyekiti hakutoa pendekezo — hali ya OPEN haizalishwi tena; anaingia FALLBACK (toleo la chini salama)
          mode = "fallback"; fallbackReason = "chair resolution produced no decision — fallback (lowest safe version) required"; fallbackAttempted = false; action = "chair";
        }
      } else if (mode === "vote") {
        // R37: kura ya mwisho inarekodiwa (BINDING) — si tu kumondoa mpigaji kura
        roundVotes.push({ id, name: nameOf(id), vote: signals.includes("agree") ? "agree" : "disagree", text: String(text || "").slice(0, 400) });
        voters = voters.filter((x) => x !== id);
        if (voters.length) {
          action = "vote";
        } else {
          voteLog.push({ round: voteRound, votes: roundVotes.slice() });
          const yes = roundVotes.filter((x) => x.vote === "agree").length;
          const total = roundVotes.length;
          if (total > 0 && yes === total) {
            mode = "closed"; closedReason = "final vote unanimous"; action = "close";
          } else if (yes * 2 > total && amendRound < 1) {
            mode = "amend"; amendRound++; amendDefects = roundVotes.filter((x) => x.vote === "disagree"); action = "chair";
          } else if (yes * 2 > total) {
            mode = "closed"; closedReason = "final vote majority after amendment (rough consensus)"; action = "close";
          } else {
            mode = "fallback"; fallbackReason = `final vote: ${yes}/${total} in favour — no majority`; fallbackAttempted = false; action = "chair";
          }
        }
      } else if (mode === "amend") {
        if (opts.proposal) {
          voteRound++; roundVotes = [];
          voters = o.owners.map((x) => x.id).filter((x) => x !== chairId);
          mode = voters.length ? "vote" : "closed";
          if (mode === "closed") closedReason = "chair amended (single owner)";
          action = mode === "vote" ? "vote" : "close";
        } else {
          mode = "fallback"; fallbackReason = "amendment turn produced no updated decision"; fallbackAttempted = false; action = "chair";
        }
      } else if (mode === "fallback") {
        if (opts.proposal) {
          fallbackTaken = true; mode = "closed"; closedReason = `fallback decision locked (${fallbackReason})`; action = "close";
        } else if (!fallbackAttempted) {
          fallbackAttempted = true; action = "chair"; // jaribio la pili — quote za guards zinaonyeshwa kwenye prompt
        } else {
          mode = "closed"; closedReason = `chair could not produce a fallback (${fallbackReason})`; action = "close";
        }
      } else if (signals.includes("defer") && !signals.includes("proposal")) {
        // R37: DEFER ya owner haifungi agenda kama OPEN tena — mwenyekiti anatengeneza toleo la chini + ASSUMPTION wazi
        deferText = String(text || "").slice(0, 400);
        mode = "fallback"; fallbackReason = `${nameOf(id)} deferred — missing information becomes explicit ASSUMPTION lines`; fallbackAttempted = false; action = "chair";
      } else if (stall >= STALL_CHAIR_AT || turns >= maxTurns) {
        mode = "chair";
        chairReason = stall >= STALL_CHAIR_AT ? `${stall} consecutive turns without new information` : `owner-turn cap ${maxTurns} reached`;
        action = "chair";
      } else if (stall >= STALL_NOTICE_AT) action = "notice";

      return { progress, repeat, maxOverlap: Math.round(maxOv * 100) / 100, reasons, signals, stall, action };
    },

    /** Hali ya kuonyesha kwenye LIVE CONTEXT (resources.ts). */
    snapshot() {
      return { turn: turns, cap: maxTurns, stall, mode, research: { ...research }, researchCap, queries: queries.length };
    },
    nameOf,
  };
}

export type Deliberation = ReturnType<typeof createDeliberation>;

/** R39: jibu la swali ni ECHO ya swali/maulizo yenyewe? (kurudia maneno bila namba/URL/kitu kipya
 *  = "I confirm that X" ya Optimus 6ac7d777 — si ushahidi). Ushahidi = URL mpya au namba mpya
 *  ambayo haikuwepo kwenye swali; bila hiyo, ≥80% ya maneno ya jibu yakiwa ni ya swali → echo. */
export function isEchoAnswer(question: string, answer: string): boolean {
  const q = contentWords(question);
  const a = contentWords(answer);
  if (!q.size || !a.size) return false;
  const newUrls = [...urlsOf(answer)].filter((u) => !urlsOf(question).has(u));
  if (newUrls.length) return false;
  const newNums = [...numsOf(answer)].filter((n) => !numsOf(question).has(n));
  if (newNums.length >= 1) return false;
  let n = 0;
  for (const w of a) if (q.has(w)) n++;
  return n / a.size >= 0.8;
}

/** Kanuni za mjadala kwa owners (zinaingia kwenye prompt ya owner). */
export const DELIBERATION_RULES = `=== DELIBERATION RULES (depth without looping) ===
- Every turn must ADD something new: a proposal, a new source or document read, a new number/fact, a concrete defect, or a decision. Never restate your own or another owner's earlier point; the system measures repetition and counts repeated turns as stalls.
- "AGREE:" is only meaningful when a PROPOSED DECISION exists. Agreeing with a blocker or with "we are aligned" is not progress — make a proposal instead.
- Go deep by READING, not by re-searching: when a promising source is listed (official site, PDF), write READ_SOURCE: <url> to get its full text instead of issuing another near-identical search.
- Missing external data is never a reason to loop. Decide with the best evidence available (primary > secondary), mark every unverified value with ASSUMPTION:, and design the deliverable so those values are easy to verify later (e.g. a config table with source + "verify" flag). If truly nothing can be built, write DEFER: <what is missing>.
- ANSWERING A QUESTION: answer with evidence — a number with its source, a document you READ, a calculation you show, or an explicit "I don't know — record it as ASSUMPTION:". Never restate the question back as "I confirm X" / "yes, X has been verified" without showing the evidence. An answer with no number, no source and no check is not an answer.
- JUDGING AN ANSWER: when someone answers your question, weigh the EVIDENCE in the answer (number, source, check), not its confident tone. An answer that merely echoes your question has no evidence — treat the value as unverified (ASSUMPTION:) or verify it yourself (READ_SOURCE, your own calculation).
- WAIT: is only for waiting on a specific answer from another owner in this same item, never for Mkuu or for "more search".`;
