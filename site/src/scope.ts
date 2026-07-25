// scope.ts — site-wide project SCOPES layered over the estate model.
//
// The site consolidates content from several upstream projects (delta,
// unitycatalog). Those projects are NOT first-class scopes in the LikeC4 model
// (ADR-0007) — they are `openSpecification` elements (`deltaSpec` / `ucSpec`)
// with implementations hanging off them. So a "scope" here is a DERIVED
// predicate over a page's effective model references (graph.ts) plus its
// `project` frontmatter — never a new model tag.
//
// `open-lakehouse` is the implicit "all"; picking `delta` / `unitycatalog` from
// the breadcrumb root filters every axis to in-scope content. Scope travels in
// the URL as `?scope=<id>`, mirroring the existing `?tag=`/`?ref=`/`?engine=`
// facet convention, so no routes change and deep links keep working.

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { ContentPage } from "./content";
import { effectiveRefIds } from "./graph";
import { getExplainElement } from "./explain";

export const ALL_SCOPE = "open-lakehouse";

export interface Scope {
  id: string;
  /** Root-segment label, e.g. shown as `~/delta`. */
  label: string;
  /** `project` frontmatter values that belong to this scope. */
  projects: string[];
  /** Model element ids that anchor this scope (the spec + its neighborhood). */
  anchorIds: string[];
  /** Optional per-project accent (Shell `data-accent`). */
  accent?: "delta" | "unitycatalog";
}

/** Scope registry. Adding a project is a config-only change. */
export const SCOPES: Scope[] = [
  {
    id: "delta",
    label: "delta",
    projects: ["delta"],
    anchorIds: ["deltaSpec"],
    accent: "delta",
  },
  {
    id: "unitycatalog",
    label: "unitycatalog",
    projects: ["unitycatalog"],
    anchorIds: ["ucSpec"],
    accent: "unitycatalog",
  },
];

const byId = new Map(SCOPES.map((s) => [s.id, s]));

/** Whether a scope id is a real, filterable scope (not the implicit "all"). */
export function isRealScope(id: string | null | undefined): id is string {
  return !!id && byId.has(id);
}

export function getScope(id: string | null | undefined): Scope | null {
  return id ? (byId.get(id) ?? null) : null;
}

/** Accent for the active scope, or undefined for `open-lakehouse`. */
export function scopeAccent(id: string | null | undefined): "delta" | "unitycatalog" | undefined {
  return getScope(id)?.accent;
}

// Stable altitude edges (ADR-0005) — the same set graph.ts walks for
// relatedness. Expanding a scope anchor one hop over these pulls the spec's
// implementations (and vice-versa) into scope, so `delta` catches delta-rs /
// Delta Spark even when a page only references the implementation.
const SCOPE_EDGE_KINDS = new Set<string>(["specifies", "realizes", "implements", "consumes"]);

/** An anchor id set expanded one hop along the stable edges (both directions). */
function expandedAnchors(scope: Scope): Set<string> {
  const out = new Set<string>(scope.anchorIds);
  for (const id of scope.anchorIds) {
    const el = getExplainElement(id);
    if (!el) continue;
    for (const rel of el.outgoing()) {
      if (SCOPE_EDGE_KINDS.has(rel.kind)) out.add(String(rel.target.id));
    }
    for (const rel of el.incoming()) {
      if (SCOPE_EDGE_KINDS.has(rel.kind)) out.add(String(rel.source.id));
    }
  }
  return out;
}

// Precompute per scope so the predicate stays O(refs).
const anchorSets = new Map<string, Set<string>>(
  SCOPES.map((s) => [s.id, expandedAnchors(s)]),
);

/**
 * Is this content page in the given scope? A page matches when its `project`
 * is one of the scope's projects OR its effective model references intersect
 * the scope's (expanded) anchors. `open-lakehouse` / unknown ids → everything.
 */
export function inScope(page: ContentPage, scopeId: string | null | undefined): boolean {
  const scope = getScope(scopeId);
  if (!scope) return true;
  if (page.project && scope.projects.includes(page.project)) return true;
  const anchors = anchorSets.get(scope.id)!;
  return effectiveRefIds(page).some((id) => anchors.has(id));
}

/** Whether a bare model element id belongs to a scope (for model explain rows). */
export function elementInScope(id: string, scopeId: string | null | undefined): boolean {
  const scope = getScope(scopeId);
  if (!scope) return true;
  return anchorSets.get(scope.id)!.has(id);
}

/** Filter content pages by the active scope. */
export function filterByScope<T extends ContentPage>(pages: T[], scopeId: string | null | undefined): T[] {
  if (!isRealScope(scopeId)) return pages;
  return pages.filter((p) => inScope(p, scopeId));
}

// --- URL plumbing -----------------------------------------------------------

/** Append/replace `?scope=` on an href, dropping it for the "all" scope.
 * Fragment-aware: `/docs#tutorial` → `/docs?scope=delta#tutorial`, so anchored
 * hrefs (the per-axis section jumps on /docs) keep a valid `?query#fragment`
 * order. */
export function withScope(href: string, scopeId: string | null | undefined): string {
  const [beforeHash, hash = ""] = href.split("#");
  const [path, query = ""] = beforeHash.split("?");
  const params = new URLSearchParams(query);
  params.delete("scope");
  if (isRealScope(scopeId)) params.set("scope", scopeId);
  const qs = params.toString();
  const fragment = hash ? `#${hash}` : "";
  return (qs ? `${path}?${qs}` : path) + fragment;
}

export interface UseScope {
  /** Active scope id, or `open-lakehouse` when none is selected. */
  scopeId: string;
  /** Active real Scope, or null for `open-lakehouse`. */
  scope: Scope | null;
  /** Set the scope on the current route, preserving other params. */
  setScope: (id: string) => void;
}

/** Read/write the `?scope=` param on the current route. */
export function useScope(): UseScope {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("scope");
  const scopeId = isRealScope(raw) ? raw : ALL_SCOPE;

  const setScope = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (isRealScope(id)) next.set("scope", id);
          else next.delete("scope");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { scopeId, scope: getScope(scopeId), setScope };
}
