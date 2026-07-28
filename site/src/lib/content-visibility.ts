// Reconciles the build-time content list (`pages`, which carries only git
// frontmatter — title, href, author, and the author-intent `status`) with the
// DB-canonical review lifecycle exposed by the review API's `listDrafts` RPC,
// then answers two viewer-dependent questions the index/overview tables need:
//
//   1. Is a page VISIBLE to the current viewer?
//   2. What STATUS should its row show (and should the status columns appear)?
//
// Publication is DB-canonical: `listDrafts` already encodes the visibility rule
// (a page is public only when its frontmatter is `ready` AND its review state is
// `released`) and returns only the rows the viewer may see. So:
//
//   • Anonymous (non-allowlisted) viewers: the visible set IS the published
//     subset. A build-time page is shown only when a published draft row exists
//     for its ref. No status columns — anon just needs the list.
//   • Allowlisted viewers (reviewer/maintainer): every page is visible, and each
//     row shows two separate columns — the git frontmatter status and the DB
//     review state (looked up from `listDrafts`, defaulting to NONE).
//
// "View as anonymous" (previewAsAnon) makes an allowlisted viewer see the
// anonymous set instead — a purely client-side preview. It cannot just reuse the
// anon "a row exists" test, because for an allowlisted caller the server returns
// EVERY row, not just the published ones. So we compute a `publishedRefs` set
// (frontmatterStatus === "ready" AND published) and use it for the anon branch:
// that predicate is identical whether the rows came from a real anon response
// (all already published) or an allowlisted response filtered here — one path,
// correct for both. Mirrors the server rule in services/review.ts.
//
// Keying is by ContentRef (area + slug + project + bucket), the same identity
// the review UI uses everywhere (see review-queries.sameRef / refKey).
import { useMemo } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { listDrafts } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import {
  ReviewState,
  type ContentRef,
  type DraftSummary,
} from "../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "./auth-context";
import { blogRef, docRef } from "./content-ref";
import { refKey } from "./review-queries";
import type { ContentPage } from "../content";

// The frontmatter status that gates publication, mirroring READY_STATUS in the
// server (services/review.ts). A page is publicly visible only when its git
// frontmatter is "ready" AND its content_revops row is published.
const READY_STATUS = "ready";

/** The ContentRef identity for a build-time page (blog vs doc). */
export function pageRef(page: ContentPage): ContentRef {
  return page.area === "blogs"
    ? blogRef(page.slug)
    : docRef(page.project ?? "", page.bucket ?? "", page.slug);
}

export interface PageStatus {
  /** Git frontmatter authoring intent (e.g. "draft" / "ready"), or "" if unset. */
  frontmatter: string;
  /** DB review lifecycle state; NONE when the page has no review activity yet. */
  reviewState: ReviewState;
}

export interface ContentVisibility {
  /** Still resolving the viewer or the drafts list. */
  isLoading: boolean;
  /** Reviewer/maintainer: sees every page and the status columns. */
  isAllowlisted: boolean;
  /** Whether the index tables should render the two status columns. */
  showStatusColumns: boolean;
  /** True if `page` should appear in an overview table for this viewer. */
  isVisible: (page: ContentPage) => boolean;
  /** Narrow a list of pages to those visible to this viewer. */
  filterVisible: <T extends ContentPage>(pages: T[]) => T[];
  /** The frontmatter + review status to display for `page`. */
  statusFor: (page: ContentPage) => PageStatus;
}

export function useContentVisibility(): ContentVisibility {
  const { isAllowlisted, previewAsAnon, isLoading: authLoading } = useAuth();
  // An allowlisted viewer previewing as anonymous is treated as non-allowlisted
  // for VISIBILITY purposes — content narrows to the published set, status
  // columns disappear — even though the API still returned their full data.
  const effectiveAllowlisted = isAllowlisted && !previewAsAnon;
  // listDrafts is already role-filtered server-side, so anonymous viewers get
  // exactly the published set and allowlisted viewers get everything. Fetch it
  // for all viewers — anon needs it to know WHAT is visible; reviewers need it
  // for the review-state column.
  const { data, isLoading: draftsLoading } = useQuery(listDrafts, {});

  const byRef = useMemo(() => {
    const map = new Map<string, DraftSummary>();
    for (const d of data?.drafts ?? []) {
      if (d.ref) map.set(refKey(d.ref), d);
    }
    return map;
  }, [data]);

  // The refs that are publicly visible: frontmatter "ready" AND published. This
  // is the anonymous-visible set regardless of who fetched the rows — so it is
  // correct both for a real anonymous caller (the server already filtered to
  // these) and for an allowlisted caller previewing as anonymous (we filter the
  // full set down here). Mirrors the server's `frontmatter_status = 'ready' AND
  // published` clause in services/review.ts.
  const publishedRefs = useMemo(() => {
    const set = new Set<string>();
    for (const d of data?.drafts ?? []) {
      if (d.ref && d.frontmatterStatus === READY_STATUS && d.published) {
        set.add(refKey(d.ref));
      }
    }
    return set;
  }, [data]);

  return useMemo(() => {
    const summaryFor = (page: ContentPage) => byRef.get(refKey(pageRef(page)));

    const isVisible = (page: ContentPage) =>
      // Allowlisted viewers see everything; anonymous viewers (and allowlisted
      // viewers previewing as anonymous) see a page only when a published draft
      // row exists for its ref.
      effectiveAllowlisted || publishedRefs.has(refKey(pageRef(page)));

    return {
      isLoading: authLoading || draftsLoading,
      isAllowlisted: effectiveAllowlisted,
      showStatusColumns: effectiveAllowlisted,
      isVisible,
      filterVisible: <T extends ContentPage>(pages: T[]) => pages.filter(isVisible),
      statusFor: (page: ContentPage): PageStatus => {
        const summary = summaryFor(page);
        return {
          frontmatter: summary?.frontmatterStatus || page.frontmatter.status || "",
          reviewState: summary?.reviewState ?? ReviewState.NONE,
        };
      },
    };
  }, [byRef, publishedRefs, effectiveAllowlisted, authLoading, draftsLoading]);
}
