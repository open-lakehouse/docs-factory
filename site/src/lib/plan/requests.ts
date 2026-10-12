// Filtering and cross-links for the content-request triage page. Works on the
// generated message types only, so it runs under bun.
import {
  ContentArea,
  type ContentRequest,
  ContentRequestKind,
  ContentRequestStatus,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { planHref } from "./href";
import { sectionAnchor } from "./roadmap";

/** `active` (the default) is what still needs someone: open or accepted. */
export const STATUS_FILTERS = ["active", "open", "accepted", "declined", "done", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const KIND_FILTERS = ["all", "page", "journey"] as const;
export type KindFilter = (typeof KIND_FILTERS)[number];

/** Docs project id, `blogs`, or `all`. */
export type WhereFilter = string;

export interface RequestFilters {
  status: StatusFilter;
  kind: KindFilter;
  where: WhereFilter;
}

const STATUS_OF: Record<Exclude<StatusFilter, "active" | "all">, ContentRequestStatus> = {
  open: ContentRequestStatus.OPEN,
  accepted: ContentRequestStatus.ACCEPTED,
  declined: ContentRequestStatus.DECLINED,
  done: ContentRequestStatus.DONE,
};

function oneOf<T extends string>(values: readonly T[], raw: string | null, fallback: T): T {
  return values.find((v) => v === raw) ?? fallback;
}

export function parseFilters(params: URLSearchParams): RequestFilters {
  return {
    status: oneOf(STATUS_FILTERS, params.get("status"), "active"),
    kind: oneOf(KIND_FILTERS, params.get("kind"), "all"),
    where: params.get("project") || "all",
  };
}

export function matchesStatus(r: ContentRequest, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "active") {
    return r.status === ContentRequestStatus.OPEN || r.status === ContentRequestStatus.ACCEPTED;
  }
  return r.status === STATUS_OF[status];
}

export function matchesWhere(r: ContentRequest, where: WhereFilter): boolean {
  if (where === "all") return true;
  if (where === "blogs") return r.area === ContentArea.BLOGS;
  return r.area === ContentArea.DOCS && r.project === where;
}

export function matchesKind(r: ContentRequest, kind: KindFilter): boolean {
  if (kind === "all") return true;
  const journey = r.kind === ContentRequestKind.JOURNEY;
  return kind === "journey" ? journey : !journey;
}

export function filterRequests(requests: ContentRequest[], f: RequestFilters): ContentRequest[] {
  return requests.filter(
    (r) => matchesStatus(r, f.status) && matchesKind(r, f.kind) && matchesWhere(r, f.where),
  );
}

/** Where the request would land once planned: its matrix, roadmap section, or the pipeline. */
export function requestTargetHref(r: ContentRequest): string {
  if (r.area === ContentArea.BLOGS) return planHref("pipeline");
  const project = r.project ?? "";
  if (r.kind === ContentRequestKind.JOURNEY) return planHref("compat", { project });
  return `${planHref("roadmap", { project })}#${sectionAnchor(r.placement)}`;
}
