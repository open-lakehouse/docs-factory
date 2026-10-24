// Write every LikeC4 view's Mermaid to <outDir>/<viewId>.mmd, the text form of a
// diagram that the .md twins and the docs sites' no-JS fallback carry.
//
//   node scripts/likec4-mermaid.mjs <modelDir> <outDir>
//
// `likec4 gen mermaid` writes every view as a `graph`, so a dynamic view that
// declares `variant sequence` loses its step order (likec4/likec4#3359). Those
// views get a `sequenceDiagram` built here from the computed view instead.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// `#` and `;` are Mermaid's entity syntax (`#59;`), and a raw newline ends the
// statement.
function text(value) {
  return String(value ?? "")
    .replace(/[#;]/g, (c) => `#${c.charCodeAt(0)};`)
    .replace(/\s*\n\s*/g, "<br/>")
    .trim();
}

const participantId = (fqn) => fqn.replace(/[^A-Za-z0-9_]/g, "_");

// LikeC4 subflow type → the Mermaid fragment that opens it. `par` and `alt`
// open once and separate later branches with `and` / `else`; a `try` is a
// `critical` region whose catch/finally are its `option`s.
const OPEN = { loop: "loop", opt: "opt", break: "break" };

/** A Mermaid `sequenceDiagram` for a computed dynamic view (`$view`). */
export function sequenceDiagram(view) {
  const edges = new Map(view.edges.map((e) => [e.id, e]));
  const lines = [];
  if (view.title) lines.push("---", `title: ${JSON.stringify(view.title)}`, "---");
  lines.push("sequenceDiagram");
  for (const node of view.nodes) {
    lines.push(`  participant ${participantId(node.id)} as ${text(node.title || node.id)}`);
  }

  const emit = (steps, depth) => {
    const pad = "  ".repeat(depth);
    for (const step of steps) {
      if (typeof step === "string") {
        const edge = edges.get(step);
        if (!edge) throw new Error(`${view.id}: step ${step} has no edge`);
        // `source`/`target` are already as drawn; `dir: "back"` marks a reply.
        const arrow = edge.dir === "back" ? "-->>" : "->>";
        lines.push(
          `${pad}${participantId(edge.source)}${arrow}${participantId(edge.target)}: ${text(edge.label)}`,
        );
        continue;
      }
      const title = step.title ? ` ${text(step.title)}` : "";
      if (OPEN[step._type]) {
        lines.push(`${pad}${OPEN[step._type]}${title}`);
        emit(step.flow, depth + 1);
      } else if (step._type === "par") {
        step.flow.forEach((branch, i) => {
          lines.push(`${pad}${i === 0 ? `par${title}` : "and"}`);
          emit([branch], depth + 1);
        });
      } else if (step._type === "alt" || step._type === "try") {
        step.flow.forEach((branch, i) => {
          const branchTitle = branch.title ? ` ${text(branch.title)}` : "";
          const keyword =
            step._type === "alt" ? (i === 0 ? "alt" : "else") : i === 0 ? "critical" : "option";
          lines.push(`${pad}${keyword}${i === 0 && !branchTitle ? title : branchTitle}`);
          emit(branch.flow, depth + 1);
        });
      } else {
        throw new Error(`${view.id}: unsupported flow block ${step._type}`);
      }
      lines.push(`${pad}end`);
    }
  };
  emit(view.flow ?? view.edges.map((e) => e.id), 1);
  return `${lines.join("\n")}\n`;
}

const isSequence = (view) => view._type === "dynamic" && view.variant === "sequence";

function likec4Bin() {
  return join(siteRoot, "node_modules", ".bin", "likec4");
}

export async function writeLikeC4Mermaid(modelDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  // gen mermaid nests each file under its view's source folder; flatten them.
  const raw = mkdtempSync(join(tmpdir(), "likec4-mmd-"));
  try {
    execFileSync(likec4Bin(), ["gen", "mermaid", "-o", raw, modelDir], { stdio: "pipe" });
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".mmd")) renameSync(path, join(outDir, entry.name));
      }
    };
    walk(raw);
  } finally {
    rmSync(raw, { recursive: true, force: true });
  }

  const { LikeC4 } = await import("likec4");
  const likec4 = await LikeC4.fromWorkspace(modelDir, { logger: false });
  const model = await likec4.computedModel();
  for (const view of model.views()) {
    if (isSequence(view.$view)) {
      writeFileSync(join(outDir, `${view.id}.mmd`), sequenceDiagram(view.$view));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [modelDir, outDir] = process.argv.slice(2);
  if (!modelDir || !outDir) {
    console.error("usage: node scripts/likec4-mermaid.mjs <modelDir> <outDir>");
    process.exit(2);
  }
  await writeLikeC4Mermaid(resolve(modelDir), resolve(outDir));
}
