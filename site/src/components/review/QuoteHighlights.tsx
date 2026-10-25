// QuoteHighlights — paints a highlight over every open prose thread's quoted
// range in the rendered article and makes those ranges clickable "backlinks"
// to their thread. Resolved threads stay unpainted until hovered/selected, so
// closed feedback doesn't keep tinting the page. Uses the CSS Custom Highlight
// API (Highlight + CSS.highlights), so it never mutates the compiled-MDX DOM:
// it registers Ranges under named highlights that ::highlight() styles. Because
// painted highlights are not hit-testable, a click listener on the article
// hit-tests the pointer against the resolved ranges and selects the matching
// thread. Ranges are resolved with locateSelector (exact, then
// prefix-disambiguated); a reworded passage resolves the server's closest match
// instead, painted lighter. If a quote no longer resolves, it isn't painted, but
// a focused thread still marks its heading so the reader sees where it lives.
import { type RefObject, useEffect } from "react";
import {
  AnchorState,
  SuggestionState,
  type Thread,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { currentSelector } from "../../lib/anchor-placement";
import { locateSelector, sectionRootForAnchor } from "../../lib/content-ref";
import { headingById } from "../../lib/scroll-to-context";
import { ensureHighlightStyle, highlightNames } from "./highlight-style";

function resolveRange(thread: Thread, article: HTMLElement): Range | null {
  const sel = currentSelector(thread.root);
  if (!sel) return null;
  return locateSelector(sel, sectionRootForAnchor(article, thread.root?.anchorSlug));
}

/** The thread's heading text, for a focused thread whose quote can't be painted. */
function headingRange(thread: Thread, article: HTMLElement): Range | null {
  const slug = thread.root?.anchorSlug;
  const heading = slug ? headingById(article, slug) : null;
  if (!heading) return null;
  const range = document.createRange();
  range.selectNodeContents(heading);
  return range;
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
  highlightKey,
}: {
  articleRef: RefObject<HTMLElement | null>;
  threads: Thread[];
  focusedThreadId?: string | null;
  onSelectThread?: (id: string) => void;
  /** Editor workspace: a per-tab key so each tab paints under its own highlight
   * names (review-quote-<key>), avoiding a tab-switch delete/set race on the
   * document-global registry. The single-page routes omit it and use the shared
   * static names. */
  highlightKey?: string;
}) {
  useEffect(() => {
    const article = articleRef.current;
    if (!article || typeof Highlight === "undefined" || !("highlights" in CSS)) return;

    // Keyed tabs need a matching ::highlight() rule injected for their names.
    ensureHighlightStyle(highlightKey);
    const names = highlightNames(highlightKey);
    const ranges: Record<keyof typeof names, Range[]> = {
      all: [],
      focus: [],
      suggest: [],
      approx: [],
    };
    // id -> range, for click hit-testing back to the thread.
    const byThread: { id: string; range: Range }[] = [];

    for (const t of threads) {
      const focused = t.root?.id === focusedThreadId;
      const range = resolveRange(t, article);
      if (!range) {
        const heading = focused && t.root?.selector?.quote ? headingRange(t, article) : null;
        if (heading) ranges.focus.push(heading);
        continue;
      }
      // Resolved threads stay quiet in the article until hovered/selected —
      // then they get the focus highlight so you can still find the target.
      if (t.resolved && !focused) continue;
      if (t.root?.id) byThread.push({ id: t.root.id, range });
      if (focused) ranges.focus.push(range);
      else if (t.root?.suggestion?.state === SuggestionState.OPEN) ranges.suggest.push(range);
      else if (t.root?.anchorState === AnchorState.REWRITTEN) ranges.approx.push(range);
      else ranges.all.push(range);
    }

    // Registered in paint order, so a focused thread's range wins an overlap.
    for (const key of ["all", "approx", "suggest", "focus"] as const) {
      if (ranges[key].length === 0) CSS.highlights.delete(names[key]);
      else CSS.highlights.set(names[key], new Highlight(...ranges[key]));
    }

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
      for (const name of Object.values(names)) CSS.highlights.delete(name);
    };
  }, [articleRef, threads, focusedThreadId, onSelectThread, highlightKey]);

  return null;
}
