import { Link } from "react-router-dom";
import type { ContentPage } from "../content";
import { relatedPages } from "../graph";
import { useContentVisibility } from "../lib/content-visibility";

function pageKind(page: ContentPage): string {
  if (page.area === "blogs") return "Blog";
  const d = page.frontmatter.diataxis;
  switch (d) {
    case "tutorial":
      return "Tutorial";
    case "how-to":
      return "How-to";
    case "reference":
      return "Reference";
    case "explanation":
      return "Explanation";
    default:
      return "Docs";
  }
}

/**
 * "Related" block: pages sharing a 1-hop model neighborhood (see
 * graph.relatedPages). Renders nothing when empty, so it's safe to drop at the
 * foot of any content page.
 */
export default function RelatedContent({ page }: { page: ContentPage }) {
  const vis = useContentVisibility();
  // Anonymous viewers must not see links to unpublished related pages;
  // filterVisible returns empty for anon until listDrafts resolves.
  const related = vis.filterVisible(relatedPages(page));
  if (related.length === 0) return null;

  return (
    <section className="related-content" aria-label="Related content">
      <h3>Related</h3>
      <ul className="draft-list compact">
        {related.map((r) => (
          <li key={r.href}>
            <Link to={r.href}>{r.frontmatter.title ?? r.slug}</Link>
            <span className="muted"> — {pageKind(r)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
