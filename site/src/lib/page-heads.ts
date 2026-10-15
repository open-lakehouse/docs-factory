// The build emits `dist/page-heads.json`: each docs page's `<head>` exactly as
// its docs site emits it (emit/docs/heads.mjs docPageHead), for the review
// workspace's Head tab. Under `vite dev` the plugin in vite.config.ts serves it
// fresh on every request and tells the client when content changes.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Mirrors pageHead() in content-core/head.mjs. */
export interface PageHead {
  title: string;
  description: string;
  canonical: string | null;
  twin: string | null;
  og: [string, string][];
  twitter: [string, string][];
  jsonLd: Record<string, unknown>;
}

export interface PageHeadEntry {
  /** The docs site that emits the page, e.g. `unitycatalog-docs`. */
  site: string;
  /** `status: ready`; a draft only appears in a `--drafts` preview. */
  published: boolean;
  /** Where the description came from: frontmatter `summary`, or the first paragraph. */
  descriptionSource: "summary" | "body";
  head: PageHead;
}

/** Keyed by `<project>/<bucket>/<slug>`. */
export type PageHeads = Record<string, PageHeadEntry>;

/**
 * The projects with a docs site. Must match the projects in
 * emit/docs/sites/index.mjs DOCS_SITES (page-heads.test.ts checks it); kept as a
 * constant so the tab list can be computed before page-heads.json loads.
 */
export const HEAD_PROJECTS: readonly string[] = ["unitycatalog", "delta"];

/** Whether a docs page gets a head: a project with a site, emitted by a `--drafts` emit. */
export function hasPageHead(project: string | undefined, status: string | undefined): boolean {
  const s = status ?? "draft";
  return !!project && HEAD_PROJECTS.includes(project) && (s === "draft" || s === "ready");
}

export function pageHeadKey(project: string, bucket: string, slug: string): string {
  return `${project}/${bucket}/${slug}`;
}

const QUERY_KEY = ["page-heads"];

async function fetchPageHeads(): Promise<PageHeads> {
  const res = await fetch("/page-heads.json");
  if (!res.ok) return {};
  try {
    return (await res.json()) as PageHeads;
  } catch {
    return {}; // the SPA's index.html, when a bare build has no artifact
  }
}

export function usePageHeads(): { heads: PageHeads; isLoading: boolean } {
  const client = useQueryClient();
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const refresh = () => client.invalidateQueries({ queryKey: QUERY_KEY });
    hot.on("docs-factory:page-heads", refresh);
    return () => hot.off("docs-factory:page-heads", refresh);
  }, [client]);
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPageHeads,
    staleTime: Infinity,
  });
  return { heads: data ?? {}, isLoading };
}
