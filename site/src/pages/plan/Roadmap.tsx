// /plan/roadmap: each project's nav.yml as a roadmap, so a reviewer sees what
// ships, what is drafted, what is only planned, and what readers asked for.
import { useQuery } from "@connectrpc/connect-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import StageBar, { STAGE_LABEL, StageSwatch } from "../../components/plan/StageBar";
import {
  RequestContentButton,
  useOpenContentRequests,
} from "../../components/review/ContentRequests";
import { FrontmatterStatusBadge } from "../../components/StatusBadge";
import { findDoc } from "../../content";
import { PROJECT_LABELS, projectNav } from "../../doc-nav";
import {
  ContentArea,
  ContentRequestKind,
  type ReviewState,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { listDrafts } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { docRef, refHref } from "../../lib/content-ref";
import {
  buildRoadmap,
  progress,
  type RoadmapSection,
  type RoadmapSlot,
  sectionAnchor,
} from "../../lib/plan/roadmap";
import { refKey } from "../../lib/review-queries";
import { ReviewStateBadge } from "../../lib/review-status";
import { PlanPage } from "./PlanLayout";
import { planHref } from "./sections";

export const ROADMAP_PROJECTS = Object.keys(projectNav).sort();

const UNPLACED_ANCHOR = "section-unplaced";

function statusOf(project: string) {
  return (bucket: string, slug: string, from = project) =>
    findDoc(from, bucket, slug)?.frontmatter.status;
}

/** The project's roadmap with its open page requests placed under their sections. */
export function useRoadmap(project: string): RoadmapSection {
  const requests = useOpenContentRequests();
  return useMemo(
    () =>
      buildRoadmap(
        projectNav[project] ?? [],
        statusOf(project),
        requests.filter(
          (r) =>
            r.area === ContentArea.DOCS &&
            r.kind !== ContentRequestKind.JOURNEY &&
            r.project === project,
        ),
      ),
    [project, requests],
  );
}

export default function Roadmap() {
  const [params, setParams] = useSearchParams();
  const project =
    ROADMAP_PROJECTS.find((p) => p === params.get("project")) ?? ROADMAP_PROJECTS[0] ?? "";
  const root = useRoadmap(project);
  const { isAllowlisted } = useAuth();
  const { data } = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  const reviewByRef = useMemo(() => {
    const map = new Map<string, ReviewState>();
    for (const d of data?.drafts ?? []) if (d.ref) map.set(refKey(d.ref), d.reviewState);
    return map;
  }, [data?.drafts]);
  // The router doesn't scroll to a fragment on client navigation.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    // A request for a section that isn't in nav.yml is listed with the unplaced ones.
    const target =
      document.getElementById(hash.slice(1)) ?? document.getElementById(UNPLACED_ANCHOR);
    target?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <PlanPage
      title="Docs roadmap"
      intro={
        <>
          Each project&apos;s navigation with how far every slot has come. Planned slots come from{" "}
          <code>planned:</code> entries in <code>nav.yml</code>; requested ones are open content
          requests for that section.
        </>
      }
    >
      <div className="plan-toolbar">
        <fieldset className="plan-chips">
          <legend className="sr-only">Project</legend>
          {ROADMAP_PROJECTS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === project}
              className={cn("plan-chip", p === project && "is-active")}
              onClick={() => setParams({ project: p }, { replace: true })}
            >
              {PROJECT_LABELS[p] ?? p}
            </button>
          ))}
        </fieldset>
        <span className="muted text-sm">{Math.round(progress(root.counts) * 100)}% ready</span>
      </div>
      <StageBar counts={root.counts} className="mt-3" />
      {root.slots.length > 0 && (
        <div id={UNPLACED_ANCHOR} className="roadmap-section">
          <div className="roadmap-section-head">
            <h2 className="roadmap-unplaced-title">Not in a section yet</h2>
          </div>
          <SlotList project={project} slots={root.slots} reviewByRef={reviewByRef} />
        </div>
      )}
      {root.sections.map((s) => (
        <Section
          key={s.placement}
          project={project}
          section={s}
          depth={0}
          reviewByRef={reviewByRef}
        />
      ))}
    </PlanPage>
  );
}

