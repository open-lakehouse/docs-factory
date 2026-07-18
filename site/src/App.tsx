import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import {
  blogPosts,
  blogsBySeries,
  blogNeighbors,
  blogTags,
  findBlog,
  findDoc,
  readingTimeMinutes,
} from "./content";
import DocsSidebar from "./components/layout/DocsSidebar";
import Breadcrumbs from "./components/layout/Breadcrumbs";
import OnThisPage from "./components/layout/OnThisPage";
import Pager from "./components/layout/Pager";
import Shell from "./components/layout/Shell";
import TerminalHero from "./components/TerminalHero";
import BlogTable from "./components/BlogTable";
import ConceptHeader from "./components/ConceptHeader";
import { docNav, docNeighbors, firstDocForProject } from "./sidebar";
import MdxProvider from "./MdxProvider";
import { ExplainIndex, ExplainPage } from "./ExplainPage";

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

function BlogReadingTime({
  articleRef,
}: {
  articleRef: React.RefObject<HTMLElement | null>;
}) {
  const [minutes, setMinutes] = useState(1);

  useEffect(() => {
    const text = articleRef.current?.textContent ?? "";
    if (text) setMinutes(readingTimeMinutes(text));
  }, [articleRef]);

  return <span>{minutes} min read</span>;
}

function Index() {
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

function DocsIndex() {
  return (
    <Shell showSidebarToggle wide>
      <div className="docs-grid docs-grid-index">
        <DocsSidebar />
        <div className="docs-main">
          <h1>Documentation</h1>
          <p className="muted">
            Engine-neutral reference organized by Diátaxis — explanation, tutorials,
            how-to guides, and reference.
          </p>
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
        </div>
      </div>
    </Shell>
  );
}

function DocPage() {
  const { project = "", bucket = "", slug = "" } = useParams();
  const page = findDoc(project, bucket, slug);
  const articleRef = useRef<HTMLElement>(null);

  if (!page) {
    return (
      <Shell showSidebarToggle wide>
        <p>
          Not found: docs/{project}/{bucket}/{slug}. <Link to="/docs">Back to docs.</Link>
        </p>
      </Shell>
    );
  }

  const { Component, frontmatter } = page;
  const neighbors = docNeighbors(page.href);
  const group = docNav.find((g) => g.project === project);
  const activeBucket = group?.buckets.find((b) => b.bucket === bucket);
  const bucketLabel = activeBucket?.label ?? bucket;
  const projectLabel = group?.projectLabel ?? page.project ?? project;

  // Sibling menus: other projects, other buckets in this project, and other
  // pages in this bucket (the leaf) — so any crumb can hop to its siblings.
  const projectSiblings = docNav
    .map((g) => ({ label: g.projectLabel, href: g.buckets[0]?.items[0]?.href }))
    .filter((s): s is { label: string; href: string } => Boolean(s.href));
  const projectActiveHref = group?.buckets[0]?.items[0]?.href;
  const bucketSiblings =
    group?.buckets
      .map((b) => ({ label: b.label, href: b.items[0]?.href }))
      .filter((s): s is { label: string; href: string } => Boolean(s.href)) ?? [];
  const bucketActiveHref = activeBucket?.items[0]?.href;
  const pageSiblings =
    activeBucket?.items.map((it) => ({ label: it.label, href: it.href })) ?? [];

  return (
    <Shell
      showSidebarToggle
      wide
      accent={project === "unitycatalog" ? "unitycatalog" : "delta"}
    >
      <div className="docs-grid">
        <DocsSidebar
          activeProject={project}
          activeBucket={bucket}
          activeSlug={slug}
        />
        <div className="docs-main">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Docs", href: "/docs" },
              {
                label: projectLabel,
                href: "/docs",
                siblings: projectSiblings,
                activeHref: projectActiveHref,
              },
              {
                label: bucketLabel,
                siblings: bucketSiblings,
                activeHref: bucketActiveHref,
              },
              {
                label: frontmatter.title ?? slug,
                siblings: pageSiblings,
                activeHref: page.href,
              },
            ]}
          />
          <article className="prose" ref={articleRef}>
            {frontmatter.title && <h1>{frontmatter.title}</h1>}
            {frontmatter.summary && (
              <p className="lead muted">{frontmatter.summary}</p>
            )}
            <ConceptHeader references={frontmatter.references} />
            <MdxProvider>
              <Component />
            </MdxProvider>
          </article>
          <Pager
            prev={
              neighbors.prev
                ? { label: neighbors.prev.label, href: neighbors.prev.href }
                : undefined
            }
            next={
              neighbors.next
                ? { label: neighbors.next.label, href: neighbors.next.href }
                : undefined
            }
          />
        </div>
        <OnThisPage articleRef={articleRef} />
      </div>
    </Shell>
  );
}

function BlogIndex() {
  const { series, standalone } = blogsBySeries();
  const allTags = blogTags();

  return (
    <Shell wide>
      <h1>Blog</h1>
      <p className="muted">
        Narrative drafts on the Open Lakehouse — architecture, governance, and building
        on open formats.
      </p>

      {allTags.length > 0 && (
        <div className="blog-tags-section">
          <p className="blog-tags-label">Topics</p>
          <TagList tags={allTags} />
        </div>
      )}

      <BlogTable series={series} standalone={standalone} />
    </Shell>
  );
}

function BlogPost() {
  const { slug = "" } = useParams();
  const page = findBlog(slug);
  const articleRef = useRef<HTMLElement>(null);

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
  const neighbors = blogNeighbors(slug);

  // Sibling posts for the leaf crumb: same series if this post is in one,
  // otherwise the other standalone posts.
  const siblingPosts = frontmatter.series
    ? blogPosts.filter((p) => p.frontmatter.series === frontmatter.series)
    : blogPosts.filter((p) => !p.frontmatter.series);
  const postSiblings = siblingPosts.map((p) => ({
    label: p.frontmatter.title ?? p.slug,
    href: p.href,
  }));

  return (
    <Shell wide>
      <div className="blog-post-layout">
        <div className="blog-post-main">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Blog", href: "/blog" },
              {
                label: frontmatter.title ?? slug,
                siblings: postSiblings,
                activeHref: page.href,
              },
            ]}
          />
          <header className="blog-post-header">
            {frontmatter.series && (
              <p className="blog-post-series">{frontmatter.series}</p>
            )}
            {frontmatter.title && <h1>{frontmatter.title}</h1>}
            <div className="blog-post-meta">
              {frontmatter.author && <span>{frontmatter.author}</span>}
              {frontmatter.date && <span>{frontmatter.date}</span>}
              {frontmatter.status && (
                <span className="blog-post-status">{frontmatter.status}</span>
              )}
              <BlogReadingTime articleRef={articleRef} />
            </div>
            <TagList tags={frontmatter.tags ?? []} />
          </header>
          <ConceptHeader references={frontmatter.references} />
          <article className="prose" ref={articleRef}>
            <MdxProvider>
              <Component />
            </MdxProvider>
          </article>
          <Pager
            prev={
              neighbors.prev
                ? {
                    label: neighbors.prev.frontmatter.title ?? neighbors.prev.slug,
                    href: neighbors.prev.href,
                  }
                : undefined
            }
            next={
              neighbors.next
                ? {
                    label: neighbors.next.frontmatter.title ?? neighbors.next.slug,
                    href: neighbors.next.href,
                  }
                : undefined
            }
          />
        </div>
        <OnThisPage articleRef={articleRef} />
      </div>
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
      <Route path="/explain" element={<ExplainIndex />} />
      <Route path="/explain/:elementId" element={<ExplainPage />} />
    </Routes>
  );
}
