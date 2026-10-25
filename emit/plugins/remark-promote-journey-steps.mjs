/**
 * remark-promote-journey-steps — lift a top-level `::::journey`'s headings one
 * level when no `##` section encloses it, so the published outline goes
 * h1 → h2 instead of skipping to the authored `###` steps.
 *
 * Authors write steps as `###` in every journey, since the preview and the blog
 * targets split on them, and a how-to's journey usually sits under a `##`. A
 * tutorial's journey is the whole page, and nothing sits above its steps but
 * the title. The journey renderers take their step depth from the journey's
 * first heading, so promoted steps still split. Run it after anything that
 * inserts a step (remark-prerequisites-env's "Start the environment").
 */

function shift(node) {
  if (node.type === "heading" && node.depth > 2) node.depth -= 1;
  for (const child of node.children ?? []) shift(child);
}

export default function remarkPromoteJourneySteps() {
  return (tree) => {
    let section = false;
    for (const node of tree.children) {
      if (node.type === "heading") section = node.depth === 2 || (section && node.depth > 2);
      else if (node.type === "containerDirective" && node.name === "journey" && !section) {
        shift(node);
      }
    }
  };
}
