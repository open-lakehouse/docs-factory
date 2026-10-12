// /plan/requests: every content request in one list, filtered through the URL,
// with maintainer triage. Accepted requests become `planned:` slots or tracked
// journeys when an agent lands them in git (see the review-feedback skill).
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requestStatusLabel } from "../../components/review/ContentRequests";
import { PROJECT_LABELS } from "../../doc-nav";
import {
  ContentArea,
  type ContentRequest,
  ContentRequestKind,
  ContentRequestStatus,
} from "../../gen/docs_factory/review/v1/messages_pb";
import {
  listContentRequests,
  updateContentRequest,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import {
  filterRequests,
  KIND_FILTERS,
  type KindFilter,
  matchesKind,
  matchesStatus,
  matchesWhere,
  parseFilters,
  type RequestFilters,
  requestTargetHref,
  STATUS_FILTERS,
  type StatusFilter,
} from "../../lib/plan/requests";
import { useReviewInvalidation } from "../../lib/review-queries";
import { PlanPage } from "./PlanLayout";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  active: "Needs action",
  open: "Requested",
  accepted: "Accepted",
  declined: "Declined",
  done: "Planned",
  all: "All",
};

const KIND_FILTER_LABEL: Record<KindFilter, string> = {
  all: "Any kind",
  page: "Pages",
  journey: "Journeys",
};

function whereLabel(where: string): string {
  if (where === "all") return "Everywhere";
  if (where === "blogs") return "Blogs";
  return PROJECT_LABELS[where] ?? where;
}

function Chips<T extends string>({
  label,
  values,
  value,
  text,
  count,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  text: (v: T) => string;
  count: (v: T) => number;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="plan-chips">
      <legend className="sr-only">{label}</legend>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          className={cn("plan-chip", v === value && "is-active")}
          onClick={() => onChange(v)}
        >
          {text(v)} <span className="plan-chip-count">{count(v)}</span>
        </button>
      ))}
    </fieldset>
  );
}

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const { isAllowlisted } = useAuth();
  // Every status in one query: the chips count across all of them.
  const { data, isLoading } = useQuery(listContentRequests, {}, { enabled: isAllowlisted });
  const all = data?.requests ?? [];
  const shown = filterRequests(all, filters);

  const projects = [
    ...new Set(all.filter((r) => r.area === ContentArea.DOCS).map((r) => r.project ?? "")),
  ]
    .filter(Boolean)
    .sort();
  const wheres = [
    "all",
    ...projects,
    ...(all.some((r) => r.area === ContentArea.BLOGS) ? ["blogs"] : []),
  ];

  const update = (patch: Partial<Record<"status" | "kind" | "project", string>>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          const fallback = k === "status" ? "active" : "all";
          if (!v || v === fallback) p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );
  const withOut = (key: keyof RequestFilters) =>
    all.filter(
      (r) =>
        (key === "status" || matchesStatus(r, filters.status)) &&
        (key === "kind" || matchesKind(r, filters.kind)) &&
        (key === "where" || matchesWhere(r, filters.where)),
    );

  return (
    <PlanPage
      title="Content requests"
      intro="Missing pages and journeys reviewers asked for. Ask for more from a roadmap section, a compatibility table, or the review tree."
    >
      <div className="plan-filters">
        <Chips
          label="Status"
          values={STATUS_FILTERS}
          value={filters.status}
          text={(v) => STATUS_FILTER_LABEL[v]}
          count={(v) => withOut("status").filter((r) => matchesStatus(r, v)).length}
          onChange={(v) => update({ status: v })}
        />
        <Chips
          label="Kind"
          values={KIND_FILTERS}
          value={filters.kind}
          text={(v) => KIND_FILTER_LABEL[v]}
          count={(v) => withOut("kind").filter((r) => matchesKind(r, v)).length}
          onChange={(v) => update({ kind: v })}
        />
        <Chips
          label="Where"
          values={wheres}
          value={wheres.includes(filters.where) ? filters.where : "all"}
          text={whereLabel}
          count={(v) => withOut("where").filter((r) => matchesWhere(r, v)).length}
          onChange={(v) => update({ project: v })}
        />
      </div>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="review-empty">No content requests match.</p>
      ) : (
        <ul className="request-list">
          {shown.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </ul>
      )}
    </PlanPage>
  );
}

function RequestRow({ request: r }: { request: ContentRequest }) {
  const { isMaintainer } = useAuth();
  const { invalidateContentRequests } = useReviewInvalidation();
  const triage = useMutation(updateContentRequest, {
    onSuccess: () => void invalidateContentRequests(),
  });
  const journey = r.kind === ContentRequestKind.JOURNEY;
  const where =
    r.area === ContentArea.BLOGS ? "Blogs" : (PROJECT_LABELS[r.project ?? ""] ?? r.project);
  const when = r.createdAt ? timestampDate(r.createdAt).toLocaleDateString() : "";

  return (
    <li className={cn("request-row", `is-${requestStatusLabel(r.status)}`)}>
      <div className="request-row-head">
        <span className="request-row-title">{r.title}</span>
        <span className="request-row-status">{requestStatusLabel(r.status)}</span>
      </div>
      <div className="request-row-meta muted">
        {[journey ? "journey" : r.diataxis || "page", where].filter(Boolean).join(" · ")} ·{" "}
        <Link to={requestTargetHref(r)} className="compat-link">
          {r.placement}
        </Link>{" "}
        · asked by {r.requestedByLogin || "someone"}
        {when && ` on ${when}`}
      </div>
      {r.bodyMd && (
        <details className="request-row-body">
          <summary>Details</summary>
          <p>{r.bodyMd}</p>
        </details>
      )}
      {r.status === ContentRequestStatus.DONE && (r.plannedId || r.prUrl) && (
        <div className="request-row-meta muted">
          Planned as <code>{r.plannedId}</code>
          {r.prUrl && (
            <>
              {" "}
              in{" "}
              <a href={r.prUrl} target="_blank" rel="noreferrer" className="compat-link">
                {r.prUrl.replace(/^https:\/\/github\.com\//, "")}
              </a>
            </>
          )}
        </div>
      )}
      {r.status === ContentRequestStatus.DECLINED && r.resolutionNote && (
        <div className="request-row-meta muted">Declined: {r.resolutionNote}</div>
      )}
      {isMaintainer && r.status === ContentRequestStatus.OPEN && (
        <div className="request-row-actions">
          <Button
            size="xs"
            variant="outline"
            disabled={triage.isPending}
            onClick={() =>
              void triage.mutateAsync({ id: r.id, status: ContentRequestStatus.ACCEPTED })
            }
          >
            Accept
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={triage.isPending}
            onClick={() =>
              void triage.mutateAsync({ id: r.id, status: ContentRequestStatus.DECLINED })
            }
          >
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}
