/**
 * Build docs navigation from the content tree. Nav order is encoded two ways,
 * both derivable at build time:
 *   - Bucket order (Explanation → Tutorials → How-to → Reference) is fixed by
 *     `DEFAULT_BUCKET_ORDER`; the buckets themselves are the on-disk folders,
 *     which map 1:1 to the Diátaxis sections.
 *   - Within a bucket, docs sort by their on-disk name, which carries a numeric
 *     `NNN-` prefix (e.g. `001-first-server.md`). The prefix is auto-stripped
 *     from the slug/URL in content-source.ts, so the filename orders the doc
 *     while the route stays clean — no `slug:` needed (see content-source.ts /
 *     content.ts).
 * Project and section display labels are closed sets, so they live as the
 * `PROJECT_LABELS` / `BUCKET_LABELS` constants below rather than in content.
 *
 * A project may also ship a curated `content/<project>/nav.yml` (resolved by
 * content-core/nav.mjs). It only re-arranges links to the same docs, and it
 * applies when that project's scope is active; the unscoped view keeps the
 * Diátaxis grouping above as the full content index.
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
import yaml from "js-yaml";
import { useMemo } from "react";
import { findDoc } from "./content";
import { primaryPlacements, resolveNav } from "./content-core/nav.mjs";
import {
  bucketFromPath,
  orderKeyFromPath,
  projectFromPath,
  slugFromPath,
} from "./lib/content-source";
import { type ContentVisibility, useContentVisibility } from "./lib/content-visibility";
import { getScope, isRealScope } from "./scope";

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

interface MdxModule {
  frontmatter?: { title?: string; slug?: string };
}

const DEFAULT_BUCKET_ORDER = ["explanation", "tutorials", "how-to", "reference"];

export const PROJECT_LABELS: Record<string, string> = {
  delta: "Delta Lake",
  unitycatalog: "Unity Catalog",
  "open-lakehouse": "Open Lakehouse",
};

// The Diátaxis buckets are a closed set (one folder each), so their sidebar
// headings live here rather than in content. Unknown buckets fall back to the
// raw folder name.
const BUCKET_LABELS: Record<string, string> = {
  explanation: "Explanation",
  tutorials: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
};

const docTitleModules = import.meta.glob<MdxModule>(
  "../../content/{delta,unitycatalog,open-lakehouse}/**/*.{md,mdx}",
  { eager: true },
);

interface DiscoveredDoc {
  project: string;
  bucket: string;
  slug: string;
  /** On-disk leaf name (with the `NNN-` order prefix), used only to sort docs
   * within a bucket. The URL uses `slug`; this keeps ordering off the URL. */
  sortKey: string;
  title: string;
}

/**
 * Every doc discovered at build time as {project, bucket, slug, title}. Derived
 * from the same modules — and with the same folder-mode + `slug:` frontmatter
 * override rules — as content.ts, so the sidebar's slugs match the hrefs and
 * `findDoc` keys exactly. Path parsing alone can't see the frontmatter override,
 * so we resolve it here where the frontmatter is in hand. The path slug (prefix
 * intact) is kept as `sortKey` so filenames still drive within-bucket order.
 */
const discoveredDocs: DiscoveredDoc[] = Object.entries(docTitleModules)
  .filter(([path]) => !path.endsWith("/README.md"))
  .map(([path, mod]) => {
    const project = projectFromPath(path);
    const bucket = bucketFromPath(path);
    const pathSlug = slugFromPath(path); // prefix already stripped
    const fmSlug = mod.frontmatter?.slug;
    const slug = typeof fmSlug === "string" && fmSlug ? fmSlug : pathSlug;
    return {
      project,
      bucket,
      slug,
      sortKey: orderKeyFromPath(path), // prefixed on-disk name, drives order
      title: mod.frontmatter?.title ?? slug.replace(/-/g, " "),
    };
  });

/** Docs in a bucket, ordered by their on-disk name (the `NNN-` prefix), READMEs
 * excluded. The prefix is the sole ordering signal; ties fall back to slug. */
function orderedDocs(project: string, bucket: string): DiscoveredDoc[] {
  return discoveredDocs
    .filter(
      (d) => d.project === project && d.bucket === bucket && d.slug.toLowerCase() !== "readme",
    )
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.slug.localeCompare(b.slug));
}

function allProjectsWithDocs(): string[] {
  const projects = new Set<string>();
  for (const d of discoveredDocs) {
    if (d.slug.toLowerCase() !== "readme") projects.add(d.project);
  }
  return [...projects].sort();
}

