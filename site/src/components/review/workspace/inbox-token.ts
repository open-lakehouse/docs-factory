// The review workspace's Inbox item: one synthetic tab (`inbox`) beside the
// content tabs (`docs:…` / `blogs:…`), holding review requests addressed to the
// viewer and the latest comments across all content.
//
// The workspace used to have an Overview item with `overview#<view>` tabs. Its
// planning panels now live under /plan, so a shared link to one of them maps to
// that page, and `overview#comments` maps to the Inbox.
export const INBOX_TOKEN = "inbox";

export function isInboxToken(token: string): boolean {
  return token === INBOX_TOKEN || token === "overview#comments";
}

const LEGACY_OVERVIEW_PLAN: Record<string, string> = {
  overview: "pipeline",
  "overview#pipeline": "pipeline",
  "overview#product": "changes",
  "overview#coverage": "coverage",
  "overview#compat": "compat",
};

/** The /plan path a legacy Overview token now lives at, if it was a planning panel. */
export function legacyOverviewPlanPath(token: string): string | null {
  const section = LEGACY_OVERVIEW_PLAN[token];
  return section ? `/plan/${section}` : null;
}
