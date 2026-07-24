// Shared review query-cache helpers. Centralizes the connect-query key
// construction and cache invalidation for the review service so mutations own
// their own refresh (via onSuccess) rather than every call site threading an
// onChange/refetch callback up the tree. Also owns the canonical ContentRef
// identity comparison used by both the SSE hint filter and ReviewControls.
import { useCallback } from "react";
import { createConnectQueryKey, useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  listComments,
  listDrafts,
  listReviewRequests,
  listContentEvents,
} from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef } from "../gen/docs_factory/review/v1/messages_pb";

/** Full ContentRef identity: area + slug + project + bucket (bucket/project optional). */
export function sameRef(a: ContentRef, b: ContentRef): boolean {
  return (
    a.area === b.area &&
    a.slug === b.slug &&
    (a.project ?? "") === (b.project ?? "") &&
    (a.bucket ?? "") === (b.bucket ?? "")
  );
}

/** Stable string identity for a ContentRef — use as a dep or map key. */
export function refKey(ref: ContentRef): string {
  return `${ref.area}\0${ref.slug}\0${ref.project ?? ""}\0${ref.bucket ?? ""}`;
}

/**
 * Cache helpers scoped to the review service. Mutations call these in their
 * onSuccess/onSettled so every mounted consumer (rail, inline, code boxes)
 * refreshes from one place, instead of a per-component refetch(). Invalidating
 * an active query already triggers its refetch, so callers must NOT also call
 * the local refetch() (that would double-fetch).
 */
export function useReviewInvalidation() {
  const transport = useTransport();
  const queryClient = useQueryClient();

  const commentsKey = useCallback(
    (ref: ContentRef) =>
      createConnectQueryKey({
        schema: listComments,
        transport,
        input: { ref },
        cardinality: "finite",
      }),
    [transport],
  );

  const invalidateComments = useCallback(
    (ref: ContentRef) =>
      queryClient.invalidateQueries({ queryKey: commentsKey(ref) }),
    [queryClient, commentsKey],
  );

  const invalidateDrafts = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listDrafts,
          transport,
          cardinality: "finite",
        }),
      }),
    [queryClient, transport],
  );

  // Invalidate every listReviewRequests query (all scopes: mine/by_me/per-ref),
  // so an accepted/created/cancelled request refreshes the dashboard and the
  // per-artifact request list. Partial key match covers all input variants.
  const invalidateReviewRequests = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listReviewRequests,
          transport,
          cardinality: "finite",
        }),
      }),
    [queryClient, transport],
  );

  const invalidateContentEvents = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listContentEvents,
          transport,
          cardinality: "finite",
        }),
      }),
    [queryClient, transport],
  );

  return {
    commentsKey,
    invalidateComments,
    invalidateDrafts,
    invalidateReviewRequests,
    invalidateContentEvents,
    queryClient,
  };
}
