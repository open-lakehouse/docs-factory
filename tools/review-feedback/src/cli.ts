#!/usr/bin/env bun
// review-feedback CLI: the same core as the MCP server, for terminals, scripts,
// and agents without MCP. Output is markdown by default, JSON with --json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Code, ConnectError } from "@connectrpc/connect";
import { describeError, type ReviewClient, reviewClient } from "./client.js";
import {
  ConfigError,
  configPath,
  readStoredConfig,
  resolveConfig,
  type StoredConfig,
  writeStoredConfig,
} from "./config.js";
import {
  type FeedbackThread,
  getThread,
  type ListOptions,
  listFeedback,
  markSuggestionApplied,
  reply,
  type StateFilter,
} from "./feedback.js";
import { formatRequests, formatStatuses, formatThread, formatThreads } from "./format.js";
import { browserLogin } from "./login.js";
import { repoRoot } from "./repo.js";
import { completeRequest, listRequests, type RequestFilter } from "./requests.js";
import { checkReady, listStatus, type PageStatusFilter } from "./status.js";

const USAGE = `review-feedback: read and answer docs-factory review threads

Usage:
  review-feedback login [--url <site>] [--api-url <api>] [--token <dfr_…|->]
  review-feedback whoami
  review-feedback list [--area docs|blogs] [--project p] [--slug s]
                       [--state open|awaiting|unresolved|all] [--excerpt] [--json]
  review-feedback show <thread-id> [--json]
  review-feedback pull [--out .review] [list filters]
  review-feedback reply <thread-id> (--body <md> | --file <path|->) [--applied]
  review-feedback status [--filter awaiting-ready|unapproved-ready|in-review|all]
                         [--area docs|blogs] [--project p] [--slug s] [--json]
  review-feedback requests [--filter accepted|open|all] [--project p] [--json]
  review-feedback complete-request <id> --planned <backlog-id> [--pr <url>]
  review-feedback check-ready [--base origin/main]

Config: flags, then DOCS_REVIEW_URL / DOCS_REVIEW_API_URL / DOCS_REVIEW_TOKEN,
then ${configPath()} (written by login).`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    "api-url": { type: "string" },
    token: { type: "string" },
    area: { type: "string" },
    project: { type: "string" },
    slug: { type: "string" },
    state: { type: "string" },
    excerpt: { type: "boolean" },
    json: { type: "boolean" },
    out: { type: "string" },
    body: { type: "string" },
    file: { type: "string" },
    applied: { type: "boolean" },
    filter: { type: "string" },
    planned: { type: "string" },
    pr: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const readStdin = () => readFileSync(0, "utf8");

function connection() {
  const config = resolveConfig({ url: flags.url, apiUrl: flags["api-url"], token: flags.token });
  if (!config.token) throw new ConfigError("no access token; run `review-feedback login`");
  return reviewClient(config);
}

function listOpts() {
  const area = flags.area as ListOptions["area"];
  if (area !== undefined && area !== "docs" && area !== "blogs") {
    throw new ConfigError("--area must be docs or blogs");
  }
  const state = (flags.state ?? "open") as StateFilter;
  if (!["open", "awaiting", "unresolved", "all"].includes(state)) {
    throw new ConfigError("--state must be open, awaiting, unresolved, or all");
  }
  return { area, project: flags.project, slug: flags.slug, state, repoRoot: repoRoot() };
}

const print = (s: string) => process.stdout.write(`${s}\n`);
const json = (v: unknown) =>
  print(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2));

async function login() {
  const stored = readStoredConfig();
  const next: StoredConfig = {
    ...stored,
    url: flags.url ?? stored.url,
    apiUrl: flags["api-url"] ?? stored.apiUrl,
  };
  let token = flags.token === "-" ? readStdin().trim() : flags.token;
  if (!token) {
    if (!next.url) throw new ConfigError("pass --url <review site> the first time");
    token = await browserLogin(next.url, (s) => process.stderr.write(`${s}\n`));
  }
  // Save before verifying: a browser login has already minted the token, and a
  // network/TLS failure on the check below mustn't throw it away.
  writeStoredConfig({ ...next, token });
  let viewer: Awaited<ReturnType<ReviewClient["getViewer"]>>["viewer"];
  try {
    ({ viewer } = await reviewClient(resolveConfig({ ...next, token }, {}, {})).getViewer({}));
  } catch (e) {
    if (ConnectError.from(e).code === Code.Unauthenticated) {
      writeStoredConfig(stored);
      throw new ConfigError("the review API rejected the token");
    }
    throw new ConfigError(
      `token saved to ${configPath()}, but checking it failed: ${describeError(e)}`,
    );
  }
  if (!viewer?.authenticated) {
    writeStoredConfig(stored);
    throw new ConfigError("the review API rejected the token");
  }
  print(`Logged in as @${viewer.login}. Saved to ${configPath()}.`);
}

/** Write one markdown file per page under `out`, for agents that read files. */
function pull(threads: FeedbackThread[], out: string) {
  mkdirSync(out, { recursive: true });
  const byPage = new Map<string, FeedbackThread[]>();
  for (const t of threads) byPage.set(t.page, [...(byPage.get(t.page) ?? []), t]);
  for (const [page, ts] of byPage) {
    const file = join(out, `${page.replaceAll("/", "__")}.md`);
    writeFileSync(file, `${formatThreads(ts, { excerpt: true })}\n`);
  }
  print(`Wrote ${byPage.size} page file(s), ${threads.length} thread(s), to ${out}/`);
}

