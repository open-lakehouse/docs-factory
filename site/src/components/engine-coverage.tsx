// `@/components/engine-coverage` is the import path remark-engine-coverage
// emits. The review preview counts draft claims and links review routes.

import { matrices } from "@/compat";
import { coverageReports, tableReports } from "@/content-core/coverage.mjs";
import { docRef, refHref } from "@/lib/content-ref";
import { useScriptsIndex } from "@/lib/scripts-index";
import {
  CompatGridView,
  EngineCoverageView,
  type EngineReport,
  EngineSupportView,
  type GroupReport,
} from "./engine-coverage-view";

function useOptions() {
  const { scripts } = useScriptsIndex();
  const urls = new Map(scripts.map((s) => [s.gitPath, s.fetchUrl]));
  return {
    href: (page: { project: string; bucket: string; slug: string }, anchor: string | null) =>
      refHref(docRef(page.project, page.bucket, page.slug), anchor ?? undefined),
    scriptUrl: (gitPath: string) => urls.get(gitPath) ?? null,
    drafts: true,
  };
}

function useReports(project: string): EngineReport[] {
  const options = useOptions();
  const matrix = matrices.find((m) => m.project === project);
  return matrix ? (coverageReports(matrix, options) as EngineReport[]) : [];
}

export function EngineCoverage({ project, engine }: { project: string; engine: string }) {
  const report = useReports(project).find((r) => r.id === engine);
  return report ? <EngineCoverageView report={report} /> : null;
}

export function EngineSupport({ project }: { project: string }) {
  return <EngineSupportView reports={useReports(project)} />;
}

export function CompatGrid({ project, table }: { project: string; table: string }) {
  const options = useOptions();
  const matrix = matrices.find((m) => m.project === project);
  const group = matrix
    ? (tableReports(matrix, options) as Record<string, GroupReport>)[table]
    : undefined;
  return group ? <CompatGridView group={group} /> : null;
}
