// URL-driven open-tabs store for the review workspace. The coarse state (which
// tabs are open, which is active, and any one-shot deep-link intent) lives in
// the query string so a workspace layout is shareable and back/forward-navigable:
//
//   /review?tabs=docs:slug:project:bucket,docs:slug:project:bucket#md,…&active=<token>&thread=<id>&anchor=<slug>
//
// Opening a sidebar ITEM opens a GROUP of tabs — the rendered page plus one tab
// per companion VIEW (its `.md` twin, each runnable script). Every tab token is
// `refToParam(ref)` optionally suffixed with `#<view>`; tabs sharing a ref token
// (the groupKey) belong to one item. The rendered view has no suffix, so old
// shared links (bare ref tokens) still parse.
//
// `thread`/`anchor` are one-shot navigation intents (Phase 3 consumes them):
// after the target tab selects + scrolls, it clears them. Transient per-tab UI
// (hover, composer, pending selection) stays in each tab's own providers.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { ContentArea, type ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { findBlog, findDoc, type ContentPage } from "../../../content";
import { useScriptsIndex } from "../../../lib/scripts-index";
import { viewsFor } from "./item-views";
import {
  parseTabToken,
  refTokenOf,
  tabTokenFor,
  type TabView,
} from "./view-token";

// Cap the number of simultaneously-open ITEMS (groups), not individual tabs:
// one click opens a whole group, and only the rendered view keeps a heavy MDX
// render + ReviewProvider warm (twin/script views are light fetch + <pre>). When
// opening an item would exceed this, the least-recently-ACTIVE group is evicted
// whole (never the active group, never the group just opened).
const MAX_GROUPS = 6;

export interface OpenTab {
  token: string;
  ref: ContentRef;
  view: TabView;
  /** The ref token shared by every view of one item; groups sibling tabs. */
  groupKey: string;
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
  /** Open an item: its rendered view + every companion view, rendered active. */
  openTab: (ref: ContentRef, intent?: OpenIntent) => void;
  /** Activate a specific view of an item (opening it if not already open). */
  openView: (ref: ContentRef, view: TabView, intent?: OpenIntent) => void;
  /** Close a single view tab. */
  closeTab: (token: string) => void;
  /** Close a whole item group (every view sharing the groupKey). */
  closeGroup: (groupKey: string) => void;
  setActive: (token: string) => void;
  clearIntent: () => void;
}

const TabsContext = createContext<TabsValue | undefined>(undefined);

function pageFor(ref: ContentRef): ContentPage | undefined {
  return ref.area === ContentArea.BLOGS
    ? findBlog(ref.slug)
    : findDoc(ref.project ?? "", ref.bucket ?? "", ref.slug);
}

function parseTabs(raw: string | null): OpenTab[] {
  if (!raw) return [];
  const out: OpenTab[] = [];
  const seen = new Set<string>();
  for (const token of raw.split(",")) {
    if (!token || seen.has(token)) continue;
    const parsed = parseTabToken(token);
    if (!parsed) continue;
    seen.add(token);
    out.push({ token, ref: parsed.ref, view: parsed.view, groupKey: refTokenOf(token) });
  }
  return out;
}

