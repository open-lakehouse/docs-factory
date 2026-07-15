/**
 * remark-journey — render a `::::journey` container as a Step 1 → 2 → 3 vertical
 * timeline whose steps hold RICH content: a heading, prose, one or more code
 * blocks, and callouts.
 *
 *   ::::journey
 *   ### Point Spark at the UC catalog
 *   A one-line explanation of what this step does.
 *   ```python file=./snippets/x.py start=start:session end=end:session
 *   ```
 *   :::tip
 *   A note worth calling out for this step.
 *   :::
 *
 *   ### Create the managed table
 *   …
 *   ::::
 *
 * The journey uses FOUR colons so nested `:::tip` / `:::warning` (three colons)
 * close cleanly inside it. Steps are delimited by `###` (depth-3) headings: each
 * heading starts a new step and its text is the step label; every node until the
 * next heading is that step's body. Content before the first heading (if any) is
 * dropped with a warning-free no-op — author a heading first.
 *
 * Emits `<Journey>` wrapping `<JourneyStep step="…">` whose children are the
 * step's body nodes (already transformed: remark-callouts ran before this, and
 * remark-code-block runs after and will convert the body's code fences). Steps
 * auto-number in <Journey>. Injects the import once.
 *
 * Ordering: AFTER remark-directive (so `::::journey` is a containerDirective),
 * AFTER remark-code-snippets (code inlined) and remark-callouts (callouts
 * wrapped); BEFORE remark-code-block (which converts the code fences we pass
 * through as body children).
 */

const IMPORT_SOURCE = "@/components/journey";

function importNode() {
  const names = ["Journey", "JourneyStep"];
  return {
    type: "mdxjsEsm",
    value: `import { ${names.join(", ")} } from "${IMPORT_SOURCE}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: names.map((name) => ({
              type: "ImportSpecifier",
              imported: { type: "Identifier", name },
              local: { type: "Identifier", name },
            })),
            source: { type: "Literal", value: IMPORT_SOURCE, raw: `"${IMPORT_SOURCE}"` },
          },
        ],
      },
    },
  };
}

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

function journeyStepNode(step) {
  return {
    type: "mdxJsxFlowElement",
    name: "JourneyStep",
    attributes: step.label
      ? [{ type: "mdxJsxAttribute", name: "step", value: step.label }]
      : [],
    children: step.body,
  };
}

export default function remarkJourney() {
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
            name: "Journey",
            attributes: [],
            children: steps.map(journeyStepNode),
          };
          upgraded = true;
          continue;
        }
        walk(child);
      }
    };
    walk(tree);

    if (upgraded) tree.children.unshift(importNode());
  };
}
