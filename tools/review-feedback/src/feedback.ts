// The core operations behind both the CLI and the MCP server: list review
// threads as agent work items, look one up, and reply.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { parsePlannedSlug } from "../../../site/src/content-core/identity.mjs";
import type { ReviewClient } from "./client.js";
import {
  AnchorState,
  type Comment,
  CommentScope,
  ContentArea,
  type ContentRef,
  type DraftSummary,
  SuggestionState,
  type Thread,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { type Location, locate, matchSuggestion, type SuggestionMatch } from "./locate.js";
import { locateModel, type ModelTarget, modelRef, modelTarget } from "./model.js";
import { type PlannedSlot, plannedSlotRef, plannedSlots } from "./planned.js";

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

export interface FeedbackSuggestion {
  /** The passage verbatim as the reviewer saw it (rendered prose, or source lines). */
  original: string;
  /** Empty means delete the passage. */
  replacement: string;
  state: "open" | "applied" | "dismissed";
  /** Where `original` sits in the checkout, when it maps literally. */
  match?: SuggestionMatch;
}

const SUGGESTION_STATE: Partial<Record<SuggestionState, FeedbackSuggestion["state"]>> = {
  [SuggestionState.OPEN]: "open",
  [SuggestionState.APPLIED]: "applied",
  [SuggestionState.DISMISSED]: "dismissed",
};

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
    /** `document` threads are about the whole page: heading is empty. */
    scope: "section" | "document";
    heading: string;
    fingerprint: string;
    quote?: string;
    code?: { path: string; region: string; line: number; endLine: number };
    /** Where the review server's re-anchoring placed the thread on the latest version. */
    placement?: {
      state: "moved" | "rewritten" | "section";
      /** The heading the comment was written under, when it has moved since. */
      authoredHeading?: string;
      /** For `rewritten`: the text the quote approximately matches now (normalized). */
      currentQuote?: string;
    };
  };
  /** Commit the thread was written against. */
  authoredGitSha?: string;
  comments: FeedbackComment[];
  location?: Location;
  /** The reviewer's proposed wording for the anchored passage. */
  suggestion?: FeedbackSuggestion;
  /** Set on a thread left on a nav.yml planned slot: instructions for writing the page. */
  planned?: { project: string; id: string };
  /** Set on a thread on the estate model: fix it in architecture/model. */
  model?: ModelTarget;
}

