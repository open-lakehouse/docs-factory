// URL-driven open-tabs store for the review workspace. The coarse state (which
// tabs are open, which is active, and any one-shot deep-link intent) lives in
// the query string so a workspace layout is shareable and back/forward-navigable:
//
//   /review?tabs=docs:slug:project:bucket,blogs:slug::&active=<token>&thread=<id>&anchor=<slug>
//
// `thread`/`anchor` are one-shot navigation intents (Phase 3 consumes them):
// after the target tab selects + scrolls, it clears them. Transient per-tab UI
// (hover, composer, pending selection) stays in each tab's own providers.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { refFromParam, refToParam } from "../../../lib/content-ref";

export interface OpenTab {
  token: string;
  ref: ContentRef;
}

/** A deep-link intent attached when opening a tab from a cross-nav row. */
export interface OpenIntent {
  thread?: string;
  anchor?: string;
}

interface TabsValue {
  tabs: OpenTab[];
  activeToken: string | null;
  /** The active tab's deep-link intent, if any (cleared via clearIntent). */
  intent: OpenIntent;
  openTab: (ref: ContentRef, intent?: OpenIntent) => void;
  closeTab: (token: string) => void;
  setActive: (token: string) => void;
  clearIntent: () => void;
}

const TabsContext = createContext<TabsValue | undefined>(undefined);

function parseTabs(raw: string | null): OpenTab[] {
  if (!raw) return [];
  const out: OpenTab[] = [];
  const seen = new Set<string>();
  for (const token of raw.split(",")) {
    if (!token || seen.has(token)) continue;
    const ref = refFromParam(token);
    if (!ref) continue;
    seen.add(token);
    out.push({ token, ref });
  }
  return out;
}

export function WorkspaceTabsProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();

  const tabs = useMemo(() => parseTabs(params.get("tabs")), [params]);
  const activeParam = params.get("active");
  // Keep `active` valid: fall back to the last tab if the param is stale/missing.
  const activeToken =
    (activeParam && tabs.some((t) => t.token === activeParam) && activeParam) ||
    (tabs.length ? tabs[tabs.length - 1].token : null);

  const intent = useMemo<OpenIntent>(
    () => ({ thread: params.get("thread") ?? undefined, anchor: params.get("anchor") ?? undefined }),
    [params],
  );

  const openTab = useCallback(
    (ref: ContentRef, next?: OpenIntent) => {
      const token = refToParam(ref);
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const existing = parseTabs(p.get("tabs"));
          if (!existing.some((t) => t.token === token)) {
            const tokens = [...existing.map((t) => t.token), token];
            p.set("tabs", tokens.join(","));
          }
          p.set("active", token);
          if (next?.thread) p.set("thread", next.thread);
          else p.delete("thread");
          if (next?.anchor) p.set("anchor", next.anchor);
          else p.delete("anchor");
          return p;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const closeTab = useCallback(
    (token: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const existing = parseTabs(p.get("tabs"));
          const remaining = existing.filter((t) => t.token !== token);
          if (remaining.length) p.set("tabs", remaining.map((t) => t.token).join(","));
          else p.delete("tabs");
          // If we closed the active tab, activate its right-hand neighbor (or the
          // new last tab), matching editor muscle memory.
          if (p.get("active") === token) {
            const idx = existing.findIndex((t) => t.token === token);
            const fallback = remaining[Math.min(idx, remaining.length - 1)];
            if (fallback) p.set("active", fallback.token);
            else p.delete("active");
            p.delete("thread");
            p.delete("anchor");
          }
          return p;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const setActive = useCallback(
    (token: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("active", token);
          // Switching tabs by hand drops any pending deep-link intent.
          p.delete("thread");
          p.delete("anchor");
          return p;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const clearIntent = useCallback(() => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!p.has("thread") && !p.has("anchor")) return p;
        p.delete("thread");
        p.delete("anchor");
        return p;
      },
      { replace: true },
    );
  }, [setParams]);

  const value = useMemo<TabsValue>(
    () => ({ tabs, activeToken, intent, openTab, closeTab, setActive, clearIntent }),
    [tabs, activeToken, intent, openTab, closeTab, setActive, clearIntent],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useWorkspaceTabs(): TabsValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useWorkspaceTabs must be used within a WorkspaceTabsProvider");
  return ctx;
}
