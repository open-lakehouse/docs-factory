// `@/components/engine-coverage` is the import path remark-engine-coverage
// emits. The review preview counts draft claims and links review routes.

import { matrices } from "@/compat";
import { coverageReports } from "@/content-core/coverage.mjs";
import { docRef, refHref } from "@/lib/content-ref";
import { useScriptsIndex } from "@/lib/scripts-index";
import { EngineCoverageView, type EngineReport, EngineSupportView } from "./engine-coverage-view";

function useReports(project: string): EngineReport[] {
  const { scripts } = useScriptsIndex();
  const matrix = matrices.find((m) => m.project === project);
  if (!matrix) return [];
  const urls = new Map(scripts.map((s) => [s.gitPath, s.fetchUrl]));
  return coverageReports(matrix, {
    href: (page, anchor) =>
      refHref(docRef(page.project, page.bucket, page.slug), anchor ?? undefined),
    scriptUrl: (gitPath) => urls.get(gitPath) ?? null,
    drafts: true,
  }) as EngineReport[];
}

export function EngineCoverage({ project, engine }: { project: string; engine: string }) {
  const report = useReports(project).find((r) => r.id === engine);
  return report ? <EngineCoverageView report={report} /> : null;
}

export function EngineSupport({ project }: { project: string }) {
  return <EngineSupportView reports={useReports(project)} />;
}
