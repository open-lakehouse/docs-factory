import CoverageGaps from "../../components/model/CoverageGaps";
import { PlanPage } from "../plan/PlanLayout";

export default function CoveragePage() {
  return (
    <PlanPage
      title="Coverage gaps"
      intro={
        <>
          Every capability, concern, specification, and implementation in the model is page-worthy:
          it should have one explanation page that declares <code>explains: &lt;id&gt;</code>. These
          have none yet. That page is where <code>model:</code> links and the published
          concepts.json point, so until it exists they fall back to the element&apos;s external
          link.
        </>
      }
    >
      <CoverageGaps />
    </PlanPage>
  );
}
