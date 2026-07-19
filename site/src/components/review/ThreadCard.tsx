import { useEffect, useRef, useState, type RefObject } from "react";
import { useMutation } from "@connectrpc/connect-query";
import {
  resolveThread,
  unresolveThread,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { scrollToThreadContext } from "../../lib/scroll-to-context";
import ThreadConversation from "./ThreadConversation";

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
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected, selectNonce]);

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

  const label = sectionLabel || (thread.root?.orphaned ? "Removed section" : "Section");
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
        <ThreadConversation thread={thread} sectionLabel={label} onChange={onChange} />
      )}
    </div>
  );
}
