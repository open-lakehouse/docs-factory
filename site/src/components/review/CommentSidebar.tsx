// Review comments rail for a rendered blog/doc page. Only mounts for allowlisted
// viewers. Reads threads + selection from the page ReviewProvider (shared with
// the code boxes), discovers headings from the article for labels + the section
// picker, and lets reviewers post, reply, and resolve — the in-app replacement
// for Google-Docs comments. Threads render as collapsed one-row cards that
// expand on selection.
import { useEffect, useState, type RefObject } from "react";
import { useMutation } from "@connectrpc/connect-query";
import { createComment } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { fingerprint } from "../../lib/content-ref";
import { useAuth } from "../../lib/auth-context";
import { useSelectionState, type PendingAnchor } from "./selection-context";
import { useReview } from "./review-context";
import QuoteHighlights from "./QuoteHighlights";
import ReviewComposer from "./ReviewComposer";
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
  const { isAllowlisted } = useAuth();
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
  }, [articleRef, isAllowlisted]);

  if (!isAllowlisted || !contentRef) return null;

  const headingText = new Map(headings.map((h) => [h.id, h.text]));
  const sectionLabelFor = (slug?: string) => (slug && headingText.get(slug)) || "";

  const renderCard = (t: (typeof threads)[number]) => (
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
      onChange={refetch}
    />
  );

  const hasAny = threads.length > 0 || orphaned.length > 0;

  return (
    <aside className="review-comments" aria-label="Review comments">
      <div className="review-comments-head">
        <p className="review-comments-title">Review comments</p>
        {headings.length > 0 && (
          <AddSectionComment contentRef={contentRef} headings={headings} onDone={refetch} />
        )}
      </div>
      {openCount > 0 && (
        <p className="review-comments-summary">
          {openCount} open {openCount === 1 ? "thread" : "threads"}
        </p>
      )}
      <QuoteHighlights
        articleRef={articleRef}
        threads={threads}
        focusedThreadId={activeThreadId}
        onSelectThread={selectThread}
      />
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
          No comments yet. Select text or code in the article to start a thread.
        </p>
      )}
      <div className="review-thread-list">{threads.map(renderCard)}</div>
      {orphaned.length > 0 && (
        <div className="review-orphaned">
          <p className="review-comments-title">On removed/changed sections</p>
          <div className="review-thread-list">{orphaned.map(renderCard)}</div>
        </div>
      )}
    </aside>
  );
}

/** Compact "comment on a section" picker: a heading dropdown + composer. */
function AddSectionComment({
  contentRef,
  headings,
  onDone,
}: {
  contentRef: ContentRef;
  headings: Heading[];
  onDone: () => void;
}) {
  const create = useMutation(createComment);
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(headings[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const heading = headings.find((h) => h.id === slug) ?? headings[0];

  async function post() {
    if (!draft.trim() || !heading) return;
    await create.mutateAsync({
      ref: contentRef,
      anchorSlug: heading.id,
      anchorFingerprint: fingerprint(heading.text),
      bodyMd: draft,
    });
    setDraft("");
    setOpen(false);
    onDone();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="review-btn ghost review-add-section"
        onClick={() => setOpen(true)}
      >
        + Section
      </button>
    );
  }

  return (
    <div className="review-composer pending review-add-section-form">
      <div className="review-composer-target">
        <span className="review-composer-label">Comment on section</span>
        <select
          className="review-select"
          value={heading?.id ?? ""}
          onChange={(e) => setSlug(e.target.value)}
        >
          {headings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.text}
            </option>
          ))}
        </select>
      </div>
      <ReviewComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void post()}
        onCancel={() => {
          setOpen(false);
          setDraft("");
        }}
        placeholder="Comment on this section…"
        rows={3}
        submitting={create.isPending}
        autoFocus
        compact
      />
    </div>
  );
}

/** Composer shown when the SelectionLayer captured a prose/code selection. */
function PendingComposer({
  contentRef,
  pending,
  onDone,
  onCancel,
}: {
  contentRef: ContentRef;
  pending: PendingAnchor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const create = useMutation(createComment);
  const [draft, setDraft] = useState("");

  async function post() {
    if (!draft.trim()) return;
    if (pending.kind === "prose") {
      await create.mutateAsync({
        ref: contentRef,
        anchorSlug: pending.anchorSlug,
        anchorFingerprint: fingerprint(pending.headingText),
        bodyMd: draft,
        selector: {
          quote: pending.selector.quote,
          prefix: pending.selector.prefix,
          suffix: pending.selector.suffix,
          start: pending.selector.start,
        },
      });
    } else {
      await create.mutateAsync({
        ref: contentRef,
        anchorSlug: pending.anchorSlug,
        anchorFingerprint: fingerprint(pending.headingText),
        bodyMd: draft,
        codeSelector: {
          path: pending.path,
          region: pending.region,
          line: pending.line,
          endLine: pending.endLine,
          lineHash: pending.lineHash,
          fileHash: pending.fileHash,
        },
      });
    }
    setDraft("");
    onDone();
  }

  const quote = pending.kind === "prose" ? pending.selector.quote : pending.quote;
  const label = pending.kind === "code" ? `${pending.path}:${pending.line}` : pending.headingText;

  return (
    <div className="review-composer pending">
      <div className="review-composer-target">
        <span className="review-composer-label">{label || "New comment"}</span>
        <blockquote className={`review-quote${pending.kind === "code" ? " code" : ""}`}>
          {quote}
        </blockquote>
      </div>
      <ReviewComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void post()}
        onCancel={onCancel}
        placeholder="Comment on this selection…"
        rows={4}
        submitting={create.isPending}
        autoFocus
      />
    </div>
  );
}
