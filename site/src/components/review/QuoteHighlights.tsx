// QuoteHighlights — paints a highlight over every prose thread's quoted range
// in the rendered article and makes those ranges clickable "backlinks" to their
// thread. Uses the CSS Custom Highlight API (Highlight + CSS.highlights), so it
// never mutates the compiled-MDX DOM: it registers Ranges under named highlights
// that ::highlight() styles. Because painted highlights are not hit-testable, a
// click listener on the article hit-tests the pointer against the resolved
// ranges and selects the matching thread. Ranges are resolved with
// locateSelector (exact, then prefix-disambiguated). If a quote no longer
// resolves, it's simply skipped here — the thread still lives in the sidebar.
import { useEffect, type RefObject } from "react";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { locateSelector } from "../../lib/content-ref";

const HIGHLIGHT_ALL = "review-quote";
const HIGHLIGHT_FOCUS = "review-quote-focus";

function resolveRange(thread: Thread, article: HTMLElement): Range | null {
  const sel = thread.root?.selector;
  if (!sel?.quote) return null;
  // Scope the section lookup to the article root, not `document`: the editor
  // workspace mounts several tabs at once that share heading ids, so a
  // document-wide getElementById could match the wrong tab's heading.
  const heading =
    (thread.root?.anchorSlug &&
      article.querySelector<HTMLElement>(`#${CSS.escape(thread.root.anchorSlug)}`)) ||
    null;
  const section = heading?.parentElement ?? article;
  return locateSelector(sel, section);
}

function pointInRange(range: Range, x: number, y: number): boolean {
  for (const r of range.getClientRects()) {
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}

export default function QuoteHighlights({
  articleRef,
  threads,
  focusedThreadId,
  onSelectThread,
}: {
  articleRef: RefObject<HTMLElement | null>;
  threads: Thread[];
  focusedThreadId?: string | null;
  onSelectThread?: (id: string) => void;
}) {
  useEffect(() => {
    const article = articleRef.current;
    if (!article || typeof Highlight === "undefined" || !("highlights" in CSS)) return;

    const allRanges: Range[] = [];
    const focusRanges: Range[] = [];
    // id -> range, for click hit-testing back to the thread.
    const byThread: { id: string; range: Range }[] = [];

    for (const t of threads) {
      const range = resolveRange(t, article);
      if (!range) continue;
      if (t.root?.id) byThread.push({ id: t.root.id, range });
      if (t.root?.id === focusedThreadId) focusRanges.push(range);
      else allRanges.push(range);
    }

    if (allRanges.length === 0) CSS.highlights.delete(HIGHLIGHT_ALL);
    else CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...allRanges));

    if (focusRanges.length === 0) CSS.highlights.delete(HIGHLIGHT_FOCUS);
    else CSS.highlights.set(HIGHLIGHT_FOCUS, new Highlight(...focusRanges));

    // Clicking commented text selects its thread (a backlink into the sidebar).
    function onClick(e: MouseEvent) {
      if (!onSelectThread) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // don't hijack a fresh text selection
      for (const { id, range } of byThread) {
        if (pointInRange(range, e.clientX, e.clientY)) {
          onSelectThread(id);
          return;
        }
      }
    }
    article.addEventListener("click", onClick);

    return () => {
      article.removeEventListener("click", onClick);
      CSS.highlights.delete(HIGHLIGHT_ALL);
      CSS.highlights.delete(HIGHLIGHT_FOCUS);
    };
  }, [articleRef, threads, focusedThreadId, onSelectThread]);

  return null;
}
