// Content requests (CreateContentRequest / ListContentRequests /
// UpdateContentRequest): reviewers ask for content that doesn't exist yet,
// placed where it should live. The accepted backlog stays git's — DONE means a
// `planned:` slot carrying `request: <id>` landed in nav.yml (or blogs/IDEAS.md).
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { requireAllowlisted, requireMaintainer } from "../auth/context.js";
import { db } from "../db.js";
import { areaFromDb, areaToDb } from "../db-map.js";
import {
  ContentArea,
  type ContentRequest,
  ContentRequestSchema,
  ContentRequestStatus,
} from "../gen/docs_factory/review/v1/messages_pb.js";
import {
  type CreateContentRequestRequest,
  CreateContentRequestResponseSchema,
  type ListContentRequestsRequest,
  ListContentRequestsResponseSchema,
  type UpdateContentRequestRequest,
  UpdateContentRequestResponseSchema,
} from "../gen/docs_factory/review/v1/review_service_pb.js";

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirror of content/vocab.json `diataxis` (no cross-package imports).
const DIATAXIS = new Set(["tutorial", "how-to", "reference", "explanation"]);

const STATUS_TO_DB: Record<number, string> = {
  [ContentRequestStatus.OPEN]: "open",
  [ContentRequestStatus.ACCEPTED]: "accepted",
  [ContentRequestStatus.DECLINED]: "declined",
  [ContentRequestStatus.DONE]: "done",
};
const STATUS_FROM_DB: Record<string, ContentRequestStatus> = Object.fromEntries(
  Object.entries(STATUS_TO_DB).map(([k, v]) => [v, Number(k) as ContentRequestStatus]),
);

// Keyed on the current status. DONE is terminal: the slot is in git now, and
// editing it there is how the backlog changes from then on.
const ALLOWED: Record<string, string[]> = {
  open: ["accepted", "declined", "done"],
  accepted: ["done", "declined", "open"],
  declined: ["open"],
  done: [],
};

export interface ContentRequestRow {
  id: string;
  area: string;
  project: string | null;
  placement: string;
  diataxis: string;
  title: string;
  body_md: string;
  status: string;
  requested_by_login: string;
  planned_id: string | null;
  pr_url: string | null;
  resolution_note: string | null;
  created_at: Date;
  updated_at: Date;
}

export function contentRequestFromRow(r: ContentRequestRow): ContentRequest {
  return create(ContentRequestSchema, {
    id: r.id,
    area: areaFromDb(r.area),
    project: r.project ?? undefined,
    placement: r.placement,
    diataxis: r.diataxis,
    title: r.title,
    bodyMd: r.body_md,
    status: STATUS_FROM_DB[r.status] ?? ContentRequestStatus.UNSPECIFIED,
    requestedByLogin: r.requested_by_login,
    plannedId: r.planned_id ?? undefined,
    prUrl: r.pr_url ?? undefined,
    resolutionNote: r.resolution_note ?? undefined,
    createdAt: timestampFromDate(r.created_at),
    updatedAt: timestampFromDate(r.updated_at),
  });
}

/** Validate a new request; returns the first problem, or null. */
export function contentRequestError(req: CreateContentRequestRequest): string | null {
  if (req.area !== ContentArea.DOCS && req.area !== ContentArea.BLOGS) return "area is required";
  if (!req.placement.trim()) return "placement is required";
  const title = req.title.trim();
  if (!title || title.length > MAX_TITLE_LEN) return `title must be 1..${MAX_TITLE_LEN} characters`;
  if (req.bodyMd.length > MAX_BODY_LEN) return `body_md exceeds ${MAX_BODY_LEN} characters`;
  if (req.area === ContentArea.DOCS) {
    if (!req.project?.trim()) return "project is required for docs";
    if (!DIATAXIS.has(req.diataxis)) return `diataxis must be one of ${[...DIATAXIS].join(", ")}`;
  } else if (req.diataxis) {
    return "blog requests carry no diataxis";
  }
  return null;
}

/**
 * Validate a status change from `from`; returns the first problem, or null.
 * Pure so the lifecycle is testable without a database.
 */
