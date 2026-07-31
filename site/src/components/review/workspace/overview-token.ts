// Synthetic workspace-tab tokens for the Review Overview item. Unlike content
// tabs (`docs:…` / `blogs:…`), these are not ContentRefs — the group key is the
// literal "overview", and each companion view is a `#`-suffixed panel:
//
//   overview#pipeline  → Blog pipeline (priority + target dates)
//   overview#product   → ProductChanges rollup
//
// Same URL shape as content views (`?tabs=…&active=…`), so Overview is shareable
// and back/forward-navigable like any other workspace item.
export const OVERVIEW_GROUP_KEY = "overview";

export type OverviewView = "pipeline" | "product";

/** The two Overview panels, in TabBar order. */
export const OVERVIEW_VIEWS: readonly OverviewView[] = ["pipeline", "product"];

export function overviewToken(view: OverviewView): string {
  return `${OVERVIEW_GROUP_KEY}#${view}`;
}

/** All Overview tab tokens (pipeline + product), joined for `?tabs=`. */
export function overviewTabsParam(): string {
  return OVERVIEW_VIEWS.map(overviewToken).join(",");
}

/**
 * Parse an Overview tab token. Bare `overview` (no suffix) maps to pipeline so
 * a half-typed link still lands somewhere useful.
 */
export function parseOverviewToken(token: string): OverviewView | null {
  if (token === OVERVIEW_GROUP_KEY || token === overviewToken("pipeline")) return "pipeline";
  if (token === overviewToken("product")) return "product";
  return null;
}

export function overviewViewLabel(view: OverviewView): string {
  switch (view) {
    case "pipeline":
      return "Blog pipeline";
    case "product":
      return "Product changes";
  }
}

/** True when a group key (or active token's group) is the Overview item. */
export function isOverviewGroup(groupKey: string): boolean {
  return groupKey === OVERVIEW_GROUP_KEY;
}
