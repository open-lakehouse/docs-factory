import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { BreadcrumbItemData, BreadcrumbSibling } from "../components/layout/Breadcrumbs";
import { blogPosts, findBlog, findDoc } from "../content";
import { getExplainElement, explainHref } from "../explain";
import { docNav } from "../sidebar";
import { withScope } from "../scope";

/**
 * Top-level site areas — the first path segment after the `~/<scope>` root.
 * The five content axes: four Diátaxis + blog.
 */
export const SITE_SECTIONS: BreadcrumbSibling[] = [
  { label: "tutorials", href: "/tutorials" },
  { label: "how-to", href: "/how-to" },
  { label: "reference", href: "/reference" },
  { label: "explanation", href: "/explanation" },
  { label: "blog", href: "/blog" },
];

const SECTION_HREF = new Map(SITE_SECTIONS.map((s) => [s.label, s.href]));

/** Directory bucket (plural) → the Diátaxis axis route it lives under. */
const BUCKET_TO_AXIS: Record<string, string> = {
  explanation: "/explanation",
  tutorials: "/tutorials",
  "how-to": "/how-to",
  reference: "/reference",
};

function enrichSectionCrumb(
  items: BreadcrumbItemData[],
  scopeParam: string | null,
): BreadcrumbItemData[] {
  if (items.length === 0) return items;
  const first = items[0];
  const sectionHref = SECTION_HREF.get(first.label);
  if (!sectionHref) return items;
  // Preserve the active scope on every section sibling + the active link.
  const siblings = SITE_SECTIONS.map((s) => ({
    label: s.label,
    href: withScope(s.href, scopeParam),
  }));
  return [
    {
      ...first,
      href: withScope(first.href ?? sectionHref, scopeParam),
      siblings,
      activeHref: withScope(sectionHref, scopeParam),
    },
    ...items.slice(1),
  ];
}

/** Derive global topbar breadcrumbs from the current route. */
export function resolveRouteBreadcrumbs(
  pathname: string,
  params: Record<string, string | undefined>,
  scopeParam: string | null = null,
): BreadcrumbItemData[] {
  let items: BreadcrumbItemData[] = [];

  const AXIS_PATHS = new Set(["/tutorials", "/how-to", "/reference", "/explanation"]);

  if (pathname === "/") {
    items = [];
  } else if (AXIS_PATHS.has(pathname)) {
    items = [{ label: pathname.slice(1) }];
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
  } else if (pathname.startsWith("/docs/")) {
    // Doc detail pages live under /docs/:project/:bucket/:slug. There is no
    // /docs index anymore — the first crumb is the Diátaxis axis the doc's
    // bucket maps to.
    const project = params.project ?? "";
    const bucket = params.bucket ?? "";
    const slug = params.slug ?? "";
    const page = findDoc(project, bucket, slug);
    const axisHref = BUCKET_TO_AXIS[bucket] ?? "/reference";
    const axisLabel = axisHref.slice(1);

    const group = docNav.find((g) => g.project === project);
    const activeBucket = group?.buckets.find((b) => b.bucket === bucket);
    const projectSiblings = docNav
      .map((g) => ({ label: g.projectLabel, href: g.buckets[0]?.items[0]?.href }))
      .filter((s): s is { label: string; href: string } => Boolean(s.href));
    const projectActiveHref = group?.buckets[0]?.items[0]?.href;
    const pageSiblings =
      activeBucket?.items.map((it) => ({ label: it.label, href: it.href })) ?? [];

    if (!page) {
      items = [
        { label: axisLabel, href: axisHref },
        { label: project },
        { label: slug },
      ];
    } else {
      items = [
        { label: axisLabel, href: axisHref },
        {
          label: project,
          siblings: projectSiblings,
          activeHref: projectActiveHref,
        },
        {
          label: slug,
          siblings: pageSiblings,
          activeHref: page.href,
        },
      ];
    }
  } else if (pathname.startsWith("/explain/")) {
    // Model explanation entries are reached from the /explanation axis.
    const elementId = params.elementId ?? "";
    const el = getExplainElement(elementId);
    if (!el) {
      items = [{ label: "explanation", href: "/explanation" }, { label: elementId }];
    } else {
      items = [
        { label: "explanation", href: "/explanation" },
        { label: el.title, activeHref: explainHref(elementId) },
      ];
    }
  }

  return enrichSectionCrumb(items, scopeParam);
}

export function useRouteBreadcrumbs(): BreadcrumbItemData[] {
  const { pathname, search } = useLocation();
  const params = useParams();
  const scopeParam = new URLSearchParams(search).get("scope");
  return useMemo(
    () => resolveRouteBreadcrumbs(pathname, params, scopeParam),
    [pathname, params, scopeParam],
  );
}
