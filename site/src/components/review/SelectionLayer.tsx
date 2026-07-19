// SelectionLayer — the fine-grained comment capture surface. Mounts over the
// rendered article for allowlisted viewers. On a text selection it shows a
// floating "Comment" button and a right-click context menu; picking either
// captures a selector (a prose text-quote, or a code source anchor when the
// selection is inside a `file=` snippet block) and hands it to the shared
// selection state, which the CommentSidebar turns into a composer.
//
// The article DOM is the source of truth for the enclosing heading (the same
// h1–h4 scan OnThisPage/CommentSidebar use) and, for code, the data-src-*
// attributes remark-code-snippets emits on each snippet block.
import { useEffect, useState, type RefObject } from "react";
import { captureSelector, hashLine, fingerprint } from "../../lib/content-ref";
import { useAuth } from "../../lib/auth-context";
import { useSelectionState, type PendingAnchor } from "./selection-context";

interface FloatUI {
  x: number;
  y: number;
  build: () => Promise<PendingAnchor | null>;
}

/** Nearest preceding heading (h1–h4) with an id → the section anchor. */
function enclosingHeading(el: Node, article: HTMLElement): { slug: string; text: string } {
  let node: Node | null = el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
  // Walk up to an element inside the article, then scan previous headings.
  let cur: Element | null = node as Element | null;
  while (cur && cur !== article && !article.contains(cur)) cur = cur.parentElement;
  // Find the heading that precedes this element in document order.
  const headings = Array.from(article.querySelectorAll("h1, h2, h3, h4")) as HTMLElement[];
  let best: HTMLElement | null = null;
  for (const h of headings) {
    if (!h.id) continue;
    if (h.compareDocumentPosition(cur ?? article) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    else break;
  }
  return best ? { slug: best.id, text: best.textContent ?? "" } : { slug: "", text: "" };
}

/** The snippet block (.cb[data-src-path]) containing `node`, or null. */
function enclosingCodeBlock(node: Node): HTMLElement | null {
  let el: Element | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  while (el) {
    if (el instanceof HTMLElement && el.dataset.srcPath) return el;
    el = el.parentElement;
  }
  return null;
}

export default function SelectionLayer({
  articleRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
}) {
  const { isAllowlisted } = useAuth();
  const { setPending } = useSelectionState();
  const [float, setFloat] = useState<FloatUI | null>(null);
  const [menu, setMenu] = useState<FloatUI | null>(null);

  useEffect(() => {
    if (!isAllowlisted) return;
    const article = articleRef.current;
    if (!article) return;
    const art = article; // non-null capture for the nested closures below.

    // Build a PendingAnchor from the current selection, or null. Async because
    // code line-hashing uses SubtleCrypto.
    function buildFromSelection(): (() => Promise<PendingAnchor | null>) | null {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!art.contains(range.commonAncestorContainer)) return null;
      const text = range.toString();
      if (!text.trim()) return null;

      const codeBlock = enclosingCodeBlock(range.commonAncestorContainer);
      if (codeBlock) {
        // Code selection → anchor to the snippet's source. Map the selection's
        // first line to a source line via the block's data-src-start.
        const heading = enclosingHeading(codeBlock, art);
        return async (): Promise<PendingAnchor | null> => {
          const path = codeBlock.dataset.srcPath ?? "";
          const region = codeBlock.dataset.srcRegion ?? "";
          const startLine = Number(codeBlock.dataset.srcStart ?? "1");
          // Line offset of the selection within the rendered block's text.
          const blockText = codeBlock.querySelector("code")?.textContent ?? codeBlock.textContent ?? "";
          const before = blockText.slice(0, blockText.indexOf(text) === -1 ? 0 : blockText.indexOf(text));
          const lineOffset = before ? before.split("\n").length - 1 : 0;
          const selLines = text.replace(/\n$/, "").split("\n");
          const firstLine = selLines[0] ?? "";
          const line = startLine + lineOffset;
          const endLine = line + selLines.length - 1;
          return {
            kind: "code",
            path,
            region,
            line,
            endLine,
            lineHash: await hashLine(firstLine),
            fileHash: "", // filled server-side against the registered source
            anchorSlug: heading.slug,
            headingText: heading.text,
            quote: text.trim(),
          };
        };
      }

      // Prose selection → text-quote selector within the enclosing section.
      const heading = enclosingHeading(range.startContainer, art);
      // Use the article as the capture scope: offsets are computed relative to it.
      return async (): Promise<PendingAnchor | null> => {
        const selector = captureSelector(range, art);
        if (!selector) return null;
        return {
          kind: "prose",
          anchorSlug: heading.slug,
          headingText: heading.text,
          selector,
        };
      };
    }

    function onMouseUp() {
      // Defer so the selection is finalized.
      setTimeout(() => {
        const build = buildFromSelection();
        if (!build) {
          setFloat(null);
          return;
        }
        const sel = window.getSelection();
        const rect = sel?.getRangeAt(0).getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          setFloat(null);
          return;
        }
        setFloat({ x: rect.left + rect.width / 2, y: rect.top - 8, build });
        setMenu(null);
      }, 0);
    }

    function onContextMenu(e: MouseEvent) {
      const build = buildFromSelection();
      if (!build) return; // no selection → native menu
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, build });
      setFloat(null);
    }

    function onDocMouseDown(e: MouseEvent) {
      // Dismiss the menu/button when clicking elsewhere (but not on them).
      const t = e.target as HTMLElement;
      if (t.closest(".sel-float") || t.closest(".sel-menu")) return;
      setMenu(null);
    }

    article.addEventListener("mouseup", onMouseUp);
    article.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      article.removeEventListener("mouseup", onMouseUp);
      article.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [articleRef, isAllowlisted]);

  if (!isAllowlisted) return null;

  async function commit(ui: FloatUI) {
    const anchor = await ui.build();
    if (anchor) setPending(anchor);
    setFloat(null);
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  }

  async function copyLink(ui: FloatUI) {
    const anchor = await ui.build();
    setFloat(null);
    setMenu(null);
    if (!anchor) return;
    const url = new URL(window.location.href);
    url.hash = anchor.anchorSlug;
    if (anchor.kind === "prose") url.searchParams.set("sel", anchor.selector.quote);
    else url.searchParams.set("code", `${anchor.path}:${anchor.line}`);
    void navigator.clipboard?.writeText(url.toString());
  }

  return (
    <>
      {float && (
        <button
          className="sel-float"
          style={{ position: "fixed", left: float.x, top: float.y, transform: "translate(-50%, -100%)" }}
          onClick={() => void commit(float)}
        >
          💬 Comment
        </button>
      )}
      {menu && (
        <div
          className="sel-menu"
          style={{ position: "fixed", left: menu.x, top: menu.y }}
          role="menu"
        >
          <button role="menuitem" onClick={() => void commit(menu)}>
            Comment on selection
          </button>
          <button role="menuitem" onClick={() => void copyLink(menu)}>
            Copy link to selection
          </button>
        </div>
      )}
    </>
  );
}
