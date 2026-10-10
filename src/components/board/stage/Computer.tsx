"use client";
/* ============================================================== R31 · XMD COMPUTER
 * UI ya CU ni TIMELINE (kama xmd3 — agizo la CEO 05-10): kila tukio lina card
 * yake kwenye mkondo — maneno ya agent KAWAIDA (hakuna avatar/bubble, markdown
 * + mermaid), exec/shot/GitHub/Live cards (xmd3 kama zilivo, shimmer zao).
 * CuRunCard hapa ni card ya HALI tu — maandalizi ya e2b (task, status, tokens,
 * Files badge). Ripoti ni DOCUMENT (CuReportCard — idhini 04-10). */

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, ExternalLink, File, FileCode2, FileJson, FileText, Folder, FolderOpen, GitBranch, Image as ImageIcon, Monitor, PauseCircle, Rocket, X, XCircle } from "lucide-react";
import type { CuFileEntry, CuPauseItem, CuReportItem, CuRunItem } from "@/lib/stage/types";
import { compact } from "@/lib/utils";
import { quotaPauseCopy } from "@/lib/cu/pauseCopy"; // R44-E
import { ReportBody } from "../../reports/ReportBody";
import { Lane, Spinner, TONE, Tag } from "./kit";

/* ── Files tree — viewer tu (si editor) · simu: sheet (back ya kardi).
 * UMBO la FileTree ya xmd3 (ileoile): folda zinafunguka (chevron + Folder/FolderOpen),
 * icons za aina ya faili, saizi kila faili, "N faili · N folda" — rangi za company. ── */

/** flat entries (za bridge {p,d,s} / za zamani string) → mti (kama build() ya xmd3 FileTree) */
function buildFileTree(files: Array<CuFileEntry | string>) {
  type Node = { name: string; path: string; dir: boolean; size: number; children: Node[] };
  const root: Node = { name: "ws", path: "", dir: true, size: 0, children: [] };
  for (const f of files) {
    const path = typeof f === "string" ? f : f.path;
    const isDir = typeof f === "string" ? path.endsWith("/") : f.isDir;
    const size = typeof f === "string" ? 0 : f.size;
    const parts = String(path || "").split("/").filter(Boolean);
    let cur = root;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const cpath = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((x) => x.name === p);
      if (!next) {
        next = { name: p, path: cpath, dir: last ? isDir : true, size: last ? size : 0, children: [] };
        cur.children.push(next);
      }
      if (last) { next.size = size; next.dir = isDir; }
      cur = next;
    });
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ name }: { name: string }) {
  const e = name.split(".").pop()?.toLowerCase() ?? "";
  const p = { size: 13, strokeWidth: 1.9 };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(e)) return <ImageIcon {...p} />;
  if (["json", "lock"].includes(e)) return <FileJson {...p} />;
  if (["js", "ts", "tsx", "jsx", "py", "sh", "mjs", "css", "html", "go", "rs"].includes(e)) return <FileCode2 {...p} />;
  if (["md", "txt", "log"].includes(e)) return <FileText {...p} />;
  return <File {...p} />;
}