export function pageKey(ref: ContentRef): string {
  if (ref.area === ContentArea.MODEL) return `model/${ref.slug}`;
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

interface Page {
  ref: ContentRef;
  title: string;
  /** A planned slot has no page file; its threads point at the nav.yml entry. */
  slot?: PlannedSlot;
}

function slotFor(repoRoot: string, ref: ContentRef): PlannedSlot | undefined {
  const planned = parsePlannedSlug(ref.slug);
  if (ref.area !== ContentArea.DOCS || !planned) return undefined;
  return plannedSlots(repoRoot).find((s) => s.project === planned.project && s.id === planned.id);
}

function slotLocation(slot: PlannedSlot): Location {
  return {
    path: slot.path,
    startLine: slot.line,
    endLine: slot.line,
    precision: "section",
    drifted: false,
    note: "planned slot: no page yet; these are instructions for writing it",
  };
}

const PLACEMENT: Partial<Record<AnchorState, "moved" | "rewritten" | "section">> = {
  [AnchorState.MOVED]: "moved",
  [AnchorState.REWRITTEN]: "rewritten",
  [AnchorState.SECTION]: "section",
};

/** The server's re-anchoring outcome, when it isn't simply "where it was written". */
function placementOf(root: Comment): FeedbackThread["anchor"]["placement"] {
  const state = PLACEMENT[root.anchorState];
  if (!state) return undefined;
  const authoredHeading =
    state !== "section" && root.authoredAnchorSlug !== root.anchorSlug
      ? root.authoredHeading || root.authoredAnchorSlug || undefined
      : undefined;
  return { state, authoredHeading, currentQuote: root.anchorCurrentQuote || undefined };
}

function toFeedback(
  thread: Thread,
  draft: Page,
  orphaned: boolean,
  repoRoot: string | undefined,
): FeedbackThread | undefined {
  const root = thread.root;
  if (!root) return undefined;
  const code = root.codeSelector;
  // A remembered page (MCP get/reply) carries no slot; recover it from the checkout.
  const slot = draft.slot ?? (repoRoot ? slotFor(repoRoot, draft.ref) : undefined);
  const model = modelTarget(draft.ref);
  const location = slot
    ? slotLocation(slot)
    : !repoRoot
      ? undefined
      : model
        ? locateModel(repoRoot, model)
        : locate(repoRoot, { ...root, ref: draft.ref });
  return {
    id: root.id,
    ref: draft.ref,
    page: pageKey(draft.ref),
    title: draft.title,
    state: agentState(thread),
    orphaned,
    anchor: {
      scope: root.scope === CommentScope.DOCUMENT ? "document" : "section",
      heading: root.anchorSlug,
      fingerprint: root.anchorFingerprint,
      quote: root.selector?.quote || undefined,
      placement: placementOf(root),
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
    location,
    suggestion: root.suggestion && {
      original: root.suggestion.original,
      replacement: root.suggestion.replacement,
      state: SUGGESTION_STATE[root.suggestion.state] ?? "open",
      match: suggestionMatch(repoRoot, location, root.suggestion.original, Boolean(code?.path)),
    },
    planned: slot && { project: slot.project, id: slot.id },
    model,
  };
}

function suggestionMatch(
  repoRoot: string | undefined,
  loc: Location | undefined,
  original: string,
  code: boolean,
): SuggestionMatch | undefined {
  if (!repoRoot || !loc) return undefined;
  const abs = join(repoRoot, loc.path);
  if (!existsSync(abs)) return undefined;
  return matchSuggestion(readFileSync(abs, "utf8"), loc, original, code);
}

export interface ListOptions {
  area?: "docs" | "blogs" | "model";
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
  page: Page,
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
  const drafts = opts.area === "model" ? [] : (await client.listDrafts({ area })).drafts;
  // A page with no open comments can only hold resolved threads.
  const pages = drafts
    .filter((d) => draftMatches(d, opts))
    .filter((d) => filter === "all" || d.openCommentCount > 0);
  const perPage = await Promise.all([
    ...pages.map((d) => threadsForPage(client, { ref: d.ref, title: d.title }, opts.repoRoot)),
    ...plannedPages(opts).map((p) => threadsForPage(client, p, opts.repoRoot)),
    ...(await modelPages(client, opts)).map((p) => threadsForPage(client, p, opts.repoRoot)),
  ]);
  return perPage.flat().filter((t) => matchesState(t.state, filter));
}

/**
 * The model targets that have threads, from the recent MODEL comments. The
 * model has no draft list to enumerate, and a thread with no recent activity
 * past the server's window is the rare one an agent would miss.
 */
async function modelPages(client: ReviewClient, opts: ListOptions): Promise<Page[]> {
  if (opts.area !== undefined && opts.area !== "model") return [];
  if (opts.project) return [];
  const { comments } = await client.listRecentComments({ area: ContentArea.MODEL, limit: 100 });
  const slugs = [...new Set(comments.flatMap((c) => (c.ref?.slug ? [c.ref.slug] : [])))];
  return slugs
    .filter((slug) => !opts.slug || slug === opts.slug)
    .map((slug) => ({ ref: modelRef(slug), title: `model ${slug}` }));
}

/** Planned slots as pages, when listing docs from a checkout. */
function plannedPages(opts: ListOptions): Page[] {
  if (!opts.repoRoot || opts.area === "blogs" || opts.area === "model") return [];
  return plannedSlots(opts.repoRoot)
    .filter((slot) => !opts.project || slot.project === opts.project)
    .map((slot) => ({ ref: plannedSlotRef(slot), title: `${slot.id} · ${slot.title}`, slot }))
    .filter((p) => !opts.slug || p.ref.slug === opts.slug);
}

/**
 * Find one thread by its root (or any reply's) id. The API looks threads up by
 * page, so pass `page` when known (the MCP server remembers it from the last
 * list); otherwise every page is scanned.
 */
export async function getThread(
  client: ReviewClient,
  id: string,
  opts: { repoRoot?: string; page?: Page } = {},
): Promise<FeedbackThread | undefined> {
  const has = (t: FeedbackThread) => t.id === id || t.comments.some((c) => c.id === id);
  if (opts.page) {
    const hit = (await threadsForPage(client, opts.page, opts.repoRoot)).find(has);
    if (hit) return hit;
  }
  const { drafts } = await client.listDrafts({});
  const pages: Page[] = [
    ...drafts.flatMap((d) => (d.ref ? [{ ref: d.ref, title: d.title }] : [])),
    ...plannedPages({ repoRoot: opts.repoRoot }),
    ...(await modelPages(client, {})),
  ];
  for (const page of pages) {
    // Scan without locating (it reads files), then locate only the match.
    if ((await threadsForPage(client, page, undefined)).some(has)) {
      return (await threadsForPage(client, page, opts.repoRoot)).find(has);
    }
  }
  return undefined;
}

/** Mark a thread's suggestion applied: the agent landed the change. */
export async function markSuggestionApplied(client: ReviewClient, threadId: string): Promise<void> {
  await client.setSuggestionState({ commentId: threadId, state: SuggestionState.APPLIED });
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
