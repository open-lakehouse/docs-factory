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

/**
 * DOM id for an ITEM (group) tab in the strip's top row. Distinct from
 * `tabDomId` so it never collides with the rendered sub-view's tab id (whose
 * token equals the group key). The active panel is aria-labelledby its own
 * sub-view tab, so the group tab id only needs to be unique.
 */
export function groupTabDomId(groupKey: string): string {
  return `review-group-${groupKey.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/**
 * The tab element a panel should be `aria-labelledby`: the ITEM tab in the top
 * row, which is always present (the sub-view row only renders for multi-view
 * items, so a panel can't rely on its own sub-view tab existing). Derives the
 * group key from the panel's token.
 */
export function panelLabelledBy(token: string): string {
  const hash = token.indexOf("#");
  const groupKey = hash === -1 ? token : token.slice(0, hash);
  return groupTabDomId(groupKey);
}
