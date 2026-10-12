// The blog side of the Plan summary: where the pipeline stands against its
// target dates, and what ships next.
import { type DateFlag, dateFlag } from "./pipeline-dates";

export interface PipelinePost {
  title: string;
  target?: Date;
  released: boolean;
}

export interface PipelineSummary {
  flags: Record<DateFlag, number>;
  /** Unreleased posts with a target date, soonest (or most overdue) first. */
  next: PipelinePost[];
}

export function summarizePipeline(posts: PipelinePost[], now: Date, take = 3): PipelineSummary {
  const flags: Record<DateFlag, number> = {
    released: 0,
    overdue: 0,
    soon: 0,
    scheduled: 0,
    unscheduled: 0,
  };
  for (const p of posts) flags[dateFlag(p.target, p.released, now)]++;
  const next = posts
    .filter((p): p is PipelinePost & { target: Date } => !p.released && !!p.target)
    .sort((a, b) => a.target.getTime() - b.target.getTime())
    .slice(0, take);
  return { flags, next };
}
