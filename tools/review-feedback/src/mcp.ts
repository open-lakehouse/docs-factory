#!/usr/bin/env bun
// stdio MCP server over the review-feedback core. Started from the checkout by
// the agent harness (.mcp.json), so `locate` maps threads onto the files the
// agent is editing. Deliberately no resolve tool: resolving is the reviewer's
// call, and tokens can't resolve anyway.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { describeError, type ReviewClient, reviewClient } from "./client.js";
import { ConfigError, resolveConfig } from "./config.js";
import {
  type FeedbackThread,
  getThread,
  listFeedback,
  markSuggestionApplied,
  reply,
} from "./feedback.js";
import { formatRequests, formatStatuses, formatThread, formatThreads } from "./format.js";
import type { ContentRef } from "./gen/docs_factory/review/v1/messages_pb.js";
import { repoRoot } from "./repo.js";
import { completeRequest, listRequests } from "./requests.js";
import { listStatus } from "./status.js";

const root = repoRoot();

// Page of each thread seen in a list, so get/reply skip the all-pages scan.
const pageOf = new Map<string, { ref: ContentRef; title: string }>();
function remember(threads: FeedbackThread[]) {
  for (const t of threads) pageOf.set(t.id, { ref: t.ref, title: t.title });
}

// Config is resolved per call, not at startup: a user who runs
// `review-feedback login` mid-session fixes the server without a restart.
function client(): ReviewClient {
  const config = resolveConfig();
  if (!config.token) {
    throw new ConfigError("no access token; run `review-feedback login` in a terminal");
  }
  return reviewClient(config);
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

async function run(fn: () => Promise<string>) {
  try {
    return text(await fn());
  } catch (e) {
    const msg = e instanceof ConfigError ? e.message : describeError(e);
    return { ...text(msg), isError: true };
  }
}

const server = new McpServer({ name: "review-feedback", version: "0.1.0" });

server.registerTool(
  "list_feedback",
  {
    title: "List review feedback",
    description:
      "List review threads from the docs-factory review site, grouped by page, each mapped " +
      "to a file and line range in this checkout. By default returns only `open` threads " +
      "(a reviewer is waiting); `awaiting` returns threads where an agent already replied " +
      "and the reviewer hasn't responded yet.",
    inputSchema: {
      area: z.enum(["docs", "blogs"]).optional().describe("Restrict to docs or blog posts."),
      project: z.string().optional().describe("Docs project, e.g. `unitycatalog` or `delta`."),
      slug: z.string().optional().describe("One page's slug."),
      state: z
        .enum(["open", "awaiting", "unresolved", "all"])
        .optional()
        .describe("Default `open`."),
      excerpt: z
        .boolean()
        .optional()
        .describe("Include the located source lines for each thread (default false)."),
    },
    annotations: { readOnlyHint: true },
  },
  ({ excerpt, ...opts }) =>
    run(async () => {
      const threads = await listFeedback(client(), { ...opts, repoRoot: root });
      remember(threads);
      return formatThreads(threads, { excerpt });
    }),
);

server.registerTool(
  "get_thread",
  {
    title: "Get a review thread",
    description:
      "One review thread with its full conversation, its anchor, and the located source " +
      "lines in this checkout. If `drifted` is shown, the file changed since the comment was " +
      "written, so read the surrounding section instead of trusting the line numbers.",
    inputSchema: { thread_id: z.string().describe("Thread id from list_feedback.") },
    annotations: { readOnlyHint: true },
  },
  ({ thread_id }) =>
    run(async () => {
      const t = await getThread(client(), thread_id, {
        repoRoot: root,
        page: pageOf.get(thread_id),
      });
      if (!t) return `No thread ${thread_id} (or no access to it).`;
      remember([t]);
      return formatThread(t, { excerpt: true });
    }),
);

server.registerTool(
  "reply_to_thread",
  {
    title: "Reply to a review thread",
    description:
      "Post a reply on a review thread as the token's owner. The reply is marked as written by " +
      "an agent. Reply only after the fix is pushed, and include the PR link or commit sha. " +
      "If you won't make the change, explain why. This never resolves the thread; the " +
      "reviewer does that. When the thread carries a suggestion you applied, set " +
      "`suggestion_applied` so the reviewer sees it marked applied.",
    inputSchema: {
      thread_id: z.string().describe("Thread id from list_feedback."),
      body: z.string().min(1).describe("Markdown reply."),
      suggestion_applied: z
        .boolean()
        .optional()
        .describe("Also mark the thread's suggested edit applied (default false)."),
    },
  },
  ({ thread_id, body, suggestion_applied }) =>
    run(async () => {
      const c = client();
      const t = await getThread(c, thread_id, { page: pageOf.get(thread_id) });
      if (!t) return `No thread ${thread_id} (or no access to it).`;
      if (suggestion_applied && !t.suggestion) {
        return `Thread ${t.id} has no suggestion to mark applied; nothing posted.`;
      }
      const posted = await reply(c, t, body);
      if (suggestion_applied) await markSuggestionApplied(c, t.id);
      const marked = suggestion_applied ? " and marked its suggestion applied" : "";
      return `Replied on ${t.page} thread ${t.id} (comment ${posted?.id ?? "?"})${marked}.`;
    }),
);

server.registerTool(
  "review_status",
  {
    title: "Review status",
    description:
      "Pages by review state, each mapped to its file in this checkout. An approval in the " +
      "review app is the signal to set `status: ready` in the page's frontmatter; merging " +
      "that to main releases it. Default filter `awaiting-ready` lists approved pages not " +
      "yet ready. `unapproved-ready` lists pages released without an approval. Never set " +
      "`ready` on a page that isn't approved, and never on a `private` page.",
    inputSchema: {
      filter: z
        .enum(["awaiting-ready", "unapproved-ready", "in-review", "all"])
        .optional()
        .describe("Default `awaiting-ready`."),
      area: z.enum(["docs", "blogs"]).optional(),
      project: z.string().optional(),
      slug: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  (opts) =>
    run(async () => formatStatuses(await listStatus(client(), { ...opts, repoRoot: root }))),
);

server.registerTool(
  "list_content_requests",
  {
    title: "List content requests",
    description:
      "Requests for new content filed in the review app. An `accepted` request is work: add " +
      "a `planned:` slot (a fresh backlog id, the request's title, and `request: <id>`) " +
      "under the named section of `content/<project>/nav.yml`, or to `blogs/IDEAS.md` for " +
      "blogs, open a PR, then call complete_content_request.",
    inputSchema: {
      filter: z.enum(["accepted", "open", "all"]).optional().describe("Default `accepted`."),
      project: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  (opts) => run(async () => formatRequests(await listRequests(client(), opts))),
);

server.registerTool(
  "complete_content_request",
  {
    title: "Complete a content request",
    description:
      "Mark an accepted content request done once its planned slot is in a PR. Needs a " +
      "token with the `requests:write` scope.",
    inputSchema: {
      request_id: z.string().describe("Request id from list_content_requests."),
      planned_id: z.string().min(1).describe("The backlog id of the planned slot you added."),
      pr_url: z.string().url().optional().describe("The PR that adds it."),
    },
  },
  ({ request_id, planned_id, pr_url }) =>
    run(async () => {
      const r = await completeRequest(client(), request_id, planned_id, pr_url);
      return `Marked request ${request_id} done as ${r?.plannedId ?? planned_id}.`;
    }),
);

await server.connect(new StdioServerTransport());
