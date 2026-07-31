// One Overview panel in the workspace middle pane. Mirrors ReviewTab's tabpanel
// shell (ARIA ids, keep-mounted / hide-when-inactive) but hosts the blog
// pipeline or ProductChanges rollup instead of a content page.
import { cn } from "@/lib/utils";
import BlogPipeline from "../BlogPipeline";
import ProductRollup from "../ProductRollup";
import { tabDomId, tabPanelDomId } from "./tab-ids";
import {
  overviewViewLabel,
  type OverviewView,
} from "./overview-token";

export default function OverviewTab({
  token,
  view,
  isActive,
}: {
  token: string;
  view: OverviewView;
  isActive: boolean;
}) {
  return (
    <div
      id={tabPanelDomId(token)}
      role="tabpanel"
      aria-labelledby={tabDomId(token)}
      aria-label={overviewViewLabel(view)}
      className={cn(
        "overview-tab-panel flex min-h-0 flex-1 flex-col overflow-y-auto",
        !isActive && "hidden",
      )}
    >
      <div className="overview-tab-body">
        {view === "pipeline" ? (
          <BlogPipeline heading="" showIntro={false} />
        ) : (
          <section aria-label="What changed by product">
            <h1>Product changes</h1>
            <p className="muted">
              Structural changes since each artifact&apos;s baseline, rolled up
              by product topic.
            </p>
            <ProductRollup />
          </section>
        )}
      </div>
    </div>
  );
}
