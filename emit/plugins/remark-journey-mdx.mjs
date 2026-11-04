/**
 * remark-journey-mdx — the MDX-emitting counterpart of the emitter's
 * remark-journey-md.mjs. Where the `-md` variant FLATTENS a `::::journey` to
 * numbered `### Step N — …` headings (for a plain-Markdown target, which has no
 * timeline chrome), this UPGRADES it to a `<Journey><JourneyStep step="…">…</JourneyStep>`
 * element for an MDX target (UnityCatalog's Astro site) whose `Journey.astro`
 * renders the rich vertical timeline.
 *
 * It is a near-verbatim twin of the preview's site/src/plugins/remark-journey.mjs
 * (same step-splitting at depth-3 headings, same auto-numbering-in-the-component
 * contract) — the differences are (1) the component import base is
 * TARGET-CONFIGURABLE via `componentImportBase`, and (2) it emits `mdxjsEsm`
 * import nodes that `remark-mdx` serializes into the `.mdx` file. Astro components
 * are DEFAULT exports, so `Journey` and `JourneyStep` are imported by default from
 * their own `.astro` files (`Journey.astro`, `JourneyStep.astro`).
 *
 * Ordering: AFTER remark-directive (so `::::journey` is a containerDirective) and
 * AFTER remark-code-snippets (code inlined). A step body may still contain raw
 * `:::tip` callout directives — that's intentional: the UC target does NOT rewrite
 * callouts (its site styles the raw directive), so they serialize back out as
 * `:::tip … :::` inside the step and render there.
 */

import { defaultImportNode, prependImports } from "./mdx-import.mjs";

const DEFAULT_IMPORT_BASE = "@/components/blog";

/** The elements a journey becomes: UC's `<Journey><JourneyStep step>` by default. */
const DEFAULT_ELEMENTS = { journey: "Journey", step: "JourneyStep", stepTitle: "step" };

/** Plain-text of a heading node (its inline children concatenated). */
function headingText(node) {
  const parts = [];
  const walk = (n) => {
    if (typeof n.value === "string") parts.push(n.value);
    if (n.children) n.children.forEach(walk);
  };
  node.children?.forEach(walk);
  return parts.join("").trim();
}

/** Split a journey directive's children into steps at depth-3 headings. */
function splitSteps(children) {
  const steps = [];
  let current = null;
  for (const node of children) {
    if (node.type === "heading" && node.depth === 3) {
      current = { label: headingText(node), body: [] };
      steps.push(current);
    } else if (current) {
      current.body.push(node);
    }
    // nodes before the first ### heading are ignored (author a heading first)
  }
  return steps;
}

function journeyStepNode(step, elements) {
  return {
    type: "mdxJsxFlowElement",
    name: elements.step,
    attributes: step.label
      ? [{ type: "mdxJsxAttribute", name: elements.stepTitle, value: step.label }]
      : [],
    children: step.body,
  };
}

/**
 * Options: `{ componentImportBase, elements, imports }`. `elements` renames the
 * journey, step, and step-title attribute for a site with its own timeline
 * (openlakehouse.io's `<Steps><Step title>`); `imports: false` skips the import
 * nodes for a site that provides its components to MDX.
 */
export default function remarkJourneyMdx(options = {}) {
  const base = options.componentImportBase ?? DEFAULT_IMPORT_BASE;
  const elements = { ...DEFAULT_ELEMENTS, ...options.elements };
  const imports = options.imports ?? true;

  return (tree) => {
    let upgraded = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && child.name === "journey") {
          const steps = splitSteps(child.children ?? []);
          node.children[i] = {
            type: "mdxJsxFlowElement",
            name: elements.journey,
            attributes: [],
            children: steps.map((step) => journeyStepNode(step, elements)),
          };
          upgraded = true;
          continue;
        }
        walk(child);
      }
    };
    walk(tree);

    if (upgraded && imports) {
      prependImports(tree, [
        defaultImportNode(elements.journey, base),
        defaultImportNode(elements.step, base),
      ]);
    }
  };
}
