// The article body of a planned-slot tab. There is no page yet, so the tab
// shows what the slot is (id, working title, nav placement, the content request
// it came from) and the rail beside it collects page-level threads: the
// instructions the docs-write agent reads before drafting the page.
import { useQuery } from "@connectrpc/connect-query";
import { CircleDashed } from "lucide-react";
import { useMemo } from "react";
import { projectNav } from "../../../doc-nav";
import { ContentArea } from "../../../gen/docs_factory/review/v1/messages_pb";
import { listContentRequests } from "../../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../../lib/auth-context";
import { requestStatusLabel } from "../ContentRequests";
import { findPlannedSlot } from "./planned-slot";

export default function PlannedSlotView({ project, id }: { project: string; id: string }) {
  const { isAllowlisted } = useAuth();
  const slot = useMemo(() => findPlannedSlot(projectNav[project] ?? [], id), [project, id]);
  const { data } = useQuery(
    listContentRequests,
    { area: ContentArea.DOCS, project },
    { enabled: isAllowlisted && Boolean(slot?.request) },
  );
  const request = slot?.request ? data?.requests.find((r) => r.id === slot.request) : undefined;

  if (!slot) {
    return (
      <p className="text-muted-foreground">
        Planned slot {id} is no longer in content/{project}/nav.yml.
      </p>
    );
  }

  return (
    <>
      <p className="review-planned-eyebrow">
        <CircleDashed className="size-3.5" aria-hidden />
        Planned · {slot.id}
      </p>
      <h1>{slot.title}</h1>
      {slot.trail.length > 0 && <p className="lead muted">{slot.trail.join(" › ")}</p>}
      <div className="review-planned-note not-prose">
        <p>
          This page isn't written yet. Comment on the slot to tell its author what it should cover,
          which environment or engines to use, and what to leave out. The docs-write agent reads the
          open threads before drafting the page and replies on each one when it lands.
        </p>
      </div>
      {request && (
        <section className="review-planned-request not-prose">
          <p className="review-comments-title">
            Content request · {requestStatusLabel(request.status)}
          </p>
          <p className="review-planned-request-title">{request.title}</p>
          {request.bodyMd && <p className="review-planned-request-body">{request.bodyMd}</p>}
          {request.requestedByLogin && (
            <p className="review-planned-request-meta">Requested by @{request.requestedByLogin}</p>
          )}
        </section>
      )}
    </>
  );
}
