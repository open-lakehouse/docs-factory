// Sort review threads by where they appear in the rendered article, not by
// creation time. Matches the reader's mental model: the rail walks top→bottom
// with the document. Uses the same anchor resolution as scroll-to-context /
// QuoteHighlights (prose Range, code block, then heading). Unresolved anchors
// sink to the end; equal positions fall back to created_at.
import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { Thread } from "../gen/docs_factory/review/v1/messages_pb";
import { locateSelector, sectionRootForAnchor } from "./content-ref";

type DocPos = { node: Node; offset: number };

function headingById(article: HTMLElement, slug: string): HTMLElement | null {
  return article.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
}

/** Document position a thread's context occupies (start of quote / code / heading). */
function documentPosition(thread: Thread, article: HTMLElement): DocPos | null {
  const root = thread.root;
  if (!root) return null;

  if (root.selector?.quote) {
    const range = locateSelector(root.selector, sectionRootForAnchor(article, root.anchorSlug));
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }

  const code = root.codeSelector;
  if (code?.path) {
    const blocks = article.querySelectorAll<HTMLElement>("[data-src-path]");
    for (const block of blocks) {
      if (block.dataset.srcPath !== code.path) continue;
      if (code.region && (block.dataset.srcRegion ?? "") !== code.region) continue;
      // Prefer the anchored Shiki line span so same-block threads sort by line.
      if (code.line > 0) {
        const srcStart = Number(block.dataset.srcStart ?? "1") || 1;
        const index = code.line - srcStart;
        if (index >= 0) {
          const line = block.querySelectorAll<HTMLElement>(":scope .line")[index];
          if (line) return { node: line, offset: 0 };
        }
      }
      return { node: block, offset: code.line || 0 };
    }
  }

  if (root.anchorSlug) {
    const heading = headingById(article, root.anchorSlug);
    if (heading) return { node: heading, offset: 0 };
  }

  return null;
}

function compareDocPos(a: DocPos, b: DocPos): number {
  if (a.node === b.node) return a.offset - b.offset;
  const pos = a.node.compareDocumentPosition(b.node);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  // Ancestor/descendant: the outer node starts earlier in document order.
  if (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) return -1;
  if (pos & Node.DOCUMENT_POSITION_CONTAINS) return 1;
  return 0;
}

function createdMs(thread: Thread): number {
  const ts = thread.root?.createdAt;
  return ts ? timestampDate(ts).getTime() : 0;
}

/**
 * Stable document-order sort of threads against the live article DOM. Returns
 * the input unchanged when the article isn't mounted yet or there's nothing to
 * reorder.
 */
export function sortThreadsByDocumentOrder(
  threads: readonly Thread[],
  article: HTMLElement | null | undefined,
): Thread[] {
  if (!article || threads.length < 2) return [...threads];
  return [...threads].sort((a, b) => {
    const pa = documentPosition(a, article);
    const pb = documentPosition(b, article);
    if (pa && pb) {
      const byDoc = compareDocPos(pa, pb);
      if (byDoc !== 0) return byDoc;
    } else if (pa && !pb) return -1;
    else if (!pa && pb) return 1;
    return createdMs(a) - createdMs(b);
  });
}
