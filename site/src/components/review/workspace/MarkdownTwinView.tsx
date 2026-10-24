// The `.md` twin view: the cleaned-up markdown we serve to agents for a page
// (agentic-docs Phase 1). It's a READ-ONLY reference companion to the rendered
// view — no selection/comment layer — because the review DB anchors comments on
// the ContentRef with no twin discriminator, so a comment here would collide
// with the rendered view's anchors. A header toggle flips between:
//   - Rendered: the twin markdown → semantic HTML (what a formatted agent sees),
//     with its ```mermaid fences drawn as diagrams.
//   - Raw: the exact bytes served at the `.md` URL, in a <pre>.
//
// The twin lives at `<canonical>.md` (refHref(ref) + ".md"), fetched at runtime.
// Every page has one once the build artifacts exist; a 404 (or a non-markdown
// response) means they weren't built or this page failed to emit, which we
// surface as an empty state.

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { renderMarkdownToHtml } from "../../../content-core/render-markdown.mjs";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { refHref } from "../../../lib/content-ref";

async function fetchTwin(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: "text/markdown" } });
  if (!res.ok) throw new Error(`twin ${res.status}`);
  const text = await res.text();
  // When a twin doesn't exist the request falls through to the SPA and returns
  // index.html — and the `.md` header rule (continue: true) may even stamp it
  // text/markdown, so the content-type can't be trusted. Detect the app shell by
  // its body and treat it as "no twin" rather than rendering index.html.
  const head = text.slice(0, 512).toLowerCase();
  if (head.includes("<!doctype html") || head.includes('<div id="root"')) {
    throw new Error("no twin");
  }
  return text;
}

let mermaidSeq = 0;

// Mermaid (~1 MB) loads only when a twin has a diagram. Strict mode sanitizes
// labels, so the SVG is as safe to insert as the twin's own HTML.
async function drawMermaid(root: HTMLElement, dark: boolean, live: () => boolean) {
  const blocks = [...root.querySelectorAll<HTMLElement>("pre > code.language-mermaid")];
  if (!blocks.length) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
  });
  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre || !live()) return;
    try {
      const { svg } = await mermaid.render(`twin-mermaid-${++mermaidSeq}`, code.textContent ?? "");
      if (!live()) return;
      const figure = document.createElement("figure");
      figure.className = "twin-mermaid";
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    } catch (err) {
      // The source stays readable; the note says why it isn't a diagram.
      const note = document.createElement("p");
      note.className = "twin-mermaid-error";
      note.textContent = `Mermaid couldn't draw this diagram: ${err instanceof Error ? err.message : err}`;
      pre.after(note);
    }
  }
}

export default function MarkdownTwinView({ contentRef }: { contentRef: ContentRef }) {
  const url = `${refHref(contentRef)}.md`;
  const [raw, setRaw] = useState(false);
  const dark = useTheme().resolvedTheme === "dark";
  const article = useRef<HTMLElement>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["md-twin", url],
    queryFn: () => fetchTwin(url),
    staleTime: Infinity,
    retry: false,
  });

  // Drawing replaces the fences in place, so the article is keyed on the theme:
  // a theme change remounts the twin's HTML and draws it again.
  useEffect(() => {
    const root = article.current;
    if (raw || data === undefined || !root) return;
    let live = true;
    void drawMermaid(root, dark, () => live);
    return () => {
      live = false;
    };
  }, [data, raw, dark]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span className="font-mono text-xs text-muted-foreground">{url}</span>
        <div role="radiogroup" aria-label="Markdown display" className="flex items-center gap-1">
          {(["rendered", "raw"] as const).map((mode) => {
            const on = raw === (mode === "raw");
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRaw(mode === "raw")}
                className={cn(
                  "rounded px-2 py-0.5 text-xs capitalize",
                  on
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-6 text-muted-foreground">Loading markdown…</p>}
        {error && (
          <p className="p-6 text-muted-foreground">No markdown twin was built for this page.</p>
        )}
        {!isLoading &&
          !error &&
          data !== undefined &&
          (raw ? (
            <pre className="whitespace-pre-wrap break-words px-6 py-8 font-mono text-sm leading-relaxed">
              {data}
            </pre>
          ) : (
            <article
              key={dark ? "dark" : "light"}
              ref={article}
              className="prose mx-auto max-w-3xl px-6 py-8"
              // Safe: renderMarkdownToHtml runs mdast→hast with allowDangerousHtml:false.
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(data) }}
            />
          ))}
      </div>
    </div>
  );
}
