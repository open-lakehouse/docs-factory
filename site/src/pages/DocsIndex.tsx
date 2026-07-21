import { Link, useSearchParams } from "react-router-dom";
import DocsSidebar from "../components/layout/DocsSidebar";
import Shell from "../components/layout/Shell";
import SemanticChip from "../components/SemanticChip";
import { docNav } from "../sidebar";
import {
  bucketByDiataxis,
  docsByRefs,
  referencedConcepts,
  DIATAXIS_LABELS,
  DIATAXIS_ORDER,
} from "../graph";
import { ENGINE_SLUGS } from "../engine-map";
import { tagLabel } from "../tags";

// Facet chips only offer concept nodes that at least one doc references, so no
// chip ever filters to nothing.
const conceptFacets = referencedConcepts("docs");

export default function DocsIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeRefs = [
    ...new Set(searchParams.getAll("ref").map((r) => r.trim()).filter(Boolean)),
  ];
  const activeEngines = [
    ...new Set(searchParams.getAll("engine").map((e) => e.trim()).filter(Boolean)),
  ];
  const faceted = activeRefs.length > 0 || activeEngines.length > 0;

  const setFacet = (key: "ref" | "engine", values: string[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    for (const v of values) next.append(key, v);
    setSearchParams(next, { replace: true });
  };
  const toggleRef = (id: string) =>
    setFacet(
      "ref",
      activeRefs.includes(id)
        ? activeRefs.filter((r) => r !== id)
        : [...activeRefs, id],
    );
  const toggleEngine = (slug: string) =>
    setFacet(
      "engine",
      activeEngines.includes(slug)
        ? activeEngines.filter((e) => e !== slug)
        : [...activeEngines, slug],
    );
  const clearAll = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("ref");
    next.delete("engine");
    setSearchParams(next, { replace: true });
  };

  const filtered = docsByRefs(activeRefs, activeEngines);
  const buckets = bucketByDiataxis(filtered);

  return (
    <Shell showSidebarToggle wide>
      <div className="docs-grid docs-grid-index">
        <DocsSidebar />
        <div className="docs-main">
          <h1>Documentation</h1>
          <p className="muted">
            Engine-neutral reference organized by Diátaxis — explanation, tutorials,
            how-to guides, and reference. Filter by concept or engine, or{" "}
            <Link to="/concepts">browse by concept</Link>.
          </p>

          <div className="docs-facets">
            <div className="blog-tags-section">
              <div className="blog-tags-heading">
                <p className="blog-tags-label">Concepts</p>
                {faceted && (
                  <button type="button" className="blog-tags-clear" onClick={clearAll}>
                    Clear all
                  </button>
                )}
              </div>
              <div className="tag-list">
                {conceptFacets.map((c) => (
                  <SemanticChip
                    key={c.id}
                    label={c.title}
                    active={activeRefs.includes(c.id)}
                    onToggle={() => toggleRef(c.id)}
                    card={{
                      title: c.title,
                      kindLabel: c.kindLabel,
                      summary: c.summary,
                      href: c.href ?? c.externalUrl,
                      externalUrl: c.href ? c.externalUrl : null,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="blog-tags-section">
              <p className="blog-tags-label">Engines</p>
              <div className="tag-list">
                {ENGINE_SLUGS.map((slug) => (
                  <SemanticChip
                    key={slug}
                    label={tagLabel(slug)}
                    active={activeEngines.includes(slug)}
                    onToggle={() => toggleEngine(slug)}
                  />
                ))}
              </div>
            </div>
          </div>

          {!faceted ? (
            docNav.map((group) => (
              <section key={group.project} className="nav-section">
                <h2>{group.projectLabel}</h2>
                {group.buckets.map((bucket) => (
                  <div key={bucket.bucket} className="nav-bucket">
                    <h3>{bucket.label}</h3>
                    <ul className="draft-list compact">
                      {bucket.items.map((item) => (
                        <li key={item.href}>
                          <Link to={item.href}>{item.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          ) : filtered.length === 0 ? (
            <p className="muted">No documentation matches the selected filters.</p>
          ) : (
            DIATAXIS_ORDER.filter((key) => buckets[key].length > 0).map((key) => (
              <section key={key} className="nav-section">
                <h2>{DIATAXIS_LABELS[key]}</h2>
                <ul className="draft-list compact">
                  {buckets[key].map((page) => (
                    <li key={page.href}>
                      <Link to={page.href}>
                        {page.frontmatter.title ?? page.slug}
                      </Link>
                      {page.project && (
                        <span className="muted"> — {page.project}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </Shell>
  );
}
