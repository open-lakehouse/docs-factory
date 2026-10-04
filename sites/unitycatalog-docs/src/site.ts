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

export interface PageScript {
  /** Served path of the runnable file. */
  url: string;
  file: string;
  kind: "python" | "shell";
  summary: string | null;
}

/** The stack a page's scripts need, from envs/environments.yml. */
export interface PageEnvironment {
  title: string;
  /** Served path of the env bundle (.tar.gz). */
  bundle: string;
  /** Download, start, and export lines, as the Prerequisites box shows them. */
  commands: string[];
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
  environment: PageEnvironment | null;
  scripts: PageScript[];
}

/** A REST API reference: the shell renders `specUrl` in the browser. */
export interface ApiSpec {
  route: string;
  slug: string;
  title: string;
  summary: string;
  /** The git ref the spec is pinned to, e.g. `v0.6.0`. */
  ref: string;
  specUrl: string;
  sourceUrl: string;
  /** Overrides the spec's own `servers` in the code samples. */
  serverUrl: string | null;
  /** The one API the section opens on. */
  default: boolean;
}

export type NavItem =
  | { kind: "page"; route: string; label: string }
  | { kind: "section"; label: string; items: NavItem[] };

export interface SiteData {
  title: string;
  tagline: string;
  nav: NavItem[];
  pages: PageMeta[];
  apis: ApiSpec[];
  /** The API section's own route; it shows the default API. */
  apiIndex: string | null;
}

const EMPTY: SiteData = {
  title: "Unity Catalog",
  tagline: "",
  nav: [],
  pages: [],
  apis: [],
  apiIndex: null,
};

const data = import.meta.glob<SiteData>("./generated/site.json", {
  eager: true,
  import: "default",
});
export const site: SiteData = data["./generated/site.json"] ?? EMPTY;

export const defaultApi: ApiSpec | undefined = site.apis.find((a) => a.default) ?? site.apis[0];

/** The API a route shows: its own, or the default for the section route. */
export function apiFor(pathname: string): ApiSpec | undefined {
  if (pathname === site.apiIndex) return defaultApi;
  return site.apis.find((a) => a.route === pathname);
}

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
