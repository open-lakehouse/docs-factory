// One open tab in the workspace's middle pane. Renders a single page's fully
// rendered content inside its OWN SelectionProvider + ReviewProvider (scoped to
// that page's ContentRef) with its own articleRef — the same stack the /docs and
// /blog routes mount, so the review chrome behaves identically.
//
// Every open tab stays mounted (scroll position, expanded code boxes, and the
// warm listComments cache all survive tab switches), but an INACTIVE tab is
// display:none AND passes isActive={false} to ReviewSurfaces so its fixed
// portals, CSS Custom Highlights, and document-level listeners never paint over
// the active tab (see the Phase 0 refactor).
import { useRef } from "react";
import { ContentArea, type ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { SelectionProvider } from "../selection-context";
import { ReviewProvider } from "../review-context";
import ReviewSurfaces from "../ReviewSurfaces";
import MdxProvider from "../../../MdxProvider";
import RelatedContent from "../../RelatedContent";
import { findBlog, findDoc, type ContentPage } from "../../../content";

function pageFor(ref: ContentRef): ContentPage | undefined {
  return ref.area === ContentArea.BLOGS
    ? findBlog(ref.slug)
    : findDoc(ref.project ?? "", ref.bucket ?? "", ref.slug);
}

export default function ReviewTab({
  contentRef,
  isActive,
}: {
  contentRef: ContentRef;
  isActive: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const page = pageFor(contentRef);

  return (
    <SelectionProvider>
      <ReviewProvider contentRef={contentRef}>
        {/* Kept mounted when inactive (preserve scroll/DOM) but visually hidden. */}
        <div className="min-h-0 flex-1 overflow-y-auto" hidden={!isActive}>
          {page ? (
            <article className="prose mx-auto max-w-3xl px-6 py-8" ref={articleRef}>
              {page.frontmatter.title && <h1>{page.frontmatter.title}</h1>}
              {page.frontmatter.summary && (
                <p className="lead muted">{page.frontmatter.summary}</p>
              )}
              <MdxProvider>
                <page.Component />
              </MdxProvider>
              <RelatedContent page={page} />
            </article>
          ) : (
            <p className="p-6 text-muted-foreground">Content not found: {contentRef.slug}</p>
          )}
        </div>
        <ReviewSurfaces contentRef={contentRef} articleRef={articleRef} isActive={isActive} />
      </ReviewProvider>
    </SelectionProvider>
  );
}
