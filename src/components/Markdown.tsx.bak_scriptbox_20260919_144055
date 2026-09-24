"use client";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

function sanitizeMermaid(code: string): string {
  let c = code
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
  c = c.replace(/\[([^\]"]*)\]/g, (m, inner) => (/[()"']/.test(inner) ? `["${inner.replace(/"/g, "'")}"]` : m));
  return c;
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clean = sanitizeMermaid(code);
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose", suppressErrorRendering: true } as any);
        await mermaid.parse(clean);
        const { svg } = await mermaid.render("mmd" + Math.random().toString(36).slice(2, 8), clean);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = "";
          const pre = document.createElement("pre");
          pre.className = "overflow-x-auto text-[12px] leading-5 text-emerald-200";
          pre.textContent = code;
          ref.current.appendChild(pre);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  return <div ref={ref} className="my-2 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3" />;
}

function ColorToken({ hex }: { hex: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(hex); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 align-middle font-mono text-[0.82em] text-zinc-200 hover:bg-white/10"
      title="Nakili HEX"
    >
      <span className="h-3 w-3 rounded-sm border border-white/20" style={{ background: hex }} />
      {copied ? "✓" : hex}
    </button>
  );
}

function CodeBlock({ className, children }: any) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const lang = /language-([\w-]+)/.exec(className || "")?.[1] || "code";
  const copy = () => { const t = ref.current?.innerText || ""; navigator.clipboard?.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-white/10">
      <div className="flex items-center justify-between bg-white/[0.06] px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{lang}</span>
        <button onClick={copy} className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10">{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <pre ref={ref} className="overflow-x-auto bg-black/50 p-3 text-[12.5px] leading-6"><code className={className}>{children}</code></pre>
    </div>
  );
}

const components: any = {
  code(props: any) {
    const { className, children } = props;
    const lang = /language-([\w-]+)/.exec(className || "")?.[1] || "";
    const text = String(children).replace(/\n$/, "");
    if (lang === "mermaid") return <MermaidBlock code={text} />;
    if (!className && /^#[0-9a-fA-F]{6}$/.test(text.trim())) return <ColorToken hex={text.trim()} />;
    if (!className && !text.includes("\n"))
      return <code className="rounded bg-white/10 px-1.5 py-0.5 text-[0.86em] text-amber-200">{children}</code>;
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre: (p: any) => <>{p.children}</>,
  table: (p: any) => <div className="my-2 overflow-x-auto rounded-xl border border-white/10"><table className="w-full border-collapse text-[13px] leading-6">{p.children}</table></div>,
  thead: (p: any) => <thead className="bg-white/[0.06]">{p.children}</thead>,
  th: (p: any) => <th className="border-b border-white/10 px-3 py-1.5 text-left font-semibold text-white">{p.children}</th>,
  td: (p: any) => <td className="border-b border-white/[0.06] px-3 py-1.5 align-top text-zinc-300">{p.children}</td>,
  blockquote: (p: any) => <blockquote className="my-2 rounded-r-xl border-l-4 border-[#F4A261] bg-white/[0.04] px-3 py-2 text-zinc-200">{p.children}</blockquote>,
  hr: () => <hr className="my-4 border-white/10" />,
  h1: (p: any) => <h1 className="mb-2 mt-3 text-xl font-bold text-white">{p.children}</h1>,
  h2: (p: any) => <h2 className="mb-1 mt-3 text-lg font-bold text-white">{p.children}</h2>,
  h3: (p: any) => <h3 className="mb-1 mt-2 text-base font-semibold text-white">{p.children}</h3>,
  a: (p: any) => <a className="font-medium text-[#8ab4f8] underline decoration-[#8ab4f8]/40 underline-offset-2" href={p.href} target="_blank" rel="noreferrer">{p.children}</a>,
  ul: (p: any) => <ul className="my-1.5 space-y-1 text-[14px] leading-7">{p.children}</ul>,
  ol: (p: any) => <ol className="my-1.5 list-decimal space-y-1 pl-5 text-[14px] leading-7">{p.children}</ol>,
  li: (p: any) => <li className="text-[14px] leading-7 text-zinc-100">{p.children}</li>,
  input: (p: any) => <input type="checkbox" checked={!!p.checked} disabled className="mt-1 h-3.5 w-3.5 accent-[#34A853]" />,
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
