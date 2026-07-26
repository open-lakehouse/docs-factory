// "Request review" affordance for a rendered artifact. Opens a dialog where an
// allowlisted reviewer names one or more reviewers (by GitHub login), marks the
// batch required or optional, and adds an optional note. The server validates
// each login against the reviewer allowlist and rejects off-list names, so this
// control keeps a light free-text input rather than shipping the allowlist to
// the client. Gated on reviewActive, like ReviewControls.
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
} from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { useReviewInvalidation } from "../../lib/review-queries";
import { ReviewRequestBadge } from "../../lib/review-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  renderTrigger,
}: {
  contentRef: ContentRef;
  renderTrigger?: (openDialog: () => void) => ReactNode;
}) {
  const { reviewActive, isMaintainer, viewer } = useAuth();
  const { invalidateReviewRequests, invalidateDrafts } = useReviewInvalidation();
  const [open, setOpen] = useState(false);
  const [logins, setLogins] = useState("");
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
      setLogins("");
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

  const parsedLogins = logins
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const existing = data?.requests ?? [];
  const actor = viewer?.userId ?? viewer?.login ?? "";

  async function send() {
    if (parsedLogins.length === 0) return;
    await submit.mutateAsync({
      ref: contentRef,
      reviewers: parsedLogins.map((login) => ({ login })),
      requirement,
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="request-review-control">
      {existing.length > 0 && (
        <ul className="request-review-open-list">
          {existing.map((r) => {
            // Requester or maintainer can cancel (mirrors the server check).
            const canCancel = isMaintainer || r.requestedBy === actor;
            return (
              <li key={r.id} className="request-review-open-row">
                <span className="request-review-reviewer">
                  {r.reviewerLogin || r.reviewerEmail || "someone"}
                </span>
                <ReviewRequestBadge requirement={r.requirement} status={r.status} />
                {canCancel && r.status === RequestStatus.OPEN && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void cancel.mutateAsync({ requestId: r.id })}
                    disabled={cancel.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <Button variant="outline" size="xs" onClick={() => setOpen(true)}>
          Request review
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a review</DialogTitle>
            <DialogDescription>
              Name one or more reviewers by GitHub login. They must be on the reviewer
              allowlist. Required requests block release until approved.
            </DialogDescription>
          </DialogHeader>

          <label className="request-review-field">
            <span>Reviewers (GitHub logins, comma or space separated)</span>
            <Textarea
              value={logins}
              onChange={(e) => setLogins(e.target.value)}
              placeholder="octocat, hubot"
              rows={2}
              autoFocus
            />
          </label>

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
            <Button onClick={() => void send()} disabled={submit.isPending || parsedLogins.length === 0}>
              {submit.isPending ? "Requesting…" : "Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
