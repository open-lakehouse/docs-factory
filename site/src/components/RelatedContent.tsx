import { Link } from "react-router-dom";
import type { ContentPage } from "../content";
import { relatedPages } from "../graph";

// Diátaxis / area label for a related item, so readers see what *kind* of page
// they'd be jumping to.
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
 * "Related" block driven by the model graph: pages sharing a 1-hop model
 * neighborhood (see graph.relatedPages). Renders nothing when there are no
 * related pages, so it's safe to drop at the foot of any content page.
 */
export default function RelatedContent({ page }: { page: ContentPage }) {
  const related = relatedPages(page);
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
