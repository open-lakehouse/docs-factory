// The build emits `dist/scripts.json` (agentic-docs Phase 3): the index of
// runnable PEP-723 scripts served alongside tutorial pages. The review
// workspace loads it so an item's tab group can include one view per script.
//
// It's a static artifact fetched once and cached forever (staleTime: Infinity).
// It only exists for a full build — under `vite dev` a dev shim serves it (see
// vite.config.ts), and for a bare/preview build without tutorials it may 404;
// either way we degrade to an empty index rather than erroring the workspace.
import { useQuery } from "@tanstack/react-query";

/** One script entry, mirroring `scriptEntry()` in scripts/build-script-index.mjs. */
export interface ScriptEntry {
  /** Repo-relative path — the key GetSourceFile resolves against for comments. */
  gitPath: string;
  /** Served URL of the raw .py, e.g. /docs/delta/tutorials/<slug>/snippets/x.py. */
  fetchUrl: string;
  /** Canonical route of the owning tutorial page, matches refHref(ref). */
  tutorialRoute: string;
  tutorialSlug: string;
  requiresPython: string | null;
  dependencies: string[] | null;
  compose: string | null;
  services: string[] | null;
  baseUrlEnv: string | null;
}

export interface ScriptsIndex {
  version: number;
  scripts: ScriptEntry[];
}

const EMPTY: ScriptsIndex = { version: 0, scripts: [] };

async function fetchScriptsIndex(): Promise<ScriptsIndex> {
  const res = await fetch("/scripts.json");
  if (!res.ok) return EMPTY; // 404 in dev / bare builds → no scripts, not an error
  try {
    return (await res.json()) as ScriptsIndex;
  } catch {
    return EMPTY;
  }
}

/**
 * The runnable-script index, loaded once for the workspace. Returns an empty
 * index while loading or when the artifact is absent, so callers can treat the
 * result as authoritative without null-checking.
 */
export function useScriptsIndex(): ScriptsIndex {
  const { data } = useQuery({
    queryKey: ["scripts-index"],
    queryFn: fetchScriptsIndex,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? EMPTY;
}
