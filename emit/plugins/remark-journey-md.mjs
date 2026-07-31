/**
 * remark-journey-md — the Markdown-flattening counterpart of the preview's
 * remark-journey.mjs. The preview turns a `::::journey` container into a
 * `<Journey>`/`<JourneyStep>` React timeline; this flattens it to plain
 * `###`-heading step sequences that read as an ordered walkthrough on a plain
 * Markdown (flattening) target, which has no timeline chrome.
 *
 *   ::::journey
 *   ### Point Spark at the UC catalog
 *   …body…
 *   ::::
 *
 * becomes
 *
 *   ### Step 1 — Point Spark at the UC catalog
 *   …body…
 *
 * The step number carries the ordering the timeline used to convey. Steps are the
 * depth-3 (`###`) headings inside the container, exactly as remark-journey.mjs
 * splits them; the number resets per journey. The heading level is preserved
 * (`###`) so steps stay nested under the enclosing `##` section in the Doc outline.
 * Body nodes (prose, code fences, already-flattened callouts) are lifted to the
 * container's parent in place of the container.
 *
 * Runs AFTER remark-callouts-md (so callouts nested in a step are already
 * blockquotes) and AFTER remark-code-snippets (so `file=` fences are inlined).
 */

// An em dash between the step number and the title: "Step 1 — Title".
const SEP = " — ";

/** Prepend "Step N — " to a heading node's inline children. */
function numberHeading(heading, n) {
  heading.children = [
    { type: "text", value: `Step ${n}${SEP}` },
    ...(heading.children ?? []),
  ];
}

export default function remarkJourneyMd() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && child.name === "journey") {
          const body = child.children ?? [];
          let step = 0;
          for (const n of body) {
            if (n.type === "heading" && n.depth === 3) numberHeading(n, ++step);
          }
          // Splice the journey's children into the parent in place of the
          // container. Content before the first `###` (if any) is kept as-is —
          // the preview drops it, but for a flattened doc keeping stray prose is
          // safer than silently losing it.
          node.children.splice(i, 1, ...body);
          i += body.length - 1;
          continue;
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
