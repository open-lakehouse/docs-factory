/**
 * remark-journey — render a `::::journey` container as a Step 1 → 2 → … timeline.
 */
import { injectImport, jsxFlow, walkTree } from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/journey";

function splitSteps(children) {
  const steps = [];
  let current = null;
  for (const node of children) {
    if (node.type === "heading" && node.depth === 3) {
      current = { heading: node, body: [] };
      steps.push(current);
    } else if (current) {
      current.body.push(node);
    }
  }
  return steps;
}

// The step title stays a real <h3> (not a JSX prop) so rehype-slug gives it an
// id and the "On this page" TOC can list and scroll-spy it.
function journeyStepNode(step) {
  const heading = {
    ...step.heading,
    data: {
      ...step.heading.data,
      hProperties: { ...step.heading.data?.hProperties, className: ["jr-title"] },
    },
  };
  const body = {
    type: "journeyBody",
    data: { hName: "div", hProperties: { className: ["jr-body"] } },
    children: step.body,
  };
  return jsxFlow("JourneyStep", { children: [heading, body] });
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
