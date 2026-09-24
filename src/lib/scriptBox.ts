import { getAgent } from "./agents";
import type { BoardEvent } from "./types";

type CorrectionWriter = {
  id: string;
  name: string;
  role?: string;
  systemPrompt: (args: { date: string }) => string;
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
  return `${base}.${lang === "html" ? "html" : lang === "css" ? "css" : lang === "python" ? "py" : "ts"}`;
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
            content: writer.systemPrompt({
              date: new Date().toLocaleString("en-GB"),
            }),
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

      for (const m of blocks) {
        const searchText = m[1].replace(/\r\n/g, "\n");
        const replaceText = m[2].replace(/\r\n/g, "\n");
        const occurrences = working.split(searchText).length - 1;

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

      const lang = detectLang(working);
      const title = makeTitle(writer.id, lang);
      const messageContent =
        `${BT}${BT}${BT}scriptbox\n` +
        `title: ${title}\n` +
        `lang: ${lang}\n` +
        `---\n` +
        `${working}\n` +
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
