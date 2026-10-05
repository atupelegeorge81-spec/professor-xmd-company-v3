"use client";
import "./stage.css";
import type { StageItem } from "@/lib/stage/types";
import { UserPrompt } from "../parts";
import { Fragment, memo, useCallback, useRef } from "react";
import { AgendaBuildCard, AgendaStartMark, ConveneCard, FinaleMark, ScopeCard } from "./Opening";
import { EvidenceCard } from "./Evidence";
import { ChairCard, ConsensusTick, StageMessage } from "./Turn";
import { AssemblyCard, DeliverableCard, ReviewCard, ScriptCard } from "./Code";
import { MemoryStrip, ObserversCard, OverruledCard, SealCard, SupersedeCard, TaskLine, ValidatorCard } from "./Ledger";
import { NoticeLine, ReportWriter, SummaryCard } from "./Finale";
import { PlanWriter } from "./Plan";
import { CuRunCard, CuPauseView, CuReportView, CuDividerMark } from "./Computer";
import { CuErrorView, CuExecView, CuLinkView, CuShotView, CuTextView, CuThinkingView } from "./cu/cards";

/** Dispatcher: kila StageItem → render yake (hakuna tukio bila render). */
export function StageStream({ items, onResume, sessionId }: { items: StageItem[]; onResume?: () => void; sessionId?: string | null }) {
  // callback thabiti → StageNode (memo) hairender upya kwa sababu ya arrow mpya ya mzazi
  const resumeRef = useRef(onResume);
  resumeRef.current = onResume;
  const resume = useCallback(() => resumeRef.current?.(), []);
  return (
    <div className="space-y-4">
      {items.map((it) => (
        <Fragment key={it.id}>
          {it.kind === "task" && it.task === "validate" && <FinaleMark />}
          <StageNode it={it} onResume={resume} sessionId={sessionId} />
        </Fragment>
      ))}
    </div>
  );
}

/** memo: item ni immutable — ni item iliyopatchiwa tu inayorender upya kila tick (zamani: Markdown yote ilichakatwa upya kila 16ms) */
const StageNode = memo(function StageNode({ it, onResume, sessionId }: { it: StageItem; onResume?: () => void; sessionId?: string | null }) {
  switch (it.kind) {
    case "user": return <UserPrompt text={it.text} />;
    case "convene": return <ConveneCard it={it} />;
    case "scope": return <ScopeCard it={it} />;
    case "agendaBuild": return <AgendaBuildCard it={it} />;
    case "agendaStart": return <AgendaStartMark it={it} />;
    case "evidence": return <EvidenceCard it={it} />;
    case "turn": return <StageMessage it={it} />;
    case "consensus": return <ConsensusTick it={it} />;
    case "chair": return <ChairCard it={it} />;
    case "script": return <ScriptCard it={it} />;
    case "review": return <ReviewCard it={it} />;
    case "deliverable": return <DeliverableCard it={it} />;
    case "task": return <TaskLine it={it} />;
    case "memory": return <MemoryStrip it={it} />;
    case "seal": return <SealCard it={it} />;
    case "observers": return <ObserversCard it={it} />;
    case "supersede": return <SupersedeCard it={it} />;
    case "overruled": return <OverruledCard it={it} />;
    case "validator": return <ValidatorCard it={it} />;
    case "assembly": return <AssemblyCard it={it} />;
    case "report": return <ReportWriter it={it} />;
    case "plan": return <PlanWriter it={it} sessionId={sessionId} />;
    case "notice": return <NoticeLine it={it} onResume={onResume} />;
    case "summary": return <SummaryCard it={it} />;
    case "cuDivider": return <CuDividerMark />;
    case "cuRun": return <CuRunCard it={it} />;
    case "cuPause": return <CuPauseView it={it} />;
    case "cuReport": return <CuReportView it={it} />;
    /* R31 timeline (kama xmd3): kila tukio la CU lina render yake kwenye mkondo */
    case "cuThink": return <CuThinkingView it={it} />;
    case "cuText": return <CuTextView it={it} />;
    case "cuExec": return <CuExecView it={it} />;
    case "cuShot": return <CuShotView it={it} />;
    case "cuLink": return <CuLinkView it={it} />;
    case "cuError": return <CuErrorView it={it} />;
    default: {
      const never: never = it;
      return never;
    }
  }
});
