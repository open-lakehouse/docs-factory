// Workspace-level state for working through comments across pages: which view
// the right pane shows ("This page" rail or the "All comments" feed) and the
// queue the stepper walks.
//
// The queue is a snapshot of the feed's order taken when a row is opened. The
// feed keeps refreshing underneath (new comments, read state), and stepping
// through a live list would skip or repeat threads as rows move. Resolving the
// current thread moves on to the next open one, so the snapshot is paired with
// the threads resolved since it was taken.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type FeedThread, nextOpenIndex } from "../../../lib/comment-feed";
import { useWorkspaceTabs } from "./workspace-tabs-context";

export type RightPaneMode = "page" | "feed";

const MODE_KEY = "docs.review.right-mode";

interface QueueValue {
  mode: RightPaneMode;
  setMode: (mode: RightPaneMode) => void;
  queue: FeedThread[];
  index: number;
  /** Snapshot `queue`, open `queue[index]`, and show it in the page rail. */
  start: (queue: FeedThread[], index: number) => void;
  step: (delta: 1 | -1) => void;
  /** Record `rootId` as resolved; if it is the current thread, open the next open one. */
  advancePast: (rootId: string) => void;
  clear: () => void;
}

const QueueContext = createContext<QueueValue | undefined>(undefined);

function readMode(): RightPaneMode {
  if (typeof localStorage === "undefined") return "page";
  return localStorage.getItem(MODE_KEY) === "feed" ? "feed" : "page";
}

/** Keys typed into a composer, input, or editor must not step the queue. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function CommentQueueProvider({ children }: { children: ReactNode }) {
  const { openTab } = useWorkspaceTabs();
  const [mode, setModeState] = useState<RightPaneMode>(readMode);
  const [queue, setQueue] = useState<FeedThread[]>([]);
  const [index, setIndex] = useState(0);
  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(new Set());

  const setMode = useCallback((next: RightPaneMode) => {
    setModeState(next);
    localStorage.setItem(MODE_KEY, next);
  }, []);

  const open = useCallback(
    (t: FeedThread) => openTab(t.ref, { thread: t.rootId, anchor: t.anchorSlug || undefined }),
    [openTab],
  );

  const start = useCallback(
    (next: FeedThread[], at: number) => {
      const target = next[at];
      if (!target) return;
      setQueue(next);
      setIndex(at);
      setResolvedIds(new Set());
      setMode("page");
      open(target);
    },
    [open, setMode],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      const at = index + delta;
      const target = queue[at];
      if (!target) return;
      setIndex(at);
      open(target);
    },
    [index, queue, open],
  );

  const advancePast = useCallback(
    (rootId: string) => {
      const resolved = new Set(resolvedIds).add(rootId);
      setResolvedIds(resolved);
      if (queue[index]?.rootId !== rootId) return;
      const at = nextOpenIndex(queue, index, resolved);
      if (at < 0) return;
      setIndex(at);
      open(queue[at]);
    },
    [resolvedIds, queue, index, open],
  );

  const clear = useCallback(() => {
    setQueue([]);
    setIndex(0);
    setResolvedIds(new Set());
  }, []);

  // j/k and ]/[ step while a queue is live, like a mail client.
  useEffect(() => {
    if (queue.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      if (e.key === "j" || e.key === "]") step(1);
      else if (e.key === "k" || e.key === "[") step(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue.length, step]);

  const value = useMemo<QueueValue>(
    () => ({ mode, setMode, queue, index, start, step, advancePast, clear }),
    [mode, setMode, queue, index, start, step, advancePast, clear],
  );
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useCommentQueue(): QueueValue {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error("useCommentQueue must be used within CommentQueueProvider");
  return ctx;
}

/** Surfaces outside the review workspace render threads without a queue. */
export function useOptionalCommentQueue(): QueueValue | undefined {
  return useContext(QueueContext);
}
