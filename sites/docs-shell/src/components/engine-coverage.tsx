// `@/components/engine-coverage` is the import path the vendored
// remark-engine-coverage emits. The emitter writes the reports, counted against
// what the site publishes, to src/generated/coverage.json.
import { EngineCoverageView, type EngineReport, EngineSupportView } from "./engine-coverage-view";

const data = import.meta.glob<{ engines: EngineReport[] }>("/src/generated/coverage.json", {
  eager: true,
  import: "default",
});
const reports: EngineReport[] = data["/src/generated/coverage.json"]?.engines ?? [];

export function EngineCoverage({ engine }: { project?: string; engine: string }) {
  const report = reports.find((r) => r.id === engine);
  return report ? <EngineCoverageView report={report} /> : null;
}

export function EngineSupport(_: { project?: string }) {
  return <EngineSupportView reports={reports} />;
}