export function WorkspaceTabsProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  // Preloaded once for the workspace so openTab can compute an item's views
  // synchronously (group membership stays stable across the open).
  const scriptsIndex = useScriptsIndex();
  const scriptsRef = useRef(scriptsIndex);
  scriptsRef.current = scriptsIndex;

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

  // Group activation recency, most-recent LAST, kept in memory (not the URL — a
  // shared link shouldn't carry local eviction history). Keyed on groupKey, so
  // activating any view of an item marks the whole item recently-used. Used to
  // pick the LRU victim group when the cap is hit.
  const recencyRef = useRef<string[]>([]);
  useEffect(() => {
    if (!activeToken) return;
    const group = refTokenOf(activeToken);
    const r = recencyRef.current.filter((g) => g !== group);
    r.push(group);
    recencyRef.current = r;
  }, [activeToken]);

  // Trim to MAX_GROUPS by evicting least-recently-active GROUPS, always keeping
  // `keepGroup` (the item just opened/activated). Returns the surviving tokens
  // in their original order (whole groups dropped together).
  const applyCap = useCallback((tokens: string[], keepGroup: string): string[] => {
    const groups: string[] = [];
    for (const t of tokens) {
      const g = refTokenOf(t);
      if (!groups.includes(g)) groups.push(g);
    }
    if (groups.length <= MAX_GROUPS) return tokens;
    const recency = recencyRef.current;
    // Least-recently-active group first; a group never activated sorts first.
    const rank = (g: string) => recency.lastIndexOf(g);
    const evictable = groups.filter((g) => g !== keepGroup).sort((a, b) => rank(a) - rank(b));
    const toEvict = new Set(evictable.slice(0, groups.length - MAX_GROUPS));
    return tokens.filter((t) => !toEvict.has(refTokenOf(t)));
  }, []);

  const applyIntent = useCallback((p: URLSearchParams, next?: OpenIntent) => {
    if (next?.thread) p.set("thread", next.thread);
    else p.delete("thread");
    if (next?.anchor) p.set("anchor", next.anchor);
    else p.delete("anchor");
  }, []);

  const openTab = useCallback(
    (ref: ContentRef, next?: OpenIntent) => {
      const group = tabTokenFor(ref, { kind: "rendered" });
      const views = viewsFor(ref, pageFor(ref), scriptsRef.current);
      const groupTokens = views.map((v) => tabTokenFor(ref, v));
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const existing = parseTabs(p.get("tabs")).map((t) => t.token);
          // Add any of this item's views that aren't open yet, preserving order.
          let tokens = existing.slice();
          for (const t of groupTokens) if (!tokens.includes(t)) tokens.push(t);
          tokens = applyCap(tokens, group);
          if (tokens.length) p.set("tabs", tokens.join(","));
          // Land on the rendered view — the page the reviewer expects to see.
          p.set("active", group);
          applyIntent(p, next);
          return p;
        },
        { replace: false },
      );
    },
    [setParams, applyCap, applyIntent],
  );

  const openView = useCallback(
    (ref: ContentRef, view: TabView, next?: OpenIntent) => {
      const token = tabTokenFor(ref, view);
      const group = tabTokenFor(ref, { kind: "rendered" });
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          let tokens = parseTabs(p.get("tabs")).map((t) => t.token);
          if (!tokens.includes(token)) {
            tokens = applyCap([...tokens, token], group);
            p.set("tabs", tokens.join(","));
          }
          p.set("active", token);
          applyIntent(p, next);
          return p;
        },
        { replace: false },
      );
    },
    [setParams, applyCap, applyIntent],
  );

  const closeTokens = useCallback(
    (drop: (t: OpenTab) => boolean) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const existing = parseTabs(p.get("tabs"));
          const remaining = existing.filter((t) => !drop(t));
          if (remaining.length) p.set("tabs", remaining.map((t) => t.token).join(","));
          else p.delete("tabs");
          // If the active tab went away, activate a surviving neighbor (the tab
          // at the closed position, clamped), matching editor muscle memory.
          const active = p.get("active");
          if (active && !remaining.some((t) => t.token === active)) {
            const idx = existing.findIndex((t) => t.token === active);
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

  const closeTab = useCallback((token: string) => closeTokens((t) => t.token === token), [closeTokens]);
  const closeGroup = useCallback(
    (groupKey: string) => closeTokens((t) => t.groupKey === groupKey),
    [closeTokens],
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
    () => ({
      tabs,
      activeToken,
      intent,
      openTab,
      openView,
      closeTab,
      closeGroup,
      setActive,
      clearIntent,
    }),
    [tabs, activeToken, intent, openTab, openView, closeTab, closeGroup, setActive, clearIntent],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useWorkspaceTabs(): TabsValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useWorkspaceTabs must be used within a WorkspaceTabsProvider");
  return ctx;
}
