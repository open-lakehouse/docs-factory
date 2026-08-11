// Review comments rail for a rendered blog/doc page. Only mounts for allowlisted
// viewers in rail display mode. Reads threads + selection from ReviewProvider.
// Thread cards are ordered by document position (top→bottom), not creation time.
// Section comments start from the heading gutter icon (or text/code selection).
import { type RefObject, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { sortThreadsByDocumentOrder } from "../../lib/thread-document-order";
import PendingComposer from "./PendingComposer";
import { useReview } from "./review-context";
import { useSelectionState } from "./selection-context";
import ThreadCard from "./ThreadCard";

interface Heading {
  id: string;
  text: string;
}

export default function CommentSidebar({
  articleRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
}) {
  const { canComment } = useAuth();
  const {
    contentRef,
    threads,
    orphanedThreads: orphaned,
    openCount,
    refetch,
    activeThreadId,
    selectedThreadId,
    selectNonce,
    hoverThread,
    selectThread,
    displayMode,
  } = useReview();
  const { pending, setPending } = useSelectionState();
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const found: Heading[] = [];
    article.querySelectorAll("h1, h2, h3, h4").forEach((n) => {
      if (n.id) found.push({ id: n.id, text: n.textContent ?? "" });
    });
    setHeadings(found);
  }, [articleRef, canComment]);

  // `headings` doubles as a readiness signal that the article DOM is mounted
  // and queryable — without it, articleRef.current alone wouldn't re-sort.
  const orderedThreads = useMemo(
    () => sortThreadsByDocumentOrder(threads, articleRef.current),
    [threads, headings, articleRef],
  );
  const orderedOrphaned = useMemo(
    () => sortThreadsByDocumentOrder(orphaned, articleRef.current),
    [orphaned, headings, articleRef],
  );

  if (!canComment || !contentRef || displayMode !== "rail") return null;

  const headingText = new Map(headings.map((h) => [h.id, h.text]));
  const sectionLabelFor = (slug?: string) => (slug && headingText.get(slug)) || "";

  const renderCard = (t: (typeof orderedThreads)[number]) => (
    <ThreadCard
      key={t.root?.id}
      thread={t}
      articleRef={articleRef}
      sectionLabel={sectionLabelFor(t.root?.anchorSlug)}
      active={activeThreadId === t.root?.id}
      selected={selectedThreadId === t.root?.id}
      selectNonce={selectNonce}
      onHover={() => hoverThread(t.root?.id ?? null)}
      onLeave={() => hoverThread(null)}
      onSelect={() => selectThread(t.root?.id ?? null)}
      onDeselect={() => selectThread(null)}
      onChange={refetch}
    />
  );

  const hasAny = orderedThreads.length > 0 || orderedOrphaned.length > 0;

  return (
    <aside className="review-comments" aria-label="Review comments">
      <div className="review-comments-head">
        <p className="review-comments-title">Review comments</p>
      </div>
      {openCount > 0 && (
        <p className="review-comments-summary">
          {openCount} open {openCount === 1 ? "thread" : "threads"}
        </p>
      )}
      {pending && (
        <PendingComposer
          contentRef={contentRef}
          pending={pending}
          onDone={() => {
            setPending(null);
            refetch();
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {!hasAny && !pending && (
        <p className="review-empty">
          No comments yet. Hover a section heading or select text or code to start a thread.
        </p>
      )}
      <div className="review-thread-list">{orderedThreads.map(renderCard)}</div>
      {orderedOrphaned.length > 0 && (
        <div className="review-orphaned">
          <p className="review-comments-title">On removed/changed sections</p>
          <div className="review-thread-list">{orderedOrphaned.map(renderCard)}</div>
        </div>
      )}
    </aside>
  );
}
