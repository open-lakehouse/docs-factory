// Tree-expansion store for the review workspace's left navigation. Adapted from
// the sibling mangrove repo's ExpansionContext: expansion lives in one place
// keyed by stable node ids (rather than per-node useState) so it survives tab
// switches/remounts, persists to sessionStorage, and can be driven
// programmatically (expand-to-path when a deep link opens a buried page).
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

/** Stable node ids for the docs/blogs tree. */
export const treeNodeId = {
  project: (project: string) => `project:${project}`,
  bucket: (project: string, bucket: string) => `bucket:${project}/${bucket}`,
  blogRoot: () => "blogs",
  series: (series: string) => `series:${series}`,
};

interface ExpansionValue {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  expand: (ids: string[]) => void;
}

const ExpansionContext = createContext<ExpansionValue | undefined>(undefined);

const STORAGE_KEY = "docs.review.expanded";

function loadInitial(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore malformed storage
  }
  return new Set();
}

function persist(ids: Set<string>) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // storage may be unavailable (private mode etc.)
  }
}

export function ExpansionProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => loadInitial());

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const expand = useCallback((ids: string[]) => {
    setExpanded((prev) => {
      if (ids.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo<ExpansionValue>(
    () => ({ isOpen: (id) => expanded.has(id), toggle, expand }),
    [expanded, toggle, expand],
  );

  return <ExpansionContext.Provider value={value}>{children}</ExpansionContext.Provider>;
}

export function useExpansion(): ExpansionValue {
  const ctx = useContext(ExpansionContext);
  if (!ctx) throw new Error("useExpansion must be used within an ExpansionProvider");
  return ctx;
}
