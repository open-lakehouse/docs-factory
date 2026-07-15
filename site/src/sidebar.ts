/**
 * Build docs navigation from each project's content/<project>/_meta.yaml.
 * Mirrors the former Astro sidebar.mjs — ordering lives with the content.
 * Projects without _meta.yaml get a synthesized nav from discovered pages.
 */
import yaml from "js-yaml";

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
};

const metaModules = import.meta.glob("../../content/*/_meta.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const docPaths = Object.keys(
  import.meta.glob("../../content/{delta,unitycatalog}/**/*.{md,mdx}", {
    eager: true,
  }),
);

const docTitleModules = import.meta.glob<MdxModule>(
  "../../content/{delta,unitycatalog}/**/*.{md,mdx}",
  { eager: true },
);

function slugFromPath(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  return name.replace(/\.mdx?$/, "");
}

function bucketFromPath(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 2] ?? "";
}

function projectFromPath(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 3] ?? "";
}

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
    const project = projectFromPath(p);
    const slug = slugFromPath(p);
    if (slug.toLowerCase() !== "readme") projects.add(project);
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

/** Full docs sidebar tree — one entry per project with docs. */
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

/** Flat reading order for prev/next pager. */
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

/** First doc page for a project (for product cards). */
export function firstDocForProject(project: string): DocNavItem | undefined {
  const group = docNav.find((g) => g.project === project);
  return group?.buckets[0]?.items[0];
}
