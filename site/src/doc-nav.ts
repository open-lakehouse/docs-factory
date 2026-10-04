/**
 * The docs half of the review workspace tree, built from the content tree.
 * Nav order is encoded two ways, both derivable at build time:
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
 * `docNav` lists EVERY doc, drafts included; the workspace narrows it per viewer
 * (see tree-model.ts). A project's curated `nav.yml` drives the emitted site's
 * navigation, not this tree.
 */
import {
  bucketFromPath,
  orderKeyFromPath,
  projectFromPath,
  slugFromPath,
} from "./lib/content-source";

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
