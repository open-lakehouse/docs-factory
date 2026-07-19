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
import {
  useQuery,
  useMutation,
  createConnectQueryKey,
  useTransport,
} from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  listComments,
  markThreadSeen,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef, Thread } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
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
  const { isAllowlisted } = useAuth();
  const transport = useTransport();
  const queryClient = useQueryClient();
  // Poll so a reviewer sees other reviewers' comments arrive without a reload.
  // Gated on being allowlisted; TanStack pauses the interval while the tab is
  // hidden and refetches on window focus, so background tabs don't hammer the
  // API. A modest interval keeps the rail live without a push channel (SSE is a
  // later, on-demand upgrade — see the plan).
  const { data, refetch } = useQuery(
    listComments,
    { ref: contentRef },
    {
      enabled: isAllowlisted,
      refetchInterval: isAllowlisted ? 15_000 : false,
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

  const seen = useMutation(markThreadSeen);
  const listKey = useMemo(
    () =>
      createConnectQueryKey({
        schema: listComments,
        transport,
        input: { ref: contentRef },
        cardinality: "finite",
      }),
    [transport, contentRef],
  );

  const selectThread = useCallback(
    (id: string | null) => {
      setSelection((prev) => (id === null ? null : { id, nonce: (prev?.nonce ?? 0) + 1 }));
      if (id === null || !isAllowlisted) return;
      // Mark read on open. Optimistically clear the thread's unread badge in the
      // cached list so the dot disappears immediately; the next poll confirms.
      queryClient.setQueryData(listKey, (old: typeof data | undefined) => {
        if (!old) return old;
        const clear = (t: Thread): Thread =>
          t.root?.id === id ? { ...t, hasUnread: false, unreadCount: 0 } : t;
        return {
          ...old,
          threads: old.threads.map(clear),
          orphanedThreads: old.orphanedThreads.map(clear),
        };
      });
      seen.mutate({ threadRootId: id });
    },
    [isAllowlisted, queryClient, listKey, seen, data],
  );
  const hoverThread = useCallback((id: string | null) => setHoveredThreadId(id), []);
  // Invalidate the shared listComments cache entry so every mounted consumer
  // (rail, inline, code boxes) refreshes after a local mutation — not just this
  // provider's own query instance. Falls back to the local refetch.
  const refetchCb = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: listComments,
        transport,
        input: { ref: contentRef },
        cardinality: "finite",
      }),
    });
    void refetch();
  }, [queryClient, transport, contentRef, refetch]);

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
