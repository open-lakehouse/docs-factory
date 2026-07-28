// Persisted "view as anonymous" preview flag. Separate from `review-mode` (the
// review-chrome opt-in) and orthogonal to `isAllowlisted` (the capability). An
// allowlisted viewer flips this to see the site exactly as an anonymous visitor
// would — review chrome hidden AND content narrowed to the published-only set —
// to validate that only intended content is publicly exposed. It is a purely
// client-side visual preview: the API still returns the viewer's real data (see
// content-visibility, which recomputes the anonymous subset locally). Read by
// AuthProvider; written by the top-bar StatusMenu view-mode selector.
//
// Mirrors review-mode.ts: same localStorage + CustomEvent pattern so AuthProvider
// stays in sync within the tab and across tabs. review-mode and this flag are the
// two storage substrates behind the single derived `viewMode` enum.
const STORAGE_KEY = "view.anonPreview";
export const VIEW_MODE_EVENT = "view-anon-preview";

export function readAnonPreview(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "on";
}

export function setAnonPreview(on: boolean): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: on }));
}
