import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import "./api-reference.css";
import { useDarkMode } from "../lib/theme";
import type { ApiSpec } from "../site";

export default function ApiReference({ api }: { api: ApiSpec }) {
  const dark = useDarkMode();
  return (
    <ApiReferenceReact
      configuration={{
        url: api.specUrl,
        title: api.title,
        slug: api.slug,
        ...(api.serverUrl && { servers: [{ url: api.serverUrl, description: "Unity Catalog" }] }),
        layout: "modern",
        // Colors and fonts come from api-reference.css, which maps Scalar's
        // variables onto the site's tokens.
        theme: "none",
        withDefaultFonts: false,
        forceDarkModeState: dark ? "dark" : "light",
        hideDarkModeToggle: true,
        // ⌘K belongs to the site's command palette.
        searchHotKey: "j",
        defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
        hiddenClients: {
          c: true,
          clojure: true,
          csharp: true,
          dart: true,
          fsharp: true,
          go: true,
          http: true,
          kotlin: true,
          objc: true,
          ocaml: true,
          php: true,
          powershell: true,
          r: true,
          ruby: true,
          rust: true,
          swift: true,
        },
        // A docs site isn't next to a server, so the reference shows requests
        // (and their code samples) without sending them.
        hideClientButton: true,
        hideTestRequestButton: true,
        // Links the pinned source document rather than re-serializing it.
        documentDownloadType: "direct",
        showDeveloperTools: "never",
        // Nothing leaves the browser except the spec fetch.
        telemetry: false,
        agent: { disabled: true },
        mcp: { disabled: true },
      }}
    />
  );
}
