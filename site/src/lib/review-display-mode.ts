// Persisted review UI display mode (rail vs inline). Read by ReviewProvider;
// written by the dev switcher or any future user preference control.
export type ReviewDisplayMode = "rail" | "inline";

const STORAGE_KEY = "review.displayMode";
export const REVIEW_DISPLAY_MODE_EVENT = "review-display-mode";

export function readReviewDisplayMode(): ReviewDisplayMode {
  if (typeof localStorage === "undefined") return "rail";
  return localStorage.getItem(STORAGE_KEY) === "inline" ? "inline" : "rail";
}

export function setReviewDisplayMode(mode: ReviewDisplayMode): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(REVIEW_DISPLAY_MODE_EVENT, { detail: mode }));
}
