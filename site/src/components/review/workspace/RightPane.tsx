// The workspace's right column. On a content tab it switches between:
//   - This page: a portal slot the ACTIVE tab fills with its own comment rail
//     (from inside that tab's ReviewProvider), then per-page Activity.
//   - All comments: recent threads across every page (CommentFeed).
// While the reviewer steps through a feed snapshot, a bar above the rail shows
// the position and moves to the previous/next thread, on whatever page it is.
// Cross-content requests to me live on the Inbox item; the left tree also marks
// requested pages (UserCheck indicators).
import { ChevronLeft, ChevronRight, PanelRightClose, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentArea } from "../../../gen/docs_factory/review/v1/messages_pb";
import { useCommentFeed } from "../../../lib/review-inbox";
import { sameRef } from "../../../lib/review-queries";
import ContentEventTimeline from "../ContentEventTimeline";
import CommentFeed from "./CommentFeed";
import { type RightPaneMode, useCommentQueue } from "./comment-queue-context";
import { useWorkspaceTabs } from "./workspace-tabs-context";

const noTitle = () => "";

function ModeSwitch({
  mode,
  onChange,
  unread,
}: {
  mode: RightPaneMode;
  onChange: (mode: RightPaneMode) => void;
  unread: number;
}) {
  const option = (value: RightPaneMode, label: string, badge?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      className={cn("right-pane-mode", mode === value && "active")}
      onClick={() => onChange(value)}
    >
      {label}
      {badge ? <span className="right-pane-mode-badge">{badge}</span> : null}
    </button>
  );
  return (
    <div role="tablist" aria-label="Comments view" className="right-pane-modes">
      {option("page", "This page")}
      {option("feed", "All comments", unread)}
    </div>
  );
}

function QueueBar() {
  const { queue, index, step, clear, setMode } = useCommentQueue();
  return (
    <div className="comment-queue-bar">
      <button
        type="button"
        className="comment-queue-step"
        aria-label="Previous thread (k)"
        title="Previous thread (k)"
        disabled={index === 0}
        onClick={() => step(-1)}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="comment-queue-pos">
        {index + 1} <span className="muted">of</span> {queue.length}
      </span>
      <button
        type="button"
        className="comment-queue-step"
        aria-label="Next thread (j)"
        title="Next thread (j)"
        disabled={index >= queue.length - 1}
        onClick={() => step(1)}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <span className="flex-1" />
      <button type="button" className="comment-queue-link" onClick={() => setMode("feed")}>
        All comments
      </button>
      <button
        type="button"
        className="comment-queue-step"
        aria-label="Stop stepping"
        title="Stop stepping"
        onClick={clear}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export default function RightPane({
  setSlot,
  onCollapse,
  collapseDisabled = false,
}: {
  setSlot: (el: HTMLDivElement | null) => void;
  onCollapse?: () => void;
  collapseDisabled?: boolean;
}) {
  const { tabs, activeToken } = useWorkspaceTabs();
  const { mode, setMode, queue, index } = useCommentQueue();
  const { unreadThreads } = useCommentFeed(noTitle);
  const activeTab = tabs.find((tab) => tab.token === activeToken);
  const activeRef = activeTab?.kind === "content" ? activeTab.ref : undefined;
  // The Inbox's middle pane already is the feed; there's no page to switch to.
  const showFeed = Boolean(activeRef) && mode === "feed";
  const stepping = !showFeed && activeRef && queue[index] && sameRef(queue[index].ref, activeRef);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="right-pane-head">
        {activeRef ? (
          <ModeSwitch mode={mode} onChange={setMode} unread={unreadThreads} />
        ) : (
          <span className="flex-1" />
        )}
        {onCollapse && (
          <button
            type="button"
            className="workspace-pane-collapse-right"
            aria-label="Hide right pane"
            title="Hide right pane"
            onClick={onCollapse}
            tabIndex={collapseDisabled ? -1 : 0}
          >
            <PanelRightClose className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {stepping && <QueueBar />}

      {showFeed && (
        <div className="p-3">
          <CommentFeed compact />
        </div>
      )}

      {/* Active tab's comment view renders here via portal — it follows the
          active tab (see ReviewTab + right-pane-slot). Kept mounted in feed
          mode so the tab's portal target survives the switch. */}
      <div
        ref={setSlot}
        className={cn("workspace-section-divider empty:hidden", showFeed && "hidden")}
      />

      {/* The model has threads but no versions or lifecycle to show. */}
      {activeRef && !showFeed && activeRef.area !== ContentArea.MODEL && (
        <section className="workspace-activity">
          <ContentEventTimeline contentRef={activeRef} heading="Activity" />
        </section>
      )}
    </div>
  );
}
