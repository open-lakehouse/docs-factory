// content.ts — discover builder-agnostic sources and expose them to the app.
import type { ComponentType } from "react";
import {
  parseDocPath,
  slugFromBlogPath,
} from "./lib/content-source";

export interface Frontmatter {
  title?: string;
  slug?: string;
  status?: string;
  date?: string;
  tags?: string[];
  series?: string;
  series_order?: number;
  author?: string;
  target?: string;
  diataxis?: string;
  project?: string;
  summary?: string;
  references?: string[];
  engines?: string[];
  [key: string]: unknown;
}

export interface ContentPage {
  area: "blogs" | "docs";
  slug: string;
  project?: string;
  bucket?: string;
  frontmatter: Frontmatter;
  Component: ComponentType;
  href: string;
}

interface MdxModule {
  default: ComponentType;
  frontmatter?: Frontmatter;
}

const blogModules = import.meta.glob<MdxModule>("../../blogs/*/draft.md", { eager: true });
const docModules = import.meta.glob<MdxModule>(
  "../../content/{delta,unitycatalog}/**/*.{md,mdx}",
  { eager: true },
);

const blogPages: ContentPage[] = Object.entries(blogModules).map(([path, mod]) => {
  const slug = slugFromBlogPath(path);
  return {
    area: "blogs",
    slug,
    frontmatter: mod.frontmatter ?? {},
    Component: mod.default,
    href: `/blog/${slug}`,
  };
});

const docPages: ContentPage[] = Object.entries(docModules)
  .filter(([path]) => !path.endsWith("/README.md"))
  .map(([path, mod]) => {
    const { project, bucket, slug } = parseDocPath(path);
    return {
      area: "docs",
      slug,
      project,
      bucket,
      frontmatter: mod.frontmatter ?? {},
      Component: mod.default,
      href: `/docs/${project}/${bucket}/${slug}`,
    };
  });

export const pages: ContentPage[] = [...blogPages, ...docPages].sort((a, b) => {
  if (a.area !== b.area) return a.area.localeCompare(b.area);
  if (a.project !== b.project) return (a.project ?? "").localeCompare(b.project ?? "");
  if (a.bucket !== b.bucket) return (a.bucket ?? "").localeCompare(b.bucket ?? "");
  return a.slug.localeCompare(b.slug);
});

export const blogPosts = [...blogPages].sort(
  (a, b) =>
    (b.frontmatter.date ?? "").localeCompare(a.frontmatter.date ?? "") ||
    a.slug.localeCompare(b.slug),
);

export const docs = docPages;

export function findBlog(slug: string): ContentPage | undefined {
  return blogPages.find((p) => p.slug === slug);
}

export function findDoc(project: string, bucket: string, slug: string): ContentPage | undefined {
  return docPages.find((p) => p.project === project && p.bucket === bucket && p.slug === slug);
}

export interface BlogSeriesGroup {
  series: string;
  posts: ContentPage[];
}

export function blogsBySeries(): { series: BlogSeriesGroup[]; standalone: ContentPage[] } {
  const seriesMap = new Map<string, ContentPage[]>();
  const standalone: ContentPage[] = [];

  for (const post of blogPosts) {
    const series = post.frontmatter.series;
    if (series) {
      const list = seriesMap.get(series) ?? [];
      list.push(post);
      seriesMap.set(series, list);
    } else {
      standalone.push(post);
    }
  }

  const series: BlogSeriesGroup[] = [...seriesMap.entries()]
    .map(([name, posts]) => ({
      series: name,
      posts: [...posts].sort(
        (a, b) =>
          (a.frontmatter.series_order ?? 0) - (b.frontmatter.series_order ?? 0) ||
          (b.frontmatter.date ?? "").localeCompare(a.frontmatter.date ?? ""),
      ),
    }))
    .sort((a, b) => a.series.localeCompare(b.series));

  return { series, standalone };
}

export function blogTags(): string[] {
  const tags = new Set<string>();
  for (const post of blogPosts) {
    for (const tag of post.frontmatter.tags ?? []) tags.add(tag);
  }
  return [...tags].sort();
}

export function blogsByTag(tag: string): ContentPage[] {
  const slug = tag.trim();
  if (!slug) return blogPosts;
  return blogPosts.filter((post) => (post.frontmatter.tags ?? []).includes(slug));
}

/** Posts carrying ALL of the given tags (AND semantics). Empty = all posts. */
export function blogsByTags(tags: string[]): ContentPage[] {
  const slugs = tags.map((t) => t.trim()).filter(Boolean);
  if (slugs.length === 0) return blogPosts;
  return blogPosts.filter((post) => {
    const postTags = post.frontmatter.tags ?? [];
    return slugs.every((slug) => postTags.includes(slug));
  });
}

export function blogsBySeriesFiltered(
  posts: ContentPage[],
): { series: BlogSeriesGroup[]; standalone: ContentPage[] } {
  const seriesMap = new Map<string, ContentPage[]>();
  const standalone: ContentPage[] = [];

  for (const post of posts) {
    const series = post.frontmatter.series;
    if (series) {
      const list = seriesMap.get(series) ?? [];
      list.push(post);
      seriesMap.set(series, list);
    } else {
      standalone.push(post);
    }
  }

  const series: BlogSeriesGroup[] = [...seriesMap.entries()]
    .map(([name, grouped]) => ({
      series: name,
      posts: [...grouped].sort(
        (a, b) =>
          (a.frontmatter.series_order ?? 0) - (b.frontmatter.series_order ?? 0) ||
          (b.frontmatter.date ?? "").localeCompare(a.frontmatter.date ?? ""),
      ),
    }))
    .sort((a, b) => a.series.localeCompare(b.series));

  return { series, standalone };
}

export function blogNeighbors(slug: string): { prev?: ContentPage; next?: ContentPage } {
  const idx = blogPosts.findIndex((p) => p.slug === slug);
  if (idx < 0) return {};
  return {
    prev: idx < blogPosts.length - 1 ? blogPosts[idx + 1] : undefined,
    next: idx > 0 ? blogPosts[idx - 1] : undefined,
  };
}

export function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
