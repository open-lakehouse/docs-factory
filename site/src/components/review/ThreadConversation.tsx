import { useState } from "react";
import { useMutation } from "@connectrpc/connect-query";
import {
  createComment,
  resolveThread,
  unresolveThread,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { Check, Link2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "../../lib/clipboard";
import { refToParam } from "../../lib/content-ref";
import { useReviewInvalidation } from "../../lib/review-queries";
import CommentBubble from "./CommentBubble";
import ReviewComposer from "./ReviewComposer";

interface ThreadConversationProps {
  thread: Thread;
  sectionLabel?: string;
  onChange: () => void;
  onClose?: () => void;
  /** Called after a successful resolve so the rail card can collapse. */
  onCollapse?: () => void;
  compact?: boolean;
}

/** Absolute review-workspace URL that opens this thread. */
function threadDeepLink(thread: Thread): string | null {
  const root = thread.root;
  if (!root?.ref || !root.id) return null;
  const token = refToParam(root.ref);
  const url = new URL("/review", window.location.origin);
  url.searchParams.set("tabs", token);
  url.searchParams.set("active", token);
  url.searchParams.set("thread", root.id);
  if (root.anchorSlug) url.searchParams.set("anchor", root.anchorSlug);
  return url.toString();
}

export default function ThreadConversation({
  thread,
  sectionLabel,
  onChange,
  onClose,
  onCollapse,
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
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Depth of each comment (root = 0), derived from the parent_id chain. The wire
  // list is a flat depth-first pre-order, so we can resolve depths in one pass.
  const depthById = new Map<string, number>();
  if (thread.root) depthById.set(thread.root.id, 0);
  for (const c of thread.replies) {
    const parentDepth = c.parentId != null ? depthById.get(c.parentId) : 0;
    depthById.set(c.id, (parentDepth ?? 0) + 1);
  }

  async function postReply(parentId: string) {
    if (!text.trim() || !contentRef || !thread.root) return;
    await createReply.mutateAsync({
      ref: contentRef,
      anchorSlug: thread.root.anchorSlug,
      anchorFingerprint: thread.root.anchorFingerprint,
      parentId,
      bodyMd: text,
    });
    setText("");
    setReplyingToId(null);
    onChange();
  }

  function renderReplyComposer(parentId: string, depth: number) {
    const indent = Math.min(depth + 1, 4) * 0.85;
    return (
      <div
        className="review-inline-reply"
        style={depth > 0 ? { marginLeft: `${indent}rem` } : undefined}
      >
        <ReviewComposer
          value={text}
          onChange={setText}
          onSubmit={() => void postReply(parentId)}
          onCancel={() => {
            setReplyingToId(null);
            setText("");
          }}
          placeholder="Reply…"
          rows={2}
          submitLabel="Reply"
          submitting={createReply.isPending}
          compact
          autoFocus
        />
      </div>
    );
  }

  async function doResolve(e: React.MouseEvent) {
    e.stopPropagation();
    const id = thread.root?.id;
    if (!id) return;
    await resolve.mutateAsync({ threadRootId: id });
    onChange();
    onCollapse?.();
  }

  async function doReopen(e: React.MouseEvent) {
    e.stopPropagation();
    const id = thread.root?.id;
    if (!id) return;
    await unresolve.mutateAsync({ threadRootId: id });
    onChange();
  }

  async function copyThreadLink(e: React.MouseEvent) {
    e.stopPropagation();
    const link = threadDeepLink(thread);
    if (!link) return;
    const ok = await copyToClipboard(link);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const label = sectionLabel || (thread.root?.orphaned ? "Removed section" : "Section");
  const busy = resolve.isPending || unresolve.isPending;

  // Inline surfaces (compact) sit directly under the highlighted prose/code, so
  // the section tag + quoted target would just repeat the surrounding context.
  // The rail also skips quotes — CSS highlights already show the target in the
  // article (prose and code), so path:line would only repeat what the highlight
  // already identifies.
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
                className="review-thread-action"
                data-tooltip={copied ? "Copied" : "Copy link"}
                onClick={(e) => void copyThreadLink(e)}
                aria-label={copied ? "Link copied" : "Copy link to thread"}
              >
                {copied ? <Check className="text-emerald-500" /> : <Link2 />}
              </Button>
            )}
            {thread.root &&
              (thread.resolved ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="review-thread-action"
                  data-tooltip="Reopen thread"
                  disabled={busy}
                  onClick={(e) => void doReopen(e)}
                  aria-label="Reopen thread"
                >
                  <RotateCcw />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="review-thread-action"
                  data-tooltip="Resolve thread"
                  disabled={busy}
                  onClick={(e) => void doResolve(e)}
                  aria-label="Resolve thread"
                >
                  <Check />
                </Button>
              ))}
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="review-thread-action"
                data-tooltip="Collapse thread"
                onClick={(e) => {
                  // The rail card wraps this in its own onClick (jump/select),
                  // which would immediately re-expand what we just collapsed.
                  e.stopPropagation();
                  onClose();
                }}
                aria-label="Close"
              >
                <X />
              </Button>
            )}
          </div>
        </div>
      )}
      {thread.root && (
        <CommentBubble
          login={thread.root.authorLogin}
          name={thread.root.authorName}
          body={thread.root.bodyMd}
          authoredGitSha={thread.root.authoredGitSha}
        />
      )}
      {thread.replies.map((r) => {
        const depth = depthById.get(r.id) ?? 1;
        return (
          <div key={r.id} className="review-comment-thread">
            <CommentBubble
              login={r.authorLogin}
              name={r.authorName}
              body={r.bodyMd}
              reply
              depth={depth}
              authoredGitSha={r.authoredGitSha}
              onReply={() => {
                setReplyingToId(r.id);
                setText("");
              }}
            />
            {replyingToId === r.id && renderReplyComposer(r.id, depth)}
          </div>
        );
      })}
      {replyingToId == null && thread.root && (
        <div className="review-thread-actions">
          <ReviewComposer
            value={text}
            onChange={setText}
            onSubmit={() => void postReply(thread.root!.id)}
            placeholder="Reply…"
            rows={2}
            submitLabel="Reply"
            submitting={createReply.isPending}
            inline
          />
        </div>
      )}
    </div>
  );
}
