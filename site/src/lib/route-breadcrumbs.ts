import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { BreadcrumbItemData, BreadcrumbSibling } from "../components/layout/Breadcrumbs";
import { blogPosts, findBlog, findDoc } from "../content";
import { getExplainElement, explainHref } from "../explain";
import { docNav } from "../sidebar";

/** Top-level site areas — the first path segment after ~/open-lakehouse. */
export const SITE_SECTIONS: BreadcrumbSibling[] = [
  { label: "docs", href: "/docs" },
  { label: "blog", href: "/blog" },
  { label: "concepts", href: "/concepts" },
  { label: "explain", href: "/explain" },
];

const SECTION_HREF = new Map(SITE_SECTIONS.map((s) => [s.label, s.href]));

function enrichSectionCrumb(items: BreadcrumbItemData[]): BreadcrumbItemData[] {
  if (items.length === 0) return items;
  const first = items[0];
  const sectionHref = SECTION_HREF.get(first.label);
  if (!sectionHref) return items;
  return [
    {
      ...first,
      href: first.href ?? sectionHref,
      siblings: SITE_SECTIONS,
      activeHref: sectionHref,
    },
    ...items.slice(1),
  ];
}

/** Derive global topbar breadcrumbs from the current route. */
export function resolveRouteBreadcrumbs(
  pathname: string,
  params: Record<string, string | undefined>,
): BreadcrumbItemData[] {
  let items: BreadcrumbItemData[] = [];

  if (pathname === "/") {
    items = [];
  } else if (pathname === "/blog") {
    items = [{ label: "blog" }];
  } else if (pathname.startsWith("/blog/")) {
    const slug = params.slug ?? "";
    const page = findBlog(slug);
    if (!page) {
      items = [{ label: "blog", href: "/blog" }, { label: slug }];
    } else {
      const { frontmatter } = page;
      const siblingPosts = frontmatter.series
        ? blogPosts.filter((p) => p.frontmatter.series === frontmatter.series)
        : blogPosts.filter((p) => !p.frontmatter.series);

      items = [
        { label: "blog", href: "/blog" },
        {
          label: slug,
          siblings: siblingPosts.map((p) => ({
            label: p.frontmatter.title ?? p.slug,
            href: p.href,
          })),
          activeHref: page.href,
        },
      ];
    }
  } else if (pathname === "/docs") {
    items = [{ label: "docs" }];
  } else if (pathname.startsWith("/docs/")) {
    const project = params.project ?? "";
    const bucket = params.bucket ?? "";
    const slug = params.slug ?? "";
    const page = findDoc(project, bucket, slug);

    const group = docNav.find((g) => g.project === project);
    const activeBucket = group?.buckets.find((b) => b.bucket === bucket);
    const projectSiblings = docNav
      .map((g) => ({ label: g.projectLabel, href: g.buckets[0]?.items[0]?.href }))
      .filter((s): s is { label: string; href: string } => Boolean(s.href));
    const projectActiveHref = group?.buckets[0]?.items[0]?.href;
    const bucketSiblings =
      group?.buckets
        .map((b) => ({ label: b.label, href: b.items[0]?.href }))
        .filter((s): s is { label: string; href: string } => Boolean(s.href)) ?? [];
    const bucketActiveHref = activeBucket?.items[0]?.href;
    const pageSiblings =
      activeBucket?.items.map((it) => ({ label: it.label, href: it.href })) ?? [];

    if (!page) {
      items = [
        { label: "docs", href: "/docs" },
        { label: project },
        { label: bucket },
        { label: slug },
      ];
    } else {
      items = [
        { label: "docs", href: "/docs" },
        {
          label: project,
          href: "/docs",
          siblings: projectSiblings,
          activeHref: projectActiveHref,
        },
        {
          label: bucket,
          siblings: bucketSiblings,
          activeHref: bucketActiveHref,
        },
        {
          label: slug,
          siblings: pageSiblings,
          activeHref: page.href,
        },
      ];
    }
  } else if (pathname === "/concepts") {
    items = [{ label: "concepts" }];
  } else if (pathname === "/explain") {
    items = [{ label: "explain" }];
  } else if (pathname.startsWith("/explain/")) {
    const elementId = params.elementId ?? "";
    const el = getExplainElement(elementId);
    if (!el) {
      items = [{ label: "explain", href: "/explain" }, { label: elementId }];
    } else {
      items = [
        { label: "explain", href: "/explain" },
        { label: elementId, activeHref: explainHref(elementId) },
      ];
    }
  }

  return enrichSectionCrumb(items);
}

export function useRouteBreadcrumbs(): BreadcrumbItemData[] {
  const { pathname } = useLocation();
  const params = useParams();
  return useMemo(() => resolveRouteBreadcrumbs(pathname, params), [pathname, params]);
}
