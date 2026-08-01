// The workspace's right column. Holds:
//   1. A portal slot the ACTIVE tab fills with its own comment view (from
//      inside that tab's ReviewProvider).
//   2. Per-page Activity for the active content tab.
// Cross-tab inbox (latest comments) lives on Overview → Latest comments;
// requested-from-me lives on the left tree (UserCheck indicators).
import { PanelRightClose } from "lucide-react";
import ContentEventTimeline from "../ContentEventTimeline";
import { useWorkspaceTabs } from "./workspace-tabs-context";

export default function RightPane({
  setSlot,
  onCollapse,
  collapseDisabled = false,
}: {
  setSlot: (el: HTMLDivElement | null) => void;
  onCollapse?: () => void;
  collapseDisabled?: boolean;
}) {
  const { tabs, activeToken } = useWorkspaceTabs();
  const activeTab = tabs.find((tab) => tab.token === activeToken);
  const activeRef = activeTab?.kind === "content" ? activeTab.ref : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {onCollapse && (
        <div className="flex justify-end px-3 pt-2">
          <button
            type="button"
            className="workspace-pane-collapse-right"
            aria-label="Hide right pane"
            title="Hide right pane"
            onClick={onCollapse}
            tabIndex={collapseDisabled ? -1 : 0}
          >
            <PanelRightClose className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* Active tab's comment view renders here via portal — it follows the
          active tab (see ReviewTab + right-pane-slot). */}
      <div ref={setSlot} className="workspace-section-divider empty:hidden" />

      {activeRef && (
        <section className="workspace-activity">
          <ContentEventTimeline contentRef={activeRef} heading="Activity" />
        </section>
      )}
    </div>
  );
}
