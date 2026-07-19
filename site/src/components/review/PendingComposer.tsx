import { useState } from "react";
import { useMutation } from "@connectrpc/connect-query";
import { createComment } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { fingerprint } from "../../lib/content-ref";
import { type PendingAnchor } from "./selection-context";
import ReviewComposer from "./ReviewComposer";

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
    <div className={`review-composer pending${compact ? " compact" : ""}`}>
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
        rows={compact ? 3 : 4}
        submitting={create.isPending}
        autoFocus
        compact={compact}
      />
    </div>
  );
}
