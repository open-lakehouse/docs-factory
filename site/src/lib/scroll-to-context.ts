// Scroll the article viewport to the DOM location a review thread anchors to.
// Uses the same locateSelector logic as QuoteHighlights; never mutates the DOM.
import type { Thread } from "../gen/docs_factory/review/v1/messages_pb";
import { locateSelector } from "./content-ref";

function scrollToRect(rect: DOMRect) {
  const top = window.scrollY + rect.top - window.innerHeight / 3;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/** Resolve the section element for a thread's anchor slug. */
function sectionFor(thread: Thread, article: HTMLElement): HTMLElement {
  const slug = thread.root?.anchorSlug;
  if (slug) {
    const heading = document.getElementById(slug);
    if (heading) return heading;
  }
  return article;
}

/**
 * Scroll to the in-article context for a thread. Returns true when a target was
 * found and scrolled to.
 */
export function scrollToThreadContext(thread: Thread, article: HTMLElement): boolean {
  const root = thread.root;
  if (!root) return false;

  const sel = root.selector;
  if (sel?.quote) {
    const section = sectionFor(thread, article);
    const range = locateSelector(sel, section);
    if (range) {
      scrollToRect(range.getBoundingClientRect());
      return true;
    }
  }

  const code = root.codeSelector;
  if (code?.path) {
    const blocks = article.querySelectorAll<HTMLElement>("[data-src-path]");
    for (const block of blocks) {
      if (block.dataset.srcPath === code.path) {
        block.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
    }
  }

  if (root.anchorSlug) {
    const heading = document.getElementById(root.anchorSlug);
    if (heading) {
      heading.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
  }

  return false;
}
