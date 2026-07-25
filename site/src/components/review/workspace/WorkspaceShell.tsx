// The review workspace's 3-column editor shell: content tree (left), tabbed
// content (middle), review pane (right). Both side columns are drag- and
// keyboard-resizable (recipe adapted from the sibling mangrove explorer). All
// open tabs stay mounted in the middle column; only the active one is visible
// and "live" (see ReviewTab).
import { type CSSProperties, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebarWidth } from "../../../lib/useSidebarWidth";
import { ExpansionProvider } from "./expansion-context";
import { WorkspaceTabsProvider, useWorkspaceTabs } from "./workspace-tabs-context";
import { RightPaneSlotContext } from "./right-pane-slot";
import ReviewTree from "./ReviewTree";
import TabBar from "./TabBar";
import ReviewTab from "./ReviewTab";
import RightPane from "./RightPane";

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

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid min-h-0 flex-1 grid-cols-[var(--left-w)_minmax(0,1fr)_var(--right-w)] overflow-hidden",
        (left.isDragging || right.isDragging) && "cursor-col-resize select-none",
      )}
      style={{ "--left-w": `${left.width}px`, "--right-w": `${right.width}px` } as CSSProperties}
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
        <div className="flex min-h-0 flex-col">
          <TabBar />
          {tabs.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
              Select a page from the tree to open it here.
            </div>
          ) : (
            tabs.map((tab) => (
              <ReviewTab
                key={tab.token}
                token={tab.token}
                contentRef={tab.ref}
                isActive={tab.token === activeToken}
              />
            ))
          )}
        </div>

        {/* Right: review pane */}
        <div className="workspace-pane-right relative flex min-h-0 flex-col bg-sidebar">
          <ResizeHandle
            side="right"
            width={right.width}
            min={right.min}
            max={right.max}
            onStart={startRightDrag}
            onKey={keyFor(right)}
            dragging={right.isDragging}
          />
          <RightPane setSlot={setRightSlot} />
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
