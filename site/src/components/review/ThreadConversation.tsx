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
  const [replyOpen, setReplyOpen] = useState(false);

  async function postReply() {
    if (!text.trim() || !contentRef || !thread.root) return;
    await reply.mutateAsync({
      ref: contentRef,
      anchorSlug: thread.root.anchorSlug,
      anchorFingerprint: thread.root.anchorFingerprint,
      parentId: thread.root.id,
      bodyMd: text,
    });
    setText("");
    setReplyOpen(false);
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
      <CommentBubble login={thread.root?.authorLogin} body={thread.root?.bodyMd} />
      {thread.replies.map((r) => (
        <CommentBubble key={r.id} login={r.authorLogin} body={r.bodyMd} reply />
      ))}
      <div className="review-thread-actions">
        {!replyOpen ? (
          <>
            <button type="button" className="review-btn ghost" onClick={() => setReplyOpen(true)}>
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
              setReplyOpen(false);
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
