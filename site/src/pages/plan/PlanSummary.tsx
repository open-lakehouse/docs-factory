// /plan: one tile per docs project plus the blog pipeline and the backlog, each
// linking into its Plan page with the matching filter applied.
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useQuery } from "@connectrpc/connect-query";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { matrices } from "../../compat";
import StageBar from "../../components/plan/StageBar";
import { useOpenContentRequests } from "../../components/review/ContentRequests";
import { PROJECT_LABELS } from "../../doc-nav";
import { explainEntries } from "../../explain";
import { hasExplanationPage } from "../../explain-bindings";
import {
  ContentArea,
  ContentRequestStatus,
  ReviewState,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { listDrafts } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { answeredShare, matrixCounts } from "../../lib/plan/compat-stats";
import { SOON_DAYS } from "../../lib/plan/pipeline-dates";
import { progress } from "../../lib/plan/roadmap";
import { summarizePipeline } from "../../lib/plan/summary";
import { PlanPage } from "./PlanLayout";
import { ROADMAP_PROJECTS, useRoadmap } from "./Roadmap";
import { planHref } from "./sections";

const PROJECTS = [...new Set([...ROADMAP_PROJECTS, ...matrices.map((m) => m.project)])].sort();

function Tile({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <article className="plan-tile">
      <h2>
        <Link to={href}>{title}</Link>
      </h2>
      {children}
    </article>
  );
}

function Stat({ value, label, href }: { value: ReactNode; label: string; href: string }) {
  return (
    <Link to={href} className="plan-stat">
      <span className="plan-stat-value">{value}</span>
      <span className="plan-stat-label">{label}</span>
    </Link>
  );
}

function Meter({ share, label }: { share: number; label: string }) {
  return (
    <span className="plan-meter" role="img" aria-label={label} title={label}>
      <span style={{ width: `${Math.round(share * 100)}%` }} />
    </span>
  );
}

export default function PlanSummary() {
  return (
    <PlanPage title="Plan" intro="Where each project stands, what ships next, and what is waiting.">
      <div className="plan-tiles">
        {PROJECTS.map((p) => (
          <ProjectTile key={p} project={p} />
        ))}
        <PipelineTile />
        <BacklogTile />
      </div>
    </PlanPage>
  );
}

function ProjectTile({ project }: { project: string }) {
  const root = useRoadmap(project);
  const requests = useOpenContentRequests().filter(
    (r) => r.area === ContentArea.DOCS && r.project === project,
  );
  const matrix = matrices.find((m) => m.project === project);
  const compat = matrix ? matrixCounts(matrix) : null;
  const hasRoadmap = ROADMAP_PROJECTS.includes(project);

  return (
    <Tile
      title={PROJECT_LABELS[project] ?? project}
      href={planHref(hasRoadmap ? "roadmap" : "compat", { project })}
    >
      {hasRoadmap && (
        <>
          <p className="plan-tile-lead">
            <strong>{Math.round(progress(root.counts) * 100)}%</strong> of the roadmap is ready
          </p>
          <StageBar counts={root.counts} />
        </>
      )}
      <div className="plan-stats">
        {compat && (
          <Stat
            href={planHref("compat", { project, gaps: "1" })}
            label="compat cells answered"
            value={
              <>
                {Math.round(answeredShare(compat) * 100)}%
                <Meter
                  share={answeredShare(compat)}
                  label={`${Math.round(answeredShare(compat) * 100)}% answered by a ready page`}
                />
              </>
            }
          />
        )}
        {compat && (
          <Stat
            href={planHref("compat", { project, gaps: "1" })}
            label="unknown cells"
            value={compat.unknown}
          />
        )}
        <Stat
          href={planHref("requests", { project })}
          label="open requests"
          value={requests.length}
        />
      </div>
    </Tile>
  );
}

function PipelineTile() {
  const { isAllowlisted } = useAuth();
  const { data } = useQuery(
    listDrafts,
    { area: ContentArea.BLOGS, orderByPriority: true },
    { enabled: isAllowlisted },
  );
  const now = useMemo(() => new Date(), []);
  const summary = useMemo(
    () =>
      summarizePipeline(
        (data?.drafts ?? []).map((d) => ({
          title: d.title || d.ref?.slug || "(untitled)",
          target: d.targetReleaseDate ? timestampDate(d.targetReleaseDate) : undefined,
          released: d.reviewState === ReviewState.RELEASED,
        })),
        now,
      ),
    [data?.drafts, now],
  );
  const href = planHref("pipeline");
  return (
    <Tile title="Blog pipeline" href={href}>
      <div className="plan-stats">
        <Stat href={href} label="overdue" value={summary.flags.overdue} />
        <Stat href={href} label={`due in ${SOON_DAYS} days`} value={summary.flags.soon} />
        <Stat href={href} label="unscheduled" value={summary.flags.unscheduled} />
      </div>
      {summary.next.length > 0 && (
        <ol className="plan-next">
          {summary.next.map((p) => (
            <li key={p.title}>
              <span>{p.title}</span>
              <time className="muted">{p.target?.toISOString().slice(0, 10)}</time>
            </li>
          ))}
        </ol>
      )}
    </Tile>
  );
}

function BacklogTile() {
  const requests = useOpenContentRequests();
  const untriaged = requests.filter((r) => r.status === ContentRequestStatus.OPEN).length;
  const accepted = requests.filter((r) => r.status === ContentRequestStatus.ACCEPTED).length;
  const gaps = explainEntries.filter((e) => !hasExplanationPage(e.id)).length;
  return (
    <Tile title="Backlog" href={planHref("requests")}>
      <div className="plan-stats">
        <Stat href={planHref("requests", { status: "open" })} label="to triage" value={untriaged} />
        <Stat
          href={planHref("requests", { status: "accepted" })}
          label="accepted, not planned"
          value={accepted}
        />
        <Stat href="/model/coverage" label="concepts unexplained" value={gaps} />
      </div>
    </Tile>
  );
}
