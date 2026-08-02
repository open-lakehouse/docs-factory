// Docs right-hand aside: "On this page" (heading nav) plus, in review mode, the
// same review sections as the workspace RightPane (comments + Activity). The
// global docs nav stays on the left (DocsSidebar). Narrow screens open review
// in a Sheet drawer.

import { MessageSquare } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { useReview } from "../review/review-context";
import { useSelectionState } from "../review/selection-context";
import OnThisPage from "./OnThisPage";
import PageReviewRail from "./PageReviewRail";

interface DocAsideProps {
  articleRef: RefObject<HTMLElement | null>;
  contentRef: ContentRef;
}

export default function DocAside({ articleRef, contentRef }: DocAsideProps) {
  // canComment includes an external contributor's scoped grant, so the comment
  // rail mounts for them too — mirroring BlogReviewAside. Gating on reviewActive
  // instead (reviewer-only) left externals able to select-to-comment via
  // ReviewSurfaces but with no rail to see existing threads. The Activity
  // timeline inside PageReviewRail self-gates on reviewActive and stays hidden
  // for externals. "On this page" nav is unconditional.
  const { canComment } = useAuth();
  const { openCount, displayMode } = useReview();
  const { pending } = useSelectionState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showComments = canComment && displayMode === "rail";

  useEffect(() => {
    if (pending && showComments) setDrawerOpen(true);
  }, [pending, showComments]);

  return (
    <div className="review-rail-host">
      {/* Desktop: sticky right column. Hidden on narrow screens, where review
          opens in the Sheet drawer below. */}
      <div className="review-rail max-[960px]:hidden">
        {canComment ? <PageReviewRail articleRef={articleRef} contentRef={contentRef} /> : null}
        <div className="review-rail-body">
          <OnThisPage articleRef={articleRef} />
        </div>
      </div>

      {/* Narrow screens: floating toggle opens the review rail in a drawer. */}
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
            <SheetContent side="right" className="w-[min(22rem,92vw)] gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b">
                <SheetTitle className="font-mono text-xs uppercase tracking-[0.06em]">
                  Review
                </SheetTitle>
              </SheetHeader>
              <PageReviewRail articleRef={articleRef} contentRef={contentRef} />
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