/**
 * Warn about pages this branch moves to `ready` without an approval. Always
 * exits 0: release is git's, and the check only tells the author what the
 * review app knows. In GitHub Actions it emits warning annotations.
 */
async function checkReadyCommand() {
  const root = repoRoot();
  if (!root) throw new ConfigError("check-ready must run inside the checkout");
  let config: ReturnType<typeof resolveConfig>;
  try {
    config = resolveConfig({ url: flags.url, apiUrl: flags["api-url"], token: flags.token });
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    return print(`check-ready: skipped, ${e.message}`);
  }
  const gha = process.env.GITHUB_ACTIONS === "true";
  const warn = (path: string, msg: string) =>
    print(gha ? `::warning file=${path},line=1::${msg}` : `warning: ${path}: ${msg}`);
  if (!config.token) {
    return print("check-ready: skipped, no access token (set DOCS_REVIEW_TOKEN)");
  }
  let checks: Awaited<ReturnType<typeof checkReady>>;
  try {
    checks = await checkReady(reviewClient(config), root, flags.base ?? "origin/main");
  } catch (e) {
    return print(`check-ready: skipped, ${describeError(e)}`);
  }
  if (checks.length === 0) return print("check-ready: no page moves to ready on this branch");
  for (const c of checks) {
    if (c.approved) print(`ok: ${c.page} approved by ${c.approvers.join(", ") || "a maintainer"}`);
    else warn(c.path, `${c.page} is set to ready without an approval in the review app`);
  }
}

async function main() {
  const [cmd, arg] = positionals;
  if (!cmd || flags.help) return print(USAGE);
  switch (cmd) {
    case "login":
      return login();
    case "whoami": {
      const { viewer } = await connection().getViewer({});
      return flags.json
        ? json(viewer)
        : print(viewer?.authenticated ? `@${viewer.login}` : "anonymous");
    }
    case "list": {
      const threads = await listFeedback(connection(), listOpts());
      return flags.json ? json(threads) : print(formatThreads(threads, { excerpt: flags.excerpt }));
    }
    case "show": {
      if (!arg) throw new ConfigError("usage: review-feedback show <thread-id>");
      const t = await getThread(connection(), arg, { repoRoot: repoRoot() });
      if (!t) throw new ConfigError(`no thread ${arg} (or no access to it)`);
      return flags.json ? json(t) : print(formatThread(t, { excerpt: true }));
    }
    case "pull": {
      const root = repoRoot();
      const out = flags.out ?? join(root ?? ".", ".review");
      return pull(await listFeedback(connection(), listOpts()), out);
    }
    case "reply": {
      if (!arg) throw new ConfigError("usage: review-feedback reply <thread-id> --body <md>");
      const body =
        flags.body ??
        (flags.file === "-" ? readStdin() : flags.file ? readFileSync(flags.file, "utf8") : "");
      if (!body.trim()) throw new ConfigError("reply needs --body or --file");
      const c = connection();
      const t = await getThread(c, arg);
      if (!t) throw new ConfigError(`no thread ${arg} (or no access to it)`);
      if (flags.applied && !t.suggestion) {
        throw new ConfigError(`thread ${t.id} has no suggestion to mark applied`);
      }
      const posted = await reply(c, t, body);
      if (flags.applied) await markSuggestionApplied(c, t.id);
      const marked = flags.applied ? " and marked its suggestion applied" : "";
      return print(`Replied on ${t.page} thread ${t.id} (comment ${posted?.id ?? "?"})${marked}.`);
    }
    case "status": {
      const filter = (flags.filter ?? "awaiting-ready") as PageStatusFilter;
      if (!["awaiting-ready", "unapproved-ready", "in-review", "all"].includes(filter)) {
        throw new ConfigError(
          "--filter must be awaiting-ready, unapproved-ready, in-review, or all",
        );
      }
      const { area, project, slug } = listOpts();
      const pages = await listStatus(connection(), {
        area,
        project,
        slug,
        filter,
        repoRoot: repoRoot(),
      });
      return flags.json ? json(pages) : print(formatStatuses(pages));
    }
    case "requests": {
      const filter = (flags.filter ?? "accepted") as RequestFilter;
      if (!["accepted", "open", "all"].includes(filter)) {
        throw new ConfigError("--filter must be accepted, open, or all");
      }
      const requests = await listRequests(connection(), { filter, project: flags.project });
      return flags.json ? json(requests) : print(formatRequests(requests));
    }
    case "complete-request": {
      if (!arg || !flags.planned) {
        throw new ConfigError("usage: review-feedback complete-request <id> --planned <id>");
      }
      const r = await completeRequest(connection(), arg, flags.planned, flags.pr);
      return print(`Marked request ${arg} done as ${r?.plannedId ?? flags.planned}.`);
    }
    case "check-ready":
      return checkReadyCommand();
    default:
      throw new ConfigError(`unknown command "${cmd}"\n\n${USAGE}`);
  }
}

try {
  await main();
} catch (e) {
  process.stderr.write(
    `review-feedback: ${e instanceof ConfigError ? e.message : describeError(e)}\n`,
  );
  process.exit(1);
}
