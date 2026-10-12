// Content requests: reviewers ask for missing content where it should live (a
// docs nav section, a blog series), or for a journey to track in a project's
// compatibility matrix. Maintainers accept or decline; an agent marks an
// accepted request done once its `planned:` slot (or journey) lands in git.
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
import { PROJECT_LABELS, projectNav } from "../../doc-nav";
import {
  ContentArea,
  type ContentRequest,
  ContentRequestKind,
  ContentRequestStatus,
} from "../../gen/docs_factory/review/v1/messages_pb";
import {
  createContentRequest,
  listContentRequests,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { useReviewInvalidation } from "../../lib/review-queries";
import { vocab } from "../../vocab";

const DOC_PROJECTS = Object.keys(projectNav).sort();

/** Where a request belongs: a docs nav section trail, a blog series, or (for a
 * journey) a compatibility table id. */
export interface RequestPlacement {
  area: ContentArea;
  project?: string;
  placement: string;
  /** Absent is a page. */
  kind?: ContentRequestKind;
}

function isJourney(p: { kind?: ContentRequestKind }): boolean {
  return p.kind === ContentRequestKind.JOURNEY;
}

export const OPEN_REQUEST_STATUSES = [ContentRequestStatus.OPEN, ContentRequestStatus.ACCEPTED];

export function placementKey(p: RequestPlacement): string {
  return `${isJourney(p) ? "journey" : "page"}\0${p.area}\0${p.project ?? ""}\0${p.placement}`;
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

export function TrackJourneyButton({ project, table }: { project: string; table: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        <MessageSquarePlus aria-hidden="true" />
        Track a journey
      </Button>
      {open && (
        <ContentRequestDialog
          target={{
            area: ContentArea.DOCS,
            project,
            placement: table,
            kind: ContentRequestKind.JOURNEY,
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The body line that ties an explanation request to its model concept. */
export function explainsLine(conceptId: string): string {
  return `explains: ${conceptId}`;
}

/** Ask for an explanation page for a model concept; the requester picks the project. */
export function RequestExplanationButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        <MessageSquarePlus aria-hidden="true" />
        Request explanation
      </Button>
      {open && (
        <ContentRequestDialog
          target={{ area: ContentArea.DOCS, placement: "Explanation" }}
          initial={{ title, diataxis: "explanation", body: `${explainsLine(id)}\n\n` }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ContentRequestDialog({
  target,
  initial,
  onClose,
}: {
  /** Without a `project`, a docs request asks for one. */
  target: RequestPlacement;
  initial?: { title: string; diataxis: string; body: string };
  onClose: () => void;
}) {
  const { invalidateContentRequests } = useReviewInvalidation();
  const create = useMutation(createContentRequest, {
    onSuccess: () => void invalidateContentRequests(),
  });
  const journey = isJourney(target);
  const isDocs = target.area === ContentArea.DOCS && !journey;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [diataxis, setDiataxis] = useState<string>(initial?.diataxis ?? (isDocs ? "how-to" : ""));
  const [body, setBody] = useState(initial?.body ?? "");
  const pickProject = isDocs && !target.project;
  const [project, setProject] = useState(target.project ?? DOC_PROJECTS[0] ?? "");

  async function submit() {
    await create.mutateAsync({
      area: target.area,
      project: target.area === ContentArea.DOCS ? project : target.project,
      placement: target.placement,
      diataxis: isDocs ? diataxis : "",
      title,
      bodyMd: body,
      kind: journey ? ContentRequestKind.JOURNEY : ContentRequestKind.PAGE,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{journey ? "Track a journey" : "Request content"}</DialogTitle>
          <DialogDescription>
            {journey ? (
              <>
                Something readers do, tracked per engine and client in{" "}
                <strong>{target.placement}</strong>. A maintainer triages it; once accepted it
                becomes a row in the compatibility matrix.
              </>
            ) : (
              <>
                In <strong>{target.placement}</strong>. A maintainer triages it; once accepted it
                becomes a planned slot in the backlog.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="request-review-field">
          <label htmlFor="content-request-title">Title</label>
          <Input
            id="content-request-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              journey ? "e.g. Vacuum a managed table" : "e.g. Grant access with row filters"
            }
            autoFocus
          />
        </div>
        {pickProject && (
          <div className="request-review-field">
            <label htmlFor="content-request-project">Project</label>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger id="content-request-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_PROJECTS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROJECT_LABELS[p] ?? p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {isDocs && (
          <div className="request-review-field">
            <label htmlFor="content-request-kind">Kind</label>
            <Select value={diataxis} onValueChange={setDiataxis}>
              <SelectTrigger id="content-request-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vocab.diataxis.map((d: string) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="request-review-field">
          <label htmlFor="content-request-body">
            {journey
              ? "Which engines or clients, and what counts as done? (optional)"
              : "What should it cover? (optional)"}
          </label>
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
