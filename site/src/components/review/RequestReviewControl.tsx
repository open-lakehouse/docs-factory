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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import {
  requestReview,
  cancelReviewRequest,
  listReviewRequests,
  listDrafts,
  listContentEvents,
  recordApproval,
  dismissApproval,
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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHover = useRef(false);
  const [reviewers, setReviewers] = useState<UserSummary[]>([]);
  /** Per selected reviewer; defaults to REQUIRED when a chip is added. */
  const [requirements, setRequirements] = useState<Record<string, Requirement>>({});
  // External contributors: registered users NOT on the allowlist, invited to
  // view+comment this one artifact. They're always invited as OPTIONAL (they
  // never block release) — the server coerces regardless, but we send optional
  // so the client stays consistent and shows no required/optional switch.
  const [externals, setExternals] = useState<UserSummary[]>([]);
  const [note, setNote] = useState("");

  useEffect(
    () => () => {
      if (menuCloseTimer.current) clearTimeout(menuCloseTimer.current);
    },
    [],
  );

  function openMenu() {
    if (menuCloseTimer.current) {
      clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = null;
    }
    openedByHover.current = true;
    setMenuOpen(true);
  }

  function scheduleCloseMenu() {
    if (menuCloseTimer.current) clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = setTimeout(() => setMenuOpen(false), 150);
  }

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
  const approve = useMutation(recordApproval, {
    onSuccess: () => {
      void invalidateReviewRequests();
      void invalidateDrafts();
      void invalidateContentEvents();
    },
  });
  const dismiss = useMutation(dismissApproval, {
    onSuccess: () => {
      void invalidateReviewRequests();
      void invalidateDrafts();
      void invalidateContentEvents();
    },
  });
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
  // Soft cue on the trigger when required reviews are satisfied and the
  // artifact isn't blocked on changes-requested.
  const reviewClear =
    (summary?.reviewState === ReviewState.APPROVED ||
      summary?.reviewState === ReviewState.RELEASED) &&
    (summary?.openRequiredRequestCount ?? 0) === 0;

  async function send() {
    if (reviewers.length === 0 && externals.length === 0) return;
    const noteText = note.trim() || undefined;
    const required = reviewers.filter(
      (u) => (requirements[u.userId] ?? Requirement.REQUIRED) === Requirement.REQUIRED,
    );
    // Allowlisted reviewers marked optional, plus every external invitee — both
    // go out as OPTIONAL. Dedupe against the REQUIRED batch as well as within the
    // optional list, so a user selected as both a required reviewer AND an
    // external isn't sent two contradictory requests (REQUIRED wins — a required
    // ask is never downgraded by also appearing in the external picker).
    const optionalIds = new Set<string>(required.map((u) => u.userId));
    const optional: UserSummary[] = [];
    for (const u of [
      ...reviewers.filter((u) => requirements[u.userId] === Requirement.OPTIONAL),
      ...externals,
    ]) {
      if (optionalIds.has(u.userId)) continue;
      optionalIds.add(u.userId);
      optional.push(u);
    }
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
    setExternals([]);
    setNote("");
    setOpen(false);
  }

  return (
    <div className="request-review-control">
      {/* Non-modal: a modal dropdown puts `pointer-events: none` on the body,
          which retriggers mouseleave/mouseenter on the trigger and makes a
          hover-opened menu flicker. */}
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              "gap-1.5 px-2",
              reviewClear && "text-emerald-600/80 hover:text-emerald-600 dark:text-emerald-400/80 dark:hover:text-emerald-400",
            )}
            aria-label={
              reviewClear
                ? `Reviews${signalCount > 0 ? ` · ${signalCount}` : ""}. Requirements met.`
                : undefined
            }
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") openMenu();
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") scheduleCloseMenu();
            }}
            onPointerDown={() => {
              openedByHover.current = false;
            }}
          >
            <span className="relative inline-flex">
              <UsersRound aria-hidden className="size-3.5" />
              {reviewClear && (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-emerald-500 ring-1 ring-background"
                />
              )}
            </span>
            Reviews{signalCount > 0 ? ` · ${signalCount}` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-64"
          // A hover-opened menu shouldn't yank focus back to the trigger on close.
          onCloseAutoFocus={(e) => {
            if (openedByHover.current) e.preventDefault();
            openedByHover.current = false;
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") openMenu();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleCloseMenu();
          }}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Reviews
          </DropdownMenuLabel>
          {signalCount === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">None yet.</p>
          ) : null}
          {approvals.map((a) => {
            const who = a.approverLogin || a.approverUserId || "someone";
            const isMine = !!viewer?.userId && a.approverUserId === viewer.userId;
            return (
              <div key={a.id} className="flex items-center gap-2 px-2 py-1.5">
                <Check
                  aria-label="Approved"
                  className="size-3.5 shrink-0 text-emerald-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{who}</span>
                {isMine && (
                  <DropdownMenuItem
                    variant="destructive"
                    className="size-7 shrink-0 justify-center p-0"
                    disabled={dismiss.isPending}
                    aria-label="Dismiss my approval"
                    title="Dismiss my approval"
                    onSelect={() => void dismiss.mutateAsync({ ref: contentRef })}
                  >
                    <X aria-hidden className="size-3.5" />
                  </DropdownMenuItem>
                )}
              </div>
            );
          })}

          {latestChangesRequest && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <MessageSquareWarning
                aria-label="Changes requested"
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
            // The addressed reviewer can approve this request inline.
            const canApprove =
              !!viewer?.userId &&
              r.reviewerUserId === viewer.userId &&
              r.status === RequestStatus.OPEN;
            const reviewer = r.reviewerLogin || r.reviewerName || "someone";
            const required = r.requirement === Requirement.REQUIRED;
            return (
              <div key={r.id} className="flex items-center gap-2 px-2 py-1.5">
                <UserRoundPlus
                  aria-label="Review requested"
                  className="size-3.5 shrink-0 text-sky-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {reviewer}
                </span>
                {required ? (
                  <ShieldAlert
                    aria-label="Required review, open"
                    className="size-3.5 shrink-0 text-amber-500"
                  />
                ) : (
                  <CircleDashed
                    aria-label="Optional review, open"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                {canApprove && (
                  <DropdownMenuItem
                    className="size-7 shrink-0 justify-center p-0 text-emerald-600 focus:text-emerald-600 dark:text-emerald-400 dark:focus:text-emerald-400"
                    disabled={approve.isPending}
                    aria-label="Approve this page"
                    title="Approve"
                    onSelect={() => void approve.mutateAsync({ ref: contentRef })}
                  >
                    <Check aria-hidden className="size-3.5" />
                  </DropdownMenuItem>
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
            <DialogTitle>Request a review or invite a contributor</DialogTitle>
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

          <div className="request-review-field">
            <span>External contributors</span>
            <UserPicker
              value={externals}
              onChange={setExternals}
              multiple
              chipVariant="card"
              placeholder="Search registered users…"
            />
            <p className="request-review-hint">
              Invite a registered user who isn't a reviewer to view and comment on
              this content. They see only what's shared with them and never block
              its release.
            </p>
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
            <Button
              onClick={() => void send()}
              disabled={
                submit.isPending || (reviewers.length === 0 && externals.length === 0)
              }
            >
              {submit.isPending ? "Requesting…" : "Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
