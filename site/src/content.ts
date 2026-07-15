// content.ts — discover builder-agnostic sources and expose them to the app.
//
// THROWAWAY LENS. Reads content in place via import.meta.glob; nothing is copied
// and no source file is ever edited. Two areas today:
//   blogs/  — narrative posts (blogs/*/draft.md)
//   docs/   — Diátaxis reference content (content/<project>/<bucket>/*.{md,mdx})

import type { ComponentType } from "react";

/** Shared YAML front matter — every field optional; the content owns the contract. */
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
  [key: string]: unknown;
}

export interface ContentPage {
  /** Content area: "blogs" or "docs". */
  area: "blogs" | "docs";
  /** Folder slug for blogs; page slug for docs. */
  slug: string;
  /** Docs-only routing segments. */
  project?: string;
  bucket?: string;
  /** Parsed front matter from the YAML block. */
  frontmatter: Frontmatter;
  /** Compiled MDX/MD component. */
  Component: ComponentType;
  /** Route path for react-router. */
  href: string;
}

interface MdxModule {
  default: ComponentType;
  frontmatter?: Frontmatter;
}

const blogModules = import.meta.glob<MdxModule>("../../blogs/*/draft.md", {
  eager: true,
});

const docModules = import.meta.glob<MdxModule>(
  "../../content/{delta,unitycatalog}/**/*.{md,mdx}",
  { eager: true },
);

function slugFromBlogPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] ?? path;
}

function parseDocPath(path: string): { project: string; bucket: string; slug: string } {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] ?? "";
  return {
    project: parts[parts.length - 3] ?? "",
    bucket: parts[parts.length - 2] ?? "",
    slug: filename.replace(/\.mdx?$/, ""),
  };
}

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

/** All discovered pages, sorted by area then slug. */
export const pages: ContentPage[] = [...blogPages, ...docPages].sort((a, b) => {
  if (a.area !== b.area) return a.area.localeCompare(b.area);
  if (a.project !== b.project) return (a.project ?? "").localeCompare(b.project ?? "");
  if (a.bucket !== b.bucket) return (a.bucket ?? "").localeCompare(b.bucket ?? "");
  return a.slug.localeCompare(b.slug);
});

export const blogPosts = blogPages.sort(
  (a, b) => (b.frontmatter.date ?? "").localeCompare(a.frontmatter.date ?? "") || a.slug.localeCompare(b.slug),
);

export const docs = docPages;

export function findBlog(slug: string): ContentPage | undefined {
  return blogPages.find((p) => p.slug === slug);
}

export function findDoc(project: string, bucket: string, slug: string): ContentPage | undefined {
  return docPages.find((p) => p.project === project && p.bucket === bucket && p.slug === slug);
}
