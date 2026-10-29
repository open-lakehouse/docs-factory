// The cross-page comment feed: recent comments (roots and replies, newest
// first) collapsed to one entry per thread and grouped by page. Pages order by
// their newest activity and threads within a page newest first, so the
// flattened order is also the stepper's queue. Pure, for bun tests.
import type { ContentRef, RecentComment } from "../gen/docs_factory/review/v1/messages_pb";
import { refKey } from "./review-queries";

export interface FeedThread {
  rootId: string;
  ref: ContentRef;
  anchorSlug: string;
  headingText: string;
  /** The thread's newest comment in the window. */
  latest: RecentComment;
  /** Comments of this thread in the window. */
  count: number;
  unread: number;
  resolved: boolean;
}

export interface FeedGroup {
  key: string;
  ref: ContentRef;
  title: string;
  threads: FeedThread[];
}

/** A thread is keyed by its root: parent_id on a reply, else the comment's own id. */
export function threadRootOf(rc: RecentComment): string | undefined {
  return rc.comment ? rc.comment.parentId || rc.comment.id : undefined;
}

export function buildFeed(
  recent: RecentComment[],
  opts: { showResolved: boolean; titleOf: (rc: RecentComment) => string },
): FeedGroup[] {
  const groups = new Map<string, FeedGroup>();
  const threads = new Map<string, FeedThread>();
  // `recent` is newest first, so the first comment seen per thread is its latest
  // and the first thread seen per page fixes the page's position.
  for (const rc of recent) {
    const rootId = threadRootOf(rc);
    if (!rootId || !rc.ref) continue;
    if (rc.resolved && !opts.showResolved) continue;
    const existing = threads.get(rootId);
    if (existing) {
      existing.count += 1;
      if (rc.unread) existing.unread += 1;
      continue;
    }
    const thread: FeedThread = {
      rootId,
      ref: rc.ref,
      anchorSlug: rc.anchorSlug,
      headingText: rc.headingText,
      latest: rc,
      count: 1,
      unread: rc.unread ? 1 : 0,
      resolved: rc.resolved,
    };
    threads.set(rootId, thread);
    const key = refKey(rc.ref);
    let group = groups.get(key);
    if (!group) {
      group = { key, ref: rc.ref, title: opts.titleOf(rc), threads: [] };
      groups.set(key, group);
    }
    group.threads.push(thread);
  }
  return [...groups.values()];
}

/** The stepper's order: every thread, page by page. */
export function feedQueue(groups: FeedGroup[]): FeedThread[] {
  return groups.flatMap((g) => g.threads);
}

/**
 * The first thread after `from` that is still open, or -1. `resolved` holds
 * threads resolved since the queue was snapshotted, which the snapshot can't see.
 */
export function nextOpenIndex(
  queue: FeedThread[],
  from: number,
  resolved: ReadonlySet<string>,
): number {
  for (let i = from + 1; i < queue.length; i++) {
    if (!queue[i].resolved && !resolved.has(queue[i].rootId)) return i;
  }
  return -1;
}
