/**
 * remark-engine-coverage — upgrade a `compat:engine:<id>` or `compat:engines`
 * embed to the interactive `<EngineCoverage>` / `<EngineSupport>` report.
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
const OPEN_RE = /^<!--\s*compat:(engine:[\w.-]+|engines)\b[\s\S]*-->\s*$/;
const PROJECT_RE = /\/content\/([^/]+)\//;

function directive(name, attributes) {
  return { type: "containerDirective", name, attributes, children: [] };
}

/**
 * Replace each marker region (open comment, rendered table, close comment) with
 * its directive. `project` is the content project the page belongs to.
 */
export function collapseCoverageEmbeds(tree, project) {
  const kids = tree.children;
  for (let i = 0; i < kids.length; i++) {
    const m = kids[i].type === "html" && OPEN_RE.exec(kids[i].value);
    if (!m) continue;
    const close = `<!-- /compat:${m[1]} -->`;
    const end = kids.findIndex((c, j) => j > i && c.type === "html" && c.value.trim() === close);
    if (end < 0) continue;
    const node =
      m[1] === "engines"
        ? directive("engine-support", { project })
        : directive("engine-coverage", { project, engine: m[1].slice("engine:".length) });
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
      }
    }
    injectImport(tree, { names: ["EngineCoverage", "EngineSupport"], source: IMPORT_SOURCE, used });
  };
}
