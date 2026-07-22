import { Link } from "react-router-dom";
import Shell from "../components/layout/Shell";
import TerminalHero from "../components/TerminalHero";
import { blogPosts } from "../content";
import { docNav, firstDocForProject } from "../sidebar";

export default function Index() {
  const deltaEntry = firstDocForProject("delta");
  const ucEntry = firstDocForProject("unitycatalog");
  const featuredDocs = docNav
    .flatMap((g) => g.buckets.flatMap((b) => b.items.slice(0, 1)))
    .slice(0, 4);

  return (
    <Shell wide>
      <TerminalHero />

      <section className="product-grid">
        <Link
          to={deltaEntry?.href ?? "/reference"}
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
          to={ucEntry?.href ?? "/reference"}
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
            <Link to="/reference">Start reading</Link>
          </h2>
          <p className="muted">Diátaxis reference content under <code>content/</code>.</p>
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
          </ul>
        </section>
        <section>
          <h2 className="section-heading">
            <Link to="/blog">Latest from the blog</Link>
          </h2>
          <p className="muted">Narrative drafts under <code>blogs/</code>.</p>
          <ul className="draft-list compact card-list">
            {blogPosts.slice(0, 4).map((d) => (
              <li key={d.href}>
                <Link to={d.href} className="draft-card">
                  <span className="draft-card-title">{d.frontmatter.title ?? d.slug}</span>
                  <span className="meta">
                    {d.frontmatter.status ?? ""}
                    {d.frontmatter.date ? ` · ${d.frontmatter.date}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
