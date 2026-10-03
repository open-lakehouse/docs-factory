// The per-topic index/overview shown at /docs when a real scope (delta /
// unitycatalog) is active — a step toward what a deployed docs.delta.io /
// docs.unitycatalog.io landing looks like. Instead of the full stacked axis
// tables (that's the `open-lakehouse` "all" view, DocsIndex → DocsTables), a
// scoped visitor gets a hero + a few featured docs per Diátaxis axis + the
// latest blogs, all narrowed to the active scope. Everything here is live,
// scope-filtered content; the only authored copy is the scope's `tagline`.
// A scope whose project ships a nav.yml gets the manifest's sections instead
// of the per-axis picks — the landing the target docs site would have.

import { Link } from "react-router-dom";
import Shell from "../components/layout/Shell";
import { blogPosts, pages } from "../content";
import { bucketByDiataxis, DIATAXIS_ORDER } from "../graph";
import { useContentVisibility } from "../lib/content-visibility";
import { filterByScope, getScope, scopeAccent, withScope } from "../scope";
import { type DocNavItem, type NavNode, PROJECT_LABELS, useManifestNav } from "../sidebar";
import { AXES, TYPES_VIEW } from "./DocsIndex";

/** How many docs to feature per axis on the topic index. */
const FEATURED_PER_AXIS = 3;
/** How many recent posts to feature. */
const FEATURED_POSTS = 4;

export default function ScopeIndex({ scopeId }: { scopeId: string }) {
  const vis = useContentVisibility();
  const scope = getScope(scopeId);
  const manifest = useManifestNav(scopeId);

  // Scope narrows first, then Diátaxis bucketing — same order as DocsTables so
  // the featured lists are a strict subset of what the full tables would show.
  const scoped = filterByScope(pages, scopeId);
  const bucketed = bucketByDiataxis(scoped);

  // A few visible docs per axis, title-sorted (matches the tables' ordering).
  const featuredByAxis = DIATAXIS_ORDER.map((axis) => ({
    axis,
    docs: vis
      .filterVisible(bucketed[axis])
      .slice()
      .sort((a, b) => (a.frontmatter.title ?? a.slug).localeCompare(b.frontmatter.title ?? b.slug))
      .slice(0, FEATURED_PER_AXIS),
  }));

  const latestPosts = vis.filterVisible(filterByScope(blogPosts, scopeId)).slice(0, FEATURED_POSTS);

  const title = (scope && PROJECT_LABELS[scope.projects[0]]) ?? scope?.label ?? scopeId;

  return (
    <Shell wide accent={scopeAccent(scopeId)}>
      <div className="docs-index">
        <div className="docs-index-header">
          <h1>{title}</h1>
          {scope?.tagline && <p className="muted">{scope.tagline}</p>}
        </div>

        <div className="docs-index-body">
          {manifest && (
            <ManifestSections tree={manifest.tree} scopeId={scopeId} isLoading={vis.isLoading} />
          )}
          {!manifest &&
            featuredByAxis.map(({ axis, docs }) => {
              const meta = AXES[axis];
              return (
                <section key={axis} id={axis} className="docs-axis-section">
                  <div className="docs-axis-heading">
                    {meta.icon}
                    <h2>
                      <Link to={withScope(`/docs#${axis}`, scopeId)}>{meta.title}</Link>
                    </h2>
                  </div>
                  <p className="muted">{meta.blurb}</p>
                  {docs.length > 0 ? (
                    <ul className="draft-list compact card-list">
                      {docs.map((page) => (
                        <li key={page.href}>
                          <Link to={page.href} className="draft-card">
                            <span className="draft-card-title">
                              {page.frontmatter.title ?? page.slug}
                            </span>
                            <span className="meta">
                              {page.project} · {page.bucket}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted docs-axis-empty">
                      {vis.isLoading
                        ? `Loading ${meta.title.toLowerCase()}…`
                        : `No published ${meta.title.toLowerCase()} yet.`}
                    </p>
                  )}
                </section>
              );
            })}

          <section className="docs-axis-section">
            <div className="docs-axis-heading">
              <h2>
                <Link to={withScope("/blog", scopeId)}>Latest from the blog</Link>
              </h2>
            </div>
            <p className="muted">Narrative posts for this topic.</p>
            {latestPosts.length > 0 ? (
              <ul className="draft-list compact card-list">
                {latestPosts.map((post) => (
                  <li key={post.href}>
                    <Link to={post.href} className="draft-card">
                      <span className="draft-card-title">
                        {post.frontmatter.title ?? post.slug}
                      </span>
                      <span className="meta">
                        {vis.showStatusColumns ? vis.statusFor(post).frontmatter : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted docs-axis-empty">
                {vis.isLoading ? "Loading posts…" : "No published posts yet."}
              </p>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}

/** Primary-placement pages under a node, each tagged with its sub-section trail. */
function pagesUnder(nodes: NavNode[], trail: string[] = []): { item: DocNavItem; where: string }[] {
  return nodes.flatMap((node) => {
    if (node.kind === "section") return pagesUnder(node.children, [...trail, node.label]);
    if (node.kind === "page" && node.primary)
      return [{ item: node.item, where: trail.join(" · ") }];
    return [];
  });
}

/** One card list per top-level nav.yml section. Cross-links and planned slots
 * stay in the sidebar; the landing lists each page once. */
function ManifestSections({
  tree,
  scopeId,
  isLoading,
}: {
  tree: NavNode[];
  scopeId: string;
  isLoading: boolean;
}) {
  const sections = tree.filter(
    (n): n is Extract<NavNode, { kind: "section" }> => n.kind === "section",
  );
  return (
    <>
      {sections.map((section) => {
        const docs = pagesUnder(section.children);
        if (docs.length === 0) return null;
        return (
          <section key={section.label} className="docs-axis-section">
            <div className="docs-axis-heading">
              <h2>{section.label}</h2>
            </div>
            <ul className="draft-list compact card-list">
              {docs.map(({ item, where }) => (
                <li key={item.href}>
                  <Link to={withScope(item.href, scopeId)} className="draft-card">
                    <span className="draft-card-title">{item.label}</span>
                    <span className="meta">{where || item.bucket}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {sections.length === 0 && (
        <p className="muted docs-axis-empty">{isLoading ? "Loading…" : "No published docs yet."}</p>
      )}
      <p className="muted">
        <Link to={withScope(`/docs?view=${TYPES_VIEW}`, scopeId)}>
          Browse every page by type (tutorials, how-to, reference, explanation) →
        </Link>
      </p>
    </>
  );
}
