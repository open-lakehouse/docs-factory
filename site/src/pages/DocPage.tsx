import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import DocsSidebar from "../components/layout/DocsSidebar";
import ReviewRail from "../components/review/ReviewRail";
import InlineReviewSurface from "../components/review/InlineReviewSurface";
import SelectionLayer from "../components/review/SelectionLayer";
import SourceFileLauncher from "../components/review/SourceFileLauncher";
import { SelectionProvider } from "../components/review/selection-context";
import { ReviewProvider } from "../components/review/review-context";
import ReviewControls from "../components/review/ReviewControls";
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
          Not found: docs/{project}/{bucket}/{slug}. <Link to="/reference">Back to reference.</Link>
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
          Not found: docs/{project}/{bucket}/{slug}. <Link to="/reference">Back to reference.</Link>
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
          <article className="prose" ref={articleRef}>
            {frontmatter.title && <h1>{frontmatter.title}</h1>}
            {frontmatter.summary && (
              <p className="lead muted">{frontmatter.summary}</p>
            )}
            <ReviewControls contentRef={docRef(project, bucket, slug)} />
            <ConceptHeader references={effectiveRefIds(page)} />
            <MdxProvider>
              <Component />
            </MdxProvider>
            {frontmatter.explains && (
              <ModelContext id={frontmatter.explains} selfHref={page.href} />
            )}
            <RelatedContent page={page} />
          </article>
          <Pager
            prev={neighbors.prev ? { label: neighbors.prev.label, href: neighbors.prev.href } : undefined}
            next={neighbors.next ? { label: neighbors.next.label, href: neighbors.next.href } : undefined}
          />
        </div>
        <ReviewRail articleRef={articleRef} />
        <InlineReviewSurface articleRef={articleRef} />
        <SelectionLayer articleRef={articleRef} />
        <SourceFileLauncher contentRef={docRef(project, bucket, slug)} articleRef={articleRef} />
      </div>
      </ReviewProvider>
      </SelectionProvider>
    </Shell>
  );
}
