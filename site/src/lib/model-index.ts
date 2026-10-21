// The Model section's build artifacts (scripts/model-index.mjs): what the docs
// pipeline derives from each model element, and each docs site's concepts.json.
// Under `vite dev` the plugin in vite.config.ts serves both fresh and tells the
// client when content, environments, or the model export change.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export interface PageLink {
  area: "docs" | "blogs";
  project?: string;
  bucket?: string;
  slug: string;
  title: string;
  status: string;
}

export interface ElementJourney {
  project: string;
  id: string;
  title: string;
  /** `asset`: the journey acts on this element; `interface`: this element runs it. */
  role: "asset" | "interface";
  interface: string | null;
  /** A cell's status, or `k/n tested` across interfaces for an asset. */
  status: string;
}

export interface VerifiedEdge {
  project: string;
  source: string;
  kind: string;
  target: string;
  journeys: number;
}

export interface ElementIndex {
  /** Tagged `#public` in the model. */
  public: boolean;
  explainedBy: PageLink[];
  referencedBy: PageLink[];
  linkedFrom: PageLink[];
  journeys: ElementJourney[];
  verifiedEdges: VerifiedEdge[];
  environments: { key: string; title: string; role: string | null }[];
  /** Per docs site: whether its concepts.json lists the element, and its url there. */
  published: Record<string, { inConcepts: boolean; url: string | null }>;
}

export interface ModelIndex {
  elements: Record<string, ElementIndex>;
  views: Record<string, { embeddedBy: PageLink[] }>;
}

/** concepts.json, as content-core projection + emit/docs/discovery.mjs render it. */
export interface ConceptsJson {
  version: number;
  site: { title: string; origin: string };
  concepts: {
    id: string;
    kind: string;
    title: string;
    summary: string | null;
    url: string | null;
    sameAs: string[];
  }[];
  edges: {
    source: string;
    kind: string | null;
    title: string | null;
    target: string;
    partial: boolean;
    verified: boolean;
    journeys: { id: string; interface: string; page: string }[];
  }[];
  environments: {
    key: string;
    title: string;
    archive: string | null;
    guide: string | null;
    services: { element: string; role: string | null; url: string | null }[];
  }[];
  journeys: {
    id: string;
    title: string;
    asset: string | null;
    interface: string;
    element: string | null;
    pages: string[];
  }[];
}

/** The docs sites a concepts.json is built for (emit/docs/sites DOCS_SITES names). */
export const CONCEPT_SITES: readonly string[] = ["unitycatalog-docs", "delta-docs"];

const EVENT = "docs-factory:model-artifacts";

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null; // the SPA's index.html, when a bare build has no artifact
  }
}

function useLiveReload(queryKey: readonly unknown[]) {
  const client = useQueryClient();
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const refresh = () => client.invalidateQueries({ queryKey });
    hot.on(EVENT, refresh);
    return () => hot.off(EVENT, refresh);
  }, [client, queryKey]);
}

const INDEX_KEY = ["model-index"] as const;

export function useModelIndex(): { index: ModelIndex | null; isLoading: boolean } {
  useLiveReload(INDEX_KEY);
  const { data, isLoading } = useQuery({
    queryKey: INDEX_KEY,
    queryFn: () => fetchJson<ModelIndex>("/model-index.json"),
    staleTime: Infinity,
  });
  return { index: data ?? null, isLoading };
}

const CONCEPTS_KEY = ["concepts"] as const;

export function useConcepts(site: string): { concepts: ConceptsJson | null; isLoading: boolean } {
  useLiveReload(CONCEPTS_KEY);
  const { data, isLoading } = useQuery({
    queryKey: [...CONCEPTS_KEY, site],
    queryFn: () => fetchJson<ConceptsJson>(`/concepts/${site}.json`),
    staleTime: Infinity,
  });
  return { concepts: data ?? null, isLoading };
}
