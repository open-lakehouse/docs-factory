// tags.ts — resolve blog topic tags to registry metadata.
//
// Source of truth is blogs/tags.yml. Posts carry plain `tags: [...]` slugs;
// here we look them up and attach descriptions, optional model element anchors,
// and curated external references for hover cards and filtered navigation.
import yaml from "js-yaml";
import tagsRaw from "../../blogs/tags.yml?raw";
import { resolveRef } from "./model-refs";
import type { EntityCardData, ExternalRef } from "./components/EntityCard";

export interface TagEntry {
  slug: string;
  description: string;
  element?: string;
  externalRefs?: ExternalRef[];
  known: boolean;
}

interface RawTagEntry {
  description: string;
  element?: string;
  externalRefs?: ExternalRef[];
}

const registry: TagEntry[] = Object.entries(
  (yaml.load(tagsRaw) as Record<string, RawTagEntry>) ?? {},
).map(([slug, raw]) => ({
  slug,
  description: raw.description ?? "",
  element: raw.element,
  externalRefs: raw.externalRefs,
  known: true,
}));

const bySlug = new Map(registry.map((t) => [t.slug, t]));

/** Resolve a tag slug to its registry entry (or a name-only fallback). */
export function getTag(slug: string): TagEntry {
  const key = slug.trim();
  const found = bySlug.get(key);
  if (found) return found;
  return {
    slug: key,
    description: "",
    known: false,
  };
}

/** Human label for display (slug with hyphens as spaces, title-cased). */
export function tagLabel(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** Build hover-card data for a blog topic tag. */
export function tagCardData(slug: string): EntityCardData {
  const tag = getTag(slug);
  const model = tag.element ? resolveRef(tag.element) : null;

  return {
    title: model?.title ?? tagLabel(slug),
    kindLabel: model?.kindLabel ?? (tag.known ? "Topic" : undefined),
    summary: model?.summary || tag.description,
    href: model?.href ?? `/blog?tag=${encodeURIComponent(slug)}`,
    externalUrl: model?.externalUrl,
    externalRefs: tag.externalRefs,
  };
}
