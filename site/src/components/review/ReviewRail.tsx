// Responsive review rail: TOC + comment sidebar as an inline sticky column on
// desktop; a Sheet drawer on narrow screens (brings its own overlay, focus trap,
// and Escape-to-close). Hidden entirely when displayMode is inline
// (InlineReviewSurface handles that UX).
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
import OnThisPage from "../layout/OnThisPage";
import CommentSidebar from "./CommentSidebar";
import { useSelectionState } from "./selection-context";
import { useReview } from "./review-context";

interface ReviewRailProps {
  articleRef: RefObject<HTMLElement | null>;
}

export default function ReviewRail({ articleRef }: ReviewRailProps) {
  const { isAllowlisted } = useAuth();
  const { openCount, displayMode } = useReview();
  const { pending } = useSelectionState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (pending && displayMode === "rail") setDrawerOpen(true);
  }, [pending, displayMode]);

  if (displayMode !== "rail") return null;

  const rail = (
    <>
      <OnThisPage articleRef={articleRef} />
      <CommentSidebar articleRef={articleRef} />
    </>
  );

  return (
    <div className="review-rail-host">
      {/* Desktop: inline sticky rail in its layout column (keeps the existing
          .review-rail sticky/scroll layout). Hidden on narrow screens. */}
      <div className="review-rail max-[960px]:hidden">
        <div className="review-rail-body">{rail}</div>
      </div>

      {/* Narrow screens: a floating toggle opens the rail in a Sheet drawer. */}
      {isAllowlisted && (
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
      )}
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
          <div className="review-rail-body p-4">{rail}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
