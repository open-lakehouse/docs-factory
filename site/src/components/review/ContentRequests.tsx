// Content requests: reviewers ask for missing content where it should live (a
// docs nav section, a blog series). Maintainers accept or decline; an agent
// marks an accepted request done once a `planned:` slot for it lands in git.
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DIATAXIS } from "../../content-core/vocab.mjs";
import {
  ContentArea,
  type ContentRequest,
  ContentRequestStatus,
} from "../../gen/docs_factory/review/v1/messages_pb";
import {
  createContentRequest,
  listContentRequests,
  updateContentRequest,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { useReviewInvalidation } from "../../lib/review-queries";

/** Where a request belongs: a docs nav section trail, or a blog series. */
export interface RequestPlacement {
  area: ContentArea;
  project?: string;
  placement: string;
}

export const OPEN_REQUEST_STATUSES = [ContentRequestStatus.OPEN, ContentRequestStatus.ACCEPTED];

export function placementKey(p: RequestPlacement): string {
  return `${p.area}\0${p.project ?? ""}\0${p.placement}`;
}

const STATUS_LABEL: Record<number, string> = {
  [ContentRequestStatus.OPEN]: "requested",
  [ContentRequestStatus.ACCEPTED]: "accepted",
  [ContentRequestStatus.DECLINED]: "declined",
  [ContentRequestStatus.DONE]: "planned",
};

export function requestStatusLabel(status: ContentRequestStatus): string {
  return STATUS_LABEL[status] ?? "requested";
}

/** Open and accepted requests, for showing beside their placement. */
export function useOpenContentRequests(): ContentRequest[] {
  const { isAllowlisted } = useAuth();
  const { data } = useQuery(
    listContentRequests,
    { statuses: OPEN_REQUEST_STATUSES },
    { enabled: isAllowlisted },
  );
  return data?.requests ?? [];
}

export function RequestContentButton({ target }: { target: RequestPlacement }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={`Request content in ${target.placement}`}
        aria-label={`Request content in ${target.placement}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && <ContentRequestDialog target={target} onClose={() => setOpen(false)} />}
    </>
  );
}

function ContentRequestDialog({
  target,
  onClose,
}: {
  target: RequestPlacement;
  onClose: () => void;
}) {
  const { invalidateContentRequests } = useReviewInvalidation();
  const create = useMutation(createContentRequest, {
    onSuccess: () => void invalidateContentRequests(),
  });
  const isDocs = target.area === ContentArea.DOCS;
  const [title, setTitle] = useState("");
  const [diataxis, setDiataxis] = useState<string>(isDocs ? "how-to" : "");
  const [body, setBody] = useState("");

  async function submit() {
    await create.mutateAsync({
      area: target.area,
      project: target.project,
      placement: target.placement,
      diataxis: isDocs ? diataxis : "",
      title,
      bodyMd: body,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request content</DialogTitle>
          <DialogDescription>
            In <strong>{target.placement}</strong>. A maintainer triages it; once accepted it
            becomes a planned slot in the backlog.
          </DialogDescription>
        </DialogHeader>
        <div className="request-review-field">
          <label htmlFor="content-request-title">Title</label>
          <Input
            id="content-request-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Grant access with row filters"
            autoFocus
          />
        </div>
        {isDocs && (
          <div className="request-review-field">
            <label htmlFor="content-request-kind">Kind</label>
            <Select value={diataxis} onValueChange={setDiataxis}>
              <SelectTrigger id="content-request-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIATAXIS.map((d: string) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="request-review-field">
          <label htmlFor="content-request-body">What should it cover? (optional)</label>
          <Textarea
            id="content-request-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
          />
        </div>
        {create.isError && (
          <p className="request-review-error">{create.error?.message ?? "Request failed."}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={create.isPending || !title.trim()}>
            {create.isPending ? "Requesting…" : "Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dashboard list: every open or accepted request, with maintainer triage. */
export function ContentRequestList() {
  const { isMaintainer } = useAuth();
  const requests = useOpenContentRequests();
  const { invalidateContentRequests } = useReviewInvalidation();
  const update = useMutation(updateContentRequest, {
    onSuccess: () => void invalidateContentRequests(),
  });

  if (requests.length === 0) {
    return <p className="review-empty">No open content requests.</p>;
  }
  return (
    <ul className="review-dash-list">
      {requests.map((r) => (
        <li key={r.id} className="review-dash-row">
          <span className="review-dash-title" title={r.bodyMd || undefined}>
            {r.title}
          </span>
          <span className="review-dash-meta">
            <span className="review-dash-count">
              {[r.project, r.placement, r.diataxis].filter(Boolean).join(" · ")}
            </span>
            <span className="review-dash-count">
              {requestStatusLabel(r.status)} by {r.requestedByLogin}
            </span>
            {isMaintainer && r.status === ContentRequestStatus.OPEN && (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    void update.mutateAsync({ id: r.id, status: ContentRequestStatus.ACCEPTED })
                  }
                >
                  Accept
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    void update.mutateAsync({ id: r.id, status: ContentRequestStatus.DECLINED })
                  }
                >
                  Decline
                </Button>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
