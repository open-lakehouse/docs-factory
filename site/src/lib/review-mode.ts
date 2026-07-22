// Persisted opt-in "Site review mode". Separate from `isAllowlisted` (the
// capability) and from `review-display-mode` (rail vs inline). A reviewer browses
// in regular mode by default — all drafts visible, but no comment chrome — and
// explicitly switches review mode on to light up the comment rail/inline surface,
// highlights, selection capture, and review controls. Read by AuthProvider;
// written by the top-bar StatusMenu (or any future preference control).
const STORAGE_KEY = "review.mode";
export const REVIEW_MODE_EVENT = "review-mode";

export function readReviewMode(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "on";
}

export function setReviewMode(on: boolean): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  window.dispatchEvent(new CustomEvent(REVIEW_MODE_EVENT, { detail: on }));
}
