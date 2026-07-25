import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import DocsSidebar from "../components/layout/DocsSidebar";
import DocAside from "../components/layout/DocAside";
import OnThisPage from "../components/layout/OnThisPage";
import ReviewSurfaces from "../components/review/ReviewSurfaces";
import { SelectionProvider } from "../components/review/selection-context";
import { ReviewProvider } from "../components/review/review-context";
import { docRef } from "../lib/content-ref";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import ConceptHeader from "../components/ConceptHeader";
import ModelContext from "../components/ModelContext";
import RelatedContent from "../components/RelatedContent";
import MdxProvider from "../MdxProvider";
import { findDoc } from "../content";
import { effectiveRefIds } from "../graph";
import { useDocNeighbors } from "../sidebar";
import { useContentVisibility } from "../lib/content-visibility";

export default function DocPage() {
  const { project = "", bucket = "", slug = "" } = useParams();
  const page = findDoc(project, bucket, slug);
  const vis = useContentVisibility();
  const neighbors = useDocNeighbors(page?.href ?? "");
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

  // Route guard: direct-URL access to an unpublished doc. Visibility is
  // DB-canonical (listDrafts), so we wait for it to resolve before deciding —
  // rendering the draft first and hiding it after would leak content. Anonymous
  // viewers hitting a draft URL get the same "Not found" as a bad slug;
  // allowlisted viewers pass straight through.
  if (vis.isLoading) {
    return (
      <Shell showSidebarToggle wide>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }
  if (!vis.isVisible(page)) {
    return (
      <Shell showSidebarToggle wide>
        <p>
          Not found: docs/{project}/{bucket}/{slug}. <Link to="/docs">Back to docs.</Link>
        </p>
      </Shell>
    );
  }

  const { Component, frontmatter } = page;

  return (
    <Shell
      showSidebarToggle
      wide
      accent={
        project === "unitycatalog"
          ? "unitycatalog"
          : project === "delta"
            ? "delta"
            : undefined // open-lakehouse (estate scope) carries no product accent
      }
    >
      <SelectionProvider>
      <ReviewProvider contentRef={docRef(project, bucket, slug)}>
      <div className="docs-grid">
        <DocsSidebar activeProject={project} activeBucket={bucket} activeSlug={slug} />
        <div className="docs-main">
          {/* Narrow screens: heading nav above the article (desktop shows it in
              the right aside instead). */}
          <div className="docs-aside-mobile">
            <OnThisPage articleRef={articleRef} />
          </div>
          <article className="prose" ref={articleRef}>
            {frontmatter.title && <h1>{frontmatter.title}</h1>}
            {frontmatter.summary && (
              <p className="lead muted">{frontmatter.summary}</p>
            )}
            <ConceptHeader references={effectiveRefIds(page)} />
            {frontmatter.explains && (
              <ModelContext id={frontmatter.explains} slot="summary" />
            )}
            <MdxProvider>
              <Component />
            </MdxProvider>
            {frontmatter.explains && (
              <ModelContext id={frontmatter.explains} selfHref={page.href} slot="context" />
            )}
            <RelatedContent page={page} />
          </article>
          <Pager
            prev={neighbors.prev ? { label: neighbors.prev.label, href: neighbors.prev.href } : undefined}
            next={neighbors.next ? { label: neighbors.next.label, href: neighbors.next.href } : undefined}
          />
        </div>
        <DocAside articleRef={articleRef} contentRef={docRef(project, bucket, slug)} />
        <ReviewSurfaces contentRef={docRef(project, bucket, slug)} articleRef={articleRef} />
      </div>
      </ReviewProvider>
      </SelectionProvider>
    </Shell>
  );
}
