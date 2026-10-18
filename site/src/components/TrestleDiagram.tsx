import { useTheme } from "next-themes";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

// React Flow + ELK are ~2 MB; only pages with a diagram pay for them.
const TrestleCanvas = lazy(() => import("./TrestleCanvas"));

// A snapshot's file paths are relative to the render it sits in.
function filesBeside(snapshot: string) {
  const base = snapshot.slice(0, snapshot.lastIndexOf("/") + 1);
  return (path: string) =>
    fetch(base + path).then((r) =>
      r.ok ? r.text() : Promise.reject(new Error(`${path}: HTTP ${r.status}`)),
    );
}

/**
 * Markdown-facing Trestle renderer. `remark-trestle-views` turns
 * `![...](<stem>.png "trestle=<ref>")` into this component; `snapshot` is the
 * sibling `<stem>.trestle-graph.json`, fetched at runtime like the PNG.
 */
export function TrestleDiagram({
  image,
  snapshot,
  alt,
}: {
  image: string;
  snapshot: string;
  alt?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<unknown>(null);
  const readFile = useMemo(() => filesBeside(snapshot), [snapshot]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(snapshot)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((json) => live && setData(json))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [snapshot]);

  const fallback = <img src={image} alt={alt ?? ""} className="trestle-frame-image" />;
  return (
    <figure className="trestle-frame" aria-label={alt || undefined}>
      {data && !failed ? (
        <Suspense fallback={fallback}>
          <TrestleCanvas
            snapshot={data}
            label={alt || undefined}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            readFile={readFile}
          />
        </Suspense>
      ) : (
        fallback
      )}
    </figure>
  );
}
