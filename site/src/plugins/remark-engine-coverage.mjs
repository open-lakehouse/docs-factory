/**
 * remark-engine-coverage — upgrade a `compat:engine:<id>` or `compat:engines`
 * embed to the interactive `<EngineCoverage>` / `<EngineSupport>` report, and a
 * `compat:<table>` or `compat:asset:<id>` grid to `<CompatGrid>`, whose rows
 * expand to each cell's proof. `compat:interfaces` and `compat:crosswalk` stay
 * Markdown tables.
 *
 * docsnip renders the embed's Markdown table between HTML-comment markers, which
 * is what GitHub and the .md twins show. The docs emitter strips comments, so it
 * runs `collapseCoverageEmbeds` before that and ships an empty
 * `:::engine-coverage` / `:::engine-support` container directive (the only kind
 * remark-directive-prose-guard keeps); the shell's vendored copy of this plugin
 * turns the directive into the component. The review preview sees the markers
 * and does both steps.
 */
import { injectImport, jsxFlow, stringAttr } from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/engine-coverage";
const OPEN_RE = /^<!--\s*compat:((?:engine:|asset:)?[\w.-]+)\b[\s\S]*-->\s*$/;
const MARKDOWN_ONLY = new Set(["interfaces", "crosswalk"]);
const PROJECT_RE = /\/content\/([^/]+)\//;

function directive(name, attributes) {
  return { type: "containerDirective", name, attributes, children: [] };
}

/**
 * Replace each marker region (open comment, rendered table, close comment) with
 * its directive. `project` is the content project the page belongs to.
 * `grids: false` keeps table and asset embeds as Markdown, for a host whose
 * components don't render `<CompatGrid>` yet.
 */
export function collapseCoverageEmbeds(tree, project, { grids = true } = {}) {
  const kids = tree.children;
  for (let i = 0; i < kids.length; i++) {
    const m = kids[i].type === "html" && OPEN_RE.exec(kids[i].value);
    if (!m || MARKDOWN_ONLY.has(m[1])) continue;
    if (!grids && !m[1].startsWith("engine:") && m[1] !== "engines") continue;
    const close = `<!-- /compat:${m[1]} -->`;
    const end = kids.findIndex((c, j) => j > i && c.type === "html" && c.value.trim() === close);
    if (end < 0) continue;
    const node =
      m[1] === "engines"
        ? directive("engine-support", { project })
        : m[1].startsWith("engine:")
          ? directive("engine-coverage", { project, engine: m[1].slice("engine:".length) })
          : directive("compat-grid", { project, table: m[1] });
    kids.splice(i, end - i + 1, node);
  }
}

export default function remarkEngineCoverage() {
  return (tree, file) => {
    const project = PROJECT_RE.exec(file?.path ?? "")?.[1];
    if (project) collapseCoverageEmbeds(tree, project);
    let used = false;
    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];
      if (child.type !== "containerDirective") continue;
      const attrs = child.attributes ?? {};
      if (child.name === "engine-coverage" && attrs.engine) {
        tree.children[i] = jsxFlow("EngineCoverage", {
          attributes: [
            stringAttr("project", attrs.project ?? ""),
            stringAttr("engine", attrs.engine),
          ],
        });
        used = true;
      } else if (child.name === "engine-support") {
        tree.children[i] = jsxFlow("EngineSupport", {
          attributes: [stringAttr("project", attrs.project ?? "")],
        });
        used = true;
      } else if (child.name === "compat-grid" && attrs.table) {
        tree.children[i] = jsxFlow("CompatGrid", {
          attributes: [
            stringAttr("project", attrs.project ?? ""),
            stringAttr("table", attrs.table),
          ],
        });
        used = true;
      }
    }
    injectImport(tree, {
      names: ["CompatGrid", "EngineCoverage", "EngineSupport"],
      source: IMPORT_SOURCE,
      used,
    });
  };
}
