// Review status as agent work items. An approval is the signal to set
// `status: ready` (that merged to main is the release, ADR-0002), so "approved,
// not yet ready" is the actionable state; "ready without approval" is a warning.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { splitFrontmatter } from "../../../site/src/content-core/frontmatter.mjs";
import { docIdentity } from "../../../site/src/content-core/identity.mjs";
import type { ReviewClient } from "./client.js";
import { pageKey } from "./feedback.js";
import {
  ContentArea,
  type ContentRef,
  ContentRefSchema,
  type DraftSummary,
  ReviewState,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { sourcePathForRef } from "./locate.js";

export type PageStatusFilter = "awaiting-ready" | "unapproved-ready" | "in-review" | "all";

export interface PageStatus {
  ref: ContentRef;
  page: string;
  title: string;
  /** Frontmatter status of the latest registered version. */
  status: string;
  state: "none" | "needs-review" | "changes-requested" | "approved" | "released";
  approvers: string[];
  pendingRequired: string[];
  openComments: number;
  /** What an agent (or author) should do next, if anything. */
  next?: string;
  /** Repo-relative source file in this checkout. */
  path?: string;
}

const STATE: Record<number, PageStatus["state"]> = {
  [ReviewState.NONE]: "none",
  [ReviewState.NEEDS_REVIEW]: "needs-review",
  [ReviewState.CHANGES_REQUESTED]: "changes-requested",
  [ReviewState.APPROVED]: "approved",
  [ReviewState.RELEASED]: "released",
};

function nextStep(d: DraftSummary): string | undefined {
  if (d.reviewState === ReviewState.APPROVED) {
    return d.openCommentCount > 0
      ? `approved; address the ${d.openCommentCount} open thread(s), then set \`status: ready\``
      : "approved; set `status: ready` in the frontmatter to release it";
  }
  if (d.readyWithoutApproval) return "released without an approval; ask a reviewer to approve";
  if (d.reviewState === ReviewState.CHANGES_REQUESTED)
    return "changes requested; see list_feedback";
  return undefined;
}

function matches(d: DraftSummary, filter: PageStatusFilter): boolean {
  switch (filter) {
    case "awaiting-ready":
      return d.reviewState === ReviewState.APPROVED;
    case "unapproved-ready":
      return d.readyWithoutApproval;
    case "in-review":
      return (
        d.reviewState === ReviewState.NEEDS_REVIEW ||
        d.reviewState === ReviewState.CHANGES_REQUESTED
      );
    case "all":
      return true;
  }
}

export function toPageStatus(d: DraftSummary & { ref: ContentRef }, repoRoot?: string): PageStatus {
  return {
    ref: d.ref,
    page: pageKey(d.ref),
    title: d.title,
    status: d.frontmatterStatus || "draft",
    state: STATE[d.reviewState] ?? "none",
    approvers: d.approvals.map((a) => a.approverLogin ?? a.approverUserId),
    pendingRequired: d.pendingRequiredLogins,
    openComments: d.openCommentCount,
    next: nextStep(d),
    path: repoRoot ? sourcePathForRef(repoRoot, d.ref) : undefined,
  };
}

export async function listStatus(
  client: ReviewClient,
  opts: {
    area?: "docs" | "blogs";
    project?: string;
    slug?: string;
    filter?: PageStatusFilter;
    repoRoot?: string;
  } = {},
): Promise<PageStatus[]> {
  const area =
    opts.area === "docs" ? ContentArea.DOCS : opts.area === "blogs" ? ContentArea.BLOGS : undefined;
  const { drafts } = await client.listDrafts({ area });
  return drafts
    .filter((d): d is DraftSummary & { ref: ContentRef } => !!d.ref)
    .filter((d) => !opts.project || d.ref.project === opts.project)
    .filter((d) => !opts.slug || d.ref.slug === opts.slug)
    .filter((d) => matches(d, opts.filter ?? "awaiting-ready"))
    .map((d) => toPageStatus(d, opts.repoRoot));
}

/** A page whose frontmatter moved to `ready` between `base` and the working tree. */
export interface ReadyFlip {
  path: string;
  ref: ContentRef;
}

function statusAt(repoRoot: string, rev: string, path: string): string | undefined {
  try {
    const raw = execFileSync("git", ["show", `${rev}:${path}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return (splitFrontmatter(raw).meta as { status?: string }).status ?? "draft";
  } catch {
    return undefined; // new file
  }
}

/** Content refs whose page became `ready` since `base` (merge-base diff). */
export function readyFlips(repoRoot: string, base: string): ReadyFlip[] {
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`, "--", "content", "blogs"],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\n")
    .filter((p) => /\.mdx?$/.test(p));
  const flips: ReadyFlip[] = [];
  for (const path of changed) {
    const abs = join(repoRoot, path);
    if (!existsSync(abs)) continue;
    const now = splitFrontmatter(readFileSync(abs, "utf8")).meta as { status?: string };
    if (now.status !== "ready" || statusAt(repoRoot, base, path) === "ready") continue;
    const ref = refForPath(path, now);
    if (ref) flips.push({ path, ref });
  }
  return flips;
}

function refForPath(path: string, meta: Record<string, unknown>): ContentRef | undefined {
  const id = docIdentity(path, meta);
  if (id.area === "blogs")
    return create(ContentRefSchema, { area: ContentArea.BLOGS, slug: id.slug });
  if (!id.project || !id.bucket || !id.slug) return undefined;
  return create(ContentRefSchema, {
    area: ContentArea.DOCS,
    project: id.project,
    bucket: id.bucket,
    slug: id.slug,
  });
}

export interface ReadyCheck {
  path: string;
  page: string;
  approved: boolean;
  approvers: string[];
}

/**
 * For each page this branch moves to `ready`, whether it carries an active
 * approval (or the maintainer override). Advisory: release is git's, so the
 * caller warns rather than fails.
 */
export async function checkReady(
  client: ReviewClient,
  repoRoot: string,
  base: string,
): Promise<ReadyCheck[]> {
  const flips = readyFlips(repoRoot, base);
  if (flips.length === 0) return [];
  const { drafts } = await client.listDrafts({});
  const byPage = new Map(
    drafts.filter((d) => d.ref).map((d) => [pageKey(d.ref as ContentRef), d] as const),
  );
  return flips.map(({ path, ref }) => {
    const page = pageKey(ref);
    const d = byPage.get(page);
    const approvers = d?.approvals.map((a) => a.approverLogin ?? a.approverUserId) ?? [];
    const approved = approvers.length > 0 || d?.reviewState === ReviewState.APPROVED;
    return { path, page, approved, approvers };
  });
}
