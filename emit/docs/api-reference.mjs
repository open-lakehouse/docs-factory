/**
 * The static side of a REST API reference: the operation list the prerendered
 * page carries before Scalar mounts, and the page's `.md` twin. Both come from
 * the vendored spec at the site's pin (api-specs.mjs). Pure.
 */
import { parse as parseYaml } from "yaml";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

/**
 * The spec's operations grouped by their first tag, in the order the spec
 * declares its tags; untagged operations go last under "Other".
 *
 * @returns {{ server: string | null,
 *             groups: { tag: string, operations: { method: string, path: string,
 *                                                  summary: string }[] }[] }}
 */
export function apiOperations(specText) {
  const spec = parseYaml(specText);
  const groups = new Map((spec.tags ?? []).map((t) => [t.name, []]));
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Other";
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push({
        method: method.toUpperCase(),
        path,
        summary: (op.summary ?? op.operationId ?? "").trim(),
      });
    }
  }
  // A templated server URL ({scheme}://{host}/…) is no use to copy from.
  const server = (spec.servers ?? []).find((s) => !s.url.includes("{"))?.url ?? null;
  return {
    server,
    groups: [...groups]
      .filter(([, ops]) => ops.length)
      .map(([tag, operations]) => ({ tag, operations })),
  };
}

/** The API page's `.md` twin: what the explorer shows, minus the explorer. */
export function renderApiTwin(api, { server, groups }, { canonical }) {
  const lines = [
    "---",
    `title: ${JSON.stringify(api.title)}`,
    `description: ${JSON.stringify(api.summary)}`,
    `canonical: ${canonical}`,
    `openapi: ${api.specUrl}`,
    "---",
    "",
    `# ${api.title}`,
    "",
    api.summary,
    "",
    `OpenAPI document: <${api.specUrl}> ([${api.ref}](${api.sourceUrl})).`,
  ];
  const base = api.serverUrl ?? server;
  if (base) lines.push("", `Paths are relative to \`${base}\`.`);
  for (const { tag, operations } of groups) {
    lines.push("", `## ${tag}`, "");
    for (const op of operations) lines.push(`- \`${op.method} ${op.path}\`: ${op.summary}`);
  }
  return `${lines.join("\n")}\n`;
}
