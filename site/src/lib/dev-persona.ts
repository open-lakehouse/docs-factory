// Local dev impersonation persona. The StatusMenu / AccessGate dev controls write
// the chosen persona to localStorage; the Connect transport reads it per request
// and sends it as the x-dev-persona header, which the server's mock provider
// resolves. Only used in dev (import.meta.env.DEV); prod ignores it and the
// server refuses mock auth.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export const DEV_PERSONA_HEADER = "x-dev-persona";
const STORAGE_KEY = "review.devPersona";
const DEV_PERSONA_EVENT = "dev-persona";

/** Persona header values understood by the server mock provider. */
export type DevPersona = "anon" | "reviewer" | "maintainer" | "admin";

/** The personas offered as "sign in as…" choices ("anon" is signing out). */
export const SIGN_IN_PERSONAS: Exclude<DevPersona, "anon">[] = ["reviewer", "maintainer", "admin"];

/**
 * Read the current persona from localStorage. Defaults to "maintainer" so a
 * fresh checkout lands inside the login-gated site instead of on the gate.
 */
export function readDevPersona(): DevPersona {
  if (typeof localStorage === "undefined") return "maintainer";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "anon" || v === "reviewer" || v === "admin" ? v : "maintainer";
}

export function setDevPersona(persona: DevPersona): void {
  localStorage.setItem(STORAGE_KEY, persona);
  window.dispatchEvent(new CustomEvent(DEV_PERSONA_EVENT, { detail: persona }));
}

/**
 * The current persona plus a switcher. Switching resets every query rather than
 * reloading: the transport reads the persona per request, so the refetch
 * resolves the viewer (and all viewer-scoped data) under the new identity.
 */
export function useDevPersona(): [DevPersona, (persona: DevPersona) => void] {
  const queryClient = useQueryClient();
  const [persona, setPersona] = useState<DevPersona>(readDevPersona);
  useEffect(() => {
    const onChange = (e: Event) => setPersona((e as CustomEvent<DevPersona>).detail);
    window.addEventListener(DEV_PERSONA_EVENT, onChange);
    return () => window.removeEventListener(DEV_PERSONA_EVENT, onChange);
  }, []);
  const switchPersona = (next: DevPersona) => {
    if (next === persona) return;
    setDevPersona(next);
    void queryClient.resetQueries();
  };
  return [persona, switchPersona];
}
