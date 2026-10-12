import { lazy, Suspense, useEffect, useState } from "react";
import Shell from "../components/layout/Shell";
import type { ApiSpec } from "../site";

// Scalar renders client-side only, and its chunk (JS + CSS) should load only here.
const ApiReference = lazy(() => import("../components/ApiReference"));

/**
 * What the prerendered HTML carries in place of the explorer, so crawlers and
 * agents that don't run JS still get the API's title, summary, and spec. Scalar
 * shows all of it once it mounts, so it isn't kept on screen alongside.
 */
function Placeholder({ api }: { api: ApiSpec }) {
  return (
    <header className="api-placeholder prose">
      <h1>{api.title}</h1>
      <p className="lead">{api.summary}</p>
      <p>
        <a href={api.specUrl}>OpenAPI document</a> (<a href={api.sourceUrl}>{api.ref}</a>)
      </p>
      <p className="api-loading">Loading the API reference…</p>
    </header>
  );
}

export default function ApiPage({ api }: { api: ApiSpec }) {
  // The prerender and the first client render must match, so the explorer
  // mounts only after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll per API.
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [api.route]);

  const placeholder = <Placeholder api={api} />;
  return (
    <Shell sidebar={false}>
      <div className="api-reference">
        {mounted ? (
          <Suspense fallback={placeholder}>
            <ApiReference key={api.specUrl} api={api} />
          </Suspense>
        ) : (
          placeholder
        )}
      </div>
    </Shell>
  );
}