function Section({
  project,
  section,
  depth,
  reviewByRef,
}: {
  project: string;
  section: RoadmapSection;
  depth: number;
  reviewByRef: Map<string, ReviewState>;
}) {
  const [open, setOpen] = useState(true);
  const { isAllowlisted } = useAuth();
  const Heading = depth === 0 ? "h2" : "h3";
  return (
    <div
      id={sectionAnchor(section.placement)}
      className={cn("roadmap-section", depth > 0 && "is-nested")}
    >
      <div className="roadmap-section-head">
        <button
          type="button"
          className="roadmap-section-toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <Heading>{section.label}</Heading>
        </button>
        <StageBar counts={section.counts} legend={false} className="roadmap-section-bar" />
        <span className="roadmap-section-pct muted">
          {section.counts.ready}/
          {section.counts.ready +
            section.counts.draft +
            section.counts.planned +
            section.counts.requested}
        </span>
        {isAllowlisted && (
          <RequestContentButton
            target={{ area: ContentArea.DOCS, project, placement: section.placement }}
          />
        )}
      </div>
      {open && (
        <>
          {section.slots.length > 0 && (
            <SlotList project={project} slots={section.slots} reviewByRef={reviewByRef} />
          )}
          {section.sections.map((s) => (
            <Section
              key={s.placement}
              project={project}
              section={s}
              depth={depth + 1}
              reviewByRef={reviewByRef}
            />
          ))}
        </>
      )}
    </div>
  );
}

function SlotList({
  project,
  slots,
  reviewByRef,
}: {
  project: string;
  slots: RoadmapSlot[];
  reviewByRef: Map<string, ReviewState>;
}) {
  return (
    <ul className="roadmap-slots">
      {slots.map((slot) => (
        <li
          key={
            slot.kind === "page"
              ? `page:${slot.project ?? ""}:${slot.bucket}/${slot.slug}:${slot.primary}`
              : slot.kind === "planned"
                ? `planned:${slot.id}`
                : `requested:${slot.requestId}`
          }
          className={cn("roadmap-slot", `is-${slot.stage}`)}
        >
          <span className="roadmap-slot-stage" title={STAGE_LABEL[slot.stage]}>
            <StageSwatch stage={slot.stage} />
            <span className="sr-only">{STAGE_LABEL[slot.stage]}</span>
          </span>
          <SlotBody project={project} slot={slot} reviewByRef={reviewByRef} />
        </li>
      ))}
    </ul>
  );
}

function SlotBody({
  project,
  slot,
  reviewByRef,
}: {
  project: string;
  slot: RoadmapSlot;
  reviewByRef: Map<string, ReviewState>;
}) {
  if (slot.kind === "planned") {
    return (
      <>
        <span className="roadmap-slot-title">{slot.title}</span>
        <code className="muted">{slot.id}</code>
        <span className="roadmap-slot-meta muted">planned</span>
      </>
    );
  }
  if (slot.kind === "requested") {
    return (
      <>
        <Link to={planHref("requests", { project })} className="roadmap-slot-title">
          {slot.title}
        </Link>
        <span className="roadmap-slot-meta muted">requested</span>
      </>
    );
  }
  const ref = docRef(slot.project ?? project, slot.bucket, slot.slug);
  const review = reviewByRef.get(refKey(ref));
  return (
    <>
      <Link to={refHref(ref)} className="roadmap-slot-title">
        {slot.label}
      </Link>
      {slot.id && <code className="muted">{slot.id}</code>}
      {slot.project && <span className="roadmap-slot-meta muted">from {slot.project}</span>}
      {!slot.primary && <span className="roadmap-slot-meta muted">also listed elsewhere</span>}
      <span className="roadmap-slot-badges">
        {slot.status && <FrontmatterStatusBadge status={slot.status} />}
        {review !== undefined && <ReviewStateBadge state={review} />}
      </span>
    </>
  );
}
