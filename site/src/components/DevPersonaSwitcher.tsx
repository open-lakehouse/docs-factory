// DEV-only impersonation switcher. Lets you preview the site as an anonymous,
// reviewer, or maintainer viewer with no GitHub OAuth — it sets the persona the
// Connect transport sends as x-dev-persona, which the server's mock provider
// resolves. Renders nothing in a production build (import.meta.env.DEV gate).
import { DEV_PERSONAS, readDevPersona, setDevPersona, type DevPersona } from "../lib/dev-persona";
import { useAuth } from "../lib/auth-context";

export default function DevPersonaSwitcher() {
  if (!import.meta.env.DEV) return null;
  const current = readDevPersona();
  const { isLoading, viewer } = useAuth();

  function pick(p: DevPersona) {
    if (p === current) return;
    setDevPersona(p);
    // Reload so every query re-resolves under the new persona.
    location.reload();
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
    </div>
  );
}
