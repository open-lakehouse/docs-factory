import { useMutation } from "@connectrpc/connect-query";
import { Eraser, PencilLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { createComment } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { fingerprint } from "../../lib/content-ref";
import { useReviewInvalidation } from "../../lib/review-queries";
import ReviewComposer from "./ReviewComposer";
import SuggestionDiff from "./SuggestionDiff";
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
  // The replacement text while suggesting an edit; null when not suggesting.
  const [replacement, setReplacement] = useState<string | null>(null);
  const original = pending.kind === "section" ? undefined : pending.original;
  const suggesting = original !== undefined && replacement !== null;
  const changed = suggesting && replacement !== original;
  const suggestion = changed ? { original, replacement } : undefined;

  async function post() {
    if (!draft.trim() && !suggestion) return;
    if (pending.kind === "prose") {
      await create.mutateAsync({
        ref: contentRef,
        anchorSlug: pending.anchorSlug,
        anchorFingerprint: fingerprint(pending.headingText),
        bodyMd: draft,
        suggestion,
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
        suggestion,
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
    setReplacement(null);
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
  const placeholder = suggesting
    ? "Why this change? (optional)"
    : pending.kind === "section"
      ? "Comment on this section…"
      : "Comment on this selection…";
  const code = pending.kind === "code";

  return (
    <div className={cn("review-composer pending", compact && "compact")}>
      <div className="review-composer-target">
        <span className="review-composer-label">{label || "New comment"}</span>
        {!suggesting && (
          <blockquote className={cn("review-quote", code && "code")}>{quote}</blockquote>
        )}
      </div>
      {original !== undefined && (
        <div className="review-suggest-actions">
          <Button
            type="button"
            variant={suggesting && replacement !== "" ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={suggesting && replacement !== ""}
            onClick={() => setReplacement(suggesting && replacement !== "" ? null : original)}
          >
            <PencilLine aria-hidden />
            Suggest edit
          </Button>
          <Button
            type="button"
            variant={replacement === "" ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={replacement === ""}
            onClick={() => setReplacement(replacement === "" ? null : "")}
          >
            <Eraser aria-hidden />
            Suggest deletion
          </Button>
        </div>
      )}
      {suggesting && (
        <div className="review-suggest-editor">
          {replacement !== "" && (
            <Textarea
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              rows={Math.min(8, Math.max(2, replacement.split("\n").length))}
              className={cn(code && "font-mono text-xs")}
              aria-label="Suggested replacement"
              autoFocus
            />
          )}
          <SuggestionDiff original={original} replacement={replacement} code={code} />
        </div>
      )}
      <ReviewComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void post()}
        onCancel={onCancel}
        placeholder={placeholder}
        rows={compact ? 3 : 4}
        submitting={create.isPending}
        autoFocus={!suggesting}
        compact={compact}
        allowEmpty={changed}
      />
    </div>
  );
}
