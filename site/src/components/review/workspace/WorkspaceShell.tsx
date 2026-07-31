// The review workspace's 3-column editor shell: content tree (left), tabbed
// content (middle), review pane (right). Both side columns are drag- and
// keyboard-resizable (recipe adapted from the sibling mangrove explorer). All
// open tabs stay mounted in the middle column; only the active one is visible
// and "live" (see ReviewTab). The right pane is collapsible (persisted); it
// auto-collapses in inline review mode where comments live in the article.
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarWidth } from "../../../lib/useSidebarWidth";
import {
  REVIEW_DISPLAY_MODE_EVENT,
  readReviewDisplayMode,
  type ReviewDisplayMode,
} from "../../../lib/review-display-mode";
import { ExpansionProvider } from "./expansion-context";
import { WorkspaceTabsProvider, useWorkspaceTabs } from "./workspace-tabs-context";
import { RightPaneSlotContext } from "./right-pane-slot";
import ReviewTree from "./ReviewTree";
import TabBar from "./TabBar";
import ReviewTab from "./ReviewTab";
import OverviewTab from "./OverviewTab";
import RightPane from "./RightPane";

const RIGHT_COLLAPSED_KEY = "docs.review.right-collapsed";

function readRightCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(RIGHT_COLLAPSED_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  // Default: collapsed in inline mode (comments live in-article).
  return readReviewDisplayMode() === "inline";
}

/** A drag/keyboard resize handle straddling a column border. */
function ResizeHandle({
  side,
  width,
  min,
  max,
  onStart,
  onKey,
  dragging,
}: {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  onStart: (e: React.PointerEvent) => void;
  onKey: (e: React.KeyboardEvent) => void;
  dragging: boolean;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: the ARIA window-splitter pattern
    // needs a focusable role="separator" with keyboard control; <hr> can't.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "Resize content tree" : "Resize review pane"}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onStart}
      onKeyDown={onKey}
      className={cn(
        "absolute inset-y-0 z-20 w-1.5 cursor-col-resize transition-colors",
        side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
        "hover:bg-primary/15 focus-visible:bg-primary/30 focus-visible:outline-none",
        dragging && "bg-primary/35",
      )}
    />
  );
}

function WorkspaceLayout() {
  const { tabs, activeToken } = useWorkspaceTabs();
  const containerRef = useRef<HTMLDivElement>(null);
  // Held in state (via a callback ref) so the active tab re-renders and portals
  // its comment view in once the slot node mounts.
  const [rightSlot, setRightSlot] = useState<HTMLDivElement | null>(null);
  const [rightCollapsed, setRightCollapsedState] = useState(readRightCollapsed);

  const setRightCollapsed = useCallback((collapsed: boolean) => {
    setRightCollapsedState(collapsed);
    window.localStorage.setItem(RIGHT_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, []);

  // Inline mode puts comments in the article, so collapse the inbox/rail column
  // automatically; rail mode expands it so the comment rail has somewhere to go.
  useEffect(() => {
    const onMode = (e: Event) => {
      const mode = (e as CustomEvent<ReviewDisplayMode>).detail;
      if (mode === "inline") setRightCollapsed(true);
      else if (mode === "rail") setRightCollapsed(false);
    };
    window.addEventListener(REVIEW_DISPLAY_MODE_EVENT, onMode);
    return () => window.removeEventListener(REVIEW_DISPLAY_MODE_EVENT, onMode);
  }, [setRightCollapsed]);

  const left = useSidebarWidth({ storageKey: "docs.review.left-w", min: 220, max: 480, default: 288 });
  const right = useSidebarWidth({ storageKey: "docs.review.right-w", min: 280, max: 640, default: 380 });

  // Left handle: width tracks the pointer's distance from the container's left.
  const startLeftDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const { left: originLeft } = container.getBoundingClientRect();
      left.setDragging(true);
      const onMove = (ev: PointerEvent) => left.setWidth(left.clamp(ev.clientX - originLeft));
      const onUp = () => {
        left.setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [left],
  );

  // Right handle: width tracks the pointer's distance from the container's right.
  const startRightDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const { right: originRight } = container.getBoundingClientRect();
      right.setDragging(true);
      const onMove = (ev: PointerEvent) => right.setWidth(right.clamp(originRight - ev.clientX));
      const onUp = () => {
        right.setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [right],
  );

  const keyFor = (w: ReturnType<typeof useSidebarWidth>) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      w.setWidth((px) => w.clamp(px - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      w.setWidth((px) => w.clamp(px + step));
    }
  };

  const rightCol = rightCollapsed ? "0px" : `${right.width}px`;

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid min-h-0 flex-1 grid-cols-[var(--left-w)_minmax(0,1fr)_var(--right-w)] overflow-hidden",
        (left.isDragging || right.isDragging) && "cursor-col-resize select-none",
      )}
      style={{ "--left-w": `${left.width}px`, "--right-w": rightCol } as CSSProperties}
    >
      {/* Left: content tree */}
      <div className="workspace-pane-left relative flex min-h-0 flex-col bg-sidebar">
        <ReviewTree />
        <ResizeHandle
          side="left"
          width={left.width}
          min={left.min}
          max={left.max}
          onStart={startLeftDrag}
          onKey={keyFor(left)}
          dragging={left.isDragging}
        />
      </div>

      {/* Middle: tab strip + all open tabs (only the active one is visible).
          The active tab portals its comment view into the right pane's slot,
          so it must sit under the slot-context provider. */}
      <RightPaneSlotContext.Provider value={rightSlot}>
        <div className="relative flex min-h-0 flex-col">
          <TabBar />
          {tabs.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
              Select Overview or a page from the tree to open it here.
            </div>
          ) : (
            tabs.map((tab) =>
              tab.kind === "overview" ? (
                <OverviewTab
                  key={tab.token}
                  token={tab.token}
                  view={tab.overviewView}
                  isActive={tab.token === activeToken}
                />
              ) : (
                <ReviewTab
                  key={tab.token}
                  token={tab.token}
                  contentRef={tab.ref}
                  view={tab.view}
                  isActive={tab.token === activeToken}
                />
              ),
            )
          )}
          {rightCollapsed && (
            <button
              type="button"
              className="workspace-pane-expand-right"
              aria-label="Show inbox"
              title="Show inbox"
              onClick={() => setRightCollapsed(false)}
            >
              <PanelRight className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {/* Right: review pane. Kept mounted when collapsed so the comment-rail
            portal slot survives; width collapses to 0 via the grid track. */}
        <div
          className={cn(
            "workspace-pane-right relative flex min-h-0 flex-col bg-sidebar",
            rightCollapsed && "pointer-events-none overflow-hidden border-l-0",
          )}
          aria-hidden={rightCollapsed || undefined}
        >
          {!rightCollapsed && (
            <ResizeHandle
              side="right"
              width={right.width}
              min={right.min}
              max={right.max}
              onStart={startRightDrag}
              onKey={keyFor(right)}
              dragging={right.isDragging}
            />
          )}
          <RightPane
            setSlot={setRightSlot}
            onCollapse={() => setRightCollapsed(true)}
            collapseDisabled={rightCollapsed}
          />
        </div>
      </RightPaneSlotContext.Provider>
    </div>
  );
}

export default function WorkspaceShell() {
  return (
    <ExpansionProvider>
      <WorkspaceTabsProvider>
        <WorkspaceLayout />
      </WorkspaceTabsProvider>
    </ExpansionProvider>
  );
}
