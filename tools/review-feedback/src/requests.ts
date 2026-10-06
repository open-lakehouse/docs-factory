// Content requests as agent work: an ACCEPTED request is a slot to add to the
// backlog. The agent writes a `planned:` entry (with `request: <id>`) into the
// project's nav.yml section, or blogs/IDEAS.md, then marks the request done.
import type { ReviewClient } from "./client.js";
import {
  ContentArea,
  type ContentRequest,
  ContentRequestStatus,
} from "./gen/docs_factory/review/v1/messages_pb.js";

export type RequestFilter = "accepted" | "open" | "all";

export interface FeedbackRequest {
  id: string;
  area: "docs" | "blogs";
  project?: string;
  /** Docs: the nav.yml section trail (`A › B`). Blogs: the series (or `Blog`). */
  placement: string;
  diataxis?: string;
  title: string;
  body: string;
  status: "open" | "accepted" | "declined" | "done";
  requestedBy: string;
  plannedId?: string;
  prUrl?: string;
}

const STATUS: Record<number, FeedbackRequest["status"]> = {
  [ContentRequestStatus.OPEN]: "open",
  [ContentRequestStatus.ACCEPTED]: "accepted",
  [ContentRequestStatus.DECLINED]: "declined",
  [ContentRequestStatus.DONE]: "done",
};

const FILTER: Record<RequestFilter, ContentRequestStatus[]> = {
  accepted: [ContentRequestStatus.ACCEPTED],
  open: [ContentRequestStatus.OPEN, ContentRequestStatus.ACCEPTED],
  all: [],
};

export function toFeedbackRequest(r: ContentRequest): FeedbackRequest {
  return {
    id: r.id,
    area: r.area === ContentArea.BLOGS ? "blogs" : "docs",
    project: r.project,
    placement: r.placement,
    diataxis: r.diataxis || undefined,
    title: r.title,
    body: r.bodyMd,
    status: STATUS[r.status] ?? "open",
    requestedBy: r.requestedByLogin,
    plannedId: r.plannedId,
    prUrl: r.prUrl,
  };
}

export async function listRequests(
  client: ReviewClient,
  opts: { filter?: RequestFilter; project?: string } = {},
): Promise<FeedbackRequest[]> {
  const { requests } = await client.listContentRequests({
    project: opts.project,
    statuses: FILTER[opts.filter ?? "accepted"],
  });
  return requests.map(toFeedbackRequest);
}

/** Mark an accepted request done once its planned slot landed (needs `requests:write`). */
export async function completeRequest(
  client: ReviewClient,
  id: string,
  plannedId: string,
  prUrl?: string,
): Promise<FeedbackRequest | undefined> {
  const { request } = await client.updateContentRequest({
    id,
    status: ContentRequestStatus.DONE,
    plannedId,
    prUrl,
  });
  return request && toFeedbackRequest(request);
}
