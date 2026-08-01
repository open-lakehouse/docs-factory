import { useEffect, useRef, type RefObject } from "react";
import { useMutation } from "@connectrpc/connect-query";
import { RotateCcw } from "lucide-react";
import { unresolveThread } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { scrollToThreadContext } from "../../lib/scroll-to-context";
import { useReviewInvalidation } from "../../lib/review-queries";
import { Button } from "@/components/ui/button";
import { useScrollContainer } from "./scroll-container-context";
import { cn } from "@/lib/utils";
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
  onDeselect: () => void;
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
  onDeselect,
  onChange,
}: ThreadCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useScrollContainer();
  const contentRef = thread.root?.ref;
  const { invalidateComments } = useReviewInvalidation();
  const unresolve = useMutation(unresolveThread, {
    onSuccess: () => {
      if (contentRef) void invalidateComments(contentRef);
    },
  });

  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected, selectNonce]);

  function jumpToContext() {
    onSelect();
    const article = articleRef.current;
    if (!article) return;
    // Docs scroll `.docs-main-scroll`; the workspace scrolls its middle pane.
    // useScrollContainer resolves to that element (window on /blog).
    scrollToThreadContext(thread, article, scrollContainer);
  }

  async function reopenCollapsed(e: React.MouseEvent) {
    e.stopPropagation();
    const id = thread.root?.id;
    if (!id) return;
    await unresolve.mutateAsync({ threadRootId: id });
    onChange();
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
    // Only the card itself acts as a button. Keys pressed inside the expanded
    // conversation (composer, buttons) keep their native behavior — otherwise
    // Space would never reach the reply textarea.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      jumpToContext();
    }
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        "review-thread",
        thread.resolved && "resolved",
        active && "focused",
        selected ? "selected expanded" : "collapsed",
      )}
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
          {thread.hasUnread && (
            <span
              className="review-unread-dot"
              aria-label={`${thread.unreadCount} unread`}
              title={`${thread.unreadCount} unread`}
            />
          )}
          <span className="review-thread-section" title={label}>
            {label}
          </span>
          <span className="review-thread-preview">{preview}</span>
          {replyCount > 0 && <span className="review-count small">{replyCount + 1}</span>}
          {thread.resolved && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="review-thread-reopen"
              disabled={unresolve.isPending}
              onClick={(e) => void reopenCollapsed(e)}
              aria-label="Reopen thread"
              title="Reopen"
            >
              <RotateCcw />
            </Button>
          )}
        </div>
      ) : (
        <ThreadConversation
          thread={thread}
          sectionLabel={label}
          onChange={onChange}
          onClose={onDeselect}
          onCollapse={onDeselect}
        />
      )}
    </div>
  );
}
