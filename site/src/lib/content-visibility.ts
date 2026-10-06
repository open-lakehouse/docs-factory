// Which content the current viewer may open in the workspace. Reviewers see every
// build-time page. An invited contributor sees only the rows `listDrafts`
// returns for them: the server already narrows those to their scoped grants
// (plus anything released), so the client never re-derives the rule.
//
// Keying is by ContentRef (area + slug + project + bucket), the same identity
// the review UI uses everywhere (see review-queries.sameRef / refKey).

import { useQuery } from "@connectrpc/connect-query";
import { useMemo } from "react";
import type { ContentRef } from "../gen/docs_factory/review/v1/messages_pb";
import { listDrafts } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "./auth-context";
import { refKey } from "./review-queries";

export interface ContentVisibility {
  /** Still resolving the viewer or the drafts list. */
  isLoading: boolean;
  isVisible: (ref: ContentRef) => boolean;
}

export function useContentVisibility(): ContentVisibility {
  const { isAllowlisted, apiOffline, isLoading: authLoading } = useAuth();
  const { data, isLoading: draftsLoading } = useQuery(
    listDrafts,
    {},
    { enabled: !apiOffline && !isAllowlisted },
  );

  const visible = useMemo(() => {
    const set = new Set<string>();
    for (const d of data?.drafts ?? []) if (d.ref) set.add(refKey(d.ref));
    return set;
  }, [data]);

  return useMemo(
    () => ({
      isLoading: authLoading || (!isAllowlisted && draftsLoading),
      isVisible: (ref: ContentRef) => isAllowlisted || visible.has(refKey(ref)),
    }),
    [visible, isAllowlisted, authLoading, draftsLoading],
  );
}
