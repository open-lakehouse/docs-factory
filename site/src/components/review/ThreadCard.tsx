import { useEffect, useRef, useState, type RefObject } from "react";
import { useMutation } from "@connectrpc/connect-query";
import {
  createComment,
  resolveThread,
  unresolveThread,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { scrollToThreadContext } from "../../lib/scroll-to-context";
import CommentBubble from "./CommentBubble";
import ReviewComposer from "./ReviewComposer";

interface ThreadCardProps {
  thread: Thread;
  articleRef: RefObject<HTMLElement | null>;
  sectionLabel: string;
  active: boolean;
  selected: boolean;
  selectNonce: number;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
  onChange: () => void;
}

export default function ThreadCard({
  thread,
  articleRef,
  sectionLabel,
  active,
  selected,
  selectNonce,
  onHover,
  onLeave,
  onSelect,
  onChange,
}: ThreadCardProps) {
  const contentRef = thread.root?.ref;
  const reply = useMutation(createComment);
  const resolve = useMutation(resolveThread);
  const unresolve = useMutation(unresolveThread);
  const [text, setText] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // When selected (e.g. by clicking the commented text in the article), bring
  // the card into view within the rail so the conversation is visible. Keyed on
  // selectNonce so re-selecting the same thread re-scrolls to it.
  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected, selectNonce]);

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

  function jumpToContext() {
    onSelect();
    const article = articleRef.current;
    if (!article) return;
    scrollToThreadContext(thread, article);
  }

  const sel = thread.root?.selector;
  const code = thread.root?.codeSelector;
  const codeLabel = code
    ? `${code.path}:${code.line}${code.endLine > code.line ? `-${code.endLine}` : ""}`
    : undefined;
  const hasTarget = Boolean(sel?.quote || code || thread.root?.anchorSlug);

  const label = sectionLabel || (thread.orphaned ? "Removed section" : "Section");
  const preview = thread.root?.bodyMd || sel?.quote || codeLabel || "";
  const replyCount = thread.replies.length;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      jumpToContext();
    }
  }

  return (
    <div
      ref={cardRef}
      className={`review-thread${thread.resolved ? " resolved" : ""}${active ? " focused" : ""}${selected ? " selected expanded" : " collapsed"}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      onClick={jumpToContext}
      onKeyDown={onKeyDown}
      role="button"
      aria-expanded={selected}
      tabIndex={0}
    >
      {!selected ? (
        <div className="review-thread-collapsed">
          <span className="review-thread-section" title={label}>
            {label}
          </span>
          <span className="review-thread-preview">{preview}</span>
          {replyCount > 0 && <span className="review-count small">{replyCount + 1}</span>}
        </div>
      ) : (
        <>
          <div className="review-thread-section-tag">{label}</div>
          {hasTarget && (
            <button
              type="button"
              className="review-target"
              onClick={(e) => {
                e.stopPropagation();
                jumpToContext();
              }}
            >
              {sel?.quote && <span className="review-target-quote">"{sel.quote}"</span>}
              {code && <span className="review-target-code">{codeLabel}</span>}
              {!sel?.quote && !code && thread.root?.anchorSlug && (
                <span className="review-target-heading">Section comment</span>
              )}
              <span className="review-target-jump">Jump to context</span>
            </button>
          )}
          <CommentBubble login={thread.root?.authorLogin} body={thread.root?.bodyMd} />
          {thread.replies.map((r) => (
            <CommentBubble key={r.id} login={r.authorLogin} body={r.bodyMd} reply />
          ))}
          <div className="review-thread-actions" onClick={(e) => e.stopPropagation()}>
            {!replyOpen ? (
              <>
                <button type="button" className="review-btn ghost" onClick={() => setReplyOpen(true)}>
                  Reply
                </button>
                <button type="button" className="review-btn ghost" onClick={toggleResolved}>
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
        </>
      )}
    </div>
  );
}
