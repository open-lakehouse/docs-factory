import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Shell from "../components/layout/Shell";

export default function NotFound() {
  const { pathname } = useLocation();
  // 404.html is prerendered once (as /404) and served for any missing path, so
  // the real path is only known after hydration.
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => setPath(pathname), [pathname]);
  return (
    <Shell>
      <article className="prose not-found">
        <p className="eyebrow">
          <span className="kind" data-kind="error">
            404
          </span>
        </p>
        <h1>Page not found</h1>
        <pre className="console-line">
          <span className="prompt">$</span> open {path ?? "…"}
          {"\n"}
          <span className="console-err">error:</span> no such page
        </pre>
        <p>
          <Link to="/">Back to the docs home</Link>.
        </p>
      </article>
    </Shell>
  );
}
