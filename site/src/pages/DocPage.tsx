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
import RelatedContent from "../components/RelatedContent";
import MdxProvider from "../MdxProvider";
import { findDoc } from "../content";
import { effectiveRefIds } from "../graph";
import { docNeighbors } from "../sidebar";

export default function DocPage() {
  const { project = "", bucket = "", slug = "" } = useParams();
  const page = findDoc(project, bucket, slug);
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

  const { Component, frontmatter } = page;
  const neighbors = docNeighbors(page.href);

  return (
    <Shell
      showSidebarToggle
      wide
      accent={project === "unitycatalog" ? "unitycatalog" : "delta"}
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
