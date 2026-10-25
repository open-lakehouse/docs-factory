import { lazy, Suspense, useEffect, useState } from "react";
import Shell from "../components/layout/Shell";
import type { ApiSpec } from "../site";

// Scalar renders client-side only, and its chunk (JS + CSS) should load only here.
const ApiReference = lazy(() => import("../components/ApiReference"));

interface Operations {
  server: string | null;
  groups: { tag: string; operations: { method: string; path: string; summary: string }[] }[];
}

const generated = import.meta.glob<Record<string, Operations>>(
  "/src/generated/api-operations.json",
  { eager: true, import: "default" },
);
const operations = generated["/src/generated/api-operations.json"] ?? {};

/**
 * What the prerendered HTML carries in place of the explorer, so crawlers and
 * agents that don't run JS still get the API's title, summary, spec, and every
 * operation. Scalar shows all of it once it mounts, so it isn't kept on screen
 * alongside.
 */
function Placeholder({ api }: { api: ApiSpec }) {
  const ops = operations[api.slug];
  const server = api.serverUrl ?? ops?.server;
  return (
    <article className="api-placeholder prose">
      <h1>{api.title}</h1>
      <p className="lead">{api.summary}</p>
      <p>
        <a href={api.specUrl}>OpenAPI document</a> (<a href={api.sourceUrl}>{api.ref}</a>)
        {server && (
          <>
            . Paths are relative to <code>{server}</code>.
          </>
        )}
      </p>
      {ops?.groups.map((g) => (
        <section key={g.tag}>
          <h2>{g.tag}</h2>
          <ul className="api-operations">
            {g.operations.map((op) => (
              <li key={`${op.method} ${op.path}`}>
                <code>
                  {op.method} {op.path}
                </code>
                : {op.summary}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
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
