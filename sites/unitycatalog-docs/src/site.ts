// Typed access to what the emitter writes into src/generated/ and src/content/.
// The globs tolerate a not-yet-emitted checkout (empty site, no pages) so the
// shell still typechecks and boots before the first emit.
import type { MDXContent } from "mdx/types";
import { useEffect, useState } from "react";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface PageLink {
  route: string;
  title: string;
}

export interface PageMeta {
  route: string;
  /** Path under src/content/, e.g. `how-to/duckdb.md`. */
  file: string;
  title: string;
  summary: string | null;
  diataxis: string;
  /** Nav section labels from the root down to the page's section. */
  section: string[];
  headings: Heading[];
  prev: PageLink | null;
  next: PageLink | null;
  /** The page's Markdown twin (route + `.md`). */
  twin: string;
}

export type NavItem =
  | { kind: "page"; route: string; label: string }
  | { kind: "section"; label: string; items: NavItem[] };

export interface SiteData {
  title: string;
  tagline: string;
  nav: NavItem[];
  pages: PageMeta[];
}

const EMPTY: SiteData = { title: "Unity Catalog", tagline: "", nav: [], pages: [] };

const data = import.meta.glob<SiteData>("./generated/site.json", {
  eager: true,
  import: "default",
});
export const site: SiteData = data["./generated/site.json"] ?? EMPTY;

// One chunk per page. Prerender and first hydration load the route's module up
// front (preloadRoute), so the synchronous render below always finds it there;
// later client navigations load it on demand (useContent).
const loaders = import.meta.glob<MDXContent>("./content/**/*.md", { import: "default" });
const loaded = new Map<string, MDXContent>();

async function load(file: string): Promise<MDXContent | undefined> {
  const cached = loaded.get(file);
  if (cached) return cached;
  const loader = loaders[`./content/${file}`];
  if (!loader) return undefined;
  const content = await loader();
  loaded.set(file, content);
  return content;
}

/** Load the content module for `route` (if it is a page) before rendering it. */
export async function preloadRoute(route: string): Promise<void> {
  const page = site.pages.find((p) => p.route === route.replace(/\/+$/, ""));
  if (page) await load(page.file);
}

export function useContent(page: PageMeta): MDXContent | undefined {
  const [content, setContent] = useState(() => loaded.get(page.file));
  useEffect(() => {
    let alive = true;
    const cached = loaded.get(page.file);
    if (cached) setContent(() => cached);
    else
      void load(page.file).then((c) => {
        if (alive) setContent(() => c);
      });
    return () => {
      alive = false;
    };
  }, [page.file]);
  return content ?? loaded.get(page.file);
}
