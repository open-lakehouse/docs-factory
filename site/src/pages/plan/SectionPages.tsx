// Thin Plan pages that frame a panel from components/plan with its heading.
import BlogPipeline from "../../components/plan/BlogPipeline";
import CompatExplorer from "../../components/plan/compat/CompatExplorer";
import ProductRollup from "../../components/plan/ProductRollup";
import { PlanPage } from "./PlanLayout";

export function CompatPage() {
  return (
    <PlanPage
      title="Compatibility"
      intro={
        <>
          Which engines and clients can do each journey, as a dataset: a row per journey and
          interface. Pivot it, list the cells, or score each interface; open a cell for the page
          whose CI-tested script proves it. “docs” means the engine&apos;s own docs say so; claims
          from draft pages are marked.
        </>
      }
    >
      <CompatExplorer />
    </PlanPage>
  );
}

export function PipelinePage() {
  return (
    <PlanPage
      title="Blog pipeline"
      intro={
        <>
          The blog backlog in priority order. Rank posts and set target release dates, including
          early <code>idea</code> folders, so the pipeline shows what&apos;s coming before it&apos;s
          drafted.
        </>
      }
    >
      <BlogPipeline />
    </PlanPage>
  );
}

export function ChangesPage() {
  return (
    <PlanPage
      title="Product changes"
      intro="Structural changes since each artifact's baseline, rolled up by product topic."
    >
      <ProductRollup />
    </PlanPage>
  );
}
