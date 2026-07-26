// Inline review surface for prose comments: positions a portal below the
// resolved text-quote range (or pending selection) when displayMode is inline.
// Never mutates compiled MDX — uses fixed positioning from Range.getClientRects().
import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { locateSelector, sectionRootForAnchor } from "../../lib/content-ref";
import { useAuth } from "../../lib/auth-context";
import { useSelectionState } from "./selection-context";
import { useReview } from "./review-context";
import QuoteHighlights from "./QuoteHighlights";
import PendingComposer from "./PendingComposer";
import ThreadConversation from "./ThreadConversation";

function unionRect(range: Range): DOMRect | null {
  const rects = Array.from(range.getClientRects());
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

export default function InlineReviewSurface({
  articleRef,
  isActive = true,
  highlightKey,
}: {
  articleRef: RefObject<HTMLElement | null>;
  /** In the editor workspace only the active tab may run the DOM-global inline
   * surface (fixed portals, CSS highlights). Defaults to true for the
   * single-page routes, which always have exactly one surface mounted. */
  isActive?: boolean;
  /** Per-tab quote-highlight namespace, passed through to QuoteHighlights. */
  highlightKey?: string;
}) {
  const { reviewActive } = useAuth();
  const {
    contentRef,
    threads,
    activeThreadId,
    selectedThreadId,
    selectNonce,
    selectThread,
    threadById,
    displayMode,
    refetch,
  } = useReview();
  const { pending, setPending } = useSelectionState();
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [headings, setHeadings] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const map = new Map<string, string>();
    article.querySelectorAll("h1, h2, h3, h4").forEach((n) => {
      if (n.id) map.set(n.id, n.textContent ?? "");
    });
    setHeadings(map);
  }, [articleRef, reviewActive]);

  const showProsePending = displayMode === "inline" && pending?.kind === "prose";
  const showSectionPending = displayMode === "inline" && pending?.kind === "section";
  const showInlinePending = showProsePending || showSectionPending;
  const selected = selectedThreadId ? threadById(selectedThreadId) : undefined;
  const showProseThread =
    displayMode === "inline" && selected && Boolean(selected.root?.selector?.quote);

  useEffect(() => {
    if (!isActive || displayMode !== "inline") {
      setPlacement(null);
      return;
    }
    const article = articleRef.current;
    if (!article) return;

    function update() {
      let range: Range | null = null;
      if (showSectionPending && pending?.kind === "section") {
        const heading = article!.querySelector<HTMLElement>(
          `#${CSS.escape(pending.anchorSlug)}`,
        );
        if (!heading) {
          setPlacement(null);
          return;
        }
        const rect = heading.getBoundingClientRect();
        const host = article!.getBoundingClientRect();
        setPlacement({ top: rect.bottom + 3, left: host.left, width: host.width });
        return;
      }
      if (showProsePending && pending?.kind === "prose") {
        range = locateSelector(pending.selector, article!);
      } else if (showProseThread && selected) {
        const sel = selected.root?.selector;
        if (!sel?.quote) {
          setPlacement(null);
          return;
        }
        // Scope to the article root, not `document`: the editor workspace
        // mounts several tabs sharing heading ids, so a document-wide lookup
        // could resolve the wrong tab's heading.
        const section = sectionRootForAnchor(article!, selected.root?.anchorSlug);
        range = locateSelector(sel, section);
      } else {
        setPlacement(null);
        return;
      }
      const rect = range ? unionRect(range) : null;
      if (!rect) {
        setPlacement(null);
        return;
      }
      // Hug the highlight vertically, but span the prose column horizontally so
      // it reads like the code-box inline row (full width of its container).
      const host = article!.getBoundingClientRect();
      setPlacement({ top: rect.bottom + 3, left: host.left, width: host.width });
    }

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [
    articleRef,
    isActive,
    displayMode,
    showProsePending,
    showSectionPending,
    showProseThread,
    pending,
    selected,
    selectedThreadId,
    selectNonce,
  ]);

  if (!isActive || !reviewActive || !contentRef) return null;

  const panel =
    placement && (showInlinePending || showProseThread) ? (
      <div
        className="review-inline-panel"
        style={{
          position: "fixed",
          top: placement.top,
          left: Math.max(12, placement.left),
          width: Math.min(placement.width, window.innerWidth - 24),
          zIndex: 55,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {showInlinePending && pending && (
          <PendingComposer
            contentRef={contentRef}
            pending={pending}
            onDone={() => {
              setPending(null);
              refetch();
            }}
            onCancel={() => setPending(null)}
            compact
          />
        )}
        {showProseThread && selected && !showInlinePending && (
          <ThreadConversation
            thread={selected}
            sectionLabel={headings.get(selected.root?.anchorSlug ?? "")}
            onChange={refetch}
            onClose={() => selectThread(null)}
            compact
          />
        )}
      </div>
    ) : null;

  return (
    <>
      <QuoteHighlights
        articleRef={articleRef}
        threads={threads}
        focusedThreadId={activeThreadId}
        onSelectThread={selectThread}
        highlightKey={highlightKey}
      />
      {panel && createPortal(panel, document.body)}
    </>
  );
}
