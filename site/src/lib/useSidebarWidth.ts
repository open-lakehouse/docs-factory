// Draggable, persisted pane width (px) for the review workspace. Adapted from
// the sibling mangrove repo's catalog explorer: same clamped-drag + keyboard +
// localStorage recipe, generalized to take a storage key and bounds so the
// workspace can drive both its left (tree) and right (review) columns.
import { useCallback, useEffect, useState } from "react";

interface Options {
  /** localStorage key; distinct per column so the two widths persist apart. */
  storageKey: string;
  min: number;
  max: number;
  default: number;
}

function readStored(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const stored = Number(window.localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}

/**
 * Persisted, clamped width for one resizable column, plus the transient drag
 * flag. Width survives reloads via localStorage; `clamp` keeps both drag and
 * keyboard adjustments within [min, max].
 */
export function useSidebarWidth({ storageKey, min, max, default: def }: Options) {
  const clamp = useCallback((px: number) => Math.min(max, Math.max(min, px)), [min, max]);
  const [width, setWidth] = useState(() => clamp(readStored(storageKey, def)));
  const [isDragging, setDragging] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(Math.round(width)));
  }, [storageKey, width]);

  return { width, setWidth, clamp, min, max, isDragging, setDragging };
}
