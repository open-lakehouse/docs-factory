// Page-level review state shared by the comment rail AND the rendered content
// (so the Shiki code boxes can highlight commented source lines themselves,
// rather than an overlay scanning the DOM). Owns the comment-threads query and
// the hover/selection state; exposes a per-code-box lookup of commented lines.
//
// Degrades to a no-op default when no provider is mounted (e.g. the Explain
// page renders code boxes without a review context), so <Pre> can always call
// useReview() safely.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useMutation } from "@connectrpc/connect-query";
import {
  listComments,
  markThreadSeen,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef, Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { baseUrl, sseEnabled } from "../../lib/review-client";
import { useReviewInvalidation, refKey } from "../../lib/review-queries";
import {
  readReviewDisplayMode,
  setReviewDisplayMode,
  REVIEW_DISPLAY_MODE_EVENT,
  type ReviewDisplayMode,
} from "../../lib/review-display-mode";

/** A commented source-line range within one file/region, for the code box. */
export interface CommentedLines {
  line: number;
  endLine: number;
  threadId: string;
  focused: boolean;
}

interface ReviewContextValue {
  contentRef: ContentRef | null;
  threads: Thread[];
  orphanedThreads: Thread[];
  openCount: number;
  refetch: () => void;
  activeThreadId: string | null;
  selectedThreadId: string | null;
  selectNonce: number;
  hoverThread: (id: string | null) => void;
  selectThread: (id: string | null) => void;
  threadById: (id: string) => Thread | undefined;
  displayMode: ReviewDisplayMode;
  setDisplayMode: (mode: ReviewDisplayMode) => void;
  /** Commented lines anchored to a given snippet source path (+region). */
  codeLinesFor: (path: string, region: string) => CommentedLines[];
}

const noop = () => {};

const ReviewContext = createContext<ReviewContextValue>({
  contentRef: null,
  threads: [],
  orphanedThreads: [],
  openCount: 0,
  refetch: noop,
  activeThreadId: null,
  selectedThreadId: null,
  selectNonce: 0,
  hoverThread: noop,
  selectThread: noop,
  threadById: () => undefined,
  displayMode: "rail",
  setDisplayMode: noop,
  codeLinesFor: () => [],
});

export function ReviewProvider({
  contentRef,
  children,
}: {
  contentRef: ContentRef;
  children: ReactNode;
}) {
  const { reviewActive } = useAuth();
  const { commentsKey, invalidateComments, queryClient } = useReviewInvalidation();
  // Poll so a reviewer sees other reviewers' comments arrive without a reload.
  // Gated on `reviewActive` (allowlisted AND Site review mode on) — a reviewer
  // browsing in regular mode has no comment chrome mounted, so there's nothing
  // to keep live and no reason to fetch. TanStack pauses the interval while the
  // tab is hidden and refetches on window focus, so background tabs don't hammer
  // the API. When SSE is enabled the interval drops to a slow backstop (SSE is
  // the primary path then); otherwise a modest interval keeps the rail live.
  const pollInterval = sseEnabled ? 60_000 : 15_000;
  const { data } = useQuery(
    listComments,
    { ref: contentRef },
    {
      enabled: reviewActive,
      refetchInterval: reviewActive ? pollInterval : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  );

  const threads = data?.threads ?? [];
  const orphanedThreads = data?.orphanedThreads ?? [];

  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; nonce: number } | null>(null);
  const selectedThreadId = selection?.id ?? null;
  const activeThreadId = hoveredThreadId ?? selectedThreadId;
  const selectNonce = selection?.nonce ?? 0;

  const [displayMode, setDisplayModeState] = useState<ReviewDisplayMode>(readReviewDisplayMode);

  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<ReviewDisplayMode>).detail;
      if (mode === "rail" || mode === "inline") setDisplayModeState(mode);
    };
    window.addEventListener(REVIEW_DISPLAY_MODE_EVENT, handler);
    return () => window.removeEventListener(REVIEW_DISPLAY_MODE_EVENT, handler);
  }, []);

  const listKey = useMemo(() => commentsKey(contentRef), [commentsKey, contentRef]);

  // Mark-read is optimistic: clear the thread's unread badge in the cached list
  // immediately (so the dot disappears on open), snapshot for rollback if the
  // RPC fails, and invalidate on settle so the next fetch confirms. Owning the
  // optimistic update in the mutation lifecycle (rather than the click handler)
  // gives us the onError rollback a bare mutate() would skip.
  const seen = useMutation(markThreadSeen, {
    onMutate: async ({ threadRootId }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<typeof data>(listKey);
      queryClient.setQueryData(listKey, (old: typeof data | undefined) => {
        if (!old) return old;
        const clear = (t: Thread): Thread =>
          t.root?.id === threadRootId ? { ...t, hasUnread: false, unreadCount: 0 } : t;
        return {
          ...old,
          threads: old.threads.map(clear),
          orphanedThreads: old.orphanedThreads.map(clear),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
    },
    onSettled: () => void invalidateComments(contentRef),
  });

  // Live updates (Phase 4B): subscribe to the SSE hint channel and invalidate
  // the shared listComments cache when a matching ref changes, so other
  // reviewers' comments appear within ~1s rather than a poll interval. This is
  // an invalidation hint only — the unary query stays the data source. EventSource
  // auto-reconnects, and the slow poll interval above is the backstop if the
  // stream is dropped/evicted. Off unless VITE_REVIEW_SSE is set.
  useEffect(() => {
    if (!sseEnabled || !reviewActive) return;
    const url = new URL("/events/comments", baseUrl);
    // Full ref identity in the subscription so the server can scope the stream;
    // area:slug alone collides across areas/projects sharing a slug.
    url.searchParams.set(
      "ref",
      `${contentRef.area}:${contentRef.slug}:${contentRef.project ?? ""}:${contentRef.bucket ?? ""}`,
    );
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener("invalidate", (e) => {
      // Only invalidate when the changed ref matches this page's content across
      // ALL identity fields — not slug alone — so a same-slug page in another
      // area/project doesn't cross-invalidate. Any field the payload omits is
      // treated as matching (defensive), and a malformed payload falls through
      // to invalidate rather than silently drop a live update.
      try {
        const changed = JSON.parse((e as MessageEvent).data) as {
          area?: number;
          slug?: string;
          project?: string;
          bucket?: string;
        };
        const mismatch =
          (changed.area != null && changed.area !== contentRef.area) ||
          (changed.slug != null && changed.slug !== contentRef.slug) ||
          (changed.project != null && changed.project !== (contentRef.project ?? "")) ||
          (changed.bucket != null && changed.bucket !== (contentRef.bucket ?? ""));
        if (mismatch) return;
      } catch {
        // Malformed payload — fall through and invalidate defensively.
      }
      void invalidateComments(contentRef);
    });
    return () => es.close();
    // Re-subscribe on ANY ref-identity change (refKey covers all four fields),
    // not just area/slug — otherwise a project/bucket change leaves a stale sub.
  }, [reviewActive, contentRef, refKey(contentRef), invalidateComments]);

  const selectThread = useCallback(
    (id: string | null) => {
      setSelection((prev) => (id === null ? null : { id, nonce: (prev?.nonce ?? 0) + 1 }));
      if (id === null || !reviewActive) return;
      // Mark read on open; the mutation's onMutate owns the optimistic unread
      // clear + rollback (see the markThreadSeen useMutation above).
      seen.mutate({ threadRootId: id });
    },
    [reviewActive, seen],
  );
  const hoverThread = useCallback((id: string | null) => setHoveredThreadId(id), []);
  // Invalidate the shared listComments cache entry so every mounted consumer
  // (rail, inline, code boxes) refreshes after a local mutation — not just this
  // provider's own query instance. invalidateQueries already refetches the
  // active query, so we do NOT also call the local refetch() (double fetch).
  const refetchCb = useCallback(
    () => void invalidateComments(contentRef),
    [invalidateComments, contentRef],
  );

  const setDisplayMode = useCallback((mode: ReviewDisplayMode) => {
    setDisplayModeState(mode);
    setReviewDisplayMode(mode);
  }, []);

  const allThreads = useMemo(
    () => [...threads, ...orphanedThreads],
    [threads, orphanedThreads],
  );

  const threadById = useCallback(
    (id: string) => allThreads.find((t) => t.root?.id === id),
    [allThreads],
  );

  const openCount =
    threads.filter((t) => !t.resolved).length + orphanedThreads.filter((t) => !t.resolved).length;

  const codeLinesFor = useCallback(
    (path: string, region: string): CommentedLines[] => {
      const out: CommentedLines[] = [];
      for (const t of threads) {
        const c = t.root?.codeSelector;
        if (!c?.path || c.path !== path) continue;
        if (region && c.region && c.region !== region) continue;
        if (!t.root?.id) continue;
        out.push({
          line: c.line,
          endLine: c.endLine && c.endLine >= c.line ? c.endLine : c.line,
          threadId: t.root.id,
          focused: t.root.id === activeThreadId,
        });
      }
      return out;
    },
    [threads, activeThreadId],
  );

  const value = useMemo<ReviewContextValue>(
    () => ({
      contentRef,
      threads,
      orphanedThreads,
      openCount,
      refetch: refetchCb,
      activeThreadId,
      selectedThreadId,
      selectNonce,
      hoverThread,
      selectThread,
      threadById,
      displayMode,
      setDisplayMode,
      codeLinesFor,
    }),
    [
      contentRef,
      threads,
      orphanedThreads,
      openCount,
      refetchCb,
      activeThreadId,
      selectedThreadId,
      selectNonce,
      hoverThread,
      selectThread,
      threadById,
      displayMode,
      setDisplayMode,
      codeLinesFor,
    ],
  );

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

export function useReview(): ReviewContextValue {
  return useContext(ReviewContext);
}
