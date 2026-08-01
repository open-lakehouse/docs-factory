// "Request review" affordance for a rendered artifact. Opens a dialog where an
// allowlisted reviewer picks one or more reviewers via a typeahead search over
// registered, allowlisted users (UserPicker), sets Required/Optional per
// selected chip, and adds an optional note. Reviewers are addressed by stable
// user id, so the server needn't re-validate free text and a rename never
// breaks a request. The create RPC is still batch-scoped on requirement, so
// submit groups chips into up to two calls.
//
// The Reviews menu lists active outcomes for this page — open requests,
// recorded approvals (including unsolicited ones), and the current
// changes-requested actor when that state is active. Gated on reviewActive.
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import {
  requestReview,
  cancelReviewRequest,
  listReviewRequests,
  listDrafts,
  listContentEvents,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import {
  EventKind,
  Requirement,
  RequestStatus,
  ReviewState,
  type ContentRef,
  type UserSummary,
} from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { sameRef, useReviewInvalidation } from "../../lib/review-queries";
import UserPicker from "./UserPicker";
import {
  Check,
  CircleDashed,
  MessageSquareWarning,
  Plus,
  ShieldAlert,
  Trash2,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  const { invalidateReviewRequests, invalidateDrafts, invalidateContentEvents } =
    useReviewInvalidation();
  const [open, setOpen] = useState(false);
  const [reviewers, setReviewers] = useState<UserSummary[]>([]);
  /** Per selected reviewer; defaults to REQUIRED when a chip is added. */
  const [requirements, setRequirements] = useState<Record<string, Requirement>>({});
  const [note, setNote] = useState("");

  // Requests already open on this artifact (so the reviewer can see + cancel).
  const { data } = useQuery(
    listReviewRequests,
    { ref: contentRef, openOnly: true },
    { enabled: reviewActive },
  );
  // Approvals live on the draft summary (active / non-dismissed), including
  // reviewers who approved without an open request.
  const { data: draftsData } = useQuery(listDrafts, {}, { enabled: reviewActive });
  // Changes-requested is a state transition; the latest actor comes from events.
  const { data: eventsData } = useQuery(
    listContentEvents,
    { ref: contentRef },
    { enabled: reviewActive },
  );

  const submit = useMutation(requestReview);
  const cancel = useMutation(cancelReviewRequest, {
    onSuccess: () => {
      void invalidateReviewRequests();
      void invalidateDrafts();
    },
  });

  function setReviewerList(next: UserSummary[]) {
    setReviewers(next);
    setRequirements((prev) => {
      const out: Record<string, Requirement> = {};
      for (const u of next) {
        out[u.userId] = prev[u.userId] ?? Requirement.REQUIRED;
      }
      return out;
    });
  }

  function setReviewerRequirement(userId: string, requirement: Requirement) {
    setRequirements((prev) => ({ ...prev, [userId]: requirement }));
  }

  const summary = draftsData?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const approvals = summary?.approvals ?? [];
  const existing = data?.requests ?? [];
  // When the artifact is in changes-requested, surface who last flipped it —
  // that actor may never have had an open "review request" row.
  const latestChangesRequest = useMemo(() => {
    if (summary?.reviewState !== ReviewState.CHANGES_REQUESTED) return undefined;
    const candidates = (eventsData?.events ?? []).filter(
      (e) => e.kind === EventKind.STATE_CHANGES_REQUESTED,
    );
    if (candidates.length === 0) return undefined;
    return candidates.reduce((best, e) => {
      const a = e.createdAt?.seconds ?? 0n;
      const b = best.createdAt?.seconds ?? 0n;
      return a >= b ? e : best;
    });
  }, [eventsData?.events, summary?.reviewState]);

  if (!reviewActive) return null;

  const actor = viewer?.userId ?? viewer?.login ?? "";
  const signalCount =
    existing.length + approvals.length + (latestChangesRequest ? 1 : 0);

  async function send() {
    if (reviewers.length === 0) return;
    const noteText = note.trim() || undefined;
    const required = reviewers.filter(
      (u) => (requirements[u.userId] ?? Requirement.REQUIRED) === Requirement.REQUIRED,
    );
    const optional = reviewers.filter(
      (u) => requirements[u.userId] === Requirement.OPTIONAL,
    );
    // One requirement per RPC — split into at most two batches.
    if (required.length > 0) {
      await submit.mutateAsync({
        ref: contentRef,
        reviewers: required.map((u) => ({ userId: u.userId })),
        requirement: Requirement.REQUIRED,
        note: noteText,
      });
    }
    if (optional.length > 0) {
      await submit.mutateAsync({
        ref: contentRef,
        reviewers: optional.map((u) => ({ userId: u.userId })),
        requirement: Requirement.OPTIONAL,
        note: noteText,
      });
    }
    void invalidateReviewRequests();
    void invalidateDrafts();
    void invalidateContentEvents();
    setReviewers([]);
    setRequirements({});
    setNote("");
    setOpen(false);
  }

  return (
    <div className="request-review-control">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1.5 px-2">
            <UsersRound aria-hidden className="size-3.5" />
            Reviews{signalCount > 0 ? ` · ${signalCount}` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Reviews
          </DropdownMenuLabel>
          {signalCount === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">None yet.</p>
          ) : null}
          {approvals.map((a) => {
            const who = a.approverLogin || a.approverUserId || "someone";
            return (
              <div key={a.id} className="flex items-center gap-2 px-2 py-1.5">
                <Check
                  aria-label="Approved"
                  title="Approved"
                  className="size-3.5 shrink-0 text-emerald-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{who}</span>
              </div>
            );
          })}

          {latestChangesRequest && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <MessageSquareWarning
                aria-label="Changes requested"
                title="Changes requested"
                className="size-3.5 shrink-0 text-amber-500"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {latestChangesRequest.actor || "someone"}
              </span>
            </div>
          )}

          {existing.map((r) => {
            // Requester or maintainer can cancel (mirrors the server check).
            const canCancel = isMaintainer || r.requestedBy === actor;
            const reviewer = r.reviewerLogin || r.reviewerName || "someone";
            const required = r.requirement === Requirement.REQUIRED;
            return (
              <div key={r.id} className="flex items-center gap-2 px-2 py-1.5">
                <UserRoundPlus
                  aria-label="Review requested"
                  title="Review requested"
                  className="size-3.5 shrink-0 text-sky-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {reviewer}
                </span>
                {required ? (
                  <ShieldAlert
                    aria-label="Required review, open"
                    title="Required review · open"
                    className="size-3.5 shrink-0 text-amber-500"
                  />
                ) : (
                  <CircleDashed
                    aria-label="Optional review, open"
                    title="Optional review · open"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
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
          })}
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
          </DialogHeader>

          <div className="request-review-field">
            <span>Reviewers</span>
            <UserPicker
              value={reviewers}
              onChange={setReviewerList}
              multiple
              allowlistedOnly
              chipVariant="card"
              placeholder="Search reviewers…"
              autoFocus
              renderChipExtra={(u) => {
                const required =
                  (requirements[u.userId] ?? Requirement.REQUIRED) === Requirement.REQUIRED;
                return (
                  <label className="user-picker-chip-req">
                    <span>{required ? "Required" : "Optional"}</span>
                    <Switch
                      checked={required}
                      aria-label={`Required review for ${u.githubLogin || u.userId}`}
                      onCheckedChange={(on) =>
                        setReviewerRequirement(
                          u.userId,
                          on ? Requirement.REQUIRED : Requirement.OPTIONAL,
                        )
                      }
                    />
                  </label>
                );
              }}
            />
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
