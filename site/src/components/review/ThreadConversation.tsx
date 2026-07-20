import { useState } from "react";
import { useMutation } from "@connectrpc/connect-query";
import {
  createComment,
  resolveThread,
  unresolveThread,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useReviewInvalidation } from "../../lib/review-queries";
import CommentBubble from "./CommentBubble";
import ReviewComposer from "./ReviewComposer";

interface ThreadConversationProps {
  thread: Thread;
  sectionLabel?: string;
  onChange: () => void;
  onClose?: () => void;
  compact?: boolean;
}

export default function ThreadConversation({
  thread,
  sectionLabel,
  onChange,
  onClose,
  compact = false,
}: ThreadConversationProps) {
  const contentRef = thread.root?.ref;
  const { invalidateComments } = useReviewInvalidation();
  // Each mutation invalidates the shared listComments cache on success, so all
  // mounted consumers refresh from here rather than a threaded refetch prop.
  const mutationOpts = contentRef
    ? { onSuccess: () => void invalidateComments(contentRef) }
    : undefined;
  const createReply = useMutation(createComment, mutationOpts);
  const resolve = useMutation(resolveThread, mutationOpts);
  const unresolve = useMutation(unresolveThread, mutationOpts);
  const [text, setText] = useState("");

  // Depth of each comment (root = 0), derived from the parent_id chain. The wire
  // list is a flat depth-first pre-order, so we can resolve depths in one pass.
  const depthById = new Map<string, number>();
  if (thread.root) depthById.set(thread.root.id, 0);
  for (const c of thread.replies) {
    const parentDepth = c.parentId != null ? depthById.get(c.parentId) : 0;
    depthById.set(c.id, (parentDepth ?? 0) + 1);
  }

  // Replies are linear: every new comment threads off the root and lands at the
  // bottom, so the always-on composer keeps the discussion flowing top-to-bottom.
  async function postReply() {
    if (!text.trim() || !contentRef || !thread.root) return;
    await createReply.mutateAsync({
      ref: contentRef,
      anchorSlug: thread.root.anchorSlug,
      anchorFingerprint: thread.root.anchorFingerprint,
      parentId: thread.root.id,
      bodyMd: text,
    });
    setText("");
    onChange();
  }

  async function toggleResolved() {
    const id = thread.root?.id;
    if (!id) return;
    if (thread.resolved) await unresolve.mutateAsync({ threadRootId: id });
    else await resolve.mutateAsync({ threadRootId: id });
    onChange();
  }

  const sel = thread.root?.selector;
  const code = thread.root?.codeSelector;
  const codeLabel = code
    ? `${code.path}:${code.line}${code.endLine > code.line ? `-${code.endLine}` : ""}`
    : undefined;
  const label = sectionLabel || (thread.root?.orphaned ? "Removed section" : "Section");

  // Inline surfaces (compact) sit directly under the highlighted prose/code, so
  // the section tag + quoted target would just repeat the surrounding context.
  const showContext = !compact;

  return (
    <div className={cn("review-thread-conversation", thread.resolved && "resolved", compact && "compact")}>
      {(showContext || onClose) && (
        <div className="review-thread-conversation-head">
          {showContext && <span className="review-thread-section-tag">{label}</span>}
          <div className="review-head-actions">
            {thread.root && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={cn(thread.resolved && "text-accent hover:text-accent")}
                onClick={() => void toggleResolved()}
                aria-label={thread.resolved ? "Reopen thread" : "Resolve thread"}
                title={thread.resolved ? "Reopen" : "Resolve"}
              >
                <Check />
              </Button>
            )}
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                aria-label="Close"
              >
                <X />
              </Button>
            )}
          </div>
        </div>
      )}
      {showContext && sel?.quote && (
        <blockquote className="review-quote">{sel.quote}</blockquote>
      )}
      {showContext && code && (
        <blockquote className="review-quote code">
          <span className="review-target-code">{codeLabel}</span>
        </blockquote>
      )}
      <CommentBubble
        login={thread.root?.authorLogin}
        name={thread.root?.authorName}
        body={thread.root?.bodyMd}
        authoredGitSha={thread.root?.authoredGitSha}
      />
      {thread.replies.map((r) => (
        <CommentBubble
          key={r.id}
          login={r.authorLogin}
          name={r.authorName}
          body={r.bodyMd}
          reply
          depth={depthById.get(r.id) ?? 1}
          authoredGitSha={r.authoredGitSha}
        />
      ))}
      <div className="review-thread-actions">
        <ReviewComposer
          value={text}
          onChange={setText}
          onSubmit={() => void postReply()}
          placeholder="Reply…"
          rows={2}
          submitLabel="Reply"
          submitting={createReply.isPending}
          inline
        />
      </div>
    </div>
  );
}
