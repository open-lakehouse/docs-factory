// A Trestle environment diagram. The prerendered page carries the PNG, which is
// what crawlers and no-JS readers get; once hydrated, the component fetches the
// snapshot served beside it and swaps in the interactive canvas. React Flow and
// ELK (~2 MB) load only on pages that have a diagram.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useDarkMode } from "../lib/theme";

const TrestleCanvas = lazy(() => import("./TrestleCanvas"));

// A snapshot's file paths are relative to the render it sits in.
function filesBeside(snapshot: string) {
  const base = snapshot.slice(0, snapshot.lastIndexOf("/") + 1);
  return (path: string) =>
    fetch(base + path).then((r) =>
      r.ok ? r.text() : Promise.reject(new Error(`${path}: HTTP ${r.status}`)),
    );
}

export function TrestleDiagram({
  image,
  snapshot,
  alt,
}: {
  image: string;
  snapshot: string;
  alt?: string;
}) {
  const dark = useDarkMode();
  const [data, setData] = useState<unknown>(null);
  const readFile = useMemo(() => filesBeside(snapshot), [snapshot]);

  useEffect(() => {
    let live = true;
    fetch(snapshot)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => live && setData(json))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [snapshot]);

  const picture = <img src={image} alt={alt || "Environment diagram"} loading="lazy" />;
  return (
    <figure className="trestle-frame" aria-label={alt || undefined}>
      {data ? (
        <Suspense fallback={picture}>
          <TrestleCanvas
            snapshot={data}
            label={alt || undefined}
            colorMode={dark ? "dark" : "light"}
            readFile={readFile}
          />
        </Suspense>
      ) : (
        picture
      )}
    </figure>
  );
}
