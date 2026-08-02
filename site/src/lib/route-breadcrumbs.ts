import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { BreadcrumbItemData, BreadcrumbSibling } from "../components/layout/Breadcrumbs";
import { blogPosts, findBlog, findDoc } from "../content";
import { withScope } from "../scope";
import { type DocNavGroup, docNav, useVisibleDocNav } from "../sidebar";

/**
 * Top-level site areas — the first path segment after the `~/<scope>` root.
 * Two content areas: a single Docs page (all four Diátaxis axes) + blog.
 */
export const SITE_SECTIONS: BreadcrumbSibling[] = [
  { label: "docs", href: "/docs" },
  { label: "blog", href: "/blog" },
];

const SECTION_HREF = new Map(SITE_SECTIONS.map((s) => [s.label, s.href]));

/** Directory bucket (plural) → the anchor of its Diátaxis section on /docs.
 * Doc-detail breadcrumbs deep-link to the right section of the single Docs
 * page (matches the `id`s AxisSection renders in DocsIndex). */
const BUCKET_TO_AXIS_ANCHOR: Record<string, string> = {
  explanation: "/docs#explanation",
  tutorials: "/docs#tutorial",
  "how-to": "/docs#how-to",
  reference: "/docs#reference",
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

/** Derive global topbar breadcrumbs from the current route. The doc-sibling
 * dropdowns are built from `nav`, which callers pass viewer-filtered so an
 * anonymous viewer never sees draft docs listed as siblings; it defaults to the
 * full build-time `docNav` for non-viewer callers (tests, SSR fallbacks). */
export function resolveRouteBreadcrumbs(
  pathname: string,
  params: Record<string, string | undefined>,
  scopeParam: string | null = null,
  nav: DocNavGroup[] = docNav,
): BreadcrumbItemData[] {
  let items: BreadcrumbItemData[] = [];

  if (pathname === "/") {
    items = [];
  } else if (pathname === "/docs") {
    items = [{ label: "docs" }];
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
    // Doc detail pages live under /docs/:project/:bucket/:slug. The first crumb
    // is the single Docs page, deep-linked to the section for this doc's bucket.
    const project = params.project ?? "";
    const bucket = params.bucket ?? "";
    const slug = params.slug ?? "";
    const page = findDoc(project, bucket, slug);
    const docsHref = BUCKET_TO_AXIS_ANCHOR[bucket] ?? "/docs";

    const group = nav.find((g) => g.project === project);
    const activeBucket = group?.buckets.find((b) => b.bucket === bucket);
    const projectSiblings = nav
      .map((g) => ({ label: g.projectLabel, href: g.buckets[0]?.items[0]?.href }))
      .filter((s): s is { label: string; href: string } => Boolean(s.href));
    const projectActiveHref = group?.buckets[0]?.items[0]?.href;
    const pageSiblings =
      activeBucket?.items.map((it) => ({ label: it.label, href: it.href })) ?? [];

    if (!page) {
      items = [{ label: "docs", href: docsHref }, { label: project }, { label: slug }];
    } else {
      items = [
        { label: "docs", href: docsHref },
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
  }

  return enrichSectionCrumb(items, scopeParam);
}

export function useRouteBreadcrumbs(): BreadcrumbItemData[] {
  const { pathname, search } = useLocation();
  const params = useParams();
  const scopeParam = new URLSearchParams(search).get("scope");
  // Viewer-filtered nav so the breadcrumb sibling dropdowns match the sidebar:
  // anonymous viewers see only published docs as project/page siblings.
  const { nav } = useVisibleDocNav();
  return useMemo(
    () => resolveRouteBreadcrumbs(pathname, params, scopeParam, nav),
    [pathname, params, scopeParam, nav],
  );
}
