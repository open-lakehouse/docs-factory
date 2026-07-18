import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import DocsSidebar from "../components/layout/DocsSidebar";
import Breadcrumbs from "../components/layout/Breadcrumbs";
import OnThisPage from "../components/layout/OnThisPage";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import ConceptHeader from "../components/ConceptHeader";
import MdxProvider from "../MdxProvider";
import { findDoc } from "../content";
import { docNav, docNeighbors } from "../sidebar";

export default function DocPage() {
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
        <DocsSidebar activeProject={project} activeBucket={bucket} activeSlug={slug} />
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
            prev={neighbors.prev ? { label: neighbors.prev.label, href: neighbors.prev.href } : undefined}
            next={neighbors.next ? { label: neighbors.next.label, href: neighbors.next.href } : undefined}
          />
        </div>
        <OnThisPage articleRef={articleRef} />
      </div>
    </Shell>
  );
}
