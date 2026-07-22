/**
 * Build docs navigation from each project's content/<project>/_meta.yaml.
 *
 * The nav structure (`docNav`, `docSequence`, and the derived neighbor/first-doc
 * lookups) is a build-time constant listing EVERY doc, drafts included. That's
 * the right source for allowlisted viewers, but anonymous viewers must see only
 * published docs — the same DB-canonical rule the overview surfaces obey (see
 * lib/content-visibility.ts, PR #41). Rather than bake visibility into the
 * constant (it's viewer-dependent and resolves async), we keep the full build
 * structure here and expose viewer-aware hooks that filter it at render time:
 * `useVisibleDocNav`, `useDocNeighbors`, `useFirstVisibleDocForProject`.
 */
import { useMemo } from "react";
import yaml from "js-yaml";
import {
  bucketFromPath,
  docPaths,
  projectFromPath,
  slugFromPath,
} from "./lib/content-source";
import { findDoc } from "./content";
import {
  useContentVisibility,
  type ContentVisibility,
} from "./lib/content-visibility";

export interface DocNavItem {
  project: string;
  bucket: string;
  slug: string;
  label: string;
  href: string;
}

export interface DocNavGroup {
  project: string;
  projectLabel: string;
  buckets: {
    label: string;
    bucket: string;
    items: DocNavItem[];
  }[];
}

interface MetaYaml {
  label?: string;
  order?: string[];
  sections?: Record<string, { label?: string; order?: string[] }>;
}

interface MdxModule {
  frontmatter?: { title?: string };
}

const DEFAULT_BUCKET_ORDER = ["explanation", "tutorials", "how-to", "reference"];

const PROJECT_LABELS: Record<string, string> = {
  delta: "Delta Lake",
  unitycatalog: "Unity Catalog",
  "open-lakehouse": "Open Lakehouse",
};

const metaModules = import.meta.glob("../../content/*/_meta.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const docTitleModules = import.meta.glob<MdxModule>(
  "../../content/{delta,unitycatalog,open-lakehouse}/**/*.{md,mdx}",
  { eager: true },
);

function titleForDoc(project: string, bucket: string, slug: string): string {
  for (const [path, mod] of Object.entries(docTitleModules)) {
    if (
      projectFromPath(path) === project &&
      bucketFromPath(path) === bucket &&
      slugFromPath(path) === slug
    ) {
      return mod.frontmatter?.title ?? slug.replace(/-/g, " ");
    }
  }
  return slug.replace(/-/g, " ");
}

function orderedSlugs(declared: string[] | undefined, present: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of declared ?? []) {
    if (present.includes(slug) && !seen.has(slug)) {
      out.push(slug);
      seen.add(slug);
    }
  }
  for (const slug of [...present].sort()) {
    if (!seen.has(slug)) out.push(slug);
  }
  return out;
}

function presentSlugs(project: string, bucket: string): string[] {
  return docPaths
    .filter((p) => projectFromPath(p) === project && bucketFromPath(p) === bucket)
    .map(slugFromPath)
    .filter((s) => s.toLowerCase() !== "readme");
}

function allProjectsWithDocs(): string[] {
  const projects = new Set<string>();
  for (const p of docPaths) {
    const slug = slugFromPath(p);
    if (slug.toLowerCase() !== "readme") projects.add(projectFromPath(p));
  }
  return [...projects].sort();
}

function buildGroupFromMeta(project: string, meta: MetaYaml): DocNavGroup | null {
  const bucketOrder = meta.order ?? DEFAULT_BUCKET_ORDER;
  const sections = meta.sections ?? {};
  const buckets = [];

  for (const bucket of bucketOrder) {
    const present = presentSlugs(project, bucket);
    if (present.length === 0) continue;
    const sectionMeta = sections[bucket] ?? {};
    const slugs = orderedSlugs(sectionMeta.order, present);
    buckets.push({
      label: sectionMeta.label ?? bucket,
      bucket,
      items: slugs.map((slug) => ({
        project,
        bucket,
        slug,
        label: titleForDoc(project, bucket, slug),
        href: `/docs/${project}/${bucket}/${slug}`,
      })),
    });
  }

  if (buckets.length === 0) return null;

  return {
    project,
    projectLabel: meta.label ?? PROJECT_LABELS[project] ?? project,
    buckets,
  };
}

