// Quality rating for a rendered page: a compact average trigger in the page
// chrome that opens a dialog to record the viewer's own 1–5 rating (pros/cons,
// dimension strengths/weaknesses, good/bad exemplar) and read others'.

import { useMutation, useQuery } from "@connectrpc/connect-query";
import { Star } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type ContentRef,
  Exemplar,
  type Rating,
} from "../../gen/docs_factory/review/v1/messages_pb";
import {
  listDrafts,
  listRatings,
  recordRating,
  withdrawRating,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import {
  DIMENSIONS,
  type DimensionMarks,
  dimensionLabel,
  marksFrom,
  nextMark,
  ratingLabel,
  splitMarks,
} from "../../lib/rating";
import { sameRef, useReviewInvalidation } from "../../lib/review-queries";

export default function RatingControl({ contentRef }: { contentRef: ContentRef }) {
  const { isAllowlisted, reviewActive, viewer } = useAuth();
  const { invalidateDrafts, invalidateRatings } = useReviewInvalidation();
  const { data } = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const others = useQuery(listRatings, { ref: contentRef }, { enabled: open && isAllowlisted });
  const invalidate = () => {
    void invalidateDrafts();
    void invalidateRatings();
  };
  const record = useMutation(recordRating, { onSuccess: invalidate });
  const withdraw = useMutation(withdrawRating, { onSuccess: invalidate });

  const [score, setScore] = useState(0);
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [marks, setMarks] = useState<DimensionMarks>(new Map());
  const [exemplar, setExemplar] = useState(Exemplar.UNSPECIFIED);

  if (!reviewActive || !isAllowlisted) return null;

  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const mine = summary?.myRating;
  const latestVersionId = summary?.latestVersion?.id;
  const stale = !!mine?.versionId && !!latestVersionId && mine.versionId !== latestVersionId;
  const label = ratingLabel(summary?.ratingSummary);

  // Seed the form from the viewer's active rating each time the dialog opens.
  function openDialog() {
    setScore(mine?.score ?? 0);
    setPros(mine?.prosMd ?? "");
    setCons(mine?.consMd ?? "");
    setMarks(marksFrom(mine?.strengths ?? [], mine?.weaknesses ?? []));
    setExemplar(mine?.exemplar ?? Exemplar.UNSPECIFIED);
    record.reset();
    setOpen(true);
  }

  async function save() {
    await record.mutateAsync({
      ref: contentRef,
      score,
      prosMd: pros,
      consMd: cons,
      ...splitMarks(marks),
      exemplar,
    });
    setOpen(false);
  }

  async function doWithdraw() {
    await withdraw.mutateAsync({ ref: contentRef });
    setOpen(false);
  }

  const busy = record.isPending || withdraw.isPending;
  const otherRatings = (others.data?.ratings ?? []).filter((r) => r.raterUserId !== viewer?.userId);

  return (
    <>
      <Button
        variant="outline"
        size="xs"
        onClick={openDialog}
        title={mine ? `Your rating: ${mine.score}/5` : "Rate this page"}
      >
        <Star aria-hidden className={cn("rating-trigger-star", mine && "is-rated")} />
        {label ? label.replace("★ ", "") : "Rate"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rating-dialog">
          <DialogHeader>
            <DialogTitle>Rate this page</DialogTitle>
            <DialogDescription>
              Feedback on content quality, recorded against the current version. Ratings don't
              affect review state.
            </DialogDescription>
          </DialogHeader>

          {stale && (
            <p className="rating-stale">
              The page changed since your last rating. Saving records a new rating for this version
              and keeps the old one.
            </p>
          )}

          <fieldset className="rating-stars" aria-label="Score">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={score === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className={cn("rating-star", n <= score && "is-on")}
                onClick={() => setScore(n)}
              >
                <Star aria-hidden />
              </button>
            ))}
          </fieldset>

          <div className="request-review-field">
            <label htmlFor={`${fieldId}-pros`}>What works</label>
            <Textarea
              id={`${fieldId}-pros`}
              value={pros}
              onChange={(e) => setPros(e.target.value)}
              rows={2}
            />
          </div>
          <div className="request-review-field">
            <label htmlFor={`${fieldId}-cons`}>What doesn't</label>
            <Textarea
              id={`${fieldId}-cons`}
              value={cons}
              onChange={(e) => setCons(e.target.value)}
              rows={2}
            />
          </div>

          <div className="request-review-field">
            <span>Dimensions (click: strength → weakness → clear)</span>
            <div className="rating-chips">
              {DIMENSIONS.map(({ value, label: dimLabel }) => {
                const mark = marks.get(value) ?? "neutral";
                return (
                  <button
                    key={value}
                    type="button"
                    className={cn("rating-chip", `is-${mark}`)}
                    aria-label={`${dimLabel}: ${mark}`}
                    onClick={() => setMarks(new Map(marks).set(value, nextMark(mark)))}
                  >
                    {mark === "strength" ? "+ " : mark === "weakness" ? "− " : ""}
                    {dimLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="request-review-field">
            <span>Reference example</span>
            <div className="rating-chips">
              {(
                [
                  [Exemplar.GOOD, "Good example", "is-strength"],
                  [Exemplar.BAD, "Bad example", "is-weakness"],
                ] as const
              ).map(([value, text, cls]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={exemplar === value}
                  className={cn("rating-chip", exemplar === value ? cls : "is-neutral")}
                  onClick={() => setExemplar(exemplar === value ? Exemplar.UNSPECIFIED : value)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {(record.isError || withdraw.isError) && (
            <p className="request-review-error">
              {(record.error ?? withdraw.error)?.message ?? "Saving the rating failed."}
            </p>
          )}

          <DialogFooter>
            {mine && (
              <Button variant="outline" onClick={() => void doWithdraw()} disabled={busy}>
                Withdraw
              </Button>
            )}
            <Button onClick={() => void save()} disabled={busy || score === 0}>
              {record.isPending ? "Saving…" : "Save rating"}
            </Button>
          </DialogFooter>

          {otherRatings.length > 0 && (
            <ul className="rating-others">
              {otherRatings.map((r) => (
                <OtherRating key={r.id} rating={r} />
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OtherRating({ rating: r }: { rating: Rating }) {
  return (
    <li>
      <div className="rating-other-head">
        <span className="mono">{r.raterLogin ?? r.raterUserId}</span>
        <span>{"★".repeat(r.score)}</span>
        {r.exemplar === Exemplar.GOOD && (
          <span className="rating-chip is-strength">good example</span>
        )}
        {r.exemplar === Exemplar.BAD && (
          <span className="rating-chip is-weakness">bad example</span>
        )}
      </div>
      {(r.strengths.length > 0 || r.weaknesses.length > 0) && (
        <p className="muted">
          {[
            ...r.strengths.map((d) => `+ ${dimensionLabel(d)}`),
            ...r.weaknesses.map((d) => `− ${dimensionLabel(d)}`),
          ].join(" · ")}
        </p>
      )}
      {r.prosMd && (
        <p>
          <span className="muted">Works:</span> {r.prosMd}
        </p>
      )}
      {r.consMd && (
        <p>
          <span className="muted">Doesn't:</span> {r.consMd}
        </p>
      )}
    </li>
  );
}
