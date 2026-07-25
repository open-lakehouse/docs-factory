// The middle pane's tab strip: one tab per open page, VS Code-style. Clicking a
// tab activates it; the × closes it. ARIA tablist so the strip is navigable.
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tabLabel } from "./tab-label";
import { useWorkspaceTabs } from "./workspace-tabs-context";

export default function TabBar() {
  const { tabs, activeToken, setActive, closeTab } = useWorkspaceTabs();
  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open pages"
      className="flex shrink-0 items-stretch overflow-x-auto border-b bg-muted/30"
    >
      {tabs.map((tab) => {
        const active = tab.token === activeToken;
        return (
          <div
            key={tab.token}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setActive(tab.token)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive(tab.token);
              }
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
