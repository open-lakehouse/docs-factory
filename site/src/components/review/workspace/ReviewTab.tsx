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
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContentArea, type ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { SelectionProvider } from "../selection-context";
import { ReviewProvider } from "../review-context";
import ReviewSurfaces from "../ReviewSurfaces";
import CommentSidebar from "../CommentSidebar";
import { ScrollContainerProvider } from "../scroll-container-context";
import { useRightPaneSlot } from "./right-pane-slot";
import { useDeepLinkTarget } from "./use-deep-link-target";
import { tabDomId, tabPanelDomId } from "./tab-ids";
import ReviewTabChrome from "./ReviewTabChrome";
import MdxProvider from "../../../MdxProvider";
import RelatedContent from "../../RelatedContent";
import { findBlog, findDoc, type ContentPage } from "../../../content";
import { cn } from "@/lib/utils";

function pageFor(ref: ContentRef): ContentPage | undefined {
  return ref.area === ContentArea.BLOGS
    ? findBlog(ref.slug)
    : findDoc(ref.project ?? "", ref.bucket ?? "", ref.slug);
}

/** A CSS-custom-ident-safe key from a tab token (which contains `:` etc.). */
function highlightKeyFor(token: string): string {
  return token.replace(/[^A-Za-z0-9_-]/g, "_");
}

export default function ReviewTab({
  token,
  contentRef,
  isActive,
}: {
  token: string;
  contentRef: ContentRef;
  isActive: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  // The scroll pane element, held in state so ScrollContainerProvider and the
  // deep-link hook re-run once it mounts (a bare ref stays null on first render).
  const [scrollPane, setScrollPane] = useState<HTMLDivElement | null>(null);
  const page = pageFor(contentRef);

  return (
    <SelectionProvider>
      <ReviewProvider contentRef={contentRef} isActive={isActive}>
        <ScrollContainerProvider container={scrollPane}>
          <ReviewTabBody
            token={token}
            contentRef={contentRef}
            isActive={isActive}
            page={page}
            articleRef={articleRef}
            setScrollPane={setScrollPane}
            scrollPane={scrollPane}
            highlightKey={highlightKeyFor(token)}
          />
        </ScrollContainerProvider>
      </ReviewProvider>
    </SelectionProvider>
  );
}

// Inner body: lives under this tab's ReviewProvider so the deep-link hook (which
// reads useReview) and the portaled comment rail both see this tab's state.
function ReviewTabBody({
  token,
  contentRef,
  isActive,
  page,
  articleRef,
  setScrollPane,
  scrollPane,
  highlightKey,
}: {
  token: string;
  contentRef: ContentRef;
  isActive: boolean;
  page: ContentPage | undefined;
  articleRef: React.RefObject<HTMLElement | null>;
  setScrollPane: (el: HTMLDivElement | null) => void;
  scrollPane: HTMLDivElement | null;
  highlightKey: string;
}) {
  const slot = useRightPaneSlot();
  useDeepLinkTarget({ isActive, articleRef, container: scrollPane });

  return (
    <>
      {/* The tabpanel for this tab, tied to its tab in the strip (aria-labelledby)
          for the ARIA tablist relationship. Kept mounted when inactive (preserve
          scroll/DOM) but visually hidden; only the active panel is a tab stop so
          focus can move from the tab into its content. Chrome sits above the
          scroll pane as a flex sibling so it stays put while the article scrolls. */}
      <div
        id={tabPanelDomId(token)}
        role="tabpanel"
        aria-labelledby={tabDomId(token)}
        tabIndex={isActive ? 0 : -1}
        className={cn(
          "flex min-h-0 flex-1 flex-col focus-visible:outline-none",
          !isActive && "hidden",
        )}
        hidden={!isActive}
      >
        {page && <ReviewTabChrome contentRef={contentRef} page={page} />}
        <div ref={setScrollPane} className="min-h-0 flex-1 overflow-y-auto">
          {page ? (
            <article className="prose mx-auto max-w-3xl px-6 py-8" ref={articleRef}>
              {page.frontmatter.title && <h1>{page.frontmatter.title}</h1>}
              {page.frontmatter.summary && <p className="lead muted">{page.frontmatter.summary}</p>}
              <MdxProvider>
                <page.Component />
              </MdxProvider>
              <RelatedContent page={page} />
            </article>
          ) : (
            <p className="p-6 text-muted-foreground">Content not found: {contentRef.slug}</p>
          )}
        </div>
      </div>
      <ReviewSurfaces
        contentRef={contentRef}
        articleRef={articleRef}
        isActive={isActive}
        highlightKey={highlightKey}
      />
      {/* The active tab's comment rail lives in the right pane. Portaled from
          inside this tab's ReviewProvider, so it reads THIS tab's threads,
          selection, and articleRef — the right pane follows the active tab
          with no cross-provider state lifting. */}
      {isActive &&
        slot &&
        createPortal(
          <div className="review-rail-body p-3">
            <CommentSidebar articleRef={articleRef} />
          </div>,
          slot,
        )}
    </>
  );
}