export function contentRequestUpdateError(
  from: string,
  req: UpdateContentRequestRequest,
): string | null {
  const to = STATUS_TO_DB[req.status];
  if (!to) return "invalid status";
  if (!(ALLOWED[from] ?? []).includes(to)) return `illegal transition ${from} -> ${to}`;
  if (to === "done" && !req.plannedId?.trim())
    return "planned_id is required to mark a request done";
  if (req.prUrl && !/^https:\/\/\S+$/.test(req.prUrl)) return "pr_url must be an https URL";
  return null;
}

const RETURNING = `id, area, project, placement, diataxis, title, body_md, status,
  requested_by_login, planned_id, pr_url, resolution_note, created_at, updated_at`;

export const contentRequestHandlers = {
  async createContentRequest(req: CreateContentRequestRequest, ctx: HandlerContext) {
    const viewer = requireAllowlisted(ctx);
    const bad = contentRequestError(req);
    if (bad) throw new ConnectError(bad, Code.InvalidArgument);
    const sql = db();
    const [row] = await sql<ContentRequestRow[]>`
      insert into content_request
        (area, project, placement, diataxis, title, body_md,
         requested_by_user_id, requested_by_login)
      values
        (${areaToDb(req.area)}, ${req.area === ContentArea.DOCS ? req.project!.trim() : null},
         ${req.placement.trim()}, ${req.diataxis}, ${req.title.trim()}, ${req.bodyMd},
         ${viewer.userId ?? viewer.login ?? "unknown"}, ${viewer.login ?? "unknown"})
      returning ${sql.unsafe(RETURNING)}
    `;
    return create(CreateContentRequestResponseSchema, { request: contentRequestFromRow(row) });
  },

  async listContentRequests(req: ListContentRequestsRequest, ctx: HandlerContext) {
    requireAllowlisted(ctx);
    const sql = db();
    const area = req.area !== undefined && req.area !== 0 ? areaToDb(req.area) : null;
    const project = req.project?.trim() || null;
    const statuses = req.statuses.map((s) => STATUS_TO_DB[s]).filter(Boolean);
    const rows = await sql<ContentRequestRow[]>`
      select ${sql.unsafe(RETURNING)} from content_request
      where (${area}::text is null or area = ${area})
        and (${project}::text is null or project = ${project})
        and (${statuses.length === 0} or status = any(${statuses}::text[]))
      order by created_at desc
    `;
    return create(ListContentRequestsResponseSchema, {
      requests: rows.map(contentRequestFromRow),
    });
  },

  // DONE reports work an agent (or anyone) landed in git, so any allowlisted
  // viewer — or a `requests:write` token — may set it. Accepting, declining,
  // and reopening shape the backlog: maintainer-only.
  async updateContentRequest(req: UpdateContentRequestRequest, ctx: HandlerContext) {
    if (req.status === ContentRequestStatus.DONE) requireAllowlisted(ctx);
    else requireMaintainer(ctx);
    if (!UUID_RE.test(req.id)) throw new ConnectError("content request not found", Code.NotFound);
    const sql = db();
    return sql.begin(async (tx) => {
      const [current] = await tx<{ status: string }[]>`
        select status from content_request where id = ${req.id} for update
      `;
      if (!current) throw new ConnectError("content request not found", Code.NotFound);
      const bad = contentRequestUpdateError(current.status, req);
      if (bad) throw new ConnectError(bad, Code.FailedPrecondition);
      const [row] = await tx<ContentRequestRow[]>`
        update content_request set
          status = ${STATUS_TO_DB[req.status]},
          planned_id = coalesce(${req.plannedId?.trim() || null}, planned_id),
          pr_url = coalesce(${req.prUrl || null}, pr_url),
          resolution_note = coalesce(${req.resolutionNote?.trim() || null}, resolution_note),
          updated_at = now()
        where id = ${req.id}
        returning ${tx.unsafe(RETURNING)}
      `;
      return create(UpdateContentRequestResponseSchema, { request: contentRequestFromRow(row) });
    });
  },
};
