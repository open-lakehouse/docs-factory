// The middle pane's tab strip: one tab per open page, VS Code-style. Clicking a
// tab activates it; the × closes it. Implements the ARIA tablist keyboard model:
// roving tabindex (only the active tab is in the tab order), ArrowLeft/Right +
// Home/End move focus AND activation between tabs, Delete/Backspace closes the
// focused tab. Each tab carries a stable id so its tabpanel can be
// aria-labelledby it (see ReviewTab), and focus is moved to the newly-focused
// tab's DOM node so the roving model stays in sync with the DOM.
import { useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tabLabel } from "./tab-label";
import { tabDomId, tabPanelDomId } from "./tab-ids";
import { useWorkspaceTabs } from "./workspace-tabs-context";

export default function TabBar() {
  const { tabs, activeToken, setActive, closeTab } = useWorkspaceTabs();
  const stripRef = useRef<HTMLDivElement>(null);
  if (tabs.length === 0) return null;

  // Move focus + activation to the tab at `index` (clamped), keeping the roving
  // tabindex model in sync: activation drives tabIndex=0, so we focus the node.
  const focusTab = (index: number) => {
    const clamped = Math.max(0, Math.min(index, tabs.length - 1));
    const tab = tabs[clamped];
    if (!tab) return;
    setActive(tab.token);
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-tab-token="${CSS.escape(tab.token)}"]`)
      ?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number, token: string) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        closeTab(token);
        break;
    }
  };

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Open pages"
      className="flex shrink-0 items-stretch overflow-x-auto border-b bg-muted/30"
    >
      {tabs.map((tab, index) => {
        const active = tab.token === activeToken;
        return (
          <div
            key={tab.token}
            id={tabDomId(tab.token)}
            data-tab-token={tab.token}
            role="tab"
            aria-selected={active}
            aria-controls={tabPanelDomId(tab.token)}
            tabIndex={active ? 0 : -1}
            onClick={() => setActive(tab.token)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive(tab.token);
                return;
              }
              onKeyDown(e, index, tab.token);
            }}
            className={cn(
              "group flex max-w-[16rem] cursor-pointer items-center gap-2 border-r px-3 py-2 text-sm",
              active
                ? "bg-background font-medium text-foreground"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{tabLabel(tab.ref)}</span>
            <button
              type="button"
              aria-label={`Close ${tabLabel(tab.ref)}`}
              // Not a tab stop: Delete/Backspace on the tab closes it (see onKeyDown).
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.token);
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 aria-[selected]:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