function buildGroup(project: string): DocNavGroup | null {
  const buckets = [];

  for (const bucket of DEFAULT_BUCKET_ORDER) {
    const docs = orderedDocs(project, bucket);
    if (docs.length === 0) continue;
    buckets.push({
      label: BUCKET_LABELS[bucket] ?? bucket,
      bucket,
      items: docs.map((d) => ({
        project,
        bucket,
        slug: d.slug,
        label: d.title,
        href: `/docs/${project}/${bucket}/${d.slug}`,
      })),
    });
  }

  if (buckets.length === 0) return null;

  return {
    project,
    projectLabel: PROJECT_LABELS[project] ?? project,
    buckets,
  };
}

export function buildDocNav(): DocNavGroup[] {
  const groups: DocNavGroup[] = [];
  for (const project of allProjectsWithDocs()) {
    const group = buildGroup(project);
    if (group) groups.push(group);
  }
  return groups.sort((a, b) => a.project.localeCompare(b.project));
}

export const docNav = buildDocNav();

export const docSequence: DocNavItem[] = docNav.flatMap((g) => g.buckets.flatMap((b) => b.items));

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

/**
 * `docNav` narrowed to the active site scope: only nav groups whose project
 * belongs to the scope survive (`open-lakehouse`/unknown → all groups). This is
 * a project-keyed filter — a `DocNavGroup` is keyed by `project`, not a
 * `ContentPage`, so the richer model-ref predicate (`inScope`) doesn't apply
 * here; there is exactly one project per scope today. `keepProject` pins a
 * group in place even when it's out of scope, so the doc a reader is currently
 * on never drops out of its own sidebar under a mismatched `?scope=`.
 */
export function filterDocNavByScope(
  groups: DocNavGroup[],
  scopeId: string | null | undefined,
  keepProject?: string,
): DocNavGroup[] {
  if (!isRealScope(scopeId)) return groups;
  const scope = getScope(scopeId);
  if (!scope) return groups;
  return groups.filter((g) => scope.projects.includes(g.project) || g.project === keepProject);
}

/** Viewer- AND scope-aware `docNav`, composed on top of `useVisibleDocNav` so
 * the visibility rule stays single-sourced. */
export function useScopedDocNav(
  scopeId: string,
  keepProject?: string,
): { nav: DocNavGroup[]; isLoading: boolean } {
  const { nav, isLoading } = useVisibleDocNav();
  const scoped = useMemo(
    () => filterDocNavByScope(nav, scopeId, keepProject),
    [nav, scopeId, keepProject],
  );
  return { nav: scoped, isLoading };
}

/** Viewer-aware prev/next: neighbors are computed over the visible sequence, so
 * anonymous viewers never page into an unpublished doc. Under a manifest scope
 * the sequence is the manifest's primary placements, in nav order. */
export function useDocNeighbors(
  href: string,
  scopeId?: string,
): {
  prev?: DocNavItem;
  next?: DocNavItem;
  isLoading: boolean;
} {
  const { nav, isLoading } = useVisibleDocNav();
  const manifest = useManifestNav(scopeId);
  const neighbors = useMemo(() => {
    const sequence = manifest
      ? primaryPlacements(manifest.tree).map((p) => (p.node as NavPageNode).item)
      : nav.flatMap((g) => g.buckets.flatMap((b) => b.items));
    const idx = sequence.findIndex((item) => item.href === href);
    if (idx < 0) return {};
    return {
      prev: idx > 0 ? sequence[idx - 1] : undefined,
      next: idx < sequence.length - 1 ? sequence[idx + 1] : undefined,
    };
  }, [nav, manifest, href]);
  return { ...neighbors, isLoading };
}

/** Viewer-aware homepage product-card target: the first doc a viewer may open
 * for a project (undefined while loading or when the project has none visible). */
export function useFirstVisibleDocForProject(project: string): DocNavItem | undefined {
  const { nav } = useVisibleDocNav();
  const group = nav.find((g) => g.project === project);
  return group?.buckets[0]?.items[0];
}

// ── Curated manifests (content/<project>/nav.yml) ─────────────────────────

