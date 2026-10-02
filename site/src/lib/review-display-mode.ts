// Persisted review UI display mode (rail vs inline). Read by ReviewProvider;
// written by the StatusMenu dev section or any future user preference control.
import { useEffect, useState } from "react";

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

/** The current display mode, kept in sync with every writer via the event. */
export function useReviewDisplayMode(): [ReviewDisplayMode, (mode: ReviewDisplayMode) => void] {
  const [mode, setMode] = useState<ReviewDisplayMode>(readReviewDisplayMode);
  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<ReviewDisplayMode>).detail;
      if (next === "rail" || next === "inline") setMode(next);
    };
    window.addEventListener(REVIEW_DISPLAY_MODE_EVENT, onChange);
    return () => window.removeEventListener(REVIEW_DISPLAY_MODE_EVENT, onChange);
  }, []);
  return [mode, setReviewDisplayMode];
}
