// The core operations behind both the CLI and the MCP server: list review
// threads as agent work items, look one up, and reply.
import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { ReviewClient } from "./client.js";
import {
  type Comment,
  ContentArea,
  type ContentRef,
  type DraftSummary,
  type Thread,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { type Location, locate } from "./locate.js";

/**
 * Where a thread stands from the agent's point of view.
 * - `open`: a reviewer is waiting on a change or answer.
 * - `awaiting-reviewer`: the newest comment came from an agent, so the ball is
 *   in the reviewer's court. Skipping these makes reruns idempotent.
 * - `resolved`: closed by a reviewer.
 */
export type AgentState = "open" | "awaiting-reviewer" | "resolved";

export type StateFilter = "open" | "awaiting" | "unresolved" | "all";

export interface FeedbackComment {
  id: string;
  author: string;
  viaAgent: boolean;
  createdAt?: string;
  body: string;
}

export interface FeedbackThread {
  /** The thread root's comment id; what reply/get take. */
  id: string;
  ref: ContentRef;
  /** e.g. `docs/unitycatalog/how-to/create-tables` or `blogs/my-post`. */
  page: string;
  title: string;
  state: AgentState;
  /** The anchored section no longer exists in the latest registered version. */
  orphaned: boolean;
  anchor: {
    heading: string;
    fingerprint: string;
    quote?: string;
    code?: { path: string; region: string; line: number; endLine: number };
  };
  /** Commit the thread was written against. */
  authoredGitSha?: string;
  comments: FeedbackComment[];
  location?: Location;
}

export function pageKey(ref: ContentRef): string {
  return ref.area === ContentArea.BLOGS
    ? `blogs/${ref.slug}`
    : `docs/${ref.project ?? ""}/${ref.bucket ?? ""}/${ref.slug}`;
}

/** The thread's comments, oldest first. Replies arrive flattened in id (UUIDv7, time) order. */
function commentsOf(thread: Thread): Comment[] {
  return thread.root ? [thread.root, ...thread.replies] : [...thread.replies];
}

export function agentState(thread: Thread): AgentState {
  if (thread.resolved) return "resolved";
  const comments = commentsOf(thread);
  return comments[comments.length - 1]?.viaAgent ? "awaiting-reviewer" : "open";
}

export function matchesState(state: AgentState, filter: StateFilter): boolean {
  switch (filter) {
    case "open":
      return state === "open";
    case "awaiting":
      return state === "awaiting-reviewer";
    case "unresolved":
      return state !== "resolved";
    case "all":
      return true;
  }
}

function toFeedback(
  thread: Thread,
  draft: { ref: ContentRef; title: string },
  orphaned: boolean,
  repoRoot: string | undefined,
): FeedbackThread | undefined {
  const root = thread.root;
  if (!root) return undefined;
  const code = root.codeSelector;
  return {
    id: root.id,
    ref: draft.ref,
    page: pageKey(draft.ref),
    title: draft.title,
    state: agentState(thread),
    orphaned,
    anchor: {
      heading: root.anchorSlug,
      fingerprint: root.anchorFingerprint,
      quote: root.selector?.quote || undefined,
      code: code?.path
        ? { path: code.path, region: code.region, line: code.line, endLine: code.endLine }
        : undefined,
    },
    authoredGitSha: root.authoredGitSha,
    comments: commentsOf(thread).map((c) => ({
      id: c.id,
      author: c.authorName ? `${c.authorName} (@${c.authorLogin})` : `@${c.authorLogin}`,
      viaAgent: c.viaAgent,
      createdAt: c.createdAt ? timestampDate(c.createdAt).toISOString() : undefined,
      body: c.bodyMd,
    })),
    location: repoRoot ? locate(repoRoot, { ...root, ref: draft.ref }) : undefined,
  };
}

export interface ListOptions {
  area?: "docs" | "blogs";
  project?: string;
  slug?: string;
  state?: StateFilter;
  /** Checkout to locate threads in; omit to skip locating. */
  repoRoot?: string;
}

function draftMatches(d: DraftSummary, opts: ListOptions): d is DraftSummary & { ref: ContentRef } {
  if (!d.ref) return false;
  if (opts.project && d.ref.project !== opts.project) return false;
  if (opts.slug && d.ref.slug !== opts.slug) return false;
  return true;
}

async function threadsForPage(
  client: ReviewClient,
  page: { ref: ContentRef; title: string },
  repoRoot: string | undefined,
): Promise<FeedbackThread[]> {
  const res = await client.listComments({ ref: page.ref });
  return [
    ...res.threads.map((t) => toFeedback(t, page, false, repoRoot)),
    ...res.orphanedThreads.map((t) => toFeedback(t, page, true, repoRoot)),
  ].filter((t): t is FeedbackThread => t !== undefined);
}

export async function listFeedback(
  client: ReviewClient,
  opts: ListOptions = {},
): Promise<FeedbackThread[]> {
  const filter = opts.state ?? "open";
  const area =
    opts.area === "docs" ? ContentArea.DOCS : opts.area === "blogs" ? ContentArea.BLOGS : undefined;
  const { drafts } = await client.listDrafts({ area });
  // A page with no open comments can only hold resolved threads.
  const pages = drafts
    .filter((d) => draftMatches(d, opts))
    .filter((d) => filter === "all" || d.openCommentCount > 0);
  const perPage = await Promise.all(
    pages.map((d) => threadsForPage(client, { ref: d.ref, title: d.title }, opts.repoRoot)),
  );
  return perPage.flat().filter((t) => matchesState(t.state, filter));
}

/**
 * Find one thread by its root (or any reply's) id. The API looks threads up by
 * page, so pass `page` when known (the MCP server remembers it from the last
 * list); otherwise every page is scanned.
 */
export async function getThread(
  client: ReviewClient,
  id: string,
  opts: { repoRoot?: string; page?: { ref: ContentRef; title: string } } = {},
): Promise<FeedbackThread | undefined> {
  const has = (t: FeedbackThread) => t.id === id || t.comments.some((c) => c.id === id);
  if (opts.page) {
    const hit = (await threadsForPage(client, opts.page, opts.repoRoot)).find(has);
    if (hit) return hit;
  }
  const { drafts } = await client.listDrafts({});
  for (const d of drafts) {
    if (!d.ref) continue;
    const page = { ref: d.ref, title: d.title };
    // Scan without locating (it reads files), then locate only the match.
    if ((await threadsForPage(client, page, undefined)).some(has)) {
      return (await threadsForPage(client, page, opts.repoRoot)).find(has);
    }
  }
  return undefined;
}

/**
 * Reply on a thread. Always replies to the root, which keeps nesting at one
 * level regardless of how deep the conversation went (the server caps depth).
 */
export async function reply(
  client: ReviewClient,
  thread: Pick<FeedbackThread, "id" | "ref" | "anchor">,
  body: string,
): Promise<Comment | undefined> {
  const res = await client.createComment({
    ref: thread.ref,
    anchorSlug: thread.anchor.heading,
    anchorFingerprint: thread.anchor.fingerprint,
    parentId: thread.id,
    bodyMd: body,
  });
  return res.comment;
}
