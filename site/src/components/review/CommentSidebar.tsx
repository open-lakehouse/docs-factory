// Review comments rail for a rendered blog/doc page. Only mounts for allowlisted
// viewers in rail display mode. Reads threads + selection from ReviewProvider.
import { useEffect, useState, type RefObject } from "react";
import { useMutation } from "@connectrpc/connect-query";
import { Plus } from "lucide-react";
import { createComment } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { fingerprint } from "../../lib/content-ref";
import { useAuth } from "../../lib/auth-context";
import { useReviewInvalidation } from "../../lib/review-queries";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSelectionState } from "./selection-context";
import { useReview } from "./review-context";
import PendingComposer from "./PendingComposer";
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
  const { reviewActive } = useAuth();
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
  }, [articleRef, reviewActive]);

  if (!reviewActive || !contentRef || displayMode !== "rail") return null;

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
          No comments yet. Hover a section heading or select text or code to
          start a thread.
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

function AddSectionComment({
  contentRef,
  headings,
  onDone,
}: {
  contentRef: ContentRef;
  headings: Heading[];
  onDone: () => void;
}) {
  const { invalidateComments } = useReviewInvalidation();
  // The mutation owns cache invalidation on success; onDone is UI-only (closes
  // the composer / clears pending), not a refetch trigger.
  const create = useMutation(createComment, {
    onSuccess: () => void invalidateComments(contentRef),
  });
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
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="review-add-section"
        onClick={() => setOpen(true)}
      >
        <Plus />
        Section
      </Button>
    );
  }

  return (
    <div className="review-composer pending review-add-section-form">
      <div className="review-composer-target">
        <span className="review-composer-label">Comment on section</span>
        <Select value={heading?.id ?? ""} onValueChange={setSlug}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Choose a section" />
          </SelectTrigger>
          <SelectContent>
            {headings.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
