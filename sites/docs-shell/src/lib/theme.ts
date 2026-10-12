import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

// Mirrors the pre-paint script in index.html: no stored value means "system".
function readPreference(): ThemePreference {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "system";
}

let preference: ThemePreference | null = null;
const current = () => {
  preference ??= readPreference();
  return preference;
};

function apply() {
  const p = current();
  document.documentElement.classList.toggle(
    "dark",
    p === "dark" || (p === "system" && media().matches),
  );
  for (const l of listeners) l();
}

export function setTheme(next: ThemePreference): void {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
  } catch {
    // Unpersisted is fine; the choice still applies to this page.
  }
  apply();
}

/** Flip to the opposite of what is showing, as an explicit preference. */
export function toggleTheme(): void {
  setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  // Follow OS switches live while the preference is "system".
  media().addEventListener("change", () => {
    if (current() === "system") apply();
  });
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

/** The stored preference, or `null` before hydration (localStorage is client-only). */
export function useThemePreference(): ThemePreference | null {
  return useSyncExternalStore(subscribe, current, () => null);
}
