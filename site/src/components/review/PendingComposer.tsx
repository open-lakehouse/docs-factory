import { useMutation } from "@connectrpc/connect-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { createComment } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { fingerprint } from "../../lib/content-ref";
import { useReviewInvalidation } from "../../lib/review-queries";
import ReviewComposer from "./ReviewComposer";
import type { PendingAnchor } from "./selection-context";

/** Composer for a pending prose/code selection captured by SelectionLayer. */
export default function PendingComposer({
  contentRef,
  pending,
  onDone,
  onCancel,
  compact = false,
}: {
  contentRef: ContentRef;
  pending: PendingAnchor;
  onDone: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const { invalidateComments } = useReviewInvalidation();
  const create = useMutation(createComment, {
    onSuccess: () => void invalidateComments(contentRef),
  });
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
    } else if (pending.kind === "code") {
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
    } else {
      // Section-level: slug + fingerprint only (no text/code selector).
      await create.mutateAsync({
        ref: contentRef,
        anchorSlug: pending.anchorSlug,
        anchorFingerprint: fingerprint(pending.headingText),
        bodyMd: draft,
      });
    }
    setDraft("");
    onDone();
  }

  const quote =
    pending.kind === "prose"
      ? pending.selector.quote
      : pending.kind === "code"
        ? pending.quote
        : pending.headingText;
  const label =
    pending.kind === "code"
      ? `${pending.path}:${pending.line}`
      : pending.kind === "section"
        ? "Section"
        : pending.headingText;
  const placeholder =
    pending.kind === "section" ? "Comment on this section…" : "Comment on this selection…";

  return (
    <div className={cn("review-composer pending", compact && "compact")}>
      <div className="review-composer-target">
        <span className="review-composer-label">{label || "New comment"}</span>
        <blockquote className={cn("review-quote", pending.kind === "code" && "code")}>
          {quote}
        </blockquote>
      </div>
      <ReviewComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void post()}
        onCancel={onCancel}
        placeholder={placeholder}
        rows={compact ? 3 : 4}
        submitting={create.isPending}
        autoFocus
        compact={compact}
      />
    </div>
  );
}
