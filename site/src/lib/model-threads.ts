// Open review threads per model target, from the recent-comments window over
// the MODEL area: enough to badge the nav, the view list, and the inspector
// without a list-comments call per element.
import { useQuery } from "@connectrpc/connect-query";
import { useMemo } from "react";
import { ContentArea } from "../gen/docs_factory/review/v1/messages_pb";
import { listRecentComments } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "./auth-context";

export interface TargetThreads {
  open: number;
  unread: boolean;
}

/** `{ bySlug, open }`: open root threads per MODEL slug, and across the model. */
export function useModelThreadStats(): { bySlug: Map<string, TargetThreads>; open: number } {
  const { isAllowlisted } = useAuth();
  const { data } = useQuery(
    listRecentComments,
    { area: ContentArea.MODEL, limit: 100 },
    { enabled: isAllowlisted, refetchInterval: 60_000, refetchIntervalInBackground: false },
  );
  return useMemo(() => {
    const bySlug = new Map<string, TargetThreads>();
    let open = 0;
    for (const rc of data?.comments ?? []) {
      const slug = rc.ref?.slug;
      if (!slug) continue;
      const stats = bySlug.get(slug) ?? { open: 0, unread: false };
      // A root that isn't resolved is one open thread; replies only add unread.
      if (!rc.comment?.parentId && !rc.resolved) {
        stats.open += 1;
        open += 1;
      }
      if (rc.unread && !rc.resolved) stats.unread = true;
      bySlug.set(slug, stats);
    }
    return { bySlug, open };
  }, [data]);
}
