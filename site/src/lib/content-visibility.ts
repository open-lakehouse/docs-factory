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
//   • Anonymous (non-allowlisted) viewers: the visible set IS the `listDrafts`
//     result. A build-time page is shown only when the server returned a draft
//     row for its ref. No status columns — anon just needs the list.
//   • Allowlisted viewers (reviewer/maintainer): every page is visible, and each
//     row shows two separate columns — the git frontmatter status and the DB
//     review state (looked up from `listDrafts`, defaulting to NONE).
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
  const { isAllowlisted, isLoading: authLoading } = useAuth();
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

  return useMemo(() => {
    const summaryFor = (page: ContentPage) => byRef.get(refKey(pageRef(page)));

    const isVisible = (page: ContentPage) =>
      // Allowlisted viewers see everything; anonymous viewers see a page only
      // when the server returned a (published) draft row for it.
      isAllowlisted || byRef.has(refKey(pageRef(page)));

    return {
      isLoading: authLoading || draftsLoading,
      isAllowlisted,
      showStatusColumns: isAllowlisted,
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
  }, [byRef, isAllowlisted, authLoading, draftsLoading]);
}
