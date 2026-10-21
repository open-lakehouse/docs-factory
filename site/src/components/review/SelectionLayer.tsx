// SelectionLayer — the fine-grained comment capture surface. Mounts over the
// rendered article for allowlisted viewers. On a text selection it shows a
// floating action bar (Comment, plus Suggest edit / Suggest deletion when the
// passage can take a suggestion; keys C, E, Delete) and a right-click context
// menu; picking an action captures a selector (a prose text-quote, or a code source anchor when the
// selection is inside a `file=` snippet block) and hands it to the shared
// selection state, which the CommentSidebar turns into a composer.

import { Eraser, Link2, MessageSquare, PencilLine } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { copyToClipboard } from "../../lib/clipboard";
import { captureSelector, hashLine } from "../../lib/content-ref";
import { type PendingAnchor, type SelectionIntent, useSelectionState } from "./selection-context";

interface FloatUI {
  x: number;
  y: number;
  build: () => Promise<PendingAnchor | null>;
  /** Whether the anchor will carry an `original`, known before `build` resolves. */
  suggestable: boolean;
}

interface Built {
  build: () => Promise<PendingAnchor | null>;
  suggestable: boolean;
}

const UI_SELECTOR = ".sel-bar, .sel-menu";

/** Nearest preceding heading (h1–h4) with an id → the section anchor. */
function enclosingHeading(el: Node, article: HTMLElement): { slug: string; text: string } {
  const node: Node | null = el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
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
  let el: Element | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  while (el) {
    if (el instanceof HTMLElement && el.dataset.srcPath) return el;
    el = el.parentElement;
  }
  return null;
}

/** Blocks whose rendered text maps onto one run of source prose. */
const SUGGESTABLE_BLOCK = "p, li, td, th, h1, h2, h3, h4, h5, h6, dt, dd, figcaption";

function blockOf(node: Node): Element | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return el?.closest(SUGGESTABLE_BLOCK) ?? null;
}

/**
 * Geometry for the floating action bar.
 *
 * Prefer Range.getClientRects() over getBoundingClientRect(). Chromium (and
 * sometimes Safari) often returns a 0×0 bounding rect for reverse mouse
 * selections that end at a line/block start — exactly the "highlight a
 * paragraph end→start until the left edge" case — even though the selection
 * is valid and getClientRects() still has usable boxes. Mid-line reverse
 * selections usually keep a non-zero bounding rect, which matched the
 * observed intermittent failure.
 */
function selectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const rects = Array.from(sel.getRangeAt(0).getClientRects()).filter(
    (r) => r.width > 0 || r.height > 0,
  );
  if (rects.length === 0) return null;
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

