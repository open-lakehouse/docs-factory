import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

export function toggleTheme(): void {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem("theme", next ? "dark" : "light");
  } catch {
    // Unpersisted is fine; the toggle still applies to this page.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether dark mode is on, or `null` before hydration: index.html sets the
 * class before paint, so the prerendered markup can't know it.
 */
export function useDarkMode(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => null,
  );
}
