// Docs right-hand aside: mirrors the blog aside on the docs layout. "On this
// page" (heading nav) is always present; the review controls sit on top when a
// reviewer is in review mode, and comments render below in rail mode (a Sheet
// drawer on narrow screens). The global docs nav stays on the left (DocsSidebar).
import { useEffect, useState, type RefObject } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "../../lib/auth-context";
import OnThisPage from "./OnThisPage";
import ContentEventTimeline from "../review/ContentEventTimeline";
import CommentSidebar from "../review/CommentSidebar";
import { useSelectionState } from "../review/selection-context";
import { useReview } from "../review/review-context";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";

interface DocAsideProps {
  articleRef: RefObject<HTMLElement | null>;
  contentRef: ContentRef;
}

export default function DocAside({ articleRef, contentRef }: DocAsideProps) {
  const { reviewActive } = useAuth();
  const { openCount, displayMode } = useReview();
  const { pending } = useSelectionState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showComments = reviewActive && displayMode === "rail";

  useEffect(() => {
    if (pending && showComments) setDrawerOpen(true);
  }, [pending, showComments]);

  const reviewRail = reviewActive ? (
    <section className="blog-aside-review" aria-label="Review history">
      <ContentEventTimeline contentRef={contentRef} />
    </section>
  ) : null;

  return (
    <div className="review-rail-host">
      {/* Desktop: sticky right column (On this page + review chrome). Hidden on
          narrow screens, where comments open in the Sheet drawer below. */}
      <div className="review-rail max-[960px]:hidden">
        {reviewRail}
        <div className="review-rail-body">
          <OnThisPage articleRef={articleRef} />
          {showComments && <CommentSidebar articleRef={articleRef} />}
        </div>
      </div>

      {/* Narrow screens: a floating toggle opens the comment rail in a drawer. */}
      {showComments && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open review comments"
            className="fixed right-4 bottom-[4.75rem] z-[55] hidden gap-2 rounded-full shadow-lg max-[960px]:inline-flex"
          >
            <MessageSquare className="size-4" aria-hidden />
            <span>Review</span>
            {openCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {openCount}
              </Badge>
            )}
          </Button>
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent
              side="right"
              className="w-[min(22rem,92vw)] gap-0 overflow-y-auto p-0"
            >
              <SheetHeader className="border-b">
                <SheetTitle className="font-mono text-xs uppercase tracking-[0.06em]">
                  Review
                </SheetTitle>
              </SheetHeader>
              <div className="review-rail-body p-4">
                <CommentSidebar articleRef={articleRef} />
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
