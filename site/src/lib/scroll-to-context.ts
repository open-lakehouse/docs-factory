// Scroll the article viewport to the DOM location a review thread anchors to.
// Uses the same locateSelector logic as QuoteHighlights; never mutates the DOM.
//
// Lookups are scoped to the article root, not `document`: in the editor
// workspace several tabs are mounted at once and share heading ids (`#overview`
// etc.), so `document.getElementById` could resolve the wrong tab. Scrolling is
// likewise parameterized on a container — the single-page routes scroll the
// window (the default), while an editor tab scrolls its own middle pane.
//
// Always scrolls that container explicitly (never Element.scrollIntoView): the
// latter walks every scrollable ancestor and fights the workspace panes.
import type { Thread } from "../gen/docs_factory/review/v1/messages_pb";
import { locateSelector, sectionRootForAnchor } from "./content-ref";

/** Where scrolling happens: the window (single-page routes) or a scroll pane. */
export type ScrollContainer = Window | HTMLElement;

/** Resolve a heading by id within the article root (never document-wide). */
function headingById(article: HTMLElement, slug: string): HTMLElement | null {
  return article.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
}

/**
 * Scroll `container` so that a viewport-relative rect sits ~a third of the way
 * down the visible area. Works for both the window and an element scroller.
 */
function scrollToRect(rect: DOMRect, container: ScrollContainer) {
  if (container instanceof HTMLElement) {
    const view = container.getBoundingClientRect();
    const top = container.scrollTop + (rect.top - view.top) - container.clientHeight / 3;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    return;
  }
  const top = container.scrollY + rect.top - container.innerHeight / 3;
  container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/** Prefer the first visible client rect (multi-line quotes / wrapped code). */
function rectForTarget(target: Range | HTMLElement): DOMRect | null {
  if (target instanceof Range) {
    const rects = target.getClientRects();
    for (const r of rects) {
      if (r.width > 0 || r.height > 0) return r;
    }
    const fallback = target.getBoundingClientRect();
    return fallback.width || fallback.height ? fallback : null;
  }
  const rect = target.getBoundingClientRect();
  return rect.width || rect.height ? rect : null;
}

/**
 * Scroll to the in-article context for a thread. Returns true when a target was
 * found and scrolled to. `container` defaults to `window` for the single-page
 * routes; the editor passes its middle scroll pane.
 */
export function scrollToThreadContext(
  thread: Thread,
  article: HTMLElement,
  container: ScrollContainer = window,
): boolean {
  const root = thread.root;
  if (!root) return false;

  const sel = root.selector;
  if (sel?.quote) {
    const section = sectionRootForAnchor(article, root.anchorSlug);
    const range = locateSelector(sel, section);
    if (range) {
      const rect = rectForTarget(range);
      if (rect) {
        scrollToRect(rect, container);
        return true;
      }
    }
  }

  const code = root.codeSelector;
  if (code?.path) {
    const blocks = article.querySelectorAll<HTMLElement>("[data-src-path]");
    for (const block of blocks) {
      if (block.dataset.srcPath !== code.path) continue;
      if (code.region && (block.dataset.srcRegion ?? "") !== code.region) continue;
      const rect = rectForTarget(block);
      if (rect) {
        scrollToRect(rect, container);
        return true;
      }
    }
  }

  if (root.anchorSlug) {
    const heading = headingById(article, root.anchorSlug);
    if (heading) {
      const rect = rectForTarget(heading);
      if (rect) {
        scrollToRect(rect, container);
        return true;
      }
    }
  }

  return false;
}
