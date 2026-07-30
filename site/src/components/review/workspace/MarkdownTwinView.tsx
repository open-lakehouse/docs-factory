// The `.md` twin view: the cleaned-up markdown we serve to agents for a page
// (agentic-docs Phase 1). It's a READ-ONLY reference companion to the rendered
// view — no selection/comment layer — because the review DB anchors comments on
// the ContentRef with no twin discriminator, so a comment here would collide
// with the rendered view's anchors. A header toggle flips between:
//   - Rendered: the twin markdown → semantic HTML (what a formatted agent sees).
//   - Raw: the exact bytes served at the `.md` URL, in a <pre>.
//
// The twin lives at `<canonical>.md` (refHref(ref) + ".md"), fetched at runtime.
// It only exists for published pages; a 404 (or a non-markdown response) means
// the page isn't published, which we surface as an empty state.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { refHref } from "../../../lib/content-ref";
import { renderMarkdownToHtml } from "../../../content-core/render-markdown.mjs";
import { cn } from "@/lib/utils";

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

export default function MarkdownTwinView({ contentRef }: { contentRef: ContentRef }) {
  const url = `${refHref(contentRef)}.md`;
  const [raw, setRaw] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["md-twin", url],
    queryFn: () => fetchTwin(url),
    staleTime: Infinity,
    retry: false,
  });

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
          <p className="p-6 text-muted-foreground">
            No markdown twin — this page isn't published yet.
          </p>
        )}
        {!isLoading && !error && data !== undefined && (
          raw ? (
            <pre className="whitespace-pre-wrap break-words px-6 py-8 font-mono text-sm leading-relaxed">
              {data}
            </pre>
          ) : (
            <article
              className="prose mx-auto max-w-3xl px-6 py-8"
              // Safe: renderMarkdownToHtml runs mdast→hast with allowDangerousHtml:false.
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(data) }}
            />
          )
        )}
      </div>
    </div>
  );
}
