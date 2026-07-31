// "Request review" affordance for a rendered artifact. Opens a dialog where an
// allowlisted reviewer picks one or more reviewers via a typeahead search over
// registered, allowlisted users (UserPicker), marks the batch required or
// optional, and adds an optional note. Reviewers are addressed by stable user
// id, so the server needn't re-validate free text and a rename never breaks a
// request. Open requests + "Request review" live in one compact dropdown.
// Gated on reviewActive, like ReviewControls.
import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import {
  requestReview,
  cancelReviewRequest,
  listReviewRequests,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import {
  Requirement,
  RequestStatus,
  type ContentRef,
  type UserSummary,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { useReviewInvalidation } from "../../lib/review-queries";
import { ReviewRequestBadge } from "../../lib/review-status";
import UserPicker from "./UserPicker";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function RequestReviewControl({
  contentRef,
  children,
}: {
  contentRef: ContentRef;
  /** Sibling chrome (e.g. ReviewControls) rendered beside the reviews menu. */
  children?: ReactNode;
}) {
  const { reviewActive, isMaintainer, viewer } = useAuth();
  const { invalidateReviewRequests, invalidateDrafts } = useReviewInvalidation();
  const [open, setOpen] = useState(false);
  const [reviewers, setReviewers] = useState<UserSummary[]>([]);
  const [requirement, setRequirement] = useState<Requirement>(Requirement.REQUIRED);
  const [note, setNote] = useState("");

  // Requests already open on this artifact (so the reviewer can see + cancel).
  const { data } = useQuery(
    listReviewRequests,
    { ref: contentRef, openOnly: true },
    { enabled: reviewActive },
  );

  const submit = useMutation(requestReview, {
    onSuccess: () => {
      void invalidateReviewRequests();
      void invalidateDrafts();
      setReviewers([]);
      setNote("");
      setOpen(false);
    },
  });
  const cancel = useMutation(cancelReviewRequest, {
    onSuccess: () => {
      void invalidateReviewRequests();
      void invalidateDrafts();
    },
  });

  if (!reviewActive) return null;

  const existing = data?.requests ?? [];
  const actor = viewer?.userId ?? viewer?.login ?? "";

  async function send() {
    if (reviewers.length === 0) return;
    await submit.mutateAsync({
      ref: contentRef,
      reviewers: reviewers.map((u) => ({ userId: u.userId })),
      requirement,
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="request-review-control">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1.5 px-2">
            <UsersRound aria-hidden className="size-3.5" />
            Reviews{existing.length > 0 ? ` · ${existing.length}` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Open review requests
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {existing.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">None yet.</p>
          ) : (
            existing.map((r) => {
              // Requester or maintainer can cancel (mirrors the server check).
              const canCancel = isMaintainer || r.requestedBy === actor;
              const reviewer = r.reviewerLogin || r.reviewerName || "someone";
              return (
                <div key={r.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {reviewer}
                  </span>
                  <ReviewRequestBadge requirement={r.requirement} status={r.status} />
                  {canCancel && r.status === RequestStatus.OPEN && (
                    <DropdownMenuItem
                      variant="destructive"
                      className="size-7 shrink-0 justify-center p-0"
                      disabled={cancel.isPending}
                      aria-label={`Remove review request for ${reviewer}`}
                      title="Remove review request"
                      onSelect={() => void cancel.mutateAsync({ requestId: r.id })}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </DropdownMenuItem>
                  )}
                </div>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <Plus aria-hidden className="size-3.5" />
            Request review
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {children}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a review</DialogTitle>
            <DialogDescription>
              Search for one or more reviewers. Only people who have signed in and
              are on the reviewer allowlist can be requested. Required requests
              block release until approved.
            </DialogDescription>
          </DialogHeader>

          <div className="request-review-field">
            <span>Reviewers</span>
            <UserPicker
              value={reviewers}
              onChange={setReviewers}
              multiple
              allowlistedOnly
              placeholder="Search reviewers…"
              autoFocus
            />
          </div>

          <div className="request-review-field">
            <span>Requirement</span>
            <div className="request-review-requirement">
              <Button
                type="button"
                variant={requirement === Requirement.REQUIRED ? "default" : "outline"}
                size="sm"
                onClick={() => setRequirement(Requirement.REQUIRED)}
              >
                Required
              </Button>
              <Button
                type="button"
                variant={requirement === Requirement.OPTIONAL ? "default" : "outline"}
                size="sm"
                onClick={() => setRequirement(Requirement.OPTIONAL)}
              >
                Optional
              </Button>
            </div>
          </div>

          <label className="request-review-field">
            <span>Note (optional)</span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should they focus on?"
              rows={2}
            />
          </label>

          {submit.isError && (
            <p className="request-review-error">{submit.error?.message ?? "Request failed."}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={submit.isPending || reviewers.length === 0}>
              {submit.isPending ? "Requesting…" : "Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