export interface NavSectionNode {
  kind: "section";
  label: string;
  children: NavNode[];
}
export interface NavPageNode {
  kind: "page";
  item: DocNavItem;
  /** Backlog id from the UC documentation plan, when the manifest gives one. */
  id?: string;
  /** First occurrence of this page; breadcrumbs and prev/next follow it. */
  primary: boolean;
}
export interface NavPlannedNode {
  kind: "planned";
  id: string;
  title: string;
}
export type NavNode = NavSectionNode | NavPageNode | NavPlannedNode;

interface ResolvedEntry {
  kind: "section" | "page" | "planned";
  label?: string;
  children?: ResolvedEntry[];
  bucket?: string;
  slug?: string;
  id?: string;
  title?: string;
  primary?: boolean;
}

const navManifests = import.meta.glob<string>("../../content/*/nav.yml", {
  query: "?raw",
  import: "default",
  eager: true,
});

function toNavNodes(project: string, entries: ResolvedEntry[]): NavNode[] {
  return entries.map((e): NavNode => {
    if (e.kind === "section") {
      return {
        kind: "section",
        label: e.label ?? "",
        children: toNavNodes(project, e.children ?? []),
      };
    }
    if (e.kind === "planned") return { kind: "planned", id: e.id ?? "", title: e.title ?? "" };
    const bucket = e.bucket ?? "";
    const slug = e.slug ?? "";
    return {
      kind: "page",
      item: {
        project,
        bucket,
        slug,
        label: e.label ?? slug,
        href: `/docs/${project}/${bucket}/${slug}`,
      },
      ...(e.id ? { id: e.id } : {}),
      primary: e.primary ?? false,
    };
  });
}

/** Resolved manifest tree per project that ships a nav.yml. */
export const projectNav: Record<string, NavNode[]> = Object.fromEntries(
  Object.entries(navManifests).map(([path, raw]) => {
    const project = path.split("/").at(-2) ?? "";
    const docs = discoveredDocs
      .filter((d) => d.project === project && d.slug.toLowerCase() !== "readme")
      .map((d) => ({ bucket: d.bucket, slug: d.slug, title: d.title }));
    const { tree, errors } = resolveNav(yaml.load(raw), docs);
    // check-nav.mjs fails the build on these; at runtime we can only surface them.
    for (const e of errors) console.error(`content/${project}/nav.yml: ${e}`);
    return [project, toNavNodes(project, tree as ResolvedEntry[])];
  }),
);

/** The project whose manifest drives navigation under `scopeId`, if any. */
export function manifestProjectForScope(scopeId: string | null | undefined): string | undefined {
  if (!isRealScope(scopeId)) return undefined;
  const projects = getScope(scopeId)?.projects ?? [];
  return projects.length === 1 && projectNav[projects[0]] ? projects[0] : undefined;
}

/** A manifest tree narrowed to this viewer: hidden docs drop out, planned entries
 * are reviewer-only, and sections left empty are pruned. */
export function filterNavTree(nodes: NavNode[], vis: ContentVisibility): NavNode[] {
  return nodes.flatMap((node): NavNode[] => {
    if (node.kind === "planned") return vis.isAllowlisted ? [node] : [];
    if (node.kind === "page") return navItemVisible(node.item, vis) ? [node] : [];
    const children = filterNavTree(node.children, vis);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

/** Viewer-filtered manifest tree for the active scope, or null when the scope
 * has no manifest (callers fall back to the Diátaxis `docNav`). */
export function useManifestNav(
  scopeId: string | null | undefined,
): { project: string; tree: NavNode[]; isLoading: boolean } | null {
  const vis = useContentVisibility();
  const project = manifestProjectForScope(scopeId);
  return useMemo(
    () =>
      project
        ? { project, tree: filterNavTree(projectNav[project], vis), isLoading: vis.isLoading }
        : null,
    [project, vis],
  );
}

/** Where a doc sits in a manifest tree: its primary placement's section trail
 * and the pages sharing that section. */
export function navPlacement(
  tree: NavNode[],
  href: string,
): { trail: string[]; siblings: DocNavItem[] } | undefined {
  const visit = (
    nodes: NavNode[],
    trail: string[],
  ): { trail: string[]; siblings: DocNavItem[] } | undefined => {
    for (const node of nodes) {
      if (node.kind === "page" && node.primary && node.item.href === href) {
        const siblings = nodes
          .filter((n): n is NavPageNode => n.kind === "page")
          .map((n) => n.item);
        return { trail, siblings };
      }
      if (node.kind === "section") {
        const found = visit(node.children, [...trail, node.label]);
        if (found) return found;
      }
    }
    return undefined;
  };
  return visit(tree, []);
}