function TreeRow({ n, depth, open, toggle }: { n: ReturnType<typeof buildFileTree>; depth: number; open: Set<string>; toggle: (p: string) => void }) {
  const isOpen = open.has(n.path);
  return (
    <>
      <button
        className="flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left font-mono text-[11.5px] text-[var(--color-fg-2)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-fg)]"
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => (n.dir ? toggle(n.path) : undefined)}
        title={n.path}
      >
        {n.dir ? (
          <>
            <ChevronRight size={12} className={`shrink-0 text-[var(--color-faint)] transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
            {isOpen ? <FolderOpen size={13} strokeWidth={1.9} className="shrink-0 text-[#a78bfa]" /> : <Folder size={13} strokeWidth={1.9} className="shrink-0 text-[#a78bfa]" />}
          </>
        ) : (
          <span className="ml-[14px] shrink-0 text-[var(--color-muted)]"><FileIcon name={n.name} /></span>
        )}
        <span className="truncate">{n.name}</span>
        {!n.dir && <span className="ml-auto shrink-0 pl-2 text-[10px] text-[var(--color-faint)]">{fmtSize(n.size)}</span>}
      </button>
      {n.dir && isOpen && n.children.map((ch) => (
        <TreeRow key={ch.path} n={ch} depth={depth + 1} open={open} toggle={toggle} />
      ))}
    </>
  );
}

export function FilesSheet({ files, count, onClose }: { files: Array<CuFileEntry | string>; count: number; onClose: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // R31-G5: entries za zamani zilikuwa "[object Object]" (map(String) ya objects) — zinafiltiriwa
  const clean = useMemo(() => files.filter((f) => f !== "[object Object]"), [files]);
  const tree = useMemo(() => buildFileTree(clean), [clean]);
  // xmd3: folda za ngazi ya KWANZA zinafunguliwa mara ya kwanza
  useEffect(() => {
    setOpen((prev) => {
      if (prev.size) return prev;
      const next = new Set(prev);
      for (const ch of tree.children) if (ch.dir) next.add(ch.path);
      return next;
    });
  }, [tree]);
  const toggle = (p: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(p)) n.delete(p); else n.add(p);
    return n;
  });
  const nFiles = clean.filter((f) => (typeof f === "string" ? !f.endsWith("/") : !f.isDir)).length;
  const nDirs = clean.filter((f) => (typeof f === "string" ? f.endsWith("/") : f.isDir)).length;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(4_6_10/0.72)] p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-[var(--color-line-strong)] bg-[var(--color-ink-1)] sm:rounded-2xl animate-[rise_0.3s_both]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <Folder size={15} className="text-[#a78bfa]" />
          <p className="flex-1 text-[13.5px] font-semibold">Mafaili ({count})</p>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-auto px-2.5 py-2.5 [scrollbar-width:thin]">
          {clean.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[var(--color-muted)]">Bado hakuna faili.<br />Yatatokea XMD akianza kuunda.</p>
          ) : (
            tree.children.map((ch) => <TreeRow key={ch.path} n={ch} depth={0} open={open} toggle={toggle} />)
          )}
        </div>
        <div className="border-t border-[var(--color-line)] px-4 py-2 font-mono text-[10.5px] text-[var(--color-faint)]">{nFiles} faili · {nDirs} folda</div>
      </div>
    </div>
  );
}

/* ── Divider ya awamu ya CU — badge + mistari miwili (mtindo uleule wa agenda-start; uamuzi #2). ── */
export function CuDividerMark() {
  return (
    <div className="animate-[rise_0.5s_both] pt-3">
      <div className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--color-line-strong)]" />
        <span className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-ink-2)] py-1 pl-1 pr-2.5 text-[11.5px]">
          <span className="grid size-5 place-items-center rounded-full bg-[rgb(167_139_250/0.16)] text-[#a78bfa]"><Monitor size={11} /></span>
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[var(--color-fg)]">XMD COMPUTER</span>
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--color-line-strong)]" />
      </div>
    </div>
  );
}

/* ── Card ya HALI — maandalizi ya e2b (divider imetangulia kwenye mkondo).
 * Si tank: execs/shots/maneno yote yako kwenye mkondo kama items zao. */
export function CuRunCard({ it }: { it: CuRunItem }) {
  const [filesOpen, setFilesOpen] = useState(false);
  const running = !it.finished && it.status === "run";
  const paused = it.status === "paused";
  const tone = running ? TONE.violet : paused ? TONE.warn : it.status === "error" ? TONE.bad : TONE.ok;
  const mm = it.ms ? Math.round(it.ms / 1000) : null;
  return (
    <Lane>
      <div className="overflow-hidden rounded-2xl border transition-colors duration-500" style={{ borderColor: `rgb(${tone.rgb} / 0.24)`, background: `linear-gradient(160deg, rgb(${tone.rgb} / 0.07), rgb(${tone.rgb} / 0.01) 45%)` }}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(167_139_250/0.14)] text-[#a78bfa]"><Monitor size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14.5px] font-semibold tracking-[-0.01em]">
              XMD Computer
              {running ? <Spinner size={10} color="#a78bfa" /> : paused ? <PauseCircle size={13} className="text-[#fbbf24]" /> : it.status === "error" ? <XCircle size={13} className="text-[#f87171]" /> : <CheckCircle2 size={13} className="text-[#34d399]" />}
            </p>
            <p className="truncate text-[11.5px] text-[var(--color-muted)]" title={it.task}>{it.task}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {running ? <Tag tone="violet">Inatekeleza…</Tag> : paused ? <Tag tone="warn">Imepumzika</Tag> : it.status === "error" ? <Tag tone="bad">Imesimama</Tag> : <Tag tone="ok">Imekamilika</Tag>}
            <span className="flex items-center gap-1 font-mono text-[9.5px] text-[var(--color-faint)]">
              {compact(it.tokens)} tk · {it.requests} calls{running ? ` · hatua ${it.step}` : ""}{!running && mm ? ` · ${mm}s` : ""}
            </span>
          </div>
        </div>
        {/* footer: Files badge + linki (za mwisho — kwa mkondo pia kuna cards zao) */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-4 py-2.5">
          <button onClick={() => setFilesOpen(true)} className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-2.5 text-[11px] font-medium text-[var(--color-fg-2)] hover:bg-white/[0.06] hover:text-[var(--color-fg)]">
            <Folder size={12} className="text-[#a78bfa]" /> Files <span className="font-mono text-[10px] text-[var(--color-faint)]">{it.filesCount}</span>
          </button>
          {it.github && (
            <a href={it.github} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-2.5 text-[11px] font-medium text-[var(--color-fg-2)] hover:bg-white/[0.06] hover:text-[var(--color-fg)]">
              <GitBranch size={12} className="text-[#34d399]" /> GitHub <ExternalLink size={10} className="text-[var(--color-faint)]" />
            </a>
          )}
          {it.deploy && (
            <a href={it.deploy} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-2.5 text-[11px] font-medium text-[var(--color-fg-2)] hover:bg-white/[0.06] hover:text-[var(--color-fg)]">
              <Rocket size={12} className="text-[#7dd3fc]" /> Live <ExternalLink size={10} className="text-[var(--color-faint)]" />
            </a>
          )}
          {it.screenshots > 0 && (
            <span className="ml-auto font-mono text-[9.5px] text-[var(--color-faint)]">{it.screenshots} screenshots</span>
          )}
        </div>
      </div>
      {filesOpen && <FilesSheet files={it.files} count={it.filesCount} onClose={() => setFilesOpen(false)} />}
    </Lane>
  );
}

/* ── R31-G4+R44-E: pause + auto-resume (si kifo). Maandishi ya KWELI — dakika vs siku vs sandbox. ── */
export function CuPauseView({ it }: { it: CuPauseItem }) {
  const copy = quotaPauseCopy(it.resumeAt, Date.now(), (it as any).reason);
  const t = copy.t ?? "baadaye";
  const mm = it.ms ? Math.round(it.ms / 1000) : 0;
  return (
    <Lane>
      <div className="overflow-hidden rounded-2xl border border-[rgb(251_191_36/0.24)] bg-gradient-to-b from-[rgb(251_191_36/0.07)] to-transparent">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(251_191_36/0.14)] text-[#fbbf24]"><PauseCircle size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold tracking-[-0.01em]">{copy.title}</p>
            <p className="text-[11.5px] text-[var(--color-muted)]">{copy.sub}</p>
          </div>
          <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-faint)]">{it.steps} hatua{mm ? ` · ${mm}s` : ""}</span>
        </div>
      </div>
    </Lane>
  );
}

/* ============================================================== CU REPORT — PLAIN
 * Agizo la CEO (05-10): ripoti ya mwisho ya computer agent INAANDIKWA KAWAIDA
 * kwenye mkondo — si ndani ya card. ReportBody: headings/table/mermaid/code. */
export function CuReportView({ it }: { it: CuReportItem }) {
  return (
    <div className="cu-anim w-full py-0.5">
      <div className="st-doc text-[13.5px] leading-relaxed">
        <ReportBody text={it.doc || " "} />
        {it.partial && <span className="px-caret" />}
      </div>
    </div>
  );
}
