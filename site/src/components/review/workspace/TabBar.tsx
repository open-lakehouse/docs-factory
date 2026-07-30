// The middle pane's tab strip, two levels:
//   1. One primary tab per open ITEM (page), VS Code-style. Clicking activates
//      the item; the × closes the whole item group. Implements the ARIA tablist
//      keyboard model over items: roving tabindex (only the active item is in the
//      tab order), ArrowLeft/Right + Home/End move focus AND activation, and
//      Delete/Backspace closes the focused item.
//   2. For the active item, a nested segmented control of its VIEWS (Rendered ·
//      Markdown · each script), shown only when the item has more than one view.
//      Sub-view labels are unprefixed — the item tab already names the page.
//
// Each item tab carries a stable id (its groupKey/rendered token) so its content
// panel can be aria-labelledby it; view panels are aria-labelledby their own tab
// ids (see ReviewTab). Focus follows activation so the roving model stays synced.
import { useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tabLabel, viewLabel } from "./tab-label";
import { groupTabDomId, tabDomId, tabPanelDomId } from "./tab-ids";
import { useWorkspaceTabs, type OpenTab } from "./workspace-tabs-context";
import { refTokenOf } from "./view-token";

interface Group {
  key: string;
  ref: OpenTab["ref"];
  tabs: OpenTab[];
}

/** Group open tabs by item (groupKey), preserving first-appearance order. */
function groupTabs(tabs: OpenTab[]): Group[] {
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const tab of tabs) {
    let g = byKey.get(tab.groupKey);
    if (!g) {
      g = { key: tab.groupKey, ref: tab.ref, tabs: [] };
      byKey.set(tab.groupKey, g);
      groups.push(g);
    }
    g.tabs.push(tab);
  }
  return groups;
}

export default function TabBar() {
  const { tabs, activeToken, setActive, closeGroup } = useWorkspaceTabs();
  const stripRef = useRef<HTMLDivElement>(null);
  if (tabs.length === 0) return null;

  const groups = groupTabs(tabs);
  const activeGroupKey = activeToken ? refTokenOf(activeToken) : null;
  const activeGroup = groups.find((g) => g.key === activeGroupKey);

  // Activating an item lands on its currently-open view if one is active,
  // otherwise its first (rendered) view — clicking a tab never loses your place.
  const activateGroup = (g: Group) => {
    const token = g.tabs.some((t) => t.token === activeToken)
      ? (activeToken as string)
      : g.tabs[0].token;
    setActive(token);
  };

  // Move focus + activation to the item at `index` (clamped), keeping roving
  // tabindex in sync (activation drives tabIndex=0, so we focus the node).
  const focusGroup = (index: number) => {
    const clamped = Math.max(0, Math.min(index, groups.length - 1));
    const g = groups[clamped];
    if (!g) return;
    activateGroup(g);
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-group-key="${CSS.escape(g.key)}"]`)
      ?.focus();
  };

  const onGroupKeyDown = (e: React.KeyboardEvent, index: number, g: Group) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusGroup(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusGroup(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusGroup(0);
        break;
      case "End":
        e.preventDefault();
        focusGroup(groups.length - 1);
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        closeGroup(g.key);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activateGroup(g);
        break;
    }
  };

  return (
    <div ref={stripRef} className="shrink-0">
      {/* Item row */}
      <div
        role="tablist"
        aria-label="Open pages"
        className="workspace-tab-strip flex items-stretch overflow-x-auto bg-muted/30"
      >
        {groups.map((g, index) => {
          const active = g.key === activeGroupKey;
          const label = tabLabel(g.ref);
          return (
            <div
              key={g.key}
              id={groupTabDomId(g.key)}
              data-group-key={g.key}
              role="tab"
              aria-selected={active}
              aria-controls={tabPanelDomId(activeGroup === g ? (activeToken as string) : g.key)}
              tabIndex={active ? 0 : -1}
              onClick={() => activateGroup(g)}
              onKeyDown={(e) => onGroupKeyDown(e, index, g)}
              className={cn(
                "workspace-tab group flex max-w-[16rem] cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                active
                  ? "bg-background font-medium text-foreground"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <button
                type="button"
                aria-label={`Close ${label}`}
                // Not a tab stop: Delete/Backspace on the item closes it.
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  closeGroup(g.key);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 aria-[selected]:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Sub-view row for the active item (only when it has more than one view). */}
      {activeGroup && activeGroup.tabs.length > 1 && (
        <div
          role="tablist"
          aria-label={`Views of ${tabLabel(activeGroup.ref)}`}
          className="workspace-subtab-strip flex items-stretch gap-1 overflow-x-auto border-b bg-background px-2 py-1"
        >
          {activeGroup.tabs.map((tab) => {
            const on = tab.token === activeToken;
            return (
              <button
                key={tab.token}
                id={tabDomId(tab.token)}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={tabPanelDomId(tab.token)}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(tab.token)}
                className={cn(
                  "shrink-0 rounded px-2 py-0.5 text-xs",
                  on
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {viewLabel(tab.view)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
