// Blog left aside: TOC + contributors always visible; review comments in rail
// mode only. Inline mode keeps the aside but comments render in the article.
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
import BlogContributors from "./BlogContributors";
import TagList from "../TagList";
import CommentSidebar from "../review/CommentSidebar";
import { useSelectionState } from "../review/selection-context";
import { useReview } from "../review/review-context";

interface BlogAsideProps {
  articleRef: RefObject<HTMLElement | null>;
  byline?: string;
  tags?: string[];
}

export default function BlogAside({ articleRef, byline, tags = [] }: BlogAsideProps) {
  const { isAllowlisted } = useAuth();
  const { openCount, displayMode } = useReview();
  const { pending } = useSelectionState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showComments = displayMode === "rail";

  useEffect(() => {
    if (pending && showComments) setDrawerOpen(true);
  }, [pending, showComments]);

  const navContent = (
    <>
      {tags.length > 0 && (
        <section className="blog-aside-tags" aria-label="Context">
          <p className="blog-aside-title">Context</p>
          <TagList tags={tags} />
        </section>
      )}
      <OnThisPage articleRef={articleRef} />
      <BlogContributors byline={byline} />
    </>
  );

  const asideContent = (
    <>
      {navContent}
      {showComments && <CommentSidebar articleRef={articleRef} />}
    </>
  );

  return (
    <div className="blog-post-aside">
      {/* Desktop: sticky left aside. Hidden on narrow screens. */}
      <div className="blog-aside-panel">
        <div className="blog-aside-body">{asideContent}</div>
      </div>

      {/* Narrow screens: TOC + contributors visible above article; comments in drawer. */}
      <div className="blog-aside-mobile">
        <div className="blog-aside-body">{navContent}</div>
      </div>

      {showComments && isAllowlisted && (
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
      {showComments && (
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
            <div className="blog-aside-body p-4">
              <CommentSidebar articleRef={articleRef} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
