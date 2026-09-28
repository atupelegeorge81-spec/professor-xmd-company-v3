import { getAgent } from "./agents";
import type { BoardEvent } from "./types";
import { pureCode } from "./codeFence";

type CorrectionWriter = {
  id: string;
  name: string;
  role?: string;
};

type StreamTurn = (
  agent: any,
  messages: Record<string, unknown>[],
  msgId: string,
  answer: boolean,
  maxTok?: number,
) => Promise<string>;

type BoardLogType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "api"
  | "search"
  | "system";

export type CorrectionContext = {
  /** R10: system prompt kutoka Agent Runtime (brain) — phase "fix" */
  systemFor: (writer: CorrectionWriter) => Promise<string>;
  decision: string;
  itemText: string;
  reviewNote: string;
  itemIndex: number;

  codeWriters: CorrectionWriter[];
  codeByAgent: Record<string, string>;
  lastVisibleMsgId: Record<string, string>;

  addMsg: (agentId: string) => string;
  streamTurn: StreamTurn;
  setItemContent: (id: string, raw: string) => void;
  bcast: (event: BoardEvent) => void;
  blog: (type: BoardLogType, message: string) => void;

  subTalk: { name: string; text: string }[];
  transcript: { name: string; text: string; item?: number }[];
};

const TO = "<" + "think>";
const TC = "<" + "/think>";
const thinkRe = new RegExp(TO + "[\\s\\S]*?" + TC, "g");

const BT = String.fromCharCode(96);

const dissolveMessage = (
  msgId: string,
  markerText: string,
  ctx: CorrectionContext,
) => {
  ctx.bcast({ type: "msg_reset", id: msgId });
  ctx.bcast({ type: "token", id: msgId, text: markerText });
  ctx.setItemContent(msgId, markerText);
  ctx.bcast({ type: "msg_done", id: msgId });
};