export default function SelectionLayer({
  articleRef,
  isActive = true,
}: {
  articleRef: RefObject<HTMLElement | null>;
  /** Editor workspace: only the active tab captures selections (document-level
   * mouse listeners + fixed float). Defaults to true for single-page routes. */
  isActive?: boolean;
}) {
  const { canComment } = useAuth();
  const { setPending } = useSelectionState();
  const [float, setFloat] = useState<FloatUI | null>(null);
  const [menu, setMenu] = useState<FloatUI | null>(null);
  const floatRef = useRef<FloatUI | null>(null);
  floatRef.current = float;
  // The keydown listener lives in the mount effect; it reaches commit via a ref.
  const commitRef = useRef<(ui: FloatUI, intent: SelectionIntent) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!isActive || !canComment) return;
    const article = articleRef.current;
    if (!article) return;
    const art = article;

    function buildFromSelection(): Built | null {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!art.contains(range.commonAncestorContainer)) return null;
      const text = range.toString();
      if (!text.trim()) return null;

      const codeBlock = enclosingCodeBlock(range.commonAncestorContainer);
      if (codeBlock) {
        const heading = enclosingHeading(codeBlock, art);
        const build = async (): Promise<PendingAnchor | null> => {
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
          // Whole lines, not the selection's partial first/last line: the hash
          // must match a full source line to re-anchor, and a suggestion
          // replaces lines.
          const blockLines = (codeEl.textContent ?? "").split("\n");
          const wholeLines = blockLines.slice(lineOffset, lineOffset + selLines.length);
          const firstLine = wholeLines[0] ?? selLines[0] ?? "";
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
            original: wholeLines.join("\n"),
          };
        };
        return { build, suggestable: true };
      }

      const heading = enclosingHeading(range.startContainer, art);
      // Across blocks, range.toString() joins them with no separator, so the
      // passage can't be rewritten as one run of text.
      const block = blockOf(range.startContainer);
      const suggestable = block !== null && block === blockOf(range.endContainer);
      const build = async (): Promise<PendingAnchor | null> => {
        const selector = captureSelector(range, art);
        if (!selector) return null;
        return {
          kind: "prose",
          anchorSlug: heading.slug,
          headingText: heading.text,
          selector,
          original: suggestable ? text.trim() : undefined,
        };
      };
      return { build, suggestable };
    }

    function showFloat(built: Built) {
      const rect = selectionRect();
      if (!rect) {
        setFloat(null);
        return;
      }
      setFloat({ x: rect.left + rect.width / 2, y: rect.top - 10, ...built });
      setMenu(null);
    }

    // Listen on document, not the article: reverse (end→start) drags often
    // release in the left gutter/sidebar once the selection hits the line
    // edge, so an article-only mouseup never fires even though the selection
    // inside the article is valid.
    function onMouseUp(e: MouseEvent) {
      // macOS fires contextmenu on the right-button mousedown, so its mouseup
      // would re-show the float and close the menu that just opened.
      if (e.button !== 0) return;
      const t = e.target;
      if (t instanceof Element && t.closest(UI_SELECTOR)) return;
      setTimeout(() => {
        const built = buildFromSelection();
        if (!built) {
          setFloat(null);
          return;
        }
        showFloat(built);
      }, 0);
    }

    function onContextMenu(e: MouseEvent) {
      const built = buildFromSelection();
      if (!built) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, ...built });
      setFloat(null);
    }

    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest(UI_SELECTOR)) return;
      setMenu(null);
    }

    // Bare keys are safe while the bar is up: the selection sits in read-only
    // prose. Modified keys (Cmd+C) and keys typed into a field pass through.
    function onKeyDown(e: KeyboardEvent) {
      const ui = floatRef.current;
      if (!ui || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || t.closest("input, textarea, select"))
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setFloat(null);
        return;
      }
      const key = e.key.toLowerCase();
      const intent: SelectionIntent | null =
        key === "c"
          ? "comment"
          : !ui.suggestable
            ? null
            : key === "e"
              ? "edit"
              : key === "delete" || key === "backspace"
                ? "delete"
                : null;
      if (!intent) return;
      e.preventDefault();
      void commitRef.current(ui, intent);
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

    document.addEventListener("mouseup", onMouseUp);
    article.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      article.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [articleRef, isActive, canComment]);

  if (!isActive || !canComment) return null;

  async function commit(ui: FloatUI, intent: SelectionIntent) {
    const anchor = await ui.build();
    if (anchor) setPending(anchor.kind === "section" ? anchor : { ...anchor, intent });
    setFloat(null);
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  }
  commitRef.current = commit;

  async function copyLink(ui: FloatUI) {
    const anchor = await ui.build();
    setFloat(null);
    setMenu(null);
    if (!anchor) return;
    const url = new URL(window.location.href);
    url.hash = anchor.anchorSlug;
    // Narrow on kind explicitly: `code` carries path/line, `prose` a quote, and
    // `section` neither (the heading hash alone is the link). Treating the
    // non-prose case as `code` would read path/line off a `section` anchor and
    // produce `?code=undefined:undefined`.
    if (anchor.kind === "prose") url.searchParams.set("sel", anchor.selector.quote);
    else if (anchor.kind === "code") url.searchParams.set("code", `${anchor.path}:${anchor.line}`);
    void copyToClipboard(url.toString());
  }

  return (
    <>
      {float && (
        <div
          className="sel-bar"
          role="toolbar"
          aria-label="Selection actions"
          style={{
            position: "fixed",
            left: float.x,
            top: float.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <button type="button" title="Comment (C)" onClick={() => void commit(float, "comment")}>
            <MessageSquare size={14} aria-hidden />
            Comment
          </button>
          {float.suggestable && (
            <>
              <button
                type="button"
                className="icon"
                title="Suggest edit (E)"
                aria-label="Suggest edit"
                onClick={() => void commit(float, "edit")}
              >
                <PencilLine size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="icon"
                title="Suggest deletion (Delete)"
                aria-label="Suggest deletion"
                onClick={() => void commit(float, "delete")}
              >
                <Eraser size={14} aria-hidden />
              </button>
            </>
          )}
        </div>
      )}
      {menu && (
        <div
          className="sel-menu"
          style={{ position: "fixed", left: menu.x, top: menu.y }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => void commit(menu, "comment")}>
            <MessageSquare size={14} aria-hidden />
            Comment on selection
          </button>
          {menu.suggestable && (
            <>
              <button type="button" role="menuitem" onClick={() => void commit(menu, "edit")}>
                <PencilLine size={14} aria-hidden />
                Suggest edit
              </button>
              <button type="button" role="menuitem" onClick={() => void commit(menu, "delete")}>
                <Eraser size={14} aria-hidden />
                Suggest deletion
              </button>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => void copyLink(menu)}>
            <Link2 size={14} aria-hidden />
            Copy link to selection
          </button>
        </div>
      )}
    </>
  );
}
