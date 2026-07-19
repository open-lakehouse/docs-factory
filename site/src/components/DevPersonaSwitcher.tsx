// DEV-only impersonation switcher. Lets you preview the site as an anonymous,
// reviewer, or maintainer viewer with no GitHub OAuth — it sets the persona the
// Connect transport sends as x-dev-persona, which the server's mock provider
// resolves. Also exposes the experimental rail/inline review display mode toggle.
import { useEffect, useState } from "react";
import {
  DEV_PERSONAS,
  readDevPersona,
  setDevPersona,
  type DevPersona,
} from "../lib/dev-persona";
import {
  readReviewDisplayMode,
  setReviewDisplayMode,
  REVIEW_DISPLAY_MODE_EVENT,
  type ReviewDisplayMode,
} from "../lib/review-display-mode";
import { useAuth } from "../lib/auth-context";

export default function DevPersonaSwitcher() {
  if (!import.meta.env.DEV) return null;
  const current = readDevPersona();
  const { isLoading, viewer } = useAuth();
  const [displayMode, setDisplayModeState] = useState<ReviewDisplayMode>(readReviewDisplayMode);

  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<ReviewDisplayMode>).detail;
      if (mode === "rail" || mode === "inline") setDisplayModeState(mode);
    };
    window.addEventListener(REVIEW_DISPLAY_MODE_EVENT, handler);
    return () => window.removeEventListener(REVIEW_DISPLAY_MODE_EVENT, handler);
  }, []);

  function pick(p: DevPersona) {
    if (p === current) return;
    setDevPersona(p);
    location.reload();
  }

  function pickMode(mode: ReviewDisplayMode) {
    if (mode === displayMode) return;
    setReviewDisplayMode(mode);
    setDisplayModeState(mode);
  }

  const resolved = isLoading
    ? "…"
    : viewer?.authenticated
      ? `${viewer.login} (${current})`
      : "anonymous";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        display: "flex",
        gap: 6,
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
        background: "rgba(20,20,20,0.9)",
        color: "#eee",
        border: "1px solid #444",
      }}
    >
      <span style={{ opacity: 0.7 }}>dev · {resolved}</span>
      {DEV_PERSONAS.map((p) => (
        <button
          key={p}
          onClick={() => pick(p)}
          style={{
            cursor: "pointer",
            padding: "2px 8px",
            borderRadius: 6,
            border: "1px solid #555",
            background: p === current ? "#2563eb" : "transparent",
            color: "#eee",
          }}
        >
          {p}
        </button>
      ))}
      <span style={{ opacity: 0.4, margin: "0 2px" }}>|</span>
      {(["rail", "inline"] as const).map((m) => (
        <button
          key={m}
          onClick={() => pickMode(m)}
          style={{
            cursor: "pointer",
            padding: "2px 8px",
            borderRadius: 6,
            border: "1px solid #555",
            background: m === displayMode ? "#7c3aed" : "transparent",
            color: "#eee",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
