// Inline review surface for prose comments: positions a portal below the
// resolved text-quote range (or pending selection) when displayMode is inline.
// Never mutates compiled MDX — uses fixed positioning from Range.getClientRects().
import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { locateSelector } from "../../lib/content-ref";
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
}: {
  articleRef: RefObject<HTMLElement | null>;
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
  const selected = selectedThreadId ? threadById(selectedThreadId) : undefined;
  const showProseThread =
    displayMode === "inline" && selected && Boolean(selected.root?.selector?.quote);

  useEffect(() => {
    if (displayMode !== "inline") {
      setPlacement(null);
      return;
    }
    const article = articleRef.current;
    if (!article) return;

    function update() {
      let range: Range | null = null;
      if (showProsePending && pending?.kind === "prose") {
        range = locateSelector(pending.selector, article!);
      } else if (showProseThread && selected) {
        const sel = selected.root?.selector;
        if (!sel?.quote) {
          setPlacement(null);
          return;
        }
        const section =
          (selected.root?.anchorSlug &&
            (document.getElementById(selected.root.anchorSlug)?.parentElement ?? null)) ||
          article;
        range = locateSelector(sel, section instanceof HTMLElement ? section : article!);
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
    displayMode,
    showProsePending,
    showProseThread,
    pending,
    selected,
    selectedThreadId,
    selectNonce,
  ]);

  if (!reviewActive || !contentRef) return null;

  const panel =
    placement && (showProsePending || showProseThread) ? (
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
        {showProsePending && (
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
        {showProseThread && selected && !showProsePending && (
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
      />
      {panel && createPortal(panel, document.body)}
    </>
  );
}
