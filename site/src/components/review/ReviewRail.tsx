// Responsive review rail: TOC + comment sidebar on desktop; drawer on narrow screens.
// Must be rendered inside a ReviewProvider (reads open-thread count from it).
import { useEffect, useState, type RefObject } from "react";
import { MessageSquare } from "lucide-react";
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
  const { openCount } = useReview();
  const { pending } = useSelectionState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // On narrow screens the rail is a drawer — open it when a selection composer appears.
  useEffect(() => {
    if (pending) setDrawerOpen(true);
  }, [pending]);

  const rail = (
    <>
      <OnThisPage articleRef={articleRef} />
      <CommentSidebar articleRef={articleRef} />
    </>
  );

  return (
    <div className="review-rail-host">
      {isAllowlisted && (
        <button
          type="button"
          className="review-drawer-toggle"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open review comments"
        >
          <MessageSquare size={16} aria-hidden />
          <span>Review</span>
          {openCount > 0 && <span className="review-count">{openCount}</span>}
        </button>
      )}
      {drawerOpen && (
        <button
          type="button"
          className="review-drawer-backdrop"
          aria-label="Close review comments"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div className={`review-rail${drawerOpen ? " review-rail-open" : ""}`}>
        {drawerOpen && (
          <div className="review-drawer-head">
            <span>Review</span>
            <button
              type="button"
              className="review-drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
        <div className="review-rail-body">{rail}</div>
      </div>
    </div>
  );
}
