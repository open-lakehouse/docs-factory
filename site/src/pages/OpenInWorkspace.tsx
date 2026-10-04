// Content paths (`/docs/<project>/<bucket>/<slug>`, `/blog/<slug>`) are still the
// canonical page identity: rendered pages link to each other by them, refHref()
// builds them for dashboard rows, and companion files are served beneath them.
// The app no longer renders a standalone page, so these routes open the item in
// the review workspace instead, carrying a `#heading` fragment over as the
// one-shot anchor intent.
import { Navigate, useLocation, useParams } from "react-router-dom";
import { itemGroupTokens } from "../components/review/workspace/workspace-tabs-context";
import { blogRef, docRef } from "../lib/content-ref";
import { useScriptsIndexQuery } from "../lib/scripts-index";

export default function OpenInWorkspace() {
  const { project, bucket, slug = "" } = useParams();
  const { hash } = useLocation();
  // Wait for scripts.json so the item opens with its script tabs.
  const { index, isLoading } = useScriptsIndexQuery();
  if (isLoading) return null;

  const ref = project && bucket ? docRef(project, bucket, slug) : blogRef(slug);
  const tokens = itemGroupTokens(ref, index);
  const search = new URLSearchParams({ tabs: tokens.join(","), active: tokens[0] });
  const anchor = decodeURIComponent(hash.slice(1));
  if (anchor) search.set("anchor", anchor);
  return <Navigate replace to={`/review?${search.toString()}`} />;
}