function buildFallbackGroup(project: string): DocNavGroup | null {
  return buildGroupFromMeta(project, {
    label: PROJECT_LABELS[project] ?? project,
    order: DEFAULT_BUCKET_ORDER,
  });
}

export function buildDocNav(): DocNavGroup[] {
  const groups: DocNavGroup[] = [];
  const covered = new Set<string>();

  for (const [path, raw] of Object.entries(metaModules)) {
    const project = path.split("/").slice(-2, -1)[0] ?? "";
    const meta = yaml.load(raw) as MetaYaml;
    const group = buildGroupFromMeta(project, meta);
    if (group) {
      groups.push(group);
      covered.add(project);
    }
  }

  for (const project of allProjectsWithDocs()) {
    if (covered.has(project)) continue;
    const group = buildFallbackGroup(project);
    if (group) groups.push(group);
  }

  return groups.sort((a, b) => a.project.localeCompare(b.project));
}

export const docNav = buildDocNav();

export const docSequence: DocNavItem[] = docNav.flatMap((g) =>
  g.buckets.flatMap((b) => b.items),
);

export function docNeighbors(href: string): { prev?: DocNavItem; next?: DocNavItem } {
  const idx = docSequence.findIndex((item) => item.href === href);
  if (idx < 0) return {};
  return {
    prev: idx > 0 ? docSequence[idx - 1] : undefined,
    next: idx < docSequence.length - 1 ? docSequence[idx + 1] : undefined,
  };
}

export function firstDocForProject(project: string): DocNavItem | undefined {
  const group = docNav.find((g) => g.project === project);
  return group?.buckets[0]?.items[0];
}

// ── Viewer-aware accessors ────────────────────────────────────────────────
// The build-time structure above lists every doc; these narrow it to what the
// current viewer may see, joining each nav item back to its ContentPage so the
// shared visibility rule (lib/content-visibility.ts) applies. Allowlisted
// viewers keep the full structure unchanged.

/** True when the doc behind a nav item is visible to this viewer. */
function navItemVisible(item: DocNavItem, vis: ContentVisibility): boolean {
  const page = findDoc(item.project, item.bucket, item.slug);
  // A nav item with no matching ContentPage shouldn't happen (both derive from
  // the same doc glob), but if it did we hide it from anonymous viewers rather
  // than leak an un-checkable link.
  return page ? vis.isVisible(page) : vis.isAllowlisted;
}

/** `docNav` narrowed to the current viewer: buckets/sections with no visible
 * items are dropped so the sidebar never shows an empty group. */
export function filterDocNav(groups: DocNavGroup[], vis: ContentVisibility): DocNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      buckets: group.buckets
        .map((bucket) => ({
          ...bucket,
          items: bucket.items.filter((item) => navItemVisible(item, vis)),
        }))
        .filter((bucket) => bucket.items.length > 0),
    }))
    .filter((group) => group.buckets.length > 0);
}

/** Viewer-aware `docNav` for the sidebar and homepage cards. */
export function useVisibleDocNav(): { nav: DocNavGroup[]; isLoading: boolean } {
  const vis = useContentVisibility();
  const nav = useMemo(() => filterDocNav(docNav, vis), [vis]);
  return { nav, isLoading: vis.isLoading };
}

/** Viewer-aware prev/next: neighbors are computed over the visible sequence, so
 * anonymous viewers never page into an unpublished doc. */
export function useDocNeighbors(href: string): {
  prev?: DocNavItem;
  next?: DocNavItem;
  isLoading: boolean;
} {
  const { nav, isLoading } = useVisibleDocNav();
  const neighbors = useMemo(() => {
    const sequence = nav.flatMap((g) => g.buckets.flatMap((b) => b.items));
    const idx = sequence.findIndex((item) => item.href === href);
    if (idx < 0) return {};
    return {
      prev: idx > 0 ? sequence[idx - 1] : undefined,
      next: idx < sequence.length - 1 ? sequence[idx + 1] : undefined,
    };
  }, [nav, href]);
  return { ...neighbors, isLoading };
}

/** Viewer-aware homepage product-card target: the first doc a viewer may open
 * for a project (undefined while loading or when the project has none visible). */
export function useFirstVisibleDocForProject(project: string): DocNavItem | undefined {
  const { nav } = useVisibleDocNav();
  const group = nav.find((g) => g.project === project);
  return group?.buckets[0]?.items[0];
}
