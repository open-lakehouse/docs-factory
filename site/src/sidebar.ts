/**
 * Build docs navigation from each project's content/<project>/_meta.yaml.
 * Mirrors the former Astro sidebar.mjs — ordering lives with the content.
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

/** Full docs sidebar tree, one entry per project that has _meta.yaml. */
export function buildDocNav(): DocNavGroup[] {
  const groups: DocNavGroup[] = [];

  for (const [path, raw] of Object.entries(metaModules)) {
    const project = path.split("/").slice(-2, -1)[0] ?? "";
    const meta = yaml.load(raw) as MetaYaml;
    const bucketOrder = meta.order ?? ["explanation", "tutorials", "how-to", "reference"];
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
          label: slug.replace(/-/g, " "),
          href: `/docs/${project}/${bucket}/${slug}`,
        })),
      });
    }

    if (buckets.length > 0) {
      groups.push({
        project,
        projectLabel: meta.label ?? project,
        buckets,
      });
    }
  }

  return groups;
}

export const docNav = buildDocNav();