function detectLang(code: string): string {
  if (/<!doctype\s+html|<html[\s>]/i.test(code)) return "html";
  if (/^\s*(import|export|const|let|function|async\s+function)\b/m.test(code) && /from\s+["']/m.test(code)) return "typescript";
  if (/^\s*(import|export|const|let|function|async\s+function)\b/m.test(code)) return "javascript";
  if (/^\s*@media|^\s*\.[a-zA-Z]|^\s*#[a-zA-Z].*\{/m.test(code)) return "css";
  if (/^\s*(def|class|import|from)\b/m.test(code)) return "python";
  return "text";
}

function makeTitle(writerId: string, lang: string): string {
  const map: Record<string, string> = {
    frontend: "frontend",
    backend: "backend",
    qa: "qa",
  };
  const base = map[writerId] || writerId;
  const ext: Record<string, string> = { html: "html", css: "css", python: "py", py: "py", javascript: "js", js: "js", jsx: "jsx", typescript: "ts", ts: "ts", tsx: "tsx", json: "json", bash: "sh", sh: "sh", sql: "sql" };
  return `${base}.${ext[lang.toLowerCase()] || "txt"}`;
}

/** R27: SEARCH ya block inapatikana kwenye script ya mwenzake (si yake) — kipande kinaweza kupimwa bila nafasi za pembeni */
function othersHave(ctx: CorrectionContext, selfId: string, search: string): boolean {
  const key = (x: string) => x.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  const k = key(search);
  if (!k) return false;
  return Object.entries(ctx.codeByAgent).some(([id, code]) => id !== selfId && (code.includes(search) || key(code).includes(k)));
}

/**
 * R27: tafuta SEARCH kwa mistari (trim) — dirisha moja tu la kipekee linakubaliwa. Indentation ya asili inabaki:
 * tofauti ya indentation ya mstari wa kwanza inaongezwa/inaondolewa kwenye mistari ya REPLACE.
 */
export function looseLocate(working: string, search: string, replace: string): { search: string; replace: string } | null {
  const sl = search.split("\n");
  while (sl.length && !sl[0].trim()) sl.shift();
  while (sl.length && !sl[sl.length - 1].trim()) sl.pop();
  if (!sl.length) return null;
  const wl = working.split("\n");
  const hits: number[] = [];
  for (let i = 0; i + sl.length <= wl.length; i++) {
    let same = true;
    for (let j = 0; j < sl.length; j++) if (wl[i + j].trim() !== sl[j].trim()) { same = false; break; }
    if (same) hits.push(i);
  }
  if (hits.length !== 1) return null;
  const i = hits[0];
  const orig = wl.slice(i, i + sl.length).join("\n");
  const ind = (x: string) => (x.match(/^[ \t]*/) || [""])[0];
  const have = ind(wl[i]), gave = ind(sl[0]);
  const rl = replace.split("\n").map((l) => {
    if (!l.trim()) return l;
    if (gave && l.startsWith(gave)) return have + l.slice(gave.length);
    if (!gave) return have + l;
    return l;
  });
  return { search: orig, replace: rl.join("\n") };
}

export async function applyReviewFixes(ctx: CorrectionContext): Promise<Record<string, string>> {
  for (const writer of ctx.codeWriters) {
    const baseline = ctx.codeByAgent[writer.id] || "";
    if (!baseline.trim()) continue;

    let applied = false;
    let feedback = "";

    for (let attempt = 0; attempt < 3 && !applied; attempt++) {
      const msgId = ctx.addMsg(writer.id);

      const othersCode = Object.entries(ctx.codeByAgent)
        .filter(([id]) => id !== writer.id)
        .map(
          ([id, code]) =>
            `--- Script ya ${getAgent(id)?.name || id} ---\n${code}`,
        )
        .join("\n\n");

      const prompt = `
LOCKED DECISION (karibu kufungwa):
${ctx.decision}

AGENDA ITEM:
${ctx.itemText}

MAONI YA MAREKEBISHO (REJECT / OBJECTION):
${ctx.reviewNote}

SCRIPT YAKO YA SASA (HII NDIYO TOLEO LA MWISHO -- soma kwa makini kabla ya kujibu):
${baseline}

SCRIPT ZA WENZAKO (muktadha tu):
${othersCode || "(hakuna)"}

${feedback ? `TATIZO LA JARIBU LILILOPITA (rekebisha hili sasa):\n${feedback}` : ""}

KAZI YAKO:
Kama maoni ya mkaguzi au pingamizi (objection) hayahusiani kabisa na script yako, andika HASA:
NO_CHANGES_NEEDED

Vinginevyo, USIANDIKE SCRIPT NZIMA UPYA. Toa PATCH ndogo tu kwa kutumia block moja au zaidi za muundo huu HASA:

<<<<<<< SEARCH
<mistari HASA, herufi kwa herufi, kutoka script yako ya sasa hapo juu -- ya kipekee, isionekane mahali pengine>
=======
<mistari mapya ya kuchukua nafasi yake>
>>>>>>> REPLACE

RULES:
- Patch SCRIPT YAKO TU (${writer.name}). Usiandike block za script za wenzako — kila mmoja anapata ombi lake la marekebisho.
- Kila block ya SEARCH lazima ilingane KIHALISIA na sehemu ya script hapo juu, na ionekane MARA MOJA tu.
- Patch iwe NDOGO iwezekanavyo; usiguse mistari isiyohusika na objection.
- Usirudie script nzima.
- Usiandike maelezo mengine nje ya block hizi (au NO_CHANGES_NEEDED).
- Ongeza block nyingi tu ukihitaji kubadilisha sehemu kadhaa tofauti.
`;

      const content = await ctx.streamTurn(
        writer,
        [
          {
            role: "system",
            content: await ctx.systemFor(writer),
          },
          { role: "user", content: prompt },
        ],
        msgId,
        false,
        6000,
      );

      const clean = content
        .replace(thinkRe, "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();

      if (/^NO_CHANGES_NEEDED/i.test(clean)) {
        ctx.setItemContent(
          msgId,
          `ℹ️ ${writer.name}: hakuna mabadiliko yanayohitajika kwenye script yangu kwa maoni haya.`,
        );
        ctx.bcast({ type: "msg_done", id: msgId });

        ctx.subTalk.push({ name: writer.name, text: clean });
        ctx.transcript.push({
          name: writer.name,
          text: clean,
          item: ctx.itemIndex,
        });

        applied = true;
        break;
      }

      const blockRe =
        /<<<<<<<\s*SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>>\s*REPLACE/g;

      const blocks = [...clean.matchAll(blockRe)];

      if (blocks.length === 0) {
        feedback =
          "Hukutumia muundo wa SEARCH/REPLACE sahihi -- tumia EXACTLY <<<<<<< SEARCH / ======= / >>>>>>> REPLACE, usiandike script nzima.";

        ctx.setItemContent(msgId, clean);
        ctx.bcast({ type: "msg_done", id: msgId });
        continue;
      }

      let working = baseline;
      let removedLines = 0;
      let addedLines = 0;
      let ok = true;

      const problems: string[] = [];
      const changes: {
        startLine: number;
        oldLines: string[];
        newLines: string[];
      }[] = [];

      const lineArray = (value: string): string[] =>
        value.length === 0 ? [] : value.split("\n");

      let skippedOthers = 0;
      for (const m of blocks) {
        let searchText = m[1].replace(/\r\n/g, "\n");
        let replaceText = m[2].replace(/\r\n/g, "\n");
        let occurrences = working.split(searchText).length - 1;

        // R27 (A3/A5 "patch imeshindwa mara 3"): block ya script ya MWENZAKO (maoni ya reviewer yaliwataja wote)
        // iliangusha patch NZIMA hata block sahihi zikiwepo → inarukwa; mwenzako anapata ombi lake mwenyewe.
        if (occurrences === 0 && othersHave(ctx, writer.id, searchText)) {
          skippedOthers++;
          continue;
        }
        // R27: kulinganisha herufi kwa herufi kumeshindwa → mistari bila kujali nafasi za pembeni (lazima iwe ya kipekee)
        if (occurrences === 0) {
          const loose = looseLocate(working, searchText, replaceText);
          if (loose) {
            searchText = loose.search;
            replaceText = loose.replace;
            occurrences = working.split(searchText).length - 1;
          }
        }

        if (occurrences !== 1) {
          ok = false;
          problems.push(
            `Kipande hiki hakikupatikana mara moja (kimeonekana mara ${occurrences}):\n${searchText.slice(0, 200)}`,
          );
          continue;
        }

        const matchIndex = working.indexOf(searchText);
        const startLine = working.slice(0, matchIndex).split("\n").length;
        const oldLines = lineArray(searchText);
        const newLines = lineArray(replaceText);

        changes.push({ startLine, oldLines, newLines });
        removedLines += oldLines.length;
        addedLines += newLines.length;

        working = working.replace(searchText, () => replaceText);
      }

      if (ok && changes.length === 0 && skippedOthers > 0) {
        // block zote zilikuwa za wenzake → hakuna mabadiliko kwenye script yake
        ctx.setItemContent(msgId, `ℹ️ ${writer.name}: marekebisho yaliyoombwa yanahusu script za wenzangu — script yangu haibadiliki.`);
        ctx.bcast({ type: "msg_done", id: msgId });
        applied = true;
        break;
      }

      // R28 (A4): patch yenye block zilizoingiliana iliacha ">>>>>>> REPLACE / <<<<<<< SEARCH" NDANI ya faq.astro
      //           na ikakubaliwa → code nzuri ikabadilishwa na isiyo-compile. Alama mpya = patch si halali.
      const marks = (v: string) => (v.match(/^[ \t]*(?:<{7}[ \t]*SEARCH|={7}|>{7}[ \t]*REPLACE)[ \t]*$/gm) || []).length;
      if (ok && marks(working) > marks(baseline)) {
        ok = false;
        problems.push("Patch yako iliacha alama za SEARCH/REPLACE NDANI ya script (block zilizoingiliana au REPLACE isiyofungwa). Kila block iwe kamili na tofauti: <<<<<<< SEARCH, mistari ya zamani, =======, mistari mipya, >>>>>>> REPLACE — block moja baada ya nyingine, kamwe block ndani ya REPLACE.");
      }

      if (!ok) {
        feedback = problems.join("\n\n");

        ctx.setItemContent(
          msgId,
          `⚠️ ${writer.name}: patch haikutumika kwa usahihi, anajaribu tena.`,
        );

        ctx.bcast({ type: "msg_done", id: msgId });
        continue;
      }

      // The only persistent content for this correction message is the FINAL script.
      // Diff details are sent as a transient BoardEvent and therefore never become
      // part of the saved message/Appwrite content.
      ctx.codeByAgent[writer.id] = working;

      // R10 (audit, Agenda 11 "qa.js v2" tupu): `working` ni ujumbe mzima wa writer (prose + ```lang fence).
      // Fence ya ndani ilivunja ```scriptbox — ScriptBox ilionyesha sentensi ya utangulizi badala ya code.
      // Sasa ScriptBox inapokea CODE TU (codeByAgent inabaki vile vile kwa patches zinazofuata).
      const shown = pureCode(working);
      const lang = shown.lang && shown.lang !== "text" ? shown.lang : detectLang(shown.code);
      const title = makeTitle(writer.id, lang);
      const messageContent =
        `${BT}${BT}${BT}scriptbox\n` +
        `title: ${title}\n` +
        `lang: ${lang}\n` +
        `---\n` +
        `${shown.code}\n` +
        `${BT}${BT}${BT}`;

      ctx.setItemContent(msgId, messageContent);
      ctx.bcast({
        type: "token",
        id: msgId,
        text: messageContent,
      });
      ctx.bcast({
        type: "script_diff",
        id: msgId,
        diff: {
          additions: addedLines,
          deletions: removedLines,
          changes,
        },
      });
      ctx.bcast({ type: "msg_done", id: msgId });

      ctx.subTalk.push({
        name: writer.name,
        text: `Sasisho la script: +${addedLines} -${removedLines}`,
      });

      ctx.transcript.push({
        name: writer.name,
        text: `Sasisho la script: +${addedLines} -${removedLines}`,
        item: ctx.itemIndex,
      });

      const previousId = ctx.lastVisibleMsgId[writer.id];

      if (previousId && previousId !== msgId) {
        dissolveMessage(
          previousId,
          `↕️ Script ilisasishwa — angalia sasisho chini (+${addedLines} -${removedLines})`,
          ctx,
        );
      }

      ctx.lastVisibleMsgId[writer.id] = msgId;
      applied = true;
    }

    if (!applied) {
      ctx.blog(
        "warning",
        `⚠️ ${writer.name}: patch imeshindwa mara 3 -- script inabaki kama ilivyo (angalia logs).`,
      );
    }
  }
  return ctx.codeByAgent;
}

export const applyObjectionFixes = applyReviewFixes;
