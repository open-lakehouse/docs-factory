// `@/components/engine-coverage` is the import path the vendored
// remark-engine-coverage emits. The emitter writes the reports, counted against
// what the site publishes, to src/generated/coverage.json.
import {
  CompatGridView,
  EngineCoverageView,
  type EngineReport,
  EngineSupportView,
  type GroupReport,
} from "./engine-coverage-view";

const data = import.meta.glob<{ engines: EngineReport[]; tables?: Record<string, GroupReport> }>(
  "/src/generated/coverage.json",
  { eager: true, import: "default" },
);
const generated = data["/src/generated/coverage.json"];
const reports: EngineReport[] = generated?.engines ?? [];
const tables: Record<string, GroupReport> = generated?.tables ?? {};

export function EngineCoverage({ engine }: { project?: string; engine: string }) {
  const report = reports.find((r) => r.id === engine);
  return report ? <EngineCoverageView report={report} /> : null;
}

export function EngineSupport(_: { project?: string }) {
  return <EngineSupportView reports={reports} />;
}

export function CompatGrid({ table }: { project?: string; table: string }) {
  const group = tables[table];
  return group ? <CompatGridView group={group} /> : null;
}
