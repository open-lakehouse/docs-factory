/**
 * Build the Starlight sidebar from each project's content/<project>/_meta.yaml.
 *
 * _meta.yaml is portable nav *data* the content repo owns (label, bucket order,
 * per-bucket page order). We translate it into Starlight's sidebar config here,
 * so ordering lives with the content and this preview merely renders it. Pages
 * not listed in _meta.yaml still resolve; they just fall to the end of a group.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = join(here, "..", "..", "content");

/** Slugs Starlight derives from file paths are relative to content/, lowercased. */
function itemLink(project, bucket, slug) {
  return `${project}/${bucket}/${slug}`;
}

function loadMeta(project) {
  const metaPath = join(CONTENT_ROOT, project, "_meta.yaml");
  if (!existsSync(metaPath)) return null;
  return yaml.load(readFileSync(metaPath, "utf8"));
}

/** All markdown slugs actually present in a bucket, minus README. */
function bucketSlugs(project, bucket) {
  const dir = join(CONTENT_ROOT, project, bucket);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .map((f) => f.replace(/\.md$/, ""));
}

/** Order declared slugs first (in _meta order), then any extras alphabetically. */
function orderedSlugs(declared, present) {
  const seen = new Set();
  const out = [];
  for (const slug of declared ?? []) {
    if (present.includes(slug) && !seen.has(slug)) {
      out.push(slug);
      seen.add(slug);
    }
  }
  for (const slug of present.sort()) {
    if (!seen.has(slug)) out.push(slug);
  }
  return out;
}

function projectGroup(project) {
  const meta = loadMeta(project);
  if (!meta) return null;
  const bucketOrder = meta.order ?? [
    "explanation",
    "tutorials",
    "how-to",
    "reference",
  ];
  const sections = meta.sections ?? {};

  const groups = [];
  for (const bucket of bucketOrder) {
    const present = bucketSlugs(project, bucket);
    if (present.length === 0) continue; // skip empty buckets (.keep stubs)
    const sectionMeta = sections[bucket] ?? {};
    const slugs = orderedSlugs(sectionMeta.order, present);
    groups.push({
      label: sectionMeta.label ?? bucket,
      items: slugs.map((slug) => itemLink(project, bucket, slug)),
    });
  }

  return { label: meta.label ?? project, items: groups };
}

/** The full sidebar: one top-level group per project that has content. */
export function buildSidebar(projects = ["delta", "unitycatalog"]) {
  return projects.map(projectGroup).filter(Boolean);
}
