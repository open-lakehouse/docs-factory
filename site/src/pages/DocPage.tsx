import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ConceptHeader from "../components/ConceptHeader";
import DocAside from "../components/layout/DocAside";
import DocsSidebar from "../components/layout/DocsSidebar";
import OnThisPage from "../components/layout/OnThisPage";
import Pager from "../components/layout/Pager";
import Shell from "../components/layout/Shell";
import ModelContext from "../components/ModelContext";
import RelatedContent from "../components/RelatedContent";
import ReviewPageChrome from "../components/review/ReviewPageChrome";
import ReviewSurfaces from "../components/review/ReviewSurfaces";
import { ReviewProvider } from "../components/review/review-context";
import { ScrollContainerProvider } from "../components/review/scroll-container-context";
import { SelectionProvider } from "../components/review/selection-context";
import { findDoc } from "../content";
import { effectiveRefIds } from "../graph";
import { docRef } from "../lib/content-ref";
import { useContentVisibility } from "../lib/content-visibility";
import MdxProvider from "../MdxProvider";
import { useDocNeighbors } from "../sidebar";

export default function DocPage() {
  const { project = "", bucket = "", slug = "" } = useParams();
  const page = findDoc(project, bucket, slug);
  const vis = useContentVisibility();
  const neighbors = useDocNeighbors(page?.href ?? "");
  const articleRef = useRef<HTMLElement>(null);
  // Held in state (not just a ref) so ScrollContainerProvider re-renders when
  // the article scroll pane mounts — ThreadCard / TOC jumps need that element.
  const [scrollPane, setScrollPane] = useState<HTMLDivElement | null>(null);
  const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(
    () => () => {
      if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    },
    [],
  );

  function handleContentScroll() {
    setIsScrolling(true);
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = setTimeout(() => setIsScrolling(false), 650);
  }

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
  const contentRef = docRef(project, bucket, slug);

  return (
    <Shell
      showSidebarToggle
      wide
      accent={
        project === "unitycatalog" ? "unitycatalog" : project === "delta" ? "delta" : undefined // open-lakehouse (estate scope) carries no product accent
      }
    >
      <SelectionProvider>
        <ReviewProvider contentRef={contentRef}>
          <ScrollContainerProvider container={scrollPane}>
            <div className="docs-grid">
              <DocsSidebar activeProject={project} activeBucket={bucket} activeSlug={slug} />
              <div className="docs-main">
                <ReviewPageChrome contentRef={contentRef} page={page} />
                <div
                  ref={setScrollPane}
                  className={isScrolling ? "docs-main-scroll is-scrolling" : "docs-main-scroll"}
                  onScroll={handleContentScroll}
                >
                  {/* Narrow screens: heading nav above the article (desktop shows it in
                the right aside instead). */}
                  <div className="docs-aside-mobile">
                    <OnThisPage articleRef={articleRef} />
                  </div>
                  <article className="prose" ref={articleRef}>
                    {frontmatter.title && <h1>{frontmatter.title}</h1>}
                    {frontmatter.summary && <p className="lead muted">{frontmatter.summary}</p>}
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
              </div>
              <DocAside articleRef={articleRef} contentRef={contentRef} />
              <ReviewSurfaces contentRef={contentRef} articleRef={articleRef} />
            </div>
          </ScrollContainerProvider>
        </ReviewProvider>
      </SelectionProvider>
    </Shell>
  );
}
