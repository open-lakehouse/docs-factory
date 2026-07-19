// Local dev impersonation persona. The DevPersonaSwitcher writes the chosen
// persona to localStorage; the Connect transport reads it and sends it as the
// x-dev-persona header, which the server's mock provider resolves. Only used in
// dev (import.meta.env.DEV); prod ignores it and the server refuses mock auth.
export const DEV_PERSONA_HEADER = "x-dev-persona";
const STORAGE_KEY = "review.devPersona";

/** Persona header values understood by the server mock provider. */
export type DevPersona = "anon" | "reviewer" | "maintainer";

export const DEV_PERSONAS: DevPersona[] = ["anon", "reviewer", "maintainer"];

/** Read the current persona from localStorage (default "anon"). */
export function readDevPersona(): DevPersona {
  if (typeof localStorage === "undefined") return "anon";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "reviewer" || v === "maintainer" ? v : "anon";
}

/** Persist the persona and reload so all queries re-resolve under it. */
export function setDevPersona(persona: DevPersona): void {
  localStorage.setItem(STORAGE_KEY, persona);
}
