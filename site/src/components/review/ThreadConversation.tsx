import { useState } from "react";
import { useMutation } from "@connectrpc/connect-query";
import {
  createComment,
  resolveThread,
  unresolveThread,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
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
  const reply = useMutation(createComment);
  const resolve = useMutation(resolveThread);
  const unresolve = useMutation(unresolveThread);
  const [text, setText] = useState("");
  // The comment being replied to. null = composer closed; when open, defaults to
  // the thread root (a top-level reply) but can target any nested comment.
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const replyOpen = replyTo !== null;

  // Depth of each comment (root = 0), derived from the parent_id chain. The wire
  // list is a flat depth-first pre-order, so we can resolve depths in one pass.
  const depthById = new Map<string, number>();
  if (thread.root) depthById.set(thread.root.id, 0);
  for (const c of thread.replies) {
    const parentDepth = c.parentId != null ? depthById.get(c.parentId) : 0;
    depthById.set(c.id, (parentDepth ?? 0) + 1);
  }

  async function postReply() {
    const parentId = replyTo;
    if (!text.trim() || !contentRef || !thread.root || !parentId) return;
    await reply.mutateAsync({
      ref: contentRef,
      anchorSlug: thread.root.anchorSlug,
      anchorFingerprint: thread.root.anchorFingerprint,
      parentId,
      bodyMd: text,
    });
    setText("");
    setReplyTo(null);
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

  return (
    <div className={`review-thread-conversation${thread.resolved ? " resolved" : ""}${compact ? " compact" : ""}`}>
      <div className="review-thread-conversation-head">
        <span className="review-thread-section-tag">{label}</span>
        {onClose && (
          <button type="button" className="review-inline-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      {sel?.quote && (
        <blockquote className="review-quote">{sel.quote}</blockquote>
      )}
      {code && (
        <blockquote className="review-quote code">
          <span className="review-target-code">{codeLabel}</span>
        </blockquote>
      )}
      <CommentBubble
        login={thread.root?.authorLogin}
        body={thread.root?.bodyMd}
        onReply={thread.root ? () => setReplyTo(thread.root!.id) : undefined}
      />
      {thread.replies.map((r) => (
        <CommentBubble
          key={r.id}
          login={r.authorLogin}
          body={r.bodyMd}
          reply
          depth={depthById.get(r.id) ?? 1}
          onReply={() => setReplyTo(r.id)}
        />
      ))}
      <div className="review-thread-actions">
        {!replyOpen ? (
          <>
            <button
              type="button"
              className="review-btn ghost"
              onClick={() => thread.root && setReplyTo(thread.root.id)}
            >
              Reply
            </button>
            <button type="button" className="review-btn ghost" onClick={() => void toggleResolved()}>
              {thread.resolved ? "Reopen" : "Resolve"}
            </button>
          </>
        ) : (
          <ReviewComposer
            value={text}
            onChange={setText}
            onSubmit={() => void postReply()}
            onCancel={() => {
              setReplyTo(null);
              setText("");
            }}
            placeholder="Reply…"
            rows={2}
            submitLabel="Reply"
            submitting={reply.isPending}
            compact
          />
        )}
      </div>
    </div>
  );
}
