import { type RefObject, useEffect } from "react";

/**
 * Wire an open popup menu: outside pointer or Escape closes it (Escape hands
 * focus back to the toggle), and opening focuses the checked item, else the first.
 */
export function useMenu(
  open: boolean,
  close: () => void,
  root: RefObject<HTMLElement | null>,
  toggle: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    const items = root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    const checked = root.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, root, toggle]);
}
