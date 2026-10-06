// Compact markdown views of feedback threads, for agents and terminals alike.
import { isPreambleAnchor } from "../../../site/src/content-core/slug.mjs";
import type { FeedbackThread } from "./feedback.js";
import type { Location } from "./locate.js";

function locationLine(loc: Location | undefined): string {
  if (!loc) return "- location: not in this checkout";
  const range =
    loc.startLine === undefined
      ? loc.path
      : loc.startLine === loc.endLine
        ? `${loc.path}:${loc.startLine}`
        : `${loc.path}:${loc.startLine}-${loc.endLine}`;
  const flags = [loc.precision, loc.drifted ? "file changed since comment" : ""].filter(Boolean);
  const note = loc.note ? ` — ${loc.note}` : "";
  return `- location: \`${range}\` (${flags.join(", ")})${note}`;
}

function anchorLine(t: FeedbackThread): string {
  const code = t.anchor.code;
  if (code) {
    const region = code.region ? ` region \`${code.region}\`` : "";
    return `- anchor: code \`${code.path}\` lines ${code.line}-${code.endLine}${region}`;
  }
  const quote = t.anchor.quote ? ` › “${t.anchor.quote}”` : "";
  const section = isPreambleAnchor(t.anchor.heading)
    ? "(before first heading)"
    : `#${t.anchor.heading}`;
  return `- anchor: ${section}${quote}`;
}

/** Prefix every line of `text` for a diff fence. */
function diffSide(sign: "-" | "+", text: string): string[] {
  return text.split("\n").map((l) => `${sign} ${l}`);
}

function suggestionLines(t: FeedbackThread): string[] {
  const s = t.suggestion;
  if (!s) return [];
  const verb = s.replacement ? "replace" : "delete";
  const out = [`- suggestion (${s.state}): ${verb} the anchored passage`];
  if (s.match) {
    const range =
      s.match.startLine === s.match.endLine
        ? `${s.match.startLine}`
        : `${s.match.startLine}-${s.match.endLine}`;
    const action = s.replacement ? "replace this text literally" : "remove this text";
    out.push(`  - source match at line ${range}; ${action}:`);
    out.push("", "```", s.match.source, "```");
  } else {
    out.push(
      "  - no literal source match: the passage carries inline markup or moved; apply the " +
        "wording and keep the source's formatting",
    );
  }
  out.push("", "```diff", ...diffSide("-", s.original));
  if (s.replacement) out.push(...diffSide("+", s.replacement));
  out.push("```");
  return out;
}

/** One thread, with its full conversation. */
export function formatThread(t: FeedbackThread, opts: { excerpt?: boolean } = {}): string {
  const out = [
    `### ${t.id}`,
    `- page: ${t.page} — ${t.title}`,
    `- state: ${t.state}${t.orphaned ? " (orphaned: its section was removed)" : ""}`,
    anchorLine(t),
    locationLine(t.location),
  ];
  if (t.authoredGitSha) out.push(`- written against: ${t.authoredGitSha.slice(0, 12)}`);
  if (t.suggestion) out.push(...suggestionLines(t));
  if (opts.excerpt && t.location?.excerpt) {
    out.push("", "```", t.location.excerpt, "```");
  }
  out.push("");
  for (const c of t.comments) {
    const who = c.viaAgent ? `${c.author} via agent` : c.author;
    out.push(`> **${who}**${c.createdAt ? ` · ${c.createdAt.slice(0, 10)}` : ""}`);
    const body = c.body || (c.id === t.id && t.suggestion ? "_(suggestion only)_" : "");
    for (const line of body.split("\n")) out.push(`> ${line}`);
    out.push(">");
  }
  if (out[out.length - 1] === ">") out.pop();
  return out.join("\n");
}

/** Threads grouped by page. */
export function formatThreads(threads: FeedbackThread[], opts: { excerpt?: boolean } = {}): string {
  if (!threads.length) return "No matching review threads.";
  const byPage = new Map<string, FeedbackThread[]>();
  for (const t of threads) byPage.set(t.page, [...(byPage.get(t.page) ?? []), t]);
  const sections = [...byPage].map(
    ([page, ts]) =>
      `## ${page} (${ts.length} thread${ts.length === 1 ? "" : "s"})\n\n` +
      ts.map((t) => formatThread(t, opts)).join("\n\n"),
  );
  return sections.join("\n\n");
}
