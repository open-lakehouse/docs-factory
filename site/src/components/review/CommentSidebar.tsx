// Review comments rail for a rendered blog/doc page. Only mounts for allowlisted
// viewers in rail display mode. Reads threads + selection from ReviewProvider.
// Thread cards are ordered by document position (top→bottom), not creation time.
// Section comments start from the heading gutter icon (or text/code selection);
// page-level threads sit above them and start from "Comment on page".
import { useMutation } from "@connectrpc/connect-query";
import { Eye, EyeOff } from "lucide-react";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommentScope, type ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { createComment } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { useReviewInvalidation } from "../../lib/review-queries";
import { useShowResolved } from "../../lib/review-show-resolved";
import { sortThreadsByDocumentOrder } from "../../lib/thread-document-order";
import PendingComposer from "./PendingComposer";
import ReviewComposer from "./ReviewComposer";
import { useReview } from "./review-context";
import { useSelectionState } from "./selection-context";
import ThreadCard from "./ThreadCard";

/** Pill toggle that reveals resolved threads; the count is how many are hidden or shown. */
export function ShowResolvedToggle({
  count,
  show,
  onChange,
}: {
  count: number;
  show: boolean;
  onChange: (show: boolean) => void;
}) {
  if (count === 0) return null;
  const Icon = show ? Eye : EyeOff;
  return (
    <button
      type="button"
      className="review-resolved-toggle"
      aria-pressed={show}
      title={show ? "Hide resolved threads" : "Show resolved threads"}
      onClick={() => onChange(!show)}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>Show resolved</span>
      <span className="review-count small">{count}</span>
    </button>
  );
}

interface Heading {
  id: string;
  text: string;
}

function PageCommentComposer({
  contentRef,
  onDone,
}: {
  contentRef: ContentRef;
  onDone: () => void;
}) {
  const { invalidateComments } = useReviewInvalidation();
  const create = useMutation(createComment, {
    onSuccess: () => void invalidateComments(contentRef),
  });
  const [draft, setDraft] = useState("");
  async function post() {
    if (!draft.trim()) return;
    await create.mutateAsync({
      ref: contentRef,
      anchorSlug: "",
      anchorFingerprint: "",
      bodyMd: draft,
      scope: CommentScope.DOCUMENT,
    });
    setDraft("");
    onDone();
  }
  return (
    <ReviewComposer
      value={draft}
      onChange={setDraft}
      onSubmit={() => void post()}
      onCancel={onDone}
      placeholder="Comment on the whole page…"
      submitting={create.isPending}
      autoFocus
      compact
    />
  );
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
  const [composingPage, setComposingPage] = useState(false);
  const [showResolved, setShowResolved] = useShowResolved();

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const found: Heading[] = [];
    article.querySelectorAll("h1, h2, h3, h4").forEach((n) => {
      if (n.id) found.push({ id: n.id, text: n.textContent ?? "" });
    });
    setHeadings(found);
  }, [articleRef, canComment]);

  const resolvedCount = useMemo(
    () => [...threads, ...orphaned].filter((t) => t.resolved).length,
    [threads, orphaned],
  );
  // A selected resolved thread stays visible so a deep link into it still lands.
  const visible = useMemo(() => {
    const keep = (t: (typeof threads)[number]) =>
      showResolved || !t.resolved || t.root?.id === selectedThreadId;
    return { threads: threads.filter(keep), orphaned: orphaned.filter(keep) };
  }, [threads, orphaned, showResolved, selectedThreadId]);

  // `headings` doubles as a readiness signal that the article DOM is mounted
  // and queryable — without it, articleRef.current alone wouldn't re-sort.
  const pageThreads = useMemo(
    () => visible.threads.filter((t) => t.root?.scope === CommentScope.DOCUMENT),
    [visible],
  );
  const orderedThreads = useMemo(
    () =>
      sortThreadsByDocumentOrder(
        visible.threads.filter((t) => t.root?.scope !== CommentScope.DOCUMENT),
        articleRef.current,
      ),
    [visible, headings, articleRef],
  );
  const orderedOrphaned = useMemo(
    () => sortThreadsByDocumentOrder(visible.orphaned, articleRef.current),
    [visible, headings, articleRef],
  );

  if (!canComment || !contentRef || displayMode !== "rail") return null;

  const headingText = new Map(headings.map((h) => [h.id, h.text]));
  const sectionLabelFor = (slug?: string) => (slug && headingText.get(slug)) || "";

  const renderCard = (t: (typeof orderedThreads)[number]) => (
    <ThreadCard
      key={t.root?.id}
      thread={t}
      articleRef={articleRef}
      sectionLabel={
        t.root?.scope === CommentScope.DOCUMENT ? "Whole page" : sectionLabelFor(t.root?.anchorSlug)
      }
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

  const hasAny = pageThreads.length > 0 || orderedThreads.length > 0 || orderedOrphaned.length > 0;

  return (
    <aside className="review-comments" aria-label="Review comments">
      <div className="review-comments-head">
        <p className="review-comments-title">Review comments</p>
        {!composingPage && (
          <Button variant="ghost" size="xs" onClick={() => setComposingPage(true)}>
            Comment on page
          </Button>
        )}
      </div>
      {(openCount > 0 || resolvedCount > 0) && (
        <div className="review-comments-summary">
          <span>
            {openCount === 0
              ? "No open threads"
              : `${openCount} open ${openCount === 1 ? "thread" : "threads"}`}
          </span>
          <ShowResolvedToggle
            count={resolvedCount}
            show={showResolved}
            onChange={setShowResolved}
          />
        </div>
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
      {composingPage && (
        <PageCommentComposer
          contentRef={contentRef}
          onDone={() => {
            setComposingPage(false);
            refetch();
          }}
        />
      )}
      {pageThreads.length > 0 && (
        <div className="review-thread-list">{pageThreads.map(renderCard)}</div>
      )}
      {!hasAny && resolvedCount === 0 && !pending && !composingPage && (
        <p className="review-empty">
          No comments yet. Comment on the page, hover a section heading, or select text or code to
          start a thread.
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
