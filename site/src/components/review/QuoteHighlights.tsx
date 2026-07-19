// QuoteHighlights — paints a highlight over every prose thread's quoted range
// in the rendered article. Uses the CSS Custom Highlight API (Highlight +
// CSS.highlights), so it never mutates the compiled-MDX DOM: it registers Ranges
// under a named highlight that `::highlight(review-quote)` styles. Ranges are
// resolved with locateSelector (exact, then prefix-disambiguated). If a quote no
// longer resolves, it's simply skipped here — the thread still lives in the
// sidebar (and, if its section/quote vanished across versions, the server
// orphans it).
import { useEffect, type RefObject } from "react";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { locateSelector } from "../../lib/content-ref";

const HIGHLIGHT_NAME = "review-quote";

export default function QuoteHighlights({
  articleRef,
  threads,
}: {
  articleRef: RefObject<HTMLElement | null>;
  threads: Thread[];
}) {
  useEffect(() => {
    const article = articleRef.current;
    // Feature-detect the Highlight API; no-op (and no fallback DOM surgery) when
    // unsupported. The sidebar quote still gives reviewers the context.
    if (!article || typeof Highlight === "undefined" || !("highlights" in CSS)) return;

    const ranges: Range[] = [];
    for (const t of threads) {
      const sel = t.root?.selector;
      if (!sel?.quote) continue;
      // Scope to the thread's section element when present, else the article.
      const section =
        (t.root?.anchorSlug && (document.getElementById(t.root.anchorSlug)?.parentElement ?? null)) ||
        article;
      const range = locateSelector(sel, section instanceof HTMLElement ? section : article);
      if (range) ranges.push(range);
    }

    if (ranges.length === 0) {
      CSS.highlights.delete(HIGHLIGHT_NAME);
      return;
    }
    const hl = new Highlight(...ranges);
    CSS.highlights.set(HIGHLIGHT_NAME, hl);
    return () => {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    };
  }, [articleRef, threads]);

  return null;
}
