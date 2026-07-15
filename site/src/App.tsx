import { Link, Route, Routes, useParams } from "react-router-dom";
import { useTheme } from "next-themes";
import { blogPosts, findBlog, findDoc } from "./content";
import { docNav } from "./sidebar";
import MdxProvider from "./MdxProvider";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light/dark"
    >
      {resolvedTheme === "dark" ? "☀︎" : "☾"}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          docs-factory · preview
        </Link>
        <nav className="topnav">
          <Link to="/docs">Docs</Link>
          <Link to="/blog">Blog</Link>
        </nav>
        <ThemeToggle />
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

function Index() {
  return (
    <Shell>
      <h1>Preview</h1>
      <p className="muted">
        A throwaway local lens over the repo&apos;s builder-agnostic content — Diátaxis
        docs, blog drafts, and interactive LikeC4 diagrams. Nothing here edits the
        source.
      </p>
      <div className="index-grid">
        <section>
          <h2>
            <Link to="/docs">Docs</Link>
          </h2>
          <p className="muted">Diátaxis reference content under <code>content/</code>.</p>
          <ul className="draft-list compact">
            {docNav.flatMap((g) =>
              g.buckets.flatMap((b) =>
                b.items.slice(0, 3).map((item) => (
                  <li key={item.href}>
                    <Link to={item.href}>{item.label}</Link>
                    <span className="meta">{g.projectLabel} · {b.label}</span>
                  </li>
                )),
              ),
            )}
          </ul>
        </section>
        <section>
          <h2>
            <Link to="/blog">Blog</Link>
          </h2>
          <p className="muted">Narrative drafts under <code>blogs/</code>.</p>
          <ul className="draft-list compact">
            {blogPosts.slice(0, 6).map((d) => (
              <li key={d.href}>
                <Link to={d.href}>{d.frontmatter.title ?? d.slug}</Link>
                <span className="meta">
                  {d.frontmatter.status ? d.frontmatter.status : ""}
                  {d.frontmatter.date ? ` · ${d.frontmatter.date}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}

function BlogIndex() {
  return (
    <Shell>
      <h1>Blog drafts</h1>
      <ul className="draft-list">
        {blogPosts.map((d) => (
          <li key={d.href}>
            <Link to={d.href}>{d.frontmatter.title ?? d.slug}</Link>
            <span className="meta">
              {d.frontmatter.status ? `${d.frontmatter.status}` : ""}
              {d.frontmatter.date ? ` · ${d.frontmatter.date}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function DocsIndex() {
  return (
    <Shell>
      <h1>Docs</h1>
      {docNav.map((group) => (
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
      ))}
    </Shell>
  );
}

function BlogPost() {
  const { slug = "" } = useParams();
  const page = findBlog(slug);
  if (!page) {
    return (
      <Shell>
        <p>
          Not found: blog/{slug}. <Link to="/blog">Back to blog.</Link>
        </p>
      </Shell>
    );
  }
  const { Component, frontmatter } = page;
  return (
    <Shell>
      <article className="prose">
        {frontmatter.title && <h1>{frontmatter.title}</h1>}
        <MdxProvider>
          <Component />
        </MdxProvider>
      </article>
    </Shell>
  );
}

function DocPage() {
  const { project = "", bucket = "", slug = "" } = useParams();
  const page = findDoc(project, bucket, slug);
  if (!page) {
    return (
      <Shell>
        <p>
          Not found: docs/{project}/{bucket}/{slug}. <Link to="/docs">Back to docs.</Link>
        </p>
      </Shell>
    );
  }
  const { Component, frontmatter } = page;
  return (
    <Shell>
      <article className="prose">
        {frontmatter.title && <h1>{frontmatter.title}</h1>}
        <MdxProvider>
          <Component />
        </MdxProvider>
      </article>
    </Shell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/blog" element={<BlogIndex />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/docs" element={<DocsIndex />} />
      <Route path="/docs/:project/:bucket/:slug" element={<DocPage />} />
    </Routes>
  );
}
