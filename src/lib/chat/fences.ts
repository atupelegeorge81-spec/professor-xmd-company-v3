// src/lib/chat/fences.ts — gawanya jibu la agent kuwa maandishi + code blocks (```lang … ```).
// Inafanya kazi wakati wa streaming: fence ambayo bado haijafungwa inarudishwa na `closed: false`
// ili ScriptBox ionyeshe "inaandika…".

export type Segment =
  | { type: "text"; text: string }
  | { type: "code"; lang: string; code: string; closed: boolean; index: number; info: string };

const OPEN = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)([^\n`]*)$/;

/** ```tsx src/app/page.tsx  → lang "tsx", info "src/app/page.tsx" · ```page.tsx → lang "tsx", info "page.tsx" */
function parseInfo(token: string, rest: string): { lang: string; info: string } {
  const t = token.trim();
  if (/[./]/.test(t) && /\.[a-z0-9]{1,8}$/i.test(t)) return { lang: t.split(".").pop()!.toLowerCase(), info: `${t} ${rest}`.trim() };
  return { lang: t.toLowerCase().replace(/[^\w#+.\-]/g, ""), info: rest.trim() };
}

export function splitFences(src: string): Segment[] {
  const lines = src.split("\n");
  const out: Segment[] = [];
  let text: string[] = [];
  let code: string[] | null = null;
  let fence = "";
  let lang = "";
  let info = "";
  let index = 0;

  const flushText = () => {
    const t = text.join("\n");
    if (t.trim()) out.push({ type: "text", text: t });
    text = [];
  };

  for (const line of lines) {
    if (code === null) {
      const m = line.match(OPEN);
      if (m) {
        flushText();
        fence = m[1];
        ({ lang, info } = parseInfo(m[2] || "", m[3] || ""));
        code = [];
        continue;
      }
      text.push(line);
    } else {
      const t = line.trim();
      if (t.startsWith(fence[0].repeat(fence.length)) && /^(`{3,}|~{3,})$/.test(t)) {
        out.push({ type: "code", lang: lang || "text", code: code.join("\n"), closed: true, index: index++, info });
        code = null;
        continue;
      }
      code.push(line);
    }
  }
  if (code !== null) out.push({ type: "code", lang: lang || "text", code: code.join("\n"), closed: false, index: index++, info });
  else flushText();
  return out;
}

const FILE: Record<string, string> = {
  html: "index.html", htm: "index.html", xml: "data.xml", svg: "image.svg",
  css: "styles.css", scss: "styles.scss",
  js: "script.js", javascript: "script.js", mjs: "script.mjs", jsx: "App.jsx",
  ts: "main.ts", typescript: "main.ts", tsx: "Component.tsx",
  py: "main.py", python: "main.py",
  sh: "script.sh", bash: "script.sh", shell: "script.sh", zsh: "script.sh",
  json: "data.json", yaml: "config.yaml", yml: "config.yml", toml: "config.toml",
  sql: "query.sql", go: "main.go", rs: "main.rs", rust: "main.rs", java: "Main.java",
  kt: "Main.kt", swift: "main.swift", php: "index.php", rb: "main.rb", c: "main.c", cpp: "main.cpp",
  dart: "main.dart", md: "README.md", markdown: "README.md", dockerfile: "Dockerfile", env: ".env.example",
};

/** Jina la faili kwa header ya ScriptBox (block ya 2+ ya lugha ile ile inapata namba). */
export function fileFor(lang: string, nth = 0): string {
  const base = FILE[lang] || `snippet.${lang && lang !== "text" ? lang : "txt"}`;
  if (!nth) return base;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? `${base.slice(0, dot)}-${nth + 1}${base.slice(dot)}` : `${base}-${nth + 1}`;
}
