// Progress through the content stages as one stacked bar. Stages are ordered
// (ready → draft → planned → requested), so they share one hue that fades
// toward the surface; requested has no fill, only a dashed outline. Counts sit
// in the legend, so the bar never relies on color alone.
import { cn } from "@/lib/utils";
import type { SlotStage, StageCounts } from "../../lib/plan/roadmap";

export const STAGES: readonly SlotStage[] = ["ready", "draft", "planned", "requested"];

export const STAGE_LABEL: Record<SlotStage, string> = {
  ready: "Ready",
  draft: "Draft",
  planned: "Planned",
  requested: "Requested",
};

export function StageSwatch({ stage }: { stage: SlotStage }) {
  return <span className={cn("stage-swatch", `stage-${stage}`)} aria-hidden="true" />;
}

export default function StageBar({
  counts,
  legend = true,
  className,
}: {
  counts: StageCounts;
  legend?: boolean;
  className?: string;
}) {
  const total = STAGES.reduce((n, s) => n + counts[s], 0);
  const summary = STAGES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${STAGE_LABEL[s].toLowerCase()}`)
    .join(", ");
  return (
    <div className={cn("stage-bar", className)}>
      <div className="stage-bar-track" role="img" aria-label={summary || "Nothing yet"}>
        {total > 0 &&
          STAGES.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className={cn("stage-bar-segment", `stage-${s}`)}
              style={{ flexGrow: counts[s] }}
              title={`${STAGE_LABEL[s]}: ${counts[s]}`}
            />
          ))}
      </div>
      {legend && (
        <ul className="stage-legend">
          {STAGES.filter((s) => counts[s] > 0).map((s) => (
            <li key={s}>
              <StageSwatch stage={s} />
              {counts[s]} {STAGE_LABEL[s].toLowerCase()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
