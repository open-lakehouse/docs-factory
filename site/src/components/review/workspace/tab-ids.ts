// Stable DOM ids that tie a tab (role="tab" in TabBar) to its content panel
// (role="tabpanel" in ReviewTab) for the ARIA tablist relationship: the tab is
// `aria-controls` its panel; the panel is `aria-labelledby` its tab. Kept in one
// place so both sides derive the same id from the tab token. The token contains
// `:` etc., which is fine inside an id but is sanitized for a clean attribute.
export function tabDomId(token: string): string {
  return `review-tab-${token.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** The tabpanel id paired with a tab's id (the panel's own DOM id). */
export function tabPanelDomId(token: string): string {
  return `${tabDomId(token)}-panel`;
}
