/**
 * remark-journey — render a `::::journey` container as a Step 1 → 2 → … timeline.
 */
import { injectImport, jsxFlow, stringAttr, walkTree } from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/journey";

function headingText(node) {
  const parts = [];
  const walk = (n) => {
    if (typeof n.value === "string") parts.push(n.value);
    n.children?.forEach(walk);
  };
  node.children?.forEach(walk);
  return parts.join("").trim();
}

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
  }
  return steps;
}

function journeyStepNode(step) {
  return jsxFlow("JourneyStep", {
    attributes: step.label ? [stringAttr("step", step.label)] : [],
    children: step.body,
  });
}

export default function remarkJourney() {
  return (tree) => {
    let upgraded = false;

    walkTree(tree, (child, i, parent) => {
      if (child.type === "containerDirective" && child.name === "journey") {
        const steps = splitSteps(child.children ?? []);
        parent.children[i] = jsxFlow("Journey", {
          children: steps.map(journeyStepNode),
        });
        upgraded = true;
      }
    });

    injectImport(tree, {
      names: ["Journey", "JourneyStep"],
      source: IMPORT_SOURCE,
      used: upgraded,
    });
  };
}
