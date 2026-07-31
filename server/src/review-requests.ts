// Mapping helpers for the review-request and content-event layer: DB row shapes
// (snake_case) <-> proto messages, plus the enum <-> text conversions. Kept out
// of review.ts so the service file stays focused on handlers, mirroring how
// comments.ts / db-map.ts factor out row mapping.
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  ReviewRequestSchema,
  ContentEventSchema,
  ContentRefSchema,
  ApprovalSchema,
  Requirement,
  RequestStatus,
  EventKind,
  ReviewState,
  type ContentRef,
  type ReviewRequest,
  type ContentEvent,
  type Approval,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { areaFromDb } from "./db-map.js";

// --- Requirement <-> DB text ------------------------------------------------

export function requirementToDb(r: Requirement): "required" | "optional" {
  // Default (UNSPECIFIED) is treated as required — the conservative choice for a
  // release gate: an ambiguous request should block, not silently pass.
  return r === Requirement.OPTIONAL ? "optional" : "required";
}

const REQUIREMENT_BY_DB: Record<string, Requirement> = {
  required: Requirement.REQUIRED,
  optional: Requirement.OPTIONAL,
};

const REQUEST_STATUS_BY_DB: Record<string, RequestStatus> = {
  open: RequestStatus.OPEN,
  satisfied: RequestStatus.SATISFIED,
  cancelled: RequestStatus.CANCELLED,
};

// --- EventKind <-> DB text --------------------------------------------------

const EVENT_KIND_BY_DB: Record<string, EventKind> = {
  "review-requested": EventKind.REVIEW_REQUESTED,
  "request-satisfied": EventKind.REQUEST_SATISFIED,
  "request-cancelled": EventKind.REQUEST_CANCELLED,
  "state-changes-requested": EventKind.STATE_CHANGES_REQUESTED,
  "state-approved": EventKind.STATE_APPROVED,
  "approved-by": EventKind.APPROVED,
  "approval-dismissed": EventKind.APPROVAL_DISMISSED,
  released: EventKind.RELEASED,
  unpublished: EventKind.UNPUBLISHED,
  republished: EventKind.REPUBLISHED,
  "content-revised": EventKind.CONTENT_REVISED,
};

/**
 * The content_event `kind` for an explicit review-state outcome, keyed on the DB
 * state string it lands in. Only the storable explicit outcomes are mapped; any
 * unmapped state returns null (not logged). `released` is logged from
 * releaseContent (with the published latch) rather than here. Ordinary approvals
 * are logged as `approved-by` from recordApproval, not through this map.
 */
export const EVENT_KIND_BY_STATE: Record<string, string | null> = {
  "changes-requested": "state-changes-requested",
  approved: "state-approved",
  released: "released",
};

// --- Row shapes -------------------------------------------------------------

export interface ReviewRequestRow {
  id: string;
  area: string;
  slug: string;
  reviewer_user_id: string;
  // Resolved display attributes from the user_identity join (nullable).
  reviewer_login: string | null;
  reviewer_name: string | null;
  requirement: string;
  status: string;
  requested_by: string;
  note: string | null;
  created_at: Date;
  satisfied_at: Date | null;
}

export interface ContentEventRow {
  id: string;
  area: string;
  slug: string;
  kind: string;
  actor: string;
  payload: {
    note?: string;
    from_state?: string;
    to_state?: string;
    reviewer_login?: string;
    // content-revised: legacy structural change counts (no longer written;
    // version timeline is derived from content_version). Kept for old rows.
    added?: string;
    removed?: string;
    modified?: string;
    moved?: string;
  } | null;
  created_at: Date;
}

/** Human summary of a content-revised event's change counts, for the timeline. */
function revisionNote(p: NonNullable<ContentEventRow["payload"]>): string {
  const parts: string[] = [];
  const n = (v: string | undefined) => Number(v ?? "0");
  if (n(p.added)) parts.push(`${n(p.added)} added`);
  if (n(p.removed)) parts.push(`${n(p.removed)} removed`);
  if (n(p.modified)) parts.push(`${n(p.modified)} modified`);
  if (n(p.moved)) parts.push(`${n(p.moved)} moved`);
  return parts.join(", ");
}

// --- Row -> proto -----------------------------------------------------------

function refFor(area: string, slug: string): ContentRef {
  return create(ContentRefSchema, { area: areaFromDb(area), slug });
}

export function reviewRequestFromRow(r: ReviewRequestRow): ReviewRequest {
  return create(ReviewRequestSchema, {
    id: r.id,
    ref: refFor(r.area, r.slug),
    reviewerUserId: r.reviewer_user_id,
    reviewerLogin: r.reviewer_login ?? undefined,
    reviewerName: r.reviewer_name ?? undefined,
    requirement: REQUIREMENT_BY_DB[r.requirement] ?? Requirement.REQUIRED,
    status: REQUEST_STATUS_BY_DB[r.status] ?? RequestStatus.OPEN,
    requestedBy: r.requested_by,
    note: r.note ?? "",
    createdAt: timestampFromDate(r.created_at),
    satisfiedAt: r.satisfied_at ? timestampFromDate(r.satisfied_at) : undefined,
  });
}

// Maps a DB state string found in an event payload (from_state/to_state) to the
// proto enum. Covers the explicit outcomes plus the derived states that may
// appear as a `from_state` (a transition can originate from a derived
// needs-review/none), so the timeline renders historical transitions correctly.
const STATE_BY_DB: Record<string, ReviewState> = {
  none: ReviewState.NONE,
  "needs-review": ReviewState.NEEDS_REVIEW,
  "changes-requested": ReviewState.CHANGES_REQUESTED,
  approved: ReviewState.APPROVED,
  released: ReviewState.RELEASED,
};

export function contentEventFromRow(r: ContentEventRow): ContentEvent {
  const p = r.payload ?? {};
  return create(ContentEventSchema, {
    id: r.id,
    ref: refFor(r.area, r.slug),
    kind: EVENT_KIND_BY_DB[r.kind] ?? EventKind.UNSPECIFIED,
    actor: r.actor,
    // content-revised carries no free-text note; synthesize the change summary.
    note: r.kind === "content-revised" ? revisionNote(p) : (p.note ?? ""),
    fromState: p.from_state ? STATE_BY_DB[p.from_state] : undefined,
    toState: p.to_state ? STATE_BY_DB[p.to_state] : undefined,
    reviewerLogin: p.reviewer_login ?? undefined,
    createdAt: timestampFromDate(r.created_at),
  });
}

export interface ContentApprovalRow {
  id: string;
  area: string;
  slug: string;
  version_id: string | null;
  approver_user_id: string;
  // Resolved display login from the user_identity join (nullable).
  approver_login: string | null;
  created_at: Date;
}

export function approvalFromRow(r: ContentApprovalRow): Approval {
  return create(ApprovalSchema, {
    id: r.id,
    ref: refFor(r.area, r.slug),
    approverUserId: r.approver_user_id,
    approverLogin: r.approver_login ?? undefined,
    versionId: r.version_id ?? undefined,
    createdAt: timestampFromDate(r.created_at),
  });
}
