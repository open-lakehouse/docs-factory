// Blog right aside in review mode: same review sections as the workspace
// RightPane (comments + Activity). Narrow screens open the same body in a Sheet.
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
import { useSelectionState } from "../review/selection-context";
import { useReview } from "../review/review-context";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import PageReviewRail from "./PageReviewRail";

interface BlogReviewAsideProps {
  articleRef: RefObject<HTMLElement | null>;
  contentRef: ContentRef;
}

export default function BlogReviewAside({
  articleRef,
  contentRef,
}: BlogReviewAsideProps) {
  const { reviewActive } = useAuth();
  const { openCount, displayMode } = useReview();
  const { pending } = useSelectionState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showComments = displayMode === "rail";

  useEffect(() => {
    if (pending && showComments) setDrawerOpen(true);
  }, [pending, showComments]);

  if (!reviewActive) return null;

  const reviewContent = (
    <PageReviewRail articleRef={articleRef} contentRef={contentRef} />
  );

  return (
    <aside className="blog-review-aside" aria-label="Review">
      <div className="blog-review-panel">
        <div className="blog-aside-body">{reviewContent}</div>
      </div>

      {showComments && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open review comments"
            className="fixed right-4 bottom-4 z-[55] hidden gap-2 rounded-full shadow-lg max-[960px]:inline-flex"
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
              <div className="blog-aside-body p-0">{reviewContent}</div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </aside>
  );
}
