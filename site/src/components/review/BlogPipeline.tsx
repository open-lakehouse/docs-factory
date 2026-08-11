// The blog RevOps pipeline: priority order + target release dates. Reviewer-only
// (caller gates). DB-authoritative via content_revops (SetPriority /
// SetTargetReleaseDate) — NOT git frontmatter. Ideas (frontmatter_status "idea")
// show up as first-class rows so a post can be ranked before it's fully drafted.
//
// Reorder is drag-and-drop over an integer rank: dropping a row assigns a dense
// 1..N rank across the whole list. Rows without a priority yet ("unranked") sort
// last and get a dense rank the first time they're moved into the ranked list.
//
// Rows expand (one at a time) to show the blog metadata header + event timeline.
// Used by the Review workspace Overview tab (and the classic review dashboard on
// narrow screens); the old standalone /review/revops page redirects into Overview.

import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { findBlog } from "../../content";
import {
  ContentArea,
  type ContentRef,
  type DraftSummary,
} from "../../gen/docs_factory/review/v1/messages_pb";
import {
  listDrafts,
  setPriority,
  setTargetReleaseDate,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { refHref } from "../../lib/content-ref";
import { useReviewInvalidation } from "../../lib/review-queries";
import { ReviewStateBadge } from "../../lib/review-status";
import BlogPostDetail from "../BlogPostDetail";
import { FrontmatterStatusBadge } from "../StatusBadge";
import ContentEventTimeline from "./ContentEventTimeline";

/** Columns in the main row (for detail colspan). */
const COL_COUNT = 7;

function draftLabel(d: DraftSummary): string {
  return d.title || d.ref?.slug || "(untitled)";
}

function rowId(d: DraftSummary): string {
  return d.ref ? refHref(d.ref) : draftLabel(d);
}

/** A Timestamp -> "YYYY-MM-DD" for the date input (UTC calendar date). */
function toDateInput(ts: DraftSummary["targetReleaseDate"]): string {
  if (!ts) return "";
  return timestampDate(ts).toISOString().slice(0, 10);
}

type SortableRowProps = {
  draft: DraftSummary;
  busy: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onDateChange: (ref: ContentRef | undefined, value: string) => void;
};

function SortableRow({ draft: d, busy, isOpen, onToggle, onDateChange }: SortableRowProps) {
  const id = rowId(d);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: busy });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const post = d.ref?.slug ? findBlog(d.ref.slug) : undefined;

  function onRowClick(e: MouseEvent) {
    // Interactive cells (links, date, drag handle) own their clicks.
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, label")) return;
    onToggle();
  }

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={cn("revops-row", isOpen && "open", isDragging && "revops-row-dragging")}
        onClick={onRowClick}
        aria-expanded={isOpen}
      >
        <td className="revops-col-move">
          <button
            ref={setActivatorNodeRef}
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-xs" }),
              "revops-drag-handle",
            )}
            aria-label={`Reorder ${draftLabel(d)}`}
            disabled={busy}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3" />
          </button>
        </td>
        <td className="revops-col-chevron">
          {isOpen ? (
            <ChevronDown className="revops-chevron" aria-hidden="true" />
          ) : (
            <ChevronRight className="revops-chevron" aria-hidden="true" />
          )}
        </td>
        <td className="revops-col-rank mono">{d.priority != null ? d.priority : "—"}</td>
        <td>
          {d.ref ? (
            <Link to={refHref(d.ref)} className="revops-title">
              {draftLabel(d)}
            </Link>
          ) : (
            <span className="revops-title">{draftLabel(d)}</span>
          )}
          {post?.frontmatter.series && (
            <span className="revops-series">({post.frontmatter.series})</span>
          )}
        </td>
        <td>{d.frontmatterStatus && <FrontmatterStatusBadge status={d.frontmatterStatus} />}</td>
        <td>
          <ReviewStateBadge state={d.reviewState} />
        </td>
        <td>
          <input
            type="date"
            className="revops-date"
            value={toDateInput(d.targetReleaseDate)}
            disabled={busy}
            onChange={(e) => void onDateChange(d.ref, e.target.value)}
            // Empty date inputs select the dd/mm/yyyy segments on click instead of
            // opening the calendar. Force the native picker for a consistent hit target.
            onClick={(e) => {
              const input = e.currentTarget;
              try {
                input.showPicker();
              } catch {
                // Unsupported / not allowed — fall through to native behavior.
              }
            }}
          />
        </td>
      </tr>
      {isOpen && (
        <tr className="revops-detail-row">
          <td colSpan={COL_COUNT}>
            <div className="revops-detail">
              {post ? (
                <BlogPostDetail post={post} />
              ) : (
                <p className="muted">No on-disk metadata for this post yet.</p>
              )}
              {d.ref && (
                <div className="revops-detail-timeline">
                  <ContentEventTimeline contentRef={d.ref} />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function BlogPipeline({
  heading = "Blog pipeline",
  showIntro = true,
}: {
  heading?: string;
  /** When false, omit the explanatory paragraph (e.g. Overview tab chrome). */
  showIntro?: boolean;
}) {
  const { isAllowlisted } = useAuth();
  const { invalidateDrafts } = useReviewInvalidation();
  const { data, isLoading: draftsLoading } = useQuery(
    listDrafts,
    { area: ContentArea.BLOGS, orderByPriority: true },
    { enabled: isAllowlisted },
  );

  const prioritize = useMutation(setPriority, {
    onSuccess: () => void invalidateDrafts(),
  });
  const retarget = useMutation(setTargetReleaseDate, {
    onSuccess: () => void invalidateDrafts(),
  });

  // Server already orders ranked-first / unranked-last; keep a local copy for
  // optimistic drag-and-drop reordering.
  const serverRows = useMemo(() => data?.drafts ?? [], [data]);
  const [rows, setRows] = useState<DraftSummary[]>(serverRows);
  // Accordion: at most one expanded row (matches ContentTable).
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setRows(serverRows);
  }, [serverRows]);

  const busy = prioritize.isPending || retarget.isPending;
  const rowIds = useMemo(() => rows.map(rowId), [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Reorder by dragging to a new position. Assign a dense 1..N rank across the
  // whole list (idempotent — re-sending a row's current rank is a no-op) so
  // unranked rows get a concrete priority the moment they move.
  async function persistOrder(nextRows: DraftSummary[]) {
    await Promise.all(
      nextRows.map((r, i) => {
        if (!r.ref) return Promise.resolve();
        const rank = i + 1;
        return prioritize.mutateAsync({ ref: r.ref, priority: rank });
      }),
    );
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rows.findIndex((r) => rowId(r) === active.id);
    const newIndex = rows.findIndex((r) => rowId(r) === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextRows = arrayMove(rows, oldIndex, newIndex);
    setRows(nextRows);
    await persistOrder(nextRows);
  }

  async function onDateChange(ref: ContentRef | undefined, value: string) {
    if (!ref) return;
    if (!value) {
      await retarget.mutateAsync({ ref });
      return;
    }
    // Parse the date input as a UTC calendar date (midnight) for the wire.
    const date = new Date(`${value}T00:00:00.000Z`);
    await retarget.mutateAsync({ ref, targetReleaseDate: timestampFromDate(date) });
  }

  return (
    <div className="revops-dashboard">
      {heading ? <h1>{heading}</h1> : null}
      {showIntro && (
        <p className="muted">
          The blog backlog in priority order. Rank posts and set target release dates — including
          early <code>idea</code> folders, so the pipeline reflects what's coming before it's fully
          drafted.
        </p>
      )}

      {draftsLoading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="review-empty">No blog posts yet.</p>
      ) : (
        <table className="revops-table">
          <thead>
            <tr>
              <th className="revops-col-move">
                <span className="sr-only">Order</span>
              </th>
              <th className="revops-col-chevron" aria-hidden="true" />
              <th className="revops-col-rank">#</th>
              <th>Post</th>
              <th>Status</th>
              <th>Review</th>
              <th>Target release</th>
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {rows.map((d) => {
                  const id = rowId(d);
                  return (
                    <SortableRow
                      key={id}
                      draft={d}
                      busy={busy}
                      isOpen={openId === id}
                      onToggle={() => setOpenId((cur) => (cur === id ? null : id))}
                      onDateChange={onDateChange}
                    />
                  );
                })}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      )}
    </div>
  );
}
