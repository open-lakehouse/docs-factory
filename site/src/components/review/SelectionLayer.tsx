// SelectionLayer — the fine-grained comment capture surface. Mounts over the
// rendered article for allowlisted viewers. On a text selection it shows a
// floating "Comment" button and a right-click context menu; picking either
// captures a selector (a prose text-quote, or a code source anchor when the
// selection is inside a `file=` snippet block) and hands it to the shared
// selection state, which the CommentSidebar turns into a composer.
import { useEffect, useRef, useState, type RefObject } from "react";
import { MessageSquare, Link2 } from "lucide-react";
import { captureSelector, hashLine } from "../../lib/content-ref";
import { copyToClipboard } from "../../lib/clipboard";
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
  let cur: Element | null = node as Element | null;
  while (cur && cur !== article && !article.contains(cur)) cur = cur.parentElement;
  const headings = Array.from(article.querySelectorAll("h1, h2, h3, h4")) as HTMLElement[];
  let best: HTMLElement | null = null;
  for (const h of headings) {
    if (!h.id) continue;
    if (h.compareDocumentPosition(cur ?? article) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    else break;
  }
  return best ? { slug: best.id, text: best.textContent ?? "" } : { slug: "", text: "" };
}

/** The snippet block containing `node`, or null. */
function enclosingCodeBlock(node: Node): HTMLElement | null {
  let el: Element | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  while (el) {
    if (el instanceof HTMLElement && el.dataset.srcPath) return el;
    el = el.parentElement;
  }
  return null;
}

function selectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
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
  const floatRef = useRef<FloatUI | null>(null);
  floatRef.current = float;

  useEffect(() => {
    if (!isAllowlisted) return;
    const article = articleRef.current;
    if (!article) return;
    const art = article;

    function buildFromSelection(): (() => Promise<PendingAnchor | null>) | null {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!art.contains(range.commonAncestorContainer)) return null;
      const text = range.toString();
      if (!text.trim()) return null;

      const codeBlock = enclosingCodeBlock(range.commonAncestorContainer);
      if (codeBlock) {
        const heading = enclosingHeading(codeBlock, art);
        return async (): Promise<PendingAnchor | null> => {
          const path = codeBlock.dataset.srcPath ?? "";
          const region = codeBlock.dataset.srcRegion ?? "";
          const startLine = Number(codeBlock.dataset.srcStart ?? "1");
          // Line offset from the ACTUAL selection start within the block, not a
          // text search: indexOf(text) would find the first identical line, so a
          // selection of a repeated line (a bare `}`, a duplicated identifier)
          // would anchor to the wrong line. Measure the text preceding the range
          // start via a Range from the block's start to the selection start.
          const codeEl = codeBlock.querySelector("code") ?? codeBlock;
          const pre = range.cloneRange();
          pre.selectNodeContents(codeEl);
          pre.setEnd(range.startContainer, range.startOffset);
          const before = pre.toString();
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
            fileHash: "",
            anchorSlug: heading.slug,
            headingText: heading.text,
            quote: text.trim(),
          };
        };
      }

      const heading = enclosingHeading(range.startContainer, art);
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

    function showFloat(build: () => Promise<PendingAnchor | null>) {
      const rect = selectionRect();
      if (!rect) {
        setFloat(null);
        return;
      }
      setFloat({ x: rect.left + rect.width / 2, y: rect.top - 10, build });
      setMenu(null);
    }

    function onMouseUp() {
      setTimeout(() => {
        const build = buildFromSelection();
        if (!build) {
          setFloat(null);
          return;
        }
        showFloat(build);
      }, 0);
    }

    function onContextMenu(e: MouseEvent) {
      const build = buildFromSelection();
      if (!build) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, build });
      setFloat(null);
    }

    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest(".sel-float") || t.closest(".sel-menu")) return;
      setMenu(null);
    }

    function reposition() {
      if (!floatRef.current) return;
      const rect = selectionRect();
      if (!rect) {
        setFloat(null);
        return;
      }
      setFloat((f) => (f ? { ...f, x: rect.left + rect.width / 2, y: rect.top - 10 } : null));
    }

    article.addEventListener("mouseup", onMouseUp);
    article.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      article.removeEventListener("mouseup", onMouseUp);
      article.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
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
    void copyToClipboard(url.toString());
  }

  return (
    <>
      {float && (
        <button
          type="button"
          className="sel-float"
          style={{
            position: "fixed",
            left: float.x,
            top: float.y,
            transform: "translate(-50%, -100%)",
          }}
          onClick={() => void commit(float)}
        >
          <MessageSquare size={14} aria-hidden />
          Comment
        </button>
      )}
      {menu && (
        <div
          className="sel-menu"
          style={{ position: "fixed", left: menu.x, top: menu.y }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => void commit(menu)}>
            <MessageSquare size={14} aria-hidden />
            Comment on selection
          </button>
          <button type="button" role="menuitem" onClick={() => void copyLink(menu)}>
            <Link2 size={14} aria-hidden />
            Copy link to selection
          </button>
        </div>
      )}
    </>
  );
}
