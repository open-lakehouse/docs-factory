import { Link } from "react-router-dom";
import Shell from "../components/layout/Shell";
import TerminalHero from "../components/TerminalHero";
import { blogPosts } from "../content";
import { useContentVisibility } from "../lib/content-visibility";
import { useFirstVisibleDocForProject, useVisibleDocNav } from "../sidebar";

export default function Index() {
  const vis = useContentVisibility();
  // Product-card targets and the "Start reading" list are overview surfaces, so
  // they follow the same viewer rule as the sidebar — anonymous viewers only
  // ever land on published docs.
  const { nav: visibleNav } = useVisibleDocNav();
  const deltaEntry = useFirstVisibleDocForProject("delta");
  const ucEntry = useFirstVisibleDocForProject("unitycatalog");
  const featuredDocs = visibleNav
    .flatMap((g) => g.buckets.flatMap((b) => b.items.slice(0, 1)))
    .slice(0, 4);
  // "Latest from the blog" is an overview surface, so it obeys the same viewer
  // visibility rule as the blog index — anonymous viewers see only published
  // posts. The frontmatter status meta line is likewise reviewer-only.
  const latestPosts = vis.filterVisible(blogPosts).slice(0, 4);

  return (
    <Shell wide>
      <TerminalHero />

      <section className="product-grid">
        <Link
          to={deltaEntry?.href ?? "/docs"}
          className="product-card"
          data-accent="delta"
        >
          <h2>delta/</h2>
          <p className="muted">
            Open table format — ACID transactions, time travel, schema enforcement.
          </p>
          <span className="product-card-link">cd delta →</span>
        </Link>
        <Link
          to={ucEntry?.href ?? "/docs"}
          className="product-card"
          data-accent="unitycatalog"
        >
          <h2>unitycatalog/</h2>
          <p className="muted">
            Open lakehouse catalog — unified governance across engines.
          </p>
          <span className="product-card-link">cd unitycatalog →</span>
        </Link>
      </section>

      <div className="index-grid">
        <section>
          <h2 className="section-heading">
            <Link to="/docs">Start reading</Link>
          </h2>
          <p className="muted">Diátaxis content under <code>content/</code>.</p>
          <ul className="draft-list compact card-list">
            {featuredDocs.map((item) => (
              <li key={item.href}>
                <Link to={item.href} className="draft-card">
                  <span className="draft-card-title">{item.label}</span>
                  <span className="meta">
                    {item.project} · {item.bucket}
                  </span>
                </Link>
              </li>
            ))}
            {!vis.isLoading && featuredDocs.length === 0 && (
              <li className="muted">No published docs yet.</li>
            )}
          </ul>
        </section>
        <section>
          <h2 className="section-heading">
            <Link to="/blog">Latest from the blog</Link>
          </h2>
          <p className="muted">Narrative drafts under <code>blogs/</code>.</p>
          <ul className="draft-list compact card-list">
            {latestPosts.map((d) => (
              <li key={d.href}>
                <Link to={d.href} className="draft-card">
                  <span className="draft-card-title">{d.frontmatter.title ?? d.slug}</span>
                  <span className="meta">
                    {vis.showStatusColumns ? vis.statusFor(d).frontmatter : ""}
                  </span>
                </Link>
              </li>
            ))}
            {!vis.isLoading && latestPosts.length === 0 && (
              <li className="muted">No published posts yet.</li>
            )}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
